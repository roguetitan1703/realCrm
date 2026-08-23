// ============================================================================
// 📲 Web Push (client) — opt a device in to notifications, no Firebase
// ============================================================================
// The flow: ask the backend for the VAPID public key, ask the browser for
// notification permission, subscribe through the service worker, and hand the
// resulting PushSubscription to the backend keyed to this device + user. All of
// it degrades quietly on browsers/OSes that don't support push (older iOS, etc.).

import { api } from './api.js';
import { swReady } from './pwa.js';

export function pushSupported() {
  return typeof window !== 'undefined'
    && 'serviceWorker' in navigator
    && 'PushManager' in window
    && 'Notification' in window;
}

export function pushPermission() {
  return typeof Notification !== 'undefined' ? Notification.permission : 'denied';
}

/**
 * THE REGISTRATION COVERING THIS DOCUMENT, OR NULL — answered, never guessed.
 *
 * No waiting at all. `getRegistration()` settles either way: `undefined` means
 * there is genuinely none (a browser with no worker, or `vite dev`, where it is
 * deliberately never registered), and that is a real answer available now.
 *
 * This is what sign-out uses. `disablePush` runs before the token is dropped,
 * so it must not be able to hang — and an installing worker holds no
 * subscription to remove, so there is nothing worth waiting for.
 */
async function registrationNow() {
  if (!pushSupported()) return null;
  // Wait out registration first, or this subscribes against whichever worker
  // happens to control the page at the time — which on the first launch after
  // per-workspace scoping is the root one, about to be retired.
  await swReady();
  try {
    return (await navigator.serviceWorker.getRegistration()) || null;
  } catch (e) { return null; }
}

/**
 * The same registration, once it can actually take a subscription.
 *
 * WAS A STOPWATCH: `navigator.serviceWorker.ready` raced against a 5-second
 * timer, and a cold load lost that race. The timeout then returned null and
 * every caller read null as "this browser cannot do push" — so a browser that
 * was simply still starting its worker was reported as one that would never
 * work. Three symptoms came out of that one line: the false "alerts
 * unavailable" on a first tab load, the empty card in Settings, and the
 * permission never being asked at all, because `autoEnablePush` walked the same
 * path.
 *
 * The timeout was guarding something real — `.ready` never resolves when no
 * registration covers the document, which the per-workspace `/<slug>/` scope
 * makes reachable — but a stopwatch cannot tell that from "still activating".
 * `getRegistration()` can, so the two cases are now told apart by asking rather
 * than by waiting: no registration answers immediately, and a registration that
 * exists is waited on through ITS OWN state, not the clock.
 */
async function readyRegistration() {
  const reg = await registrationNow();
  if (!reg) return null;
  if (reg.active) return reg;
  const starting = reg.installing || reg.waiting;
  if (!starting) return reg;
  return await new Promise((resolve) => {
    const done = () => {
      if (starting.state === 'activated' || starting.state === 'redundant') {
        starting.removeEventListener('statechange', done);
        resolve(reg);
      }
    };
    starting.addEventListener('statechange', done);
  });
}

async function currentSubscription() {
  const reg = await readyRegistration();
  if (!reg) return null;
  try { return await reg.pushManager.getSubscription(); } catch (e) { return null; }
}

export async function isPushSubscribed() {
  return !!(await currentSubscription());
}

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

/**
 * Turn on phone alerts for this device. Returns
 * { ok, reason } — reason is one of: unsupported | denied | disabled | error.
 */
export async function enablePush() {
  if (!pushSupported()) return { ok: false, reason: 'unsupported' };
  const reg = await readyRegistration();
  if (!reg) return { ok: false, reason: 'unsupported' };

  const { enabled, publicKey } = await api.getVapid().catch(() => ({ enabled: false }));
  if (!enabled || !publicKey) return { ok: false, reason: 'disabled' };

  const perm = await Notification.requestPermission();
  if (perm !== 'granted') return { ok: false, reason: 'denied' };

  try {
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });
    }
    await api.subscribePush(sub.toJSON());
    return { ok: true };
  } catch (e) {
    console.warn('[Push] enable failed:', e?.message || e);
    return { ok: false, reason: 'error' };
  }
}

