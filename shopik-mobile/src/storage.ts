import type { ProbeOperation, ProbeRecord, ProbeRepository } from './contracts.ts';
import { scopeKey } from './contracts.ts';

const databaseName = 'shopik-android-feasibility';
const version = 1;

// Resolve only on transaction commit, never on the success of an individual request.
function committed(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error ?? new Error('Запис скасовано. Дані не збережено.'));
    transaction.onerror = () => { /* Abort reports the final transaction failure. */ };
  });
}

// Propagate open, upgrade and blocked failures instead of falling back to volatile memory.
export function openProbeRepository(factory: IDBFactory = indexedDB, name = databaseName): Promise<ProbeRepository> {
  return new Promise((resolve, reject) => {
    const request = factory.open(name, version);
    let blocked = false;
    request.onblocked = () => {
      blocked = true;
      reject(new Error('Оновлення сховища заблоковане. Закрийте інші вікна застосунку.'));
    };
    request.onerror = () => reject(request.error ?? new Error('Сховище недоступне.'));
    request.onupgradeneeded = () => {
      const db = request.result;
      db.createObjectStore('records');
      const operations = db.createObjectStore('operations', { keyPath: 'id' });
      operations.createIndex('scope', 'scopeKey');
    };
    request.onsuccess = () => {
      const db = request.result;
      if (blocked) { db.close(); return; }
      db.onversionchange = () => db.close();
      resolve(repository(db));
    };
  });
}

// One transaction owns both projection and intent; there is no TTL for pending work.
function repository(db: IDBDatabase): ProbeRepository {
  return {
    async load(scope) {
      const key = scopeKey(scope);
      const transaction = db.transaction(['records', 'operations'], 'readonly');
      const done = committed(transaction);
      const record = transaction.objectStore('records').get(key);
      const operations = transaction.objectStore('operations').index('scope').getAll(key);
      await done;
      return { record: (record.result as ProbeRecord | undefined) ?? null,
        operations: (operations.result as (ProbeOperation & { scopeKey: string })[]).map(({ scopeKey: marker, ...operation }) => {
          if (marker !== key) throw new Error('Некоректний простір локальної операції.');
          return operation;
        }) };
    },
    async save(record, operation) {
      if (scopeKey(record.scope) !== scopeKey(operation.scope) ||
          JSON.stringify(record.bundle) !== JSON.stringify(operation.payload)) {
        throw new Error('Стан і операція повинні мати однакові простір і дані.');
      }
      const key = scopeKey(record.scope);
      const transaction = db.transaction(['records', 'operations'], 'readwrite', { durability: 'strict' });
      const done = committed(transaction);
      try {
        transaction.objectStore('records').put(record, key);
        // add, rather than put, prevents an operation ID from being silently replaced.
        transaction.objectStore('operations').add({ ...operation, scopeKey: key });
      } catch (error) {
        transaction.abort();
        await done.catch(() => undefined);
        throw error;
      }
      await done;
    },
    async clear(scope) {
      const key = scopeKey(scope);
      const transaction = db.transaction(['records', 'operations'], 'readwrite', { durability: 'strict' });
      const done = committed(transaction);
      transaction.objectStore('records').delete(key);
      const cursor = transaction.objectStore('operations').index('scope').openCursor(key);
      cursor.onsuccess = () => { const entry = cursor.result; if (entry) { entry.delete(); entry.continue(); } };
      await done;
    },
    close() { db.close(); },
  };
}
