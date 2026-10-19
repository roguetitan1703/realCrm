/**
 * ============================================================================
 * SENDING FLATS, AND THE FIRM'S CATALOGUE (docs/specs/listing-pages.md §A)
 * ============================================================================
 * Two things a buyer can open without signing in:
 *
 *   /<firm>/<code>          a SHARED LINK — flats an agent picked, optionally
 *                           bound to one lead — or an "I'm interested" TAP's ref
 *   /<firm>/homes[/<slug>]  the PUBLIC CATALOGUE — every flat ticked Show in
 *                           catalogue that is Available
 *
 * WHO THIS IS FOR. The buyer, on a phone, from WhatsApp: see the homes, tap
 * I'm interested, land in a chat with the person holding them. The agent, on
 * a phone: know the moment a buyer is interested, and turn a reply into a lead
 * in one paste. The owner: links that end by themselves, and one switch that
 * stops them all.
 *
 * WHAT A PUBLIC RESPONSE NEVER CARRIES: the flat or unit number, the owner,
 * notes, key details, the agent's name. Price only when the link (show_price)
 * or the catalogue setting allows it. `publicFlat()` is the only place a
 * listing becomes public, so nothing else can leak more.
 *
 * A wrong, turned-off, stopped or expired code answers one identical body
 * (state `unavailable`), so codes cannot be probed for. The expired case still
 * matters — Talk to us on it tells the holder — and that difference lives in
 * the POST, behind the rate limit, never in the GET.
 *
 * Every query here names its tenant. Public requests carry no session, so the
 * tenant comes from the URL and is passed down; the signed-in calls read it
 * from the request context like the rest of the store.
 * ============================================================================
 */
import crypto from 'crypto';
import { sql } from './db.js';
import { getContext, runWithContext } from './context.js';
import { freshCode, CODE_RE } from './shareCodes.js';
import { notify, notifyRoles } from './notifications.js';
import { audit } from './audit.js';
import { landEnquiry } from './ingestion.js';
import { assertLeadWrite } from '../lib/permissions.js';
import { normalizePhone } from './roster.js';
import { isDeskRole } from '../lib/permissions.js';
import {
  findLeadByPhone, createLead, updateLead, addTimelineEvent, sharingOf, deskConfigOf, localeOf,
  REJECTED_STATUS, type ActorCtx,
} from './store.js';

// ── Errors a route turns into a status ──────────────────────────────────────

export class ShareError extends Error {
  constructor(public status: number, public code: string, message?: string, public extra: Record<string, any> = {}) {
    super(message || code);
  }
}

// ── Small helpers ───────────────────────────────────────────────────────────

const rid = (p: string) => `${p}_${Date.now().toString(36)}${crypto.randomBytes(4).toString('hex')}`;

/** The firm's day began at…, on the firm's clock. "One a day" means the firm's day. */
const firmDayStart = (tz: string) => sql`(date_trunc('day', now() AT TIME ZONE ${tz}) AT TIME ZONE ${tz})`;

/**
 * WhatsApp's own link-preview fetch, and every other app's, must not count as
 * a buyer opening the link. Same net as vercel.json's card rule.
 */
const PREVIEW_UA = /(bot|crawler|spider|scraper|preview|externalhit|externalagent|externalfetcher|unfurl|embed|whatsapp|telegram|viber|snapchat|kakaotalk|zalo|skypeuri|microsoftpreview|teams|slack|discord|mattermost|rocket\.chat|mastodon|pleroma|misskey|cardyb|tumblr|vkshare|iframely|metainspector|curl|wget|python|okhttp|go-http-client|java\/|node-fetch|undici|axios|http\.rb|libwww|httpclient)/i;
export const isPreviewFetcher = (ua: string | undefined | null) => PREVIEW_UA.test(String(ua || ''));

/** The visitor's browser, as the page reports it (`X-Device-Id`). Junk is no id. */
export const deviceIdOf = (raw: unknown): string | null => {
  const v = String(raw || '').trim();
  return /^[A-Za-z0-9_-]{8,64}$/.test(v) ? v : null;
};

/** wa.me wants the number with its country code and nothing else. No number: WhatsApp asks who. */
export const waUrl = (phone: string | null | undefined, text: string) => {
  const d = String(phone || '').replace(/\D/g, '');
  return `https://wa.me/${d}?text=${encodeURIComponent(text)}`;
};

/**
 * The app's address, for links put inside messages. The browser's Origin is
 * the app (the API lives on another host), same as the password-reset email;
 * APP_BASE_URL when a request has none.
 */
export function appBase(origin: string | undefined | null): string {
  const o = String(origin || '').trim();
  if (/^https?:\/\/[a-z0-9.-]+(:\d+)?$/i.test(o)) return o;
  return (process.env.APP_BASE_URL || 'https://realestate.delpat.in').replace(/\/+$/, '');
}

const sentOn = (d: Date | string, tz: string) =>
  new Date(d).toLocaleDateString('en-IN', { timeZone: tz, day: 'numeric', month: 'short' });

// ── The firm ────────────────────────────────────────────────────────────────

export interface Firm { id: string; slug: string; name: string; brand: any }

export async function firmBySlug(slug: string): Promise<Firm | null> {
  const s = String(slug || '').toLowerCase();
  if (!/^[a-z0-9-]{1,64}$/.test(s)) return null;
  const [t] = await sql`SELECT id, slug, name, brand_config FROM tenants WHERE slug = ${s} OR id = ${s} LIMIT 1`;
  if (!t) return null;
  return { id: t.id, slug: t.slug || t.id, name: t.name, brand: t.brand_config || {} };
}

/** What a page may show of the firm: name, logo, colour. Same source as the photo link. */
export const firmPublic = (f: Firm) => ({
  name: f.brand.firmName || f.name || '',
  logo: f.brand.logoUrl ? `/pwa/${f.slug}/logo` : '',
  accent: f.brand.primaryColor || null,
});

/** A user who can still receive work: active and not deleted. */
async function activeUser(tenantId: string, id: string | null | undefined): Promise<any | null> {
  if (!id) return null;
  const [u] = await sql`
    SELECT id, name, phone, role FROM users
     WHERE tenant_id = ${tenantId} AND id = ${id} AND deleted_at IS NULL AND status ILIKE 'active' LIMIT 1`;
  return u || null;
}

/** The firm's own number: the reply-to setting, else an active owner's phone. */
async function firmPhone(tenantId: string): Promise<string | null> {
  const s = await sharingOf(tenantId);
  if (s.replyToPhone) return s.replyToPhone;
  const [o] = await sql`
    SELECT phone FROM users WHERE tenant_id = ${tenantId} AND role = 'owner'
       AND deleted_at IS NULL AND status ILIKE 'active' AND coalesce(phone, '') <> ''
     ORDER BY created_at NULLS LAST LIMIT 1`;
  return o?.phone || null;
}

/**
 * WHO A LINK'S BUYER REACHES, worked out when it is used, not when it was sent
 * (§A.1: Rahul's lead moves to Priya → Priya). `recipient` gets the alert;
 * `phone` is where WhatsApp opens: the lead's current holder, else the link's
 * creator, else the firm's reply-to number (else an owner's).
 */