/**
 * The state of alerts ON THIS WORKSPACE, which is not what `Notification.permission`
 * answers.
 *
 * `Notification.permission` is per ORIGIN. Four workspaces on one phone share
 * one answer, so the moment any of them was granted, all four reported "Active"
 * — while a push only ever arrives if THIS workspace's service-worker
 * registration holds a subscription AND the server still has a row for that
 * endpoint. Those are three different facts and the settings row was reading
 * the one that costs nothing to satisfy.
 *
 * Returns { permission, subscribed, ok }:
 *   permission  granted | default | denied | unsupported
 *   subscribed  this workspace's registration has a PushSubscription
 *   ok          both — the only state worth calling active
 */
export async function pushStatus() {
  if (!pushSupported()) return { permission: 'unsupported', subscribed: false, ok: false };
  // THE APIS EXISTING IS NOT THE SAME AS PUSH BEING POSSIBLE.
  //
  // `serviceWorker` and `PushManager` are on `window` in every modern browser,
  // including `vite dev` — where the worker is deliberately never registered.
  // So the prompt offered a Turn on button that could only ever fail, and did,
  // with a red "Could not turn on alerts on this device". No registration, no
  // push: say nothing rather than offer something that cannot work.
  const reg = await readyRegistration();
  if (!reg) return { permission: 'unsupported', subscribed: false, ok: false };
  const permission = pushPermission();
  const subscribed = permission === 'granted' ? !!(await reg.pushManager.getSubscription().catch(() => null)) : false;
  return { permission, subscribed, ok: permission === 'granted' && subscribed };
}

/**
 * Alerts are on by default: there is no switch anywhere in the product, so this
 * runs once per signed-in device and subscribes.
 *
 * It waits for the first real interaction because Safari (and iOS PWAs) only
 * grant Notification.requestPermission() from a user gesture — asking on mount
 * there is an instant, permanent denial, and a denial cannot be re-asked. One
 * attempt per device: if the person says no, we do not nag on every load.
 */
export function autoEnablePush() {
  if (!pushSupported()) return;
  if (pushPermission() === 'denied') return;

  const run = async () => {
    off();
    // A BROWSER-SIDE SUBSCRIPTION IS NOT PROOF THE SERVER CAN REACH IT.
    //
    // This used to return here the moment the registration had a subscription,
    // and that is exactly how a phone goes permanently silent while every
    // screen says notifications are on. The endpoint rotates (FCM rotated one
    // of these within an hour on a real device), the server prunes the row on
    // the 410 that follows, and the browser object it left behind then answers
    // "already subscribed" on every launch forever after.
    //
    // So re-register the endpoint we hold instead of trusting it. The insert is
    // an upsert keyed on the endpoint, so re-sending the same one is free.
    const sub = await currentSubscription();
    if (sub) { await api.subscribePush(sub.toJSON()).catch(() => {}); return; }
    await enablePush();
  };
  const off = () => {
    window.removeEventListener('pointerdown', run);
    window.removeEventListener('keydown', run);
  };

  if (pushPermission() === 'granted') { run(); return; }
  window.addEventListener('pointerdown', run, { once: true });
  window.addEventListener('keydown', run, { once: true });
}

export async function disablePush() {
  // registrationNow, not readyRegistration: this runs on sign-out and may not
  // wait for anything. A worker that has not activated holds no subscription.
  const reg = await registrationNow();
  if (!reg) return { ok: true };
  try {
    const sub = await reg.pushManager.getSubscription();
    if (sub) {
      await api.unsubscribePush(sub.endpoint).catch(() => {});
      await sub.unsubscribe().catch(() => {});
    }
    return { ok: true };
  } catch (e) {
    return { ok: false };
  }
}
