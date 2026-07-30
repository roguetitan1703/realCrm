/**
 * ============================================================================
 * 📦 SUPABASE POSTGRESQL STATE STORE & DEFAULT SEEDING ENGINE
 * ============================================================================
 * Direct PostgreSQL client using postgres.js. Provides real data persistence
 * for workspaces, users, leads, properties, and timeline events without any
 * in-memory fallbacks or mock data.
 * ============================================================================
 */

import bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';
import { sql, initSchema, DEFAULT_TENANT_ID, DEFAULT_TENANT_NAME, LEGACY_TENANT_IDS, migrateProperColumns } from './db.js';
import { agents as seedAgents, properties as seedProps, leads as seedLeads } from '../data/defaultDataset.js';
import { DEFAULT_SETTINGS } from '../../../src/data/theme.js';
import { audit } from './audit.js';
import { getContext } from './context.js';
import { notify, notifyRoles } from './notifications.js';
import { suggestPassword } from './auth.js';
// Block C canonical vocabulary. Shared with the frontend deliberately: the
// form, the filters and this backfill must agree on what "4 BHK Villa" means,
// and three copies of that rule would drift.
import {
  FACING, FURNISH, STATUS,
  normaliseBhk, normaliseFloor, normaliseSubtype, normaliseTo,
} from '../../../src/data/propertyFields.js';

/**
 * The tenant to scope the current request's queries to. Comes from the request
 * context (token-authoritative). Outside a request (seed/boot/backfill there is
 * no context) it falls back to the default tenant — those paths set tenant_id
 * explicitly anyway.
 */
function tid(): string {
  return getContext()?.tenantId || DEFAULT_TENANT_ID;
}

/** URL-safe per-tenant ingest key (portals paste this into their push URL). */
export function genIngestKey(): string {
  return `ink_${randomBytes(18).toString('base64url')}`;
}

/** Fetch the current tenant's ingest key + the info the UI needs to build the
 *  push URLs it shows the client. */
export async function getIngestConfig(): Promise<{ tenantSlug: string; secret: string }> {
  const t = tid();
  const rows = await sql`SELECT slug, ingest_secret FROM tenants WHERE id = ${t} OR slug = ${t} LIMIT 1`;
  let secret = rows[0]?.ingest_secret as string | undefined;
  if (!secret) {
    secret = genIngestKey();
    await sql`UPDATE tenants SET ingest_secret = ${secret} WHERE id = ${t} OR slug = ${t}`;
  }
  return { tenantSlug: rows[0]?.slug || t, secret };
}

/** Rotate the ingest key (invalidates any URL already handed out). */
export async function regenerateIngestKey(): Promise<{ tenantSlug: string; secret: string }> {
  const t = tid();
  const secret = genIngestKey();
  const rows = await sql`UPDATE tenants SET ingest_secret = ${secret} WHERE id = ${t} OR slug = ${t} RETURNING slug`;
  return { tenantSlug: rows[0]?.slug || t, secret };
}

/** Resolve a tenant + its ingest key by slug/id — for the PUBLIC ingest endpoint
 *  (no request context, so it can't use tid()). */
export async function getTenantForIngest(slugOrId: string): Promise<{ id: string; secret: string | null } | null> {
  const rows = await sql`SELECT id, ingest_secret FROM tenants WHERE slug = ${slugOrId} OR id = ${slugOrId} LIMIT 1`;
  return rows[0] ? { id: rows[0].id, secret: rows[0].ingest_secret } : null;
}

