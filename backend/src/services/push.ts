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
import dns from 'node:dns';
import net from 'node:net';
import { sql } from './db.js';
import { canTakeWork } from './workforce.js';

// A QUARTER OF iPHONE PUSHES NEVER LEFT THE BOX. 110 of 458 sends to
// web.push.apple.com in a fortnight failed as `ETIMEDOUT/ENETUNREACH` (prod,
// 12 Oct): Node tries every address Apple's DNS returns, IPv6 and IPv4
// interleaved, and gives each attempt 250 ms before moving on. The box has no
// IPv6 route (ENETUNREACH, instantly) and a connect from India to Apple can
// take longer than 250 ms, so every IPv4 attempt was abandoned too. IPv4 first,
// and a connect is given 2.5 s. Process-wide — Node has no per-request knob for
// web-push's agent — and harmless for the database and mail connections.
dns.setDefaultResultOrder('ipv4first');
if (typeof (net as any).setDefaultAutoSelectFamilyAttemptTimeout === 'function') {
  (net as any).setDefaultAutoSelectFamilyAttemptTimeout(2500);
}

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

// How long a push service may hold a message for a device that is offline.
// Without one FCM keeps it four weeks, and a "not contacted" alert surfacing
// eleven days late is worse than none, because the agent acts on it. An urgent
// alert is stale after 6 hours; a morning summary is good for the working day.
const TTL_URGENT_SECONDS = 6 * 3600;
const TTL_SUMMARY_SECONDS = 12 * 3600;

interface PushMeta {
  notificationId?: string;
  /** A summary covers several alerts; every one is marked shown with it. */
  notificationIds?: string[];
  type?: string;
  /** `now` / `at_time` alerts: high priority, so an idle Android shows it. */
  urgent?: boolean;
}
export function vapidPublicKey(): string { return PUBLIC; }

/** Saved, or false when the push service has already said this endpoint is gone. */
export async function saveSubscription(tenantId: string, userId: string, sub: any, userAgent?: string, sessionId?: string): Promise<boolean> {
  if (!sub?.endpoint || !sub?.keys?.p256dh || !sub?.keys?.auth || !tenantId || !userId) return true;
  const [gone] = await sql`SELECT 1 FROM push_gone_endpoints WHERE endpoint = ${sub.endpoint}`;
  if (gone) return false;
  const id = `sub_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  await sql`
    INSERT INTO push_subscriptions (id, tenant_id, user_id, endpoint, p256dh, auth, user_agent, session_id)
    VALUES (${id}, ${tenantId}, ${userId}, ${sub.endpoint}, ${sub.keys.p256dh}, ${sub.keys.auth}, ${userAgent || null}, ${sessionId || null})
    ON CONFLICT (endpoint) DO UPDATE SET
      tenant_id = EXCLUDED.tenant_id, user_id = EXCLUDED.user_id,
      p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth,
      user_agent = COALESCE(EXCLUDED.user_agent, push_subscriptions.user_agent),
      session_id = COALESCE(EXCLUDED.session_id, push_subscriptions.session_id)
  `;
  return true;
}

const PUSH_STATES = new Set(['on', 'off', 'default', 'denied', 'unsupported']);
/** What this sign-in's browser reports about alerts. Its own session only. */
export async function recordPushState(sessionId: string, userId: string, state: string): Promise<void> {
  if (!sessionId || !userId || !PUSH_STATES.has(state)) return;
  await sql`UPDATE sessions SET push_state = ${state}, push_state_at = NOW()
            WHERE id = ${sessionId} AND user_id = ${userId}`;
}

/**
 * CAN THIS DEVICE BE SENT TO -- the one definition, for the send and for every
 * report that counts devices. A device is live while the sign-in that
 * registered it is live; signing out, expiry and revocation all end it. A row
 * from before devices were bound to a sign-in (session_id NULL) is treated as
 * before -- live while its person is signed in anywhere -- for one week from the
 * `push_subscription_session` marker, long enough for every device in use to
 * re-bind on its next open. After that an unbound row is not sent to.
 * A support session (Delpat on a firm's desk) never makes a device live.
 * Reads the alias `p` for push_subscriptions.
 */
export function deviceIsLive() {
  return sql`(
    (p.session_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM sessions s WHERE s.id = p.session_id AND s.revoked = FALSE AND s.expires_at > NOW()))
    OR (p.session_id IS NULL
      AND EXISTS (SELECT 1 FROM sessions s WHERE s.user_id = p.user_id AND s.revoked = FALSE
                    AND s.expires_at > NOW() AND s.support_by IS NULL)
      AND EXISTS (SELECT 1 FROM schema_migrations m WHERE m.name = 'push_subscription_session'
                    AND m.applied_at > NOW() - INTERVAL '7 days'))
  )`;
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
  ackToken?: string | null; notificationIds?: string[] | null; payload?: any; attempt?: number;
}): Promise<void> {
  try {
    const id = `pdl_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    await sql`
      INSERT INTO push_deliveries (id, tenant_id, user_id, notification_id, type, endpoint, status, status_code, error,
                                   ack_token, notification_ids, payload, attempt)
      VALUES (${id}, ${row.tenantId}, ${row.userId}, ${row.notificationId ?? null}, ${row.type ?? null},
              ${row.endpoint ?? null}, ${row.status}, ${row.statusCode ?? null},
              ${row.error ? String(row.error).slice(0, 300) : null}, ${row.ackToken ?? null},
              ${row.notificationIds?.length ? row.notificationIds : null},
              ${row.payload ? sql.json(row.payload) : null}, ${row.attempt ?? 1})
    `;
  } catch (e: any) {
    console.warn('[Push] delivery log write failed:', e?.message);
  }
}