async function whoAnswers(tenantId: string, leadId: string | null, creatorId: string | null) {
  let lead: any = null;
  if (leadId) {
    [lead] = await sql`SELECT id, name, phone, stage, agent_id FROM crm_leads WHERE tenant_id = ${tenantId} AND id = ${leadId} LIMIT 1`;
  }
  const holder = await activeUser(tenantId, lead?.agent_id);
  const creator = await activeUser(tenantId, creatorId);
  const recipient = holder || creator || null;
  const phone = holder?.phone || creator?.phone || (await firmPhone(tenantId));
  return { lead: lead || null, recipient, phone: phone || null };
}

// ── A listing, made public ──────────────────────────────────────────────────

const SHOWN_COLUMNS = sql`id, title, status, deal, locality, project, bhk, subtype, category, carpet_sqft,
  super_builtup_sqft, builtup_sqft, furnishing, furnish_type, bathrooms, facing, possession, society_amenities,
  price_amount, media, in_catalogue, catalogue_slug, config, created_at`;

const isAvailable = (r: any) => /^available$/i.test(String(r.status || 'Available'));

/**
 * The ONLY shape a listing takes on a public page. Built from named columns —
 * never a spread of the row — so a column added later cannot reach a buyer by
 * accident. No unit, tower, floor, owner, notes, key details or description
 * (free text, where a flat number or an owner's name is typed as often as not).
 */
export function publicFlat(r: any, o: { showPrice: boolean; showProject: boolean; loc: any }) {
  const project = o.showProject ? (r.project || r.config?.society || null) : null;
  const kind = [r.bhk, r.subtype].filter(Boolean).join(' ');
  const where = project || r.locality || '';
  const media = (Array.isArray(r.media) ? r.media : []).filter((x: any) => x && x.key).map((x: any) => ({
    key: x.key, kind: x.kind === 'video' ? 'video' : 'photo',
    ...(Number(x.w) > 0 && Number(x.h) > 0 ? { w: Number(x.w), h: Number(x.h) } : {}),
  }));
  const amount = Number(r.price_amount) > 0 ? Number(r.price_amount) : null;
  return {
    id: r.id,
    title: [kind, where].filter(Boolean).join(kind && where ? ' in ' : '') || 'Home',
    config: {
      bhk: r.bhk || null, subtype: r.subtype || null, category: r.category || null,
      carpetSqft: r.carpet_sqft ?? null, superBuiltupSqft: r.super_builtup_sqft ?? null, builtupSqft: r.builtup_sqft ?? null,
      furnishing: r.furnish_type || r.furnishing || null, bathrooms: r.bathrooms || null,
      facing: r.facing || null, possession: r.possession || null,
      amenities: Array.isArray(r.society_amenities) ? r.society_amenities : [],
    },
    deal: r.deal || null,
    locality: r.locality || null,
    ...(project ? { project } : {}),
    ...(o.showPrice && amount ? { price: amount } : {}),
    media,
    available: isAvailable(r),
    ...(r.catalogue_slug && r.in_catalogue ? { slug: r.catalogue_slug } : {}),
  };
}

// ── Links and taps ──────────────────────────────────────────────────────────

export type LinkState = 'active' | 'expired' | 'off' | 'stopped';

export function linkState(l: any, stopped: string | null): LinkState {
  if (l.turned_off_at) return 'off';
  if (stopped && new Date(l.created_at).getTime() <= new Date(stopped).getTime()) return 'stopped';
  if (new Date(l.expires_at).getTime() <= Date.now()) return 'expired';
  return 'active';
}

/** A code → its link, and the tap when the code was a tap's. Null for nothing. */
async function resolveCode(tenantId: string, code: string): Promise<{ link: any; tap: any | null } | null> {
  const c = String(code || '').toLowerCase();
  if (!CODE_RE.test(c)) return null;
  const [link] = await sql`SELECT * FROM crm_share_links WHERE tenant_id = ${tenantId} AND code = ${c} LIMIT 1`;
  if (link) return { link, tap: null };
  const [tap] = await sql`SELECT * FROM crm_share_events WHERE tenant_id = ${tenantId} AND code = ${c} AND kind IN ('interested', 'talk') LIMIT 1`;
  if (!tap || !tap.link_id) return null;
  const [tl] = await sql`SELECT * FROM crm_share_links WHERE tenant_id = ${tenantId} AND id = ${tap.link_id} LIMIT 1`;
  return tl ? { link: tl, tap } : null;
}

/** The lead a device has been attached to, if any. */
async function deviceLead(tenantId: string, deviceId: string | null): Promise<string | null> {
  if (!deviceId) return null;
  const [d] = await sql`SELECT lead_id FROM crm_share_devices WHERE tenant_id = ${tenantId} AND device_id = ${deviceId} LIMIT 1`;
  return d?.lead_id || null;
}

async function recordEvent(tenantId: string, e: {
  linkId: string | null; propertyId?: string | null; kind: string; code?: string | null;
  deviceId?: string | null; leadId?: string | null;
}): Promise<any> {
  const id = rid('sev');
  const [row] = await sql`
    INSERT INTO crm_share_events (id, tenant_id, link_id, property_id, kind, code, device_id, lead_id, created_at)
    VALUES (${id}, ${tenantId}, ${e.linkId}, ${e.propertyId ?? null}, ${e.kind}, ${e.code ?? null},
            ${e.deviceId ?? null}, ${e.leadId ?? null}, ${new Date()})
    RETURNING *`;
  return row;
}

/** The flats of a link, in its order, as rows. A no-recipient link shows catalogue flats only (§A.1). */
async function linkRows(tenantId: string, link: any): Promise<any[]> {
  const ids: string[] = link.property_ids || [];
  if (!ids.length) return [];
  const rows = await sql`SELECT ${SHOWN_COLUMNS} FROM crm_properties WHERE tenant_id = ${tenantId} AND id IN ${sql(ids)}`;
  const byId = new Map((rows as any[]).map(r => [r.id, r]));
  return ids.map(id => byId.get(id)).filter(r => r && (link.lead_id || r.in_catalogue));
}

async function catalogueUrlOf(f: Firm): Promise<string | null> {
  const [hit] = await sql`
    SELECT 1 FROM crm_properties WHERE tenant_id = ${f.id} AND in_catalogue = TRUE AND coalesce(status, 'Available') ILIKE 'available' LIMIT 1`;
  return hit ? `/${f.slug}/homes` : null;
}

/** The one body every unusable code gets. Nothing in it depends on the code. */
async function unavailableBody(f: Firm) {
  return {
    kind: 'link', state: 'unavailable', firm: firmPublic(f), flats: [], showPrice: false,
    cta: { phone: await firmPhone(f.id) }, catalogueUrl: await catalogueUrlOf(f),
  };
}

export interface PublicReq {
  deviceId: string | null;
  userAgent: string | null;
  method: string;
  origin: string | null;
  /** The signed-in user, when the request carries a valid session. */
  user: { id: string; tenant_id: string; role: string } | null;
}

/** A session of THIS firm: the firm's own staff. Their opens are not counted. */
const staffOf = (f: Firm, r: PublicReq) => (r.user && r.user.tenant_id === f.id ? r.user : null);
const counted = (f: Firm, r: PublicReq) => !staffOf(f, r) && !isPreviewFetcher(r.userAgent) && r.method === 'GET';

