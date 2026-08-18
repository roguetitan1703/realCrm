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
    // NO `badge`. Android does not draw the badge as a picture: it takes the
    // ALPHA CHANNEL and stamps it as a single-colour glyph in the status bar.
    // This was handed the same full-colour 192px tenant logo as `icon`, and
    // both tenants' logos are fully opaque — every pixel alpha 255 — so the
    // silhouette is a solid rectangle. Android's own behaviour on a badge it
    // cannot make sense of varies by version and skin: a filled blob, or
    // nothing at all. Omitting it lets the launcher use the installed app's
    // icon, which is already the tenant's and already the right shape.
    //
    // A real badge is a separate asset — one colour, transparent background,
    // drawn for 24dp. It is not the logo scaled down.
    data: { url: data.url || '/' },
    tag: data.tag || undefined,
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const rawUrl = (event.notification.data && event.notification.data.url) || '/';
  const target = new URL(rawUrl, self.location.origin);
  // THE WORKSPACE IS THE FIRST PATH SEGMENT, and it decides which installed app
  // this alert belongs to. One worker is registered at the origin root, so it
  // controls EVERY tenant's installed app on the device — `matchAll` returns
  // all of them, and taking the first meant a Bhumi alert grabbed whichever
  // window happened to be open, navigated it to Bhumi's URL and focused it.
  // The person watched a demo tenant's app put on another firm's colours and
  // then ask them to sign in. Only ever reuse a window already in the same
  // workspace; otherwise let openWindow route the URL, which the browser
  // matches against each installed manifest's scope and so opens the right app.
  const slugOf = (u) => {
    try { return decodeURIComponent(new URL(u).pathname.replace(/^\/+/, '').split('/')[0] || ''); }
    catch (e) { return ''; }
  };
  const want = slugOf(target.href);
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const mine = all.filter((c) => slugOf(c.url) === want);
    for (const c of mine) {
      if ('focus' in c) {
        c.navigate(target.href).catch(() => {});
        return c.focus();
      }
    }
    if (self.clients.openWindow) return self.clients.openWindow(target.href);
  })());
});
