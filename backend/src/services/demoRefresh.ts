/**
 * ============================================================================
 * PRODUCTION DEMO FIRMS THAT NEVER LOOK STALE
 * ============================================================================
 * The firms we pitch from were seeded once and then sat still, so a week later
 * every follow-up was a week overdue and nothing was due today. Each morning
 * their dates move forward by the whole days since they were last anchored,
 * through the same shiftTenantDates() that keeps development's synthetic firms
 * current (services/devData.ts).
 *
 * WHICH FIRMS. Exactly the slugs in DEMO_FIRMS, written here in code. Not a
 * flag in the data, which a write could flip on a real firm. A paying firm is
 * refused by slug and by id even if someone adds it to the list, and
 * shiftTenantDates refuses it again. A slug missing on a database is skipped.
 *
 * THE LEDGER. `demo_refresh_tenants` holds, per firm, the day its data is
 * anchored to. Every run moves the firm by (today in its timezone - that day)
 * under a row lock, and shiftTenantDates moves the ledger with the data, so
 * any path that moves a firm (this one, the dev refresh, seed-demo-tenant
 * --refresh) is seen by the others.
 *
 * FIRST RUN, no ledger row: the anchor is the seeded data's own "today":
 * seed-demo-tenant's anchor (brand_config.demo.anchor) when the firm has one,
 * else the day of its newest lead, capped at today. Not the newest activity or
 * event: people click around in a demo, which is what it is for, and one click
 * this morning would pin the anchor to today and move nothing. What they did
 * after the anchor moves forward with the rest, and shiftTenantDates puts
 * anything that lands after now back under now.
 *
 * EVERY dated column moves, links' expiry included: a share link keeps its
 * remaining life, and one that expired inside the first move comes back.
 * Deliberate, for demo data; do not exempt it.
 *
 * A move longer than MAX_MOVE_DAYS is refused and the firm skipped, so a bad
 * anchor cannot throw a firm years forward.
 * ============================================================================
 */
import { appEnv } from './env';
import { PAYING_TENANTS, DEMO_LEDGER, shiftTenantDates, firmZone, firmToday, refreshDevData } from './devData';

type Sql = any;

/** The demo firms whose dates move. The only list; nothing else ever runs. */
export const DEMO_FIRMS: readonly string[] = Object.freeze(['demo-vadodara', 'urban', 'raipur']);
/** The longest single move. Anything longer is a wrong anchor, not a stale firm. */
export const MAX_MOVE_DAYS = 120;

/** initSchema calls this on every database. */
export async function ensureDemoLedger(sql: Sql): Promise<void> {
  // Asked first: CREATE ... IF NOT EXISTS on an existing table raises a NOTICE.
  const [{ has }] = await sql`SELECT to_regclass(${'public.' + DEMO_LEDGER}) IS NOT NULL AS has`;
  if (has) return;
  await sql`
    CREATE TABLE IF NOT EXISTS demo_refresh_tenants (
      tenant_id TEXT PRIMARY KEY,
      slug TEXT NOT NULL,
      first_anchor DATE NOT NULL,
      refreshed_on DATE NOT NULL,
      refreshed_at TIMESTAMPTZ DEFAULT NOW(),
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`;
}

const isPaying = (s: string) => PAYING_TENANTS.has(String(s).toLowerCase());
const missingSaid = new Set<string>();
const refusedSaid = new Set<string>();
const failedSaid = new Set<string>();
class TooFar extends Error { constructor(public days: number, public anchor?: string) { super('too far'); } }

export type DemoMove = { slug: string; tenant: string; days: number; anchoredFrom?: string; counts: Record<string, number> };

/**
 * Bring each demo firm up to today, one at a time. One read per firm when
 * there is nothing to do. `slugs` replaces the list on a development database
 * only, for tests; paying firms are refused either way.
 */
