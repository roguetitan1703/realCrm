/**
 * ============================================================================
 * WHERE A PIPELINE ENDS — conversion, and the agreement it becomes
 * ============================================================================
 * Two buttons, one shape. Each sits on the FINAL stage of its pipeline
 * (src/data/pipelineRoles.js), opens a form filled in from the record, and on
 * confirm writes the business record and links it back:
 *
 *   Convert to property   a calling row the owner has handed keys for
 *                         → a property we manage, the owner in Contacts.
 *   Close the deal        a lead who rented or bought
 *                         → an Agreement (rent | sale), the lead in Contacts
 *                           as a tenant or a buyer, the flat Leased or Sold.
 *
 * Setting a status never converts anything on its own (decided 24 Sep): the
 * form asks for what the status cannot say — the rent, the date, which flat.
 * Pressing either button twice cannot make a second record.
 *
 * AN AGREEMENT is one record of two kinds. A rent has an end date (11 months
 * from the start unless said otherwise), is renewed into a NEW agreement that
 * points at the old one (the old one is kept, marked renewed), and warns its
 * agent 30 days before it ends. A sale has none of that. It replaces the
 * `tenancy` blob on a property: no rent, no document, one per flat overwritten
 * at renewal, a tenant who was a string. See docs/specs/mahalaxmi-batch.md "D".
 * ============================================================================
 */
import { sql } from './db.js';
import { getContext } from './context.js';
import { audit } from './audit.js';
import {
  createProperty, prepareListing, updateLead, getLeadById, addTimelineEvent, getSettings, projectNorm,
  type ActorCtx,
} from './store.js';
import { finalStageOf } from '../../../src/data/pipelineRoles.js';

export type AgreementKind = 'rent' | 'sale';

/** A refusal the person can act on — the route turns it into a 400/409. */
export class AgreementError extends Error {
  constructor(message: string, public status = 400, public existingId: string | null = null) { super(message); }
}

const tid = () => {
  const t = getContext()?.tenantId;
  if (!t) throw new Error('No workspace on this request.');
  return t;
};
const actorOf = (ctx: ActorCtx) => ctx.actorId ?? getContext()?.userId ?? null;
const money = (v: any): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(String(v).replace(/[^0-9.]/g, ''));
  return Number.isFinite(n) && n > 0 ? n : null;
};
const ymd = (v: any): string | null => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
const rupees = (n: number | null) => (n == null ? '' : `₹${Math.round(n).toLocaleString('en-IN')}`);

/** How a flat is named in a sentence: "Blue Ridge A-402", or the typed label. */
function flatLabel(p: any, fallback?: string | null): string {
  if (!p) return fallback || 'a flat outside our inventory';
  const unit = [p.wing, p.unit_no].filter(Boolean).join('-');
  return [p.project, unit].filter(Boolean).join(' ') || p.title || fallback || 'the flat';
}

const SELECT = sql`
  SELECT a.*, to_char(a.start_date, 'YYYY-MM-DD') AS start_ymd, to_char(a.end_date, 'YYYY-MM-DD') AS end_ymd,
         p.title AS p_title, p.project AS p_project, p.wing AS p_wing, p.unit_no AS p_unit, p.status AS p_status,
         l.id AS l_id, l.name AS l_name, l.phone AS l_phone,
         o.name AS o_name, o.phone AS o_phone,
         (a.end_date - (now() AT TIME ZONE 'Asia/Kolkata')::date) AS days_left
    FROM crm_agreements a
    LEFT JOIN crm_properties p ON p.id = a.property_id AND p.tenant_id = a.tenant_id
    LEFT JOIN crm_leads l ON l.id = a.lead_id AND l.tenant_id = a.tenant_id
    LEFT JOIN crm_owners o ON o.id = a.owner_id AND o.tenant_id = a.tenant_id`;