/**
 * WHY A DELIVERY FAILED, IN ONE STRING — and never an empty one.
 *
 * 43 failures to iPhones in three days were logged with no status code and no
 * error text, because this recorded `e.body || e.message` alone. A push that
 * Apple or Google REFUSED always carries a status code; one that never got that
 * far — DNS, TCP, TLS — fails below HTTP, where Node's message is routinely
 * empty and the reason lives in `code`, in `cause.code`, or in one of the
 * `errors` of an AggregateError (every address tried, all failed). None of that
 * was stored, so the log could not tell "they refused it" from "we never
 * reached them" — which are opposite problems with opposite fixes.
 *
 * The push service is in the string too: `web.push.apple.com` and
 * `fcm.googleapis.com` fail differently and the endpoint column is a URL nobody
 * reads at a glance.
 */
function failureReason(e: any, endpoint: string): string {
  const parts: string[] = [];
  // From the subscription, not the error: a network-level failure carries no
  // endpoint of its own, and that is exactly the case this exists for.
  const host = (() => { try { return new URL(String(endpoint || '')).host; } catch { return ''; } })();
  if (host) parts.push(host);
  if (e?.statusCode) parts.push(`HTTP ${e.statusCode}`);
  const body = typeof e?.body === 'string' ? e.body.trim() : '';
  if (body) parts.push(body);
  const msg = typeof e?.message === 'string' ? e.message.trim() : '';
  if (msg) parts.push(msg);
  // Network-level codes, in the three places Node puts them.
  const codes = [e?.code, e?.cause?.code, ...(Array.isArray(e?.errors) ? e.errors.map((x: any) => x?.code) : [])]
    .filter(Boolean).map(String);
  if (codes.length) parts.push([...new Set(codes)].join('/'));
  // Nothing readable at all still has a name — an AggregateError with an empty
  // message is itself the clue, and a blank row is not.
  if (!parts.length || (!body && !msg && !codes.length && !e?.statusCode)) {
    const kind = e?.name || e?.constructor?.name;
    parts.push(kind && kind !== 'Object' ? kind : 'unknown error');
  }
  return parts.join(' · ');
}

export async function removeSubscription(endpoint: string): Promise<void> {
  if (endpoint) await sql`DELETE FROM push_subscriptions WHERE endpoint = ${endpoint}`;
}

