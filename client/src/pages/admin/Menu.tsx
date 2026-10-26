import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { del, get, patch, post } from '../../lib/api';
import MenuCategoryTabs, {
  MenuCategoryIcon,
} from '../../components/MenuCategoryTabs';
import { categoryIconOptions, defaultCategoryColor, type MenuCategory } from '../../lib/menuCategories';

interface AdminMenuItem {
  id: string;
  name: string;
  categoryId: string;
  category?: MenuCategory | null;
  priceMinor: number;
  discountPercent?: number;
  available: boolean;
  soldOut: boolean;
}

interface NewMenuItem {
  name: string;
  categoryId: string;
  description: string;
  priceMinor: number;
  discountPercent: number;
}

export default function AdminMenu() {
  const qc = useQueryClient();
  const [form, setForm] = useState({ name: '', categoryId: '', price: '', discountPercent: '0', description: '' });
  const [catForm, setCatForm] = useState('');
  const [editingCategory, setEditingCategory] = useState<{ id: string; name: string } | null>(null);
  const [discountDrafts, setDiscountDrafts] = useState<Record<string, string>>({});
  const categoriesQ = useQuery<{ categories: MenuCategory[] }>({
    queryKey: ['categories'],
    queryFn: () => get('/menu/categories'),
  });
  const itemsQ = useQuery<{ items: AdminMenuItem[] }>({
    queryKey: ['menu-items'],
    queryFn: () => get('/menu/items'),
  });

  const createCat = useMutation({
    mutationFn: (input: { name: string; color: string; icon: string; displayOrder: number }) => post('/menu/categories', input),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['categories'] });
      await qc.invalidateQueries({ queryKey: ['menu-items'] });
      await qc.invalidateQueries({ queryKey: ['public-menu'] });
      setCatForm('');
    },
  });
  const updateCategory = useMutation({
    mutationFn: ({ id, ...input }: { id: string; name?: string; color?: string; icon?: string; displayOrder?: number }) =>
      patch(`/menu/categories/${id}`, input),
    onSuccess: async (_data, variables) => {
      await qc.invalidateQueries({ queryKey: ['categories'] });
      await qc.invalidateQueries({ queryKey: ['menu-items'] });
      await qc.invalidateQueries({ queryKey: ['public-menu'] });
      if (variables.name !== undefined) setEditingCategory(null);
    },
  });
  const deleteCategory = useMutation({
    mutationFn: (id: string) => del(`/menu/categories/${id}`),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['categories'] });
      await qc.invalidateQueries({ queryKey: ['menu-items'] });
      await qc.invalidateQueries({ queryKey: ['public-menu'] });
    },
  });
  const createItem = useMutation({
    mutationFn: (item: NewMenuItem) => post('/menu/items', item),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['menu-items'] });
      await qc.invalidateQueries({ queryKey: ['public-menu'] });
      setForm({ name: '', categoryId: '', price: '', discountPercent: '0', description: '' });
    },
  });
  const toggleAvailability = useMutation({
    mutationFn: ({ id, available }: { id: string; available: boolean }) =>
      patch(`/menu/items/${id}/availability`, { available }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['menu-items'] }),
  });
  const toggleStock = useMutation({
    mutationFn: ({ id, soldOut }: { id: string; soldOut: boolean }) =>
      patch(`/menu/items/${id}/availability`, { soldOut }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['menu-items'] }),
  });
  const moveItemCategory = useMutation({
    mutationFn: ({ id, categoryId }: { id: string; categoryId: string }) =>
      patch(`/menu/items/${id}`, { categoryId }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['menu-items'] });
      await qc.invalidateQueries({ queryKey: ['public-menu'] });
    },
  });
  const updateItemDiscount = useMutation({
    mutationFn: ({ id, discountPercent }: { id: string; discountPercent: number }) =>
      patch(`/menu/items/${id}`, { discountPercent }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['menu-items'] });
      await qc.invalidateQueries({ queryKey: ['public-menu'] });
    },
  });

  const categories = categoriesQ.data?.categories ?? [];
  const menuItems = itemsQ.data?.items ?? [];
  const error = createCat.error || updateCategory.error || deleteCategory.error || createItem.error ||
    toggleAvailability.error || toggleStock.error || moveItemCategory.error || updateItemDiscount.error;
  const moveCategory = (index: number, direction: -1 | 1) => {
    const category = categories[index];
    const neighbor = categories[index + direction];
    if (!category || !neighbor) return;
    updateCategory.mutate({ id: category.id, displayOrder: neighbor.displayOrder ?? index + direction });
    updateCategory.mutate({ id: neighbor.id, displayOrder: category.displayOrder ?? index });
  };

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold">Menu Management</h2>

      {error && (
        <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
          {error instanceof Error ? error.message : 'Menu update failed. Please try again.'}
        </p>
      )}

      <div className="rounded border bg-white p-4">
        <h3 className="mb-2 font-medium">Categories</h3>
        <div className="mb-2 flex gap-2">
          <label className="sr-only" htmlFor="new-category">New category</label>
          <input
            id="new-category"
            className="min-w-0 flex-1 rounded border px-2 py-2 text-base"
            value={catForm}
            onChange={(event) => setCatForm(event.target.value)}
          />
          <button
            type="button"
            disabled={!catForm.trim() || createCat.isPending}
            onClick={() => createCat.mutate({
              name: catForm.trim(),
              color: defaultCategoryColor,
              icon: 'UtensilsCrossed',
              displayOrder: categories.length,
            })}
            className="rounded bg-slate-900 px-3 py-1 text-sm text-white disabled:opacity-50"
          >
            {createCat.isPending ? 'Adding…' : 'Add'}
          </button>
        </div>
        {categoriesQ.isError ? (
          <p role="alert" className="text-sm text-rose-700">Categories could not be loaded.</p>
        ) : (
          <div className="space-y-2">
            {categories.map((category, index) => {
              const assignedItemCount = menuItems.filter((item) => item.categoryId === category.id).length;
              return (
              <div key={category.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
                {editingCategory?.id === category.id ? (
                  <form
                    className="flex min-w-48 flex-1 items-center gap-2"
                    onSubmit={(event) => {
                      event.preventDefault();
                      if (editingCategory.name.trim()) {
                        updateCategory.mutate({ id: category.id, name: editingCategory.name.trim() });
                      }
                    }}
                  >
                    <input
                      aria-label={`Rename ${category.name}`}
                      className="min-w-0 flex-1 rounded border px-2 py-1.5 text-sm"
                      value={editingCategory.name}
                      onChange={(event) => setEditingCategory({ ...editingCategory, name: event.target.value })}
                    />
                    <button
                      type="submit"
                      disabled={!editingCategory.name.trim() || updateCategory.isPending}
                      className="rounded bg-slate-900 px-2.5 py-1.5 text-xs text-white disabled:opacity-50"
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingCategory(null)}
                      className="rounded border bg-white px-2.5 py-1.5 text-xs"
                    >
                      Cancel
                    </button>
                  </form>
                ) : (
                  <span className="inline-flex min-w-32 items-center gap-2 text-sm font-medium">
                    <MenuCategoryIcon category={category} className="h-4 w-4" />
                    {category.name}
                    <button
                      type="button"
                      onClick={() => setEditingCategory({ id: category.id, name: category.name })}
                      className="rounded border border-slate-200 bg-white px-2 py-1 text-xs"
                    >
                      Rename
                    </button>
                  </span>
                )}
                <label className="flex items-center gap-2 text-xs text-slate-600">
                  Tab color
                  <input
                    type="color"
                    aria-label={`${category.name} tab color`}
                    value={category.color || defaultCategoryColor}
                    disabled={updateCategory.isPending}
                    onChange={(event) => updateCategory.mutate({ id: category.id, color: event.target.value })}
                    className="h-8 w-10 cursor-pointer rounded border border-slate-200 bg-white p-1 disabled:opacity-60"
                  />
                </label>
                <label className="flex items-center gap-2 text-xs text-slate-600">
                  Icon
                  <select
                    aria-label={`${category.name} icon`}
                    value={category.icon || 'UtensilsCrossed'}
                    disabled={updateCategory.isPending}
                    onChange={(event) => updateCategory.mutate({ id: category.id, icon: event.target.value })}
                    className="rounded border border-slate-200 bg-white px-2 py-1.5 text-sm disabled:opacity-60"
                  >
                    {categoryIconOptions.map((icon) => <option key={icon} value={icon}>{icon}</option>)}
                  </select>
                </label>
                {assignedItemCount > 0 && (
                  <span className="w-full text-xs text-slate-500 sm:w-auto">
                    {assignedItemCount} menu item{assignedItemCount === 1 ? '' : 's'} assigned
                  </span>
                )}
                <span className="ml-auto flex items-center gap-1">
                  <button
                    type="button"
                    aria-label={`Move ${category.name} up`}
                    disabled={index === 0 || updateCategory.isPending}
                    onClick={() => moveCategory(index, -1)}
                    className="rounded border border-slate-200 bg-white px-2 py-1 text-sm disabled:opacity-40"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    aria-label={`Move ${category.name} down`}
                    disabled={index === categories.length - 1 || updateCategory.isPending}
                    onClick={() => moveCategory(index, 1)}
                    className="rounded border border-slate-200 bg-white px-2 py-1 text-sm disabled:opacity-40"
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    disabled={
                      assignedItemCount > 0 ||
                      itemsQ.isLoading || itemsQ.isError || deleteCategory.isPending
                    }
                    title={
                      assignedItemCount > 0
                        ? 'Move all menu items to another category before deleting'
                        : 'Delete category'
                    }
                    onClick={() => {
                      if (window.confirm(`Delete the "${category.name}" category?`)) {
                        deleteCategory.mutate(category.id);
                      }
                    }}
                    className="rounded border border-rose-200 bg-white px-2 py-1 text-xs text-rose-700 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Delete
                  </button>
                </span>
              </div>
              );
            })}
            <div className="pt-1">
              <MenuCategoryTabs
                categories={categories}
                value="All"
                onChange={() => undefined}
                label="Preview category styles"
              />
            </div>
          </div>
        )}
      </div>

      <div className="rounded border bg-white p-4">
        <h3 className="mb-2 font-medium">Add Item</h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-4">
          <label className="block text-sm">
            Name
            <input
              aria-label="Menu item name"
              className="mt-1 block w-full min-w-0 rounded border px-2 py-2 text-base"
              value={form.name}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
            />
          </label>
          <label className="block text-sm">
            Category
            <select
              className="mt-1 block w-full min-w-0 rounded border px-2 py-2 text-base"
              value={form.categoryId}
              onChange={(event) => setForm({ ...form, categoryId: event.target.value })}
            >
              <option value="">Category</option>
              {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
            </select>
          </label>
          <label className="block text-sm">
            Price (NPR)
            <input
              type="number"
              min="0.01"
              step="0.01"
              className="mt-1 block w-full min-w-0 rounded border px-2 py-2 text-base"
              value={form.price}
              onChange={(event) => setForm({ ...form, price: event.target.value })}
            />
          </label>
          <label className="block text-sm">
            Description
            <input
              className="mt-1 block w-full min-w-0 rounded border px-2 py-2 text-base"
              value={form.description}
              onChange={(event) => setForm({ ...form, description: event.target.value })}
            />
          </label>
          <label className="block text-sm">
            Discount (%)
            <input
              type="number"
              min="0"
              max="100"
              step="0.01"
              aria-label="Item discount percentage"
              className="mt-1 block w-full min-w-0 rounded border px-2 py-2 text-base"
              value={form.discountPercent}
              onChange={(event) => setForm({ ...form, discountPercent: event.target.value })}
            />
          </label>
        </div>
        <button
          type="button"
          disabled={!form.name.trim() || !form.categoryId || !form.price || !Number.isFinite(Number(form.price)) || Number(form.price) <= 0 ||
            !Number.isFinite(Number(form.discountPercent)) || Number(form.discountPercent) < 0 || Number(form.discountPercent) > 100 || createItem.isPending}
          className="mt-2 rounded bg-slate-900 px-3 py-1 text-sm text-white disabled:opacity-50"
          onClick={() => createItem.mutate({
            categoryId: form.categoryId,
            name: form.name.trim(),
            description: form.description,
            priceMinor: Math.round(Number(form.price) * 100),
            discountPercent: Number(form.discountPercent),
          })}
        >
          {createItem.isPending ? 'Adding…' : 'Add Item'}
        </button>
      </div>

      <div className="overflow-hidden rounded border bg-white">
        {itemsQ.isError ? (
          <p role="alert" className="p-4 text-sm text-rose-700">Menu items could not be loaded.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[680px] text-sm">
              <thead className="bg-slate-100">
                <tr>
                  <th className="p-2 text-left">Name</th>
                  <th className="p-2 text-left">Category</th>
                  <th className="p-2 text-right">Price</th>
                  <th className="p-2 text-center">Discount</th>
                  <th className="p-2">Available</th>
                  <th className="p-2">Stock status</th>
                </tr>
              </thead>
              <tbody>
                {menuItems.map((item) => {
                  const isUpdatingStock = toggleStock.isPending && toggleStock.variables?.id === item.id;
                  const isUpdatingAvailability = toggleAvailability.isPending && toggleAvailability.variables?.id === item.id;
                  return (
                    <tr key={item.id} className="border-t">
                      <td className="p-2">{item.name}</td>
                      <td className="p-2">
                        <select
                          aria-label={`${item.name} category`}
                          value={item.categoryId}
                          disabled={moveItemCategory.isPending && moveItemCategory.variables?.id === item.id}
                          onChange={(event) => moveItemCategory.mutate({ id: item.id, categoryId: event.target.value })}
                          className="max-w-48 rounded border bg-white px-2 py-1.5 disabled:opacity-60"
                        >
                          {categories.map((category) => (
                            <option key={category.id} value={category.id}>{category.name}</option>
                          ))}
                        </select>
                      </td>
                      <td className="p-2 text-right">
                        {(Math.round(item.priceMinor * (100 - (item.discountPercent || 0)) / 100) / 100).toFixed(2)}
                        {item.discountPercent ? <span className="ml-1 text-xs text-rose-700">({item.discountPercent}% off)</span> : null}
                      </td>
                      <td className="p-2">
                        <form
                          className="flex items-center justify-center gap-1"
                          onSubmit={(event) => {
                            event.preventDefault();
                            const discountPercent = Number(discountDrafts[item.id] ?? item.discountPercent ?? 0);
                            if (!Number.isFinite(discountPercent)) {
                              event.currentTarget.reportValidity();
                              return;
                            }
                            updateItemDiscount.mutate({ id: item.id, discountPercent });
                          }}
                        >
                          <input
                            type="number"
                            min="0"
                            max="100"
                            step="0.01"
                            required
                            aria-label={`${item.name} discount percentage`}
                            value={discountDrafts[item.id] ?? String(item.discountPercent ?? 0)}
                            onChange={(event) => setDiscountDrafts((current) => ({ ...current, [item.id]: event.target.value }))}
                            className="w-16 rounded border px-1.5 py-1 text-center"
                          />
                          <span className="text-xs">%</span>
                          <button
                            type="submit"
                            disabled={updateItemDiscount.isPending && updateItemDiscount.variables?.id === item.id}
                            className="rounded border border-rose-200 px-2 py-1 text-xs text-rose-700 disabled:opacity-50"
                          >
                            Save
                          </button>
                        </form>
                      </td>
                      <td className="p-2 text-center">
                        <input
                          type="checkbox"
                          aria-label={`${item.name} available on menu`}
                          checked={item.available}
                          disabled={isUpdatingAvailability}
                          onChange={(event) => toggleAvailability.mutate({ id: item.id, available: event.target.checked })}
                        />
                      </td>
                      <td className="p-2 text-center">
                        <button
                          type="button"
                          disabled={isUpdatingStock}
                          aria-label={`${item.name}: ${item.soldOut ? 'out of stock; mark in stock' : 'in stock; mark out of stock'}`}
                          onClick={() => toggleStock.mutate({ id: item.id, soldOut: !item.soldOut })}
                          className={`min-w-28 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors disabled:cursor-wait disabled:opacity-60 ${
                            item.soldOut
                              ? 'bg-rose-50 text-rose-700 hover:bg-rose-100'
                              : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                          }`}
                        >
                          {isUpdatingStock ? 'Updating…' : item.soldOut ? 'Out of stock' : 'In stock'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
                {!itemsQ.isLoading && menuItems.length === 0 && (
                  <tr><td colSpan={6} className="p-6 text-center text-sm text-slate-500">No menu items yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
