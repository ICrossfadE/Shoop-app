'use server';
import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { isTheme, themeCookie } from '@/lib/theme';
import type { ProductResult } from '@/lib/products';

// Derive identity from the verified session, with no client-supplied user ID.
export async function saveTheme(value: string): Promise<ProductResult> {
  if (!isTheme(value)) return { ok: false, error: 'Виберіть світлу або темну тему.' };
  try {
    const client = await createClient(true);
    const { data, error } = await client.auth.getClaims();
    if (error || !data?.claims.sub) return { ok: false, error: 'Сесія завершилась. Увійдіть знову.' };
    const profile = await client.from('profiles').update({ theme: value }).eq('id', data.claims.sub).select('id').maybeSingle();
    if (profile.error || !profile.data) return { ok: false, error: 'Не вдалося зберегти тему. Спробуйте знову.' };
    (await cookies()).set(themeCookie, value, { path: '/', maxAge: 60 * 60 * 24 * 365, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', httpOnly: true });
  } catch { return { ok: false, error: 'Не вдалося зберегти тему. Перевірте підключення.' }; }
  revalidatePath('/', 'layout');
  return { ok: true };
}
