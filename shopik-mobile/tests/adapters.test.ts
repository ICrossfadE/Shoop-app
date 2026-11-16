import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createNavigation, restoreScreen, screenFromLocalUrl } from '../src/adapters/navigation.ts';
import { createThemeAdapter } from '../src/adapters/theme.ts';
import { createInvitationLinks } from '../src/adapters/invitation-links.ts';

// Model a preference store without introducing a browser or persisting private data.
function memoryStorage() {
  const values = new Map<string, string>();
  return { values, getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); } };
}

// Restoring a non-root tab must preserve a usable Back path and root exit.
test('navigation restores a tab, handles Back and unsubscribes observers', () => {
  const storage = memoryStorage();
  const first = createNavigation(storage);
  const changes: string[] = [];
  const stop = first.subscribe(screen => changes.push(screen));
  first.navigate('expenses'); first.navigate('expenses'); first.navigate('settings');
  assert.deepEqual(changes, ['expenses', 'settings']);
  stop(); first.navigate('products');
  assert.deepEqual(changes, ['expenses', 'settings']);
  first.navigate('settings');
  const cold = createNavigation(storage);
  assert.equal(cold.current(), 'settings');
  assert.equal(cold.back(), true);
  assert.equal(cold.current(), 'products');
  assert.equal(cold.back(), false);
  assert.equal(createNavigation(storage).current(), 'products');
});

// Corrupt/foreign preference data cannot introduce arbitrary navigation destinations.
test('route restoration and OS URLs accept only local product screens', () => {
  for (const value of ['broken', 'null', '{"version":2,"screen":"settings"}',
    '{"version":1,"screen":"https://evil.example"}', '{"version":1,"screen":"__proto__"}']) {
    assert.equal(restoreScreen(value), 'products');
  }
  assert.equal(screenFromLocalUrl('https://localhost/expenses'), 'expenses');
  assert.equal(screenFromLocalUrl('https://localhost/'), 'products');
  for (const value of ['https://evil.example/settings', 'https://localhost/settings?code=secret',
    'https://localhost/settings#token=secret', 'https://user:pass@localhost/settings',
    'http://localhost/settings', 'https://localhost/invite', 'javascript:alert(1)']) {
    assert.equal(screenFromLocalUrl(value), null);
  }
});

// Storage denial must leave navigation usable and must not masquerade as saved settings.
test('preference storage failures allow navigation but report failed theme persistence', () => {
  const denied = { getItem(): never { throw new Error('Denied'); }, setItem(): never { throw new Error('Quota'); } };
  let failures = 0;
  const navigation = createNavigation(denied, () => failures++);
  navigation.navigate('settings');
  assert.equal(navigation.current(), 'settings');
  assert.equal(navigation.back(), true);
  assert.equal(failures, 3);
  const theme = createThemeAdapter(denied);
  assert.equal(theme.load(), 'light');
  assert.throws(() => theme.save('dark'), /Quota/);
  assert.throws(() => createThemeAdapter(undefined).save('dark'));
});

// Appearance survives a new adapter, while untrusted stored values stay inert.
test('all supported themes persist without storing session or workspace data', () => {
  const storage = memoryStorage();
  for (const theme of ['light', 'dark', 'pink', 'light-blue', 'light-green', 'light-pink'] as const) {
    createThemeAdapter(storage).save(theme);
    assert.equal(createThemeAdapter(storage).load(), theme);
  }
  assert.equal(storage.values.size, 1);
  const key = [...storage.values.keys()][0];
  storage.setItem(key, '<script>');
  assert.equal(createThemeAdapter(storage).load(), 'light');
});

// Public invite links retain their canonical origin and keep the secret in the fragment.
test('invitation adapter rejects wrong origins, invalid tokens and unsafe canonical URLs', () => {
  const links = createInvitationLinks('https://shopik.example');
  const token = 'a'.repeat(43);
  const url = links.create(token);
  assert.equal(url, `https://shopik.example/invite#token=${token}`);
  assert.equal(links.parse(url), token);
  assert.equal(links.parse(`https://other.example/invite#token=${token}`), null);
  assert.equal(links.parse(`${url}&other=value`), null);
  assert.throws(() => links.create('invalid'));
  for (const origin of ['http://shopik.example', 'https://localhost', 'https://user:pass@shopik.example', 'https://shopik.example/path']) {
    assert.throws(() => createInvitationLinks(origin));
  }
});
