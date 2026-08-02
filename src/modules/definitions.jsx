// ============================================================================
// MODULE DEFINITIONS — the single source of truth for every CRM module.
// One MODULE_DEFINITION per module drives: list columns, search, filters, sort,
// and the standardized action set. The detail record-sheet fields live in
// ../components/ModuleFields.jsx (schemas) and are referenced here so a module
// is described in exactly one place. Add a module, or a field/filter/sort/action
// to a module, by editing config here — never by hand-rolling a screen.
//
// Shape:
//   {
//     id, name, singularName,
//     schema,                       // record-sheet schema (fields for detail view)
//     searchFields: [dotPath],      // generic search predicate
//     filterFields: [{key,label,icon,multi?,options|optionsFrom(store)}],  // → FilterBar
//     sortOptions:  [{key,label,value(record,store)}],                     // → SortControl
//     columns:      [{key,label,sortable?,render(record,store)}],          // → Table
//     rowMatch(record, filterKey, selectedValues, store) → bool  (optional per-key filter)
//     actions:      [{id,label,icon,group,tone,row?,run(store,record,ctx)}] // → ActionRail / row
//   }
// ============================================================================

import React from 'react'
import { LEAD_MODULE_SCHEMA, PROPERTY_MODULE_SCHEMA, CLIENT_MODULE_SCHEMA } from '../components/ModuleFields.jsx'
import { StageTag, StatusTag, Source, Overdue, Unassigned, Avatar, Money, Quoted, Button } from '../components/primitives.jsx'
import { QuickAssignMenu } from '../components/collections.jsx'
import { getNestedValue } from '../components/ModuleFields.jsx'
import { reqShort, budgetRange, quotedLine, unitLabel, thumbTint, initials, projectOf, fmtMoney, configLabel } from '../lib/format.js'
import { generateMessage } from '../lib/matching.js'
import { localities, asOptions } from '../lib/suggest.js'
import { REJECTED_STATUS } from '../data/leadStatus.js'
import { canAssignLead, canEditLead } from '../lib/permissions.js'
import { api } from '../lib/api.js'
import Icon from '../components/Icon.jsx'
// Filter options are GENERATED from the canonical vocabulary rather than typed
// out again here — that duplication is exactly what broke property filtering.
import {
  AREA_UNITS, BHK, BHK_FILTER, CATEGORIES, DEALS, FACING, FURNISH, OWNERSHIP,
  POSSESSION, STATUS, SUBTYPES, TRANSACTION,
  isPlot, labelOf, normaliseBhk, normaliseSubtype, normaliseTo, optionsOf,
} from '../data/propertyFields.js'


// Localities are DERIVED from the firm's own records, never listed here. There
// used to be two hardcoded pools — one for leads, one for properties — that
// disagreed with each other and were both Pune. See src/lib/suggest.js.

const opt = (arr) => arr.map(v => ({ value: v, label: v }))

// One square metre is 10.7639 square feet. Sorting mixed-unit inventory
// without this ranks a 90 sq.m flat below a 500 sq.ft one.
const areaInSqft = (v, unit) => (Number(v) || 0) * (unit === 'sqm' ? 10.7639 : 1)

// small helper: does a value match, case-insensitively
const eqi = (a, b) => String(a || '').toLowerCase() === String(b || '').toLowerCase()

