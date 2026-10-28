/**
 * ============================================================================
 * FEED WATCH — a portal that stopped sending is named within a day
 * ============================================================================
 * Who: the firm's owner, who pays the portals for the leads. bhumi's 99acres
 * sent nothing from 12 Sep to 9 Oct and nobody noticed for four weeks: the
 * desk sees leads that arrive, never the ones that did not.
 *
 * The rule is the catalogue's (notificationCatalogue.ts `feed_silent`,
 * FEED_SILENT); what closes the alert is alertLifecycle.ts `feed_alive`.
 * This file only finds the silent connections and raises the alert.
 *
 * ONE OPEN ALERT PER CONNECTION. A connection with an open `feed_silent` is
 * not raised again; once a push (or pausing it) has closed that one, a new
 * silence can raise a new one.
 *
 * `silentFeeds(tenantId)` is the one query, read by the sweep and by
 * scripts/feed-watch-preview.ts (a read-only transaction against production).
 * ============================================================================
 */
import { sql } from './db.js';
import { notify } from './notifications.js';
import { FEED_SILENT } from './notificationCatalogue.js';
import { timezoneOf } from './store.js';

export interface SilentFeed {
  id: string;
  provider: string;
  last_received_at: string;
  /** Whole days since the last push. */
  days: number;
  /** The last push on the firm's clock, "09 Oct". */
  last: string;
  /** Pushes in the FEED_SILENT.priorDays ending at the last one. */
  prior_pushes: number;
  /** An open feed_silent alert already names it: the sweep raises nothing. */
  open_alert: boolean;
}

/**
 * Every ACTIVE connection of this firm that is silent by FEED_SILENT, whether
 * or not it is already alerted (`open_alert`). Pushes are counted from
 * webhook_inbox, which keeps a row per push after its body is purged.
 */
export async function silentFeeds(
  tenantId: string, { db = sql, tz }: { db?: any; tz?: string } = {},
): Promise<SilentFeed[]> {
  if (!tenantId) return [];
  // `tz` only words the date; the preview passes it so it reads nothing outside its transaction.
  tz = tz || await timezoneOf(tenantId);
  const { silentDays, priorDays, minPushes } = FEED_SILENT;
  return await db`
    SELECT * FROM (
      SELECT i.id, i.provider, i.last_received_at,
             floor(extract(epoch FROM now() - i.last_received_at) / 86400)::int AS days,
             to_char(i.last_received_at AT TIME ZONE ${tz}, 'DD Mon') AS last,
             (SELECT count(*)::int FROM webhook_inbox w
               WHERE w.tenant_id = i.tenant_id AND w.integration_id = i.id
                 AND w.received_at <= i.last_received_at
                 AND w.received_at > i.last_received_at - make_interval(days => ${priorDays}::int)) AS prior_pushes,
             EXISTS (SELECT 1 FROM notifications n
                      WHERE n.tenant_id = i.tenant_id AND n.type = 'feed_silent'
                        AND n.closed_at IS NULL AND i.id = ANY(n.record_ids)) AS open_alert
        FROM integrations i
       WHERE i.tenant_id = ${tenantId} AND i.active
         AND i.last_received_at < now() - make_interval(days => ${silentDays}::int)
    ) f
    WHERE f.prior_pushes >= ${minPushes}
    ORDER BY f.last_received_at`;
}

// Hourly per firm: a feed is silent for days, so a minute's sweep finding it
// again sixty times an hour buys nothing.
const EVERY_MS = 60 * 60 * 1000;
const lastRun = new Map<string, number>();
const running = new Set<string>();

/**
 * Raise `feed_silent` for each newly silent connection, to every active owner.
 * Returns how many alerts were filed. No owner is a failure, logged with the
 * firm (CLAUDE.md §4: an alert to an empty list fails silently for ever).
 */
export async function feedWatchSweep(tenantId: string, { force = false }: { force?: boolean } = {}): Promise<number> {
  if (!tenantId || running.has(tenantId)) return 0;
  if (!force && Date.now() - (lastRun.get(tenantId) || 0) < EVERY_MS) return 0;
  lastRun.set(tenantId, Date.now());
  running.add(tenantId);
  try {
    const fresh = (await silentFeeds(tenantId)).filter(f => !f.open_alert);
    if (!fresh.length) return 0;
    const owners = await sql`SELECT id FROM users
      WHERE tenant_id = ${tenantId} AND role = 'owner' AND status ILIKE 'active' AND deleted_at IS NULL`;
    if (!owners.length) {
      console.warn(`[FeedWatch] ${tenantId}: ${fresh.length} silent feed(s) (${fresh.map(f => f.provider).join(', ')}) reached nobody: no active owner`);
      return 0;
    }
    let filed = 0;
    for (const f of fresh) {
      for (const o of owners) {
        await notify({
          userId: o.id, tenantId, type: 'feed_silent',
          data: { portal: f.provider, days: f.days, last: f.last },
          link: '?screen=integrations',
          record: { kind: 'integration', ids: [f.id] },
          toSelf: true,
        });
      }
      const [{ k }] = await sql`SELECT count(*)::int AS k FROM notifications
        WHERE tenant_id = ${tenantId} AND type = 'feed_silent' AND closed_at IS NULL AND ${f.id} = ANY(record_ids)`;
      if (!k) console.warn(`[FeedWatch] ${tenantId}: ${f.provider} silent ${f.days} days, alert filed for nobody (${owners.length} owner(s) refused)`);
      filed += k;
      console.log(`[FeedWatch] ${tenantId}: ${f.provider} silent ${f.days} days, ${k} owner(s) alerted`);
    }
    return filed;
  } catch (err: any) {
    console.warn(`[FeedWatch] ${tenantId}: sweep failed:`, err?.message);
    return 0;
  } finally {
    running.delete(tenantId);
  }
}
