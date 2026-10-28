/**
 * ============================================================================
 * 📥 INGESTION — connections, keys, and the webhook inbox (spec: ingestion.md)
 * ============================================================================
 * The model this replaces created a lead the instant a payload arrived, read
 * through a hardcoded alias list, and kept nothing. Whatever the provider
 * actually sent — the very thing you need in order to write a mapping — was
 * gone the moment it didn't match an alias.
 *
 * So: land the raw body first, acknowledge fast, and only then turn it into a
 * lead, and only if someone has said how. A push with no parser stays visible
 * as inbound activity rather than becoming a guess.
 * ============================================================================
 */

import crypto from 'crypto';
import { sql } from './db';
import { parsePayload, sanitizeConfig } from './parser';
import { findLeadByPhone, findLeadByRawPhone, createLead, updateLead, arrivalLeadAgent, addTimelineEvent, recordEnquiry, mergeRepeatReq, isPlaceholderName, activeOwnerOf, deskConfigOf, REJECTED_STATUS, WON_STATUS } from './store';
import { notify, notifyOrDesk } from './notifications';
import { runWithContext } from './context';
import { queueManager } from './queue';
import { hashKey, lockKey, keyState, currentLock } from './integrationKeys';
import { hit } from './rateLimit';

export type Integration = {
  id: string;
  tenant_id: string;
  provider: string;
  api_key_last4: string | null;
  parser_config: any | null;
  active: boolean;
  created_at: string;
  created_by: string | null;
  last_received_at: string | null;
};

const rid = (p: string) => `${p}_${Date.now().toString(36)}${crypto.randomBytes(5).toString('hex')}`;

/**
 * Keys are hashed with SHA-256, not bcrypt — and that is deliberate rather
 * than a shortcut.
 *
 * bcrypt exists to make GUESSING cheap-to-verify but expensive-to-brute-force,
 * which matters for passwords because humans pick "summer2024". An API key is
 * 256 bits of CSPRNG output: there is nothing to guess, so a slow KDF buys no
 * security. What it would cost is real — bcrypt's per-row salt makes lookup
 * impossible without scanning and verifying EVERY integration on the platform
 * for every inbound push. SHA-256 is deterministic, so the key resolves through
 * a unique index in one hop, which is what lets the endpoint ack fast.
 */
// hashKey lives in integrationKeys.ts now, beside the lock it is the ground
// truth for. Same function, byte for byte — the stored hashes still match.

/** `sk_live_` + 32 bytes. The prefix makes a leaked key obvious in a log or a
 *  git diff, and secret scanners key off exactly this shape. */
function mintKey(): string {
  return 'sk_live_' + crypto.randomBytes(32).toString('hex');
}

/**
 * The key is ALSO kept encrypted, alongside the hash, so an owner can read it
 * back to send a portal. How it is locked and opened — and why the old lock
 * stopped opening every key written before August — is integrationKeys.ts.
 */

/** The plaintext key for a connection. Callers must have checked the role and
 *  must write an audit entry — reading a credential is an event. */
export async function revealKey(tenantId: string, id: string): Promise<string | null> {
  const rows = await sql`
    SELECT api_key_enc, api_key_hash FROM integrations WHERE id = ${id} AND tenant_id = ${tenantId} LIMIT 1
  `;
  if (!rows.length) return null;
  const st = keyState(rows[0]);
  return st.status === 'current' || st.status === 'old-lock' ? st.plain : null;
}

/**
 * Where every stored connection key stands, for the boot log. Read-only, and
 * across all tenants: the lock is one server secret, so whether it opens the
 * keys is one question about the server, not one per firm.
 */
