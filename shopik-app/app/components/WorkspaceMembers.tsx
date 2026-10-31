'use client';
import { useCallback, useEffect, useState, useTransition } from 'react';
import { readWorkspacePeople, removeWorkspaceMember } from '../settings/workspace-actions';
import type { WorkspacePerson } from '@/lib/members';
import { listCache } from '@/lib/use-list';
import WorkspaceInvites from './WorkspaceInvites';
import Avatar from './Avatar';

// Manage existing memberships; invitation delivery remains a separate feature.
export default function WorkspaceMembers({workspaceId,userId,onRemoved,active=true}:{workspaceId:string;userId:string;onRemoved:()=>void;active?:boolean}) {
  const [people,setPeople]=useState<WorkspacePerson[]>([]);
  const [error,setError]=useState('');
  const [loaded,setLoaded]=useState(false);
  const [pending,startTransition]=useTransition();
  const [notice,setNotice]=useState('');
  const refresh=useCallback(async()=>{
    const result=await readWorkspacePeople(workspaceId);
    if(listCache.owner!==userId) return;
    if(!result.ok){setError(result.error);if(result.accessLost){await listCache.clear();window.location.replace('/login');}return;}
    setPeople(result.people);setError('');setLoaded(true);
  },[workspaceId,userId]);
  // Refresh membership when settings are visible, without polling a hidden mounted form.
  useEffect(()=>{if(!active)return;const update=()=>{if(document.visibilityState==='visible')void refresh();};const timer=window.setTimeout(update,0);const poll=window.setInterval(update,30000);window.addEventListener('focus',update);window.addEventListener('online',update);document.addEventListener('visibilitychange',update);return()=>{window.clearTimeout(timer);window.clearInterval(poll);window.removeEventListener('focus',update);window.removeEventListener('online',update);document.removeEventListener('visibilitychange',update);};},[refresh,active]);
  const owner=people.some(person=>person.user_id===userId&&person.role==='owner');
  // Confirm the destructive cleanup, explaining preserved history and transferred categories.
  function remove(person:WorkspacePerson){
    if(!window.confirm(`Виключити «${person.display_name || 'Учасник'}»? Його продукти буде видалено, витрати збережено. Категорії з чужими продуктами перейдуть власнику.`))return;
    startTransition(async()=>{
      const result=await removeWorkspaceMember(workspaceId,person.user_id,person.joined_at);
      if(listCache.owner!==userId)return;
      if(!result.ok){setError(result.error);return;}
      setNotice('Учасника виключено. Історію витрат збережено.');onRemoved();await refresh();
    });
  }
  return <div className="space-y-4">
    {!loaded&&!error&&<p role="status">Завантажуємо учасників…</p>}
    {error&&<p role="alert" className="text-danger">{error} <button onClick={()=>void refresh()} disabled={pending}>Спробувати знову</button></p>}
    <p role="status">{notice}</p>
    <ul className="space-y-3">{people.map(person=><li key={person.user_id} className="flex flex-wrap items-center gap-3"><Avatar name={person.display_name||'Учасник'} url={person.avatar_url}/><span className="min-w-0 flex-1 break-words">{person.display_name||'Учасник'}<small className="block text-muted">{person.role==='owner'?'Власник':'Учасник'}{person.user_id===userId?' · Ви':''}</small></span>{owner&&person.role!=='owner'&&person.user_id!==userId&&<button className="button-danger px-3 py-2" disabled={pending} onClick={()=>remove(person)}>Виключити</button>}</li>)}</ul>
    {owner&&<WorkspaceInvites key={workspaceId} workspaceId={workspaceId} active={active}/>}
  </div>;
}
