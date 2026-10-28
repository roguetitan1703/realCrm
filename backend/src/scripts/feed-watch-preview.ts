/**
 * Which connections the feed watch WOULD alert on today, per tenant. Read only.
 *
 *   APP_ENV=development npx tsx backend/src/scripts/feed-watch-preview.ts
 *   APP_ENV=production  npx tsx backend/src/scripts/feed-watch-preview.ts      ← Om only
 *   … --tenant=bhumi,mahalaxmi   to name firms (default: every tenant)
 *
 * RUN IT against production, read-only, before deploying the API that carries
 * `feed_silent` (services/feedWatch.ts): the first sweep after the deploy
 * raises one alert per silent connection to each active owner, at the morning
 * hour. This lists exactly those connections, with the owners it would reach.
 *
 * It runs the sweep's own query (feedWatch.ts silentFeeds) inside
 * sql.begin('READ ONLY', …) on one connection of its own. Writes nothing:
 * Postgres refuses any write inside that transaction. APP_ENV must be named;
 * it never guesses which database.
 */
import postgres from 'postgres';
import { pgOptions } from '../services/pgOptions.js';

// Importing the services reaches store.ts, whose import starts the server's
// boot (initSchema and the one-time repairs) unless this is set first.
process.env.CRM_NO_BOOT = '1';
if (!['development', 'production'].includes(String(process.env.APP_ENV || ''))) {
  console.error('Set APP_ENV=development or APP_ENV=production.'); process.exit(1);
}
const { databaseUrl, appEnv } = await import('../services/env.js');
const { silentFeeds } = await import('../services/feedWatch.js');
const { FEED_SILENT } = await import('../services/notificationCatalogue.js');

const arg = (k: string) => process.argv.find(a => a.startsWith(`--${k}=`))?.split('=')[1];
const only = (arg('tenant') || '').split(',').filter(Boolean);

const db = postgres(databaseUrl(), pgOptions(databaseUrl(), { max: 1, onnotice: () => {} }));

async function main() {
  console.log(`${appEnv()}: active connection, no push for ${FEED_SILENT.silentDays} days, ≥${FEED_SILENT.minPushes} pushes in the ${FEED_SILENT.priorDays} days before its last.`);
  await db.begin('READ ONLY', async (tx: any) => {
    const tenants = only.length
      ? await tx`SELECT id, slug FROM tenants WHERE slug IN ${tx(only)} ORDER BY slug`
      : await tx`SELECT id, slug FROM tenants ORDER BY slug`;
    if (only.length && tenants.length !== only.length) console.warn(`Not found: ${only.filter(s => !tenants.some((t: any) => t.slug === s)).join(', ')}`);
    let total = 0;
    for (const t of tenants) {
      const [cfg] = await tx`SELECT value->>'timezone' AS tz FROM crm_settings WHERE key = 'default' AND tenant_id = ${t.id}`;
      const feeds = await silentFeeds(t.id, { db: tx, tz: cfg?.tz || 'Asia/Kolkata' });
      const [{ active }] = await tx`SELECT count(*)::int AS active FROM integrations WHERE tenant_id = ${t.id} AND active`;
      const owners = await tx`SELECT name FROM users WHERE tenant_id = ${t.id} AND role = 'owner' AND status ILIKE 'active' AND deleted_at IS NULL`;
      const raise = feeds.filter((f: any) => !f.open_alert);
      total += raise.length * owners.length;
      console.log(`\n${t.slug}: ${active} active connection(s), ${feeds.length} silent, ${raise.length} would alert → ${owners.length} owner(s)${owners.length ? ` (${owners.map((o: any) => o.name).join(', ')})` : ' — NOBODY, the alert would reach no one'}`);
      if (feeds.length) console.table(feeds.map((f: any) => ({
        connection: f.provider, last_push: f.last, days_silent: f.days, pushes_before: f.prior_pushes,
        already_alerted: f.open_alert,
      })));
    }
    console.log(`\nAlert rows the first sweep would write: ${total}.`);
  });
  await db.end();
  // The service imports start timers (queue, rate limits) that would hold the process open.
  process.exit(0);
}
main().catch(async (e) => { console.error(e?.message || e); await db.end(); process.exit(1); });
