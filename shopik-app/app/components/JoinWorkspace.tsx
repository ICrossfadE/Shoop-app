'use client';
import { useState, useTransition, type FormEvent } from 'react';
import { prepareInvite } from '../invite/actions';
import { tokenFromInviteLink } from '@/lib/invite-link';
import { useRouter } from 'next/navigation';

// Share the invitation flow between login and authenticated workspace settings.
export default function JoinWorkspace() {
  const router = useRouter();
  const [link, setLink] = useState('');
  const [error, setError] = useState('');
  const [pending, startTransition] = useTransition();
  function submit(event: FormEvent) {
    event.preventDefault();
    const token = tokenFromInviteLink(link, window.location.origin);
    if (!token) { setError('Вставте повне посилання запрошення з цього сайту Shopik.'); return; }
    startTransition(async () => {
      setError('');
      try {
        const result = await prepareInvite(token);
        if (!result.ok) throw new Error('Preparation failed');
        setLink('');
        router.push('/invite');
      } catch { setError('Не вдалося відкрити запрошення. Перевірте підключення та повторіть.'); }
    });
  }
  return <form onSubmit={submit} className="space-y-3">
    <label className="block space-y-2"><span>Посилання запрошення</span><input type="text" inputMode="url" autoComplete="off" spellCheck={false} maxLength={2048} value={link} onChange={event=>setLink(event.target.value)} required disabled={pending} className="w-full min-w-0 rounded border p-3" placeholder="https://…/invite#token=…" /></label>
    <button disabled={pending} className="button-primary w-full px-4 py-3">{pending ? 'Перевіряємо…' : 'Приєднатися за запрошенням'}</button>
    <p className="text-sm text-muted">Спочатку перевіримо запрошення. Вступ відбудеться лише після вашого підтвердження.</p>
    {error && <p role="alert" className="text-danger">{error}</p>}
  </form>;
}