/**
 * GET /public/s/:tenant/:code — open a link or a tap.
 */
export async function openCode(f: Firm, code: string, r: PublicReq, flatParam?: string | null): Promise<any> {
  const found = await resolveCode(f.id, code);
  const sharing = await sharingOf(f.id);
  const staff = staffOf(f, r);
  if (!found) return { body: await unavailableBody(f), miss: true };
  const { link, tap } = found;
  const state = linkState(link, sharing.stopped);
  const loc = await localeOf(f.id);

  // Who it is known to be: the link's lead, else whoever this browser became.
  const knownLead = link.lead_id || (await deviceLead(f.id, r.deviceId));
  if (counted(f, r)) {
    const propertyId = tap ? (tap.property_id || null)
      : (flatParam && (link.property_ids || []).includes(flatParam) ? flatParam
        : ((link.property_ids || []).length === 1 ? link.property_ids[0] : null));
    if (state === 'active') {
      // Before recording: was this lead here on an earlier day, and not yet today?
      if (link.lead_id) await maybeReturned(f, link).catch(err => console.warn('[Share] returned check failed:', err?.message));
      await recordEvent(f.id, { linkId: link.id, propertyId, kind: 'view', deviceId: r.deviceId, leadId: knownLead });
    } else if (state === 'expired') {
      await recordEvent(f.id, { linkId: link.id, propertyId, kind: 'expired_view', deviceId: r.deviceId, leadId: knownLead });
    }
  }

  let body: any;
  if (state === 'active' || staff) {
    const rows = await linkRows(f.id, link);
    const showPrice = !!link.show_price;
    const flats = (tap?.property_id ? rows.filter(x => x.id === tap.property_id) : rows)
      .map(x => publicFlat(x, { showPrice, showProject: true, loc }));
    const who = await whoAnswers(f.id, link.lead_id, link.created_by);
    body = {
      kind: tap ? 'tap' : 'link', state: state === 'active' ? 'active' : 'unavailable', firm: firmPublic(f), flats, showPrice,
      cta: { phone: who.phone }, catalogueUrl: await catalogueUrlOf(f),
    };
    if (state !== 'active') {
      // Staff on a dead link see its flats (for Send a fresh link); the
      // buyer-facing fields stay as a buyer would get them.
      Object.assign(body, await unavailableBody(f), { flats });
    }
  } else {
    body = await unavailableBody(f);
  }

  if (staff) body.staff = await staffView(f, staff, link, tap, state);
  return { body, miss: false };
}

/** What a signed-in member of the firm gets on top: enough to open Add as lead. */
async function staffView(f: Firm, user: { id: string; role: string }, link: any, tap: any | null, state: LinkState) {
  const leadId = tap?.lead_id || link.lead_id || null;
  let lead: any = null;
  if (leadId) {
    const [l] = await sql`SELECT id, name, phone, agent_id, created_by, stage FROM crm_leads WHERE tenant_id = ${f.id} AND id = ${leadId} LIMIT 1`;
    // An agent sees a lead that is theirs; the desk sees any.
    if (l && (isDeskRole(user.role) || l.agent_id === user.id || l.created_by === user.id)) {
      const holder = l.agent_id ? (await sql`SELECT name FROM users WHERE id = ${l.agent_id} AND tenant_id = ${f.id} LIMIT 1`)[0] : null;
      lead = { id: l.id, name: l.name, phone: l.phone, stage: l.stage, agentId: l.agent_id, holderName: holder?.name || null };
    } else if (l) {
      lead = { id: l.id, visible: false };
    }
  }
  return {
    ...(tap ? { tap: { id: tap.id, code: tap.code, propertyId: tap.property_id, deviceId: tap.device_id, at: tap.created_at, leadId: tap.lead_id || null } } : {}),
    link: {
      id: link.id, code: link.code, state, createdBy: link.created_by, leadId: link.lead_id || null,
      createdAt: link.created_at, expiresAt: link.expires_at, propertyIds: link.property_ids || [], showPrice: !!link.show_price,
    },
    ...(lead ? { lead } : {}),
  };
}

/**
 * A KNOWN LEAD BACK ON THEIR LINK ON A NEW DAY (§A.1b): they opened it on an
 * earlier day, have not opened it yet today, and nobody has been told today.
 * Called before today's view is recorded.
 */
async function maybeReturned(f: Firm, link: any) {
  const tz = (await deskConfigOf(f.id)).timezone;
  const [s] = await sql`
    SELECT
      EXISTS (SELECT 1 FROM crm_share_events WHERE tenant_id = ${f.id} AND link_id = ${link.id} AND kind = 'view' AND created_at < ${firmDayStart(tz)}) AS before,
      EXISTS (SELECT 1 FROM crm_share_events WHERE tenant_id = ${f.id} AND link_id = ${link.id} AND kind = 'view' AND created_at >= ${firmDayStart(tz)}) AS today,
      EXISTS (SELECT 1 FROM notifications WHERE tenant_id = ${f.id} AND type = 'share_returned'
                AND ${link.lead_id} = ANY(record_ids) AND created_at >= ${firmDayStart(tz)}) AS told`;
  if (!s.before || s.today || s.told) return;
  const who = await whoAnswers(f.id, link.lead_id, link.created_by);
  if (!who.lead) return;
  await alert(f.id, who.recipient, {
    type: 'share_returned',
    data: { name: who.lead.name || who.lead.phone, sentOn: sentOn(link.created_at, tz) },
    link: `?screen=leads&lead=${who.lead.id}`,
    record: { kind: 'lead', ids: [who.lead.id] },
  });
}

/** One alert, to a person, or to the desk when nobody can receive it. */
async function alert(tenantId: string, recipient: any | null, n: { type: string; data: any; link: string; record: any }) {
  const input = { ...n, tenantId };
  if (recipient) await notify({ ...input, userId: recipient.id });
  else await notifyRoles(['owner', 'manager'], input);
}

/** The flat's name in an alert: its project and size, the way an agent says it. */
function flatLabel(r: any): string {
  return [r?.project || r?.config?.society || r?.locality, r?.bhk].filter(Boolean).join(' ') || 'a home';
}

/**
 * POST /public/s/:tenant/:code/interested {propertyId}
 * The tap is recorded before WhatsApp opens: a row with its own code, which is
 * the ref link in the buyer's message.
 */
