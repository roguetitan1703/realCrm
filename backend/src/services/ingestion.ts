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
import { getLeads, createLead, updateLead, nextRoutedAgent } from './store';
import { runWithContext } from './context';
import { queueManager } from './queue';

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
const hashKey = (key: string) => crypto.createHash('sha256').update(key.trim()).digest('hex');

/** `sk_live_` + 32 bytes. The prefix makes a leaked key obvious in a log or a
 *  git diff, and secret scanners key off exactly this shape. */
function mintKey(): string {
  return 'sk_live_' + crypto.randomBytes(32).toString('hex');
}

/**
 * The key is ALSO kept encrypted, alongside the hash.
 *
 * Hash-only is the stricter posture, and it is the right one for a password.
 * It is the wrong one here: this key lives in someone else's system — a portal's
 * webhook config — and "we can't tell you what we gave you" means the only
 * recovery is a rotation, which breaks the live feed until the portal is
 * re-briefed. That is a real outage caused by a property we gained nothing from.
 *
 * So: encrypted at rest with a server-held secret, readable only through an
 * authenticated, audited endpoint. A stolen database dump is still useless
 * without the secret, and the inbound lookup keeps using the hash.
 */
const encSecret = crypto.createHash('sha256')
  .update(process.env.INGEST_KEY_SECRET || process.env.JWT_SECRET || 'dev-only-change-me')
  .digest();

function encryptKey(key: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encSecret, iv);
  const enc = Buffer.concat([cipher.update(key, 'utf8'), cipher.final()]);
  return `v1.${iv.toString('base64')}.${cipher.getAuthTag().toString('base64')}.${enc.toString('base64')}`;
}

function decryptKey(blob: string | null): string | null {
  if (!blob) return null;
  const [v, iv, tag, data] = String(blob).split('.');
  if (v !== 'v1' || !iv || !tag || !data) return null;
  try {
    const d = crypto.createDecipheriv('aes-256-gcm', encSecret, Buffer.from(iv, 'base64'));
    d.setAuthTag(Buffer.from(tag, 'base64'));
    return Buffer.concat([d.update(Buffer.from(data, 'base64')), d.final()]).toString('utf8');
  } catch {
    // Wrong secret, or a tampered row. Either way there is no key to show, and
    // guessing is not an option — the caller offers a rotation instead.
    return null;
  }
}

/** The plaintext key for a connection. Callers must have checked the role and
 *  must write an audit entry — reading a credential is an event. */
export async function revealKey(tenantId: string, id: string): Promise<string | null> {
  const rows = await sql`
    SELECT api_key_enc FROM integrations WHERE id = ${id} AND tenant_id = ${tenantId} LIMIT 1
  `;
  return rows.length ? decryptKey(rows[0].api_key_enc) : null;
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
    VALUES (${id}, ${tenantId}, ${provider}, ${hashKey(apiKey)}, ${encryptKey(apiKey)}, ${apiKey.slice(-4)}, TRUE, ${createdBy})
    RETURNING id, tenant_id, provider, api_key_last4, parser_config, active, created_at, created_by, last_received_at
  `;
  return { integration: rows[0] as Integration, apiKey };
}

/** Rotate: the old key stops working the moment this returns. */
export async function rotateIntegrationKey(tenantId: string, id: string): Promise<string | null> {
  const apiKey = mintKey();
  const rows = await sql`
    UPDATE integrations SET api_key_hash = ${hashKey(apiKey)}, api_key_enc = ${encryptKey(apiKey)},
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
}): Promise<string> {
  const id = rid('wh');
  await sql`
    INSERT INTO webhook_inbox (id, tenant_id, integration_id, source_ip, headers, raw_body, status)
    VALUES (${id}, ${args.integration.tenant_id}, ${args.integration.id}, ${args.ip},
            ${sql.json(safeHeaders(args.headers))}, ${sql.json(args.body ?? {})}, 'pending')
  `;
  await sql`UPDATE integrations SET last_received_at = NOW() WHERE id = ${args.integration.id}`;
  return id;
}

