import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateProduct } from '../lib/products.ts';
import { productTotal, savings } from '../lib/money.ts';
import { matches, listKey } from '../lib/list-model.ts';
import { chooseCategory, lastCategoryKey } from '../lib/shopping.ts';
import type { TaggedProduct } from '../lib/tags.ts';
import type { Category } from '../lib/categories.ts';

const category = '01900000-0000-4000-8000-000000000001';
const input = { name: 'Кава', price: '0,07', category_id: category };

// Quantity cannot silently round, accept exponent syntax or overflow the total.
test('quantity is optional, integral, bounded and multiplied in kopecks', () => {
  for (const quantity of [undefined, '', '1', '3', '1000000']) {
    const result = validateProduct({ ...input, quantity });
    assert.ok(result.ok);
    if (result.ok) assert.equal(productTotal(result.value), quantity === '3' ? .21 : quantity === '1000000' ? 70000 : .07);
  }
  for (const quantity of ['0', '-1', '1.5', '1e2', '1000001', '01', ' ', null, 3]) {
    assert.equal(validateProduct({ ...input, quantity }).ok, false, String(quantity));
  }
  assert.equal(validateProduct({ ...input, price: '99999999.99', quantity: '2' }).ok, false);
  assert.equal(productTotal({ price: 20 }), 20);
});

// Mixed historical data must not invent either savings or a zero planned amount.
test('savings preserve the initial plan, count known rows and report overspending', () => {
  const initial = { amount: 250, planned_amount: 300 };
  assert.deepEqual(savings([initial, { amount: 50, planned_amount: null }]), { amount: 50, compared: 1, total: 2 });
  assert.deepEqual(savings([{ ...initial, amount: 350 }]), { amount: -50, compared: 1, total: 1 });
  assert.deepEqual(savings([{ amount: .20, planned_amount: .21 }]), { amount: .01, compared: 1, total: 1 });
  assert.deepEqual(savings([{ amount: 999 }]), { amount: 0, compared: 0, total: 1 });
  assert.equal(initial.planned_amount, 300);
});

test('OR filtering matches either tag once and supports all-category snapshots', () => {
  const product = { status: 'active', category_id: category, tags: [{ id: 'a' }, { id: 'b' }] } as TaggedProduct;
  const filter = { kind: 'products' as const, category: '', month: '', tags: ['a', 'unknown'] };
  assert.equal(matches(product, filter), true);
  assert.equal(matches(product, { ...filter, tags: ['unknown'] }), false);
  assert.equal(matches(product, { ...filter, tags: [] }), true);
  assert.equal(matches(product, { ...filter, category: 'other' }), false);
  assert.equal(matches({ ...product, status: 'completed' }, filter), false);
  assert.equal(listKey('scope', filter), listKey('scope', { ...filter, tags: ['unknown', 'a', 'a'] }));
  assert.ok(listKey('scope', filter).includes('019-or-quantity'));
});

test('category memory cannot override an explicit category or reuse a deleted one', () => {
  const categories = [{ id: 'first' }, { id: 'last' }] as Category[];
  assert.equal(chooseCategory(categories, 'first', 'last'), 'first');
  assert.equal(chooseCategory(categories, null, 'last'), 'last');
  assert.equal(chooseCategory(categories, null, 'deleted'), 'first');
  assert.equal(chooseCategory([], null, 'last'), '');
  assert.notEqual(lastCategoryKey('a', 'space'), lastCategoryKey('b', 'space'));
  assert.notEqual(lastCategoryKey('a', 'space'), lastCategoryKey('a', 'other'));
});