export async function refreshDemoFirms(sql: Sql, opts: { slugs?: readonly string[]; log?: (s: string) => void } = {}): Promise<DemoMove[]> {
  const log = opts.log || ((s: string) => console.log(s));
  if (opts.slugs && appEnv() !== 'development') throw new Error('The demo list is replaced on a development database only.');
  const slugs = opts.slugs || DEMO_FIRMS;
  await ensureDemoLedger(sql);
  const out: DemoMove[] = [];
  for (const slug of slugs) {
    // One firm failing (a bad timezone in its settings, say) must not stop the
    // ones after it; said once per firm per process, not every ten minutes.
    try {
      if (isPaying(slug)) { log(`[Demo dates] ✗ ${slug} is a paying firm; never moved.`); continue; }
      const [t] = await sql`SELECT id, slug FROM tenants WHERE slug = ${slug} LIMIT 1`;
      if (!t) {
        if (!missingSaid.has(slug)) log(`[Demo dates] ${slug} is not on this database; skipped.`);
        missingSaid.add(slug);
        continue;
      }
      if (isPaying(t.id)) { log(`[Demo dates] ✗ ${slug} is the paying firm ${t.id}; never moved.`); continue; }
      const tid: string = t.id;
      const [due] = await sql`SELECT (${firmToday(sql, tid)} - refreshed_on)::int AS gap FROM demo_refresh_tenants WHERE tenant_id = ${tid}`;
      if (due && due.gap < 1) continue;

      let done: DemoMove | null;
      try {
        done = await sql.begin(async (tx: Sql) => {
          // Lock order matches refreshDevData (its marker row, then this ledger
          // through shiftTenantDates), so a dev refresh in another process waits
          // here instead of both moving the firm.
          const [{ dev }] = await tx`SELECT to_regclass('public.dev_synthetic_tenants') IS NOT NULL AS dev`;
          if (dev) await tx`SELECT 1 FROM dev_synthetic_tenants WHERE tenant_id = ${tid} FOR UPDATE`;
          const zone = firmZone(tx, tid);
          const ins = await tx`
            INSERT INTO demo_refresh_tenants (tenant_id, slug, first_anchor, refreshed_on)
            SELECT ${tid}, ${slug}, d, d FROM (
              SELECT least(${firmToday(tx, tid)}, coalesce((coalesce(
                (SELECT CASE WHEN brand_config->'demo'->>'anchor' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T'
                             THEN (brand_config->'demo'->>'anchor')::timestamptz END FROM tenants WHERE id = ${tid}),
                (SELECT max(created_at) FROM crm_leads WHERE tenant_id = ${tid} AND created_at <= now())
              ) AT TIME ZONE ${zone})::date, ${firmToday(tx, tid)})) AS d
            ) a
            ON CONFLICT (tenant_id) DO NOTHING
            RETURNING to_char(first_anchor, 'YYYY-MM-DD') AS anchor`;
          const [m] = await tx`
            SELECT (${firmToday(tx, tid)} - refreshed_on)::int AS gap
              FROM demo_refresh_tenants WHERE tenant_id = ${tid} FOR UPDATE`;
          const anchoredFrom = ins[0]?.anchor as string | undefined;
          if (!m || m.gap < 1) return anchoredFrom ? { slug, tenant: tid, days: 0, anchoredFrom, counts: {} } : null;
          // Thrown, so a first run's ledger row goes too and a corrected anchor can be tried.
          if (m.gap > MAX_MOVE_DAYS) throw new TooFar(m.gap, anchoredFrom);
          const counts = await shiftTenantDates(tx, tid, m.gap);
          return { slug, tenant: tid, days: m.gap as number, anchoredFrom, counts };
        });
      } catch (e: any) {
        if (!(e instanceof TooFar)) throw e;
        if (!refusedSaid.has(slug)) log(`[Demo dates] ✗ ${slug} would move ${e.days} days${e.anchor ? ` (from ${e.anchor})` : ''}, over ${MAX_MOVE_DAYS}; skipped, nothing moved.`);
        refusedSaid.add(slug);
        continue;
      }
      if (!done) continue;
      out.push(done);
      const first = done.anchoredFrom ? ` (first run, anchored to ${done.anchoredFrom})` : '';
      if (!done.days) { log(`[Demo dates] ${slug}${first}: already dated today`); continue; }
      const total = Object.entries(done.counts).filter(([k]) => !k.startsWith('history')).reduce((s, [, n]) => s + n, 0);
      log(`[Demo dates] ${slug} moved forward ${done.days} day${done.days === 1 ? '' : 's'}${first}: ${total} rows`
        + ` (${Object.entries(done.counts).map(([k, n]) => `${k} ${n}`).join(', ') || 'nothing dated'})`);
      failedSaid.delete(slug);
    } catch (e: any) {
      if (!failedSaid.has(slug)) log(`[Demo dates] ✗ ${slug} failed, skipped: ${e?.message}`);
      failedSaid.add(slug);
    }
  }
  return out;
}

/**
 * The server's half: once when the schema is ready, then every ten minutes,
 * which is how the day's turn is noticed. Development's synthetic firms first
 * (development only), then the demo firms (every database), one after the
 * other in this process, never overlapping.
 */
export function startDateRefresh(sql: Sql, ready: Promise<unknown>): void {
  let running = false;
  const run = async (boot = false) => {
    if (running) return;
    running = true;
    try {
      if (appEnv() === 'development') {
        const moved = await refreshDevData(sql).catch((e: any) => { console.warn('[Dev data] refresh failed:', e?.message); return null; });
        if (boot && Array.isArray(moved) && !moved.length) console.log('[Dev data] synthetic firms are dated today; nothing to move');
      }
      const demo = await refreshDemoFirms(sql).catch((e: any) => { console.warn('[Demo dates] refresh failed:', e?.message); return null; });
      if (boot && Array.isArray(demo) && !demo.length) console.log('[Demo dates] demo firms are dated today; nothing to move');
    } finally { running = false; }
  };
  ready.then(async () => {
    await run(true);
    setInterval(() => { run(); }, 10 * 60 * 1000).unref?.();
  });
}
