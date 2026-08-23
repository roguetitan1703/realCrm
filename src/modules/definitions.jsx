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
import { LEAD_MODULE_SCHEMA, PROPERTY_MODULE_SCHEMA, CLIENT_MODULE_SCHEMA, OWNER_MODULE_SCHEMA } from '../components/ModuleFields.jsx'
import { StageTag, StatusTag, Source, Overdue, Unassigned, Avatar, Money, Quoted, Button } from '../components/primitives.jsx'
import { OwnerCell, StageCell } from '../components/collections.jsx'
import { getNestedValue } from '../components/ModuleFields.jsx'
import { asList, reqShort, reqConfigLabel, latestPlus, budgetRange, hasBudget, budgetOf, quotedLine, unitLabel, thumbTint, initials, projectOf, fmtMoney, configLabel, callbackSignal, whenLabel, arrivedOn, followUpLabel, followUpOverdue, followUpAction, nextStepOf } from '../lib/format.js'
import { generateMessage } from '../lib/matching.js'
import { localities, asOptions } from '../lib/suggest.js'
import { REJECTED_STATUS } from '../data/leadStatus.js'
import { OWNER_STATUSES } from '../data/ownerStatus.js'

import { canAssignLead, canEditLead, canUpdateLeadStatus } from '../lib/permissions.js'
import { api } from '../lib/api.js'
import Icon from '../components/Icon.jsx'
// Filter options are GENERATED from the canonical vocabulary rather than typed
// out again here — that duplication is exactly what broke property filtering.
import {
  AREA_UNITS, BHK, BHK_FILTER, CATEGORIES, DEALS, DEAL_LEAD, FACING, FURNISH, OWNERSHIP,
  POSSESSION, STATUS, SUBTYPES, TRANSACTION,
  isPlot, labelOf, normaliseBhk, normaliseSubtype, normaliseTo, optionsOf,
} from '../data/propertyFields.js'

