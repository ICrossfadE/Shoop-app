'use client';
import type { MutationData } from '@/lib/list-model';
import { useState, useTransition, useOptimistic, useRef, type FormEvent } from 'react';
import { listCache, discardDeniedAccess } from '@/lib/use-list';
import { createTag } from './actions';
import TagBadge from '../components/TagBadge';
import type { Tag } from '@/lib/tags';

// The form previews the exact shared badge and keeps input on failure.
export default function TagManager({ workspaceId, tags, onChange }: { workspaceId: string; tags: Tag[]; onChange?: (change: MutationData) => void }) {
  const operationId = useRef(crypto.randomUUID());
  const [ambiguous, setAmbiguous] = useState(false);
  const [visible, addTag] = useOptimistic(tags, (previous: Tag[], tag: Tag) => previous.some((item) => item.name.toLowerCase() === tag.name.toLowerCase()) ? previous : [...previous, tag]);
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
      addTag({ id: operationId.current, workspace_id: workspaceId, name: name.trim(), color, created_by: '', created_at: new Date().toISOString(), updated_at: new Date().toISOString() });
      try {
        const result = await createTag(workspaceId, name, color, operationId.current);
      if (discardDeniedAccess(result)) return;
        if (!result.ok) { setError(result.error); setAmbiguous(!!result.ambiguous); if (!result.ambiguous) operationId.current = crypto.randomUUID(); }
        else { onChange?.(result.data); listCache.invalidate(); operationId.current = crypto.randomUUID(); setAmbiguous(false); setName(''); setNotice('Тег створено.'); }
      } catch { setAmbiguous(true); setError('Немає відповіді. Повторіть із тими самими даними.'); }
    });
  }
  return <div className="space-y-3">
    {/* Shared Workspace tag creation, with a native color picker. */}
    <form onSubmit={submit} className="tag-create space-y-3" aria-busy={pending}>
      <fieldset disabled={pending || ambiguous} className="tag-create-fields">
        <div><label htmlFor="tag-name" className="block font-medium">Назва</label><input id="tag-name" name="name" required maxLength={120} value={name} onChange={(event) => setName(event.target.value)} className="mt-1 w-full rounded border border-line px-3 py-2" /></div>
        <div><label htmlFor="tag-color" className="block font-medium">Колір</label><input id="tag-color" name="color" type="color" required value={color} onChange={(event) => setColor(event.target.value.toUpperCase())} className="mt-1 h-11 w-12 cursor-pointer" /></div>
        <div aria-label="Попередній вигляд тегу"><TagBadge tag={{ name: name.trim() || 'Назва тегу', color }} /></div>
      </fieldset>
      {error && <p role="alert" className="text-danger">{error}</p>}
      <button disabled={pending} className="rounded button-primary px-4 py-2 disabled:opacity-50">{pending ? 'Збереження…' : 'Створити тег'}</button>
      <p role="status" className="text-sm text-muted">{pending ? 'Зберігається…' : notice}</p>
    </form>
    {/* Tags exist independently of any product. */}
    <section aria-labelledby="workspace-tags"><h2 id="workspace-tags" className="mb-2 text-sm font-medium text-muted">Теги простору</h2>
      {visible.length === 0 ? <p>Тегів ще немає. Створіть перший тег.</p> : <ul className="flex flex-wrap gap-3">{visible.map((tag) => <li key={tag.id}><TagBadge tag={tag} /></li>)}</ul>}
    </section>
  </div>;
}
