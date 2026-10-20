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
 * ONE ALERT PER ARRIVAL: landEnquiry runs with announce: false, and the one
 * alert is ours (buyer_callback / buyer_visit / buyer_homes), saying whether
 * the lead is new, unassigned or was closed. The same ask again the same day
 * folds into it ("(3×)"). A call back is booked only on a lead the ask made;
 * on an existing lead the alert is the whole action.
 *
 * LIMITS: per address and per number at the route (routes/public.ts), and the
 * firm's one public budget (sharing.ts spendPublicForm, shared with the
 * catalogue enquiry). Staff trying their own page leave no trace. The asks are
 * kept with the lead (crm_buyer_asks): a lead's history, small.
 * ============================================================================
 */
import { sql } from './db.js';
import { getContext, runWithContext } from './context.js';
import { landEnquiry } from './ingestion.js';
import { notifyOrDesk } from './notifications.js';
import { copyFor } from './notificationCopy.js';
import { audit } from './audit.js';
import { isDeskRole } from '../lib/permissions.js';
import { TERMINAL_STATUSES } from './statuses.js';
import { CATALOGUE_WHERE } from './catalogueRules.js';
import { deskConfigOf, localeOf, updateLead, addTimelineEvent, bhkTokenOf, listingKind, sharingOf, type DeskConfig } from './store.js';
import {
  ShareError, resolveCode, linkRows, linkState, whoAnswers, flatLabel, recordEvent, staffBrowser, attachDevice,
  addToShortlist, firmDayStart, rid, catalogueKeyed, askClauses, buyerPhone, spendPublicForm,
  firmPhone, SHOWN_COLUMNS, type Firm, type PublicReq,
} from './sharing.js';

export const ASK_KINDS = ['callback', 'visit', 'homes'] as const;
export type AskKind = typeof ASK_KINDS[number];
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
type Keyed = Awaited<ReturnType<typeof catalogueKeyed>>;

/** At least one of deal, size or place: "any home at all" is not an ask anyone can act on. */
const hasFacet = (a: Ask | null | undefined) => !!a && ['deal', 'config', 'locality'].some(k => ((a as any)[k] || []).length > 0);

/** A filter value from the page: a string, trimmed, at most 80 characters, else nothing. */
const filterValue = (v: unknown) => (typeof v === 'string' ? v.trim().slice(0, 80) : '');

/** New homes like these, from the homes shown: their deals, sizes and places. */
function askFromRows(rows: any[], loc: any): Ask {
  const uniq = (xs: (string | null)[]) => [...new Set(xs.filter(Boolean) as string[])];
  return {
    deal: uniq(rows.map(r => (r.deal ? String(r.deal).toLowerCase() : null))),
    config: uniq(rows.map(r => bhkTokenOf(r.bhk, loc))),
    locality: uniq(rows.map(r => (r.locality ? String(r.locality).trim().toLowerCase() : null))),
  };
}

