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
    // Everything EXCEPT the push config. That cache is the only durable place
    // this worker can keep where to report a receipt, and wiping it on every
    // worker update would silently disable rotation recovery.
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CFG_CACHE).map((k) => caches.delete(k)));
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
    data: { url: data.url || '/', ack: data.ack || null },
    tag: data.tag || undefined,
  };
  event.waitUntil((async () => {
    await self.registration.showNotification(title, options);
    // DELIVERY IS ONLY KNOWABLE FROM HERE.
    //
    // The server learns that a push service ACCEPTED a message; it never learns
    // whether a screen showed it. The device is offline, the OS has frozen the
    // browser, the payload failed to decrypt — all of those look identical to a
    // success from the sending side. This worker is the only code that runs at
    // the moment the notification actually appears, so it is the only thing
    // that can say so.
    //
    // Same shape every push vendor ships (OneSignal call it "confirmed
    // delivery"): report the opaque token that came inside the encrypted
    // payload. The token IS the authentication — only the device holding this
    // subscription's keys could have read it — which matters because a service
    // worker cannot reach the signed-in session's token.
    await reportPush(options.data.ack, 'displayed');
    // Remember where to report, for the subscription-rotation handler below,
    // which gets no payload of its own.
    if (options.data.ack?.url) await rememberAckUrl(options.data.ack.url);
  })());
});

/** Fire-and-forget receipt. A failed report must never cost the notification. */
async function reportPush(ack, event) {
  if (!ack?.url || !ack?.token) return;
  try {
    await fetch(ack.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: ack.token, event }),
    });
  } catch (e) { /* offline; the row stays at `sent`, which is the truth */ }
}

// The worker has no localStorage and no session, so the one durable place to
// keep a scrap of config is the Cache API. Only the origin is kept — the token
// is per-message and deliberately not stored.
const CFG_CACHE = 'push-config';
const CFG_KEY = '/__push_ack_origin';

async function rememberAckUrl(url) {
  try {
    const origin = new URL(url).origin;
    const cache = await caches.open(CFG_CACHE);
    await cache.put(CFG_KEY, new Response(origin));
  } catch (e) {}
}

async function ackOrigin() {
  try {
    const cache = await caches.open(CFG_CACHE);
    const res = await cache.match(CFG_KEY);
    return res ? await res.text() : '';
  } catch (e) { return ''; }
}

// ── The endpoint rotated ─────────────────────────────────────────────────────
// The spec's own event for it, and we did not handle it. A push service may
// retire an endpoint at any time; until this ran, the device stayed silent
// until someone next opened the app — and if the browser kept the stale
// subscription object, `autoEnablePush` saw one and never replaced it, so the
// silence was permanent.
//
// Re-subscribing needs the same application server key, which the old
// subscription carries. The server rebinds by the OLD endpoint: a push endpoint
// is a high-entropy secret URL, so possessing it is the proof — and no signed-in
// session exists here to prove anything else with.
self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil((async () => {
    const origin = await ackOrigin();
    const oldSub = event.oldSubscription || null;
    const key = oldSub?.options?.applicationServerKey;
    if (!origin || !key) return;   // next app load re-registers; see lib/push.js
    try {
      const fresh = event.newSubscription || await self.registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: key,
      });
      await fetch(`${origin}/api/v1/notifications/resubscribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ oldEndpoint: oldSub.endpoint, subscription: fresh.toJSON() }),
      });
    } catch (e) { /* the next signed-in load subscribes from scratch */ }
  })());
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  // Opened, not merely shown. Two different facts about one alert.
  event.waitUntil(reportPush(event.notification.data && event.notification.data.ack, 'clicked'));
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