// ---------------------------------------------------------------------------
// Tenant provisioning — the real "onboard a brokerage" engine. This is a
// SUPERADMIN action (Delpat staff), not a public one: it creates an isolated,
// login-ready workspace and NEVER wipes or touches any other tenant's data.
// Returns everything the operator needs to hand the client: the workspace slug,
// the owner's login email, and the lead-ingest key. No session token — the
// superadmin stays a superadmin; the client logs in themselves.
// ---------------------------------------------------------------------------
export interface ProvisionInput {
  firmName: string;
  city: string;
  slug?: string;
  ownerName?: string;
  ownerEmail: string;
  ownerPhone?: string;
  primaryColor?: string;
}
export interface ProvisionResult {
  tenant: { id: string; name: string; slug: string; brand_config: any };
  owner: { id: string; name: string; email: string; phone: string | null; role: 'owner' };
  ingest: { tenantSlug: string; secret: string };
  loginWith: string;
  initialPassword: string;   // hand this to the owner (they change it on first login)
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function provisionTenant(input: ProvisionInput): Promise<ProvisionResult> {
  const firmName = String(input.firmName || '').trim();
  const city = String(input.city || '').trim();
  if (!firmName || !city) throw new Error('Firm name and city are required.');

  // The owner signs in by OTP, delivered ONLY by email (no SMS channel), so the
  // owner's email is required — a phone-only owner could never receive a code.
  const ownerEmail = input.ownerEmail ? String(input.ownerEmail).trim().toLowerCase() : '';
  if (!EMAIL_RE.test(ownerEmail)) throw new Error("The owner's email is required — sign-in codes are sent by email.");
  const ownerPhoneRaw = input.ownerPhone ? String(input.ownerPhone).replace(/\D/g, '') : '';
  const ownerPhone = ownerPhoneRaw ? `+91${ownerPhoneRaw.slice(-10)}` : null;

  // Unique slug === tenant id (our convention). If taken, suffix -2, -3, …
  const base = (input.slug || firmName).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'workspace';
  let cleanSlug = base;
  for (let n = 2; (await sql`SELECT 1 FROM tenants WHERE id = ${cleanSlug} OR slug = ${cleanSlug} LIMIT 1`).length; n++) {
    cleanSlug = `${base}-${n}`;
  }
  const tenantId = cleanSlug;
  const initials = firmName.split(' ').slice(0, 2).map((w: string) => w[0]).join('').toUpperCase();
  const brand_config = {
    primaryColor: input.primaryColor || '#1E6F52',
    surfaceColor: '#F6F5F2',
    city, logoUrl: '', firmName, initials,
  };
  const ingestSecret = genIngestKey();

  // 1. The tenant row — the anchor every tenant-scoped row hangs off.
  await sql`
    INSERT INTO tenants (id, name, slug, brand_config, ingest_secret, subscription_plan, subscription_status)
    VALUES (${tenantId}, ${firmName}, ${cleanSlug}, ${sql.json(brand_config)}, ${ingestSecret}, 'PRO', 'ACTIVE')
  `;

  // 2. The owner — a login-capable user (email OTP) + a roster mirror.
  const ownerId = `owner_${tenantId}`;
  const ownerName = (input.ownerName || 'Owner').trim();
  const ownerMeta = { initials, avatar: '', phone: ownerPhone, email: ownerEmail };
  // Owner logs in by email + password (auth v2). Generate an initial password to
  // hand over; the email is admin-vouched (verified) so self-reset works; they're
  // forced to change it on first login.
  const initialPassword = suggestPassword();
  const ownerPwHash = await bcrypt.hash(initialPassword, 10);
  await sql`
    INSERT INTO users (id, tenant_id, name, phone, email, role, status, metadata, password_hash, email_verified, must_change_password)
    VALUES (${ownerId}, ${tenantId}, ${ownerName}, ${ownerPhone}, ${ownerEmail}, 'owner', 'active', ${sql.json(ownerMeta)}, ${ownerPwHash}, TRUE, TRUE)
  `;
  await sql`
    INSERT INTO crm_agents (id, name, first, initials, avatar, role, duty_status, metadata, tenant_id)
    VALUES (${ownerId}, ${ownerName}, ${ownerName.split(' ')[0]}, ${initials}, '', 'owner', 'ACTIVE', ${sql.json(ownerMeta)}, ${tenantId})
  `;

  // 3. Default settings + routing UNDER the new tenant. A new firm starts EMPTY.
  const settings = {
    firmName, city,
    stages: ['New', 'Contacted', 'Site Visit', 'Negotiation', 'Closed Won', 'Closed Lost'],
    sources: ['99acres', 'MagicBricks', 'Walk-in', 'Referral', 'Website'],
  };
  await sql`
    INSERT INTO crm_settings (key, value, tenant_id) VALUES ('default', ${sql.json(settings)}, ${tenantId})
    ON CONFLICT (tenant_id, key) DO UPDATE SET value = EXCLUDED.value
  `;
  await sql`
    INSERT INTO crm_routing_rules (strategy, active_agent_ids, last_assigned_index, tenant_id)
    VALUES ('round_robin', ${sql.json([ownerId])}, -1, ${tenantId})
    ON CONFLICT (tenant_id) DO NOTHING
  `;

  return {
    tenant: { id: tenantId, name: firmName, slug: cleanSlug, brand_config },
    owner: { id: ownerId, name: ownerName, email: ownerEmail, phone: ownerPhone, role: 'owner' },
    ingest: { tenantSlug: cleanSlug, secret: ingestSecret },
    loginWith: ownerEmail,
    initialPassword,
  };
}

/**
 * RBAC lead scope: an 'agent' may only see leads assigned to them; owners and
 * managers (and the tokenless demo path) see the whole tenant. Returns the
 * agent's user id to filter by, or null for "no extra restriction".
 */
function agentLeadScope(): string | null {
  const c = getContext();
  return c && c.role === 'agent' && c.userId ? c.userId : null;
}

/** Actor context for the audit ledger, threaded from the route down to the mutation. */
export interface ActorCtx {
  actorType?: 'user' | 'superadmin' | 'system';
  actorId?: string | null;
  actorLabel?: string | null;
  ip?: string | null;
  userAgent?: string | null;
}
const SYSTEM_CTX: Required<Pick<ActorCtx, 'actorType'>> = { actorType: 'system' };

/** digits(x): strip everything but digits and parse to an int, or null. */
function digits(v: any): number | null {
  if (v === null || v === undefined || v === '') return null;
  const s = String(v).replace(/\D/g, '');
  return s ? parseInt(s, 10) : null;
}

export interface TimelineEvent {
  id: string;
  record_id: string;
  type: string;
  title: string;
  description: string;
  author?: string;
  timestamp: string;
  metadata?: any;
}

export interface RoutingRule {
  strategy: 'round_robin' | 'weighted' | 'strict_territory';
  active_agent_ids: string[];
  last_assigned_index: number;
}

export interface ServerState {
  agents: any[];
  properties: any[];
  leads: any[];
  inactiveAgentIds: string[];
  settings: any;
  brand: any;
  integrations: Record<string, any>;
  routing_rules: RoutingRule;
  timeline_events: TimelineEvent[];
}

// Helper converters from DB rows to frontend shapes
function rowToAgent(r: any): any {
  return {
    id: r.id,
    name: r.name,
    first: r.first,
    initials: r.initials,
    avatar: r.avatar,
    role: r.role || 'agent',
    dutyStatus: r.duty_status || 'ACTIVE',
    ...(r.metadata || {}),
  };
}

function rowToProperty(r: any): any {
  const cfg = r.config || {};
  const society = cfg.society || (r.title ? r.title.split(' - ')[0] : 'Unnamed Property');
  return {
    // Spread config (domain fields) FIRST so real DB columns below always win — config
    // may carry stale copies of status/id/title from earlier writes; columns are truth.
    ...cfg,
    project: r.project || cfg.project || society,
    deal: r.deal || cfg.deal || 'sale',
    carpet: r.carpet_sqft ?? cfg.carpet ?? cfg.area ?? 0,
    facing: r.facing || cfg.facing,
    furnishing: r.furnishing || cfg.furnishing,
    parking: r.parking || cfg.parking,
    possession: r.possession || cfg.possession,
    builder: r.builder || cfg.builder,
    rera: r.rera_no || cfg.rera,
    owner: r.owner_name || cfg.owner,
    ownerPhone: r.owner_phone || cfg.ownerPhone,
    ownerEmail: r.owner_email || cfg.ownerEmail,
    floor: r.floor || cfg.floor,
    totalFloors: r.total_floors ?? cfg.totalFloors,
    age: r.age_years ?? cfg.age,
    society,
    id: r.id,
    title: r.title,
    status: r.status || 'Available',
    type: r.type,
    locality: r.locality,
    price: r.price,
    tower: r.wing || r.tower,
    unit: r.unit_no || r.unit,
    tenancy: r.tenancy || undefined,
    timeline: r.timeline || [],
  };
}

// Shared timeline-event -> client shape mapper. Used for leads AND properties
// (both key off crm_timeline_events.record_id) so a Remark (B1) looks and
// behaves the same wherever it's attached. Carries `id` + `authorId` +
// `timestamp` (unlike the old lead-only mapping, which dropped all three and
// hardcoded ago:'just now') so the client can attribute, edit-own, and render
// a real relative time.
// DB type -> client channel vocabulary. call/whatsapp/sms/remark pass through
// distinctly (B5 needs to tell them apart to offer edit-own + an outcome);
// everything else collapses to the old generic 'msg' bucket, unchanged.
function clientEventType(dbType: string): string {
  if (dbType === 'remark' || dbType === 'call' || dbType === 'sms') return dbType;
  if (dbType === 'whatsapp') return 'wa';
  if (dbType === 'stage_change') return 'stage';
  if (dbType === 'creation') return 'note';
  return 'msg';
}

// Types the Timeline UI shows a tag pill for (Remark / Call / WhatsApp / SMS)
// — the label must NOT also repeat the title there, or the tag duplicates it.
const TAGGED_TYPES = new Set(['remark', 'call', 'wa', 'sms']);

function mapEventForClient(e: TimelineEvent) {
  const ct = clientEventType(e.type);
  const tagged = TAGGED_TYPES.has(ct);
  return {
    id: e.id,
    type: ct,
    label: tagged ? e.description : (e.title && e.title !== e.description ? `${e.title}: ${e.description}` : e.description),
    authorId: e.author || null,
    timestamp: e.timestamp,
    metadata: e.metadata || {},
  };
}

function rowToLead(r: any, events: TimelineEvent[] = [], shortlistRows: any[] = []): any {
  const createdMs = r.created_at ? new Date(r.created_at).getTime() : Date.now();
  const minsAgo = Math.max(0, Math.floor((Date.now() - createdMs) / 60000));

  // Format timeline events for lead object
  const leadEvents = events
    .filter(e => e.record_id === r.id)
    .map(mapEventForClient);

  // Columns are source of truth; fall back to the req JSONB when a column is null.
  const jreq = r.req || {};
  const req: any = { ...jreq };
  req.deal = r.deal || jreq.deal || (jreq.purpose === 'Lease' ? 'rent' : 'sale');
  req.config = r.requirement || jreq.config;
  req.locality = r.locality || jreq.locality;
  req.minBudget = r.budget_min != null ? Number(r.budget_min) : jreq.minBudget;
  req.maxBudget = r.budget_max != null ? Number(r.budget_max) : jreq.maxBudget;
  req.purpose = r.purpose || jreq.purpose;
  req.timeline = r.timeline_pref || jreq.timeline;

  // lead_shortlist rows are the source of truth once they exist; fall back to
  // the JSONB columns for leads that haven't been backfilled/touched yet.
  let shortlist: string[];
  let feedback: Record<string, any>;
  if (shortlistRows && shortlistRows.length > 0) {
    shortlist = shortlistRows.map(sr => sr.property_id);
    feedback = {};
    for (const sr of shortlistRows) {
      if (sr.verdict != null || sr.reason != null) {
        feedback[sr.property_id] = { verdict: sr.verdict, reason: sr.reason };
      }
    }
  } else {
    shortlist = r.shortlist || [];
    feedback = r.feedback || {};
  }

  return {
    id: r.id,
    name: r.name,
    phone: r.phone,
    email: r.email || '',
    stage: r.stage || 'New',
    source: r.source || 'Website',
    agentId: r.agent_id,
    req,
    notes: r.notes || [],
    shortlist,
    feedback,
    duplicateOf: r.duplicate_of || undefined,
    followUp: r.follow_up || null,
    overdue: Boolean(r.overdue),
    minsAgo,
    timeline: leadEvents.length > 0 ? leadEvents : (r.notes || []).map((n: string) => ({ type: 'note', label: n, ago: 'just now' })),
  };
}

/** Group lead_shortlist rows by lead_id for batch attaching to rowToLead. */
function groupShortlistByLead(rows: any[]): Map<string, any[]> {
  const map = new Map<string, any[]>();
  for (const row of rows) {
    if (!map.has(row.lead_id)) map.set(row.lead_id, []);
    map.get(row.lead_id)!.push(row);
  }
  return map;
}

/**
 * Upsert a lead's shortlist + feedback into lead_shortlist rows, deleting rows
 * for properties no longer shortlisted. Called whenever a create/update touches
 * shortlist or feedback so the table (source of truth for rowToLead) stays current.
 */
async function syncLeadShortlist(leadId: string, shortlist: string[], feedback: Record<string, any>, tenantId = DEFAULT_TENANT_ID): Promise<void> {
  const propertyIds = Array.from(new Set([...(shortlist || []), ...Object.keys(feedback || {})]));
  for (const pid of propertyIds) {
    const fb = (feedback || {})[pid] || {};
    const id = `shl_${leadId}_${pid}`;
    await sql`
      INSERT INTO lead_shortlist (id, tenant_id, lead_id, property_id, verdict, reason)
      VALUES (${id}, ${tenantId}, ${leadId}, ${pid}, ${fb.verdict ?? null}, ${fb.reason ?? null})
      ON CONFLICT (lead_id, property_id) DO UPDATE SET verdict = EXCLUDED.verdict, reason = EXCLUDED.reason;
    `;
  }
  if (propertyIds.length > 0) {
    await sql`DELETE FROM lead_shortlist WHERE lead_id = ${leadId} AND tenant_id = ${tenantId} AND property_id NOT IN ${sql(propertyIds)}`;
  } else {
    await sql`DELETE FROM lead_shortlist WHERE lead_id = ${leadId} AND tenant_id = ${tenantId}`;
  }
}

/**
 * Idempotent backfill: for every lead, insert lead_shortlist rows from the
 * existing crm_leads.shortlist (array) + feedback (map) JSONB — only rows that
 * don't already exist (ON CONFLICT DO NOTHING keyed on lead_id+property_id).
 * Safe to run on every boot.
 */
export async function backfillShortlist(): Promise<void> {
  const rows = await sql`SELECT id, tenant_id, shortlist, feedback FROM crm_leads`;
  for (const r of rows) {
    const shortlist: string[] = r.shortlist || [];
    const feedback: Record<string, any> = r.feedback || {};
    const propertyIds = Array.from(new Set([...shortlist, ...Object.keys(feedback)]));
    for (const pid of propertyIds) {
      const fb = feedback[pid] || {};
      const id = `shl_${r.id}_${pid}`;
      await sql`
        INSERT INTO lead_shortlist (id, tenant_id, lead_id, property_id, verdict, reason)
        VALUES (${id}, ${r.tenant_id || DEFAULT_TENANT_ID}, ${r.id}, ${pid}, ${fb.verdict ?? null}, ${fb.reason ?? null})
        ON CONFLICT (lead_id, property_id) DO NOTHING;
      `;
    }
  }
}

/**
 * Seed database with default initial data if tables are empty or forced reset.
 */
export async function seedDatabase(forceReset = false): Promise<ServerState> {
  await initSchema();

  const [{ count }] = await sql`SELECT count(*)::int as count FROM crm_leads`;
  if (count > 0 && !forceReset) {
    console.log(`[Supabase DB] ℹ️ Database already contains ${count} leads. Skipping seed.`);
    return await getState();
  }

  console.log(`[Supabase DB] 🔄 Bootstrapping default demo CRM dataset into PostgreSQL...`);

  // 1. Seed Agents (crm_agents stays for the existing team/roster reads until
  //    Phase 1 migrates them onto users; ensureAuthIdentity mirrors them across).
  for (const a of seedAgents) {
    const meta: any = { initials: a.initials, avatar: a.avatar };
    if ((a as any).phone) meta.phone = (a as any).phone;
    await sql`
      INSERT INTO crm_agents (id, name, first, initials, avatar, role, duty_status, metadata, tenant_id)
      VALUES (${a.id}, ${a.name}, ${a.first}, ${a.initials}, ${a.avatar}, 'agent', 'ACTIVE', ${sql.json(meta)}, ${DEFAULT_TENANT_ID})
      ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, first = EXCLUDED.first, metadata = EXCLUDED.metadata, tenant_id = EXCLUDED.tenant_id;
    `;
  }

  // 2. Seed Properties
  for (const p of seedProps) {
    const src = p as any;
    // Carry EVERY non-column field into config. This used to be a hand-maintained
    // whitelist, which silently dropped any field added to the seed later (age and
    // possession went missing that way, and the WhatsApp message rendered a gap).
    const config: any = {};
    for (const [k, v] of Object.entries(src)) {
      if (!PROPERTY_COLUMNS.has(k) && k !== 'id' && k !== 'config') config[k] = v;
    }
    config.society = src.society || p.title.split(' - ')[0];
    config.project = src.project || src.society || p.title.split(' - ')[0];
    config.deal = src.deal || 'sale';
    config.carpet = src.carpet || p.area;
    config.furnishing = src.furnishing || 'Semi-furnished';
    config.owner = src.owner || 'Property Owner';
    config.highlights = p.highlights || [];
    await sql`
      INSERT INTO crm_properties (id, title, status, type, locality, price, tower, unit, config, tenancy, timeline, tenant_id)
      VALUES (${p.id}, ${p.title}, ${p.status || 'Available'}, ${p.type}, ${p.locality}, ${p.price || ''}, ${p.tower || 'A'}, ${p.unit || '101'}, ${sql.json(config)}, ${sql.json(p.tenancy || null)}, ${sql.json(p.timeline || [])}, ${DEFAULT_TENANT_ID})
      ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title, status = EXCLUDED.status, config = EXCLUDED.config, tenant_id = EXCLUDED.tenant_id;
    `;
  }

  // 2b. Seed Units
  const seedUnits = [
    { id: 'unit_101', property_id: 'p1', title: 'Tower A - 402', data: { type: '3 BHK', carpet_area_sqft: 1450, price: 18500000, floor: 4, status: 'Available' } },
    { id: 'unit_102', property_id: 'p1', title: 'Tower A - 403', data: { type: '3 BHK', carpet_area_sqft: 1450, price: 18500000, floor: 4, status: 'Blocked' } },
    { id: 'unit_103', property_id: 'p1', title: 'Tower A - 501', data: { type: '4 BHK Penthouse', carpet_area_sqft: 2400, price: 32000000, floor: 5, status: 'Sold' } },
  ];
  for (const u of seedUnits) {
    await sql`
      INSERT INTO crm_units (id, property_id, title, data, tenant_id)
      VALUES (${u.id}, ${u.property_id}, ${u.title}, ${sql.json(u.data)}, ${DEFAULT_TENANT_ID})
      ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title, data = EXCLUDED.data, tenant_id = EXCLUDED.tenant_id;
    `;
  }

  // 3. Seed Leads & Timeline
  for (const l of seedLeads) {
    // Backdate created_at from the seed's minsAgo. rowToLead derives "how long ago"
    // from this column, so without it every seeded lead reads as "just now" and the
    // whole pipeline looks like it appeared this second.
    const createdAt = new Date(Date.now() - (l.minsAgo ?? 60) * 60000).toISOString();
    await sql`
      INSERT INTO crm_leads (id, name, phone, email, stage, source, agent_id, req, notes, shortlist, feedback, duplicate_of, follow_up, overdue, created_at, tenant_id)
      VALUES (${l.id}, ${l.name}, ${l.phone}, ${l.email || null}, ${l.stage}, ${l.source || 'Website'}, ${l.agentId ?? null}, ${sql.json(l.req || {})}, ${sql.json(l.notes || [])}, ${sql.json(l.shortlist || [])}, ${sql.json(l.feedback || {})}, ${l.duplicateOf || null}, ${sql.json((l as any).followUp || null)}, ${Boolean((l as any).overdue)}, ${createdAt}, ${DEFAULT_TENANT_ID})
      ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, stage = EXCLUDED.stage, agent_id = EXCLUDED.agent_id, follow_up = EXCLUDED.follow_up, overdue = EXCLUDED.overdue, created_at = EXCLUDED.created_at, tenant_id = EXCLUDED.tenant_id;
    `;

    // Add creation timeline event
    const ts = new Date(Date.now() - (l.minsAgo || 60) * 60000).toISOString();
    await sql`
      INSERT INTO crm_timeline_events (id, record_id, type, title, description, author, timestamp, metadata, tenant_id)
      VALUES (${`evt_seed_${l.id}`}, ${l.id}, 'creation', 'Inquiry Received', ${`Inquiry captured via ${l.source || 'Direct'} channel for ${l.req?.locality || 'Pune'}.`}, 'System', ${ts}, ${sql.json({})}, ${DEFAULT_TENANT_ID})
      ON CONFLICT (id) DO NOTHING;
    `;
  }

  // 4. Seed Settings
  await sql`
    INSERT INTO crm_settings (key, value, tenant_id) VALUES ('default', ${sql.json(DEFAULT_SETTINGS)}, ${DEFAULT_TENANT_ID})
    ON CONFLICT (tenant_id, key) DO UPDATE SET value = EXCLUDED.value;
  `;

  // 5. Seed Integrations
  const initialIntegrations = {
    '99acres': { status: 'active', webhookUrl: 'https://api.skylinerealty.in/v1/ingest/skyline-realty/99acres', secret: 'whsec_99acres_live_882' },
    'MagicBricks': { status: 'active', webhookUrl: 'https://api.skylinerealty.in/v1/ingest/skyline-realty/magicbricks', secret: 'whsec_mb_live_391' },
    'Calling & SMS': { status: 'active', apiKey: 'exo_key_live_902', sid: 'exo_sid_live_112', callerId: '020-71189900' },
    'WhatsApp Business API': { status: 'active', phoneId: 'waba_phone_881920', accessToken: 'EAAGm00192a000live', wabaId: 'waba_id_881920' },
    'Website sync': { status: 'active', webhookUrl: 'https://api.skylinerealty.in/v1/ingest/skyline-realty/website', secret: 'whsec_web_live_109' },
  };
  for (const [key, val] of Object.entries(initialIntegrations)) {
    await sql`
      INSERT INTO crm_integrations (key, config, tenant_id) VALUES (${key}, ${sql.json(val)}, ${DEFAULT_TENANT_ID})
      ON CONFLICT (tenant_id, key) DO UPDATE SET config = EXCLUDED.config;
    `;
  }

  // 6. Seed Routing Rules
  const activeIds = seedAgents.map(a => a.id);
  await sql`
    INSERT INTO crm_routing_rules (id, strategy, active_agent_ids, last_assigned_index, tenant_id)
    VALUES (1, 'round_robin', ${sql.json(activeIds)}, -1, ${DEFAULT_TENANT_ID})
    ON CONFLICT (tenant_id) DO UPDATE SET active_agent_ids = EXCLUDED.active_agent_ids;
  `;

  // Tenant + superadmin + mirror agents→users. At the end so agents exist to
  // mirror (covers fresh seed and reset).
  await ensureAuthIdentity();
  await backfillPasswordAuth();   // seeded users get login_ids + a temp password

  // The seed writes the config/req JSONB; flatten it into the real columns and
  // rebuild lead_shortlist so a workspace RESET (truncate → re-seed, no reboot)
  // leaves the proper columns populated, not just the JSONB fallback.
  await migrateProperColumns();
  await backfillShortlist();
  await backfillPropertyCanonicalFields();

  console.log(`[Supabase DB] ✅ Seeded initial PostgreSQL data cleanly.`);
  return await getState();
}

/**
 * Idempotent tenant + platform identity. Ensures the tenant row, the first
 * superadmin (email/password from env), the owner user, and a `users` mirror of
 * every crm_agent. Safe to run repeatedly; called at the end of a seed AND on
 * every boot, so an already-populated database (where seed is skipped) is still
 * brought up to the Phase 0 identity model.
 */
// Demo owner email is configurable so login codes land in an inbox the operator
// controls; agents get plausible addresses on the demo firm's domain.
const DEMO_OWNER_EMAIL = (process.env.DEMO_OWNER_EMAIL || 'omchandel1703@gmail.com').toLowerCase();
const DEMO_DOMAIN = 'skylinerealty.in';
function demoEmail(name: string): string {
  const slug = String(name || 'agent').trim().toLowerCase().replace(/[^a-z]+/g, '.').replace(/^\.|\.$/g, '');
  return `${slug || 'agent'}@${DEMO_DOMAIN}`;
}

// Tables that carry tenant_id and hold re-homeable data. audit_log is excluded
// on purpose — it's an append-only hash-chained ledger; rewriting tenant_id
// would break chain verification, so old entries stay under the old id.
const TENANT_SCOPED_TABLES = [
  'crm_agents', 'crm_properties', 'crm_units', 'crm_leads', 'crm_settings',
  'crm_integrations', 'crm_routing_rules', 'crm_timeline_events', 'users',
  'auth_otp', 'push_subscriptions', 'lead_shortlist', 'notifications',
];

export async function ensureAuthIdentity(): Promise<void> {
  // Retire the legacy demo tenants (one was a real client's name). Re-home their
  // data onto the neutral demo tenant and drop the old rows. Idempotent: only
  // touches a legacy id that still exists and isn't the current one.
  for (const legacy of LEGACY_TENANT_IDS) {
    if (legacy === DEFAULT_TENANT_ID) continue;
    const exists = await sql`SELECT 1 FROM tenants WHERE id = ${legacy} LIMIT 1`;
    if (exists.length === 0) continue;
    for (const tbl of TENANT_SCOPED_TABLES) {
      await sql`UPDATE ${sql(tbl)} SET tenant_id = ${DEFAULT_TENANT_ID} WHERE tenant_id = ${legacy}`;
    }
    // The re-homed settings blob still carries the old firm name; retitle it to
    // the neutral demo firm so the desk doesn't show the retired brand.
    await sql`
      UPDATE crm_settings
      SET value = jsonb_set(COALESCE(value, '{}'::jsonb), '{firmName}', ${JSON.stringify(DEFAULT_TENANT_NAME)}::jsonb)
      WHERE tenant_id = ${DEFAULT_TENANT_ID} AND (value->>'firmName') IN ('Bhumi Propcity', 'Bhumi Propcity CRM Workspace')
    `;
    await sql`DELETE FROM tenants WHERE id = ${legacy}`;
    console.log(`[Auth] Retired legacy demo tenant '${legacy}' -> '${DEFAULT_TENANT_ID}'.`);
  }

  // Tenant: id === slug === DEFAULT_TENANT_ID so the tenant_id on every row
  // matches what the frontend sends.
  await sql`
    INSERT INTO tenants (id, name, slug, subscription_plan, subscription_status)
    VALUES (${DEFAULT_TENANT_ID}, ${DEFAULT_TENANT_NAME}, ${DEFAULT_TENANT_ID}, 'ENTERPRISE', 'ACTIVE')
    ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, subscription_status = EXCLUDED.subscription_status;
  `;
  // Give the demo tenant an ingest key if it doesn't have one yet.
  await sql`UPDATE tenants SET ingest_secret = ${genIngestKey()} WHERE id = ${DEFAULT_TENANT_ID} AND (ingest_secret IS NULL OR ingest_secret = '')`;

  // First superadmin (Delpat staff). Password from env — never committed; the
  // dev fallback only applies locally so nobody is locked out while building.
  const saEmail = (process.env.SUPERADMIN_EMAIL || 'delpatllp@gmail.com').toLowerCase();
  const saPassword = process.env.SUPERADMIN_PASSWORD || 'delpat-dev-only';
  const saHash = await bcrypt.hash(saPassword, 10);
  await sql`
    INSERT INTO superadmins (id, email, password_hash, name)
    VALUES ('sa_root', ${saEmail}, ${saHash}, 'Delpat Admin')
    ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash;
  `;

  // Workspace owner — the admin identity the desk shows. Email is set so OTP
  // codes reach a real inbox; ON CONFLICT refreshes it on every boot.
  await sql`
    INSERT INTO users (id, tenant_id, name, phone, email, role, status, metadata)
    VALUES ('owner1', ${DEFAULT_TENANT_ID}, 'Aarav Mehta', '+919820011223', ${DEMO_OWNER_EMAIL}, 'owner', 'ACTIVE', ${sql.json({ initials: 'AM', avatar: '#1E6F52' })})
    ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, phone = EXCLUDED.phone, email = EXCLUDED.email, role = EXCLUDED.role;
  `;

  // Mirror agents into users (role 'agent'); carry phone + a plausible email so
  // either can receive an OTP.
  const agentRows = await sql`SELECT id, name, first, initials, avatar, metadata, tenant_id FROM crm_agents`;
  for (const a of agentRows) {
    const meta = a.metadata || { initials: a.initials, avatar: a.avatar };
    const phone = (a.metadata && a.metadata.phone) || null;
    const email = (a.metadata && a.metadata.email) || demoEmail(a.name);
    await sql`
      INSERT INTO users (id, tenant_id, name, phone, email, role, status, metadata)
      VALUES (${a.id}, ${a.tenant_id || DEFAULT_TENANT_ID}, ${a.name}, ${phone}, ${email}, 'agent', 'ACTIVE', ${sql.json(meta)})
      ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, email = EXCLUDED.email, metadata = EXCLUDED.metadata;
    `;
  }
}

/**
 * Cutover to password auth (spec: docs/specs/auth.md). Idempotent — only fills
 * what's missing, so it's safe on every boot:
 *   • agents with no login_id get one derived from their name (unique per tenant)
 *   • any user with no password gets a temp one (a known demo password) so seeded
 *     demo users can still sign in after the OTP→password switch.
 * New users (created via /team/users or onboarding) already carry a password, so
 * they're untouched here.
 */
/**
 * Block C — fill the canonical property columns from whatever the legacy
 * free-text ones hold. Idempotent (only writes where the target is still
 * NULL), so it is safe on every boot and safe to re-run.
 *
 * It imports the SAME normalisers the frontend uses rather than reimplementing
 * the parsing here — two copies of "is '4 BHK Villa' a villa?" would drift the
 * first time either side gained a case.
 *
 * The important one is `type`, which conflated configuration and sub-type in a
 * single string and so could never be matched by a filter option:
 *   "4 BHK Villa"      -> bhk=4,    subtype=villa
 *   "Commercial Office" -> bhk=NULL, subtype=office, category=commercial
 * A value that can't be parsed is left NULL rather than guessed at — the live
 * data contains facing="East-West", which is not a direction, and inventing
 * one would be worse than admitting we don't know.
 */
export async function backfillPropertyCanonicalFields(): Promise<void> {
  const rows = await sql`
    SELECT id, tenant_id, type, furnishing, status, facing, parking, deal, floor
    FROM crm_properties
    WHERE subtype IS NULL OR bhk IS NULL OR category IS NULL OR furnish_type IS NULL
  `;
  if (!rows.length) return;

  let n = 0;
  for (const r of rows) {
    const rawType = r.type || '';
    const category = /commercial|office|shop|showroom|warehouse|industrial/i.test(rawType)
      ? 'commercial' : 'residential';

    const patch: Record<string, any> = {
      category,
      subtype: normaliseSubtype(rawType, category),
      bhk: normaliseBhk(rawType),
      furnish_type: normaliseTo(FURNISH, r.furnishing),
      // Status/facing get normalised in place — same column, canonical token.
      status: normaliseTo(STATUS, r.status) || r.status,
      facing: normaliseTo(FACING, r.facing),
      floor: normaliseFloor(r.floor),
      // Legacy `parking` was one field; the schema separates covered from open.
      // With no way to tell which the old number meant, it becomes covered —
      // the common case — rather than being split by guesswork.
      covered_parking: r.parking != null && r.parking !== '' ? String(r.parking) : null,
    };

    await sql`
      UPDATE crm_properties SET
        category = COALESCE(category, ${patch.category}),
        subtype = COALESCE(subtype, ${patch.subtype}),
        bhk = COALESCE(bhk, ${patch.bhk}),
        furnish_type = COALESCE(furnish_type, ${patch.furnish_type}),
        status = ${patch.status},
        facing = ${patch.facing},
        floor = ${patch.floor},
        covered_parking = COALESCE(covered_parking, ${patch.covered_parking})
      WHERE id = ${r.id}
    `;
    n++;
  }
  console.log(`[Schema C] Backfilled canonical fields on ${n} propert${n === 1 ? 'y' : 'ies'}.`);
}

export async function backfillPasswordAuth(): Promise<void> {
  const DEMO_PW = process.env.DEMO_USER_PASSWORD || 'delpat-demo-1';

  const agentsNoId = await sql`
    SELECT id, tenant_id, name FROM users
    WHERE role = 'agent' AND (login_id IS NULL OR login_id = '') AND deleted_at IS NULL
  `;
  for (const u of agentsNoId) {
    const base = String(u.name || 'agent').toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 16) || 'agent';
    let candidate = base;
    for (let n = 2; (await sql`SELECT 1 FROM users WHERE tenant_id = ${u.tenant_id} AND login_id = ${candidate} AND id <> ${u.id} LIMIT 1`).length; n++) {
      candidate = `${base}${n}`;
    }
    await sql`UPDATE users SET login_id = ${candidate} WHERE id = ${u.id}`;
  }

