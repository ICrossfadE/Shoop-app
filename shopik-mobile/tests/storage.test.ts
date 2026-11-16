import { test } from 'node:test';
import assert from 'node:assert/strict';
import { IDBFactory } from 'fake-indexeddb';
import { createProbe, probeScope } from '../src/probe.ts';
import { openProbeRepository } from '../src/storage.ts';
import { scopeKey } from '../src/contracts.ts';

// Reopening must restore both the visible projection and the same operation identity.
test('committed bundle and intent survive a fresh repository instance', async () => {
  const factory = new IDBFactory();
  const first = await openProbeRepository(factory);
  const { record, operation } = createProbe();
  await first.save(record, operation);
  first.close();
  const reopened = await openProbeRepository(factory);
  assert.deepEqual(await reopened.load(probeScope), { record, operations: [operation] });
  assert.match(record.bundle.product.id, /^local:/);
  assert.equal(record.bundle.product.category_id, record.bundle.category.id);
  assert.deepEqual(record.bundle.product.tag_ids, [record.bundle.tag.id]);
  reopened.close();
});

// A late constraint failure aborts the earlier projection write in the same transaction.
test('failed intent insertion rolls back the projection and reports failure', async () => {
  const store = await openProbeRepository(new IDBFactory());
  const original = createProbe();
  await store.save(original.record, original.operation);
  const replacement = createProbe();
  replacement.operation.id = original.operation.id;
  await assert.rejects(store.save(replacement.record, replacement.operation));
  assert.deepEqual(await store.load(probeScope), { record: original.record, operations: [original.operation] });
  store.close();
});

// Even repeated membership in the same workspace must have an independent scope.
test('accounts, workspaces and membership epochs remain isolated on load and clear', async () => {
  const store = await openProbeRepository(new IDBFactory());
  const scopes = [probeScope, { ...probeScope, accountId: 'other' },
    { ...probeScope, workspaceId: 'other' }, { ...probeScope, membershipEpoch: 'new-epoch' }];
  const probes = scopes.map(scope => createProbe(scope));
  for (const probe of probes) await store.save(probe.record, probe.operation);
  await store.clear(probeScope);
  assert.deepEqual(await store.load(probeScope), { record: null, operations: [] });
  for (const probe of probes.slice(1)) {
    assert.deepEqual(await store.load(probe.record.scope), { record: probe.record, operations: [probe.operation] });
  }
  assert.notEqual(scopeKey({ accountId: 'a:b', workspaceId: 'c', membershipEpoch: 'd' }),
    scopeKey({ accountId: 'a', workspaceId: 'b:c', membershipEpoch: 'd' }));
  store.close();
});

// A mismatched scope or payload must fail before any data becomes visible.
test('rejects inconsistent projection and intent without saving either', async () => {
  const store = await openProbeRepository(new IDBFactory());
  const probe = createProbe();
  await assert.rejects(store.save(probe.record, { ...probe.operation, scope: { ...probeScope, accountId: 'other' } }));
  await assert.rejects(store.save(probe.record, { ...probe.operation, payload: createProbe().operation.payload }));
  assert.deepEqual(await store.load(probeScope), { record: null, operations: [] });
  store.close();
});

// A newer database must be preserved; this build must never recreate or clear it.
test('unsupported future database versions fail closed', async () => {
  const factory = new IDBFactory();
  await new Promise<void>((resolve, reject) => {
    const request = factory.open('future', 2);
    request.onsuccess = () => { request.result.close(); resolve(); };
    request.onerror = () => reject(request.error);
  });
  await assert.rejects(openProbeRepository(factory, 'future'));
});
