import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import {
  ArrowUpRight,
  Banknote,
  Ban,
  Check,
  CircleAlert,
  CalendarDays,
  ChevronRight,
  FileText,
  LogOut,
  ReceiptText,
  RefreshCw,
  Search,
  Table2,
  UtensilsCrossed,
  Users,
} from 'lucide-react';
import { getDashboardPath, useAuth } from '../../lib/auth';
import { get } from '../../lib/api';
import { getSocket } from '../../lib/socket';
import TableAreaFilter from '../../components/TableAreaFilter';
import KitchenOrderStage from '../../components/KitchenOrderStage';
import { getTableArea } from '../../lib/tableAreas';

type BillStatus = 'OPEN' | 'PARTIALLY_PAID' | 'PAID' | 'CLOSED' | 'VOIDED';
type BillFilter = 'ALL' | BillStatus;
type TableFilter = 'ALL' | 'AVAILABLE' | 'OCCUPIED' | 'BILL_DUE' | 'RESERVED' | 'OUT_OF_SERVICE';
type BillMetric = 'OUTSTANDING' | 'OPEN_BILLS' | 'COLLECTED_TODAY' | 'RECEIPTS_TODAY';
type TableDisplay = { label: string; className: string; accent: string; iconColor: string };

interface LiveTable {
  id: string;
  number: string;
  active: boolean;
  section?: string | null;
  status: string;
  activeSession?: {
    id: string;
    status: string;
    customerName?: string | null;
    waiter?: { name: string } | null;
    bill?: { id: string; status: BillStatus; outstandingMinor: number } | null;
    orders?: {
      id: string;
      orderNumber?: number;
      status: string;
      items?: { quantity: number; status: string }[];
    }[];
  } | null;
}

interface Bill {
  id: string;
  billNumber: number;
  status: BillStatus;
  subtotalMinor: number;
  grandTotalMinor: number;
  amountPaidMinor: number;
  outstandingMinor: number;
  createdAt: string;
  tableSessionId: string;
  receipt?: { issuedAt: string } | null;
  tableSession?: {
    customerName?: string | null;
    table?: { number: string };
    waiter?: { name: string };
    orders?: { items?: { quantity: number; status: string }[] }[];
  };
  payments?: { amountMinor: number; status: string; createdAt: string }[];
}

interface BillSummary {
  outstandingMinor: number;
  collectedTodayMinor: number;
  receiptsToday: number;
  openBills: number;
}

interface SummaryBill {
  id: string;
  billNumber: number;
  status: BillStatus;
  grandTotalMinor: number;
  amountPaidMinor: number;
  outstandingMinor: number;
  tableSession?: {
    customerName?: string | null;
    table?: { number: string } | null;
    waiter?: { name: string } | null;
    orders?: { items?: { quantity: number; status: string }[] }[];
  } | null;
}

interface BillSummaryResponse {
  summary: BillSummary;
  matchingBillCount: number;
  matchingBills: SummaryBill[];
}

const emptyBills: Bill[] = [];

const money = (minor = 0) => `Rs ${new Intl.NumberFormat('en-NP', {
  maximumFractionDigits: 0,
}).format(minor / 100)}`;

const localDayRange = () => {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { from: start.toISOString(), to: end.toISOString() };
};

const billCode = (number: number) => `BL-${String(number).padStart(4, '0')}`;

const getTableFilter = (table: LiveTable): Exclude<TableFilter, 'ALL'> => {
  if (table.status === 'OUT_OF_SERVICE') return 'OUT_OF_SERVICE';
  if (table.status === 'RESERVED') return 'RESERVED';
  if (!table.activeSession) return 'AVAILABLE';
  if ((table.activeSession.bill?.outstandingMinor ?? 0) > 0) return 'BILL_DUE';
  return 'OCCUPIED';
};

const statusStyles: Record<BillStatus, string> = {
  OPEN: 'bg-[#e9eff7] text-[#4b6787]',
  PARTIALLY_PAID: 'bg-[#fbf0d9] text-[#927131]',
  PAID: 'bg-[#e4f2eb] text-[#317757]',
  CLOSED: 'bg-[#eef0ef] text-[#647269]',
  VOIDED: 'bg-[#f9e8e6] text-[#a35149]',
};

const filters: { id: BillFilter; label: string }[] = [
  { id: 'ALL', label: 'All' },
  { id: 'OPEN', label: 'Open' },
  { id: 'PARTIALLY_PAID', label: 'Partially paid' },
  { id: 'PAID', label: 'Paid' },
  { id: 'CLOSED', label: 'Closed' },
];

const billMetrics: BillMetric[] = ['OUTSTANDING', 'COLLECTED_TODAY', 'RECEIPTS_TODAY', 'OPEN_BILLS'];