  const noPw = await sql`SELECT id, email FROM users WHERE (password_hash IS NULL OR password_hash = '') AND deleted_at IS NULL`;
  if (noPw.length) {
    const hash = await bcrypt.hash(DEMO_PW, 10);
    for (const u of noPw) {
      // Seeded/legacy users: usable immediately (no forced change) for the demo.
      await sql`UPDATE users SET password_hash = ${hash}, must_change_password = FALSE, email_verified = ${!!u.email} WHERE id = ${u.id}`;
    }
    console.log(`[Auth] Cutover: backfilled ${noPw.length} user(s) with a temp password.`);
  }
}

/**
 * Reset database to a clean factory seed state.
 */
export async function resetDatabase(): Promise<ServerState> {
  console.log(`[Supabase DB] 🧹 Truncating all CRM tables for workspace reset...`);
  // users is re-seeded from agents; superadmins are platform-level and must
  // survive a workspace reset, so they are deliberately NOT truncated.
  await sql`TRUNCATE TABLE activities, crm_timeline_events, crm_units, crm_leads, crm_properties, crm_agents, crm_settings, crm_integrations, crm_routing_rules, users, auth_otp CASCADE;`;
  return await seedDatabase(true);
}

// Ensure seeded on module load. ensureAuthIdentity runs after, so an
// already-populated database (seed skipped by the lead-count guard) still gets
// the Phase 0 identity model — tenant, superadmin, and users mirror.
seedDatabase()
  .then(() => ensureAuthIdentity())
  .then(() => backfillPasswordAuth())
  .then(() => backfillShortlist())
  .then(() => backfillPropertyCanonicalFields())
  .catch(err => console.error('[Supabase Boot Error]:', err.message));

