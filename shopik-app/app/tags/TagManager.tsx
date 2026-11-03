'use client';
import type { MutationData } from '@/lib/list-model';
import { useId, useState, useTransition, useOptimistic, useRef, type FormEvent } from 'react';
import { listCache, discardDeniedAccess } from '@/lib/use-list';
import { createTag, deleteTag } from './actions';
import TagBadge from '../components/TagBadge';
import type { Tag } from '@/lib/tags';

// The form previews the exact shared badge and keeps input on failure.
export default function TagManager({ workspaceId, tags, onChange, createOnly = false }: { workspaceId: string; tags: Tag[]; onChange?: (change: MutationData) => void; createOnly?: boolean }) {
  const inputId = useId();
  const [deleting, setDeleting] = useState<Tag | null>(null);
  const deleteOperation = useRef(crypto.randomUUID());
  const [deletePending, setDeletePending] = useState(false);
  const [deleteAmbiguous, setDeleteAmbiguous] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const deleteBusy = useRef(false);
  // A stable delete key survives a lost response and keeps the exact target locked.
  async function removeTag() {
    if (!deleting || deleteBusy.current) return;
    const owner = listCache.owner, scope = owner + ':' + workspaceId;
    const membership = listCache.memberships.get(scope);
    deleteBusy.current = true; setDeletePending(true); setDeleteError('');
    try {
      const result = await deleteTag(workspaceId, deleting.id, deleteOperation.current);
      if (listCache.owner !== owner || listCache.memberships.get(scope) !== membership) return;
      if (discardDeniedAccess(result)) return;
      if (result.ok) {
        const next = new URLSearchParams(window.location.search);
        const ids = next.getAll('tag').filter(id => id !== deleting.id); next.delete('tag'); ids.forEach(id => next.append('tag', id));
        window.history.replaceState(null, '', window.location.pathname + '?' + next);
        onChange?.(result.data); listCache.invalidateLocal(listCache.owner + ':' + workspaceId); listCache.invalidate(); setDeleting(null); setDeleteAmbiguous(false); deleteOperation.current = crypto.randomUUID();
      } else { setDeleteError(result.error); setDeleteAmbiguous(!!result.ambiguous); if (!result.ambiguous) deleteOperation.current = crypto.randomUUID(); }
    } catch { setDeleteAmbiguous(true); setDeleteError('Немає відповіді. Повторіть видалення того самого тегу.'); }
    finally { deleteBusy.current = false; setDeletePending(false); }
  }
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
  return <div className="space-y-3" data-locked={pending || ambiguous || deletePending || deleteAmbiguous}>
    {/* Shared Workspace tag creation, with a native color picker. */}
    <form onSubmit={submit} className="tag-create space-y-3" aria-busy={pending}>
      <fieldset disabled={pending || ambiguous} className="tag-create-fields">
        <div><label htmlFor={`${inputId}-name`} className="block font-medium">Назва</label><input id={`${inputId}-name`} name="name" required maxLength={120} value={name} onChange={(event) => setName(event.target.value)} className="mt-1 w-full rounded border border-line px-3 py-2" /></div>
        <div><label htmlFor={`${inputId}-color`} className="block font-medium">Колір</label><input id={`${inputId}-color`} name="color" type="color" required value={color} onChange={(event) => setColor(event.target.value.toUpperCase())} className="mt-1 h-11 w-12 cursor-pointer" /></div>
        <div aria-label="Попередній вигляд тегу"><TagBadge tag={{ name: name.trim() || 'Назва тегу', color }} /></div>
      </fieldset>
      {error && <p role="alert" className="text-danger">{error}</p>}
      <button disabled={pending} className="rounded button-primary px-4 py-2 disabled:opacity-50">{pending ? 'Збереження…' : 'Створити тег'}</button>
      <p role="status" className="text-sm text-muted">{pending ? 'Зберігається…' : notice}</p>
    </form>
    {/* Tags exist independently of any product. */}
    {!createOnly && <section aria-labelledby="workspace-tags"><h2 id="workspace-tags" className="mb-2 text-sm font-medium text-muted">Теги простору</h2>
      {visible.length === 0 ? <p>Тегів ще немає. Створіть перший тег.</p> : <ul className="flex flex-wrap gap-3">{visible.map((tag) => <li key={tag.id} className="managed-tag"><TagBadge tag={tag} /><button type="button" className="icon-action" aria-label={'Видалити тег ' + tag.name} disabled={pending || !!deleting} onClick={() => { setDeleting(tag); setDeleteError(''); }}>×</button></li>)}</ul>}
    </section>}
    {deleting && <section role="alertdialog" aria-modal="false" aria-label="Видалення тегу" className="inline-tag space-y-2"><h3>Видалити тег «{deleting.name}»?</h3><p>Тег буде прибрано з активних товарів. Товари та історія витрат збережуться.</p>{deleteError && <p role="alert">{deleteError}</p>}<button disabled={deletePending} onClick={() => void removeTag()} className="text-danger">{deletePending ? 'Видалення…' : deleteAmbiguous ? 'Повторити видалення' : 'Видалити тег'}</button><button disabled={deletePending || deleteAmbiguous} onClick={() => setDeleting(null)}>Скасувати</button></section>}
  </div>;
}
