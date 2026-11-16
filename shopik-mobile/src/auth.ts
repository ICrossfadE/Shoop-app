import type { AuthState, CredentialStorage, WorkspaceScope } from '../../shopik-app/lib/domain/platform.ts';
import { accountFromClaims } from '../../shopik-app/lib/identity.ts';

// This prototype identity has one exact callback; production needs its own app ID/scheme.
export const AUTH_CALLBACK = 'ua.shopik.prototype://auth/callback';
export const PENDING_KEY = 'pending-oauth';
const IDENTITY_KEY = 'last-account';
const ATTEMPT_TTL = 10 * 60 * 1000;
const AUTH_REQUIRED_CODES = new Set(['refresh_token_not_found', 'refresh_token_already_used',
  'session_not_found', 'session_expired', 'user_banned', 'user_not_found', 'bad_jwt']);
type Pending = { nonce: string; createdAt: number; flowId?: string };
type Identity = { id: string; email?: string; user_metadata?: Record<string, unknown> };
type Result<T> = { data: T; error: { status?: number; code?: string } | null };
export interface AuthTransport {
  begin(redirectTo: string): Promise<{ url: string; flowId?: string }>;
  exchange(code: string, flowId?: string): Promise<void>;
  user(): Promise<Result<{ user: Identity | null }>>;
  logout(): Promise<void>;
  memberships(userId: string): Promise<WorkspaceScope[]>;
}
export type AuthView = {
  state: AuthState;
  verification: 'unverified' | 'verified' | 'unavailable' | 'needs-auth';
  pending: boolean;
};

// Parse only our exact callback, reject duplicate/unknown fields and token fragments.
export function parseAuthCallback(raw: string) {
  try {
    if (raw.length > 4096) return null;
    const url = new URL(raw);
    if (url.protocol !== 'ua.shopik.prototype:' || url.host !== 'auth' ||
      url.pathname !== '/callback' || url.username || url.password || url.hash) return null;
    const allowed = ['attempt', 'code', 'error', 'error_code', 'error_description', 'sb_flow_id'];
    for (const key of url.searchParams.keys()) {
      if (!allowed.includes(key) || url.searchParams.getAll(key).length !== 1) return null;
    }
    const nonce = url.searchParams.get('attempt');
    const code = url.searchParams.get('code');
    const denied = url.searchParams.has('error');
    if (!nonce || !/^[a-f0-9-]{36}$/.test(nonce) || (!!code === denied) || (code && code.length > 2048)) return null;
    return { nonce, code, denied, flowId: url.searchParams.get('sb_flow_id') };
  } catch { return null; }
}

