import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { Check, ChefHat, Clock3, LogOut, RefreshCw, UtensilsCrossed, X } from 'lucide-react';
import { get, patch } from '../../lib/api';
import { getDashboardPath, useAuth, type UserRole } from '../../lib/auth';
import { getSocket } from '../../lib/socket';
import { getMenuImageUrl } from '../../lib/menuImages';
import { getOrderItemCustomizations } from '../../lib/orderItemCustomizations';
import MenuCategoryTabs, { type MenuCategory } from '../../components/MenuCategoryTabs';

type OrderStatus = 'SUBMITTED' | 'ACCEPTED' | 'PREPARING' | 'READY' | 'SERVED' | 'CANCELLED';

interface KitchenItem {
  id: string;
  itemName: string;
  quantity: number;
  status: string;
  modifiers?: unknown;
  seatNumber?: string | null;
  notes?: string | null;
}

interface KitchenOrder {
  id: string;
  orderNumber: number;
  status: OrderStatus;
  submittedAt?: string | null;
  createdAt: string;
  tableSession?: {
    customerName?: string | null;
    table?: { number: string };
  };
  items: KitchenItem[];
}

interface MenuItem {
  id: string;
  name: string;
  imageUrl?: string | null;
  available: boolean;
  soldOut: boolean;
  soldQuantity?: number;
  category?: { id: string; name: string } | null;
}

interface MenuCategoriesResponse {
  categories: MenuCategory[];
}

interface FeedEvent {
  id: string;
  orderId: string;
  status: string;
  kind: 'new' | 'status';
  createdAt: string;
}

interface KitchenPayload {
  orderId?: string;
  status?: string;
  order?: { id?: string; status?: string };
}

const emptyOrders: KitchenOrder[] = [];
const emptyMenuItems: MenuItem[] = [];

const orderStatus: Record<OrderStatus, { label: string; style: string; border: string }> = {
  SUBMITTED: { label: 'Submitted', style: 'bg-[#e8eff7] text-[#4b6787]', border: 'border-[#7897bc]' },
  ACCEPTED: { label: 'Accepted', style: 'bg-[#eeeafa] text-[#65588f]', border: 'border-[#8675b5]' },
  PREPARING: { label: 'Preparing', style: 'bg-[#fff0d8] text-[#926b28]', border: 'border-[#d39a36]' },
  READY: { label: 'Ready', style: 'bg-[#e3f3ea] text-[#317757]', border: 'border-[#398568]' },
  SERVED: { label: 'Served', style: 'bg-[#edf0ee] text-[#66736b]', border: 'border-[#aab4ad]' },
  CANCELLED: { label: 'Cancelled', style: 'bg-[#f9e8e6] text-[#a35149]', border: 'border-[#c87d74]' },
};

const statusActions: { value: OrderStatus; label: string }[] = [
  { value: 'ACCEPTED', label: 'Accept' },
  { value: 'PREPARING', label: 'Preparing' },
  { value: 'READY', label: 'Ready' },
  { value: 'SERVED', label: 'Served' },
];

const friendlyError = (error: unknown) => {
  if (axios.isAxiosError<{ error?: string; message?: string }>(error)) {
    return error.response?.data?.error || error.response?.data?.message || 'The request could not be completed.';
  }
  return error instanceof Error ? error.message : 'The request could not be completed.';
};

const shortTable = (number?: string) => number ? `T${number.replace(/^0+(?=\d)/, '')}` : 'Table';
const timeAgo = (value?: string | null) => {
  if (!value) return 'just now';
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 60_000));
  return minutes === 0 ? '0 min ago' : `${minutes} min ago`;
};

