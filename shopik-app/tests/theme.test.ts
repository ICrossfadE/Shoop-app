import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isTheme, resolveTheme } from '../lib/theme.ts';

test('only explicit light and dark themes are accepted', () => {
  assert.equal(isTheme('light'), true); assert.equal(isTheme('dark'), true);
  for (const value of ['system', 'DARK', '', null, {}, 'dark" onload="x']) assert.equal(isTheme(value), false);
});

test('profile overrides a previous account cookie after login', () => {
  assert.equal(resolveTheme(true, 'light', 'dark'), 'light');
  assert.equal(resolveTheme(true, 'dark', 'light'), 'dark');
  assert.equal(resolveTheme(true, undefined, 'dark'), 'light');
});

test('login uses the last local appearance with safe fallback', () => {
  assert.equal(resolveTheme(false, undefined, 'dark'), 'dark');
  assert.equal(resolveTheme(false, 'dark', undefined), 'light');
  assert.equal(resolveTheme(false, undefined, 'invalid'), 'light');
});
