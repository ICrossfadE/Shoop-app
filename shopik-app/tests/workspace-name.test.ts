import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseWorkspaceName } from '../lib/workspace-name.ts';

// Validate the same boundaries as PostgreSQL, including non-BMP names.
test('workspace names trim whitespace and enforce safe Unicode length', () => {
  assert.equal(parseWorkspaceName('  Наша оселя  '), 'Наша оселя');
  for (const value of ['', '   ', null, 12, 'a'.repeat(101), 'Дім\nОфіс', 'Дім\u0000']) {
    assert.equal(parseWorkspaceName(value), null);
  }
  assert.equal(parseWorkspaceName('🏠'.repeat(100)), '🏠'.repeat(100));
  assert.equal(parseWorkspaceName('🏠'.repeat(101)), null);
});
