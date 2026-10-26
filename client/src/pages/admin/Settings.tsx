import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { get, patch } from '../../lib/api';
import { useState, useEffect } from 'react';

export default function AdminSettings() {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ['settings'], queryFn: () => get('/settings') });
  const [form, setForm] = useState<any>({});
  useEffect(() => { if (data?.settings) setForm(data.settings); }, [data]);
  const save = useMutation({
    mutationFn: (b: any) => patch('/settings', b),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['settings'] }),
  });
  return (
    <div className="space-y-4 max-w-xl">
      <h2 className="text-xl font-semibold">Settings</h2>
      <div className="bg-white p-4 rounded border space-y-2">
        {['name','address','phone','email','timeZone','currency','receiptFooter'].map(k=>(
          <div key={k}>
            <label className="text-sm capitalize">{k}</label>
            <input className="w-full border rounded px-2 py-1" value={form[k]||''} onChange={e=>setForm({...form,[k]:e.target.value})} />
          </div>
        ))}
        <div>
          <label className="text-sm">Tax Rate (bps, e.g. 1300 = 13%)</label>
          <input type="number" className="w-full border rounded px-2 py-1" value={form.taxRateBps??0} onChange={e=>setForm({...form,taxRateBps:Number(e.target.value)})} />
        </div>
        <div>
          <label className="text-sm">Service Charge (bps)</label>
          <input type="number" className="w-full border rounded px-2 py-1" value={form.serviceChargeBps??0} onChange={e=>setForm({...form,serviceChargeBps:Number(e.target.value)})} />
        </div>
        <button className="px-3 py-1 bg-slate-900 text-white rounded text-sm" onClick={()=>save.mutate(form)}>Save</button>
      </div>
    </div>
  );
}
