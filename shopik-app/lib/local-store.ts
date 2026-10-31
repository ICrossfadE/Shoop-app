// Versioned browser-only storage. No credentials, DOM nodes or pending requests are persisted.
const databaseName = 'shopik-local';
const lifetime = 7 * 24 * 60 * 60 * 1000;
type RecordValue = { key: string; owner: string; at: number; value: unknown };
let connection: Promise<IDBDatabase> | undefined;
let tail: Promise<unknown> = Promise.resolve();

// Surface quota/blocked/private-mode failures while leaving the online application usable.
function unavailable() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('shopik-storage-error'));
}
function database(): Promise<IDBDatabase> {
  if (connection) return connection;
  connection = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') { reject(new Error('IndexedDB unavailable')); return; }
    const request = indexedDB.open(databaseName, 1);
    request.onupgradeneeded = () => {
      const store = request.result.createObjectStore('records', { keyPath: 'key' });
      store.createIndex('owner', 'owner');
    };
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('Close older Shopik tabs'));
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => { db.close(); connection = undefined; };
      resolve(db);
    };
  });
  return connection;
}
// Serialize writes and clearing so late queued writes cannot undo logout cleanup.
function transaction<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore, result: (value: T) => void) => void): Promise<T | undefined> {
  const task = tail.then(async () => {
    const db = await database();
    return new Promise<T>((resolve, reject) => {
      const tx = db.transaction('records', mode);
      let value: T;
      tx.oncomplete = () => resolve(value);
      tx.onabort = () => reject(tx.error);
      tx.onerror = () => reject(tx.error);
      run(tx.objectStore('records'), (next) => { value = next; });
    });
  });
  tail = task.catch(() => { unavailable(); });
  return task.catch(() => undefined);
}
export const localStore = {
  async read<T>(owner: string, key: string): Promise<T | undefined> {
    const record = await transaction<RecordValue>('readonly', (store, done) => {
      const request = store.get(key); request.onsuccess = () => done(request.result);
    });
    return record?.owner === owner && Date.now() - record.at < lifetime ? record.value as T : undefined;
  },
  write(owner: string, key: string, value: unknown) {
    return transaction<void>('readwrite', (store) => {
      // Prune expired private data whenever storage is used for a write.
      const cursor = store.openCursor();
      cursor.onsuccess = () => { const item = cursor.result; if (!item) return; if (Date.now() - item.value.at >= lifetime) item.delete(); item.continue(); };
      store.put({ key, owner, at: Date.now(), value } satisfies RecordValue);
    });
  },
  invalidate(scope: string) {
    return transaction<void>('readwrite', (store) => {
      const request = store.openCursor();
      request.onsuccess = () => { const cursor = request.result; if (!cursor) return;
        if (cursor.value.key.startsWith('[') && JSON.parse(cursor.value.key)[0] === scope) cursor.delete();
        cursor.continue();
      };
    });
  },
  prepareScope(owner: string, scope: string, version: string) {
    return transaction<void>('readwrite', (store) => {
      const key=`membership:${scope}`;
      const request=store.get(key);
      request.onsuccess=()=>{
        // Legacy personal caches enroll on first use; a subsequent join is a new epoch.
        if(request.result && request.result.value!==version){
          const cursorRequest=store.openCursor();
          cursorRequest.onsuccess=()=>{const cursor=cursorRequest.result;if(!cursor)return;
            const entryKey=String(cursor.value.key);
            if((entryKey.startsWith('[')&&JSON.parse(entryKey)[0]===scope)||entryKey.startsWith(`draft:${scope}:`))cursor.delete();
            cursor.continue();
          };
        }
        store.put({key,owner,at:Date.now(),value:version});
      };
    });
  },
  clearScope(scope: string) {
    return transaction<void>('readwrite', (store) => {
      const request=store.openCursor();
      request.onsuccess=()=>{const cursor=request.result;if(!cursor)return;
        const key=String(cursor.value.key);
        if((key.startsWith('[')&&JSON.parse(key)[0]===scope)||key.startsWith(`draft:${scope}:`))cursor.delete();
        cursor.continue();
      };
    });
  },
  remove(key: string) { return transaction<void>('readwrite', (store) => { store.delete(key); }); },
  clear(owner: string) {
    return transaction<void>('readwrite', (store) => {
      const request = store.index('owner').openCursor(IDBKeyRange.only(owner));
      request.onsuccess = () => { const cursor = request.result; if (cursor) { cursor.delete(); cursor.continue(); } };
    });
  },
};
