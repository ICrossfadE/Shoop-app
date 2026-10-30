'use client';
import { useState, useTransition, type FormEvent } from 'react';
import { createTag } from './actions';
import TagBadge from '../components/TagBadge';
import type { Tag } from '@/lib/tags';

// The form previews the exact shared badge and keeps input on failure.
export default function TagManager({ workspaceId, tags }: { workspaceId: string; tags: Tag[] }) {
  const [name, setName] = useState('');
  const [color, setColor] = useState('#2563EB');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [pending, startTransition] = useTransition();
  // Prevent repeat submits while the server writes and revalidates the list.
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setError(''); setNotice('');
    startTransition(async () => {
      try {
        const result = await createTag(workspaceId, name, color);
        if (!result.ok) setError(result.error);
        else { setName(''); setNotice('Тег створено.'); }
      } catch { setError('Не вдалося зберегти тег. Спробуйте знову.'); }
    });
  }
  return <div className="space-y-6">
    {/* Shared Workspace tag creation, with a native color picker. */}
    <form onSubmit={submit} className="space-y-4 rounded-lg bg-surface p-5 shadow-sm" aria-busy={pending}>
      <fieldset disabled={pending} className="space-y-3">
        <div><label htmlFor="tag-name" className="block font-medium">Назва</label><input id="tag-name" name="name" required maxLength={120} value={name} onChange={(event) => setName(event.target.value)} className="mt-1 w-full rounded border border-line px-3 py-2" /></div>
        <div><label htmlFor="tag-color" className="block font-medium">Колір</label><input id="tag-color" name="color" type="color" required value={color} onChange={(event) => setColor(event.target.value.toUpperCase())} className="mt-1 h-12 w-20 cursor-pointer" /><span className="ml-3 text-sm">{color}</span></div>
        <div aria-label="Попередній вигляд тегу"><TagBadge tag={{ name: name.trim() || 'Назва тегу', color }} /></div>
      </fieldset>
      {error && <p role="alert" className="text-danger">{error}</p>}
      <button disabled={pending} className="rounded button-primary px-4 py-2 disabled:opacity-50">{pending ? 'Збереження…' : 'Створити тег'}</button>
      <p role="status" className="text-sm text-muted">{notice}</p>
    </form>
    {/* Tags exist independently of any product. */}
    <section aria-labelledby="workspace-tags"><h2 id="workspace-tags" className="mb-3 text-lg font-semibold">Теги простору</h2>
      {tags.length === 0 ? <p>Тегів ще немає. Створіть перший тег.</p> : <ul className="flex flex-wrap gap-3">{tags.map((tag) => <li key={tag.id}><TagBadge tag={tag} /></li>)}</ul>}
    </section>
  </div>;
}
