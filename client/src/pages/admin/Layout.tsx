import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../lib/auth';

const nav = [
  { to: '/admin', label: 'Overview' },
  { to: '/admin/menu', label: 'Menu' },
  { to: '/admin/tables', label: 'Tables' },
  { to: '/admin/staff', label: 'Staff' },
  { to: '/admin/reports', label: 'Reports' },
  { to: '/admin/settings', label: 'Settings' },
];

export default function AdminLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  return (
    <div className="min-h-screen flex">
      <aside className="w-56 bg-slate-900 text-white p-4 space-y-2">
        <div className="font-semibold mb-4">Admin</div>
        {nav.map(n => (
          <NavLink key={n.to} to={n.to} end={n.to==='/admin'} className={({isActive})=>`block px-3 py-2 rounded ${isActive?'bg-slate-700':'hover:bg-slate-800'}`}>{n.label}</NavLink>
        ))}
        <button onClick={async()=>{await logout(); navigate('/login', { replace: true });}} className="block w-full text-left px-3 py-2 rounded hover:bg-slate-800 mt-6">Logout</button>
      </aside>
      <main className="flex-1 p-6 bg-slate-50">
        <div className="mb-4 text-sm text-slate-500">{user?.name}</div>
        <Outlet />
      </main>
    </div>
  );
}
