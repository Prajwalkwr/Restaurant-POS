import { useAuth } from '../lib/auth';

export default function WaiterProfileFooter() {
  const { user } = useAuth();
  const name = user?.name || 'Waiter';
  const initials = name
    .trim()
    .split(/\s+/)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <footer className="mt-6 flex items-center gap-3 rounded-2xl border border-[#dce8e1] bg-white px-4 py-3 shadow-sm">
      <div aria-hidden="true" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#dff1e8] text-sm font-semibold text-[#205943]">
        {initials}
      </div>
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-[#293d34]">{name}</p>
        <p className="text-xs text-[#77817b]">Waiter</p>
      </div>
    </footer>
  );
}
