/**
 * ============================================================================
 * THE THREE BUYER FORMS (docs/specs/listing-pages.md §A.6)
 * ============================================================================
 * Who: a buyer on a phone, on a shared link or the firm's catalogue, with one
 * thumb — a name and a number, nothing else. And the agent who must act on it
 * between calls.
 *
 *   Call me back          a call booked on the lead: now inside the firm's
 *                         working hours, else at the next opening
 *   Book a visit          a REQUESTED visit, a slot inside working hours; the
 *                         holder confirms it into a booked site visit
 *   New homes like these  the ask (deal, size, place) saved on the lead; the
 *                         holder hears when a matching home enters the
 *                         catalogue or becomes Available, once a day at most
 *
 * WHO IT REACHES: a link bound to a buyer → that lead (the link says who it
 * is; the number typed is recorded, not trusted). Otherwise through the one
 * enquiry path, landEnquiry's UNVERIFIED branch: an existing lead with that
 * number is told and never edited; a new number becomes a lead — the link's
 * sender's (source Shared link), or by the firm's arrival rule from the
 * catalogue (source Catalogue).
 *
 * LIMITS: per address and per number at the route (routes/public.ts), and
 * ASKS_PER_DAY per firm here. Staff trying their own page leave no trace.
 * The asks are kept with the lead (crm_buyer_asks): a lead's history, small.
 * ============================================================================
 */
import { sql } from './db.js';
import { getContext, runWithContext } from './context.js';
import { landEnquiry } from './ingestion.js';
import { notifyOrDesk } from './notifications.js';
import { audit } from './audit.js';
import { isDeskRole } from '../lib/permissions.js';
import { phoneAsStored } from '../../../src/lib/locale.js';
import { CATALOGUE_WHERE } from './catalogueRules.js';
import { deskConfigOf, localeOf, updateLead, addTimelineEvent, bhkTokenOf, listingKind, type DeskConfig } from './store.js';
import {
  ShareError, resolveCode, linkRows, linkState, whoAnswers, flatLabel, recordEvent, staffBrowser, attachDevice,
  addToShortlist, firmDayStart, rid, catalogueKeyed, askClauses, SHOWN_COLUMNS, type Firm, type PublicReq,
} from './sharing.js';
import { sharingOf } from './store.js';

export const ASK_KINDS = ['callback', 'visit', 'homes'] as const;
export type AskKind = typeof ASK_KINDS[number];
/** A firm's forms take at most this many asks a day; above it is a flood, and every one would be an alert. */
const ASKS_PER_DAY = 100;
const SLOT_DAYS = 7;
/** A visit is asked for at least this far ahead. */
const LEAD_MS = 60 * 60 * 1000;

// ── The firm's clock ────────────────────────────────────────────────────────

/** A moment as the firm's wall clock reads it. */
function wall(d: Date, tz: string) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(d).map(x => [x.type, x.value]));
  return { ymd: `${p.year}-${p.month}-${p.day}`, h: Number(p.hour), mi: Number(p.minute) };
}

/** The instant the firm's clock reads `hour`:00 on `ymd`. */
function atWall(ymd: string, hour: number, tz: string): Date {
  const [y, m, d] = ymd.split('-').map(Number);
  const want = Date.UTC(y, m - 1, d, hour);
  let t = want;
  for (let i = 0; i < 2; i++) {
    const w = wall(new Date(t), tz);
    const [wy, wm, wd] = w.ymd.split('-').map(Number);
    t += want - Date.UTC(wy, wm - 1, wd, w.h, w.mi);
  }
  return new Date(t);
}
const plusDays = (ymd: string, n: number) => {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
};
const hh = (h: number) => `${String(h).padStart(2, '0')}:00`;
/** "11:00 am", the shape the schedule form writes into follow_up.time. */
const ampm = (h: number) => `${((h + 11) % 12) + 1}:00 ${h < 12 ? 'am' : 'pm'}`;

