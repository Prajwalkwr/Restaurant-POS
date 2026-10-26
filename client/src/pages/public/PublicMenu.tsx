import { useQuery } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';
import { get } from '../../lib/api';
import { getMenuImageUrl } from '../../lib/menuImages';
import PhoneLink from '../../components/PhoneLink';
import { MenuCategoryIcon } from '../../components/MenuCategoryTabs';
import { getMenuCategoryColor, type MenuCategory } from '../../lib/menuCategories';

interface PublicMenuItem {
  id: string;
  categoryId: string;
  name: string;
  description?: string | null;
  priceMinor: number;
  discountPercent: number;
  imageUrl?: string | null;
  available: boolean;
  soldOut: boolean;
}

interface PublicMenuResponse {
  restaurant?: {
    name: string;
    address?: string | null;
    phone?: string | null;
  };
  categories: (MenuCategory & { description?: string | null })[];
  items: PublicMenuItem[];
}

function BackToHome() {
  return (
    <Link
      to="/"
      className="mb-5 inline-flex min-h-10 items-center gap-2 rounded-full border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 shadow-sm transition hover:border-emerald-200 hover:bg-emerald-50 hover:text-emerald-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2"
    >
      <ArrowLeft className="h-4 w-4" aria-hidden="true" />
      Back to home
    </Link>
  );
}

export default function PublicMenu() {
  const { data, isPending, isError } = useQuery<PublicMenuResponse>({
    queryKey: ['public-menu'],
    queryFn: () => get<PublicMenuResponse>('/public/menu'),
  });
  const cats = data?.categories ?? [];
  const items = data?.items ?? [];
  const pageClassName = 'mx-auto w-full max-w-screen-2xl px-4 py-6 sm:px-6 lg:px-10';

  if (isPending) {
    return <main className={`${pageClassName} text-sm text-slate-600`}><BackToHome /><p role="status">Loading menu...</p></main>;
  }

  if (isError) {
    return <main className={`${pageClassName} text-sm text-red-700`}><BackToHome /><p role="alert">The menu could not be loaded. Please try again later.</p></main>;
  }

  return (
    <main className={`${pageClassName} pb-12`}>
      <BackToHome />
      <h1 className="mb-1 text-2xl font-semibold">{data?.restaurant?.name ?? 'Restaurant Menu'}</h1>
      <p className="mb-6 flex flex-wrap items-center gap-x-1 text-sm text-slate-500">
        {data?.restaurant?.address}
        {data?.restaurant?.phone && <><span aria-hidden="true">·</span><PhoneLink phone={data.restaurant.phone} className="underline decoration-slate-300 underline-offset-2 hover:text-emerald-800" /></>}
      </p>
      {cats.length === 0 ? (
        <p className="mt-6 rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-600">No menu categories are available right now.</p>
      ) : cats.map((c) => {
        const categoryItems = items.filter((item) => item.categoryId === c.id);
        return (
        <section key={c.id} className="mt-8">
          <h2 className="mb-2 flex items-center gap-2 border-l-4 pl-3 text-lg font-semibold" style={{ borderColor: getMenuCategoryColor(c), color: getMenuCategoryColor(c) }}>
            <MenuCategoryIcon category={c} className="h-5 w-5" />
            {c.name}
          </h2>
          {c.description && <p className="mb-2 text-sm text-slate-500">{c.description}</p>}
          {categoryItems.length === 0 ? (
            <p className="rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-500">No items in this category yet.</p>
          ) : (
            <div className="grid items-start gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {categoryItems.map((it) => (
              <article key={it.id} className="min-w-0 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                {getMenuImageUrl(it.name, it.imageUrl) && <img src={getMenuImageUrl(it.name, it.imageUrl)!} alt={it.name} loading="lazy" className="h-44 w-full object-cover" />}
                <div className="p-4">
                <h3 className="font-semibold text-slate-900">{it.name}</h3>
                {it.description && <p className="mt-1 text-sm text-slate-500">{it.description}</p>}
                <div className="mt-1 flex items-center gap-2 text-sm">
                  <span className={it.discountPercent ? 'font-semibold text-rose-700' : ''}>
                    NPR {(Math.round(it.priceMinor * (100 - (it.discountPercent || 0)) / 100) / 100).toFixed(2)}
                  </span>
                  {it.discountPercent > 0 && (
                    <>
                      <span className="text-xs text-slate-500 line-through">NPR {(it.priceMinor / 100).toFixed(2)}</span>
                      <span className="rounded bg-rose-50 px-1.5 py-0.5 text-xs font-semibold text-rose-700">{it.discountPercent}% off</span>
                    </>
                  )}
                </div>
                {!it.available || it.soldOut ? <div className="mt-1 text-xs font-medium text-red-600">Unavailable</div> : null}
                </div>
              </article>
            ))}
            </div>
          )}
        </section>
      )})}
    </main>
  );
}