export function rowToAgreement(r: any) {
  const property = r.property_id
    ? { id: r.property_id, title: r.p_title, project: r.p_project, wing: r.p_wing, unitNo: r.p_unit, status: r.p_status }
    : null;
  return {
    id: r.id, kind: r.kind as AgreementKind, status: r.status,
    propertyId: r.property_id || null, property,
    flat: flatLabel(property ? { project: r.p_project, wing: r.p_wing, unit_no: r.p_unit, title: r.p_title } : null, r.property_label),
    propertyLabel: r.property_label || null,
    // The lead they came from, while it exists. Only a link: deleting the lead
    // or editing it does not change who signed.
    leadId: r.l_id || null,
    lead: r.l_id ? { id: r.l_id, name: r.l_name || null, phone: r.l_phone || null } : null,
    // THE TENANT OR BUYER, as the agreement names them. Copied from the lead
    // when the deal closed (createAgreement) and edited here, never read live
    // from the lead: a lead can be renamed, reopened or deleted, and none of
    // that changes who signed. The lead is the fallback only for a row saved
    // before the copy existed.
    party: { name: r.party_name || r.l_name || null, phone: r.party_phone || r.l_phone || null },
    ownerId: r.owner_id || null,
    owner: r.owner_id ? { name: r.o_name || null, phone: r.o_phone || null } : null,
    agentId: r.agent_id || null,
    amount: r.amount != null ? Number(r.amount) : null,
    deposit: r.deposit != null ? Number(r.deposit) : null,
    startDate: r.start_ymd || null, endDate: r.end_ymd || null,
    daysLeft: r.days_left != null ? Number(r.days_left) : null,
    fileKey: r.file_key || null, fileName: r.file_name || null,
    renewsId: r.renews_id || null, notes: r.notes || null,
    createdAt: r.created_at, createdBy: r.created_by || null,
  };
}

/** "Ending soon": a live rent ending within this many days, or already past its end. */
export const ENDING_SOON_DAYS = 30;
const TODAY_IST = sql`(now() AT TIME ZONE 'Asia/Kolkata')::date`;

