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

async function readyRegistration() {
  if (!pushSupported()) return null;
  // `.ready` resolves for the registration whose SCOPE covers this document,
  // and never resolves at all when nothing does. That is reachable now the
  // worker is scoped to `/<slug>/`: a URL that missed the trailing-slash
  // normalisation sits outside every scope, and this would hang forever —
  // taking `autoEnablePush` and `disablePush` (which runs on sign-out, before
  // the token is dropped) with it. Time it out and degrade instead.
  // Wait out registration first, or this subscribes against whichever worker
  // happens to control the page at the time — which on the first launch after
  // per-workspace scoping is the root one, about to be retired.
  await swReady();
  try {
    return await Promise.race([
      navigator.serviceWorker.ready,
      new Promise((res) => setTimeout(() => res(null), 5000)),
    ]);
  } catch (e) { return null; }
}

export async function isPushSubscribed() {
  const reg = await readyRegistration();
  if (!reg) return false;
  try { return !!(await reg.pushManager.getSubscription()); } catch (e) { return false; }
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
    if (await isPushSubscribed()) return;
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
  const reg = await readyRegistration();
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