// ---------------------------------------------------------------------------
// LEADS
// ---------------------------------------------------------------------------
export const LEADS_DEF = {
  id: 'leads',
  name: 'Leads',
  singularName: 'Lead',
  icon: 'leads',
  schema: LEAD_MODULE_SCHEMA,

  // Header facts strip — the identifying line under the record name.
  headerFacts: (l) => [l.phone, reqShort(l.req), budgetRange(l.req)].filter(Boolean),

  // Progression — a lead moves through pipeline stages. The standard header
  // renders this as a clickable journey stepper. `exit` = quiet off-path action.
  progression: {
    stages: (store) => store.state.settings.stages.filter(s => s !== REJECTED_STATUS),
    current: (l) => l.stage,
    set: (store, l, stage) => { store.setStage(l.id, stage); store.toast('Stage → ' + stage) },
    exit: { label: 'Mark as rejected', when: (l) => l.stage !== REJECTED_STATUS,
      run: (store, l) => store.openModal({ kind: 'rejectLead', leadId: l.id }) },
  },

  searchFields: ['name', 'phone', 'req.locality', 'req.config'],

  // `stage` and `deal` deliberately stay OUT of this list — the lead type and
  // status dropdowns above the pills (Leads.jsx) ask exactly these two
  // questions against the server. A third control asking the same thing here
  // would just be a second way to filter the same field.
  filterFields: (store) => [
    { key: 'flag', label: 'Needs attention', icon: 'clock', options: [
      { value: 'overdue', label: 'Overdue' }, { value: 'unassigned', label: 'Unassigned' }, { value: 'new', label: 'New today' },
    ] },
    { key: 'source', label: 'Source', icon: 'trend', options: opt(store.state.settings.sources) },
    { key: 'locality', label: 'Locality', icon: 'building', options: asOptions(localities(store)) },
    { key: 'agent', label: 'Sales Executive', icon: 'person', options: [
      { value: '_none', label: 'Unassigned' }, ...store.activeAgents().map(a => ({ value: a.id, label: a.first })),
    ] },
  ],

  // Per-key filter logic (mirrors the module's normalized predicates).
  rowMatch(l, key, vals) {
    if (key === 'source') return vals.some(s => eqi(l.source, s))
    if (key === 'agent') return vals.includes(l.agentId || '_none')
    if (key === 'locality') {
      return vals.some(loc => {
        const target = String(loc).toLowerCase().split('/')[0].trim()
        const leadLoc = String(l.req?.locality || '').toLowerCase()
        return leadLoc.includes(target) || target.includes(leadLoc)
      })
    }
    if (key === 'flag') {
      return (vals.includes('overdue') && l.overdue) ||
        (vals.includes('unassigned') && !l.agentId) ||
        (vals.includes('new') && (l.minsAgo || 0) < 1440)
    }
    return true
  },

  sortOptions: [
    { key: 'activity', label: 'Last activity', value: (l) => l.minsAgo || 0 },
    { key: 'budget', label: 'Budget', value: (l) => l.req?.budgetMax || 0 },
    { key: 'name', label: 'Name', value: (l) => (l.name || '').toLowerCase() },
    { key: 'stage', label: 'Stage', value: (l, store) => (store.state.settings.stages || []).indexOf(l.stage) },
  ],

  columns: [
    { key: 'name', label: 'Name', sortable: true, render: (l) => (
      <div><div className="name">{l.name}</div><div className="sub mono-num">{l.phone}</div></div>
    ) },
    { key: 'req', label: 'Requirement', render: (l) => reqShort(l.req) },
    { key: 'budget', label: 'Budget', sortable: true, render: (l) => <Money>{budgetRange(l.req)}</Money> },
    { key: 'stage', label: 'Stage', sortable: true, render: (l) => <StageTag stage={l.stage} /> },
    { key: 'source', label: 'Source', render: (l) => <Source>{l.source}</Source> },
    { key: 'agent', label: 'Sales Executive', render: (l, store) => {
      const a = store.agentById(l.agentId)
      return a ? <div className="cell-agent"><Avatar agent={a} size="sm" /><span>{a.first}</span></div> : <Unassigned />
    } },
    { key: 'next', label: 'Next follow-up', render: (l) => {
      const nf = l.followUp ? `${l.followUp.date} · ${l.followUp.time}` : '—'
      return l.overdue ? <Overdue>{nf}</Overdue> : <span className="cell-quiet mono-num">{nf}</span>
    } },
  ],

  /**
   * B2 — SUB-SEGMENTS as tab pills. Defined here, not in the screen, so the
   * pattern is reusable by any module rather than hand-rolled per page.
   *
   * Keys match the server's `segment` values exactly (api.listLeads / the
   * /leads/summary buckets) — there is no client-side `match()` any more.
   * These used to be evaluated in the browser against a stage vocabulary
   * ('Contacted', 'Negotiation') the statuses no longer have, so every pill
   * but "All" quietly matched nothing. The server counts and filters what the
   * signed-in user can actually see; the pill is just a label for one of its
   * segment names.
   *
   * What an agent triages by each morning is "who is new, who is warm, who
   * have I let slip" — not pipeline position, which is what the status
   * dropdown (Leads.jsx) answers instead.
   */
  segments: [
    { key: 'all', label: 'All' },
    { key: 'today', label: 'New today' },
    { key: 'month', label: 'This month' },
    { key: 'noanswer', label: 'Call not received' },
    { key: 'overdue', label: 'Overdue', tone: 'alert' },
    { key: 'unassigned', label: 'Unassigned' },
  ],

  // Trailing actions column (ModuleTable, driven off this definition). Quick
  // assign is desk-only (canAssignLead); Edit is gated the same way the record
  // sheet's own edit button is (canEditLead) — an agent viewing a lead they
  // didn't create and don't own gets Open only.
  rowActions: (l, store, ctx) => {
    const role = store.state.role
    const userId = store.state.activeAgentId
    const assignable = canAssignLead(role)
    const editable = canEditLead(role, userId, l)
    const doAssign = (agentId) => {
      api.bulkAssignLeads([l.id], agentId)
        .then(res => {
          if (res?.success) { store.toast(agentId ? 'Lead assigned' : 'Lead unassigned'); store.reloadServer?.() }
          else store.toast(res?.message || 'Could not assign', 'warn')
        })
        .catch(err => store.toast(err.message || 'Could not assign', 'warn'))
    }
    return (
      <>
        {assignable && <QuickAssignMenu agents={store.activeAgents()} currentId={l.agentId} onAssign={doAssign} />}
        {/* No "Open" here — the row itself opens the lead. A button that
            duplicates the row's own click is a second way to do one thing. */}
        {editable && <Button variant="quiet" size="sm" onClick={() => store.openModal({ kind: 'editRecord', moduleId: 'leads', recordId: l.id })}>Edit</Button>}
      </>
    )
  },

  // Standardized action set for the detail rail. `group` buckets them; `when`
  // gates by record state; `run(store, record)` calls existing store api.
  actions: [
    // ONE action per intent. There used to be a 'Contact' that opened a
    // channel chooser, a WhatsApp entry that opened the same chooser on a
    // different tab, a 'Schedule' that duplicated the follow-up card's own
    // button, and a next-best-action banner whose CTA was a third route to the
    // first one. Four ways to do two things.
    { id: 'whatsapp', tier: 'quick', icon: 'wa', label: 'WhatsApp',
      run: (store, l) => store.openWhatsApp(null, l.id) },
    { id: 'logCall', tier: 'quick', icon: 'phone', label: 'Log call',
      run: (store, l) => store.openModal({ kind: 'logCall', leadId: l.id }) },
    // Scheduling was deliberately NOT here while the follow-up card owned it —
    // see the note above. The card is gone on a phone (it rendered above the
    // record's own identity, restating what the action bar already offers), and
    // the moment it went, a phone had no way to schedule or close a follow-up at
    // all. So the intent belongs to the definition, where every surface gets it,
    // rather than to one bespoke card only the desk renders.
    { id: 'schedule', tier: 'quick', icon: 'calendar',
      label: (l) => (l.followUp ? 'Reschedule appointment' : 'Schedule appointment'),
      sub: (l) => (l.followUp ? `${l.followUp.date} · ${l.followUp.time}` : null),
      run: (store, l) => store.openModal({ kind: 'scheduleFollowUp', leadId: l.id }) },
    // A site visit closes with proof (B4); everything else is a plain done.
    { id: 'followDone', tier: 'quick', icon: 'check', when: (l) => !!l.followUp,
      label: (l) => (/site\s*visit/i.test(l.followUp?.action || '') ? 'Log site visit' : 'Mark follow-up done'),
      sub: (l) => l.followUp?.action,
      run: (store, l) => {
        if (/site\s*visit/i.test(l.followUp?.action || '')) return store.openModal({ kind: 'visitProof', leadId: l.id })
        store.setFollowUp(l.id, null); store.toast('Appointment marked completed')
      } },
    // B4. Completing a scheduled Site Visit appointment also opens this, but
    // that path only exists if someone scheduled one — so a visit that just
    // happened had nowhere to be logged. This is the always-available entry.
    { id: 'logVisit', tier: 'quick', icon: 'camera', label: 'Log site visit',
      run: (store, l) => store.openModal({ kind: 'visitProof', leadId: l.id }) },
    { id: 'remark', tier: 'quick', icon: 'note', label: 'Add remark',
      run: (store, l) => store.openModal({ kind: 'remark', recordType: 'lead', recordId: l.id }) },
    // manage (behind "More"):
    { id: 'assign', tier: 'manage', icon: 'userPlus',
      label: (l) => l.agentId ? 'Reassign owner' : 'Assign owner',
      sub: (l, store) => { const a = store.agentById(l.agentId); return a ? a.name : 'Unassigned' },
      run: (store, l) => store.openModal({ kind: 'assign', leadId: l.id }) },
    { id: 'merge', tier: 'manage', icon: 'copy', label: 'Merge duplicate', tone: 'danger',
      when: (l) => !!l.duplicateOf, run: (store, l) => store.merge(l.id) },
    { id: 'delete', tier: 'manage', icon: 'trash', label: 'Delete lead', tone: 'danger',
      run: (store, l, ctx) => { if (window.confirm('Delete this lead record permanently?')) { store.deleteLead(l.id); ctx?.onClose?.() } } },
  ],

  // Grid-view card for a lead.
  card: (l, store) => {
    const a = store.agentById(l.agentId)
    return (
      <>
        <div className="rc-top">
          <div className="rc-title">{l.name}</div>
          <StageTag stage={l.stage} />
        </div>
        <div className="rc-sub mono-num">{l.phone}</div>
        <div className="rc-facts"><span>{reqShort(l.req)}</span></div>
        <div className="rc-foot">
          <span className="rc-money"><Money>{budgetRange(l.req)}</Money></span>
          {a ? <span className="rc-agent"><Avatar agent={a} size="sm" />{a.first}</span> : <Unassigned />}
        </div>
      </>
    )
  },
}

