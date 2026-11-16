import { test } from 'node:test';
import assert from 'node:assert/strict';
import { IDBFactory, IDBObjectStore } from 'fake-indexeddb';
import { openLocalRepository, expensePeriod, type LocalRepository, type LocalOperation, type WorkspaceRecord, type ServerReply } from '../src/repository/index.ts';
import type { WorkspaceScope } from '../../shopik-app/lib/domain/index.ts';
import { scopeKey } from '../src/contracts.ts';

const scope: WorkspaceScope = { accountId: '00000000-0000-0000-0000-000000000001', workspaceId: '00000000-0000-0000-0000-000000000002', membershipEpoch: '2026-11-05T00:00:00.000Z' };
const occurredAt = '2026-11-05T10:00:00.000Z';
const key = () => (`local:${crypto.randomUUID()}` as const);
const serverCategory = '10000000-0000-0000-0000-000000000001';
const serverTag = '10000000-0000-0000-0000-000000000002';
const serverProduct = 'a'.repeat(64);
const serverExpense = '10000000-0000-0000-0000-000000000003';

// Create an entirely offline dependency chain without touching the network or user credentials.
async function chain(repo: LocalRepository, currentScope = scope) {
  const category = key(), tag = key(), product = key(), expense = key();
  const operations = [];
  operations.push(await repo.accept(currentScope, { kind: 'category.create', id: category, name: 'Food' }, { occurredAt }));
  operations.push(await repo.accept(currentScope, { kind: 'tag.create', id: tag, name: 'Weekly', color: '#22633D' }, { occurredAt }));
  operations.push(await repo.accept(currentScope, { kind: 'product.save', id: product, categoryId: category, tagIds: [tag],
    name: category, description: 'Keep literal local IDs in user text', price: '12.50', quantity: '2' }, { occurredAt }));
  operations.push(await repo.accept(currentScope, { kind: 'product.complete', items: [{ id: product, amount: '24.00', expenseId: expense }] }, { occurredAt }));
  return { category, tag, product, expense, operations };
}
// Model the future protocol boundary with explicit canonical entities and ID mappings.
async function confirm(repo: LocalRepository, op: LocalOperation, localId: string, kind: 'category'|'tag'|'product'|'expense', serverId: string) {
  const view = await repo.load(scope); const graph = view.workspace.projection;
  const row = kind === 'category' ? graph.categories[localId] : kind === 'tag' ? graph.tags[localId] : kind === 'product' ? graph.products[localId] : graph.expenses[localId];
  assert.ok(row);
  const patch: ServerReply['patch'] = kind === 'category' ? { categories: [{ ...graph.categories[localId], id: serverId }] } :
    kind === 'tag' ? { tags: [{ ...graph.tags[localId], id: serverId }] } :
    kind === 'product' ? { products: [{ ...graph.products[localId], id: serverId, status: 'active' }], productTags: [{ productId: serverId, tagIds: graph.productTags[localId] }] } :
    { expenses: [{ ...graph.expenses[localId], id: serverId }], products: [graph.products[serverProduct]] };
  return repo.acknowledge(scope, op.id, { revision: 'revision-' + op.sequence, mappings: [{ kind, localId: localId as `local:${string}`, serverId }], patch });
}

