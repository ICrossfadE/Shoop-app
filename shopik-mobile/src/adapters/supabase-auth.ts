import { createClient } from '@supabase/supabase-js';
import { Browser } from '@capacitor/browser';
import { Capacitor } from '@capacitor/core';
import type { Database } from '../../../shopik-app/lib/supabase/database.types.ts';
import { createCredentialStorage } from './credentials.ts';
import type { CredentialStorage } from '../../../shopik-app/lib/domain/platform.ts';
import { createMobileAuth } from '../auth.ts';

// Only public project credentials belong in Vite; never accept a service-role key.
export function readMobileAuthConfig(env: Record<string, unknown>) {
  const url = env.VITE_SUPABASE_URL;
  const key = env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (typeof url !== 'string' || typeof key !== 'string' || !key.trim()) return null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.pathname !== '/' || parsed.search || parsed.hash) return null;
    if (!key.startsWith('sb_publishable_')) {
      const payload = JSON.parse(atob(key.split('.')[1] ?? ''));
      if (payload.role !== 'anon') return null;
    }
    return { url: parsed.origin, key: key.trim() };
  } catch { return null; }
}

// Construct once in the Android shell; auto URL detection/cookies/web fallback are disabled.
export function createAndroidAuth() {
  if (Capacitor.getPlatform() !== 'android') return null;
  const config = readMobileAuthConfig(import.meta.env);
  if (!config) return null;
  return createSupabaseAuth({ config, storage: createCredentialStorage(), online: () => navigator.onLine,
    open: async url => { await Browser.open({ url }); } });
}

// Injectable HTTP/storage/browser boundaries allow integration checks without real credentials.
export function createSupabaseAuth(options: {
  config: { url: string; key: string }; storage: CredentialStorage;
  online(): boolean; open(url: string): Promise<void>; fetch?: typeof fetch;
}) {
  const { config, storage } = options;
  const client = createClient<Database>(config.url, config.key, {
    global: options.fetch ? { fetch: options.fetch } : undefined,
    auth: { storage, storageKey: 'shopik-session', flowType: 'pkce', persistSession: true,
      autoRefreshToken: false, detectSessionInUrl: false, debug: false },
  });
  return createMobileAuth({ storage, online: options.online,
    open: async url => {
      const destination = new URL(url);
      // The SDK must return the configured Supabase authorize endpoint, never an arbitrary URL.
      if (destination.origin !== config.url || destination.pathname !== '/auth/v1/authorize') throw new Error('Invalid OAuth destination');
      await options.open(url);
    },
    transport: {
      async begin(redirectTo) {
        const { data, error } = await client.auth.signInWithOAuth({ provider: 'google',
          options: { redirectTo, skipBrowserRedirect: true, queryParams: { prompt: 'select_account' } } });
        if (error || !data.url) throw new Error('OAuth unavailable');
        return { url: data.url, flowId: data.flowId ?? undefined };
      },
      async exchange(code, flowId) {
        const { error } = await client.auth.exchangeCodeForSession(code, flowId ? { flowId } : undefined);
        if (error) throw new Error('OAuth exchange failed');
      },
      async user() {
        // getSession refreshes expired tokens; getUser then verifies identity with the server.
        const session = await client.auth.getSession();
        if (session.error) return { data: { user: null }, error: session.error };
        if (!session.data.session) return { data: { user: null }, error: { status: 401 } };
        return client.auth.getUser();
      },
      async logout() {
        const { error } = await client.auth.signOut({ scope: 'local' });
        if (error) throw new Error('Logout failed');
      },
      async memberships(userId) {
        const { data, error } = await client.from('workspace_members')
          .select('workspace_id,user_id,created_at').eq('user_id', userId);
        if (error) throw new Error('Membership verification unavailable');
        return data.map(row => ({ accountId: row.user_id, workspaceId: row.workspace_id, membershipEpoch: row.created_at }));
      },
    },
  });
}
