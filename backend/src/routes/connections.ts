/**
 * ============================================================================
 * 🔌 CONNECTIONS — manage integrations, keys, inbox, parser (spec: ingestion.md)
 * ============================================================================
 * The tenant-facing half of D1. `/ingest` is what providers POST to; this is
 * what the firm uses to create a connection, see what has arrived, and say how
 * to read it.
 *
 * RBAC, straight from the spec:
 *   • owner + manager — connections, keys, activity. Day-to-day operations.
 *   • owner only (+ superadmin) — the PARSER MAPPING, because a bad mapping
 *     silently mis-files every future lead, which is a different order of
 *     blast radius from pausing a connection.
 *
 * And the guardrail that makes tenant-editing safe at all: a mapping cannot be
 * saved without being run against a real payload first. `POST /:id/preview` is
 * that run, and it uses the same parser the live push uses — a preview that
 * approximated the real thing would be worse than none.
 * ============================================================================
 */

import { Router, Request, Response } from 'express';
import {
  createIntegration, listIntegrations, rotateIntegrationKey, setParserConfig,
  setIntegrationActive, deleteIntegration, listInbox, inboxCounts, lastPayload,
  replayPending, getIntegration,
} from '../services/ingestion';
import { parsePayload, suggestConfig, flattenPaths, TRANSFORMS } from '../services/parser';
import { audit } from '../services/audit';

export const connectionsRouter = Router();

const tenantOf = (req: Request): string | null => (req as any).user?.tenant_id ?? null;
const roleOf = (req: Request): string => String((req as any).user?.role || '');
const userOf = (req: Request): string | null => (req as any).user?.id ?? null;

/** Connections and keys: owner or manager. */
function requireManager(req: Request, res: Response): boolean {
  const role = roleOf(req);
  if (['owner', 'manager', 'superadmin'].includes(role)) return true;
  res.status(403).json({ error: 'Forbidden', message: 'Only an owner or manager can manage connections.' });
  return false;
}

/** The parser mapping: owner only. A mis-map does not fail loudly — it files
 *  every future lead wrongly, and nobody notices until the numbers are wrong. */
function requireOwner(req: Request, res: Response): boolean {
  const role = roleOf(req);
  if (['owner', 'superadmin'].includes(role)) return true;
  res.status(403).json({ error: 'Forbidden', message: 'Only the workspace owner can change how a provider is read.' });
  return false;
}

function requireTenant(req: Request, res: Response): string | null {
  const t = tenantOf(req);
  if (!t) { res.status(401).json({ error: 'Not authenticated' }); return null; }
  return t;
}

// ---------------------------------------------------------------------------
// Connections
// ---------------------------------------------------------------------------

connectionsRouter.get('/', async (req: Request, res: Response) => {
  const tenant = requireTenant(req, res); if (!tenant) return;
  const [rows, counts] = await Promise.all([listIntegrations(tenant), inboxCounts(tenant)]);
  return res.status(200).json({
    success: true,
    connections: rows.map(r => ({
      ...r,
      // Never the key, never the hash — only whether one exists and its last4.
      hasKey: !!r.api_key_last4,
      configured: !!r.parser_config,
      counts: counts[r.id] || {},
    })),
  });
});

connectionsRouter.post('/', async (req: Request, res: Response) => {
  const tenant = requireTenant(req, res); if (!tenant) return;
  if (!requireManager(req, res)) return;

  const provider = String(req.body?.provider || '').trim();
  if (!provider) return res.status(400).json({ error: 'A name is required for the connection.' });
  if (provider.length > 60) return res.status(400).json({ error: 'That name is too long.' });

  const { integration, apiKey } = await createIntegration(tenant, provider, userOf(req));
  audit({
    tenant_id: tenant, actor_type: 'user', actor_id: userOf(req), actor_label: (req as any).user?.name ?? null,
    action: 'integration.create', target_type: 'integration', target_id: integration.id,
    summary: `Connection "${provider}" created`, metadata: { provider },
  });
  // The key is returned exactly once. It is not stored in a form we can read
  // back, so the UI must say so at the moment it shows it.
  return res.status(201).json({ success: true, connection: { ...integration, configured: false }, apiKey, showOnce: true });
});

