import { useState } from 'react'
import { ListLayout } from '../layouts/layouts.jsx'
import { ModuleListView, ModuleCards, ModuleTable } from '../components/collections.jsx'
import { ModuleDetail } from '../components/ModuleDetail.jsx'
import { Button, Timeline, Overdue, Avatar, CappedList } from '../components/primitives.jsx'
import { fitReasons, thumbTint, initials, unitLabel } from '../lib/format.js'
import { matchesForLead } from '../lib/matching.js'
import { useRecord } from '../lib/useRecord.js'
import { useServerList } from '../lib/serverList.js'
import { api } from '../lib/api.js'
import { useEffect } from 'react'
import Icon from '../components/Icon.jsx'
import { LEADS_DEF } from './definitions.jsx'

// A scheduled appointment's action reads like "Site Visit — Anita Rao", so the
// type is a prefix rather than its own field. Matched loosely because the
// label is user-facing text that has changed spelling before.
function isSiteVisit(followUp) {
  return /site\s*visit/i.test(followUp?.action || '')
}

// Segment pill counts, straight from the database.
function useLeadsSummary(dataAsOf) {
  const [counts, setCounts] = useState({})
  useEffect(() => {
    let live = true
    api.getLeadsSummary().then(r => { if (live && r?.success) setCounts(r.summary) }).catch(() => {})
    return () => { live = false }
  }, [dataAsOf])
  return counts
}

/**
 * Leads is a ROUTER and holds no hooks of its own — same reason as Properties:
 * returning the record takeover from the middle of the list component rendered
 * fewer hooks than the list did, and React threw on the way back.
 */
export default function Leads(props) {
  const { store, go, sel, setSel, topBar, phone } = props
  if (sel.leadOpen && sel.leadId) {
    return <LeadRecord store={store} go={go} sel={sel} setSel={setSel} topBar={topBar} phone={phone} />
  }
  return <LeadList {...props} />
}