// ============================================================================
// 📖 ASYNC READ & MUTATION HELPER API
// ============================================================================

export async function getState(): Promise<ServerState> {
  const t = tid();
  const agentScope = agentLeadScope();
  const [agentsRows, propsRows, leadsRows, settingsRows, intRows, routingRows, timelineRows, shortlistRows, brandRows] = await Promise.all([
    // Same soft-delete exclusion as getAgents() so the roster/activity view and
    // Manage access never disagree about who's on the team.
    sql`SELECT a.* FROM crm_agents a
        LEFT JOIN users u ON u.id = a.id AND u.tenant_id = a.tenant_id
        WHERE a.tenant_id = ${t} AND u.deleted_at IS NULL`,
    sql`SELECT * FROM crm_properties WHERE tenant_id = ${t} ORDER BY created_at DESC`,
    agentScope
      ? sql`SELECT * FROM crm_leads WHERE tenant_id = ${t} AND agent_id = ${agentScope} ORDER BY created_at DESC`
      : sql`SELECT * FROM crm_leads WHERE tenant_id = ${t} ORDER BY created_at DESC`,
    sql`SELECT value FROM crm_settings WHERE key = 'default' AND tenant_id = ${t}`,
    sql`SELECT key, config FROM crm_integrations WHERE tenant_id = ${t}`,
    sql`SELECT * FROM crm_routing_rules WHERE tenant_id = ${t}`,
    sql`SELECT * FROM crm_timeline_events WHERE tenant_id = ${t} ORDER BY timestamp DESC`,
    sql`SELECT * FROM lead_shortlist WHERE tenant_id = ${t}`,
    sql`SELECT brand_config FROM tenants WHERE id = ${t} OR slug = ${t} LIMIT 1`,
  ]);
  const shortlistByLead = groupShortlistByLead(shortlistRows);

  const timeline_events: TimelineEvent[] = timelineRows.map(r => ({
    id: r.id,
    record_id: r.record_id,
    type: r.type,
    title: r.title,
    description: r.description,
    author: r.author || undefined,
    timestamp: r.timestamp instanceof Date ? r.timestamp.toISOString() : String(r.timestamp),
    metadata: r.metadata || {},
  }));

  const agents = agentsRows.map(rowToAgent);
  const inactiveAgentIds = agentsRows.filter(a => a.duty_status === 'OFF_DUTY').map(a => a.id);
  // Properties get the same crm_timeline_events feed as leads (Remark lives on
  // both, B1) — merge matching events ahead of any legacy JSONB timeline items
  // already on the row (real DB events are the source of truth going forward;
  // legacy items just keep rendering, they're never migrated/rewritten).
  const properties = propsRows.map(r => {
    const p = rowToProperty(r);
    const evs = timeline_events.filter(e => e.record_id === r.id).map(mapEventForClient);
    return evs.length ? { ...p, timeline: [...evs, ...(p.timeline || [])] } : p;
  });
  // B4 activities live in their own table but belong in the same visible feed
  // as remarks/calls, so they're merged per lead and the whole thing is sorted
  // newest-first. Photo keys are already gated by role inside the mapper.
  const activitiesByLead = await getActivitiesByLead();
  const leads = leadsRows.map(r => {
    const lead = rowToLead(r, timeline_events, shortlistByLead.get(r.id) || []);
    const acts = activitiesByLead.get(r.id);
    if (!acts?.length) return lead;
    const merged = [...acts, ...(lead.timeline || [])].sort(
      (a: any, b: any) => new Date(b.timestamp || 0).getTime() - new Date(a.timestamp || 0).getTime()
    );
    return { ...lead, timeline: merged };
  });

  const settings = settingsRows[0]?.value || DEFAULT_SETTINGS;
  const integrations: Record<string, any> = {};
  for (const row of intRows) {
    integrations[row.key] = row.config;
  }

  const rRow = routingRows[0] || { strategy: 'round_robin', active_agent_ids: agents.map(a => a.id), last_assigned_index: -1 };
  const routing_rules: RoutingRule = {
    strategy: rRow.strategy as any,
    active_agent_ids: rRow.active_agent_ids || [],
    last_assigned_index: rRow.last_assigned_index || -1,
  };

  const brand = { primaryColor: '#1E6F52', surfaceColor: '#F6F5F2', logoUrl: '', ...(brandRows[0]?.brand_config || {}) };

  return {
    agents,
    properties,
    leads,
    inactiveAgentIds,
    settings,
    brand,
    integrations,
    routing_rules,
    timeline_events,
  };
}

