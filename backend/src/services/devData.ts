/**
 * ============================================================================
 * DEVELOPMENT DATA THAT NEVER LOOKS STALE
 * ============================================================================
 * Synthetic firms are seeded once, relative to the moment they were seeded.
 * A week later every follow-up is a week overdue, nothing is due today, and
 * Today, Team today and every "this week" number describe a desk nobody has
 * worked for days. Reseeding fixes the dates and breaks everything else: ids,
 * logins, the smoke tests' fixtures, anything someone was looking at.
 *
 * So the dates move instead. Every date a synthetic firm holds goes forward by
 * the same whole number of calendar days, the gap between the day its data was
 * last anchored to and today. A call made at 4 pm is still at 4 pm, an
 * overdue follow-up is still overdue by the same amount, and "due today" is
 * today again.
 *
 * WHICH FIRMS. Only those a seeder made, recorded in `dev_synthetic_tenants`
 * (the dev seeders and `npm run setup:local` write the row; firms built by
 * seed-demo-tenant are recognised by its own marker and adopted). Never a
 * paying firm, by slug, even on a development database. Never outside
 * APP_ENV=development, except shiftTenantDates itself, which seed-demo-tenant
 * runs on its own demo firm wherever that lives.
 * ============================================================================
 */
import { appEnv } from './env';

type Sql = any;

/** Paying firms. Nothing here moves their dates on any database. */
export const PAYING_TENANTS = new Set(['bhumi', 'mahalaxmi']);

const MARKERS = 'dev_synthetic_tenants';
const DEFAULT_TZ = 'Asia/Kolkata';

// Tables whose times are not the firm's story: credentials, sessions, the
// audit chain (hashed over its timestamps), schedulers' bookkeeping, rate
// counters, configuration. Moving them would extend lockouts and sessions,
// break the audit chain's hashes, or hide a job run.
const SKIP_TABLES = new Set([
  'tenants', 'users', 'sessions', 'auth_otp', 'password_resets', 'superadmins',
  'audit_log', 'audit_checks', 'schema_migrations', 'push_subscriptions', 'push_gone_endpoints',
  'crm_job_runs', 'crm_public_form_days', 'crm_settings', 'crm_routing_rules', MARKERS,
]);
// A claim on an inbox row is a lock, not a fact about the past.
const SKIP_COLUMNS = new Set(['claimed_at', 'locked_until']);
// Things that happened. Shifted forward, one that lands after now goes back a
// day: data made this afternoon, moved forward a day, would otherwise be
// tomorrow's history when the refresh runs in the morning.
const HISTORY: [string, string][] = [
  ['crm_timeline_events', 'timestamp'], ['activities', 'at'], ['activities', 'created_at'],
  ['crm_leads', 'created_at'], ['crm_leads', 'updated_at'], ['crm_owners', 'created_at'], ['crm_owners', 'updated_at'],
  ['crm_owners', 'last_call_at'], ['crm_properties', 'created_at'], ['crm_properties', 'updated_at'],
  ['crm_lead_enquiries', 'first_at'], ['crm_lead_enquiries', 'last_at'], ['crm_lead_enquiries', 'created_at'],
  ['notifications', 'created_at'], ['webhook_inbox', 'received_at'],
];
const ISO = 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"';

function refusePaying(tenantId: string) {
  if (PAYING_TENANTS.has(String(tenantId).toLowerCase())) {
    throw new Error(`Refusing: "${tenantId}" is a paying firm. Its dates are never moved, on any database.`);
  }
}

/**
 * Move every date a firm holds forward by `days` calendar days.
 * Returns rows changed per table. Runs inside whatever transaction `sql` is.
 */
