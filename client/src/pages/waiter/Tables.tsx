import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import {
  Activity,
  ArrowRight,
  CalendarDays,
  Check,
  ChefHat,
  CircleAlert,
  FileText,
  LoaderCircle,
  LogOut,
  RefreshCw,
  Users,
  UtensilsCrossed,
  X,
} from 'lucide-react';
import { get, post } from '../../lib/api';
import { getDashboardPath, useAuth } from '../../lib/auth';
import { getSocket } from '../../lib/socket';
import WaiterProfileFooter from '../../components/WaiterProfileFooter';
import TableAreaFilter from '../../components/TableAreaFilter';
import KitchenOrderStage from '../../components/KitchenOrderStage';
import { getTableArea } from '../../lib/tableAreas';

type TableStatus = 'AVAILABLE' | 'OCCUPIED' | 'RESERVED' | 'OUT_OF_SERVICE';
type DisplayStatus = 'FREE' | 'OCCUPIED' | 'BILL_DUE' | 'RESERVED' | 'OUT_OF_SERVICE';

interface Reservation {
  id: string;
  tableId?: string | null;
  customerName: string;
  partySize: number;
  reservedAt: string;
  status: string;
}

interface TableSession {
  id: string;
  customerName?: string | null;
  partySize: number;
  reservationId?: string | null;
  orders?: { id: string; orderNumber?: number; status: string; createdAt: string; submittedAt?: string | null }[];
  bill?: { status: string; outstandingMinor: number } | null;
}

interface RestaurantTable {
  id: string;
  number: string;
  name?: string | null;
  capacity: number;
  section?: string | null;
  status: TableStatus;
  active: boolean;
  activeSession?: TableSession | null;
}

interface TableResponse {
  tables: RestaurantTable[];
}

interface ReservationsResponse {
  reservations: Reservation[];
}

const todayLocal = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
};

const tableLabel = (table: RestaurantTable) => {
  const number = table.number.replace(/^0+(?=\d)/, '');
  return table.name || `T${number}`;
};

const getDisplayStatus = (table: RestaurantTable): DisplayStatus => {
  if (table.status === 'OUT_OF_SERVICE') return 'OUT_OF_SERVICE';
  if (table.status === 'RESERVED') return 'RESERVED';
  if (table.status === 'OCCUPIED') {
    if (table.activeSession?.bill && table.activeSession.bill.outstandingMinor > 0) return 'BILL_DUE';
    return 'OCCUPIED';
  }
  return 'FREE';
};

const displayStatus: Record<DisplayStatus, { label: string; className: string; border: string; background: string }> = {
  FREE: {
    label: 'Free',
    className: 'bg-[#dff1e8] text-[#286c51]',
    border: 'border-[#b8e0cb]',
    background: 'bg-white',
  },
  OCCUPIED: {
    label: 'Occupied',
    className: 'bg-[#e4edf9] text-[#42678f]',
    border: 'border-[#c9d9ef]',
    background: 'bg-white',
  },
  BILL_DUE: {
    label: 'Bill due',
    className: 'bg-[#fbf0d7] text-[#916e24]',
    border: 'border-[#eed697]',
    background: 'bg-[#fffdf7]',
  },
  RESERVED: {
    label: 'Reserved',
    className: 'bg-[#eeeafa] text-[#65588f]',
    border: 'border-[#dbd4f0]',
    background: 'bg-white',
  },
  OUT_OF_SERVICE: {
    label: 'Out of service',
    className: 'bg-[#edf1ee] text-[#829087]',
    border: 'border-[#e0e8e2]',
    background: 'bg-[#f8faf8]',
  },
};

const getErrorMessage = (error: unknown) => {
  if (axios.isAxiosError<{ error?: string }>(error)) {
    return error.response?.data?.error || 'Could not open this table. Please try again.';
  }
  return error instanceof Error ? error.message : 'Could not open this table. Please try again.';
};

