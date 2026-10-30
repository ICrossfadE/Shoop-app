'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';

export default function GoogleSignIn() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');

  async function signIn() {
    setPending(true);
    setError('');
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: `${window.location.origin}/auth/callback` },
      });
      if (error) throw error;
    } catch {
      setError('Не вдалося відкрити Google Login. Спробуйте ще раз.');
      setPending(false);
    }
  }

  return (
    <div className="space-y-3">
      <button onClick={signIn} disabled={pending} className="w-full rounded button-primary px-4 py-3  disabled:opacity-60">
        {pending ? 'Перенаправлення…' : 'Увійти через Google'}
      </button>
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
    </div>
  );
}