export default function BillerOverview() {
  const qc = useQueryClient();
  const nav = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user, logout } = useAuth();
  const dashboardPath = getDashboardPath(user?.role);
  const updateSearchParams = (updates: Record<string, string | null>) => {
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      Object.entries(updates).forEach(([key, value]) => {
        if (value === null) next.delete(key);
        else next.set(key, value);
      });
      return next;
    }, { replace: true });
  };
  const requestedFilter = searchParams.get('filter') || 'ALL';
  const filter = filters.some((item) => item.id === requestedFilter) ? requestedFilter as BillFilter : 'ALL';
  const selectBillFilter = (value: BillFilter) => updateSearchParams({
    filter: value === 'ALL' ? null : value,
    cashier: null,
  });
  const search = searchParams.get('q') || '';
  const setSearch = (value: string) => updateSearchParams({ q: value || null });
  const cashierMode = searchParams.get('cashier') === '1';
  const viewMode = searchParams.get('view') === 'history' ? 'history' : 'tables';
  const [billMetric, setBillMetric] = useState<BillMetric | null>(null);
  const setViewMode = (value: 'tables' | 'history') => updateSearchParams({ view: value === 'tables' ? null : value });
  const [summaryDateRange] = useState(localDayRange);
  const tablesQ = useQuery<{ tables: LiveTable[] }>({
    queryKey: ['tables'],
    queryFn: () => get('/tables'),
    refetchInterval: 10_000,
  });
  const billsQ = useQuery<{ bills: Bill[] }>({
    queryKey: ['bills'],
    queryFn: () => get('/bills'),
    refetchInterval: 15_000,
  });
  const billSummaryQ = useQuery<{ summary: BillSummary }>({
    queryKey: ['bills', 'summary', summaryDateRange.from, summaryDateRange.to],
    queryFn: () => get('/bills/summary', summaryDateRange),
    refetchInterval: 15_000,
  });
  const metricBillsQ = useQuery<BillSummaryResponse>({
    queryKey: ['bills', 'summary', summaryDateRange.from, summaryDateRange.to, billMetric],
    queryFn: () => get('/bills/summary', { ...summaryDateRange, metric: billMetric }),
    enabled: billMetric !== null,
    refetchInterval: 15_000,
  });
  const settingsQ = useQuery<{ settings?: { name?: string } }>({
    queryKey: ['settings'],
    queryFn: () => get('/settings'),
  });

  useEffect(() => {
    const socket = getSocket();
    const refreshBills = () => {
      void qc.invalidateQueries({ queryKey: ['bills'] });
      void qc.invalidateQueries({ queryKey: ['tables'] });
    };
    const events = [
      'bill:updated',
      'bill:payment-recorded',
      'bill:closed',
      'order:submitted',
      'order:created',
      'order:items-updated',
      'order:item-cancelled',
      'order:status-changed',
      'table-session:opened',
      'table-session:closed',
      'table:updated',
      'reservation:created',
      'reservation:updated',
      'reservation:cancelled',
    ];
    events.forEach((event) => socket.on(event, refreshBills));
    return () => {
      events.forEach((event) => socket.off(event, refreshBills));
    };
  }, [qc]);

  const bills = billsQ.data?.bills ?? emptyBills;
  const activeTables = useMemo(
    () => (tablesQ.data?.tables ?? []).filter((table) => table.active),
    [tablesQ.data?.tables],
  );
  const billSummary = billSummaryQ.data?.summary;

  const counts = useMemo<Record<BillFilter, number>>(() => ({
    ALL: bills.length,
    OPEN: bills.filter((bill) => bill.status === 'OPEN').length,
    PARTIALLY_PAID: bills.filter((bill) => bill.status === 'PARTIALLY_PAID').length,
    PAID: bills.filter((bill) => bill.status === 'PAID').length,
    CLOSED: bills.filter((bill) => bill.status === 'CLOSED').length,
    VOIDED: bills.filter((bill) => bill.status === 'VOIDED').length,
  }), [bills]);

  const visibleBills = useMemo(() => {
    const term = search.trim().toLowerCase();
    return bills.filter((bill) => {
      if (cashierMode && bill.status !== 'OPEN' && bill.status !== 'PARTIALLY_PAID') return false;
      if (filter !== 'ALL' && bill.status !== filter) return false;
      if (!term) return true;
      return [
        billCode(bill.billNumber),
        String(bill.billNumber),
        bill.tableSession?.table?.number,
        bill.tableSession?.customerName,
        bill.tableSession?.waiter?.name,
      ].some((value) => value?.toLowerCase().includes(term));
    });
  }, [bills, cashierMode, filter, search]);
  const tableAreas = useMemo(() => {
    const counts = new Map<string, number>();
    activeTables.forEach((table) => {
      const area = getTableArea(table.section);
      counts.set(area, (counts.get(area) ?? 0) + 1);
    });
    return [...counts].map(([name, count]) => ({ name, count })).sort((a, b) => a.name.localeCompare(b.name));
  }, [activeTables]);
  const requestedArea = searchParams.get('area') || 'All';
  const selectedArea = requestedArea === 'All' || tableAreas.some((area) => area.name === requestedArea)
    ? requestedArea
    : 'All';
  const requestedTableFilter = searchParams.get('tableStatus') || 'ALL';
  const tableFilter: TableFilter = ['ALL', 'AVAILABLE', 'OCCUPIED', 'BILL_DUE', 'RESERVED', 'OUT_OF_SERVICE'].includes(requestedTableFilter)
    ? requestedTableFilter as TableFilter
    : 'ALL';
  const chooseTableFilter = (value: TableFilter) => {
    updateSearchParams({ tableStatus: value === 'ALL' ? null : value });
  };
  const visibleTables = useMemo(() => {
    const term = search.trim().toLowerCase();
    return activeTables.filter((table) => {
      if (selectedArea !== 'All' && getTableArea(table.section) !== selectedArea) return false;
      if (tableFilter !== 'ALL' && getTableFilter(table) !== tableFilter) return false;
      if (!term) return true;
      return [
        table.number,
        table.activeSession?.customerName,
        table.activeSession?.waiter?.name,
      ].some((value) => value?.toLowerCase().includes(term));
    });
  }, [activeTables, search, selectedArea, tableFilter]);
  const chooseArea = (area: string) => {
    updateSearchParams({ area: area === 'All' ? null : area });
  };
  const tableStatusCounts = useMemo(() => {
    const counts: Record<Exclude<TableFilter, 'ALL'>, number> = {
      AVAILABLE: 0,
      OCCUPIED: 0,
      BILL_DUE: 0,
      RESERVED: 0,
      OUT_OF_SERVICE: 0,
    };
    for (const table of activeTables) {
      counts[getTableFilter(table)] += 1;
    }
    return counts;
  }, [activeTables]);
  const [dateLabel] = useState(() => new Intl.DateTimeFormat('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date()));

  const retry = () => {
    void billsQ.refetch();
    void billSummaryQ.refetch();
    if (billMetric) void metricBillsQ.refetch();
    void tablesQ.refetch();
    void settingsQ.refetch();
  };

  const toggleCashierMode = () => updateSearchParams({
    cashier: cashierMode ? null : '1',
    ...(!cashierMode && (filter === 'PAID' || filter === 'CLOSED' || filter === 'VOIDED') ? { filter: null } : {}),
  });
  const openBill = (billId: string) => nav(`/biller/bill/${billId}`, {
    state: { returnTo: `${location.pathname}${location.search}` },
  });

  return (
    <div className="biller-dashboard min-h-screen text-[#263b33] lg:flex">
      <aside className="relative hidden h-screen w-[244px] shrink-0 self-start flex-col justify-between overflow-hidden border-r border-[#e4ede7]/80 bg-[#fbfdfb]/85 backdrop-blur-sm lg:sticky lg:top-0 lg:flex">
        <div className="relative z-10">
          <Link to={dashboardPath} aria-label="Dashboard" className="flex items-center gap-3 border-b border-[#edf2ef] px-5 py-5 transition-colors hover:bg-[#f8fbf9] focus-visible:outline focus-visible:outline-2 focus-visible:outline-inset focus-visible:outline-emerald-700">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#168263] shadow-sm">
              <UtensilsCrossed className="h-6 w-6 text-white" />
            </div>
            <div className="min-w-0">
              <h1 className="truncate text-sm font-bold tracking-tight text-[#203a30]">{settingsQ.data?.settings?.name || 'Restaurant'}</h1>
              <p className="mt-0.5 text-xs text-[#73847c]">RestoPOS</p>
            </div>
          </Link>
          <nav aria-label="Cashier navigation" className="px-3 py-4">
            <button type="button" className="flex w-full items-center gap-3 rounded-2xl border-l-[3px] border-[#16a478] bg-[#e9f5ee] px-3.5 py-3 text-left text-sm font-semibold text-[#17694f] shadow-sm">
              <ReceiptText className="h-[18px] w-[18px]" />
              Cashier / Biller
            </button>
          </nav>
        </div>
        <div className="relative z-10 m-3.5 flex items-center gap-3 rounded-2xl border border-[#e2ebe5] bg-white/90 p-3.5 shadow-sm">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#d8f1e4] text-sm font-bold text-[#168263]">
            {user?.name?.split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="truncate text-xs font-semibold text-[#344a3e]">{user?.name || 'Cashier'}</p>
            <p className="text-[11px] text-[#839188]">Cashier / Biller</p>
          </div>
          <button onClick={async () => { await logout(); nav('/login', { replace: true }); }} aria-label="Log out" className="ml-auto inline-flex items-center gap-1 text-[11px] font-medium text-[#6f887a] hover:text-rose-700">
            <LogOut className="h-3.5 w-3.5" /> Logout
          </button>
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        <header className="border-b border-[#e5ede8] bg-white/90 backdrop-blur">
          <div className="mx-auto flex min-h-[76px] max-w-[1600px] items-center justify-between gap-3 px-4 sm:px-7 lg:px-10">
            <Link to={dashboardPath} aria-label="Dashboard" className="flex min-w-0 items-center gap-3 transition-opacity hover:opacity-80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-700 lg:hidden">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#168263]">
                <UtensilsCrossed className="h-5 w-5 text-white" />
              </div>
              <div className="min-w-0">
                <h1 className="truncate text-sm font-semibold tracking-tight text-[#243b32]">{settingsQ.data?.settings?.name || 'Restaurant'}</h1>
                <p className="text-xs text-[#73847c]">Cashier / Biller</p>
              </div>
            </Link>
            <div className="flex shrink-0 items-center gap-2 sm:gap-3">
              <span className="inline-flex items-center gap-2 rounded-full border border-[#dfebe4] bg-white px-3 py-2 text-xs font-semibold text-[#406b55]">
                <span className="h-2 w-2 rounded-full bg-[#31a66f] animate-pulse" /> Live
              </span>
              <div className="hidden items-center gap-2 rounded-full border border-[#e2ebe5] bg-white px-3 py-2 text-xs font-medium text-[#53675c] md:flex">
                <CalendarDays className="h-4 w-4 text-[#168263]" /> {dateLabel}
              </div>
              {viewMode === 'history' && <>
                <button
                  type="button"
                  role="switch"
                  aria-checked={cashierMode}
                  aria-label="Cashier mode, show only bills requiring payment"
                  onClick={toggleCashierMode}
                  className={`relative h-7 w-12 rounded-full transition-colors ${cashierMode ? 'bg-[#168263]' : 'bg-[#cbd7d0]'}`}
                >
                  <span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${cashierMode ? 'translate-x-6' : 'translate-x-1'}`} />
                </button>
                <span className="hidden text-sm font-semibold text-[#53675c] sm:inline">Cashier</span>
              </>}
              <button
                onClick={() => setViewMode(viewMode === 'tables' ? 'history' : 'tables')}
                className="rounded-full border border-[#dce8e1] bg-white px-3 py-2 text-xs font-semibold text-[#40564b] transition-colors hover:bg-[#f8fbf9] sm:px-4 sm:text-sm"
              >
                {viewMode === 'tables' ? 'Bill history' : 'Live tables'}
              </button>
              <button
                onClick={async () => { await logout(); nav('/login', { replace: true }); }}
                aria-label={`Log out ${user?.name || ''}`}
                title="Log out"
                className="flex h-9 w-9 items-center justify-center rounded-full text-[#75877d] transition-colors hover:bg-[#f2f7f4] hover:text-rose-700 lg:hidden"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          </div>
        </header>

      <main className="mx-auto max-w-[1600px] space-y-5 px-4 py-5 sm:px-7 sm:py-6 lg:px-10">
        <div className="flex flex-col justify-between gap-4 xl:flex-row xl:items-center">
          {viewMode === 'tables' && (
            <div className="grid w-full grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-5" role="group" aria-label="Filter tables by status">
              {[
                { id: 'AVAILABLE' as const, label: 'Available', count: tableStatusCounts.AVAILABLE, icon: Banknote, color: 'emerald' },
                { id: 'OCCUPIED' as const, label: 'Occupied', count: tableStatusCounts.OCCUPIED, icon: Users, color: 'blue' },
                { id: 'BILL_DUE' as const, label: 'Bill due', count: tableStatusCounts.BILL_DUE, icon: ReceiptText, color: 'amber' },
                { id: 'RESERVED' as const, label: 'Reserved', count: tableStatusCounts.RESERVED, icon: CalendarDays, color: 'violet' },
                { id: 'OUT_OF_SERVICE' as const, label: 'Out of service', count: tableStatusCounts.OUT_OF_SERVICE, icon: Ban, color: 'slate' },
              ].map((item) => {
                const selected = tableFilter === item.id;
                const colors = {
                  emerald: selected ? 'border-[#92d5b5] bg-[#effaf4] text-[#188256] shadow-[0_4px_16px_rgba(39,149,100,0.12)]' : 'border-[#e5eee8] bg-white/95 text-[#658276] hover:border-[#c6e5d3] hover:bg-[#fbfefc]',
                  blue: selected ? 'border-[#bbd9f1] bg-[#f2f8fd] text-[#3985bd] shadow-[0_4px_16px_rgba(56,132,187,0.10)]' : 'border-[#e7edf1] bg-white/95 text-[#778b97] hover:border-[#d0e3f0] hover:bg-[#fbfdff]',
                  amber: selected ? 'border-[#f0d7a9] bg-[#fff9ed] text-[#c27a15] shadow-[0_4px_16px_rgba(194,122,21,0.10)]' : 'border-[#f0ece3] bg-white/95 text-[#93856d] hover:border-[#f0dfbf] hover:bg-[#fffdf9]',
                  violet: selected ? 'border-[#d8c8ee] bg-[#f9f5ff] text-[#8763be] shadow-[0_4px_16px_rgba(135,99,190,0.10)]' : 'border-[#ece7f1] bg-white/95 text-[#91859f] hover:border-[#e0d4ef] hover:bg-[#fdfbff]',
                  slate: selected ? 'border-[#d9e0dc] bg-[#f6f8f7] text-[#66746d] shadow-[0_4px_16px_rgba(102,116,109,0.08)]' : 'border-[#e8ece9] bg-white/95 text-[#89928d] hover:border-[#dce3df] hover:bg-[#fbfcfb]',
                }[item.color];
                const Icon = item.icon;
                return (
                  <button
                    key={item.id}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => chooseTableFilter(selected ? 'ALL' : item.id)}
                    className={`group inline-flex min-h-[58px] min-w-0 items-center gap-2.5 rounded-full border px-2.5 py-2 text-left transition-all sm:px-3 ${colors}`}
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-current/[0.08]">
                      <Icon className="h-[17px] w-[17px]" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[11px] font-semibold leading-tight sm:text-xs">{item.label}</span>
                      <span className="mt-1 block text-[10px] font-medium opacity-70">
                        {tablesQ.data ? `${item.count} ${item.count === 1 ? 'table' : 'tables'}` : 'Loading'}
                      </span>
                    </span>
                    <ChevronRight className={`h-4 w-4 shrink-0 opacity-45 transition-transform group-hover:translate-x-0.5 group-hover:opacity-80 ${selected ? 'opacity-75' : ''}`} />
                  </button>
                );
              })}
            </div>
          )}

          {viewMode === 'history' && <div className="flex flex-wrap gap-2 pb-1" aria-label="Filter bills by status">
            {filters.map((item) => {
              const selected = filter === item.id && !cashierMode;
              return (
                <button
                  key={item.id}
                  onClick={() => selectBillFilter(item.id)}
                  aria-pressed={selected}
                  className={`inline-flex min-h-11 items-center gap-2 rounded-full border px-3 py-2 text-xs font-semibold transition-colors sm:px-4 sm:text-sm ${
                    selected
                      ? 'border-[#203a30] bg-[#203a30] text-white'
                      : 'border-[#dce8e1] bg-white text-[#53675c] hover:border-[#b9cfc1] hover:bg-[#f8fbf9]'
                  }`}
                >
                  {item.label}
                  <span className={selected ? 'text-white/70' : 'text-[#8a9990]'}>{counts[item.id]}</span>
                </button>
              );
            })}
          </div>}
        </div>

        {viewMode === 'tables' && tableAreas.length > 0 && (
          <TableAreaFilter areas={tableAreas} value={selectedArea} onChange={chooseArea} label="Filter tables by area" />
        )}

        {billsQ.isError && (
          <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-rose-200 bg-white p-4 text-rose-800">
            <div className="flex items-start gap-3">
              <CircleAlert className="mt-0.5 h-5 w-5 shrink-0" />
              <div>
                <p className="font-semibold">Bills could not be loaded</p>
                <p className="mt-1 text-sm text-rose-700">Check your connection and try again.</p>
              </div>
            </div>
            <button onClick={retry} className="rounded-lg bg-rose-50 px-3 py-2 text-sm font-semibold hover:bg-rose-100">Try again</button>
          </div>
        )}

        {billSummaryQ.isError && (
          <div role="alert" className="rounded-2xl border border-rose-200 bg-white p-4 text-sm text-rose-800">
            Billing totals could not be loaded. Retry to refresh the summary.
          </div>
        )}

        <section aria-label="Billing summary" className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[
            { label: 'Outstanding balance', value: billSummary ? money(billSummary.outstandingMinor) : '—', icon: Banknote, iconColor: 'text-[#15945d]', iconBg: 'bg-[#dff4e5]', tint: 'from-[#f0faf2]', border: 'border-[#dcefe3]', art: '#6fae88' },
            { label: 'Collected today', value: billSummary ? money(billSummary.collectedTodayMinor) : '—', icon: Check, iconColor: 'text-[#078cba]', iconBg: 'bg-[#e0f2ff]', tint: 'from-[#f1f9ff]', border: 'border-[#dfedf8]', art: '#72b8df' },
            { label: 'Receipts issued today', value: billSummary?.receiptsToday.toLocaleString() ?? '—', icon: FileText, iconColor: 'text-[#d87912]', iconBg: 'bg-[#fff0d9]', tint: 'from-[#fff8ee]', border: 'border-[#f3e9dc]', art: '#dbaa6d' },
            { label: 'Open bills', value: billSummary?.openBills.toLocaleString() ?? '—', icon: ReceiptText, iconColor: 'text-[#8653bc]', iconBg: 'bg-[#f0e5fa]', tint: 'from-[#f8f2fc]', border: 'border-[#ebe3f4]', art: '#a78bc9' },
          ].map((card, index) => (
            <button
              key={card.label}
              type="button"
              aria-pressed={billMetric === billMetrics[index]}
              onClick={() => {
                const nextMetric = billMetrics[index];
                if (nextMetric) setBillMetric((current) => current === nextMetric ? null : nextMetric);
              }}
              className={`relative min-h-[194px] overflow-hidden rounded-[24px] border text-left transition-shadow ${card.border} bg-gradient-to-br ${card.tint} via-white to-white px-5 py-5 shadow-[0_5px_18px_rgba(34,65,49,0.045)] hover:shadow-[0_8px_24px_rgba(34,65,49,0.09)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 sm:px-6 ${billMetric === billMetrics[index] ? 'ring-2 ring-[#168263]/35' : ''}`}
            >
              <div className="relative z-10 flex items-center gap-3">
                <span className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-full ${card.iconBg} ${card.iconColor}`}>
                  <card.icon className="h-7 w-7" strokeWidth={2.6} />
                </span>
                <p className="max-w-[150px] text-sm font-medium leading-5 text-[#718078]">{card.label}</p>
                <span
                  aria-hidden="true"
                  className={`ml-auto flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${card.iconBg} ${card.iconColor} transition hover:brightness-95`}
                >
                  <ArrowUpRight className="h-4 w-4" />
                </span>
              </div>
              <p className="relative z-10 mt-3 font-serif text-[30px] font-semibold tracking-tight text-[#203a30] sm:text-[34px]">{card.value}</p>
              <span className={`relative z-10 mt-3 block h-[3px] w-12 rounded-full ${card.iconBg}`} aria-hidden="true" />
              <svg aria-hidden="true" className="pointer-events-none absolute bottom-0 right-0 h-[102px] w-[190px] opacity-[0.28]" viewBox="0 0 190 102" fill="none">
                <path d="M0 99 42 58 67 81 103 34 142 79 164 59 190 82V102H0Z" fill={card.art} fillOpacity=".24" />
                <path d="m16 99 43-38 21 22 24-31 36 47" stroke={card.art} strokeWidth="2" strokeOpacity=".55" />
                <path d="M119 98V75h19v23m-22-23 12-12 12 12m-17-1V66h10v8m-17 24h29" stroke={card.art} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M127 60v-7m-8 14 8-8 8 8" stroke={card.art} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          ))}
        </section>

        {billMetric && (
          <section aria-label="Billing summary details" className="overflow-hidden rounded-3xl border border-[#e5ede8] bg-white/95 shadow-[0_5px_18px_rgba(34,65,49,0.045)]">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e7eeea] px-5 py-4 sm:px-6">
              <div>
                <h3 className="font-semibold text-[#40564b]">
                  {billMetric === 'OUTSTANDING' ? 'Bills with outstanding balance'
                    : billMetric === 'OPEN_BILLS' ? 'Open bills'
                      : billMetric === 'COLLECTED_TODAY' ? 'Bills with payments collected today'
                        : 'Receipts issued today'}
                </h3>
                <p className="mt-0.5 text-xs text-[#849188]">
                  {metricBillsQ.data
                    ? `${metricBillsQ.data.matchingBillCount} matching bill${metricBillsQ.data.matchingBillCount === 1 ? '' : 's'}`
                    : 'Loading matching bills…'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setBillMetric(null)}
                className="rounded-full border border-[#dce8e1] bg-white px-3 py-2 text-xs font-semibold text-[#53675c] transition-colors hover:bg-[#f8fbf9]"
              >
                Close
              </button>
            </div>
            {metricBillsQ.isError ? (
              <div role="alert" className="p-5 text-sm text-rose-800">
                Could not load these bills. Use Refresh to try again.
              </div>
            ) : metricBillsQ.isLoading ? (
              <div className="space-y-2 p-4" aria-label="Loading matching bills">
                {[0, 1, 2].map((row) => <div key={row} className="h-14 rounded-xl bg-[#f7faf8]" />)}
              </div>
            ) : metricBillsQ.data?.matchingBills.length ? (
              <>
                <div className="divide-y divide-[#edf2ef]">
                  {metricBillsQ.data.matchingBills.map((bill) => {
                    const itemCount = (bill.tableSession?.orders ?? [])
                      .flatMap((order) => order.items ?? [])
                      .filter((item) => item.status !== 'CANCELLED')
                      .reduce((sum, item) => sum + item.quantity, 0);
                    return (
                      <button
                        key={bill.id}
                        type="button"
                        onClick={() => openBill(bill.id)}
                        className="grid w-full grid-cols-2 items-center gap-x-4 gap-y-2 px-5 py-4 text-left transition-colors hover:bg-[#fbfdfb] focus-visible:outline focus-visible:outline-2 focus-visible:outline-inset focus-visible:outline-emerald-700 sm:grid-cols-[1.2fr_1fr_1fr_.7fr_1fr_1fr] sm:px-6"
                      >
                        <span className="font-semibold text-[#344a3e]"> {billCode(bill.billNumber)}</span>
                        <span className="text-sm text-[#53675c]">Table {bill.tableSession?.table?.number || '—'}</span>
                        <span className="truncate text-sm text-[#53675c]">{bill.tableSession?.waiter?.name || '—'}</span>
                        <span className="text-sm text-[#53675c]">{itemCount} items</span>
                        <span className="text-sm font-semibold text-[#344a3e]">{money(bill.grandTotalMinor)}</span>
                        <span className="text-sm font-semibold text-[#344a3e]">
                          {bill.outstandingMinor > 0 ? `${money(bill.outstandingMinor)} due` : bill.status.replace('_', ' ').toLowerCase()}
                        </span>
                      </button>
                    );
                  })}
                </div>
                {metricBillsQ.data.matchingBillCount > metricBillsQ.data.matchingBills.length && (
                  <p className="border-t border-[#edf2ef] px-5 py-3 text-xs text-[#849188] sm:px-6">
                    Showing {metricBillsQ.data.matchingBills.length} of {metricBillsQ.data.matchingBillCount} matching bills.
                  </p>
                )}
              </>
            ) : (
              <p className="px-6 py-10 text-center text-sm text-[#849188]">There are no bills matching this summary right now.</p>
            )}
          </section>
        )}

        <section id="bills-list" className="overflow-hidden rounded-3xl border border-[#e5ede8] bg-white/90 shadow-[0_5px_18px_rgba(34,65,49,0.045)]">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e7eeea] px-5 py-4 sm:px-6">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#eaf5ee] text-[#17694f]">
                {viewMode === 'tables' ? <UtensilsCrossed className="h-5 w-5" /> : <FileText className="h-5 w-5" />}
              </span>
              <div>
              <h3 className="font-semibold text-[#40564b]">
                {viewMode === 'tables'
                  ? 'Tables and waiter orders'
                  : cashierMode ? 'Bills awaiting payment' : 'All bills'}
              </h3>
              <p className="mt-0.5 text-xs text-[#849188]">{viewMode === 'tables'
                ? `Manage tables, orders and waiter activity · ${visibleTables.length} tables`
                : `Review and manage restaurant payments · ${visibleBills.length} bills`}</p>
              </div>
            </div>
            <label className="relative block w-full sm:max-w-xs">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#96a39c]" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                aria-label={viewMode === 'tables' ? 'Search tables' : 'Search bills'}
                className="w-full rounded-xl border border-[#e1eae5] bg-[#fbfdfb] py-2 pl-9 pr-3 text-sm text-[#31483c] outline-none transition focus:border-[#8dbba3] focus:ring-2 focus:ring-[#dff1e8]"
              />
            </label>
          </div>
          {viewMode === 'tables' && tablesQ.isLoading ? (
            <div className="space-y-3 p-5" aria-label="Loading bills">
              {[1, 2, 3, 4].map((item) => <div key={item} className="min-h-[148px] rounded-2xl border border-[#e5ede8] bg-[#f8fbf9]" />)}
            </div>
          ) : viewMode === 'tables' && tablesQ.isError ? (
            <div role="alert" className="p-6 text-center">
              <p className="font-medium text-rose-800">Table status could not be loaded</p>
              <button onClick={() => void tablesQ.refetch()} className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-800">Try again</button>
            </div>
          ) : viewMode === 'tables' && visibleTables.length === 0 ? (
            <div className="px-6 py-14 text-center">
              <p className="font-medium text-[#40564b]">No tables found</p>
              <p className="mt-1 text-sm text-[#849188]">{search
                ? 'Try another search term or clear a filter.'
                : tableFilter !== 'ALL'
                  ? 'Choose another status to see more tables.'
                  : selectedArea !== 'All' ? 'Choose another area to see its tables.' : 'Tables will appear here when configured.'}</p>
            </div>
          ) : viewMode === 'tables' ? (
            <div className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2 sm:gap-4 sm:p-5 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-6 min-[1440px]:grid-cols-6">
              {visibleTables.map((table) => {
                const activeSession = table.activeSession;
                const bill = activeSession?.bill;
                const activeOrders = activeSession?.orders?.filter((order) =>
                  order.status !== 'CANCELLED' && order.status !== 'DRAFT') ?? [];
                const currentOrder = activeOrders[activeOrders.length - 1];
                const itemCount = activeOrders.flatMap((order) => order.items ?? [])
                  .filter((item) => item.status !== 'CANCELLED')
                  .reduce((total, item) => total + item.quantity, 0);
                const orderStatuses = activeOrders.map((order) => order.status);
                let display: TableDisplay;
                if (table.status === 'OUT_OF_SERVICE') {
                  display = { label: 'Out of service', className: 'bg-[#eef1ef] text-[#728079]', accent: 'border-[#dfe6e1] bg-[#fafcfb]', iconColor: 'text-[#728079]' };
                } else if (table.status === 'RESERVED') {
                  display = { label: 'Reserved', className: 'bg-[#f0eafa] text-[#7959b1]', accent: 'border-[#e5dcf3] bg-[#fdfbff]', iconColor: 'text-[#7959b1]' };
                } else if (!activeSession) {
                  display = { label: 'Available', className: 'bg-[#dcf4e6] text-[#188354]', accent: 'border-[#c8ead6] bg-[#fbfefc]', iconColor: 'text-[#278358]' };
                } else if (bill?.status === 'PAID' || bill?.status === 'CLOSED') {
                  display = { label: 'Paid · Generate bill', className: 'bg-[#dcf4e6] text-[#188354]', accent: 'border-[#c8ead6] bg-[#fbfefc]', iconColor: 'text-[#278358]' };
                } else if (orderStatuses.some((status) => status === 'READY' || status === 'SERVED')) {
                  display = { label: bill?.outstandingMinor ? 'Bill due' : 'Occupied', className: bill?.outstandingMinor ? 'bg-[#fff0cf] text-[#bc7412]' : 'bg-[#e7f0fc] text-[#2774c1]', accent: bill?.outstandingMinor ? 'border-[#f3d99d] bg-[#fffdf7]' : 'border-[#d7e6f8] bg-[#fbfdff]', iconColor: bill?.outstandingMinor ? 'text-[#bc7412]' : 'text-[#2774c1]' };
                } else if (orderStatuses.some((status) => status === 'PREPARING' || status === 'ACCEPTED')) {
                  display = { label: 'Occupied · Preparing', className: 'bg-[#e7f0fc] text-[#2774c1]', accent: 'border-[#d7e6f8] bg-[#fbfdff]', iconColor: 'text-[#2774c1]' };
                } else if (orderStatuses.includes('SUBMITTED')) {
                  display = { label: 'Occupied · Order sent', className: 'bg-[#e7f0fc] text-[#2774c1]', accent: 'border-[#d7e6f8] bg-[#fbfdff]', iconColor: 'text-[#2774c1]' };
                } else {
                  display = { label: 'Occupied · No order', className: 'bg-[#e7f0fc] text-[#2774c1]', accent: 'border-[#d7e6f8] bg-[#fbfdff]', iconColor: 'text-[#2774c1]' };
                }
                const card = (
                  <>
                    <span className="flex items-start justify-between gap-2">
                      <span>
                        <span className="text-[10px] font-medium text-[#64756c]">Table</span>
                        <span className="mt-0.5 block font-serif text-2xl font-bold tracking-tight text-[#203a30]">{table.number}</span>
                        <span className="mt-1 block max-w-[150px] truncate text-[10px] font-medium text-[#849188]">{getTableArea(table.section)}</span>
                      </span>
                      <ChevronRight className="mt-1 h-5 w-5 rounded-full bg-white/70 p-1 text-[#468568]" />
                    </span>
                    <span className={`mt-2 inline-flex h-6 max-w-full items-center truncate whitespace-nowrap rounded-full px-2.5 text-[10px] font-semibold leading-tight ${display.className}`}>{display.label}</span>
                    {activeSession && (
                      <>
                        <span className="mt-2 block truncate text-[11px] text-[#6f8077]">
                          {activeSession.customerName || 'Guest'} · {itemCount} item{itemCount === 1 ? '' : 's'}
                        </span>
                        {activeSession.waiter?.name && <span className="mt-0.5 block truncate text-[10px] text-[#8a9990]">Waiter {activeSession.waiter.name}</span>}
                        <span className="flex h-[22px] items-center" aria-label="Current kitchen stage">
                          {currentOrder && <KitchenOrderStage status={currentOrder.status} />}
                        </span>
                      </>
                    )}
                    {bill && <span className="mt-2 block text-xs font-semibold text-[#40564b]">{money(bill.outstandingMinor)} due</span>}
                    <Table2 className={`pointer-events-none absolute bottom-3 right-3 h-9 w-9 opacity-[0.13] ${display.iconColor}`} />
                  </>
                );
                const className = `relative min-h-[148px] rounded-2xl border p-4 text-left shadow-[0_2px_8px_rgba(34,65,49,0.04)] transition ${display.accent} ${
                  bill ? 'cursor-pointer hover:-translate-y-0.5 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-emerald-500' : 'cursor-default'
                }`;
                return bill ? (
                  <button key={table.id} type="button" onClick={() => openBill(bill.id)} className={className} aria-label={`Table ${table.number}, ${display.label}, ${money(bill.outstandingMinor)} due`}>
                    {card}
                  </button>
                ) : (
                  <article key={table.id} className={className}>{card}</article>
                );
              })}
            </div>
          ) : billsQ.isLoading ? (
            <div className="space-y-3 p-5" aria-label="Loading bills">
              {[1, 2, 3, 4].map((item) => <div key={item} className="h-14 animate-pulse rounded-xl bg-[#f2f7f4]" />)}
            </div>
          ) : visibleBills.length === 0 ? (
            <div className="px-6 py-14 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-[#f2f7f4] text-[#668275]">
                <FileText className="h-5 w-5" />
              </div>
              <p className="mt-4 font-medium text-[#40564b]">No bills found</p>
              <p className="mt-1 text-sm text-[#849188]">{search ? 'Try another search term.' : 'Bills will appear here when a table is opened.'}</p>
            </div>
          ) : (
            <>
              <div className="grid gap-3 p-3 xl:hidden">
                {visibleBills.map((bill) => {
                  const itemCount = (bill.tableSession?.orders ?? [])
                    .flatMap((order) => order.items ?? [])
                    .filter((item) => item.status !== 'CANCELLED')
                    .reduce((total, item) => total + item.quantity, 0);
                  return (
                    <button
                      key={bill.id}
                      type="button"
                      onClick={() => openBill(bill.id)}
                      className="min-w-0 rounded-2xl border border-[#e4ede7] p-4 text-left transition-colors hover:bg-[#fbfdfb] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#168263]"
                    >
                      <span className="flex flex-wrap items-start justify-between gap-2">
                        <span className="min-w-0">
                          <span className="block font-semibold text-[#344a3e]">{billCode(bill.billNumber)}</span>
                          <span className="mt-0.5 block break-words text-sm text-[#718178]">{bill.tableSession?.customerName || 'Walk-in'}</span>
                        </span>
                        <span className={`inline-flex whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-semibold ${statusStyles[bill.status]}`}>
                          {bill.status === 'PARTIALLY_PAID' ? 'Partially paid' : bill.status[0] + bill.status.slice(1).toLowerCase()}
                        </span>
                      </span>
                      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                        <div><dt className="text-xs text-[#849188]">Table</dt><dd className="mt-1 font-medium text-[#53675c]">{bill.tableSession?.table?.number || '—'}</dd></div>
                        <div><dt className="text-xs text-[#849188]">Waiter</dt><dd className="mt-1 break-words text-[#53675c]">{bill.tableSession?.waiter?.name || '—'}</dd></div>
                        <div><dt className="text-xs text-[#849188]">Items</dt><dd className="mt-1 text-[#53675c]">{itemCount}</dd></div>
                        <div><dt className="text-xs text-[#849188]">Total</dt><dd className="mt-1 font-semibold text-[#344a3e]">{money(bill.grandTotalMinor)}</dd></div>
                        <div><dt className="text-xs text-[#849188]">Paid</dt><dd className="mt-1 text-[#53675c]">{money(bill.amountPaidMinor)}</dd></div>
                        <div><dt className="text-xs text-[#849188]">Outstanding</dt><dd className="mt-1 font-semibold text-[#344a3e]">{money(bill.outstandingMinor)}</dd></div>
                      </dl>
                    </button>
                  );
                })}
              </div>
              <div className="hidden overflow-x-auto xl:block">
              <table className="w-full min-w-[930px] border-collapse text-left">
                <thead>
                  <tr className="border-b border-[#e7eeea] text-[11px] font-semibold uppercase tracking-[0.09em] text-[#7a8981]">
                    <th className="px-4 py-4 pl-6">Bill</th>
                    <th className="px-3 py-4">Table</th>
                    <th className="px-3 py-4">Waiter</th>
                    <th className="px-3 py-4 text-center">Items</th>
                    <th className="px-3 py-4 text-right">Subtotal</th>
                    <th className="px-3 py-4 text-right">Grand total</th>
                    <th className="px-3 py-4 text-right">Paid</th>
                    <th className="px-3 py-4 text-right">Outstanding</th>
                    <th className="px-4 py-4 pr-6">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#edf2ef]">
                  {visibleBills.map((bill) => {
                    const itemCount = (bill.tableSession?.orders ?? [])
                      .flatMap((order) => order.items ?? [])
                      .filter((item) => item.status !== 'CANCELLED')
                      .reduce((total, item) => total + item.quantity, 0);
                    return (
                      <tr
                        key={bill.id}
                        onClick={() => openBill(bill.id)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault();
                            openBill(bill.id);
                          }
                        }}
                        tabIndex={0}
                        className="cursor-pointer text-sm transition-colors hover:bg-[#fbfdfb] focus:bg-[#f2f7f4] focus:outline-none"
                      >
                        <td className="px-4 py-4 pl-6">
                          <span className="font-semibold text-[#344a3e]">{billCode(bill.billNumber)}</span>
                          <span className="mt-0.5 block max-w-32 truncate text-xs text-[#8a9990]">{bill.tableSession?.customerName || 'Walk-in'}</span>
                        </td>
                        <td className="px-3 py-4 font-medium text-[#53675c]">{bill.tableSession?.table?.number || '—'}</td>
                        <td className="max-w-32 truncate px-3 py-4 text-[#53675c]">{bill.tableSession?.waiter?.name || '—'}</td>
                        <td className="px-3 py-4 text-center text-[#53675c]">{itemCount}</td>
                        <td className="px-3 py-4 text-right text-[#53675c]">{money(bill.subtotalMinor)}</td>
                        <td className="px-3 py-4 text-right font-medium text-[#344a3e]">{money(bill.grandTotalMinor)}</td>
                        <td className="px-3 py-4 text-right text-[#53675c]">{money(bill.amountPaidMinor)}</td>
                        <td className={`px-3 py-4 text-right font-semibold ${bill.outstandingMinor ? 'text-[#344a3e]' : 'text-[#5e8170]'}`}>{money(bill.outstandingMinor)}</td>
                        <td className="px-4 py-4 pr-6">
                          <span className={`inline-flex whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-semibold ${statusStyles[bill.status]}`}>
                            {bill.status === 'PARTIALLY_PAID' ? 'Partially paid' : bill.status[0] + bill.status.slice(1).toLowerCase()}
                          </span>
                          <ArrowUpRight className="ml-1 inline h-3.5 w-3.5 text-[#8a9990]" />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              </div>
            </>
          )}
          {viewMode === 'tables' && visibleTables.length > 0 && (
            <div className="flex items-center justify-between border-t border-[#edf2ef] px-5 py-3 text-xs text-[#849188] sm:px-6">
              <span>Showing {visibleTables.length} restaurant tables</span>
              <span className="hidden sm:inline">Order and table statuses update live</span>
            </div>
          )}
          {viewMode === 'history' && visibleBills.length > 0 && (
            <div className="flex items-center justify-between border-t border-[#edf2ef] px-5 py-3 text-xs text-[#849188] sm:px-6">
              <span>Showing {visibleBills.length} of {bills.length} recent bills</span>
              <span className="hidden sm:inline">Select a bill to review or collect payment</span>
            </div>
          )}
        </section>

            {viewMode === 'tables' && (
              <div className="flex items-center justify-center gap-2 pb-1 text-xs text-[#91a097]">
                <RefreshCw className="h-3.5 w-3.5" />
                Table status syncs automatically
              </div>
            )}

          </main>
          </div>
    </div>
  );
}
