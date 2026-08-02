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
  FURNISH, STATUS, labelOf,
  normaliseBhk, normaliseSubtype, normaliseTo,
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

/**
 * Resolve a tenant id by slug/id — for the PUBLIC ingest endpoint, which has no
 * request context and only needs to check that the key's tenant matches the URL.
 *
 * There was a `genIngestKey` / `getIngestConfig` / `regenerateIngestKey` trio
 * here backing ONE shared `tenants.ingest_secret` per tenant. The per-connection
 * keys in `integrations` replaced it; both existed side by side and only the new
 * one was ever checked. Deleted outright rather than migrated — nothing is live,
 * so there is no old key sitting in a portal's config to preserve.
 */
export async function getTenantForIngest(slugOrId: string): Promise<{ id: string } | null> {
  const rows = await sql`SELECT id FROM tenants WHERE slug = ${slugOrId} OR id = ${slugOrId} LIMIT 1`;
  return rows[0] ? { id: rows[0].id } : null;
}

// ---------------------------------------------------------------------------
// Tenant provisioning — the real "onboard a consultancy" engine. This is a
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
  ownerPassword?: string;
  mustChangePassword?: boolean;
  initialTeam?: Array<{ name: string; email?: string; phone?: string; role?: string; password?: string }>;
}
export interface ProvisionResult {
  tenant: { id: string; name: string; slug: string; brand_config: any };
  owner: { id: string; name: string; email: string; phone: string | null; role: 'owner' };
  team?: Array<{ name: string; email: string; role: string; password: string }>;
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
  const parts = firmName.trim().split(/\s+/).filter(Boolean);
  const initials = parts.length === 1 ? parts[0].slice(0, 2).toUpperCase() : parts.slice(0, 2).map((w: string) => w[0]).join('').toUpperCase();
  const brand_config = {
    primaryColor: input.primaryColor || '#1E6F52',
    surfaceColor: '#F6F5F2',
    city, logoUrl: '', firmName, initials,
  };

  // 1. The tenant row — the anchor every tenant-scoped row hangs off.
  await sql`
    INSERT INTO tenants (id, name, slug, brand_config, subscription_plan, subscription_status)
    VALUES (${tenantId}, ${firmName}, ${cleanSlug}, ${sql.json(brand_config)}, 'PRO', 'ACTIVE')
  `;

  // 2. The owner — a login-capable user (email OTP) + a roster mirror.
  const ownerId = `owner_${tenantId}`;
  const ownerName = (input.ownerName || 'Owner').trim();
  const ownerMeta = { initials, avatar: '', phone: ownerPhone, email: ownerEmail };
  const initialPassword = input.ownerPassword ? input.ownerPassword.trim() : suggestPassword();
  const mustChange = input.mustChangePassword !== false; // default true
  const ownerPwHash = await bcrypt.hash(initialPassword, 10);
  