// ---------------------------------------------------------------------------
// PROPERTIES
// ---------------------------------------------------------------------------
export const PROPERTIES_DEF = {
  id: 'properties',
  name: 'Properties',
  singularName: 'Property',
  icon: 'building',
  schema: PROPERTY_MODULE_SCHEMA,

  // The identity line under the record name. Read `p.type` and `p.priceLabel`
  // straight, so a listing added through the current form showed neither.
  headerFacts: (p) => [
    configLabel(p),
    p.locality,
    p.priceLabel || (p.price ? fmtMoney(p.price) : null),
    p.deal === 'rent' ? 'For rent' : 'For sale',
    labelOf(FURNISH, p.furnishType) || p.furnishing || null,
  ].filter(Boolean),

  // A listing moves through a sale/lease lifecycle. Rendered as the same stepper.
  progression: {
    stages: () => ['Available', 'Token Pending', 'Under Offer', 'Sold'],
    current: (p) => ['Available', 'Token Pending', 'Under Offer'].includes(p.status) ? p.status : (['Sold', 'Leased', 'Closed'].includes(p.status) ? 'Sold' : 'Available'),
    set: (store, p, status) => store.setPropStatus(p.id, status),
    exit: { label: 'Take off-market', when: (p) => p.status !== 'Off-Market',
      run: (store, p) => store.setPropStatus(p.id, 'Off-Market') },
  },

  // `tower` and `unit` are here because "B-701" is how a broker refers to a
  // specific flat out loud — searching for it and getting nothing was a
  // dead end with the record sitting right there.
  searchFields: ['society', 'title', 'locality', 'owner', 'type', 'project', 'tower', 'unit'],

  filterFields: (store) => {
    // Project options are derived from the live inventory, so a broker can narrow
    // the unit list to one township/society.
    const projects = store?.state?.projects || []
    // Sale-only concepts are hidden when the inventory holds no sale listings
    // at all — a lettings-only desk should never be offered "Ownership" or
    // "Transaction", which can only ever return nothing. Counted on the server;
    // asking an in-memory array was only ever right while the array was the
    // whole book.
    const hasSale = (store?.state?.dealMix?.sale ?? 1) > 0
    return [
      { key: 'project', label: 'Project', icon: 'building', group: 'Where', options: opt(projects) },
      { key: 'deal', label: 'Deal', icon: 'tag', multi: false, group: 'What', options: optionsOf(DEALS) },
      // Every option below is generated FROM the canonical vocabulary, so a
      // filter choice can no longer name a value the database doesn't store.
      // That was the whole C-fix bug: this list used to read
      // ['1BHK','2BHK','3BHK','Commercial','Plot'] while rows held
      // "3 BHK Apartment" and "Commercial Office", so almost nothing matched.
      { key: 'category', label: 'Category', icon: 'building', group: 'What', options: optionsOf(CATEGORIES) },
      { key: 'bhk', label: 'Configuration', icon: 'layers', group: 'What', options: optionsOf(BHK_FILTER) },
      { key: 'subtype', label: 'Property type', icon: 'home', group: 'What',
        options: optionsOf([...SUBTYPES.residential, ...SUBTYPES.commercial]
          .filter((x, i, a) => a.findIndex(y => y.value === x.value) === i)) },
      { key: 'locality', label: 'Locality', icon: 'building', group: 'Where', options: asOptions(localities(store)) },
      { key: 'status', label: 'Status', icon: 'check', group: 'State', options: optionsOf(STATUS) },
      { key: 'furnishing', label: 'Furnishing', icon: 'home', group: 'Condition', options: optionsOf(FURNISH) },
      { key: 'facing', label: 'Facing', icon: 'tag', group: 'Condition', options: optionsOf(FACING) },
      { key: 'possession', label: 'Possession', icon: 'clock', group: 'State', options: optionsOf(POSSESSION) },
      ...(hasSale ? [
        { key: 'ownership', label: 'Ownership', icon: 'shield', group: 'Sale only', options: optionsOf(OWNERSHIP) },
        { key: 'transaction', label: 'Transaction', icon: 'tag', group: 'Sale only', options: optionsOf(TRANSACTION) },
      ] : []),
    ]
  },

  rowMatch(p, key, vals) {
    // Rows written before the canonical columns existed still hold free text,
    // and imports will keep bringing more of it, so each comparison normalises
    // the stored value rather than trusting it to already be a token.
    if (key === 'project') return vals.includes(projectOf(p))
    if (key === 'deal') return vals.includes(p.deal)
    if (key === 'locality') return vals.includes(p.locality)
    if (key === 'category') return vals.includes(p.category || 'residential')
    if (key === 'bhk') return vals.includes(p.bhk ?? normaliseBhk(p.type))
    if (key === 'subtype') return vals.includes(p.subtype ?? normaliseSubtype(p.type, p.category))
    if (key === 'furnishing') return vals.includes(p.furnishType ?? normaliseTo(FURNISH, p.furnishing))
    if (key === 'facing') return vals.includes(normaliseTo(FACING, p.facing))
    if (key === 'ownership') return vals.includes(p.ownership)
    if (key === 'possession') return vals.includes(normaliseTo(POSSESSION, p.possession))
    if (key === 'transaction') return vals.includes(normaliseTo(TRANSACTION, p.transactionType))
    // Status values ARE the display strings (see STATUS in propertyFields),
    // so this compares directly — case-insensitively, because legacy rows and
    // imports vary. No token translation, and nothing stored gets rewritten.
    if (key === 'status') return vals.some(v => eqi(v, p.status))
    return true
  },

  sortOptions: [
    // `() => 0` meant every row compared equal, so this sorted by nothing and
    // only appeared to work because the server already returns newest-first.
    { key: 'recent', label: 'Recently added', value: (p) => (p.createdAt ? new Date(p.createdAt).getTime() : 0) },
    { key: 'price', label: 'Price', value: (p) => Number(p.price) || 0 },
    { key: 'society', label: 'Name', value: (p) => (p.society || p.title || '').toLowerCase() },
    { key: 'locality', label: 'Locality', value: (p) => (p.locality || '').toLowerCase() },
    // Areas are stored in whatever unit the listing was quoted in. Comparing
    // 90 (sq.m) against 950 (sq.ft) as plain numbers ranks the bigger flat
    // last, so everything converts to one unit before it is compared.
    { key: 'carpet', label: 'Carpet area', value: (p) => areaInSqft(p.carpet, p.areaUnit) },
  ],

  // Property list uses a card view AND a table view. These columns drive the table.
  columns: [
    { key: 'society', label: 'Property', render: (p) => (
      <div className="cell-prop">
        <div className="thumb-tile" style={{ background: thumbTint(p.id) }}><Icon name="building" size={19} strokeWidth={1.4} /></div>
        <div><div className="name">{p.society}{unitLabel(p) && <span className="unit-tag">{unitLabel(p)}</span>}</div><div className="sub">{p.locality}</div></div>
      </div>
    ) },
    // These columns read the CANONICAL fields with a legacy fallback. They
    // used to read `p.type`, `p.furnishing` and a hardcoded ' sqft' — so a
    // listing added through the current form showed "—" in three columns, and
    // a sq.m listing was labelled sqft. Same drift that broke the filters and
    // the record sheet; this was the third place it was hiding.
    { key: 'config', label: 'Config · deal', render: (p) => (
      <span className="cell-txt">{configLabel(p)} · {p.deal === 'rent' || p.tenancy ? 'Rent' : 'Sale'}</span>
    ) },
    { key: 'carpet', label: 'Area', render: (p) => {
      const v = p.carpet || p.builtup || p.superBuiltup || p.plotArea
      return <span className="cell-txt">{v ? `${v} ${labelOf(AREA_UNITS, p.areaUnit || 'sqft')}` : '—'}</span>
    } },
    // `p.type === 'Plot'` never matched once sub-type became a token, so plots
    // were asked for a floor.
    { key: 'floor', label: 'Floor', render: (p) => (
      <span className="cell-txt">{isPlot(p.subtype ?? normaliseSubtype(p.type, p.category)) ? '—' : (p.floor ? (p.totalFloors ? `${p.floor}/${p.totalFloors}` : p.floor) : '—')}</span>
    ) },
    { key: 'furnishing', label: 'Furnishing', render: (p) => (
      <span className="cell-txt">{labelOf(FURNISH, p.furnishType) || p.furnishing || '—'}</span>
    ) },
    { key: 'status', label: 'Status', render: (p) => <StatusTag status={p.status} /> },
    { key: 'quoted', label: 'Quoted', render: (p) => <Quoted q={quotedLine(p)} /> },
  ],

  actions: [
    { id: 'share', tier: 'quick', icon: 'wa', tone: 'accent', label: 'Share',
      run: (store, p) => store.openModal({ kind: 'pickBuyer', propId: p.id }) },
    // Both owner actions are gated on there BEING an owner to reach. The owner
    // is optional now, so an ungated "Call owner" opened a dialer on an
    // undefined number, and "Owner update" composed a WhatsApp addressed to
    // nobody. When there's no owner, the rail offers to add one instead.
    { id: 'callOwner', tier: 'quick', icon: 'phone', label: 'Call owner', when: (p) => !!p.ownerPhone,
      run: (store, p) => store.openModal({ kind: 'contact', channel: 'call', name: p.owner, phone: p.ownerPhone, recordType: 'property', recordId: p.id }) },
    { id: 'addOwner', tier: 'quick', icon: 'userPlus', label: 'Add owner', when: (p) => !p.owner && !p.ownerPhone,
      run: (store, p) => store.openModal({ kind: 'ownerEdit', propId: p.id }) },
    { id: 'status', tier: 'quick', icon: 'tag', label: 'Set status',
      run: (store, p) => store.openModal({ kind: 'propStatus', propId: p.id }) },
    { id: 'remark', tier: 'quick', icon: 'note', label: 'Add remark',
      run: (store, p) => store.openModal({ kind: 'remark', recordType: 'property', recordId: p.id }) },
    // manage (behind "More"):
    // Periodic, not per-visit — it belongs behind More, not in the five tiles
    // you reach for on every record.
    { id: 'ownerUpdate', tier: 'manage', icon: 'wa', label: 'Send owner an update',
      when: (p) => !!p.ownerPhone, sub: (p) => p.owner,
      run: (store, p) => store.openModal({ kind: 'ownerUpdate', propId: p.id }) },
    // This used to toast "Listing copied to clipboard" and copy NOTHING. A
    // button that reports success it didn't achieve is worse than no button:
    // you paste and find an old clipboard. It now copies the same text the
    // share flow sends, and only claims success once the write resolves.
    { id: 'copy', tier: 'manage', icon: 'copy', label: 'Copy listing details',
      run: (store, p) => {
        const text = generateMessage(p, { firmName: store.state.settings.firmName })
        navigator.clipboard?.writeText(text)
          .then(() => store.toast('Listing details copied'))
          .catch(() => store.toast('Could not copy — your browser blocked it', 'warn'))
      } },
    { id: 'tenancy', tier: 'manage', icon: 'people', when: (p) => p.deal === 'rent',
      label: (p) => p.tenancy ? 'Update tenancy' : 'Record tenancy', sub: (p) => p.tenancy ? p.tenancy.tenant : 'Mark as let / deposit',
      run: (store, p) => store.openModal({ kind: 'tenancy', propId: p.id }) },
    { id: 'deposit', tier: 'manage', icon: 'check', when: (p) => p.deal === 'rent' && p.tenancy && !p.tenancy.depositReturned,
      label: 'Mark deposit returned', sub: (p) => p.tenancy?.depositLabel, run: (store, p) => store.returnDeposit(p.id) },
    { id: 'delete', tier: 'manage', icon: 'trash', tone: 'danger', label: 'Delete property record',
      run: (store, p, ctx) => { if (window.confirm('Delete this property permanently?')) { store.deleteProperty(p.id); ctx?.onClose?.() } } },
  ],
}

