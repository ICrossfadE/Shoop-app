'use client';
import { useState, useTransition, type FormEvent } from 'react';
import { saveCategory, deleteCategory } from '@/app/categories/actions';
import type { Category } from '@/lib/categories';

// Inline create/rename controls preserve input on error; FK protects nonempty deletion.
export default function CategoryManager({ workspaceId, categories }: { workspaceId: string; categories: Category[] }) {
  const [name, setName] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [pending, startTransition] = useTransition();

  // Save names only; database owns identity and Workspace restrictions.
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setError(''); setNotice('');
    startTransition(async () => {
      try {
        const result = await saveCategory(workspaceId, editing, name);
        if (!result.ok) setError(result.error);
        else { setName(''); setEditing(null); setNotice('Категорію збережено.'); }
      } catch { setError('Не вдалося зберегти. Спробуйте знову.'); }
    });
  }

  // Direct deletion is safe even if a product was concurrently added.
  function remove(category: Category) {
    if (pending || !window.confirm(`Видалити категорію «${category.name}»?`)) return;
    setError(''); setNotice('');
    startTransition(async () => {
      try {
        const result = await deleteCategory(workspaceId, category.id);
        if (!result.ok) setError(result.error);
        else { if (editing === category.id) { setName(''); setEditing(null); } setNotice('Категорію видалено.'); }
      } catch { setError('Не вдалося видалити. Спробуйте знову.'); }
    });
  }

  return <details className="rounded border border-line bg-surface p-4" open={categories.length === 0 || undefined}>
    <summary className="cursor-pointer font-semibold">Керування категоріями</summary>
    {/* Category creation and rename form. */}
    <form onSubmit={submit} className="my-4 space-y-2">
      <label htmlFor="category-name" className="block">{editing ? 'Нова назва категорії' : 'Назва нової категорії'}</label>
      <input id="category-name" required maxLength={120} value={name} disabled={pending} onChange={(event) => setName(event.target.value)} className="w-full rounded border border-line px-3 py-2" />
      <div className="flex flex-wrap gap-2">
        <button disabled={pending} className="rounded bg-blue-600 px-3 py-2 text-white disabled:opacity-50">{pending ? 'Збереження…' : editing ? 'Перейменувати' : 'Створити категорію'}</button>
        {editing && <button type="button" disabled={pending} onClick={() => { setEditing(null); setName(''); }} className="rounded border px-3 py-2">Скасувати</button>}
      </div>
    </form>
    {error && <p role="alert" className="my-2 text-danger">{error}</p>}
    <p role="status" className="text-sm text-muted">{notice}</p>
    {/* Workspace category actions. */}
    <ul className="space-y-3">{categories.map((category) => <li key={category.id} className="flex flex-wrap items-center gap-2 border-t pt-3">
      <span className="min-w-0 flex-1 break-words [overflow-wrap:anywhere]">{category.name}</span>
      <button disabled={pending} onClick={() => { setEditing(category.id); setName(category.name); setError(''); setNotice(''); }} className="rounded border px-2 py-1">Редагувати</button>
      <button disabled={pending} onClick={() => remove(category)} className="rounded border border-danger px-2 py-1 text-danger">Видалити</button>
    </li>)}</ul>
  </details>;
}