export async function shiftTenantDates(sql: Sql, tenantId: string, days: number): Promise<Record<string, number>> {
  refusePaying(tenantId);
  if (!Number.isInteger(days) || days < 1) return {};
  const cols: { table_name: string; column_name: string; data_type: string }[] = await sql`
    SELECT c.table_name, c.column_name, c.data_type
      FROM information_schema.columns c
      JOIN information_schema.tables t ON t.table_schema = c.table_schema AND t.table_name = c.table_name AND t.table_type = 'BASE TABLE'
     WHERE c.table_schema = 'public'
       AND c.data_type IN ('timestamp with time zone', 'timestamp without time zone', 'date')
       AND EXISTS (SELECT 1 FROM information_schema.columns k
                    WHERE k.table_schema = 'public' AND k.table_name = c.table_name AND k.column_name = 'tenant_id')
     ORDER BY c.table_name, c.column_name`;
  const byTable = new Map<string, typeof cols>();
  for (const c of cols) {
    if (SKIP_TABLES.has(c.table_name) || SKIP_COLUMNS.has(c.column_name)) continue;
    byTable.set(c.table_name, [...(byTable.get(c.table_name) || []), c]);
  }
  // A unique index can include a date (crm_share_events: one view per device
  // per day). Moving every row by N in one statement can land a row on a value
  // another row has not left yet, so dates go out far and come back.
  const PARK = 100000;
  const counts: Record<string, number> = {};
  for (const [table, set] of byTable) {
    const parts = set.map(c => c.data_type === 'date'
      ? sql`${sql(c.column_name)} = ${sql(c.column_name)} + ${days + PARK}::int`
      : sql`${sql(c.column_name)} = ${sql(c.column_name)} + make_interval(days => ${days})`);
    const clause = parts.reduce((a: any, p: any) => sql`${a}, ${p}`);
    const r = await sql`UPDATE ${sql(table)} SET ${clause} WHERE tenant_id = ${tenantId}`;
    const dates = set.filter(c => c.data_type === 'date');
    if (dates.length) {
      const back = dates.map(c => sql`${sql(c.column_name)} = ${sql(c.column_name)} - ${PARK}::int`).reduce((a: any, p: any) => sql`${a}, ${p}`);
      await sql`UPDATE ${sql(table)} SET ${back} WHERE tenant_id = ${tenantId}`;
    }
    if (r.count) counts[table] = r.count;
  }

  // Dates kept as text. A follow-up's `at` is the real instant; an alert's
  // `subject_at` is a copy of it, compared as a string, so both are rewritten
  // with the one format and stay equal.
  const fu = await sql`
    UPDATE crm_leads SET follow_up = jsonb_set(follow_up, '{at}', to_jsonb(to_char(((follow_up->>'at')::timestamptz + make_interval(days => ${days})) AT TIME ZONE 'UTC', ${ISO})))
     WHERE tenant_id = ${tenantId} AND follow_up->>'at' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T'`;
  await sql`
    UPDATE crm_leads SET follow_up = jsonb_set(follow_up, '{date}', to_jsonb(to_char((follow_up->>'date')::date + ${days}::int, 'YYYY-MM-DD')))
     WHERE tenant_id = ${tenantId} AND follow_up->>'date' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'`;
  if (fu.count) counts['crm_leads.follow_up'] = fu.count;
  await sql`
    UPDATE notifications SET subject_at = to_char((subject_at::timestamptz + make_interval(days => ${days})) AT TIME ZONE 'UTC', ${ISO})
     WHERE tenant_id = ${tenantId} AND subject_at ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T'`;

  let stepped = 0;
  for (const [t, c] of HISTORY) {
    if (!byTable.get(t)?.some(x => x.column_name === c)) continue;
    const r = await sql`UPDATE ${sql(t)} SET ${sql(c)} = ${sql(c)} - interval '1 day' WHERE tenant_id = ${tenantId} AND ${sql(c)} > now()`;
    stepped += r.count;
  }
  if (stepped) counts['history stepped back to before now'] = stepped;

  // The two records of which day this firm's data is anchored to move with it,
  // so neither path (this one, or seed-demo-tenant --refresh) moves it twice.
  await sql`
    UPDATE tenants SET brand_config = jsonb_set(brand_config, '{demo,anchor}',
           to_jsonb(to_char(((brand_config->'demo'->>'anchor')::timestamptz + make_interval(days => ${days})) AT TIME ZONE 'UTC', ${ISO})))
     WHERE id = ${tenantId} AND brand_config->'demo'->>'anchor' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T'`;
  const [{ has }] = await sql`SELECT to_regclass(${'public.' + MARKERS}) IS NOT NULL AS has`;
  if (has) await sql`UPDATE ${sql(MARKERS)} SET refreshed_on = refreshed_on + ${days}::int, refreshed_at = now() WHERE tenant_id = ${tenantId}`;
  return counts;
}

/** initSchema calls this on a development database only. */
export async function ensureDevDataTable(sql: Sql): Promise<void> {
  // Asked first: CREATE ... IF NOT EXISTS on an existing table raises a NOTICE,
  // which a seeder's connection prints as a ten-line object on every run.
  const [{ has }] = await sql`SELECT to_regclass('public.dev_synthetic_tenants') IS NOT NULL AS has`;
  if (has) return;
  await sql`
    CREATE TABLE IF NOT EXISTS dev_synthetic_tenants (
      tenant_id TEXT PRIMARY KEY,
      seeded_by TEXT NOT NULL,
      refreshed_on DATE NOT NULL,
      refreshed_at TIMESTAMPTZ DEFAULT NOW(),
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`;
}