export async function listAgreements(opts: {
  kind?: string; status?: string; leadId?: string; propertyId?: string; ownerId?: string; agentId?: string;
  q?: string; sort?: string; dir?: string; page?: number; limit?: number;
} = {}) {
  const t = tid();
  const limit = Math.min(Math.max(Number(opts.limit) || 25, 1), 200);
  const page = Math.max(Number(opts.page) || 1, 1);
  const where: any[] = [sql`a.tenant_id = ${t}`];
  if (opts.kind === 'rent' || opts.kind === 'sale') where.push(sql`a.kind = ${opts.kind}`);
  // `status` is what the Tenants and Buyers lists filter by. "ending" is the
  // renewal work: a live rent that ends within ENDING_SOON_DAYS or is past its
  // end with nobody having renewed or ended it. "past" is ended or renewed.
  if (opts.status === 'ending') {
    where.push(sql`a.kind = 'rent' AND a.status = 'active' AND a.end_date IS NOT NULL AND a.end_date <= ${TODAY_IST} + ${ENDING_SOON_DAYS}::int`);
  } else if (opts.status === 'past') {
    where.push(sql`a.status IN ('ended', 'renewed')`);
  } else if (opts.status && opts.status !== 'all') {
    where.push(sql`a.status = ${opts.status}`);
  }
  if (opts.agentId) where.push(opts.agentId === '_none' ? sql`a.agent_id IS NULL` : sql`a.agent_id = ${opts.agentId}`);
  if (opts.leadId) where.push(sql`a.lead_id = ${opts.leadId}`);
  if (opts.propertyId) where.push(sql`a.property_id = ${opts.propertyId}`);
  if (opts.ownerId) where.push(sql`a.owner_id = ${opts.ownerId}`);
  const q = String(opts.q || '').trim().toLowerCase();
  if (q) {
    const like = `%${q}%`;
    where.push(sql`(lower(coalesce(a.party_name, l.name, '')) LIKE ${like} OR coalesce(a.party_phone, l.phone, '') LIKE ${like}
      OR lower(coalesce(p.project, a.property_label, '')) LIKE ${like} OR lower(coalesce(p.unit_no, '')) LIKE ${like})`);
  }
  const clause = where.reduce((acc, f, i) => (i === 0 ? f : sql`${acc} AND ${f}`));
  // Default: live rents by how soon they end (the order a desk works renewals
  // in), then everything else newest first.
  const dir = opts.dir === 'desc' ? sql`DESC` : sql`ASC`;
  const order = opts.sort === 'name' ? sql`lower(coalesce(a.party_name, l.name, '')) ${dir}, a.created_at DESC`
    : opts.sort === 'start' ? sql`a.start_date ${dir} NULLS LAST, a.created_at DESC`
    : opts.sort === 'amount' ? sql`a.amount ${dir} NULLS LAST, a.created_at DESC`
    : sql`(a.kind = 'rent' AND a.status = 'active') DESC, a.end_date ${dir} NULLS LAST, a.created_at DESC`;
  const rows = await sql`
    ${SELECT} WHERE ${clause}
    ORDER BY ${order}
    LIMIT ${limit} OFFSET ${(page - 1) * limit}`;
  const [{ n }] = await sql`
    SELECT count(*)::int AS n FROM crm_agreements a
      LEFT JOIN crm_properties p ON p.id = a.property_id AND p.tenant_id = a.tenant_id
      LEFT JOIN crm_leads l ON l.id = a.lead_id AND l.tenant_id = a.tenant_id
     WHERE ${clause}`;
  // The counts beside the status filter, for one kind. Same table, same kind,
  // none of the other filters: they say how many of each there are.
  let counts: Record<string, number> | undefined;
  if (opts.kind === 'rent' || opts.kind === 'sale') {
    const [c] = await sql`
      SELECT count(*) FILTER (WHERE status = 'active')::int AS active,
             count(*) FILTER (WHERE kind = 'rent' AND status = 'active' AND end_date IS NOT NULL
                                AND end_date <= ${TODAY_IST} + ${ENDING_SOON_DAYS}::int)::int AS ending,
             count(*) FILTER (WHERE status IN ('ended', 'renewed'))::int AS past,
             count(*)::int AS "all"
        FROM crm_agreements WHERE tenant_id = ${t} AND kind = ${opts.kind}`;
    counts = c as any;
  }
  return { rows: rows.map(rowToAgreement), total: n, page, limit, counts };
}

export async function getAgreement(id: string) {
  const [r] = await sql`${SELECT} WHERE a.tenant_id = ${tid()} AND a.id = ${id}`;
  return r ? rowToAgreement(r) : null;
}

/**
 * CLOSE THE DEAL — and record the agreement it made.
 *
 * `leadId` is the lead closing; without one this records an agreement for a
 * party typed in (`partyName`), which is what a renewal and the old tenancy
 * blob need. A lead that already has a live agreement is refused, with its id,
 * so a second press opens the first rather than writing another.
 */
