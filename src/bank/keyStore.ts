/**
 * Keys kept as CryptoKeys that can be used but not exported. IndexedDB is the only browser storage that
 * holds one as it is; localStorage would need the key in readable form. The bank signing key lives here,
 * and so does the reminder key the service worker decrypts push payloads with (public/push-sw.js reads
 * the same store).
 */

const DB = 'finly-bank';
const STORE = 'keys';

export type KeyId = 'signing' | 'push';

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

export async function saveKey(key: CryptoKey, id: KeyId = 'signing'): Promise<void> {
  await run('readwrite', (s) => s.put(key, id));
  // Ask the browser not to clear this under storage pressure; it may say no, and then the key is asked for again.
  void navigator.storage?.persist?.();
}

/** Undefined when this device never had the key, or the browser cleared it. */
export async function loadKey(id: KeyId = 'signing'): Promise<CryptoKey | undefined> {
  if (typeof indexedDB === 'undefined') return undefined;
  return run<CryptoKey | undefined>('readonly', (s) => s.get(id)).catch(() => undefined);
}

export async function clearKey(id: KeyId = 'signing'): Promise<void> {
  await run('readwrite', (s) => s.delete(id)).catch(() => undefined);
}