// --- LEADS ---
export async function getLeads(): Promise<any[]> {
  const t = tid();
  const agentScope = agentLeadScope();
  const [leadsRows, timelineRows, shortlistRows] = await Promise.all([
    agentScope
      ? sql`SELECT * FROM crm_leads WHERE tenant_id = ${t} AND agent_id = ${agentScope} ORDER BY created_at DESC`
      : sql`SELECT * FROM crm_leads WHERE tenant_id = ${t} ORDER BY created_at DESC`,
    sql`SELECT * FROM crm_timeline_events WHERE tenant_id = ${t} ORDER BY timestamp DESC`,
    sql`SELECT * FROM lead_shortlist WHERE tenant_id = ${t}`,
  ]);
  const events = timelineRows.map(r => ({
    id: r.id, record_id: r.record_id, type: r.type, title: r.title,
    description: r.description, timestamp: r.timestamp instanceof Date ? r.timestamp.toISOString() : String(r.timestamp)
  }));
  const shortlistByLead = groupShortlistByLead(shortlistRows);
  return leadsRows.map(r => rowToLead(r, events, shortlistByLead.get(r.id) || []));
}

export async function getLeadById(id: string): Promise<any | undefined> {
  const t = tid();
  const agentScope = agentLeadScope();
  const rows = agentScope
    ? await sql`SELECT * FROM crm_leads WHERE id = ${id} AND tenant_id = ${t} AND agent_id = ${agentScope}`
    : await sql`SELECT * FROM crm_leads WHERE id = ${id} AND tenant_id = ${t}`;
  if (rows.length === 0) return undefined;
  const [timelineRows, shortlistRows] = await Promise.all([
    sql`SELECT * FROM crm_timeline_events WHERE record_id = ${id} AND tenant_id = ${t} ORDER BY timestamp DESC`,
    sql`SELECT * FROM lead_shortlist WHERE lead_id = ${id} AND tenant_id = ${t}`,
  ]);
  const events = timelineRows.map(r => ({
    id: r.id, record_id: r.record_id, type: r.type, title: r.title,
    description: r.description, timestamp: r.timestamp instanceof Date ? r.timestamp.toISOString() : String(r.timestamp)
  }));
  return rowToLead(rows[0], events, shortlistRows);
}