export async function interested(f: Firm, code: string, propertyId: string, r: PublicReq): Promise<{ waUrl: string } | null> {
  const found = await resolveCode(f.id, code);
  if (!found) return null;
  const { link } = found;
  const sharing = await sharingOf(f.id);
  if (linkState(link, sharing.stopped) !== 'active') return null;
  const rows = await linkRows(f.id, link);
  const flat = rows.find(x => x.id === propertyId);
  if (!flat) return null;
  if (!isAvailable(flat)) throw new ShareError(409, 'not_available', 'This home has been taken.');

  const leadId = link.lead_id || (await deviceLead(f.id, r.deviceId));
  const tapCode = await freshCode(f.id);
  const tap = await recordEvent(f.id, { linkId: link.id, propertyId, kind: 'interested', code: tapCode, deviceId: r.deviceId, leadId });
  const who = await whoAnswers(f.id, leadId, link.created_by);
  const tz = (await deskConfigOf(f.id)).timezone;

  // ONE ALERT PER FLAT PER LINK PER DAY (§A.1). Five taps on the same flat are
  // one buyer being keen, not five pieces of work. Staff trying their own link
  // raise nothing.
  const [{ n }] = await sql`
    SELECT count(*)::int AS n FROM crm_share_events
     WHERE tenant_id = ${f.id} AND link_id = ${link.id} AND property_id = ${propertyId}
       AND kind = 'interested' AND created_at >= ${firmDayStart(tz)}`;
  if (n === 1 && !staffOf(f, r)) {
    // Someone on Rahul's link: the tap came from a browser other than the
    // first one that opened it — forwarded, most likely.
    let someoneOn = false;
    if (link.lead_id && r.deviceId) {
      const [first] = await sql`
        SELECT device_id FROM crm_share_events WHERE tenant_id = ${f.id} AND link_id = ${link.id} AND device_id IS NOT NULL
         ORDER BY created_at ASC LIMIT 1`;
      someoneOn = !!first && first.device_id !== r.deviceId;
    }
    const lead = who.lead;
    await alert(f.id, who.recipient, {
      type: 'share_interested',
      data: {
        name: lead ? (lead.name || lead.phone) : null, someoneOn, flat: flatLabel(flat),
        sentOn: sentOn(link.created_at, tz),
        previousStage: lead && String(lead.stage || '').toLowerCase() === REJECTED_STATUS.toLowerCase() ? lead.stage : null,
      },
      link: lead ? `?screen=leads&lead=${lead.id}&tap=${tapCode}` : `?tap=${tapCode}`,
      record: lead ? { kind: 'lead', ids: [lead.id] } : { kind: 'share_tap', ids: [tap.id] },
    });
  }
  const text = `Hi, I'm interested in this home: ${appBase(r.origin)}/${f.slug}/${tapCode}`;
  return { waUrl: waUrl(who.phone, text) };
}

/**
 * POST /public/s/:tenant/:code/talk — Talk to us. On an expired link it tells
 * the holder (§A.1: an expired link is a signal, not a dead end) and opens
 * WhatsApp to them. On anything else unusable, the firm's own number, and no
 * alert: an agent who turned a link off meant it.
 */
export async function talk(f: Firm, code: string, r: PublicReq): Promise<{ waUrl: string }> {
  const found = await resolveCode(f.id, code);
  const sharing = await sharingOf(f.id);
  const general = async () => ({ waUrl: waUrl(await firmPhone(f.id), "Hi, I'm looking for a home.") });
  if (!found) return general();
  const { link } = found;
  const state = linkState(link, sharing.stopped);
  if (state === 'off' || state === 'stopped') return general();
  const leadId = link.lead_id || (await deviceLead(f.id, r.deviceId));
  const who = await whoAnswers(f.id, leadId, link.created_by);
  const url = `${appBase(r.origin)}/${f.slug}/${link.code}`;
  if (state === 'active') return { waUrl: waUrl(who.phone, `Hi, about the homes you sent: ${url}`) };

  // Like a tap, the press gets its own code: the ref in the buyer's message and
  // the handle Add as lead works from when nobody is on the link yet.
  const talkCode = await freshCode(f.id);
  const ev = await recordEvent(f.id, { linkId: link.id, kind: 'talk', code: talkCode, deviceId: r.deviceId, leadId });
  const tz = (await deskConfigOf(f.id)).timezone;
  // One alert per link per day, however many times the button is pressed.
  const [{ n }] = await sql`
    SELECT count(*)::int AS n FROM crm_share_events
     WHERE tenant_id = ${f.id} AND link_id = ${link.id} AND kind = 'talk' AND created_at >= ${firmDayStart(tz)}`;
  if (n === 1 && !staffOf(f, r)) {
    const lead = who.lead;
    await alert(f.id, who.recipient, {
      type: 'share_expired_open',
      data: { name: lead ? (lead.name || lead.phone) : null, sentOn: sentOn(link.created_at, tz), n: (link.property_ids || []).length },
      link: lead ? `?screen=leads&lead=${lead.id}&tap=${talkCode}` : `?tap=${talkCode}`,
      record: lead ? { kind: 'lead', ids: [lead.id] } : { kind: 'share_tap', ids: [ev.id] },
    });
  }
  return { waUrl: waUrl(who.phone, `Hi, I'd like to see these homes again: ${appBase(r.origin)}/${f.slug}/${talkCode}`) };
}

// ── The catalogue ───────────────────────────────────────────────────────────

const CATALOGUE_WHERE = (tenantId: string) =>
  sql`tenant_id = ${tenantId} AND in_catalogue = TRUE AND coalesce(status, 'Available') ILIKE 'available'`;
const HAS_PHOTO = sql`EXISTS (SELECT 1 FROM jsonb_array_elements(coalesce(media, '[]'::jsonb)) m WHERE m->>'kind' IS DISTINCT FROM 'video')`;

/** GET /public/catalogue/:tenant?deal=&config=&locality=&page= */
export async function catalogueList(f: Firm, q: { deal?: string; config?: string; locality?: string; page?: number; limit?: number }, r: PublicReq) {
  const sharing = await sharingOf(f.id);
  const loc = await localeOf(f.id);
  const limit = Math.min(Math.max(Number(q.limit) || 24, 1), 60);
  const page = Math.max(Number(q.page) || 1, 1);
  const where = [CATALOGUE_WHERE(f.id)];
  if (q.deal) where.push(sql`lower(deal) = ${q.deal.toLowerCase()}`);
  if (q.config) where.push(sql`lower(bhk) LIKE ${q.config.toLowerCase().replace(/[\\%_]/g, ch => '\\' + ch) + '%'}`);
  if (q.locality) where.push(sql`lower(locality) = ${q.locality.toLowerCase()}`);
  const clause = where.reduce((a, c) => sql`${a} AND ${c}`);
  const [rows, [{ n }], facets] = await Promise.all([
    // Flats with no photos are listed last (§A.4).
    sql`SELECT ${SHOWN_COLUMNS} FROM crm_properties WHERE ${clause}
         ORDER BY ${HAS_PHOTO} DESC, created_at DESC LIMIT ${limit} OFFSET ${(page - 1) * limit}`,
    sql`SELECT count(*)::int AS n FROM crm_properties WHERE ${clause}`,
    sql`SELECT array_remove(array_agg(DISTINCT deal), NULL) AS deals,
               array_remove(array_agg(DISTINCT bhk), NULL) AS configs,
               array_remove(array_agg(DISTINCT locality), NULL) AS localities
          FROM crm_properties WHERE ${CATALOGUE_WHERE(f.id)}`,
  ]);
  if (counted(f, r)) await recordEvent(f.id, { linkId: null, kind: 'view', deviceId: r.deviceId, leadId: await deviceLead(f.id, r.deviceId) });
  return {
    firm: firmPublic(f), showPrice: !!sharing.showPriceOnCatalogue,
    flats: (rows as any[]).map(x => publicFlat(x, { showPrice: !!sharing.showPriceOnCatalogue, showProject: sharing.catalogueShowsProject !== false, loc })),
    total: n, page, limit,
    facets: { deal: (facets[0]?.deals || []).sort(), config: (facets[0]?.configs || []).sort(), locality: (facets[0]?.localities || []).sort() },
  };
}

