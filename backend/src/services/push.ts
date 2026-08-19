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
import { randomBytes } from 'crypto';
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

// Where a device reports a receipt. Absolute, because a service worker has no
// build-time config and cannot read the frontend's VITE_API_URL. Absent, pushes
// simply carry no token and the log stops at `sent` — which is honest.
const ACK_URL = process.env.PUBLIC_API_URL
  ? `${process.env.PUBLIC_API_URL.replace(/\/+$/, '')}/api/v1/notifications/ack`
  : '';

// 6 hours. Every alert we push is about something to do TODAY.
const TTL_SECONDS = 6 * 3600;
export function vapidPublicKey(): string { return PUBLIC; }

export async function saveSubscription(tenantId: string, userId: string, sub: any, userAgent?: string): Promise<void> {
  if (!sub?.endpoint || !sub?.keys?.p256dh || !sub?.keys?.auth || !tenantId || !userId) return;
  const id = `sub_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  await sql`
    INSERT INTO push_subscriptions (id, tenant_id, user_id, endpoint, p256dh, auth, user_agent)
    VALUES (${id}, ${tenantId}, ${userId}, ${sub.endpoint}, ${sub.keys.p256dh}, ${sub.keys.auth}, ${userAgent || null})
    ON CONFLICT (endpoint) DO UPDATE SET
      tenant_id = EXCLUDED.tenant_id, user_id = EXCLUDED.user_id,
      p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth,
      user_agent = COALESCE(EXCLUDED.user_agent, push_subscriptions.user_agent)
  `;
}

/**
 * One row per attempt, INCLUDING the attempts that never left the building.
 *
 * The whole point is the silent outcomes: a recipient with no device opted in,
 * or signed out everywhere, produced no error, no log line and no row anywhere
 * — delivering to an empty list is not a failure, so it fails forever without
 * anyone learning of it. Best-effort: a delivery log that can break the alert
 * it is logging is worse than no log.
 */
async function logDelivery(row: {
  tenantId: string; userId: string; notificationId?: string | null; type?: string | null;
  endpoint?: string | null; status: string; statusCode?: number | null; error?: string | null;
  ackToken?: string | null;
}): Promise<void> {
  try {
    const id = `pdl_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    await sql`
      INSERT INTO push_deliveries (id, tenant_id, user_id, notification_id, type, endpoint, status, status_code, error, ack_token)
      VALUES (${id}, ${row.tenantId}, ${row.userId}, ${row.notificationId ?? null}, ${row.type ?? null},
              ${row.endpoint ?? null}, ${row.status}, ${row.statusCode ?? null},
              ${row.error ? String(row.error).slice(0, 300) : null}, ${row.ackToken ?? null})
    `;
  } catch (e: any) {
    console.warn('[Push] delivery log write failed:', e?.message);
  }
}

export async function removeSubscription(endpoint: string): Promise<void> {
  if (endpoint) await sql`DELETE FROM push_subscriptions WHERE endpoint = ${endpoint}`;
}

export async function sendPushToUser(
  tenantId: string,
  userId: string,
  payload: any,
  meta?: { notificationId?: string; type?: string },
): Promise<void> {
  if (!userId || !tenantId) return;
  const log = (status: string, extra: any = {}) => logDelivery({
    tenantId, userId, notificationId: meta?.notificationId, type: meta?.type, status, ...extra,
  });
  if (!enabled) { await log('push_disabled'); return; }
  // A PUSH IS ONLY FOR SOMEONE WHO IS SIGNED IN.
  //
  // A push subscription is per-device and outlived the session that created it:
  // nothing removed it at sign-out, and this fanned out to every row for the
  // user regardless. So a phone that had been signed out went on buzzing with
  // lead names and phone numbers — on a handset that had been handed to someone
  // else, or sold, that is a firm's contact list leaving the building.
  //
  // The same liveness test the request path uses (auth.ts touchSession): not
  // revoked, not expired. Signed out everywhere means no push, whether or not
  // the browser managed to unsubscribe on the way out — which it cannot do at
  // all if the sign-out happened by timeout, or on a device that is offline.
  const [live] = await sql`
    SELECT count(*)::int AS n FROM sessions
    WHERE user_id = ${userId} AND revoked = FALSE AND expires_at > NOW()`;
  if (!live?.n) { await log('not_signed_in'); return; }
  const subs = await sql`SELECT * FROM push_subscriptions WHERE tenant_id = ${tenantId} AND user_id = ${userId}`;
  if (!subs.length) { await log('no_subscription'); return; }
  await Promise.all(subs.map(async (s: any) => {
    // One token per DEVICE, not per alert: the same notification going to a
    // phone and a laptop is two deliveries, and "it showed on one of them" is
    // the answer that matters.
    const ackToken = randomBytes(18).toString('base64url');
    const body = JSON.stringify({
      ...payload,
      ...(ACK_URL ? { ack: { url: ACK_URL, token: ackToken } } : {}),
    });
    try {
      // TTL: how long the push service may hold this if the device is offline.
      // Without it FCM keeps a message for four weeks — and a "not contacted
      // for 24h" alert surfacing eleven days late is worse than one that never
      // arrives, because the agent acts on it.
      const res = await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        body,
        { TTL: TTL_SECONDS },
      );
      await log('sent', { endpoint: s.endpoint, statusCode: res?.statusCode ?? null, ackToken });
      await sql`UPDATE push_subscriptions SET last_success_at = NOW() WHERE id = ${s.id}`;
    } catch (e: any) {
      // 404/410 = the browser dropped this subscription; prune it.
      if (e?.statusCode === 404 || e?.statusCode === 410) {
        await sql`DELETE FROM push_subscriptions WHERE id = ${s.id}`;
        await log('expired', { endpoint: s.endpoint, statusCode: e.statusCode });
      } else {
        console.warn('[Push] send failed:', e?.statusCode, e?.message);
        await log('failed', { endpoint: s.endpoint, statusCode: e?.statusCode ?? null, error: e?.body || e?.message });
      }
    }
  }));
}

