import type { WorkspaceScope } from '../../../shopik-app/lib/domain/index.ts';
import { scopeKey } from '../contracts.ts';
import { applyCommand, applyServerPatch, isLocalId, references, replay, resolveCommand, table, validServerId } from './projection.ts';
import { emptyWorkspace, type LocalCommand, type LocalDraft, type LocalOperation, type RepositoryView, type ServerPatch, type ServerReply, type ViewSnapshot, type WorkspaceRecord } from './model.ts';
export * from './model.ts';
export { expensePeriod } from './projection.ts';
export const LOCAL_DATABASE = 'shopik-android-local';
export const LOCAL_DATABASE_VERSION = 2;
const stores = ['workspaces', 'operations', 'drafts', 'snapshots'] as const;
type DraftRow = { scopeKey: string; key: string; value: LocalDraft };

// Resolve individual reads, but never report a durable write until transaction.complete.
function request<T>(value: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => { value.onsuccess = () => resolve(value.result); value.onerror = () => reject(value.error); });
}
function committed(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error ?? new Error('Local transaction aborted'));
    transaction.onerror = () => { /* onabort owns the final result. */ };
  });
}
// Migrations are additive and run inside the browser's atomic versionchange transaction.
export function upgradeLocalSchema(db: IDBDatabase, transaction: IDBTransaction, oldVersion: number) {
  if (oldVersion < 1) {
    db.createObjectStore('workspaces');
    const operations = db.createObjectStore('operations', { keyPath: ['scopeKey', 'id'] });
    operations.createIndex('scope', 'scopeKey');
    for (const name of ['drafts', 'snapshots']) {
      const store = db.createObjectStore(name, { keyPath: ['scopeKey', 'key'] }); store.createIndex('scope', 'scopeKey');
    }
  }
  if (oldVersion < 2) {
    const operations = transaction.objectStore('operations');
    operations.createIndex('scopeSequence', ['scopeKey', 'sequence'], { unique: true });
    const cursor = operations.openCursor();
    cursor.onsuccess = () => {
      const entry = cursor.result; if (!entry) return;
      const operation = entry.value as LocalOperation;
      // A legacy sending payload cannot be reconstructed safely: preserve DB by aborting upgrade.
      if (operation.wirePayload === undefined && (operation.attempts > 0 || operation.state === 'sending')) { transaction.abort(); return; }
      entry.update({ ...operation, commandVersion: operation.commandVersion ?? 1, wirePayload: operation.wirePayload ?? null,
        acknowledgedRevision: operation.acknowledgedRevision ?? null });
      entry.continue();
    };
  }
}
// Unsupported newer versions fail closed; no deleteDatabase or in-memory fallback exists.
export function openLocalRepository(factory: IDBFactory = indexedDB, name = LOCAL_DATABASE): Promise<LocalRepository> {
  return new Promise((resolve, reject) => {
    const opening = factory.open(name, LOCAL_DATABASE_VERSION); let blocked = false;
    opening.onupgradeneeded = event => {
      try { upgradeLocalSchema(opening.result, opening.transaction!, event.oldVersion); }
      catch { opening.transaction?.abort(); }
    };
    opening.onblocked = () => { blocked = true; reject(new Error('Close other app windows before upgrading local data')); };
    opening.onerror = () => reject(opening.error ?? new Error('Local storage unavailable'));
    opening.onsuccess = () => {
      const db = opening.result; if (blocked) { db.close(); return; }
      db.onversionchange = () => db.close(); resolve(createRepository(db));
    };
  });
}
// Reject incompatible envelopes instead of silently treating unknown data as an empty account.
function validate(record: WorkspaceRecord, operations: LocalOperation[], scope: WorkspaceScope) {
  if (record.formatVersion !== 1 || scopeKey(record.scope) !== scopeKey(scope) || !Number.isSafeInteger(record.nextSequence) || record.nextSequence < 1 || !Array.isArray(record.mappings)) throw new Error('Unsupported workspace format');
  for (const item of operations) {
    if (item.commandVersion !== 1 || scopeKey(item.scope) !== scopeKey(scope) || item.scopeKey !== scopeKey(scope) ||
      !Number.isSafeInteger(item.sequence) || !Number.isSafeInteger(item.attempts) || !Array.isArray(item.dependencies) || !Array.isArray(item.creates) ||
      !['pending','sending','needs-auth','conflict','rejected','acknowledged'].includes(item.state) ||
      !(item.wirePayload === null || typeof item.wirePayload === 'string')) throw new Error('Unsupported operation format');
  }
}
function validateScope(scope: WorkspaceScope) {
  if ([scope.accountId, scope.workspaceId, scope.membershipEpoch].some(value => typeof value !== 'string' || !value || value.length > 200)) throw new Error('Invalid scope');
}

