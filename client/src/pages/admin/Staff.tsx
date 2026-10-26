import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { get, post } from '../../lib/api';
import { useState } from 'react';

export default function AdminStaff() {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ['staff'], queryFn: () => get('/staff') });
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'WAITER' });
  const create = useMutation({
    mutationFn: (b: any) => post('/staff', b),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['staff'] }); setForm({ name: '', email: '', password: '', role: 'WAITER' }); },
  });
  const deactivate = useMutation({
    mutationFn: (id: string) => post(`/staff/${id}/deactivate`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['staff'] }),
  });
  const users = data?.users || [];
  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold">Staff</h2>
      <div className="bg-white p-4 rounded border grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3">
        <label className="block text-sm">Name<input autoComplete="name" required className="mt-1 block w-full min-w-0 border rounded px-2 py-2 text-base" value={form.name} onChange={e=>setForm({...form,name:e.target.value})} /></label>
        <label className="block text-sm">Email<input type="email" autoComplete="email" required className="mt-1 block w-full min-w-0 border rounded px-2 py-2 text-base" value={form.email} onChange={e=>setForm({...form,email:e.target.value})} /></label>
        <label className="block text-sm">Password<input type="password" autoComplete="new-password" required className="mt-1 block w-full min-w-0 border rounded px-2 py-2 text-base" value={form.password} onChange={e=>setForm({...form,password:e.target.value})} /></label>
        <label className="block text-sm">Role<select className="mt-1 block w-full min-w-0 border rounded px-2 py-2 text-base" value={form.role} onChange={e=>setForm({...form,role:e.target.value})}>
          <option>WAITER</option><option>BILLER</option><option>KITCHEN</option><option>ADMIN</option>
        </select></label>
        <button className="min-h-11 self-end px-3 py-2 bg-slate-900 text-white rounded text-sm" onClick={()=>form.name&&form.email&&form.password && create.mutate(form)}>Add</button>
      </div>
      <div className="bg-white rounded border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-100"><tr><th className="p-2 text-left">Name</th><th className="p-2 text-left">Email</th><th className="p-2">Role</th><th className="p-2">Active</th><th className="p-2"></th></tr></thead>
          <tbody>
            {users.map((u:any)=>(
              <tr key={u.id} className="border-t">
                <td className="p-2">{u.name}</td>
                <td className="p-2">{u.email}</td>
                <td className="p-2 text-center">{u.role}</td>
                <td className="p-2 text-center">{u.active?'Yes':'No'}</td>
                <td className="p-2 text-center">{u.active && <button onClick={()=>deactivate.mutate(u.id)} className="text-red-600 text-xs">Deactivate</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
