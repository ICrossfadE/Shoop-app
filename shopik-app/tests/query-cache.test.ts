import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AccessError, QueryCache } from '../lib/query-cache.ts';
import { listKey, type ListData, type ListFilter } from '../lib/list-model.ts';
import type { TaggedProduct } from '../lib/tags.ts';

const filter: ListFilter = { kind: 'products', category: 'food', month: '', tags: [] };
const product = (id: string, name = id): TaggedProduct => ({ id, name, workspace_id: 'w', category_id: 'food', created_by: 'u', description: '', price: 10, currency: 'UAH', status: 'active', created_at: '2026-10-30', updated_at: '2026-10-30', tags: [] });
const snapshot = (...products: TaggedProduct[]): ListData => ({ products, authors: [], expenses: null });
const deferred = <T>() => { let resolve!: (value: T) => void; const promise = new Promise<T>((done) => { resolve = done; }); return { promise, resolve }; };

test('cache normalizes filters, isolates accounts/workspaces, skips fresh reads and deduplicates pending reads', async () => {
  let now = 100_000, calls = 0;
  const cache = new QueryCache(30_000, () => now);
  assert.equal(listKey('a:w', { ...filter, tags: ['b', 'a', 'a'] }), listKey('a:w', { ...filter, tags: ['a', 'b'] }));
  assert.notEqual(listKey('a:w', filter), listKey('b:w', filter));
  assert.notEqual(listKey('a:w', filter), listKey('a:x', filter));
  const response = deferred<ListData>();
  const loader = () => { calls++; return response.promise; };
  const a = cache.load('a:w', filter, loader), b = cache.load('a:w', filter, loader);
  assert.equal(calls, 1);
  response.resolve(snapshot(product('1'))); await Promise.all([a, b]);
  await cache.load('a:w', filter, loader); assert.equal(calls, 1);
  now += 30_001; await cache.load('a:w', filter, loader); assert.equal(calls, 2);
  cache.activate('b'); assert.equal(cache.entries.size, 0);
});

test('failed optimistic operation rolls back only itself; unrelated success and filter changes survive', () => {
  const cache = new QueryCache();
  cache.seed('u:w', filter, snapshot(product('1'), product('2')));
  assert.equal(cache.begin('a', { scope: 'u:w', id: '1', product: product('1', 'pending') }), true);
  assert.equal(cache.begin('duplicate', { scope: 'u:w', id: '1', remove: true }), false);
  cache.begin('b', { scope: 'u:w', id: '2', remove: true });
  assert.deepEqual(cache.view('u:w', filter)?.products.map((p) => p.name), ['pending']);
  cache.finish('b', { product: { ...product('2'), status: 'completed' } });
  cache.finish('a');
  assert.deepEqual(cache.view('u:w', filter)?.products.map((p) => p.id), ['1']);
  assert.equal(cache.view('u:w', { ...filter, category: 'other' }), undefined);
});

test('a late read cannot resurrect a confirmed completion; next read reconciles', async () => {
  const cache = new QueryCache();
  cache.seed('u:w', filter, snapshot(product('1')));
  const response = deferred<ListData>(); let calls = 0;
  const loader = () => ++calls === 1 ? response.promise : Promise.resolve(snapshot());
  const loading = cache.load('u:w', filter, loader, true);
  cache.begin('done', { scope: 'u:w', id: '1', remove: true });
  cache.finish('done', { product: { ...product('1'), status: 'completed' } });
  response.resolve(snapshot(product('1'))); await loading;
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(cache.view('u:w', filter)?.products, []);
  assert.equal(calls, 2);
});

test('background failure retains last good data, but access denial clears all private memory', async () => {
  const cache = new QueryCache(); cache.activate('u');
  cache.seed('u:w', filter, snapshot(product('1')));
  await cache.load('u:w', filter, async () => { throw new Error('offline'); }, true);
  assert.equal(cache.view('u:w', filter)?.products[0].id, '1');
  assert.ok(cache.entry('u:w', filter)?.error);
  await assert.rejects(cache.load('u:w', filter, async () => { throw new AccessError(); }, true), AccessError);
  assert.equal(cache.entries.size, 0); assert.equal(cache.overlays.size, 0);
});

test('expense deletion changes rows and totals together and rolls back both on rejection', () => {
  const cache = new QueryCache(); const month = { ...filter, kind: 'expenses' as const, month: '2026-10' };
  const items = ['1', '2'].map((id) => ({ id, product_id: id, workspace_id: 'w', name: id, category_id: 'food', category_name: 'Food', amount: 0.1, currency: 'UAH' as const, occurred_at: '2026-10-30' }));
  cache.seed('u:w', month, { products: [], authors: [], expenses: { items, total: 0.2, categories: [{ category_id: 'food', category_name: 'Food', total: 0.2, count: 2 }] } });
  cache.begin('delete', { scope: 'u:w', id: '1', remove: true, expense: true });
  assert.equal(cache.view('u:w', month)?.expenses?.total, 0.1);
  assert.equal(cache.view('u:w', month)?.expenses?.items.length, 1);
  cache.finish('delete'); assert.equal(cache.view('u:w', month)?.expenses?.total, 0.2);
  cache.begin('delete', { scope: 'u:w', id: '1', remove: true, expense: true });
  cache.finish('delete', { deleted: '1' });
  assert.equal(cache.view('u:w', month)?.expenses?.total, 0.1);
});

