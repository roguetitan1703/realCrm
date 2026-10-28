/**
 * How hard each portal connection actually pushes. Read only.
 *
 *   APP_ENV=development npx tsx backend/src/scripts/ingest-peaks.ts
 *   APP_ENV=production  npx tsx backend/src/scripts/ingest-peaks.ts      ← Om only
 *   … --days=60   to look further back (default 30)
 *
 * RUN IT against production before deploying or changing the /ingest limit
 * (INGEST_LIMITS in services/ingestion.ts). For every tenant and connection it
 * prints the busiest minute, hour and day over the window, measured as a
 * SLIDING window ending at each push — the same shape the limiter counts — so
 * the limit can be set with headroom above a real peak rather than a guess.
 * It also prints the busiest tenant-wide figures, in case several connections
 * of one firm burst together.
 *
 * Every push lands in webhook_inbox before anything else happens (accepted,
 * parsed or not, or held over the limit), so the table is the whole record of
 * what portals sent. Pushes refused with 401 (unknown key), and pushes dropped
 * past the day cap, are not there and do not count; the drops are listed at
 * the end from ingest_rejects, beside the held pushes still waiting.
 *
 * Imports no service except env.ts (which only reads .env files) and opens one
 * connection of its own, inside sql.begin('READ ONLY', …): Postgres refuses any
 * write. APP_ENV must be named; it never guesses which database.
 */
import postgres from 'postgres';
import { pgOptions } from '../services/pgOptions.js';

if (!['development', 'production'].includes(String(process.env.APP_ENV || ''))) {
  console.error('Set APP_ENV=development or APP_ENV=production.'); process.exit(1);
}
const { databaseUrl, appEnv } = await import('../services/env.js');

const arg = (k: string) => process.argv.find(a => a.startsWith(`--${k}=`))?.split('=')[1];
const days = Math.max(1, Math.min(365, Number(arg('days')) || 30));

const db = postgres(databaseUrl(), pgOptions(databaseUrl(), { max: 1, onnotice: () => {} }));

/** Sliding-window peaks, partitioned by `by` (a column list). */
const peaks = (tx: any, by: 'integration' | 'tenant') => {
  const part = by === 'integration' ? tx`i.tenant_id, i.integration_id` : tx`i.tenant_id`;
  return tx`
    WITH w AS (
      SELECT i.tenant_id, i.integration_id, i.received_at,
        count(*) OVER (PARTITION BY ${part} ORDER BY i.received_at RANGE BETWEEN interval '1 minute' PRECEDING AND CURRENT ROW) AS per_min,
        count(*) OVER (PARTITION BY ${part} ORDER BY i.received_at RANGE BETWEEN interval '1 hour'   PRECEDING AND CURRENT ROW) AS per_hour,
        count(*) OVER (PARTITION BY ${part} ORDER BY i.received_at RANGE BETWEEN interval '1 day'    PRECEDING AND CURRENT ROW) AS per_day
      FROM webhook_inbox i
      WHERE i.received_at > now() - make_interval(days => ${days})
    )
    SELECT t.slug,
      ${by === 'integration' ? tx`coalesce(g.provider, w.integration_id)` : tx`'(all connections)'`} AS connection,
      count(*)::int AS pushes,
      count(DISTINCT date_trunc('day', w.received_at))::int AS active_days,
      max(w.per_min)::int AS peak_min,
      max(w.per_hour)::int AS peak_hour,
      max(w.per_day)::int AS peak_day,
      max(w.received_at) AS last_push
    FROM w
    LEFT JOIN tenants t ON t.id = w.tenant_id
    ${by === 'integration' ? tx`LEFT JOIN integrations g ON g.id = w.integration_id` : tx``}
    GROUP BY t.slug, w.tenant_id ${by === 'integration' ? tx`, g.provider, w.integration_id` : tx``}
    ORDER BY peak_min DESC, peak_day DESC`;
};

async function main() {
  console.log(`${appEnv()}: pushes per connection over the last ${days} days (sliding windows).`);
  await db.begin('READ ONLY', async (tx: any) => {
    const perConn = await peaks(tx, 'integration');
    console.log('\nPer connection (the limit is per connection):');
    if (perConn.length) console.table(perConn.map((r: any) => ({ ...r, last_push: r.last_push?.toISOString?.() ?? r.last_push })));
    else console.log('  no pushes in the window');
    const perTenant = await peaks(tx, 'tenant');
    console.log('\nPer tenant, all connections together:');
    if (perTenant.length) console.table(perTenant.map((r: any) => ({ ...r, last_push: r.last_push?.toISOString?.() ?? r.last_push })));
    const top = (k: string) => Math.max(0, ...perConn.map((r: any) => r[k]));
    console.log(`\nHighest of any connection: ${top('peak_min')}/min, ${top('peak_hour')}/hour, ${top('peak_day')}/day.`);
    // After the limit ships: every dropped push is counted here, one row per
    // ip + key + day.
    const refused = await tx`
      SELECT received_at::date AS day, tenant_hint AS tenant, note, ip, count
        FROM ingest_rejects
       WHERE note LIKE 'rate limited%' AND received_at > now() - make_interval(days => ${days})
       ORDER BY received_at DESC`;
    console.log(`\nDropped by the rate limit in the window: ${refused.reduce((s: number, r: any) => s + Number(r.count || 0), 0)}`);
    if (refused.length) console.table(refused);
    // Held over the minute/hour limit and not processed yet (the connection's
    // Process button, or POST /api/v1/connections/<id>/replay).
    const held = await tx`
      SELECT t.slug, coalesce(g.provider, w.integration_id) AS connection,
             count(*)::int AS held_waiting, min(w.received_at) AS oldest
        FROM webhook_inbox w
        LEFT JOIN tenants t ON t.id = w.tenant_id
        LEFT JOIN integrations g ON g.id = w.integration_id
       WHERE w.status = 'held'
       GROUP BY t.slug, g.provider, w.integration_id
       ORDER BY held_waiting DESC`;
    console.log(`\nHeld over the limit, waiting to be processed: ${held.reduce((s: number, r: any) => s + r.held_waiting, 0)}`);
    if (held.length) console.table(held);
  });
  await db.end();
}

main().catch(async (e) => { console.error(e?.message || e); await db.end().catch(() => {}); process.exit(1); });