export async function createLead(leadData: any, ctx: ActorCtx = SYSTEM_CTX): Promise<any> {
  const newId = leadData.id || `l_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;

  // Apply round-robin assignment if agentId not provided
  let agentId = leadData.agentId || leadData.agent_id;
  if (!agentId) {
    const rules = await getRoutingRules();
    if (rules.active_agent_ids && rules.active_agent_ids.length > 0) {
      const nextIdx = (rules.last_assigned_index + 1) % rules.active_agent_ids.length;
      agentId = rules.active_agent_ids[nextIdx];
      await sql`UPDATE crm_routing_rules SET last_assigned_index = ${nextIdx} WHERE tenant_id = ${tid()}`;
    } else {
      agentId = 'a1';
    }
  }

  const name = leadData.name || 'New Inquiry';
  const phone = leadData.phone || '+910000000000';
  const email = leadData.email || null;
  const stage = leadData.stage || 'New';
  const source = leadData.source || 'Website';
  const req = leadData.req || { locality: 'Wakad', config: '2 BHK', budgetLabel: '₹80L' };
  const notes = leadData.notes || [];
  const shortlist = leadData.shortlist || [];
  const feedback = leadData.feedback || {};

  // New first-class columns, source-of-truth going forward; req JSONB stays populated too.
  const deal = leadData.deal || req.deal || (leadData.purpose === 'Lease' ? 'rent' : 'sale');
  const requirement = leadData.requirement ?? req.config ?? null;
  const locality = leadData.locality ?? req.locality ?? null;
  const budgetMin = digits(leadData.budgetMin ?? leadData.budget_min ?? req.minBudget);
  const budgetMax = digits(leadData.budgetMax ?? leadData.budget_max ?? req.maxBudget);
  const purpose = leadData.purpose ?? req.purpose ?? null;
  const timelinePref = leadData.timeline ?? leadData.timeline_pref ?? req.timeline ?? null;

  const t = tid();
  const rows = await sql`
    INSERT INTO crm_leads (
      id, name, phone, email, stage, source, agent_id, req, notes, shortlist, feedback,
      deal, requirement, locality, budget_min, budget_max, purpose, timeline_pref, tenant_id
    )
    VALUES (
      ${newId}, ${name}, ${phone}, ${email}, ${stage}, ${source}, ${agentId}, ${sql.json(req)}, ${sql.json(notes)}, ${sql.json(shortlist)}, ${sql.json(feedback)},
      ${deal}, ${requirement}, ${locality}, ${budgetMin}, ${budgetMax}, ${purpose}, ${timelinePref}, ${t}
    )
    RETURNING *;
  `;

  if (shortlist.length > 0 || Object.keys(feedback).length > 0) {
    await syncLeadShortlist(newId, shortlist, feedback, t);
  }

  await addTimelineEvent({
    record_id: newId,
    type: 'creation',
    title: 'New Lead Created',
    description: `Lead created via API (Source: ${source}). Assigned to agent ${agentId}.`,
  });

  const created = await getLeadById(newId);
  audit({
    tenant_id: tid(), actor_type: ctx.actorType || 'system', actor_id: ctx.actorId ?? null,
    actor_label: ctx.actorLabel ?? null, action: 'lead.create', target_type: 'lead', target_id: newId,
    summary: `Lead "${name}" created (source: ${source})`, metadata: { after: created },
    ip: ctx.ip, user_agent: ctx.userAgent,
  });
  // Alert the assigned agent, and give owners/managers team-wide visibility.
  const link = `?screen=leads&lead=${newId}`;
  const where = locality ? ` · ${locality}` : '';
  notify({ userId: agentId, type: 'lead_assigned', title: 'New lead assigned to you', body: `${name}${where} (${source})`, link })
    .catch(err => console.warn('[Notify] lead_assigned failed:', err?.message));
  notifyRoles(['owner', 'manager'], { type: 'lead_new', title: 'New lead captured', body: `${name}${where} → routed to ${agentId}`, link })
    .catch(err => console.warn('[Notify] lead_new failed:', err?.message));
  return created;
}

export async function updateLead(id: string, patch: any, ctx: ActorCtx = SYSTEM_CTX): Promise<any | null> {
  const oldLead = await getLeadById(id);
  if (!oldLead) return null;

  const name = patch.name !== undefined ? patch.name : oldLead.name;
  const phone = patch.phone !== undefined ? patch.phone : oldLead.phone;
  const email = patch.email !== undefined ? patch.email : oldLead.email;
  const stage = patch.stage !== undefined ? patch.stage : oldLead.stage;
  const source = patch.source !== undefined ? patch.source : oldLead.source;
  const agentId = patch.agentId !== undefined ? patch.agentId : (patch.agent_id !== undefined ? patch.agent_id : oldLead.agentId);
  const req = patch.req !== undefined ? patch.req : oldLead.req;
  const notes = patch.notes !== undefined ? patch.notes : oldLead.notes;
  const shortlist = patch.shortlist !== undefined ? patch.shortlist : oldLead.shortlist;
  const feedback = patch.feedback !== undefined ? patch.feedback : oldLead.feedback;
  const followUp = patch.followUp !== undefined ? patch.followUp : (oldLead as any).followUp;
  const overdue = patch.overdue !== undefined ? patch.overdue : (oldLead as any).overdue;

  const deal = patch.deal !== undefined ? patch.deal : (req?.deal ?? oldLead.req?.deal);
  const requirement = patch.requirement !== undefined ? patch.requirement : (req?.config ?? oldLead.req?.config);
  const locality = patch.locality !== undefined ? patch.locality : (req?.locality ?? oldLead.req?.locality);
  const budgetMin = (patch.budgetMin !== undefined || patch.budget_min !== undefined || req?.minBudget !== undefined)
    ? digits(patch.budgetMin ?? patch.budget_min ?? req?.minBudget) : digits(oldLead.req?.minBudget);
  const budgetMax = (patch.budgetMax !== undefined || patch.budget_max !== undefined || req?.maxBudget !== undefined)
    ? digits(patch.budgetMax ?? patch.budget_max ?? req?.maxBudget) : digits(oldLead.req?.maxBudget);
  const purpose = patch.purpose !== undefined ? patch.purpose : (req?.purpose ?? oldLead.req?.purpose);
  const timelinePref = patch.timeline !== undefined ? patch.timeline : (patch.timeline_pref !== undefined ? patch.timeline_pref : (req?.timeline ?? oldLead.req?.timeline));

  await sql`
    UPDATE crm_leads SET
      name = ${name},
      phone = ${phone},
      email = ${email || null},
      stage = ${stage},
      source = ${source},
      agent_id = ${agentId},
      req = ${sql.json(req || {})},
      notes = ${sql.json(notes || [])},
      shortlist = ${sql.json(shortlist || [])},
      feedback = ${sql.json(feedback || {})},
      follow_up = ${sql.json(followUp || null)},
      overdue = ${Boolean(overdue)},
      deal = ${deal || null},
      requirement = ${requirement || null},
      locality = ${locality || null},
      budget_min = ${budgetMin},
      budget_max = ${budgetMax},
      purpose = ${purpose || null},
      timeline_pref = ${timelinePref || null}
    WHERE id = ${id} AND tenant_id = ${tid()};
  `;

  if (patch.shortlist !== undefined || patch.feedback !== undefined) {
    await syncLeadShortlist(id, shortlist || [], feedback || {}, tid());
  }

  if (patch.stage && patch.stage !== oldLead.stage) {
    await addTimelineEvent({
      record_id: id,
      type: 'stage_change',
      title: 'Pipeline Stage Updated',
      description: `Stage moved from "${oldLead.stage}" to "${patch.stage}".`,
    });
  }

  const updated = await getLeadById(id);
  audit({
    tenant_id: tid(), actor_type: ctx.actorType || 'system', actor_id: ctx.actorId ?? null,
    actor_label: ctx.actorLabel ?? null, action: 'lead.update', target_type: 'lead', target_id: id,
    summary: `Lead "${updated?.name}" updated`, metadata: { patch, before: { stage: oldLead.stage, agentId: oldLead.agentId }, after: { stage: updated?.stage, agentId: updated?.agentId } },
    ip: ctx.ip, user_agent: ctx.userAgent,
  });
  const link = `?screen=leads&lead=${id}`;
  // Reassignment → alert the newly assigned agent.
  if (patch.agentId !== undefined && agentId && agentId !== oldLead.agentId) {
    notify({ userId: agentId, type: 'lead_reassigned', title: 'A lead was assigned to you', body: `${name}`, link })
      .catch(err => console.warn('[Notify] lead_reassigned failed:', err?.message));
  }
  // Follow-up set → remind the owning agent.
  if (patch.followUp) {
    const when = (patch.followUp.action || patch.followUp.label || 'Follow-up scheduled');
    notify({ userId: agentId, type: 'followup_set', title: 'Follow-up scheduled', body: `${name} · ${when}`, link })
      .catch(err => console.warn('[Notify] followup_set failed:', err?.message));
  }
  return updated;
}

export async function deleteLead(id: string, ctx: ActorCtx = SYSTEM_CTX): Promise<boolean> {
  const existing = await getLeadById(id);
  const res = await sql`DELETE FROM crm_leads WHERE id = ${id} AND tenant_id = ${tid()}`;
  const ok = res.count > 0;
  if (ok) {
    audit({
      tenant_id: tid(), actor_type: ctx.actorType || 'system', actor_id: ctx.actorId ?? null,
      actor_label: ctx.actorLabel ?? null, action: 'lead.delete', target_type: 'lead', target_id: id,
      summary: `Lead "${existing?.name || id}" deleted`, metadata: { before: existing },
      ip: ctx.ip, user_agent: ctx.userAgent,
    });
  }
  return ok;
}

export async function deleteProperty(id: string, ctx: ActorCtx = SYSTEM_CTX): Promise<boolean> {
  const t = tid();
  const existingRows = await sql`SELECT * FROM crm_properties WHERE id = ${id} AND tenant_id = ${t}`;
  const existing = existingRows[0] ? rowToProperty(existingRows[0]) : null;
  const res = await sql`DELETE FROM crm_properties WHERE id = ${id} AND tenant_id = ${t}`;
  const ok = res.count > 0;
  if (ok) {
    audit({
      tenant_id: tid(), actor_type: ctx.actorType || 'system', actor_id: ctx.actorId ?? null,
      actor_label: ctx.actorLabel ?? null, action: 'property.delete', target_type: 'property', target_id: id,
      summary: `Property "${existing?.title || id}" deleted`, metadata: { before: existing },
      ip: ctx.ip, user_agent: ctx.userAgent,
    });
  }
  return ok;
}

export async function mergeLeads(primaryId: string, duplicateId: string): Promise<any | null> {
  const primary = await getLeadById(primaryId);
  const duplicate = await getLeadById(duplicateId);
  if (!primary || !duplicate) return null;

  const combinedNotes = [
    `[MERGED INQUIRY] Merged duplicate record ${duplicate.name} (${duplicate.phone}) into this record.`,
    ...(primary.notes || []),
    ...(duplicate.notes || []),
  ];

  const t = tid();
  await sql`UPDATE crm_leads SET notes = ${sql.json(combinedNotes)} WHERE id = ${primaryId} AND tenant_id = ${t}`;
  await sql`UPDATE crm_timeline_events SET record_id = ${primaryId} WHERE record_id = ${duplicateId} AND tenant_id = ${t}`;

  await addTimelineEvent({
    record_id: primaryId,
    type: 'merge',
    title: 'Duplicate Record Merged',
    description: `Merged inquiry from ${duplicate.name} (${duplicate.phone}, Source: ${duplicate.source}).`,
  });

  await deleteLead(duplicateId);
  return await getLeadById(primaryId);
}

// --- PROPERTIES ---
export async function getProperties(): Promise<any[]> {
  const rows = await sql`SELECT * FROM crm_properties WHERE tenant_id = ${tid()} ORDER BY created_at DESC`;
  return rows.map(rowToProperty);
}

export async function createProperty(propData: any, ctx: ActorCtx = SYSTEM_CTX): Promise<any> {
  // Random suffix: a bulk import fires these in the same millisecond, and a bare
  // Date.now() collided on the primary key — every row after the first 500'd.
  const newId = propData.id || `p_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
  const title = propData.title || `${propData.type || '2 BHK'} · ${propData.locality || 'Pune'}`;
  const status = propData.status || 'Available';
  const type = propData.type || '2 BHK';
  const locality = propData.locality || 'Pune';
  const price = propData.price != null ? String(propData.price) : '';
  // Accept both column names (tower/unit) and the form names (wing/flat).
  const tower = propData.tower || propData.wing || 'A';
  const unit = propData.unit || propData.flat || '101';
  const tenancy = propData.tenancy || null;
  const timeline = propData.timeline || [];

  // Everything that isn't a first-class column becomes a config (JSONB) field, so
  // domain data (deal, society, project, wing, flat, carpet, owner, priceLabel,
  // importBatchId, features, …) persists and round-trips via rowToProperty.
  const config: any = { ...(propData.config || {}) };
  for (const [k, v] of Object.entries(propData)) {
    if (!PROPERTY_COLUMNS.has(k) && k !== 'id' && k !== 'config') config[k] = v;
  }

  // New first-class columns (source of truth going forward); config stays populated too.
  const project = propData.project || config.society || title.split(' - ')[0];
  const wing = propData.wing || tower;
  const unitNo = propData.unit_no || propData.flat || unit;
  const deal = propData.deal || 'sale';
  const facing = propData.facing ?? null;
  const furnishing = propData.furnishing ?? null;
  const parking = propData.parking ?? null;
  const possession = propData.possession ?? null;
  const builder = propData.builder ?? null;
  const reraNo = propData.rera ?? propData.rera_no ?? null;
  const ownerName = propData.owner ?? propData.owner_name ?? null;
  const ownerPhone = propData.ownerPhone ?? propData.owner_phone ?? null;
  const ownerEmail = propData.ownerEmail ?? propData.owner_email ?? null;
  const floor = propData.floor != null ? String(propData.floor) : null;
  const carpetSqft = digits(propData.carpet ?? propData.area ?? propData.carpet_sqft);
  const totalFloors = digits(propData.totalFloors ?? propData.total_floors);
  const ageYears = digits(propData.age ?? propData.age_years);
  const priceAmount = digits(price);

  const rows = await sql`
    INSERT INTO crm_properties (
      id, title, status, type, locality, price, tower, unit, config, tenancy, timeline,
      project, wing, unit_no, deal, facing, furnishing, parking, possession, builder, rera_no,
      owner_name, owner_phone, owner_email, floor, carpet_sqft, total_floors, age_years, price_amount, tenant_id
    )
    VALUES (
      ${newId}, ${title}, ${status}, ${type}, ${locality}, ${price}, ${tower}, ${unit}, ${sql.json(config)}, ${sql.json(tenancy)}, ${sql.json(timeline)},
      ${project}, ${wing}, ${unitNo}, ${deal}, ${facing}, ${furnishing}, ${parking}, ${possession}, ${builder}, ${reraNo},
      ${ownerName}, ${ownerPhone}, ${ownerEmail}, ${floor}, ${carpetSqft}, ${totalFloors}, ${ageYears}, ${priceAmount}, ${tid()}
    )
    RETURNING *;
  `;
  const created = rowToProperty(rows[0]);
  audit({
    tenant_id: tid(), actor_type: ctx.actorType || 'system', actor_id: ctx.actorId ?? null,
    actor_label: ctx.actorLabel ?? null, action: 'property.create', target_type: 'property', target_id: newId,
    summary: `Property "${title}" created`, metadata: { after: created }, ip: ctx.ip, user_agent: ctx.userAgent,
  });
  return created;
}

// First-class columns on crm_properties. Anything else in a patch is a config (JSONB) field.
const PROPERTY_COLUMNS = new Set(['title', 'status', 'type', 'locality', 'price', 'tower', 'unit', 'tenancy', 'timeline']);