/** When a call back is due: now inside working hours, else the next opening. */
export function callbackDue(desk: DeskConfig, now = new Date()): Date {
  const w = wall(now, desk.timezone);
  if (w.h >= desk.workStart && w.h < desk.workEnd) return now;
  const day = w.h < desk.workStart ? w.ymd : plusDays(w.ymd, 1);
  return atWall(day, desk.workStart, desk.timezone);
}

/** The visit slots a buyer may pick: whole hours inside working hours, the next week, never in the past. */
export function visitSlots(desk: DeskConfig, now = new Date()) {
  const today = wall(now, desk.timezone).ymd;
  const days: { date: string; label: string; times: string[] }[] = [];
  for (let i = 0; i < SLOT_DAYS; i++) {
    const ymd = plusDays(today, i);
    const times: string[] = [];
    for (let h = desk.workStart; h < desk.workEnd; h++) {
      if (atWall(ymd, h, desk.timezone).getTime() >= now.getTime() + LEAD_MS) times.push(hh(h));
    }
    if (!times.length) continue;
    const label = atWall(ymd, 12, desk.timezone).toLocaleDateString(desk.locale.numberLocale, { timeZone: desk.timezone, weekday: 'short', day: 'numeric', month: 'short' });
    days.push({ date: ymd, label, times });
  }
  return days;
}

/** GET /public/forms/:tenant/slots */
export async function slotsFor(f: Firm) {
  const desk = await deskConfigOf(f.id);
  return { days: visitSlots(desk) };
}

// ── What a buyer asks ───────────────────────────────────────────────────────

type Ask = { deal?: string[]; config?: string[]; locality?: string[] };

/** New homes like these, from the homes shown: their deals, sizes and places. */
function askFromRows(rows: any[], loc: any): Ask {
  const uniq = (xs: (string | null)[]) => [...new Set(xs.filter(Boolean) as string[])];
  return {
    deal: uniq(rows.map(r => (r.deal ? String(r.deal).toLowerCase() : null))),
    config: uniq(rows.map(r => bhkTokenOf(r.bhk, loc))),
    locality: uniq(rows.map(r => (r.locality ? String(r.locality).trim().toLowerCase() : null))),
  };
}

/** The catalogue homes an ask matches now, by the catalogue's own filter rule. */
async function matchesNow(tenantId: string, ask: Ask): Promise<string[]> {
  const loc = await localeOf(tenantId);
  const keyed = await catalogueKeyed(tenantId, loc);
  const clause = [CATALOGUE_WHERE(tenantId), ...askClauses(keyed, ask)].reduce((a, c) => sql`${a} AND ${c}`);
  const rows = await sql`SELECT id FROM crm_properties WHERE ${clause}`;
  return (rows as any[]).map(r => r.id);
}

const askLine = (a: Ask, loc: any) => {
  const words = [
    ...(a.config || []).map(c => listingKind(c, null, loc)),
    ...(a.deal || []).map(d => (d === 'rent' ? 'to rent' : d === 'sale' ? 'to buy' : d)),
    ...(a.locality || []).map(l => `in ${l.replace(/\b\w/g, c => c.toUpperCase())}`),
  ];
  return words.join(' ') || 'any home';
};

/**
 * POST /public/forms/:tenant/ask
 *   { kind: callback|visit|homes, name?, phone, code? (a link), propertyId?,
 *     date?, time? (visit), filters?: {deal, config, locality} (the catalogue) }
 * Answers { ok: true }, the same whether or not the number was already a lead.
 */