test('a response from a signed-out account cannot clear the next account or its draft', async () => {
  const cache = new QueryCache(); cache.activate('a');
  let reject!: (error: Error) => void;
  const loading = cache.load('a:w', filter, () => new Promise((_resolve, fail) => { reject = fail; }));
  cache.activate('b'); cache.seed('b:w', filter, snapshot(product('b')));
  reject(new AccessError()); await loading;
  assert.equal(cache.owner, 'b');
  assert.equal(cache.view('b:w', filter)?.products[0].id, 'b');
});

test('optimistic expense categories preserve historical names for the same category ID', () => {
  const cache = new QueryCache(); const month = { ...filter, kind: 'expenses' as const, month: '2026-10' };
  const items = ['Old name', 'New name', 'Other'].map((name, index) => ({ id: String(index), product_id: String(index), workspace_id: 'w', name: 'Milk', category_id: 'food', category_name: name, amount: 1, currency: 'UAH' as const, occurred_at: '2026-10-30' }));
  cache.seed('u:w', month, { products: [], authors: [], expenses: { items, total: 3, categories: [] } });
  cache.begin('delete', { scope: 'u:w', id: '2', expense: true, remove: true });
  assert.equal(cache.view('u:w', month)?.expenses?.categories.length, 2);
  assert.equal(cache.view('u:w', month)?.expenses?.total, 2);
});

test('a warmed expense screen is invalidated by completion before its first visit', async () => {
  const cache = new QueryCache();
  const month: ListFilter = { kind: 'expenses', category: '', month: '2026-10', tags: [] };
  const old: ListData = { products: [], authors: [], expenses: { items: [], total: 0, categories: [] } };
  cache.seed('u:w', month, old);
  cache.begin('complete', { scope: 'u:w', id: '1', remove: true });
  cache.finish('complete', { product: { ...product('1'), status: 'completed' } });
  // A server/bootstrap copy must not silently mark invalidated data as fresh.
  cache.seed('u:w', month, old);
  let calls = 0;
  await cache.load('u:w', month, async () => { calls++; return { ...old, expenses: { items: [], total: 50, categories: [] } }; });
  assert.equal(calls, 1);
  assert.equal(cache.view('u:w', month)?.expenses?.total, 50);
});

// Persistent restore must not cross the account boundary or override a fresh server seed.
test('persistent snapshots restore exact filters and late hydration cannot revive signed-out data', async () => {
  const reads = deferred<ListData>();
  const writes: string[] = [];
  const storage = {
    read: () => reads.promise,
    write: async (_owner: string, key: string) => { writes.push(key); },
    clear: async () => {}, remove: async () => {}, invalidate: async () => {},
  } as unknown as typeof import('../lib/local-store.ts').localStore;
  const cache = new QueryCache(30000, Date.now, storage);
  cache.activate('a');
  const loading = cache.load('a:w', filter, async () => { throw new Error('offline'); });
  cache.activate('b');
  reads.resolve(snapshot(product('private-a')));
  await loading;
  assert.equal(cache.owner, 'b');
  assert.equal(cache.entries.size, 0);
  assert.deepEqual(writes, []);
});

test('disk fallback stays visible after a network failure and is never marked fresh', async () => {
  const storage = {
    read: async () => snapshot(product('saved')),
    write: async () => {}, clear: async () => {}, remove: async () => {}, invalidate: async () => {},
  } as unknown as typeof import('../lib/local-store.ts').localStore;
  const cache = new QueryCache(30000, Date.now, storage);
  cache.activate('u');
  await cache.load('u:w', filter, async () => { throw new Error('offline'); });
  assert.equal(cache.view('u:w', filter)?.products[0].id, 'saved');
  assert.equal(cache.entry('u:w', filter)?.at, 0);
  assert.ok(cache.entry('u:w', filter)?.error);
  assert.equal(cache.view('u:w', {...filter, tags:['missing']}), undefined);
});

// Eviction of one Workspace must not discard a different Workspace's in-memory snapshot.
test('revocation purges only the targeted Workspace including late reads', async () => {
  const cache=new QueryCache(); cache.activate('u');
  cache.seed('u:revoked',filter,snapshot(product('private')));
  cache.seed('u:personal',filter,snapshot(product('keep')));
  const response=deferred<ListData>();
  const reading=cache.load('u:revoked',filter,()=>response.promise,true);
  cache.revoke('u:revoked');
  response.resolve(snapshot(product('late')));await reading;
  assert.equal(cache.view('u:revoked',filter),undefined);
  assert.equal(cache.view('u:personal',filter)?.products[0].id,'keep');
});
