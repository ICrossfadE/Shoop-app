import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import ts from 'typescript';
import { createServerClient } from '@supabase/ssr';
import type { NextRequest as RequestType } from 'next/server.js';
import { AsyncLocalStorage } from 'node:async_hooks';

const require = createRequire(import.meta.url);
// Next normally installs this global when its server boots.
Object.assign(globalThis, { AsyncLocalStorage });
const { NextRequest } = require('next/server');
const { unstable_doesMiddlewareMatch: matchesProxy } = require('next/experimental/testing/server');
const url = 'https://session-fixture.supabase.co';
const uid = '03100000-0000-4000-8000-000000000001';
const cookieName = 'sb-session-fixture-auth-token';
const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
const now = Math.floor(Date.now() / 1000);
// HS256 forces the real SDK to validate through the isolated Auth endpoint.
const token = (expiry: number) => `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: uid, exp: expiry, iat: now, aud: 'authenticated', role: 'authenticated' })}.${Buffer.alloc(32).toString('base64url')}`;
const user = { id: uid, aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() };
const session = (expiry: number) => ({ access_token: token(expiry), refresh_token: 'fixture-refresh', expires_at: expiry, expires_in: 3600, token_type: 'bearer', user });
let refreshes = 0;
let revoked = false;
// Exercise real Supabase cookie rotation with local responses; never contact hosted Auth.
const fixtureFetch: typeof fetch = async (input) => {
  const target = String(input);
  if (target.includes('/token')) {
    refreshes++;
    if (revoked) return Response.json({ code: 'refresh_token_not_found', message: 'Revoked fixture' }, { status: 400 });
    return Response.json(session(now + 3600));
  }
  if (target.endsWith('/user')) return Response.json(user);
  throw Error('Unexpected Auth request');
};
// Compile the actual Proxy without Next alias resolution or a production server.
const source = ts.transpileModule(fs.readFileSync('proxy.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const compiled = { exports: {} as { config: { matcher: string[] }; proxy: (request: RequestType) => Promise<Response & { cookies: { getAll: () => { name: string; value: string; maxAge?: number }[] } }> } };
new Function('require', 'exports', source)((name: string) => {
  if (name === './lib/supabase/config') return { getSupabaseConfig: () => ({ url, key: 'fixture-key' }) };
  if (name === '@supabase/ssr') return { createServerClient: (u: string, k: string, options: Parameters<typeof createServerClient>[2]) => createServerClient(u, k, { ...options, global: { fetch: fixtureFetch } }) };
  return require(name);
}, compiled.exports);
const { proxy, config } = compiled.exports;
for (const pathname of ['/', '/expenses', '/settings', '/api/workspace', '/api/lists']) {
  assert.equal(matchesProxy({ config, url: `http://localhost${pathname}` }), true, pathname);
}
assert.equal(matchesProxy({ config, url: 'http://localhost/_next/static/app.js' }), false);
for (const pathname of ['/api/workspace', '/api/lists']) {
  const request = new NextRequest(`http://localhost${pathname}`, { headers: { Cookie: `${cookieName}=base64-${encode(session(now - 100))}` } });
  const response = await proxy(request);
  const rotated = response.cookies.getAll().find(cookie => cookie.name === cookieName);
  assert.ok(rotated?.value, 'API refresh must reach the response cookie');
  assert.equal(rotated.maxAge, 400 * 86400, 'Persistent cookies survive browser restart');
  assert.equal(request.cookies.get(cookieName)?.value, rotated.value, 'Route reads the rotated request session');
  assert.match(response.headers.get('cache-control')!, /no-store/);
  const before = refreshes;
  // A new request represents reload/reopen with the newly persisted browser cookie.
  await proxy(new NextRequest(`http://localhost${pathname}`, { headers: { Cookie: `${cookieName}=${rotated.value}` } }));
  assert.equal(refreshes, before, 'Reload must reuse a valid refreshed session');
}
assert.equal(refreshes, 2);
revoked = true;
const denied = await proxy(new NextRequest('http://localhost/api/workspace', { headers: { Cookie: `${cookieName}=base64-${encode(session(now - 100))}` } }));
assert.ok(denied.cookies.getAll().some(cookie => cookie.name === cookieName && cookie.maxAge === 0), 'Revoked refresh must remove the stale session');
console.log('PASS: actual Proxy matching, expired API tokens, real SDK rotation, 400-day cookie, reload/reopen, no-store and revoked-session cleanup (isolated Auth).');