export async function buyerAsk(f: Firm, input: any, r: PublicReq): Promise<{ ok: true }> {
  const kind = String(input.kind || '') as AskKind;
  if (!ASK_KINDS.includes(kind)) throw new ShareError(400, 'kind_required', 'Unknown form.');
  const digits = String(input.phone || '').replace(/\D/g, '');
  if (digits.length < 10 || digits.length > 13) throw new ShareError(400, 'phone_required', 'A 10-digit mobile number is needed.');
  const [desk, loc, sharing] = await Promise.all([deskConfigOf(f.id), localeOf(f.id), sharingOf(f.id)]);
  const phone = phoneAsStored(input.phone, loc) || null;
  const name = String(input.name || '').trim().slice(0, 80) || null;

  // WHERE IT CAME FROM: a live link, or the catalogue.
  let link: any = null;
  let rows: any[] = [];
  if (input.code) {
    const found = await resolveCode(f.id, String(input.code));
    if (!found || found.tap) throw new ShareError(404, 'not_found', 'This page does not exist.');
    if (linkState(found.link, sharing.stopped) !== 'active') throw new ShareError(410, 'link_gone', 'This link is no longer active.');
    link = found.link;
    rows = await linkRows(f.id, link);
  }
  const propertyId = input.propertyId ? String(input.propertyId) : null;
  let flat: any = null;
  if (propertyId) {
    flat = link
      ? rows.find(x => x.id === propertyId) || null
      : ((await sql`SELECT ${SHOWN_COLUMNS} FROM crm_properties WHERE ${CATALOGUE_WHERE(f.id)} AND id = ${propertyId} LIMIT 1`) as any[])[0] || null;
    if (!flat) throw new ShareError(404, 'not_found', 'This home is not on this page.');
  }
  if (kind !== 'homes' && !flat) throw new ShareError(400, 'home_required', 'Pick a home.');

  // A VISIT: one of the slots offered, re-checked here, never in the past.
  let visitAt: Date | null = null;
  if (kind === 'visit') {
    const day = visitSlots(desk).find(d => d.date === String(input.date || ''));
    if (!day || !day.times.includes(String(input.time || ''))) throw new ShareError(400, 'slot_taken', 'Pick another time.');
    visitAt = atWall(day.date, Number(String(input.time).slice(0, 2)), desk.timezone);
  }
  // NEW HOMES LIKE THESE: the homes shown, or the catalogue's filters.
  const ask: Ask | null = kind !== 'homes' ? null
    : link ? askFromRows(rows, loc)
    : {
      deal: [input.filters?.deal].filter(Boolean).map((v: string) => v.toLowerCase()),
      config: [input.filters?.config ? bhkTokenOf(String(input.filters.config), loc) || String(input.filters.config) : null].filter(Boolean) as string[],
      locality: [input.filters?.locality].filter(Boolean).map((v: string) => v.trim().toLowerCase()),
    };

  // STAFF TRYING THEIR OWN PAGE leave no trace, like a tap. ONE HUNDRED A DAY
  // PER FIRM. Both reads in one wait.
  const tz = desk.timezone;
  const [isStaff, today] = await Promise.all([
    staffBrowser(f, r),
    sql`SELECT count(*)::int AS n FROM crm_buyer_asks WHERE tenant_id = ${f.id} AND created_at >= ${firmDayStart(tz)}`,
  ]);
  if (isStaff) return { ok: true };
  if (today[0].n >= ASKS_PER_DAY) {
    console.warn(`[Asks] daily cap reached for tenant ${f.id}: ${today[0].n} today`);
    throw new ShareError(429, 'slow_down', 'Too many requests. Try again in a few minutes.');
  }

  // WHO IT IS. A bound link names them; anything else goes through the one
  // enquiry path, unverified: an existing lead is told, never edited.
  let leadId: string | null = link?.lead_id || null;
  let created = false;
  if (!leadId) {
    const source = link ? 'Shared link' : 'Catalogue';
    const who = link ? await whoAnswers(f.id, null, link.created_by) : null;
    const said = { ...(flat ? { interest: flatLabel(flat, loc) } : {}), notes: ASK_WORDS[kind] };
    const out = await landEnquiry({
      tenantId: f.id, provider: source, integrationId: null, inboxId: null,
      lead: { name, phone, source, req: said },
      body: { kind, name, phone, code: link?.code || null, propertyId, date: input.date || null, time: input.time || null },
      unverified: true, agentId: who?.recipient?.id || null,
    });
    // The same ask again within 15 minutes (a double tap, a retry after the
    // signal dropped) is landEnquiry's idempotent retry: already handled, so
    // the buyer hears Sent, not "Could not send", and nobody is told twice.
    if (out.status === 'ignored') return { ok: true };
    leadId = out.leadId || null;
    created = out.status === 'ingested';
  }
  if (!leadId) throw new ShareError(500, 'failed', 'Could not send. Try again.');

  return await runWithContext({
    ...(getContext() || {}), tenantId: f.id, userId: null, role: 'system', actorType: 'system', actorLabel: 'Buyer form',
  } as any, async () => {
    const who = await whoAnswers(f.id, leadId, link?.created_by || null);
    const lead = who.lead;
    const id = rid('ask');
    const at = kind === 'callback' ? callbackDue(desk) : visitAt;
    const seen = ask ? await matchesNow(f.id, ask) : [];
    // A lead keeps one New homes like these: a new one replaces it.
    if (kind === 'homes') await sql`UPDATE crm_buyer_asks SET status = 'replaced', updated_at = NOW() WHERE tenant_id = ${f.id} AND lead_id = ${leadId} AND kind = 'homes' AND status = 'open'`;
    await sql`
      INSERT INTO crm_buyer_asks (id, tenant_id, lead_id, kind, link_id, property_id, name, phone, at, ask, seen_ids, status, created_at)
      VALUES (${id}, ${f.id}, ${leadId}, ${kind}, ${link?.id || null}, ${flat?.id || null}, ${name}, ${phone}, ${at},
              ${ask ? sql.json(ask) : null}, ${seen}, 'open', NOW())`;
    // The home and the browser join the lead only when this ask made it
    // (catalogueEnquiry's rule): typing a lead's number changes nothing on it.
    // Independent writes, so one round trip's wait, not three.
    await Promise.all([
      recordEvent(f.id, { linkId: link?.id || null, propertyId: flat?.id || null, kind: `ask_${kind}`, deviceId: r.deviceId, leadId }),
      created && flat ? addToShortlist(f.id, leadId!, [flat.id]) : null,
      created && r.deviceId && !link?.lead_id ? attachDevice(f.id, r.deviceId, leadId!) : null,
    ]);

    // THE BUYER IS ANSWERED HERE: the ask and the lead are written. The rest
    // (timeline, booking, alert) took eight more seconds on a new lead with a
    // three-person desk, with the buyer watching "Sending…". It runs on in
    // this context; a failure is logged with the ask's id, never lost silently.
    void tellTheFirm().catch(err => console.warn(`[Asks] ${kind} ${id} (tenant ${f.id}) saved, but its follow-through failed:`, err?.message));
    return { ok: true as const };

    async function tellTheFirm() {
      // ON THE LEAD'S TIMELINE, by System, in the buyer's terms.
      const home = flat ? flatLabel(flat, loc) : null;
      const typed = name && lead?.name && name.toLowerCase() !== String(lead.name).toLowerCase() ? `As ${name}` : null;
      const otherNumber = lead?.phone && phone && String(lead.phone).replace(/\D/g, '').slice(-10) !== digits.slice(-10) ? `Gave ${phone}` : null;
      const when = at ? at.toLocaleString(desk.locale.numberLocale, { timeZone: tz, weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : null;
      await addTimelineEvent({
        record_id: leadId!, type: 'enquiry',
        title: kind === 'callback' ? 'Asked for a call back' : kind === 'visit' ? 'Asked to visit' : 'Asked for new homes like these',
        description: [kind === 'homes' ? askLine(ask!, loc) : home, kind === 'visit' ? when : null, typed, otherNumber].filter(Boolean).join(' · '),
        author: 'System', metadata: { askId: id, kind, propertyId: flat?.id || null, linkId: link?.id || null },
      });

      // A CALL BACK IS A BOOKING on the lead — unless one already stands sooner.
      if (kind === 'callback' && at && lead) {
        const [cur] = await sql`SELECT follow_up FROM crm_leads WHERE tenant_id = ${f.id} AND id = ${leadId}`;
        const curAt = cur?.follow_up?.at ? new Date(cur.follow_up.at) : null;
        if (!cur?.follow_up || (curAt && !isNaN(curAt.getTime()) && curAt > at)) {
          const w = wall(at, tz);
          await updateLead(leadId!, {
            followUp: { action: 'Follow-up Call', at: at.toISOString(), date: w.ymd, time: `${((w.h + 11) % 12) + 1}:${String(w.mi).padStart(2, '0')} ${w.h < 12 ? 'am' : 'pm'}`, note: home ? `Asked for a call back · ${home}` : 'Asked for a call back' },
          }, { actorType: 'system', actorId: null, actorLabel: 'Buyer form' } as any);
        }
      }

      // THE HOLDER IS TOLD (else the link's sender, else the desk). New homes
      // like these tells nobody now: its alert is the match, later.
      if (kind !== 'homes') {
        const reached = await notifyOrDesk(who.recipient?.id || null, {
          tenantId: f.id, type: kind === 'callback' ? 'buyer_callback' : 'buyer_visit',
          data: { name: lead?.name || name || lead?.phone || phone, flat: home, at: at?.toISOString() || null },
          link: `?screen=leads&lead=${leadId}&ask=${id}`,
          record: { kind: 'lead', ids: [leadId!] },
        });
        if (!reached) console.warn(`[Asks] ${kind} ${id} for tenant ${f.id} reached nobody`);
      }
      audit({
        tenant_id: f.id, actor_type: 'system', actor_id: null, actor_label: 'Buyer form',
        action: `buyer_ask.${kind}`, target_type: 'lead', target_id: leadId!, summary: `Buyer asked: ${kind}`,
        metadata: { askId: id, created, linkId: link?.id || null, propertyId: flat?.id || null }, ip: getContext()?.ip || null, user_agent: r.userAgent,
      });
    }
  });
}

const ASK_WORDS: Record<AskKind, string> = {
  callback: 'Asked for a call back',
  visit: 'Asked to visit',
  homes: 'Asked for new homes like these',
};

// ── Signed in: the agent's side ─────────────────────────────────────────────

function me() {
  const c = getContext();
  if (!c?.userId || !c.tenantId) throw new ShareError(401, 'auth_required');
  return { tenantId: c.tenantId, userId: c.userId, role: c.role || 'agent' };
}

async function askFor(m: ReturnType<typeof me>, id: string) {
  const [a] = await sql`
    SELECT a.*, l.name AS lead_name, l.phone AS lead_phone, l.agent_id, l.created_by
      FROM crm_buyer_asks a JOIN crm_leads l ON l.tenant_id = a.tenant_id AND l.id = a.lead_id
     WHERE a.tenant_id = ${m.tenantId} AND a.id = ${id} LIMIT 1`;
  if (!a) throw new ShareError(404, 'not_found');
  // The lead's own visibility: an agent sees an ask on a lead they hold or made.
  if (m.role === 'agent' && a.agent_id !== m.userId && a.created_by !== m.userId) throw new ShareError(404, 'not_found');
  return a;
}

/** GET /buyer-asks/:id — what the alert opens: the ask, the home, and for New homes like these the homes that match now and are new. */
export async function getAsk(id: string) {
  const m = me();
  const a = await askFor(m, id);
  const loc = await localeOf(m.tenantId);
  const homes = a.kind === 'homes' && a.ask ? await matchesNow(m.tenantId, a.ask) : [];
  // The homes the last alert named, still matching (a home taken since drops out).
  const fresh = homes.filter(h => (a.alerted_ids || []).includes(h));
  const ids = [...new Set([...(a.property_id ? [a.property_id] : []), ...fresh])];
  const props = ids.length ? await sql`SELECT ${SHOWN_COLUMNS} FROM crm_properties WHERE tenant_id = ${m.tenantId} AND id IN ${sql(ids)}` : [];
  const byId = new Map((props as any[]).map(p => [p.id, p]));
  return {
    id: a.id, kind: a.kind, status: a.status, at: a.at, name: a.name, phone: a.phone, createdAt: a.created_at,
    lead: { id: a.lead_id, name: a.lead_name || null, phone: a.lead_phone || null },
    home: a.property_id && byId.get(a.property_id) ? { id: a.property_id, title: flatLabel(byId.get(a.property_id), loc) } : null,
    ask: a.ask ? askLine(a.ask, loc) : null,
    homes: fresh.filter(h => byId.has(h)).map(h => ({ id: h, title: flatLabel(byId.get(h), loc) })),
  };
}

/** POST /buyer-asks/:id/confirm — a requested visit becomes the lead's booked site visit. The holder or the desk. */
export async function confirmVisit(id: string) {
  const m = me();
  const a = await askFor(m, id);
  if (a.kind !== 'visit') throw new ShareError(400, 'not_a_visit');
  if (!isDeskRole(m.role) && a.agent_id !== m.userId) throw new ShareError(403, 'forbidden', 'Only the person holding this lead, or the office, can confirm it.');
  if (a.status === 'confirmed') return { ok: true, already: true };
  if (new Date(a.at).getTime() < Date.now()) throw new ShareError(409, 'visit_passed', 'That time has passed. Pick another time.');
  const desk = await deskConfigOf(m.tenantId);
  const w = wall(new Date(a.at), desk.timezone);
  const loc = await localeOf(m.tenantId);
  const [p] = a.property_id ? await sql`SELECT ${SHOWN_COLUMNS} FROM crm_properties WHERE tenant_id = ${m.tenantId} AND id = ${a.property_id}` : [null];
  await updateLead(a.lead_id, {
    followUp: { action: 'Site Visit', at: new Date(a.at).toISOString(), date: w.ymd, time: ampm(w.h), note: p ? `Asked on the link · ${flatLabel(p, loc)}` : 'Asked on the link' },
  }, { actorType: 'user', actorId: m.userId, actorLabel: null } as any);
  await sql`UPDATE crm_buyer_asks SET status = 'confirmed', updated_at = NOW() WHERE tenant_id = ${m.tenantId} AND id = ${id}`;
  return { ok: true };
}

// ── New homes like these: the daily match ───────────────────────────────────

/**
 * For each open ask, the catalogue homes that match now and were not matching
 * when it was last looked at. New ones → one alert to the holder, at most one
 * per lead per day ("2 new homes match Rahul · Send"), and they join seen.
 * Within the day the new ones wait; they are still new tomorrow. Run by the
 * scheduled sweep (notifications.ts), so CRM_NO_SWEEPS=1 stops it.
 */
export async function matchNewHomes(tenantId: string): Promise<number> {
  const asks = await sql`
    SELECT a.*, l.name AS lead_name, l.phone AS lead_phone, l.agent_id
      FROM crm_buyer_asks a JOIN crm_leads l ON l.tenant_id = a.tenant_id AND l.id = a.lead_id
     WHERE a.tenant_id = ${tenantId} AND a.kind = 'homes' AND a.status = 'open'
       AND (a.last_alert_at IS NULL OR a.last_alert_at < NOW() - interval '24 hours')`;
  let sent = 0;
  for (const a of asks as any[]) {
    const now = await matchesNow(tenantId, a.ask || {});
    const fresh = now.filter(h => !(a.seen_ids || []).includes(h));
    if (!fresh.length) continue;
    const [holder] = a.agent_id ? await sql`SELECT id FROM users WHERE tenant_id = ${tenantId} AND id = ${a.agent_id} AND status ILIKE 'active' AND deleted_at IS NULL` : [null];
    const reached = await notifyOrDesk(holder?.id || null, {
      tenantId, type: 'buyer_new_homes',
      data: { name: a.lead_name || a.lead_phone, n: fresh.length },
      link: `?screen=leads&lead=${a.lead_id}&ask=${a.id}`,
      record: { kind: 'lead', ids: [a.lead_id] },
    });
    if (!reached) console.warn(`[Asks] new homes for ${a.id} (tenant ${tenantId}) reached nobody`);
    await sql`UPDATE crm_buyer_asks SET seen_ids = ${[...new Set([...(a.seen_ids || []), ...fresh])]}, alerted_ids = ${fresh},
                     last_alert_at = NOW(), updated_at = NOW() WHERE tenant_id = ${tenantId} AND id = ${a.id}`;
    sent++;
  }
  return sent;
}
