import assert from 'node:assert/strict';
import { test } from 'node:test';
import { categoryName } from '../lib/categories.ts';
import { currentKyivMonth, isExpenseMonth } from '../lib/expenses.ts';
import { validateProduct } from '../lib/products.ts';

// Bound names without rejecting Unicode labels or silently coercing input.
test('category names are trimmed, bounded and required', () => {
  assert.equal(categoryName(' Їжа '), 'Їжа');
  for (const value of ['', ' ', null, 123, 'а'.repeat(121)]) assert.equal(categoryName(value), null);
  assert.equal(categoryName('🍎'.repeat(120)), '🍎'.repeat(120));
});

test('products require an explicit category identifier', () => {
  for (const category_id of [undefined, null, '', 'other-workspace', 123]) {
    const result = validateProduct({ name: 'Молоко', description: '', price: '50', category_id });
    assert.equal(result.ok, false);
    if (!result.ok) assert.ok(result.fields.category_id);
  }
});

// UTC day boundaries differ from Kyiv both in winter and daylight-saving time.
test('Kyiv month boundaries include the correct month and year', () => {
  assert.equal(currentKyivMonth(new Date('2026-10-31T21:59:59Z')), '2026-10');
  assert.equal(currentKyivMonth(new Date('2026-10-31T22:00:00Z')), '2026-11');
  assert.equal(currentKyivMonth(new Date('2026-12-31T22:00:00Z')), '2027-01');
  assert.equal(currentKyivMonth(new Date('2026-06-30T21:00:00Z')), '2026-07');
});

test('month parameters cannot inject SQL or normalize invalid month numbers', () => {
  assert.equal(isExpenseMonth('2026-01'), true);
  assert.equal(isExpenseMonth('2026-12'), true);
  for (const value of ['2026-00', '2026-13', '26-01', '2026-1', '0000-01', '2026-01-01', "2026-01';delete", undefined]) assert.equal(isExpenseMonth(value), false);
});