export default function WaiterTables() {
  const qc = useQueryClient();
  const location = useLocation();
  const nav = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user, logout } = useAuth();
  const dashboardPath = getDashboardPath(user?.role);
  const [selectedTable, setSelectedTable] = useState<RestaurantTable | null>(null);
  const [customerName, setCustomerName] = useState('');
  const [partySize, setPartySize] = useState('2');
  const [reservationId, setReservationId] = useState('');
  const [formError, setFormError] = useState('');
  const [online, setOnline] = useState(() => navigator.onLine);
  const settingsQ = useQuery<{ settings?: { name?: string } }>({
    queryKey: ['settings'],
    queryFn: () => get('/settings'),
  });
  const healthQ = useQuery<{ ok: boolean }>({
    queryKey: ['api-health'],
    queryFn: () => get('/health'),
    refetchInterval: 15_000,
    retry: 1,
  });

  const tablesQ = useQuery<TableResponse>({
    queryKey: ['tables'],
    queryFn: () => get('/tables'),
    refetchInterval: 5000,
  });
  const reservationsQ = useQuery<ReservationsResponse>({
    queryKey: ['reservations', todayLocal()],
    queryFn: () => get('/reservations', { date: todayLocal() }),
    refetchInterval: 15_000,
  });

  useEffect(() => {
    const socket = getSocket();
    const refreshTables = () => {
      void qc.invalidateQueries({ queryKey: ['tables'] });
      void qc.invalidateQueries({ queryKey: ['reservations'] });
    };
    const updateOnline = () => setOnline(navigator.onLine);
    const events = [
      'table:updated',
      'table-session:opened',
      'table-session:closed',
      'bill:updated',
      'bill:closed',
      'reservation:created',
      'reservation:updated',
      'reservation:cancelled',
      'order:submitted',
      'order:status-changed',
      'order:items-updated',
      'kitchen:status-changed',
    ];
    events.forEach((event) => socket.on(event, refreshTables));
    window.addEventListener('online', updateOnline);
    window.addEventListener('offline', updateOnline);
    return () => {
      events.forEach((event) => socket.off(event, refreshTables));
      window.removeEventListener('online', updateOnline);
      window.removeEventListener('offline', updateOnline);
    };
  }, [qc]);

  const tables = useMemo(
    () => (tablesQ.data?.tables ?? [])
      .filter((table) => table.active)
      .sort((a, b) => {
        const priority = (table: RestaurantTable) => {
          const status = getDisplayStatus(table);
          if (status === 'FREE') return 0;
          if (status === 'RESERVED') return 1;
          if (status === 'OCCUPIED') return 2;
          if (status === 'BILL_DUE') return 3;
          return 4;
        };
        return priority(a) - priority(b)
          || a.number.localeCompare(b.number, undefined, { numeric: true });
      }),
    [tablesQ.data],
  );
  const tableAreas = useMemo(() => {
    const counts = new Map<string, number>();
    tables.forEach((table) => {
      const area = getTableArea(table.section);
      counts.set(area, (counts.get(area) ?? 0) + 1);
    });
    return [...counts].map(([name, count]) => ({ name, count })).sort((a, b) => a.name.localeCompare(b.name));
  }, [tables]);
  const requestedArea = searchParams.get('area') || 'All';
  const selectedArea = requestedArea === 'All' || tableAreas.some((area) => area.name === requestedArea)
    ? requestedArea
    : 'All';
  const visibleTables = selectedArea === 'All'
    ? tables
    : tables.filter((table) => getTableArea(table.section) === selectedArea);
  const chooseArea = (area: string) => {
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      if (area === 'All') next.delete('area');
      else next.set('area', area);
      return next;
    }, { replace: true });
  };
  const reservations = reservationsQ.data?.reservations ?? [];
  const [formattedDate] = useState(() => new Intl.DateTimeFormat('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date()));
  const selectedReservations = selectedTable
    ? reservations.filter((reservation) => reservation.tableId === selectedTable.id && ['PENDING', 'CONFIRMED'].includes(reservation.status))
    : [];
  const selectedReservation = selectedReservations.find((reservation) => reservation.id === reservationId);
  const isOnline = online && healthQ.isSuccess;

  const seatMutation = useMutation({
    mutationFn: (input: { tableId: string; partySize: number; customerName?: string; reservationId?: string }) =>
      post<{ session: { id: string } }>('/table-sessions', input),
    onSuccess: async (response) => {
      await qc.invalidateQueries({ queryKey: ['tables'] });
      await qc.invalidateQueries({ queryKey: ['active-sessions'] });
      setSelectedTable(null);
      nav(`/waiter/order/${response.session.id}`, { state: { returnTo: `${location.pathname}${location.search}` } });
    },
    onError: (error: unknown) => setFormError(getErrorMessage(error)),
  });

  const refresh = () => {
    void tablesQ.refetch();
    void reservationsQ.refetch();
  };

  const chooseTable = (table: RestaurantTable) => {
    const status = getDisplayStatus(table);
    if (status === 'OCCUPIED' || status === 'BILL_DUE') {
      if (table.activeSession) nav(`/waiter/order/${table.activeSession.id}`, { state: { returnTo: `${location.pathname}${location.search}` } });
      return;
    }
    if (status === 'OUT_OF_SERVICE') return;
    if (status === 'RESERVED') {
      const reservation = reservations.find((item) => item.tableId === table.id && ['PENDING', 'CONFIRMED'].includes(item.status));
      if (!reservation) return;
      setReservationId(reservation.id);
      setCustomerName(reservation.customerName);
      setPartySize(String(reservation.partySize));
    } else {
      setReservationId('');
      setCustomerName('');
      setPartySize('2');
    }
    setFormError('');
    setSelectedTable(table);
  };

  const seatTable = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedTable) return;
    const guests = Number(partySize);
    if (!Number.isInteger(guests) || guests < 1) {
      setFormError('Enter a valid number of guests.');
      return;
    }
    if (selectedTable.status === 'RESERVED' && !selectedReservation) {
      setFormError('Choose a reservation before seating this reserved table.');
      return;
    }
    setFormError('');
    seatMutation.mutate({
      tableId: selectedTable.id,
      partySize: guests,
      customerName: (selectedReservation?.customerName || customerName).trim() || undefined,
      reservationId: reservationId || undefined,
    });
  };

  const counts = tables.reduce<Record<DisplayStatus, number>>((result, table) => {
    result[getDisplayStatus(table)] += 1;
    return result;
  }, { FREE: 0, OCCUPIED: 0, BILL_DUE: 0, RESERVED: 0, OUT_OF_SERVICE: 0 });

  return (
    <main className="waiter-tables-page relative isolate min-h-screen overflow-hidden text-[#293d34]">
      <svg
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 bottom-0 z-0 hidden h-[150px] w-full sm:block"
        viewBox="0 0 1440 180"
        preserveAspectRatio="none"
      >
        <defs>
          <linearGradient id="waiter-floor-hill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#c9dfd1" stopOpacity=".16" />
            <stop offset="100%" stopColor="#a8c9b3" stopOpacity=".32" />
          </linearGradient>
        </defs>
        <path d="M0 70 180 42 330 100 530 55 710 104 900 54 1100 94 1285 36 1440 76V180H0Z" fill="url(#waiter-floor-hill)" />
        <path d="M0 120 150 82 310 131 500 98 685 142 870 92 1050 130 1230 86 1440 120V180H0Z" fill="#d9e8dc" fillOpacity=".42" />
      </svg>
      <header className="sticky top-0 z-20 border-b border-[#e4ebe6] bg-white/95 backdrop-blur">
        <div className="mx-auto flex min-h-[70px] max-w-[1240px] items-center justify-between gap-3 px-4 sm:px-7 lg:px-0">
          <Link to={dashboardPath} aria-label="Dashboard" className="flex min-w-0 items-center gap-3 text-left transition-opacity hover:opacity-80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-700">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#168263] shadow-sm">
              <UtensilsCrossed className="h-6 w-6 text-white" />
            </div>
            <div className="min-w-0">
              <h1 className="truncate font-serif text-base font-bold tracking-tight text-[#173e33] sm:text-xl">{settingsQ.data?.settings?.name || 'Restaurant'}</h1>
              <p className="text-xs text-[#73847c]">Waiter Dashboard</p>
            </div>
          </Link>
          <nav aria-label="Staff shortcuts" className="flex shrink-0 items-center gap-2 sm:gap-3">
            <div className={`inline-flex items-center gap-2 rounded-full border px-3 py-2 text-xs font-semibold ${isOnline ? 'border-[#dce8e1] bg-white text-[#53675c]' : 'border-amber-200 bg-amber-50 text-amber-800'}`}>
              <span className={`h-2 w-2 rounded-full ${isOnline ? 'bg-[#398568] animate-pulse' : 'bg-amber-500'}`} />
              {isOnline ? 'Online' : 'Offline'}
            </div>
            <Link
              to="/kitchen"
              className="inline-flex items-center gap-1.5 rounded-full border border-[#dce8e1] bg-white px-3 py-2 text-xs font-semibold text-[#40564b] transition-colors hover:bg-[#f8fbf9] sm:px-5 sm:py-2.5 sm:text-sm"
            >
              <ChefHat className="h-4 w-4" />
              <span className="hidden sm:inline">Kitchen</span>
            </Link>
            {user?.role === 'ADMIN' && (
              <Link
                to="/admin"
                className="rounded-full border border-[#dce8e1] bg-white px-3 py-2 text-xs font-semibold text-[#40564b] transition-colors hover:bg-[#f8fbf9] sm:px-4 sm:py-2.5 sm:text-sm"
              >
                Admin
              </Link>
            )}
            <button
              onClick={async () => { await logout(); nav('/login', { replace: true }); }}
              aria-label="Log out"
              title="Log out"
              className="flex h-9 w-9 items-center justify-center rounded-full text-[#73847c] transition-colors hover:bg-[#f4f7f5] hover:text-rose-700"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </nav>
        </div>
      </header>

      <div className="relative z-10 mx-auto max-w-[1240px] px-4 pb-10 pt-5 sm:px-7 sm:pt-6 lg:px-0">
        <section className="mb-5 flex flex-wrap items-center justify-between gap-4">
          <div className="hidden items-center gap-2 rounded-2xl border border-[#e2ebe5] bg-white px-4 py-3 text-xs font-medium text-[#53675c] shadow-sm md:flex">
            <CalendarDays className="h-4 w-4 text-[#168263]" /> {formattedDate}
          </div>
        </section>

        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2" aria-label="Table status legend">
            {([
              ['FREE', 'Free'],
              ['OCCUPIED', 'Occupied'],
              ['BILL_DUE', 'Bill due'],
              ['RESERVED', 'Reserved'],
              ['OUT_OF_SERVICE', 'Out of service'],
            ] as const).map(([status, label]) => (
              <span key={status} className={`inline-flex items-center gap-2 rounded-full px-3.5 py-2 text-xs font-semibold ${displayStatus[status].className}`}>
                {label}
                <span className="opacity-70">{counts[status]}</span>
              </span>
            ))}
          </div>
          <button
            onClick={refresh}
            disabled={tablesQ.isFetching || reservationsQ.isFetching}
            className="inline-flex items-center gap-2 rounded-full border border-[#dce8e1] bg-white px-4 py-2.5 text-xs font-semibold text-[#53675c] transition-colors hover:bg-[#f8fbf9] disabled:opacity-60"
          >
            <RefreshCw className={`h-4 w-4 ${tablesQ.isFetching || reservationsQ.isFetching ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>

        {tableAreas.length > 0 && (
          <div className="mb-4">
            <TableAreaFilter areas={tableAreas} value={selectedArea} onChange={chooseArea} label="Filter tables by area" />
          </div>
        )}

        {(tablesQ.isError || reservationsQ.isError) && (
          <div role="alert" className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-rose-200 bg-white p-4 text-rose-800">
            <div className="flex items-center gap-2 text-sm font-medium">
              <CircleAlert className="h-5 w-5 shrink-0" />
              Could not refresh table information. Check your connection and retry.
            </div>
            <button onClick={refresh} className="rounded-lg bg-rose-50 px-3 py-2 text-sm font-semibold hover:bg-rose-100">Try again</button>
          </div>
        )}

        {tablesQ.isLoading ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5" aria-label="Loading tables">
          {Array.from({ length: 10 }, (_, index) => <div key={index} className="min-h-[220px] rounded-[20px] border border-[#e2ebe5] bg-white" />)}
          </div>
        ) : visibleTables.length === 0 ? (
          <div className="rounded-3xl border border-[#dce8e1] bg-white px-6 py-14 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-[#f2f7f4] text-[#668275]">
              <UtensilsCrossed className="h-5 w-5" />
            </div>
            <p className="mt-4 font-medium text-[#40564b]">{tables.length ? `No tables in ${selectedArea}` : 'No active tables configured'}</p>
            <p className="mt-1 text-sm text-[#849188]">{tables.length ? 'Choose another area to see its tables.' : 'Ask an administrator to add tables to the floor.'}</p>
          </div>
        ) : (
          <section aria-label="Restaurant tables" className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
            {visibleTables.map((table) => {
              const status = getDisplayStatus(table);
              const style = displayStatus[status];
              const session = table.activeSession;
              const activeOrders = session?.orders?.filter((order) => !['CANCELLED', 'DRAFT'].includes(order.status)) ?? [];
              const currentOrder = activeOrders[activeOrders.length - 1];
              const canSeat = status === 'FREE' || (status === 'RESERVED' && reservations.some((reservation) => reservation.tableId === table.id && ['PENDING', 'CONFIRMED'].includes(reservation.status)));
              const action = status === 'OCCUPIED'
                ? 'Open table order'
                : status === 'BILL_DUE'
                  ? 'Review order · balance due'
                  : status === 'OUT_OF_SERVICE'
                    ? 'Unavailable'
                    : status === 'RESERVED'
                      ? canSeat ? 'Seat reservation' : 'Reservation unavailable'
                      : 'Tap to seat';
              const actionClass = status === 'BILL_DUE'
                ? 'bg-[#fff0cf] text-[#b56c0f] hover:bg-[#ffe9b6]'
                : status === 'OCCUPIED'
                  ? 'bg-[#e4efff] text-[#176bd1] hover:bg-[#d9e9ff]'
                  : status === 'FREE'
                    ? 'bg-[#e5f4e9] text-[#16845a] hover:bg-[#d9efdf]'
                    : status === 'RESERVED'
                      ? 'bg-[#f0eafa] text-[#7959b1] hover:bg-[#e9e0f7]'
                      : 'bg-[#eef1ef] text-[#728079]';

              return (
                <article
                  key={table.id}
                  className={`relative flex min-h-[220px] flex-col overflow-hidden rounded-[22px] border-l-[4px] border-y border-r p-4 shadow-[0_4px_14px_rgba(34,65,49,0.045)] transition-shadow hover:shadow-[0_8px_22px_rgba(34,65,49,0.09)] ${style.border} ${style.background} ${status === 'OUT_OF_SERVICE' ? 'opacity-75' : ''} ${status === 'FREE' ? 'border-l-[#168b5a]' : status === 'OCCUPIED' ? 'border-l-[#1680e6]' : status === 'BILL_DUE' ? 'border-l-[#f2a100]' : status === 'RESERVED' ? 'border-l-[#9272c6]' : 'border-l-[#99a69d]'}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <h2 className={`font-serif text-[28px] font-semibold leading-none tracking-tight ${status === 'OUT_OF_SERVICE' ? 'text-[#89958e]' : 'text-[#173e33]'}`}>
                      {tableLabel(table)}
                    </h2>
                    <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-semibold ${style.className}`}>
                      <span className={`h-2 w-2 rounded-full ${status === 'FREE' ? 'bg-[#15945d]' : status === 'OCCUPIED' ? 'bg-[#1473d1]' : status === 'BILL_DUE' ? 'bg-[#e48d00]' : status === 'RESERVED' ? 'bg-[#805dbd]' : 'bg-[#87958c]'}`} />
                      {style.label}
                    </span>
                  </div>
                  <div className="relative z-10 mt-4 space-y-2 text-[13px] text-[#536b60]">
                    <p className="flex items-center gap-2">
                      <Users className="h-4 w-4 shrink-0 text-[#234d3e]" />
                      <span className="truncate">{table.section || 'Dining'} · {table.capacity} {table.capacity === 1 ? 'seat' : 'seats'}</span>
                    </p>
                  {session ? (
                    <p className="flex items-center gap-2 truncate">
                      <FileText className="h-4 w-4 shrink-0 text-[#234d3e]" />
                      <span className="truncate">{session.customerName || 'Walk-in'} · {session.partySize} {session.partySize === 1 ? 'cover' : 'covers'}</span>
                    </p>
                  ) : (
                    <p className="flex items-center gap-2 text-xs text-[#849188]">
                      {status === 'RESERVED' ? <CalendarDays className="h-4 w-4 shrink-0" /> : <span className="h-4 w-4 shrink-0" />}
                      {status === 'FREE' ? 'Ready for guests' : status === 'RESERVED' ? 'Reservation pending' : action}
                    </p>
                  )}
                  {session && (
                    <p className="truncate pl-6 text-[11px] text-[#839188]">
                      {status === 'BILL_DUE' ? 'Balance due · tap to review' : `${session.orders?.length ?? 0} active order${session.orders?.length === 1 ? '' : 's'}`}
                    </p>
                  )}
                  </div>
                  <div className="ml-6 flex h-[22px] items-center" aria-label="Current kitchen stage">
                    {currentOrder && <KitchenOrderStage status={currentOrder.status} />}
                  </div>
                  <div className="pointer-events-none absolute bottom-14 right-4 select-none text-5xl font-serif text-[#74a988]/10" aria-hidden="true">
                    {status === 'FREE' ? '❧' : status === 'BILL_DUE' ? '☂' : status === 'OCCUPIED' ? '⌂' : ''}
                  </div>
                  <button
                    type="button"
                    onClick={() => chooseTable(table)}
                    disabled={!canSeat && !session}
                    className={`mt-auto flex w-full items-center gap-3 rounded-full px-4 py-3 text-left text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-65 ${actionClass}`}
                  >
                    <ArrowRight className="h-5 w-5 shrink-0" />
                    <span className="truncate">{action}</span>
                  </button>
                </article>
              );
            })}
          </section>
        )}

        <div className="mt-6 flex items-center justify-center gap-2 text-xs text-[#91a097]">
          <Activity className="h-3.5 w-3.5" />
          Table status syncs automatically
        </div>
        <WaiterProfileFooter />
      </div>

      {selectedTable && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#193126]/35 p-4 backdrop-blur-sm"
          onMouseDown={(event) => { if (event.target === event.currentTarget) setSelectedTable(null); }}
        >
          <section role="dialog" aria-modal="true" aria-labelledby="seat-table-heading" className="w-full max-w-md rounded-3xl border border-[#dce8e1] bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#438268]">Seat guests</p>
                <h2 id="seat-table-heading" className="mt-1 font-serif text-2xl font-semibold text-[#203a30]">
                  {selectedTable.name || `Table ${selectedTable.number}`}
                </h2>
                <p className="mt-1 text-sm text-[#78877f]">{selectedTable.section || 'Dining'} · Standard capacity {selectedTable.capacity}</p>
              </div>
              <button
                onClick={() => setSelectedTable(null)}
                aria-label="Close seating form"
                className="rounded-full p-2 text-[#75877d] transition-colors hover:bg-[#f2f7f4]"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={seatTable} className="mt-6 space-y-4">
              {selectedReservations.length > 0 && (
                <label className="block text-sm font-medium text-[#52635b]">
                  Reservation
                  <select
                    value={reservationId}
                    onChange={(event) => {
                      const reservation = selectedReservations.find((item) => item.id === event.target.value);
                      setReservationId(event.target.value);
                      if (reservation) {
                        setCustomerName(reservation.customerName);
                        setPartySize(String(reservation.partySize));
                      }
                    }}
                    required={selectedTable.status === 'RESERVED'}
                    className="mt-1.5 w-full rounded-xl border border-[#dce8e1] bg-[#fbfdfb] px-3 py-2.5 text-[#31483c] outline-none focus:border-[#8dbba3] focus:ring-2 focus:ring-[#dff1e8]"
                  >
                    {selectedTable.status !== 'RESERVED' && <option value="">Walk-in (no reservation)</option>}
                    {selectedReservations.map((reservation) => (
                      <option key={reservation.id} value={reservation.id}>
                        {reservation.customerName} · {reservation.partySize} {reservation.partySize === 1 ? 'guest' : 'guests'} · {new Date(reservation.reservedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <label className="block text-sm font-medium text-[#52635b]">
                Guest name
                <input
                  value={customerName}
                  onChange={(event) => setCustomerName(event.target.value)}
                  className="mt-1.5 w-full rounded-xl border border-[#dce8e1] bg-[#fbfdfb] px-3 py-2.5 text-[#31483c] outline-none focus:border-[#8dbba3] focus:ring-2 focus:ring-[#dff1e8]"
                />
              </label>
              <label className="block text-sm font-medium text-[#52635b]">
                Number of guests
                <span className="relative mt-1.5 block">
                  <Users className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#91a097]" />
                  <input
                    type="number"
                    min={1}
                    step={1}
                    required
                    value={partySize}
                    onChange={(event) => setPartySize(event.target.value)}
                    className="w-full rounded-xl border border-[#dce8e1] bg-[#fbfdfb] py-2.5 pl-9 pr-3 text-[#31483c] outline-none focus:border-[#8dbba3] focus:ring-2 focus:ring-[#dff1e8]"
                  />
                </span>
                <span className="mt-1 block text-xs font-normal text-[#849188]">Enter the full party size; it can exceed the table’s standard capacity.</span>
              </label>
              {formError && (
                <div role="alert" className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
                  <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
                  {formError}
                </div>
              )}
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setSelectedTable(null)}
                  className="rounded-xl border border-[#dce8e1] px-4 py-2.5 text-sm font-semibold text-[#53675c] transition-colors hover:bg-[#f8fbf9]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={seatMutation.isPending}
                  className="inline-flex items-center gap-2 rounded-xl bg-[#168263] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#126b52] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {seatMutation.isPending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                  {seatMutation.isPending ? 'Opening table…' : 'Seat guests'}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </main>
  );
}