/** The catalogue homes an ask matches now, by the catalogue's own filter rule. `keyed` once per firm per run. */
async function matchesNow(tenantId: string, ask: Ask, keyed?: Keyed): Promise<string[]> {
  const k = keyed || await catalogueKeyed(tenantId, await localeOf(tenantId));
  const clause = [CATALOGUE_WHERE(tenantId), ...askClauses(k, ask)].reduce((a, c) => sql`${a} AND ${c}`);
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

/** The page's one body for a code or home that cannot be used (routes/public.ts answers it identically). */
const notFound = () => new ShareError(404, 'not_found', 'This page does not exist.');

/**
 * POST /public/forms/:tenant/ask
 *   { kind: callback|visit|homes, name?, phone, code? (a link), propertyId?,
 *     date?, time? (visit), filters?: {deal, config, locality} (the catalogue) }
 * Answers { ok: true }, the same whether or not the number was already a lead.
 */
export async function buyerAsk(f: Firm, input: any, r: PublicReq): Promise<{ ok: true }> {
  const kind = String(input.kind || '') as AskKind;
  if (!ASK_KINDS.includes(kind)) throw new ShareError(400, 'kind_required', 'Unknown form.');
  // THE ONE PHONE PATH (docs/specs/phone.md): exact E.164 in the firm's
  // country, or a 422 with the reason. A placeholder is stored, never matched
  // (landEnquiry's findLeadByPhone keys with phoneKey).
  const [desk, loc, sharing, phone] = await Promise.all([deskConfigOf(f.id), localeOf(f.id), sharingOf(f.id), buyerPhone(f.id, input.phone)]);
  const name = String(input.name || '').trim().slice(0, 80) || null;

  // WHERE IT CAME FROM: a live link, or the catalogue. Any code or home that
  // cannot be used is the page's one identical answer.
  let link: any = null;
  let rows: any[] = [];
  if (input.code) {
    const found = await resolveCode(f.id, String(input.code));
    if (!found || found.tap || linkState(found.link, sharing.stopped) !== 'active') throw notFound();
    link = found.link;
    rows = await linkRows(f.id, link);
  }
  const propertyId = input.propertyId ? String(input.propertyId).slice(0, 80) : null;
  let flat: any = null;
  if (propertyId) {
    flat = link
      ? rows.find(x => x.id === propertyId) || null
      : ((await sql`SELECT ${SHOWN_COLUMNS} FROM crm_properties WHERE ${CATALOGUE_WHERE(f.id)} AND id = ${propertyId} LIMIT 1`) as any[])[0] || null;
    if (!flat) throw notFound();
  }
  if (kind !== 'homes' && !flat) throw new ShareError(400, 'home_required', 'Pick a home.');

  // A VISIT: one of the slots offered, re-checked here, never in the past.
  let visitAt: Date | null = null;
  if (kind === 'visit') {
    const day = visitSlots(desk).find(d => d.date === String(input.date || ''));
    if (!day || !day.times.includes(String(input.time || ''))) throw new ShareError(400, 'slot_taken', 'Pick another time.');
    visitAt = atWall(day.date, Number(String(input.time).slice(0, 2)), desk.timezone);
  }
  // NEW HOMES LIKE THESE: the homes shown, or the catalogue's filters — at
  // least one of deal, size or place.
  let ask: Ask | null = null;
  if (kind === 'homes') {
    const fl = input.filters && typeof input.filters === 'object' ? input.filters : {};
    const deal = filterValue(fl.deal).toLowerCase(), config = filterValue(fl.config), locality = filterValue(fl.locality).toLowerCase();
    ask = link ? askFromRows(rows, loc) : {
      deal: deal ? [deal] : [],
      config: config ? [bhkTokenOf(config, loc) || config] : [],
      locality: locality ? [locality] : [],
    };
    if (!hasFacet(ask)) throw new ShareError(400, 'ask_empty', 'Pick what you are looking for first.');
  }

  // STAFF TRYING THEIR OWN PAGE leave no trace, like a tap. Anyone else
  // spends one of THE FIRM'S ONE PUBLIC BUDGET (shared with the catalogue
  // enquiry), atomically and before anything is written.
  const tz = desk.timezone;
  if (await staffBrowser(f, r)) return { ok: true };
  await spendPublicForm(f.id, tz);

  // WHO IT IS. A bound link names them; anything else goes through the one
  // enquiry path, unverified (an existing lead is told, never edited) and
  // QUIET (announce: false): the one alert about this arrival is ours below.
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
      unverified: true, agentId: who?.recipient?.id || null, announce: false,
    });
    // The same ask again within 15 minutes (a double tap, a retry after the
    // signal dropped) is landEnquiry's idempotent retry: already handled, so
    // the buyer hears Sent, not "Could not send", and nobody is told twice.
    if (out.status === 'ignored') return { ok: true };
    leadId = out.leadId || null;
    created = out.status === 'ingested';
  }
  if (!leadId) throw new ShareError(500, 'failed', 'Could not send. Try again.');

  return await asSystem(f.id, async () => {
    const at = kind === 'callback' ? callbackDue(desk) : visitAt;
    const seen = ask ? await matchesNow(f.id, ask) : [];
    const id = rid('ask');
    // THE SAME ASK AGAIN TODAY — this lead, this form, this home — is one
    // ask asked more than once, not another alert. A forwarded bound link
    // pressed all day would otherwise buzz its holder a hundred times. It
    // folds into the open ask and its open alert: "(3×)", no push. The
    // NEWEST choice wins: a visit at another time, or New homes like these
    // with other filters, replaces what the ask said (a call back keeps its
    // time: it is "call me", not a slot).
    const { row, folded } = await sql.begin(async (tx: any) => {
      const [again] = await tx`
        SELECT id FROM crm_buyer_asks
         WHERE tenant_id = ${f.id} AND lead_id = ${leadId} AND kind = ${kind}
           AND coalesce(property_id, '') = ${flat?.id || ''} AND status = 'open'
           AND created_at >= ${firmDayStart(tz)}
         ORDER BY created_at DESC LIMIT 1`;
      if (again) {
        const [row] = await tx`UPDATE crm_buyer_asks
            SET count = count + 1, updated_at = NOW(),
                name = coalesce(${name}, name), phone = ${phone},
                at = ${kind === 'visit' ? visitAt : tx`at`},
                ask = ${ask ? tx.json(ask) : tx`ask`},
                seen_ids = ${ask ? seen : tx`seen_ids`}
          WHERE tenant_id = ${f.id} AND id = ${again.id} RETURNING *`;
        return { row, folded: true };
      }
      // A lead keeps one New homes like these: a new one replaces it.
      if (kind === 'homes') await tx`UPDATE crm_buyer_asks SET status = 'replaced', updated_at = NOW() WHERE tenant_id = ${f.id} AND lead_id = ${leadId} AND kind = 'homes' AND status = 'open'`;
      const [row] = await tx`
        INSERT INTO crm_buyer_asks (id, tenant_id, lead_id, kind, link_id, property_id, name, phone, at, ask, seen_ids, status, made_lead, created_at)
        VALUES (${id}, ${f.id}, ${leadId}, ${kind}, ${link?.id || null}, ${flat?.id || null}, ${name}, ${phone}, ${at},
                ${ask ? tx.json(ask) : null}, ${seen}, 'open', ${created}, NOW())
        RETURNING *`;
      return { row, folded: false };
    });
    if (folded) {
      await recordEvent(f.id, { linkId: link?.id || null, propertyId: flat?.id || null, kind: `ask_${kind}`, deviceId: r.deviceId, leadId });
      void foldIntoAlert(f.id, row).catch(err => console.warn(`[Asks] ${row.id} (tenant ${f.id}): could not update its alert:`, err?.message));
      return { ok: true as const };
    }
    // The home and the browser join the lead only when this ask made it
    // (catalogueEnquiry's rule): typing a lead's number changes nothing on it.
    // Independent writes, so one round trip's wait, not three.
    await Promise.all([
      recordEvent(f.id, { linkId: link?.id || null, propertyId: flat?.id || null, kind: `ask_${kind}`, deviceId: r.deviceId, leadId }),
      created && flat ? addToShortlist(f.id, leadId!, [flat.id]) : null,
      created && r.deviceId && !link?.lead_id ? attachDevice(f.id, r.deviceId, leadId!) : null,
    ]);

    // THE BUYER IS ANSWERED HERE: the ask and the lead are written. The rest
    // (timeline, booking, the alert) took seconds more on a new lead with the
    // buyer watching "Sending…". It runs on in this context; a failure is
    // logged with the ask's id, and an ask a restart cut off before its alert
    // (told_at still empty) is finished by the next sweep (tellUntold).
    void tellTheFirm(f.id, row, { ip: getContext()?.ip || null, userAgent: r.userAgent })
      .catch(err => console.warn(`[Asks] ${kind} ${id} (tenant ${f.id}) saved, but its follow-through failed:`, err?.message));
    return { ok: true as const };
  });
}

