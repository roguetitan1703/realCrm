/**
 * RE-SEAL AN AUDIT CHAIN — DEVELOPMENT DATABASES ONLY
 *
 * Recomputes every row's prev_hash and hash in one chain, in order, from the
 * rows that are there now, and forgets the chain's saved check. After it, the
 * chain verifies again.
 *
 * That is exactly what the ledger exists to make impossible to do quietly, so
 * this never runs against production: callers pass their own development
 * connection, already refused if it names the production project. It exists
 * because development deliberately deletes audit rows (redacting the `delpat`
 * demo, resetting the tutorial firm), and every deletion leaves a chain that
 * reports "an entry was deleted" for ever. True, and useless on a test desk.
 *
 * `chain`: a firm id, 'platform', or 'legacy' (rows from before per-firm chains).
 */
import { rowHash } from '../../services/audit.js';

export async function resealChain(sql: any, chain: string): Promise<{ rows: number; rewritten: number }> {
  const where = chain === 'legacy' ? sql`chain IS NULL` : sql`chain = ${chain}`;
  let prev: string | null = null, lastSeq = 0, rows = 0, rewritten = 0;
  for (;;) {
    const page = await sql`
      SELECT seq, tenant_id, actor_type, actor_id, actor_label, action, target_type, target_id,
             summary, metadata, ip, user_agent, prev_hash, hash
        FROM audit_log WHERE ${where} AND seq > ${lastSeq} ORDER BY seq ASC LIMIT 2000`;
    for (const r of page as any[]) {
      const hash = rowHash(r, prev);
      if ((r.prev_hash || null) !== prev || r.hash !== hash) {
        await sql`UPDATE audit_log SET prev_hash = ${prev}, hash = ${hash} WHERE seq = ${r.seq}`;
        rewritten++;
      }
      prev = hash; lastSeq = Number(r.seq); rows++;
    }
    if (page.length < 2000) break;
  }
  await sql`DELETE FROM audit_checks WHERE chain = ${chain}`;
  return { rows, rewritten };
}
