import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { get, post, patch } from '../../lib/api';
import { useState } from 'react';

export default function AdminTables() {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ['tables'], queryFn: () => get('/tables') });
  const [form, setForm] = useState({ number: '', capacity: '4', section: '' });
  const create = useMutation({
    mutationFn: (b: any) => post('/tables', b),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['tables'] }); setForm({ number: '', capacity: '4', section: '' }); },
  });
  const tables = data?.tables || [];
  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold">Tables</h2>
      <div className="bg-white p-4 rounded border grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="block text-sm">Table number<input className="mt-1 block w-full min-w-0 border rounded px-2 py-2 text-base" value={form.number} onChange={e=>setForm({...form,number:e.target.value})} /></label>
        <label className="block text-sm">Capacity<input type="number" min="1" className="mt-1 block w-full min-w-0 border rounded px-2 py-2 text-base" value={form.capacity} onChange={e=>setForm({...form,capacity:e.target.value})} /></label>
        <label className="block text-sm">Section<input className="mt-1 block w-full min-w-0 border rounded px-2 py-2 text-base" value={form.section} onChange={e=>setForm({...form,section:e.target.value})} /></label>
        <button className="min-h-11 self-end px-3 py-2 bg-slate-900 text-white rounded text-sm" onClick={()=>form.number && create.mutate({ number: form.number, capacity: Number(form.capacity), section: form.section })}>Add Table</button>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {tables.map((t:any)=>(
          <div key={t.id} className="bg-white p-3 rounded border">
            <div className="font-semibold">Table {t.number}</div>
            <div className="text-xs text-slate-500">{t.section} · cap {t.capacity}</div>
            <div className="text-xs mt-1">Status: {t.status}</div>
            <select className="mt-2 text-xs border rounded" value={t.status} onChange={e=>patch(`/tables/${t.id}`,{status:e.target.value}).then(()=>qc.invalidateQueries({queryKey:['tables']}))}>
              <option>AVAILABLE</option><option>OCCUPIED</option><option>OUT_OF_SERVICE</option>
            </select>
          </div>
        ))}
      </div>
    </div>
  );
}