export async function createAgreement(input: any, ctx: ActorCtx = {}, opts: { renews?: any } = {}) {
  const t = tid();
  const kind: AgreementKind = input.kind === 'sale' ? 'sale' : input.kind === 'rent' ? 'rent' : (() => {
    throw new AgreementError('Say whether it was a rent or a sale.');
  })();
  const amount = money(input.amount);
  if (!amount) throw new AgreementError(kind === 'rent' ? 'Add the rent per month.' : 'Add the sale price.');
  const start = ymd(input.startDate);
  if (!start) throw new AgreementError(kind === 'rent' ? 'Add the date the agreement starts.' : 'Add the date of the sale.');
  const end = kind === 'rent' ? (ymd(input.endDate) || null) : null;
  if (end && end <= start) throw new AgreementError('The end date is before the start.');

  const lead = input.leadId ? await getLeadById(input.leadId) : null;
  if (input.leadId && !lead) throw new AgreementError('That lead is not in this workspace.', 404);
  if (lead && !opts.renews) {
    const [live] = await sql`SELECT id FROM crm_agreements WHERE tenant_id = ${t} AND lead_id = ${lead.id} AND status = 'active' LIMIT 1`;
    if (live) throw new AgreementError('This deal is already recorded.', 409, live.id);
  }
  // Who signed, copied onto the agreement — see rowToAgreement. The form fills
  // it from the lead and the person may correct it.
  const partyName = String(input.partyName ?? '').trim() || lead?.name || null;
  const partyPhone = String(input.partyPhone ?? '').trim() || lead?.phone || null;
  if (!partyName && !partyPhone) throw new AgreementError(`Add the ${kind === 'rent' ? 'tenant' : 'buyer'}'s name.`);

  let [property] = input.propertyId
    ? await sql`SELECT * FROM crm_properties WHERE tenant_id = ${t} AND id = ${input.propertyId}`
    : [null];
  if (input.propertyId && !property) throw new AgreementError('That flat is not in this workspace.', 404);
  // NOT ONE OF OUR FLATS: the form sends the flat's details and it becomes a
  // property record, let or sold from the start. The firm did the deal, so the
  // flat is now one it knows, and a renewal or a resale has somewhere to live.
  if (!property && input.newProperty && typeof input.newProperty === 'object') {
    const np = { ...input.newProperty };
    if (!String(np.locality || '').trim()) throw new AgreementError('Add the locality of the flat.');
    if (!np.bhk && !np.subtype && !np.type) throw new AgreementError('Add what kind of flat it is.');
    const created = await createProperty(prepareListing({
      ...np, deal: kind, status: kind === 'rent' ? 'Leased' : 'Sold', price: amount, source: 'Agreement',
    }), ctx);
    [property] = await sql`SELECT * FROM crm_properties WHERE tenant_id = ${t} AND id = ${created.id}`;
  }
  const label = property ? null : (String(input.propertyLabel || '').trim() || null);
  if (!property && !label) throw new AgreementError('Pick the flat, or add its details if it is not one of ours.');

  const id = `agr_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const actor = actorOf(ctx);
  await sql`
    INSERT INTO crm_agreements (id, tenant_id, kind, status, property_id, property_label, owner_id, lead_id,
      party_name, party_phone, agent_id, amount, deposit, start_date, end_date, file_key, file_name, renews_id, notes, created_by)
    VALUES (${id}, ${t}, ${kind}, 'active', ${property?.id ?? null}, ${label}, ${property?.owner_contact_id ?? input.ownerId ?? null},
      ${lead?.id ?? null}, ${partyName}, ${partyPhone},
      ${lead?.agentId ?? input.agentId ?? actor}, ${amount}, ${money(input.deposit)},
      ${start}::date,
      -- Eleven months is the leave-and-licence term nearly every Pune rent is
      -- written for; a different one is typed in.
      ${kind === 'rent' ? (end ? sql`${end}::date` : sql`(${start}::date + interval '11 months')::date`) : null},
      ${input.fileKey || null}, ${input.fileName || null}, ${opts.renews?.id ?? null},
      ${String(input.notes || '').trim() || null}, ${actor})`;

  // The flat is let or sold. Its status says so, so it stops showing as
  // available to the next buyer the desk matches against it.
  if (property) {
    const status = kind === 'rent' ? 'Leased' : 'Sold';
    await sql`UPDATE crm_properties SET status = ${status} WHERE tenant_id = ${t} AND id = ${property.id}`;
  }

  const saved = await getAgreement(id);
  const what = kind === 'rent'
    ? `${opts.renews ? 'Renewed' : 'Rented'} ${saved!.flat} · ${rupees(amount)}/month from ${start}${saved!.endDate ? ` to ${saved!.endDate}` : ''}`
    : `Bought ${saved!.flat} · ${rupees(amount)} on ${start}`;
  if (lead) {
    // The status follows the deal, through updateLead so the change is
    // attributed and timed like any other — not the other way round.
    const settings = await getSettings();
    const final = finalStageOf(settings, 'leads');
    if (lead.stage !== final) await updateLead(lead.id, { stage: final }, ctx);
    await addTimelineEvent({ record_id: lead.id, type: 'agreement', title: 'Deal closed', description: what,
      author: actor || 'System', metadata: { agreementId: id, kind } });
  }
  if (property) {
    await addTimelineEvent({ record_id: property.id, type: 'agreement', title: kind === 'rent' ? 'Let' : 'Sold',
      description: `${what}, to ${saved!.party.name || 'the ' + (kind === 'rent' ? 'tenant' : 'buyer')}`,
      author: actor || 'System', metadata: { agreementId: id, kind } });
  }
  audit({
    tenant_id: t, actor_type: ctx.actorType || 'user', actor_id: actor, actor_label: ctx.actorLabel ?? null,
    action: opts.renews ? 'agreement.renew' : 'agreement.create', target_type: 'agreement', target_id: id,
    summary: what, metadata: { kind, leadId: lead?.id ?? null, propertyId: property?.id ?? null, renews: opts.renews?.id ?? null },
    ip: ctx.ip, user_agent: ctx.userAgent,
  });
  return saved;
}

/** Fields that may be corrected after the fact. Kind, flat and party may not. */
export async function updateAgreement(id: string, patch: any, ctx: ActorCtx = {}) {
  const t = tid();
  const before = await getAgreement(id);
  if (!before) throw new AgreementError('Not found.', 404);
  const next: Record<string, any> = {};
  if (patch.amount !== undefined) { const a = money(patch.amount); if (!a) throw new AgreementError('The amount cannot be empty.'); next.amount = a; }
  if (patch.deposit !== undefined) next.deposit = money(patch.deposit);
  if (patch.startDate !== undefined) { const s = ymd(patch.startDate); if (!s) throw new AgreementError('The start date cannot be empty.'); next.start_date = s; }
  if (patch.endDate !== undefined) next.end_date = before.kind === 'rent' ? ymd(patch.endDate) : null;
  if (patch.fileKey !== undefined) { next.file_key = patch.fileKey || null; next.file_name = patch.fileName || null; }
  if (patch.notes !== undefined) next.notes = String(patch.notes || '').trim() || null;
  if (patch.partyName !== undefined) {
    const n = String(patch.partyName || '').trim();
    if (!n) throw new AgreementError('The name cannot be empty.');
    next.party_name = n;
  }
  if (patch.partyPhone !== undefined) next.party_phone = String(patch.partyPhone || '').trim() || null;
  if (!Object.keys(next).length) return before;
  const start = next.start_date ?? before.startDate;
  const end = next.end_date !== undefined ? next.end_date : before.endDate;
  if (end && start && end <= start) throw new AgreementError('The end date is before the start.');
  await sql`UPDATE crm_agreements SET ${sql(next)}, updated_at = NOW() WHERE tenant_id = ${t} AND id = ${id}`;
  audit({
    tenant_id: t, actor_type: ctx.actorType || 'user', actor_id: actorOf(ctx), actor_label: ctx.actorLabel ?? null,
    action: 'agreement.update', target_type: 'agreement', target_id: id,
    summary: `Agreement for ${before.flat} updated`, metadata: { patch: next },
  });
  return getAgreement(id);
}

/**
 * RENEW a rent: a NEW agreement for the next term, pointing at this one, which
 * is kept and marked renewed. Overwriting the dates in place is what the old
 * tenancy blob did, and it is how a firm lost what the rent used to be.
 */
export async function renewAgreement(id: string, input: any, ctx: ActorCtx = {}) {
  const old = await getAgreement(id);
  if (!old) throw new AgreementError('Not found.', 404);
  if (old.kind !== 'rent') throw new AgreementError('Only a rent is renewed.');
  if (old.status !== 'active') throw new AgreementError('This agreement is no longer running.');
  const start = ymd(input.startDate) || old.endDate;
  if (!start) throw new AgreementError('Add the date the new term starts.');
  // Marked first, so the one-live-agreement-per-lead rule does not refuse the
  // renewal as a duplicate of the agreement it replaces.
  await sql`UPDATE crm_agreements SET status = 'renewed', updated_at = NOW() WHERE tenant_id = ${tid()} AND id = ${id}`;
  try {
    return await createAgreement({
      kind: 'rent', leadId: old.leadId, propertyId: old.propertyId, propertyLabel: old.propertyLabel,
      partyName: old.party.name, partyPhone: old.party.phone,
      ownerId: old.ownerId, agentId: old.agentId,
      amount: input.amount ?? old.amount, deposit: input.deposit ?? old.deposit,
      startDate: start, endDate: input.endDate, fileKey: input.fileKey, fileName: input.fileName, notes: input.notes,
    }, ctx, { renews: old });
  } catch (e) {
    await sql`UPDATE crm_agreements SET status = 'active' WHERE tenant_id = ${tid()} AND id = ${id}`;
    throw e;
  }
}

/** A rent that ended (tenant moved out) or a record made in error. */
export async function endAgreement(id: string, ctx: ActorCtx = {}) {
  const t = tid();
  const a = await getAgreement(id);
  if (!a) throw new AgreementError('Not found.', 404);
  if (a.status !== 'active') return a;
  await sql`UPDATE crm_agreements SET status = 'ended', updated_at = NOW() WHERE tenant_id = ${t} AND id = ${id}`;
  // The flat is free again — unless another live rent still holds it.
  if (a.kind === 'rent' && a.propertyId) {
    await sql`
      UPDATE crm_properties SET status = 'Available'
       WHERE tenant_id = ${t} AND id = ${a.propertyId} AND status = 'Leased'
         AND NOT EXISTS (SELECT 1 FROM crm_agreements x WHERE x.tenant_id = ${t} AND x.property_id = ${a.propertyId}
                          AND x.kind = 'rent' AND x.status = 'active')`;
  }
  const line = `${a.kind === 'rent' ? 'Tenancy' : 'Sale'} of ${a.flat} ended`;
  if (a.leadId) await addTimelineEvent({ record_id: a.leadId, type: 'agreement', title: 'Agreement ended', description: line, author: actorOf(ctx) || 'System', metadata: { agreementId: id } });
  if (a.propertyId) await addTimelineEvent({ record_id: a.propertyId, type: 'agreement', title: 'Agreement ended', description: line, author: actorOf(ctx) || 'System', metadata: { agreementId: id } });
  audit({ tenant_id: t, actor_type: ctx.actorType || 'user', actor_id: actorOf(ctx), actor_label: ctx.actorLabel ?? null,
    action: 'agreement.end', target_type: 'agreement', target_id: id, summary: line, metadata: {} });
  return getAgreement(id);
}

/**
 * CONVERT TO PROPERTY — the owner has handed over the keys.
 *
 * The flat is identified the way the import identifies it: project (any
 * spelling, projectNorm) + tower + unit. If that flat is already in Properties
 * this links to it instead of making a second; otherwise it is created through
 * createProperty, so it gets every rule a hand-entered listing gets. Either
 * way the flat's owner IS this calling row — which is what puts them in
 * Contacts → Owners — and the row remembers what it became.
 */
export async function convertOwner(ownerId: string, input: any, ctx: ActorCtx = {}) {
  const t = tid();
  const [o] = await sql`SELECT * FROM crm_owners WHERE tenant_id = ${t} AND id = ${ownerId}`;
  if (!o) throw new AgreementError('That owner is not in this workspace.', 404);
  const final = finalStageOf(await getSettings(), 'calling');
  if ((o.stage || 'New') !== final) throw new AgreementError(`Move them to "${final}" first.`);

  if (o.converted_property_id) {
    const [p] = await sql`SELECT id FROM crm_properties WHERE tenant_id = ${t} AND id = ${o.converted_property_id}`;
    if (p) throw new AgreementError('Already in Properties.', 409, p.id);
  }
  // THE PROPERTY FORM'S OWN FIELDS (PropertyWizard, opened from the calling
  // row and filled in from it), so a converted flat is described exactly as a
  // hand-added one: property type and BHK from the catalogue, not a typed
  // "1 BHK Independent House".
  const f = { ...(input.property || input) };
  const deal = f.deal === 'rent' || f.deal === 'sale' ? f.deal : null;
  if (!deal) throw new AgreementError('Say whether the owner wants to rent it out or sell it.');
  if (!String(f.locality || '').trim()) throw new AgreementError('Add the locality.');
  if (!f.bhk && !f.subtype && !f.type) throw new AgreementError('Add the property type.');
  const project = String(f.society ?? f.project ?? o.project ?? '').trim() || null;
  const tower = String(f.tower ?? f.wing ?? o.tower ?? '').trim() || null;
  const unitNo = String(f.unit ?? f.unitNo ?? o.unit_no ?? '').trim() || null;

  // THE SAME FLAT, if we already list it.
  const [same] = unitNo ? await sql`
    SELECT id FROM crm_properties
     WHERE tenant_id = ${t}
       AND ${projectNorm(sql`project`)} = ${projectNorm(sql`${project || ''}::text`)}
       AND lower(replace(coalesce(wing, ''), ' ', '')) = lower(replace(${tower || ''}, ' ', ''))
       AND lower(coalesce(unit_no, '')) = lower(${unitNo})
     LIMIT 1` : [];

  const actor = actorOf(ctx);
  const keyNote = `Key with us, received from ${o.name || 'the owner'}`;
  let propertyId: string;
  let attached = false;
  if (same) {
    propertyId = same.id;
    attached = true;
    // Fill blanks only; a listing somebody has been working keeps its words.
    await sql`
      UPDATE crm_properties SET
        owner_contact_id = coalesce(owner_contact_id, ${o.id}),
        key_access = coalesce(nullif(key_access, ''), ${keyNote})
       WHERE tenant_id = ${t} AND id = ${propertyId}`;
  } else {
    const created = await createProperty(prepareListing({
      ...f,
      society: project || undefined, project: project || undefined,
      tower: tower || undefined, wing: tower || undefined,
      unit: unitNo || undefined, unit_no: unitNo || undefined,
      deal, status: 'Available',
      carpet: f.carpet ?? o.carpet_area ?? undefined,
      owner: o.name || null, ownerPhone: o.phone || null, ownerEmail: o.email || null,
      keyAccess: f.keyAccess || keyNote,
      source: 'Calling',
    }), ctx);
    propertyId = created.id;
    // createProperty links the owner it finds by flat; this row IS the owner,
    // said explicitly so a near-miss in that lookup cannot pick someone else.
    await sql`UPDATE crm_properties SET owner_contact_id = ${o.id} WHERE tenant_id = ${t} AND id = ${propertyId}`;
  }
  await sql`UPDATE crm_owners SET converted_property_id = ${propertyId}, updated_at = NOW() WHERE tenant_id = ${t} AND id = ${o.id}`;

  const [p] = await sql`SELECT * FROM crm_properties WHERE tenant_id = ${t} AND id = ${propertyId}`;
  const flat = flatLabel(p);
  await addTimelineEvent({ record_id: o.id, type: 'agreement', title: 'Converted to property',
    description: `${flat} is in Properties${attached ? ' (it was already listed)' : ''}`, author: actor || 'System',
    metadata: { propertyId, attached } });
  await addTimelineEvent({ record_id: propertyId, type: 'agreement', title: 'From Calling',
    description: `${o.name || 'The owner'} handed over the key`, author: actor || 'System', metadata: { ownerId: o.id } });
  audit({ tenant_id: t, actor_type: ctx.actorType || 'user', actor_id: actor, actor_label: ctx.actorLabel ?? null,
    action: 'owner.convert', target_type: 'owner', target_id: o.id,
    summary: `${o.name || 'Owner'} converted: ${flat}${attached ? ' (linked to the existing listing)' : ''}`,
    metadata: { propertyId, attached } });
  return { propertyId, attached, flat };
}

/**
 * RENTS ENDING — Today's "Tenancies expiring" group: every live rent that ends
 * within 60 days or has already run past its end without being renewed or
 * ended. An agent sees the ones they are on; the desk sees the firm's.
 */
export async function rentsEnding(limit = 50) {
  const c = getContext();
  const mine = c?.role === 'agent' && c.userId ? sql`AND a.agent_id = ${c.userId}` : sql``;
  const rows = await sql`
    ${SELECT}
     WHERE a.tenant_id = ${tid()} AND a.kind = 'rent' AND a.status = 'active' AND a.end_date IS NOT NULL
       AND a.end_date <= (now() AT TIME ZONE 'Asia/Kolkata')::date + 60 ${mine}
     ORDER BY a.end_date ASC LIMIT ${limit}`;
  return rows.map(rowToAgreement);
}

/**
 * The tenants and buyers — Contacts' other two tabs. A person is here because
 * an agreement names them; one row per agreement, newest running first.
 */
export async function listParties(kind: AgreementKind, opts: { q?: string; page?: number; limit?: number } = {}) {
  return listAgreements({ kind, q: opts.q, page: opts.page, limit: opts.limit });
}

/**
 * THE OLD TENANCY BLOB, moved into agreements once. Measured 24 Sep: one row
 * on either database, on `urban` (a demo firm); none on a paying one. Its
 * tenant was a string, so it becomes a party name, not a lead. The blob itself
 * is left where it is — nothing reads it any more, and deleting data is not
 * what a migration is for.
 */
export async function migrateTenancyBlobs(): Promise<number> {
  const rows = await sql`
    SELECT id, tenant_id, tenancy, owner_contact_id FROM crm_properties
     WHERE tenancy IS NOT NULL AND tenancy::text NOT IN ('null', '{}')
       AND NOT EXISTS (SELECT 1 FROM crm_agreements a WHERE a.property_id = crm_properties.id AND a.notes = 'Moved from the old tenancy record')`;
  let n = 0;
  for (const r of rows as any[]) {
    const tn = r.tenancy || {};
    // Two shapes exist: the form wrote { tenant, phone, start, end, deposit };
    // the demo seed wrote { tenant, tenantPhone, startDate, endDate, rent, deposit }.
    // The v1 of this migration read only the first and moved nothing.
    const start = ymd(tn.start) || ymd(tn.startDate) || null;
    const end = ymd(tn.end) || ymd(tn.endDate) || null;
    if (!tn.tenant || !start) continue;
    await sql`
      INSERT INTO crm_agreements (id, tenant_id, kind, status, property_id, owner_id, party_name, party_phone,
        agent_id, amount, deposit, start_date, end_date, notes)
      VALUES (${`agr_m_${r.id}`}, ${r.tenant_id}, 'rent', 'active', ${r.id}, ${r.owner_contact_id || null},
        ${String(tn.tenant)}, ${tn.phone || tn.tenantPhone || null}, ${tn.agentId || null}, ${money(tn.rent)}, ${money(tn.deposit)},
        ${start}::date, ${end}::date, 'Moved from the old tenancy record')
      ON CONFLICT (id) DO NOTHING`;
    n++;
  }
  return n;
}
