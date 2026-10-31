'use client';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState, useTransition } from 'react';
import { acceptInvite, cancelInvite, prepareInvite, readInvite } from './actions';
import { selectWorkspace } from '../settings/workspace-actions';
import GoogleSignIn from '../login/GoogleSignIn';
import { listCache } from '@/lib/use-list';
import { isInviteToken, type InviteView } from '@/lib/invites';
const messages={missing:'Відкрийте посилання, яке надіслав власник простору.',invalid:'Посилання недійсне. Попросіть власника створити нове.',expired:'Строк дії запрошення минув. Попросіть нове посилання.',revoked:'Власник відкликав це запрошення.',used:'Це запрошення вже використане. Для нового вступу потрібне нове посилання.',limited:'Забагато спроб. Зачекайте хвилину та повторіть.',error:'Не вдалося перевірити запрошення. Перевірте підключення й повторіть.'};

// The secret is kept in a transient ref only until the HttpOnly cookie is prepared.
export default function InvitePanel({account,configured,oauthError}:{account:string;configured:boolean;oauthError:boolean}){
  const router=useRouter();
  const [view,setView]=useState<InviteView|null>(null);
  const [pending,startTransition]=useTransition();
  const [openingError,setOpeningError]=useState('');
  const token=useRef<string|null>(null);
  const version=useRef(0);
  const requests=useRef<Promise<void>>(Promise.resolve());
  const inspect=useCallback(()=>{
    const epoch=version.current, secret=token.current;
    // Serialize cookie preparation and suppress obsolete previews when a new link is opened.
    const request=requests.current.then(async()=>{
      if(epoch!==version.current)return;
      try{
        if(secret!==null&&!isInviteToken(secret)){await cancelInvite();if(epoch===version.current){token.current=null;setView({status:'invalid'});}return;}
        if(secret!==null){const result=await prepareInvite(secret);if(epoch!==version.current)return;if(!result.ok){setView({status:'error'});return;}token.current=null;}
        const result=await readInvite();if(epoch===version.current)setView(result);
      }catch{if(epoch===version.current)setView({status:'error'});}
    });
    requests.current=request.catch(()=>{});return request;
  },[]);
  useEffect(()=>{
    // Fragments can change without a document reload; scrub and process each new link.
    const capture=()=>{if(window.location.hash){version.current++;const values=new URLSearchParams(window.location.hash.slice(1));token.current=values.getAll('token').length===1?values.get('token')??'':'';window.history.replaceState(null,'',window.location.pathname+window.location.search);}};
    capture();
    const changed=()=>{capture();setView(null);setOpeningError('');void inspect();};
    window.addEventListener('hashchange',changed);
    const timer=window.setTimeout(()=>void inspect(),0);
    return()=>{window.clearTimeout(timer);window.removeEventListener('hashchange',changed);};
  },[inspect]);
  async function openWorkspace(id:string){
    try {
    const result=await selectWorkspace(id);
    if(!result.ok){setOpeningError('Ви вже приєдналися, але не вдалося відкрити простір. Спробуйте ще раз або виберіть його в налаштуваннях.');return;}
    await cancelInvite();await listCache.clear();router.push('/');router.refresh();
    } catch { setOpeningError('Ви вже учасник. Перевірте підключення й повторіть відкриття простору.'); }
  }
  function join(){const epoch=version.current;startTransition(async()=>{try{setOpeningError('');const result=await acceptInvite();if(epoch!==version.current)return;setView(result);if(result.status==='accepted'||result.status==='member')await openWorkspace(result.workspace_id);}catch{if(epoch===version.current)setView({status:'error'});}});}
  const details=view&&(view.status==='ready'||view.status==='member'||view.status==='accepted')?view:null;
  return <div className="space-y-4" aria-busy={pending}>
    {!configured&&<p role="alert">Підключення Supabase ще не налаштоване.</p>}
    {oauthError&&<p role="alert" className="text-danger">Вхід не завершено. Повторіть Google Login, щоб продовжити запрошення.</p>}
    {!view&&<p role="status">Перевіряємо посилання…</p>}
    {view?.status==='login'&&<><p>Увійдіть через Google. Після входу ви зможете переглянути та прийняти запрошення.</p>{configured&&<GoogleSignIn invitation/>}</>}
    {/* Workspace details are returned only for a validated invitation and authenticated session. */}
    {details&&<><h2 className="break-words text-xl font-semibold">{details.workspace_name}</h2><p className="break-words">Власник: {details.owner_name||'Власник простору'}</p><p className="break-words text-sm text-muted">Ваш акаунт: {account||'Поточний акаунт'}</p>
      {details.status==='ready'?<><p>Після приєднання ви зможете вести спільний список покупок. Ваш особистий простір залишиться окремим.</p><button className="button-primary w-full px-4 py-3" disabled={pending} onClick={join}>{pending?'Приєднуємося…':'Приєднатися до простору'}</button></>:<><p role="status">{details.status==='member'?'Ви вже учасник цього простору.':'Ви приєдналися до простору.'}</p><button className="button-primary w-full px-4 py-3" disabled={pending} onClick={()=>startTransition(()=>openWorkspace(details.workspace_id))}>Відкрити простір</button></>}
      <GoogleSignIn invitation chooseAccount/>
    </>}
    {view&&view.status in messages&&<p role={view.status==='missing'?'status':'alert'} className={view.status==='missing'?'text-muted':'text-danger'}>{messages[view.status as keyof typeof messages]}</p>}
    {view&&(view.status==='error'||view.status==='limited')&&<button className="rounded border px-4 py-2" disabled={pending} onClick={()=>startTransition(()=>inspect())}>Повторити перевірку</button>}
    {openingError&&<p role="alert" className="text-danger">{openingError}</p>}
    <button className="rounded border px-4 py-2" disabled={pending||!view} onClick={()=>startTransition(async()=>{try{await cancelInvite();router.push('/');}catch{setView({status:'error'});}})}>Закрити запрошення</button>
  </div>;
}
