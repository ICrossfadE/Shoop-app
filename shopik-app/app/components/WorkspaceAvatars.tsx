'use client';
import { useCallback, useEffect, useState } from 'react';
import { readWorkspacePeople } from '../settings/workspace-actions';
import type { WorkspacePerson } from '@/lib/members';
import type { Account } from '@/lib/identity';
import { listCache } from '@/lib/use-list';
import Avatar from './Avatar';

// Refresh current membership display without exposing profile emails or invite counts.
export default function WorkspaceAvatars({ workspaceId, userId, account }: { workspaceId: string; userId: string; account: Account }) {
  const [people, setPeople] = useState<WorkspacePerson[]>([]);
  const [error, setError] = useState(false);
  const refresh = useCallback(async () => {
    const result = await readWorkspacePeople(workspaceId);
    if (listCache.owner !== userId) return;
    if (!result.ok) { setError(true); if (result.accessLost) { await listCache.clear(); window.location.replace('/login'); } return; }
    setPeople(result.people); setError(false);
  }, [workspaceId, userId]);
  useEffect(() => {
    const update = () => { if (document.visibilityState === 'visible') void refresh(); };
    const timer = window.setTimeout(update, 0), interval = window.setInterval(update, 30000);
    window.addEventListener('focus', update); window.addEventListener('online', update); document.addEventListener('visibilitychange', update);
    return () => { clearTimeout(timer); clearInterval(interval); window.removeEventListener('focus', update); window.removeEventListener('online', update); document.removeEventListener('visibilitychange', update); };
  }, [refresh]);
  return <div className="workspace-avatars" role="group" aria-label={error ? 'Не вдалося оновити учасників' : people.length ? 'Учасників простору: ' + people.length : 'Учасники простору'}>
    {people.length ? people.slice(0, 2).map(person => <span key={person.user_id} title={person.display_name || 'Учасник'}><Avatar name={person.display_name || '?'} url={person.avatar_url} /></span>) : <Avatar name={account.name} url={account.avatar_url} />}
    {error && <button className="icon-action" aria-label="Оновити учасників" onClick={() => void refresh()}>↻</button>}
  </div>;
}
