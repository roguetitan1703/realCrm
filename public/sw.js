/**
 * Service worker — web push, and nothing else.
 *
 * It used to also intercept every same-origin GET, network-first, caching each
 * response. That bought nothing and cost real time: the bundle is content-
 * hashed, so the browser's own HTTP cache already serves it without asking, and
 * routing it through the worker only added a hop. The "offline fallback" it
 * promised never worked either — the one response worth having offline was the
 * boot read, and at ~10MB it was too big to store, so the cache held a pile of
 * stale API replies nobody read.
 *
 * A service worker is required for web push and for nothing else we do. So this
 * is a push handler. If offline reads become a real requirement, they get built
 * deliberately against the small bootstrap payload — not inferred from whatever
 * happened to pass through a fetch listener.
 */
self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    // Drop every cache the old fetch handler wrote. Without this, an existing
    // install keeps serving months-old responses from a worker that no longer
    // has any code to refresh them.
    const keys = await caches.keys();
    await Promise.all(keys.map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

// ── Web Push ─────────────────────────────────────────────────────────────────
// A push arrives even when the app is closed; show the notification and, on tap,
// focus an existing window (or open the deep link).
self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (e) { data = { title: 'Notification', body: event.data && event.data.text() }; }
  // No hardcoded firm name in the fallback: this worker is installed under a
  // tenant's own scope, and showing another firm's name on their phone is
  // exactly the white-label leak the manifest fix removed everywhere else.
  const title = data.title || 'New notification';
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
