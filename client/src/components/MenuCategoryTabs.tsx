import { categoryIcons, getMenuCategoryColor, type MenuCategory } from '../lib/menuCategories';
export type { MenuCategory } from '../lib/menuCategories';

export function MenuCategoryIcon({
  category,
  className = 'h-4 w-4',
}: {
  category?: Pick<MenuCategory, 'icon'> | null;
  className?: string;
}) {
  const Icon = categoryIcons[category?.icon ?? ''] ?? categoryIcons.UtensilsCrossed;
  return <Icon aria-hidden="true" className={className} />;
}

export default function MenuCategoryTabs({
  categories,
  value,
  onChange,
  label,
}: {
  categories: MenuCategory[];
  value: string;
  onChange: (name: string) => void;
  label: string;
}) {
  return (
    <div className="flex min-w-0 gap-1.5 overflow-x-auto pb-1" role="group" aria-label={label}>
      <button
        type="button"
        aria-pressed={value === 'All'}
        onClick={() => onChange('All')}
        className={`shrink-0 rounded-full border px-3 py-1.5 text-[10px] font-semibold transition-colors sm:px-3.5 sm:text-xs ${
          value === 'All'
            ? 'border-[#07856c] bg-[#07856c] text-white shadow-sm'
            : 'border-[#e2ebe5] bg-white/90 text-[#60786b] hover:bg-[#f4f9f5]'
        }`}
      >
        All
      </button>
      {categories.filter((category) => category.active !== false).map((category) => {
        const selected = value === category.name;
        const color = getMenuCategoryColor(category);
        return (
          <button
            key={category.id}
            type="button"
            aria-pressed={selected}
            onClick={() => onChange(category.name)}
            style={selected
              ? { backgroundColor: color, borderColor: color, color: '#fff' }
              : { borderColor: `${color}45`, color, backgroundColor: '#ffffffd9' }}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-[10px] font-semibold transition-colors hover:brightness-[.97] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 sm:px-3.5 sm:text-xs"
          >
            <MenuCategoryIcon category={category} className="h-3.5 w-3.5" />
            {category.name}
          </button>
        );
      })}
    </div>
  );
}
