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
import { StageTag, StatusTag, Source, Overdue, Unassigned, Avatar, Money, Quoted } from '../components/primitives.jsx'
import { getNestedValue } from '../components/ModuleFields.jsx'
import { reqShort, budgetRange, quotedLine, unitLabel, thumbTint, initials, projectOf } from '../lib/format.js'
import Icon from '../components/Icon.jsx'

// Shared option pools (kept here so filters and forms stay consistent).
export const LEAD_LOCALITIES = [
  'Hinjewadi Phase 1', 'Hinjewadi Phase 3', 'Marunji / Hinjewadi',
  'Gahunje / Expressway', 'Kharadi', 'Kalyani Nagar', 'Baner', 'Wakad', 'Viman Nagar',
]
const PROP_LOCALITIES = ['Wakad', 'Baner', 'Kothrud', 'Hinjewadi', 'Viman Nagar', 'Kalyani Nagar', 'Wagholi']

const opt = (arr) => arr.map(v => ({ value: v, label: v }))

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
    stages: (store) => store.state.settings.stages.filter(s => s !== 'Closed Lost'),
    current: (l) => l.stage,
    set: (store, l, stage) => { store.setStage(l.id, stage); store.toast('Stage → ' + stage) },
    exit: { label: 'Mark as lost', when: (l) => l.stage !== 'Closed Lost',
      run: (store, l) => {
        const reason = window.prompt('Reason for marking lead as lost? (e.g. Budget, Competition, Timeline)', 'Budget mismatch')
        if (reason !== null) { store.setStage(l.id, 'Closed Lost'); store.toast('Lead marked as Closed Lost') }
      } },
  },

  searchFields: ['name', 'phone', 'req.locality', 'req.config'],

  filterFields: (store) => [
    { key: 'flag', label: 'Needs attention', icon: 'clock', options: [
      { value: 'overdue', label: 'Overdue' }, { value: 'unassigned', label: 'Unassigned' }, { value: 'new', label: 'New today' },
    ] },
    { key: 'stage', label: 'Stage', icon: 'layers', options: opt(store.state.settings.stages) },
    { key: 'deal', label: 'Deal', icon: 'tag', options: [{ value: 'sale', label: 'Sale' }, { value: 'rent', label: 'Rent' }] },
    { key: 'source', label: 'Source', icon: 'trend', options: opt(store.state.settings.sources) },
    { key: 'locality', label: 'Locality', icon: 'building', options: opt(LEAD_LOCALITIES) },
    { key: 'agent', label: 'Agent', icon: 'person', options: [
      { value: '_none', label: 'Unassigned' }, ...store.activeAgents().map(a => ({ value: a.id, label: a.first })),
    ] },
  ],

  // Per-key filter logic (mirrors the module's normalized predicates).
  rowMatch(l, key, vals) {
    if (key === 'stage') return vals.some(s => eqi(l.stage, s))
    if (key === 'source') return vals.some(s => eqi(l.source, s))
    if (key === 'agent') return vals.includes(l.agentId || '_none')
    if (key === 'deal') {
      const raw = String(l.req?.deal || l.deal || '').toLowerCase().trim()
      const pur = String(l.req?.purpose || '').toLowerCase().trim()
      const isRent = raw === 'rent' || raw === 'lease' || pur === 'lease' || pur === 'rent'
      return vals.some(fd => String(fd).toLowerCase().trim() === (isRent ? 'rent' : 'sale'))
    }
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
    { key: 'agent', label: 'Agent', render: (l, store) => {
      const a = store.agentById(l.agentId)
      return a ? <div className="cell-agent"><Avatar agent={a} size="sm" /><span>{a.first}</span></div> : <Unassigned />
    } },
    { key: 'next', label: 'Next follow-up', render: (l) => {
      const nf = l.followUp ? `${l.followUp.date} · ${l.followUp.time}` : '—'
      return l.overdue ? <Overdue>{nf}</Overdue> : <span className="cell-quiet mono-num">{nf}</span>
    } },
  ],

  // Standardized action set for the detail rail. `group` buckets them; `when`
  // gates by record state; `run(store, record)` calls existing store api.
  actions: [
    { id: 'contact', tier: 'quick', icon: 'phone', label: 'Contact',
      run: (store, l) => store.openModal({ kind: 'outreach', leadId: l.id, channel: 'call' }) },
    { id: 'whatsapp', tier: 'quick', icon: 'wa', label: 'WhatsApp',
      run: (store, l) => store.openModal({ kind: 'outreach', leadId: l.id, channel: 'wa' }) },
    { id: 'note', tier: 'quick', icon: 'note', label: 'Add note',
      run: (store, l) => store.openModal({ kind: 'note', leadId: l.id }) },
    { id: 'schedule', tier: 'quick', icon: 'calendar', label: 'Schedule',
      run: (store, l) => store.openModal({ kind: 'scheduleFollowUp', leadId: l.id }) },
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

  headerFacts: (p) => [p.type, p.locality, p.priceLabel, p.deal === 'rent' ? 'For rent' : 'For sale'].filter(Boolean),

  // A listing moves through a sale/lease lifecycle. Rendered as the same stepper.
  progression: {
    stages: () => ['Available', 'Token Pending', 'Under Offer', 'Sold'],
    current: (p) => ['Available', 'Token Pending', 'Under Offer'].includes(p.status) ? p.status : (['Sold', 'Leased', 'Closed'].includes(p.status) ? 'Sold' : 'Available'),
    set: (store, p, status) => store.setPropStatus(p.id, status),
    exit: { label: 'Take off-market', when: (p) => p.status !== 'Off-Market',
      run: (store, p) => store.setPropStatus(p.id, 'Off-Market') },
  },

  searchFields: ['society', 'title', 'locality', 'owner', 'type', 'project'],

  filterFields: (store) => {
    // Project options are derived from the live inventory, so a broker can narrow
    // the unit list to one township/society.
    const projects = [...new Set((store?.state?.properties || []).map(projectOf))].sort()
    return [
      { key: 'project', label: 'Project', icon: 'building', options: opt(projects) },
      { key: 'deal', label: 'Deal', icon: 'tag', multi: false, options: [{ value: 'sale', label: 'For sale' }, { value: 'rent', label: 'For rent' }] },
      { key: 'type', label: 'Config', icon: 'layers', options: opt(['1BHK', '2BHK', '3BHK', 'Commercial', 'Plot']) },
      { key: 'locality', label: 'Locality', icon: 'building', options: opt(PROP_LOCALITIES) },
      { key: 'status', label: 'Status', icon: 'check', options: opt(['Available', 'Under Offer', 'Closed']) },
      { key: 'furnishing', label: 'Furnishing', icon: 'home', options: opt(['Fully furnished', 'Semi-furnished', 'Unfurnished']) },
    ]
  },

  rowMatch(p, key, vals) {
    if (key === 'project') return vals.includes(projectOf(p))
    if (key === 'deal') return vals.includes(p.deal)
    if (key === 'type') return vals.includes(p.type)
    if (key === 'locality') return vals.includes(p.locality)
    if (key === 'furnishing') return vals.includes(p.furnishing)
    if (key === 'status') return vals.some(s => eqi(s, p.status) || (s === 'Closed' && ['Sold', 'Let', 'Closed'].includes(p.status)))
    return true
  },

  sortOptions: [
    { key: 'recent', label: 'Recently added', value: () => 0 },
    { key: 'society', label: 'Name', value: (p) => (p.society || p.title || '').toLowerCase() },
    { key: 'locality', label: 'Locality', value: (p) => (p.locality || '').toLowerCase() },
    { key: 'carpet', label: 'Carpet area', value: (p) => p.carpet || 0 },
  ],

  // Property list uses a card view AND a table view. These columns drive the table.
  columns: [
    { key: 'society', label: 'Property', render: (p) => (
      <div className="cell-prop">
        <div className="thumb-tile" style={{ background: thumbTint(p.id) }}><Icon name="building" size={19} strokeWidth={1.4} /></div>
        <div><div className="name">{p.society}{unitLabel(p) && <span className="unit-tag">{unitLabel(p)}</span>}</div><div className="sub">{p.locality}</div></div>
      </div>
    ) },
    { key: 'config', label: 'Config · deal', render: (p) => <span className="cell-txt">{p.type || 'Property'} · {p.deal === 'rent' || p.tenancy ? 'Rent' : 'Sale'}</span> },
    { key: 'carpet', label: 'Carpet', render: (p) => <span className="cell-txt">{p.carpet ? p.carpet + ' sqft' : '—'}</span> },
    { key: 'floor', label: 'Floor', render: (p) => <span className="cell-txt">{p.type === 'Plot' ? '—' : (p.totalFloors ? `${p.floor}/${p.totalFloors}` : '—')}</span> },
    { key: 'furnishing', label: 'Furnishing', render: (p) => <span className="cell-txt">{p.furnishing || '—'}</span> },
    { key: 'status', label: 'Status', render: (p) => <StatusTag status={p.status} /> },
    { key: 'quoted', label: 'Quoted', render: (p) => <Quoted q={quotedLine(p)} /> },
  ],

  actions: [
    { id: 'share', tier: 'quick', icon: 'wa', tone: 'accent', label: 'Share',
      run: (store, p) => store.openModal({ kind: 'pickBuyer', propId: p.id }) },
    { id: 'ownerUpdate', tier: 'quick', icon: 'wa', label: 'Owner update',
      run: (store, p) => store.openModal({ kind: 'ownerUpdate', propId: p.id }) },
    { id: 'callOwner', tier: 'quick', icon: 'phone', label: 'Call owner',
      run: (store, p) => store.openModal({ kind: 'callOwner', owner: p.owner, propId: p.id }) },
    { id: 'status', tier: 'quick', icon: 'tag', label: 'Set status',
      run: (store, p) => store.openModal({ kind: 'propStatus', propId: p.id }) },
    // manage (behind "More"):
    { id: 'copy', tier: 'manage', icon: 'copy', label: 'Copy listing details',
      run: (store) => store.toast('Listing copied to clipboard') },
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
    const dyn = [...new Set([
      ...store.state.leads.map(l => l.req?.locality),
      ...store.state.properties.map(p => p.locality),
    ].filter(Boolean))]
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
    { id: 'call', tier: 'quick', icon: 'phone', label: 'Call',
      run: (store, r) => store.toast(`Calling ${r.name} (${r.phone})`) },
    { id: 'wa', tier: 'quick', icon: 'wa', label: 'WhatsApp',
      run: (store, r) => store.toast(`Opening WhatsApp for ${r.name}`) },
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
