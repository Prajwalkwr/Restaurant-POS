import { useQuery } from '@tanstack/react-query';
import { get } from '../../lib/api';
import { useState } from 'react';

export default function AdminReports() {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const qs = `?from=${from}&to=${to}`;
  const sales = useQuery({ queryKey: ['sales', from, to], queryFn: () => get(`/reports/sales${qs}`) });
  const items = useQuery({ queryKey: ['items', from, to], queryFn: () => get(`/reports/items${qs}`) });
  const pays = useQuery({ queryKey: ['payments', from, to], queryFn: () => get(`/reports/payments${qs}`) });

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold">Reports</h2>
      <button onClick={()=>{
        const rows=[['Item','Qty','Total'],...(items.data?.items||[]).map((it:any)=>[it.name,it.qty,(it.total/100).toFixed(2)])];
        const csv=rows.map(r=>r.join(',')).join('\n');
        const blob=new Blob([csv],{type:'text/csv'});
        const url=URL.createObjectURL(blob);
        const a=document.createElement('a'); a.href=url; a.download='item-sales.csv'; a.click(); URL.revokeObjectURL(url);
      }} className="text-sm px-3 py-1 border rounded">Export Items CSV</button>
      <div className="flex gap-2">
        <input type="date" className="border rounded px-2 py-1" value={from} onChange={e=>setFrom(e.target.value)} />
        <input type="date" className="border rounded px-2 py-1" value={to} onChange={e=>setTo(e.target.value)} />
      </div>
      <div className="bg-white p-4 rounded border">
        <h3 className="font-medium mb-2">Sales</h3>
        {sales.data && (
          <div className="text-sm space-y-1">
            <div>Bills: {sales.data.billCount}</div>
            <div>Gross: NPR {(sales.data.grossMinor/100).toFixed(2)}</div>
            <div>Discounts: NPR {(sales.data.discountsMinor/100).toFixed(2)}</div>
            <div>Tax: NPR {(sales.data.taxMinor/100).toFixed(2)}</div>
            <div>Service: NPR {(sales.data.serviceChargeMinor/100).toFixed(2)}</div>
          </div>
        )}
      </div>
      <div className="bg-white p-4 rounded border">
        <h3 className="font-medium mb-2">Item Sales</h3>
        <table className="w-full text-sm">
          <thead className="bg-slate-100"><tr><th className="p-2 text-left">Item</th><th className="p-2 text-right">Qty</th><th className="p-2 text-right">Total</th></tr></thead>
          <tbody>
            {(items.data?.items||[]).map((it:any)=>(
              <tr key={it.name} className="border-t"><td className="p-2">{it.name}</td><td className="p-2 text-right">{it.qty}</td><td className="p-2 text-right">{(it.total/100).toFixed(2)}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="bg-white p-4 rounded border">
        <h3 className="font-medium mb-2">Payments</h3>
        {pays.data && (
          <div className="text-sm">
            <div>Total: NPR {(pays.data.totalMinor/100).toFixed(2)} ({pays.data.count})</div>
            <pre className="text-xs mt-2">{JSON.stringify(pays.data.byMethod,null,2)}</pre>
          </div>
        )}
      </div>
    </div>
  );
}
