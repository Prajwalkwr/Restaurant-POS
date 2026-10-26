import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Activity, CalendarDays, Grid, RefreshCw, TrendingUp, Users, UtensilsCrossed } from 'lucide-react';
import { get } from '../../lib/api';

type Period = 'daily' | 'weekly' | 'monthly' | 'yearly';

interface AnalyticsData {
  sales: Record<Period, number>;
  trend: { date: string; label: string; grossMinor: number }[];
  topItems: { name: string; quantity: number; totalMinor: number }[];
}

interface DashboardData {
  grossSalesMinor: number;
  activeSessions: number;
  tables: { total: number; occupied: number };
}

const periods: { id: Period; label: string }[] = [
  { id: 'daily', label: 'Daily' },
  { id: 'weekly', label: 'Weekly' },
  { id: 'monthly', label: 'Monthly' },
  { id: 'yearly', label: 'Yearly' },
];

export default function Analytics({ currency = 'NPR' }: { currency?: string }) {
  const [period, setPeriod] = useState<Period>('daily');
  const analyticsQuery = useQuery<AnalyticsData>({
    queryKey: ['analytics', period],
    queryFn: () => get(`/reports/analytics?period=${period}`),
  });
  const dashboardQuery = useQuery<DashboardData>({
    queryKey: ['dashboard'],
    queryFn: () => get('/settings/dashboard'),
  });

  const analytics = analyticsQuery.data;
  const dashboard = dashboardQuery.data;
  const trend = analytics?.trend ?? [];
  const maximumSales = Math.max(1, ...trend.map((point) => point.grossMinor));
  const points = trend.map((point, index) => {
    const x = trend.length < 2 ? 50 : (index / (trend.length - 1)) * 100;
    const y = 40 - (point.grossMinor / maximumSales) * 34;
    return `${x},${y}`;
  }).join(' ');
  const formatCurrency = (minor: number) => new Intl.NumberFormat('en-NP', {
    style: 'currency',
    currency,
    currencyDisplay: 'narrowSymbol',
    maximumFractionDigits: 0,
  }).format(minor / 100);

  const refresh = () => {
    void analyticsQuery.refetch();
    void dashboardQuery.refetch();
  };

  return (
    <div className="space-y-5">
      {(analyticsQuery.isError || dashboardQuery.isError) && (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-rose-200 bg-white p-4 text-sm text-rose-800">
          <span>Some analytics data could not be loaded.</span>
          <button onClick={refresh} className="font-semibold underline">Try again</button>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm text-[#78877f]">Sales performance and restaurant activity.</p>
        </div>
        <button
          onClick={refresh}
          disabled={analyticsQuery.isFetching || dashboardQuery.isFetching}
          className="inline-flex items-center gap-2 rounded-full border border-[#dce8e1] bg-white px-4 py-2 text-sm font-medium text-[#40564b] transition hover:bg-[#f8fbf9] disabled:opacity-60"
        >
          <RefreshCw className={`h-4 w-4 ${analyticsQuery.isFetching || dashboardQuery.isFetching ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 2xl:grid-cols-4">
        {[
          { label: 'Daily sales', value: analytics?.sales.daily, detail: 'Today so far', icon: CalendarDays },
          { label: 'Weekly sales', value: analytics?.sales.weekly, detail: 'This week', icon: TrendingUp },
          { label: 'Monthly sales', value: analytics?.sales.monthly, detail: 'This month', icon: Activity },
          { label: 'Yearly sales', value: analytics?.sales.yearly, detail: 'This year', icon: UtensilsCrossed },
        ].map((card) => {
          const Icon = card.icon;
          return (
            <section key={card.label} className="rounded-2xl border border-[#dce8e1] bg-white p-4 shadow-[0_3px_10px_rgba(34,65,49,0.04)]">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-[#74837b]">{card.label}</p>
                <span className="grid h-8 w-8 place-items-center rounded-lg bg-[#e7f4ed] text-[#438268]"><Icon className="h-4 w-4" /></span>
              </div>
              <p className="mt-2 font-serif text-2xl font-semibold tracking-tight text-[#203a30]">
                {analyticsQuery.isLoading ? <span className="inline-block h-7 w-28 animate-pulse rounded bg-[#edf3ef]" /> : formatCurrency(card.value ?? 0)}
              </p>
              <p className="mt-1 text-[11px] text-[#849188]">{card.detail}</p>
            </section>
          );
        })}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {[
          { label: 'Tables in use', value: dashboard ? `${dashboard.tables.occupied}/${dashboard.tables.total}` : '—', detail: dashboard ? `${Math.max(0, dashboard.tables.total - dashboard.tables.occupied)} available` : 'Current floor status', icon: Grid },
          { label: 'Active sessions', value: dashboard?.activeSessions ?? '—', detail: 'Open dine-in checks', icon: Users },
        ].map((card) => {
          const Icon = card.icon;
          return (
            <section key={card.label} className="flex items-center justify-between rounded-2xl border border-[#dce8e1] bg-white p-4 shadow-[0_3px_10px_rgba(34,65,49,0.04)]">
              <div>
                <p className="text-xs font-medium text-[#74837b]">{card.label}</p>
                <p className="mt-1 font-serif text-2xl font-semibold text-[#203a30]">{card.value}</p>
                <p className="mt-1 text-[11px] text-[#849188]">{card.detail}</p>
              </div>
              <span className="grid h-9 w-9 place-items-center rounded-lg bg-[#e7f4ed] text-[#438268]"><Icon className="h-4 w-4" /></span>
            </section>
          );
        })}
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(300px,0.9fr)]">
        <section className="rounded-2xl border border-[#dce8e1] bg-white p-5 shadow-[0_3px_10px_rgba(34,65,49,0.04)] sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="font-serif text-lg font-semibold text-[#294338]">Sales trend</h3>
              <p className="mt-1 text-xs text-[#849188]">Revenue over time</p>
            </div>
            <div className="flex gap-1 rounded-full bg-[#f3f7f4] p-1" aria-label="Sales trend period">
              {periods.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => setPeriod(option.id)}
                  aria-pressed={period === option.id}
                  className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition ${period === option.id ? 'bg-white text-[#17664f] shadow-sm' : 'text-[#74837b] hover:text-[#294338]'}`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
          {analyticsQuery.isLoading ? (
            <div className="mt-5 h-56 animate-pulse rounded-xl bg-[#f2f7f4]" />
          ) : trend.length ? (
            <>
              <div className="mt-5 h-56">
                <svg viewBox="0 0 100 46" preserveAspectRatio="none" role="img" aria-label={`${period} sales trend`} className="h-full w-full overflow-visible">
                  <defs>
                    <linearGradient id="analytics-sales-fill" x1="0" x2="0" y1="0" y2="1">
                      <stop offset="0%" stopColor="#22b573" stopOpacity=".24" />
                      <stop offset="100%" stopColor="#22b573" stopOpacity="0" />
                    </linearGradient>
                  </defs>
                  {[10, 20, 30, 40].map((y) => <line key={y} x1="0" x2="100" y1={y} y2={y} stroke="#edf2ef" strokeWidth=".35" />)}
                  <polygon points={`0,44 ${points} 100,44`} fill="url(#analytics-sales-fill)" />
                  <polyline points={points} fill="none" stroke="#15966b" strokeWidth="1.2" vectorEffect="non-scaling-stroke" />
                  {trend.map((point, index) => {
                    const x = trend.length < 2 ? 50 : (index / (trend.length - 1)) * 100;
                    const y = 40 - (point.grossMinor / maximumSales) * 34;
                    return <circle key={point.date} cx={x} cy={y} r="1.15" fill="#15966b" stroke="white" strokeWidth=".6" vectorEffect="non-scaling-stroke" />;
                  })}
                </svg>
              </div>
              <div className="mt-3 grid grid-cols-4 gap-1 text-center text-[10px] text-[#849188] sm:grid-cols-7">
                {trend.filter((_, index) => trend.length <= 7 || index % Math.ceil(trend.length / 7) === 0 || index === trend.length - 1).map((point) => (
                  <span key={point.date}>{point.label}</span>
                ))}
              </div>
            </>
          ) : (
            <p className="mt-8 text-center text-sm text-[#849188]">No sales recorded for this period.</p>
          )}
        </section>

        <section className="rounded-2xl border border-[#dce8e1] bg-white p-5 shadow-[0_3px_10px_rgba(34,65,49,0.04)] sm:p-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="font-serif text-lg font-semibold text-[#294338]">Top items</h3>
              <p className="mt-1 text-xs text-[#849188]">Month to date</p>
            </div>
            <UtensilsCrossed className="h-5 w-5 text-[#668275]" />
          </div>
          {analyticsQuery.isLoading ? (
            <div className="mt-4 space-y-3">
              {Array.from({ length: 4 }, (_, index) => <div key={index} className="h-9 animate-pulse rounded-lg bg-[#f2f7f4]" />)}
            </div>
          ) : analytics?.topItems.length ? (
            <ol className="mt-4 divide-y divide-[#edf2ef]">
              {analytics.topItems.map((item, index) => (
                <li key={item.name} className="flex items-center justify-between gap-3 py-3 first:pt-1">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-[#f2f7f4] text-xs font-semibold text-[#668275]">{index + 1}</span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-[#40564b]">{item.name}</p>
                      <p className="mt-0.5 text-[10px] text-[#849188]">{item.quantity} sold</p>
                    </div>
                  </div>
                  <span className="shrink-0 text-right text-xs font-semibold text-[#40564b]">{formatCurrency(item.totalMinor)}</span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="mt-8 text-center text-sm text-[#849188]">No items sold this month yet.</p>
          )}
        </section>
      </div>
    </div>
  );
}