// Fresh instances must recover every action and its exact chronological metadata.
test('offline category/tag/product/completion survive close and reopen without TTL pruning', async () => {
  const factory = new IDBFactory(); const first = await openLocalRepository(factory); const data = await chain(first);
  const before = await first.load(scope); first.close(); const reopened = await openLocalRepository(factory);
  const after = await reopened.load(scope); assert.deepEqual(after, before);
  assert.deepEqual(after.operations.map(op => op.sequence), [1,2,3,4]);
  assert.equal(after.workspace.confirmed.bootstrapped, false); assert.equal(after.workspace.projection.products[data.product].status, 'completed');
  assert.equal(after.workspace.projection.expenses[data.expense].amount, 24); assert.equal(after.workspace.projection.expenses[data.expense].planned_amount, 25);
  assert.deepEqual(after.workspace.projection.productTags[data.product], [data.tag]);
  assert.ok(after.operations[2].dependencies.includes(data.operations[0].id));
  assert.ok(after.operations[2].dependencies.includes(data.operations[1].id)); reopened.close();
});
test('duplicate outbox insert aborts projection and sequence together', async () => {
  const repo = await openLocalRepository(new IDBFactory()); const data = await chain(repo); const before = await repo.load(scope);
  await assert.rejects(repo.accept(scope, { kind: 'category.rename', id: data.category, name: 'Wrong optimistic name' }, { id: data.operations[0].id }));
  assert.deepEqual(await repo.load(scope), before); repo.close();
});
test('quota and transaction-abort failures never claim a persisted optimistic action', async () => {
  const repo = await openLocalRepository(new IDBFactory()); const before = await repo.load(scope);
  const original = IDBObjectStore.prototype.add;
  try {
    IDBObjectStore.prototype.add = function(value, key) {
      if (this.name === 'operations') { this.transaction.abort(); throw new DOMException('Simulated full disk', 'QuotaExceededError'); }
      return original.call(this, value, key);
    };
    await assert.rejects(repo.accept(scope, { kind: 'category.create', id: key(), name: 'Never persisted' }), { name: 'QuotaExceededError' });
  } finally { IDBObjectStore.prototype.add = original; }
  assert.deepEqual(await repo.load(scope), before); repo.close();
});
test('concurrent accepted commands keep unique monotonic sequence numbers', async () => {
  const repo = await openLocalRepository(new IDBFactory());
  await Promise.all(Array.from({length: 8}, (_,i) => repo.accept(scope, { kind: 'category.create', id: key(), name: 'Category '+i })));
  assert.deepEqual((await repo.load(scope)).operations.map(op => op.sequence), [1,2,3,4,5,6,7,8]); repo.close();
});
test('caller mutations and returned object mutations cannot rewrite persisted intentions', async () => {
  const repo = await openLocalRepository(new IDBFactory()); const command = { kind: 'category.create' as const, id: key(), name: 'Original' };
  const accepted = repo.accept(scope, command); command.name = 'Caller mutation'; const op = await accepted;
  op.command = { ...command, name: 'Returned mutation' };
  const view = await repo.load(scope); assert.equal(view.workspace.projection.categories[command.id].name, 'Original');
  assert.equal((view.operations[0].command as typeof command).name, 'Original'); repo.close();
});
test('scope isolation includes membership epoch; snapshot pruning preserves drafts and outbox', async () => {
  const repo = await openLocalRepository(new IDBFactory());
  const scopes = [scope, { ...scope, accountId: 'other' }, { ...scope, workspaceId: 'other' }, { ...scope, membershipEpoch: 'new-membership' }];
  for (const item of scopes) await chain(repo, item);
  await repo.saveDraft(scope, 'new-product', { kind: 'product', name: 'Draft', description: '', price: '1', quantity: '1', categoryId: '', tagIds: [] });
  await repo.saveSnapshot(scope, 'all', { productIds: [], expenseIds: [], savedAt: occurredAt });
  const before = await repo.load(scope); await repo.clearSnapshots(scope);
  assert.equal(await repo.loadSnapshot(scope, 'all'), null); assert.deepEqual(await repo.load(scope), before);
  for (const item of scopes.slice(1)) assert.equal((await repo.load(item)).operations.length, 4); repo.close();
});
test('unloaded month, loaded empty month and pending expense are distinguishable', async () => {
  const repo = await openLocalRepository(new IDBFactory()); await chain(repo);
  let graph = (await repo.load(scope)).workspace.projection;
  assert.equal(expensePeriod(graph, '2026-11').downloaded, false); assert.equal(expensePeriod(graph, '2026-11').items.length, 1);
  assert.equal(expensePeriod(graph, '2026-10').downloaded, false);
  await repo.importConfirmed(scope, 'initial', { bootstrapped: true, knownMonths: ['2026-10'] });
  graph = (await repo.load(scope)).workspace.projection;
  assert.deepEqual(expensePeriod(graph, '2026-10'), { downloaded: true, items: [] });
  assert.throws(() => expensePeriod(graph, 'bad')); repo.close();
});
test('ordered mapping acknowledgements resolve dependency refs before their first dispatch', async () => {
  const repo = await openLocalRepository(new IDBFactory()); const data = await chain(repo);
  await assert.rejects(repo.beginSend(scope, data.operations[2].id));
  await repo.beginSend(scope, data.operations[0].id); await confirm(repo, data.operations[0], data.category, 'category', serverCategory);
  await repo.beginSend(scope, data.operations[1].id); await confirm(repo, data.operations[1], data.tag, 'tag', serverTag);
  const product = await repo.beginSend(scope, data.operations[2].id); const wire = JSON.parse(product.wirePayload!);
  assert.equal(wire.command.categoryId, serverCategory); assert.deepEqual(wire.command.tagIds, [serverTag]);
  assert.equal(wire.command.name, data.category); // Text containing a local key is not a reference.
  await confirm(repo, data.operations[2], data.product, 'product', serverProduct);
  const complete = await repo.beginSend(scope, data.operations[3].id);
  assert.equal(JSON.parse(complete.wirePayload!).command.items[0].id, serverProduct);
  await confirm(repo, data.operations[3], data.expense, 'expense', serverExpense);
  const view = await repo.load(scope); assert.ok(view.operations.every(op => op.state === 'acknowledged'));
  assert.deepEqual(view.workspace.projection, view.workspace.confirmed); assert.equal(view.workspace.projection.expenses[serverExpense].product_id, serverProduct);
  repo.close();
});
test('invalid/missing/foreign mappings roll back confirmation and projection atomically', async () => {
  const repo = await openLocalRepository(new IDBFactory()); const data = await chain(repo); const op = await repo.beginSend(scope, data.operations[0].id);
  const before = await repo.load(scope);
  for (const mappings of [[], [{ kind: 'category' as const, localId: key(), serverId: serverCategory }], [{ kind: 'category' as const, localId: data.category, serverId: 'invalid' }]]) {
    await assert.rejects(repo.acknowledge(scope, op.id, { revision: 'r1', mappings, patch: {} })); assert.deepEqual(await repo.load(scope), before);
  }
  await assert.rejects(repo.acknowledge(scope, op.id, { revision: 'r1', mappings: [{ kind: 'category', localId: data.category, serverId: serverCategory }],
    patch: { categories: [{ ...before.workspace.projection.categories[data.category], id: serverCategory, workspace_id: 'foreign' }] } }));
  assert.deepEqual(await repo.load(scope), before); repo.close();
});
test('sending survives restart and retry retains operation ID and immutable wire payload', async () => {
  const factory = new IDBFactory(); const repo = await openLocalRepository(factory); const data = await chain(repo);
  const first = await repo.beginSend(scope, data.operations[0].id); repo.close(); const cold = await openLocalRepository(factory);
  assert.equal((await cold.load(scope)).operations[0].state, 'sending');
  const retry = await cold.beginSend(scope, first.id); assert.equal(retry.id, first.id); assert.equal(retry.wirePayload, first.wirePayload); assert.equal(retry.attempts, 2);
  await cold.setState(scope, first.id, 'needs-auth'); await assert.rejects(cold.beginSend(scope, first.id));
  await cold.setState(scope, first.id, 'pending'); assert.equal((await cold.beginSend(scope, first.id)).wirePayload, first.wirePayload);
  await cold.setState(scope, first.id, 'conflict'); await assert.rejects(cold.beginSend(scope, first.id)); await assert.rejects(cold.setState(scope, first.id, 'pending'));
  assert.equal((await cold.load(scope)).workspace.projection.categories[data.category].name, 'Food'); cold.close();
});
test('acknowledgement replay is idempotent and incompatible replay does not mutate data', async () => {
  const repo = await openLocalRepository(new IDBFactory()); const op = await repo.accept(scope, { kind: 'category.create', id: key(), name: 'Food' });
  await repo.beginSend(scope, op.id); const local = (op.command as {id: `local:${string}`}).id;
  await confirm(repo, op, local, 'category', serverCategory); const before = await repo.load(scope);
  await repo.acknowledge(scope, op.id, { revision: 'revision-1', mappings: [], patch: {} });
  assert.deepEqual(await repo.load(scope), before);
  await assert.rejects(repo.acknowledge(scope, op.id, { revision: 'different', mappings: [], patch: {} })); repo.close();
});
test('rename, tag deletion and expense correction preserve historical metadata', async () => {
  const repo = await openLocalRepository(new IDBFactory()); const data = await chain(repo);
  await repo.accept(scope, { kind: 'category.rename', id: data.category, name: 'New category' });
  await repo.accept(scope, { kind: 'tag.delete', id: data.tag });
  await repo.accept(scope, { kind: 'expense.correct', id: data.expense, amount: '23.50' });
  const view = await repo.load(scope); const expense = view.workspace.projection.expenses[data.expense];
  assert.equal(expense.category_name, 'Food'); assert.equal(expense.tags?.[0].name, 'Weekly'); assert.equal(expense.amount, 23.5); assert.equal(expense.planned_amount, 25);
  assert.deepEqual(view.workspace.projection.productTags[data.product], []);
  await assert.rejects(repo.accept(scope, { kind: 'category.delete', id: data.category })); repo.close();
});

