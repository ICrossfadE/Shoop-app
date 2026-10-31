'use client';
import { useCallback, useEffect, useState, useSyncExternalStore, useTransition } from 'react';
import { listWorkspaces, openPersonalWorkspace, selectWorkspace } from '../settings/workspace-actions';
import { listCache } from '@/lib/use-list';
import type { WorkspaceOption } from '@/lib/members';
import JoinWorkspace from './JoinWorkspace';

// This section remains available even for a single space or a failed people request.
export default function WorkspaceSwitcher({workspaceId,active}:{workspaceId:string;active:boolean}) {
  const [options,setOptions] = useState<WorkspaceOption[]>([]);
  const [error,setError] = useState('');
  const [loaded,setLoaded] = useState(false);
  const [pending,startTransition] = useTransition();
  useSyncExternalStore(listCache.subscribe,()=>listCache.revision,()=>0);
  const unresolved = [...listCache.failures.values()].some(failure=>failure.ambiguous);
  const busy = pending || listCache.overlays.size > 0 || unresolved;
  const refresh = useCallback(async()=>{
    const result = await listWorkspaces();
    if (result.ok) { setOptions(result.options);setLoaded(true);setError(''); }
    else setError(result.error);
  },[]);
  useEffect(()=>{
    if (!active) return;
    const update=()=>{if(document.visibilityState==='visible')void refresh();};
    const timer=window.setTimeout(update,0), poll=window.setInterval(update,30000);
    window.addEventListener('focus',update);window.addEventListener('online',update);
    return()=>{window.clearTimeout(timer);window.clearInterval(poll);window.removeEventListener('focus',update);window.removeEventListener('online',update);};
  },[active,refresh]);
  // A full shell reload prevents late metadata and mounted forms from crossing workspaces.
  function open(id?:string) {
    if (busy || !navigator.onLine) {setError('Для перемикання потрібне підключення. Дочекайтеся завершення збереження.');return;}
    if (listCache.drafts.size && !window.confirm('Перемкнути простір? Незбережені форми й локальні чернетки буде очищено.')) return;
    startTransition(async()=>{
      try {
        const result = id ? await selectWorkspace(id) : await openPersonalWorkspace();
        if (!result.ok) {setError(result.error);return;}
        await listCache.clear();
        // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- Reset mounted forms and stale responses across workspace boundaries.
        window.location.assign('/settings');
      } catch {setError('Не вдалося перемкнути простір. Перевірте підключення та повторіть.');}
    });
  }
  return <section id="workspaces" aria-labelledby="workspaces-title" className="settings-wide space-y-4 rounded-lg bg-surface p-5 shadow-sm">
    <h2 id="workspaces-title" className="text-lg font-semibold">Робочі простори</h2>
    {unresolved&&<p role="alert" className="text-danger">Спочатку перевірте результат незавершеної покупки через «Повторити дію», щоб не втратити можливість безпечного повтору.</p>}
    {!loaded&&!error&&<p role="status">Завантажуємо простори…</p>}
    {error&&<p role="alert" className="text-danger">{error} <button disabled={busy} onClick={()=>void refresh()} className="underline">Повторити</button></p>}
    <ul className="space-y-3">{options.map(option=><li key={option.id} className="flex min-w-0 flex-col items-start gap-3 rounded border p-3 sm:flex-row sm:items-center">
      <div className="w-full min-w-0 break-words sm:flex-1"><p className="font-semibold">{option.name}</p><p className="text-sm text-muted">{option.personal?'Мій особистий простір':option.role==='owner'?'Мій спільний простір':'Запрошений простір'} · {option.role==='owner'?'Власник':'Учасник'} · {option.id.slice(0,8)}</p></div>
      {option.id===workspaceId?<span aria-current="true" className="text-sm font-semibold">Поточний</span>:<button disabled={busy} onClick={()=>open(option.id)} className="button-primary px-4 py-3">Відкрити простір</button>}
    </li>)}</ul>
    <button disabled={busy||!loaded} onClick={()=>open()} className="rounded border px-4 py-3">{options.some(option=>option.personal)?'Відкрити мій простір':'Створити мій простір'}</button>
    <p className="text-sm text-muted">Перед перемиканням завершіть редагування. Збережені покупки залишаються у своєму просторі; локальний кеш і чернетки очищаються.</p>
    <details><summary className="cursor-pointer py-3 font-semibold">Приєднатися до спільного простору</summary><JoinWorkspace /></details>
  </section>;
}