export async function sendPushToUser(
  tenantId: string,
  userId: string,
  payload: any,
  meta: PushMeta = {},
): Promise<void> {
  if (!userId || !tenantId) return;
  const log = (status: string, extra: any = {}) => logDelivery({
    tenantId, userId, notificationId: meta.notificationId, notificationIds: meta.notificationIds,
    type: meta.type, status, ...extra,
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
  // And only to a member of the firm (workforce.ts): removing or suspending
  // someone revokes their sessions, but a push must not depend on that.
  const [live] = await sql`
    SELECT count(*)::int AS n, ${canTakeWork(tenantId, userId)} AS member FROM sessions
    WHERE user_id = ${userId} AND revoked = FALSE AND expires_at > NOW()`;
  if (!live?.member) { await log('not_a_member'); return; }
  if (!live?.n) { await log('not_signed_in'); return; }
  // ...AND ONLY TO A DEVICE THAT IS ITSELF SIGNED IN. Being signed in on a
  // laptop is not being signed in on the phone in a drawer. Each skipped device
  // is logged, so "she has a phone, and it is signed out" is in the report.
  const all = await sql`
    SELECT p.*, ${deviceIsLive()} AS live
    FROM push_subscriptions p WHERE p.tenant_id = ${tenantId} AND p.user_id = ${userId}`;
  if (!all.length) { await log('no_subscription'); return; }
  for (const s of all.filter((r: any) => !r.live)) await log('device_signed_out', { endpoint: s.endpoint });
  const subs = all.filter((r: any) => r.live);
  await Promise.all(subs.map((s: any) => sendToDevice(tenantId, userId, s, payload, meta, 1)));
}

/**
 * One push to one device, logged. Shared by the first send and the retry, so a
 * retry is the same send and lands in the same log.
 */
async function sendToDevice(tenantId: string, userId: string, s: any, payload: any, meta: PushMeta, attempt: number): Promise<void> {
  const log = (status: string, extra: any = {}) => logDelivery({
    tenantId, userId, notificationId: meta.notificationId, notificationIds: meta.notificationIds,
    type: meta.type, status, attempt, endpoint: s.endpoint, ...extra,
  });
  // One token per DEVICE, not per alert: the same notification going to a
  // phone and a laptop is two deliveries, and "it showed on one of them" is
  // the answer that matters.
  const ackToken = randomBytes(18).toString('base64url');
  const body = JSON.stringify({
    ...payload,
    ...(ACK_URL ? { ack: { url: ACK_URL, token: ackToken } } : {}),
  });
  try {
    // URGENCY. At the default (normal) an idle Android phone holds the message
    // until it next wakes: 208 alerts in a fortnight were accepted and shown on
    // no screen, after 20:00 sent outnumbered shown 85 to 23, and 85 arrived 5
    // minutes to 6 hours late (prod, 12 Oct). An alert someone must act on now
    // goes high; a morning summary does not need to wake anyone.
    const res = await webpush.sendNotification(
      { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
      body,
      meta.urgent
        ? { TTL: TTL_URGENT_SECONDS, urgency: 'high' }
        : { TTL: TTL_SUMMARY_SECONDS, urgency: 'normal' },
    );
    await log('sent', { statusCode: res?.statusCode ?? null, ackToken });
    await sql`UPDATE push_subscriptions SET last_success_at = NOW() WHERE id = ${s.id}`;
  } catch (e: any) {
    // 404/410 = the push service dropped this subscription. Remembered, so the
    // app cannot re-register it (see push_gone_endpoints in db.ts).
    if (e?.statusCode === 404 || e?.statusCode === 410) {
      await sql`INSERT INTO push_gone_endpoints (endpoint) VALUES (${s.endpoint}) ON CONFLICT DO NOTHING`;
      await sql`DELETE FROM push_subscriptions WHERE id = ${s.id}`;
      await log('expired', { statusCode: e.statusCode });
    } else {
      const why = failureReason(e, s.endpoint);
      console.warn('[Push] send failed:', e?.statusCode, why);
      // The payload is kept only for a failure below HTTP — the one kind a
      // retry can fix (retryFailedPushes). A refusal with a status code is an
      // answer, not an accident.
      await log('failed', { statusCode: e?.statusCode ?? null, error: why, payload: e?.statusCode ? null : payload });
    }
  }
}

/**
 * RETRY WHAT NEVER LEFT THE BOX. A send that failed below HTTP — DNS, TCP,
 * TLS; 110 of 458 sends to Apple in a fortnight before the IPv4 change — was
 * lost for good. Now: up to two more attempts, a minute or more apart, to the
 * same device, while it is still live and the alert still open. Run by the
 * sweep, per tenant.
 */
export async function retryFailedPushes(tenantId: string): Promise<number> {
  const rows = await sql`
    SELECT d.id, d.user_id, d.notification_id, d.notification_ids, d.type, d.endpoint, d.payload, d.attempt
      FROM push_deliveries d
     WHERE d.tenant_id = ${tenantId} AND d.status = 'failed' AND d.status_code IS NULL
       AND d.payload IS NOT NULL AND d.retried_at IS NULL AND coalesce(d.attempt, 1) < 3
       AND d.created_at < NOW() - interval '1 minute' AND d.created_at > NOW() - interval '30 minutes'
       AND NOT EXISTS (SELECT 1 FROM notifications n WHERE n.id = d.notification_id AND n.closed_at IS NOT NULL)
     LIMIT 50`;
  let n = 0;
  for (const d of rows as any[]) {
    await sql`UPDATE push_deliveries SET retried_at = NOW() WHERE id = ${d.id}`;
    const [s] = await sql`
      SELECT p.*, ${deviceIsLive()} AS live FROM push_subscriptions p
       WHERE p.tenant_id = ${tenantId} AND p.endpoint = ${d.endpoint}`;
    if (!s?.live) continue;
    await sendToDevice(tenantId, d.user_id, s, d.payload, {
      notificationId: d.notification_id ?? undefined, notificationIds: d.notification_ids ?? undefined,
      type: d.type ?? undefined, urgent: true,
    }, (d.attempt || 1) + 1);
    n++;
  }
  return n;
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
  await sql`DELETE FROM push_gone_endpoints WHERE gone_at < NOW() - (${days}::text || ' days')::interval`;
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
  // ONE ANSWER TO "CAN THIS PERSON BE REACHED", for the firm's Team screen and
  // for Delpat's console alike. `reach`:
  //   on          a live device to send to
  //   blocked     a sign-in whose browser has alerts blocked
  //   unsupported a sign-in whose browser cannot receive alerts at all
  //   off         neither: never turned on, or nothing reported yet
  // and "shown this week" counts alerts that reached a SCREEN, not ones a push
  // service accepted — an idle or signed-out phone accepts them too.
  return await sql`
    SELECT r.*,
      CASE WHEN r.devices > 0 THEN 'on'
           WHEN 'denied' = ANY(r.push_states) THEN 'blocked'
           WHEN 'unsupported' = ANY(r.push_states) THEN 'unsupported'
           ELSE 'off' END AS reach
    FROM (
      SELECT u.id, u.name, u.role,
        (SELECT count(*)::int FROM push_subscriptions p WHERE p.user_id = u.id AND p.tenant_id = ${tenantId} AND ${deviceIsLive()}) AS devices,
        (SELECT count(*)::int FROM push_subscriptions p WHERE p.user_id = u.id AND p.tenant_id = ${tenantId} AND NOT ${deviceIsLive()}) AS devices_signed_out,
        (SELECT count(*)::int FROM sessions s WHERE s.user_id = u.id AND s.revoked = FALSE AND s.expires_at > NOW() AND s.support_by IS NULL) AS live_sessions,
        coalesce((SELECT array_agg(DISTINCT s.push_state) FROM sessions s WHERE s.user_id = u.id AND s.revoked = FALSE
                    AND s.expires_at > NOW() AND s.support_by IS NULL AND s.push_state IS NOT NULL), '{}') AS push_states,
        (SELECT max(d.displayed_at) FROM push_deliveries d WHERE d.user_id = u.id AND d.tenant_id = ${tenantId}) AS last_reached_at,
        (SELECT count(*)::int FROM notifications n WHERE n.tenant_id = ${tenantId} AND n.user_id = u.id
            AND n.created_at > NOW() - INTERVAL '7 days' AND coalesce(n.urgency, '') <> 'drawer') AS alerts_7d,
        (SELECT count(*)::int FROM notifications n WHERE n.tenant_id = ${tenantId} AND n.user_id = u.id
            AND n.created_at > NOW() - INTERVAL '7 days' AND n.shown_at IS NOT NULL) AS alerts_shown_7d,
        (SELECT count(*)::int FROM push_deliveries d WHERE d.tenant_id = ${tenantId} AND d.user_id = u.id
            AND d.status = 'failed' AND d.created_at > NOW() - INTERVAL '7 days') AS alerts_failed_7d
      FROM users u
      WHERE u.tenant_id = ${tenantId} AND u.status ILIKE 'active' AND u.deleted_at IS NULL
    ) r
    ORDER BY r.role, r.name
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
  // SHOWN, and on a tap READ, for the alert(s) the delivery carried — a summary
  // carries several. Scoped through the delivery row to its own recipient and
  // tenant: the token is the only credential this path has. A tapped push was
  // still unread in the bell for 20 of 21 taps before this (prod, 12 Oct).
  if (rows.length) {
    await sql`
      UPDATE notifications n SET shown_at = COALESCE(n.shown_at, NOW())
      FROM push_deliveries d
      WHERE d.ack_token = ${token} AND n.tenant_id = d.tenant_id AND n.user_id = d.user_id
        AND (n.id = d.notification_id OR n.id = ANY(coalesce(d.notification_ids, '{}')))`;
  }
  if (event === 'clicked' && rows.length) {
    await sql`
      UPDATE notifications n SET read = TRUE, read_at = COALESCE(n.read_at, NOW())
      FROM push_deliveries d
      WHERE d.ack_token = ${token} AND n.tenant_id = d.tenant_id AND n.user_id = d.user_id
        AND (n.id = d.notification_id OR n.id = ANY(coalesce(d.notification_ids, '{}')))
        AND n.read = FALSE`;
  }
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
  const [row] = await sql`SELECT tenant_id, user_id, user_agent, session_id FROM push_subscriptions WHERE endpoint = ${oldEndpoint}`;
  if (!row) return false;
  // The browser rotated the endpoint; the device and its sign-in are the same.
  if (!await saveSubscription(row.tenant_id, row.user_id, sub, row.user_agent || undefined, row.session_id || undefined)) return false;
  if (sub.endpoint !== oldEndpoint) await sql`DELETE FROM push_subscriptions WHERE endpoint = ${oldEndpoint}`;
  return true;
}
