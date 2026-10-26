import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useNavigate, Link, useLocation } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { ArrowLeft, CircleAlert, Clock3, Info, LoaderCircle, Plus, RefreshCw, Search, SlidersHorizontal, UtensilsCrossed, Wifi, WifiOff } from 'lucide-react';
import { get, patch, post } from '../../lib/api';
import { getDashboardPath, useAuth } from '../../lib/auth';
import { getSocket } from '../../lib/socket';
import { getMenuImageUrl } from '../../lib/menuImages';
import { getOrderItemCustomizations } from '../../lib/orderItemCustomizations';
import WaiterProfileFooter from '../../components/WaiterProfileFooter';
import MenuCategoryTabs, { type MenuCategory } from '../../components/MenuCategoryTabs';

interface ModifierOption {
  id: string;
  name: string;
  priceMinor: number;
}

interface ModifierGroup {
  id: string;
  name: string;
  options: ModifierOption[];
}

interface MenuItem {
  id: string;
  name: string;
  priceMinor: number;
  discountPercent?: number;
  soldQuantity?: number;
  imageUrl?: string | null;
  available: boolean;
  soldOut: boolean;
  category?: { id: string; name: string } | null;
  modifierGroups?: ModifierGroup[];
}

interface OrderItem {
  id: string;
  menuItemId?: string | null;
  itemName: string;
  quantity: number;
  unitPriceMinor: number;
  status: string;
  modifiers?: unknown;
  seatNumber?: string | null;
  notes?: string | null;
}

interface TableOrder {
  id: string;
  orderNumber: number;
  status: string;
  createdAt: string;
  submittedAt?: string | null;
  items: OrderItem[];
}

interface TableSession {
  id: string;
  customerName?: string | null;
  partySize: number;
  openedAt: string;
  status: string;
  table?: { number: string; section?: string | null; capacity: number };
  waiter?: { name: string };
  orders: TableOrder[];
  bill?: {
    status: string;
    subtotalMinor: number;
    taxMinor: number;
    serviceChargeMinor: number;
    grandTotalMinor: number;
    outstandingMinor: number;
  } | null;
}

interface Settings {
  settings?: {
    name?: string;
    currency?: string;
    taxRateBps?: number;
    serviceChargeBps?: number;
  };
}

interface MenuCategoriesResponse {
  categories: MenuCategory[];
}

interface ModifierSelection {
  groupId: string;
  optionId: string;
}

const emptyMenuItems: MenuItem[] = [];
const emptyOrders: TableOrder[] = [];
const waiterEditWindowMs = 5 * 60 * 1000;
const normalizedText = (value?: string | null) => value?.trim() || '';
const modifierKey = (value: unknown) => {
  if (!Array.isArray(value)) return '';
  return value.flatMap((modifier) => {
    if (!modifier || typeof modifier !== 'object') return [];
    const selection = modifier as { groupId?: unknown; optionId?: unknown };
    if (typeof selection.optionId !== 'string') return [];
    return [`${typeof selection.groupId === 'string' ? selection.groupId : ''}:${selection.optionId}`];
  }).sort().join('|');
};
const matchesOrderItem = (
  orderItem: OrderItem,
  item: MenuItem,
  payload: { modifiers: ModifierSelection[]; notes?: string; seatNumber?: string },
  unitPriceMinor: number,
) => (orderItem.menuItemId ? orderItem.menuItemId === item.id : orderItem.itemName === item.name)
  && orderItem.unitPriceMinor === unitPriceMinor
  && normalizedText(orderItem.notes) === normalizedText(payload.notes)
  && normalizedText(orderItem.seatNumber) === normalizedText(payload.seatNumber)
  && modifierKey(orderItem.modifiers) === modifierKey(payload.modifiers);

const money = (minor: number, currency = 'NPR') =>
  `${currency} ${(minor / 100).toLocaleString('en-NP', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const isInsideWaiterEditWindow = (order: TableOrder, now: number) =>
  order.status !== 'DRAFT'
  && ['SUBMITTED', 'ACCEPTED'].includes(order.status)
  && Boolean(order.submittedAt)
  && now - new Date(order.submittedAt!).getTime() < waiterEditWindowMs;

const elapsed = (value: string) => {
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 60_000));
  if (minutes < 1) return 'just opened';
  if (minutes < 60) return `opened ${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `opened ${hours}h${remainingMinutes ? ` ${remainingMinutes}m` : ''} ago`;
};

const errorMessage = (error: unknown) => {
  if (axios.isAxiosError<{ error?: string; message?: string }>(error)) {
    return error.response?.data?.error || error.response?.data?.message || 'The request could not be completed.';
  }
  return error instanceof Error ? error.message : 'The request could not be completed.';
};

