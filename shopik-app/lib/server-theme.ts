import { cache } from 'react';
import { cookies } from 'next/headers';
import { readSession } from './server-session';
import { getSupabaseConfig } from './supabase/config';
import { resolveTheme, themeCookie, type Theme } from './theme';

// Shared per-request read lets root HTML and settings start with the same theme.
export const readTheme = cache(async (): Promise<{ theme: Theme; error: boolean; userId: string }> => {
  const localTheme = (await cookies()).get(themeCookie)?.value;
  if (!getSupabaseConfig()) return { theme: resolveTheme(false, null, localTheme), error: false, userId: '' };
  let userId = '';
  try {
    const { client, data, error } = await readSession();
    userId = !error && typeof data?.claims.sub === 'string' ? data.claims.sub : '';
    if (!userId) return { theme: resolveTheme(false, null, localTheme), error: false, userId: '' };
    const profile = await client.from('profiles').select('theme').eq('id', userId).maybeSingle();
    return { theme: resolveTheme(true, profile.data?.theme, localTheme), error: !!profile.error || !profile.data, userId };
  } catch {
    return { theme: resolveTheme(!!userId, null, localTheme), error: true, userId };
  }
});