/** GET /public/catalogue/:tenant/:slug — one flat, or null (the same 404 whatever the reason). */
export async function catalogueFlat(f: Firm, slug: string, r: PublicReq) {
  const s = String(slug || '').toLowerCase();
  if (!/^[a-z0-9-]{3,80}$/.test(s)) return null;
  const [row] = await sql`SELECT ${SHOWN_COLUMNS} FROM crm_properties WHERE ${CATALOGUE_WHERE(f.id)} AND catalogue_slug = ${s} LIMIT 1`;
  if (!row) return null;
  const sharing = await sharingOf(f.id);
  if (counted(f, r)) await recordEvent(f.id, { linkId: null, propertyId: row.id, kind: 'view', deviceId: r.deviceId, leadId: await deviceLead(f.id, r.deviceId) });
  return {
    firm: firmPublic(f), showPrice: !!sharing.showPriceOnCatalogue,
    flat: publicFlat(row, { showPrice: !!sharing.showPriceOnCatalogue, showProject: sharing.catalogueShowsProject !== false, loc: await localeOf(f.id) }),
    catalogueUrl: `/${f.slug}/homes`,
  };
}

/**
 * POST /public/catalogue/:tenant/enquiry {name, phone, propertyId?, message?}
 * Through the portal path (ingestion.ts landEnquiry), source "Catalogue": the
 * same duplicate-by-phone, merge, routing and alerts as every other enquiry.
 * The answer never says whether the number was already a lead.
 */
export async function catalogueEnquiry(f: Firm, input: { name?: string; phone?: string; propertyId?: string; message?: string }, r: PublicReq) {
  const loc = await localeOf(f.id);
  const digits = String(input.phone || '').replace(/\D/g, '');
  if (digits.length < 10 || digits.length > 13) throw new ShareError(400, 'phone_required', 'A 10-digit mobile number is needed.');
  const phone = normalizePhone(digits, loc);
  const name = String(input.name || '').trim().slice(0, 80) || null;
  const message = String(input.message || '').trim().slice(0, 1000) || null;
  let flat: any = null;
  if (input.propertyId) {
    [flat] = await sql`SELECT ${SHOWN_COLUMNS} FROM crm_properties WHERE ${CATALOGUE_WHERE(f.id)} AND id = ${String(input.propertyId)} LIMIT 1`;
  }
  const sharing = await sharingOf(f.id);
  const flatName = flat ? publicFlat(flat, { showPrice: false, showProject: sharing.catalogueShowsProject !== false, loc }).title : null;
  const lead = { name, phone, source: 'Catalogue', req: { ...(message ? { notes: message } : {}), ...(flatName ? { interest: flatName } : {}) } };
  const out = await landEnquiry({
    tenantId: f.id, provider: 'Catalogue', integrationId: null, inboxId: null,
    lead, body: { name, phone, propertyId: flat?.id || null, message },
  });
  const leadId = out.leadId || null;
  await recordEvent(f.id, { linkId: null, propertyId: flat?.id || null, kind: 'enquiry', deviceId: r.deviceId, leadId });
  if (leadId) {
    if (flat) await addToShortlist(f.id, leadId, [flat.id]);
    if (r.deviceId) await attachDevice(f.id, r.deviceId, leadId);
  }
  return { ok: true };
}

/** A device now belongs to a lead: its views, before and after, join it. Never moves a device off another lead. */
async function attachDevice(tenantId: string, deviceId: string, leadId: string): Promise<boolean> {
  const res = await sql`
    INSERT INTO crm_share_devices (tenant_id, device_id, lead_id, attached_at) VALUES (${tenantId}, ${deviceId}, ${leadId}, NOW())
    ON CONFLICT (tenant_id, device_id) DO NOTHING`;
  const [d] = await sql`SELECT lead_id FROM crm_share_devices WHERE tenant_id = ${tenantId} AND device_id = ${deviceId}`;
  void res;
  if (d?.lead_id !== leadId) return false;
  await sql`UPDATE crm_share_events SET lead_id = ${leadId} WHERE tenant_id = ${tenantId} AND device_id = ${deviceId} AND lead_id IS NULL`;
  return true;
}

/** The flats onto the lead's shortlist, both places it is kept. */
async function addToShortlist(tenantId: string, leadId: string, propertyIds: string[]) {
  for (const pid of propertyIds) {
    await sql`
      INSERT INTO lead_shortlist (id, tenant_id, lead_id, property_id)
      VALUES (${`shl_${leadId}_${pid}`}, ${tenantId}, ${leadId}, ${pid})
      ON CONFLICT (lead_id, property_id) DO NOTHING`;
  }
  await sql`
    UPDATE crm_leads SET shortlist = (
      SELECT coalesce(jsonb_agg(DISTINCT x), '[]'::jsonb)
        FROM jsonb_array_elements_text(coalesce(shortlist, '[]'::jsonb) || ${sql.json(propertyIds)}::jsonb) AS x)
     WHERE tenant_id = ${tenantId} AND id = ${leadId}`;
}

// ── Old photo links (§A.4) ──────────────────────────────────────────────────

/**
 * A photo link already sent to a buyer, resolved on the fly. A flat in the
 * catalogue → its catalogue page. Anything else → "no longer available" and
 * the catalogue. No stored row is rewritten.
 */
export async function resolveOldPhotoLink(f: Firm, propertyId: string) {
  const [row] = await sql`SELECT ${SHOWN_COLUMNS} FROM crm_properties WHERE ${CATALOGUE_WHERE(f.id)} AND id = ${propertyId} LIMIT 1`;
  if (row?.catalogue_slug) return { redirect: `/${f.slug}/homes/${row.catalogue_slug}`, row };
  return { unavailable: true, firm: firmPublic(f), catalogueUrl: await catalogueUrlOf(f), row: null };
}

// ── Signed in ───────────────────────────────────────────────────────────────

function me() {
  const c = getContext();
  if (!c?.userId || !c.tenantId) throw new ShareError(401, 'auth_required');
  return { tenantId: c.tenantId, userId: c.userId, role: c.role || 'agent', ip: c.ip || null, userAgent: c.userAgent || null };
}
const ctxOf = (m: ReturnType<typeof me>): ActorCtx => ({ actorType: 'user', actorId: m.userId, actorLabel: null, ip: m.ip, userAgent: m.userAgent });

/**
 * A NUMBER → THE LEAD IT IS, for Send to a new person and Add as lead.
 * Matched by phone (findLeadByPhone, the one rule). The caller's own lead, or
 * any lead for the desk, is used. A lead nobody active holds is given to the
 * caller. Someone else's lead is not duplicated: 409 lead_held_by, and the
 * holder is told.
 */