export default function WaiterOrder() {
  const { sessionId } = useParams();
  const location = useLocation();
  const nav = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const dashboardPath = getDashboardPath(user?.role);
  const returnTo = (location.state as { returnTo?: string } | null)?.returnTo;
  const floorPath = returnTo?.startsWith('/waiter?') ? returnTo : '/waiter';
  const creationAttempt = useRef<string | null>(null);
  const [activeOrderId, setActiveOrderId] = useState<string | null>(null);
  const [selectedItem, setSelectedItem] = useState<MenuItem | null>(null);
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [menuSearch, setMenuSearch] = useState('');
  const [showAllMenuItems, setShowAllMenuItems] = useState(false);
  const [qty, setQty] = useState(1);
  const [notes, setNotes] = useState('');
  const [modifiers, setModifiers] = useState<ModifierSelection[]>([]);
  const [soldOutIds, setSoldOutIds] = useState<Set<string>>(new Set());
  const [isOffline, setIsOffline] = useState(() => !navigator.onLine);
  const [busy, setBusy] = useState<'submit' | 'add' | null>(null);
  const [pendingItems, setPendingItems] = useState<Set<string>>(() => new Set());
  const [actionError, setActionError] = useState('');
  const [actionMessage, setActionMessage] = useState('');
  const [clockNow, setClockNow] = useState(() => Date.now());

  const sessionQ = useQuery<{ session: TableSession }>({
    queryKey: ['session', sessionId],
    queryFn: () => get(`/table-sessions/${sessionId}`),
    enabled: Boolean(sessionId),
    refetchInterval: 30_000,
    refetchOnWindowFocus: false,
  });
  const menuQ = useQuery<{ items: MenuItem[] }>({
    queryKey: ['menu-items', 'popular'],
    queryFn: () => get('/menu/items', { sort: 'popular' }),
  });
  const categoriesQ = useQuery<MenuCategoriesResponse>({
    queryKey: ['categories'],
    queryFn: () => get('/menu/categories'),
  });
  const settingsQ = useQuery<Settings>({
    queryKey: ['settings'],
    queryFn: () => get('/settings'),
  });

  const session = sessionQ.data?.session;
  const refetchSession = sessionQ.refetch;
  const menuItems = menuQ.data?.items ?? emptyMenuItems;
  const currency = settingsQ.data?.settings?.currency || 'NPR';
  const categories = categoriesQ.data?.categories.filter((category) => category.active !== false) ?? [];
  const categoryItems = useMemo(
    () => menuItems.filter((item) => selectedCategory === 'All' || item.category?.name === selectedCategory),
    [menuItems, selectedCategory],
  );
  const searchedItems = useMemo(() => {
    const search = menuSearch.trim().toLocaleLowerCase();
    if (!search) return categoryItems;
    return categoryItems.filter((item) => item.name.toLocaleLowerCase().includes(search));
  }, [categoryItems, menuSearch]);
  const visibleItems = useMemo(
    () => (menuSearch.trim() || showAllMenuItems ? searchedItems : searchedItems.slice(0, 10)),
    [menuSearch, searchedItems, showAllMenuItems],
  );
  const orders = session?.orders ?? emptyOrders;
  const draftOrder = [...orders].reverse().find((order) => order.status === 'DRAFT');
  const editableSubmittedOrder = [...orders].reverse().find((order) => isInsideWaiterEditWindow(order, clockNow));
  const selectedOrder = orders.find((order) => order.id === activeOrderId);
  const activeOrder = selectedOrder && (selectedOrder.status === 'DRAFT' || isInsideWaiterEditWindow(selectedOrder, clockNow))
    ? selectedOrder
    : draftOrder ?? editableSubmittedOrder;
  const canEditActiveOrder = Boolean(activeOrder && (
    activeOrder.status === 'DRAFT' || isInsideWaiterEditWindow(activeOrder, clockNow)
  ));
  const editSecondsLeft = activeOrder?.submittedAt
    ? Math.max(0, Math.ceil((new Date(activeOrder.submittedAt).getTime() + waiterEditWindowMs - clockNow) / 1000))
    : 0;
  const totalMinor = orders.reduce((sum, order) => {
    if (order.status === 'CANCELLED') return sum;
    return sum + order.items.reduce((orderSum, item) =>
      item.status === 'CANCELLED' ? orderSum : orderSum + item.unitPriceMinor * item.quantity, 0);
  }, 0);
  const serviceMinor = Math.round(totalMinor * (settingsQ.data?.settings?.serviceChargeBps ?? 0) / 10_000);
  const taxMinor = Math.round((totalMinor + serviceMinor) * (settingsQ.data?.settings?.taxRateBps ?? 0) / 10_000);
  const grandTotalMinor = totalMinor + serviceMinor + taxMinor;
  const activeItems = activeOrder?.items.filter((item) => item.status !== 'CANCELLED') ?? [];
  const activeItemCount = activeItems.reduce((count, item) => count + item.quantity, 0);

  useEffect(() => {
    if (!session || !sessionId) return;
    const nextOrder = [...session.orders].reverse().find((order) => order.status === 'DRAFT')
      ?? [...session.orders].reverse().find((order) => isInsideWaiterEditWindow(order, clockNow));
    if (nextOrder) {
      if (activeOrderId !== nextOrder.id) setActiveOrderId(nextOrder.id);
      return;
    }
    if (activeOrderId) {
      setActiveOrderId(null);
      return;
    }
    if (creationAttempt.current === sessionId) return;

    creationAttempt.current = sessionId;
    post<{ order: { id: string } }>('/orders', { tableSessionId: sessionId })
      .then(async (response) => {
        setActiveOrderId(response.order.id);
        await refetchSession();
        creationAttempt.current = null;
      })
      .catch((error: unknown) => {
        creationAttempt.current = null;
        setActionError(errorMessage(error));
      });
  }, [session, sessionId, activeOrderId, refetchSession, clockNow]);

  useEffect(() => {
    if (!activeOrder?.submittedAt || activeOrder.status === 'DRAFT') return;
    const timer = window.setInterval(() => setClockNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [activeOrder?.id, activeOrder?.status, activeOrder?.submittedAt]);

  useEffect(() => {
    const updateNetwork = () => setIsOffline(!navigator.onLine);
    const socket = getSocket();
    const onConnect = () => {
      setIsOffline(false);
      void refetchSession();
    };
    const onDisconnect = () => setIsOffline(true);
    const refresh = (payload?: { orderId?: string; tableSessionId?: string; actorId?: string }) => {
      if (payload?.tableSessionId || payload?.orderId) {
        void queryClient.invalidateQueries({ queryKey: ['menu-items', 'popular'] });
      }
      if (payload?.actorId && payload.actorId === user?.id) return;
      const currentSession = queryClient.getQueryData<{ session: TableSession }>(['session', sessionId])?.session;
      const belongsToSession = payload?.tableSessionId === sessionId
        || Boolean(payload?.orderId && currentSession?.orders.some((order) => order.id === payload.orderId));
      if (belongsToSession) void refetchSession();
    };
    const onAvailability = (payload: { itemId: string; isAvailable: boolean }) => {
      setSoldOutIds((previous) => {
        const next = new Set(previous);
        if (payload.isAvailable) next.delete(payload.itemId);
        else next.add(payload.itemId);
        return next;
      });
    };

    window.addEventListener('online', updateNetwork);
    window.addEventListener('offline', updateNetwork);
    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('order:status-changed', refresh);
    socket.on('order:submitted', refresh);
    socket.on('order:items-updated', refresh);
    socket.on('order:item-cancelled', refresh);
    socket.on('kitchen:order-ready', refresh);
    socket.on('menu:item-availability-updated', onAvailability);
    const refreshMenuItems = () => { void queryClient.invalidateQueries({ queryKey: ['menu-items', 'popular'] }); };
    socket.on('menu:item-updated', refreshMenuItems);
    return () => {
      window.removeEventListener('online', updateNetwork);
      window.removeEventListener('offline', updateNetwork);
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('order:status-changed', refresh);
      socket.off('order:submitted', refresh);
      socket.off('order:items-updated', refresh);
      socket.off('order:item-cancelled', refresh);
      socket.off('kitchen:order-ready', refresh);
      socket.off('menu:item-availability-updated', onAvailability);
      socket.off('menu:item-updated', refreshMenuItems);
    };
  }, [queryClient, refetchSession, sessionId, user?.id]);

  useEffect(() => {
    const flush = async () => {
      if (!activeOrderId) return;
      const key = `draft_items_${activeOrderId}`;
      const queue = JSON.parse(localStorage.getItem(key) || '[]') as Array<Record<string, unknown>>;
      if (!queue.length) return;
      const remaining: Array<Record<string, unknown>> = [];
      for (const payload of queue) {
        try {
          await post(`/orders/${activeOrderId}/items`, payload);
        } catch {
          remaining.push(payload);
        }
      }
      if (remaining.length) localStorage.setItem(key, JSON.stringify(remaining));
      else localStorage.removeItem(key);
      await refetchSession();
    };
    const socket = getSocket();
    window.addEventListener('online', flush);
    socket.on('connect', flush);
    return () => {
      window.removeEventListener('online', flush);
      socket.off('connect', flush);
    };
  }, [activeOrderId, refetchSession]);

  const createOrder = async () => {
    if (!sessionId || creationAttempt.current === sessionId) return;
    setActionError('');
    setActionMessage('');
    creationAttempt.current = sessionId;
    try {
      const response = await post<{ order: { id: string } }>('/orders', { tableSessionId: sessionId });
      setActiveOrderId(response.order.id);
      await refetchSession();
    } finally {
      creationAttempt.current = null;
    }
  };

  const addItemToOrder = async (
    item: MenuItem,
    payload: { menuItemId: string; quantity: number; notes?: string; modifiers: ModifierSelection[]; seatNumber?: string },
  ) => {
    if (!activeOrder || !canEditActiveOrder) {
      setActionError('This order is outside the 5-minute edit window. Start a new order to continue.');
      return;
    }
    const orderId = activeOrder.id;
    if (!orderId) {
      setActionError('The draft order is still loading. Please try again.');
      return;
    }
    const sessionKey = ['session', sessionId];
    const previousSession = queryClient.getQueryData<{ session: TableSession }>(sessionKey);
    const modifierPrice = item.modifierGroups?.flatMap((group) => group.options)
      .filter((option) => payload.modifiers.some((modifier) => modifier.optionId === option.id))
      .reduce((sum, option) => sum + option.priceMinor, 0) ?? 0;
    const discountedPrice = Math.round(item.priceMinor * (100 - (item.discountPercent ?? 0)) / 100);
    const unitPriceMinor = discountedPrice + modifierPrice;
    const optimisticItemId = `optimistic-${crypto.randomUUID()}`;
    const existingItem = previousSession?.session.orders
      .find((order) => order.id === orderId)?.items
      .find((orderItem) => orderItem.status === 'PENDING'
        && matchesOrderItem(orderItem, item, payload, unitPriceMinor));
    queryClient.setQueryData<{ session: TableSession }>(sessionKey, (current) => {
      if (!current) return current;
      return {
        ...current,
        session: {
          ...current.session,
          orders: current.session.orders.map((order) => order.id === orderId
            ? {
                ...order,
                items: existingItem
                  ? order.items.map((orderItem) => orderItem.id === existingItem.id
                    ? { ...orderItem, quantity: orderItem.quantity + payload.quantity }
                    : orderItem)
                  : [...order.items, {
                      id: optimisticItemId,
                      menuItemId: item.id,
                      itemName: item.name,
                      quantity: payload.quantity,
                      unitPriceMinor,
                      status: 'PENDING',
                      modifiers: payload.modifiers,
                      notes: payload.notes,
                      seatNumber: payload.seatNumber,
                    }],
              }
            : order),
        },
      };
    });
    setBusy('add');
    setActionError('');
    setActionMessage('');
    try {
      const response = await post<{ item: OrderItem }>(`/orders/${orderId}/items`, payload);
      queryClient.setQueryData<{ session: TableSession }>(sessionKey, (current) => {
        if (!current) return current;
        return {
          ...current,
          session: {
            ...current.session,
            orders: current.session.orders.map((order) => order.id === orderId
              ? (() => {
                  const optimisticItem = order.items.find((orderItem) => orderItem.id === optimisticItemId);
                  const currentMatch = order.items.find((orderItem) =>
                    orderItem.id !== optimisticItemId
                    && orderItem.status === 'PENDING'
                    && matchesOrderItem(orderItem, item, payload, unitPriceMinor));
                  const mergedItemId = existingItem?.id ?? currentMatch?.id;
                  if (mergedItemId) {
                    return {
                      ...order,
                      items: order.items
                        .filter((orderItem) => orderItem.id !== optimisticItemId && orderItem.id !== mergedItemId)
                        .concat(response.item),
                    };
                  }
                  if (optimisticItem) {
                    return {
                      ...order,
                      items: order.items.map((orderItem) => orderItem.id === optimisticItemId ? response.item : orderItem),
                    };
                  }
                  return {
                    ...order,
                    items: order.items.some((orderItem) => orderItem.id === response.item.id)
                      ? order.items.map((orderItem) => orderItem.id === response.item.id ? response.item : orderItem)
                      : [...order.items, response.item],
                  };
                })()
              : order),
          },
        };
      });
    } catch (error: unknown) {
      if (!axios.isAxiosError(error) || !error.response) {
        const key = `draft_items_${orderId}`;
        const queue = JSON.parse(localStorage.getItem(key) || '[]') as unknown[];
        queue.push(payload);
        localStorage.setItem(key, JSON.stringify(queue));
        setIsOffline(true);
        setActionMessage(`${item.name} saved offline and will sync when connected.`);
      } else {
        queryClient.setQueryData(sessionKey, previousSession);
        setActionError(errorMessage(error));
      }
    } finally {
      setBusy(null);
      setSelectedItem(null);
      setQty(1);
      setNotes('');
      setModifiers([]);
    }
  };

  const addItem = async () => {
    if (!selectedItem) return;
    await addItemToOrder(selectedItem, {
      menuItemId: selectedItem.id,
      quantity: Math.max(1, qty),
      notes,
      modifiers,
    });
  };

  const quickAddItem = (item: MenuItem) => addItemToOrder(item, {
    menuItemId: item.id,
    quantity: 1,
    modifiers: [],
  });

  const submitBatch = async () => {
    if (!activeOrder || activeOrder.status !== 'DRAFT') return;
    if (!activeItems.length) {
      setActionError('Add at least one item before submitting this batch.');
      return;
    }
    setBusy('submit');
    setActionError('');
    setActionMessage('');
    const sessionKey = ['session', sessionId];
    const previousSession = queryClient.getQueryData<{ session: TableSession }>(sessionKey);
    queryClient.setQueryData<{ session: TableSession }>(sessionKey, (current) => {
      if (!current) return current;
      return {
        ...current,
        session: {
          ...current.session,
          orders: current.session.orders.map((order) => order.id === activeOrder.id
            ? { ...order, status: 'SUBMITTED', submittedAt: new Date().toISOString() }
            : order),
        },
      };
    });
    try {
      await post(`/orders/${activeOrder.id}/submit`, { idempotencyKey: `waiter-${activeOrder.id}` });
      setClockNow(Date.now());
      setActionMessage('Order sent. You can edit it for 5 minutes.');
      void queryClient.invalidateQueries({ queryKey: ['menu-items', 'popular'] });
      await refetchSession();
    } catch (error: unknown) {
      queryClient.setQueryData(sessionKey, previousSession);
      setActionError(errorMessage(error));
    } finally {
      setBusy(null);
    }
  };

  const updateItemQuantity = async (order: TableOrder, item: OrderItem, quantity: number) => {
    const restricted = ['PREPARING', 'READY', 'SERVED'].includes(item.status);
    let managerPin: string | undefined;
    if (restricted) {
      managerPin = window.prompt('Manager PIN required:') || undefined;
      if (!managerPin) return;
    }
    const sessionKey = ['session', sessionId];
    const previousSession = queryClient.getQueryData<{ session: TableSession }>(sessionKey);
    queryClient.setQueryData<{ session: TableSession }>(sessionKey, (current) => {
      if (!current) return current;
      return {
        ...current,
        session: {
          ...current.session,
          orders: current.session.orders.map((cachedOrder) => cachedOrder.id === order.id
            ? {
                ...cachedOrder,
                items: cachedOrder.items.map((cachedItem) => cachedItem.id === item.id
                  ? { ...cachedItem, quantity, ...(quantity === 0 && { status: 'CANCELLED' }) }
                  : cachedItem),
              }
            : cachedOrder),
        },
      };
    });
    setPendingItems((previous) => new Set(previous).add(item.id));
    setActionError('');
    try {
      await patch(`/orders/${order.id}/items/${item.id}`, { quantity, managerPin });
      await refetchSession();
    } catch (error: unknown) {
      queryClient.setQueryData(sessionKey, previousSession);
      setActionError(errorMessage(error));
    } finally {
      setPendingItems((previous) => {
        const next = new Set(previous);
        next.delete(item.id);
        return next;
      });
    }
  };

  if (sessionQ.isLoading) {
    return <main className="grid min-h-screen place-items-center bg-[#f6f5f4] text-sm text-[#65736d]">Loading table…</main>;
  }

  if (sessionQ.isError || !session) {
    return (
      <main className="grid min-h-screen place-items-center bg-[#f6f5f4] p-5 text-[#33453c]">
        <section className="max-w-md rounded-2xl border border-[#e8e5e2] bg-white p-6 text-center shadow-sm">
          <CircleAlert className="mx-auto h-6 w-6 text-rose-600" />
          <h1 className="mt-3 font-semibold">Table order unavailable</h1>
          <p className="mt-1 text-sm text-[#758078]">The table session could not be loaded. Refresh or return to the floor.</p>
          <div className="mt-4 flex justify-center gap-2">
            <button onClick={() => void sessionQ.refetch()} className="inline-flex items-center gap-2 rounded-lg bg-[#217b66] px-3 py-2 text-sm font-semibold text-white">
              <RefreshCw className="h-4 w-4" /> Retry
            </button>
            <button onClick={() => nav(floorPath)} className="rounded-lg border border-[#dddeda] px-3 py-2 text-sm font-semibold">Floor</button>
          </div>
        </section>
      </main>
    );
  }

  const isBusy = busy !== null || pendingItems.size > 0;

  return (
    <div className="waiter-order-page min-h-screen bg-[#fbf8f0] text-[#203a30]">
      <header className="sticky top-0 z-20 border-b border-[#eee9dd] bg-[#fffdf8]/95 shadow-[0_2px_12px_rgba(56,52,36,0.035)] backdrop-blur-xl">
        <div className="mx-auto flex h-[62px] max-w-[1440px] items-center justify-between px-4 sm:px-6">
          <Link to={dashboardPath} aria-label="Dashboard" className="flex min-w-0 items-center gap-3 text-[#203a30] transition-opacity hover:opacity-80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-700">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl text-[#14785c]">
              <UtensilsCrossed className="h-7 w-7" />
            </span>
            <span className="min-w-0 leading-tight">
              <span className="block max-w-[190px] truncate font-serif text-base font-semibold tracking-tight sm:max-w-none sm:text-lg">{settingsQ.data?.settings?.name || 'Restaurant POS'}</span>
              <span className="mt-0.5 block text-[9px] font-semibold uppercase tracking-[0.2em] text-[#849188]">Restaurant</span>
            </span>
          </Link>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-[#eff1e7] px-3 py-1.5 text-[11px] font-semibold text-[#416d57]">
              <span className="h-2 w-2 rounded-full bg-[#168263]" />
              Open
            </span>
            <span className="hidden items-center gap-1.5 rounded-full px-2.5 py-1.5 text-xs text-[#68766e] sm:inline-flex">
              {isOffline ? <WifiOff className="h-3.5 w-3.5 text-amber-600" /> : <Wifi className="h-3.5 w-3.5 text-[#287c68]" />}
              {isOffline ? 'Offline' : 'Online'}
            </span>
          </div>
        </div>
      </header>

      <section className="relative isolate overflow-hidden border-b border-[#e6ebe7] bg-white">
        <div className="mx-auto flex min-h-[148px] max-w-[1440px] flex-wrap items-center justify-between gap-5 px-4 py-4 sm:px-6 sm:py-5">
          <div>
            <div className="mb-2 flex items-center gap-3">
              <Link to={floorPath} className="inline-flex items-center gap-1 text-[10px] font-medium text-[#7b887d] transition-colors hover:text-[#16795f]">
                <ArrowLeft className="h-3 w-3" /> Floor
              </Link>
              <span aria-hidden="true" className="h-3 w-px bg-[#dfd7c5]" />
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#63947b]">Good food <span className="px-1.5 text-[#c0a77a]">·</span> Great mood</p>
            </div>
            <div className="mt-1.5 flex flex-wrap items-center gap-3">
              <h1 className="font-serif text-[26px] font-semibold tracking-tight text-[#183c32] sm:text-[32px]">
                Table {session.table?.number?.replace(/^0+(?=\d)/, '')} <span className="px-1 text-[#aa9c7e]">•</span> {session.table?.capacity ?? session.partySize} Seats
              </h1>
              <span className="rounded-full border border-[#f0e0bd] bg-[#fff3d9]/90 px-3 py-1 text-[11px] font-semibold text-[#94702d]">Occupied</span>
            </div>
            <div className="mt-2.5 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs font-medium text-[#5f7166]">
              <span className="inline-flex items-center gap-2"><UtensilsCrossed className="h-4 w-4 text-[#70a286]" />{session.partySize} {session.partySize === 1 ? 'guest' : 'guests'}</span>
              {session.customerName && <span className="text-[#7a887e]">{session.customerName}</span>}
              <span className="inline-flex items-center gap-2"><Clock3 className="h-4 w-4 text-[#70a286]" />{elapsed(session.openedAt)}</span>
            </div>
          </div>
          <Link to="/kitchen" className="inline-flex items-center gap-2 rounded-2xl border border-[#eee7d9] bg-white/80 px-5 py-3 text-xs font-semibold text-[#405b4d] shadow-[0_5px_18px_rgba(53,61,44,0.05)] transition-all hover:-translate-y-0.5 hover:border-[#d4e3d4] hover:bg-white hover:shadow-md motion-reduce:transform-none motion-reduce:transition-none">
            <UtensilsCrossed className="h-4 w-4 text-[#398568]" /> Kitchen
          </Link>
        </div>
      </section>

      <main className="mx-auto max-w-[1440px] px-3 pb-5 pt-5 sm:px-6 sm:pb-8 sm:pt-6">

        {isOffline && (
          <div role="status" className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            Offline mode — new items are saved locally and will sync when the connection returns.
          </div>
        )}
        {(actionError || actionMessage) && (
          <div role={actionError ? 'alert' : 'status'} className={`mb-3 flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-xs ${actionError ? 'border-rose-200 bg-rose-50 text-rose-800' : 'border-[#cfe5d9] bg-[#edf7f1] text-[#286c51]'}`}>
            <span>{actionError || actionMessage}</span>
            <button aria-label="Dismiss message" onClick={() => { setActionError(''); setActionMessage(''); }} className="shrink-0 font-semibold">×</button>
          </div>
        )}

        <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(360px,0.8fr)]">
          <section aria-label="Explore menu" className="min-w-0">
            <div className="mb-4 flex items-end justify-between gap-3">
              <div>
                <h2 className="font-serif text-xl font-semibold tracking-tight text-[#203a30] sm:text-2xl">Our Menu</h2>
                <p className="mt-1 text-xs text-[#8a9187]">Fresh ingredients. Authentic taste.</p>
              </div>
              <span className="hidden rounded-full bg-white/80 px-3 py-1.5 text-[10px] font-medium text-[#718178] ring-1 ring-inset ring-[#e2ebe5] sm:inline-flex">
                {visibleItems.length} shown
              </span>
            </div>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0 flex-1">
                <MenuCategoryTabs
                  categories={categories}
                  value={selectedCategory}
                  onChange={setSelectedCategory}
                  label="Filter menu by category"
                />
              </div>
              {!menuSearch.trim() && categoryItems.length > 10 && (
                <button
                  type="button"
                  onClick={() => setShowAllMenuItems((showAll) => !showAll)}
                  aria-expanded={showAllMenuItems}
                  className="shrink-0 rounded-full border border-[#dce8e1] bg-white px-3.5 py-2 text-[11px] font-semibold text-[#267b67] shadow-sm transition-all hover:border-[#b8d9c5] hover:bg-[#f5faf6] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#75ad91] motion-reduce:transition-none"
                >
                  {showAllMenuItems ? 'Show top 10' : `See all ${categoryItems.length}`}
                </button>
              )}
            </div>
            <label className="relative mb-3 block">
              <Search aria-hidden="true" className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#849187]" />
              <input
                type="search"
                aria-label="Search menu items"
                placeholder="Search menu items..."
                value={menuSearch}
                onChange={(event) => setMenuSearch(event.target.value)}
                className="w-full rounded-xl border border-[#e2ebe5] bg-white/90 py-2.5 pl-10 pr-4 text-sm text-[#30483b] shadow-sm outline-none transition placeholder:text-[#9aa39b] focus:border-[#75ad91] focus:ring-2 focus:ring-[#75ad91]/20"
              />
            </label>
            <p className="mb-3 text-[10px] font-medium uppercase tracking-[0.08em] text-[#89958e]">
              {menuSearch.trim()
                ? `${visibleItems.length} search result${visibleItems.length === 1 ? '' : 's'}`
                : showAllMenuItems ? 'All menu items' : 'Top 10 best-selling items'}
            </p>

            {menuQ.isError && (
              <div role="alert" className="mb-2 flex items-center justify-between rounded-lg border border-rose-200 bg-white p-3 text-xs text-rose-800">
                Menu could not be loaded.
                <button onClick={() => void menuQ.refetch()} className="font-semibold">Retry</button>
              </div>
            )}
            {menuQ.isLoading ? (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4" aria-label="Loading menu">
                {Array.from({ length: 8 }, (_, index) => <div key={index} className="h-[74px] animate-pulse rounded-xl border border-[#e9e7e4] bg-white" />)}
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
                {visibleItems.map((item) => {
                  const isSold = item.soldOut || soldOutIds.has(item.id) || !item.available;
                  const imageUrl = getMenuImageUrl(item.name, item.imageUrl);
                  return (
                    <article
                      key={item.id}
                      className={`waiter-menu-card flex min-h-[230px] flex-col justify-between overflow-hidden rounded-2xl border bg-white/90 shadow-[0_3px_12px_rgba(56,52,36,0.045)] transition-all duration-200 motion-reduce:transition-none ${isSold ? 'border-[#ece9e1] bg-[#f6f4ee] text-[#9a9b97]' : 'border-[#eee9de] hover:-translate-y-0.5 hover:border-[#d8e4d6] hover:shadow-[0_10px_24px_rgba(56,52,36,0.09)] motion-reduce:transform-none'}`}
                    >
                      <button
                        type="button"
                        disabled={isSold || isBusy || !activeOrder || !canEditActiveOrder}
                        onClick={() => void quickAddItem(item)}
                        aria-label={`Add ${item.name} to draft order`}
                        className="flex min-h-[150px] w-full flex-col justify-between p-2.5 text-left disabled:cursor-not-allowed sm:p-3"
                      >
                        {imageUrl && <img src={imageUrl} alt="" loading="lazy" className="mb-2.5 h-24 w-full rounded-xl bg-[#f6f2e8] object-cover sm:h-28" />}
                        <span className="line-clamp-2 text-xs font-semibold leading-snug text-[#2d4338]">{item.name}{isSold ? ' · Sold out' : ''}</span>
                        <span className="mt-1.5 flex items-center gap-1.5 text-[11px] font-medium text-[#708077]">
                          {item.discountPercent ? (
                            <>
                              <span className="text-rose-700">{money(Math.round(item.priceMinor * (100 - item.discountPercent) / 100), currency)}</span>
                              <span className="text-[9px] text-[#9a9286] line-through">{money(item.priceMinor, currency)}</span>
                              <span className="rounded bg-rose-50 px-1 py-0.5 text-[9px] text-rose-700">{item.discountPercent}% off</span>
                            </>
                          ) : money(item.priceMinor, currency)}
                        </span>
                      </button>
                      <div className="flex items-center justify-end gap-1.5 px-2.5 pb-2.5">
                        {!isSold && (
                          <button
                            type="button"
                            disabled={isBusy || !activeOrder || !canEditActiveOrder}
                            onClick={() => void quickAddItem(item)}
                            className="inline-flex items-center gap-1 rounded-full bg-[#eaf3e9] px-3 py-1.5 text-[10px] font-semibold text-[#287454] transition-colors hover:bg-[#dcebdc] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#75ad91] disabled:cursor-not-allowed disabled:opacity-50 motion-reduce:transition-none"
                          >
                            <Plus className="h-3 w-3" /> Add
                          </button>
                        )}
                        {isSold && <span className="inline-flex items-center gap-1 rounded-full bg-[#f5eeee] px-3 py-1.5 text-[10px] font-medium text-[#9a7772]">⊘ Out of stock</span>}
                        {!isSold && (
                        <button
                          type="button"
                          disabled={isBusy || !activeOrder || !canEditActiveOrder}
                          onClick={() => {
                            setSelectedItem(item);
                            setQty(1);
                            setNotes('');
                            setModifiers([]);
                          }}
                          className="group inline-flex items-center gap-1 rounded-full border border-[#e5e9dc] bg-[#fffdf7] px-2.5 py-1.5 text-[9px] font-semibold text-[#617664] transition-all duration-150 hover:border-[#cdddc9] hover:bg-[#f7fbf4] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#63a98a] focus-visible:ring-offset-1 motion-reduce:transition-none disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <SlidersHorizontal className="h-3 w-3 transition-transform duration-200 group-hover:rotate-12 motion-reduce:transition-none" />
                          Customize
                        </button>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
            {!menuQ.isLoading && !menuQ.isError && visibleItems.length === 0 && (
              <p className="rounded-xl border border-[#e2ebe5] bg-white/80 px-4 py-6 text-center text-sm text-[#718178]">
                {menuSearch.trim()
                  ? `No menu items match “${menuSearch.trim()}”.`
                  : 'No menu items in this category yet.'}
              </p>
            )}

            {selectedItem && (
              <div className="mt-4 rounded-2xl border border-[#dce8e1] bg-white p-4 shadow-[0_8px_24px_rgba(31,63,47,0.07)]">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-xs font-semibold">{selectedItem.name}</p>
                    <p className="mt-0.5 text-[10px] text-[#77817b]">
                      {money(Math.round(selectedItem.priceMinor * (100 - (selectedItem.discountPercent ?? 0)) / 100), currency)} each
                      {selectedItem.discountPercent ? ` (${selectedItem.discountPercent}% off)` : ''}
                    </p>
                  </div>
                  <button onClick={() => setSelectedItem(null)} aria-label="Close item details" className="flex h-7 w-7 items-center justify-center rounded-full text-lg leading-none text-[#8a928d] transition-colors hover:bg-[#f1f5f1] hover:text-[#40564b]">×</button>
                </div>
                {selectedItem.modifierGroups?.map((group) => (
                  <fieldset key={group.id} className="mt-2">
                    <legend className="text-[10px] font-semibold text-[#59635d]">{group.name}</legend>
                    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
                      {group.options.map((option) => {
                        const checked = modifiers.some((modifier) => modifier.optionId === option.id);
                        return (
                          <label key={option.id} className="inline-flex items-center gap-1 text-[10px] text-[#59635d]">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={(event) => setModifiers((previous) => event.target.checked
                                ? [...previous, { groupId: group.id, optionId: option.id }]
                                : previous.filter((modifier) => modifier.optionId !== option.id))}
                            />
                            {option.name}{option.priceMinor ? ` (+${money(option.priceMinor, currency)})` : ''}
                          </label>
                        );
                      })}
                    </div>
                  </fieldset>
                ))}
                <div className="mt-2 flex flex-wrap gap-2">
                  <label className="sr-only" htmlFor="order-quantity">Quantity</label>
                  <input id="order-quantity" type="number" min={1} value={qty} onChange={(event) => setQty(Math.max(1, Number(event.target.value) || 1))} className="w-16 rounded-md border border-[#e3e2df] px-2 py-1.5 text-xs" />
                  <label className="sr-only" htmlFor="order-notes">Item notes</label>
                  <input id="order-notes" value={notes} onChange={(event) => setNotes(event.target.value)} className="min-w-20 flex-1 rounded-md border border-[#e3e2df] px-2 py-1.5 text-xs" />
                  <button onClick={() => void addItem()} disabled={isBusy} className="inline-flex items-center justify-center gap-1 rounded-md bg-[#267b67] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60">
                    {busy === 'add' ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                    Add customized item
                  </button>
                </div>
              </div>
            )}
          </section>

          <section aria-label="Order details" className="rounded-2xl border border-[#efe9dc] bg-white/85 p-4 shadow-[0_8px_26px_rgba(56,52,36,0.055)] sm:p-5 lg:sticky lg:top-[78px]">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h2 className="font-serif text-lg font-semibold tracking-tight text-[#203a30]">Order details</h2>
                <p className="mt-1 text-xs leading-relaxed text-[#899187]">Tap menu items to add them here. Submit when you are ready to send the order to the kitchen and cashier.</p>
              </div>
              <span className="rounded-full bg-[#eff3e9] px-2.5 py-1 text-[10px] font-semibold text-[#52745f]">#{activeOrder?.orderNumber ?? '—'}</span>
            </div>
            <div className="mt-3">
              <span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${activeOrder?.status === 'DRAFT' ? 'bg-amber-50 text-amber-800' : 'bg-emerald-50 text-emerald-800'}`}>
                {activeOrder?.status === 'DRAFT'
                  ? 'Draft · not sent'
                  : canEditActiveOrder
                    ? `Submitted · edit ${Math.floor(editSecondsLeft / 60)}:${String(editSecondsLeft % 60).padStart(2, '0')}`
                    : 'Submitted'}
              </span>
            </div>
            {activeItems.length === 0 ? (
              <div className="mt-4 flex min-h-[104px] flex-col items-center justify-center rounded-2xl border border-[#f0ece2] bg-[#faf8f2] px-3 py-4 text-center">
                <UtensilsCrossed className="h-5 w-5 text-[#adc2ad]" />
                <p className="mt-2 text-xs font-medium text-[#7a887e]">No items yet</p>
                <p className="mt-1 text-[10px] text-[#9ba39a]">Choose items from the menu above.</p>
              </div>
            ) : (
              <ul className="mt-3 divide-y divide-[#edf0ed]">
                {activeItems.map((item) => (
                  <li key={item.id} className="flex flex-wrap items-center gap-2 py-2.5 text-xs sm:gap-4">
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium text-[#40564b]">{item.quantity}× {item.itemName}</span>
                      {getOrderItemCustomizations(item.modifiers, item.notes).map((detail) => (
                        <span key={detail} className="mt-1 block text-[10px] font-normal text-[#78877f]">{detail}</span>
                      ))}
                    </span>
                    <span className="text-[#64756c]">{money(item.unitPriceMinor * item.quantity, currency)}</span>
                    {activeOrder && canEditActiveOrder && (
                      <span className="flex shrink-0 items-center gap-1.5">
                        <button onClick={() => void updateItemQuantity(activeOrder, item, item.quantity - 1)} disabled={pendingItems.has(item.id)} aria-label={`Decrease ${item.itemName} quantity`} className="rounded-md border border-[#e6e4e1] px-2 py-1 font-semibold disabled:opacity-50">−</button>
                        <button onClick={() => void updateItemQuantity(activeOrder, item, item.quantity + 1)} disabled={pendingItems.has(item.id)} aria-label={`Increase ${item.itemName} quantity`} className="rounded-md border border-[#e6e4e1] px-2 py-1 font-semibold disabled:opacity-50">+</button>
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-3 space-y-1.5 border-t border-[#eee9df] pt-3 text-xs">
              <div className="flex justify-between text-[#7c8980]"><span>Subtotal</span><span>{money(totalMinor, currency)}</span></div>
              {serviceMinor > 0 && <div className="flex justify-between text-[#7c8980]"><span className="inline-flex items-center gap-1.5">Service charge <span title="Calculated from the restaurant’s service charge setting."><Info className="h-3 w-3 text-[#8ca393]" /></span></span><span>{money(serviceMinor, currency)}</span></div>}
              {taxMinor > 0 && <div className="flex justify-between text-[#7c8980]"><span>VAT {((settingsQ.data?.settings?.taxRateBps ?? 0) / 100).toFixed(0)}%</span><span>{money(taxMinor, currency)}</span></div>}
              <div className="flex justify-between border-t border-[#eee9df] pt-2 font-semibold text-[#293d34]">
                <span>Order total</span><span>{money(grandTotalMinor, currency)}</span>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-[#e9eeea] pt-3">
              <p className="text-xs text-[#64756c]">{activeItemCount} item{activeItemCount === 1 ? '' : 's'}</p>
              <div className="flex w-full gap-2 sm:w-auto">
                <button onClick={() => void submitBatch()} disabled={activeOrder?.status !== 'DRAFT' || !activeItems.length || isBusy || isOffline} className="flex-1 rounded-lg bg-[#267b67] px-4 py-2.5 text-xs font-semibold text-white transition-colors hover:bg-[#206b5a] disabled:cursor-not-allowed disabled:opacity-55 sm:flex-none">
                  {busy === 'submit' ? 'Sending order…' : activeOrder?.status === 'DRAFT' ? `Submit ${activeItemCount} item${activeItemCount === 1 ? '' : 's'}` : 'Order submitted'}
                </button>
                <button onClick={() => void createOrder().catch((error: unknown) => setActionError(errorMessage(error)))} disabled={isBusy || isOffline} className="rounded-lg border border-[#dce8e1] px-4 py-2.5 text-xs font-medium text-[#53675c] disabled:opacity-50">
                  New order
                </button>
              </div>
            </div>
          </section>
        </div>
      </main>
      <div className="mx-auto w-full max-w-[1440px] px-3 pb-4 sm:px-4">
        <WaiterProfileFooter />
      </div>
    </div>
  );
}
