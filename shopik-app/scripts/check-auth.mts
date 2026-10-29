import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { getSupabaseConfig } from '../lib/supabase/config.ts';

// Read only local application settings; never print keys or session cookies.
process.loadEnvFile('.env.local');
const supabaseConfig = getSupabaseConfig();
assert.ok(supabaseConfig, 'Supabase must be configured for authentication checks');

// Run after a production build. Uses a dedicated test port and stops its own server.
const port = 3187;
const origin = `http://localhost:${port}`;
const server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '--hostname', 'localhost', '--port', String(port)], {
  stdio: 'ignore',
  windowsHide: true,
});

// Next.js may stream loading.tsx first, then emit a redirect meta tag with HTTP 200.
// Require the actual login redirect and ensure no protected Workspace HTML leaked.
async function assertLoginRedirect(response: Response) {
  assert.match(response.headers.get('cache-control')!, /no-store/);
  if (response.status === 307) {
    assert.equal(new URL(response.headers.get('location')!, origin).pathname, '/login');
    return;
  }
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.ok(/<meta[^>]*http-equiv="refresh"[^>]*content="[01];url=\/login"/.test(html), 'Streamed response must redirect to login');
  assert.ok(!/id="workspace-heading"|aria-label="Продукти"|id="expense-categories"|id="workspace-tags"/.test(html), 'Unauthenticated response must not include Workspace HTML');
}

try {
  let ready = false;
  for (let attempt = 0; attempt < 40; attempt++) {
    if (server.exitCode !== null) throw new Error('Test server exited before becoming ready.');
    try {
      await fetch(`${origin}/login`, { signal: AbortSignal.timeout(1000) });
      ready = true;
      break;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  assert.ok(ready, 'Test server must become ready');

  const home = await fetch(`${origin}/`, { redirect: 'manual' });
  await assertLoginRedirect(home);
  const expenses = await fetch(`${origin}/expenses`, { redirect: 'manual' });
  await assertLoginRedirect(expenses);
  const tags = await fetch(`${origin}/tags`, { redirect: 'manual' });
  await assertLoginRedirect(tags);

  const login = await fetch(`${origin}/login`);
  assert.equal(login.status, 200);
  assert.match(await login.text(), /Shopik/);

  for (const path of ['/auth/callback', '/auth/callback?error=access_denied', '/auth/callback?code=shopik-invalid-test-code', '/auth/callback?next=https://example.com', '/auth/callback?next=//example.com']) {
    const response = await fetch(origin + path, { redirect: 'manual' });
    assert.equal(response.status, 307);
    const destination = new URL(response.headers.get('location')!, origin);
    assert.equal(destination.origin, origin);
    assert.equal(destination.pathname, '/login');
    assert.equal(destination.searchParams.get('error'), 'oauth');
    assert.match(response.headers.get('cache-control')!, /no-store/);
  }

  // A forged session contains plausible user metadata but no valid signature.
  // The real Auth service must reject it before Workspace initialization.
  const now = Math.floor(Date.now() / 1000);
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const fakeUserId = 'b8bc6ee0-9ddb-456a-8f41-637ec271a099';
  const jwt = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: fakeUserId, aud: 'authenticated', role: 'authenticated', iat: now, exp: now + 3600 })}.${Buffer.alloc(32).toString('base64url')}`;
  const forgedSession = {
    access_token: jwt,
    refresh_token: 'shopik-invalid-refresh-token',
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: now + 3600,
    user: { id: fakeUserId, aud: 'authenticated', role: 'authenticated' },
  };
  const projectRef = new URL(supabaseConfig.url).hostname.split('.')[0];
  const cookieName = `sb-${projectRef}-auth-token`;
  for (const cookieValue of ['base64-invalid', `base64-${encode(forgedSession)}`]) {
    for (const path of ['/', '/expenses', '/tags']) {
      const denied = await fetch(`${origin}${path}`, {
        redirect: 'manual',
        headers: { Cookie: `${cookieName}=${cookieValue}` },
        signal: AbortSignal.timeout(20000),
      });
      await assertLoginRedirect(denied);
    }
  }
  console.log('PASS: protected root, login, invalid OAuth code, OAuth cancellation, open redirect rejection, no-store headers, damaged and forged session cookies.');
} finally {
  if (server.exitCode === null) {
    const exited = once(server, 'exit');
    server.kill();
    await exited;
  }
}
