const stages: Record<string, { label: string; className: string }> = {
  SUBMITTED: { label: 'Sent to kitchen', className: 'bg-slate-100 text-slate-700' },
  ACCEPTED: { label: 'Accepted', className: 'bg-sky-50 text-sky-700' },
  PREPARING: { label: 'Preparing', className: 'bg-amber-50 text-amber-800' },
  READY: { label: 'Ready', className: 'bg-emerald-50 text-emerald-700' },
  SERVED: { label: 'Served', className: 'bg-violet-50 text-violet-700' },
};

export default function KitchenOrderStage({ status }: { status: string }) {
  const stage = stages[status];
  if (!stage) return null;

  return (
    <span
      role="status"
      aria-label={`Current kitchen stage: ${stage.label}`}
      className={`inline-flex w-fit max-w-full shrink-0 items-center rounded-full px-2.5 py-1 text-[10px] font-semibold leading-tight ${stage.className}`}
    >
      <span className="truncate">{stage.label}</span>
    </span>
  );
}
