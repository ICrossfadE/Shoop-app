import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { getSupabaseConfig } from '../lib/supabase/config.ts';

const names = ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'NEXT_PUBLIC_SUPABASE_ANON_KEY'] as const;
const original = Object.fromEntries(names.map((name) => [name, process.env[name]]));
afterEach(() => {
  for (const name of names) {
    if (original[name] === undefined) delete process.env[name];
    else process.env[name] = original[name];
  }
});

function configure(url?: string, publishable?: string, anon?: string) {
  for (const [name, value] of [[names[0], url], [names[1], publishable], [names[2], anon]]) {
    if (value === undefined) delete process.env[name!];
    else process.env[name!] = value;
  }
}

test('missing configuration fails closed', () => {
  configure();
  assert.equal(getSupabaseConfig(), null);
  configure('https://example.supabase.co');
  assert.equal(getSupabaseConfig(), null);
});

test('accepts publishable key and gives it precedence over legacy anon key', () => {
  configure(' https://example.supabase.co ', ' publishable-test ', 'legacy-test');
  assert.deepEqual(getSupabaseConfig(), { url: 'https://example.supabase.co', key: 'publishable-test' });
});

test('supports legacy anon key and local Supabase', () => {
  configure('http://127.0.0.1:54321', undefined, 'legacy-test');
  assert.deepEqual(getSupabaseConfig(), { url: 'http://127.0.0.1:54321', key: 'legacy-test' });
});

test('rejects malformed URLs and unsupported protocols', () => {
  for (const url of ['invalid', 'javascript:alert(1)', 'file:///tmp/supabase']) {
    configure(url, 'test-key');
    assert.equal(getSupabaseConfig(), null);
  }
});
