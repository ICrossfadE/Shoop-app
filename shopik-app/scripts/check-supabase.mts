import assert from 'node:assert/strict';
import { getSupabaseConfig } from '../lib/supabase/config.ts';

// These checks use only the public key, never create users, and never log rows.
process.loadEnvFile('.env.local');
const config = getSupabaseConfig();
assert.ok(config, 'Configure Supabase in .env.local before running this check');

// Keep failures useful without exposing API keys or response data.
async function request(path: string, method = 'GET') {
  const response = await fetch(config!.url + path, {
    method,
    headers: { apikey: config!.key, 'Content-Type': 'application/json' },
    ...(method === 'POST' ? { body: '{}' } : {}),
    signal: AbortSignal.timeout(15000),
  });
  return { status: response.status, body: await response.json() };
}

const auth = await request('/auth/v1/settings');
assert.equal(auth.status, 200, 'Supabase Auth must accept the public key');
assert.equal(auth.body.external?.google, true, 'Google provider must be enabled');
console.log('PASS: Supabase connection and Google provider.');

for (const table of ['profiles', 'workspaces', 'workspace_members', 'products']) {
  const result = await request(`/rest/v1/${table}?select=*&limit=1`);
  assert.notEqual(result.status, 404, `${table} must exist in the API schema`);
  const denied = [401, 403].includes(result.status) && result.body.code === '42501';
  const filtered = result.status === 200 && Array.isArray(result.body) && result.body.length === 0;
  assert.ok(denied || filtered, `Anonymous access to ${table} must not expose data`);
  console.log(`PASS: anonymous access to ${table} blocked or filtered.`);
}

const bootstrap = await request('/rest/v1/rpc/ensure_personal_workspace', 'POST');
assert.ok([401, 403].includes(bootstrap.status), 'Anonymous Workspace bootstrap must be denied');
assert.equal(bootstrap.body.code, '42501', 'Bootstrap RPC must exist and reject execution privileges');
console.log('PASS: Workspace RPC exists and rejects anonymous execution.');
console.log('NOT TESTED: two-user RLS, duplicate Workspaces, authenticated session refresh and logout.');
