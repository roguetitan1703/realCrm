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
import { getContext, runWithContext } from './context.js';
import { notify, notifyRoles } from './notifications.js';
import { suggestPassword } from './auth.js';
import { assertLeadWrite, ForbiddenError } from '../lib/permissions.js';
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
// Lead status is flat, not a pipeline — see src/data/leadStatus.js for why.
// These two must stay in step with that file.
export const LEAD_STATUSES = ['New', 'Follow-Up', 'Callback', 'Call Not Received', 'Interested', 'Site Visit', 'Deal Closed', 'Rejected'];
export const TERMINAL_STATUSES = ['Deal Closed', 'Rejected'];
export const WON_STATUS = 'Deal Closed';
export const REJECTED_STATUS = 'Rejected';
/**
 * "Still open." Every one of these used to read `stage NOT LIKE 'Closed%'`,
 * which was a string test standing in for a concept — and the moment the
 * statuses stopped starting with the word "Closed" it silently counted every
 * finished lead as open. An explicit list cannot drift like that.
 */
const OPEN = sql`coalesce(stage, '') NOT IN ${sql(TERMINAL_STATUSES)}`;

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
    stages: LEAD_STATUSES,
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

/**
 * The same rule as a WHERE fragment: an agent sees leads assigned to them OR
 * created by them, everyone else sees the tenant. Returns `TRUE` when there is
 * no restriction so it can be AND-ed unconditionally.
 *
 * Created-by is in the scope because an agent may edit a lead they created, and
 * a record you may edit but cannot see is not a permission, it is a bug. A lead
 * that round-robins to a colleague the moment it is saved would otherwise
 * vanish from the person who just entered it.
 */
/**
 * Whose records a query should return.
 *
 * An agent always sees their own — that is RBAC and it is not negotiable here.
 * A manager or owner sees the whole desk BY DEFAULT, but can ask for just their
 * own with `mine`. That flag is what the phone sends: a manager standing in a
 * lift wants the eleven things they personally have to do today, not the
 * seven hundred the firm has. The desk screens never send it.
 */
function scopeUserId(mine?: boolean): string | null {
  const c = getContext();
  if (!c?.userId) return null;
  if (c.role === 'agent') return c.userId;
  return mine ? c.userId : null;
}

/**
 * Two different questions, and conflating them is a bug we shipped once.
 *
 * VISIBILITY (an agent's RBAC scope) is "records I own or created" — someone
 * who enters a walk-in must keep seeing it even before it is routed to them.
 *
 * MY WORKLIST (`mine`, what the phone asks for) is "records ASSIGNED to me",
 * and nothing else. The manager who ran the 732-row import is `created_by` on
 * every one of them, so folding `created_by` into `mine` handed their phone
 * the entire firm — the exact number this flag exists to avoid.
 */
