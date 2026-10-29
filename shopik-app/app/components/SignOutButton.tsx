'use client';

import { useActionState } from 'react';
import { signOut } from '@/app/auth/actions';

export default function SignOutButton() {
  const [state, action, pending] = useActionState(signOut, null);
  return (
    <form action={action}>
      <button disabled={pending} className="rounded bg-blue-600 px-4 py-2 text-white disabled:opacity-60">
        {pending ? 'Вихід…' : 'Вийти'}
      </button>
      {state?.error && <p role="alert" className="mt-2 text-sm text-red-300">{state.error}</p>}
    </form>
  );
}
