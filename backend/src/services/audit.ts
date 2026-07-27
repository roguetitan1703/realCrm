/**
 * ============================================================================
 * 🧾 AUDIT LEDGER — append-only, hash-chained
 * ============================================================================
 * The security ledger (see SPRINT.md "Three ledgers"): who did what, when,
 * from where. Never updated, never deleted, survives a workspace reset.
 *
 * Tamper-evident: each row stores `prev_hash` and a `hash` computed over its
 * own canonical content + the previous row's hash. Altering or deleting a
 * past row breaks the chain — `verifyAuditChain()` detects it.
 *
 * Appends are serialized through a single in-process promise chain (a simple
 * async mutex) because each row's hash depends on the previous row's hash —
 * concurrent appends would race on "what is the last hash". Fine at this
 * volume; per-tenant chains are a later optimization if it ever isn't.
 * ============================================================================
 */
import crypto from 'crypto';
import { sql } from './db.js';

export type ActorType = 'user' | 'superadmin' | 'system';

export interface AuditEntry {
  tenant_id?: string | null;
  actor_type: ActorType;
  actor_id?: string | null;
  actor_label?: string | null;
  action: string;
  target_type?: string | null;
  target_id?: string | null;
  summary?: string | null;
  metadata?: any;
  ip?: string | null;
  user_agent?: string | null;
}

/**
 * JSON.stringify with object keys sorted recursively. Plain JSON.stringify
 * preserves insertion order, but Postgres JSONB does NOT preserve the key
 * order it was written with — reading `metadata` back and re-stringifying
 * would then produce a different string (and hash) than at write time, with
 * zero tampering involved. Sorting keys on both sides makes the canonical
 * form stable across the write → JSONB → read round trip.
 */
function stableStringify(value: any): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    const keys = Object.keys(value).sort();
    return `{${keys.map(k => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

/** Deterministic string representation of the row's content (excludes seq/hash/created_at). */
function canonical(entry: AuditEntry, tenantId: string | null): string {
  return stableStringify({
    tenant_id: tenantId,
    actor_type: entry.actor_type,
    actor_id: entry.actor_id ?? null,
    actor_label: entry.actor_label ?? null,
    action: entry.action,
    target_type: entry.target_type ?? null,
    target_id: entry.target_id ?? null,
    summary: entry.summary ?? null,
    metadata: entry.metadata ?? {},
    ip: entry.ip ?? null,
    user_agent: entry.user_agent ?? null,
  });
}

async function appendAudit(entry: AuditEntry): Promise<void> {
  const tenantId = entry.tenant_id ?? null;
  const last = await sql`SELECT hash FROM audit_log ORDER BY seq DESC LIMIT 1`;
  const prevHash: string | null = last[0]?.hash || null;
  const hash = crypto.createHash('sha256').update(canonical(entry, tenantId) + (prevHash || '')).digest('hex');

  await sql`
    INSERT INTO audit_log (
      tenant_id, actor_type, actor_id, actor_label, action, target_type, target_id,
      summary, metadata, ip, user_agent, prev_hash, hash
    ) VALUES (
      ${tenantId}, ${entry.actor_type}, ${entry.actor_id ?? null}, ${entry.actor_label ?? null},
      ${entry.action}, ${entry.target_type ?? null}, ${entry.target_id ?? null},
      ${entry.summary ?? null}, ${sql.json(entry.metadata || {})}, ${entry.ip ?? null}, ${entry.user_agent ?? null},
      ${prevHash}, ${hash}
    );
  `;
}

// In-process queue: each call chains onto the previous so appends never race
// on "what's the last hash". A failed append is logged, not thrown — audit
// logging must never be allowed to break the caller's actual mutation.
let queue: Promise<void> = Promise.resolve();

export function audit(entry: AuditEntry): Promise<void> {
  queue = queue.then(
    () => appendAudit(entry),
    () => appendAudit(entry), // previous append failed; still try this one
  ).catch(err => {
    console.error('[Audit] append failed:', err?.message || err);
  });
  return queue;
}

/**
 * Walk the whole chain in order and recompute each hash from its content +
 * the previous row's hash. Returns the first seq where it doesn't match, if
 * any — that's the point of tampering (or deletion, which shows up as a
 * prev_hash that doesn't equal the previous surviving row's hash).
 */
export async function verifyAuditChain(): Promise<{ ok: boolean; brokenAtSeq?: number }> {
  const rows = await sql`
    SELECT seq, tenant_id, actor_type, actor_id, actor_label, action, target_type, target_id,
           summary, metadata, ip, user_agent, prev_hash, hash
    FROM audit_log ORDER BY seq ASC
  `;

  let prevHash: string | null = null;
  for (const r of rows) {
    if ((r.prev_hash || null) !== prevHash) return { ok: false, brokenAtSeq: r.seq };
    const expected = crypto.createHash('sha256').update(
      canonical({
        actor_type: r.actor_type, actor_id: r.actor_id, actor_label: r.actor_label,
        action: r.action, target_type: r.target_type, target_id: r.target_id,
        summary: r.summary, metadata: r.metadata, ip: r.ip, user_agent: r.user_agent,
      }, r.tenant_id) + (prevHash || '')
    ).digest('hex');
    if (expected !== r.hash) return { ok: false, brokenAtSeq: r.seq };
    prevHash = r.hash;
  }
  return { ok: true };
}
