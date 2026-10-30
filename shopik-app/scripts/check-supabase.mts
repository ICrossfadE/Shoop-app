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

for (const table of ['profiles', 'workspaces', 'workspace_members', 'products', 'categories', 'expenses', 'tags', 'product_tags']) {
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
// Supply the correct signature to distinguish missing RPC from denied execution.
const deniedSummary = await fetch(config.url + '/rest/v1/rpc/expense_month', {
  method: 'POST', headers: { apikey: config.key, 'Content-Type': 'application/json' },
  body: JSON.stringify({ p_workspace_id: 'b8bc6ee0-9ddb-456a-8f41-637ec271a099', p_month: '2026-10-01' }),
  signal: AbortSignal.timeout(15000),
});
assert.ok([401, 403].includes(deniedSummary.status), 'Anonymous expense aggregation must be denied');
console.log('PASS: expense aggregation rejects anonymous execution.');
// New tag RPCs must also be present and inaccessible to the anonymous role.
for (const [rpc, body] of [
  ['workspace_product_authors', { p_workspace_id: 'b8bc6ee0-9ddb-456a-8f41-637ec271a099' }],
  ['filtered_products', { p_workspace_id: 'b8bc6ee0-9ddb-456a-8f41-637ec271a099', p_category_id: 'b8bc6ee0-9ddb-456a-8f41-637ec271a099', p_tag_ids: [] }],
  ['expense_month_tags', { p_workspace_id: 'b8bc6ee0-9ddb-456a-8f41-637ec271a099', p_month: '2026-10-01', p_tag_ids: [] }],
  ['save_product_tags', { p_workspace_id: 'b8bc6ee0-9ddb-456a-8f41-637ec271a099', p_product_id: null, p_name: 'Rejected test', p_description: '', p_price: 0, p_category_id: 'b8bc6ee0-9ddb-456a-8f41-637ec271a099', p_tag_ids: [] }],
] as const) {
  const response = await fetch(config.url + `/rest/v1/rpc/${rpc}`, { method: 'POST', headers: { apikey: config.key, 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(15000) });
  assert.ok([401, 403].includes(response.status), `Anonymous access to ${rpc} must be denied`);
  console.log(`PASS: ${rpc} rejects anonymous execution.`);
}
if (process.argv.includes('--optimistic')) {
  for (const [rpc, body] of [
    ['list_snapshot', { p_workspace_id: 'b8bc6ee0-9ddb-456a-8f41-637ec271a099', p_kind: 'products', p_category_id: null, p_month: null, p_tag_ids: [] }],
    ['product_authors_for_ids', { p_workspace_id: 'b8bc6ee0-9ddb-456a-8f41-637ec271a099', p_ids: [] }],
    ['apply_operation', { p_workspace_id: 'b8bc6ee0-9ddb-456a-8f41-637ec271a099', p_operation_id: 'b8bc6ee0-9ddb-456a-8f41-637ec271a099', p_kind: 'create_tag', p_payload: {} }],
  ] as const) {
    const response = await fetch(config.url + '/rest/v1/rpc/' + rpc, { method: 'POST', headers: { apikey: config.key, 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(15000) });
    assert.ok([401, 403].includes(response.status), rpc + ' must exist and reject anonymous execution (apply migration 008 first)');
    console.log('PASS: ' + rpc + ' rejects anonymous execution.');
  }
}
console.log('NOT TESTED: two-user RLS, duplicate Workspaces, authenticated session refresh and logout.');