async function leadForNumber(m: ReturnType<typeof me>, phoneRaw: string, name: string | null, source: string): Promise<{ lead: any; created: boolean }> {
  const digits = String(phoneRaw || '').replace(/\D/g, '');
  if (digits.length < 10 || digits.length > 13) throw new ShareError(400, 'phone_required', 'A 10-digit mobile number is needed.');
  const phone = normalizePhone(digits, await localeOf(m.tenantId));
  const existing = await findLeadByPhone(phone!, m.tenantId);
  if (existing) {
    if (isDeskRole(m.role) || existing.agent_id === m.userId || existing.created_by === m.userId) return { lead: existing, created: false };
    const holder = await activeUser(m.tenantId, existing.agent_id);
    if (holder) {
      const [sender] = await sql`SELECT name FROM users WHERE tenant_id = ${m.tenantId} AND id = ${m.userId} LIMIT 1`;
      await notify({
        tenantId: m.tenantId, userId: holder.id, type: 'share_number_held',
        data: { name: existing.name || existing.phone, sender: sender?.name || null },
        link: `?screen=leads&lead=${existing.id}`, record: { kind: 'lead', ids: [existing.id] },
      }).catch(() => {});
      throw new ShareError(409, 'lead_held_by', 'This number is already a lead with someone else.', { holderName: holder.name || null });
    }
    // Nobody active holds it: it becomes the caller's, as an assignment (updateLead records it).
    await runWithContext({ tenantId: m.tenantId, userId: m.userId, role: 'system', actorType: 'system', actorLabel: null, ip: m.ip, userAgent: m.userAgent }, () =>
      updateLead(existing.id, { agentId: m.userId }, ctxOf(m)));
    const [fresh] = await sql`SELECT * FROM crm_leads WHERE tenant_id = ${m.tenantId} AND id = ${existing.id}`;
    return { lead: fresh, created: false };
  }
  // The normal lead-creation path. The requirement stays empty: what they were
  // sent is on the shortlist, not a guess at what they want (CLAUDE.md §3.1).
  const created = await createLead({ name: name || null, phone, source, agentId: m.userId }, ctxOf(m));
  const [row] = await sql`SELECT * FROM crm_leads WHERE tenant_id = ${m.tenantId} AND id = ${created.id}`;
  return { lead: row, created: true };
}

/** May this person act on this lead's shortlist? The existing rule (permissions.ts). */
function assertMayShare(m: ReturnType<typeof me>, lead: any) {
  try {
    assertLeadWrite(m.role, m.userId, { agentId: lead.agent_id, createdBy: lead.created_by, name: lead.name }, { shortlist: [] });
  } catch (e: any) {
    throw new ShareError(403, 'forbidden', e?.message || 'This lead belongs to another team member.');
  }
}

/**
 * POST /share-links {leadId? | newPerson{name,phone}, propertyIds, showPrice?}
 */
export async function createShareLink(input: any, origin: string | null) {
  const m = me();
  const [sender] = await sql`SELECT id, name, phone FROM users WHERE tenant_id = ${m.tenantId} AND id = ${m.userId} AND deleted_at IS NULL LIMIT 1`;
  if (!sender) throw new ShareError(401, 'auth_required');
  // Senders need a number (Om, §A.4): the buyer's WhatsApp opens to it.
  if (String(sender.phone || '').replace(/\D/g, '').length < 10) throw new ShareError(422, 'sender_phone_missing', 'Add your mobile number first.');

  const ids: string[] = [...new Set((Array.isArray(input?.propertyIds) ? input.propertyIds : []).map(String).filter(Boolean))] as string[];
  if (!ids.length) throw new ShareError(400, 'flats_required', 'Pick at least one home.');
  if (ids.length > 30) throw new ShareError(400, 'too_many_flats', 'A link can carry up to 30 homes.');
  const rows = await sql`SELECT id, status, in_catalogue FROM crm_properties WHERE tenant_id = ${m.tenantId} AND id IN ${sql(ids)}`;
  const byId = new Map((rows as any[]).map(r => [r.id, r]));
  const missing = ids.filter(id => !byId.has(id));
  if (missing.length) throw new ShareError(422, 'flats_not_found', 'Some of these homes no longer exist.', { ids: missing });
  const taken = ids.filter(id => !isAvailable(byId.get(id)));
  if (taken.length) throw new ShareError(422, 'flats_not_available', 'Some of these homes are no longer available.', { ids: taken });

  let lead: any = null;
  let createdLead = false;
  if (input?.leadId) {
    [lead] = await sql`SELECT * FROM crm_leads WHERE tenant_id = ${m.tenantId} AND id = ${String(input.leadId)} LIMIT 1`;
    if (!lead) throw new ShareError(404, 'lead_not_found', 'That lead no longer exists.');
    assertMayShare(m, lead);
  } else if (input?.newPerson) {
    const r = await leadForNumber(m, input.newPerson.phone, String(input.newPerson.name || '').trim() || null, 'Shared link');
    lead = r.lead; createdLead = r.created;
    assertMayShare(m, lead);
  } else {
    // No recipient: it can reach anyone, so it carries catalogue flats only (§A.1).
    const priv = ids.filter(id => !byId.get(id).in_catalogue);
    if (priv.length) throw new ShareError(422, 'private_flats_without_recipient', 'Homes not in the catalogue can only be sent to a named buyer.', { ids: priv });
  }

  const sharing = await sharingOf(m.tenantId);
  const showPrice = typeof input?.showPrice === 'boolean' ? input.showPrice : !!sharing.showPriceOnCatalogue;
  const code = await freshCode(m.tenantId);
  const id = rid('shl');
  const days = sharing.linkExpiryDays || 15;
  const [link] = await sql`
    INSERT INTO crm_share_links (id, tenant_id, code, created_by, lead_id, property_ids, show_price, created_at, expires_at)
    VALUES (${id}, ${m.tenantId}, ${code}, ${m.userId}, ${lead?.id || null}, ${ids}, ${showPrice}, NOW(), NOW() + (${days}::text || ' days')::interval)
    RETURNING *`;

  const url = `${appBase(origin)}/${(await firmSlug(m.tenantId))}/${code}`;
  if (lead) {
    await addToShortlist(m.tenantId, lead.id, ids);
    // A WhatsApp sent is contact made: it closes "expired link" and "came back"
    // alerts on this lead the way any logged message does (leadSegments.ts).
    await addTimelineEvent({
      record_id: lead.id, type: 'whatsapp', title: 'WhatsApp',
      description: `Sent ${ids.length === 1 ? '1 home' : `${ids.length} homes`}`,
      author: m.userId, metadata: { shareLinkId: link.id, code, propertyIds: ids },
    });
  }
  audit({
    tenant_id: m.tenantId, actor_type: 'user', actor_id: m.userId, actor_label: null,
    action: 'share_link.create', target_type: 'share_link', target_id: link.id,
    summary: `Shared ${ids.length} home${ids.length === 1 ? '' : 's'}${lead ? '' : ' without a recipient'}`,
    metadata: { code, leadId: lead?.id || null, propertyIds: ids, showPrice, createdLead }, ip: m.ip, user_agent: m.userAgent,
  });
  const text = ids.length === 1 ? `Here is a home you may like: ${url}` : `Here are ${ids.length} homes you may like: ${url}`;
  return {
    link: { id: link.id, code, url, expiresAt: link.expires_at, showPrice },
    lead: lead ? { id: lead.id, name: lead.name, created: createdLead } : null,
    waUrl: waUrl(lead?.phone || null, text),
  };
}