const ASK_WORDS: Record<AskKind, string> = {
  callback: 'Asked for a call back',
  visit: 'Asked to visit',
  homes: 'Asked for new homes like these',
};
const ALERT_TYPE: Record<AskKind, string> = { callback: 'buyer_callback', visit: 'buyer_visit', homes: 'buyer_homes' };
/** A closed stage, compared without case (CLAUDE.md: status is compared with ILIKE). */
const TERMINAL = new Set<string>(TERMINAL_STATUSES.map(s => s.toLowerCase()));
const isTerminal = (stage: unknown) => TERMINAL.has(String(stage || '').toLowerCase());

/** The sweep and the after-answer work run outside any request: they set their own firm context, or tid() falls back to the demo tenant. */
const asSystem = <T>(tenantId: string, fn: () => Promise<T>) => runWithContext({
  ...(getContext() || {}), tenantId, userId: null, role: 'system', actorType: 'system', actorLabel: 'Buyer form',
} as any, fn);

/** What the one alert about an ask says: the lead, the home or the ask, the time, and the arrival facts. */
async function alertData(tenantId: string, a: any, lead: any) {
  const loc = await localeOf(tenantId);
  const [p] = a.property_id ? await sql`SELECT ${SHOWN_COLUMNS} FROM crm_properties WHERE tenant_id = ${tenantId} AND id = ${a.property_id}` : [null];
  return {
    name: lead?.name || a.name || lead?.phone || a.phone,
    flat: p ? flatLabel(p, loc) : null,
    ask: a.ask ? askLine(a.ask, loc) : null,
    at: a.at ? new Date(a.at).toISOString() : null,
    newLead: !!a.made_lead,
    unassigned: !lead?.agent_id,
    // A closed lead asking again: unverified, so the lead stays closed and
    // the alert says so (what lead_repeat said before).
    previousStage: lead && isTerminal(lead.stage) ? lead.stage : null,
    count: Number(a.count) || 1,
  };
}

