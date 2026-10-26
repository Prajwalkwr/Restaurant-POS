import { useQuery } from '@tanstack/react-query';
import { get } from '../../lib/api';

export default function AdminDashboard() {
  const { data, isLoading, refetch } = useQuery({ queryKey: ['dashboard'], queryFn: () => get('/settings/dashboard') });
  if (isLoading) return <div>Loading...</div>;
  const d = data || {};
  const cards = [
    { label: 'Tables', value: `${d.tables?.occupied ?? 0}/${d.tables?.total ?? 0} occupied` },
    { label: 'Active Sessions', value: d.activeSessions ?? 0 },
    { label: 'Orders Waiting', value: d.orders?.waiting ?? 0 },
    { label: 'Preparing', value: d.orders?.preparing ?? 0 },
    { label: 'Ready', value: d.orders?.ready ?? 0 },
    { label: 'Bills Awaiting', value: d.bills?.awaiting ?? 0 },
    { label: 'Completed Bills', value: d.bills?.completed ?? 0 },
    { label: 'Gross Sales (NPR)', value: ((d.grossSalesMinor ?? 0)/100).toFixed(2) },
  ];
  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-semibold">Dashboard</h2>
        <button onClick={() => refetch()} className="text-sm px-3 py-1 border rounded">Refresh</button>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {cards.map(c => (
          <div key={c.label} className="bg-white p-4 rounded-lg shadow-sm border">
            <div className="text-xs text-slate-500">{c.label}</div>
            <div className="text-lg font-semibold mt-1">{c.value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
