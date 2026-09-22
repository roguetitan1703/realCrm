/**
 * ============================================================================
 * CONNECTION KEYS — can this server open them, and move them to its lock
 * ============================================================================
 * Checks every stored connection key against the secrets this server holds,
 * and says which lock each one is on. Never prints a key: tenant, portal, the
 * last four characters (already on screen in the app) and a status.
 *
 * With --apply it re-locks every key that opens under an OLDER secret onto
 * INGEST_KEY_SECRET. Only the stored copy changes. The hash every incoming
 * enquiry is matched on is not touched, so no portal notices and no portal has
 * to be told anything. Each re-locked key is proven to open and to hash to the
 * portal's key BEFORE it is written, and the write only lands if the row still
 * holds the value that was read.
 *
 * Run it ON THE SERVER, from the repo folder. The secrets that matter are the
 * ones the live API holds, and a laptop re-locking production keys under its
 * own secrets would lock the live server out of them. That is also why the
 * running API never re-locks anything by itself.
 *
 * When to run:
 *   • once, after INGEST_KEY_SECRET is first set                 → --apply
 *   • after changing INGEST_KEY_SECRET (old value in _PREVIOUS)  → --apply
 *   • whenever the boot log reports an older lock or UNREADABLE  → check
 *
 * Usage:
 *   npm run keys:check -- --env=production                          read-only report
 *   npm run keys:check -- --env=production --tenant=bhumi --apply   one firm first
 *   npm run keys:check -- --env=production --apply                  every firm
 * ============================================================================
 */
import postgres from 'postgres';

const arg = (k: string) => process.argv.find(a => a.startsWith(`--${k}=`))?.split('=')[1];
const env = String(arg('env') || '').toLowerCase();
if (env !== 'production' && env !== 'development') {
  console.error('\nRefusing to run without --env=production or --env=development.\n' +
    'Which database holds the keys is not something to infer.\n');
  process.exit(1);
}
// Set BEFORE the env module loads, so it reads `.env.<env>` and selects the
// right database. A static import would evaluate first and read neither.
process.env.APP_ENV = env;
const apply = process.argv.includes('--apply');
// One firm at a time is how this should first run against a live client:
// re-lock theirs, open one in the app, then do the rest.
const tenant = arg('tenant') || null;

const { databaseUrl, dbRef } = await import('../services/env');
const { keyState, lockKey, currentLock } = await import('../services/integrationKeys');

const url = databaseUrl();
const sql = postgres(url, { max: 1, ssl: 'require' });
const lock = currentLock();

console.log(`\n  ${env.toUpperCase()} · db ${dbRef(url)} · new keys lock with ${lock}${tenant ? ` · tenant ${tenant} only` : ''}\n`);

const rows = await sql`
  SELECT id, tenant_id, provider, api_key_enc, api_key_hash, api_key_last4, active
    FROM integrations ${tenant ? sql`WHERE tenant_id = ${tenant}` : sql``}
   ORDER BY tenant_id, created_at`;
if (tenant && !rows.length) { console.error(`  No connections for tenant "${tenant}".`); await sql.end(); process.exit(1); }

const label = (st: ReturnType<typeof keyState>) =>
  st.status === 'current' ? `ok      (${st.lock})`
    : st.status === 'old-lock' ? `OLD     (${st.lock})`
      : st.status === 'unreadable' ? 'UNREADABLE — no secret here opens it'
        : st.status === 'mismatch' ? `MISMATCH (${st.lock}) — not the key the portal sends`
          : 'no stored copy';

const tally: Record<string, number> = {};
for (const r of rows) {
  const st = keyState(r);
  tally[st.status] = (tally[st.status] || 0) + 1;
  console.log(`  ${String(r.tenant_id).padEnd(16)} ${String(r.provider).padEnd(18)} …${String(r.api_key_last4 || '????').padEnd(5)} ${r.active ? '' : '(inactive) '}${label(st)}`);
}
console.log(`\n  ${rows.length} keys: ${Object.entries(tally).map(([k, n]) => `${n} ${k}`).join(', ')}`);

if (!apply) {
  const old = tally['old-lock'] || 0;
  if (old && lock !== 'INGEST_KEY_SECRET') console.log('\n  Set INGEST_KEY_SECRET in .env, restart the API, then run again with --apply.');
  else if (old) console.log('\n  Run again with --apply to move them onto INGEST_KEY_SECRET.');
  await sql.end();
  process.exit((tally.unreadable || tally.mismatch) ? 2 : 0);
}

// Re-locking under JWT_SECRET would only re-create the coupling that broke
// these keys: the next JWT change would lock them out again.
if (lock !== 'INGEST_KEY_SECRET') {
  console.error('\n  Refusing --apply: INGEST_KEY_SECRET is not set. Keys must move to their own\n' +
    '  secret, not back onto JWT_SECRET. Add it to .env, restart the API, then run this.\n');
  await sql.end();
  process.exit(1);
}

let moved = 0, skipped = 0;
for (const r of rows) {
  const st = keyState(r);
  if (st.status !== 'old-lock') continue;
  const fresh = lockKey(st.plain);
  // Proven before it is written: opens on the new lock AND is the portal's key.
  const proof = keyState({ api_key_enc: fresh, api_key_hash: r.api_key_hash });
  if (proof.status !== 'current') { console.error(`  ✗ ${r.tenant_id}/${r.provider}: re-locked copy failed its own check (${proof.status}) — left as it was`); skipped++; continue; }
  const done = await sql`
    UPDATE integrations SET api_key_enc = ${fresh}
     WHERE id = ${r.id} AND tenant_id = ${r.tenant_id} AND api_key_enc = ${r.api_key_enc}
     RETURNING id`;
  if (done.length) { moved++; console.log(`  → ${r.tenant_id}/${r.provider} …${r.api_key_last4}: ${st.lock} → INGEST_KEY_SECRET`); }
  else { skipped++; console.log(`  – ${r.tenant_id}/${r.provider}: changed while this ran — left for the next run`); }
}

// Read back what is now stored, rather than reporting what we meant to write.
const after = await sql`SELECT api_key_enc, api_key_hash FROM integrations ${tenant ? sql`WHERE tenant_id = ${tenant}` : sql``}`;
const now: Record<string, number> = {};
for (const r of after) { const s = keyState(r).status; now[s] = (now[s] || 0) + 1; }
console.log(`\n  Re-locked ${moved}, skipped ${skipped}. Now: ${Object.entries(now).map(([k, n]) => `${n} ${k}`).join(', ')}\n`);
await sql.end();
process.exit((now.unreadable || now.mismatch) ? 2 : 0);