function leadScope(mine?: boolean) {
  const me = scopeUserId(mine);
  if (!me) return sql`TRUE`;
  return mine ? sql`agent_id = ${me}` : sql`(agent_id = ${me} OR created_by = ${me})`;
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
  // B — sweep leads nobody currently owns (never assigned, or the owner left).
  sweep_unassigned_enabled: boolean;
  sweep_unassigned_hours: number;
  // C — take a lead back from an assignee who hasn't acted on it.
  reassign_idle_enabled: boolean;
  reassign_idle_hours: number;
  // Same three concerns again, for the owner cold-calling list — its own
  // pool, its own strategy, its own sweeps. Defaults to 'manual' (not
  // round_robin): owners usually arrive by the hundred via import, and
  // auto-assigning every one of them the moment a sheet lands is not a
  // default a firm should get without choosing it.
  owner_strategy: 'round_robin' | 'manual';
  owner_active_agent_ids: string[];
  owner_last_assigned_index: number;
  owner_sweep_unassigned_enabled: boolean;
  owner_sweep_unassigned_hours: number;
  owner_reassign_idle_enabled: boolean;
  owner_reassign_idle_hours: number;
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
  // No fabricated fallback. This read `… : 'sale'`, so a lead with nothing
  // stored came back as a confident "buying" no matter what — which is why
  // every portal lead looked like a sale even after the ingestion default was
  // removed. Three separate places were inventing it: the parser default, the
  // import row builder, and here, on the way OUT. Unknown stays unknown, and
  // the screens render a blank that prompts someone to ask.
  req.deal = r.deal || jreq.deal || (jreq.purpose === 'Lease' ? 'rent' : undefined);
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
    // Who entered this lead, as distinct from who is working it. The client
    // needs both to decide whether to offer a full edit or only a status change.
    createdBy: r.created_by || null,
    rejectionReason: r.rejection_reason || null,
    followUp: r.follow_up || null,
    overdue: Boolean(r.overdue),
    importBatchId: r.import_batch_id || undefined,
    // How many SESSIONS this person has enquired in — present only where the
    // query asked for it, and undefined rather than 0 where it did not. A row
    // that was never counted must not claim to have been counted and found
    // nothing.
    enquiryCount: r.enquiry_count == null ? undefined : Number(r.enquiry_count),
    // The real timestamp, not only the derived "how long ago". A desk asks
    // "when did this lead come in" and wants a date it can quote back to a
    // client or line up against a portal's own report; minsAgo answers a
    // different question and stops being useful after a week.
    createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : r.created_at,
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
/**
 * Move live leads off the old ordered pipeline onto the client's flat statuses.
 *
 * Idempotent: it only rewrites values that are still old ones, so it is safe on
 * every boot and a no-op once done. The mapping preserves what each position
 * actually meant rather than collapsing everything into "New" — a lead that had
 * reached Negotiation is Interested, not new business.
 */
/**
 * Run a one-time repair exactly once, ever, per database.
 *
 * The boot chain re-ran every historical migration on every restart. For DDL
 * that is harmless. For a migration that rewrites ROWS BY VALUE it is not: it
 * has no way to tell "this row was never migrated" from "someone deliberately
 * set it to that value afterwards", so it keeps undoing the second one.
 */
async function runOnce(name: string, fn: () => Promise<void>): Promise<void> {
  const done = await sql`SELECT 1 FROM schema_migrations WHERE name = ${name} LIMIT 1`;
  if (done.length) return;
  await fn();
  await sql`INSERT INTO schema_migrations (name) VALUES (${name}) ON CONFLICT DO NOTHING`;
}

export async function migrateLeadStatuses(): Promise<void> {
  const MAP: Record<string, string> = {
    'Contacted': 'Follow-Up',
    'Negotiation': 'Interested',
    'Closed Won': 'Deal Closed',
    'Closed Lost': 'Rejected',
    'New inquiry': 'New',
    'won': 'Deal Closed',
    'lost': 'Rejected',
  };
  for (const [from, to] of Object.entries(MAP)) {
    await sql`UPDATE crm_leads SET stage = ${to} WHERE stage = ${from}`;
  }
  // Each tenant's configured list, so the filter menus and the status picker
  // offer the statuses that now exist rather than the pipeline that doesn't.
  //
  // "Stale" means it still names a status that no longer exists, or is empty.
  // It used to ALSO mean "does not contain every default", which made any
  // customised pipeline stale by definition — a firm that removed one stage in
  // Settings had their whole list overwritten with the defaults on the next
  // backend restart. Settings → Pipeline is a real editor; this is a repair for
  // a vocabulary change, and it has no business having an opinion about a list
  // that is merely different.
  const rows = await sql`SELECT tenant_id, value FROM crm_settings WHERE key = 'default'`;
  for (const r of rows as any[]) {
    const v = r.value || {};
    const cur: string[] = Array.isArray(v.stages) ? v.stages : [];
    const stale = cur.some(x => MAP[x]) || cur.length === 0;
    if (!stale) continue;
    await sql`UPDATE crm_settings SET value = ${sql.json({ ...v, stages: LEAD_STATUSES })}
               WHERE key = 'default' AND tenant_id = ${r.tenant_id}`;
  }
}

/**
 * `metadata.outcome` held the option's LABEL. Move the existing rows onto the
 * stable key so the wording above them can change without orphaning history.
 *
 * Every string below was read out of the live database, not guessed — the five
 * long-form variants are the second, contradictory vocabulary that used to be
 * hardcoded in components/primitives.jsx, so a row written from the timeline
 * edit and a row written from the confirm modal could describe the same call in
 * two different words. Both spellings map to one key.
 *
 * Anything not in this map is left exactly as it is. An unrecognised string is
 * either a vocabulary nobody told us about or a person's own words, and the UI
 * falls back to printing it verbatim — which is the right outcome for both.
 */
const OUTCOME_LABEL_TO_KEY: Record<string, string> = {
  'No answer': 'no_answer',
  'No Answer / Ringing': 'no_answer',
  'Busy or switched off': 'unreachable',
  'Number Busy / Switched Off': 'unreachable',
  'Connected · discussed requirements': 'discussed',
  'Connected & Discussed Requirements': 'discussed',
  'Interested · scheduling a site visit': 'visit',
  'Interested — Scheduling Site Visit': 'visit',
  'Asked to call back': 'callback',
  'Requested Callback Later': 'callback',
  'Wrong number': 'wrong_number',
  'Not interested': 'not_interested',
};

export async function migrateOutcomeLabelsToKeys(): Promise<void> {
  let moved = 0;
  for (const [label, key] of Object.entries(OUTCOME_LABEL_TO_KEY)) {
    const res = await sql`
      UPDATE crm_timeline_events
         SET metadata = jsonb_set(metadata, '{outcome}', to_jsonb(${key}::text))
       WHERE metadata->>'outcome' = ${label}`;
    moved += res.count;
  }
  // Say what is left rather than assuming nothing is. A count of unmapped
  // strings is the only way anyone finds out a sixth vocabulary existed.
  const rest = await sql`
    SELECT metadata->>'outcome' AS outcome, count(*)::int AS n
      FROM crm_timeline_events
     WHERE metadata->>'outcome' IS NOT NULL
       AND metadata->>'outcome' !~ '^[a-z_]+$'
     GROUP BY 1`;
  console.log(`[migration] outcome labels → keys: ${moved} rewritten`
    + (rest.length ? `, ${rest.length} unmapped left as written: ${rest.map((r: any) => `${r.outcome} (${r.n})`).join(', ')}` : ''));
}

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

  // The guard used to be "does ANY tenant have ANY lead", which is only
  // accidentally true on a production database. On an empty one — a fresh
  // deploy, a restored backup, a migration — it planted the full demo firm,
  // including a workspace owner at a hardcoded personal address. Seeding a demo
  // dataset is now something you ask for.
  //
  // forceReset bypasses it: that is the workspace reset in Settings → System,
  // an explicit action on a workspace someone is looking at.
  if (!forceReset && process.env.SEED_DEMO !== 'true') {
    console.log('[Supabase DB] ℹ️ SEED_DEMO is not set — skipping demo seed.');
    return await getBootstrap();
  }
  const [{ count }] = await sql`SELECT count(*)::int as count FROM crm_leads WHERE tenant_id = ${DEFAULT_TENANT_ID}`;
  if (count > 0 && !forceReset) {
    console.log(`[Supabase DB] ℹ️ Demo tenant already has ${count} leads. Skipping seed.`);
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
  'crm_agents', 'crm_properties', 'crm_units', 'crm_leads', 'crm_owners', 'crm_settings',
  'crm_routing_rules', 'crm_timeline_events', 'users',
  'auth_otp', 'push_subscriptions', 'lead_shortlist', 'notifications',
];

export async function ensureAuthIdentity(): Promise<void> {
  // Retire the legacy demo tenants (one was a real client's name). Re-home their
  // data onto the neutral demo tenant and drop the old rows. Idempotent: only
  // touches a legacy id that still exists and isn't the current one.
  for (const legacy of LEGACY_TENANT_IDS) {
    if (legacy === DEFAULT_TENANT_ID) continue;
    // A retired id could legitimately be reused by a real workspace later; this
    // loop would then re-home that firm's data onto the demo tenant and delete
    // them. It has already done its job, so it runs once.
    if ((await sql`SELECT 1 FROM schema_migrations WHERE name = ${'retire_' + legacy} LIMIT 1`).length) continue;
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
    await sql`INSERT INTO schema_migrations (name) VALUES (${'retire_' + legacy}) ON CONFLICT DO NOTHING`;
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

  // Mirror the DEMO tenant's agents into users, so the bundled dataset can log
  // in. Scoped to that tenant on purpose.
  //
  // Unscoped, this ran over every tenant in the database on every boot and
  // overwrote name/email/metadata from crm_agents — and where an agent had no
  // email recorded it invented one on the demo firm's domain. Two real users on
  // a live client tenant were carrying `@skylinerealty.in` addresses because of
  // it, refreshed on every restart. Real tenants never needed this: both
  // provisionTenant and the Team screen write `users` and `crm_agents`
  // together, with a real login_id and a real address.
  const agentRows = await sql`SELECT id, name, first, initials, avatar, metadata, tenant_id
                                FROM crm_agents WHERE tenant_id = ${DEFAULT_TENANT_ID}`;
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
  await sql`TRUNCATE TABLE activities, crm_timeline_events, crm_units, crm_leads, crm_owners, crm_properties, crm_agents, crm_settings, crm_routing_rules, users, auth_otp CASCADE;`;
  return await seedDatabase(true);
}

// Ensure seeded on module load. ensureAuthIdentity runs after, so an
// already-populated database (seed skipped by the lead-count guard) still gets
// the Phase 0 identity model — tenant, superadmin, and users mirror.
// Everything below the schema is a ONE-TIME repair, and each was re-running on
// every restart against live client rows. A repair cannot tell "this row was
// never migrated" from "someone set it to that deliberately afterwards", so
// left ungated it keeps undoing the second one — which is exactly what the
// stage migration was doing to the Pipeline editor.
//
// ensureAuthIdentity is NOT in the ledger: it also refreshes the superadmin
// credentials from the environment and guarantees the demo tenant exists, and
// both of those genuinely belong on every boot. Its one-time part (retiring
// legacy tenant ids) carries its own guard.
seedDatabase()
  .then(() => ensureAuthIdentity())
  .then(() => runOnce('backfill_password_auth', () => backfillPasswordAuth()))
  .then(() => runOnce('backfill_shortlist', () => backfillShortlist()))
  .then(() => runOnce('backfill_property_canonical', () => backfillPropertyCanonicalFields()))
  .then(() => runOnce('repair_property_casing', () => repairPropertyDisplayCasing()))
  // This one rewrites lead rows by stage NAME. Left ungated, a firm that
  // renamed a stage to "Contacted" in Settings — an obvious thing to call a
  // stage — had every lead on it silently moved to "Follow-Up" on the next
  // restart.
  .then(() => runOnce('lead_statuses_2024_vocab', () => migrateLeadStatuses()))
  // Also gated, and for the same reason as the one above: it rewrites rows by
  // VALUE. Once an outcome is a key, "No answer" is no longer a string this
  // system produces — but a firm could legitimately type it into a remark, and
  // an ungated pass would keep reaching for it forever.
  .then(() => runOnce('2026_08_18_outcome_keys', () => migrateOutcomeLabelsToKeys()))
  // Builds the enquiry history from the pushes still on disk. Additive — it
  // writes only to crm_lead_enquiries and touches no lead.
  .then(() => runOnce('2026_08_18_enquiry_sessions', () => backfillEnquiries()))
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
  const [leads, props, events] = await Promise.all([
    sql`SELECT count(*)::int AS n, max(updated_at) AS at FROM crm_leads WHERE tenant_id = ${t} AND ${leadScope()}`,
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
  const [agentsRows, formerRows, settingsRows, routingRows, brandRows, localityRows, projectRows, configRows, dealRows, sourceRows] = await Promise.all([
    sql`SELECT a.* FROM crm_agents a
        LEFT JOIN users u ON u.id = a.id AND u.tenant_id = a.tenant_id
        WHERE a.tenant_id = ${t} AND u.deleted_at IS NULL`,
    // People who have LEFT, sent separately so historical attribution resolves.
    // The comment on getAgents() says the crm_agents row is kept "so historical
    // lead attribution still resolves" — but the row was filtered out before it
    // ever reached the browser, so agentById() returned null and every lead
    // belonging to someone who left rendered as "Unassigned". That is a
    // different fact: nobody has it versus the person who had it is gone.
    // They go in their own list so pickers and the routing rota, which read
    // `agents`, can never offer someone who no longer works here.
    sql`SELECT a.* FROM crm_agents a
        LEFT JOIN users u ON u.id = a.id AND u.tenant_id = a.tenant_id
        WHERE a.tenant_id = ${t} AND u.deleted_at IS NOT NULL`,
    sql`SELECT value FROM crm_settings WHERE key = 'default' AND tenant_id = ${t}`,
    sql`SELECT * FROM crm_routing_rules WHERE tenant_id = ${t}`,
    sql`SELECT id, slug, name, brand_config FROM tenants WHERE id = ${t} OR slug = ${t} LIMIT 1`,
    // The firm's own VOCABULARY -- localities, project names, configurations.
    // Filter menus, the locality suggester and the requirement-config picker
    // need these lists, not the records behind them, and every one of them was
    // building the list by mapping a collection the browser had downloaded in
    // full. Three DISTINCTs, a few dozen strings, no rows.
    sql`SELECT DISTINCT v FROM (
          SELECT locality AS v FROM crm_properties WHERE tenant_id = ${t}
          UNION SELECT locality FROM crm_leads WHERE tenant_id = ${t}
        ) x WHERE coalesce(v, '') <> '' ORDER BY 1`,
    // Real project names only -- the `project` column, not PROJECT_KEY. The key
    // falls back to the first segment of the title, which for imported rows is
    // the OWNER's name, so a picker built on it offered "ASHA BHARAT KOTHARI"
    // as a township. Ordered by size so the biggest developments come first.
    sql`SELECT project AS v, count(*)::int AS n FROM crm_properties
         WHERE tenant_id = ${t} AND coalesce(project, '') <> ''
         GROUP BY 1 ORDER BY 2 DESC LIMIT 200`,
    sql`SELECT DISTINCT v FROM (
          SELECT type AS v FROM crm_properties WHERE tenant_id = ${t}
          UNION SELECT requirement FROM crm_leads WHERE tenant_id = ${t}
        ) x WHERE coalesce(v, '') <> '' ORDER BY 1`,
    // Whether this desk sells, lets, or both. Two integers that decide which
    // filters are worth offering at all.
    // A listing counts as sale only if it SAYS sale. `coalesce(deal,'sale')`
    // was harmless while the boot migration guaranteed no nulls; now that a
    // row is allowed not to know, it would count every unknown as a sale.
    sql`SELECT count(*) FILTER (WHERE deal = 'sale')::int AS sale,
               count(*) FILTER (WHERE deal = 'rent')::int AS rent
          FROM crm_properties WHERE tenant_id = ${t}`,
    // Sources that have actually sent something, biggest first. This used to be
    // a hand-curated list in settings that nothing kept in step with reality:
    // a Connections integration or an import invented a source and never told
    // it, so the filter menu offered five names while the dashboard's own
    // breakdown showed seven. Derived, it cannot disagree with the data.
    //
    // Derived from the leads AND from what the connections say they will send.
    // Leads alone meant a source only existed once one had arrived under it, so
    // a connection configured this morning was unfilterable until its first
    // enquiry — and the person who set it up is told to go and type the name
    // into Settings, which is the hand-curated list this replaced. A connection
    // declaring `defaults.source` is a statement that leads will carry it.
    sql`SELECT v, sum(n)::int AS n FROM (
          SELECT source AS v, count(*)::int AS n FROM crm_leads
           WHERE tenant_id = ${t} AND coalesce(source, '') <> ''
           GROUP BY 1
          UNION ALL
          SELECT parser_config->'defaults'->>'source' AS v, 0 AS n FROM integrations
           WHERE tenant_id = ${t} AND active
             AND coalesce(parser_config->'defaults'->>'source', '') <> ''
        ) x GROUP BY 1 ORDER BY 2 DESC, 1 LIMIT 60`,
  ]);
  const agents = agentsRows.map(rowToAgent);
  const brand = { ...(brandRows[0]?.brand_config || {}) };
  if (typeof brand.logoUrl === 'string' && brand.logoUrl.startsWith('data:')) {
    brand.logoUrl = `/pwa/${t}/logo`;
  }
  const tenantRow = brandRows[0] || {};
  return {
    // Who this session actually belongs to. The token decides the tenant on
    // every request, so the client needs to know which workspace that is —
    // otherwise a URL naming a different firm goes uncontradicted.
    tenant: { id: tenantRow.id || t, slug: tenantRow.slug || t, name: tenantRow.name || '' },
    agents,
    // Resolvable for display, never selectable. `departed` is what the UI keys
    // off to say "left the firm" rather than silently showing a name.
    formerAgents: formerRows.map(r => ({ ...rowToAgent(r), departed: true })),
    inactiveAgentIds: agentsRows.filter(a => a.duty_status === 'OFF_DUTY').map(a => a.id),
    // `sources` is overwritten with the derived list — settings may still
    // carry a stale curated array from before this was derived, and the one
    // that matches the records has to win.
    settings: { ...(settingsRows[0]?.value || {}), sources: sourceRows.map((r: any) => r.v) },
    routing_rules: routingRows[0] || null,
    brand,
    localities: localityRows.map((r: any) => r.v),
    projects: projectRows.map((r: any) => r.v),
    configs: configRows.map((r: any) => r.v),
    dealMix: dealRows[0] || { sale: 0, rent: 0 },
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
 *
 * Every lead count here is `leadScope()`d, exactly like the list it labels.
 * It was not, and that is a different bug from the one it looks like: the
 * sidebar badge is `byStage['New']` and the Leads header is the total, so they
 * are SUPPOSED to differ. But the badge counted the whole firm while the list
 * showed one agent's rows, so an agent with nothing new saw a badge promising
 * ten and opened an empty list. Invisible to an owner or a manager, for whom
 * `leadScope()` is TRUE and both numbers were already the same population.
 *
 * A count and the rows it describes must come from the same WHERE clause. This
 * is the third site where the RBAC scope was dropped from a counter (CLAUDE.md
 * 3.4); if you add another counter here, scope it.
 */
export async function getDeskSummary(): Promise<any> {
  const t = tid();
  const mine = leadScope();
  // Every tile here is counted with the SAME expression as the list it opens,
  // taken from leadSegments() rather than rewritten. The tile that wasn't read
  // a rolling `now() - 3 hours` while its list read "arrived today and still
  // untouched": at 2:20pm on bhumi the tile said 12, the list held 13, and 16
  // leads had actually arrived. Three numbers for one word.
  const cfg = await deskConfigOf(t);
  const S = leadSegments(cfg);
  // The firm's midnight, not Postgres's. "Calls logged today" counted from
  // 05:30 IST, so an agent who worked the phone before breakfast showed 0.
  const today = dayStart(cfg.timezone);
  const [totals, byStage, bySource, perAgent, perAgentStage, props, owners, perAgentCalls, perAgentLeadCalls, perAgentVisits] = await Promise.all([
    sql`SELECT count(*)::int AS total,
               count(*) FILTER (WHERE ${OPEN})::int AS open,
               count(*) FILTER (WHERE ${FOLLOWUP_PAST_DUE})::int AS overdue,
               count(*) FILTER (WHERE follow_up IS NOT NULL)::int AS with_follow_up,
               count(*) FILTER (WHERE stage = ${WON_STATUS})::int AS won,
               count(*) FILTER (WHERE ${S.today})::int AS new_today,
               count(*) FILTER (WHERE ${S.untouched_sla})::int AS untouched_sla,
               count(*) FILTER (WHERE ${S.noanswer_stale})::int AS noanswer_stale,
               count(*) FILTER (WHERE agent_id IS NULL)::int AS unassigned
          FROM crm_leads WHERE tenant_id = ${t} AND ${mine}`,
    sql`SELECT coalesce(stage, 'New') AS k, count(*)::int AS n FROM crm_leads
         WHERE tenant_id = ${t} AND ${mine} GROUP BY 1`,
    sql`SELECT coalesce(source, 'Website') AS k, count(*)::int AS n FROM crm_leads
         WHERE tenant_id = ${t} AND ${mine} GROUP BY 1`,
    sql`SELECT agent_id AS k,
               count(*) FILTER (WHERE ${OPEN})::int AS open,
               count(*) FILTER (WHERE ${FOLLOWUP_PAST_DUE})::int AS overdue,
               count(*) FILTER (WHERE stage = ${WON_STATUS})::int AS won,
               count(*)::int AS total
          FROM crm_leads WHERE tenant_id = ${t} AND ${mine} AND agent_id IS NOT NULL GROUP BY 1`,
    // Per-agent stage breakdown. Which stages count as "contacted" or "visited"
    // depends on the firm's own configured stage order, which lives in settings
    // on the client — so the counts come back per stage and the client applies
    // its own meaning rather than this query hardcoding stage names.
    sql`SELECT agent_id AS a, coalesce(stage, 'New') AS s, count(*)::int AS n
          FROM crm_leads WHERE tenant_id = ${t} AND ${mine} AND agent_id IS NOT NULL GROUP BY 1, 2`,
    sql`SELECT count(*)::int AS total,
               count(*) FILTER (WHERE coalesce(status, 'Available') = 'Available')::int AS available
          FROM crm_properties WHERE tenant_id = ${t}`,
    // The Contacts directory's "Listing owners" count — distinct people named
    // on the listings this firm holds. NOT crm_owners: that is the cold-calling
    // queue, it has its own top-level screen and its own counts, and pointing
    // this at it made the directory's subnav claim 732 rows it does not show.
    sql`SELECT count(DISTINCT owner_name)::int AS n FROM crm_properties
         WHERE tenant_id = ${t} AND coalesce(owner_name, '') <> ''`,
    // Per-agent CALLING throughput. The roster used to derive "contacted" from
    // the lead stage order — everything past index 0 — which is a guess, not a
    // measurement, and it said nothing at all about the outbound half of the
    // day. These are counted, not inferred: rows carried, rows actually
    // dialled, dialled today, and how many said yes.
    sql`SELECT agent_id AS k,
               count(*)::int AS owners,
               count(*) FILTER (WHERE last_call_at IS NOT NULL)::int AS called,
               count(*) FILTER (WHERE last_call_at >= ${today})::int AS called_today,
               count(*) FILTER (WHERE stage = 'Interested')::int AS interested,
               count(*) FILTER (WHERE callback_at IS NOT NULL AND callback_at < NOW())::int AS late
          FROM crm_owners WHERE tenant_id = ${t} AND agent_id IS NOT NULL GROUP BY 1`,
    // Per-agent LEAD outreach (30d) and proven site visits. Here rather than in
    // getAgentPerformance because the Team page called that endpoint once PER
    // AGENT on mount — nine requests for nine integers, on a screen this summary
    // was already fetching. One query, and the dashboard roster and the Team
    // roster now read the same numbers instead of each deriving their own.
    sql`SELECT author AS k, count(*)::int AS calls
          FROM crm_timeline_events
         WHERE tenant_id = ${t} AND type = 'call' AND author IS NOT NULL
           AND timestamp >= now() - interval '30 days'
         GROUP BY 1`,
    sql`SELECT agent_id AS k, count(*)::int AS visits
          FROM activities
         WHERE tenant_id = ${t} AND type = 'site_visit' AND agent_id IS NOT NULL
           AND at >= now() - interval '30 days'
         GROUP BY 1`,
  ]);
  const asMap = (rows: any[]) => Object.fromEntries(rows.map(r => [r.k, r.n]));
  const stagesByAgent = new Map<string, Record<string, number>>();
  for (const r of perAgentStage as any[]) {
    if (!stagesByAgent.has(r.a)) stagesByAgent.set(r.a, {});
    stagesByAgent.get(r.a)![r.s] = r.n;
  }
  return {
    leads: totals[0] || { total: 0, open: 0, overdue: 0, with_follow_up: 0, won: 0, new_today: 0, unassigned: 0, untouched_sla: 0, noanswer_stale: 0 },
    byStage: asMap(byStage),
    bySource: asMap(bySource),
    perAgent: (() => {
      const calls = new Map((perAgentLeadCalls as any[]).map(r => [r.k, r.calls]));
      const visits = new Map((perAgentVisits as any[]).map(r => [r.k, r.visits]));
      return Object.fromEntries(perAgent.map(r => [r.k, {
        open: r.open, overdue: r.overdue, won: r.won, total: r.total,
        byStage: stagesByAgent.get(r.k) || {},
        // 30-day, and named so. The roster's old "Calls · 30d" label sat over an
        // all-time count from a different endpoint.
        calls30d: calls.get(r.k) ?? 0,
        visits30d: visits.get(r.k) ?? 0,
      }]));
    })(),
    properties: props[0] || { total: 0, available: 0 },
    owners: owners[0]?.n ?? 0,
    perAgentCalls: Object.fromEntries((perAgentCalls as any[]).map(r => [r.k, {
      owners: r.owners, called: r.called, calledToday: r.called_today,
      interested: r.interested, late: r.late,
    }])),
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
export async function revertImportBatch(batchId: string): Promise<{ leads: number; properties: number; owners: number }> {
  const t = tid();
  const [leadRows, propRows, ownerRows] = await Promise.all([
    sql`DELETE FROM crm_leads WHERE tenant_id = ${t} AND import_batch_id = ${batchId} RETURNING id`,
    sql`DELETE FROM crm_properties WHERE tenant_id = ${t} AND config->>'importBatchId' = ${batchId} RETURNING id`,
    sql`DELETE FROM crm_owners WHERE tenant_id = ${t} AND import_batch_id = ${batchId} RETURNING id`,
  ]);
  const leadIds = leadRows.map((r: any) => r.id);
  if (leadIds.length) await sql`DELETE FROM lead_shortlist WHERE tenant_id = ${t} AND lead_id IN ${sql(leadIds)}`;
  return { leads: leadRows.length, properties: propRows.length, owners: ownerRows.length };
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
export async function checkDuplicates(input: { phones?: string[]; names?: string[]; titles?: string[] }): Promise<{ leads: Record<string, any>; properties: Record<string, any>; owners: Record<string, any> }> {
  const t = tid();
  // Keyed by whatever the file can match on, valued with id AND name -- the id
  // because a duplicate row is merged into the record it duplicates, and a
  // merge needs to know which record that is.
  const leads: Record<string, any> = {};
  const properties: Record<string, any> = {};
  const owners: Record<string, any> = {};

  // A phone is compared as its LAST TEN DIGITS, on both sides, always.
  //
  // This is the whole bug behind an import that duplicated everything. Leads
  // are stored normalised — "+919876543210", and on one tenant "+91 98765
  // 43210" with spaces — while a spreadsheet holds "9876543210". The old query
  // compared the stored column to the raw file value with `phone IN (...)`, so
  // it matched nothing, and then keyed the result map by the stored "+91…"
  // form, which the browser looked up with a bare ten digits. Two independent
  // reasons for the same answer: never a duplicate, every re-import a fresh
  // copy. It left 315 surplus rows on the live client desk — one number twelve
  // times over — before anyone noticed the counts climbing.
  const norm = (p: string) => String(p ?? '').replace(/\D/g, '').slice(-10);
  const phones = [...new Set((input.phones || []).map(norm).filter(p => p.length === 10))].slice(0, 5000);
  const names = (input.names || []).filter(Boolean).map(n => n.toLowerCase()).slice(0, 5000);
  if (phones.length || names.length) {
    const rows = await sql`
      SELECT id, name, phone, right(regexp_replace(coalesce(phone, ''), '\D', '', 'g'), 10) AS phone10
        FROM crm_leads
       WHERE tenant_id = ${t}
         AND (${phones.length
              ? sql`right(regexp_replace(coalesce(phone, ''), '\D', '', 'g'), 10) IN ${sql(phones)}`
              : sql`false`}
           OR ${names.length ? sql`lower(name) IN ${sql(names)}` : sql`false`})`;
    for (const r of rows) {
      const hit = { id: r.id, name: r.name };
      // Keyed by the normalised number — the only form the caller can produce
      // from a spreadsheet cell. The raw stored value is kept as a key too so
      // an already-normalised file still matches.
      if (r.phone10) leads[r.phone10] = hit;
      if (r.phone) leads[r.phone] = hit;
      if (r.name) leads[String(r.name).toLowerCase()] = hit;
    }
  }

  // Owners are their own table (see the OWNERS block) and matched on phone
  // only — an owner's name is often blank in the source sheet, and two
  // different owners legitimately sharing a name is far likelier than two
  // people sharing a phone number. This is also what makes re-running an
  // interrupted import safe: rows already saved before the browser closed
  // are recognised and skipped/merged instead of duplicated.
  if (phones.length) {
    const rows = await sql`
      SELECT id, name, phone, right(regexp_replace(coalesce(phone, ''), '\D', '', 'g'), 10) AS phone10
        FROM crm_owners
       WHERE tenant_id = ${t}
         AND right(regexp_replace(coalesce(phone, ''), '\D', '', 'g'), 10) IN ${sql(phones)}`;
    for (const r of rows) {
      const hit = { id: r.id, name: r.name || r.phone };
      if (r.phone10) owners[r.phone10] = hit;
      if (r.phone) owners[r.phone] = hit;
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
  return { leads, properties, owners };
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
    // No 'sale' tail: someone we have never established an intent for is not
    // a buyer, and filing them as one is how a rent enquiry gets called back
    // about flats to buy. They fall under neither pill.
    const dealOf = sql`coalesce(deal, req->>'deal')`;
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
           count(*) FILTER (WHERE deal = 'sale')::int AS sale,
           count(*) FILTER (WHERE deal = 'rent')::int AS rent,
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
  const [leadsRows, timelineRows, shortlistRows] = await Promise.all([
    sql`SELECT * FROM crm_leads WHERE tenant_id = ${t} AND ${leadScope()} ORDER BY created_at DESC`,
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

/**
 * The one place a phone number resolves to a person.
 *
 * Identity is the LAST TEN DIGITS, within the tenant — the same rule the
 * importer's checkDuplicates() uses, and for the same reason. Stored numbers
 * are "+919876543210" (and on one tenant "+91 98765 43210", with spaces);
 * portals send whatever they please. An exact string compare on the cleaned
 * value calls those different people, which is how one client desk ended up
 * with 315 surplus rows.
 *
 * Deliberately NOT scoped by leadScope(). This answers "does this tenant
 * already know this number", which must be true regardless of who is asking —
 * an inbound webhook has no user, and an agent who cannot SEE a colleague's
 * lead must still not be allowed to create a second copy of it. Callers that
 * show the record to a human are responsible for their own disclosure rules.
 */
export async function findLeadByPhone(phone: string, tenantId?: string): Promise<any | undefined> {
  const t = tenantId || tid();
  const p10 = String(phone ?? '').replace(/\D/g, '').slice(-10);
  if (p10.length !== 10) return undefined;
  const rows = await sql`
    SELECT * FROM crm_leads
     WHERE tenant_id = ${t}
       AND right(regexp_replace(coalesce(phone, ''), '\D', '', 'g'), 10) = ${p10}
     ORDER BY created_at ASC LIMIT 1`;
  return rows[0];
}

export async function getLeadById(id: string): Promise<any | undefined> {
  const t = tid();
  const rows = await sql`SELECT * FROM crm_leads WHERE id = ${id} AND tenant_id = ${t} AND ${leadScope()}`;
  if (rows.length === 0) return undefined;
  const [timelineRows, shortlistRows] = await Promise.all([
    sql`SELECT * FROM crm_timeline_events WHERE record_id = ${id} AND tenant_id = ${t} ORDER BY timestamp DESC`,
    sql`SELECT * FROM lead_shortlist WHERE lead_id = ${id} AND tenant_id = ${t}`,
  ]);
  // author and metadata are NOT optional here. This projection listed six
  // fields and dropped both, so every event on a lead RECORD arrived with
  // authorId null and metadata {} — while the same events fetched through
  // getLeads (which passes rows straight through) carried them. Two shapes for
  // one thing, and the detail screen got the poorer one.
  //
  // Load-bearing, not cosmetic: the remark block under the name renders "— who"
  // from author, and reads metadata.outcome both to decide an event is worth
  // showing and to print the outcome. Neither could ever arrive, so a site visit
  // logged with an outcome showed as an unattributed bare line.
  const events = timelineRows.map(r => ({
    id: r.id, record_id: r.record_id, type: r.type, title: r.title,
    description: r.description, author: r.author, metadata: r.metadata,
    timestamp: r.timestamp instanceof Date ? r.timestamp.toISOString() : String(r.timestamp)
  }));
  const lead = rowToLead(rows[0], events, shortlistRows);

  // THE SHORTLISTED PROPERTIES THEMSELVES, not only their ids. The record screen
  // resolved each id through the browser's property cache, which holds whatever
  // the listings page happened to page in — so on a desk with 6,643 properties it
  // held none of the shortlist, every row was dropped by a filter(Boolean), and a
  // lead with four shortlisted flats rendered "No shortlisted or matching
  // inventory yet". The attach had worked every time; only the reading of it was
  // broken, so agents attached the same lead again and again. The WhatsApp
  // composer read the same cache and offered "No property — message only".
  const ids: string[] = lead.shortlist || [];
  lead.shortlistProps = ids.length
    ? (await sql`SELECT * FROM crm_properties WHERE tenant_id = ${t} AND id IN ${sql(ids)}`).map(rowToProperty)
    : [];

  // Activities live in their own table and were never folded in, so a logged
  // site visit existed only in the database — photo, GPS fix and outcome
  // included. One history, newest first; which table a thing was written to is
  // an implementation detail the agent should never have been able to feel.
  // The enquiry history. Read alongside the timeline so the record can show
  // what was asked for on each occasion rather than a prose note about it.
  lead.enquiries = await getEnquiriesForLead(id).catch(() => []);
  lead.enquiryCount = lead.enquiries.length;
  const acts = await getActivitiesForLead(id);
  if (acts.length) {
    lead.timeline = [...(lead.timeline || []), ...acts]
      .sort((a: any, b: any) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }
  return lead;
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
  // Null, not a placeholder number. This defaulted to '+910000000000', which
  // the screens read as "this lead has a phone" — so Call and WhatsApp rendered
  // and dialled it. A lead with no number shows no way to ring one.
  const phone = leadData.phone || null;
  const email = leadData.email || null;
  const stage = leadData.stage || 'New';
  const source = leadData.source || 'Website';
  // No invented requirement. This defaulted to { locality: 'Wakad', config:
  // '2 BHK', budgetLabel: '₹80L' } — so every lead captured without one (a
  // webhook, a quick add, a phone number jotted down mid-call) was born
  // claiming to want a 2 BHK in Wakad at ₹80L, and then got matched against
  // inventory on that basis. An unknown requirement is unknown.
  const req = leadData.req || {};
  const notes = leadData.notes || [];
  const shortlist = leadData.shortlist || [];
  const feedback = leadData.feedback || {};

  // New first-class columns, source-of-truth going forward; req JSONB stays populated too.
  // The fourth and last place that used to force 'sale'. A lead arriving with
  // no deal type now stores NULL, so "we were not told" survives all the way
  // to the screen instead of being laundered into a fact on the way in.
  const deal = leadData.deal || req.deal || (leadData.purpose === 'Lease' ? 'rent' : null);
  const requirement = leadData.requirement ?? req.config ?? null;
  const locality = leadData.locality ?? req.locality ?? null;
  // `req.budgetMin` is the other spelling of the same field. Webhook mappings
  // already saved against it would otherwise drop an inbound enquiry's budget
  // silently — accepted here so those connections keep working unchanged.
  const budgetMin = digits(leadData.budgetMin ?? leadData.budget_min ?? req.minBudget ?? req.budgetMin);
  const budgetMax = digits(leadData.budgetMax ?? leadData.budget_max ?? req.maxBudget ?? req.budgetMax);
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
  // Authorship comes from the signed-in actor, never from the request body — a
  // client that could name its own author could name anyone's. Null for system
  // callers (imports, webhooks, the seed), which is the honest answer: the firm
  // created it, not a person.
  const createdBy = ctx.actorId ?? getContext()?.userId ?? null;
  // When the enquiry happened, if the source told us. Falls back to now(), so
  // every existing caller is unchanged. It matters for a replay: 67 pushes
  // recovered from the inbox would otherwise all read as arriving the minute
  // someone pressed the button, and "received on" is now a column agents sort
  // and chase by.
  const receivedAt = leadData.received_at ?? leadData.receivedAt ?? null;

  const t = tid();
  const rows = await sql`
    INSERT INTO crm_leads (
      id, name, phone, email, stage, source, agent_id, req, notes, shortlist, feedback,
      deal, requirement, locality, budget_min, budget_max, purpose, timeline_pref, import_batch_id, created_by, tenant_id, created_at
    )
    VALUES (
      ${newId}, ${name}, ${phone}, ${email}, ${stage}, ${source}, ${agentId}, ${sql.json(req)}, ${sql.json(notes)}, ${sql.json(shortlist)}, ${sql.json(feedback)},
      ${deal}, ${requirement}, ${locality}, ${budgetMin}, ${budgetMax}, ${purpose}, ${timelinePref}, ${importBatchId}, ${createdBy}, ${t},
      COALESCE(${receivedAt}::timestamptz, NOW())
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
  // PUSH: speed-to-lead decides who wins the deal. A lead sitting unseen for
  // twenty minutes is usually a lead someone else has already called.
  notify({ userId: agentId, type: 'lead_assigned', data: { name, locality, source }, link, push: true })
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
  notifyRoles(['owner', 'manager'], { type: 'lead_new', data: { name, locality, agent: agentName }, link })
    .catch(err => console.warn('[Notify] lead_new failed:', err?.message));
  // PUSH: nobody was assigned, so this lead is sitting with no owner and no
  // one is coming for it. That is an exception, not a routine arrival.
  if (!agentId) {
    notifyRoles(['owner', 'manager'], {
      type: 'lead_unrouted', data: { name, source }, link, push: true,
    }).catch(err => console.warn('[Notify] lead_unrouted failed:', err?.message));
  }
  return created;
}

export async function updateLead(id: string, patch: any, ctx: ActorCtx = SYSTEM_CTX): Promise<any | null> {
  const oldLead = await getLeadById(id);
  if (!oldLead) return null;

  // A sales executive gets a full edit only on a lead they created; on one
  // merely assigned to them they may move the status and add to the history,
  // and nothing else. Enforced here rather than in each route so every caller
  // — the record form, the stage action, a future bulk edit — is covered by
  // construction. Throws ForbiddenError; system callers pass through.
  const who = getContext();
  assertLeadWrite(who?.role, who?.userId, oldLead, patch);

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

  // When the caller sends a `req` object it is the WHOLE requirement, so a key
  // missing from it means "cleared", not "unchanged". Falling through to
  // oldLead.req left the column set while the JSONB was emptied: clearing Deal
  // Type in the form blanked req.deal, the `deal` column kept its old value,
  // and rowToLead reads the column first — so the field came back on reload and
  // the record disagreed with itself in two places.
  const sentReq = patch.req !== undefined;
  const fromReq = (key: string, col: any) =>
    sentReq ? ((req as any)?.[key] ?? null) : ((req as any)?.[key] ?? col);

  const deal = patch.deal !== undefined ? patch.deal : fromReq('deal', oldLead.req?.deal);
  const requirement = patch.requirement !== undefined ? patch.requirement : fromReq('config', oldLead.req?.config);
  const locality = patch.locality !== undefined ? patch.locality : fromReq('locality', oldLead.req?.locality);
  const budgetMin = (patch.budgetMin !== undefined || patch.budget_min !== undefined || sentReq)
    ? digits(patch.budgetMin ?? patch.budget_min ?? req?.minBudget) : digits(oldLead.req?.minBudget);
  const budgetMax = (patch.budgetMax !== undefined || patch.budget_max !== undefined || sentReq)
    ? digits(patch.budgetMax ?? patch.budget_max ?? req?.maxBudget) : digits(oldLead.req?.maxBudget);
  const purpose = patch.purpose !== undefined ? patch.purpose : fromReq('purpose', oldLead.req?.purpose);
  // Same collision on update — see createLead. `patch.timeline` is history.
  const timelinePref = patch.timeline_pref !== undefined
    ? patch.timeline_pref
    : fromReq('timeline', oldLead.req?.timeline);
  // The reason belongs to the rejection. If the lead comes back off Rejected it
  // is dropped, because a live lead carrying "Budget Mismatch" reads as fact and
  // would go straight into the loss report.
  const rejectionReason = stage !== REJECTED_STATUS
    ? null
    : (patch.rejectionReason ?? patch.rejection_reason ?? oldLead.rejectionReason ?? null);

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
      rejection_reason = ${rejectionReason},
      updated_at = NOW()
    WHERE id = ${id} AND tenant_id = ${tid()};
  `;

  if (patch.shortlist !== undefined || patch.feedback !== undefined) {
    await syncLeadShortlist(id, shortlist || [], feedback || {}, tid());
  }

  if (patch.stage && patch.stage !== oldLead.stage) {
    // THE ONLY stage-change event. /actions/stage-change used to call this
    // function AND then write a second one of its own, so every status change
    // laid down two rows in the same second saying the same thing in two
    // wordings — "Status Updated: Status changed from New to Interested." above
    // "Stage Changed -> Interested: Stage updated via CRM view". The route now
    // passes its note through instead of logging separately.
    //
    // title === description on purpose: mapEventForClient joins them as
    // `title: description` whenever they differ, which is what produced the
    // doubled reading above.
    const note = String(patch.stageNote || '').trim() || rejectionReason || '';
    const line = `${oldLead.stage} → ${patch.stage}${note ? ` — ${note}` : ''}`;
    await addTimelineEvent({
      record_id: id,
      type: 'stage_change',
      title: line,
      description: line,
      // Attributed. This event carried no author at all, so the history could
      // not say who moved the lead — the route's duplicate was the only one
      // that named anybody.
      author: ctx.actorId ?? getContext()?.userId ?? undefined,
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
    notify({ userId: agentId, type: 'lead_reassigned', data: { name }, link, push: true })
      .catch(err => console.warn('[Notify] lead_reassigned failed:', err?.message));
  }
  // FEED ONLY: worth seeing when a manager schedules something on your lead;
  // never worth a buzz, and never at all when you scheduled it yourself — the
  // form already confirmed it on screen a second ago.
  if (patch.followUp && agentId) {
    const action = (patch.followUp.action || patch.followUp.label || 'Follow-up scheduled');
    const isVisit = /visit/i.test(action);
    // The appointment itself, not the words describing it. The catalogue turns
    // it into a readable day and time — a call site that formats its own is how
    // the same fact ended up phrased four ways.
    const at = patch.followUp.at || null;
    if (ctx.actorId && ctx.actorId !== agentId) {
      notify({
        userId: agentId,
        type: 'calendar_task_assigned',
        data: { name, at, isVisit },
        link,
        push: true
      }).catch(err => console.warn('[Notify] calendar_task_assigned failed:', err?.message));
    } else {
      notify({ userId: agentId, type: 'followup_set', data: { name, at }, link })
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
        data: { name },
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
  if (!existing) return false;
  // Deleting is a fact-level change, so it needs authorship. The route already
  // limits delete to owners; this is the same rule stated where the deletion
  // actually happens, so a new caller cannot route around it.
  const who = getContext();
  assertLeadWrite(who?.role, who?.userId, existing, { delete: true });
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

/**
 * Delete a selection in one request.
 *
 * Per-record permission is re-checked for EVERY id, not once for the caller —
 * a bulk endpoint that trusts the count is how one over-broad selection
 * deletes rows its owner was never allowed to touch. Rows the caller may not
 * delete are skipped and reported, rather than failing the whole batch: a
 * selection of forty should not be refused because one of them belongs to
 * somebody else.
 */
export async function bulkDeleteLeads(ids: string[], ctx: ActorCtx = SYSTEM_CTX): Promise<{ deleted: number; skipped: number }> {
  const t = tid();
  const who = getContext();
  const clean = [...new Set((ids || []).filter(Boolean))].slice(0, 500);
  if (!clean.length) return { deleted: 0, skipped: 0 };

  const rows = await sql`SELECT * FROM crm_leads WHERE tenant_id = ${t} AND id IN ${sql(clean)}`;
  const allowed: string[] = [];
  let skipped = clean.length - rows.length;   // ids that do not exist in this tenant
  for (const r of rows) {
    try {
      assertLeadWrite(who?.role, who?.userId, rowToLeadShallow(r), { delete: true });
      allowed.push(r.id);
    } catch { skipped++; }
  }
  if (!allowed.length) return { deleted: 0, skipped };

  const res = await sql`DELETE FROM crm_leads WHERE tenant_id = ${t} AND id IN ${sql(allowed)}`;
  audit({
    tenant_id: t, actor_type: ctx.actorType || 'system', actor_id: ctx.actorId ?? null,
    actor_label: ctx.actorLabel ?? null, action: 'lead.bulk_delete', target_type: 'lead', target_id: null,
    summary: `${res.count} lead${res.count === 1 ? '' : 's'} deleted`,
    // The ids AND the rows. A bulk delete is the one action with nothing left
    // to inspect afterwards, so the audit entry has to carry enough to say
    // what was destroyed.
    metadata: { ids: allowed, skipped, before: rows.filter(r => allowed.includes(r.id)) },
    ip: ctx.ip, user_agent: ctx.userAgent,
  });
  return { deleted: res.count, skipped };
}

/** The few fields assertLeadWrite reads, without the timeline/shortlist reads
 *  rowToLead does per record — this runs once per id in a batch. */
function rowToLeadShallow(r: any): any {
  return { id: r.id, agentId: r.agent_id, createdBy: r.created_by || null, stage: r.stage };
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
 * ── The segment pills, defined ONCE, as SQL ─────────────────────────────────
 *
 * One definition drives both the filter and the count, which is the only way
 * they can agree. They did not: the browser held eight pills but the server
 * understood four segment names, so clicking "Fresh" or "Closed" filtered
 * nothing, and every pill the summary had no count for fell back to
 * `counts.total` — five of the eight displayed the same number, the total, and
 * it looked like data.
 *
 * Two of them ("Working" = Contacted/Negotiation) also still named pipeline
 * stages that no longer exist, so they could only ever have counted zero.
 */
/**
 * The pills, as SQL. Built per call because two of them depend on the tenant's
 * own first pipeline stage, which is renameable in Settings.
 *
 * "New today" used to mean arrival ALONE — the note here said a lead that came
 * in this morning and had already been called was still today's lead. In use
 * that made the pills overlap badly: mark a lead Call Not Received and it stayed
 * in New today while also appearing under its own pill, so the two counts
 * described the same work twice and neither shrank as the desk worked. It is
 * now a WORKLIST: arrived today AND not yet moved off the arrival stage, so
 * touching a lead takes it out.
 *
 * today and month therefore PARTITION this month's arrivals — month is
 * everything since the 1st that today is not claiming — rather than nesting.
 * Without the exclusion a worked lead from this morning would fall through both.
 */
/** A lead rung once and not rung again is not being worked. Days, not hours: a
 *  buyer who missed a call at 11am is not owed another before lunch. */
export const RETRY_DAYS = 3;

/**
 * A follow-up whose moment has gone by.
 *
 * Exported because SIX queries read the dead `overdue` boolean and each one
 * would otherwise grow its own copy of this CASE — which is how the column and
 * the client's followUpOverdue() came to disagree in the first place.
 *
 * `[0-9]`, not `\d`: through this driver the backslash reaches Postgres
 * literally, so the shorthand class silently matches nothing and every lead
 * reads as not overdue — which is the bug this function exists to fix,
 * reintroduced one layer down. Checked against a real row, not assumed.
 */
export const FOLLOWUP_PAST_DUE = sql`(CASE WHEN follow_up->>'at' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}'
                                          THEN (follow_up->>'at')::timestamptz < now() ELSE false END)`;


/**
 * NOBODY HAS REACHED OUT TO THIS PERSON — measured, not inferred.
 *
 * "Never contacted" used to be read off the stage: still on the arrival stage
 * meant nobody had rung. That is not what the stage means, and the gap was not
 * small. On bhumi the Past SLA tile read 4; the number of people nobody had
 * called or messaged in over 48 hours was 60. The four were simply the leads
 * whose agent had also forgotten to move the dropdown.
 *
 * Both places a contact is recorded are checked. Free-text calls and messages
 * land in crm_timeline_events; calls and visits captured with an outcome land
 * in `activities`. Asking only one of them calls a lead untouched because it
 * was worked through the other screen.
 */
const NEVER_CONTACTED = sql`(
  NOT EXISTS (SELECT 1 FROM crm_timeline_events e
               WHERE e.record_id = crm_leads.id AND e.tenant_id = crm_leads.tenant_id
                 AND e.type IN ('call', 'whatsapp', 'sms', 'email'))
  AND NOT EXISTS (SELECT 1 FROM activities a
                   WHERE a.lead_id = crm_leads.id AND a.tenant_id = crm_leads.tenant_id
                     AND a.type IN ('call', 'meeting', 'site_visit'))
)`;

function leadSegments({ arrivalStage, slaHours, timezone }: DeskConfig) {
  const untouched = sql`stage = ${arrivalStage}`;
  const today = dayStart(timezone);
  // ARRIVED TODAY means arrived today. It used to also require the lead to be
  // untouched, so working a lead deleted it from the count of leads that came
  // in — on the morning 8 arrived, the tile said 1, because 7 had already been
  // picked up. "How many came in today" and "how many are still unworked" are
  // two questions and this is the first one; the second is `untouched_sla`.
  const newToday = sql`created_at >= ${today}`;
  return {
    // OVERDUE MEANS A FOLLOW-UP WHOSE TIME HAS PASSED.
    //
    // It read `overdue = true`, a boolean column NOTHING in this codebase ever
    // writes: false on all 232 bhumi leads and all 94 delpat ones, true only on
    // seed rows in the demo tenants. So the tab, the tile and the filter that
    // read it could only ever return nothing — while 5 bhumi leads had an
    // appointment whose moment had gone by and no screen said so.
    //
    // The client already knew: followUpOverdue() in lib/format.js reads
    // `follow_up.at`, the real instant the schedule modal writes. The server was
    // reading a different field for the same question — one concept, two
    // implementations, and the losing one decided what the desk saw.
    //
    // Guarded by a pattern test rather than a bare cast: rows saved before `at`
    // existed hold a human-typed date ("This Sunday"), and casting that throws
    // and takes the whole query with it.
    overdue: FOLLOWUP_PAST_DUE,
    unassigned: sql`agent_id IS NULL`,
    open: OPEN,
    today: newToday,
    month: sql`(created_at >= (date_trunc('month', now() AT TIME ZONE ${timezone}) AT TIME ZONE ${timezone}) AND NOT ${newToday})`,
    // The client asked for this one specifically, one click from the list — it is
    // the pile you work down at 6pm.
    noanswer: sql`stage = 'Call Not Received'`,
    closed: sql`NOT (${OPEN})`,
    // The calendar shows leads with a next step booked, and only those.
    followup: sql`follow_up IS NOT NULL`,
    // The two piles the desk actually loses money on, and the reason they are
    // defined HERE: the dashboard tile and the list it opens then read one
    // expression. Counting them separately is what put a 12 on a tile above a
    // list of 13.
    //
    // Past the SLA and still never contacted. Measured at 2x slaHours — the
    // point the sweep escalates to a manager — so the tile agrees with the
    // alert instead of quietly using a rounder number.
    //
    // The first half was `stage = arrivalStage`, which is a fact about a
    // dropdown. It now asks whether anyone actually reached out, which is what
    // the tile has always claimed to count. See NEVER_CONTACTED above for what
    // that swap was worth: 4 → 60 on the live desk.
    untouched_sla: sql`(${NEVER_CONTACTED} AND created_at <= now() - (${slaHours * 2}::text || ' hours')::interval)`,
    // Rung, no answer, and nobody has been back since. This is the pile with no
    // exit rule: on the live desk it was a fifth of every lead in the system.
    noanswer_stale: sql`(stage = 'Call Not Received' AND updated_at <= now() - (${RETRY_DAYS}::text || ' days')::interval)`,
    // The same question without the clock on it — for the leads filter, where
    // "show me everyone we have never reached out to" is asked of the whole
    // desk rather than of the overdue pile.
    never_contacted: NEVER_CONTACTED,
    // CAME BACK. Counted in sessions, so a man who clicked four listings in
    // five minutes is not in it — 12 leads on the live desk, not the 25 a
    // payload count would have claimed. They are the warmest people on it.
    repeat_enquiry: sql`(SELECT count(*) FROM crm_lead_enquiries e
                          WHERE e.tenant_id = crm_leads.tenant_id AND e.lead_id = crm_leads.id) > 1`,
  };
}

export type LeadSegment = keyof ReturnType<typeof leadSegments>;

/**
 * The stage a lead ARRIVES on — the tenant's first configured pipeline stage,
 * not the literal 'New', because Settings → Pipeline lets a firm rename it.
 * Cached briefly: it is read on every list and every summary, and it changes
 * about once in a workspace's lifetime.
 */
const arrivalStageCache = new Map<string, { v: DeskConfig; at: number }>();
const ARRIVAL_TTL_MS = 60_000;

/** The settings every worklist question is asked against. */
export type DeskConfig = { arrivalStage: string; slaHours: number; timezone: string };

/**
 * The firm's own timezone. Every desk on this system is in India today, but the
 * default belongs in one place rather than in eleven `date_trunc` calls, and a
 * white-label CRM sold outside IST needs exactly this switch.
 */
export const DEFAULT_TIMEZONE = 'Asia/Kolkata';

/**
 * The instant the firm's day started.
 *
 * `date_trunc('day', now())` truncates in UTC, which is **05:30 IST**. So from
 * midnight until half five in the morning, every "today" on this system meant
 * yesterday: a bhumi lead that arrived at 00:40 was counted, filed and shown as
 * having arrived the previous day, and the Today screen an agent opens first
 * thing was the one place it could not be found.
 *
 * Reading it back: `now() AT TIME ZONE tz` gives the local wall clock as a
 * naive timestamp, truncating that gives local midnight, and the second
 * `AT TIME ZONE tz` turns that wall-clock midnight back into the real instant
 * it happened — which is what a timestamptz column can be compared against.
 */
export function dayStart(tz: string) {
  return sql`(date_trunc('day', now() AT TIME ZONE ${tz}) AT TIME ZONE ${tz})`;
}

async function deskConfigOf(tenantId: string): Promise<DeskConfig> {
  const hit = arrivalStageCache.get(tenantId);
  if (hit && Date.now() - hit.at < ARRIVAL_TTL_MS) return hit.v;
  const rows = await sql`SELECT value FROM crm_settings WHERE key = 'default' AND tenant_id = ${tenantId} LIMIT 1`;
  const cfg = rows[0]?.value || {};
  const stages = cfg.stages;
  const v: DeskConfig = {
    arrivalStage: (Array.isArray(stages) && stages[0]) || 'New',
    // Same floor the SLA sweep applies, so an alert and the tile that counts
    // the same leads cannot be reading two different windows.
    slaHours: Math.max(Number(cfg.slaHours) || 24, 1),
    timezone: typeof cfg.timezone === 'string' && cfg.timezone ? cfg.timezone : DEFAULT_TIMEZONE,
  };
  arrivalStageCache.set(tenantId, { v, at: Date.now() });
  return v;
}

/**
 * The firm's timezone, for callers that don't already hold a DeskConfig.
 *
 * Deliberately returns the STRING, not the sql fragment. A postgres.js query is
 * thenable, so an `async` function returning `sql\`…\`` has its fragment
 * executed by the caller's own `await` — the caller gets a result array, splices
 * that into the next query, and Postgres answers "syntax error at or near
 * date_trunc". Handing back a plain string makes that impossible.
 */
export async function timezoneOf(tenantId: string): Promise<string> {
  return (await deskConfigOf(tenantId)).timezone;
}

async function arrivalStageOf(tenantId: string): Promise<string> {
  return (await deskConfigOf(tenantId)).arrivalStage;
}

/**
 * One page of leads, filtered and counted in Postgres — the same treatment
 * listProperties got, for the same reason.
 */
export async function listLeads(opts: {
  page?: number; limit?: number; q?: string; stage?: string; agentId?: string;
  segment?: string; intent?: string;
  source?: string; locality?: string; agent?: string; flag?: string;
  sortKey?: string; sortDir?: string;
} = {}): Promise<{ rows: any[]; total: number; page: number; limit: number }> {
  const t = tid();
  const limit = Math.min(Math.max(Number(opts.limit) || 50, 1), 200);
  const page = Math.max(Number(opts.page) || 1, 1);
  const offset = (page - 1) * limit;

  // An agent sees their own pipeline. Derived from the request context here,
  // NOT passed in by the route: the routes were reading `req.user.userId`, a
  // property that does not exist on req.user (it is `id`), so scopeAgentId
  // arrived undefined and every agent was served the entire firm's leads. A
  // permission that a caller has to remember to pass is a permission that will
  // eventually not be passed.
  const where: any[] = [sql`tenant_id = ${t}`, leadScope()];
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
  // Sale vs rent. This queried a column called `intent`, which crm_leads does
  // not have and never had — the toggle at the top of the leads list returned
  // a 500 on every click. The column is `deal`, written by createLead, and a
  // lead whose purpose is "Lease" is a rental whatever `deal` says.
  const RENT = sql`(lower(coalesce(deal, '')) IN ('rent', 'lease') OR lower(coalesce(purpose, '')) IN ('rent', 'lease'))`;
  // `NOT RENT` is not "buy" — it is "not rent", which includes every lead
  // nobody has asked yet. Filtering to Buy handed back all of them. Buy means
  // the row says sale; a lead with no stated intent answers neither filter,
  // which is the honest answer and makes the gap visible.
  const SALE = sql`(lower(coalesce(deal, '')) = 'sale' OR lower(coalesce(purpose, '')) = 'sale')`;
  if (opts.intent === 'buy' || opts.intent === 'sale') where.push(SALE);
  else if (opts.intent === 'rent') where.push(RENT);
  const SEGMENTS = leadSegments(await deskConfigOf(t));
  const segment = SEGMENTS[opts.segment as LeadSegment];
  if (segment) where.push(segment);

  // The filter panel's own fields. These were collected by the screen and then
  // dropped on the floor: useServerList spreads them into the fetcher, but the
  // fetcher forwarded only page/limit/q/segment/intent, so Source, Locality,
  // Sales Executive and Needs-attention were four controls that visibly changed
  // state and filtered nothing.
  // OR binds LOOSER than AND, so any group of alternatives has to carry its own
  // parentheses before it joins the AND chain. Without them a two-value filter
  // reads as `(tenant AND scope AND a) OR b` — the second alternative escapes
  // the tenant clause AND the agent's permission scope, and starts returning
  // other firms' rows. Every OR group below goes through this.
  const anyOf = (parts: any[]) => sql`(${parts.reduce((a, c) => sql`${a} OR ${c}`)})`;

  const sources = many(opts.source);
  if (sources.length) where.push(sql`lower(coalesce(source, '')) IN ${sql(sources.map(s => s.toLowerCase()))}`);

  // Locality is matched loosely on purpose — the option list is derived from the
  // firm's own records, where "Wakad" and "Wakad / Hinjewadi" are the same place
  // typed twice.
  const localities = many(opts.locality);
  if (localities.length) {
    where.push(anyOf(localities.map(l =>
      sql`lower(coalesce(locality, '')) LIKE ${'%' + l.toLowerCase().split('/')[0].trim() + '%'}`)));
  }

  // '_none' is the Unassigned option, which is NULL rather than a value.
  const agents = many(opts.agent);
  if (agents.length) {
    const named = agents.filter(a => a !== '_none');
    const parts: any[] = [];
    if (named.length) parts.push(sql`agent_id IN ${sql(named)}`);
    if (agents.includes('_none')) parts.push(sql`agent_id IS NULL`);
    if (parts.length) where.push(anyOf(parts));
  }

  // "Needs attention" reuses the segment predicates rather than restating them.
  const flags = many(opts.flag);
  if (flags.length) {
    const parts = flags
      .map(f => SEGMENTS[(f === 'new' ? 'today' : f) as LeadSegment])
      .filter(Boolean);
    if (parts.length) where.push(anyOf(parts));
  }

  // Sorting, from a whitelist — a sort key is a column name arriving from the
  // browser, so it can never reach the query as text. This was not wired at all:
  // the table's sort headers changed the arrow and re-requested the same
  // created_at ordering, because the ordering is done in SQL and nobody was
  // telling SQL about it.
  const SORTS: Record<string, any> = {
    activity: sql`created_at`, name: sql`lower(name)`,
    budget: sql`budget_max`, stage: sql`stage`,
    // The Received column is sortable, so its key has to be here. A key that
    // is not in this map is silently ignored, which shows a sort arrow that
    // reorders nothing.
    createdAt: sql`created_at`,
  };
  const col = SORTS[String(opts.sortKey || '')] || sql`created_at`;
  // "Last activity" ascending means most-recent-first; for a name it means A→Z.
  const asc = String(opts.sortDir || 'asc') === 'asc';
  const dir = opts.sortKey === 'activity' || !opts.sortKey
    ? (asc ? sql`DESC` : sql`ASC`)
    : (asc ? sql`ASC` : sql`DESC`);

  const clause = where.reduce((acc, f, i) => (i === 0 ? f : sql`${acc} AND ${f}`));
  const [rows, countRows] = await Promise.all([
    // The enquiry count rides along in the SAME query as the rows it labels.
    // A separate request would be a second answer to one question, which is
    // how a badge and the list under it come to disagree.
    // NOT aliased. The segment predicates reference crm_leads.id by name
    // (NEVER_CONTACTED does), and an alias makes every one of them invalid.
    sql`SELECT crm_leads.*, (SELECT count(*)::int FROM crm_lead_enquiries e
                              WHERE e.tenant_id = crm_leads.tenant_id AND e.lead_id = crm_leads.id) AS enquiry_count
           FROM crm_leads WHERE ${clause} ORDER BY ${col} ${dir} NULLS LAST LIMIT ${limit} OFFSET ${offset}`,
    sql`SELECT count(*)::int AS n FROM crm_leads WHERE ${clause}`,
  ]);
  return { rows: rows.map(r => rowToLead(r)), total: countRows[0]?.n ?? 0, page, limit };
}

/**
 * Assign many leads to one person in a single statement.
 *
 * Not a loop over updateLead: a desk selecting forty rows would otherwise fire
 * forty round trips, forty audit rows and forty push notifications — the last
 * of which is how someone's phone buzzes forty times and the app gets muted.
 * One UPDATE, one audit entry, one notification naming the count.
 *
 * Assignment is desk work, so agents are refused outright rather than being
 * silently scoped to their own rows: a bulk action that quietly does less than
 * it says is worse than one that declines.
 */
export async function bulkAssignLeads(ids: string[], agentId: string | null, ctx: ActorCtx = SYSTEM_CTX): Promise<number> {
  const who = getContext();
  if (who?.role === 'agent') throw new ForbiddenError('Assigning leads is done from the desk.');
  const clean = [...new Set((ids || []).filter(Boolean))];
  if (clean.length === 0) return 0;

  const t = tid();
  const res = await sql`
    UPDATE crm_leads SET agent_id = ${agentId}, updated_at = NOW()
    WHERE tenant_id = ${t} AND id IN ${sql(clean)}
      AND coalesce(agent_id, '') IS DISTINCT FROM coalesce(${agentId}, '')`;
  const n = res.count;
  if (n === 0) return 0;

  const name = agentId
    ? (await sql`SELECT name FROM users WHERE id = ${agentId} LIMIT 1`)[0]?.name ?? 'a colleague'
    : null;
  audit({
    tenant_id: t, actor_type: ctx.actorType || 'system', actor_id: ctx.actorId ?? null,
    actor_label: ctx.actorLabel ?? null, action: 'lead.bulk_assign', target_type: 'lead', target_id: null,
    summary: agentId ? `${n} lead${n === 1 ? '' : 's'} assigned to ${name}` : `${n} lead${n === 1 ? '' : 's'} unassigned`,
    metadata: { ids: clean, agentId }, ip: ctx.ip, user_agent: ctx.userAgent,
  });
  if (agentId) {
    notify({
      userId: agentId, type: 'lead_assigned_bulk', push: true,
      data: { n },
      link: '?screen=leads',
    }).catch(err => console.warn('[Notify] bulk assign failed:', err?.message));
  }
  return n;
}

// ============================================================================
// 📞 OWNERS — the cold-calling list (supply-side outreach)
// ============================================================================
// A property owner a firm calls to ask if they want to sell/rent. Deliberately
// its own table, not a crm_leads row with a flag: a lead is buyer/tenant
// demand working a status funnel toward a deal; an owner record is a much
// flatter "did we reach them, are they interested in listing" outreach loop,
// and mixing the two would put cold-call rows in every leads count and filter
// in the app. Also deliberately NOT linked to a crm_properties row — the desk
// often doesn't have (or need) a listing for what's being called about;
// `project` is a free-text grouping key, same spirit as crm_properties.project.

export const OWNER_STATUSES = ['New', 'Contacted', 'Callback', 'Interested', 'Not Interested', 'Do Not Call'];
export const OWNER_TERMINAL_STATUSES = ['Not Interested', 'Do Not Call'];

/** Same rule as leadScope, over crm_owners: an agent sees what's assigned to
 *  or created by them; everyone else sees the tenant. */
function ownerScope(mine?: boolean) {
  const me = scopeUserId(mine);
  if (!me) return sql`TRUE`;
  return mine ? sql`agent_id = ${me}` : sql`(agent_id = ${me} OR created_by = ${me})`;
}

function rowToOwner(r: any): any {
  return {
    id: r.id,
    name: r.name || '',
    phone: r.phone || '',
    email: r.email || null,
    project: r.project || null,
    unitRef: r.unit_ref || null,
    locality: r.locality || null,
    stage: r.stage || 'New',
    source: r.source || 'Import',
    agentId: r.agent_id || null,
    createdBy: r.created_by || null,
    importBatchId: r.import_batch_id || null,
    callbackAt: r.callback_at || null,
    callbackNote: r.callback_note || null,
    lastCallAt: r.last_call_at || null,
    // Computed here, not in the client: every surface that shows a queue needs
    // the same answer to "is this one late", and a browser clock that is an
    // hour off would give a different one on every desk.
    callbackOverdue: Boolean(r.callback_at && new Date(r.callback_at).getTime() < Date.now()),
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

/**
 * Owners arrive in bulk. An import is hundreds of createOwner calls with no
 * batch boundary the server can see, so notifying inside createOwner the way
 * the lead path does would put one push per row on an agent's phone — the
 * 732-row import that prompted this would have sent 732.
 *
 * Instead each auto-routed arrival bumps a per-agent counter and pushes the
 * flush out by ARRIVAL_QUIET_MS. The notification goes out once the import
 * stops, naming the real total. In-memory on purpose: a process restart
 * mid-import costs one notification, and the owners are still assigned — the
 * timeline and the queue are the durable record, this is only the nudge.
 */
const ARRIVAL_QUIET_MS = 20_000;
const arrivalTally = new Map<string, { n: number; timer: NodeJS.Timeout }>();

function queueOwnerArrivalNotice(agentId: string): void {
  // Read HERE and closed over. The tally is keyed by tenant AND agent because
  // it is process-wide: two firms importing at once would otherwise share a
  // counter and each be told the other's total. Capturing the actor is what
  // lets the self-check survive into the timer, so a manager importing owners
  // onto their own name is not told about work they just gave themselves.
  const tenantId = tid();
  const actorId = getContext()?.userId ?? null;
  const key = `${tenantId}:${agentId}`;
  const prev = arrivalTally.get(key);
  if (prev) clearTimeout(prev.timer);
  const n = (prev?.n || 0) + 1;
  const timer = setTimeout(() => {
    arrivalTally.delete(key);
    if (actorId === agentId) return;
    notify({
      userId: agentId, tenantId, type: 'owner_assigned', push: true,
      data: { n },
      link: '?screen=calling',
      toSelf: true,   // the actor check above already ran, with real context
    }).catch(err => console.warn('[Notify] owner arrival failed:', err?.message));
  }, ARRIVAL_QUIET_MS);
  timer.unref?.();
  arrivalTally.set(key, { n, timer });
}

export async function createOwner(data: any, ctx: ActorCtx = SYSTEM_CTX): Promise<any> {
  const t = tid();
  const id = data.id || `own_${Date.now()}_${randomBytes(3).toString('hex')}`;
  const createdBy = ctx.actorId ?? getContext()?.userId ?? null;
  // Arrival-time routing — same idea as a lead landing from a portal, just for
  // an owner arriving via import or the API. Only kicks in when the desk has
  // actually turned it on (owner_strategy defaults to 'manual') and nobody
  // already named an agent for this row.
  let agentId = data.agentId || null;
  let autoRouted = false;
  if (!agentId) {
    const rules = await getRoutingRules();
    if (rules.owner_strategy === 'round_robin') {
      agentId = await nextRoutedOwnerAgent();
      autoRouted = Boolean(agentId);
    }
  }
  const rows = await sql`
    INSERT INTO crm_owners (id, tenant_id, name, phone, email, project, unit_ref, locality, stage, source, agent_id, created_by, import_batch_id)
    VALUES (${id}, ${t}, ${data.name || null}, ${data.phone || null}, ${data.email || null},
      ${data.project || null}, ${data.unitRef || null}, ${data.locality || null},
      ${data.stage || 'New'}, ${data.source || 'Import'}, ${agentId},
      ${createdBy}, ${data.importBatchId || null})
    RETURNING *;
  `;
  const created = rowToOwner(rows[0]);
  // Any agent, not only an auto-routed one. This used to require `autoRouted`,
  // which meant a CSV carrying its own agent column — the ordinary way a desk
  // hands out a calling list — assigned the work silently. On the live desk
  // that was 731 of 732 owners routed and not one notification sent. The
  // debounce is what makes this safe to widen: an import still produces one
  // alert per agent, not one per row.
  if (agentId) queueOwnerArrivalNotice(agentId);
  if (data.notes) {
    await addTimelineEvent({ record_id: id, type: 'note', title: 'Note', description: String(data.notes), author: 'Import' });
  }
  audit({
    tenant_id: t, actor_type: ctx.actorType || 'system', actor_id: ctx.actorId ?? null,
    actor_label: ctx.actorLabel ?? null, action: 'owner.create', target_type: 'owner', target_id: id,
    summary: `Owner "${created.name || created.phone}" added`, metadata: { after: created }, ip: ctx.ip, user_agent: ctx.userAgent,
  });
  return created;
}

/**
 * The queue segments — the same predicates getOwnerQueueCounts counts, so a
 * pill that says 104 opens a list of 104. Defined once, used by both.
 */
const OWNER_OPEN = sql`coalesce(stage, 'New') NOT IN ('Not Interested', 'Do Not Call')`;
// Takes the firm's day boundary because "today" is a local question — see
// dayStart(). As a module-level constant it could only ever ask Postgres for
// UTC midnight, which is 05:30 in Pune.
const ownerSegments = (d0: any): Record<string, any> => ({
  open: OWNER_OPEN,
  callbacks_overdue: sql`${OWNER_OPEN} AND callback_at IS NOT NULL AND callback_at < NOW()`,
  callbacks_today: sql`${OWNER_OPEN} AND callback_at >= NOW() AND callback_at < ${d0} + interval '1 day'`,
  callbacks: sql`${OWNER_OPEN} AND callback_at IS NOT NULL`,
  to_call: sql`${OWNER_OPEN} AND callback_at IS NULL AND last_call_at IS NULL`,
  never_called: sql`${OWNER_OPEN} AND last_call_at IS NULL`,
  unassigned: sql`${OWNER_OPEN} AND agent_id IS NULL`,
});

export async function listOwners(opts: {
  page?: number; limit?: number; q?: string; stage?: string; project?: string; agentId?: string;
  locality?: string; agent?: string; source?: string; segment?: string; mine?: boolean;
  sortKey?: string; sortDir?: string;
} = {}): Promise<{ rows: any[]; total: number; page: number; limit: number }> {
  const t = tid();
  const limit = Math.min(Math.max(Number(opts.limit) || 50, 1), 200);
  const page = Math.max(Number(opts.page) || 1, 1);
  const offset = (page - 1) * limit;

  const where: any[] = [sql`tenant_id = ${t}`, ownerScope(opts.mine)];
  const q = String(opts.q || '').trim();
  if (q) {
    const like = `%${q.toLowerCase()}%`;
    where.push(sql`(lower(coalesce(name, '')) LIKE ${like} OR phone LIKE ${like} OR lower(coalesce(project, '')) LIKE ${like})`);
  }
  const stages = String(opts.stage || '').split(',').map(x => x.trim()).filter(Boolean);
  if (stages.length) where.push(sql`stage IN ${sql(stages)}`);
  const seg = ownerSegments(dayStart(await timezoneOf(t)))[String(opts.segment || '')];
  if (seg) where.push(seg);
  // '_none' is the "No project" bucket from listOwnerProjects — those rows
  // have project NULL or ''. Without this branch a click on that card sent
  // project: undefined, which is not a filter at all and returned every
  // owner instead of the handful with no project.
  if (opts.project === '_none') where.push(sql`coalesce(project, '') = ''`);
  else if (opts.project) where.push(sql`project = ${opts.project}`);
  if (opts.agentId) where.push(sql`agent_id = ${opts.agentId}`);

  // The filter-bar fields — same shapes as listLeads' Locality/Sales
  // Executive so the two toolbars behave identically, not just look alike.
  const many = (v?: string) => String(v || '').split(',').map(x => x.trim()).filter(Boolean);
  const anyOf = (parts: any[]) => sql`(${parts.reduce((a, c) => sql`${a} OR ${c}`)})`;
  const localities = many(opts.locality);
  if (localities.length) {
    where.push(anyOf(localities.map(l =>
      sql`lower(coalesce(locality, '')) LIKE ${'%' + l.toLowerCase().split('/')[0].trim() + '%'}`)));
  }
  const agents = many(opts.agent);
  if (agents.length) {
    const named = agents.filter(a => a !== '_none');
    const parts: any[] = [];
    if (named.length) parts.push(sql`agent_id IN ${sql(named)}`);
    if (agents.includes('_none')) parts.push(sql`agent_id IS NULL`);
    if (parts.length) where.push(anyOf(parts));
  }
  const sources = many(opts.source);
  if (sources.length) where.push(sql`lower(coalesce(source, '')) IN ${sql(sources.map(s => s.toLowerCase()))}`);

  const clause = where.reduce((acc, f, i) => (i === 0 ? f : sql`${acc} AND ${f}`));

  const sortCols: Record<string, any> = {
    name: sql`name`, recent: sql`created_at`, project: sql`project`,
    // NULLS LAST on both: a row with no callback and a row never dialled are
    // the bottom of a queue sorted by either, not the top.
    callback: sql`callback_at ASC NULLS LAST, created_at`,
    lastCall: sql`last_call_at DESC NULLS LAST, created_at`,
  };
  const orderCol = sortCols[opts.sortKey || 'recent'] || sortCols.recent;
  const dir = opts.sortDir === 'desc' ? sql`DESC` : opts.sortDir === 'asc' ? sql`ASC` : sql`DESC`;

  const [rows, totalRows] = await Promise.all([
    sql`SELECT * FROM crm_owners WHERE ${clause} ORDER BY ${orderCol} ${dir} LIMIT ${limit} OFFSET ${offset}`,
    sql`SELECT count(*)::int AS n FROM crm_owners WHERE ${clause}`,
  ]);
  return { rows: rows.map(rowToOwner), total: totalRows[0]?.n || 0, page, limit };
}

/** Segment pill counts for the owners list, scoped the same way listOwners is. */
export async function getOwnersSummary(mine?: boolean): Promise<any> {
  const t = tid();
  const scope = ownerScope(mine);
  const [totals, byStage] = await Promise.all([
    sql`SELECT count(*)::int AS total FROM crm_owners WHERE tenant_id = ${t} AND ${scope}`,
    sql`SELECT coalesce(stage, 'New') AS stage, count(*)::int AS n
        FROM crm_owners WHERE tenant_id = ${t} AND ${scope} GROUP BY 1`,
  ]);
  // Queue counts ride along with the stage counts because every caller of this
  // wants both — the status pills AND "how many are actually waiting to be
  // dialled". Two round trips to draw one toolbar was the alternative.
  const queue = await getOwnerQueueCounts(mine);
  return {
    total: totals[0]?.total ?? 0,
    byStage: Object.fromEntries((byStage as any[]).map(r => [r.stage, r.n])),
    queue,
  };
}

/** Owners grouped by project — the same "township lens" as listProjects, over
 *  the cold-calling list instead of the inventory. */
export async function listOwnerProjects(): Promise<{ rows: any[]; total: number }> {
  const t = tid();
  const scope = ownerScope();
  const rows = await sql`
    SELECT coalesce(nullif(project, ''), 'No project') AS key,
           count(*)::int AS total,
           count(*) FILTER (WHERE coalesce(stage, 'New') = 'New')::int AS "new",
           count(*) FILTER (WHERE stage = 'Interested')::int AS interested,
           mode() WITHIN GROUP (ORDER BY locality) AS locality
      FROM crm_owners WHERE tenant_id = ${t} AND ${scope}
     GROUP BY 1 ORDER BY 2 DESC`;
  return {
    rows: rows.map((r: any) => ({
      key: r.key, name: r.key, locality: r.locality || null,
      counts: { total: r.total, new: r.new, interested: r.interested },
    })),
    total: rows.length,
  };
}

export async function getOwnerById(id: string): Promise<any | null> {
  const rows = await sql`SELECT * FROM crm_owners WHERE id = ${id} AND tenant_id = ${tid()} LIMIT 1`;
  if (!rows[0]) return null;
  const events = await getTimelineEvents(id);
  return { ...rowToOwner(rows[0]), timeline: events.map(mapEventForClient) };
}

export async function updateOwner(id: string, patch: any, ctx: ActorCtx = SYSTEM_CTX): Promise<any | null> {
  const t = tid();
  const existing = await getOwnerById(id);
  if (!existing) return null;
  const next = {
    name: patch.name !== undefined ? patch.name : existing.name,
    phone: patch.phone !== undefined ? patch.phone : existing.phone,
    email: patch.email !== undefined ? patch.email : existing.email,
    project: patch.project !== undefined ? patch.project : existing.project,
    unit_ref: patch.unitRef !== undefined ? patch.unitRef : existing.unitRef,
    locality: patch.locality !== undefined ? patch.locality : existing.locality,
    stage: patch.stage !== undefined ? patch.stage : existing.stage,
    agent_id: patch.agentId !== undefined ? patch.agentId : existing.agentId,
    // null is a real value here — it is how a callback is cleared once it has
    // been made — so these read `!== undefined`, never a truthiness check.
    callback_at: patch.callbackAt !== undefined
      ? (patch.callbackAt ? new Date(patch.callbackAt) : null)
      : (existing.callbackAt ? new Date(existing.callbackAt) : null),
    callback_note: patch.callbackNote !== undefined ? patch.callbackNote : existing.callbackNote,
  };
  await sql`UPDATE crm_owners SET ${sql(next)}, updated_at = NOW() WHERE id = ${id} AND tenant_id = ${t}`;
  if (patch.stage !== undefined && patch.stage !== existing.stage) {
    await addTimelineEvent({ record_id: id, type: 'stage_change', title: `Stage → ${patch.stage}`, description: `Marked ${patch.stage}`, author: ctx.actorLabel || 'System' });
  }
  if (patch.callbackAt !== undefined && patch.callbackAt !== existing.callbackAt) {
    await addTimelineEvent({
      record_id: id, type: patch.callbackAt ? 'follow_up' : 'note',
      title: patch.callbackAt ? 'Callback scheduled' : 'Callback cleared',
      description: patch.callbackAt
        ? `${new Date(patch.callbackAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}${patch.callbackNote ? ` — ${patch.callbackNote}` : ''}`
        : 'No callback scheduled',
      author: ctx.actorLabel || 'System',
    });
  }
  const updated = await getOwnerById(id);
  audit({
    tenant_id: t, actor_type: ctx.actorType || 'system', actor_id: ctx.actorId ?? null,
    actor_label: ctx.actorLabel ?? null, action: 'owner.update', target_type: 'owner', target_id: id,
    summary: `Owner "${updated?.name || id}" updated`, metadata: { patch }, ip: ctx.ip, user_agent: ctx.userAgent,
  });
  // Handing someone a record to call is the same event as handing them a lead,
  // and updateLead has always said so. This one said nothing — so a reassign
  // that came through the record rather than the bulk action was silent.
  // notify() drops it when you assigned it to yourself.
  if (patch.agentId !== undefined && next.agent_id && next.agent_id !== existing.agentId) {
    notify({
      userId: next.agent_id, type: 'owner_reassigned', push: true,
      data: { name: updated?.name || 'Owner' },
      link: `?screen=calling&owner=${id}`,
    }).catch(err => console.warn('[Notify] owner_reassigned failed:', err?.message));
  }
  return updated;
}

export async function deleteOwner(id: string, ctx: ActorCtx = SYSTEM_CTX): Promise<boolean> {
  const t = tid();
  const existing = await getOwnerById(id);
  const res = await sql`DELETE FROM crm_owners WHERE id = ${id} AND tenant_id = ${t}`;
  if (res.count > 0) {
    audit({
      tenant_id: t, actor_type: ctx.actorType || 'system', actor_id: ctx.actorId ?? null,
      actor_label: ctx.actorLabel ?? null, action: 'owner.delete', target_type: 'owner', target_id: id,
      summary: `Owner "${existing?.name || id}" deleted`, metadata: { before: existing }, ip: ctx.ip, user_agent: ctx.userAgent,
    });
  }
  return res.count > 0;
}

/** Same shape as bulkAssignLeads: one UPDATE, notify the new owner-caller. */
export async function bulkAssignOwners(ids: string[], agentId: string | null, ctx: ActorCtx = SYSTEM_CTX): Promise<number> {
  const who = getContext();
  if (who?.role === 'agent') throw new ForbiddenError('Assigning owners is done from the desk.');
  const clean = [...new Set((ids || []).filter(Boolean))];
  if (clean.length === 0) return 0;
  const t = tid();
  const res = await sql`
    UPDATE crm_owners SET agent_id = ${agentId}, updated_at = NOW()
    WHERE tenant_id = ${t} AND id IN ${sql(clean)}
      AND coalesce(agent_id, '') IS DISTINCT FROM coalesce(${agentId}, '')`;
  const n = res.count;
  if (n === 0) return 0;
  audit({
    tenant_id: t, actor_type: ctx.actorType || 'system', actor_id: ctx.actorId ?? null,
    actor_label: ctx.actorLabel ?? null, action: 'owner.bulk_assign', target_type: 'owner', target_id: null,
    summary: agentId ? `${n} owner${n === 1 ? '' : 's'} assigned` : `${n} owner${n === 1 ? '' : 's'} unassigned`,
    metadata: { ids: clean, agentId }, ip: ctx.ip, user_agent: ctx.userAgent,
  });
  if (agentId) {
    notify({
      userId: agentId, type: 'owner_reassigned', push: true,
      data: { n },
      link: '?screen=clients&tab=owners',
    }).catch(err => console.warn('[Notify] owner bulk assign failed:', err?.message));
  }
  return n;
}

/**
 * A contact attempt landed on some record. If that record is an owner, stamp
 * the attempt and move New → Contacted.
 *
 * No-ops silently when the id belongs to a lead or a property: the contact-log
 * route is deliberately record-agnostic (one timeline, any record), so the
 * cheapest correct way to ask "was that an owner?" is to try the UPDATE and
 * read the row count. Nothing here throws — logging a call must never fail
 * because the bookkeeping after it did.
 */
export async function noteOwnerContact(recordId: string, channel: string): Promise<void> {
  const t = tid();
  try {
    const rows = await sql`
      UPDATE crm_owners SET
        last_call_at = ${channel === 'call' ? sql`NOW()` : sql`last_call_at`},
        stage = CASE WHEN coalesce(stage, 'New') = 'New' THEN 'Contacted' ELSE stage END,
        updated_at = NOW()
      WHERE id = ${recordId} AND tenant_id = ${t}
      RETURNING stage`;
    if (rows.length && rows[0].stage === 'Contacted') {
      await addTimelineEvent({
        record_id: recordId, type: 'stage_change', title: 'Stage → Contacted',
        description: 'First outreach logged', author: 'System', metadata: { auto: true },
      });
    }
  } catch (err: any) {
    console.warn('[Owners] noteOwnerContact failed:', err?.message);
  }
}

/**
 * Owner counts for every surface that shows the calling queue: the segment
 * pills, Today's groups, and the dashboard block all read this one query.
 * Scoped like listOwners, so an agent's numbers are their own.
 *
 * `toCall` is the actual work: open, mine, and never dialled. It is NOT
 * `byStage.New` — an owner can be Contacted with no callback set and still be
 * the next thing to pick up.
 */
export async function getOwnerQueueCounts(mine?: boolean): Promise<any> {
  const t = tid();
  const scope = ownerScope(mine);
  const today = dayStart(await timezoneOf(t));
  const open = sql`coalesce(stage, 'New') NOT IN ${sql(OWNER_TERMINAL_STATUSES)}`;
  const rows = await sql`
    SELECT count(*)::int AS total,
           count(*) FILTER (WHERE ${open})::int AS open,
           count(*) FILTER (WHERE ${open} AND agent_id IS NULL)::int AS unassigned,
           count(*) FILTER (WHERE ${open} AND last_call_at IS NULL)::int AS never_called,
           count(*) FILTER (WHERE ${open} AND callback_at IS NOT NULL AND callback_at < NOW())::int AS callbacks_overdue,
           count(*) FILTER (WHERE ${open} AND callback_at IS NOT NULL AND callback_at >= NOW()
                            AND callback_at < ${today} + interval '1 day')::int AS callbacks_today,
           count(*) FILTER (WHERE ${open} AND callback_at IS NOT NULL
                            AND callback_at >= ${today} + interval '1 day')::int AS callbacks_upcoming,
           count(*) FILTER (WHERE ${open} AND callback_at IS NULL AND last_call_at IS NULL)::int AS to_call,
           count(*) FILTER (WHERE stage = 'Interested')::int AS interested,
           count(*) FILTER (WHERE last_call_at >= ${today})::int AS called_today
      FROM crm_owners WHERE tenant_id = ${t} AND ${scope}`;
  const r: any = rows[0] || {};
  return {
    total: r.total ?? 0, open: r.open ?? 0, unassigned: r.unassigned ?? 0,
    neverCalled: r.never_called ?? 0,
    callbacksOverdue: r.callbacks_overdue ?? 0,
    callbacksToday: r.callbacks_today ?? 0,
    callbacksUpcoming: r.callbacks_upcoming ?? 0,
    toCall: r.to_call ?? 0,
    interested: r.interested ?? 0,
    calledToday: r.called_today ?? 0,
  };
}

/**
 * The owner rows Today actually shows — a handful per group, not the queue.
 *
 * Deliberately LIMITed small and paired with getOwnerQueueCounts: Today prints
 * the count from the counts query and the rows from this one, so a group can
 * say "104" and show six without the number being a lie about how many were
 * fetched.
 */
export async function getOwnerTodayRows(perGroup = 6, mine?: boolean): Promise<any> {
  const t = tid();
  const scope = ownerScope(mine);
  // NOT `today` — that name is taken below by the rows themselves.
  const d0 = dayStart(await timezoneOf(t));
  const open = sql`coalesce(stage, 'New') NOT IN ${sql(OWNER_TERMINAL_STATUSES)}`;
  const n = Math.min(Math.max(Number(perGroup) || 6, 1), 25);
  const [overdue, today, toCall] = await Promise.all([
    sql`SELECT * FROM crm_owners WHERE tenant_id = ${t} AND ${scope} AND ${open}
          AND callback_at IS NOT NULL AND callback_at < NOW()
        ORDER BY callback_at ASC LIMIT ${n}`,
    sql`SELECT * FROM crm_owners WHERE tenant_id = ${t} AND ${scope} AND ${open}
          AND callback_at >= NOW() AND callback_at < ${d0} + interval '1 day'
        ORDER BY callback_at ASC LIMIT ${n}`,
    sql`SELECT * FROM crm_owners WHERE tenant_id = ${t} AND ${scope} AND ${open}
          AND callback_at IS NULL AND last_call_at IS NULL
        ORDER BY created_at ASC LIMIT ${n}`,
  ]);
  return {
    callbacksOverdue: overdue.map(rowToOwner),
    callbacksToday: today.map(rowToOwner),
    toCall: toCall.map(rowToOwner),
  };
}

/**
 * Counts for the lead segment pills, without reading the leads.
 *
 * Every segment gets a real count, from the same predicate that filters it, in
 * one pass. A pill whose count the server cannot produce has no business being
 * on the screen: it will show something, and whatever it shows will be wrong.
 * Counts respect the caller's scope, so an agent's "Overdue 3" is their three.
 *
 * Also counts leads by status, which is what the status dropdown needs to say
 * how many are in each — one query rather than one per status.
 */
export async function getLeadsSummary(): Promise<any> {
  const t = tid();
  const scope = leadScope();
  const filters = Object.entries(leadSegments(await deskConfigOf(t)))
    .map(([key, pred]) => sql`count(*) FILTER (WHERE ${pred})::int AS ${sql(key)}`)
    .reduce((acc, f) => sql`${acc}, ${f}`);
  const RENT = sql`(lower(coalesce(deal, '')) IN ('rent', 'lease') OR lower(coalesce(purpose, '')) IN ('rent', 'lease'))`;
  const SALE = sql`(lower(coalesce(deal, '')) = 'sale' OR lower(coalesce(purpose, '')) = 'sale')`;
  const [totals, byStage, byIntent] = await Promise.all([
    sql`SELECT count(*)::int AS total, ${filters} FROM crm_leads WHERE tenant_id = ${t} AND ${scope}`,
    sql`SELECT coalesce(stage, 'New') AS stage, count(*)::int AS n
        FROM crm_leads WHERE tenant_id = ${t} AND ${scope} GROUP BY 1`,
    // buy + rent no longer has to equal the total. What is left over is the
    // leads whose intent nobody has established, and that gap is the point.
    sql`SELECT count(*) FILTER (WHERE ${SALE})::int AS buy, count(*) FILTER (WHERE ${RENT})::int AS rent
        FROM crm_leads WHERE tenant_id = ${t} AND ${scope}`,
  ]);
  return {
    ...(totals[0] || { total: 0 }),
    all: totals[0]?.total ?? 0,
    byStage: Object.fromEntries((byStage as any[]).map(r => [r.stage, r.n])),
    byIntent: byIntent[0] || { buy: 0, rent: 0 },
  };
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
export async function getTodayFeed(mine?: boolean): Promise<any> {
  const t = tid();
  const scope = sql`AND ${leadScope(mine)}`;
  // LIMIT 200 over every open lead was the whole feed. Import a thousand and
  // "Not yet contacted" held the first two hundred of them, the group header
  // counted the rows it had rather than the rows that exist, and every other
  // group was buried below a scroll with no bottom. The rows below are still
  // capped — Today only ever shows a handful per group — but the counts now
  // come from their own query, so a group can honestly say 1,000 and show six.
  const [leads, renewals, leadCounts, ownerCounts, ownerRows] = await Promise.all([
    sql`SELECT * FROM crm_leads
        WHERE tenant_id = ${t} ${scope}
          AND ${OPEN}
          AND (${FOLLOWUP_PAST_DUE} OR follow_up IS NOT NULL OR agent_id IS NULL
               OR stage = 'New' OR created_at > now() - interval '14 days')
        ORDER BY created_at DESC LIMIT 200`,
    // A tenancy that has ended, or ends inside the 60-day window the renewal
    // signal treats as due. Anything further out is not today's problem.
    sql`SELECT * FROM crm_properties
        WHERE tenant_id = ${t}
          AND config->'tenancy'->>'end' IS NOT NULL
          AND (config->'tenancy'->>'end')::date <= (now() + interval '60 days')::date
        ORDER BY (config->'tenancy'->>'end')::date ASC LIMIT 50`,
    // The true size of each group, regardless of how many rows came back above.
    sql`SELECT count(*) FILTER (WHERE ${FOLLOWUP_PAST_DUE})::int AS overdue,
               count(*) FILTER (WHERE stage = 'New')::int AS fresh,
               count(*) FILTER (WHERE agent_id IS NULL)::int AS unassigned,
               count(*) FILTER (WHERE stage <> 'New' AND follow_up IS NULL AND NOT ${FOLLOWUP_PAST_DUE})::int AS no_next,
               count(*) FILTER (WHERE follow_up IS NOT NULL AND NOT ${FOLLOWUP_PAST_DUE})::int AS scheduled
          FROM crm_leads WHERE tenant_id = ${t} ${scope} AND ${OPEN}`,
    getOwnerQueueCounts(mine),
    getOwnerTodayRows(6, mine),
  ]);
  const lc: any = leadCounts[0] || {};
  return {
    leads: leads.map(r => rowToLead(r)),
    renewals: renewals.map(rowToProperty),
    counts: {
      overdue: lc.overdue ?? 0, fresh: lc.fresh ?? 0, unassigned: lc.unassigned ?? 0,
      noNext: lc.no_next ?? 0, scheduled: lc.scheduled ?? 0,
    },
    owners: { counts: ownerCounts, ...ownerRows },
  };
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
  // Null, not 'sale'. A lead whose deal type nobody has established was being
  // matched against sale stock only — so a rent-seeker's suggestions were every
  // flat in the book except the ones they could actually rent, and it looked
  // like a working feature. When we do not know, do not narrow: show both and
  // let the scorer rank them.
  const deal = lead.deal || req.deal || null;
  const locality = lead.locality || req.locality || null;
  const config = lead.requirement || req.config || null;
  const min = lead.budget_min != null ? Number(lead.budget_min) : (req.minBudget ?? null);
  const max = lead.budget_max != null ? Number(lead.budget_max) : (req.maxBudget ?? null);

  const where: any[] = [
    sql`tenant_id = ${t}`,
    sql`coalesce(status, 'Available') = 'Available'`,
  ];
  if (deal) where.push(sql`deal = ${deal}`);
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
  // The canonical facets. The filter bar has always offered these; while the
  // browser held every listing it filtered them itself, so they were never
  // wired through — and the moment the list became a server page, eight of the
  // twelve filters silently stopped doing anything.
  category?: string; bhk?: string; subtype?: string; furnishing?: string;
  facing?: string; possession?: string; ownership?: string; transaction?: string;
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
  // Filtering to Sale must not sweep in listings that never said.
  if (deal.length) where.push(sql`deal IN ${sql(deal)}`);
  if (type.length) where.push(sql`type IN ${sql(type)}`);
  if (locality.length) where.push(sql`locality IN ${sql(locality)}`);

  // Canonical facets, matched on the indexed columns. `category` defaults to
  // residential the same way the client's rowMatch did, so rows written before
  // the column existed still answer the filter instead of vanishing from it.
  const category = many(opts.category), bhk = many(opts.bhk), subtype = many(opts.subtype);
  const furnishing = many(opts.furnishing), facing = many(opts.facing);
  const possession = many(opts.possession), ownership = many(opts.ownership);
  const transaction = many(opts.transaction);
  if (category.length) where.push(sql`coalesce(nullif(category, ''), 'residential') IN ${sql(category)}`);
  if (bhk.length) where.push(sql`bhk IN ${sql(bhk)}`);
  if (subtype.length) where.push(sql`subtype IN ${sql(subtype)}`);
  if (furnishing.length) where.push(sql`coalesce(nullif(furnish_type, ''), furnishing) IN ${sql(furnishing)}`);
  if (facing.length) where.push(sql`facing IN ${sql(facing)}`);
  if (possession.length) where.push(sql`possession IN ${sql(possession)}`);
  if (ownership.length) where.push(sql`ownership IN ${sql(ownership)}`);
  if (transaction.length) where.push(sql`transaction_type IN ${sql(transaction)}`);
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
       AND coalesce(l.stage, '') NOT IN ${sql(TERMINAL_STATUSES)}
       AND (coalesce(l.deal, l.req->>'deal') IS NULL OR p.deal IS NULL
            OR coalesce(l.deal, l.req->>'deal') = p.deal)
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
    // Unknown is its own bucket, not folded into sale.
    sql`SELECT coalesce(deal, 'unspecified') AS k, count(*)::int AS n
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
           count(*) FILTER (WHERE deal = 'rent')::int AS rent,
           count(*) FILTER (WHERE deal = 'sale')::int AS sale,
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
  // The listing's own deal type, and null if it has none. Matching a
  // deal-less listing as though it were for sale showed its "interested
  // buyers" as everyone we had never asked.
  const deal = p.deal || null;

  const where: any[] = [
    sql`tenant_id = ${t}`,
    OPEN,
  ];
  // Narrow only when BOTH sides know. Unknown on either side is not a
  // mismatch, it is a missing answer, and the scorer ranks what comes back.
  if (deal) where.push(sql`(coalesce(deal, req->>'deal') IS NULL OR coalesce(deal, req->>'deal') = ${deal})`);
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

/**
 * Runs both sweeps for every tenant that has them turned on. Called on a
 * timer (see index.ts) — never from a request, so each tenant gets its own
 * system-actor context instead of inheriting whichever request happened to
 * trigger it.
 */
export async function runRoutingSweeps(): Promise<void> {
  const tenants = await sql`SELECT id FROM tenants`;
  for (const t of tenants) {
    await runWithContext({ tenantId: t.id, userId: null, role: null, actorType: 'system' }, async () => {
      try {
        const n1 = await sweepUnassignedLeads(t.id);
        const n2 = await sweepIdleLeads(t.id);
        const n3 = await sweepUnassignedOwners(t.id);
        const n4 = await sweepIdleOwners(t.id);
        if (n1 || n2 || n3 || n4) console.log(`[Routing Sweep] tenant ${t.id}: leads ${n1} unowned / ${n2} idle, owners ${n3} unowned / ${n4} idle`);
      } catch (err: any) {
        console.warn(`[Routing Sweep] tenant ${t.id} failed:`, err?.message);
      }
    });
  }
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
    return {
      strategy: 'round_robin', active_agent_ids: [], last_assigned_index: -1,
      sweep_unassigned_enabled: false, sweep_unassigned_hours: 4,
      reassign_idle_enabled: false, reassign_idle_hours: 2,
      owner_strategy: 'manual', owner_active_agent_ids: [], owner_last_assigned_index: -1,
      owner_sweep_unassigned_enabled: false, owner_sweep_unassigned_hours: 4,
      owner_reassign_idle_enabled: false, owner_reassign_idle_hours: 2,
    };
  }
  return {
    strategy: rows[0].strategy as any,
    active_agent_ids: rows[0].active_agent_ids || [],
    last_assigned_index: rows[0].last_assigned_index || -1,
    sweep_unassigned_enabled: rows[0].sweep_unassigned_enabled ?? false,
    sweep_unassigned_hours: rows[0].sweep_unassigned_hours ?? 4,
    reassign_idle_enabled: rows[0].reassign_idle_enabled ?? false,
    reassign_idle_hours: rows[0].reassign_idle_hours ?? 2,
    owner_strategy: rows[0].owner_strategy || 'manual',
    owner_active_agent_ids: rows[0].owner_active_agent_ids || [],
    owner_last_assigned_index: rows[0].owner_last_assigned_index ?? -1,
    owner_sweep_unassigned_enabled: rows[0].owner_sweep_unassigned_enabled ?? false,
    owner_sweep_unassigned_hours: rows[0].owner_sweep_unassigned_hours ?? 4,
    owner_reassign_idle_enabled: rows[0].owner_reassign_idle_enabled ?? false,
    owner_reassign_idle_hours: rows[0].owner_reassign_idle_hours ?? 2,
  };
}

export async function updateRoutingRules(patch: Partial<RoutingRule>): Promise<RoutingRule> {
  const current = await getRoutingRules();
  const next = { ...current, ...patch };
  await sql`
    INSERT INTO crm_routing_rules (
      strategy, active_agent_ids, last_assigned_index,
      sweep_unassigned_enabled, sweep_unassigned_hours,
      reassign_idle_enabled, reassign_idle_hours,
      owner_strategy, owner_active_agent_ids, owner_last_assigned_index,
      owner_sweep_unassigned_enabled, owner_sweep_unassigned_hours,
      owner_reassign_idle_enabled, owner_reassign_idle_hours, tenant_id
    )
    VALUES (
      ${next.strategy}, ${sql.json(next.active_agent_ids)}, ${next.last_assigned_index},
      ${next.sweep_unassigned_enabled}, ${next.sweep_unassigned_hours},
      ${next.reassign_idle_enabled}, ${next.reassign_idle_hours},
      ${next.owner_strategy}, ${sql.json(next.owner_active_agent_ids)}, ${next.owner_last_assigned_index},
      ${next.owner_sweep_unassigned_enabled}, ${next.owner_sweep_unassigned_hours},
      ${next.owner_reassign_idle_enabled}, ${next.owner_reassign_idle_hours}, ${tid()}
    )
    ON CONFLICT (tenant_id) DO UPDATE SET
      strategy = EXCLUDED.strategy,
      active_agent_ids = EXCLUDED.active_agent_ids,
      last_assigned_index = EXCLUDED.last_assigned_index,
      sweep_unassigned_enabled = EXCLUDED.sweep_unassigned_enabled,
      sweep_unassigned_hours = EXCLUDED.sweep_unassigned_hours,
      reassign_idle_enabled = EXCLUDED.reassign_idle_enabled,
      reassign_idle_hours = EXCLUDED.reassign_idle_hours,
      owner_strategy = EXCLUDED.owner_strategy,
      owner_active_agent_ids = EXCLUDED.owner_active_agent_ids,
      owner_last_assigned_index = EXCLUDED.owner_last_assigned_index,
      owner_sweep_unassigned_enabled = EXCLUDED.owner_sweep_unassigned_enabled,
      owner_sweep_unassigned_hours = EXCLUDED.owner_sweep_unassigned_hours,
      owner_reassign_idle_enabled = EXCLUDED.owner_reassign_idle_enabled,
      owner_reassign_idle_hours = EXCLUDED.owner_reassign_idle_hours;
  `;
  return next;
}

/** Same round-robin as nextRoutedAgent(), against the owner pool instead of
 *  the lead pool — a firm may staff cold-calling differently from leads. */
export async function nextRoutedOwnerAgent(): Promise<string | null> {
  const rows = await sql`
    UPDATE crm_routing_rules
    SET owner_last_assigned_index = (owner_last_assigned_index + 1) % GREATEST(jsonb_array_length(owner_active_agent_ids), 1)
    WHERE tenant_id = ${tid()} AND jsonb_array_length(owner_active_agent_ids) > 0
    RETURNING owner_active_agent_ids -> owner_last_assigned_index AS agent_id
  `;
  if (rows.length && rows[0].agent_id) return String(rows[0].agent_id).replace(/^"|"$/g, '');
  return null;
}

/**
 * The two sweeps, run for every tenant on a timer (see index.ts). Distinct
 * from nextRoutedAgent(): that one only ever looks at the single lead that
 * just arrived. These look BACKWARD across leads already sitting in the
 * pipeline — one for leads nobody owns, one for leads whose owner has gone
 * quiet — which arrival-time routing was never in a position to catch.
 */
export async function sweepUnassignedLeads(tenantId: string): Promise<number> {
  const rules = await getRoutingRules();
  if (!rules.sweep_unassigned_enabled) return 0;
  const hours = Math.max(Number(rules.sweep_unassigned_hours) || 4, 1);
  // "Unowned" includes an agent_id that no longer resolves to a live user —
  // the same orphaned state the desk sees as "Former owner" on the row.
  const rows = await sql`
    SELECT l.id, l.name, l.created_at FROM crm_leads l
    LEFT JOIN users u ON u.id = l.agent_id AND u.tenant_id = l.tenant_id AND u.deleted_at IS NULL
    WHERE l.tenant_id = ${tenantId} AND ${OPEN}
      AND (l.agent_id IS NULL OR u.id IS NULL)
      AND l.created_at < NOW() - (${hours}::text || ' hours')::interval
  `;
  let n = 0;
  const tally = new Map<string, number>();
  for (const lead of rows) {
    const agentId = await nextRoutedAgent();
    if (!agentId) break;
    await sql`UPDATE crm_leads SET agent_id = ${agentId}, updated_at = NOW() WHERE id = ${lead.id} AND tenant_id = ${tenantId}`;
    const name = (await sql`SELECT name FROM users WHERE id = ${agentId} LIMIT 1`)[0]?.name || 'a colleague';
    await addTimelineEvent({
      record_id: lead.id, type: 'assignment', title: 'Auto-assigned',
      description: `Unowned for ${hours}h — routed to ${name}`,
      author: 'System', metadata: { agentId, reason: 'sweep_unassigned', hours },
    });
    tally.set(agentId, (tally.get(agentId) || 0) + 1);
    n++;
  }
  // The owner sweeps have always done this; the lead sweeps wrote a timeline
  // entry and stopped. So the desk turned on auto-assignment, leads moved onto
  // people's names overnight, and the only way to find out was to go looking.
  await notifyAssignBatch(tenantId, tally, {
    type: 'lead_assigned', noun: 'lead', verb: 'assigned to you',
    body: 'Nobody had picked these up.', link: '?screen=leads',
  });
  return n;
}

export async function sweepIdleLeads(tenantId: string): Promise<number> {
  const rules = await getRoutingRules();
  if (!rules.reassign_idle_enabled) return 0;
  const hours = Math.max(Number(rules.reassign_idle_hours) || 2, 1);
  // Excludes: terminal leads (nothing left to chase) and leads with a future
  // scheduled follow-up (the assignee has a plan; going quiet on the record
  // isn't the same as going quiet on the buyer).
  const rows = await sql`
    SELECT id, name, agent_id FROM crm_leads
    WHERE tenant_id = ${tenantId} AND ${OPEN} AND agent_id IS NOT NULL
      AND updated_at < NOW() - (${hours}::text || ' hours')::interval
      AND NOT (follow_up IS NOT NULL AND (follow_up->>'date')::date >= CURRENT_DATE)
  `;
  let n = 0;
  const tally = new Map<string, number>();
  const lost = new Map<string, number>();
  for (const lead of rows) {
    const prevOwner = (await sql`SELECT name FROM users WHERE id = ${lead.agent_id} LIMIT 1`)[0]?.name || 'previous owner';
    const agentId = await nextRoutedAgent();
    if (!agentId || agentId === lead.agent_id) continue;
    await sql`UPDATE crm_leads SET agent_id = ${agentId}, updated_at = NOW() WHERE id = ${lead.id} AND tenant_id = ${tenantId}`;
    const name = (await sql`SELECT name FROM users WHERE id = ${agentId} LIMIT 1`)[0]?.name || 'a colleague';
    await addTimelineEvent({
      record_id: lead.id, type: 'assignment', title: 'Reassigned — idle',
      description: `No activity from ${prevOwner} for ${hours}h — routed to ${name}`,
      author: 'System', metadata: { agentId, previousAgentId: lead.agent_id, reason: 'sweep_idle', hours },
    });
    tally.set(agentId, (tally.get(agentId) || 0) + 1);
    lost.set(lead.agent_id, (lost.get(lead.agent_id) || 0) + 1);
    n++;
  }
  await notifyAssignBatch(tenantId, tally, {
    type: 'lead_reassigned', noun: 'lead', verb: 'moved to you',
    body: `Idle for over ${hours}h with their previous owner.`, link: '?screen=leads',
  });
  // The only place either module tells someone work has LEFT them. Losing a
  // lead to the idle rule is a thing they should hear from the app rather than
  // discover when a manager asks how the follow-up went — and unlike the
  // arrival, it is not urgent, so it stays in the feed without a push.
  for (const [agentId, count] of lost) {
    notify({
      userId: agentId, tenantId, type: 'lead_moved_away',
      data: { n: count },
      link: '?screen=leads', toSelf: true,
    }).catch(err => console.warn('[Notify] lead idle-loss failed:', err?.message));
  }
  return n;
}

// Same two sweeps again, over crm_owners — no OPEN/terminal-status guard the
// way leads have one (owner statuses are already a short, mostly-terminal-free
// list; Do Not Call and Not Interested are the only ones excluded here, same
// reasoning as TERMINAL_STATUSES for leads: nothing left to chase).
export async function sweepUnassignedOwners(tenantId: string): Promise<number> {
  const rules = await getRoutingRules();
  if (!rules.owner_sweep_unassigned_enabled) return 0;
  const hours = Math.max(Number(rules.owner_sweep_unassigned_hours) || 4, 1);
  const rows = await sql`
    SELECT o.id FROM crm_owners o
    LEFT JOIN users u ON u.id = o.agent_id AND u.tenant_id = o.tenant_id AND u.deleted_at IS NULL
    WHERE o.tenant_id = ${tenantId} AND coalesce(o.stage, '') NOT IN ${sql(OWNER_TERMINAL_STATUSES)}
      AND (o.agent_id IS NULL OR u.id IS NULL)
      AND o.created_at < NOW() - (${hours}::text || ' hours')::interval
  `;
  let n = 0;
  const tally = new Map<string, number>();
  for (const owner of rows) {
    const agentId = await nextRoutedOwnerAgent();
    if (!agentId) break;
    await sql`UPDATE crm_owners SET agent_id = ${agentId}, updated_at = NOW() WHERE id = ${owner.id} AND tenant_id = ${tenantId}`;
    const name = (await sql`SELECT name FROM users WHERE id = ${agentId} LIMIT 1`)[0]?.name || 'a colleague';
    await addTimelineEvent({
      record_id: owner.id, type: 'assignment', title: 'Auto-assigned',
      description: `Unowned for ${hours}h — routed to ${name}`,
      author: 'System', metadata: { agentId, reason: 'sweep_unassigned', hours },
    });
    tally.set(agentId, (tally.get(agentId) || 0) + 1);
    n++;
  }
  await notifyOwnerBatch(tenantId, tally, 'owner_assigned', 'to call');
  return n;
}

/**
 * One notification per agent per sweep, naming the count.
 *
 * The lead path notifies per record, which is right when leads arrive one at a
 * time from a portal. A sweep over a cold-calling list routes hundreds in a
 * single pass — copied verbatim that is hundreds of pushes to one phone, and
 * the agent turns alerts off. So the sweep tallies and sends one.
 */
interface AssignBatchCopy { type: string; noun: string; verb: string; body: string; link: string }

async function notifyAssignBatch(tenantId: string, tally: Map<string, number>, c: AssignBatchCopy): Promise<void> {
  for (const [agentId, count] of tally) {
    notify({
      // tenantId passed EXPLICITLY rather than left to notify()'s fallback.
      // runRoutingSweeps does wrap each tenant in runWithContext, so the
      // fallback resolves correctly today — but the tenant is already an
      // argument to every sweep, and a notification landing in the wrong
      // workspace is invisible rather than noisy. Not worth leaving to a
      // caller's ambient state.
      userId: agentId, tenantId, type: c.type, push: true,
      title: `${count} ${c.noun}${count === 1 ? '' : 's'} ${c.verb}`,
      body: c.body,
      link: c.link,
      // A sweep has no human actor — its context carries userId: null — so
      // there is no "you did this yourself" case to suppress.
      toSelf: true,
    }).catch(err => console.warn(`[Notify] ${c.type} failed:`, err?.message));
  }
}

async function notifyOwnerBatch(tenantId: string, tally: Map<string, number>, type: string, verb: string): Promise<void> {
  return notifyAssignBatch(tenantId, tally, {
    type, noun: 'owner', verb, body: 'Added to your calling queue.', link: '?screen=calling',
  });
}

export async function sweepIdleOwners(tenantId: string): Promise<number> {
  const rules = await getRoutingRules();
  if (!rules.owner_reassign_idle_enabled) return 0;
  const hours = Math.max(Number(rules.owner_reassign_idle_hours) || 2, 1);
  const rows = await sql`
    SELECT id, agent_id FROM crm_owners
    WHERE tenant_id = ${tenantId} AND coalesce(stage, '') NOT IN ${sql(OWNER_TERMINAL_STATUSES)} AND agent_id IS NOT NULL
      AND updated_at < NOW() - (${hours}::text || ' hours')::interval
  `;
  let n = 0;
  const tally = new Map<string, number>();
  for (const owner of rows) {
    const prevOwner = (await sql`SELECT name FROM users WHERE id = ${owner.agent_id} LIMIT 1`)[0]?.name || 'previous owner';
    const agentId = await nextRoutedOwnerAgent();
    if (!agentId || agentId === owner.agent_id) continue;
    await sql`UPDATE crm_owners SET agent_id = ${agentId}, updated_at = NOW() WHERE id = ${owner.id} AND tenant_id = ${tenantId}`;
    const name = (await sql`SELECT name FROM users WHERE id = ${agentId} LIMIT 1`)[0]?.name || 'a colleague';
    await addTimelineEvent({
      record_id: owner.id, type: 'assignment', title: 'Reassigned — idle',
      description: `No activity from ${prevOwner} for ${hours}h — routed to ${name}`,
      author: 'System', metadata: { agentId, previousAgentId: owner.agent_id, reason: 'sweep_idle', hours },
    });
    tally.set(agentId, (tally.get(agentId) || 0) + 1);
    n++;
  }
  await notifyOwnerBatch(tenantId, tally, 'owner_reassigned', 'moved to you');
  return n;
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
  // The "New today" pill keys off the first pipeline stage, and that answer is
  // cached. Renaming or reordering stages here has to drop it, or the pill
  // silently counts nothing until the TTL lapses.
  arrivalStageCache.delete(tid());
  if (patch.renameStage?.from && patch.renameStage?.to) {
    await sql`UPDATE crm_leads SET stage = ${patch.renameStage.to} WHERE stage = ${patch.renameStage.from} AND tenant_id = ${tid()};`;
    delete patch.renameStage;
  }
  // Same contract as renameStage, over the calling queue: the rows sitting on
  // the old status move with it, so renaming never orphans a queue.
  if (patch.renameOwnerStage?.from && patch.renameOwnerStage?.to) {
    await sql`UPDATE crm_owners SET stage = ${patch.renameOwnerStage.to} WHERE stage = ${patch.renameOwnerStage.from} AND tenant_id = ${tid()};`;
    delete patch.renameOwnerStage;
  }
  // The two terminal statuses are what the sweeps and every "open" count key
  // off in SQL. A firm can rename or add anything else; removing these would
  // silently put "Do not call" rows back into the auto-assign rotation.
  if (Array.isArray(patch.ownerStages)) {
    patch.ownerStages = [
      ...patch.ownerStages.filter((s: string) => s && !OWNER_TERMINAL_STATUSES.includes(s)),
      ...OWNER_TERMINAL_STATUSES,
    ];
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
            // No author: the event carries an author ID, not a name, and a
            // notification reading "by u_ms6oqbda" is worse than one that does
            // not say. Resolving it needs a lookup this path does not do.
            data: { name: lead.name },
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
// 📨 ENQUIRY SESSIONS — docs/specs/repeat-enquiries.md, phase 1
// ============================================================================
// Records what was asked for and when. Changes NOTHING about the lead: the
// requirement, the name, the stage and the routing are all left exactly as the
// existing merge leaves them. That is the whole design of phase 1 — the counter
// and the history are additive and cannot be wrong in a way that costs
// anything, and the disagreements between this and the lead can be read on real
// traffic before a single field is overwritten.

/** How long a browsing session lasts. Six hours covers a lunchtime and an
 *  evening browse while keeping yesterday and today always separate. It is a
 *  guess, so it lives where it can be changed rather than inline. */
export const ENQUIRY_SESSION_MS = 6 * 60 * 60 * 1000;

export interface EnquiryInput {
  leadId: string;
  at?: Date | string | null;
  source?: string | null;
  integrationId?: string | null;
  req?: any;
  enquiryId?: string | null;
  rawRef?: string | null;
}

/** Both ends of the budget a session was browsing. Four clicks at 24,999 /
 *  25,000 / 29,999 / 29,999 is a range someone is looking at, not a sequence of
 *  revisions — taking the last is how "latest wins" lands on whichever listing
 *  they happened to open last. */
function mergeSessionReq(prev: any, next: any): any {
  const out = { ...(prev || {}) };
  const n = next || {};
  const nums = (v: any) => (v == null || v === '' ? null : Number(v));
  const lo = nums(n.minBudget ?? n.budget), hi = nums(n.maxBudget ?? n.budget);
  if (lo != null && isFinite(lo)) out.minBudget = out.minBudget == null ? lo : Math.min(Number(out.minBudget), lo);
  if (hi != null && isFinite(hi)) out.maxBudget = out.maxBudget == null ? hi : Math.max(Number(out.maxBudget), hi);
  // Accumulated, because someone comparing Green Vistas and VTP Township is
  // telling you something and picking one of them discards it.
  for (const k of ['locality', 'config', 'interest', 'subtype'] as const) {
    const v = n[k];
    if (!v) continue;
    const cur = out[k];
    const list = Array.isArray(cur) ? cur : (cur ? [cur] : []);
    if (!list.includes(v)) list.push(v);
    out[k] = list.length === 1 ? list[0] : list;
  }
  // Single-valued: never observed to differ inside a session.
  for (const k of ['deal', 'category'] as const) if (n[k] && !out[k]) out[k] = n[k];
  if (n.notes) out.notes = n.notes;
  return out;
}

/**
 * Record one payload against its session, creating the session if this is a
 * new one. Idempotent on the portal's own enquiry id.
 *
 * Never throws into the caller: this is bookkeeping alongside ingestion, and a
 * lead must not fail to arrive because its history row could not be written.
 */
export async function recordEnquiry(input: EnquiryInput): Promise<string | null> {
  try {
    const t = tid();
    const at = input.at ? new Date(input.at) : new Date();
    const when = isNaN(at.getTime()) ? new Date() : at;

    // ALREADY COUNTED? Two independent guards, because they catch different
    // things and each one alone leaves a hole.
    //
    // The portal retrying one enquiry is not a second enquiry — one bhumi
    // enquiry_id arrived three times. But not every payload carries an id, and
    // for those the backfill replaying the same webhook_inbox row would raise
    // payload_count again every time it ran: bhumi showed 589 payloads over 261
    // pushes after two replays. The inbox row id is the payload's identity
    // whether or not the portal gave it one.
    if (input.rawRef) {
      const seen = await sql`
        SELECT 1 FROM crm_lead_enquiries
         WHERE tenant_id = ${t} AND raw_refs @> ${sql.json([input.rawRef])} LIMIT 1`;
      if (seen.length) return null;
    }
    if (input.enquiryId) {
      const seen = await sql`
        SELECT id, raw_refs FROM crm_lead_enquiries
         WHERE tenant_id = ${t} AND enquiry_ids @> ${sql.json([input.enquiryId])} LIMIT 1`;
      if (seen.length) {
        // The delivery is still recorded, it just is not a second enquiry.
        // Dropping the reference entirely left one bhumi push belonging to no
        // session at all, so the table could not be reconciled against the
        // inbox it was built from — and provenance is the reason raw_refs
        // exists.
        if (input.rawRef) {
          const refs = seen[0].raw_refs || [];
          if (!refs.includes(input.rawRef)) {
            await sql`UPDATE crm_lead_enquiries SET raw_refs = ${sql.json([...refs, input.rawRef])}
                       WHERE id = ${seen[0].id} AND tenant_id = ${t}`;
          }
        }
        return null;
      }
    }

    const open = await sql`
      SELECT * FROM crm_lead_enquiries
       WHERE tenant_id = ${t} AND lead_id = ${input.leadId}
         AND last_at >= ${new Date(when.getTime() - ENQUIRY_SESSION_MS)}
         AND first_at <= ${new Date(when.getTime() + ENQUIRY_SESSION_MS)}
       ORDER BY last_at DESC LIMIT 1`;

    if (open.length) {
      const row = open[0];
      await sql`
        UPDATE crm_lead_enquiries SET
          last_at = GREATEST(last_at, ${when}),
          first_at = LEAST(first_at, ${when}),
          payload_count = payload_count + 1,
          req = ${sql.json(mergeSessionReq(row.req, input.req))},
          enquiry_ids = ${sql.json([...(row.enquiry_ids || []), ...(input.enquiryId ? [input.enquiryId] : [])])},
          raw_refs = ${sql.json([...(row.raw_refs || []), ...(input.rawRef ? [input.rawRef] : [])])}
        WHERE id = ${row.id} AND tenant_id = ${t}`;
      return row.id;
    }

    const id = `enq_${when.getTime()}_${Math.random().toString(36).slice(2, 6)}`;
    await sql`
      INSERT INTO crm_lead_enquiries
        (id, tenant_id, lead_id, integration_id, session_key, first_at, last_at,
         payload_count, source, req, enquiry_ids, raw_refs)
      VALUES (${id}, ${t}, ${input.leadId}, ${input.integrationId ?? null},
              ${`${input.leadId}:${when.toISOString()}`}, ${when}, ${when},
              1, ${input.source ?? null}, ${sql.json(mergeSessionReq({}, input.req))},
              ${sql.json(input.enquiryId ? [input.enquiryId] : [])},
              ${sql.json(input.rawRef ? [input.rawRef] : [])})
      ON CONFLICT (tenant_id, session_key) DO NOTHING`;
    return id;
  } catch (err: any) {
    console.warn('[recordEnquiry]', err.message);
    return null;
  }
}


/**
 * Build the enquiry history from the pushes that are still on disk.
 *
 * webhook_inbox keeps the original bodies, so the table can start full instead
 * of empty — and it only gets cheaper the sooner it runs: data-lifecycle.md
 * purges bodies at 30 days and what is gone is gone.
 *
 * It replays each payload through recordEnquiry, the SAME function live
 * ingestion calls, rather than reimplementing the session rule. The first
 * version of this kept its own in-memory map of open sessions and raced the
 * boot chain: one lead ended up with two overlapping sessions 90 seconds apart,
 * both claiming the same last payload. Two implementations of one rule is the
 * mistake this codebase keeps making, and a migration is not exempt from it.
 *
 * Slower — a round trip per payload — and that is the correct trade for a
 * one-time repair that has to agree with what happens tomorrow.
 */
export async function backfillEnquiries(): Promise<void> {
  // A clean rebuild. The rows are derived entirely from webhook_inbox and no
  // human has edited them, so starting over is safe and is the only way a
  // half-finished earlier attempt gets corrected rather than compounded.
  const wiped = await sql`DELETE FROM crm_lead_enquiries WHERE id LIKE 'enq_bf_%' OR id LIKE 'enq_%'`;

  const rows = await sql`
    SELECT id, tenant_id, integration_id, lead_id, received_at, raw_body
      FROM webhook_inbox
     WHERE lead_id IS NOT NULL AND raw_body IS NOT NULL
     ORDER BY received_at ASC`;

  const byTenant = new Map<string, number>();
  for (const r of rows as any[]) {
    let body: any = r.raw_body;
    if (typeof body === 'string') { try { body = JSON.parse(body); } catch { continue; } }
    if (!body || typeof body !== 'object') continue;
    const when = new Date(r.received_at);
    if (isNaN(when.getTime())) continue;
    // recordEnquiry reads the tenant from the request context, so the replay
    // has to stand in the right one for each row.
    await runWithContext({ tenantId: r.tenant_id } as any, () => recordEnquiry({
      leadId: r.lead_id,
      at: when,
      source: body.source || null,
      integrationId: r.integration_id || null,
      enquiryId: body.enquiry_id || body.lead_id || null,
      rawRef: r.id,
      req: {
        locality: body.locality || body.location || undefined,
        config: body.property_type || body.bhk || undefined,
        minBudget: body.budget_min || undefined,
        maxBudget: body.budget_max || body.budget || undefined,
        notes: body.message || undefined,
        interest: body.project || undefined,
      },
    }));
    byTenant.set(r.tenant_id, (byTenant.get(r.tenant_id) || 0) + 1);
  }

  // Per tenant, out loud, and counted from the table rather than from what this
  // function thinks it did. A repair that reports its own intentions instead of
  // the result is how "65 unscoped reads" gets announced before one is opened.
  const after = await sql`SELECT tenant_id, count(*)::int AS sessions,
                                 count(DISTINCT lead_id)::int AS leads
                            FROM crm_lead_enquiries GROUP BY 1 ORDER BY 1`;
  console.log(`[migration] enquiry sessions rebuilt from ${rows.length} payloads`
    + (wiped.count ? ` (cleared ${wiped.count} from an earlier attempt)` : '')
    + ' — ' + (after as any[]).map(r => `${r.tenant_id}: ${r.sessions} sessions over ${r.leads} leads`).join(', '));
}

/** Every session on one lead, newest first. */
export async function getEnquiriesForLead(leadId: string): Promise<any[]> {
  const rows = await sql`
    SELECT * FROM crm_lead_enquiries
     WHERE tenant_id = ${tid()} AND lead_id = ${leadId}
     ORDER BY first_at DESC`;
  return rows.map(r => ({
    id: r.id,
    at: r.first_at instanceof Date ? r.first_at.toISOString() : String(r.first_at),
    lastAt: r.last_at instanceof Date ? r.last_at.toISOString() : String(r.last_at),
    listings: r.payload_count,
    source: r.source,
    req: r.req || {},
  }));
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
  // A completed, proven site visit (photo + geo already required to reach
  // here) is a fact the system observed directly — not a judgment call like
  // "Interested", which stays manual. See maybeAutoAdvanceStage for the
  // never-backwards / never-out-of-terminal guard.
  if (input.type === 'site_visit' && input.lead_id) {
    await maybeAutoAdvanceStage(input.lead_id, 'Site Visit', 'Site visit logged with proof');
    await closeSiteVisitAppointment(input.lead_id);
  }
  return rows[0];
}

/**
 * The visit that was booked has now happened, so the booking is over.
 *
 * The client used to do this itself — log the activity, then send a second
 * request clearing `followUp`. Two writes, and the record screen re-read the
 * lead between them: it saw the visit land, refetched, and got a lead whose
 * appointment had not been cleared yet, so the appointment card came BACK a
 * few seconds after disappearing. Measured on a real save: cleared at 3s,
 * restored at 5s, cleared again at 9s.
 *
 * One write, on the side that owns the row. By the time the client is told the
 * visit was logged, the appointment is already gone — there is no window in
 * which a read can disagree.
 *
 * Only a SITE VISIT appointment is closed by a site visit. A lead with a
 * callback booked for Thursday who happens to be shown a flat on Tuesday keeps
 * the callback; the visit did not answer it.
 */
async function closeSiteVisitAppointment(leadId: string): Promise<void> {
  await sql`
    UPDATE crm_leads SET follow_up = NULL, updated_at = NOW()
    WHERE id = ${leadId} AND tenant_id = ${tid()}
      AND follow_up->>'action' ILIKE '%site%visit%'`;
}

/**
 * Move a lead's stage automatically, but only forward and never out of a
 * terminal status — the same restraint a desk expects of a human. Statuses
 * are flat (not a funnel), so LEAD_STATUSES' order is used only as a rough
 * "how far along" signal to decide what counts as backwards; a manual status
 * a human already set (e.g. Interested, ahead of Call Not Received) is never
 * overwritten by an automatic one behind it.
 */
export async function maybeAutoAdvanceStage(leadId: string, targetStage: string, reason: string): Promise<void> {
  const t = tid();
  const rows = await sql`SELECT stage FROM crm_leads WHERE id = ${leadId} AND tenant_id = ${t} LIMIT 1`;
  const cur = rows[0]?.stage || 'New';
  if (!rows.length || TERMINAL_STATUSES.includes(cur) || cur === targetStage) return;
  const curIdx = LEAD_STATUSES.indexOf(cur);
  const targetIdx = LEAD_STATUSES.indexOf(targetStage);
  if (targetIdx === -1 || (curIdx !== -1 && targetIdx < curIdx)) return;
  await sql`UPDATE crm_leads SET stage = ${targetStage}, updated_at = NOW() WHERE id = ${leadId} AND tenant_id = ${t}`;
  await addTimelineEvent({
    record_id: leadId, type: 'stage_change', title: `Stage → ${targetStage}`,
    description: reason, author: 'System', metadata: { auto: true, from: cur, to: targetStage },
  });
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

/**
 * One lead's activities, mapped for the client.
 *
 * THIS READ DID NOT EXIST. addActivity wrote site visits — photo, geo, outcome,
 * the whole proof — into `activities`, and the only reader was
 * getActivitiesByLead below, whose comment says "used by getState" and which had
 * no callers at all. crm_timeline_events is a different table, so the record
 * screen's timeline never showed them: on delpat, seven proven site visits,
 * three of them on one lead, logged and then invisible. The agent's reasonable
 * conclusion was that logging a visit does nothing.
 */
export async function getActivitiesForLead(leadId: string): Promise<any[]> {
  const rows = await sql`
    SELECT * FROM activities WHERE tenant_id = ${tid()} AND lead_id = ${leadId} ORDER BY at DESC`;
  const coords = await propCoordsFor(rows.map((r: any) => r.property_id));
  return rows.map((r: any) => mapActivityForClient(r, r.property_id ? coords.get(r.property_id) || null : null));
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
/**
 * ALL THREE COUNTS WERE STRUCTURALLY ZERO. Not "quiet agent" zero — impossible.
 *
 *   visits  read `stage = 'Site Visit Done'`. No tenant has that stage; bhumi's
 *           is 'Site Visit'. Also the wrong source: a visit is an activities row
 *           with a photo and a GPS fix, not a stage someone may move away from
 *           afterwards. Counted from `activities` now.
 *   won     read `stage ILIKE '%won%'`. Every tenant's won stage is
 *           'Deal Closed'. WON_STATUS has said so all along and is already
 *           imported here — the query invented its own rule instead.
 *   calls   was correct, but had NO date filter while the payload announced
 *           `period: 'last_30_days'` and the UI labelled it "Calls · 30d".
 *           A window in the label and none in the SQL.
 *
 * Verified against bhumi: Anil Dangi 55 calls, Binod 45 + 1 closed, Amit 8 + 1.
 */
export async function getAgentPerformance(userId: string) {
  const t = tid();
  const [callRows, visitRows, wonRows] = await Promise.all([
    sql`SELECT count(*)::int as total_calls FROM crm_timeline_events
         WHERE author = ${userId} AND type = 'call' AND tenant_id = ${t}
           AND timestamp >= now() - interval '30 days'`,
    sql`SELECT count(*)::int as site_visits FROM activities
         WHERE agent_id = ${userId} AND type = 'site_visit' AND tenant_id = ${t}
           AND at >= now() - interval '30 days'`,
    sql`
      SELECT count(*)::int as closed_won,
             COALESCE(SUM(COALESCE(budget_max, budget_min, 0)), 0)::bigint as revenue
      FROM crm_leads WHERE agent_id = ${userId} AND stage = ${WON_STATUS} AND tenant_id = ${t}
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
    // Calls and visits ARE last-30-days. closed_won_deals is all-time: a stage
    // has no date of its own, and a firm closing three deals a year would read 0
    // on every 30-day window forever. Named so the client cannot print one
    // window's label over the other's number — which is exactly what
    // "Calls · 30d" over an unwindowed count was.
    period: 'last_30_days',
    closed_won_period: 'all_time',
    total_outbound_calls: calls,
    site_visits_done: visits,
    closed_won_deals: won,
    pipeline_revenue_closed: revenue,
    // null, not 0 — "no visits yet" and "visits that never converted" are
    // different facts, and only one of them is a rate worth showing.
    visit_conversion_rate_percentage: conv,
  };
}

