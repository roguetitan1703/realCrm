/**
 * What the alert lifecycle's first run WILL close, per tenant, before it runs.
 *
 *   npx tsx src/scripts/alert-first-run-preview.ts --tenant=bhumi,mahalaxmi
 *
 * RUN IT before deploying the API that carries `2026_10_12_alert_lifecycle_first_run`
 * (docs/specs/notifications.md §10), against the database it will run on. It
 * copies each tenant's alerts into a TEMP table and runs the real first-run
 * code (alertLifecycle.ts backfillAlertRecords + closeSettled) against the copy.
 *
 * Writes nothing. The copy is made, then the transaction is switched to READ
 * ONLY — Postgres then refuses any write to a real table, so a slip in the code
 * under test cannot reach `notifications` — and the transaction is rolled back.
 * Uses DATABASE_URL (production) unless APP_ENV=development.
 */
import postgres from 'postgres';
import { pgOptions } from '../services/pgOptions.js';

// Importing the services reaches store.ts, whose import starts the server's
// boot (initSchema and the one-time repairs) unless this is set. Run as a
// static import, this preview began migrating production on 27 Oct. Set
// before the dynamic imports below, which is the only order that works.
process.env.CRM_NO_BOOT = '1';
const { databaseUrl } = await import('../services/env.js');
const { backfillAlertRecords, closeSettled, expireRecordless } = await import('../services/alertLifecycle.js');

const arg = (k: string) => process.argv.find(a => a.startsWith(`--${k}=`))?.split('=')[1];
const tenants = (arg('tenant') || '').split(',').filter(Boolean);
if (!tenants.length) { console.error('Pass --tenant=<slug>[,<slug>].'); process.exit(1); }

const db = postgres(databaseUrl(), pgOptions(databaseUrl(), { max: 1, onnotice: () => {} }));
const TABLE = 'alert_preview';

async function main() {
  for (const slug of tenants) {
    const [t] = await db`SELECT id FROM tenants WHERE slug = ${slug}`;
    if (!t) { console.error(`No tenant "${slug}".`); continue; }
    await db.begin(async (tx: any) => {
      await tx`CREATE TEMP TABLE ${tx(TABLE)} ON COMMIT DROP AS SELECT * FROM notifications WHERE tenant_id = ${t.id}`;
      // The columns the deploy adds, if this database does not have them yet.
      for (const [c, type] of [['record_kind', 'TEXT'], ['record_ids', 'TEXT[]'], ['subject_at', 'TEXT'],
        ['closed_at', 'TIMESTAMPTZ'], ['close_reason', 'TEXT'], ['read_at', 'TIMESTAMPTZ']]) {
        await tx.unsafe(`ALTER TABLE ${TABLE} ADD COLUMN IF NOT EXISTS ${c} ${type}`);
      }
      // Tables the release creates that the close rules read (share_work).
      // They are empty on the day it ships, so an empty TEMP copy (searched
      // before public, dropped with the transaction) gives the exact answer.
      const [{ links }] = await tx`SELECT to_regclass('public.crm_share_links') IS NOT NULL AS links`;
      if (!links) {
        await tx.unsafe(`CREATE TEMP TABLE crm_share_links (id TEXT, tenant_id TEXT, lead_id TEXT, created_by TEXT,
          property_ids TEXT[], created_at TIMESTAMPTZ) ON COMMIT DROP`);
        await tx.unsafe(`CREATE TEMP TABLE crm_share_events (id TEXT, tenant_id TEXT, lead_id TEXT, link_id TEXT,
          property_id TEXT) ON COMMIT DROP`);
      }
      await tx`SET LOCAL transaction_read_only = on`;
      const before = await tx`SELECT count(*)::int AS n FROM ${tx(TABLE)} WHERE closed_at IS NULL`;
      const filled = await backfillAlertRecords(TABLE, t.id, tx);
      const closed = await closeSettled(t.id, { table: TABLE, db: tx }) + await expireRecordless(TABLE, t.id, tx);
      const byType = await tx`
        SELECT type, count(*)::int AS total,
               count(*) FILTER (WHERE close_reason = 'done')::int AS done,
               count(*) FILTER (WHERE close_reason = 'not_yours')::int AS not_yours,
               count(*) FILTER (WHERE close_reason = 'opened')::int AS opened,
               count(*) FILTER (WHERE close_reason = 'superseded')::int AS superseded,
               count(*) FILTER (WHERE close_reason = 'expired')::int AS expired,
               count(*) FILTER (WHERE closed_at IS NULL)::int AS stays_open
          FROM ${tx(TABLE)} GROUP BY type ORDER BY total DESC`;
      const perUser = await tx`
        SELECT coalesce(u.name, n.user_id) AS who,
               count(*) FILTER (WHERE n.read = FALSE)::int AS unread_today,
               count(*) FILTER (WHERE n.read = FALSE AND n.closed_at IS NULL)::int AS unread_after
          FROM ${tx(TABLE)} n LEFT JOIN users u ON u.id = n.user_id
         GROUP BY 1 HAVING count(*) FILTER (WHERE n.read = FALSE) > 0 ORDER BY 2 DESC`;
      console.log(`\n${slug}: ${before[0].n} open before; ${filled} given their records; ${closed} would close.`);
      console.table(byType);
      console.log('Bell count per person, today → after:');
      console.table(perUser);
      throw new Error('ROLLBACK');
    }).catch((e: any) => { if (e?.message !== 'ROLLBACK') throw e; });
  }
  await db.end();
  process.exit(0);
}
main().catch(async (e) => { console.error(e?.message || e); await db.end(); process.exit(1); });