connectionsRouter.post('/:id/rotate', async (req: Request, res: Response) => {
  const tenant = requireTenant(req, res); if (!tenant) return;
  if (!requireManager(req, res)) return;
  const apiKey = await rotateIntegrationKey(tenant, req.params.id);
  if (!apiKey) return res.status(404).json({ error: 'No such connection' });
  audit({
    tenant_id: tenant, actor_type: 'user', actor_id: userOf(req), actor_label: (req as any).user?.name ?? null,
    action: 'integration.rotate_key', target_type: 'integration', target_id: req.params.id,
    summary: 'Connection key rotated', metadata: {},
  });
  // Said plainly, because rotating breaks the provider until they are updated.
  return res.status(200).json({ success: true, apiKey, showOnce: true, note: 'The previous key stopped working just now.' });
});

connectionsRouter.patch('/:id', async (req: Request, res: Response) => {
  const tenant = requireTenant(req, res); if (!tenant) return;
  if (!requireManager(req, res)) return;
  if (typeof req.body?.active !== 'boolean') return res.status(400).json({ error: 'active must be true or false' });
  const ok = await setIntegrationActive(tenant, req.params.id, req.body.active);
  if (!ok) return res.status(404).json({ error: 'No such connection' });
  audit({
    tenant_id: tenant, actor_type: 'user', actor_id: userOf(req), actor_label: (req as any).user?.name ?? null,
    action: req.body.active ? 'integration.resume' : 'integration.pause',
    target_type: 'integration', target_id: req.params.id,
    summary: `Connection ${req.body.active ? 'resumed' : 'paused'}`, metadata: {},
  });
  return res.status(200).json({ success: true });
});

connectionsRouter.delete('/:id', async (req: Request, res: Response) => {
  const tenant = requireTenant(req, res); if (!tenant) return;
  if (!requireManager(req, res)) return;
  const ok = await deleteIntegration(tenant, req.params.id);
  if (!ok) return res.status(404).json({ error: 'No such connection' });
  audit({
    tenant_id: tenant, actor_type: 'user', actor_id: userOf(req), actor_label: (req as any).user?.name ?? null,
    action: 'integration.delete', target_type: 'integration', target_id: req.params.id,
    summary: 'Connection deleted (received history kept)', metadata: {},
  });
  return res.status(200).json({ success: true });
});

// ---------------------------------------------------------------------------
// Activity
// ---------------------------------------------------------------------------

connectionsRouter.get('/inbox', async (req: Request, res: Response) => {
  const tenant = requireTenant(req, res); if (!tenant) return;
  const rows = await listInbox(tenant, {
    integrationId: req.query.connection as string | undefined,
    status: req.query.status as string | undefined,
    limit: Number(req.query.limit) || 50,
  });
  return res.status(200).json({ success: true, pushes: rows });
});

// ---------------------------------------------------------------------------
// Parser
// ---------------------------------------------------------------------------

/** The sample to map from, plus every path in it and the transforms available.
 *  Everything the mapper UI needs to offer real choices instead of asking
 *  someone to type dot-paths from memory. */
connectionsRouter.get('/:id/sample', async (req: Request, res: Response) => {
  const tenant = requireTenant(req, res); if (!tenant) return;
  const integration = await getIntegration(tenant, req.params.id);
  if (!integration) return res.status(404).json({ error: 'No such connection' });

  const payload = await lastPayload(tenant, req.params.id);
  return res.status(200).json({
    success: true,
    payload,
    paths: payload ? flattenPaths(payload) : {},
    transforms: Object.keys(TRANSFORMS),
    config: integration.parser_config,
    // No payload means no mapping is possible yet, and saying so is the point:
    // "no blind presets" — a mapping can only be built from real data.
    suggestion: payload ? suggestConfig(payload, integration.provider) : null,
  });
});

/**
 * Run a candidate mapping against a real payload WITHOUT saving. This is the
 * mandatory step before save: it returns the lead that would be created and a
 * field-by-field trace of where each value came from, so a mis-map is visible
 * before it can affect anything.
 */
connectionsRouter.post('/:id/preview', async (req: Request, res: Response) => {
  const tenant = requireTenant(req, res); if (!tenant) return;
  if (!requireOwner(req, res)) return;

  const payload = req.body?.payload ?? await lastPayload(tenant, req.params.id);
  if (!payload) {
    return res.status(400).json({
      error: 'Nothing to test against',
      message: 'This connection has not received a payload yet. Ask the provider to send one, then map it.',
    });
  }
  const result = parsePayload(payload, req.body?.config ?? null);
  return res.status(200).json({ success: true, ...result, testedAgainst: payload });
});