// Serialized operations prevent callback/cancel/logout races; nothing touches the outbox.
export function createMobileAuth(options: {
  storage: CredentialStorage; transport: AuthTransport;
  open(url: string): Promise<void>; online(): boolean;
  now?: () => number; nonce?: () => string;
}) {
  const { storage, transport } = options;
  const now = options.now ?? Date.now;
  const nonce = options.nonce ?? (() => crypto.randomUUID());
  let view: AuthView = { state: { status: 'signed-out' }, verification: 'unverified', pending: false };
  const listeners = new Set<(view: AuthView) => void>();
  let tail = Promise.resolve();
  function serial<T>(job: () => Promise<T>): Promise<T> {
    const result = tail.then(job); tail = result.then(() => undefined, () => undefined); return result;
  }
  function publish(next: AuthView) { view = next; for (const listener of listeners) listener(view); }
  async function pending(): Promise<Pending | null> {
    const raw = await storage.getItem(PENDING_KEY);
    if (!raw) return null;
    let value: Partial<Pending>;
    try { value = JSON.parse(raw); } catch { value = {}; }
    if (!value || typeof value.nonce !== 'string' || !/^[a-f0-9-]{36}$/.test(value.nonce) ||
      typeof value.createdAt !== 'number' || now() < value.createdAt || now() - value.createdAt > ATTEMPT_TTL ||
      (value.flowId !== undefined && typeof value.flowId !== 'string')) {
      await storage.removeItem(PENDING_KEY); return null;
    }
    return value as Pending;
  }
  // Cached identity is display/scope context only; it never grants server permissions.
  async function cached(): Promise<AuthState> {
    const raw = await storage.getItem(IDENTITY_KEY);
    if (!raw) return { status: 'signed-out' };
    try {
      const identity = JSON.parse(raw) as Identity;
      if (!identity || typeof identity.id !== 'string' || !identity.id) throw new Error();
      return { status: 'needs-auth', userId: identity.id, account: accountFromClaims(identity.user_metadata, identity.email) };
    } catch { throw new Error('Stored account is invalid'); }
  }
  async function verify() {
    const state = await cached();
    const waiting = !!await pending();
    if (!options.online()) { publish({ state, pending: waiting, verification: 'unavailable' }); return view; }
    let result: Awaited<ReturnType<AuthTransport['user']>>;
    try { result = await transport.user(); }
    catch { publish({ state, pending: waiting, verification: 'unavailable' }); return view; }
    if (result.error || !result.data.user) {
      publish({ state, pending: waiting, verification: result.error?.status === 401 || result.error?.status === 403 || AUTH_REQUIRED_CODES.has(result.error?.code ?? '') || !result.error ? 'needs-auth' : 'unavailable' });
      return view;
    }
    const user = result.data.user;
    // Store only display metadata plus stable identity, separately from SDK credentials.
    await storage.setItem(IDENTITY_KEY, JSON.stringify({ id: user.id, email: user.email,
      user_metadata: { name: accountFromClaims(user.user_metadata, user.email).name,
        avatar_url: accountFromClaims(user.user_metadata, user.email).avatar_url } }));
    publish({ state: { status: 'signed-in', userId: user.id, account: accountFromClaims(user.user_metadata, user.email) }, pending: waiting, verification: 'verified' });
    return view;
  }
  return {
    current: () => view,
    subscribe(listener: (next: AuthView) => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    read: () => serial(verify),
    signIn: () => serial(async () => {
      if (!options.online()) throw new Error('Network required');
      if (await pending()) throw new Error('Login already pending');
      const attempt: Pending = { nonce: nonce(), createdAt: now() };
      const redirect = new URL(AUTH_CALLBACK); redirect.searchParams.set('attempt', attempt.nonce);
      const result = await transport.begin(redirect.href);
      attempt.flowId = result.flowId;
      await storage.setItem(PENDING_KEY, JSON.stringify(attempt));
      publish({ ...view, pending: true });
      try { await options.open(result.url); }
      catch { await storage.removeItem(PENDING_KEY); publish({ ...view, pending: false }); throw new Error('Browser unavailable'); }
    }),
    cancel: () => serial(async () => { await storage.removeItem(PENDING_KEY); publish({ ...view, pending: false }); }),
    handleUrl: (raw: string) => serial(async () => {
      const callback = parseAuthCallback(raw);
      if (!callback) return false;
      const attempt = await pending();
      if (!attempt) { publish({ ...view, pending: false }); return false; }
      if (callback.nonce !== attempt.nonce || (callback.flowId && callback.flowId !== attempt.flowId)) return false;
      // Consume before exchange: a crash or failed exchange requires a fresh Google login.
      await storage.removeItem(PENDING_KEY);
      publish({ ...view, pending: false });
      if (callback.denied) return true;
      await transport.exchange(callback.code!, attempt.flowId);
      await verify(); return true;
    }),
    signOut: () => serial(async () => {
      await transport.logout();
      await storage.removeItem(PENDING_KEY); await storage.removeItem(IDENTITY_KEY);
      publish({ state: { status: 'signed-out' }, pending: false, verification: 'unverified' });
    }),
    // Future sync must call this gate per scope; a 401/network error is never a membership deletion.
    verifyScope: (scope: WorkspaceScope) => serial(async () => {
      const current = await verify();
      if (current.verification !== 'verified' || current.state.status !== 'signed-in' || current.state.userId !== scope.accountId) return false;
      const memberships = await transport.memberships(current.state.userId);
      return memberships.some(item => item.accountId === scope.accountId && item.workspaceId === scope.workspaceId && item.membershipEpoch === scope.membershipEpoch);
    }),
  };
}
export type MobileAuth = ReturnType<typeof createMobileAuth>;
