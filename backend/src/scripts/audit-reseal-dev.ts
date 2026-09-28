/**
 * ============================================================================
 * RE-SEAL THE DEVELOPMENT AUDIT LEDGER
 * ============================================================================
 * WHEN TO RUN THIS: the superadmin ledger on DEVELOPMENT says an entry was
 * deleted or changed, and you know why (a redaction, a reset, a manual clean).
 *
 *   npx tsx backend/src/scripts/audit-reseal-dev.ts            # which chains are broken
 *   npx tsx backend/src/scripts/audit-reseal-dev.ts --write    # re-seal them
 *
 * Checks every chain (each firm's, 'platform', and 'legacy'), and with --write
 * recomputes the broken ones from the rows that remain. It REFUSES unless the
 * database is development and not the project DATABASE_URL names: on
 * production a broken chain is evidence, and re-sealing it would destroy it.
 * ============================================================================
 */
process.env.APP_ENV = process.env.APP_ENV || 'development';
import postgres from 'postgres';
import { appEnv, databaseUrl, dbRef } from '../services/env.js';

const WRITE = process.argv.includes('--write');
if (appEnv() !== 'development') { console.error(`✗ APP_ENV is "${appEnv()}". Development only.`); process.exit(1); }
const url = databaseUrl();
if (!url) { console.error('✗ No database URL resolved.'); process.exit(1); }
if (process.env.DATABASE_URL && dbRef(url) === dbRef(process.env.DATABASE_URL)) {
  console.error(`✗ The development URL resolves to the production project (${dbRef(url)}). Refusing.`);
  process.exit(1);
}

const sql = postgres(url, { max: 1, ssl: 'require' });

async function main() {
  const { verifyChain } = await import('../services/audit.js');
  const { resealChain } = await import('./lib/audit-reseal.js');
  console.log(`→ development database ${dbRef(url)}`);
  const chains: string[] = ['legacy', ...(await sql`SELECT DISTINCT chain FROM audit_log WHERE chain IS NOT NULL ORDER BY 1`).map((r: any) => r.chain)];
  // A fresh look at each chain, not the saved verdict.
  await sql`DELETE FROM audit_checks`;
  for (const chain of chains) {
    const c = await verifyChain(chain);
    if (c.ok) { console.log(`  ${chain.padEnd(22)} ok (${c.checked} rows)`); continue }
    if (!WRITE) { console.log(`  ${chain.padEnd(22)} BROKEN at #${c.brokenAtSeq} (${c.reason})`); continue }
    const r = await resealChain(sql, chain);
    const again = await verifyChain(chain);
    console.log(`  ${chain.padEnd(22)} was broken at #${c.brokenAtSeq} (${c.reason}); re-sealed ${r.rewritten} of ${r.rows} rows; now ${again.ok ? 'ok' : 'STILL BROKEN'}`);
  }
  if (!WRITE) console.log('\nDry run. Add --write to re-seal the broken chains.');
}

main()
  .then(async () => { await sql.end(); process.exit(0); })
  .catch(async (e) => { console.error(e); await sql.end(); process.exit(1); });