async function firmSlug(tenantId: string): Promise<string> {
  const [t] = await sql`SELECT slug, id FROM tenants WHERE id = ${tenantId} LIMIT 1`;
  return t?.slug || tenantId;
}

/** The counts on a set of links, one query. */
async function linkCounts(tenantId: string, linkIds: string[]) {
  if (!linkIds.length) return new Map<string, any>();
  const rows = await sql`
    SELECT link_id,
           count(*) FILTER (WHERE kind IN ('view', 'expired_view'))::int AS views,
           count(DISTINCT device_id) FILTER (WHERE kind IN ('view', 'expired_view', 'interested'))::int AS devices,
           count(*) FILTER (WHERE kind = 'interested')::int AS interested,
           max(created_at) FILTER (WHERE kind IN ('view', 'expired_view')) AS last_opened
      FROM crm_share_events WHERE tenant_id = ${tenantId} AND link_id IN ${sql(linkIds)}
     GROUP BY link_id`;
  return new Map((rows as any[]).map(r => [r.link_id, r]));
}

/** GET /share-links/mine?page=&limit= — the links I made that are not turned off, newest first. */
export async function myLinks(q: { page?: number; limit?: number }, origin: string | null) {
  const m = me();
  const limit = Math.min(Math.max(Number(q.limit) || 30, 1), 100);
  const page = Math.max(Number(q.page) || 1, 1);
  const where = sql`l.tenant_id = ${m.tenantId} AND l.created_by = ${m.userId} AND l.turned_off_at IS NULL`;
  const [rows, [{ n }]] = await Promise.all([
    sql`SELECT l.*, ld.name AS lead_name, ld.phone AS lead_phone FROM crm_share_links l
          LEFT JOIN crm_leads ld ON ld.id = l.lead_id AND ld.tenant_id = l.tenant_id
         WHERE ${where} ORDER BY l.created_at DESC LIMIT ${limit} OFFSET ${(page - 1) * limit}`,
    sql`SELECT count(*)::int AS n FROM crm_share_links l WHERE ${where}`,
  ]);
  const sharing = await sharingOf(m.tenantId);
  const counts = await linkCounts(m.tenantId, (rows as any[]).map(r => r.id));
  const allIds = [...new Set((rows as any[]).flatMap(r => r.property_ids || []))];
  const props = allIds.length
    ? await sql`SELECT id, project, locality, bhk, subtype, status, config FROM crm_properties WHERE tenant_id = ${m.tenantId} AND id IN ${sql(allIds)}`
    : [];
  const pById = new Map((props as any[]).map(p => [p.id, p]));
  const base = `${appBase(origin)}/${await firmSlug(m.tenantId)}`;
  return {
    data: (rows as any[]).map(l => {
      const c = counts.get(l.id) || {};
      return {
        id: l.id, code: l.code, url: `${base}/${l.code}`, createdAt: l.created_at, expiresAt: l.expires_at,
        state: linkState(l, sharing.stopped), showPrice: !!l.show_price,
        lead: l.lead_id ? { id: l.lead_id, name: l.lead_name || l.lead_phone || null } : null,
        flats: (l.property_ids || []).map((id: string) => {
          const p = pById.get(id);
          return p ? { id, title: flatLabel(p), available: isAvailable(p) } : { id, title: null, available: false };
        }),
        views: c.views || 0, devices: c.devices || 0, interested: c.interested || 0, lastOpenedAt: c.last_opened || null,
      };
    }),
    total: n, page, limit,
  };
}

/** POST /share-links/:id/off — the creator, or an owner. Turning off and deleting are the same thing. */
export async function turnOff(id: string) {
  const m = me();
  const [l] = await sql`SELECT * FROM crm_share_links WHERE tenant_id = ${m.tenantId} AND id = ${id} LIMIT 1`;
  if (!l) throw new ShareError(404, 'not_found');
  if (l.created_by !== m.userId && m.role !== 'owner') throw new ShareError(403, 'forbidden', 'Only the person who sent it, or an owner, can turn it off.');
  if (!l.turned_off_at) {
    await sql`UPDATE crm_share_links SET turned_off_at = NOW(), turned_off_by = ${m.userId} WHERE tenant_id = ${m.tenantId} AND id = ${id}`;
    audit({
      tenant_id: m.tenantId, actor_type: 'user', actor_id: m.userId, actor_label: null,
      action: 'share_link.off', target_type: 'share_link', target_id: id, summary: `Shared link ${l.code} turned off`,
      metadata: { code: l.code }, ip: m.ip, user_agent: m.userAgent,
    });
  }
  return { ok: true };
}

/**
 * POST /share-links/:id/attach {leadId} — a link sent to someone who was not
 * yet a lead (§A.1c I3) now belongs to them: the link is bound, its events and
 * the devices seen on it move onto the lead, its flats onto the shortlist.
 */
export async function attachLink(id: string, leadId: string) {
  const m = me();
  const [l] = await sql`SELECT * FROM crm_share_links WHERE tenant_id = ${m.tenantId} AND id = ${id} LIMIT 1`;
  if (!l) throw new ShareError(404, 'not_found');
  if (l.created_by !== m.userId && !isDeskRole(m.role)) throw new ShareError(403, 'forbidden', 'Only the person who sent it can attach it.');
  if (l.lead_id && l.lead_id !== leadId) throw new ShareError(409, 'link_has_lead', 'This link already belongs to a lead.');
  const [lead] = await sql`SELECT * FROM crm_leads WHERE tenant_id = ${m.tenantId} AND id = ${String(leadId || '')} LIMIT 1`;
  if (!lead) throw new ShareError(404, 'lead_not_found', 'That lead no longer exists.');
  assertMayShare(m, lead);
  await sql`UPDATE crm_share_links SET lead_id = ${lead.id} WHERE tenant_id = ${m.tenantId} AND id = ${id}`;
  const moved = await sql`UPDATE crm_share_events SET lead_id = ${lead.id} WHERE tenant_id = ${m.tenantId} AND link_id = ${id} AND (lead_id IS NULL OR lead_id <> ${lead.id})`;
  const devices = await sql`SELECT DISTINCT device_id FROM crm_share_events WHERE tenant_id = ${m.tenantId} AND link_id = ${id} AND device_id IS NOT NULL`;
  let attached = 0;
  for (const d of devices as any[]) if (await attachDevice(m.tenantId, d.device_id, lead.id)) attached++;
  await addToShortlist(m.tenantId, lead.id, l.property_ids || []);
  await addTimelineEvent({
    record_id: lead.id, type: 'share', title: 'Shared link',
    description: `Link sent ${sentOn(l.created_at, (await deskConfigOf(m.tenantId)).timezone)} attached`,
    author: m.userId, metadata: { shareLinkId: id, code: l.code },
  });
  audit({
    tenant_id: m.tenantId, actor_type: 'user', actor_id: m.userId, actor_label: null,
    action: 'share_link.attach', target_type: 'share_link', target_id: id, summary: `Shared link ${l.code} attached to a lead`,
    metadata: { leadId: lead.id, events: moved.count, devices: attached }, ip: m.ip, user_agent: m.userAgent,
  });
  return { ok: true, events: moved.count, devices: attached };
}

