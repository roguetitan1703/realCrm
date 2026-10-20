/**
 * ============================================================================
 * KEEPING VIEW LOGS 180 DAYS (docs/specs/listing-pages.md §A.6, data-lifecycle.md)
 * ============================================================================
 * Every open of a shared link or the catalogue writes a crm_share_events row,
 * and a browser that once gave a number keeps a crm_share_devices row. Both
 * grow with traffic, not with business. Om, 20 Oct: views older than 180 days
 * go, monthly.
 *
 * WHAT GOES:
 *   - views and expired views older than SHARE_VIEW_RETENTION_DAYS, unless the
 *     view is a lead's (lead_id set, or on a link bound to a lead) — that is
 *     the lead's "Opened 3×", its history;
 *   - device rows not seen for as long (attached that long ago and no event
 *     from that browser since). Its events keep their lead_id; only the
 *     browser-to-lead link for future opens goes.
 * WHAT STAYS: taps (interested, talk), enquiries, and every lead's views.
 *
 * ONCE A MONTH PER FIRM, decided by crm_job_runs, not by boot: a restart (and a
 * watcher restarts on every save) runs nothing if the firm ran this month. The
 * scheduled sweep calls it (notifications.ts), so CRM_NO_SWEEPS=1 stops it too.
 * Deletes in batches with a pause between them, so a first run over a year of
 * views does not hold the table.
 * ============================================================================
 */
import { sql } from './db.js';

export const SHARE_VIEW_RETENTION_DAYS = Math.max(Number(process.env.SHARE_VIEW_RETENTION_DAYS) || 180, 30);
const JOB = 'share_view_retention';
const EVERY_MS = 30 * 24 * 3600 * 1000;
const BATCH = 2000;
const PAUSE_MS = 250;
const CHECK_MS = 6 * 3600 * 1000;
let lastCheck = 0;

const pause = (ms: number) => new Promise(r => setTimeout(r, ms));

/** One firm's view logs past retention. Returns what went. */
export async function pruneShareViews(tenantId: string, days = SHARE_VIEW_RETENTION_DAYS): Promise<{ views: number; devices: number }> {
  const cutoff = new Date(Date.now() - days * 24 * 3600 * 1000);
  let views = 0;
  for (;;) {
    const gone = await sql`
      DELETE FROM crm_share_events WHERE id IN (
        SELECT e.id FROM crm_share_events e
         WHERE e.tenant_id = ${tenantId} AND e.kind IN ('view', 'expired_view') AND e.lead_id IS NULL
           AND coalesce(e.seen_at, e.created_at) < ${cutoff}
           AND NOT EXISTS (SELECT 1 FROM crm_share_links l
                            WHERE l.tenant_id = e.tenant_id AND l.id = e.link_id AND l.lead_id IS NOT NULL)
         LIMIT ${BATCH})
      RETURNING 1`;
    views += gone.length;
    if (gone.length < BATCH) break;
    await pause(PAUSE_MS);
  }
  const dev = await sql`
    DELETE FROM crm_share_devices d
     WHERE d.tenant_id = ${tenantId} AND d.attached_at < ${cutoff}
       AND NOT EXISTS (SELECT 1 FROM crm_share_events e
                        WHERE e.tenant_id = d.tenant_id AND e.device_id = d.device_id
                          AND coalesce(e.seen_at, e.created_at) >= ${cutoff})
    RETURNING 1`;
  return { views, devices: dev.length };
}

/**
 * The monthly run, every firm whose last run is a month old. Cheap to call
 * often: an in-process clock skips it for six hours, and the table decides
 * per firm. `onlySlug` runs one firm and ignores both clocks (a script).
 */
export async function runShareRetention({ onlySlug }: { onlySlug?: string } = {}): Promise<void> {
  if (!onlySlug) {
    if (Date.now() - lastCheck < CHECK_MS) return;
    lastCheck = Date.now();
  }
  const tenants = onlySlug
    ? await sql`SELECT id FROM tenants WHERE slug = ${onlySlug}`
    : await sql`
        SELECT t.id FROM tenants t
         WHERE NOT EXISTS (SELECT 1 FROM crm_job_runs r
                            WHERE r.job = ${JOB} AND r.tenant_id = t.id AND r.ran_at > ${new Date(Date.now() - EVERY_MS)})`;
  if (onlySlug && !tenants.length) throw new Error(`No tenant with slug "${onlySlug}".`);
  for (const { id } of tenants as any[]) {
    try {
      const out = await pruneShareViews(id);
      await sql`INSERT INTO crm_job_runs (job, tenant_id, ran_at, detail) VALUES (${JOB}, ${id}, NOW(), ${sql.json({ ...out, days: SHARE_VIEW_RETENTION_DAYS })})`;
      console.log(`[Retention] ${id}: ${out.views} view(s) and ${out.devices} device(s) older than ${SHARE_VIEW_RETENTION_DAYS} days deleted`);
    } catch (err: any) {
      console.warn(`[Retention] ${id}: failed:`, err?.message);
    }
    await pause(PAUSE_MS);
  }
}
