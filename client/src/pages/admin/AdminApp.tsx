import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, get, post, patch, upload } from '../../lib/api';
import { getDashboardPath, useAuth } from '../../lib/auth';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import Analytics from './Analytics';
import { getMenuImageUrl } from '../../lib/menuImages';
import { getOrderItemCustomizations } from '../../lib/orderItemCustomizations';
import axios from 'axios';
import {
  LayoutDashboard, Users, UtensilsCrossed, Grid, FileText, Settings as SettingsIcon,
  TrendingUp, Plus, Search, Edit3, Trash2, Download, AlertCircle, X, Sparkles,
  Activity, ArrowRight, CalendarDays, ChefHat, ChevronRight, LoaderCircle, KeyRound
} from 'lucide-react';

interface DailySalesPoint {
  date: string;
  grossMinor: number;
}

interface DashboardOrder {
  id: string;
  orderNumber: number;
  status: string;
  submittedAt?: string | null;
  createdAt: string;
  tableSession?: { table?: { number: string } | null } | null;
  items: { id: string; itemName: string; quantity: number; status: string; modifiers?: unknown; notes?: string | null }[];
}

const adminTabIds = ['overview', 'analytics', 'staff', 'menu', 'tables', 'financials', 'settings'] as const;
type AdminTab = typeof adminTabIds[number];