// ---------------------------------------------------------------------------
// CLIENTS (derived directory: leads + property owners)
// ---------------------------------------------------------------------------
export const CLIENTS_DEF = {
  id: 'clients',
  name: 'Contacts',
  singularName: 'Contact',
  icon: 'people',
  schema: CLIENT_MODULE_SCHEMA,

  // Contacts are a directory, not a pipeline — no `progression`. The standard
  // header simply omits the stepper. Facts strip still applies.
  headerFacts: (r) => [r.phone, r.role, r.locality].filter(Boolean),

  searchFields: ['name', 'detail', 'phone'],

  // Clients filter set is minimal (locality); segments (Buyers/Tenants/...) handled by the module.
  filterFields: (store) => {
    // The firm's own locality vocabulary, from the boot payload. This used to
    // be rebuilt by mapping every lead and every property on every render.
    const dyn = localities(store)
    const list = dyn.length ? dyn : ['Hinjewadi Phase 3', 'Wakad', 'Baner', 'Kothrud']
    return [{ key: 'locality', label: 'Locality', icon: 'building', options: opt(list) }]
  },

  rowMatch(r, key, vals) {
    if (key === 'locality') return vals.includes(r.locality)
    return true
  },

  sortOptions: [
    { key: 'name', label: 'Name', value: (r) => (r.name || '').toLowerCase() },
    { key: 'role', label: 'Role', value: (r) => r.role },
    { key: 'activity', label: 'Recent', value: (r) => r.minsAgo || 0 },
  ],

  columns: [
    { key: 'name', label: 'Name', sortable: true, render: (r) => (
      <div className="cell-prop">
        <span className={'av av-sm ' + (r.kind === 'supply' ? 'av-supply' : 'av-demand')}>{initials(r.name)}</span>
        <div><div className="name">{r.name}</div><div className="sub mono-num">{r.phone}</div></div>
      </div>
    ) },
    { key: 'role', label: 'Role', sortable: true, render: (r) => <span className="source">{r.role}</span> },
    { key: 'detail', label: 'Requirement / listings', render: (r) => <span className="cell-txt">{r.detail}</span> },
    { key: 'locality', label: 'Locality', render: (r) => r.locality },
    { key: 'signal', label: 'Status', render: (r) => r.signal },
  ],

  actions: [
    // Was fake — just a toast, no dial, no WhatsApp, no logging (B5 closes
    // this). Demand contacts are a real lead (rawLeadId); supply/owner
    // contacts aren't their own record yet (that's B3) but ARE tied to a
    // real property, so the action logs there — same as a property's own
    // "Call owner" quick action.
    { id: 'call', tier: 'quick', icon: 'phone', label: 'Call',
      run: (store, r) => store.openModal({
        kind: 'contact', channel: 'call', name: r.name, phone: r.phone,
        recordType: r.kind === 'demand' ? 'lead' : 'property',
        recordId: r.kind === 'demand' ? r.rawLeadId : r.rawProps?.[0]?.id,
      }) },
    { id: 'wa', tier: 'quick', icon: 'wa', label: 'WhatsApp',
      run: (store, r) => store.openModal({
        kind: 'contact', channel: 'wa', name: r.name, phone: r.phone,
        recordType: r.kind === 'demand' ? 'lead' : 'property',
        recordId: r.kind === 'demand' ? r.rawLeadId : r.rawProps?.[0]?.id,
      }) },
  ],

  // Grid-view card for a client (derived contact).
  card: (r) => (
    <>
      <div className="rc-top">
        <span className={'av av-sm ' + (r.kind === 'supply' ? 'av-supply' : 'av-demand')}>{initials(r.name)}</span>
        <div className="rc-title rc-title-flex">{r.name}</div>
      </div>
      <div className="rc-sub mono-num">{r.phone}</div>
      <div className="rc-facts"><span>{r.detail}</span></div>
      <div className="rc-foot">
        <span className="source">{r.role}</span>
        {r.signal}
      </div>
    </>
  ),
}