export async function checkIntegrationKeys(): Promise<{
  total: number; current: number; oldLock: number;
  unreadable: Array<{ tenant: string; provider: string }>;
  mismatch: Array<{ tenant: string; provider: string }>;
  lock: string;
}> {
  const rows = await sql`SELECT tenant_id, provider, api_key_enc, api_key_hash FROM integrations WHERE api_key_enc IS NOT NULL`;
  const out = { total: rows.length, current: 0, oldLock: 0, unreadable: [] as any[], mismatch: [] as any[], lock: currentLock() as string };
  for (const r of rows) {
    const st = keyState(r);
    if (st.status === 'current') out.current++;
    else if (st.status === 'old-lock') out.oldLock++;
    else if (st.status === 'unreadable') out.unreadable.push({ tenant: r.tenant_id, provider: r.provider });
    else if (st.status === 'mismatch') out.mismatch.push({ tenant: r.tenant_id, provider: r.provider });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Connections
// ---------------------------------------------------------------------------

/**
 * Create a connection and return its key. Stored twice: hashed for the inbound
 * lookup, encrypted so it can be read back (see `revealKey`).
 */
export async function createIntegration(
  tenantId: string, provider: string, createdBy: string | null,
): Promise<{ integration: Integration; apiKey: string }> {
  const id = rid('int');
  const apiKey = mintKey();
  const rows = await sql`
    INSERT INTO integrations (id, tenant_id, provider, api_key_hash, api_key_enc, api_key_last4, active, created_by)
    VALUES (${id}, ${tenantId}, ${provider}, ${hashKey(apiKey)}, ${lockKey(apiKey)}, ${apiKey.slice(-4)}, TRUE, ${createdBy})
    RETURNING id, tenant_id, provider, api_key_last4, parser_config, active, created_at, created_by, last_received_at
  `;
  return { integration: rows[0] as Integration, apiKey };
}

/** Rotate: the old key stops working the moment this returns. */
export async function rotateIntegrationKey(tenantId: string, id: string): Promise<string | null> {
  const apiKey = mintKey();
  const rows = await sql`
    UPDATE integrations SET api_key_hash = ${hashKey(apiKey)}, api_key_enc = ${lockKey(apiKey)},
           api_key_last4 = ${apiKey.slice(-4)}
    WHERE id = ${id} AND tenant_id = ${tenantId}
    RETURNING id
  `;
  return rows.length ? apiKey : null;
}

export async function listIntegrations(tenantId: string): Promise<Integration[]> {
  return await sql`
    SELECT id, tenant_id, provider, api_key_last4, parser_config, active, created_at, created_by, last_received_at
    FROM integrations WHERE tenant_id = ${tenantId} ORDER BY created_at DESC
  ` as unknown as Integration[];
}

/** One connection, scoped to the tenant so an id from another workspace
 *  resolves to nothing rather than to someone else's row. */
export async function getIntegration(tenantId: string, id: string): Promise<Integration | null> {
  const rows = await sql`
    SELECT id, tenant_id, provider, api_key_last4, parser_config, active, created_at, created_by, last_received_at
    FROM integrations WHERE id = ${id} AND tenant_id = ${tenantId} LIMIT 1
  `;
  return (rows[0] as Integration) || null;
}

/**
 * Looked up by id alone, no tenant scope — for the public setup-docs page,
 * which a provider's engineer opens with no CRM login of their own. Safe: the
 * id carries no secret, and the page it renders never includes the key.
 */
export async function getIntegrationById(id: string): Promise<(Integration & { tenant_slug: string }) | null> {
  const rows = await sql`
    SELECT i.id, i.tenant_id, i.provider, i.api_key_last4, i.parser_config, i.active,
           i.created_at, i.created_by, i.last_received_at, t.slug AS tenant_slug
    FROM integrations i JOIN tenants t ON t.id = i.tenant_id
    WHERE i.id = ${id} LIMIT 1
  `;
  return (rows[0] as any) || null;
}

export async function setParserConfig(tenantId: string, id: string, config: any): Promise<boolean> {
  const rows = await sql`
    UPDATE integrations SET parser_config = ${config === null ? null : sql.json(config)}
    WHERE id = ${id} AND tenant_id = ${tenantId} RETURNING id
  `;
  return rows.length > 0;
}

export async function setIntegrationActive(tenantId: string, id: string, active: boolean): Promise<boolean> {
  const rows = await sql`
    UPDATE integrations SET active = ${active} WHERE id = ${id} AND tenant_id = ${tenantId} RETURNING id
  `;
  return rows.length > 0;
}

export async function deleteIntegration(tenantId: string, id: string): Promise<boolean> {
  // The inbox rows are NOT deleted with it. They are the record of what was
  // received, which outlives the connection that received it — and deleting a
  // connection must not be a way to erase the history of leads it created.
  const rows = await sql`DELETE FROM integrations WHERE id = ${id} AND tenant_id = ${tenantId} RETURNING id`;
  return rows.length > 0;
}

/**
 * THE hot path: the key alone identifies both tenant and provider. One indexed
 * lookup, and inactive connections resolve to nothing so pausing a noisy
 * provider is instant and doesn't require deleting anything.
 */
export async function resolveByKey(presentedKey: string): Promise<Integration | null> {
  const k = String(presentedKey || '').trim();
  if (!k) return null;
  const rows = await sql`
    SELECT id, tenant_id, provider, api_key_last4, parser_config, active, created_at, created_by, last_received_at
    FROM integrations WHERE api_key_hash = ${hashKey(k)} AND active = TRUE LIMIT 1
  `;
  return (rows[0] as Integration) || null;
}

// ---------------------------------------------------------------------------
// Inbox
// ---------------------------------------------------------------------------

/** Headers worth keeping for debugging, without keeping the credential. */
function safeHeaders(h: Record<string, any>): Record<string, string> {
  const keep = ['content-type', 'user-agent', 'x-forwarded-for', 'x-request-id', 'origin', 'referer'];
  const out: Record<string, string> = {};
  for (const k of keep) if (h[k]) out[k] = String(h[k]).slice(0, 400);
  // Never `x-api-key` / `authorization`: storing the key next to the payload
  // would undo hashing it in the first place.
  return out;
}

export async function recordPush(args: {
  integration: Integration; body: any; headers: Record<string, any>; ip: string | null;
  /** `held`: over the rate limit — stored, never parsed until replayed. */
  status?: 'pending' | 'held';
}): Promise<string> {
  const id = rid('wh');
  await sql`
    INSERT INTO webhook_inbox (id, tenant_id, integration_id, source_ip, headers, raw_body, status)
    VALUES (${id}, ${args.integration.tenant_id}, ${args.integration.id}, ${args.ip},
            ${sql.json(safeHeaders(args.headers))}, ${sql.json(args.body ?? {})}, ${args.status || 'pending'})
  `;
  // A held push still says the portal is sending (feed watch reads this).
  await sql`UPDATE integrations SET last_received_at = NOW() WHERE id = ${args.integration.id}`;
  return id;
}

export async function markInbox(
  id: string, status: 'parsed' | 'merged' | 'failed' | 'ignored', extra: { leadId?: string | null; error?: string | null } = {},
): Promise<void> {
  await sql`
    UPDATE webhook_inbox
    SET status = ${status}, lead_id = ${extra.leadId ?? null},
        error = ${extra.error ? String(extra.error).slice(0, 500) : null}, parsed_at = NOW(),
        claimed_from = NULL, claimed_at = NULL
    WHERE id = ${id}
  `;
}

// ---------------------------------------------------------------------------
// Claiming rows before they become leads
// ---------------------------------------------------------------------------

export type ClaimedRow = { id: string; integration_id: string; raw_body: any; received_at: Date; claimed_from: string };

/** A claim older than this was left by a run that died; it is put back. */
const CLAIM_STALE_MINUTES = 10;

/**
 * ONE ROW, ONE RUN. Every path that turns a stored push into a lead — the live
 * push, the connection's Process button, the held-push release — claims the
 * rows first: one statement moves them to 'processing' (remembering what they
 * were) and returns only the rows it moved, with SKIP LOCKED so two runs
 * started together take different rows instead of the same ones twice. Read
 * then process, without a claim, let two runs each create a lead from one push
 * and then overwrite each other's outcome.
 *
 * Only rows whose connection has a mapping are claimed: without one there is
 * nothing to process, and a claimed row nobody processes is a stuck row.
 */
export async function claimInbox(tenantId: string, opts: {
  statuses: string[]; integrationId?: string; ids?: string[]; limit?: number;
}): Promise<ClaimedRow[]> {
  if (!tenantId) throw new Error('claimInbox: tenantId is required');
  const rows = await sql`
    UPDATE webhook_inbox w
       SET status = 'processing', claimed_from = w.status, claimed_at = NOW()
     WHERE w.id IN (
       SELECT x.id FROM webhook_inbox x
         JOIN integrations g ON g.id = x.integration_id AND g.tenant_id = x.tenant_id
        WHERE x.tenant_id = ${tenantId} AND x.status IN ${sql(opts.statuses)}
          AND x.raw_body IS NOT NULL AND g.parser_config IS NOT NULL
          ${opts.integrationId ? sql`AND x.integration_id = ${opts.integrationId}` : sql``}
          ${opts.ids ? sql`AND x.id IN ${sql(opts.ids)}` : sql``}
        ORDER BY x.received_at ASC
        ${opts.limit ? sql`LIMIT ${opts.limit}` : sql``}
        FOR UPDATE OF x SKIP LOCKED)
       AND w.tenant_id = ${tenantId} AND w.status IN ${sql(opts.statuses)}
    RETURNING w.id, w.integration_id, w.raw_body, w.received_at, w.claimed_from`;
  return (rows as unknown as ClaimedRow[]).sort((a, b) => +new Date(a.received_at) - +new Date(b.received_at));
}

/** Put back what a crashed run claimed and never finished. */
export async function recoverStaleClaims(tenantId: string): Promise<number> {
  const back = await sql`
    UPDATE webhook_inbox SET status = coalesce(claimed_from, 'pending'), claimed_from = NULL, claimed_at = NULL
     WHERE tenant_id = ${tenantId} AND status = 'processing'
       AND (claimed_at IS NULL OR claimed_at < NOW() - make_interval(mins => ${CLAIM_STALE_MINUTES}))`;
  if (back.count) console.warn(`[Ingest] ${tenantId}: ${back.count} push(es) left mid-processing by a stopped run put back`);
  return back.count;
}

export async function listInbox(
  tenantId: string, opts: { integrationId?: string; status?: string; limit?: number; offset?: number } = {},
): Promise<{ rows: any[]; total: number }> {
  const limit = Math.min(opts.limit ?? 50, 200);
  const offset = Math.max(opts.offset ?? 0, 0);
  const where = sql`
    WHERE tenant_id = ${tenantId}
      ${opts.integrationId ? sql`AND integration_id = ${opts.integrationId}` : sql``}
      ${opts.status ? sql`AND status = ${opts.status}` : sql``}
  `;
  // The page and the total are two queries, deliberately. Reporting rows.length
  // as the total is how the activity strip claimed a connection had received 8
  // pushes when it had received 18 — the feed asks for 8 and always got 8, so
  // history looked like it stopped two days ago.
  const rows = await sql`
    SELECT id, integration_id, received_at, source_ip, status, lead_id, error, parsed_at,
           raw_body, body_purged_at, headers
    FROM webhook_inbox ${where}
    ORDER BY received_at DESC LIMIT ${limit} OFFSET ${offset}
  ` as unknown as any[];
  const [{ n }] = await sql`SELECT count(*)::int AS n FROM webhook_inbox ${where}` as unknown as [{ n: number }];
  return { rows, total: n };
}

/** Counts for the per-connection activity strip. */
export async function inboxCounts(tenantId: string): Promise<Record<string, Record<string, number>>> {
  const rows = await sql`
    SELECT integration_id, status, count(*)::int AS n
    FROM webhook_inbox WHERE tenant_id = ${tenantId} GROUP BY integration_id, status
  `;
  const out: Record<string, Record<string, number>> = {};
  for (const r of rows as any[]) {
    out[r.integration_id] = out[r.integration_id] || {};
    out[r.integration_id][r.status] = r.n;
  }
  return out;
}

/** The most recent real payload — what the mapper auto-suggests from and what
 *  the mandatory test-preview runs against. */
export async function lastPayload(tenantId: string, integrationId: string): Promise<any | null> {
  const rows = await sql`
    SELECT raw_body FROM webhook_inbox
    WHERE tenant_id = ${tenantId} AND integration_id = ${integrationId} AND raw_body IS NOT NULL
    ORDER BY received_at DESC LIMIT 1
  `;
  return rows[0]?.raw_body ?? null;
}

/**
 * The payload the mapper should be built against: the RICHEST of the recent
 * pushes, not merely the latest.
 *
 * One provider sends more than one shape. Delpat's Meta connection received 31
 * pushes carrying budget_amount, configuration, remarks and requirement_type,
 * and one outlier carrying budget/created_time/lead_id. Auto-detect ran against
 * whichever happened to be last, matched the outlier, and produced a mapping
 * that fits one push in thirty-two — which is why 33 of those 34 leads have no
 * budget and 31 have no configuration. Same story on MagicBricks, where thin
 * three-field pushes are interleaved with the eleven-field ones.
 *
 * Still a REAL payload, never a synthetic merge: the mapper shows this body and
 * you click fields in it, so inventing a union of keys nobody actually sent
 * would be mapping against a fiction. Ties go to the newer push, so a provider
 * that genuinely drops a field is followed rather than second-guessed.
 */
export async function bestPayload(
  tenantId: string, integrationId: string, look = 50,
): Promise<{ payload: any | null; shapes: number; consideredCount: number }> {
  const rows = await sql`
    SELECT raw_body FROM webhook_inbox
    WHERE tenant_id = ${tenantId} AND integration_id = ${integrationId} AND raw_body IS NOT NULL
    ORDER BY received_at DESC LIMIT ${look}
  `;
  if (!rows.length) return { payload: null, shapes: 0, consideredCount: 0 };
  const shapes = new Set<string>();
  let best: any = null;
  let bestCount = -1;
  for (const r of rows) {
    const body = r.raw_body;
    const keys = body && typeof body === 'object' ? Object.keys(body) : [];
    shapes.add(keys.slice().sort().join(','));
    // `_error`/`_unparsed` is what we store when a provider posts malformed
    // JSON. It is a record of the failure, not a payload to map against.
    if (keys.includes('_error') || keys.includes('_unparsed')) continue;
    if (keys.length > bestCount) { bestCount = keys.length; best = body; }
  }
  return { payload: best ?? rows[0].raw_body, shapes: shapes.size, consideredCount: rows.length };
}

// ---------------------------------------------------------------------------
// Unauthenticated callers
// ---------------------------------------------------------------------------

/**
 * A bad key logs METADATA ONLY — never the body (spec behaviour 2). An endpoint
 * that persisted arbitrary payloads from anyone who can reach the URL is a
 * free, unauthenticated write into our database; the reject log has to be the
 * one thing that can't become that.
 *
 * Collapsed per (ip, key-prefix, day) so a misconfigured portal retrying every
 * 30 seconds produces one row with a count, not 2,880 rows a day.
 */
export async function logReject(args: {
  ip: string | null; presentedKey: string; path: string; tenantHint?: string | null; note?: string;
}): Promise<void> {
  const prefix = String(args.presentedKey || '').slice(0, 12) || '(none)';
  const day = new Date().toISOString().slice(0, 10);
  const note = args.note || 'invalid or unknown key';
  // The note joins the id only when it is not the original one, so the rows an
  // unknown key already collapses into keep their ids.
  const salt = args.note ? `|${note}` : '';
  const id = `rej_${day}_${crypto.createHash('sha1').update(`${args.ip}|${prefix}${salt}`).digest('hex').slice(0, 12)}`;
  await sql`
    INSERT INTO ingest_rejects (id, ip, key_prefix, path, tenant_hint, note, count)
    VALUES (${id}, ${args.ip}, ${prefix}, ${args.path}, ${args.tenantHint ?? null}, ${note}, 1)
    ON CONFLICT (id) DO UPDATE SET count = ingest_rejects.count + 1, received_at = NOW()
  `;
}

/**
 * HOW MANY PUSHES ONE CONNECTION MAY SEND. A key is a credential that sits in a
 * portal's panel and in whatever the broker pasted it into; leaked, it could
 * write leads into a desk as fast as it could send. These are per connection
 * (one key), so one noisy portal never blocks another.
 *
 * Measured, not guessed (backend/src/scripts/ingest-peaks.ts, production, 60
 * days to 28 Oct): the busiest connection, bhumi's MagicBricks, peaked at 8 a
 * minute, 26 an hour and 27 a day. Every limit is more than ten times that.
 * Re-run the script on production before tightening any of these.
 *
 * OVER THE MINUTE OR HOUR, A PUSH IS HELD, NOT LOST. Most portals do not retry
 * a non-2xx, so a refused enquiry would be gone. It is stored as a `held` inbox
 * row — no lead, no alert — and answered 429; releaseHeld() turns it into a
 * lead within the hour, at the connection's own rate, through the same path as
 * any push.
 * Only past the day cap, or once a day's worth is already held, is a push
 * dropped: then nothing is stored and ingest_rejects counts it.
 */
export const INGEST_LIMITS = { perMinute: 60, perHour: 300, perDay: 1000, heldPerDay: 1000 } as const;

/**
 * A connection's last 24 hours: pushes that went through, and pushes held. A
 * held row claimed for release ('processing', claimed from 'held') is still
 * held until it lands. The one count the live limit and the release share.
 */
export async function pushesToday(tenantId: string, integrationId: string): Promise<{ accepted: number; held: number }> {
  const [day] = await sql`
    SELECT count(*) FILTER (WHERE NOT ${HELD_ROW})::int AS accepted,
           count(*) FILTER (WHERE ${HELD_ROW})::int AS held
      FROM webhook_inbox
     WHERE tenant_id = ${tenantId} AND integration_id = ${integrationId}
       AND received_at > NOW() - interval '1 day'`;
  return day as unknown as { accepted: number; held: number };
}
const HELD_ROW = sql`(status = 'held' OR (status = 'processing' AND claimed_from = 'held'))`;

export type IngestRefusal = { window: string; limit: number; retryAfter: number; hold: boolean };

/**
 * Spends one push from the connection's allowance, or says which window is
 * full and whether the push is held or dropped. Minute and hour are counted in
 * memory (services/rateLimit.ts, the same limiter the public pages and sign-in
 * use). The day is counted from webhook_inbox — the rows the cap is about — so
 * a restart cannot reset it.
 *
 * HELD ROWS ARE NOT ACCEPTED PUSHES. The day cap counts what went through;
 * held rows have their own cap. Counted together, a flood's held rows would
 * keep the day cap shut for a day after the flood stopped, and the real
 * enquiries in that day would be dropped instead of held. A held row that is
 * processed later becomes an accepted one.
 */
export async function spendIngestPush(integration: Integration): Promise<null | IngestRefusal> {
  const day = await pushesToday(integration.tenant_id, integration.id);
  if (day.accepted >= INGEST_LIMITS.perDay) return { window: 'day', limit: INGEST_LIMITS.perDay, retryAfter: 3600, hold: false };
  const roomToHold = day.held < INGEST_LIMITS.heldPerDay;
  if (!hit(`ingest-min:${integration.id}`, INGEST_LIMITS.perMinute, 60_000)) return { window: 'minute', limit: INGEST_LIMITS.perMinute, retryAfter: 60, hold: roomToHold };
  if (!hit(`ingest-hour:${integration.id}`, INGEST_LIMITS.perHour, 3_600_000)) return { window: 'hour', limit: INGEST_LIMITS.perHour, retryAfter: 600, hold: roomToHold };
  return null;
}

// ---------------------------------------------------------------------------
// Turning a stored push into a lead
// ---------------------------------------------------------------------------

/**
 * One inbox row → one lead. Deliberately NOT in the route: a live push and a
 * replayed backlog row must take byte-for-byte the same path, or "replay"
 * quietly becomes a second, less-tested importer. The only difference between
 * them is when it runs.
 */
export async function processInboxRow(
  integration: Integration, inboxId: string, body: any,
  /** When the push arrived (the inbox row's received_at). */
  opts: { receivedAt?: Date | string | null } = {},
): Promise<{ status: string; leadId?: string | null; reason?: string }> {
  // Sanitised at the point of use, not only when the mapper saves — a config
  // stored before the target vocabulary was normalised (flat "locality" from
  // before the req.* namespace existed) would otherwise fail every push with
  // the same error forever, until someone happened to reopen the mapper and
  // re-save. This way the very next push after the fix ships parses clean.
  const { clean } = sanitizeConfig(integration.parser_config as any);
  // The firm's phone country and currency: +1 and $450K for a US firm.
  const desk = await deskConfigOf(integration.tenant_id);
  const parsed = parsePayload(body, clean, { locale: desk.locale });
  if (!parsed.ok) {
    const why = parsed.errors.length
      ? parsed.errors.join(' ')
      : `Payload is missing ${parsed.missing.join(' and ')}.`;
    await markInbox(inboxId, 'failed', { error: why });
    return { status: 'failed', reason: why };
  }

  return await landEnquiry({
    tenantId: integration.tenant_id, provider: integration.provider, integrationId: integration.id,
    inboxId, lead: parsed.lead, body, desk, receivedAt: opts.receivedAt ?? null,
  });
}

/**
 * AN ENQUIRY WITH A NUMBER → A LEAD, or a repeat on the lead that number
 * already is. The one path every inbound enquiry takes: a portal push (above)
 * and the firm's public catalogue form (routes/public.ts, source "Catalogue").
 * Duplicate by phone, the merge rules, routing, the enquiry session and its
 * alert are all here, once. `inboxId` is set only for a push, whose inbox row
 * is marked with the outcome.
 */
export async function landEnquiry(args: {
  tenantId: string; provider: string; integrationId: string | null; inboxId: string | null;
  lead: any; body: any; desk?: Awaited<ReturnType<typeof deskConfigOf>>;
  /** A public form anyone can type any number into (the catalogue): on an
   *  existing lead, record and tell, never change the lead. */
  unverified?: boolean;
  /** Who a NEW lead goes to instead of the arrival rule: the sender of a
   *  shared link with no recipient (buyerAsks.ts). Never moves an existing one. */
  agentId?: string | null;
  /** false: the caller sends the one alert about this enquiry itself (the
   *  buyer forms name what was asked), so no lead_assigned, lead_unrouted or
   *  lead_repeat goes out beside it. The return says what happened. */
  announce?: boolean;
  /** When the push carrying it arrived — for a held or replayed push, not now. */
  receivedAt?: Date | string | null;
}): Promise<{ status: string; leadId?: string | null; reason?: string; previousStage?: string | null }> {
  const { tenantId, inboxId } = args;
  const integration = { id: args.integrationId || `${args.provider.toLowerCase()}:${tenantId}`, tenant_id: tenantId, provider: args.provider };
  const desk = args.desk || await deskConfigOf(tenantId);
  const body = args.body;
  const mark = async (status: 'parsed' | 'merged' | 'failed' | 'ignored', extra: { leadId?: string | null; error?: string | null } = {}) => {
    if (inboxId) await markInbox(inboxId, status, extra);
  };
  return await runWithContext(
    {
      tenantId, userId: null, role: 'system',
      actorType: 'system', actorLabel: `ingest:${integration.provider}`,
    } as any,
    async () => {
      const lead = args.lead;

      // Idempotency: a portal that retries because our ack was slow must not
      // create the lead twice. Keyed on the provider's own id when they send
      // one, since that is the only identifier that survives a retry intact.
      //
      // It used to fall back to the PHONE NUMBER, held for seven days. On a
      // connection that maps no external id — Housing.com sends three fields
      // and has none to map — that reads "this person may enquire once a
      // week": the second enquiry was dropped here, before the merge below
      // could note it, so it never reached the lead, the timeline or anyone's
      // screen. Two of Housing's were lost that way, 17 hours and 1h50m after
      // the first. A retry arrives in seconds.
      //
      // With no provider id, dedupe on the BODY instead. Identical bytes are a
      // retry; the same person saying something different is a new enquiry.
      // And a short window, because with three fields a genuine second enquiry
      // is byte-identical too — after which only the clock can tell them apart.
      // WHEN THEY ENQUIRED, one answer for the lead's First received
      // (createLead's received_at) and every enquiry row's time: what the
      // portal said if the mapping reads it, else when the push arrived. The
      // parser writes `received_at`; this read `receivedAt`, which nothing
      // sets, so the enquiry row always said "now". A held or replayed push
      // arrived earlier than it is processed, and the release time is not
      // when the buyer asked.
      const enquiredAt: string | undefined =
        ((lead as any).received_at || (lead as any).receivedAt || (args.receivedAt ? new Date(args.receivedAt).toISOString() : undefined)) || undefined;
      const providerId = lead.external_id;
      const lockKey = providerId
        ? `ingest:${integration.id}:${providerId}`
        : `ingest:${integration.id}:body:${crypto.createHash('sha1').update(JSON.stringify(body ?? {})).digest('hex')}`;
      // Seven days is right for a provider's own id — it is stable and unique.
      // Fifteen minutes is right for a body hash: long enough to swallow every
      // retry and a double-tap, short enough that coming back later counts.
      const lockTtl = providerId ? 604800 : 900;
      if (queueManager.checkIdempotencyLock(lockKey)) {
        await mark('ignored', { error: 'Duplicate of a push already processed' });
        return { status: 'ignored', reason: 'idempotent retry' };
      }
      queueManager.setIdempotencyLock(lockKey, lockTtl);

      // Dedup on the phone number within the tenant: the same buyer enquiring
      // twice is one lead with two enquiries, not two leads.
      //
      // Exact E.164, read in the firm's country (findLeadByPhone,
      // docs/specs/phone.md). A number that cannot be read is kept as the
      // portal sent it, and matches only the identical string from the same
      // integration, when that string still names one person (findLeadByRawPhone).
      const existing = (await findLeadByPhone(lead.phone))
        || (await findLeadByRawPhone(lead.phone, args.integrationId));
      if (existing && args.unverified) {
        // NOBODY HAS PROVED THIS IS THEM. A portal vouches for its buyer; a
        // public form does not — anyone can type a lead's number into it. So
        // the enquiry is history and news, never an edit: no reopening a
        // closed lead, no merged requirement, no note, no new holder. What was
        // said goes on the timeline, written by System so it is not contact.
        const r = lead.req || {};
        const said = [r.notes, r.interest && `Interested in: ${Array.isArray(r.interest) ? r.interest.join(', ') : r.interest}`].filter(Boolean).join(' · ');
        const session = await recordEnquiry({
          leadId: existing.id, at: enquiredAt,
          source: integration.provider, integrationId: args.integrationId,
          req: lead.req, enquiryId: (lead as any).external_id || null, rawRef: inboxId,
        });
        await addTimelineEvent({
          record_id: existing.id, type: 'enquiry', title: `Enquiry via ${integration.provider}`,
          description: [lead.name && `As ${lead.name}`, said || 'Enquired again'].filter(Boolean).join(' · '),
          author: 'System', metadata: { source: integration.provider, unverified: true },
        });
        const terminal = existing.stage === REJECTED_STATUS || existing.stage === WON_STATUS;
        if (session?.isNewSession && args.announce !== false) {
          const n = {
            tenantId, type: 'lead_repeat',
            data: { name: existing.name || existing.phone, source: integration.provider, changed: 0, previousStage: terminal ? existing.stage : null },
            link: `?screen=leads&lead=${existing.id}`,
          };
          const keeper = await activeOwnerOf(existing.agent_id);
          await notifyOrDesk(keeper, n).catch(() => 0);
        }
        await mark('merged', { leadId: existing.id });
        return { status: 'merged', leadId: existing.id, previousStage: terminal ? existing.stage : null };
      }
      if (existing) {
        const note = `[Repeat enquiry via ${integration.provider}] ${new Date().toLocaleString(desk.locale.numberLocale, { timeZone: desk.timezone })}`;
        // A repeat enquiry is usually RICHER than the first, and merging used
        // to keep only the note. MagicBricks' early pushes carried name, phone
        // and locality; the ones arriving now carry the budget, the deal type,
        // the configuration and the buyer's own words. All of it was landing
        // on a lead that stayed as thin as the day it was created — which is
        // most of what "the info we're receiving is very less" actually was.
        //
        // Fill only what is EMPTY. An agent who has spoken to this person and
        // corrected their budget outranks a portal repeating its own form.
        const r = lead.req || {};
        const cur = existing.req || {};
        // Filling empties is only half of it. The other half is what to do when
        // the new enquiry DISAGREES, which on bhumi's own traffic it does on 6
        // of the 10 repeat leads that stated a budget — see mergeRepeatReq for
        // what those disagreements actually turned out to be. In short: the
        // budget widens to cover everything they have looked at, the projects
        // accumulate, and a contradicted locality or configuration is reported
        // rather than overwritten, because matching compares those with `===`
        // and a wrong one empties a lead's results instead of loosening them.
        const { req: merged, conflicts } = mergeRepeatReq(cur, r);
        // The newest enquiry's message is appended rather than merged: two
        // enquiries are two things the person said, and the second one is
        // often the one that names a property.
        const said = (v: any) => (Array.isArray(v) ? v.join(', ') : v);
        // The disagreements go where a person reads them. "Says 3 BHK now (had
        // 2 BHK)" is a sentence an agent can act on; silently writing 3 BHK
        // over the top is a fact nobody can tell from one they established
        // themselves.
        const changed = conflicts.map(c => `Says ${said(c.got)} now (had ${said(c.had)})`).join(' · ');
        const extra = [r.notes, r.interest && `Interested in: ${said(r.interest)}`, changed]
          .filter(Boolean).join(' · ');
        // A portal that fires the same enquiry twice — 99acres sent one buyer
        // 0.4s apart under two different enquiry ids, which the idempotency
        // lock above keys on and therefore cannot catch — must not leave two
        // identical notes on the record. Same words already at the top means
        // the same enquiry.
        const head = String((existing.notes || [])[0] || '');
        const sameProvider = head.startsWith(`[Repeat enquiry via ${integration.provider}]`);
        // Identical words at the top means the same enquiry. When the provider
        // maps no message there are no words to compare — Housing.com sends
        // three fields — so the clock stands in: a second enquiry arriving
        // within a minute of the last one is a double-fire, not a person.
        const justNoted = sameProvider &&
          Date.now() - new Date(existing.updated_at || 0).getTime() < 60_000;
        const dupNote = extra ? (sameProvider && head.includes(extra)) : justNoted;
        const notes = dupNote
          ? (existing.notes || [])
          : [extra ? `${note} ${extra}` : note, ...(existing.notes || [])];
        // A BETTER NAME, NEVER A WORSE ONE. Portals send placeholders — bhumi
        // holds six leads called "USER" and one called "MbUser" — and whichever
        // enquiry happened to be first decides what an agent reads before they
        // dial. So a real name replaces a placeholder, and nothing replaces a
        // real name: a person who was "Nilay Nawghare" on Tuesday does not
        // become "MbUser" on Friday because a form was filled in lazily.
        const nameUpgrade = isPlaceholderName(existing.name) && lead.name && !isPlaceholderName(lead.name)
          ? { name: lead.name } : {};

        // THE OWNER DOES NOT CHANGE. Somebody has been working this person —
        // they have the history, and the call they made yesterday is the reason
        // this enquiry exists. Handing the lead to whoever is next in the
        // round-robin because a form was submitted again would take a live
        // conversation away from the person having it.
        //
        // Unless there is nobody to take it away from: a lead nobody owns, or
        // one owned by someone who has left or been deactivated, is routed like
        // a new arrival — otherwise a repeat enquiry lands on a desk no one
        // reads. Every bhumi agent is currently active, so this is the case
        // that has not happened yet rather than one that has. Routed by the
        // firm's arrival rule: under "Leave unassigned" it goes to nobody and
        // the desk is told (notifyOrDesk below).
        const keeper = await activeOwnerOf(existing.agent_id);
        const reassign = keeper ? {} : { agentId: await arrivalLeadAgent() };

        await updateLead(existing.id, {
          notes, req: merged,
          ...nameUpgrade,
          ...reassign,
          ...(!existing.email && lead.email ? { email: lead.email } : {}),
        });
        // 'merged', not 'parsed'. This function has always KNOWN the difference
        // — it returns 'merged' below — and then wrote the same word to the
        // inbox as a push that created a lead, so the activity list said "Lead
        // created" three times for one buyer who exists once.
        // The enquiry itself, recorded as history rather than only narrated in
        // a note. Additive: it changes nothing above it. Sessions, not payloads
        // — see docs/specs/desk-rework.md §2.
        const session = await recordEnquiry({
          leadId: existing.id, at: enquiredAt,
          source: integration.provider, integrationId: args.integrationId,
          req: lead.req, enquiryId: (lead as any).external_id || null, rawRef: inboxId,
        });

        // ONE ALERT PER SESSION, NEVER PER PAYLOAD. One man opened four
        // listings between 18:05 and 18:10; that is one person coming back, and
        // four buzzes would have taught the desk to ignore the fifth. A payload
        // folded into a session already open says nothing new.
        if (session?.isNewSession) {
          // Who holds it NOW: the keeper, or whoever the rota just gave it to.
          // Never the old holder who cannot take work — with nobody, the desk.
          const owner = keeper || (reassign as any).agentId || null;
          // A LEAD WHO COMES BACK IS A LIVE LEAD, whatever it was closed as.
          //
          // This used to branch on the rejection REASON: anything reading as
          // "do not call" stayed shut, everything else reopened. The client
          // overrode that on 23 Aug — the reason is surfaced instead of acted
          // on, so an agent can see this person was rejected, see why, and
          // decide for themselves. Deal Closed reopens too: a buyer who has
          // bought and is asking again is asking about something else, and
          // leads stay leads until there is a Deals module for closed business.
          const terminal = existing.stage === REJECTED_STATUS || existing.stage === WON_STATUS;
          const reason = String((existing as any).rejection_reason || '');
          const { arrivalStage } = await deskConfigOf(integration.tenant_id);

          // AND IT IS REOPENED, not merely described as live.
          //
          // `terminal` and `arrivalStage` were both computed here and neither
          // was ever applied: the alert said "came back", the lead stayed
          // Rejected, and every pile that keys off OPEN — Today, Not contacted,
          // Going cold, the agent's own list — went on ignoring it. On bhumi,
          // 9 leads that enquired again in 30 days were still sitting at
          // Rejected and one at Deal Closed.
          //
          // Through updateLead so it is a stage change like any other: the
          // timeline records it and the ledger records it. The rejection reason
          // is deliberately kept — the record then reads "Was rejected —
          // <why>" beside a live status, which is the thing an agent needs
          // before they ring back.
          if (terminal && existing.stage !== arrivalStage) {
            await updateLead(existing.id, { stage: arrivalStage, preserveRejectionReason: true }, {
              actorType: 'system', actorId: null, actorLabel: `${integration.provider} enquiry`,
            } as any);
          }

          // No separate `lead_repeat_rejected`. It was a second alert about
          // the same arrival, to a different audience, and its link was
          // `/leads/<id>` -- a path this app does not have, so tapping it went
          // nowhere. The rejection is carried as data on the repeat alert
          // below, which the person holding the lead actually receives.
          await notifyOrDesk(owner, {
            tenantId: integration.tenant_id, type: 'lead_repeat',
            data: {
              name: existing.name || existing.phone, source: integration.provider,
              changed: conflicts.length,
              previousStage: terminal ? existing.stage : null,
            },
            link: `?screen=leads&lead=${existing.id}`,
          }).catch(() => {});
        }
        await mark('merged', { leadId: existing.id });
        return { status: 'merged', leadId: existing.id };
      }

      // No agent: createLead applies the firm's arrival rule itself
      // (arrivalLeadAgent: the rota, or nobody under Leave unassigned). A
      // payload never names who gets the lead. The one named agent is
      // `args.agentId`: a buyer form on a shared link with no recipient hands
      // the new lead to the link's sender (buyerAsks.ts), not a person's choice.
      const { external_id, ...leadFields } = lead;
      const created = await createLead({
        ...leadFields,
        received_at: enquiredAt ?? null,
        agentId: args.agentId || undefined, agent_id: undefined,
        stage: 'New',
        source: leadFields.source || integration.provider,
      } as any, undefined, { phoneAsReceived: true, announce: args.announce });

      // The FIRST enquiry gets a row too, so the table is the whole history
      // rather than "everything after the first one" — otherwise a lead that
      // has enquired twice would show a count of one.
      if (created?.id) {
        await recordEnquiry({
          leadId: created.id, at: enquiredAt,
          source: leadFields.source || integration.provider, integrationId: args.integrationId,
          req: lead.req, enquiryId: external_id || null, rawRef: inboxId,
        });
      }
      await mark('parsed', { leadId: created?.id || null });
      return { status: 'ingested', leadId: created?.id || null };
    },
  );
}

/**
 * Replay every push that hasn't safely landed — what you press after
 * configuring a parser, and also what recovers a push that failed against a
 * config that has SINCE been fixed (a stale mapping key, a typo corrected).
 * A 'failed' row never retries itself; without this it would show the same
 * stale error forever even after the thing that caused it is gone.
 *
 * Sequential on purpose: dedup and round-robin both read state that the
 * previous row may have just changed, so running these in parallel would race
 * two enquiries from the same person into two leads and skew the rotation.
 */
export async function replayPending(
  tenantId: string, integrationId?: string,
): Promise<{ processed: number; ingested: number; merged: number; failed: number; ignored: number }> {
  // Pending and failed only. Held pushes are released by releaseHeld(), at the
  // connection's own rate; a button that let them all through at once would
  // be the flood the limit stopped.
  await recoverStaleClaims(tenantId);
  const rows = await claimInbox(tenantId, { statuses: ['pending', 'failed'], integrationId });
  const tally = { processed: 0, ingested: 0, merged: 0, failed: 0, ignored: 0 };
  const integrations = await integrationsById(tenantId, rows.map(r => r.integration_id));
  for (const row of rows) {
    tally.processed++;
    const out = await processClaimed(integrations.get(row.integration_id)!, row);
    if (out === 'ingested') tally.ingested++;
    else if (out === 'merged') tally.merged++;
    else if (out === 'ignored') tally.ignored++;
    else tally.failed++;
  }
  return tally;
}

/** The connections these claimed rows belong to, read once. */
async function integrationsById(tenantId: string, ids: string[]): Promise<Map<string, Integration>> {
  const uniq = [...new Set(ids)];
  if (!uniq.length) return new Map();
  const found = await sql`
    SELECT id, tenant_id, provider, api_key_last4, parser_config, active, created_at, created_by, last_received_at
      FROM integrations WHERE tenant_id = ${tenantId} AND id IN ${sql(uniq)}`;
  return new Map((found as unknown as Integration[]).map(i => [i.id, i]));
}

/** One claimed row through the one path, its outcome written whatever happens. */
export async function processClaimed(integration: Integration, row: ClaimedRow): Promise<string> {
  try {
    const out = await processInboxRow(integration, row.id, row.raw_body, { receivedAt: row.received_at });
    return out.status;
  } catch (err: any) {
    await markInbox(row.id, 'failed', { error: err.message }).catch(() => {});
    return 'failed';
  }
}

/**
 * HELD PUSHES RELEASE THEMSELVES. A push over a connection's minute or hour
 * limit is kept as `held` (spendIngestPush); this turns them into leads,
 * oldest first, spending the SAME allowance a live push spends — so a backlog
 * drains at the connection's own rate and never faster, and a connection that
 * keeps flooding just keeps its backlog until the day cap stops holding more.
 * Run by the routing sweep's timer (index.ts) for every tenant with held rows,
 * with the tenant passed in, never read from a request context.
 *
 * A held push the portal has since resent, and that resend was processed,
 * is a duplicate, not a second enquiry: it is marked ignored against that
 * lead, with no repeat alert. Same body, same connection, accepted no earlier
 * than 15 minutes before the held one arrived (the window landEnquiry treats
 * identical bodies as one retry).
 */
export async function releaseHeld(tenantId: string): Promise<{ released: number; duplicates: number }> {
  if (!tenantId) throw new Error('releaseHeld: tenantId is required');
  await recoverStaleClaims(tenantId);
  const conns = await sql`
    SELECT w.integration_id FROM webhook_inbox w
      JOIN integrations g ON g.id = w.integration_id AND g.tenant_id = w.tenant_id
     WHERE w.tenant_id = ${tenantId} AND w.status = 'held' AND g.parser_config IS NOT NULL
     GROUP BY w.integration_id`;
  const integrations = await integrationsById(tenantId, (conns as any[]).map(c => c.integration_id));
  let released = 0, duplicates = 0;
  for (const integration of integrations.values()) {
    for (;;) {
      // The day cap first: past it, nothing more becomes a lead today.
      const day = await pushesToday(tenantId, integration.id);
      if (day.accepted >= INGEST_LIMITS.perDay) break;
      if (!hit(`ingest-min:${integration.id}`, INGEST_LIMITS.perMinute, 60_000)) break;
      if (!hit(`ingest-hour:${integration.id}`, INGEST_LIMITS.perHour, 3_600_000)) break;
      const [row] = await claimInbox(tenantId, { statuses: ['held'], integrationId: integration.id, limit: 1 });
      if (!row) break;
      const [dup] = await sql`
        SELECT o.lead_id FROM webhook_inbox o
         WHERE o.tenant_id = ${tenantId} AND o.integration_id = ${integration.id} AND o.id <> ${row.id}
           AND o.status IN ('parsed', 'merged', 'ignored') AND o.lead_id IS NOT NULL
           AND o.received_at >= ${row.received_at}::timestamptz - interval '15 minutes'
           AND md5(o.raw_body::text) = (SELECT md5(h.raw_body::text) FROM webhook_inbox h WHERE h.id = ${row.id})
         ORDER BY o.received_at LIMIT 1`;
      if (dup) {
        await markInbox(row.id, 'ignored', { leadId: dup.lead_id, error: 'Resent by the portal; the resend was processed' });
        duplicates++;
        continue;
      }
      await processClaimed(integration, row);
      released++;
    }
  }
  if (released || duplicates) console.log(`[Ingest] ${tenantId}: released ${released} held push(es), ${duplicates} already resent`);
  // OLDER THAN TWO HOURS IS A FAILURE. At the limits a backlog drains within
  // the hour; one still waiting after two means the release is not keeping up
  // or not running, and nothing on screen says so.
  const stuck = await sql`
    SELECT w.integration_id, count(*)::int AS n, min(w.received_at) AS oldest
      FROM webhook_inbox w
      JOIN integrations g ON g.id = w.integration_id AND g.tenant_id = w.tenant_id
     WHERE w.tenant_id = ${tenantId} AND w.status = 'held' AND g.parser_config IS NOT NULL
       AND w.received_at < NOW() - interval '2 hours'
     GROUP BY w.integration_id`;
  for (const r of stuck as any[]) {
    console.error(`[Ingest] ✗ HELD PUSHES NOT RELEASED: tenant ${tenantId}, connection ${r.integration_id}: ${r.n} held, oldest ${new Date(r.oldest).toISOString()}`);
  }
  return { released, duplicates };
}

/** releaseHeld for every tenant with held pushes, or a claim a stopped run
 *  left behind (put back there), one tenant after another. */
export async function releaseHeldAll(): Promise<void> {
  const tenants = await sql`SELECT DISTINCT tenant_id FROM webhook_inbox WHERE status IN ('held', 'processing')`;
  for (const t of tenants as any[]) {
    await releaseHeld(t.tenant_id).catch(err => console.warn(`[Ingest] ${t.tenant_id}: held release failed:`, err?.message));
  }
}