export default function AdminApp() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const dashboardPath = getDashboardPath(user?.role);
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedTab = searchParams.get('tab');
  const activeTab: AdminTab = adminTabIds.includes(requestedTab as AdminTab) ? requestedTab as AdminTab : 'overview';
  const setActiveTab = (tab: string) => {
    if (!adminTabIds.includes(tab as AdminTab)) return;
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      if (tab === 'overview') next.delete('tab');
      else next.set('tab', tab);
      return next;
    }, { replace: true });
  };
  const [toast, setToast] = useState<any>(null);

  const showToast = (message: string, type: 'error' | 'success' = 'error') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  };

  // Queries
  const dashQ = useQuery({ queryKey: ['dashboard'], queryFn: () => get('/settings/dashboard') });
  const staffQ = useQuery({ queryKey: ['staff'], queryFn: () => get('/staff') });
  const menuQ = useQuery({ queryKey: ['menu-items'], queryFn: () => get('/menu/items') });
  const catsQ = useQuery({ queryKey: ['categories'], queryFn: () => get('/menu/categories') });
  const tablesQ = useQuery({ queryKey: ['tables'], queryFn: () => get('/tables') });
  const settingsQ = useQuery({ queryKey: ['settings'], queryFn: () => get('/settings') });
  const salesQ = useQuery({ queryKey: ['sales'], queryFn: () => get('/reports/sales') });
  const itemsQ = useQuery({ queryKey: ['report-items'], queryFn: () => get('/reports/items') });
  const paysQ = useQuery({ queryKey: ['report-payments'], queryFn: () => get('/reports/payments') });
  const dailySalesQ = useQuery<{ days: DailySalesPoint[] }>({
    queryKey: ['dashboard-daily-sales'],
    queryFn: () => get('/reports/sales/daily'),
  });
  const kitchenOrdersQ = useQuery<{ orders: DashboardOrder[] }>({
    queryKey: ['dashboard-kitchen-orders'],
    queryFn: () => get('/kitchen/orders'),
    refetchInterval: 15_000,
  });

  const d = dashQ.data || {};
  const staffList = staffQ.data?.users || [];
  const menuItems = menuQ.data?.items || [];
  const categories = catsQ.data?.categories || [];
  const tables = tablesQ.data?.tables || [];
  const settings = settingsQ.data?.settings || {};

  // Staff state
  const [isStaffModalOpen, setIsStaffModalOpen] = useState(false);
  const [editingStaff, setEditingStaff] = useState<any>(null);
  const [staffForm, setStaffForm] = useState({ name: '', role: 'WAITER', status: 'Active', phone: '', shift: '', email: '', password: '' });
  const [passwordResetStaff, setPasswordResetStaff] = useState<any>(null);
  const [passwordResetForm, setPasswordResetForm] = useState('');
  const [passwordResetComplete, setPasswordResetComplete] = useState(false);

  const staffMut = useMutation({
    mutationFn: (b: any) => b.id ? patch(`/staff/${b.id}`, b) : post('/staff', b),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['staff'] }); setIsStaffModalOpen(false); },
    onError: (e: any) => showToast(e?.response?.data?.error || 'Failed', 'error'),
  });
  const deactivateMut = useMutation({
    mutationFn: (id: string) => post(`/staff/${id}/deactivate`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['staff'] }); },
  });
  const passwordResetMut = useMutation({
    mutationFn: ({ id, password }: { id: string; password: string }) => post(`/staff/${id}/password`, { password }),
    onSuccess: () => setPasswordResetComplete(true),
    onError: (e: any) => showToast(e?.response?.data?.error || 'Failed to reset password', 'error'),
  });
  const closePasswordReset = () => {
    setPasswordResetStaff(null);
    setPasswordResetForm('');
    setPasswordResetComplete(false);
  };

  // Menu state
  const [menuSearch, setMenuSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [isMenuModalOpen, setIsMenuModalOpen] = useState(false);
  const [editingMenuItem, setEditingMenuItem] = useState<any>(null);
  const [menuForm, setMenuForm] = useState({ name: '', category: '', price: '', discountPercent: '0', desc: '', available: true, imageUrl: '' });
  const [imageUploading, setImageUploading] = useState(false);
  const [discountItemId, setDiscountItemId] = useState<string | null>(null);
  const [discountDraft, setDiscountDraft] = useState('');

  const menuMut = useMutation({
    mutationFn: (b: any) => b.id ? patch(`/menu/items/${b.id}`, b) : post('/menu/items', b),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['menu-items'] });
      void qc.invalidateQueries({ queryKey: ['public-menu'] });
      setIsMenuModalOpen(false);
    },
    onError: (e: any) => {
      const detail = e?.response?.data?.details?.[0]?.message;
      showToast(detail ? `${e?.response?.data?.error || 'Validation failed'}: ${detail}` : e?.response?.data?.error || 'Failed', 'error');
    },
  });
  const availMut = useMutation({
    mutationFn: ({ id, isAvailable }: any) => patch(`/menu/items/${id}/availability`, { isAvailable }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['menu-items'] }),
  });
  const itemDiscountMut = useMutation({
    mutationFn: ({ id, discountPercent }: { id: string; discountPercent: number }) =>
      patch(`/menu/items/${id}`, { discountPercent }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['menu-items'] });
      await qc.invalidateQueries({ queryKey: ['public-menu'] });
      setDiscountItemId(null);
      showToast('Item discount updated.', 'success');
    },
    onError: (e: any) => showToast(e?.response?.data?.error || 'Could not update item discount.', 'error'),
  });

  const uploadMenuImage = async (file?: File) => {
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      showToast('Choose a JPEG, PNG, or WebP image.', 'error');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      showToast('Image must be 5 MB or smaller.', 'error');
      return;
    }

    setImageUploading(true);
    try {
      const result = await upload<{ imageUrl: string }>('/menu/items/image', file);
      setMenuForm((form) => ({ ...form, imageUrl: result.imageUrl }));
    } catch (error) {
      const message = axios.isAxiosError<{ error?: string }>(error)
        ? error.response?.data?.error
        : error instanceof Error ? error.message : undefined;
      showToast(message || 'Image upload failed. Please try again.', 'error');
    } finally {
      setImageUploading(false);
    }
  };

  // Table state
  const floorFilter = searchParams.get('floor') || 'All';
  const setFloorFilter = (section: string) => {
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      if (section === 'All') next.delete('floor');
      else next.set('floor', section);
      return next;
    }, { replace: true });
  };
  const [isTableModalOpen, setIsTableModalOpen] = useState(false);
  const [tableForm, setTableForm] = useState({ number: '', section: 'Main Dining', capacity: 4, status: 'AVAILABLE' });

  const tableMut = useMutation({
    mutationFn: (b: any) => post('/tables', b),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['tables'] }); setIsTableModalOpen(false); },
    onError: (e: any) => showToast(e?.response?.data?.error || 'Failed', 'error'),
  });
  const tableStatusMut = useMutation({
    mutationFn: ({ id, status }: any) => patch(`/tables/${id}`, { status }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tables'] }),
  });

  // Settings state
  const [settingsForm, setSettingsForm] = useState<any>({});
  useEffect(() => { if (settings && settings.id) setSettingsForm(settings); }, [settings]);
  const settingsMut = useMutation({
    mutationFn: (b: any) => patch('/settings', b),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['settings'] }); },
  });

  const handleExportCSV = async () => {
    try {
      const response = await api.get<Blob>('/reports/sales/export.csv', { responseType: 'blob' });
      const url = URL.createObjectURL(response.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'restaurant-sales.csv';
      a.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) {
      const message = axios.isAxiosError<{ error?: string }>(error)
        ? error.response?.data?.error
        : error instanceof Error ? error.message : undefined;
      showToast(message || 'Sales report export failed. Please try again.', 'error');
    }
  };

  const sections = ['All', 'Main Dining', 'Rooftop Terrace', 'VIP Lounge'];
  const navItems = [
    { id: 'overview', label: 'Overview', icon: LayoutDashboard },
    { id: 'analytics', label: 'Analytics', icon: Activity },
    { id: 'staff', label: 'Staff', icon: Users },
    { id: 'menu', label: 'Menu & Pricing', icon: UtensilsCrossed },
    { id: 'tables', label: 'Tables & Floor', icon: Grid },
    { id: 'financials', label: 'Financials & Audit', icon: FileText },
    { id: 'settings', label: 'Settings', icon: SettingsIcon },
  ];
  const pageTitles: Record<string, string> = {
    overview: 'Command center',
    analytics: 'Analytics',
    staff: 'Staff',
    menu: 'Menu & Pricing',
    tables: 'Tables & Floor',
    financials: 'Financials & Audit',
    settings: 'Settings',
  };
  const [currentTime, setCurrentTime] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setCurrentTime(new Date()), 15_000);
    return () => window.clearInterval(timer);
  }, []);
  const timeZone = settings.timeZone || undefined;
  const formattedDate = new Intl.DateTimeFormat('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone,
  }).format(currentTime);
  const formattedTime = new Intl.DateTimeFormat('en-GB', {
    hour: 'numeric',
    minute: '2-digit',
    timeZone,
  }).format(currentTime);
  const formatCurrency = (minor: number) => new Intl.NumberFormat('en-NP', {
    style: 'currency',
    currency: settings.currency || 'NPR',
    currencyDisplay: 'narrowSymbol',
    maximumFractionDigits: 0,
  }).format(minor / 100);
  const dailySales = dailySalesQ.data?.days ?? [];
  const highestDailySales = Math.max(1, ...dailySales.map((point) => point.grossMinor));
  const salesLinePoints = dailySales.map((point, index) => {
    const x = dailySales.length < 2 ? 50 : (index / (dailySales.length - 1)) * 100;
    const y = 38 - (point.grossMinor / highestDailySales) * 32;
    return `${x},${y}`;
  }).join(' ');
  const recentOrders = [...(kitchenOrdersQ.data?.orders ?? [])]
    .sort((a, b) => new Date(b.submittedAt || b.createdAt).getTime() - new Date(a.submittedAt || a.createdAt).getTime())
    .slice(0, 4);

  return (
    <div className="min-h-screen bg-[#f3f8f5] text-[#263b33] flex font-sans selection:bg-emerald-200 selection:text-emerald-950">
      {toast && (
        <div className={`fixed top-5 right-5 z-50 px-5 py-3 rounded-2xl backdrop-blur-xl border shadow-xl flex items-center space-x-3 transition-all animate-bounce ${
          toast.type === 'error' ? 'bg-red-50 border-red-200 text-red-800' : 'bg-white border-teal-200 text-teal-800'
        }`}>
          {toast.type === 'error' ? <AlertCircle className="w-5 h-5 text-red-500" /> : <Sparkles className="w-5 h-5 text-teal-600" />}
          <span className="font-medium text-sm">{toast.message}</span>
        </div>
      )}

      <aside className="w-64 xl:w-[274px] shrink-0 bg-[#06332f] text-white flex-col justify-between hidden lg:flex sticky top-0 h-screen">
        <div>
          <Link to={dashboardPath} aria-label="Admin dashboard" className="flex items-center space-x-3 border-b border-white/10 p-6 transition-colors hover:bg-white/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-inset focus-visible:outline-emerald-300">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#13a77d] shadow-lg shadow-emerald-950/20">
              <UtensilsCrossed className="h-5 w-5 text-white" />
            </div>
            <div className="min-w-0 text-left">
              <h1 className="truncate text-sm font-semibold tracking-tight text-white">{settings.name || 'Restaurant'}</h1>
              <span className="text-xs text-emerald-100/65">RestoPOS</span>
            </div>
          </Link>
          <nav className="p-4 space-y-1.5">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button key={item.id} onClick={() => setActiveTab(item.id)}
                  className={`w-full flex items-center space-x-3.5 px-4 py-3 rounded-xl font-medium text-sm transition-colors group ${
                    isActive ? 'bg-[#4bd6a3] text-[#06332f] font-semibold shadow-sm' : 'text-emerald-50/80 hover:text-white hover:bg-white/10'
                  }`}>
                  <Icon className={`w-5 h-5 ${isActive ? 'text-[#06332f]' : 'text-emerald-100/70 group-hover:text-white'}`} />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>
        </div>
        <div className="p-3 m-4 rounded-2xl bg-white/5 border border-white/15 flex items-center space-x-3">
          <div className="w-10 h-10 shrink-0 rounded-full bg-[#86e3c1] flex items-center justify-center font-semibold text-[#064438] text-sm">
            {user?.name?.split(/\s+/).map((part: string) => part[0]).join('').slice(0, 2).toUpperCase()}
          </div>
          <div className="overflow-hidden">
            <h4 className="font-semibold text-sm text-white truncate">{user?.name}</h4>
            <p className="text-xs text-emerald-100/60 font-medium">Administrator</p>
          </div>
          <button onClick={async () => { await logout(); navigate('/login', { replace: true }); }} className="ml-auto text-xs text-emerald-100/65 hover:text-white">Logout</button>
        </div>
      </aside>

      <main className="flex-1 flex flex-col min-w-0 min-h-screen">
        <header className={`flex flex-wrap items-center justify-between gap-4 px-4 pb-4 pt-4 sm:px-8 sm:pt-6 ${activeTab === 'overview' ? 'lg:hidden' : ''}`}>
          <div className="flex w-full min-w-0 items-center justify-between gap-3 lg:hidden">
            <Link to={dashboardPath} aria-label="Admin dashboard" className="flex min-w-0 items-center gap-2.5 rounded-lg text-[#17483b] focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-700">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#13a77d] text-white"><UtensilsCrossed className="h-4 w-4" /></span>
              <span className="truncate text-sm font-semibold">{settings.name || 'Restaurant'}</span>
            </Link>
            <button onClick={async () => { await logout(); navigate('/login', { replace: true }); }} className="min-h-10 shrink-0 rounded-lg px-3 text-sm font-medium text-[#52635b] transition-colors hover:bg-white hover:text-[#173b32] focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-700">Logout</button>
          </div>
          {activeTab !== 'overview' && (
            <>
            <div>
              <h2 className="font-serif text-3xl font-semibold tracking-tight text-[#203a30] sm:text-4xl">
                {pageTitles[activeTab] || 'Command center'}
              </h2>
              <p className="mt-1 text-sm text-[#78877f] sm:text-base">
                {settings.name || 'Restaurant'} · Admin console
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2 rounded-full bg-[#e0f1e9] px-3.5 py-2 text-xs font-medium text-[#316c53] sm:text-sm">
              <span className="h-2 w-2 animate-pulse rounded-full bg-[#398568]"></span>
              <span>Live sync</span>
            </div>
            </>
          )}
        </header>
        <nav aria-label="Admin navigation" className="grid grid-cols-2 gap-2 px-4 pb-4 sm:grid-cols-4 lg:hidden">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`inline-flex min-h-11 min-w-0 items-center justify-center gap-2 rounded-xl px-2 py-2 text-center text-xs font-medium sm:text-sm ${
                  isActive ? 'bg-[#dff1e8] text-[#205943]' : 'bg-white text-[#52635b]'
                }`}
              >
                <Icon className="w-4 h-4" />
                {item.label}
              </button>
            );
          })}
        </nav>

        <div className="w-full space-y-6 px-5 pb-10 pt-4 sm:px-8 lg:px-8">
          {/* OVERVIEW */}
          {activeTab === 'overview' && (
            <div className="space-y-6">
              {dashQ.isError ? (
                <div role="alert" className="rounded-2xl border border-rose-200 bg-white p-6 text-rose-800">
                  <h3 className="font-semibold">Dashboard data could not be loaded</h3>
                  <p className="mt-1 text-sm text-rose-700">
                    {dashQ.error instanceof Error ? dashQ.error.message : 'Please try again.'}
                  </p>
                  <button
                    onClick={() => dashQ.refetch()}
                    className="mt-4 rounded-lg bg-rose-50 px-3 py-2 text-sm font-medium text-rose-800 hover:bg-rose-100"
                  >
                    Try again
                  </button>
                </div>
              ) : dashQ.isLoading ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5" aria-label="Loading dashboard">
                  {Array.from({ length: 4 }, (_, index) => (
                    <div key={index} className="h-40 animate-pulse rounded-3xl border border-[#dce8e1] bg-white" />
                  ))}
                </div>
              ) : (
                <>
              <div className="grid grid-cols-1 items-stretch gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(400px,1fr)]">
                <section className="relative isolate flex min-h-[280px] items-center overflow-hidden rounded-3xl bg-gradient-to-r from-[#07584c] via-[#087e69] to-[#6cbca2] px-6 py-7 text-white shadow-[0_10px_30px_rgba(10,75,59,0.16)] sm:px-8 xl:min-h-0">
                  <div className="pointer-events-none absolute inset-0 -z-10 opacity-20" aria-hidden="true">
                    <div className="absolute -right-8 -top-16 h-64 w-64 rounded-full border-[34px] border-white/60" />
                    <div className="absolute -bottom-24 right-44 h-48 w-80 rotate-[-12deg] rounded-[50%] bg-white/30 blur-xl" />
                  </div>
                  <div className="max-w-xl">
                    <span className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-xs font-semibold text-emerald-50">
                      <Sparkles className="h-3.5 w-3.5" /> Your restaurant at a glance
                    </span>
                    <h3 className="mt-3 font-serif text-2xl font-semibold tracking-tight sm:text-3xl">Great food. Better days.</h3>
                    <p className="mt-2 max-w-lg text-sm leading-6 text-emerald-50/90">Every meal tells a story — and you’re the one making it happen.</p>
                    <button onClick={() => setActiveTab('analytics')} className="mt-4 inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-semibold text-[#17664f] transition hover:bg-emerald-50">
                      View reports <ArrowRight className="h-4 w-4" />
                    </button>
                  </div>
                </section>
                <div className="flex flex-col gap-4">
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    <button
                      onClick={() => { void Promise.all([dashQ.refetch(), dailySalesQ.refetch(), kitchenOrdersQ.refetch()]); }}
                      disabled={dashQ.isFetching || dailySalesQ.isFetching || kitchenOrdersQ.isFetching}
                      className="inline-flex items-center rounded-full border border-[#dce8e1] bg-white px-4 py-2 text-sm font-medium text-[#40564b] transition hover:bg-[#f8fbf9] disabled:opacity-60"
                    >
                      {dashQ.isFetching || dailySalesQ.isFetching || kitchenOrdersQ.isFetching ? 'Refreshing…' : 'Refresh'}
                    </button>
                    <div className="flex items-center gap-2.5 rounded-2xl border border-[#e2ebe5] bg-white px-3 py-2 text-[#40564b] shadow-sm">
                      <CalendarDays className="h-5 w-5 shrink-0 text-[#527b67]" />
                      <div>
                        <div className="text-xs font-semibold">{formattedDate}</div>
                        <div className="text-[11px] text-[#87958d]">{formattedTime}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 rounded-full bg-[#e0f1e9] px-3.5 py-2 text-xs font-medium text-[#316c53] sm:text-sm">
                      <span className="h-2 w-2 animate-pulse rounded-full bg-[#398568]"></span>
                      <span>Live sync</span>
                    </div>
                  </div>
                  <section className="flex-1 rounded-3xl border border-[#dce8e1] bg-white p-5 shadow-[0_3px_10px_rgba(34,65,49,0.04)]">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#438268]">Quick actions</p>
                        <h3 className="mt-1 font-semibold text-[#294338]">Manage your restaurant</h3>
                      </div>
                      <Activity className="h-5 w-5 text-[#438268]" />
                    </div>
                    <p className="mt-1 text-xs text-[#849188]">Everything you need, in one place.</p>
                    <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
                      <button onClick={() => { setEditingMenuItem(null); setMenuForm({ name: '', category: categories[0]?.id || '', price: '', discountPercent: '0', desc: '', available: true, imageUrl: '' }); setIsMenuModalOpen(true); }} className="flex items-center gap-2 rounded-xl border border-[#e5ece8] bg-[#f8fbf9] px-3 py-3 text-left text-xs font-semibold text-[#496055] transition hover:border-[#b8dfcb] hover:bg-[#eaf5ee]">
                        <Plus className="h-4 w-4 text-[#168263]" /> Add menu item
                      </button>
                      <button onClick={() => setActiveTab('tables')} className="flex items-center gap-2 rounded-xl border border-[#e5ece8] bg-[#f8fbf9] px-3 py-3 text-left text-xs font-semibold text-[#496055] transition hover:border-[#b8dfcb] hover:bg-[#eaf5ee]">
                        <Grid className="h-4 w-4 text-[#168263]" /> Manage tables
                      </button>
                      <button onClick={() => setActiveTab('analytics')} className="flex items-center gap-2 rounded-xl border border-[#e5ece8] bg-[#f8fbf9] px-3 py-3 text-left text-xs font-semibold text-[#496055] transition hover:border-[#b8dfcb] hover:bg-[#eaf5ee]">
                        <TrendingUp className="h-4 w-4 text-[#168263]" /> View reports
                      </button>
                    </div>
                  </section>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 2xl:grid-cols-4">
                {[
                  { title: "Today's gross sales", value: formatCurrency(d.grossSalesMinor), detail: 'Paid bills today', icon: TrendingUp, color: 'bg-[#e4f2eb] text-[#317757] border-[#d4e9dd]' },
                  { title: 'Tables in use', value: `${d.tables?.occupied ?? 0}/${d.tables?.total ?? 0}`, detail: `${d.tables?.available ?? 0} available`, icon: Grid, color: 'bg-[#f5efe0] text-[#907436] border-[#eee4c9]' },
                  { title: 'Active sessions', value: d.activeSessions ?? 0, detail: 'Open dine-in checks', icon: Users, color: 'bg-[#e7f0ec] text-[#527c67] border-[#d8e7df]' },
                ].map((kpi, idx) => {
                  const Icon = kpi.icon;
                  return (
                    <div key={idx} className="min-h-[132px] rounded-3xl border border-[#dce8e1] bg-white p-5 shadow-[0_3px_10px_rgba(34,65,49,0.04)] transition-shadow hover:shadow-[0_8px_24px_rgba(34,65,49,0.08)]">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <div className="text-sm text-[#74837b]">{kpi.title}</div>
                          <div className="mt-2 font-serif text-2xl sm:text-3xl font-semibold tracking-tight text-[#203a30]">{kpi.value}</div>
                          <div className="mt-1 text-xs text-[#849188]">{kpi.detail}</div>
                        </div>
                        <div className={`w-10 h-10 shrink-0 rounded-xl border flex items-center justify-center ${kpi.color}`}>
                          <Icon className="w-5 h-5" />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="grid grid-cols-1 2xl:grid-cols-[minmax(0,1.25fr)_minmax(320px,0.85fr)] gap-4">
                <section className="rounded-3xl border border-[#dce8e1] bg-white p-5 shadow-[0_3px_10px_rgba(34,65,49,0.04)] sm:p-6">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="font-serif text-xl font-semibold text-[#294338]">Sales overview</h3>
                      <p className="mt-1 text-xs text-[#849188]">Gross sales · last 7 days</p>
                    </div>
                    <span className="rounded-full bg-[#e5f5ed] px-3 py-1 text-[11px] font-semibold text-[#317757]">7 days</span>
                  </div>
                  {dailySalesQ.isError ? (
                    <div role="alert" className="mt-6 rounded-xl bg-rose-50 p-3 text-sm text-rose-800">
                      Sales history could not be loaded. <button onClick={() => void dailySalesQ.refetch()} className="font-semibold underline">Try again</button>
                    </div>
                  ) : dailySalesQ.isLoading ? (
                    <div className="mt-6 h-36 animate-pulse rounded-xl bg-[#f2f7f4]" />
                  ) : (
                    <>
                      <div className="mt-5 flex items-baseline gap-2">
                        <span className="font-serif text-2xl font-semibold text-[#203a30]">{formatCurrency(dailySales.reduce((sum, day) => sum + day.grossMinor, 0))}</span>
                        <span className="text-xs text-[#849188]">total this week</span>
                      </div>
                      <div className="mt-3 h-36">
                        {dailySales.length > 0 ? (
                          <svg viewBox="0 0 100 44" preserveAspectRatio="none" role="img" aria-label="Daily gross sales chart" className="h-full w-full overflow-visible">
                            <defs>
                              <linearGradient id="sales-fill" x1="0" x2="0" y1="0" y2="1">
                                <stop offset="0%" stopColor="#22b573" stopOpacity=".22" />
                                <stop offset="100%" stopColor="#22b573" stopOpacity="0" />
                              </linearGradient>
                            </defs>
                            {[10, 20, 30, 40].map((y) => <line key={y} x1="0" x2="100" y1={y} y2={y} stroke="#edf2ef" strokeWidth=".35" />)}
                            <polygon points={`0,42 ${salesLinePoints} 100,42`} fill="url(#sales-fill)" />
                            <polyline points={salesLinePoints} fill="none" stroke="#16a36b" strokeWidth="1.1" vectorEffect="non-scaling-stroke" />
                            {dailySales.map((point, index) => {
                              const x = dailySales.length < 2 ? 50 : (index / (dailySales.length - 1)) * 100;
                              const y = 38 - (point.grossMinor / highestDailySales) * 32;
                              return <circle key={point.date} cx={x} cy={y} r="1.1" fill="#16a36b" stroke="white" strokeWidth=".6" vectorEffect="non-scaling-stroke" />;
                            })}
                          </svg>
                        ) : <div className="flex h-full items-center justify-center text-sm text-[#849188]">No paid sales recorded this week.</div>}
                      </div>
                      <div className="mt-2 grid grid-cols-7 gap-1 text-center text-[10px] text-[#849188]">
                        {dailySales.map((point) => <span key={point.date}>{new Date(`${point.date}T12:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</span>)}
                      </div>
                    </>
                  )}
                </section>

                <section className="rounded-3xl border border-[#dce8e1] bg-white p-5 shadow-[0_3px_10px_rgba(34,65,49,0.04)] sm:p-6">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <ChefHat className="h-5 w-5 text-[#668275]" />
                      <div>
                        <h3 className="font-serif text-xl font-semibold text-[#294338]">Orders in the kitchen</h3>
                        <p className="mt-1 text-xs text-[#849188]">Live order queue</p>
                      </div>
                    </div>
                    <button onClick={() => navigate('/kitchen')} className="inline-flex items-center gap-1 text-xs font-semibold text-[#168263] hover:text-[#105e48]">View all <ChevronRight className="h-4 w-4" /></button>
                  </div>
                  <div className="mt-5 grid grid-cols-3 divide-x divide-[#e9efeb]">
                    {[
                      { label: 'Waiting', value: d.orders?.waiting ?? 0, color: 'text-[#c87916]' },
                      { label: 'Preparing', value: d.orders?.preparing ?? 0, color: 'text-[#3175bd]' },
                      { label: 'Ready', value: d.orders?.ready ?? 0, color: 'text-[#168263]' },
                    ].map((item) => (
                      <div key={item.label} className="px-3 first:pl-0 last:pr-0">
                        <div className={`font-serif text-2xl font-semibold ${item.color}`}>{item.value}</div>
                        <div className="mt-1 text-xs text-[#849188]">{item.label}</div>
                      </div>
                    ))}
                  </div>
                  <div className="mt-4 space-y-2">
                    {kitchenOrdersQ.isError ? (
                      <p role="alert" className="rounded-xl bg-rose-50 p-3 text-xs text-rose-800">Live orders could not be loaded.</p>
                    ) : recentOrders.length ? recentOrders.slice(0, 3).map((order) => (
                      <div key={order.id} className="flex items-center justify-between gap-3 rounded-xl bg-[#f7faf8] px-3 py-2.5">
                        <div className="min-w-0">
                          <p className="truncate text-xs font-semibold text-[#40564b]">Order #{order.orderNumber} · Table {order.tableSession?.table?.number || '—'}</p>
                          <p className="mt-0.5 text-[10px] text-[#849188]">{order.items.filter((item) => item.status !== 'CANCELLED').map((item) => `${item.quantity}× ${item.itemName}`).join(', ') || 'No active items'}</p>
                          {order.items.filter((item) => item.status !== 'CANCELLED').flatMap((item) =>
                            getOrderItemCustomizations(item.modifiers, item.notes).map((detail) => (
                              <p key={`${item.id}-${detail}`} className="mt-1 text-[10px] text-[#78877f]">{item.itemName}: {detail}</p>
                            )),
                          )}
                        </div>
                        <span className="shrink-0 rounded-full bg-white px-2 py-1 text-[10px] font-medium text-[#668275]">{order.status.toLowerCase()}</span>
                      </div>
                    )) : (
                      <div className="flex items-center gap-3 rounded-xl bg-[#eaf7ee] p-3 text-xs text-[#668275]">
                        <ChefHat className="h-5 w-5 shrink-0 text-[#4c9b6f]" />
                        <span><strong className="block text-[#40564b]">Kitchen is clear!</strong>No pending orders at the moment.</span>
                      </div>
                    )}
                  </div>
                </section>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                <div className="lg:col-span-2 rounded-3xl border border-[#dce8e1] bg-white p-6 shadow-[0_3px_10px_rgba(34,65,49,0.04)]">
                  <h3 className="font-serif text-xl font-semibold text-[#294338] mb-1">Top selling items</h3>
                  <p className="text-sm text-[#849188] mb-4">By revenue</p>
                  <div className="space-y-3">
                    {(itemsQ.data?.items || []).slice(0, 6).map((it: any, i: number) => (
                      <div key={i} className="flex items-center justify-between gap-4 p-3.5 bg-[#f6f9f7] rounded-xl">
                        <span className="text-sm font-medium text-[#3e5348]">{it.name}</span>
                        <span className="text-sm font-semibold text-[#317757]">{formatCurrency(it.total)} · {it.qty} sold</span>
                      </div>
                    ))}
                    {(itemsQ.data?.items || []).length === 0 && <div className="text-sm text-[#849188]">No sales data yet.</div>}
                  </div>
                </div>

                <div className="space-y-6">
                  <div className="rounded-3xl border border-[#dce8e1] bg-white p-6 shadow-[0_3px_10px_rgba(34,65,49,0.04)]">
                    <h3 className="font-serif text-xl font-semibold text-[#294338] mb-4">Payment methods</h3>
                    <div className="space-y-3">
                      {Object.entries(paysQ.data?.byMethod || {}).map(([m, amt]: any) => (
                        <div key={m} className="flex justify-between text-sm">
                          <span className="text-[#617168]">{m}</span>
                          <span className="font-semibold text-[#317757]">{formatCurrency(amt)}</span>
                        </div>
                      ))}
                      {(Object.keys(paysQ.data?.byMethod || {}).length === 0) && <div className="text-sm text-[#849188]">No payments yet.</div>}
                    </div>
                  </div>
                  <div className="rounded-3xl border border-[#dce8e1] bg-white p-6 shadow-[0_3px_10px_rgba(34,65,49,0.04)] space-y-3">
                    <h3 className="font-serif text-lg font-semibold text-[#294338]">Quick actions</h3>
                    <div className="grid grid-cols-2 gap-3">
                      <button onClick={() => setIsMenuModalOpen(true)} className="p-3 bg-[#f6f9f7] hover:bg-[#eaf5ee] border border-[#e5ece8] hover:border-[#c8e3d3] rounded-2xl text-xs font-semibold text-[#496055] transition-all text-left flex flex-col space-y-1">
                        <Plus className="w-4 h-4 text-[#317757]" /><span>Add menu item</span>
                      </button>
                      <button onClick={() => setIsStaffModalOpen(true)} className="p-3 bg-[#f6f9f7] hover:bg-[#eaf5ee] border border-[#e5ece8] hover:border-[#c8e3d3] rounded-2xl text-xs font-semibold text-[#496055] transition-all text-left flex flex-col space-y-1">
                        <Users className="w-4 h-4 text-[#317757]" /><span>Manage staff</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
                </>
              )}
            </div>
          )}

          {/* STAFF */}
          {activeTab === 'staff' && (
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white border border-slate-200/80 p-6 rounded-3xl shadow-sm">
                <div>
                  <h3 className="text-lg font-bold text-slate-900">Staff Roster & Permissions</h3>
                  <p className="text-xs text-slate-500">Control active shifts, assign roles, and manage staff accounts securely.</p>
                </div>
                <button onClick={() => { setEditingStaff(null); setStaffForm({ name: '', role: 'WAITER', status: 'Active', phone: '', shift: '', email: '', password: '' }); setIsStaffModalOpen(true); }}
                  className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-teal-600 to-emerald-600 text-white text-xs font-semibold shadow-md shadow-teal-600/10 flex items-center space-x-2 hover:opacity-95 transition-all">
                  <Plus className="w-4 h-4" /><span>Add New Staff</span>
                </button>
              </div>
              <div className="bg-white border border-slate-200/80 rounded-3xl overflow-hidden shadow-sm">
                <div className="grid gap-3 p-3 xl:hidden">
                  {staffList.map((staff: any) => (
                    <article key={staff.id} className="min-w-0 rounded-2xl border border-slate-200 p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <h4 className="break-words font-semibold text-slate-900">{staff.name}</h4>
                          <p className="mt-1 break-all text-sm text-slate-600">{staff.email}</p>
                        </div>
                        <span className={`rounded-full border px-3 py-1 text-xs font-medium ${staff.active ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-rose-200 bg-rose-50 text-rose-700'}`}>
                          {staff.active ? 'Active' : 'Inactive'}
                        </span>
                      </div>
                      <div className="mt-3 flex items-center justify-between gap-3">
                        <span className="rounded-full border border-teal-200 bg-teal-50 px-3 py-1 text-xs font-medium text-teal-800">{staff.role}</span>
                        <div className="flex gap-2">
                          <button aria-label={`Reset password for ${staff.name}`} onClick={() => { setPasswordResetStaff(staff); setPasswordResetForm(''); setPasswordResetComplete(false); }}
                            className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-200 px-3 text-sm text-teal-800 transition-colors hover:bg-teal-50"><KeyRound className="h-4 w-4" />Reset password</button>
                          {staff.active && <button aria-label={`Deactivate ${staff.name}`} onClick={() => deactivateMut.mutate(staff.id)} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-200 px-3 text-sm text-rose-700 transition-colors hover:bg-rose-50"><Trash2 className="h-4 w-4" />Deactivate</button>}
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
                <div className="hidden overflow-x-auto xl:block">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-slate-100 text-xs font-semibold text-slate-500 uppercase tracking-wider bg-slate-50">
                        <th className="p-5">Staff Name</th><th className="p-5">Assigned Role</th><th className="p-5">Email</th><th className="p-5">Status</th><th className="p-5 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-sm">
                      {staffList.map((staff: any) => (
                        <tr key={staff.id} className="hover:bg-slate-50/60 transition-colors">
                          <td className="p-5 font-medium text-slate-900 flex items-center space-x-3">
                            <div className="w-8 h-8 rounded-full bg-teal-100 border border-teal-200 flex items-center justify-center font-bold text-teal-800 text-xs">{staff.name.charAt(0)}</div>
                            <span>{staff.name}</span>
                          </td>
                          <td className="p-5">
                            <span className={`px-3 py-1 rounded-full text-xs font-medium border ${
                              staff.role === 'BILLER' ? 'bg-cyan-50 border-cyan-200 text-cyan-800' :
                              staff.role === 'WAITER' ? 'bg-teal-50 border-teal-200 text-teal-800' :
                              'bg-indigo-50 border-indigo-200 text-indigo-800'
                            }`}>{staff.role}</span>
                          </td>
                          <td className="p-5 text-slate-600">{staff.email}</td>
                          <td className="p-5">
                            <span className={`px-3 py-1 rounded-full text-xs font-medium border ${staff.active ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-rose-50 border-rose-200 text-rose-700'}`}>
                              {staff.active ? 'Active' : 'Inactive'}
                            </span>
                          </td>
                          <td className="p-5 text-right space-x-2">
                            <button aria-label={`Reset password for ${staff.name}`} title="Reset password" onClick={() => { setPasswordResetStaff(staff); setPasswordResetForm(''); setPasswordResetComplete(false); }}
                              className="p-2 bg-slate-50 hover:bg-teal-50 border border-slate-200 hover:border-teal-300 rounded-xl text-teal-700 transition-all"><KeyRound className="w-4 h-4" /></button>
                            {staff.active && <button onClick={() => deactivateMut.mutate(staff.id)} className="p-2 bg-slate-50 hover:bg-rose-50 border border-slate-200 hover:border-rose-300 rounded-xl text-rose-600 transition-all"><Trash2 className="w-4 h-4" /></button>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* MENU */}
          {activeTab === 'menu' && (
            <div className="space-y-6">
              <div className="flex flex-col md:flex-row justify-between items-center gap-4 bg-white border border-slate-200/80 p-6 rounded-3xl shadow-sm">
                <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
                  <div className="relative flex-1 md:w-72">
                    <Search className="absolute left-3.5 top-3 w-4 h-4 text-slate-400" />
                    <input type="text" aria-label="Search menu items" value={menuSearch} onChange={(e) => setMenuSearch(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-2xl pl-10 pr-4 py-2 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:border-teal-500/50" />
                  </div>
                  <div className="flex flex-wrap gap-1 pb-1">
                    {['All', ...categories.map((c: any) => c.name)].map((cat: string) => (
                      <button key={cat} onClick={() => setSelectedCategory(cat)}
                        className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all ${selectedCategory === cat ? 'bg-gradient-to-r from-teal-600 to-emerald-600 text-white shadow-sm' : 'bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-900'}`}>
                        {cat}
                      </button>
                    ))}
                  </div>
                </div>
                <button onClick={() => { setEditingMenuItem(null); setMenuForm({ name: '', category: categories[0]?.id || '', price: '', discountPercent: '0', desc: '', available: true, imageUrl: '' }); setIsMenuModalOpen(true); }}
                  className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-teal-600 to-emerald-600 text-white text-xs font-semibold shadow-md shadow-teal-600/10 flex items-center space-x-2 hover:opacity-95 transition-all w-full md:w-auto justify-center">
                  <Plus className="w-4 h-4" /><span>Add Dish</span>
                </button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {menuItems
                  .filter((item: any) => selectedCategory === 'All' || item.category?.name === selectedCategory)
                  .filter((item: any) => item.name.toLowerCase().includes(menuSearch.toLowerCase()))
                  .map((item: any) => (
                    <div key={item.id} className="bg-white border border-slate-200/80 rounded-3xl p-6 shadow-sm flex flex-col justify-between hover:border-teal-300 transition-all group">
                      <div>
                        <div className="flex items-start justify-between mb-3">
                          <span className="px-3 py-1 rounded-full text-xs font-medium bg-teal-50 border border-teal-200 text-teal-800">{item.category?.name}</span>
                          <button onClick={() => availMut.mutate({ id: item.id, isAvailable: !(item.available && !item.soldOut) })}
                            className={`px-3 py-1 rounded-full text-xs font-semibold border cursor-pointer transition-all ${item.available && !item.soldOut ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-rose-50 border-rose-200 text-rose-700'}`}>
                            {item.available && !item.soldOut ? 'Available' : 'Sold Out'}
                          </button>
                        </div>
                        {getMenuImageUrl(item.name, item.imageUrl) && <img src={getMenuImageUrl(item.name, item.imageUrl)!} alt={item.name} className="mb-4 h-36 w-full rounded-2xl object-cover" />}
                        <h4 className="font-bold text-base text-slate-900 mb-1 group-hover:text-teal-700 transition-colors">{item.name}</h4>
                        <p className="text-xs text-slate-500 line-clamp-2 mb-4">{item.description}</p>
                      </div>
                      <div className="pt-4 border-t border-slate-100 flex items-center justify-between">
                        <span className="flex flex-col items-end text-lg font-extrabold text-teal-700">
                          Rs. {(Math.round(item.priceMinor * (100 - (item.discountPercent || 0)) / 100) / 100).toFixed(0)}
                          {item.discountPercent > 0 && <span className="text-xs font-medium text-rose-600">{item.discountPercent}% off · Rs. {(item.priceMinor / 100).toFixed(0)} before discount</span>}
                        </span>
                        <div className="space-x-2">
                          <button
                            type="button"
                            onClick={() => {
                              setDiscountItemId(discountItemId === item.id ? null : item.id);
                              setDiscountDraft(String(item.discountPercent || 0));
                            }}
                            className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 transition hover:bg-rose-100"
                          >
                            {item.discountPercent > 0 ? 'Edit discount' : 'Add discount'}
                          </button>
                          <button onClick={() => { setEditingMenuItem(item); setMenuForm({ name: item.name, category: item.categoryId, price: (item.priceMinor / 100).toString(), discountPercent: String(item.discountPercent || 0), desc: item.description || '', available: item.available, imageUrl: getMenuImageUrl(item.name, item.imageUrl) || '' }); setIsMenuModalOpen(true); }}
                            className="p-2 bg-slate-50 hover:bg-teal-50 border border-slate-200 hover:border-teal-300 rounded-xl text-slate-600 transition-all"><Edit3 className="w-4 h-4" /></button>
                        </div>
                      </div>
                      {discountItemId === item.id && (
                        <form
                          className="mt-4 flex flex-wrap items-end gap-2 border-t border-slate-100 pt-4"
                          onSubmit={(event) => {
                            event.preventDefault();
                            const discountPercent = Number(discountDraft);
                            if (!Number.isFinite(discountPercent) || discountPercent < 0 || discountPercent > 100) {
                              showToast('Enter a discount from 0 to 100%.', 'error');
                              return;
                            }
                            itemDiscountMut.mutate({ id: item.id, discountPercent });
                          }}
                        >
                          <label className="flex-1 text-xs font-medium text-slate-600">
                            Discount percentage
                            <input
                              type="number"
                              min="0"
                              max="100"
                              step="0.01"
                              value={discountDraft}
                              onChange={(event) => setDiscountDraft(event.target.value)}
                              aria-label={`${item.name} discount percentage`}
                              className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm"
                            />
                          </label>
                          <button
                            type="submit"
                            disabled={itemDiscountMut.isPending}
                            className="rounded-xl bg-rose-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-60"
                          >
                            {itemDiscountMut.isPending && itemDiscountMut.variables?.id === item.id ? 'Saving…' : 'Save discount'}
                          </button>
                          <button
                            type="button"
                            disabled={itemDiscountMut.isPending}
                            onClick={() => setDiscountItemId(null)}
                            className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600"
                          >
                            Cancel
                          </button>
                        </form>
                      )}
                    </div>
                  ))}
              </div>
            </div>
          )}

          {/* TABLES */}
          {activeTab === 'tables' && (
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white border border-slate-200/80 p-6 rounded-3xl shadow-sm">
                <div>
                  <h3 className="text-lg font-bold text-slate-900">Visual Floor & Table Map</h3>
                  <p className="text-xs text-slate-500">Manage seating capacity, sections, and live table status in real time.</p>
                </div>
                <div className="flex items-center space-x-3">
                  <div className="flex space-x-1 bg-slate-100 p-1 rounded-xl border border-slate-200">
                    {sections.map((sec: string) => (
                      <button key={sec} onClick={() => setFloorFilter(sec)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${floorFilter === sec ? 'bg-teal-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'}`}>
                        {sec}
                      </button>
                    ))}
                  </div>
                  <button onClick={() => setIsTableModalOpen(true)} className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-teal-600 to-emerald-600 text-white text-xs font-semibold shadow-md shadow-teal-600/10 flex items-center space-x-2 hover:opacity-95 transition-all">
                    <Plus className="w-4 h-4" /><span>Add Table</span>
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {tables.filter((t: any) => floorFilter === 'All' || t.section === floorFilter).map((table: any) => (
                  <div key={table.id} className="bg-white border border-slate-200/80 rounded-3xl p-6 shadow-sm space-y-4 hover:border-teal-300 transition-all">
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="text-xs text-teal-700 font-semibold uppercase">{table.section}</span>
                        <h4 className="text-xl font-extrabold text-slate-900">Table {table.number}</h4>
                      </div>
                      <span className={`px-3 py-1 rounded-full text-xs font-semibold border ${
                        table.status === 'AVAILABLE' ? 'bg-emerald-50 border-emerald-200 text-emerald-700' :
                        table.status === 'OCCUPIED' ? 'bg-rose-50 border-rose-200 text-rose-700' :
                        'bg-amber-50 border-amber-200 text-amber-700'
                      }`}>{table.status}</span>
                    </div>
                    <div className="flex items-center justify-between text-xs text-slate-500 pt-2 border-t border-slate-100">
                      <span>Seating Capacity: <strong className="text-slate-800">{table.capacity} Guests</strong></span>
                      <select value={table.status} onChange={(e) => tableStatusMut.mutate({ id: table.id, status: e.target.value })}
                        className="bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 text-xs text-slate-700 focus:outline-none">
                        <option value="AVAILABLE">Available</option>
                        <option value="OCCUPIED">Occupied</option>
                        <option value="OUT_OF_SERVICE">Out of Service</option>
                      </select>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'analytics' && <Analytics currency={settings.currency || 'NPR'} />}

          {/* FINANCIALS */}
          {activeTab === 'financials' && (
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white border border-slate-200/80 p-6 rounded-3xl shadow-sm">
                <div>
                  <h3 className="text-lg font-bold text-slate-900">Financial Summary & Tax Audit</h3>
                  <p className="text-xs text-slate-500">Government compliant PAN & VAT breakdown for auditing and financial oversight.</p>
                </div>
                <button onClick={handleExportCSV} className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-teal-600 to-emerald-600 text-white text-xs font-semibold shadow-md shadow-teal-600/10 flex items-center space-x-2 hover:opacity-95 transition-all">
                  <Download className="w-4 h-4" /><span>Export CSV Report</span>
                </button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                {[
                  { label: 'Gross Sales', val: `Rs. ${((salesQ.data?.grossMinor || 0) / 100).toLocaleString()}`, desc: 'Total before taxes' },
                  { label: 'Discounts', val: `Rs. ${((salesQ.data?.discountsMinor || 0) / 100).toLocaleString()}`, desc: 'Applied' },
                  { label: 'VAT Collected', val: `Rs. ${((salesQ.data?.taxMinor || 0) / 100).toLocaleString()}`, desc: 'Inland Revenue' },
                  { label: 'Service Charge', val: `Rs. ${((salesQ.data?.serviceChargeMinor || 0) / 100).toLocaleString()}`, desc: 'Distributed to staff' },
                ].map((stat: any, idx: number) => (
                  <div key={idx} className="bg-white border border-slate-200/80 rounded-3xl p-6 shadow-sm space-y-2">
                    <span className="text-xs text-slate-500 font-medium">{stat.label}</span>
                    <div className="text-2xl font-black text-slate-900">{stat.val}</div>
                    <span className="text-[11px] text-teal-700 font-medium block">{stat.desc}</span>
                  </div>
                ))}
              </div>
              <div className="bg-white border border-slate-200/80 rounded-3xl p-6 shadow-sm space-y-4">
                <h3 className="text-base font-bold text-slate-900">Top Selling Items</h3>
                <div className="space-y-3">
                  {(itemsQ.data?.items || []).map((it: any, i: number) => (
                    <div key={i} className="flex items-center justify-between p-4 bg-slate-50 border border-slate-200/60 rounded-2xl">
                      <div className="font-bold text-sm text-slate-900">{it.name}</div>
                      <div className="text-right">
                        <span className="text-xs font-semibold text-slate-700 block">{it.qty} sold</span>
                        <span className="text-xs text-emerald-600 font-medium">Rs. {(it.total / 100).toLocaleString()}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* SETTINGS */}
          {activeTab === 'settings' && (
            <div className="space-y-6 animate-fadeIn max-w-3xl">
              <div className="bg-white border border-slate-200/80 p-8 rounded-3xl shadow-sm space-y-6">
                <div>
                  <h3 className="text-lg font-bold text-slate-900">Restaurant Profile & Tax Configuration</h3>
                  <p className="text-xs text-slate-500">Update establishment details, VAT/PAN numbers, and default currency settings.</p>
                </div>
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">Restaurant Name</label>
                      <input type="text" value={settingsForm.name || ''} onChange={(e) => setSettingsForm({ ...settingsForm, name: e.target.value })}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-900 focus:outline-none focus:border-teal-500" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">Phone Number</label>
                      <input type="text" value={settingsForm.phone || ''} onChange={(e) => setSettingsForm({ ...settingsForm, phone: e.target.value })}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-900 focus:outline-none focus:border-teal-500" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Address</label>
                    <input type="text" value={settingsForm.address || ''} onChange={(e) => setSettingsForm({ ...settingsForm, address: e.target.value })}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-900 focus:outline-none focus:border-teal-500" />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">PAN Number</label>
                      <input type="text" value={settingsForm.panNumber || ''} onChange={(e) => setSettingsForm({ ...settingsForm, panNumber: e.target.value })}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-900 focus:outline-none focus:border-teal-500" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">VAT Percentage (bps)</label>
                      <input type="number" value={settingsForm.taxRateBps ?? 0} onChange={(e) => setSettingsForm({ ...settingsForm, taxRateBps: Number(e.target.value) })}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-900 focus:outline-none focus:border-teal-500" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">Service Charge (bps)</label>
                      <input type="number" value={settingsForm.serviceChargeBps ?? 0} onChange={(e) => setSettingsForm({ ...settingsForm, serviceChargeBps: Number(e.target.value) })}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-900 focus:outline-none focus:border-teal-500" />
                    </div>
                  </div>
                  <button onClick={() => settingsMut.mutate(settingsForm)} className="px-6 py-3 rounded-xl bg-gradient-to-r from-teal-600 to-emerald-600 text-white text-xs font-bold shadow-md shadow-teal-600/20 hover:opacity-95 transition-all mt-4">
                    Save Changes
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* STAFF MODAL */}
      {isStaffModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
          <div className="bg-white border border-slate-200 rounded-3xl p-6 w-full max-w-md shadow-2xl space-y-6">
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-bold text-slate-900">{editingStaff ? 'Edit Staff Member' : 'Add New Staff'}</h3>
              <button onClick={() => setIsStaffModalOpen(false)} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={(e) => { e.preventDefault(); if (!staffForm.name || !staffForm.email || !staffForm.password) { showToast('Fill required fields', 'error'); return; } staffMut.mutate({ name: staffForm.name, email: staffForm.email, password: staffForm.password, role: staffForm.role }); }} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Full Name</label>
                <input type="text" aria-label="Full name" value={staffForm.name} onChange={(e) => setStaffForm({ ...staffForm, name: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-900 focus:outline-none focus:border-teal-500" required />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Email</label>
                <input type="email" aria-label="Email" value={staffForm.email} onChange={(e) => setStaffForm({ ...staffForm, email: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-900 focus:outline-none focus:border-teal-500" required />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Password</label>
                <input type="password" aria-label="Password" value={staffForm.password} onChange={(e) => setStaffForm({ ...staffForm, password: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-900 focus:outline-none focus:border-teal-500" required />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Role</label>
                <select value={staffForm.role} onChange={(e) => setStaffForm({ ...staffForm, role: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-900 focus:outline-none">
                  <option value="WAITER">Waiter</option>
                  <option value="BILLER">Biller</option>
                  <option value="KITCHEN">Kitchen</option>
                  <option value="ADMIN">Admin</option>
                </select>
              </div>
              <div className="flex justify-end space-x-3 pt-4">
                <button type="button" onClick={() => setIsStaffModalOpen(false)} className="px-4 py-2 rounded-xl bg-slate-100 text-slate-600 text-xs font-semibold hover:bg-slate-200">Cancel</button>
                <button type="submit" className="px-5 py-2 rounded-xl bg-gradient-to-r from-teal-600 to-emerald-600 text-white text-xs font-semibold shadow-md shadow-teal-600/20">Save Staff</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {passwordResetStaff && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
          <div className="w-full max-w-md space-y-5 rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold text-slate-900">{passwordResetComplete ? 'Password updated' : 'Reset staff password'}</h3>
                <p className="mt-1 text-sm text-slate-500">{passwordResetStaff.name} · {passwordResetStaff.email}</p>
              </div>
              <button onClick={closePasswordReset} aria-label="Close password reset" className="text-slate-400 hover:text-slate-600"><X className="h-5 w-5" /></button>
            </div>
            {passwordResetComplete ? (
              <>
                <p className="text-sm text-slate-600">Share this new password with the staff member securely. It will not be shown again after closing this window.</p>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600">New password</label>
                  <input type="text" readOnly value={passwordResetForm} aria-label="New password, shown once"
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-900" />
                </div>
                <div className="flex justify-end">
                  <button onClick={closePasswordReset} className="rounded-xl bg-gradient-to-r from-teal-600 to-emerald-600 px-5 py-2.5 text-xs font-semibold text-white">Done</button>
                </div>
              </>
            ) : (
              <form onSubmit={(e) => { e.preventDefault(); passwordResetMut.mutate({ id: passwordResetStaff.id, password: passwordResetForm }); }} className="space-y-4">
                <p className="text-sm text-slate-600">Set a new password for this staff member. Their existing password cannot be retrieved.</p>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600">New password</label>
                  <input type="password" autoComplete="new-password" minLength={6} required value={passwordResetForm}
                    onChange={(e) => setPasswordResetForm(e.target.value)} aria-label="New password"
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-900 focus:border-teal-500 focus:outline-none" />
                </div>
                <div className="flex justify-end gap-3">
                  <button type="button" onClick={closePasswordReset} className="rounded-xl bg-slate-100 px-4 py-2.5 text-xs font-semibold text-slate-600 hover:bg-slate-200">Cancel</button>
                  <button type="submit" disabled={passwordResetMut.isPending} className="rounded-xl bg-gradient-to-r from-teal-600 to-emerald-600 px-5 py-2.5 text-xs font-semibold text-white disabled:opacity-60">
                    {passwordResetMut.isPending ? 'Updating...' : 'Set new password'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* MENU MODAL */}
      {isMenuModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
          <div className="bg-white border border-slate-200 rounded-3xl p-6 w-full max-w-md shadow-2xl space-y-6">
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-bold text-slate-900">{editingMenuItem ? 'Edit Menu Item' : 'Add New Menu Item'}</h3>
              <button onClick={() => setIsMenuModalOpen(false)} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={(e) => { e.preventDefault(); const discountPercent = Number(menuForm.discountPercent); const price = Number(menuForm.price); if (!menuForm.name.trim() || !menuForm.category) { showToast('Enter an item name and select a category.', 'error'); return; } if (!Number.isFinite(price) || price <= 0) { showToast('Enter a valid price greater than zero.', 'error'); return; } if (!Number.isFinite(discountPercent) || discountPercent < 0 || discountPercent > 100) { showToast('Enter a discount from 0 to 100%.', 'error'); return; } menuMut.mutate({ id: editingMenuItem?.id, name: menuForm.name.trim(), categoryId: menuForm.category, description: menuForm.desc, priceMinor: Math.round(price * 100), discountPercent, available: menuForm.available, imageUrl: menuForm.imageUrl || null }); }} className="max-h-[80vh] space-y-4 overflow-y-auto">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Item Name</label>
                <input type="text" aria-label="Menu item name" value={menuForm.name} onChange={(e) => setMenuForm({ ...menuForm, name: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-900 focus:outline-none focus:border-teal-500" required />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Category</label>
                  <select value={menuForm.category} onChange={(e) => setMenuForm({ ...menuForm, category: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-900 focus:outline-none">
                    {categories.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Price (Rs.)</label>
                  <input type="number" aria-label="Price" min="0.01" step="0.01" value={menuForm.price} onChange={(e) => setMenuForm({ ...menuForm, price: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-900 focus:outline-none focus:border-teal-500" required />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Item discount (%)</label>
                <input
                  type="number"
                  aria-label="Item discount percentage"
                  min="0"
                  max="100"
                  step="0.01"
                  value={menuForm.discountPercent}
                  onChange={(e) => setMenuForm({ ...menuForm, discountPercent: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-900 focus:outline-none focus:border-teal-500"
                />
                <p className="mt-1 text-xs text-slate-500">Set 0 for no discount. The discounted price is used for new orders.</p>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Description</label>
                <textarea aria-label="Description" value={menuForm.desc} onChange={(e) => setMenuForm({ ...menuForm, desc: e.target.value })} rows={2}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-sm text-slate-900 focus:outline-none focus:border-teal-500"></textarea>
              </div>
              <div>
                <label htmlFor="menu-item-image" className="mb-2 block text-xs font-medium text-slate-600">Product photo</label>
                <input
                  id="menu-item-image"
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  disabled={imageUploading || menuMut.isPending}
                  onChange={(event) => {
                    void uploadMenuImage(event.target.files?.[0]);
                    event.target.value = '';
                  }}
                  className="block w-full cursor-pointer rounded-xl border border-slate-200 bg-slate-50 text-sm text-slate-600 file:mr-4 file:border-0 file:bg-teal-50 file:px-4 file:py-2.5 file:font-semibold file:text-teal-800 hover:file:bg-teal-100 disabled:opacity-60"
                />
                <p className="mt-1 text-xs text-slate-500">JPEG, PNG, or WebP · up to 5 MB</p>
                {imageUploading && <p role="status" className="mt-2 flex items-center gap-2 text-xs text-teal-700"><LoaderCircle className="h-4 w-4 animate-spin" />Uploading photo…</p>}
                {menuForm.imageUrl && (
                  <div className="mt-3 flex items-center gap-3">
                    <img src={menuForm.imageUrl} alt="Product preview" className="h-20 w-20 rounded-xl object-cover" />
                    <button type="button" onClick={() => setMenuForm((form) => ({ ...form, imageUrl: '' }))} className="text-xs font-semibold text-rose-700 hover:underline">Remove photo</button>
                  </div>
                )}
              </div>
              <div className="flex justify-end space-x-3 pt-4">
                <button type="button" onClick={() => setIsMenuModalOpen(false)} className="px-4 py-2 rounded-xl bg-slate-100 text-slate-600 text-xs font-semibold hover:bg-slate-200">Cancel</button>
                <button type="submit" disabled={imageUploading || menuMut.isPending} className="px-5 py-2 rounded-xl bg-gradient-to-r from-teal-600 to-emerald-600 text-white text-xs font-semibold shadow-md shadow-teal-600/20 disabled:cursor-not-allowed disabled:opacity-60">Save Item</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* TABLE MODAL */}
      {isTableModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
          <div className="bg-white border border-slate-200 rounded-3xl p-6 w-full max-w-md shadow-2xl space-y-6">
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-bold text-slate-900">Add New Table</h3>
              <button onClick={() => setIsTableModalOpen(false)} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={(e) => { e.preventDefault(); if (!tableForm.number) { showToast('Specify table number', 'error'); return; } tableMut.mutate({ number: tableForm.number, capacity: Number(tableForm.capacity), section: tableForm.section }); }} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Table Number / Code</label>
                <input type="text" aria-label="Table number" value={tableForm.number} onChange={(e) => setTableForm({ ...tableForm, number: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-900 focus:outline-none focus:border-teal-500" required />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Section</label>
                  <select value={tableForm.section} onChange={(e) => setTableForm({ ...tableForm, section: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-900 focus:outline-none">
                    <option value="Main Dining">Main Dining</option>
                    <option value="Rooftop Terrace">Rooftop Terrace</option>
                    <option value="VIP Lounge">VIP Lounge</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Seating Capacity</label>
                  <input type="number" value={tableForm.capacity} onChange={(e) => setTableForm({ ...tableForm, capacity: Number(e.target.value) })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-900 focus:outline-none focus:border-teal-500" min="1" max="20" required />
                </div>
              </div>
              <div className="flex justify-end space-x-3 pt-4">
                <button type="button" onClick={() => setIsTableModalOpen(false)} className="px-4 py-2 rounded-xl bg-slate-100 text-slate-600 text-xs font-semibold hover:bg-slate-200">Cancel</button>
                <button type="submit" className="px-5 py-2 rounded-xl bg-gradient-to-r from-teal-600 to-emerald-600 text-white text-xs font-semibold shadow-md shadow-teal-600/20">Add Table</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
