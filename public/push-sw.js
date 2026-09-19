/*
 * Push reminders. Imported by the generated service worker (vite.config.ts → workbox.importScripts).
 * The server only ever holds ciphertext: each reminder was encrypted on this device with a key that
 * lives in IndexedDB, so it is decrypted here before it is shown.
 *
 * Every push must end in a notification: iOS drops the subscription after a few silent ones, so a
 * payload that cannot be read still shows a generic reminder.
 */

// ponytail: mirrors src/sync/crypto.ts decryptJson; a classic worker script cannot import the module.
self.finlyDecrypt = async function finlyDecrypt(key, sealed) {
  const bytes = (b64) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: bytes(sealed.iv) }, key, bytes(sealed.ciphertext));
  const stream = new Blob([plain]).stream().pipeThrough(new DecompressionStream('gzip'));
  return JSON.parse(await new Response(stream).text());
};

function loadPushKey() {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open('finly-bank', 1);
    open.onupgradeneeded = () => open.result.createObjectStore('keys');
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const request = open.result.transaction('keys', 'readonly').objectStore('keys').get('push');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    };
  });
}

self.addEventListener('push', (event) => {
  event.waitUntil(
    (async () => {
      let n = { title: 'Finly', body: 'You have a reminder.', url: '/' };
      try {
        const key = await loadPushKey();
        if (key && event.data) n = await self.finlyDecrypt(key, event.data.json());
      } catch {
        /* unreadable: show the generic reminder */
      }
      await self.registration.showNotification(n.title, {
        body: n.body,
        icon: '/icons/pwa-192.png',
        badge: '/icons/pwa-192.png',
        data: { url: n.url || '/' },
      });
    })(),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = new URL((event.notification.data && event.notification.data.url) || '/', self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      const client = clients[0];
      if (client) return client.focus().then((c) => (c && c.navigate ? c.navigate(url) : c));
      return self.clients.openWindow(url);
    }),
  );
});
