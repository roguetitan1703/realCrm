/**
 * ============================================================================
 * 🧾 AUDIT LEDGER — append-only, hash-chained
 * ============================================================================
 * The security ledger (see SPRINT.md "Three ledgers"): who did what, when,
 * from where. Never updated, never deleted, survives a workspace reset.
 *
 * Tamper-evident: each row stores `prev_hash` and a `hash` computed over its
 * own canonical content + the previous row's hash. Altering or deleting a
 * past row breaks the chain — `verifyChain()` detects it.
 *
 * Appends are serialized through a single in-process promise chain (a simple
 * async mutex) because each row's hash depends on the previous row's hash —
 * concurrent appends would race on "what is the last hash".
 *
 * ONE CHAIN PER FIRM (9.1, 25 Sep). It was one chain for every firm, so a
 * firm's ledger could only be checked by reading all of them (7,620 rows,
 * 3.7 s on 22 Sep) and one firm's damage read as everyone's. Rows written from
 * now on carry `chain` (the firm's id, or 'platform' for Delpat's own events)
 * and link only to the last row of their chain. Rows from before keep
 * `chain` NULL and stay one LEGACY chain, checked as it always was.
 *
 * WHY IT READ "BROKEN". A Date inside metadata was hashed as `{}` (it has no
 * own keys) and read back from JSONB as an ISO string, so 1,489 rows could
 * never verify: 0 link breaks, 0 forks, nothing altered (measured 22 Sep).
 * Dates are hashed as their ISO string now. The old rows cannot be re-hashed
 * without destroying the evidence the chain exists for, so the checker tries
 * them the way they were written as well (`legacyDates`).
 *
 * CHECKED A PIECE AT A TIME. `audit_checks` remembers how far each chain has
 * been verified and the hash it ended on; a check reads only what came after.
 * ============================================================================
 */
import crypto from 'crypto';
import { sql } from './db.js';
import { getContext } from './context.js';

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
function stableStringify(value: any, legacyDates = false): string {
  // Match JSONB's normalization so the canonical form is identical before the
  // write and after the JSONB round-trip:
  //   • undefined is not a JSON value — JSONB drops it in objects and stores
  //     null in arrays. Render it the same way here, or a metadata object
  //     carrying `foo: undefined` would hash one way on write and another on
  //     read (the key vanishes), falsely breaking the chain.
  if (value === undefined || value === null) return 'null';
  // A Date is its ISO string: what JSONB hands back when the row is read.
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  // The old rows were hashed with every Date as `{}`; on read-back those are
  // ISO strings. Checking a legacy row, such a string is tried as `{}`.
  if (legacyDates && typeof value === 'string' && ISO_AT.test(value)) return '{}';
  if (Array.isArray(value)) return `[${value.map(v => stableStringify(v, legacyDates)).join(',')}]`;
  if (typeof value === 'object') {
    const keys = Object.keys(value).filter(k => value[k] !== undefined).sort();
    return `{${keys.map(k => `${JSON.stringify(k)}:${stableStringify(value[k], legacyDates)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

const ISO_AT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:?\d{2})$/;

/** Deterministic string representation of the row's content (excludes seq/hash/created_at). */
function canonical(entry: AuditEntry, tenantId: string | null, legacyDates = false): string {
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
  }, legacyDates);
}

/** The chain a row belongs to: its firm, or Delpat's own. */
const chainOf = (tenantId: string | null) => tenantId || 'platform';

/**
 * WHO DID IT, BY NAME — resolved here, once, instead of at fifty call sites.
 *
 * Every route passes `req.user?.name`, and a token carries no name, so that was
 * `undefined` on every write: 1,380 owners imported for a client on 22 Sep and
 * an actor label on none of them. The id was always right, which is what makes
 * this recoverable — the name is looked up from it and cached, because a ledger
 * read by a person needs a person's name in it, not `usr_mahalaxmi_178973…`.
 *
 * Cached for five minutes: an audit write must not cost a query per row during
 * an import, and a renamed user shows up on the next entry after that.
 */
