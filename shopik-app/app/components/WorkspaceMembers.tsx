'use client';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState, useTransition } from 'react';
import { readWorkspacePeople, removeWorkspaceMember, selectWorkspace } from '../settings/workspace-actions';
import type { WorkspaceOption, WorkspacePerson } from '@/lib/members';
import { listCache } from '@/lib/use-list';
import WorkspaceInvites from './WorkspaceInvites';
import Avatar from './Avatar';

// Manage existing memberships; invitation delivery remains a separate feature.
export default function WorkspaceMembers({workspaceId,userId,onRemoved,active=true}:{workspaceId:string;userId:string;onRemoved:()=>void;active?:boolean}) {
  const router=useRouter();
  const [people,setPeople]=useState<WorkspacePerson[]>([]);
  const [options,setOptions]=useState<WorkspaceOption[]>([]);
  const [error,setError]=useState('');
  const [loaded,setLoaded]=useState(false);
  const [pending,startTransition]=useTransition();
  const [notice,setNotice]=useState('');
  const [selected,setSelected]=useState(workspaceId);
  const refresh=useCallback(async()=>{
    const result=await readWorkspacePeople(workspaceId);
    if(listCache.owner!==userId) return;
    if(!result.ok){setError(result.error);if(result.accessLost){await listCache.clear();window.location.replace('/login');}return;}
    setPeople(result.people);setOptions(result.options);setError('');setLoaded(true);
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
    {/* Selection is restricted to current memberships and reloads the authenticated shell. */}
    {options.length>1&&<div className="flex flex-wrap items-end gap-2"><div><label htmlFor="workspace-choice" className="block">Поточний простір</label><select id="workspace-choice" className="rounded border p-2" value={selected} disabled={pending} onChange={event=>setSelected(event.target.value)}>{options.map(option=><option value={option.id} key={option.id}>{option.name}</option>)}</select></div><button className="button-primary px-3 py-2" disabled={pending||selected===workspaceId} onClick={()=>startTransition(async()=>{const result=await selectWorkspace(selected);if(!result.ok){setError(result.error);return;}listCache.clear();router.refresh();})}>Відкрити простір</button></div>}
    {!loaded&&!error&&<p role="status">Завантажуємо учасників…</p>}
    {error&&<p role="alert" className="text-danger">{error} <button onClick={()=>void refresh()} disabled={pending}>Спробувати знову</button></p>}
    <p role="status">{notice}</p>
    <ul className="space-y-3">{people.map(person=><li key={person.user_id} className="flex flex-wrap items-center gap-3"><Avatar name={person.display_name||'Учасник'} url={person.avatar_url}/><span className="min-w-0 flex-1 break-words">{person.display_name||'Учасник'}<small className="block text-muted">{person.role==='owner'?'Власник':'Учасник'}{person.user_id===userId?' · Ви':''}</small></span>{owner&&person.role!=='owner'&&person.user_id!==userId&&<button className="button-danger px-3 py-2" disabled={pending} onClick={()=>remove(person)}>Виключити</button>}</li>)}</ul>
    {owner&&<WorkspaceInvites key={workspaceId} workspaceId={workspaceId} active={active}/>}
  </div>;
}
