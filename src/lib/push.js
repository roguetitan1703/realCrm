// ============================================================================
// 📲 Web Push (client) — opt a device in to notifications, no Firebase
// ============================================================================
// The flow: ask the backend for the VAPID public key, ask the browser for
// notification permission, subscribe through the service worker, and hand the
// resulting PushSubscription to the backend keyed to this device + user. All of
// it degrades quietly on browsers/OSes that don't support push (older iOS, etc.).

import { api } from './api.js';

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
  try { return await navigator.serviceWorker.ready; } catch (e) { return null; }
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
