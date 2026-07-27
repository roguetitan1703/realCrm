/**
 * ============================================================================
 * 🔔 WEB PUSH — deliver notifications to a device even when the app is closed
 * ============================================================================
 * Standard Web Push (VAPID), no Firebase. The keypair lives in env; if it's
 * absent, push is simply disabled and the in-app feed still works. Subscriptions
 * are per-device (see push_subscriptions); a notification fans out to every
 * device the recipient has opted in on, and dead endpoints (410/404) are pruned.
 * ============================================================================
 */

import webpush from 'web-push';
import { sql } from './db.js';

const PUBLIC = process.env.VAPID_PUBLIC_KEY || '';
const PRIVATE = process.env.VAPID_PRIVATE_KEY || '';
const SUBJECT = process.env.VAPID_SUBJECT || 'mailto:delpatllp@gmail.com';

let enabled = false;
if (PUBLIC && PRIVATE) {
  try {
    webpush.setVapidDetails(SUBJECT, PUBLIC, PRIVATE);
    enabled = true;
    console.log('[Push] Web Push enabled (VAPID configured).');
  } catch (e: any) {
    console.warn('[Push] VAPID setup failed:', e?.message);
  }
} else {
  console.log('[Push] Web Push disabled (no VAPID keys). In-app notifications still work.');
}

export function pushEnabled(): boolean { return enabled; }
export function vapidPublicKey(): string { return PUBLIC; }

export async function saveSubscription(tenantId: string, userId: string, sub: any): Promise<void> {
  if (!sub?.endpoint || !sub?.keys?.p256dh || !sub?.keys?.auth || !tenantId || !userId) return;
  const id = `sub_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  await sql`
    INSERT INTO push_subscriptions (id, tenant_id, user_id, endpoint, p256dh, auth)
    VALUES (${id}, ${tenantId}, ${userId}, ${sub.endpoint}, ${sub.keys.p256dh}, ${sub.keys.auth})
    ON CONFLICT (endpoint) DO UPDATE SET
      tenant_id = EXCLUDED.tenant_id, user_id = EXCLUDED.user_id,
      p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth
  `;
}

export async function removeSubscription(endpoint: string): Promise<void> {
  if (endpoint) await sql`DELETE FROM push_subscriptions WHERE endpoint = ${endpoint}`;
}

export async function sendPushToUser(tenantId: string, userId: string, payload: any): Promise<void> {
  if (!enabled || !userId || !tenantId) return;
  const subs = await sql`SELECT * FROM push_subscriptions WHERE tenant_id = ${tenantId} AND user_id = ${userId}`;
  const body = JSON.stringify(payload);
  await Promise.all(subs.map(async (s: any) => {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, body);
    } catch (e: any) {
      // 404/410 = the browser dropped this subscription; prune it.
      if (e?.statusCode === 404 || e?.statusCode === 410) {
        await sql`DELETE FROM push_subscriptions WHERE id = ${s.id}`;
      } else {
        console.warn('[Push] send failed:', e?.statusCode, e?.message);
      }
    }
  }));
}