/**
 * GET /leads/:id/shares — per flat: when it was first sent, opens, last opened,
 * interested taps, devices, and the latest link carrying it. Opens of a whole
 * link count for every flat on it; an open of one flat counts for that flat.
 */
export async function leadShares(leadId: string, origin: string | null) {
  const m = me();
  const [lead] = await sql`SELECT id, agent_id, created_by FROM crm_leads WHERE tenant_id = ${m.tenantId} AND id = ${leadId} LIMIT 1`;
  if (!lead) throw new ShareError(404, 'not_found');
  // Same visibility as the lead itself (store.ts leadScope).
  if (m.role === 'agent' && lead.agent_id !== m.userId && lead.created_by !== m.userId) throw new ShareError(404, 'not_found');
  const sharing = await sharingOf(m.tenantId);
  const links = await sql`SELECT * FROM crm_share_links WHERE tenant_id = ${m.tenantId} AND lead_id = ${leadId} ORDER BY created_at ASC`;
  const events = await sql`
    SELECT e.*, l.property_ids AS link_props FROM crm_share_events e
      LEFT JOIN crm_share_links l ON l.id = e.link_id AND l.tenant_id = e.tenant_id
     WHERE e.tenant_id = ${m.tenantId} AND (e.lead_id = ${leadId} OR e.link_id IN (SELECT id FROM crm_share_links WHERE tenant_id = ${m.tenantId} AND lead_id = ${leadId}))`;
  const base = `${appBase(origin)}/${await firmSlug(m.tenantId)}`;
  const flats = new Map<string, any>();
  const slot = (pid: string) => {
    if (!flats.has(pid)) flats.set(pid, { propertyId: pid, sentAt: null, opens: 0, lastOpenedAt: null, interested: 0, enquiries: 0, devices: new Set<string>(), link: null });
    return flats.get(pid);
  };
  for (const l of links as any[]) {
    for (const pid of l.property_ids || []) {
      const s = slot(pid);
      if (!s.sentAt) s.sentAt = l.created_at;
      s.link = { id: l.id, code: l.code, url: `${base}/${l.code}`, state: linkState(l, sharing.stopped), expiresAt: l.expires_at };
    }
  }
  for (const e of events as any[]) {
    const targets: string[] = e.property_id ? [e.property_id] : (e.link_props || []);
    for (const pid of targets) {
      const s = slot(pid);
      if (e.kind === 'view' || e.kind === 'expired_view') {
        s.opens++;
        if (!s.lastOpenedAt || new Date(e.created_at) > new Date(s.lastOpenedAt)) s.lastOpenedAt = e.created_at;
      }
      if (e.kind === 'interested') s.interested++;
      if (e.kind === 'enquiry') s.enquiries++;
      if (e.device_id) s.devices.add(e.device_id);
    }
  }
  const ids = [...flats.keys()];
  const props = ids.length ? await sql`SELECT id, project, locality, bhk, status, config FROM crm_properties WHERE tenant_id = ${m.tenantId} AND id IN ${sql(ids)}` : [];
  const pById = new Map((props as any[]).map(p => [p.id, p]));
  return [...flats.values()].map(s => ({
    ...s, devices: s.devices.size,
    title: pById.has(s.propertyId) ? flatLabel(pById.get(s.propertyId)) : null,
    available: pById.has(s.propertyId) ? isAvailable(pById.get(s.propertyId)) : false,
  })).sort((a, b) => new Date(b.lastOpenedAt || b.sentAt || 0).getTime() - new Date(a.lastOpenedAt || a.sentAt || 0).getTime());
}

/**
 * POST /share-taps/:code/lead {phone, name?} | {leadId} — Add as lead from a
 * tap (§A.1d). Creates or matches the lead, puts the tap and its browser on
 * it (that browser's earlier and later views join the lead) and the flat on
 * its shortlist. A group link is not bound to the person: the next tap on it
 * may be somebody else.
 */
export async function tapToLead(code: string, input: any) {
  const m = me();
  const c = String(code || '').toLowerCase();
  if (!CODE_RE.test(c)) throw new ShareError(404, 'not_found');
  const [tap] = await sql`SELECT * FROM crm_share_events WHERE tenant_id = ${m.tenantId} AND code = ${c} AND kind IN ('interested', 'talk') LIMIT 1`;
  if (!tap) throw new ShareError(404, 'not_found');
  let lead: any; let created = false;
  if (input?.leadId) {
    [lead] = await sql`SELECT * FROM crm_leads WHERE tenant_id = ${m.tenantId} AND id = ${String(input.leadId)} LIMIT 1`;
    if (!lead) throw new ShareError(404, 'lead_not_found', 'That lead no longer exists.');
  } else {
    const r = await leadForNumber(m, input?.phone, String(input?.name || '').trim() || null, 'Shared link');
    lead = r.lead; created = r.created;
  }
  assertMayShare(m, lead);
  if (tap.lead_id && tap.lead_id !== lead.id) throw new ShareError(409, 'tap_has_lead', 'This tap already belongs to another lead.');
  await sql`UPDATE crm_share_events SET lead_id = ${lead.id} WHERE tenant_id = ${m.tenantId} AND id = ${tap.id}`;
  let deviceAttached = false;
  if (tap.device_id) deviceAttached = await attachDevice(m.tenantId, tap.device_id, lead.id);
  const [link] = tap.link_id ? await sql`SELECT code, created_at, property_ids FROM crm_share_links WHERE tenant_id = ${m.tenantId} AND id = ${tap.link_id}` : [null];
  const flatIds = tap.property_id ? [tap.property_id] : (link?.property_ids || []);
  if (flatIds.length) await addToShortlist(m.tenantId, lead.id, flatIds);
  const [p] = tap.property_id ? await sql`SELECT project, locality, bhk, config FROM crm_properties WHERE tenant_id = ${m.tenantId} AND id = ${tap.property_id}` : [null];
  const tz = (await deskConfigOf(m.tenantId)).timezone;
  await addTimelineEvent({
    record_id: lead.id, type: 'share', title: tap.kind === 'talk' ? 'Asked about an expired link' : 'Interested',
    description: [tap.kind === 'talk' ? `Asked about ${flatIds.length} home${flatIds.length === 1 ? '' : 's'}` : `Interested in ${flatLabel(p)}`, link && `from the link sent ${sentOn(link.created_at, tz)}`].filter(Boolean).join(' · '),
    author: m.userId, metadata: { tapCode: c, shareLinkId: tap.link_id, propertyId: tap.property_id },
  });
  audit({
    tenant_id: m.tenantId, actor_type: 'user', actor_id: m.userId, actor_label: null,
    action: 'share_tap.lead', target_type: 'lead', target_id: lead.id, summary: `Interested tap ${c} added to a lead`,
    metadata: { tapId: tap.id, created, deviceAttached }, ip: m.ip, user_agent: m.userAgent,
  });
  return { lead: { id: lead.id, name: lead.name, created }, matched: !created, deviceAttached };
}

/** Exported for the link-preview cards (routes/public.ts). */
export { resolveCode, linkRows, firmPhone, catalogueUrlOf, SHOWN_COLUMNS, CATALOGUE_WHERE };
