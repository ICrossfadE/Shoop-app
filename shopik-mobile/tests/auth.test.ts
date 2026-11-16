import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AUTH_CALLBACK, PENDING_KEY, createMobileAuth, parseAuthCallback, type AuthTransport } from '../src/auth.ts';
import { createCredentialStorage } from '../src/adapters/credentials.ts';
import { readMobileAuthConfig, createSupabaseAuth } from '../src/adapters/supabase-auth.ts';

const nonce = 'eaa7110a-293a-4ba0-9fc6-077512629b2e';
const callback = AUTH_CALLBACK + '?attempt=' + nonce + '&code=one-time-code';
// A transport fake checks orchestration, never claims that Google/device OAuth was tested.
function fixture() {
  const values = new Map<string, string>();
  let connected = true;
  let time = 1000;
  let user = { id: 'user-a', email: 'a@example.com', user_metadata: { name: 'Account A' } };
  let failure: { status?: number; code?: string } | null = null;
  let exchanges = 0;
  let opened = '';
  let membershipReads = 0;
  const storage = {
    async getItem(key: string) { return values.get(key) ?? null; },
    async setItem(key: string, value: string) { values.set(key, value); },
    async removeItem(key: string) { values.delete(key); },
  };
  const transport: AuthTransport = {
    async begin(redirect) { opened = redirect; return { url: 'https://project.supabase.co/auth/v1/authorize', flowId: 'flow-a' }; },
    async exchange(code, flowId) { assert.equal(code, 'one-time-code'); assert.equal(flowId, 'flow-a'); exchanges++; },
    async user() { return { data: { user: failure ? null : user }, error: failure }; },
    async logout() {},
    async memberships(userId) { membershipReads++; return [{ accountId: userId, workspaceId: 'workspace-a', membershipEpoch: 'epoch-1' }]; },
  };
  const make = () => createMobileAuth({ storage, transport, online: () => connected, now: () => time, nonce: () => nonce, open: async () => undefined });
  return { values, storage, transport, make, connected: (value: boolean) => { connected = value; },
    time: (value: number) => { time = value; }, fail: (value: typeof failure) => { failure = value; },
    user: (id: string) => { user = { ...user, id }; }, exchanges: () => exchanges,
    opened: () => opened, membershipReads: () => membershipReads };
}

// A matching callback requires an explicit code/error and has no arbitrary redirect surface.
test('callback allowlist rejects foreign URLs, fragments, ports and duplicate fields', () => {
  assert.equal(parseAuthCallback(callback)?.code, 'one-time-code');
  for (const raw of [callback.replace('auth/', 'evil/'), callback.replace('/callback', '/callback/'),
    callback.replace('auth/', 'auth:80/'), callback.replace('ua.shopik.prototype:', 'https:'),
    callback + '#access_token=secret', callback + '&code=second', callback + '&next=https://evil.test',
    callback + '&error=denied', AUTH_CALLBACK + '?attempt=' + nonce, callback.replace('attempt=', 'wrong=')]) {
    assert.equal(parseAuthCallback(raw), null);
  }
});

// Process death restores the pending nonce/flow from credential storage, not browser cookies.
test('cold callback exchanges once and verifies the same account', async () => {
  const f = fixture(); const first = f.make(); await first.signIn();
  assert.equal(new URL(f.opened()).searchParams.get('attempt'), nonce);
  const cold = f.make(); assert.equal(await cold.handleUrl(callback), true);
  assert.equal(cold.current().state.status, 'signed-in');
  assert.equal(await cold.handleUrl(callback), false); assert.equal(f.exchanges(), 1);
});