function LeadList({ store, go, sel, setSel, topBar, phone }) {
  const { state } = store
  const [flt, setFlt] = useState(sel.leadFilter || {})
  const [q, setQ] = useState('')
  const [sortKey, setSortKey] = useState('activity')
  const [sortDir, setSortDir] = useState('asc')
  const [view, setView] = useState('list')
  const [seg, setSeg] = useState('all')
  const [intent, setIntent] = useState('all')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const setFltP = (v) => { setFlt(v); setPage(1) }
  const setQP = (v) => { setQ(v); setPage(1) }
  const setSortKeyP = (v) => { setSortKey(v); setPage(1) }
  const setSortDirP = (v) => { setSortDir(v); setPage(1) }
  const setSegP = (v) => { setSeg(v); setPage(1) }
  const setIntentP = (v) => { setIntent(v); setPage(1) }
  const setPageSizeP = (v) => { setPageSize(v); setPage(1) }

  // One page from the server. The agent's own-pipeline scope is applied in the
  // query, not by filtering an array here — a filter the client applies is a
  // display choice, not a permission.
  const source = useServerList(
    (params) => api.listLeads({
      page: params.page,
      limit: params.limit,
      q: params.q,
      segment: seg === 'all' ? undefined : seg,
      intent: intent === 'all' ? undefined : intent
    }),
    { filters: flt, search: q, sortKey, sortDir, page, pageSize, accumulate: !!phone },
    [state.dataAsOf, seg, intent],
  )

  const onOpen = (l) => go('leads', { leadId: l.id, leadOpen: true })
  // The KPI strip used to sit above these pills reading Total / Overdue /
  // Unassigned — the same three numbers the pills now carry, one row apart,
  // each filtering a different way. Two controls for one question.

  // B2 — sub-segments. The buckets live on LEADS_DEF (definitions.jsx) so the
  // pattern belongs to the module standard, not to this screen. Counts are of
  // what the agent can actually see, so an agent's "Overdue 3" is their three.
  // Pill counts come from Postgres. They used to be `records.filter(...).length`
  // over every lead in the firm, which is the same number only while the whole
  // collection is in the browser.
  const counts = useLeadsSummary(state.dataAsOf)
  const segs = (LEADS_DEF.segments || []).map(sg => ({
    key: sg.key,
    label: sg.label,
    tone: sg.tone,
    on: seg === sg.key,
    count: counts[sg.key] ?? counts.total ?? 0,
    onClick: () => setSegP(sg.key),
  }))

  const { header, toolbar, body } = ModuleListView({
    def: LEADS_DEF, source, store, onOpen,
    filters: flt, onFilters: setFltP,
    search: q, onSearch: setQP,
    sortKey, onSortKey: setSortKeyP, sortDir, onSortDir: setSortDirP,
    segments: segs, view, onView: setView, phone,
    page, onPage: setPage, pageSize, onPageSize: setPageSizeP,
    leftAddon: (
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginRight: 12 }}>
        <button
          type="button"
          onClick={() => setIntentP('all')}
          style={{
            padding: '6px 14px', borderRadius: 8, fontWeight: 700, fontSize: 13, border: '1px solid var(--line)', cursor: 'pointer',
            background: intent === 'all' ? 'var(--accent, #1E6F52)' : '#fff',
            color: intent === 'all' ? '#fff' : 'var(--ink)'
          }}
        >
          All Leads
        </button>
        <button
          type="button"
          onClick={() => setIntentP('buy')}
          style={{
            padding: '6px 14px', borderRadius: 8, fontWeight: 700, fontSize: 13, border: '1px solid var(--line)', cursor: 'pointer',
            background: intent === 'buy' ? 'var(--accent, #1E6F52)' : '#fff',
            color: intent === 'buy' ? '#fff' : 'var(--ink)'
          }}
        >
          Sale
        </button>
        <button
          type="button"
          onClick={() => setIntentP('rent')}
          style={{
            padding: '6px 14px', borderRadius: 8, fontWeight: 700, fontSize: 13, border: '1px solid var(--line)', cursor: 'pointer',
            background: intent === 'rent' ? 'var(--accent, #1E6F52)' : '#fff',
            color: intent === 'rent' ? '#fff' : 'var(--ink)'
          }}
        >
          Rent
        </button>
      </div>
    ),
    cta: { label: 'New lead', onClick: () => store.openModal({ kind: 'newLead' }) },
    renderTable: (list, v) => v === 'grid'
      ? <ModuleCards def={LEADS_DEF} rows={list} store={store} onOpen={onOpen} />
      : <ModuleTable def={LEADS_DEF} rows={list} store={store} onOpen={onOpen} sortKey={sortKey} sortDir={sortDir} onSort={setSortKeyP} />,
  })

  return (
    <>
      {topBar({
        title: 'Leads',
        // Bulk import is desk work and has no phone screen, so the phone chrome
        // must not offer a route to one.
        actions: phone ? null : <Button variant="secondary" size="sm" icon="layers" onClick={() => go('import', { kind: 'clients' })}>Import / Revert</Button>
      })}
      {header}
      <ListLayout toolbar={toolbar}>{body}</ListLayout>
    </>
  )
}

// The listings worth showing this lead. The server narrows the book to
// candidates; matching.js still does the scoring and the fit reasons, so the
// answers are the ones the product has always given.
function useLeadMatches(lead) {
  const [cands, setCands] = useState([])
  useEffect(() => {
    if (!lead?.id) { setCands([]); return }
    let live = true
    api.getLeadMatches(lead.id).then(r => { if (live) setCands(r?.data || []) }).catch(() => { if (live) setCands([]) })
    return () => { live = false }
  }, [lead?.id])
  return lead ? matchesForLead(lead, cands) : []
}

