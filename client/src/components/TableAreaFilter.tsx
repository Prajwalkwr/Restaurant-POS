interface TableArea {
  name: string;
  count: number;
}

interface TableAreaFilterProps {
  areas: TableArea[];
  value: string;
  onChange: (area: string) => void;
  label: string;
}

export default function TableAreaFilter({ areas, value, onChange, label }: TableAreaFilterProps) {
  const total = areas.reduce((sum, area) => sum + area.count, 0);
  const options = [{ name: 'All', count: total }, ...areas];

  return (
    <div className="overflow-x-auto pb-1">
      <div role="group" aria-label={label} className="inline-flex min-w-full w-max items-center gap-1 rounded-xl border border-[#e3ebe6] bg-[#f1f5f2] p-1 sm:min-w-0">
        {options.map((area) => {
          const selected = value === area.name;
          return (
            <button
              key={area.name}
              type="button"
              onClick={() => onChange(area.name)}
              aria-pressed={selected}
              className={`inline-flex min-h-10 shrink-0 items-center gap-2 rounded-lg px-3.5 text-xs font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 sm:px-4 ${
                selected ? 'bg-[#07856c] text-white shadow-sm' : 'text-[#5d6e64] hover:bg-white hover:text-[#203a30]'
              }`}
            >
              {area.name}
              <span className={selected ? 'text-white/75' : 'text-[#89978f]'}>{area.count}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
