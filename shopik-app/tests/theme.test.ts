import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isTheme, resolveTheme, themes, themeColorScheme } from '../lib/theme.ts';

test('only six explicit themes are accepted', () => {
  for (const theme of themes) {
    assert.equal(isTheme(theme), true);
    assert.equal(resolveTheme(true, theme, 'dark'), theme);
    assert.equal(resolveTheme(false, null, theme), theme);
    assert.equal(themeColorScheme(theme), theme === 'dark' ? 'dark' : 'light');
  }
  assert.equal(themes.length, 6);
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
