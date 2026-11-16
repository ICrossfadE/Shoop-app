import { test } from 'node:test';
import assert from 'node:assert/strict';
import { matches, productTotal, savings, isProductId, validateProduct, type TaggedProduct } from '../../shopik-app/lib/domain/index.ts';
import { matches as webMatches } from '../../shopik-app/lib/list-model.ts';
import { productTotal as webProductTotal } from '../../shopik-app/lib/money.ts';

// Verify the shared entry and web compatibility modules execute the same canonical rules.
test('both clients use identical functions for OR filters, quantity, plans and SHA256 IDs', () => {
  assert.equal(matches, webMatches);
  assert.equal(productTotal, webProductTotal);
  const product = { status: 'active', category_id: 'category', tags: [{ id: 'one' }], price: 12.5, quantity: 3 } as TaggedProduct;
  assert(matches(product, { kind: 'products', category: '', tags: ['other', 'one'], month: '' }));
  assert.equal(productTotal(product), 37.5);
  assert.deepEqual(savings([{ amount: 30, planned_amount: 37.5 }, { amount: 15 }]), { amount: 7.5, compared: 1, total: 2 });
  assert(isProductId('a'.repeat(64)));
  assert(!isProductId(crypto.randomUUID()));
  assert(!isProductId(`local:${crypto.randomUUID()}`));
  assert(!validateProduct({ name: 'Товар', price: '2.00', quantity: '0', category_id: crypto.randomUUID() }).ok);
});
