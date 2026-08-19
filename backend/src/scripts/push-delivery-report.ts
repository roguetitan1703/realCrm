/**
 * What the app actually delivered to devices, for ONE tenant. Read-only.
 *
 *   npx tsx src/scripts/push-delivery-report.ts --tenant=bhumi
 *   npx tsx src/scripts/push-delivery-report.ts --tenant=bhumi --since=2026-08-19
 *
 * RUN IT when someone says "my agents never got told". Until the delivery log
 * existed the only evidence a push had been sent was a row in `notifications`,
 * which records the FEED entry and knows nothing about devices — so the honest
 * answer to that question was "an alert was filed", and the cases that matter
 * most (recipient has no device, recipient is signed out) left no trace at all.
 *
 * `sent` means a push service ACCEPTED the message. `shown`/`opened` come back
 * from the device's own service worker and are the only proof a screen showed
 * it — a handset that is offline, frozen by battery optimisation or muted at OS
 * level looks identical to a success from the sending side.
 *
 * Two sections, and the first is the one that finds the problem: REACHABILITY
 * says who on the desk can be reached by a push right now. An agent with zero
 * devices receives nothing no matter how correct the alert is.
 *
 * Writes nothing. Safe on any tenant, including bhumi.
 */
import postgres from 'postgres';

const arg = (k: string, d?: string) =>
  process.argv.find(a => a.startsWith(`--${k}=`))?.split('=')[1] ?? d;

const slug = arg('tenant');
if (!slug) { console.error('Pass --tenant=<slug>.'); process.exit(1); }
const since = arg('since');

const sql = postgres(process.env.DATABASE_URL!, { max: 1, ssl: 'require' });

const pad = (v: any, n: number) => String(v ?? '').padEnd(n).slice(0, n);

async function main() {
  const [tenant] = await sql`SELECT id, slug, name FROM tenants WHERE slug = ${slug}`;
  if (!tenant) { console.error(`No tenant with slug "${slug}".`); process.exit(1); }
  const t = tenant.id;
  console.log(`\n${tenant.name} (${tenant.slug})\n`);

  // The log lands with a backend deploy (initSchema). Until then this script is
  // still useful for reachability, and must SAY the log is absent rather than
  // die on a missing column — "no rows" and "no table" are different answers
  // and only one of them means nothing was delivered.
  const [{ has_log }] = await sql`SELECT to_regclass('public.push_deliveries') IS NOT NULL AS has_log`;
  const [{ has_col }] = await sql`
    SELECT EXISTS (SELECT 1 FROM information_schema.columns
      WHERE table_name = 'push_subscriptions' AND column_name = 'last_success_at') AS has_col`;
  if (!has_log) console.log('  NOTE: push_deliveries does not exist yet — this backend predates the delivery log.');

  console.log('REACHABILITY — who a push can arrive for at all');
  console.log(`  ${pad('who', 24)}${pad('role', 9)}${pad('devices', 9)}${pad('signed in', 11)}last reached`);
  const ready = await sql`
    SELECT u.id, u.name, u.role,
      (SELECT count(*)::int FROM push_subscriptions p WHERE p.user_id = u.id AND p.tenant_id = ${t}) AS devices,
      (SELECT count(*)::int FROM sessions s WHERE s.user_id = u.id AND s.revoked = FALSE AND s.expires_at > NOW()) AS live,
      ${has_col
        ? sql`(SELECT max(p.last_success_at) FROM push_subscriptions p WHERE p.user_id = u.id AND p.tenant_id = ${t})`
        : sql`NULL::timestamptz`} AS last_ok
    FROM users u WHERE u.tenant_id = ${t} AND u.status ILIKE 'active'
    ORDER BY u.role, u.name`;
  for (const u of ready) {
    console.log(`  ${pad(u.name || u.id, 24)}${pad(u.role, 9)}${pad(u.devices, 9)}${pad(u.live, 11)}` +
      (u.last_ok ? u.last_ok.toISOString() : (has_col && u.devices) ? 'never' : '—'));
  }
  const unreachable = ready.filter((u: any) => !u.devices);
  console.log(`\n  ${unreachable.length} of ${ready.length} active people have no device opted in` +
    (unreachable.length ? `: ${unreachable.map((u: any) => u.name).join(', ')}` : ''));

  if (!has_log) { console.log(''); return; }
  console.log('\nDELIVERIES' + (since ? ` since ${since}` : ' (last 200)'));
  const rows = await sql`
    SELECT d.created_at, d.type, d.status, d.status_code, d.displayed_at, d.clicked_at, u.name AS who
    FROM push_deliveries d LEFT JOIN users u ON u.id = d.user_id
    WHERE d.tenant_id = ${t} ${since ? sql`AND d.created_at >= ${since}::timestamptz` : sql``}
    ORDER BY d.created_at DESC LIMIT 200`;
  if (!rows.length) {
    console.log('  Nothing logged. Either no alert has fired since the log was deployed, or this');
    console.log('  backend is running a build from before it existed.');
  }
  for (const r of rows) {
    const seen = r.clicked_at ? 'opened' : r.displayed_at ? 'shown' : '';
    console.log(`  ${r.created_at.toISOString()}  ${pad(r.type, 26)}${pad(r.who, 22)}${pad(r.status, 12)}${pad(seen, 8)}${r.status_code ?? ''}`);
  }

  const tally = await sql`
    SELECT status, count(*)::int AS n FROM push_deliveries
    WHERE tenant_id = ${t} ${since ? sql`AND created_at >= ${since}::timestamptz` : sql``}
    GROUP BY status ORDER BY n DESC`;
  if (tally.length) {
    console.log('\n  ' + tally.map((r: any) => `${r.status}: ${r.n}`).join('   '));
  }
  console.log('');
}

main().then(() => sql.end()).catch(async (e) => { console.error(e); await sql.end(); process.exit(1); });