// Populate the documented v1 schema directly to exercise a real IndexedDB versionchange upgrade.
async function legacyDatabase(factory: IDBFactory, workspace: WorkspaceRecord, operation: Partial<LocalOperation>) {
  await new Promise<void>((resolve, reject) => {
    const opening = factory.open('migration', 1);
    opening.onupgradeneeded = () => {
      const db = opening.result; db.createObjectStore('workspaces');
      const ops = db.createObjectStore('operations', { keyPath: ['scopeKey','id'] }); ops.createIndex('scope','scopeKey');
      for (const name of ['drafts','snapshots']) db.createObjectStore(name, { keyPath: ['scopeKey','key'] }).createIndex('scope','scopeKey');
    };
    opening.onerror = () => reject(opening.error);
    opening.onsuccess = () => {
      const db = opening.result; const tx = db.transaction(['workspaces','operations'],'readwrite');
      tx.objectStore('workspaces').put(workspace, scopeKey(scope)); tx.objectStore('operations').put(operation);
      tx.oncomplete = () => { db.close(); resolve(); }; tx.onabort = () => reject(tx.error);
    };
  });
}
test('schema v1 to v2 upgrade retains pending graph, IDs, order and fills only compatible fields', async () => {
  const seed = await openLocalRepository(new IDBFactory()); const op = await seed.accept(scope, { kind:'category.create', id:key(), name:'Before update' });
  const before = await seed.load(scope); seed.close(); const legacy: Partial<LocalOperation> = { ...op }; delete legacy.wirePayload; delete legacy.commandVersion; delete legacy.acknowledgedRevision;
  const factory = new IDBFactory(); await legacyDatabase(factory, before.workspace, legacy);
  const upgraded = await openLocalRepository(factory,'migration'); const after = await upgraded.load(scope);
  assert.deepEqual(after.workspace, before.workspace); assert.deepEqual(after.operations,[op]); upgraded.close();
});
test('unsafe legacy sending upgrade aborts and preserves original database version', async () => {
  const seed = await openLocalRepository(new IDBFactory()); const op = await seed.accept(scope, {kind:'category.create', id:key(), name:'Legacy'}); const before = await seed.load(scope); seed.close();
  const legacy: Partial<LocalOperation> = { ...op, state:'sending', attempts:1 }; delete legacy.wirePayload;
  const factory=new IDBFactory(); await legacyDatabase(factory,before.workspace,legacy); await assert.rejects(openLocalRepository(factory,'migration'));
  await new Promise<void>((resolve,reject) => { const opening=factory.open('migration'); opening.onerror=()=>reject(opening.error); opening.onsuccess=()=>{ assert.equal(opening.result.version,1); opening.result.close(); resolve(); }; });
});
test('future database and future operation payload versions fail closed', async () => {
  const factory=new IDBFactory();
  await new Promise<void>((resolve,reject)=>{ const opening=factory.open('future',99); opening.onerror=()=>reject(opening.error); opening.onsuccess=()=>{opening.result.close();resolve();}; });
  await assert.rejects(openLocalRepository(factory,'future'));
  const repo=await openLocalRepository(factory,'format'); const op=await repo.accept(scope,{kind:'category.create',id:key(),name:'Future'}); repo.close();
  await new Promise<void>((resolve,reject)=>{ const opening=factory.open('format'); opening.onerror=()=>reject(opening.error); opening.onsuccess=()=>{const db=opening.result;const tx=db.transaction('operations','readwrite');tx.objectStore('operations').put({...op,commandVersion:99});tx.oncomplete=()=>{db.close();resolve();};tx.onabort=()=>reject(tx.error);}; });
  const current=await openLocalRepository(factory,'format'); await assert.rejects(current.load(scope)); current.close();
});