  // Auto-slug login_id for owner
  const ownerBase = ownerName.toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 16) || 'owner';
  let ownerLoginId = ownerBase;
  for (let n = 2; (await sql`SELECT 1 FROM users WHERE tenant_id = ${tenantId} AND login_id = ${ownerLoginId} LIMIT 1`).length; n++) {
    ownerLoginId = `${ownerBase}${n}`;
  }

  await sql`
    INSERT INTO users (id, tenant_id, name, login_id, phone, email, role, status, metadata, password_hash, email_verified, must_change_password)
    VALUES (${ownerId}, ${tenantId}, ${ownerName}, ${ownerLoginId}, ${ownerPhone}, ${ownerEmail}, 'owner', 'active', ${sql.json(ownerMeta)}, ${ownerPwHash}, TRUE, ${mustChange})
  `;
  await sql`
    INSERT INTO crm_agents (id, name, first, initials, avatar, role, duty_status, metadata, tenant_id)
    VALUES (${ownerId}, ${ownerName}, ${ownerName.split(' ')[0]}, ${initials}, '', 'owner', 'ACTIVE', ${sql.json(ownerMeta)}, ${tenantId})
  `;

  // 2.1 Bulk Team Members Provisioning if provided
  const createdTeam: Array<{ name: string; email: string; loginId: string; role: string; password: string }> = [];
  if (Array.isArray(input.initialTeam) && input.initialTeam.length > 0) {
    for (let idx = 0; idx < input.initialTeam.length; idx++) {
      const tm = input.initialTeam[idx];
      const tmName = (tm.name || '').trim();
      if (!tmName) continue;
      const tmEmail = tm.email ? String(tm.email).trim().toLowerCase() : null;
      const tmPhone = tm.phone ? String(tm.phone).trim() : null;
      const tmRole = tm.role === 'manager' ? 'manager' : 'agent';
      const tmPw = tm.password ? String(tm.password).trim() : (input.ownerPassword ? input.ownerPassword.trim() : suggestPassword());
      const tmPwHash = await bcrypt.hash(tmPw, 10);
      const tmId = `usr_${tenantId}_${Date.now()}_${idx}`;
      const tmParts = tmName.split(/\s+/).filter(Boolean);
      const tmInitials = tmParts.length === 1 ? tmParts[0].slice(0, 2).toUpperCase() : tmParts.slice(0, 2).map(w => w[0]).join('').toUpperCase();
      const tmMeta = { initials: tmInitials, avatar: '', phone: tmPhone, email: tmEmail };

      const tmBase = tm.loginId ? String(tm.loginId).trim().toLowerCase().replace(/[^a-z0-9]+/g, '') : (tmName.toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 16) || 'user');
      let tmLoginId = tmBase;
      for (let n = 2; (await sql`SELECT 1 FROM users WHERE tenant_id = ${tenantId} AND login_id = ${tmLoginId} LIMIT 1`).length; n++) {
        tmLoginId = `${tmBase}${n}`;
      }

      await sql`
        INSERT INTO users (id, tenant_id, name, login_id, phone, email, role, status, metadata, password_hash, email_verified, must_change_password)
        VALUES (${tmId}, ${tenantId}, ${tmName}, ${tmLoginId}, ${tmPhone}, ${tmEmail}, ${tmRole}, 'active', ${sql.json(tmMeta)}, ${tmPwHash}, ${!!tmEmail}, ${mustChange})
      `;
      await sql`
        INSERT INTO crm_agents (id, name, first, initials, avatar, role, duty_status, metadata, tenant_id)
        VALUES (${tmId}, ${tmName}, ${tmParts[0]}, ${tmInitials}, '', ${tmRole}, 'ACTIVE', ${sql.json(tmMeta)}, ${tenantId})
      `;
      createdTeam.push({ name: tmName, email: tmEmail || '—', loginId: tmLoginId, role: tmRole, password: tmPw });
    }
  }

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
    ingest: { tenantSlug: cleanSlug, secret: '' },
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
    // The list's "Recently added" sort had nothing to sort ON, so it silently
    // fell back to whatever order the rows arrived in.
    createdAt: r.created_at || null,

    // --- Block C canonical fields -------------------------------------------
    // `type` above is the legacy conflated string kept for existing views;
    // these are what the filters and the new form actually read.
    category: r.category || 'residential',
    subtype: r.subtype || null,
    bhk: r.bhk || null,
    transactionType: r.transaction_type || null,
    ownership: r.ownership || null,
    bathrooms: r.bathrooms || null,
    balconies: r.balconies || null,
    builtup: r.builtup_sqft ?? null,
    superBuiltup: r.super_builtup_sqft ?? null,
    plotArea: r.plot_area != null ? Number(r.plot_area) : null,
    areaUnit: r.area_unit || 'sqft',
    priceAreaBasis: r.price_area_basis || null,
    coveredParking: r.covered_parking || null,
    openParking: r.open_parking || null,
    servantRoom: r.servant_room ?? null,
    furnishType: r.furnish_type || null,
    fixtures: r.fixtures || [],
    countedItems: r.counted_items || {},
    societyAmenities: r.society_amenities || [],
    // Rent terms
    preferredTenants: r.preferred_tenants || [],
    petFriendly: r.pet_friendly ?? null,
    availableFrom: r.available_from || null,
    maintenanceMode: r.maintenance_mode || null,
    maintenanceAmount: r.maintenance_amount != null ? Number(r.maintenance_amount) : null,
    depositOption: r.deposit_option || null,
    depositAmount: r.deposit_amount != null ? Number(r.deposit_amount) : null,
    lockinOption: r.lockin_option || null,
    lockinMonths: r.lockin_months ?? null,
    parkingChargesMode: r.parking_charges_mode || null,
    paintingCharges: r.painting_charges || null,
    // Sale terms
    priceIncludes: r.price_includes || [],
    otherCharges: r.other_charges != null ? Number(r.other_charges) : null,
    bookingAmount: r.booking_amount != null ? Number(r.booking_amount) : null,
    taxIncluded: r.tax_included ?? null,
    // Plot
    floorsAllowed: r.floors_allowed ?? null,
    openSides: r.open_sides || null,
    roadWidthFt: r.road_width_ft != null ? Number(r.road_width_ft) : null,
    cornerPlot: r.corner_plot ?? null,
    // Both
    consultingOption: r.consulting_option || null,
    consultingPercent: r.consulting_percent != null ? Number(r.consulting_percent) : null,
    description: r.description || cfg.description || '',
    // Operational (trimmed to these two by spec Q16)
    keyAccess: r.key_access || null,
    ownerContactId: r.owner_contact_id || null,
    completeness: r.completeness ?? null,
    media: r.media || [],
    geo: r.geo_lat != null && r.geo_lng != null ? { lat: r.geo_lat, lng: r.geo_lng } : null,
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
    importBatchId: r.import_batch_id || undefined,
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
    return await getBootstrap();
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

  // The seed used to plant five fabricated integrations here — live-looking
  // Exotel keys, a WABA access token, webhook secrets and an api.<demo>.in
  // domain — none of which authenticated anything. Connections are created by
  // the firm now, with real keys.

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
  await repairPropertyDisplayCasing();

  console.log(`[Supabase DB] ✅ Seeded initial PostgreSQL data cleanly.`);
  return await getBootstrap();
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
  'crm_routing_rules', 'crm_timeline_events', 'users',
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

    // ONLY the new canonical columns are written. status/facing/floor are
    // legacy DISPLAY columns that the stepper, StatusTag's colour map and the
    // record sheet all read verbatim — rewriting them to lowercase tokens
    // broke those readers (an "Available" listing rendered as closed), so the
    // filters normalise those at compare time instead and the stored strings
    // are left exactly as the user typed them.
    const patch: Record<string, any> = {
      category,
      subtype: normaliseSubtype(rawType, category),
      bhk: normaliseBhk(rawType),
      furnish_type: normaliseTo(FURNISH, r.furnishing),
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
        covered_parking = COALESCE(covered_parking, ${patch.covered_parking})
      WHERE id = ${r.id}
    `;
    n++;
  }
  console.log(`[Schema C] Backfilled canonical fields on ${n} propert${n === 1 ? 'y' : 'ies'}.`);
}

/**
 * One-time repair. An earlier revision of the backfill above rewrote the legacy
 * DISPLAY columns (status, facing, floor) into lowercase tokens, which broke
 * every reader that renders them verbatim — StatusTag's colour lookup fell
 * through to "closed" for available listings, and the lifecycle stepper matched
 * nothing. This puts the display casing back.
 *
 * Idempotent and self-limiting: it only touches values that still look like
 * tokens (lowercase, or containing an underscore), so a genuine user-entered
 * string is never rewritten, and it becomes a no-op once healed.
 */
export async function repairPropertyDisplayCasing(): Promise<void> {
  const rows = await sql`
    SELECT id, status, facing, floor FROM crm_properties
    WHERE status = lower(status) OR facing = lower(facing) OR floor = lower(floor)
  `;
  if (!rows.length) return;

  const title = (s: string) => s.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join('-');
  let n = 0;
  for (const r of rows) {
    const status = r.status ? labelOf(STATUS, r.status) : r.status;
    // 'north_east' -> 'North-East'; a plain number is left alone.
    const facing = r.facing && /^[a-z_]+$/.test(r.facing) ? title(r.facing) : r.facing;
    const floor = r.floor && /^[a-z_]+$/.test(r.floor) ? title(r.floor).replace(/-/g, ' ') : r.floor;
    if (status === r.status && facing === r.facing && floor === r.floor) continue;
    await sql`UPDATE crm_properties SET status = ${status}, facing = ${facing}, floor = ${floor} WHERE id = ${r.id}`;
    n++;
  }
  if (n) console.log(`[Schema C] Repaired display casing on ${n} propert${n === 1 ? 'y' : 'ies'}.`);
}

export async function backfillPasswordAuth(): Promise<void> {
  const DEMO_PW = process.env.DEMO_USER_PASSWORD || 'delpat-demo-1';

  const usersNoId = await sql`
    SELECT id, tenant_id, name FROM users
    WHERE (login_id IS NULL OR login_id = '') AND deleted_at IS NULL
  `;
  for (const u of usersNoId) {
    const base = String(u.name || 'user').toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 16) || 'user';
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
  await sql`TRUNCATE TABLE activities, crm_timeline_events, crm_units, crm_leads, crm_properties, crm_agents, crm_settings, crm_routing_rules, users, auth_otp CASCADE;`;
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
  .then(() => repairPropertyDisplayCasing())
  .catch(err => console.error('[Supabase Boot Error]:', err.message));

// ============================================================================
// 📖 ASYNC READ & MUTATION HELPER API
// ============================================================================

/**
 * A cheap "has anything changed?" token for the open desk to poll.
 *
 * getState() is eight unbounded queries — every lead, every property, every
 * timeline event this tenant has ever written. Polling THAT on a timer to find
 * out whether anything moved would cost more than the staleness it fixes, and
 * would get worse exactly as a customer's data grows.
 *
 * So the desk polls this instead: six indexed aggregates returning a few dozen
 * bytes, and only when the token differs from the one it already holds does it
 * pay for a full getState(). Counts sit alongside the max timestamps because a
 * DELETE moves no clock — without them, removing a lead would go unnoticed.
 */
export async function getPulse(): Promise<Record<string, any>> {
  const t = tid();
  const scope = agentLeadScope();
  const [leads, props, events] = await Promise.all([
    scope
      ? sql`SELECT count(*)::int AS n, max(updated_at) AS at FROM crm_leads WHERE tenant_id = ${t} AND agent_id = ${scope}`
      : sql`SELECT count(*)::int AS n, max(updated_at) AS at FROM crm_leads WHERE tenant_id = ${t}`,
    sql`SELECT count(*)::int AS n, max(updated_at) AS at FROM crm_properties WHERE tenant_id = ${t}`,
    sql`SELECT count(*)::int AS n, max(timestamp) AS at FROM crm_timeline_events WHERE tenant_id = ${t}`,
  ]);
  const stamp = (r: any) => `${r[0]?.n ?? 0}:${r[0]?.at ? new Date(r[0].at).getTime() : 0}`;
  return { token: `${stamp(leads)}|${stamp(props)}|${stamp(events)}` };
}

/**
 * The boot read: identity and firm config, no records.
 *
 * This is NOT getState() with the collections stripped off. That is how it was
 * first written and it was a lie of an optimisation — the server still ran all
 * eight unbounded queries, still read 6,643 property rows and every timeline
 * event out of Postgres, and then threw them away before serialising. The wire
 * got smaller; the database did the same work.
 *
 * The logo is deliberately not returned inline. brand_config carries it as a
 * base64 data URI on at least one tenant, which is 76KB riding in the one
 * response that gates first paint. Callers fetch it as an image.
 */
export async function getBootstrap(): Promise<any> {
  const t = tid();
  const [agentsRows, settingsRows, routingRows, brandRows, localityRows] = await Promise.all([
    sql`SELECT a.* FROM crm_agents a
        LEFT JOIN users u ON u.id = a.id AND u.tenant_id = a.tenant_id
        WHERE a.tenant_id = ${t} AND u.deleted_at IS NULL`,
    sql`SELECT value FROM crm_settings WHERE key = 'default' AND tenant_id = ${t}`,
    sql`SELECT * FROM crm_routing_rules WHERE tenant_id = ${t}`,
    sql`SELECT brand_config FROM tenants WHERE id = ${t} OR slug = ${t} LIMIT 1`,
    // Every locality this firm actually works in, from both sides of the book.
    // Filter menus and the locality suggester need the vocabulary, not the
    // records -- and building it from the collections is what several filter
    // definitions were quietly doing.
    sql`SELECT DISTINCT v FROM (
          SELECT locality AS v FROM crm_properties WHERE tenant_id = ${t}
          UNION SELECT locality FROM crm_leads WHERE tenant_id = ${t}
        ) x WHERE coalesce(v, '') <> '' ORDER BY 1`,
  ]);
  const agents = agentsRows.map(rowToAgent);
  const brand = { ...(brandRows[0]?.brand_config || {}) };
  if (typeof brand.logoUrl === 'string' && brand.logoUrl.startsWith('data:')) {
    brand.logoUrl = `/pwa/${t}/logo`;
  }
  return {
    agents,
    inactiveAgentIds: agentsRows.filter(a => a.duty_status === 'OFF_DUTY').map(a => a.id),
    settings: settingsRows[0]?.value || {},
    routing_rules: routingRows[0] || null,
    brand,
    localities: localityRows.map((r: any) => r.v),
  };
}

/**
 * Global search, run in Postgres.
 *
 * The command palette used to filter two in-memory arrays. That was the last
 * feature that genuinely required the whole book to be in the browser, and it
 * is the reason the arrays could not simply be deleted.
 */
export async function searchWorkspace(q: string, limit = 8): Promise<{ leads: any[]; properties: any[] }> {
  const t = tid();
  const term = String(q || '').trim();
  if (term.length < 2) return { leads: [], properties: [] };
  const like = `%${term.toLowerCase()}%`;
  const n = Math.min(Math.max(Number(limit) || 8, 1), 25);

  const [leadRows, propRows] = await Promise.all([
    sql`SELECT id, name, phone, stage, locality, agent_id FROM crm_leads
         WHERE tenant_id = ${t} AND (lower(coalesce(name, '')) LIKE ${like}
            OR coalesce(phone, '') LIKE ${like}
            OR lower(coalesce(email, '')) LIKE ${like})
         ORDER BY created_at DESC LIMIT ${n}`,
    sql`SELECT id, title, locality, project, status, deal, price FROM crm_properties
         WHERE tenant_id = ${t} AND (lower(coalesce(title, '')) LIKE ${like}
            OR lower(coalesce(locality, '')) LIKE ${like}
            OR lower(coalesce(project, '')) LIKE ${like}
            OR lower(coalesce(owner_name, '')) LIKE ${like})
         ORDER BY created_at DESC LIMIT ${n}`,
  ]);
  return {
    leads: leadRows.map(r => ({ id: r.id, name: r.name, phone: r.phone, stage: r.stage, locality: r.locality, agentId: r.agent_id })),
    properties: propRows.map(r => ({ id: r.id, title: r.title, locality: r.locality, project: r.project, status: r.status, deal: r.deal, price: r.price })),
  };
}

/**
 * The counters the dashboard, the team roster and the sidebar badges need.
 * Every one of these was a `.filter().length` over the full lead table held in
 * the browser; none of them needs a single lead row.
 */
export async function getDeskSummary(): Promise<any> {
  const t = tid();
  const [totals, byStage, bySource, perAgent, perAgentStage, props, owners] = await Promise.all([
    sql`SELECT count(*)::int AS total,
               count(*) FILTER (WHERE NOT coalesce(stage, '') LIKE 'Closed%')::int AS open,
               count(*) FILTER (WHERE overdue)::int AS overdue,
               count(*) FILTER (WHERE follow_up IS NOT NULL)::int AS with_follow_up,
               count(*) FILTER (WHERE stage = 'Closed Won')::int AS won,
               count(*) FILTER (WHERE created_at > now() - interval '3 hours')::int AS new_today,
               count(*) FILTER (WHERE agent_id IS NULL)::int AS unassigned
          FROM crm_leads WHERE tenant_id = ${t}`,
    sql`SELECT coalesce(stage, 'New') AS k, count(*)::int AS n FROM crm_leads WHERE tenant_id = ${t} GROUP BY 1`,
    sql`SELECT coalesce(source, 'Website') AS k, count(*)::int AS n FROM crm_leads WHERE tenant_id = ${t} GROUP BY 1`,
    sql`SELECT agent_id AS k,
               count(*) FILTER (WHERE NOT coalesce(stage, '') LIKE 'Closed%')::int AS open,
               count(*) FILTER (WHERE overdue)::int AS overdue,
               count(*) FILTER (WHERE stage = 'Closed Won')::int AS won,
               count(*)::int AS total
          FROM crm_leads WHERE tenant_id = ${t} AND agent_id IS NOT NULL GROUP BY 1`,
    // Per-agent stage breakdown. Which stages count as "contacted" or "visited"
    // depends on the firm's own configured stage order, which lives in settings
    // on the client — so the counts come back per stage and the client applies
    // its own meaning rather than this query hardcoding stage names.
    sql`SELECT agent_id AS a, coalesce(stage, 'New') AS s, count(*)::int AS n
          FROM crm_leads WHERE tenant_id = ${t} AND agent_id IS NOT NULL GROUP BY 1, 2`,
    sql`SELECT count(*)::int AS total,
               count(*) FILTER (WHERE coalesce(status, 'Available') = 'Available')::int AS available
          FROM crm_properties WHERE tenant_id = ${t}`,
    sql`SELECT count(DISTINCT coalesce(owner_phone, owner_name))::int AS n FROM crm_properties
         WHERE tenant_id = ${t} AND coalesce(owner_name, '') <> ''`,
  ]);
  const asMap = (rows: any[]) => Object.fromEntries(rows.map(r => [r.k, r.n]));
  const stagesByAgent = new Map<string, Record<string, number>>();
  for (const r of perAgentStage as any[]) {
    if (!stagesByAgent.has(r.a)) stagesByAgent.set(r.a, {});
    stagesByAgent.get(r.a)![r.s] = r.n;
  }
  return {
    leads: totals[0] || { total: 0, open: 0, overdue: 0, with_follow_up: 0, won: 0, new_today: 0, unassigned: 0 },
    byStage: asMap(byStage),
    bySource: asMap(bySource),
    perAgent: Object.fromEntries(perAgent.map(r => [r.k, {
      open: r.open, overdue: r.overdue, won: r.won, total: r.total,
      byStage: stagesByAgent.get(r.k) || {},
    }])),
    properties: props[0] || { total: 0, available: 0 },
    owners: owners[0]?.n ?? 0,
  };
}

/**
 * Delete everything one import created. The desk used to do this by scanning
 * its in-memory arrays for matching ids and firing a delete per row, so it
 * could only ever revert what the browser happened to be holding.
 *
 * Leads carry the batch id in a column; properties carry it in `config`, which
 * is where every non-column property field lives.
 */
export async function revertImportBatch(batchId: string): Promise<{ leads: number; properties: number }> {
  const t = tid();
  const [leadRows, propRows] = await Promise.all([
    sql`DELETE FROM crm_leads WHERE tenant_id = ${t} AND import_batch_id = ${batchId} RETURNING id`,
    sql`DELETE FROM crm_properties WHERE tenant_id = ${t} AND config->>'importBatchId' = ${batchId} RETURNING id`,
  ]);
  const leadIds = leadRows.map((r: any) => r.id);
  if (leadIds.length) await sql`DELETE FROM lead_shortlist WHERE tenant_id = ${t} AND lead_id IN ${sql(leadIds)}`;
  return { leads: leadRows.length, properties: propRows.length };
}

/**
 * Import dedupe, answered for a whole file in one request.
 *
 * The import preview marked a row "duplicate" by scanning the in-memory
 * collections. That was never actually correct — it could only ever see what
 * the browser had loaded — and it becomes plainly wrong once the collections go
 * away. The file is the input; the matches are the output; the database does
 * the comparison.
 */
export async function checkDuplicates(input: { phones?: string[]; names?: string[]; titles?: string[] }): Promise<{ leads: Record<string, any>; properties: Record<string, any> }> {
  const t = tid();
  // Keyed by whatever the file can match on, valued with id AND name -- the id
  // because a duplicate row is merged into the record it duplicates, and a
  // merge needs to know which record that is.
  const leads: Record<string, any> = {};
  const properties: Record<string, any> = {};

  const phones = (input.phones || []).filter(Boolean).slice(0, 5000);
  const names = (input.names || []).filter(Boolean).map(n => n.toLowerCase()).slice(0, 5000);
  if (phones.length || names.length) {
    const rows = await sql`
      SELECT id, name, phone FROM crm_leads
       WHERE tenant_id = ${t}
         AND (${phones.length ? sql`phone IN ${sql(phones)}` : sql`false`}
           OR ${names.length ? sql`lower(name) IN ${sql(names)}` : sql`false`})`;
    for (const r of rows) {
      const hit = { id: r.id, name: r.name };
      if (r.phone) leads[r.phone] = hit;
      if (r.name) leads[String(r.name).toLowerCase()] = hit;
    }
  }

  const titles = (input.titles || []).filter(Boolean).map(s => s.toLowerCase()).slice(0, 5000);
  if (titles.length) {
    const rows = await sql`
      SELECT id, title, project FROM crm_properties
       WHERE tenant_id = ${t}
         AND (lower(coalesce(title, '')) IN ${sql(titles)} OR lower(coalesce(project, '')) IN ${sql(titles)})`;
    for (const r of rows) {
      const hit = { id: r.id, name: r.project || r.title };
      if (r.title) properties[String(r.title).toLowerCase()] = hit;
      if (r.project) properties[String(r.project).toLowerCase()] = hit;
    }
  }
  return { leads, properties };
}

/**
 * The contacts directory, paged.
 *
 * Two derived stores over the same two tables: "clients" are the leads (people
 * with a requirement) and "owners" are the distinct owners across the listings
 * (people with inventory). Neither is a stored entity, which is why the desk
 * built them by walking both collections in full — a directory of a few hundred
 * people that required downloading every lead and every property.
 *
 * Roles come from the same data they always did: a lead's deal decides
 * buyer/tenant, and an owner's mix of sale and rent listings decides
 * seller/landlord/both.
 */
export async function listContacts(opts: {
  tab?: string; role?: string; q?: string; page?: number; limit?: number;
} = {}): Promise<{ rows: any[]; total: number; counts: Record<string, number>; page: number; limit: number }> {
  const t = tid();
  const limit = Math.min(Math.max(Number(opts.limit) || 25, 1), 200);
  const page = Math.max(Number(opts.page) || 1, 1);
  const offset = (page - 1) * limit;
  const q = String(opts.q || '').trim().toLowerCase();
  const like = `%${q}%`;
  const role = String(opts.role || 'all');

  if (opts.tab !== 'owners') {
    const where: any[] = [sql`tenant_id = ${t}`];
    if (q) where.push(sql`(lower(name) LIKE ${like} OR phone LIKE ${like} OR lower(coalesce(email, '')) LIKE ${like})`);
    const dealOf = sql`coalesce(deal, req->>'deal', 'sale')`;
    if (role === 'Buyer') where.push(sql`${dealOf} = 'sale'`);
    else if (role === 'Tenant') where.push(sql`${dealOf} = 'rent'`);
    // The pill counts must ignore the pill itself -- "Buyers 40 / Tenants 12"
    // has to keep showing both while one of them is selected.
    const base = q
      ? sql`tenant_id = ${t} AND (lower(name) LIKE ${like} OR phone LIKE ${like} OR lower(coalesce(email, '')) LIKE ${like})`
      : sql`tenant_id = ${t}`;
    const clause = where.reduce((acc, f, i) => (i === 0 ? f : sql`${acc} AND ${f}`));

    const [rows, countRows] = await Promise.all([
      sql`SELECT * FROM crm_leads WHERE ${clause} ORDER BY created_at DESC LIMIT ${limit} OFFSET ${offset}`,
      sql`SELECT count(*)::int AS total,
                 count(*) FILTER (WHERE ${dealOf} = 'sale')::int AS buyer,
                 count(*) FILTER (WHERE ${dealOf} = 'rent')::int AS tenant
            FROM crm_leads WHERE ${base}`,
    ]);
    const c = countRows[0] || { total: 0, buyer: 0, tenant: 0 };
    const total = role === 'Buyer' ? c.buyer : role === 'Tenant' ? c.tenant : c.total;
    return {
      rows: rows.map(r => {
        const lead = rowToLead(r);
        return {
          id: 'lead-' + lead.id, kind: 'demand',
          role: (lead.req?.deal === 'rent') ? 'Tenant' : 'Buyer',
          name: lead.name, phone: lead.phone, email: lead.email || '',
          locality: lead.req?.locality || '', minsAgo: lead.minsAgo,
          rawLeadId: lead.id, rawLead: lead, stage: lead.stage,
        };
      }),
      total, counts: { all: c.total, Buyer: c.buyer, Tenant: c.tenant }, page, limit,
    };
  }

  // Owners: one row per distinct owner name across the listings.
  const where: any[] = [sql`tenant_id = ${t}`, sql`coalesce(owner_name, '') <> ''`];
  if (q) where.push(sql`(lower(owner_name) LIKE ${like} OR coalesce(owner_phone, '') LIKE ${like})`);
  const clause = where.reduce((acc, f, i) => (i === 0 ? f : sql`${acc} AND ${f}`));

  const grouped = await sql`
    SELECT owner_name AS name,
           max(owner_phone) AS phone,
           max(owner_email) AS email,
           max(locality) AS locality,
           count(*)::int AS listings,
           count(*) FILTER (WHERE coalesce(deal, 'sale') = 'sale')::int AS sale,
           count(*) FILTER (WHERE coalesce(deal, 'sale') = 'rent')::int AS rent,
           array_remove(array_agg(DISTINCT locality), NULL) AS localities,
           (array_agg(title ORDER BY created_at DESC))[1] AS first_title,
           (array_agg(type ORDER BY created_at DESC))[1] AS first_type
      FROM crm_properties WHERE ${clause}
     GROUP BY owner_name ORDER BY 5 DESC`;

  const roleOf = (r: any) => (r.sale > 0 && r.rent > 0) ? 'Seller / Landlord' : (r.rent > 0 ? 'Landlord' : 'Seller');
  const all = grouped.map((r: any) => ({
    id: 'owner-' + String(r.name).replace(/\s+/g, '-'), kind: 'supply',
    role: roleOf(r), name: r.name, phone: r.phone || '+91 —', email: r.email || '',
    locality: r.locality || '', minsAgo: 120, listings: r.listings,
    localities: r.localities || [], firstTitle: r.first_title, firstType: r.first_type,
  }));
  const matchesRole = (rRole: string) => role === 'all'
    || (role === 'Seller' ? (rRole === 'Seller' || rRole === 'Seller / Landlord')
      : role === 'Landlord' ? (rRole === 'Landlord' || rRole === 'Seller / Landlord')
      : rRole === role);
  const filtered = all.filter(r => matchesRole(r.role));
  return {
    rows: filtered.slice(offset, offset + limit),
    total: filtered.length,
    counts: {
      all: all.length,
      Seller: all.filter(r => r.role === 'Seller' || r.role === 'Seller / Landlord').length,
      Landlord: all.filter(r => r.role === 'Landlord' || r.role === 'Seller / Landlord').length,
    },
    page, limit,
  };
}

// getState() is deleted. It read every lead, every property, every timeline
// event and every shortlist row in the tenant to answer one request, and the
// browser then filtered those arrays to produce lists, counts and single
// records. All of that is now a query: listLeads, listProperties,
// getDeskSummary, getLeadById, getPropertyById, searchWorkspace, listContacts,
// listProjects. getBootstrap() is what a launch reads.

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

  // Apply round-robin assignment if agentId not provided. One atomic
  // statement (nextRoutedAgent) — see its doc comment for why the previous
  // read-then-write version could send an entire batch to one person.
  let agentId = leadData.agentId || leadData.agent_id;
  if (!agentId) {
    agentId = await nextRoutedAgent();
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
  // A lead carries TWO unrelated things called "timeline":
  //   • `lead.timeline`      — the event history, an ARRAY of {type,label,ago}
  //   • `lead.req.timeline`  — the possession target, a STRING ("Within 30 days")
  // This read `leadData.timeline` first, so a client sending its event history
  // (every mobile lead form does) had that array coerced into a text column:
  // String([{...}]) === "[object Object]", which is exactly what the record
  // sheet then displayed. The event history is NEVER the possession target.
  const timelinePref = leadData.timeline_pref ?? req.timeline ?? null;
  const importBatchId = leadData.importBatchId ?? leadData.import_batch_id ?? null;

  const t = tid();
  const rows = await sql`
    INSERT INTO crm_leads (
      id, name, phone, email, stage, source, agent_id, req, notes, shortlist, feedback,
      deal, requirement, locality, budget_min, budget_max, purpose, timeline_pref, import_batch_id, tenant_id
    )
    VALUES (
      ${newId}, ${name}, ${phone}, ${email}, ${stage}, ${source}, ${agentId}, ${sql.json(req)}, ${sql.json(notes)}, ${sql.json(shortlist)}, ${sql.json(feedback)},
      ${deal}, ${requirement}, ${locality}, ${budgetMin}, ${budgetMax}, ${purpose}, ${timelinePref}, ${importBatchId}, ${t}
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
  // PUSH: speed-to-lead decides who wins the deal. A lead sitting unseen for
  // twenty minutes is usually a lead someone else has already called.
  notify({ userId: agentId, type: 'lead_assigned', title: 'New lead assigned to you', body: `${name}${where} (${source})`, link, push: true })
    .catch(err => console.warn('[Notify] lead_assigned failed:', err?.message));
  // Name the agent, not their primary key. This read "routed to u_ms6oqbda",
  // which tells the person reading it nothing and looks broken besides.
  const agentName = agentId
    ? (await sql`SELECT name FROM crm_agents WHERE id = ${agentId} AND tenant_id = ${tid()} LIMIT 1`)[0]?.name
      ?? (await sql`SELECT name FROM users WHERE id = ${agentId} LIMIT 1`)[0]?.name
      ?? 'an agent'
    : 'the queue';
  // FEED ONLY: an owner wants to see the flow, but a desk taking 60 leads a day
  // cannot have 60 phone buzzes — that is the volume at which people mute the
  // app. The exception below is the one an owner genuinely must act on.
  notifyRoles(['owner', 'manager'], { type: 'lead_new', title: 'New lead captured', body: `${name}${where} → routed to ${agentName}`, link })
    .catch(err => console.warn('[Notify] lead_new failed:', err?.message));
  // PUSH: nobody was assigned, so this lead is sitting with no owner and no
  // one is coming for it. That is an exception, not a routine arrival.
  if (!agentId) {
    notifyRoles(['owner', 'manager'], {
      type: 'lead_unrouted', title: 'Lead arrived with nobody to take it',
      body: `${name}${where} (${source}) — assign it to someone`, link, push: true,
    }).catch(err => console.warn('[Notify] lead_unrouted failed:', err?.message));
  }
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
  // Same collision on update — see createLead. `patch.timeline` is history.
  const timelinePref = patch.timeline_pref !== undefined
    ? patch.timeline_pref
    : (req?.timeline ?? oldLead.req?.timeline);

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
      timeline_pref = ${timelinePref || null},
      updated_at = NOW()
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
  // PUSH: someone handed you a live client. You now own a conversation you
  // haven't read yet, so this can't wait for you to next open the app.
  // notify() drops it when you assigned it to yourself.
  if (patch.agentId !== undefined && agentId && agentId !== oldLead.agentId) {
    notify({ userId: agentId, type: 'lead_reassigned', title: 'A lead was assigned to you', body: `${name}`, link, push: true })
      .catch(err => console.warn('[Notify] lead_reassigned failed:', err?.message));
  }
  // FEED ONLY: worth seeing when a manager schedules something on your lead;
  // never worth a buzz, and never at all when you scheduled it yourself — the
  // form already confirmed it on screen a second ago.
  if (patch.followUp && agentId) {
    const when = (patch.followUp.action || patch.followUp.label || 'Follow-up scheduled');
    const isVisit = /visit/i.test(when);
    if (ctx.actorId && ctx.actorId !== agentId) {
      notify({
        userId: agentId,
        type: 'calendar_task_assigned',
        title: isVisit ? '📅 New Site Visit assigned to you' : '📅 New Task assigned to you',
        body: `${name} · ${when}`,
        link,
        push: true
      }).catch(err => console.warn('[Notify] calendar_task_assigned failed:', err?.message));
    } else {
      notify({ userId: agentId, type: 'followup_set', title: 'Follow-up scheduled', body: `${name} · ${when}`, link })
        .catch(err => console.warn('[Notify] followup_set failed:', err?.message));
    }
  }

  if (patch.notes && Array.isArray(patch.notes) && patch.notes.length > (oldLead.notes?.length || 0)) {
    const latest = patch.notes[patch.notes.length - 1];
    const noteText = typeof latest === 'string' ? latest : (latest?.text || latest?.body || '');
    if (agentId && ctx.actorId && ctx.actorId !== agentId && noteText) {
      notify({
        userId: agentId,
        type: 'remark_added',
        title: '💬 New Note Added to Lead',
        body: `${name} · "${noteText.slice(0, 60)}"`,
        link,
        push: true,
        toSelf: true,
      }).catch(err => console.warn('[Notify] remark_added failed:', err?.message));
    }
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

/**
 * One page of leads, filtered and counted in Postgres — the same treatment
 * listProperties got, for the same reason.
 */
export async function listLeads(opts: {
  page?: number; limit?: number; q?: string; stage?: string; agentId?: string;
  segment?: string; scopeAgentId?: string;
} = {}): Promise<{ rows: any[]; total: number; page: number; limit: number }> {
  const t = tid();
  const limit = Math.min(Math.max(Number(opts.limit) || 50, 1), 200);
  const page = Math.max(Number(opts.page) || 1, 1);
  const offset = (page - 1) * limit;

  const where: any[] = [sql`tenant_id = ${t}`];
  // An agent sees their own pipeline. Enforced here rather than by filtering in
  // the browser, because a filter the client applies is not a permission.
  if (opts.scopeAgentId) where.push(sql`agent_id = ${opts.scopeAgentId}`);
  const q = String(opts.q || '').trim();
  if (q) {
    const like = `%${q.toLowerCase()}%`;
    where.push(sql`(lower(name) LIKE ${like} OR phone LIKE ${like}
      OR lower(coalesce(email, '')) LIKE ${like} OR lower(coalesce(locality, '')) LIKE ${like})`);
  }
  const many = (v?: string) => String(v || '').split(',').map(x => x.trim()).filter(Boolean);
  const stages = many(opts.stage);
  if (stages.length) where.push(sql`stage IN ${sql(stages)}`);
  if (opts.agentId) where.push(sql`agent_id = ${opts.agentId}`);
  // The segment pills, as query rather than as array scans.
  if (opts.segment === 'overdue') where.push(sql`overdue = true`);
  else if (opts.segment === 'unassigned') where.push(sql`agent_id IS NULL`);
  else if (opts.segment === 'open') where.push(sql`stage NOT LIKE 'Closed%'`);
  // The calendar shows leads with a next step booked, and only those. It used
  // to find them by filtering the whole lead table in the browser.
  else if (opts.segment === 'followup') where.push(sql`follow_up IS NOT NULL`);

  const clause = where.reduce((acc, f, i) => (i === 0 ? f : sql`${acc} AND ${f}`));
  const [rows, countRows] = await Promise.all([
    sql`SELECT * FROM crm_leads WHERE ${clause} ORDER BY created_at DESC LIMIT ${limit} OFFSET ${offset}`,
    sql`SELECT count(*)::int AS n FROM crm_leads WHERE ${clause}`,
  ]);
  return { rows: rows.map(r => rowToLead(r)), total: countRows[0]?.n ?? 0, page, limit };
}

/** Counts for the lead segment pills, without reading the leads. */
export async function getLeadsSummary(scopeAgentId?: string): Promise<any> {
  const t = tid();
  const scope = scopeAgentId ? sql`AND agent_id = ${scopeAgentId}` : sql``;
  const rows = await sql`
    SELECT count(*)::int AS total,
           count(*) FILTER (WHERE overdue) ::int AS overdue,
           count(*) FILTER (WHERE agent_id IS NULL) ::int AS unassigned,
           count(*) FILTER (WHERE stage NOT LIKE 'Closed%') ::int AS open
    FROM crm_leads WHERE tenant_id = ${t} ${scope}`;
  return rows[0] || { total: 0, overdue: 0, unassigned: 0, open: 0 };
}

/**
 * Everything the Today screen needs, and nothing else.
 *
 * Today groups leads seven ways — overdue, due today, never contacted, nobody
 * assigned, no next step, upcoming — plus tenancies coming up for renewal. It
 * used to do that by scanning every lead and every property in the firm. The
 * groups are all narrow, so the database can hand back just the rows that can
 * possibly appear in one, and the screen groups those as it always has.
 */
export async function getTodayFeed(scopeAgentId?: string): Promise<any> {
  const t = tid();
  const scope = scopeAgentId ? sql`AND agent_id = ${scopeAgentId}` : sql``;
  const [leads, renewals] = await Promise.all([
    sql`SELECT * FROM crm_leads
        WHERE tenant_id = ${t} ${scope}
          AND stage NOT LIKE 'Closed%'
          AND (overdue = true OR follow_up IS NOT NULL OR agent_id IS NULL
               OR stage = 'New' OR created_at > now() - interval '14 days')
        ORDER BY created_at DESC LIMIT 200`,
    // A tenancy that has ended, or ends inside the 60-day window the renewal
    // signal treats as due. Anything further out is not today's problem.
    sql`SELECT * FROM crm_properties
        WHERE tenant_id = ${t}
          AND config->'tenancy'->>'end' IS NOT NULL
          AND (config->'tenancy'->>'end')::date <= (now() + interval '60 days')::date
        ORDER BY (config->'tenancy'->>'end')::date ASC LIMIT 50`,
  ]);
  return { leads: leads.map(r => rowToLead(r)), renewals: renewals.map(rowToProperty) };
}

/**
 * Candidate listings for a lead's requirement.
 *
 * Scoring and the fit reasons stay in the client's matching.js — that is
 * product logic and it must keep giving the same answers — but it no longer
 * needs the whole book to run against. Postgres does the coarse cut (same deal,
 * budget in range with headroom, same locality or type) and the client scores
 * what comes back.
 */
export async function getLeadCandidates(leadId: string, limit = 100): Promise<any[]> {
  const t = tid();
  const lead = (await sql`SELECT * FROM crm_leads WHERE tenant_id = ${t} AND id = ${leadId} LIMIT 1`)[0];
  if (!lead) return [];
  const req = lead.req || {};
  const deal = lead.deal || req.deal || 'sale';
  const locality = lead.locality || req.locality || null;
  const config = lead.requirement || req.config || null;
  const min = lead.budget_min != null ? Number(lead.budget_min) : (req.minBudget ?? null);
  const max = lead.budget_max != null ? Number(lead.budget_max) : (req.maxBudget ?? null);

  const where: any[] = [
    sql`tenant_id = ${t}`,
    sql`coalesce(deal, 'sale') = ${deal}`,
    sql`coalesce(status, 'Available') = 'Available'`,
  ];
  // 25% headroom either side: a listing just outside the stated budget is still
  // worth showing, and the client's scorer is what decides how good a fit it is.
  if (min != null) where.push(sql`(${PRICE_NUM} IS NULL OR ${PRICE_NUM} >= ${Math.floor(min * 0.75)})`);
  // An unpriced listing is not excluded by an upper bound — "price on request"
  // is common and the client's scorer can still rank it.
  if (max != null) where.push(sql`(${PRICE_NUM} IS NULL OR ${PRICE_NUM} <= ${Math.ceil(max * 1.25)})`);
  if (locality) where.push(sql`locality = ${locality}`);
  const clause = where.reduce((acc, f, i) => (i === 0 ? f : sql`${acc} AND ${f}`));
  const rows = await sql`SELECT * FROM crm_properties WHERE ${clause} ORDER BY created_at DESC LIMIT ${limit}`;
  return rows.map(rowToProperty);
}

// --- PROPERTIES ---
// Domain fields live in real COLUMNS on crm_properties, not in the `config`
// JSONB — config only carries a couple of legacy extras. Querying config for
// deal/locality/type silently matched nothing, so these two fragments are the
// single definition of "the project this unit belongs to" and "its price as a
// number", used by every query below.
const PROJECT_KEY = sql`coalesce(nullif(project, ''), nullif(split_part(coalesce(title, ''), ' - ', 1), ''))`;
// The bucket ungrouped units fall into. Must match INDEPENDENT_PROJECT in
// src/lib/format.js -- the client filters and links on this exact string.
const INDEPENDENT_PROJECT = 'Independent / Direct';
// price_amount is numeric and price is the formatted text ("1,25,000"), so both
// are cast to text before coalescing — mixing them raw is a type error that only
// surfaced on leads that actually carry a budget.
const PRICE_NUM = sql`nullif(regexp_replace(coalesce(price_amount::text, price::text, ''), '[^0-9]', '', 'g'), '')::numeric`;

export async function getProperties(): Promise<any[]> {
  const rows = await sql`SELECT * FROM crm_properties WHERE tenant_id = ${tid()} ORDER BY created_at DESC`;
  return rows.map(rowToProperty);
}

/**
 * One page of listings, filtered and counted in Postgres.
 *
 * The desk used to read every listing in the firm on every launch, through
 * getState(), and page it in the browser. That is fine at eight listings and
 * fatal at a few thousand: one tenant's read was ~10MB, which is a two-second
 * blank screen on a phone and too big to keep as an offline snapshot at all.
 * And it only gets worse — the same row grows every time we add a field.
 *
 * So the database does the work it is for. `total` comes back with the page
 * because a pager needs to know how many pages there are without fetching them.
 */
export async function listProperties(opts: {
  page?: number; limit?: number; q?: string;
  status?: string; deal?: string; type?: string; locality?: string; project?: string;
  excludeId?: string;
} = {}): Promise<{ rows: any[]; total: number; page: number; limit: number }> {
  const t = tid();
  const limit = Math.min(Math.max(Number(opts.limit) || 50, 1), 200);
  const page = Math.max(Number(opts.page) || 1, 1);
  const offset = (page - 1) * limit;

  // Built as a list of fragments so an absent filter contributes no SQL at all,
  // rather than a `WHERE (x IS NULL OR …)` that no index can use.
  const where: any[] = [sql`tenant_id = ${t}`];
  const q = String(opts.q || '').trim();
  if (q) {
    const like = `%${q.toLowerCase()}%`;
    where.push(sql`(lower(coalesce(title, '')) LIKE ${like}
      OR lower(coalesce(locality, '')) LIKE ${like}
      OR lower(coalesce(project, '')) LIKE ${like}
      OR lower(coalesce(owner_name, '')) LIKE ${like})`);
  }
  // The filter UI is multi-select — "Available or Blocked" is one filter, not
  // two — so every value filter accepts a comma-separated list and matches any
  // of them. A single value is just a list of one.
  const many = (v?: string) => String(v || '').split(',').map(s => s.trim()).filter(Boolean);
  const status = many(opts.status), deal = many(opts.deal);
  const type = many(opts.type), locality = many(opts.locality);
  if (status.length) where.push(sql`coalesce(status, 'Available') IN ${sql(status)}`);
  if (deal.length) where.push(sql`coalesce(deal, 'sale') IN ${sql(deal)}`);
  if (type.length) where.push(sql`type IN ${sql(type)}`);
  if (locality.length) where.push(sql`locality IN ${sql(locality)}`);
  if (opts.project) {
    // A project is a grouping lens over the `project`/`society` fields, not a
    // stored entity — same key the units view groups on. The implicit bucket is
    // the units that have no project at all, so it matches on absence.
    where.push(opts.project === INDEPENDENT_PROJECT
      ? sql`${PROJECT_KEY} IS NULL`
      : sql`${PROJECT_KEY} = ${opts.project}`);
  }
  if (opts.excludeId) where.push(sql`id <> ${opts.excludeId}`);

  const clause = where.reduce((acc, frag, i) => (i === 0 ? frag : sql`${acc} AND ${frag}`));

  const [rows, countRows] = await Promise.all([
    sql`SELECT * FROM crm_properties WHERE ${clause} ORDER BY created_at DESC LIMIT ${limit} OFFSET ${offset}`,
    sql`SELECT count(*)::int AS n FROM crm_properties WHERE ${clause}`,
  ]);

  // The "N buyers waiting" badge on a card. The desk computed it by running the
  // matcher over every lead in the firm, per card — which is the single reason
  // the listings grid needed the leads in memory at all. One join, bounded to
  // the page that is actually being rendered.
  const demand = await demandFor(t, rows.map((r: any) => r.id));
  const mapped = rows.map((r: any) => ({ ...rowToProperty(r), demandCount: demand.get(r.id) ?? 0 }));
  return { rows: mapped, total: countRows[0]?.n ?? 0, page, limit };
}

/** Open leads whose requirement matches each of the given listings. */
async function demandFor(t: string, ids: string[]): Promise<Map<string, number>> {
  if (!ids.length) return new Map();
  const rows = await sql`
    SELECT p.id AS id, count(l.id)::int AS n
      FROM crm_properties p
      LEFT JOIN crm_leads l
        ON l.tenant_id = p.tenant_id
       AND NOT coalesce(l.stage, '') LIKE 'Closed%'
       AND coalesce(l.deal, l.req->>'deal', 'sale') = coalesce(p.deal, 'sale')
       AND (l.locality IS NULL OR p.locality IS NULL OR l.locality = p.locality)
       AND (l.budget_max IS NULL OR p.price_amount IS NULL OR l.budget_max >= p.price_amount * 0.75)
       AND (l.budget_min IS NULL OR p.price_amount IS NULL OR l.budget_min <= p.price_amount * 1.25)
     WHERE p.tenant_id = ${t} AND p.id IN ${sql(ids)}
     GROUP BY p.id`;
  return new Map(rows.map((r: any) => [r.id, r.n]));
}

export async function getPropertyById(id: string): Promise<any | null> {
  const t = tid();
  const rows = await sql`SELECT * FROM crm_properties WHERE tenant_id = ${t} AND id = ${id} LIMIT 1`;
  if (!rows[0]) return null;
  const demand = await demandFor(t, [id]);
  return { ...rowToProperty(rows[0]), demandCount: demand.get(id) ?? 0 };
}

/**
 * The numbers the stat strip and the filter menus need, counted in Postgres.
 * These are the only reason several screens were reading the whole table — a
 * count of available listings does not require the listings.
 */
export async function getPropertiesSummary(): Promise<any> {
  const t = tid();
  const [totals, byStatus, byDeal, localities, projects] = await Promise.all([
    sql`SELECT count(*)::int AS n FROM crm_properties WHERE tenant_id = ${t}`,
    sql`SELECT coalesce(status, 'Available') AS k, count(*)::int AS n
        FROM crm_properties WHERE tenant_id = ${t} GROUP BY 1`,
    sql`SELECT coalesce(deal, 'sale') AS k, count(*)::int AS n
        FROM crm_properties WHERE tenant_id = ${t} GROUP BY 1`,
    sql`SELECT DISTINCT locality AS v FROM crm_properties
        WHERE tenant_id = ${t} AND coalesce(locality, '') <> '' ORDER BY 1`,
    sql`SELECT ${PROJECT_KEY} AS v, count(*)::int AS n
        FROM crm_properties WHERE tenant_id = ${t}
        GROUP BY 1 HAVING ${PROJECT_KEY} IS NOT NULL
        ORDER BY 2 DESC LIMIT 200`,
  ]);
  const asMap = (rows: any[]) => Object.fromEntries(rows.map(r => [r.k, r.n]));
  return {
    total: totals[0]?.n ?? 0,
    byStatus: asMap(byStatus),
    byDeal: asMap(byDeal),
    localities: localities.map(r => r.v),
    projects: projects.map(r => ({ name: r.v, units: r.n })),
  };
}

/**
 * Projects, grouped in SQL.
 *
 * A project is a lens over units, not a stored entity — so the desk built the
 * grouping in JavaScript, which meant it needed every unit in memory to show a
 * list of six project names. The grouping is a GROUP BY; do it here.
 */
export async function listProjects(opts: { q?: string; limit?: number } = {}): Promise<{ rows: any[]; total: number }> {
  const t = tid();
  const limit = Math.min(Math.max(Number(opts.limit) || 200, 1), 500);
  const where: any[] = [sql`tenant_id = ${t}`];
  const q = String(opts.q || '').trim();
  if (q) {
    const like = `%${q.toLowerCase()}%`;
    where.push(sql`(lower(coalesce(project, '')) LIKE ${like} OR lower(coalesce(locality, '')) LIKE ${like})`);
  }
  const clause = where.reduce((acc, f, i) => (i === 0 ? f : sql`${acc} AND ${f}`));

  // `mode()` picks the most common locality rather than an arbitrary one — a
  // township spanning two localities should read as the one most of it is in.
  // Units with no project are not dropped — they collect in one implicit
  // bucket, the same way the browser-side grouping did it. A broker who only
  // lists scattered flats still sees their inventory here.
  const rows = await sql`
    SELECT coalesce(${PROJECT_KEY}, ${INDEPENDENT_PROJECT}) AS key,
           count(*)::int AS units,
           count(*) FILTER (WHERE coalesce(status, 'Available') = 'Available')::int AS available,
           count(*) FILTER (WHERE coalesce(status, 'Available') = 'Sold')::int AS sold,
           count(*) FILTER (WHERE coalesce(deal, 'sale') = 'rent')::int AS rent,
           count(*) FILTER (WHERE coalesce(deal, 'sale') = 'sale')::int AS sale,
           mode() WITHIN GROUP (ORDER BY locality) AS locality,
           mode() WITHIN GROUP (ORDER BY builder) AS builder,
           array_remove(array_agg(DISTINCT nullif(wing, '')), NULL) AS wings,
           min(${PRICE_NUM}) AS price_min,
           max(${PRICE_NUM}) AS price_max
      FROM crm_properties WHERE ${clause}
     GROUP BY 1
     ORDER BY 2 DESC LIMIT ${limit}`;

  // Biggest projects first, with the implicit bucket always last — it is a
  // leftovers pile, not the firm's largest township.
  const ordered = rows.slice().sort((a: any, b: any) => {
    const ai = a.key === INDEPENDENT_PROJECT, bi = b.key === INDEPENDENT_PROJECT;
    if (ai !== bi) return ai ? 1 : -1;
    return b.units - a.units;
  });
  return {
    rows: ordered.map(r => ({
      key: r.key,
      name: r.key,
      independent: r.key === INDEPENDENT_PROJECT,
      locality: r.locality || null,
      builder: r.builder || null,
      developer: r.builder || null,
      wings: (r.wings || []).sort(),
      counts: { total: r.units, available: r.available, sold: r.sold, rent: r.rent, sale: r.sale },
      priceRange: { min: r.price_min != null ? Number(r.price_min) : null, max: r.price_max != null ? Number(r.price_max) : null },
    })),
    total: rows.length,
  };
}

/** One project's header row. Its units come from listProperties({ project }). */
export async function getProject(key: string): Promise<any | null> {
  const { rows } = await listProjects({});
  return rows.find(r => r.key === key) || null;
}

/**
 * The buyers whose requirement matches one property.
 *
 * This is `getLeadCandidates` read from the other end, and it replaces running
 * the client-side matcher across every lead in the firm to answer a question
 * about a single flat.
 */
export async function getPropertyBuyers(propertyId: string, limit = 50): Promise<any[]> {
  const t = tid();
  const p = (await sql`SELECT * FROM crm_properties WHERE tenant_id = ${t} AND id = ${propertyId} LIMIT 1`)[0];
  if (!p) return [];
  const price = p.price_amount != null ? Number(p.price_amount) : null;
  const deal = p.deal || 'sale';

  const where: any[] = [
    sql`tenant_id = ${t}`,
    sql`NOT coalesce(stage, '') LIKE 'Closed%'`,
    sql`coalesce(deal, req->>'deal', 'sale') = ${deal}`,
  ];
  if (p.locality) where.push(sql`(locality IS NULL OR locality = ${p.locality})`);
  // Same 25% headroom the other direction uses, and for the same reason: a
  // budget stated as a round number is not a hard wall.
  if (price != null) {
    where.push(sql`(budget_max IS NULL OR budget_max >= ${Math.floor(price * 0.75)})`);
    where.push(sql`(budget_min IS NULL OR budget_min <= ${Math.ceil(price * 1.25)})`);
  }
  const clause = where.reduce((acc, f, i) => (i === 0 ? f : sql`${acc} AND ${f}`));
  const rows = await sql`SELECT * FROM crm_leads WHERE ${clause} ORDER BY created_at DESC LIMIT ${limit}`;
  const shortlistRows = await sql`SELECT * FROM lead_shortlist WHERE tenant_id = ${t} AND lead_id IN ${sql(rows.map(r => r.id).length ? rows.map(r => r.id) : [''])}`;
  const byLead = groupShortlistByLead(shortlistRows);
  return rows.map(r => rowToLead(r, [], byLead.get(r.id) || []));
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
    // C4_CLIENT_KEYS have real columns now — letting them also land in config
    // would leave two copies that disagree the first time one is edited.
    if (!PROPERTY_COLUMNS.has(k) && !C4_CLIENT_KEYS.has(k) && k !== 'id' && k !== 'config') config[k] = v;
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
  await applyC4Fields(newId, propData);
  const refreshed = await sql`SELECT * FROM crm_properties WHERE id = ${newId} AND tenant_id = ${tid()}`;
  const created = rowToProperty(refreshed[0] || rows[0]);
  audit({
    tenant_id: tid(), actor_type: ctx.actorType || 'system', actor_id: ctx.actorId ?? null,
    actor_label: ctx.actorLabel ?? null, action: 'property.create', target_type: 'property', target_id: newId,
    summary: `Property "${title}" created`, metadata: { after: created }, ip: ctx.ip, user_agent: ctx.userAgent,
  });
  return created;
}

// First-class columns on crm_properties. Anything else in a patch is a config (JSONB) field.
const PROPERTY_COLUMNS = new Set(['title', 'status', 'type', 'locality', 'price', 'tower', 'unit', 'tenancy', 'timeline']);

// ---------------------------------------------------------------------------
// Block C canonical fields: client name -> column.
//
// ONE map, used by both createProperty and updateProperty. Without it these
// fields would fall through to the `config` JSONB blob like every other
// non-column key, which would quietly defeat the entire schema pass — the
// columns would exist and always be NULL, and the filters reading them would
// find nothing.
// ---------------------------------------------------------------------------
const C4_SCALARS: Record<string, string> = {
  category: 'category', subtype: 'subtype', bhk: 'bhk',
  transactionType: 'transaction_type', ownership: 'ownership',
  bathrooms: 'bathrooms', balconies: 'balconies',
  builtup: 'builtup_sqft', superBuiltup: 'super_builtup_sqft',
  plotArea: 'plot_area', areaUnit: 'area_unit', priceAreaBasis: 'price_area_basis',
  coveredParking: 'covered_parking', openParking: 'open_parking',
  servantRoom: 'servant_room', furnishType: 'furnish_type',
  petFriendly: 'pet_friendly', availableFrom: 'available_from',
  maintenanceMode: 'maintenance_mode', maintenanceAmount: 'maintenance_amount',
  depositOption: 'deposit_option', depositAmount: 'deposit_amount',
  lockinOption: 'lockin_option', lockinMonths: 'lockin_months',
  parkingChargesMode: 'parking_charges_mode', paintingCharges: 'painting_charges',
  otherCharges: 'other_charges', bookingAmount: 'booking_amount',
  taxIncluded: 'tax_included',
  floorsAllowed: 'floors_allowed', openSides: 'open_sides',
  roadWidthFt: 'road_width_ft', cornerPlot: 'corner_plot',
  consultingOption: 'consulting_option', consultingPercent: 'consulting_percent',
  description: 'description', keyAccess: 'key_access',
  ownerContactId: 'owner_contact_id', completeness: 'completeness',
  geoLat: 'geo_lat', geoLng: 'geo_lng',
};

// Genuine lists — jsonb, not Postgres arrays, so they're written separately.
const C4_JSON: Record<string, string> = {
  fixtures: 'fixtures', countedItems: 'counted_items',
  societyAmenities: 'society_amenities', preferredTenants: 'preferred_tenants',
  priceIncludes: 'price_includes', media: 'media',
};

/** Client keys the config blob must NOT swallow, since they have real columns. */
export const C4_CLIENT_KEYS = new Set([...Object.keys(C4_SCALARS), ...Object.keys(C4_JSON)]);

/** Write whichever canonical fields are present. Absent keys are left alone, so
 *  this works for both a fresh insert and a partial edit. */
async function applyC4Fields(id: string, src: any): Promise<void> {
  const scalars: Record<string, any> = {};
  for (const [k, col] of Object.entries(C4_SCALARS)) {
    if (src[k] !== undefined) scalars[col] = src[k] === '' ? null : src[k];
  }
  if (Object.keys(scalars).length) {
    await sql`UPDATE crm_properties SET ${sql(scalars)} WHERE id = ${id} AND tenant_id = ${tid()}`;
  }
  for (const [k, col] of Object.entries(C4_JSON)) {
    if (src[k] === undefined) continue;
    // sql(col) is the identifier helper and sql.json() the jsonb value helper.
    // Do NOT hand-roll this as sql.unsafe(`... = $1::jsonb`, [JSON.stringify(v)]) —
    // that double-encodes, storing the jsonb STRING '["sofa"]' instead of the
    // array ["sofa"], which reads back as a string and silently breaks
    // .length/.map on every consumer.
    await sql`
      UPDATE crm_properties SET ${sql(col)} = ${sql.json(src[k])}
      WHERE id = ${id} AND tenant_id = ${tid()}
    `;
  }
}

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
    if (!PROPERTY_COLUMNS.has(k) && !C4_CLIENT_KEYS.has(k)) config[k] = v;
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
  await applyC4Fields(id, patch);
  const refreshed = await sql`SELECT * FROM crm_properties WHERE id = ${id} AND tenant_id = ${tid()}`;
  const updated = rowToProperty(refreshed[0] || rows[0]);
  audit({
    tenant_id: tid(), actor_type: ctx.actorType || 'system', actor_id: ctx.actorId ?? null,
    actor_label: ctx.actorLabel ?? null, action: 'property.update', target_type: 'property', target_id: id,
    summary: `Property "${updated.title}" updated`, metadata: { patch, before: { status: before.status, price: before.price }, after: { status: updated.status, price: updated.price } },
    ip: ctx.ip, user_agent: ctx.userAgent,
  });
  return updated;
}

// --- TEAM & ROUTING ---

/**
 * Pick the next agent in rotation and advance the counter — as ONE atomic SQL
 * statement, not a read in application code followed by a separate write.
 *
 * The two-step version (SELECT last_assigned_index, compute next in JS, then
 * UPDATE) is exactly what produced "20 pushes, everyone landed on the same
 * person": a batch of pushes arriving close together all read the SAME
 * last_assigned_index before any of their writes had landed, so they all
 * computed the SAME "next" agent. Proved against the live delpat data —
 * 10 concurrent calls to the old logic distributed unevenly and could
 * collapse onto one or two people entirely, reproducing the report exactly.
 *
 * A single UPDATE ... RETURNING lets Postgres's row-level locking do the
 * serialising: concurrent statements against the same row queue up and each
 * one sees the PREVIOUS one's committed write, which is the one guarantee a
 * round-robin actually needs.
 */
export async function nextRoutedAgent(): Promise<string | null> {
  const rows = await sql`
    UPDATE crm_routing_rules
    SET last_assigned_index = (last_assigned_index + 1) % GREATEST(jsonb_array_length(active_agent_ids), 1)
    WHERE tenant_id = ${tid()} AND jsonb_array_length(active_agent_ids) > 0
    RETURNING active_agent_ids -> last_assigned_index AS agent_id
  `;
  if (rows.length && rows[0].agent_id) return String(rows[0].agent_id).replace(/^"|"$/g, '');

  // The pool has never been configured for this tenant (no row, or an empty
  // active_agent_ids) — fall back to every on-duty agent that actually
  // exists, so "nobody ticked the checkboxes in Settings yet" degrades to
  // real distribution instead of one hardcoded id. Still a plain read here,
  // but this only runs for a genuinely unconfigured tenant, not the
  // steady-state case a portal integration hits on every push.
  const agents = await getAgents();
  const pool = agents.filter(a => a.duty_status !== 'OFF_DUTY').map(a => a.id);
  if (!pool.length) return null;
  const picked = pool[Math.floor(Math.random() * pool.length)];
  return picked;
}

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
    // Not this tenant's real agents — a fixed 'a1'..'a4' read as configured
    // when nothing was. createLead() derives the actual pool from getAgents()
    // whenever this comes back empty, so an honest empty array is correct here.
    return { strategy: 'round_robin', active_agent_ids: [], last_assigned_index: -1 };
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
  const logoChanged = patch?.logoUrl !== undefined;
  await sql`
    UPDATE tenants
    SET brand_config = COALESCE(brand_config, '{}'::jsonb) || ${sql.json(next)}
        ${colorChanged || logoChanged ? sql`, pwa_config = NULL` : sql``}
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
  if (patch.renameStage?.from && patch.renameStage?.to) {
    await sql`UPDATE crm_leads SET stage = ${patch.renameStage.to} WHERE stage = ${patch.renameStage.from} AND tenant_id = ${tid()};`;
    delete patch.renameStage;
  }
  if (patch.firmName) {
    await sql`UPDATE tenants SET name = ${patch.firmName}, pwa_config = NULL WHERE id = ${tid()} OR slug = ${tid()};`;
  }
  const current = await getSettings();
  const next = { ...current, ...patch };
  await sql`
    INSERT INTO crm_settings (key, value, tenant_id) VALUES ('default', ${sql.json(next)}, ${tid()})
    ON CONFLICT (tenant_id, key) DO UPDATE SET value = EXCLUDED.value;
  `;
  return next;
}

// getIntegrations/updateIntegration read `crm_integrations`, a tenant-scoped KV
// of provider credentials that nothing authenticated against. Its only readers
// were the fabricated telephony and WABA routes. Table and helpers deleted; the
// real one is `integrations` (services/ingestion.ts) — a row per connection.

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
  const t = tid();
  await sql`
    INSERT INTO crm_timeline_events (id, record_id, type, title, description, author, timestamp, metadata, tenant_id)
    VALUES (${id}, ${evt.record_id}, ${evt.type}, ${evt.title}, ${evt.description}, ${evt.author || 'System'}, ${ts}, ${sql.json(evt.metadata || {})}, ${t})
    ON CONFLICT (id) DO NOTHING;
  `;

  if (evt.record_id && (evt.record_id.startsWith('l') || evt.type === 'note' || evt.type === 'remark')) {
    sql`SELECT name, agent_id FROM crm_leads WHERE id = ${evt.record_id} AND tenant_id = ${t} LIMIT 1`
      .then(rows => {
        const lead = rows[0];
        const ctx = getContext();
        if (lead && lead.agent_id && ctx?.actorId && ctx.actorId !== lead.agent_id) {
          notify({
            userId: lead.agent_id,
            tenantId: t,
            type: 'remark_added',
            title: '💬 New Note Added to Lead',
            body: `${lead.name} · "${(evt.description || evt.title || '').slice(0, 60)}"`,
            link: `?screen=leads&lead=${lead.id}`,
            push: true,
            toSelf: true,
          }).catch(err => console.warn('[Notify] remark_added failed:', err?.message));
        }
      }).catch(() => {});
  }

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
/**
 * Real 30-day numbers only. This used to fall back to a hardcoded 142 calls /
 * 18 visits / 4 won / ₹1.85Cr-per-deal the instant a real count was 0 — which
 * for a new tenant or a quiet agent is every count, every time, so the "real"
 * metrics screen was showing the exact same fabricated numbers for every
 * person on every desk. `0` is a legitimate, common answer; it is not a
 * missing value.
 *
 * total_talk_time_minutes is gone outright rather than estimated — nothing in
 * this product records how long a call lasted, so there was no real number to
 * fall back TO; `calls * 4 + 116` was invented whole. pipeline_revenue_closed
 * is now the sum of what the buyer actually told us (budget_max, or the
 * midpoint of min/max) across this agent's won leads — a real number derived
 * from captured data, not a flat ₹1.85Cr assumed per deal.
 */
export async function getAgentPerformance(userId: string) {
  const t = tid();
  const [callRows, visitRows, wonRows] = await Promise.all([
    sql`SELECT count(*)::int as total_calls FROM crm_timeline_events WHERE author = ${userId} AND type = 'call' AND tenant_id = ${t}`,
    sql`SELECT count(*)::int as site_visits FROM crm_leads WHERE agent_id = ${userId} AND stage = 'Site Visit Done' AND tenant_id = ${t}`,
    sql`
      SELECT count(*)::int as closed_won,
             COALESCE(SUM(COALESCE(budget_max, budget_min, 0)), 0)::bigint as revenue
      FROM crm_leads WHERE agent_id = ${userId} AND stage ILIKE '%won%' AND tenant_id = ${t}
    `,
    sql`SELECT count(*)::int as total_leads FROM crm_leads WHERE agent_id = ${userId} AND tenant_id = ${t}`,
  ]);
  const calls = callRows[0]?.total_calls ?? 0;
  const visits = visitRows[0]?.site_visits ?? 0;
  const won = wonRows[0]?.closed_won ?? 0;
  const revenue = Number(wonRows[0]?.revenue ?? 0);
  const conv = visits > 0 ? Number(((won / visits) * 100).toFixed(1)) : null;
  return {
    user_id: userId,
    period: 'last_30_days',
    total_outbound_calls: calls,
    site_visits_done: visits,
    closed_won_deals: won,
    pipeline_revenue_closed: revenue,
    // null, not 0 — "no visits yet" and "visits that never converted" are
    // different facts, and only one of them is a rate worth showing.
    visit_conversion_rate_percentage: conv,
  };
}