/**
 * Trim the log. Run from the same sweep that fires the alerts.
 *
 * 90 days: long enough to answer "did my desk get told about this lead last
 * quarter", short enough that the table never becomes the biggest thing in the
 * database. Returns how many rows went, so a caller can say so.
 */
export async function pruneDeliveryLog(days = 90): Promise<number> {
  const r = await sql`
    DELETE FROM push_deliveries
    WHERE created_at < NOW() - (${days}::text || ' days')::interval
    RETURNING id`;
  return r.length;
}

/**
 * What actually reached devices, for one workspace.
 *
 * The answer a desk owner asks for by name: "my agents say they get nothing —
 * did the app tell them?" Scoped to the request tenant, never global, and it
 * returns the ATTEMPT alongside the feed row so the two halves of one alert are
 * read together rather than inferred from each other.
 *
 * `userId` narrows it to one recipient; `since` is an ISO instant.
 */
export async function listDeliveries(
  tenantId: string,
  { userId, since, limit = 200 }: { userId?: string; since?: string; limit?: number } = {},
): Promise<any[]> {
  return await sql`
    SELECT d.id, d.user_id, u.name AS user_name, u.role,
           d.notification_id, d.type, d.status, d.status_code, d.error,
           d.endpoint, d.created_at,
           n.title, n.body
    FROM push_deliveries d
    LEFT JOIN users u ON u.id = d.user_id
    LEFT JOIN notifications n ON n.id = d.notification_id
    WHERE d.tenant_id = ${tenantId}
      ${userId ? sql`AND d.user_id = ${userId}` : sql``}
      ${since ? sql`AND d.created_at >= ${since}::timestamptz` : sql``}
    ORDER BY d.created_at DESC
    LIMIT ${Math.min(Number(limit) || 200, 500)}
  `;
}

/**
 * One line per recipient: can this person be reached at all, and when were they
 * last reached. This is the view that would have shown four of seven agents
 * carrying no subscription while every screen said notifications were on.
 */
export async function deliveryReadiness(tenantId: string): Promise<any[]> {
  return await sql`
    SELECT u.id, u.name, u.role,
      (SELECT count(*)::int FROM push_subscriptions p WHERE p.user_id = u.id AND p.tenant_id = ${tenantId}) AS devices,
      (SELECT count(*)::int FROM sessions s WHERE s.user_id = u.id AND s.revoked = FALSE AND s.expires_at > NOW()) AS live_sessions,
      (SELECT max(p.last_success_at) FROM push_subscriptions p WHERE p.user_id = u.id AND p.tenant_id = ${tenantId}) AS last_reached_at
    FROM users u
    WHERE u.tenant_id = ${tenantId} AND u.status ILIKE 'active'
    ORDER BY u.role, u.name
  `;
}

/**
 * A device reporting what it did with a push. Unauthenticated by necessity — a
 * service worker cannot reach the signed-in session — and safe because the
 * token is 144 bits that only ever existed inside a payload encrypted to one
 * subscription's keys. Unknown token, nothing happens.
 */
export async function recordAck(token: string, event: string): Promise<boolean> {
  if (!token) return false;
  const rows = event === 'clicked'
    ? await sql`
        UPDATE push_deliveries SET clicked_at = NOW(),
          displayed_at = COALESCE(displayed_at, NOW()),
          status = CASE WHEN status = 'sent' THEN 'displayed' ELSE status END
        WHERE ack_token = ${token} RETURNING id`
    : await sql`
        UPDATE push_deliveries SET displayed_at = COALESCE(displayed_at, NOW()),
          status = CASE WHEN status = 'sent' THEN 'displayed' ELSE status END
        WHERE ack_token = ${token} RETURNING id`;
  return rows.length > 0;
}

/**
 * The endpoint rotated and the worker re-subscribed. Rebind the row.
 *
 * Proof is possession of the OLD endpoint, which is a secret URL with far more
 * entropy than a session token and is never transmitted anywhere else. It also
 * carries the tenant and user, which is the point: without it a rotation would
 * have to guess whose device this is.
 */
export async function rebindSubscription(oldEndpoint: string, sub: any): Promise<boolean> {
  if (!oldEndpoint || !sub?.endpoint || !sub?.keys?.p256dh || !sub?.keys?.auth) return false;
  const [row] = await sql`SELECT tenant_id, user_id, user_agent FROM push_subscriptions WHERE endpoint = ${oldEndpoint}`;
  if (!row) return false;
  await saveSubscription(row.tenant_id, row.user_id, sub, row.user_agent || undefined);
  if (sub.endpoint !== oldEndpoint) await sql`DELETE FROM push_subscriptions WHERE endpoint = ${oldEndpoint}`;
  return true;
}
