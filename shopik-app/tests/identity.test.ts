import assert from 'node:assert/strict';
import { test } from 'node:test';
import { accountFromClaims, creationDate, initials, safeAvatarUrl } from '../lib/identity.ts';

test('display identity uses verified metadata and falls back without inventing another author', () => {
  assert.deepEqual(accountFromClaims({ full_name: 'Anna', avatar_url: 'https://example.com/a.png' }, 'a@example.com'), { name: 'Anna', avatar_url: 'https://example.com/a.png' });
  assert.deepEqual(accountFromClaims(null, 'a@example.com'), { name: 'a@example.com', avatar_url: '' });
  assert.equal(accountFromClaims({}, undefined).name, 'Мій акаунт');
  assert.equal(initials(' Анна Петренко '), 'АП');
  assert.equal(initials(''), '?');
});

test('avatar sources reject executable URLs and credentials', () => {
  for (const source of ['javascript:alert(1)', 'data:image/svg+xml,x', 'http://example.com/a', 'https://user:password@example.com/a', null]) assert.equal(safeAvatarUrl(source), '');
  assert.equal(safeAvatarUrl('https://example.com/a'), 'https://example.com/a');
});

test('creation date renders in Kyiv independently of the host timezone', () => {
  assert.match(creationDate('2026-10-31T22:30:00Z'), /1 лист/);
  assert.equal(creationDate('invalid'), 'Дата невідома');
});