const firmToday = (sql: Sql, tenantId: string) => sql`(now() AT TIME ZONE coalesce(
  (SELECT nullif(value->>'timezone', '') FROM crm_settings WHERE tenant_id = ${tenantId} AND key = 'default' LIMIT 1), ${DEFAULT_TZ}))::date`;

function requireDevelopment(what: string) {
  if (appEnv() !== 'development') throw new Error(`${what} runs on a development database only (APP_ENV is "${appEnv()}").`);
}

/**
 * A seeder's first call, before it writes: record the firm as synthetic, or,
 * when it already is, bring its existing data up to today first, so what the
 * seeder writes now is not moved forward again on the next refresh.
 */
export async function adoptSynthetic(sql: Sql, tenantId: string, seededBy: string): Promise<void> {
  requireDevelopment('Marking a firm synthetic');
  refusePaying(tenantId);
  await ensureDevDataTable(sql);
  await sql`INSERT INTO dev_synthetic_tenants (tenant_id, seeded_by, refreshed_on)
            VALUES (${tenantId}, ${seededBy}, ${firmToday(sql, tenantId)})
            ON CONFLICT (tenant_id) DO NOTHING`;
  await refreshDevData(sql, { only: tenantId });
}

/**
 * Bring every synthetic firm up to today. Cheap when there is nothing to do
 * (one read), so the server calls it at boot and then on a slow clock to catch
 * the day's turn. Each firm moves in its own transaction holding its marker
 * row, so two backends on one database cannot both move it.
 */
export async function refreshDevData(sql: Sql, opts: { only?: string; log?: (s: string) => void } = {}): Promise<{ tenant: string; days: number; counts: Record<string, number> }[]> {
  requireDevelopment('The development data refresh');
  const log = opts.log || ((s: string) => console.log(s));
  await ensureDevDataTable(sql);
  // Firms seed-demo-tenant built carry its marker and the moment they were
  // built; adopt them at that day.
  await sql`
    INSERT INTO dev_synthetic_tenants (tenant_id, seeded_by, refreshed_on)
    SELECT t.id, 'seed-demo-tenant', ((t.brand_config->'demo'->>'anchor')::timestamptz AT TIME ZONE ${DEFAULT_TZ})::date
      FROM tenants t
     WHERE t.brand_config->'demo'->>'generator' = 'seed-demo-tenant'
       AND t.brand_config->'demo'->>'anchor' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T'
    ON CONFLICT (tenant_id) DO NOTHING`;
  const marked: { tenant_id: string }[] = await sql`
    SELECT tenant_id FROM dev_synthetic_tenants ${opts.only ? sql`WHERE tenant_id = ${opts.only}` : sql``} ORDER BY tenant_id`;
  const out: { tenant: string; days: number; counts: Record<string, number> }[] = [];
  for (const { tenant_id } of marked) {
    if (PAYING_TENANTS.has(tenant_id.toLowerCase())) { log(`[Dev data] ✗ ${tenant_id} is a paying firm; marked synthetic by mistake, never moved.`); continue; }
    const done = await sql.begin(async (tx: Sql) => {
      const [m] = await tx`
        SELECT (${firmToday(tx, tenant_id)} - refreshed_on)::int AS gap
          FROM dev_synthetic_tenants WHERE tenant_id = ${tenant_id} FOR UPDATE`;
      if (!m || m.gap < 1) return null;
      const counts = await shiftTenantDates(tx, tenant_id, m.gap);
      return { tenant: tenant_id, days: m.gap as number, counts };
    });
    if (!done) continue;
    out.push(done);
    const total = Object.entries(done.counts).filter(([k]) => !k.startsWith('history')).reduce((s, [, n]) => s + n, 0);
    log(`[Dev data] ${done.tenant} moved forward ${done.days} day${done.days === 1 ? '' : 's'}: ${total} rows`
      + ` (${Object.entries(done.counts).map(([k, n]) => `${k} ${n}`).join(', ') || 'nothing dated'})`);
  }
  return out;
}

/**
 * The server's half: once when the schema is ready, then every ten minutes,
 * which is how the day's turn is noticed while it runs. Development only.
 */
export function startDevRefresh(sql: Sql, ready: Promise<unknown>): void {
  if (appEnv() !== 'development') return;
  const run = () => refreshDevData(sql).catch((e: any) => console.warn('[Dev data] refresh failed:', e?.message));
  ready.then(async () => {
    const moved = await run();
    if (Array.isArray(moved) && !moved.length) console.log('[Dev data] synthetic firms are dated today; nothing to move');
    setInterval(run, 10 * 60 * 1000).unref?.();
  });
}