export async function markInbox(
  id: string, status: 'parsed' | 'failed' | 'ignored', extra: { leadId?: string | null; error?: string | null } = {},
): Promise<void> {
  await sql`
    UPDATE webhook_inbox
    SET status = ${status}, lead_id = ${extra.leadId ?? null},
        error = ${extra.error ? String(extra.error).slice(0, 500) : null}, parsed_at = NOW()
    WHERE id = ${id}
  `;
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
  ip: string | null; presentedKey: string; path: string; tenantHint?: string | null;
}): Promise<void> {
  const prefix = String(args.presentedKey || '').slice(0, 12) || '(none)';
  const day = new Date().toISOString().slice(0, 10);
  const id = `rej_${day}_${crypto.createHash('sha1').update(`${args.ip}|${prefix}`).digest('hex').slice(0, 12)}`;
  await sql`
    INSERT INTO ingest_rejects (id, ip, key_prefix, path, tenant_hint, note, count)
    VALUES (${id}, ${args.ip}, ${prefix}, ${args.path}, ${args.tenantHint ?? null}, 'invalid or unknown key', 1)
    ON CONFLICT (id) DO UPDATE SET count = ingest_rejects.count + 1, received_at = NOW()
  `;
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
): Promise<{ status: string; leadId?: string | null; reason?: string }> {
  // Sanitised at the point of use, not only when the mapper saves — a config
  // stored before the target vocabulary was normalised (flat "locality" from
  // before the req.* namespace existed) would otherwise fail every push with
  // the same error forever, until someone happened to reopen the mapper and
  // re-save. This way the very next push after the fix ships parses clean.
  const { clean } = sanitizeConfig(integration.parser_config as any);
  const parsed = parsePayload(body, clean);
  if (!parsed.ok) {
    const why = parsed.errors.length
      ? parsed.errors.join(' ')
      : `Payload is missing ${parsed.missing.join(' and ')}.`;
    await markInbox(inboxId, 'failed', { error: why });
    return { status: 'failed', reason: why };
  }

  return await runWithContext(
    {
      tenantId: integration.tenant_id, userId: null, role: 'system',
      actorType: 'system', actorLabel: `ingest:${integration.provider}`,
    } as any,
    async () => {
      const lead = parsed.lead;
      const cleanPhone = String(lead.phone || '').replace(/[^0-9+]/g, '');

      // Idempotency: a portal that retries because our ack was slow must not
      // create the lead twice. Keyed on the provider's own id when they send
      // one, since that is the only identifier that survives a retry intact.
      const externalId = lead.external_id || cleanPhone;
      const lockKey = `ingest:${integration.id}:${externalId}`;
      if (queueManager.checkIdempotencyLock(lockKey)) {
        await markInbox(inboxId, 'ignored', { error: 'Duplicate of a push already processed' });
        return { status: 'ignored', reason: 'idempotent retry' };
      }
      queueManager.setIdempotencyLock(lockKey, 604800);

      // Dedup on the phone number within the tenant: the same buyer enquiring
      // twice is one lead with two enquiries, not two leads.
      const leads = await getLeads();
      const existing = leads.find(l => l.phone && l.phone.replace(/[^0-9+]/g, '') === cleanPhone);
      if (existing) {
        const note = `[Repeat enquiry via ${integration.provider}] ${new Date().toLocaleString('en-IN')}`;
        await updateLead(existing.id, { notes: [note, ...(existing.notes || [])] });
        await markInbox(inboxId, 'parsed', { leadId: existing.id });
        return { status: 'merged', leadId: existing.id };
      }

      // Round-robin among agents actually on duty. One atomic statement, not
      // a separate read-then-write — this used to be its own copy of the
      // same logic createLead() has, and both copies raced the same way: a
      // batch of pushes arriving close together would all read the counter
      // before any of their writes landed, so they'd all pick the same
      // person. See nextRoutedAgent()'s doc comment.
      const agentId = await nextRoutedAgent();

      const { external_id, ...leadFields } = lead;
      const created = await createLead({
        ...leadFields,
        stage: 'New',
        agentId,
        source: leadFields.source || integration.provider,
      } as any);

      await markInbox(inboxId, 'parsed', { leadId: created?.id || null });
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
  const rows = await sql`
    SELECT id, integration_id, raw_body FROM webhook_inbox
    WHERE tenant_id = ${tenantId} AND status IN ('pending', 'failed') AND raw_body IS NOT NULL
      ${integrationId ? sql`AND integration_id = ${integrationId}` : sql``}
    ORDER BY received_at ASC
  `;
  const tally = { processed: 0, ingested: 0, merged: 0, failed: 0, ignored: 0 };
  const cache = new Map<string, Integration | null>();

  for (const row of rows as any[]) {
    if (!cache.has(row.integration_id)) {
      const found = await sql`
        SELECT id, tenant_id, provider, api_key_last4, parser_config, active, created_at, created_by, last_received_at
        FROM integrations WHERE id = ${row.integration_id} LIMIT 1
      `;
      cache.set(row.integration_id, (found[0] as Integration) || null);
    }
    const integration = cache.get(row.integration_id);
    // No parser still means no lead — replaying can't invent one.
    if (!integration?.parser_config) continue;

    tally.processed++;
    try {
      const out = await processInboxRow(integration, row.id, row.raw_body);
      if (out.status === 'ingested') tally.ingested++;
      else if (out.status === 'merged') tally.merged++;
      else if (out.status === 'ignored') tally.ignored++;
      else tally.failed++;
    } catch (err: any) {
      tally.failed++;
      await markInbox(row.id, 'failed', { error: err.message }).catch(() => {});
    }
  }
  return tally;
}