export const MODULE_DEFINITIONS = {
  leads: LEADS_DEF,
  properties: PROPERTIES_DEF,
  clients: CLIENTS_DEF,
}

// Transform a definition's `actions` into ActionGroup `groups` shape, resolving
// dynamic label/sub, gating by `when`, and wiring run() to store+record+ctx.
export function buildActionGroups(def, store, record, ctx = {}) {
  const actions = (def.actions || []).filter(a => !a.when || a.when(record, store))
  const order = []
  const byGroup = {}
  for (const a of actions) {
    const head = a.group || 'Actions'
    if (!byGroup[head]) { byGroup[head] = []; order.push(head) }
    byGroup[head].push({
      icon: a.icon,
      label: typeof a.label === 'function' ? a.label(record, store) : a.label,
      sub: typeof a.sub === 'function' ? a.sub(record, store) : a.sub,
      tone: a.tone,
      onClick: () => a.run(store, record, ctx),
    })
  }
  return order.map(head => ({ head, items: byGroup[head] }))
}

// ---------------------------------------------------------------------------
// ACTION TIERS — the scalable answer to "too many buttons". Every action gets a
// tier; each tier has ONE fixed home in the detail UI, so a module can grow to
// many actions without the screen becoming a wall of buttons.
//   tier:'quick'  → a tidy row of the 3–4 most-used actions (rail).
//   tier:'manage' (default) → collapsed behind a single "⋯ More" menu.
// (primary lives in the header; workflow = stage/status strips, module-owned.)
// Returns { quick:[...], manage:[...] } of resolved action items.
export function buildActionTiers(def, store, record, ctx = {}) {
  const resolve = (a) => ({
    id: a.id,
    icon: a.icon,
    label: typeof a.label === 'function' ? a.label(record, store) : a.label,
    sub: typeof a.sub === 'function' ? a.sub(record, store) : a.sub,
    tone: a.tone,
    onClick: () => a.run(store, record, ctx),
  })
  const actions = (def.actions || []).filter(a => !a.when || a.when(record, store))
  return {
    quick: actions.filter(a => a.tier === 'quick').map(resolve),
    manage: actions.filter(a => a.tier !== 'quick').map(resolve),
  }
}
