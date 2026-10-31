'use client';
import { useState, useTransition } from 'react';
import GoogleSignIn from './GoogleSignIn';
import JoinWorkspace from '../components/JoinWorkspace';
import { openPersonalWorkspace } from '../settings/workspace-actions';
import { listCache } from '@/lib/use-list';
import Link from 'next/link';

// Explicit personal login and invitation entry work for both new and existing accounts.
export default function LoginOptions({authenticated}:{authenticated:boolean}) {
  const [error,setError]=useState('');
  const [pending,startTransition]=useTransition();
  function openPersonal(){startTransition(async()=>{
    try {
      const result=await openPersonalWorkspace();
      if(!result.ok){setError(result.error);return;}
      await listCache.clear();
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- Personal selection resets the previous workspace shell.
      window.location.assign('/');
    }catch{setError('Не вдалося відкрити простір. Перевірте підключення й повторіть.');}
  });}
  return <div className="space-y-6">
    <section className="space-y-3" aria-labelledby="personal-login-title">
      <h2 id="personal-login-title" className="font-semibold">Мій простір</h2>
      <p className="text-sm text-muted">Увійдіть у свій список покупок. Якщо ви тут уперше, створимо особистий простір.</p>
      {authenticated?<><button disabled={pending} onClick={openPersonal} className="button-primary w-full px-4 py-3">{pending?'Відкриваємо…':'Відкрити мій простір'}</button><Link href="/" className="block py-3 text-center underline">Продовжити в обраному просторі</Link></>:<GoogleSignIn personal/>}
      {error&&<p role="alert" className="text-danger">{error}</p>}
    </section>
    <section className="space-y-3 border-t pt-5" aria-labelledby="join-login-title"><h2 id="join-login-title" className="font-semibold">Спільний простір</h2><JoinWorkspace/></section>
  </div>;
}