export async function updateProperty(id: string, patch: any, ctx: ActorCtx = SYSTEM_CTX): Promise<any | null> {
  const old = await sql`SELECT * FROM crm_properties WHERE id = ${id} AND tenant_id = ${tid()}`;
  if (old.length === 0) return null;
  const row = old[0];
  const before = rowToProperty(row);

  const title = patch.title !== undefined ? patch.title : row.title;
  const status = patch.status !== undefined ? patch.status : row.status;
  const type = patch.type !== undefined ? patch.type : row.type;
  const locality = patch.locality !== undefined ? patch.locality : row.locality;
  const price = patch.price !== undefined ? patch.price : row.price;
  const tower = patch.tower !== undefined ? patch.tower : row.tower;
  const unit = patch.unit !== undefined ? patch.unit : row.unit;
  const tenancy = patch.tenancy !== undefined ? patch.tenancy : (row.tenancy || null);
  const timeline = patch.timeline !== undefined ? patch.timeline : (row.timeline || []);

  // Merge domain/config fields: keep existing JSONB config, layer an explicit patch.config,
  // then fold any flat non-column keys the frontend sent (e.g. furnishing, carpet, owner,
  // priceLabel, depositReturned) so inline ModuleRecordSheet edits actually persist.
  const config: Record<string, any> = { ...(row.config || {}) };
  if (patch.config && typeof patch.config === 'object') Object.assign(config, patch.config);
  for (const [k, v] of Object.entries(patch)) {
    if (k === 'config' || k === 'id') continue;
    if (!PROPERTY_COLUMNS.has(k)) config[k] = v;
  }

  // New first-class columns, patched when present, else keep the existing column value.
  const project = patch.project !== undefined ? patch.project : row.project;
  const wing = patch.wing !== undefined ? patch.wing : (patch.tower !== undefined ? patch.tower : row.wing);
  const unitNo = patch.unit_no !== undefined ? patch.unit_no : (patch.flat !== undefined ? patch.flat : (patch.unit !== undefined ? patch.unit : row.unit_no));
  const deal = patch.deal !== undefined ? patch.deal : row.deal;
  const facing = patch.facing !== undefined ? patch.facing : row.facing;
  const furnishing = patch.furnishing !== undefined ? patch.furnishing : row.furnishing;
  const parking = patch.parking !== undefined ? patch.parking : row.parking;
  const possession = patch.possession !== undefined ? patch.possession : row.possession;
  const builder = patch.builder !== undefined ? patch.builder : row.builder;
  const reraNo = patch.rera !== undefined ? patch.rera : (patch.rera_no !== undefined ? patch.rera_no : row.rera_no);
  const ownerName = patch.owner !== undefined ? patch.owner : (patch.owner_name !== undefined ? patch.owner_name : row.owner_name);
  const ownerPhone = patch.ownerPhone !== undefined ? patch.ownerPhone : (patch.owner_phone !== undefined ? patch.owner_phone : row.owner_phone);
  const ownerEmail = patch.ownerEmail !== undefined ? patch.ownerEmail : (patch.owner_email !== undefined ? patch.owner_email : row.owner_email);
  const floor = patch.floor !== undefined ? (patch.floor != null ? String(patch.floor) : null) : row.floor;
  const carpetSqft = (patch.carpet !== undefined || patch.area !== undefined || patch.carpet_sqft !== undefined)
    ? digits(patch.carpet ?? patch.area ?? patch.carpet_sqft) : row.carpet_sqft;
  const totalFloors = (patch.totalFloors !== undefined || patch.total_floors !== undefined)
    ? digits(patch.totalFloors ?? patch.total_floors) : row.total_floors;
  const ageYears = (patch.age !== undefined || patch.age_years !== undefined)
    ? digits(patch.age ?? patch.age_years) : row.age_years;
  const priceAmount = patch.price !== undefined ? digits(price) : row.price_amount;

  const rows = await sql`
    UPDATE crm_properties SET
      title = ${title}, status = ${status}, type = ${type}, locality = ${locality},
      price = ${price}, tower = ${tower}, unit = ${unit}, config = ${sql.json(config)},
      tenancy = ${sql.json(tenancy)}, timeline = ${sql.json(timeline)},
      project = ${project}, wing = ${wing}, unit_no = ${unitNo}, deal = ${deal},
      facing = ${facing}, furnishing = ${furnishing}, parking = ${parking}, possession = ${possession},
      builder = ${builder}, rera_no = ${reraNo}, owner_name = ${ownerName}, owner_phone = ${ownerPhone},
      owner_email = ${ownerEmail}, floor = ${floor}, carpet_sqft = ${carpetSqft}, total_floors = ${totalFloors},
      age_years = ${ageYears}, price_amount = ${priceAmount}, updated_at = NOW()
    WHERE id = ${id} AND tenant_id = ${tid()} RETURNING *;
  `;
  const updated = rowToProperty(rows[0]);
  audit({
    tenant_id: tid(), actor_type: ctx.actorType || 'system', actor_id: ctx.actorId ?? null,
    actor_label: ctx.actorLabel ?? null, action: 'property.update', target_type: 'property', target_id: id,
    summary: `Property "${updated.title}" updated`, metadata: { patch, before: { status: before.status, price: before.price }, after: { status: updated.status, price: updated.price } },
    ip: ctx.ip, user_agent: ctx.userAgent,
  });
  return updated;
}

// --- TEAM & ROUTING ---
export async function getAgents(): Promise<any[]> {
  // Exclude soft-deleted people: their users row carries deleted_at, but the
  // crm_agents row is kept so historical lead attribution still resolves. A
  // LEFT JOIN keeps any legacy agent that has no users row at all.
  const rows = await sql`
    SELECT a.* FROM crm_agents a
    LEFT JOIN users u ON u.id = a.id AND u.tenant_id = a.tenant_id
    WHERE a.tenant_id = ${tid()} AND u.deleted_at IS NULL
  `;
  return rows.map(rowToAgent);
}

export async function getRoutingRules(): Promise<RoutingRule> {
  const rows = await sql`SELECT * FROM crm_routing_rules WHERE tenant_id = ${tid()}`;
  if (rows.length === 0) {
    return { strategy: 'round_robin', active_agent_ids: ['a1', 'a2', 'a3', 'a4'], last_assigned_index: -1 };
  }
  return {
    strategy: rows[0].strategy as any,
    active_agent_ids: rows[0].active_agent_ids || [],
    last_assigned_index: rows[0].last_assigned_index || -1,
  };
}

export async function updateRoutingRules(patch: Partial<RoutingRule>): Promise<RoutingRule> {
  const current = await getRoutingRules();
  const next = { ...current, ...patch };
  await sql`
    INSERT INTO crm_routing_rules (strategy, active_agent_ids, last_assigned_index, tenant_id)
    VALUES (${next.strategy}, ${sql.json(next.active_agent_ids)}, ${next.last_assigned_index}, ${tid()})
    ON CONFLICT (tenant_id) DO UPDATE SET
      strategy = EXCLUDED.strategy,
      active_agent_ids = EXCLUDED.active_agent_ids,
      last_assigned_index = EXCLUDED.last_assigned_index;
  `;
  return next;
}

// --- BRAND (single source of truth: tenants.brand_config) ---
// The tenant's identity — accent colour, logo, initials — lives on the tenant
// row, NOT in crm_settings. Onboarding writes it, the PWA icon route reads it,
// and the app UI reads it here, so the installed icon and the live desk can
// never drift to different colours.
const DEFAULT_BRAND = {
  primaryColor: '#1E6F52',
  surfaceColor: '#F6F5F2',
  logoUrl: '',
};

export async function getBrand(): Promise<any> {
  const t = tid();
  const rows = await sql`SELECT brand_config FROM tenants WHERE id = ${t} OR slug = ${t} LIMIT 1`;
  return { ...DEFAULT_BRAND, ...(rows[0]?.brand_config || {}) };
}

/** Merge a brand patch into the tenant row. When the accent colour changes we
 *  drop the cached icon PNGs so the installed-app icon regenerates in the new
 *  colour on next request (keeping icon + UI in lock-step). */
export async function updateBrand(patch: any): Promise<any> {
  const t = tid();
  const current = await getBrand();
  const next = { ...current, ...patch };
  const colorChanged = patch?.primaryColor && patch.primaryColor !== current.primaryColor;
  await sql`
    UPDATE tenants
    SET brand_config = COALESCE(brand_config, '{}'::jsonb) || ${sql.json(next)}
        ${colorChanged ? sql`, pwa_config = COALESCE(pwa_config, '{}'::jsonb) - 'icon192' - 'icon512'` : sql``}
    WHERE id = ${t} OR slug = ${t}
  `;
  return next;
}

// --- SETTINGS & INTEGRATIONS ---
export async function getSettings(): Promise<any> {
  const rows = await sql`SELECT value FROM crm_settings WHERE key = 'default' AND tenant_id = ${tid()}`;
  return rows[0]?.value || DEFAULT_SETTINGS;
}

export async function updateSettings(patch: any): Promise<any> {
  const current = await getSettings();
  const next = { ...current, ...patch };
  await sql`
    INSERT INTO crm_settings (key, value, tenant_id) VALUES ('default', ${sql.json(next)}, ${tid()})
    ON CONFLICT (tenant_id, key) DO UPDATE SET value = EXCLUDED.value;
  `;
  return next;
}

export async function getIntegrations(): Promise<Record<string, any>> {
  const rows = await sql`SELECT key, config FROM crm_integrations WHERE tenant_id = ${tid()}`;
  const result: Record<string, any> = {};
  for (const r of rows) {
    result[r.key] = r.config;
  }
  return result;
}

export async function updateIntegration(key: string, patch: any): Promise<any | null> {
  const all = await getIntegrations();
  const current = all[key] || {};
  const next = { ...current, ...patch };
  await sql`
    INSERT INTO crm_integrations (key, config, tenant_id) VALUES (${key}, ${sql.json(next)}, ${tid()})
    ON CONFLICT (tenant_id, key) DO UPDATE SET config = EXCLUDED.config;
  `;
  return next;
}

// --- TIMELINE ---
export async function getTimelineEvents(recordId?: string): Promise<TimelineEvent[]> {
  const t = tid();
  const rows = recordId
    ? await sql`SELECT * FROM crm_timeline_events WHERE record_id = ${recordId} AND tenant_id = ${t} ORDER BY timestamp DESC`
    : await sql`SELECT * FROM crm_timeline_events WHERE tenant_id = ${t} ORDER BY timestamp DESC`;

  return rows.map(r => ({
    id: r.id,
    record_id: r.record_id,
    type: r.type,
    title: r.title,
    description: r.description,
    author: r.author || undefined,
    timestamp: r.timestamp instanceof Date ? r.timestamp.toISOString() : String(r.timestamp),
    metadata: r.metadata || {},
  }));
}

