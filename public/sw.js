/**
 * Service worker — the app shell + basic offline read.
 * Network-first with a cache fallback: every successful same-origin GET is
 * cached, so a later offline/flaky load serves the last-seen response instead of
 * a dead page. Step 2 (offline-read) refines this with tenant-scoped caches and
 * a staleness banner; this baseline is what makes the app installable and gives
 * a usable offline shell.
 */
const CACHE = 'recrm-v1';

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // leave cross-origin (fonts, etc.) alone

  event.respondWith((async () => {
    try {
      const res = await fetch(req);
      if (res && res.ok) {
        const cache = await caches.open(CACHE);
        cache.put(req, res.clone());
      }
      return res;
    } catch (err) {
      const cached = await caches.match(req);
      if (cached) return cached;
      if (req.mode === 'navigate') {
        const root = await caches.match('/');
        if (root) return root;
      }
      throw err;
    }
  })());
});