// The firm's own calling statuses, falling back to the shipped set until one is
// configured. Read through a helper rather than importing the constant at every
// call site, so renaming a status in Settings reaches the stage cells, the
// dropdowns and the record's progression at once.
const ownerStages = (store) => store?.state?.settings?.ownerStages?.length
  ? store.state.settings.ownerStages
  : OWNER_STATUSES


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

  // Header facts strip — the identifying line under the record name. Email is
  // only added when the lead has one (no empty row); locality gets a pin so it
  // reads as a place, and sale/rent is a small tag rather than plain text — a
  // sentence like "3 BHK · rent · Wakad" made the deal type invisible.
  headerFacts: (l) => [
    l.phone,
    l.email || null,
    reqConfigLabel(l.req) || l.requirement || null,
    latestPlus(l.req?.locality || l.locality)
      ? <span className="rh-loc"><Icon name="mapPin" size={12} className="ic" />{latestPlus(l.req?.locality || l.locality)}</span> : null,
    (l.req?.deal || l.deal) ? <span className={'rh-dealtag' + ((l.req?.deal || l.deal) === 'rent' ? ' rent' : '')}>{labelOf(DEAL_LEAD, l.req?.deal || l.deal)}</span> : null,
    // WHAT THEY ASKED ABOUT — "VTP Aethereus", "Blue Ridge". The list row showed
    // this (reqShort carries it) and the record did not, so opening a lead lost
    // a fact you could already see. It is the one thing that makes the call
    // warm rather than cold, and it belongs on the screen the call is made from.
    //
    // It takes the slot the BUDGET used to hold. This strip is an identity line,
    // not a summary, and two money-and-property facts fight each other in it —
    // so it carries the one an agent reads before dialling. The budget is still
    // on this screen, in the record sheet a few pixels below (req.minBudget /
    // req.maxBudget), which is the single place every field is viewed.
    // LATEST, AND HOW MANY MORE. `interest` accumulates — a person who
    // enquired about two projects carries both — and rendering the array
    // straight printed them with no separator at all ("Green VistasGreen
    // Cove"), which reads as one project nobody can find. The full set is on
    // the record sheet below.
    latestPlus(l.req?.interest),
    l.req?.timeline || null,
    l.source ? `Via ${l.source}` : null,
  ].filter(Boolean),

  // Beside the NAME, not among the facts — a pill in that wrapping grey row
  // cost the record its action buttons a line below. Only above one: every
  // lead has enquired once, and a badge on everything is a badge on nothing.
  titleBadge: (l) => (l.enquiryCount > 1
    ? <span className="rh-repeat">{l.enquiryCount} enquiries</span> : null),

  // Progression — a lead's status, not a pipeline position (see
  // src/data/leadStatus.js: the list is flat and unordered). `flat: true`
  // tells the shared ModuleDetail to draw this as an "update status" dropdown
  // instead of the walkable journey stepper properties still get.
  progression: {
    flat: true,
    stages: (store) => store.state.settings.stages.filter(s => s !== REJECTED_STATUS),
    current: (l) => l.stage,
    // No toast here — store.setStage already raises "Stage → X" through
    // optimistic()'s okMsg, so this produced the same words twice for one tap.
    set: (store, l, stage) => store.setStage(l.id, stage),
    // Same scope as the record's own edit permission for status: desk always,
    // an agent only on a lead they created or are assigned.
    canSet: (store, l) => canUpdateLeadStatus(store.state.role, store.state.activeAgentId, l),
    // Shown next to the status once the lead is closed out.
    note: (l) => (l.stage === REJECTED_STATUS ? (l.rejectionReason || null) : null),
    exit: { label: 'Mark as rejected', when: (l) => l.stage !== REJECTED_STATUS,
      run: (store, l) => store.openModal({ kind: 'rejectLead', leadId: l.id }) },
  },

  searchFields: ['name', 'phone', 'req.locality', 'req.config'],

  // `stage` and `deal` deliberately stay OUT of this list — the lead type and
  // status dropdowns above the pills (Leads.jsx) ask exactly these two
  // questions against the server. A third control asking the same thing here
  // would just be a second way to filter the same field.
  // ATTRIBUTES, not worklists. The piles a desk works are the tab row above;
  // this narrows within whichever one is open.
  //
  // "Needs attention" was here — six options, of which "Unassigned" also
  // appeared on the tab row AND on the Sales Executive filter below,
  // "Arrived today" was the Today tab, and the other four are now pills. Three
  // controls answering one question is how a desk stops trusting any of them.
  //
  // `untouched_sla` is deleted. It was never_contacted with a clock on it,
  // labelled "Past SLA" on the dashboard while the pill beside the same rows
  // said "Never called" — one expression, two names, on two screens.
  // SOURCE AND LOCALITY ONLY, AND BOTH COME FROM THE DATA.
  //
  // Source listed the firm's CONFIGURED portals, so a connection that has never
  // pushed anything was offerable and picked an empty list. Locality read
  // whatever collection the browser happened to be holding, which on a server-
  // paged list is one page of it. Both now arrive from /leads/summary with
  // their counts, computed under every other active filter — see `facets` in
  // Leads.jsx. `store` is unused here now and stays in the signature because
  // the shared FilterBar calls every module's filterFields the same way.
  //
  // "Sales Executive" has moved OUT of this panel and up beside Type and
  // Status. "Whose leads are these" is the first question a manager asks, and
  // it was two clicks deep. It is not repeated here — two controls for one
  // question is how the pills and the KPI strip ended up saying different
  // things about the same leads. Its Unassigned entry covers what
  // "Needs attention → Nobody assigned" used to.
  filterFields: (store, facets) => [
    { key: 'source', label: 'Source', icon: 'trend', options: facets?.bySource || [] },
    { key: 'locality', label: 'Locality', icon: 'building', options: facets?.byLocality || [] },
  ],

  // Per-key filter logic (mirrors the module's normalized predicates).
  rowMatch(l, key, vals) {
    if (key === 'source') return vals.some(s => eqi(l.source, s))
    if (key === 'agent') return vals.includes(l.agentId || '_none')
    if (key === 'locality') {
      return vals.some(loc => {
        const target = String(loc).toLowerCase().split('/')[0].trim()
        // Every locality on record, not String() over a list — that renders
        // "mahalunge,wakad", which contains neither name as a whole.
        return asList(l.req?.locality).some(loc => {
          const leadLoc = loc.toLowerCase()
          return leadLoc.includes(target) || target.includes(leadLoc)
        })
      })
    }
    if (key === 'flag') {
      return (vals.includes('overdue') && followUpOverdue(nextStepOf(l))) ||
        (vals.includes('unassigned') && !l.agentId) ||
        (vals.includes('new') && (l.minsAgo || 0) < 1440)
    }
    return true
  },

  sortOptions: [
    { key: 'activity', label: 'Last activity', value: (l) => l.minsAgo || 0 },
    { key: 'budget', label: 'Budget', value: (l) => budgetOf(l.req).max || 0 },
    { key: 'name', label: 'Name', value: (l) => (l.name || '').toLowerCase() },
    { key: 'stage', label: 'Stage', value: (l, store) => (store.state.settings.stages || []).indexOf(l.stage) },
  ],

  columns: [
    { key: 'name', label: 'Name', sortable: true, render: (l) => (
      <div>
        <div className="name">
          {l.name}
          {/* CAME BACK, and how often. The phone card and the record header
              have carried this since the sessions existed; the desk's own list
              — the screen a manager works from — had no sign of it at all.
              Only above one: every lead has enquired once. */}
          {l.enquiryCount > 1 && <span className="prow-repeat">{l.enquiryCount}×</span>}
        </div>
        <div className="sub mono-num">{l.phone}</div>
      </div>
    ) },
    { key: 'req', label: 'Requirement', render: (l) => reqShort(l.req) },
    { key: 'budget', label: 'Budget', sortable: true, render: (l) => <Money>{budgetRange(l.req)}</Money> },
    { key: 'stage', label: 'Stage', sortable: true, render: (l, store) => (
      <StageCell
        record={l} store={store}
        stages={(store.state.settings.stages || []).filter(s => s !== REJECTED_STATUS)}
        canSet={canUpdateLeadStatus(store.state.role, store.state.activeAgentId, l)}
        onSet={(stage) => store.setStage(l.id, stage)}
        onReject={(rec) => store.openModal({ kind: 'rejectLead', leadId: rec.id })}
      />
    ) },
    { key: 'source', label: 'Source', render: (l) => <Source>{l.source}</Source> },
    // WHO HAS THIS LEAD, and the way to change it — the same cell. It used to
    // render only a bare + button for anyone who could assign, so the column
    // headed "Sales Executive" never actually named one.
    { key: 'agent', label: 'Sales Executive', render: (l, store) => (
      <OwnerCell
        record={l} store={store} canAssign={canAssignLead(store.state.role)}
        onAssign={(agentId) => api.bulkAssignLeads([l.id], agentId)
          .then(res => {
            if (res?.success) { store.toast(agentId ? 'Lead assigned' : 'Lead unassigned'); store.reloadServer?.() }
            else store.toast(res?.message || 'Could not assign', 'warn')
          })
          .catch(err => store.toast(err.message || 'Could not assign', 'warn'))}
      />
    ) },
    { key: 'next', label: 'Next follow-up', render: (l) => {
      // nextStepOf, not l.followUp: a rejected lead keeps whatever was booked
      // before it was rejected, and this column is what is still owed.
      const fu = nextStepOf(l)
      const nf = fu ? followUpLabel(fu) : '—'
      return followUpOverdue(fu) ? <Overdue>{nf}</Overdue> : <span className="cell-quiet mono-num">{nf}</span>
    } },
    // WHEN THEY LAST ASKED. Sortable, because "show me this week's" is the
    // question it exists to answer — and a person who enquired again yesterday
    // is not a three-week-old lead, which is what a column reading only the
    // arrival date said about the warmest rows on the desk. Falls back to
    // arrival for a lead whose enquiries predate the table, exactly as the
    // server's sort does, so the arrow and the cell cannot disagree.
    { key: 'lastEnquiry', label: 'Last enquiry', sortable: true,
      render: (l) => <span className="cell-quiet">{arrivedOn(l.lastEnquiryAt || l.createdAt) || '—'}</span> },
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
  // THE TAB ROW IS THE WORKLIST. One control, one question per pill, and every
  // pill a pile somebody actually clears.
  //
  // It was not. Three controls asked overlapping questions and the useful ones
  // were the hardest to reach:
  //
  //   tabs     All · Today · This month · Call not received · Overdue · Unassigned
  //   filter   Never called · Repeat · Past SLA never contacted · No answer not
  //            retried · Unassigned · Arrived today
  //   filter   Sales Executive → Unassigned
  //
  // "Unassigned" appeared three times. "Arrived today" and the Today tab are one
  // thing. "Call not received" (a stage) sat beside "No answer, not retried"
  // (that stage, gone stale) with nothing saying which was which. And the two
  // biggest piles on the desk — 67 people nobody has ever rung and 46 rung once
  // and dropped — were buried inside a dropdown called "Needs attention" while
  // the tabs showed Overdue 0 and Unassigned 0, both permanently empty.
  //
  // What went, and why:
  //   This month     232 of 232 on bhumi — the All tab wearing a date.
  //   Unassigned     0, always: routing and pick-up mean a lead is never
  //                  nobody's for long. Still on the Sales Executive filter,
  //                  where it belongs, for the day it is not 0.
  //   Call not received  a stage, and the stage dropdown above already asks it.
  //                  Its useful half — rung and not rung again — is its own pill.
  // THE PILLS COME FROM THE SERVER — `state.leadSegments`, built from the one
  // file that also holds the SQL deciding each pile
  // (backend/src/services/leadSegments.ts). What is left here is the fallback
  // for an API older than this build: the frontend deploys on a push and the
  // backend by hand, so a browser can be a week ahead of the server it is
  // talking to, and a Leads screen with no pills at all is worse than a stale
  // label. `all` is not a segment — it is the absence of one — so it is added
  // by the screen either way.
  //
  // A label that appears in both places is a label that can drift; when they
  // disagree, the server is right.
  fallbackSegments: [
    { key: 'today', label: 'Today' },
    { key: 'never_contacted', label: 'Not contacted', tone: 'alert' },
    { key: 'noanswer_stale', label: 'No reply' },
    { key: 'going_cold', label: 'Going cold', tone: 'alert' },
    { key: 'overdue', label: 'Follow-up overdue', tone: 'alert' },
    { key: 'repeat_enquiry', label: 'Came back' },
  ],


  // Trailing actions column (ModuleTable, driven off this definition).
  rowActions: null,

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
    //
    // ON THE PHONE ONLY, though. The desk record draws the appointment card in
    // its rail, a few pixels above Quick actions, and that card carries both of
    // these — so a lead with a site visit booked showed "Reschedule appointment"
    // twice and, worse, "Log visit" on the card beside "Log site visit" in the
    // tiles: two labels, one modal, one action. `onRail` is set by the surface
    // that draws the card, so neither list is guessing about the other.
    { id: 'schedule', tier: 'quick', icon: 'calendar', when: (l, store, ctx) => !ctx?.onRail,
      label: (l) => (l.followUp ? 'Reschedule follow-up' : 'Schedule follow-up'),
      sub: (l) => (nextStepOf(l) ? followUpLabel(l.followUp) : null),
      run: (store, l) => store.openModal({ kind: 'scheduleFollowUp', leadId: l.id }) },
    // THERE IS NO "MARK FOLLOW-UP DONE". It was a tick in this menu that
    // deleted the appointment and stored nothing about it — no outcome, no
    // remark — sitting one row above "Log site visit", which demands a photo,
    // a GPS fix and an outcome for the same kind of event. Two ways to close
    // one thing, and the free one taught people that closing a follow-up means
    // nothing happened. Nobody used it; the client did not know it existed.
    //
    // A follow-up now ends when the work does: log the call through the Call
    // button, or the visit through Log site visit, and the matching booking
    // closes server-side with what actually happened attached. See
    // closeFollowUpFor() in services/store.ts.
    // B4. Completing a scheduled Site Visit appointment also opens this, but
    // that path only exists if someone scheduled one — so a visit that just
    // happened had nowhere to be logged. This is the always-available entry —
    // except when `followDone` (above) is ALREADY offering "Log site visit"
    // for the same scheduled appointment, which read as the same button twice
    // in both the desk rail's Quick actions and the phone action button.
    // THE ALWAYS-AVAILABLE ENTRY, for a visit that happened with no
    // appointment behind it. Hidden when one IS booked, because the phone
    // record already promotes Log visit to a full-width button in that case
    // and the desk rail's card carries it — offering it here as well is the
    // same button twice, a few pixels apart, which is what this menu looked
    // like before.
    { id: 'logVisit', tier: 'quick', icon: 'camera', label: 'Log site visit',
      when: (l) => !(l.followUp && /site\s*visit/i.test(l.followUp.action || '')),
      run: (store, l) => store.openModal({ kind: 'visitProof', leadId: l.id }) },
    { id: 'remark', tier: 'quick', icon: 'note', label: 'Add remark',
      run: (store, l) => store.openModal({ kind: 'remark', recordType: 'lead', recordId: l.id }) },
    // manage (behind "More"):
    // Assignment is desk work. Offered to an agent this was an action the
    // server refuses — the picker opened, a name was chosen, and the save came
    // back 403.
    { id: 'assign', tier: 'manage', icon: 'userPlus',
      label: (l) => l.agentId ? 'Reassign owner' : 'Assign owner',
      when: (l, store) => canAssignLead(store.state.role),
      sub: (l, store) => { const a = store.agentById(l.agentId); return a ? a.name : 'Unassigned' },
      run: (store, l) => store.openModal({ kind: 'assign', leadId: l.id }) },
    { id: 'merge', tier: 'manage', icon: 'copy', label: 'Merge duplicate', tone: 'danger',
      when: (l) => !!l.duplicateOf, run: (store, l) => store.merge(l.id) },
    { id: 'delete', tier: 'manage', icon: 'trash', label: 'Delete lead', tone: 'danger',
      run: (store, l, ctx) => { if (window.confirm('Delete this lead record permanently?')) { store.deleteLead(l.id); ctx?.onClose?.() } } },
  ],

  // Phone list row — one tap to open, two icons beside it for the thing every
  // visit to this screen starts with. Same modal kind LeadRecord's own
  // Call/WhatsApp buttons open, so a call logged from the list is logged the
  // same way as one logged from the record.
  // The three ways to reach someone, in the order they get used. Each appears
  // only when the lead actually carries what it needs — an email button on a
  // lead with no email is a button that does nothing.
  phoneActions: (l, store) => {
    const open = (channel) => () => store.openModal({
      kind: 'contact', channel, name: l.name, phone: l.phone, email: l.email,
      recordType: 'lead', recordId: l.id,
    })
    return [
      ...(l.phone ? [
        { key: 'call', icon: 'phone', label: 'Call', onClick: open('call') },
        { key: 'wa', icon: 'wa', label: 'WhatsApp', tone: 'wa', onClick: open('wa') },
      ] : []),
      ...(l.email ? [{ key: 'email', icon: 'mail', label: 'Email', onClick: open('email') }] : []),
    ]
  },

  // Compact phone row — a full-width scan line, not the desktop grid tile
  // (`card` below). Money stays out of it; the desktop card already keeps it
  // quiet, a list row keeps it out entirely.
  // Three tight lines, all left-aligned. The owner chip used to be pushed to
  // the far right of the middle line, which left it stranded in the white space
  // between the requirement and the buttons — belonging to neither. It reads as
  // what it is now: the last fact on the last line.
  // Three full-width lines, and the actions on the last one.
  //
  // This was a three-line text block squeezed beside a fixed column of icon
  // buttons: the buttons took 120px of a 390px screen so long names and
  // requirements ran off the card, and they sat vertically centred against the
  // text, leaving a tall empty gap. Now every line gets the whole width and the
  // buttons sit bottom-right, where a thumb already is.
  //
  // The phone number is gone. It was the widest thing on the row and it is not
  // a decision input — anyone who wants to ring taps Call, and anyone who wants
  // to read the number opens the record.
  phoneCard: (l, store, actions) => {
    const a = store.agentById(l.agentId)
    return (
      <div className="prow">
        <div className="prow-top">
          {/* Name and badge together, so the badge does not take a row of its
              own on a 390px card — the same reason it sits beside the name on
              the record rather than in the facts strip. */}
          <span className="prow-name">
            {l.name}
            {l.enquiryCount > 1 && <span className="prow-repeat">{l.enquiryCount}×</span>}
          </span>
          {/* WHAT is overdue, next to WHO it is about. This was a bare date on
              the meta line below — "Yesterday", "Tomorrow" — which named no
              subject at all: beside an agent's name and an arrival date, in a
              row of three muted facts, it read as another date belonging to
              whatever sat next to it. It also cost the line the width the
              budget needed, so the figure was the thing that got clipped
              against the buttons. Same words the filter uses, so the row and
              the tab that selects it cannot describe the same lead
              differently. */}
          {followUpOverdue(nextStepOf(l)) ? <span className="prow-flag"><span className="dot" />Follow-up overdue</span> : null}
          <StageCell
            record={l} store={store}
            stages={(store.state.settings.stages || []).filter(s => s !== REJECTED_STATUS)}
            canSet={canUpdateLeadStatus(store.state.role, store.state.activeAgentId, l)}
            onSet={(stage) => store.setStage(l.id, stage)}
            onReject={(rec) => store.openModal({ kind: 'rejectLead', leadId: rec.id })}
          />
        </div>
        {/* Without the budget — it has its own slot on the meta line below.
            This line is one row with an ellipsis, so every part it carries is
            room taken from `interest`, which sits last and is cut first. */}
        {reqShort(l.req, { budget: false }) && <div className="prow-req">{reqShort(l.req, { budget: false })}</div>}
        <div className="prow-foot">
          <div className="prow-meta">
            {a ? <span className="prow-agent"><Avatar agent={a} size="sm" />{a.first}</span> : <Unassigned />}
            {/* When they last asked. On a phone this is the difference between
                calling a fresh enquiry and calling one that has been sitting
                three weeks, and the card had no way to tell them apart. Their
                first arrival is on the record; what the card needs is whether
                this person is warm now. */}
            {(l.lastEnquiryAt || l.createdAt) && <span className="prow-when">{arrivedOn(l.lastEnquiryAt || l.createdAt)}</span>}
            {/* The figure, last and quiet. This line has the width — the call
                and WhatsApp buttons sit to the right of it, not through it —
                and money on a lead row is a fact you check, never the thing the
                card is about. */}
            {hasBudget(l.req) && <span className="prow-money">{budgetRange(l.req)}</span>}
          </div>
          {actions}
        </div>
      </div>
    )
  },

  // Grid-view card for a lead.
  card: (l, store) => {
    const a = store.agentById(l.agentId)
    return (
      <>
        <div className="rc-top">
          <div className="rc-title">{l.name}</div>
          <StageCell
            record={l} store={store}
            stages={(store.state.settings.stages || []).filter(s => s !== REJECTED_STATUS)}
            canSet={canUpdateLeadStatus(store.state.role, store.state.activeAgentId, l)}
            onSet={(stage) => store.setStage(l.id, stage)}
            onReject={(rec) => store.openModal({ kind: 'rejectLead', leadId: rec.id })}
          />
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
// OWNERS — the cold-calling list. Same UI machinery as leads (bulk assign,
// segments, sortable columns, status-in-row), a much smaller status set, and
// deliberately no requirement/budget/matching — this is supply-side outreach,
// not a buyer working a funnel. See OWNER_MODULE_SCHEMA for why the schema is
// thin, and backend/src/services/store.ts's OWNERS block for why this isn't a
// crm_leads row.
// ---------------------------------------------------------------------------
export const OWNERS_DEF = {
  id: 'owners',
  name: 'Owners',
  singularName: 'Owner',
  icon: 'home',
  schema: OWNER_MODULE_SCHEMA,

  // Same two fields as the lead filter bar (minus Source/Needs-attention,
  // which don't have an owner-side equivalent yet) — same shape, same
  // options source, so the two toolbars behave identically.
  filterFields: (store) => [
    { key: 'locality', label: 'Locality', icon: 'building', options: asOptions(localities(store)) },
    { key: 'agent', label: 'Sales Executive', icon: 'person', options: [
      { value: '_none', label: 'Unassigned' }, ...store.activeAgents().map(a => ({ value: a.id, label: a.first })),
    ] },
    // EVERY WAY INTO THIS LIST HAS TO LAND ON A CONTROL YOU CAN SEE AND UNDO.
    // The dashboard's Past-SLA tile and the Team page's Unassigned tile both
    // filtered by a flag the server honours and no control on screen showed —
    // right rows, no chip, nothing to click to get back. The two flags with no
    // pill of their own live here; the ones that DO have a pill (overdue,
    // no-answer, came-back) are not repeated, because two controls for one
    // question is how the pills and the KPI strip ended up saying different
    // things about the same leads.
    // "Needs attention" is gone. It held two entries: Past SLA, which was
    // never_contacted with a clock on it and is deleted, and Nobody assigned,
    // which is the Sales Executive control's own Unassigned option. A dropdown
    // with one entry duplicating another control is the third-way-to-ask-one-
    // question fault, not a filter.
  ],

  headerFacts: (o) => {
    const cb = callbackSignal(o.callbackAt)
    return [
      o.phone,
      o.email || null,
      o.project ? <span className="rh-loc"><Icon name="building" size={12} className="ic" />{o.project}</span> : null,
      o.unitRef || null,
      o.locality || null,
      // The one fact a caller opens this record to check. Overdue reads as
      // overdue here for the same reason it does in the queue.
      cb ? (cb.tone === 'overdue'
        ? <Overdue>Callback {cb.label}</Overdue>
        : <span className="rh-loc"><Icon name="phone" size={12} className="ic" />Callback {cb.label}</span>) : null,
      o.source ? `Via ${o.source}` : null,
    ].filter(Boolean)
  },

  progression: {
    flat: true,
    stages: (store) => ownerStages(store),
    current: (o) => o.stage,
    set: (store, o, stage) => store.setOwnerStage(o.id, stage),
    canSet: (store, o) => canUpdateLeadStatus(store.state.role, store.state.activeAgentId, o),
  },

  sortOptions: [
    { key: 'callback', label: 'Callback due' },
    { key: 'recent', label: 'Recently added' },
    { key: 'lastCall', label: 'Last called' },
    { key: 'name', label: 'Name' },
    { key: 'project', label: 'Project' },
  ],

  columns: [
    { key: 'name', label: 'Name', sortable: true, render: (o) => (
      <div><div className="name">{o.name || '—'}</div><div className="sub mono-num">{o.phone}</div></div>
    ) },
    { key: 'project', label: 'Project', render: (o) => o.project || '—' },
    { key: 'unitRef', label: 'Unit', render: (o) => <span className="cell-quiet">{o.unitRef || '—'}</span> },
    { key: 'callback', label: 'Callback', sortable: true, render: (o) => {
      const cb = callbackSignal(o.callbackAt)
      if (!cb) return <span className="cell-quiet">{o.lastCallAt ? 'No callback' : 'Not called'}</span>
      return cb.tone === 'overdue' ? <Overdue>{cb.label}</Overdue> : <span className="source">{cb.label}</span>
    } },
    { key: 'stage', label: 'Status', sortable: true, render: (o, store) => (
      <StageCell
        record={o} store={store} stages={ownerStages(store)}
        canSet={canUpdateLeadStatus(store.state.role, store.state.activeAgentId, o)}
        onSet={(stage) => store.setOwnerStage(o.id, stage)}
      />
    ) },
    { key: 'agent', label: 'Sales Executive', render: (o, store) => (
      <OwnerCell
        record={o} store={store} canAssign={canAssignLead(store.state.role)}
        onAssign={(agentId) => api.bulkAssignOwners([o.id], agentId)
          .then(res => {
            if (res?.success) { store.toast(agentId ? 'Owner assigned' : 'Owner unassigned'); store.reloadServer?.() }
            else store.toast(res?.message || 'Could not assign', 'warn')
          })
          .catch(err => store.toast(err.message || 'Could not assign', 'warn'))}
      />
    ) },
  ],

  phoneActions: (o, store) => {
    const open = (channel) => () => store.openModal({
      kind: 'contact', channel, name: o.name, phone: o.phone, email: o.email,
      recordType: 'owner', recordId: o.id,
    })
    return [
      ...(o.phone ? [
        { key: 'call', icon: 'phone', label: 'Call', onClick: open('call') },
        { key: 'wa', icon: 'wa', label: 'WhatsApp', tone: 'wa', onClick: open('wa') },
      ] : []),
      ...(o.email ? [{ key: 'email', icon: 'mail', label: 'Email', onClick: open('email') }] : []),
    ]
  },

  card: (o, store) => (
    <>
      <div className="rc-top">
        <div className="rc-title">{o.name || 'Unnamed owner'}</div>
        <StageCell
          record={o} store={store} stages={ownerStages(store)}
          canSet={canUpdateLeadStatus(store.state.role, store.state.activeAgentId, o)}
          onSet={(stage) => store.setOwnerStage(o.id, stage)}
        />
      </div>
      <div className="rc-sub mono-num">{o.phone}</div>
      <div className="rc-facts"><span>{[o.project, o.unitRef].filter(Boolean).join(' · ') || '—'}</span></div>
      <div className="rc-foot">
        {(() => { const a = store.agentById(o.agentId); return a ? <span className="rc-agent"><Avatar agent={a} size="sm" />{a.first}</span> : <Unassigned /> })()}
      </div>
    </>
  ),

  // The cold-calling loop, in the order it happens: dial, note what they said,
  // book the callback, come back. Until this existed the module had a
  // "Callback" status with nowhere to record when — so the status meant
  // someone had said "call me back" and nothing ever surfaced them again.
  actions: [
    { id: 'call', tier: 'quick', icon: 'phone', label: 'Call',
      when: (o) => !!o.phone,
      sub: (o) => (o.lastCallAt ? `Last called ${whenLabel(o.lastCallAt)}` : 'Not called yet'),
      run: (store, o) => store.openModal({
        kind: 'contact', channel: 'call', name: o.name, phone: o.phone, email: o.email,
        recordType: 'owner', recordId: o.id,
      }) },
    { id: 'whatsapp', tier: 'quick', icon: 'wa', label: 'WhatsApp',
      when: (o) => !!o.phone,
      run: (store, o) => store.openModal({
        kind: 'contact', channel: 'wa', name: o.name, phone: o.phone,
        recordType: 'owner', recordId: o.id,
      }) },
    { id: 'callback', tier: 'quick', icon: 'calendar',
      label: (o) => (o.callbackAt ? 'Reschedule callback' : 'Schedule callback'),
      sub: (o) => { const cb = callbackSignal(o.callbackAt); return cb ? cb.label : null },
      run: (store, o) => store.openModal({ kind: 'ownerCallback', ownerId: o.id }) },
    { id: 'callbackDone', tier: 'quick', icon: 'check', label: 'Callback done',
      when: (o) => !!o.callbackAt,
      sub: (o) => 'Clears it from the queue',
      run: (store, o) => store.setOwnerCallback(o.id, null) },
    { id: 'remark', tier: 'quick', icon: 'note', label: 'Add remark',
      run: (store, o) => store.openModal({ kind: 'remark', recordType: 'owner', recordId: o.id }) },
    { id: 'assign', tier: 'manage', icon: 'userPlus',
      label: (o) => (o.agentId ? 'Reassign caller' : 'Assign caller'),
      when: (o, store) => canAssignLead(store.state.role),
      sub: (o, store) => { const a = store.agentById(o.agentId); return a ? a.name : 'Unassigned' },
      run: (store, o) => store.openModal({ kind: 'bulkAssign', leadIds: [o.id], isOwner: true }) },
    { id: 'delete', tier: 'manage', icon: 'trash', label: 'Delete owner', tone: 'danger',
      run: (store, o, ctx) => { if (window.confirm('Delete this owner record permanently?')) { store.deleteOwner(o.id); ctx?.onClose?.() } } },
  ],

  // Compact phone row for the calling queue — the three things a caller needs
  // before deciding to dial: who, where, and whether they are already late.
  phoneCard: (o, store, actions) => {
    const cb = callbackSignal(o.callbackAt)
    const a = store.agentById(o.agentId)
    return (
      <div className="prow">
        <div className="prow-top">
          <span className="prow-name">{o.name || 'Unnamed owner'}</span>
          <StageCell
            record={o} store={store} stages={ownerStages(store)}
            canSet={canUpdateLeadStatus(store.state.role, store.state.activeAgentId, o)}
            onSet={(stage) => store.setOwnerStage(o.id, stage)}
          />
        </div>
        {(o.project || o.unitRef) && <div className="prow-req">{[o.project, o.unitRef].filter(Boolean).join(' · ')}</div>}
        <div className="prow-foot">
          <div className="prow-meta">
            {a ? <span className="prow-agent"><Avatar agent={a} size="sm" />{a.first}</span> : <Unassigned />}
            {/* The callback time, not the phone number — this is the fact that
                decides whether this one gets dialled next. */}
            {cb && (cb.tone === 'overdue' ? <Overdue>{cb.label}</Overdue> : <span>{cb.label}</span>)}
          </div>
          {actions}
        </div>
      </div>
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
  // `ctx` reaches `when` as well as `run`. It carries `onRail` — true only on
  // a desk record, where the module's rail is drawn — so an action that the
  // rail's own block is already offering can step aside there while staying on
  // the phone, which has no rail and reaches everything through this list.
  const actions = (def.actions || []).filter(a => !a.when || a.when(record, store, ctx))
  return {
    quick: actions.filter(a => a.tier === 'quick').map(resolve),
    manage: actions.filter(a => a.tier !== 'quick').map(resolve),
  }
}
