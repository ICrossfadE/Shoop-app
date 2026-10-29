import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { getSupabaseConfig } from './config';
import type { Database } from './database.types';

// Cookie writes are only allowed in Route Handlers and Server Actions.
// Proxy refreshes cookies before Server Components read the session.
export async function createClient(writable = false) {
  const config = getSupabaseConfig();
  if (!config) throw new Error('Supabase is not configured.');
  const cookieStore = await cookies();

  return createServerClient<Database>(config.url, config.key, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll(cookiesToSet) {
        if (!writable) return;
        cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
      },
    },
  });
}
