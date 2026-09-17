/**
 * The bank key, kept as a CryptoKey that can sign but not be exported. IndexedDB is the only browser
 * storage that holds one as it is; localStorage would need the key in readable form.
 */

const DB = 'finly-bank';
const STORE = 'keys';
const ID = 'signing';

function run<T>(mode: IDBTransactionMode, op: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open(DB, 1);
    open.onupgradeneeded = () => open.result.createObjectStore(STORE);
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const request = op(open.result.transaction(STORE, mode).objectStore(STORE));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    };
  });
}

export async function saveKey(key: CryptoKey): Promise<void> {
  await run('readwrite', (s) => s.put(key, ID));
  // Ask the browser not to clear this under storage pressure; it may say no, and then the key is asked for again.
  void navigator.storage?.persist?.();
}

/** Undefined when this device never had the key, or the browser cleared it. */
export async function loadKey(): Promise<CryptoKey | undefined> {
  if (typeof indexedDB === 'undefined') return undefined;
  return run<CryptoKey | undefined>('readonly', (s) => s.get(ID)).catch(() => undefined);
}

export async function clearKey(): Promise<void> {
  await run('readwrite', (s) => s.delete(ID)).catch(() => undefined);
}