/**
 * Everything after the buyer's answer: the timeline line, the booking (only
 * on a lead this ask made), and THE ONE ALERT. Run from the request, and by
 * tellUntold for an ask a restart cut off. CLAIMED FIRST (told_at set where
 * it is still empty): two runs cannot both send. A crash after the claim
 * loses this ask's alert — one lost beats two sent.
 * Runs in the firm's own context (asSystem): from the sweep there is none,
 * and the timeline and the booking read the tenant from it.
 */
function tellTheFirm(tenantId: string, a: any, req: { ip?: string | null; userAgent?: string | null } = {}) {
  return asSystem(tenantId, () => tellTheFirmNow(tenantId, a, req));
}
async function tellTheFirmNow(tenantId: string, a: any, req: { ip?: string | null; userAgent?: string | null }) {
  const [claimed] = await sql`UPDATE crm_buyer_asks SET told_at = NOW()
                               WHERE tenant_id = ${tenantId} AND id = ${a.id} AND told_at IS NULL RETURNING id`;
  if (!claimed) return;
  const [desk, loc] = await Promise.all([deskConfigOf(tenantId), localeOf(tenantId)]);
  const tz = desk.timezone;
  const [link] = a.link_id ? await sql`SELECT created_by FROM crm_share_links WHERE tenant_id = ${tenantId} AND id = ${a.link_id}` : [null];
  const who = await whoAnswers(tenantId, a.lead_id, link?.created_by || null);
  const lead = who.lead;
  const data = await alertData(tenantId, a, lead);
  const at = a.at ? new Date(a.at) : null;
  const kind = a.kind as AskKind;

  // ON THE LEAD'S TIMELINE, by System, in the buyer's terms.
  const typed = a.name && lead?.name && String(a.name).toLowerCase() !== String(lead.name).toLowerCase() ? `As ${a.name}` : null;
  const otherNumber = lead?.phone && a.phone && lead.phone !== a.phone ? `Gave ${a.phone}` : null;
  const when = at ? at.toLocaleString(desk.locale.numberLocale, { timeZone: tz, weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : null;
  await addTimelineEvent({
    record_id: a.lead_id, type: 'enquiry',
    title: ASK_WORDS[kind],
    description: [kind === 'homes' ? data.ask : data.flat, kind === 'visit' ? when : null, typed, otherNumber].filter(Boolean).join(' · '),
    author: 'System', metadata: { askId: a.id, kind, propertyId: a.property_id || null, linkId: a.link_id || null },
  });

  // A CALL BACK IS BOOKED ONLY ON A LEAD THIS ASK MADE. Anyone can type a
  // lead's number into a public form: on a lead that already existed it must
  // not replace a booked visit with "call now", or book a call on a closed
  // lead. There the alert is the whole action.
  if (kind === 'callback' && at && a.made_lead) {
    const w = wall(at, tz);
    await updateLead(a.lead_id, {
      followUp: { action: 'Follow-up Call', at: at.toISOString(), date: w.ymd, time: `${((w.h + 11) % 12) + 1}:${String(w.mi).padStart(2, '0')} ${w.h < 12 ? 'am' : 'pm'}`, note: data.flat ? `Asked for a call back · ${data.flat}` : 'Asked for a call back' },
    }, { actorType: 'system', actorId: null, actorLabel: 'Buyer form' } as any);
  }

  // THE ONE ALERT: the holder, else the link's sender, else the desk. It says
  // whether the lead is new, unassigned or was closed — nothing else is sent
  // about this arrival (landEnquiry announce: false).
  const reached = await notifyOrDesk(who.recipient?.id || null, {
    tenantId, type: ALERT_TYPE[kind], data,
    link: `?screen=leads&lead=${a.lead_id}&ask=${a.id}`,
    record: { kind: 'lead', ids: [a.lead_id] },
    ...(kind === 'visit' && at ? { subjectAt: at.toISOString() } : {}),
  });
  if (!reached) console.warn(`[Asks] ${kind} ${a.id} for tenant ${tenantId} reached nobody`);
  audit({
    tenant_id: tenantId, actor_type: 'system', actor_id: null, actor_label: 'Buyer form',
    action: `buyer_ask.${kind}`, target_type: 'lead', target_id: a.lead_id, summary: `Buyer asked: ${kind}`,
    metadata: { askId: a.id, created: !!a.made_lead, linkId: a.link_id || null, propertyId: a.property_id || null, recipients: reached },
    ip: req.ip || null, user_agent: req.userAgent || null,
  });
}

/** The same ask again today: its open alert says how many times, in place. No new row, no push. */
async function foldIntoAlert(tenantId: string, a: any) {
  const [desk, lead] = await Promise.all([deskConfigOf(tenantId), sql`SELECT name, phone, stage, agent_id FROM crm_leads WHERE tenant_id = ${tenantId} AND id = ${a.lead_id}`.then((x: any) => x[0])]);
  const c = copyFor(ALERT_TYPE[a.kind as AskKind], await alertData(tenantId, a, lead), desk);
  if (!c?.title) return;
  const at = a.kind === 'visit' && a.at ? new Date(a.at).toISOString() : null;
  await sql`UPDATE notifications SET title = ${c.title}, body = ${c.body ?? null},
                   subject_at = ${at ? at : sql`subject_at`}
             WHERE tenant_id = ${tenantId} AND closed_at IS NULL AND type = ${ALERT_TYPE[a.kind as AskKind]}
               AND link LIKE ${'%ask=' + a.id}`;
}

/** Asks answered but never told (a restart between the answer and the alert): finished on the next sweep. */
async function tellUntold(tenantId: string): Promise<number> {
  const rows = await sql`SELECT * FROM crm_buyer_asks
     WHERE tenant_id = ${tenantId} AND told_at IS NULL AND status = 'open'
       AND created_at < NOW() - interval '2 minutes' AND created_at > NOW() - interval '1 day'
     ORDER BY created_at LIMIT 50`;
  for (const a of rows as any[]) {
    await tellTheFirm(tenantId, a).catch(err => console.warn(`[Asks] ${a.id} (tenant ${tenantId}): late follow-through failed:`, err?.message));
  }
  return rows.length;
}

// ── Signed in: the agent's side ─────────────────────────────────────────────

function me() {
  const c = getContext();
  if (!c?.userId || !c.tenantId) throw new ShareError(401, 'auth_required');
  return { tenantId: c.tenantId, userId: c.userId, role: c.role || 'agent' };
}

async function askFor(m: ReturnType<typeof me>, id: string) {
  const [a] = await sql`
    SELECT a.*, l.name AS lead_name, l.phone AS lead_phone, l.agent_id, l.created_by, l.follow_up AS lead_follow_up
      FROM crm_buyer_asks a JOIN crm_leads l ON l.tenant_id = a.tenant_id AND l.id = a.lead_id
     WHERE a.tenant_id = ${m.tenantId} AND a.id = ${id} LIMIT 1`;
  if (!a) throw new ShareError(404, 'not_found');
  // The lead's own visibility: anyone off the desk (an agent today) sees an
  // ask on a lead they hold or made.
  if (!isDeskRole(m.role) && a.agent_id !== m.userId && a.created_by !== m.userId) throw new ShareError(404, 'not_found');
  return a;
}

/** What is booked on a lead, for a person to read: "Site Visit, Thu 22 Oct, 11:00 am". */
function bookedLine(fu: any, desk: DeskConfig) {
  const at = fu?.at ? new Date(fu.at) : null;
  const when = at && !isNaN(at.getTime())
    ? at.toLocaleString(desk.locale.numberLocale, { timeZone: desk.timezone, weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })
    : [fu?.date, fu?.time].filter(Boolean).join(' ');
  return [fu?.action || 'Follow-up', when].filter(Boolean).join(', ');
}

/** GET /buyer-asks/:id — what the alert opens: the ask, the home, what is already booked, and for New homes like these the homes the last alert named. */
export async function getAsk(id: string) {
  const m = me();
  const a = await askFor(m, id);
  const [loc, desk] = await Promise.all([localeOf(m.tenantId), deskConfigOf(m.tenantId)]);
  const homes = a.kind === 'homes' && a.ask ? await matchesNow(m.tenantId, a.ask) : [];
  // The homes the last alert named, still matching (a home taken since drops out).
  const fresh = homes.filter(h => (a.alerted_ids || []).includes(h));
  const ids = [...new Set([...(a.property_id ? [a.property_id] : []), ...fresh])];
  const props = ids.length ? await sql`SELECT ${SHOWN_COLUMNS} FROM crm_properties WHERE tenant_id = ${m.tenantId} AND id IN ${sql(ids)}` : [];
  const byId = new Map((props as any[]).map(p => [p.id, p]));
  const fu = a.lead_follow_up;
  return {
    id: a.id, kind: a.kind, status: a.status, at: a.at, name: a.name, phone: a.phone, createdAt: a.created_at, count: a.count,
    lead: { id: a.lead_id, name: a.lead_name || null, phone: a.lead_phone || null },
    // What the lead already has booked, unless it is this very visit.
    booked: fu && !(a.kind === 'visit' && fu.at && a.at && new Date(fu.at).getTime() === new Date(a.at).getTime()) ? bookedLine(fu, desk) : null,
    home: a.property_id && byId.get(a.property_id) ? { id: a.property_id, title: flatLabel(byId.get(a.property_id), loc) } : null,
    ask: a.ask ? askLine(a.ask, loc) : null,
    homes: fresh.filter(h => byId.has(h)).map(h => ({ id: h, title: flatLabel(byId.get(h), loc) })),
  };
}

/**
 * POST /buyer-asks/:id/confirm {replace?} — a requested visit becomes the
 * lead's booked site visit. The holder or the desk. A lead has one booking:
 * if something else is already booked it is never replaced silently — 409
 * with what is booked, and the person says Replace (replace: true).
 */
export async function confirmVisit(id: string, input: { replace?: boolean } = {}) {
  const m = me();
  const a = await askFor(m, id);
  if (a.kind !== 'visit') throw new ShareError(400, 'not_a_visit');
  if (!isDeskRole(m.role) && a.agent_id !== m.userId) throw new ShareError(403, 'forbidden', 'Only the person holding this lead, or the office, can confirm it.');
  if (a.status === 'confirmed') return { ok: true, already: true };
  if (new Date(a.at).getTime() < Date.now()) throw new ShareError(409, 'visit_passed', 'That time has passed. Pick another time.');
  const desk = await deskConfigOf(m.tenantId);
  const fu = a.lead_follow_up;
  const same = fu?.at && new Date(fu.at).getTime() === new Date(a.at).getTime();
  if (fu && !same && input.replace !== true) {
    const booked = bookedLine(fu, desk);
    throw new ShareError(409, 'booking_exists', `Already booked: ${booked}.`, { booked });
  }
  const w = wall(new Date(a.at), desk.timezone);
  const loc = await localeOf(m.tenantId);
  const [p] = a.property_id ? await sql`SELECT ${SHOWN_COLUMNS} FROM crm_properties WHERE tenant_id = ${m.tenantId} AND id = ${a.property_id}` : [null];
  await updateLead(a.lead_id, {
    followUp: { action: 'Site Visit', at: new Date(a.at).toISOString(), date: w.ymd, time: ampm(w.h), note: p ? `Asked on the link · ${flatLabel(p, loc)}` : 'Asked on the link' },
  }, { actorType: 'user', actorId: m.userId, actorLabel: null } as any);
  await sql`UPDATE crm_buyer_asks SET status = 'confirmed', updated_at = NOW() WHERE tenant_id = ${m.tenantId} AND id = ${id}`;
  return { ok: true };
}

// ── New homes like these: the match ─────────────────────────────────────────

/** An ask nobody has acted on for this long stops matching. */
const HOMES_ASK_DAYS = 60;
/** Asks looked at per firm per run; the rest wait for the next run (oldest-looked-at first). */
const HOMES_PER_RUN = 200;

/**
 * For each open ask on an open lead, the catalogue homes that match now.
 * SEEN is what matched last time and still does: a home that left (taken,
 * out of the catalogue) drops out of it, so if it comes back it is new again.
 * New ones → one alert to the holder, at most one per lead per day; within the
 * day they wait (not yet seen) and are still new tomorrow.
 */
export async function matchNewHomes(tenantId: string, max = HOMES_PER_RUN): Promise<number> {
  await sql`UPDATE crm_buyer_asks SET status = 'expired', updated_at = NOW()
             WHERE tenant_id = ${tenantId} AND kind = 'homes' AND status = 'open'
               AND created_at < NOW() - make_interval(days => ${HOMES_ASK_DAYS})`;
  const asks = await sql`
    SELECT a.*, l.name AS lead_name, l.phone AS lead_phone, l.agent_id
      FROM crm_buyer_asks a JOIN crm_leads l ON l.tenant_id = a.tenant_id AND l.id = a.lead_id
     WHERE a.tenant_id = ${tenantId} AND a.kind = 'homes' AND a.status = 'open'
       AND lower(coalesce(l.stage, '')) NOT IN ${sql(TERMINAL_STATUSES.map(s => s.toLowerCase()))}
     ORDER BY a.updated_at ASC NULLS FIRST LIMIT ${max}`;
  if (!asks.length) return 0;
  const keyed = await catalogueKeyed(tenantId, await localeOf(tenantId));
  let sent = 0;
  for (const a of asks as any[]) {
    if (!hasFacet(a.ask)) { await sql`UPDATE crm_buyer_asks SET status = 'expired', updated_at = NOW() WHERE tenant_id = ${tenantId} AND id = ${a.id}`; continue; }
    const now = await matchesNow(tenantId, a.ask, keyed);
    const seen = (a.seen_ids || []).filter((h: string) => now.includes(h));
    const fresh = now.filter(h => !seen.includes(h));
    const mayAlert = !a.last_alert_at || Date.now() - new Date(a.last_alert_at).getTime() >= 24 * 3600 * 1000;
    if (fresh.length && mayAlert) {
      const [holder] = a.agent_id ? await sql`SELECT id FROM users WHERE tenant_id = ${tenantId} AND id = ${a.agent_id} AND status ILIKE 'active' AND deleted_at IS NULL` : [null];
      const reached = await notifyOrDesk(holder?.id || null, {
        tenantId, type: 'buyer_new_homes',
        data: { name: a.lead_name || a.lead_phone, n: fresh.length },
        link: `?screen=leads&lead=${a.lead_id}&ask=${a.id}`,
        record: { kind: 'lead', ids: [a.lead_id] },
      });
      if (!reached) console.warn(`[Asks] new homes for ${a.id} (tenant ${tenantId}) reached nobody`);
      await sql`UPDATE crm_buyer_asks SET seen_ids = ${[...seen, ...fresh]}, alerted_ids = ${fresh},
                       last_alert_at = NOW(), updated_at = NOW() WHERE tenant_id = ${tenantId} AND id = ${a.id}`;
      sent++;
    } else {
      await sql`UPDATE crm_buyer_asks SET seen_ids = ${seen}, updated_at = NOW() WHERE tenant_id = ${tenantId} AND id = ${a.id}`;
    }
  }
  return sent;
}

// ── The sweep's part ────────────────────────────────────────────────────────

const HOMES_MATCH_MS = 60 * 60 * 1000;
const lastHomesMatch = new Map<string, number>();
const running = new Set<string>();

/**
 * Called by the scheduled sweep for each firm (notifications.ts), not awaited
 * there: an ask a restart cut off is told, and New homes like these is matched
 * at most hourly. One run per firm at a time. `force` (a one-firm script) skips
 * the hourly clock. CRM_NO_SWEEPS=1 stops it with the sweep.
 */
export async function buyerAskSweep(tenantId: string, { force = false }: { force?: boolean } = {}): Promise<void> {
  if (running.has(tenantId)) return;
  running.add(tenantId);
  try {
    // The sweep runs from a bare timer: no request context, so this firm's
    // is set here, or anything reading the tenant from it (the timeline, a
    // lead read) would fall back to the demo tenant.
    await asSystem(tenantId, async () => {
      const late = await tellUntold(tenantId);
      if (late) console.log(`[Asks] ${tenantId}: ${late} ask(s) told late`);
      if (force || Date.now() - (lastHomesMatch.get(tenantId) || 0) > HOMES_MATCH_MS) {
        lastHomesMatch.set(tenantId, Date.now());
        const n = await matchNewHomes(tenantId);
        if (n) console.log(`[Asks] ${tenantId}: ${n} buyer(s) told of new homes`);
      }
    });
  } catch (err: any) {
    console.warn(`[Asks] ${tenantId}: sweep failed:`, err?.message);
  } finally {
    running.delete(tenantId);
  }
}