// Serialized duplicate callbacks/cancellation cannot exchange a consumed pending attempt.
test('warm duplicate callback races exchange only once', async () => {
  const f = fixture(); const auth = f.make(); await auth.signIn();
  assert.deepEqual(await Promise.all([auth.handleUrl(callback), auth.handleUrl(callback)]), [true, false]);
  assert.equal(f.exchanges(), 1);
});
test('cancellation, mismatched nonce and mismatched flow refuse exchange', async () => {
  const f = fixture(); const auth = f.make(); await auth.signIn();
  assert.equal(await auth.handleUrl(callback.replace(nonce, nonce.replace('eaa', 'aaa'))), false);
  assert.equal(await auth.handleUrl(callback + '&sb_flow_id=foreign'), false);
  await auth.cancel(); assert.equal(await auth.handleUrl(callback), false); assert.equal(f.exchanges(), 0);
});
test('provider denial consumes attempt without exchanging', async () => {
  const f = fixture(); const auth = f.make(); await auth.signIn();
  assert.equal(await auth.handleUrl(AUTH_CALLBACK + '?attempt=' + nonce + '&error=access_denied'), true);
  assert.equal(f.exchanges(), 0); assert.equal(auth.current().pending, false);
});
test('expired, future and corrupt attempts fail closed', async () => {
  for (const raw of ['null', '{', JSON.stringify({ nonce, createdAt: -1000000 }), JSON.stringify({ nonce, createdAt: 999999 })]) {
    const f = fixture(); const auth = f.make(); f.values.set(PENDING_KEY, raw);
    assert.equal(await auth.handleUrl(callback), false); assert.equal(f.exchanges(), 0);
  }
});
test('browser-open and credential-write failures never leave a usable pending login', async () => {
  const f = fixture();
  const auth = createMobileAuth({ storage: f.storage, transport: f.transport, online: () => true,
    open: async () => { throw new Error('Browser unavailable'); } });
  await assert.rejects(auth.signIn()); assert.equal(f.values.has(PENDING_KEY), false);
  const locked = createMobileAuth({ storage: { ...f.storage, setItem: async () => { throw new Error('Keystore locked'); } },
    transport: f.transport, online: () => true, open: async () => assert.fail('Must not open before persistence') });
  await assert.rejects(locked.signIn());
});
test('failed exchange consumes attempt and requires a new login', async () => {
  const f = fixture(); f.transport.exchange = async () => { throw new Error('Network failure'); };
  const auth = f.make(); await auth.signIn(); await assert.rejects(auth.handleUrl(callback));
  assert.equal(await auth.handleUrl(callback), false); assert.equal(auth.current().pending, false);
});