function LeadRecord({ store, go, sel, setSel, topBar, phone }) {
  // The lead this screen is showing — fetched on its own if we don't already
  // hold it. This used to be a find() over every lead in the firm, which meant
  // a deep link from a notification sat on "Opening lead details…" until the
  // whole collection had downloaded, and said it forever if it never did.
  const { record: l, loading, error } = useRecord(store, 'lead', sel.leadId)
  // Above the early return: a hook cannot be called conditionally, and the
  // "record not loaded yet" branch below is exactly such a condition.
  const matches = useLeadMatches(l)
  if (!l) {
    return (
      <>
        {topBar({ title: 'Lead', eyebrow: 'Leads', onBack: () => setSel(s => ({ ...s, leadOpen: false })) })}
        {loading
          ? <div className="list-spin" role="status" aria-label="Loading"><span /></div>
          : <div className="detail-missing">{error === 'not-found' ? 'This lead no longer exists.' : 'Could not open this lead.'}</div>}
      </>
    )
  }
  const a = store.agentById(l.agentId)
  const overdue = l.overdue
  const back = () => setSel(s => ({ ...s, leadOpen: false }))

  // The next-best-action banner is gone. With a follow-up scheduled it
  // restated the follow-up card sitting directly beneath it; without one it
  // said "Contact this lead", which is a label, not a recommendation. A banner
  // that is either a duplicate or a truism is noise on the one screen an agent
  // reads all day.

  // merged property list: shortlisted pinned first, then system matches
  const shortlistIds = l.shortlist || []
  const byId = (id) => store.lookup('property', id)
  const fbMap = l.feedback || {}
  const propRows = [
    ...shortlistIds.map(byId).filter(Boolean).map(p => ({ p, shortlisted: true, fit: fitReasons(p, l.req).score, line: quotedShort(p) })),
    ...matches.filter(m => !shortlistIds.includes(m.id)).map(m => ({ p: m, shortlisted: false, fit: fitReasons(m, l.req).score, line: quotedShort(m) })),
  ].sort((a, b) => (fbMap[a.p.id]?.verdict === 'rejected' ? 1 : 0) - (fbMap[b.p.id]?.verdict === 'rejected' ? 1 : 0))

  const openEdit = () => store.openModal({ kind: 'editRecord', moduleId: 'leads', recordId: l.id })
  // Rail: the follow-up card, which is the only thing that changes per lead.
  const followUpCard = (
    <div className="fu-card">
      <div className="fu-head">Appointment & Follow-up</div>
      {l.followUp ? (
        <div className="fu-active">
          <div>
            <div className="fu-title">{l.followUp.action}</div>
            <div className="fu-when">{l.followUp.date} · {l.followUp.time}</div>
          </div>
          {/* B4: a site visit closes with proof (live photo + location), not a
              bare click. Every other appointment type — calls, meetings, demos
              — keeps the one-click Done, because there's nothing to verify. */}
          {isSiteVisit(l.followUp) ? (
            <button className="btn btn-primary btn-sm fu-done" onClick={() => store.openModal({ kind: 'visitProof', leadId: l.id })}>
              Log visit
            </button>
          ) : (
            <button className="btn btn-ghost btn-sm fu-done" onClick={() => { store.setFollowUp(l.id, null); store.toast('Appointment marked completed') }}>Done</button>
          )}
        </div>
      ) : <div className="detail-empty">No active appointment or follow-up scheduled.</div>}
      <Button variant="secondary" size="sm" block icon="calendar" onClick={() => store.openModal({ kind: 'scheduleFollowUp', leadId: l.id })}>
        {l.followUp ? 'Reschedule appointment' : 'Schedule appointment'}
      </Button>
    </div>
  )

  const sections = [
    {
      id: 'inventory',
      title: 'Matched & shortlisted inventory',
      right: <button className="btn btn-secondary btn-sm" onClick={() => store.openModal({ kind: 'attachProp', leadId: l.id })}><Icon name="plus" size={14} /> Attach property</button>,
      render: () => propRows.length === 0
        ? <div className="detail-empty">No shortlisted or matching inventory yet. Attach one to get started.</div>
        : <CappedList items={propRows} step={6} noun="properties">{(row, i) => {
            const fb = (l.feedback || {})[row.p.id]
            const rejected = fb?.verdict === 'rejected'
            return (
              <div key={row.p.id} className={'invrow' + (i ? ' relrow-div' : '') + (rejected ? ' invrow-rej' : '')}>
                <div className="invrow-thumb" style={{ background: thumbTint(row.p.id) }}><Icon name="building" size={20} strokeWidth={1.4} /></div>
                <button className="invrow-main" onClick={() => go('properties', { propId: row.p.id, propOpen: true })}>
                  <div className="invrow-title">
                    <span className={rejected ? 'invrow-strike' : ''}>{row.p.society}</span>
                    {/* Agent-side only — the unit no. is never in a client message,
                        but here it's what distinguishes two flats in one society. */}
                    {unitLabel(row.p) && <span className="unit-tag">{unitLabel(row.p)}</span>}
                    {fb?.verdict === 'liked' && <span className="fit ok fit-tight">👍 Liked</span>}
                    {rejected && <span className="fit no fit-tight">👎 {fb.reason}</span>}
                    {!fb && (row.shortlisted
                      ? <span className="fit ok fit-tight"><Icon name="check" size={11} />Shortlisted</span>
                      : <span className="source">{row.fit}% match</span>)}
                  </div>
                  <div className="relrow-sub">{row.p.type} · {row.p.locality} · {row.line}</div>
                </button>
                <Button variant="secondary" size="sm" onClick={() => store.openWhatsApp(row.p.id, l.id)} icon="wa">Share Match</Button>
              </div>
            )
          }}</CappedList>,
    },
    {
      id: 'timeline',
      title: 'Inquiry interaction timeline',
      render: () => <Timeline events={l.timeline} agents={store.state.agents} currentUserId={store.state.activeAgentId}
        onEditRemark={(eventId, text) => store.editRemark('lead', l.id, eventId, text)} />,
    },
  ]

  return (
    <>
      {topBar({ eyebrow: 'Leads', title: l.name, onBack: back })}
      <div className="app-body">
        <ModuleDetail
          def={LEADS_DEF} record={l} store={store} onEdit={openEdit} phone={phone}
          avatar={<Avatar agent={{ initials: initials(l.name), avatar: '' }} size="lg" />}
          signals={overdue ? <Overdue>Overdue</Overdue> : null}
          // Reaching a client is the whole reason this page gets opened, and
          // both ways of doing it were only in the action button — two taps and
          // a menu to read, for the thing every visit starts with.
          primary={l.phone ? [
            { label: 'Call', icon: 'phone', onClick: () => store.openModal({ kind: 'contact', channel: 'call', name: l.name, phone: l.phone, recordType: 'lead', recordId: l.id }) },
            { label: 'WhatsApp', icon: 'wa', onClick: () => store.openModal({ kind: 'contact', channel: 'wa', name: l.name, phone: l.phone, recordType: 'lead', recordId: l.id }) },
          ] : []}
          railTop={followUpCard}
          sections={sections}
          actionCtx={{ onClose: back }}
        />
      </div>
    </>
  )
}

function followFrom(f, l) {
  const type = f.action === 'site' ? 'Site visit' : f.action === 'meeting' ? 'Meeting' : 'Call'
  const dateLabel = f.quick === 'today' ? 'Today' : f.quick === 'tomorrow' ? 'Tomorrow' : f.quick === 'weekend' ? 'This weekend' : (f.date || 'Scheduled')
  return { action: `${type} — ${l.name}`, date: dateLabel, time: f.time || '11:00 am' }
}

// compact, quiet money string for a property row (deal-aware)
function quotedShort(p) {
  return p.deal === 'rent' ? `${p.priceLabel}` : `${p.priceLabel}${p.negotiable ? ' · neg.' : ''}`
}