connectionsRouter.put('/:id/parser', async (req: Request, res: Response) => {
  const tenant = requireTenant(req, res); if (!tenant) return;
  if (!requireOwner(req, res)) return;

  const config = req.body?.config ?? null;
  if (config !== null) {
    // The guardrail, enforced on the SERVER. A UI that merely shows a preview
    // can be skipped by anything that calls the API directly; refusing a config
    // that does not parse is what actually prevents a broken mapping landing.
    const payload = await lastPayload(tenant, req.params.id);
    if (!payload) {
      return res.status(400).json({
        error: 'No payload to verify against',
        message: 'A mapping can only be saved once this connection has received real data.',
      });
    }
    const check = parsePayload(payload, config);
    if (!check.ok) {
      return res.status(400).json({
        error: 'That mapping does not produce a usable lead',
        message: check.errors.length ? check.errors.join(' ') : `It leaves ${check.missing.join(' and ')} empty.`,
        preview: check,
      });
    }
  }

  const ok = await setParserConfig(tenant, req.params.id, config);
  if (!ok) return res.status(404).json({ error: 'No such connection' });
  audit({
    tenant_id: tenant, actor_type: 'user', actor_id: userOf(req), actor_label: (req as any).user?.name ?? null,
    action: 'integration.parser_set', target_type: 'integration', target_id: req.params.id,
    summary: config ? 'Field mapping saved' : 'Field mapping cleared', metadata: { config },
  });
  return res.status(200).json({ success: true });
});

/** Process everything that arrived before the mapping existed. */
connectionsRouter.post('/:id/replay', async (req: Request, res: Response) => {
  const tenant = requireTenant(req, res); if (!tenant) return;
  if (!requireManager(req, res)) return;
  const tally = await replayPending(tenant, req.params.id);
  audit({
    tenant_id: tenant, actor_type: 'user', actor_id: userOf(req), actor_label: (req as any).user?.name ?? null,
    action: 'integration.replay', target_type: 'integration', target_id: req.params.id,
    summary: `Replayed ${tally.processed} pending push${tally.processed === 1 ? '' : 'es'}`, metadata: tally,
  });
  return res.status(200).json({ success: true, ...tally });
});

// ---------------------------------------------------------------------------
// D2 — the setup pack
// ---------------------------------------------------------------------------

/**
 * What the firm forwards to their provider. Generic on purpose: the endpoint
 * does not care who is calling, so there is one pack rather than a page per
 * portal — and a page per portal would rot the moment a portal changed its UI.
 *
 * The key is NOT included. It cannot be: we only stored a hash. The pack is
 * generated with a freshly rotated key at the moment of sending, or the firm
 * pastes in the key they saved.
 */
connectionsRouter.get('/:id/setup-pack', async (req: Request, res: Response) => {
  const tenant = requireTenant(req, res); if (!tenant) return;
  if (!requireManager(req, res)) return;
  const integration = await getIntegration(tenant, req.params.id);
  if (!integration) return res.status(404).json({ error: 'No such connection' });

  const base = process.env.PUBLIC_API_URL || `${req.protocol}://${req.get('host')}`;
  const endpoint = `${base}/api/v1/ingest/${tenant}`;
  const keyToken = String(req.query.key || 'YOUR_API_KEY');

  const email = [
    `Subject: Sending enquiries to ${integration.provider} — technical setup`,
    '',
    'Hello,',
    '',
    'Please send our enquiries to the endpoint below. Any JSON body is fine —',
    'we map your field names on our side, so nothing needs to change at your end',
    'to match a format.',
    '',
    `  Endpoint:  POST ${endpoint}`,
    `  Auth:      header  X-API-Key: ${keyToken}`,
    `             (or add ?key=${keyToken} to the URL if you cannot set headers)`,
    '  Body:      application/json',
    '',
    'Example:',
    '',
    `  curl -X POST "${endpoint}" \\`,
    `    -H "X-API-Key: ${keyToken}" \\`,
    '    -H "Content-Type: application/json" \\',
    `    -d '{"name":"Test Enquiry","phone":"9876543210","locality":"Wakad"}'`,
    '',
    'A 200 response means we received it. Please send one test enquiry first —',
    'we confirm it arrived before you switch the live feed on.',
    '',
    'Thank you.',
  ].join('\n');

  return res.status(200).json({
    success: true,
    endpoint,
    headerName: 'X-API-Key',
    provider: integration.provider,
    email,
    curl: `curl -X POST "${endpoint}" -H "X-API-Key: ${keyToken}" -H "Content-Type: application/json" -d '{"name":"Test Enquiry","phone":"9876543210"}'`,
  });
});