// Authentication failures never remove account context or business data.
test('offline, refresh rejection and server failure preserve local account and outbox', async () => {
  const f = fixture(); const auth = f.make(); await auth.read(); f.values.set('business-outbox', 'pending');
  f.connected(false); await auth.read();
  assert.equal(auth.current().verification, 'unavailable'); assert.equal(auth.current().state.status, 'needs-auth');
  await assert.rejects(auth.signIn());
  f.connected(true); f.fail({ status: 401 }); await auth.read(); assert.equal(auth.current().verification, 'needs-auth');
  f.fail({ status: 400, code: 'refresh_token_not_found' }); await auth.read(); assert.equal(auth.current().verification, 'needs-auth');
  f.fail({ status: 503 }); await auth.read(); assert.equal(auth.current().verification, 'unavailable');
  assert.equal(f.values.get('business-outbox'), 'pending');
  const state = auth.current().state; assert.ok(state.status !== 'signed-out'); assert.equal(state.userId, 'user-a');
});
test('scope gate rejects another account, workspace, membership epoch and offline access', async () => {
  const f = fixture(); const auth = f.make(); const scope = { accountId: 'user-a', workspaceId: 'workspace-a', membershipEpoch: 'epoch-1' };
  assert.equal(await auth.verifyScope(scope), true);
  assert.equal(await auth.verifyScope({ ...scope, membershipEpoch: 'old' }), false);
  assert.equal(await auth.verifyScope({ ...scope, workspaceId: 'other' }), false);
  f.user('user-b'); assert.equal(await auth.verifyScope(scope), false);
  const before = f.membershipReads(); f.connected(false); assert.equal(await auth.verifyScope(scope), false);
  assert.equal(f.membershipReads(), before);
});
test('explicit logout removes auth context and keeps business records', async () => {
  const f = fixture(); const auth = f.make(); await auth.read(); await auth.signIn(); f.values.set('business-outbox', 'pending');
  await auth.signOut(); assert.equal(auth.current().state.status, 'signed-out');
  assert.equal(f.values.has(PENDING_KEY), false); assert.equal(f.values.has('last-account'), false);
  assert.equal(f.values.get('business-outbox'), 'pending');
});
test('credential adapter blocks every non-Android read/write/remove without calling native storage', async () => {
  const native = { getItem: async () => assert.fail(), setItem: async () => assert.fail(), removeItem: async () => assert.fail() };
  for (const platform of ['web', 'ios']) {
    const storage = createCredentialStorage(() => platform, native);
    await assert.rejects(storage.getItem('token')); await assert.rejects(storage.setItem('token', 'secret'));
    await assert.rejects(storage.removeItem('token'));
  }
  const f = fixture(); const secure = createCredentialStorage(() => 'android', f.storage);
  await secure.setItem('token', 'secret'); assert.equal(f.values.get('shopik-auth-v1:token'), 'secret');
  assert.equal(await secure.getItem('token'), 'secret'); await secure.removeItem('token');
});
test('configuration accepts only HTTPS public credentials', () => {
  const config = { VITE_SUPABASE_URL: 'https://project.supabase.co', VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_example' };
  assert.ok(readMobileAuthConfig(config));
  for (const url of ['http://project.supabase.co', 'https://user:pass@project.supabase.co', 'https://project.supabase.co/path'])
    assert.equal(readMobileAuthConfig({ ...config, VITE_SUPABASE_URL: url }), null);
  for (const key of ['sb_secret_example', '', 'invalid', 'a.' + btoa(JSON.stringify({ role: 'service_role' })) + '.b'])
    assert.equal(readMobileAuthConfig({ ...config, VITE_SUPABASE_PUBLISHABLE_KEY: key }), null);
});

// Exercise the installed SDK's real PKCE verifier generation and exchange against a fake HTTP server.
test('Supabase transport binds cold callback to SHA256 PKCE and checks membership via authenticated HTTP', async () => {
  const f = fixture(); let authorize = ''; let verifier = ''; let tokenRequests = 0;
  const user = { id: 'user-a', email: 'a@example.com', user_metadata: { name: 'Account A' }, app_metadata: {}, aud: 'authenticated', created_at: new Date().toISOString() };
  const http: typeof fetch = async (input, init) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
    if (url.pathname === '/auth/v1/token') {
      tokenRequests++;
      const body = JSON.parse(String(init?.body));
      assert.equal(body.auth_code, 'one-time-code'); assert.equal(url.searchParams.get('grant_type'), 'pkce');
      verifier = body.code_verifier; assert.ok(verifier.length >= 43);
      return Response.json({ access_token: 'mock-access-token', refresh_token: 'mock-refresh-token', token_type: 'bearer', expires_in: 3600, user });
    }
    if (url.pathname === '/auth/v1/user') {
      assert.equal(new Headers(init?.headers).get('Authorization'), 'Bearer mock-access-token'); return Response.json(user);
    }
    if (url.pathname === '/rest/v1/workspace_members') {
      assert.equal(url.searchParams.get('user_id'), 'eq.user-a');
      return Response.json([{ user_id: 'user-a', workspace_id: 'workspace-a', created_at: 'epoch-1' }]);
    }
    assert.fail('Unexpected mocked auth request');
  };
  const options = { config: { url: 'https://mock.supabase.co', key: 'sb_publishable_test' }, storage: f.storage,
    online: () => true, open: async (url: string) => { authorize = url; }, fetch: http };
  await createSupabaseAuth(options).signIn();
  const provider = new URL(authorize); assert.equal(provider.searchParams.get('code_challenge_method'), 's256');
  const redirect = new URL(provider.searchParams.get('redirect_to')!); redirect.searchParams.set('code', 'one-time-code');
  const cold = createSupabaseAuth(options);
  assert.equal(await cold.handleUrl(redirect.href), true);
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)));
  const challenge = Buffer.from(digest).toString('base64url');
  assert.equal(provider.searchParams.get('code_challenge'), challenge);
  assert.equal(await cold.verifyScope({ accountId: 'user-a', workspaceId: 'workspace-a', membershipEpoch: 'epoch-1' }), true);
  assert.equal(tokenRequests, 1); assert.equal(cold.current().state.status, 'signed-in');
});