export default function Kitchen() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const dashboardPath = getDashboardPath(user?.role);
  const [isOnline, setIsOnline] = useState(() => navigator.onLine);
  const [pendingOrder, setPendingOrder] = useState<string | null>(null);
  const [pendingMenuItem, setPendingMenuItem] = useState<string | null>(null);
  const [selectedMenuCategory, setSelectedMenuCategory] = useState('All');
  const [showAllMenuItems, setShowAllMenuItems] = useState(false);
  const [readyOrderId, setReadyOrderId] = useState<string | null>(null);
  const [feed, setFeed] = useState<FeedEvent[]>([]);
  const [error, setError] = useState('');
  const settingsQuery = useQuery<{ settings?: { name?: string } }>({
    queryKey: ['settings'],
    queryFn: () => get('/settings'),
  });

  const ordersQuery = useQuery<{ orders: KitchenOrder[] }>({
    queryKey: ['kitchen-orders'],
    queryFn: () => get('/kitchen/orders'),
    refetchInterval: 5_000,
  });
  const menuQuery = useQuery<{ items: MenuItem[] }>({
    queryKey: ['menu-items', 'kitchen-popular'],
    queryFn: () => get('/menu/items', { sort: 'popular' }),
    refetchInterval: 30_000,
  });
  const menuCategoriesQuery = useQuery<MenuCategoriesResponse>({
    queryKey: ['categories'],
    queryFn: () => get('/menu/categories'),
  });

  const orders = ordersQuery.data?.orders ?? emptyOrders;
  const menuItems = menuQuery.data?.items ?? emptyMenuItems;
  const menuCategories = menuCategoriesQuery.data?.categories.filter((category) => category.active !== false) ?? [];
  const categoryMenuItems = useMemo(
    () => selectedMenuCategory === 'All'
      ? menuItems
      : menuItems.filter((item) => item.category?.name === selectedMenuCategory),
    [menuItems, selectedMenuCategory],
  );
  const visibleMenuItems = useMemo(
    () => showAllMenuItems ? categoryMenuItems : categoryMenuItems.slice(0, 12),
    [categoryMenuItems, showAllMenuItems],
  );
  const counts = useMemo(() => ({
    SUBMITTED: orders.filter((order) => order.status === 'SUBMITTED').length,
    ACCEPTED: orders.filter((order) => order.status === 'ACCEPTED').length,
    PREPARING: orders.filter((order) => order.status === 'PREPARING').length,
    READY: orders.filter((order) => order.status === 'READY').length,
  }), [orders]);
  const readyOrder = orders.find((order) => order.id === readyOrderId);
  const liveFeed = useMemo(() => {
    if (feed.length) return feed;
    return [...orders].reverse().slice(0, 8).map((order) => ({
      id: `initial-${order.id}`,
      orderId: order.id,
      status: order.status,
      kind: order.status === 'SUBMITTED' ? 'new' as const : 'status' as const,
      createdAt: order.submittedAt || order.createdAt,
    }));
  }, [feed, orders]);

  useEffect(() => {
    const socket = getSocket();
    const refresh = () => { void queryClient.invalidateQueries({ queryKey: ['kitchen-orders'] }); };
    const refreshMenu = () => { void queryClient.invalidateQueries({ queryKey: ['menu-items', 'kitchen-popular'] }); };
    const appendEvent = (payload: KitchenPayload, kind: FeedEvent['kind']) => {
      const orderId = payload.order?.id || payload.orderId;
      if (!orderId) return;
      const status = payload.status || payload.order?.status || (kind === 'new' ? 'SUBMITTED' : 'UPDATED');
      setFeed((previous) => {
        const recentDuplicate = previous.some((event) =>
          event.orderId === orderId
          && event.status === status
          && Date.now() - new Date(event.createdAt).getTime() < 1_500);
        if (recentDuplicate) return previous;
        return [{
          id: `${orderId}-${status}-${Date.now()}`,
          orderId,
          status,
          kind,
          createdAt: new Date().toISOString(),
        }, ...previous].slice(0, 20);
      });
      if (status === 'READY') setReadyOrderId(orderId);
      refresh();
    };
    const onNewOrder = (payload: KitchenPayload) => appendEvent(payload, 'new');
    const onStatus = (payload: KitchenPayload) => appendEvent(payload, 'status');
    const onReady = (payload: KitchenPayload) => {
      const orderId = payload.order?.id || payload.orderId;
      if (orderId) setReadyOrderId(orderId);
      refresh();
    };
    const updateOnline = () => setIsOnline(navigator.onLine);

    socket.on('kitchen:order-received', onNewOrder);
    socket.on('kitchen:status-changed', onStatus);
    socket.on('kitchen:order-ready', onReady);
    socket.on('order:items-updated', refresh);
    socket.on('order:item-cancelled', refresh);
    socket.on('menu:item-availability-updated', refreshMenu);
    socket.on('menu:item-updated', refreshMenu);
    window.addEventListener('online', updateOnline);
    window.addEventListener('offline', updateOnline);
    return () => {
      socket.off('kitchen:order-received', onNewOrder);
      socket.off('kitchen:status-changed', onStatus);
      socket.off('kitchen:order-ready', onReady);
      socket.off('order:items-updated', refresh);
      socket.off('order:item-cancelled', refresh);
      socket.off('menu:item-availability-updated', refreshMenu);
      socket.off('menu:item-updated', refreshMenu);
      window.removeEventListener('online', updateOnline);
      window.removeEventListener('offline', updateOnline);
    };
  }, [queryClient]);

  const updateStatus = async (order: KitchenOrder, status: OrderStatus) => {
    setPendingOrder(order.id);
    setError('');
    try {
      await patch(`/kitchen/orders/${order.id}/status`, { status });
      if (status === 'READY') setReadyOrderId(order.id);
      await queryClient.invalidateQueries({ queryKey: ['kitchen-orders'] });
    } catch (requestError: unknown) {
      setError(friendlyError(requestError));
    } finally {
      setPendingOrder(null);
    }
  };

  const toggleAvailability = async (item: MenuItem) => {
    setPendingMenuItem(item.id);
    setError('');
    try {
      await patch(`/menu/items/${item.id}/availability`, { isAvailable: !(item.available && !item.soldOut) });
      await queryClient.invalidateQueries({ queryKey: ['menu-items'] });
    } catch (requestError: unknown) {
      setError(friendlyError(requestError));
    } finally {
      setPendingMenuItem(null);
    }
  };

  const handleLogout = async () => {
    try {
      await logout();
    } catch (logoutError: unknown) {
      setError(friendlyError(logoutError));
    } finally {
      navigate('/login', { replace: true });
    }
  };

  const canAccess = (role: UserRole, destination: 'waiter' | 'biller') => role === 'ADMIN' || (destination === 'waiter' && role === 'WAITER');

  return (
    <div className="relative isolate min-h-screen overflow-hidden bg-[#f2f8f4] text-[#183c32]">
      <div className="pointer-events-none absolute inset-0 -z-10 opacity-50" aria-hidden="true">
        <div className="absolute -left-10 -top-8 h-56 w-48 rounded-full bg-[radial-gradient(ellipse_at_top_left,#a6d2b7_0%,#e5f1e7_45%,transparent_72%)]" />
        <div className="absolute -right-10 top-20 h-64 w-48 rounded-full bg-[radial-gradient(ellipse_at_top_right,#b2d9bd_0%,#eaf3e8_50%,transparent_74%)]" />
        <div className="absolute -bottom-20 -left-8 h-72 w-64 rounded-full bg-[radial-gradient(ellipse_at_bottom_left,#d9eadb_0%,#e9f2e9_53%,transparent_74%)]" />
        <div className="absolute -bottom-16 -right-8 h-72 w-64 rounded-full bg-[radial-gradient(ellipse_at_bottom_right,#cfe6d3_0%,#e8f1e8_53%,transparent_74%)]" />
      </div>
      <header className="sticky top-0 z-20 border-b border-[#dce9e1] bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-[58px] max-w-[1600px] items-center justify-between gap-3 px-4 sm:px-7 lg:px-8">
          <Link to={dashboardPath} aria-label="Dashboard" className="flex min-w-0 items-center gap-2.5 text-sm font-semibold tracking-tight text-[#17483b] sm:text-base">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#07856c] text-white"><ChefHat className="h-5 w-5" /></span>
            <span className="truncate">{settingsQuery.data?.settings?.name || 'Restaurant POS'}</span>
          </Link>
          <nav aria-label="Staff dashboards" className="flex items-center gap-2 sm:gap-3">
            {user && canAccess(user.role, 'waiter') && <Link to="/waiter" className="hidden rounded-full px-3 py-2 text-xs font-medium text-[#5e796c] hover:bg-[#f2f7f4] sm:inline-flex">Waiter</Link>}
            {user && canAccess(user.role, 'biller') && <Link to="/biller" className="hidden rounded-full px-3 py-2 text-xs font-medium text-[#5e796c] hover:bg-[#f2f7f4] sm:inline-flex">Biller</Link>}
            <span className="rounded-xl bg-[#07856c] px-4 py-2 text-xs font-semibold text-white shadow-sm">Kitchen</span>
            <button onClick={() => void handleLogout()} aria-label={`Log out ${user?.name || ''}`} title="Log out" className="inline-flex items-center gap-1.5 rounded-full px-2 py-2 text-xs text-[#6b8c7d] hover:bg-[#f2f7f4] sm:px-3">
              <LogOut className="h-4 w-4" /><span className="hidden sm:inline">Log out</span>
            </button>
          </nav>
        </div>
      </header>

      <main className="relative z-10 mx-auto max-w-[1600px] space-y-3 px-4 pb-8 pt-4 sm:px-7 sm:pt-5 lg:px-8">

        {readyOrderId && (
          <section role="status" className="flex items-center justify-between gap-3 rounded-xl border border-[#b8e0cb] bg-[#e4f4eb] px-4 py-3 text-xs text-[#286c51]">
            <span className="font-semibold">
              Ready for pickup: #{readyOrder?.orderNumber ?? '—'} · {shortTable(readyOrder?.tableSession?.table?.number)}
              {readyOrder ? ` · Batch ${readyOrder.orderNumber}` : ''}
            </span>
            <button onClick={() => setReadyOrderId(null)} className="rounded-md border border-[#cce5d7] px-2 py-1 font-medium hover:bg-white/70">Dismiss</button>
          </section>
        )}

        {error && (
          <div role="alert" className="flex items-center justify-between gap-3 rounded-xl border border-rose-200 bg-white px-4 py-3 text-xs text-rose-800">
            <span>{error}</span><button onClick={() => setError('')} className="font-semibold">Dismiss</button>
          </div>
        )}
        {ordersQuery.isError && (
          <div role="alert" className="flex items-center justify-between gap-3 rounded-xl border border-rose-200 bg-white px-4 py-3 text-xs text-rose-800">
            <span>Kitchen orders could not be loaded.</span>
            <button onClick={() => void ordersQuery.refetch()} className="font-semibold">Retry</button>
          </div>
        )}

        <div className="grid items-start gap-5 min-[900px]:grid-cols-[minmax(0,1fr)_minmax(300px,355px)]">
          <section aria-label="Active kitchen orders" className="min-w-0">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h1 className="flex items-center gap-2 font-serif text-2xl font-semibold tracking-tight text-[#164c3e] sm:text-3xl">
                  <ChefHat className="h-8 w-8 text-[#07856c]" /> Kitchen
                </h1>
                <p className="mt-1 flex items-center gap-2 text-xs text-[#6b8b7c]">
                  <span className={`h-2 w-2 rounded-full ${isOnline ? 'bg-[#1bb479] animate-pulse' : 'bg-amber-500'}`} />
                  {isOnline ? 'Live · refreshes every 5s' : 'Offline · waiting for connection'}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-1.5" aria-label="Order status counts">
                {(['SUBMITTED', 'ACCEPTED', 'PREPARING', 'READY'] as const).map((status) => (
                  <span key={status} className={`inline-flex items-center gap-2 rounded-full px-3 py-2 text-[10px] font-semibold sm:text-xs ${orderStatus[status].style}`}>
                    {orderStatus[status].label}
                    <span className="rounded-full bg-white/70 px-1.5 py-0.5">{counts[status]}</span>
                  </span>
                ))}
                <button onClick={() => void ordersQuery.refetch()} disabled={ordersQuery.isFetching} aria-label="Refresh kitchen orders" className="ml-1 inline-flex h-9 w-9 items-center justify-center rounded-full border border-[#e0ebe4] bg-white text-[#477361] shadow-sm disabled:opacity-50">
                  <RefreshCw className={`h-4 w-4 ${ordersQuery.isFetching ? 'animate-spin' : ''}`} />
                </button>
              </div>
            </div>
            {ordersQuery.isLoading ? (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {[1, 2, 3].map((item) => <div key={item} className="h-[295px] animate-pulse rounded-2xl border border-[#d9e9df] bg-white" />)}
              </div>
            ) : orders.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-[#cfe4d7] bg-white/90 p-10 text-center shadow-sm">
                <ChefHat className="mx-auto h-8 w-8 text-[#6e9d83]" />
                <p className="mt-2 text-base font-semibold text-[#355d49]">No active tickets</p>
                <p className="mt-1 text-sm text-[#7e9587]">Submitted orders will appear here automatically.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {orders.map((order) => {
                  const status = orderStatus[order.status];
                  const timestamp = order.submittedAt || order.createdAt;
                  const activeItems = order.items.filter((item) => item.status !== 'CANCELLED');
                  const availableActions = order.status === 'SUBMITTED'
                    ? statusActions
                    : order.status === 'ACCEPTED'
                      ? statusActions.filter((action) => action.value === 'PREPARING' || action.value === 'READY')
                      : order.status === 'PREPARING'
                        ? statusActions.filter((action) => action.value === 'READY' || action.value === 'SERVED')
                        : order.status === 'READY'
                          ? statusActions.filter((action) => action.value === 'SERVED')
                          : [];
                  return (
                    <article key={order.id} className={`rounded-2xl border ${status.border} bg-white/95 p-4 shadow-[0_4px_14px_rgba(25,74,52,0.055)] sm:p-5`}>
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <h2 className="font-serif text-2xl font-semibold leading-none text-[#153f34]">{shortTable(order.tableSession?.table?.number)}</h2>
                          <p className="mt-1 text-[11px] text-[#789184]">Order #{order.orderNumber} · Batch {order.orderNumber}</p>
                        </div>
                        <span className={`rounded-full px-3 py-1.5 text-[10px] font-semibold sm:text-xs ${status.style}`}>{status.label}</span>
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] text-[#71877a] sm:text-[11px]">
                        <span className="inline-flex items-center gap-1.5"><Clock3 className="h-3.5 w-3.5" />{new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                        <span>· {timeAgo(timestamp)}</span>
                      </div>
                      <ul className="mt-3 space-y-1">
                        {activeItems.map((item) => {
                          const menuItem = menuItems.find((entry) => entry.name.toLowerCase() === item.itemName.toLowerCase());
                          return (
                          <li key={item.id} className="flex items-center gap-2.5 border-b border-[#edf3ef] px-0.5 py-1.5 last:border-b-0">
                            {getMenuImageUrl(item.itemName, menuItem?.imageUrl) ? (
                              <img src={getMenuImageUrl(item.itemName, menuItem?.imageUrl)!} alt="" className="h-9 w-9 shrink-0 rounded-lg object-cover shadow-sm" />
                            ) : (
                              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-[#f4e7c8] to-[#d9ad72] text-[#79522b] shadow-sm"><UtensilsCrossed className="h-4 w-4" /></span>
                            )}
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-[11px] font-semibold text-[#38564a] sm:text-xs">{item.itemName}</span>
                              <span className="mt-0.5 block truncate text-[9px] text-[#83978b]">{item.seatNumber ? `Seat ${item.seatNumber}` : 'Whole table'}</span>
                              {getOrderItemCustomizations(item.modifiers, item.notes).map((detail) => (
                                <span key={detail} className="mt-1 block rounded bg-[#fff2d8] px-1.5 py-0.5 text-[9px] text-[#8a6b25]">{detail}</span>
                              ))}
                            </span>
                            <span className="flex h-6 min-w-6 shrink-0 items-center justify-center rounded-md bg-[#eff6f2] px-1.5 text-[10px] font-semibold text-[#42745d]">{item.quantity}</span>
                          </li>
                          );
                        })}
                      </ul>
                      <div className="mt-3 grid grid-cols-2 gap-1.5">
                        {availableActions.map((action, index) => {
                          const primary = index === 0;
                          const Icon = action.value === 'ACCEPTED' ? Check : action.value === 'PREPARING' ? ChefHat : action.value === 'READY' ? Check : UtensilsCrossed;
                          return (
                            <button
                              key={action.value}
                              onClick={() => void updateStatus(order, action.value)}
                              disabled={pendingOrder === order.id}
                              className={`inline-flex items-center justify-center gap-1.5 rounded-xl border px-2 py-2 text-[10px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60 sm:text-[11px] ${primary ? 'border-[#07856c] bg-[#07856c] text-white hover:bg-[#06745e]' : 'border-[#d6e9df] bg-[#fbfefc] text-[#168263] hover:bg-[#eff8f2]'}`}
                            >
                              {pendingOrder === order.id && primary ? 'Saving…' : <><Icon className="h-3.5 w-3.5" />{action.label}</>}
                            </button>
                          );
                        })}
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>

          <aside className="flex min-w-0 flex-col gap-4">
            <section aria-label="86 board" className="rounded-2xl border border-[#dce9e1] bg-white/95 p-4 shadow-[0_4px_16px_rgba(25,74,52,0.05)] sm:p-5">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h2 className="font-serif text-lg font-semibold text-[#164c3e]">86 board</h2>
                  <p className="mt-1 text-[11px] leading-relaxed text-[#799184]">Tap an item to flip it. Waiters see its availability straight away.</p>
                </div>
                <span className="rounded-full bg-[#e8f5ed] px-2.5 py-1 text-[10px] font-semibold text-[#22845b]">{menuItems.filter((item) => item.available && !item.soldOut).length} available</span>
              </div>
              {menuQuery.isError ? (
                <div className="mt-3 flex items-center justify-between rounded-xl bg-rose-50 p-3 text-xs text-rose-700">
                  Menu unavailable <button onClick={() => void menuQuery.refetch()} className="font-semibold">Retry</button>
                </div>
              ) : (
                <>
                  <div className="mt-3">
                    <MenuCategoryTabs
                      categories={menuCategories}
                      value={selectedMenuCategory}
                      onChange={(category) => {
                        setSelectedMenuCategory(category);
                        setShowAllMenuItems(false);
                      }}
                      label="Filter kitchen items by category"
                    />
                  </div>
                  <div className="mb-2 mt-2 flex items-center justify-between gap-2">
                    <p className="text-[9px] font-medium uppercase tracking-[0.07em] text-[#83978b]">
                      {showAllMenuItems ? 'All items' : selectedMenuCategory === 'All' ? 'Top 12 best-selling items' : `Top 12 in ${selectedMenuCategory}`}
                    </p>
                    {categoryMenuItems.length > 12 && (
                      <button
                        type="button"
                        aria-expanded={showAllMenuItems}
                        onClick={() => setShowAllMenuItems((showAll) => !showAll)}
                        className="shrink-0 rounded-full border border-[#dce8e1] bg-white px-2.5 py-1 text-[10px] font-semibold text-[#267b67] hover:bg-[#f5faf6]"
                      >
                        {showAllMenuItems ? 'Show top 12' : `See all ${categoryMenuItems.length}`}
                      </button>
                    )}
                  </div>
                  {menuQuery.isLoading ? (
                    <div className="grid grid-cols-2 gap-1.5" aria-label="Loading menu items">
                      {Array.from({ length: 6 }, (_, index) => (
                        <div key={index} className="h-[72px] animate-pulse rounded-xl border border-[#dcebe2] bg-[#fbfefc]" />
                      ))}
                    </div>
                  ) : visibleMenuItems.length === 0 ? (
                    <p className="rounded-xl border border-dashed border-[#dcebe2] p-4 text-center text-[11px] text-[#799184]">
                      No menu items in this category.
                    </p>
                  ) : (
                    <div className="grid grid-cols-2 gap-1.5">
                  {visibleMenuItems.map((item) => {
                    const available = item.available && !item.soldOut;
                    return (
                      <button
                        key={item.id}
                        onClick={() => void toggleAvailability(item)}
                        disabled={pendingMenuItem === item.id || menuQuery.isLoading}
                        className={`min-h-[52px] rounded-xl border px-2.5 py-2 text-left transition-colors disabled:cursor-wait disabled:opacity-60 ${available ? 'border-[#dcebe2] bg-[#fbfefc] hover:border-[#b8d9c5] hover:bg-[#f0f8f3]' : 'border-[#f4d4ce] bg-[#fff5f3] hover:bg-[#fcebe8]'}`}
                      >
                        {getMenuImageUrl(item.name, item.imageUrl) && <img src={getMenuImageUrl(item.name, item.imageUrl)!} alt="" loading="lazy" className="mb-2 h-14 w-full rounded-lg object-cover" />}
                        <span className="block line-clamp-2 text-[10px] font-semibold leading-tight text-[#365447]">{item.name}</span>
                        <span className={`mt-1 inline-flex items-center gap-1 text-[9px] font-medium ${available ? 'text-[#368263]' : 'text-[#a3483f]'}`}>
                          {available ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
                          {pendingMenuItem === item.id ? 'Saving…' : available ? 'Available' : 'Sold out'}
                        </span>
                      </button>
                    );
                  })}
                    </div>
                  )}
                </>
              )}
            </section>

            <section aria-label="Live feed" className="rounded-2xl border border-[#dce9e1] bg-white/95 p-4 shadow-[0_4px_16px_rgba(25,74,52,0.05)]">
              <h2 className="font-serif text-base font-semibold text-[#164c3e]">Live feed</h2>
              <ul className="mt-3 space-y-2">
                {liveFeed.length === 0 ? (
                  <li className="py-2 text-xs text-[#818b84]">Updates will appear here as tickets move.</li>
                ) : liveFeed.slice(0, 8).map((event) => {
                  const eventOrder = orders.find((order) => order.id === event.orderId);
                  return (
                    <li key={event.id} className="border-b border-[#edf3ef] pb-2 text-[10px] leading-snug text-[#6e7972] last:border-0 last:pb-0">
                      <span className="text-[#929a94]">{new Date(event.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      <span> · </span>
                      <span className="font-medium text-[#4d5b52]">#{eventOrder?.orderNumber ?? event.orderId.slice(-4)} · {shortTable(eventOrder?.tableSession?.table?.number)}</span>
                      <span> {event.kind === 'new' ? 'New order' : `→ ${event.status.toLowerCase()}`}</span>
                    </li>
                  );
                })}
              </ul>
            </section>
          </aside>
        </div>
      </main>
    </div>
  );
}