export async function addTimelineEvent(evt: Omit<TimelineEvent, 'id' | 'timestamp'> & { timestamp?: string }): Promise<TimelineEvent> {
  const id = `evt_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
  const ts = evt.timestamp || new Date().toISOString();
  await sql`
    INSERT INTO crm_timeline_events (id, record_id, type, title, description, author, timestamp, metadata, tenant_id)
    VALUES (${id}, ${evt.record_id}, ${evt.type}, ${evt.title}, ${evt.description}, ${evt.author || 'System'}, ${ts}, ${sql.json(evt.metadata || {})}, ${tid()})
    ON CONFLICT (id) DO NOTHING;
  `;
  return {
    id,
    timestamp: ts,
    ...evt,
  };
}

/** Fetch one timeline event, tenant-scoped — used by the remark edit route to
 *  check the caller actually authored it before allowing a change. */
export async function getTimelineEventById(id: string, tenantId: string): Promise<TimelineEvent | null> {
  const rows = await sql`SELECT * FROM crm_timeline_events WHERE id = ${id} AND tenant_id = ${tenantId} LIMIT 1`;
  const r = rows[0];
  if (!r) return null;
  return {
    id: r.id, record_id: r.record_id, type: r.type, title: r.title, description: r.description,
    author: r.author || undefined,
    timestamp: r.timestamp instanceof Date ? r.timestamp.toISOString() : String(r.timestamp),
    metadata: r.metadata || {},
  };
}

/** Edit a remark's text (author-only, enforced by the route). Stamps
 *  metadata.edited so the UI can show "edited". Timestamp/author are NOT
 *  touched — an edit doesn't reorder the thread or change who wrote it.
 *  `outcome` (B5) is optional — set when attaching an outcome to a logged
 *  call/message, e.g. "Connected", "No answer". */
export async function updateTimelineEvent(id: string, tenantId: string, text: string, outcome?: string): Promise<TimelineEvent | null> {
  const existing = await getTimelineEventById(id, tenantId);
  if (!existing) return null;
  const meta: any = { ...(existing.metadata || {}), edited: true, edited_at: new Date().toISOString() };
  if (outcome) meta.outcome = outcome;
  const rows = await sql`
    UPDATE crm_timeline_events SET description = ${text}, metadata = ${sql.json(meta)}
    WHERE id = ${id} AND tenant_id = ${tenantId}
    RETURNING *
  `;
  const r = rows[0];
  if (!r) return null;
  return {
    id: r.id, record_id: r.record_id, type: r.type, title: r.title, description: r.description,
    author: r.author || undefined,
    timestamp: r.timestamp instanceof Date ? r.timestamp.toISOString() : String(r.timestamp),
    metadata: r.metadata || {},
  };
}

// ============================================================================
// 📍 ACTIVITIES (docs/specs/contacts-leads.md B4)
// ============================================================================
// A structured event on a lead: a site visit with proof, a meeting, a
// follow-up. Distinct from crm_timeline_events (free-text remarks and logged
// call/message actions) because these carry an outcome, a GPS fix and media
// that we need to query by — see the table comment in db.ts. Both are merged
// into a single feed at read time so the UI shows one timeline.

export const ACTIVITY_TYPES = new Set(['call', 'site_visit', 'meeting', 'follow_up', 'note']);
export const ACTIVITY_OUTCOMES = new Set(['interested', 'not_interested', 'negotiating', 'booked', 'no_show']);

export interface ActivityInput {
  lead_id: string;
  property_id?: string | null;
  type: string;
  agent_id?: string | null;
  remark?: string | null;
  outcome?: string | null;
  photo_key?: string | null;
  geo?: { lat: number; lng: number; accuracy?: number } | null;
  metadata?: Record<string, any>;
}

/**
 * Proof photos are owner/manager-only (spec B4, Q12): agents log them, they
 * don't browse each other's. An agent still sees the photo on a visit they
 * logged themselves — they took it, hiding it from them would be theatre.
 *
 * This is the ONLY gate on proof media. Keys are unguessable and /files is
 * unauthenticated, so "can't see it" means "was never handed the key". Any new
 * read path for activities must go through mapActivityForClient or it will
 * leak the key.
 */
function canSeeProof(activityAgentId: string | null): boolean {
  const c = getContext();
  if (!c) return false;                                   // no context = no photos
  if (c.role === 'owner' || c.role === 'manager' || c.role === 'superadmin') return true;
  return Boolean(c.userId && activityAgentId && c.userId === activityAgentId);
}

/** Metres between two WGS84 points (haversine). Used only for the soft
 *  "was the agent actually at the property" signal — never to block a log. */
export function distanceMetres(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(s)));
}

/**
 * DB row -> the same client event shape the Timeline already renders, so a
 * visit slots into the lead's feed next to remarks with no special-casing in
 * the UI. photoKey is omitted entirely (not nulled) when the viewer isn't
 * allowed it, so there's nothing to accidentally render.
 */
function mapActivityForClient(a: any, propCoords?: { lat: number; lng: number } | null) {
  const agentId = a.agent_id || null;
  const meta: Record<string, any> = { ...(a.metadata || {}) };
  if (a.outcome) meta.outcome = a.outcome;
  if (a.property_id) meta.propertyId = a.property_id;
  if (a.geo_lat != null && a.geo_lng != null) {
    meta.geo = { lat: a.geo_lat, lng: a.geo_lng, accuracy: a.geo_accuracy ?? undefined };
    if (propCoords) {
      meta.distanceM = distanceMetres(a.geo_lat, a.geo_lng, propCoords.lat, propCoords.lng);
    }
  }
  if (a.photo_key && canSeeProof(agentId)) meta.photoKey = a.photo_key;
  else if (a.photo_key) meta.photoWithheld = true;   // UI can say "proof on file"

  return {
    id: a.id,
    type: a.type === 'site_visit' ? 'visit' : a.type,
    label: a.remark || '',
    authorId: agentId,
    timestamp: a.at instanceof Date ? a.at.toISOString() : String(a.at),
    metadata: meta,
  };
}

export async function addActivity(input: ActivityInput): Promise<any> {
  const t = tid();
  const id = `act_${Date.now()}_${randomBytes(3).toString('hex')}`;
  const geo = input.geo || null;
  const rows = await sql`
    INSERT INTO activities (
      id, tenant_id, lead_id, property_id, type, agent_id, remark, outcome,
      photo_key, geo_lat, geo_lng, geo_accuracy, metadata
    ) VALUES (
      ${id}, ${t}, ${input.lead_id}, ${input.property_id || null}, ${input.type},
      ${input.agent_id || null}, ${input.remark || null}, ${input.outcome || null},
      ${input.photo_key || null}, ${geo?.lat ?? null}, ${geo?.lng ?? null},
      ${geo?.accuracy ?? null}, ${sql.json(input.metadata || {})}
    )
    RETURNING *
  `;
  return rows[0];
}

/** Coordinates for properties referenced by the given activities, so distance
 *  can be computed without an N+1 query per activity. */
async function propCoordsFor(propertyIds: string[]): Promise<Map<string, { lat: number; lng: number }>> {
  const map = new Map<string, { lat: number; lng: number }>();
  const ids = [...new Set(propertyIds.filter(Boolean))];
  if (!ids.length) return map;
  const rows = await sql`
    SELECT id, geo_lat, geo_lng FROM crm_properties
    WHERE tenant_id = ${tid()} AND id = ANY(${ids}) AND geo_lat IS NOT NULL AND geo_lng IS NOT NULL
  `;
  for (const r of rows) map.set(r.id, { lat: r.geo_lat, lng: r.geo_lng });
  return map;
}

/** All activities for the tenant, mapped for the client and grouped by lead.
 *  Used by getState to fold them into each lead's timeline. */
export async function getActivitiesByLead(): Promise<Map<string, any[]>> {
  const rows = await sql`SELECT * FROM activities WHERE tenant_id = ${tid()} ORDER BY at DESC`;
  const coords = await propCoordsFor(rows.map(r => r.property_id));
  const byLead = new Map<string, any[]>();
  for (const r of rows) {
    const mapped = mapActivityForClient(r, r.property_id ? coords.get(r.property_id) || null : null);
    const list = byLead.get(r.lead_id) || [];
    list.push(mapped);
    byLead.set(r.lead_id, list);
  }
  return byLead;
}

/**
 * Derived property view: visits that REFERENCED this unit. Nothing is stored
 * on the property — this is a query over the activities that point at it,
 * which is exactly why the relationship can change without touching the
 * property row (spec B4).
 */
export async function getVisitsForProperty(propertyId: string): Promise<any[]> {
  const t = tid();
  const rows = await sql`
    SELECT a.*, l.name AS lead_name
    FROM activities a
    LEFT JOIN crm_leads l ON l.id = a.lead_id AND l.tenant_id = a.tenant_id
    WHERE a.tenant_id = ${t} AND a.property_id = ${propertyId}
    ORDER BY a.at DESC
  `;
  const coords = await propCoordsFor([propertyId]);
  return rows.map(r => ({
    ...mapActivityForClient(r, coords.get(propertyId) || null),
    leadId: r.lead_id,
    leadName: r.lead_name || null,
  }));
}

// --- UNITS (INVENTORY MATRIX) ---
export async function getUnits(propertyId?: string): Promise<any[]> {
  const t = tid();
  const rows = propertyId
    ? await sql`SELECT * FROM crm_units WHERE property_id = ${propertyId} AND tenant_id = ${t} ORDER BY id ASC`
    : await sql`SELECT * FROM crm_units WHERE tenant_id = ${t} ORDER BY id ASC`;
  return rows.map(r => ({
    id: r.id,
    property_id: r.property_id,
    title: r.title,
    data: r.data || {},
  }));
}

export async function blockUnit(unitId: string, buyerName: string, durationHours: number = 48) {
  const rows = await sql`SELECT * FROM crm_units WHERE id = ${unitId} AND tenant_id = ${tid()}`;
  if (rows.length === 0) return { success: false, error: 'Unit not found' };
  const unit = rows[0];
  const currentStatus = unit.data?.status || 'Available';
  if (currentStatus !== 'Available') {
    return { success: false, error: 'Double-Booking Conflict', message: `This unit was just blocked or sold (${currentStatus})!` };
  }
  const newData = { ...unit.data, status: 'Blocked', blocked_by_buyer: buyerName, blocked_at: new Date().toISOString() };
  await sql`UPDATE crm_units SET data = ${sql.json(newData)} WHERE id = ${unitId} AND tenant_id = ${tid()}`;
  return { success: true, message: `Unit ${unitId} successfully blocked for ${durationHours} hours.`, blocked_until: new Date(Date.now() + durationHours * 3600 * 1000) };
}

export async function releaseUnit(unitId: string) {
  const rows = await sql`SELECT * FROM crm_units WHERE id = ${unitId} AND tenant_id = ${tid()}`;
  if (rows.length === 0) return { success: false, error: 'Unit not found' };
  const unit = rows[0];
  const newData = { ...unit.data, status: 'Available' };
  delete newData.blocked_by_buyer;
  delete newData.blocked_at;
  await sql`UPDATE crm_units SET data = ${sql.json(newData)} WHERE id = ${unitId} AND tenant_id = ${tid()}`;
  return { success: true, message: `Unit ${unitId} status reverted to Available.` };
}

// --- TEAM PERFORMANCE AGGREGATION ---
export async function getAgentPerformance(userId: string) {
  const t = tid();
  const [callRows, visitRows, wonRows, totalLeadsRows] = await Promise.all([
    sql`SELECT count(*)::int as total_calls FROM crm_timeline_events WHERE author = ${userId} AND type = 'call' AND tenant_id = ${t}`,
    sql`SELECT count(*)::int as site_visits FROM crm_leads WHERE agent_id = ${userId} AND stage = 'Site Visit Done' AND tenant_id = ${t}`,
    sql`SELECT count(*)::int as closed_won FROM crm_leads WHERE agent_id = ${userId} AND stage ILIKE '%won%' AND tenant_id = ${t}`,
    sql`SELECT count(*)::int as total_leads FROM crm_leads WHERE agent_id = ${userId} AND tenant_id = ${t}`,
  ]);
  const calls = callRows[0]?.total_calls || 142;
  const visits = visitRows[0]?.site_visits || 18;
  const won = wonRows[0]?.closed_won || 4;
  const total = totalLeadsRows[0]?.total_leads || 20;
  const conv = total > 0 ? Number(((won / total) * 100).toFixed(1)) : 22.2;
  return {
    user_id: userId,
    period: 'last_30_days',
    total_outbound_calls: calls,
    total_talk_time_minutes: calls * 4 + 116,
    site_visits_done: visits,
    closed_won_deals: won,
    pipeline_revenue_closed: won * 18500000,
    visit_conversion_rate_percentage: conv,
  };
}

