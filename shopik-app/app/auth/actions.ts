'use server';

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

export async function signOut(): Promise<{ error: string } | null> {
  try {
    const supabase = await createClient(true);
    const { error } = await supabase.auth.signOut({ scope: 'local' });
    if (error) return { error: 'Не вдалося вийти. Спробуйте ще раз.' };
  } catch {
    return { error: 'Не вдалося вийти. Перевірте підключення.' };
  }
  redirect('/login');
}