// Every scoped mutation reads and writes within one strict-durability transaction; no network await is allowed.
function createRepository(db: IDBDatabase) {
  async function run<T>(scope: WorkspaceScope, write: boolean, job: (transaction: IDBTransaction, record: WorkspaceRecord, operations: LocalOperation[]) => Promise<T> | T): Promise<T> {
    validateScope(scope); const key = scopeKey(scope);
    const transaction = db.transaction([...stores], write ? 'readwrite' : 'readonly', write ? { durability: 'strict' } : undefined);
    const done = committed(transaction);
    // Attach a rejection observer immediately, including when a request fails first.
    void done.catch(() => undefined);
    try {
      const [record, operations] = await Promise.all([
        request(transaction.objectStore('workspaces').get(key)) as Promise<WorkspaceRecord | undefined>,
        request(transaction.objectStore('operations').index('scope').getAll(key)) as Promise<LocalOperation[]>,
      ]);
      const workspace = record ?? emptyWorkspace(scope); operations.sort((a,b) => a.sequence - b.sequence);
      validate(workspace, operations, scope);
      const result = await job(transaction, workspace, operations);
      await done; return structuredClone(result);
    } catch (error) {
      if (write) { try { transaction.abort(); } catch { /* Already aborted/completed. */ } }
      await done.catch(() => undefined); throw error;
    }
  }
  function saveRecord(transaction: IDBTransaction, record: WorkspaceRecord) { transaction.objectStore('workspaces').put(record, scopeKey(record.scope)); }
  function saveOperation(transaction: IDBTransaction, operation: LocalOperation) { transaction.objectStore('operations').put(operation); }
  return {
    load(scope: WorkspaceScope): Promise<RepositoryView> {
      scope = structuredClone(scope);
      return run(scope, false, async (transaction, workspace, operations) => {
        const drafts = await request(transaction.objectStore('drafts').index('scope').getAll(scopeKey(scope))) as DraftRow[];
        return { workspace, operations, drafts: drafts.map(({ key, value }) => ({ key, value: { ...value,
          categoryId: workspace.mappings.find(item => item.kind === 'category' && item.localId === value.categoryId)?.serverId ?? value.categoryId,
          tagIds: value.tagIds.map(id => workspace.mappings.find(item => item.kind === 'tag' && item.localId === id)?.serverId ?? id) } })) };
      });
    },
    accept(scope: WorkspaceScope, command: LocalCommand, input: { id?: string; occurredAt?: string } = {}) {
      scope = structuredClone(scope);
      // Clone before the first await so callers cannot mutate an accepted action while queued.
      const intent = structuredClone(command); const id = input.id ?? crypto.randomUUID(); const occurredAt = input.occurredAt ?? new Date().toISOString();
      return run(scope, true, (transaction, record, operations) => {
        if (!/^[a-f0-9-]{36}$/i.test(id) || !Number.isFinite(Date.parse(occurredAt))) throw new Error('Invalid operation metadata');
        const resolved = resolveCommand(intent, record.mappings);
        const creates = references(intent).filter(ref => isLocalId(ref.id) && !table(record.projection, ref.kind)[ref.id] &&
          !record.mappings.some(item => item.kind === ref.kind && item.localId === ref.id));
        // Only actual create fields may introduce a new client key.
        for (const ref of creates) {
          const allowed = intent.kind === 'category.create' && ref.kind === 'category' && ref.id === intent.id ||
            intent.kind === 'tag.create' && ref.kind === 'tag' && ref.id === intent.id ||
            intent.kind === 'product.save' && ref.kind === 'product' && ref.id === intent.id ||
            intent.kind === 'product.complete' && ref.kind === 'expense' && intent.items.some(item => item.expenseId === ref.id);
          if (!allowed || operations.some(item => item.creates.some(creation => creation.kind === ref.kind && creation.id === ref.id))) throw new Error('Unknown or reused local reference');
        }
        const projection = applyCommand(record.projection, resolved, scope, occurredAt);
        const dependencies = new Set<string>();
        for (const ref of references(intent)) for (const operation of operations) {
          if (operation.state !== 'acknowledged' && references(operation.command).some(previous => previous.kind === ref.kind && previous.id === ref.id)) dependencies.add(operation.id);
        }
        const operation: LocalOperation = { scopeKey: scopeKey(scope), scope: structuredClone(scope), id, sequence: record.nextSequence++,
          commandVersion: 1, command: intent, creates, dependencies: [...dependencies], baseRevision: record.serverRevision,
          occurredAt, state: 'pending', attempts: 0, wirePayload: null, acknowledgedRevision: null };
        record.projection = projection;
        saveRecord(transaction, record);
        // add prevents a duplicate operation ID from replacing committed work.
        transaction.objectStore('operations').add(operation);
        return operation;
      });
    },
    beginSend(scope: WorkspaceScope, id: string) {
      scope = structuredClone(scope);
      return run(scope, true, (transaction, record, operations) => {
        const operation = operations.find(item => item.id === id);
        if (!operation || !['pending','sending'].includes(operation.state)) throw new Error('Operation is not sendable');
        if (operations.some(item => item.sequence < operation.sequence && item.state !== 'acknowledged') ||
          operation.dependencies.some(dependency => !operations.some(item => item.id === dependency && item.state === 'acknowledged'))) throw new Error('Dependencies are not confirmed');
        if (operation.wirePayload === null) {
          const command = resolveCommand(operation.command, record.mappings);
          for (const ref of references(command)) if (isLocalId(ref.id) && !operation.creates.some(item => item.kind === ref.kind && item.id === ref.id)) throw new Error('Unresolved dependency');
          operation.wirePayload = JSON.stringify({ version: 1, operationId: operation.id, scope, baseRevision: operation.baseRevision, occurredAt: operation.occurredAt, command });
        }
        operation.state = 'sending'; operation.attempts++; saveOperation(transaction, operation); return operation;
      });
    },
    setState(scope: WorkspaceScope, id: string, state: 'pending' | 'needs-auth' | 'conflict' | 'rejected') {
      scope = structuredClone(scope);
      return run(scope, true, (transaction, _record, operations) => {
        const operation = operations.find(item => item.id === id);
        if (!operation || operation.state === 'acknowledged' || operation.state === 'conflict' || operation.state === 'rejected' ||
          (state === 'pending' && !['sending','needs-auth'].includes(operation.state))) throw new Error('Invalid operation transition');
        operation.state = state; saveOperation(transaction, operation); return operation;
      });
    },
    acknowledge(scope: WorkspaceScope, id: string, reply: ServerReply) {
      scope = structuredClone(scope);
      const response = structuredClone(reply);
      return run(scope, true, (transaction, record, operations) => {
        const operation = operations.find(item => item.id === id);
        if (!operation || !operation.wirePayload) throw new Error('Unsent operation cannot be acknowledged');
        if (operation.state === 'acknowledged') {
          if (operation.acknowledgedRevision !== response.revision) throw new Error('Conflicting acknowledgement');
          return operation;
        }
        if (!response.revision || typeof response.revision !== 'string') throw new Error('Invalid revision');
        for (const mapping of response.mappings) {
          if (!isLocalId(mapping.localId) || !validServerId(mapping.kind, mapping.serverId) ||
            !operation.creates.some(ref => ref.kind === mapping.kind && ref.id === mapping.localId)) throw new Error('Foreign ID mapping');
          const previous = record.mappings.find(item => item.kind === mapping.kind && item.localId === mapping.localId);
          if (previous && previous.serverId !== mapping.serverId) throw new Error('Conflicting ID mapping');
          if (record.mappings.some(item => item.kind === mapping.kind && item.serverId === mapping.serverId && item.localId !== mapping.localId)) throw new Error('Server ID collision');
          if (!previous) record.mappings.push(mapping);
        }
        for (const ref of operation.creates) if (!record.mappings.some(item => item.kind === ref.kind && item.localId === ref.id)) throw new Error('Missing ID mapping');
        record.confirmed = applyServerPatch(record.confirmed, response.patch, scope);
        for (const mapping of response.mappings) if (!table(record.confirmed, mapping.kind)[mapping.serverId]) throw new Error('Missing mapped entity');
        operation.state = 'acknowledged'; operation.acknowledgedRevision = response.revision;
        record.serverRevision = response.revision;
        record.projection = replay(record.confirmed, operations, record.mappings, scope);
        saveOperation(transaction, operation); saveRecord(transaction, record); return operation;
      });
    },
    importConfirmed(scope: WorkspaceScope, revision: string, patch: ServerPatch) {
      scope = structuredClone(scope);
      const incoming = structuredClone(patch);
      return run(scope, true, (transaction, record, operations) => {
        if (!revision) throw new Error('Invalid revision');
        record.confirmed = applyServerPatch(record.confirmed, incoming, scope);
        record.serverRevision = revision; record.projection = replay(record.confirmed, operations, record.mappings, scope);
        saveRecord(transaction, record);
      });
    },
    saveDraft(scope: WorkspaceScope, key: string, value: LocalDraft | null) {
      scope = structuredClone(scope);
      const draft = structuredClone(value);
      return run(scope, true, transaction => {
        if (!key || key.length > 120) throw new Error('Invalid draft key');
        const store = transaction.objectStore('drafts');
        if (draft === null) store.delete([scopeKey(scope), key]); else store.put({ scopeKey: scopeKey(scope), key, value: draft });
      });
    },
    saveSnapshot(scope: WorkspaceScope, key: string, value: ViewSnapshot) {
      scope = structuredClone(scope);
      const snapshot = structuredClone(value);
      return run(scope, true, transaction => { transaction.objectStore('snapshots').put({ scopeKey: scopeKey(scope), key, value: snapshot }); });
    },
    loadSnapshot(scope: WorkspaceScope, key: string): Promise<ViewSnapshot | null> {
      scope = structuredClone(scope);
      return run(scope, false, async transaction => {
        const entry = await request(transaction.objectStore('snapshots').get([scopeKey(scope), key])) as { value: ViewSnapshot } | undefined;
        return entry?.value ?? null;
      });
    },
    clearSnapshots(scope: WorkspaceScope) {
      scope = structuredClone(scope);
      return run(scope, true, async transaction => {
        const store = transaction.objectStore('snapshots');
        const keys = await request(store.index('scope').getAllKeys(scopeKey(scope)));
        for (const key of keys) store.delete(key);
        // Normalized confirmed entities, drafts, mappings and outbox are not disposable filter caches.
      });
    },
    close() { db.close(); },
  };
}
export type LocalRepository = ReturnType<typeof createRepository>;
