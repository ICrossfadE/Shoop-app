import assert from 'node:assert/strict';
import { test } from 'node:test';
import { validateProduct, isProductId, isWorkspaceId } from '../lib/products.ts';

// Money validation must never silently round or accept JavaScript coercions.
test('accepts zero, decimal comma, and exact two-digit money boundaries', () => {
  for (const [price, expected] of [['0', 0], ['0.01', 0.01], ['12,50', 12.5], ['99999999.99', 99999999.99]] as const) {
    const result = validateProduct({ name: ' Молоко ', description: '', price });
    assert.equal(result.ok, true);
    if (result.ok) assert.deepEqual(result.value, { name: 'Молоко', description: '', price: expected });
  }
});

test('rejects negative, missing, nonfinite, exponent and overprecision prices', () => {
  for (const price of ['', ' ', '-1', '-0', 'NaN', 'Infinity', '1e2', '0.001', '12.345', '100000000', '1,2,3', '.50', true, 12, null]) {
    const result = validateProduct({ name: 'Продукт', description: '', price });
    assert.equal(result.ok, false, `Accepted invalid price: ${String(price)}`);
    if (!result.ok) assert.ok(result.fields.price);
  }
});

test('requires a bounded name but allows omitted or empty description', () => {
  for (const name of ['', '   ', 'а'.repeat(121), 123]) {
    assert.equal(validateProduct({ name, price: '0', description: '' }).ok, false);
  }
  assert.equal(validateProduct({ name: 'а'.repeat(120), price: '0' }).ok, true);
  assert.equal(validateProduct({ name: 'Продукт', price: '0', description: ' ' }).ok, true);
  assert.equal(validateProduct({ name: 'Продукт', price: '0', description: 'а'.repeat(2001) }).ok, false);
  assert.equal(validateProduct(null).ok, false);
});

test('counts Unicode codepoints consistently with PostgreSQL character limits', () => {
  assert.equal(validateProduct({ name: '🍎'.repeat(120), price: '0' }).ok, true);
  assert.equal(validateProduct({ name: '🍎'.repeat(121), price: '0' }).ok, false);
});

test('never forwards caller-supplied ownership, currency or status fields', () => {
  const result = validateProduct({ name: 'Молоко', description: '', price: '50', created_by: 'other', workspace_id: 'other', currency: 'USD', status: 'completed' });
  assert.deepEqual(result, { ok: true, value: { name: 'Молоко', description: '', price: 50 } });
});

test('rejects legacy IDs and injection-shaped identifiers', () => {
  assert.equal(isProductId('a'.repeat(64)), true);
  assert.equal(isProductId('A'.repeat(64)), false);
  assert.equal(isProductId(Date.now()), false);
  assert.equal(isProductId("id' OR true"), false);
  assert.equal(isWorkspaceId('b8bc6ee0-9ddb-456a-8f41-637ec271a001'), true);
  assert.equal(isWorkspaceId(''), false);
  assert.equal(isWorkspaceId(null), false);
});
