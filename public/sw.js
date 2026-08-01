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

// ── Web Push ─────────────────────────────────────────────────────────────────
// A push arrives even when the app is closed; show the notification and, on tap,
// focus an existing window (or open the deep link).
self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (e) { data = { title: 'Notification', body: event.data && event.data.text() }; }
  const title = data.title || 'Real Estate by Delpat';
  const options = {
    body: data.body || '',
    icon: data.icon || '/pwa/_platform/icon-192.png',
    badge: data.icon || '/pwa/_platform/icon-192.png',
    data: { url: data.url || '/' },
    tag: data.tag || undefined,
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const rawUrl = (event.notification.data && event.notification.data.url) || '/';
  const targetUrl = new URL(rawUrl, self.location.origin).href;
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of all) {
      if ('focus' in c) {
        c.navigate(targetUrl).catch(() => {});
        return c.focus();
      }
    }
    if (self.clients.openWindow) return self.clients.openWindow(targetUrl);
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