const nameCache = new Map<string, { name: string | null; at: number }>();
const NAME_TTL_MS = 5 * 60_000;

async function actorName(id: string | null | undefined): Promise<string | null> {
  if (!id) return null;
  const hit = nameCache.get(id);
  if (hit && Date.now() - hit.at < NAME_TTL_MS) return hit.name;
  try {
    const [row] = await sql`
      SELECT name FROM users WHERE id = ${id}
      UNION ALL SELECT name FROM superadmins WHERE id = ${id}
      LIMIT 1`;
    const name = row?.name || null;
    nameCache.set(id, { name, at: Date.now() });
    return name;
  } catch {
    // A ledger entry with no name is worse than one with a stale name, but both
    // are better than a mutation that failed because of its own audit trail.
    return null;
  }
}

async function appendAudit(entry: AuditEntry): Promise<void> {
  const tenantId = entry.tenant_id ?? null;
  if (!entry.actor_label && entry.actor_id) entry.actor_label = await actorName(entry.actor_id);
  const chain = chainOf(tenantId);
  // The metadata as it will be stored: through JSON, so a Date is already its
  // ISO string and what is hashed is exactly what will be read back.
  const metadata = JSON.parse(JSON.stringify(entry.metadata || {}));
  const last = await sql`SELECT hash FROM audit_log WHERE chain = ${chain} ORDER BY seq DESC LIMIT 1`;
  const prevHash: string | null = last[0]?.hash || null;
  const hash = crypto.createHash('sha256').update(canonical({ ...entry, metadata }, tenantId) + (prevHash || '')).digest('hex');

  await sql`
    INSERT INTO audit_log (
      tenant_id, actor_type, actor_id, actor_label, action, target_type, target_id,
      summary, metadata, ip, user_agent, prev_hash, hash, chain
    ) VALUES (
      ${tenantId}, ${entry.actor_type}, ${entry.actor_id ?? null}, ${entry.actor_label ?? null},
      ${entry.action}, ${entry.target_type ?? null}, ${entry.target_id ?? null},
      ${entry.summary ?? null}, ${sql.json(metadata)}, ${entry.ip ?? null}, ${entry.user_agent ?? null},
      ${prevHash}, ${hash}, ${chain}
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
/**
 * Recent audit entries for the CURRENT tenant (from the request context) — the
 * read side of the owner-facing ledger view. Sensitive columns (hashes,
 * user_agent) are intentionally left out; this is a human activity list, not the
 * verification surface (that is verifyChain).
 */
export async function listAudit(limit = 60): Promise<any[]> {
  const tenantId = getContext()?.tenantId || null;
  return await sql`
    SELECT seq, actor_type, actor_id, actor_label, action, target_type, target_id, summary, ip, created_at
    FROM audit_log
    WHERE tenant_id = ${tenantId}
    ORDER BY seq DESC
    LIMIT ${limit}
  `;
}

export type ChainCheck = { ok: boolean; checked: number; brokenAtSeq: number | null; checkedAt: string };

const rowHash = (r: any, prevHash: string | null, legacyDates = false) => crypto.createHash('sha256').update(
  canonical({
    actor_type: r.actor_type, actor_id: r.actor_id, actor_label: r.actor_label,
    action: r.action, target_type: r.target_type, target_id: r.target_id,
    summary: r.summary, metadata: r.metadata, ip: r.ip, user_agent: r.user_agent,
  }, r.tenant_id, legacyDates) + (prevHash || '')
).digest('hex');

/**
 * Check one chain, from where the last check stopped. `chain` is a firm's id,
 * 'platform', or 'legacy' (the rows from before chains, all firms together).
 * A break is remembered; once broken, it stays reported at the first bad row.
 */
export async function verifyChain(chain: string): Promise<ChainCheck> {
  const [prev] = await sql`SELECT * FROM audit_checks WHERE chain = ${chain}`;
  if (prev && prev.ok === false) {
    return { ok: false, checked: Number(prev.checked), brokenAtSeq: Number(prev.broken_at), checkedAt: prev.checked_at };
  }
  const from = Number(prev?.last_seq || 0);
  let prevHash: string | null = prev?.last_hash || null;
  let checked = Number(prev?.checked || 0), lastSeq = from, broken: number | null = null;
  const where = chain === 'legacy' ? sql`chain IS NULL` : sql`chain = ${chain}`;
  // In pages, so a first check of a long chain does not hold every row at once.
  for (;;) {
    const rows = await sql`
      SELECT seq, tenant_id, actor_type, actor_id, actor_label, action, target_type, target_id,
             summary, metadata, ip, user_agent, prev_hash, hash
        FROM audit_log WHERE ${where} AND seq > ${lastSeq} ORDER BY seq ASC LIMIT 2000`;
    for (const r of rows as any[]) {
      const linked = (r.prev_hash || null) === prevHash;
      const same = linked && (rowHash(r, prevHash) === r.hash || rowHash(r, prevHash, true) === r.hash);
      if (!same) { broken = Number(r.seq); break; }
      prevHash = r.hash; lastSeq = Number(r.seq); checked++;
    }
    if (broken || rows.length < 2000) break;
  }
  await sql`
    INSERT INTO audit_checks (chain, last_seq, last_hash, checked, ok, broken_at, checked_at)
    VALUES (${chain}, ${lastSeq}, ${prevHash}, ${checked}, ${!broken}, ${broken}, NOW())
    ON CONFLICT (chain) DO UPDATE SET last_seq = EXCLUDED.last_seq, last_hash = EXCLUDED.last_hash,
      checked = EXCLUDED.checked, ok = EXCLUDED.ok, broken_at = EXCLUDED.broken_at, checked_at = NOW()`;
  return { ok: !broken, checked, brokenAtSeq: broken, checkedAt: new Date().toISOString() };
}

/**
 * A firm's ledger: its own chain, and the legacy chain its older rows sit in.
 * Both must hold for the firm's ledger to be whole.
 */
export async function verifyTenantLedger(tenantId: string): Promise<{ ok: boolean; own: ChainCheck; legacy: ChainCheck }> {
  const [own, legacy] = await Promise.all([verifyChain(tenantId), verifyChain('legacy')]);
  return { ok: own.ok && legacy.ok, own, legacy };
}

/**
 * The superadmin's view of a firm's ledger: newest first, paged by `before`
 * (a seq), narrowed by action, person or day. `tenantId` null is Delpat's own
 * (platform) events.
 */
export async function listLedger(opts: { tenantId: string | null; before?: number | null; action?: string | null;
  actor?: string | null; from?: string | null; to?: string | null; limit?: number }) {
  const limit = Math.min(Math.max(Number(opts.limit) || 50, 1), 200);
  const where: any[] = [opts.tenantId ? sql`tenant_id = ${opts.tenantId}` : sql`tenant_id IS NULL`];
  if (opts.before) where.push(sql`seq < ${opts.before}`);
  if (opts.action) where.push(sql`action = ${opts.action}`);
  if (opts.actor) where.push(sql`(actor_id = ${opts.actor} OR actor_label ILIKE ${'%' + opts.actor + '%'})`);
  if (opts.from) where.push(sql`created_at >= ${opts.from}::date`);
  if (opts.to) where.push(sql`created_at < (${opts.to}::date + 1)`);
  const clause = where.reduce((acc, f, i) => (i === 0 ? f : sql`${acc} AND ${f}`));
  const [rows, actions] = await Promise.all([
    sql`SELECT seq, actor_type, actor_id, actor_label, action, target_type, target_id, summary, ip, user_agent, created_at
          FROM audit_log WHERE ${clause} ORDER BY seq DESC LIMIT ${limit + 1}`,
    sql`SELECT action, count(*)::int AS n FROM audit_log
         WHERE ${opts.tenantId ? sql`tenant_id = ${opts.tenantId}` : sql`tenant_id IS NULL`}
         GROUP BY 1 ORDER BY 2 DESC LIMIT 60`,
  ]);
  const more = (rows as any[]).length > limit;
  return { rows: (rows as any[]).slice(0, limit), more, actions };
}