// An asynchronously queued write must retain the scope it was given at invocation.
test('caller scope mutation cannot redirect a queued write into another account', async () => {
  const repo=await openLocalRepository(new IDBFactory());const mutable={...scope};
  const accepted=repo.accept(mutable,{kind:'category.create',id:key(),name:'Original scope'});
  mutable.accountId='mutated-account';await accepted;
  assert.equal((await repo.load(scope)).operations.length,1);assert.equal((await repo.load(mutable)).operations.length,0);repo.close();
});
test('pending expense uses Kyiv month even when UTC is still the previous month', async () => {
  const repo=await openLocalRepository(new IDBFactory());const category=key(),product=key(),expense=key();
  await repo.accept(scope,{kind:'category.create',id:category,name:'Boundary'});
  await repo.accept(scope,{kind:'product.save',id:product,categoryId:category,tagIds:[],name:'Boundary',description:'',price:'1',quantity:'1'});
  await repo.accept(scope,{kind:'product.complete',items:[{id:product,amount:'1',expenseId:expense}]},{occurredAt:'2026-10-31T22:30:00.000Z'});
  const graph=(await repo.load(scope)).workspace.projection;
  assert.equal(expensePeriod(graph,'2026-11').items.length,1);assert.equal(expensePeriod(graph,'2026-10').items.length,0);repo.close();
});
