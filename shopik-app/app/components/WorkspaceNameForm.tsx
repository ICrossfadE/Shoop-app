'use client';
import { useId, useState, useTransition, type FormEvent } from 'react';
import { renameWorkspace } from '../settings/workspace-actions';

// Owner-only form updates the shell after the database confirms the new name.
export default function WorkspaceNameForm({ workspaceId, name, onSaved }: { workspaceId: string; name: string; onSaved: (name: string) => void }) {
  const inputId = useId();
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = String(new FormData(event.currentTarget).get('name') ?? '');
    setError(''); setSaved(false);
    startTransition(async () => {
      try {
        const result = await renameWorkspace(workspaceId, value);
        if (!result.ok) { setError(result.error); return; }
        onSaved(result.name); setSaved(true);
      } catch { setError('Не вдалося зберегти назву. Повторіть спробу.'); }
    });
  }
  return <form onSubmit={submit} className="w-full space-y-2" aria-busy={pending}>
    {/* The label identifies the exact space when several owner forms are visible. */}
    <label htmlFor={inputId} className="block text-sm">Назва простору «{name}»</label>
    <div className="flex flex-wrap gap-2">
      <input id={inputId} name="name" defaultValue={name} required disabled={pending} className="min-w-0 flex-1 rounded border px-3 py-2" aria-describedby={error ? `${inputId}-error` : undefined} />
      <button disabled={pending} className="rounded border px-3 py-2">{pending ? 'Збереження…' : 'Зберегти назву'}</button>
    </div>
    {error && <p id={`${inputId}-error`} role="alert" className="text-sm text-danger">{error}</p>}
    {saved && <p role="status" className="text-sm">Назву збережено.</p>}
  </form>;
}
