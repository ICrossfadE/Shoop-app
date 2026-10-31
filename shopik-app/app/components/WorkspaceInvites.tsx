'use client';
import { useCallback, useEffect, useRef, useState, useTransition } from 'react';
import { createInvite, listInvites, revokeInvite } from '../settings/invite-actions';
import type { InviteSummary } from '@/lib/invites';
const labels={pending:'Активне',accepted:'Прийняте',revoked:'Відкликане',expired:'Строк минув'};
const date=new Intl.DateTimeFormat('uk-UA',{dateStyle:'medium',timeStyle:'short'});

// Raw invitation links live only in this mounted owner control, never in the shared cache.
export default function WorkspaceInvites({workspaceId,active=true}:{workspaceId:string;active?:boolean}){
  const [items,setItems]=useState<InviteSummary[]>([]);
  const [link,setLink]=useState('');
  const [recentId,setRecentId]=useState('');
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  const [loaded,setLoaded]=useState(false);
  const [pending,startTransition]=useTransition();
  const operationId=useRef('');
  const refresh=useCallback(async()=>{try{const result=await listInvites(workspaceId);if(!result.ok){setError(result.error);return;}setItems(result.invites);setLoaded(true);setError('');}catch{setError('Не вдалося оновити запрошення. Перевірте підключення.');}},[workspaceId]);
  useEffect(()=>{if(!active)return;const update=()=>{if(document.visibilityState==='visible')void refresh();};const timer=window.setTimeout(update,0);const poll=window.setInterval(update,30000);window.addEventListener('focus',update);window.addEventListener('online',update);return()=>{window.clearTimeout(timer);window.clearInterval(poll);window.removeEventListener('focus',update);window.removeEventListener('online',update);};},[refresh,active]);
  // Keep the same operation key after an uncertain response; a retry cannot leak/recreate its secret.
  function create(){startTransition(async()=>{
    setError('');setNotice('');setLink('');
    operationId.current ||= crypto.randomUUID();
    try {
    const result=await createInvite(workspaceId,operationId.current);
    if(!result.ok){setError(result.error);return;}
    operationId.current='';setRecentId(result.invite.id);
    if(result.token)setLink(`${window.location.origin}/invite#token=${result.token}`);
    else setNotice('Запрошення вже було створене. Секрет не відновлюється: відкличте нижче «Ваш останній запит» і створіть нове.');
    await refresh();
    } catch { setError('Результат невідомий. Оновіть список запрошень перед повтором.'); }
  });}
  function revoke(item:InviteSummary){
    if(!window.confirm('Відкликати це посилання? Уже прийняте членство не видалятиметься.'))return;
    startTransition(async()=>{try{setError('');const result=await revokeInvite(item.id);if(!result.ok){setError(result.error);return;}setLink('');setNotice('Стан запрошення оновлено.');await refresh();}catch{setError('Результат невідомий. Оновіть список запрошень.');}});
  }
  async function copy(){try{await navigator.clipboard.writeText(link);setNotice('Посилання скопійовано.');}catch{setNotice('Скопіюйте посилання вручну з поля нижче.');}}
  return <section className="space-y-3 border-t pt-4" aria-labelledby="invites-title">
    <h3 id="invites-title" className="font-semibold">Запрошення за посиланням</h3>
    <p className="text-sm text-muted">Посилання діє 7 діб і дає змогу одному користувачу приєднатися. Передавайте його лише тому, кого хочете запросити.</p>
    <button className="button-primary px-4 py-2" disabled={pending} onClick={create}>{pending?'Зачекайте…':'Запросити за посиланням'}</button>
    {/* The read-only field remains a manual copy fallback without Clipboard permission. */}
    {link&&<div className="space-y-2"><label htmlFor="invite-link" className="block">Нове посилання запрошення</label><input id="invite-link" className="w-full rounded border p-2" value={link} readOnly onFocus={event=>event.target.select()}/><button className="rounded border px-3 py-2" onClick={()=>void copy()}>Копіювати посилання</button><p className="text-sm text-muted">Посилання показується лише зараз. Після закриття його потрібно буде створити заново.</p></div>}
    {notice&&<p role="status">{notice}</p>}
    {error&&<p role="alert" className="text-danger">{error} <button disabled={pending} onClick={()=>void refresh()}>Оновити список</button></p>}
    {!loaded&&!error&&<p role="status">Завантажуємо запрошення…</p>}
    {loaded&&items.length===0&&<p className="text-muted">Запрошень ще немає.</p>}
    <ul className="space-y-3">{items.map(item=><li key={item.id} className="flex flex-wrap items-center justify-between gap-2 border-t pt-3"><div className="min-w-0"><strong>{labels[item.state]}</strong>{item.id===recentId&&<span className="block text-sm">Ваш останній запит</span>}<p className="text-sm text-muted">Створено: {date.format(new Date(item.created_at))}<br/>Діє до: {date.format(new Date(item.expires_at))}</p></div>{item.state==='pending'&&<button className="button-danger px-3 py-2" disabled={pending} onClick={()=>revoke(item)}>Відкликати</button>}</li>)}</ul>
  </section>;
}
