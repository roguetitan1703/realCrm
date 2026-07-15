import { useState } from 'react'
import { ListLayout } from '../layouts/layouts.jsx'
import { ModuleListView, ModuleCards, ModuleTable } from '../components/collections.jsx'
import { ModuleDetail } from '../components/ModuleDetail.jsx'
import { Button, Panel, Timeline, StageTag, Overdue } from '../components/primitives.jsx'
import { NbaBanner } from '../components/rail.jsx'
import { fitReasons, thumbTint } from '../lib/format.js'
import { matchesForLead } from '../lib/matching.js'
import Icon from '../components/Icon.jsx'
import { LEADS_DEF } from './definitions.jsx'

export default function Leads({ store, go, sel, setSel, topBar }) {
  const { state } = store
  const [flt, setFlt] = useState(sel.leadFilter || {})
  const [q, setQ] = useState('')
  const [sortKey, setSortKey] = useState('activity')
  const [sortDir, setSortDir] = useState('asc')
  const [view, setView] = useState('list')

  const open = sel.leadOpen && sel.leadId
  if (open) return <LeadRecord store={store} go={go} sel={sel} setSel={setSel} topBar={topBar} />

  // Agent role sees only their own pipeline; the shared engine handles filter/search/sort.
  const records = state.role === 'agent'
    ? state.leads.filter(l => l.agentId === state.activeAgentId)
    : state.leads

  const onOpen = (l) => go('leads', { leadId: l.id, leadOpen: true })
  const counts = {
    all: state.leads.length,
    overdue: state.leads.filter(l => l.overdue).length,
    unassigned: state.leads.filter(l => !l.agentId).length,
  }
  const kpis = [
    { label: 'Total', value: counts.all, onClick: () => setFlt({}) },
    { label: 'Overdue', value: counts.overdue, tone: 'alert', onClick: () => setFlt({ flag: ['overdue'] }) },
    { label: 'Unassigned', value: counts.unassigned, onClick: () => setFlt({ flag: ['unassigned'] }) },
  ]

  const { header, toolbar, body } = ModuleListView({
    def: LEADS_DEF, records, store, onOpen,
    filters: flt, onFilters: setFlt,
    search: q, onSearch: setQ,
    sortKey, onSortKey: setSortKey, sortDir, onSortDir: setSortDir,
    kpis, view, onView: setView,
    cta: { label: 'New lead', onClick: () => store.openModal({ kind: 'newLead' }) },
    renderTable: (list, v) => v === 'grid'
      ? <ModuleCards def={LEADS_DEF} rows={list} store={store} onOpen={onOpen} />
      : <ModuleTable def={LEADS_DEF} rows={list} store={store} onOpen={onOpen} sortKey={sortKey} sortDir={sortDir} onSort={setSortKey} />,
  })

  return (
    <>
      {topBar({
        title: 'Leads',
        actions: <Button variant="secondary" size="sm" icon="layers" onClick={() => go('import', { kind: 'clients' })}>Import / Revert</Button>
      })}
      {header}
      <ListLayout toolbar={toolbar}>{body}</ListLayout>
    </>
  )
}

// ---------------------------------------------------------------------------
function LeadRecord({ store, go, sel, setSel, topBar }) {
  const l = store.state.leads.find(x => x.id === sel.leadId)
  if (!l) { return <>{topBar({ title: 'Lead', eyebrow: 'Leads', onBack: () => setSel(s => ({ ...s, leadOpen: false })) })}<div style={{ padding: 22 }}>Lead not found.</div></> }
  const a = store.agentById(l.agentId)
  const matches = matchesForLead(l, store.state.properties)
  const overdue = l.overdue
  const back = () => setSel(s => ({ ...s, leadOpen: false }))
  const top1 = matches[0]

  // Next-best-action
  const nba = (() => {
    if (l.followUp) {
      const [head, ...rest] = String(l.followUp.action).split('—')
      const t = head.trim()
      return {
        title: t,
        sub: rest.join('—').trim() || l.name,
        icon: /visit/i.test(t) ? 'calendar' : /meet/i.test(t) ? 'people' : 'phone',
      }
    }
    if (top1) return { title: 'Share a match', sub: top1.society, icon: 'wa' }
    return { title: 'Contact this lead', sub: l.phone, icon: 'phone' }
  })()

  // merged property list: shortlisted pinned first, then system matches
  const shortlistIds = l.shortlist || []
  const byId = (id) => store.state.properties.find(p => p.id === id)
  const fbMap = l.feedback || {}
  const propRows = [
    ...shortlistIds.map(byId).filter(Boolean).map(p => ({ p, shortlisted: true, fit: fitReasons(p, l.req).score, line: quotedShort(p) })),
    ...matches.filter(m => !shortlistIds.includes(m.id)).map(m => ({ p: m, shortlisted: false, fit: fitReasons(m, l.req).score, line: quotedShort(m) })),
  ].sort((a, b) => (fbMap[a.p.id]?.verdict === 'rejected' ? 1 : 0) - (fbMap[b.p.id]?.verdict === 'rejected' ? 1 : 0))

  const openEdit = () => store.openModal({ kind: 'editRecord', moduleId: 'leads', recordId: l.id })
  const stages = store.state.settings.stages
  const activeStages = stages.filter(s => s !== 'Closed Lost')
  const nextStage = (() => { const i = activeStages.indexOf(l.stage); return i >= 0 && i < activeStages.length - 1 ? activeStages[i + 1] : null })()

  // Rail: NBA banner + follow-up card (module-specific).
  const nbaBanner = (
    <NbaBanner
      label={overdue ? 'Overdue Action · Do Now' : 'Next Best Action'}
      title={nba.title} sub={nba.sub} icon={nba.icon}
      cta={{ label: l.followUp ? 'Complete' : 'Call Now', icon: nba.icon, onClick: () => store.openModal({ kind: 'outreach', leadId: l.id, channel: 'call' }) }}
    />
  )
  const followUpCard = (
    <div className="fu-card">
      <div className="fu-head">Appointment & Follow-up</div>
      {l.followUp ? (
        <div className="fu-active">
          <div>
            <div className="fu-title">{l.followUp.action}</div>
            <div className="fu-when">{l.followUp.date} · {l.followUp.time}</div>
          </div>
          <button className="btn btn-ghost btn-sm fu-done" onClick={() => { store.setFollowUp(l.id, null); store.toast('Appointment marked completed') }}>Done</button>
        </div>
      ) : <div className="detail-empty">No active appointment or follow-up scheduled.</div>}
      <Button variant="secondary" size="sm" block icon="calendar" onClick={() => store.openModal({ kind: 'scheduleFollowUp', leadId: l.id })}>
        {l.followUp ? 'Reschedule appointment' : 'Schedule appointment'}
      </Button>
    </div>
  )

  // Pipeline control — shown above the record sheet (module-specific).
  const pipelineBar = (
    <Panel>
      <div className="pipeline-bar">
        <div className="pl-stage">
          <div className="pl-label">Pipeline Stage</div>
          <select className="pl-select" aria-label="Lead Pipeline Stage" value={l.stage} onChange={e => store.setStage(l.id, e.target.value)}>
            {stages.map(st => <option key={st} value={st}>{st}</option>)}
          </select>
        </div>
        <div className="pl-actions">
          {nextStage && (
            <button className="btn btn-secondary btn-sm pl-advance" onClick={() => { store.setStage(l.id, nextStage); store.toast(`Advanced to ${nextStage}`) }}>
              <span>Move to {nextStage}</span><Icon name="arrowRight" size={14} />
            </button>
          )}
          <button className="btn btn-quiet btn-sm pl-lost" onClick={() => {
            const reason = window.prompt('Reason for marking lead as lost? (e.g. Budget, Competition, Timeline)', 'Budget mismatch')
            if (reason !== null) { store.setStage(l.id, 'Closed Lost'); store.toast('Lead marked as Closed Lost') }
          }}>Mark as Lost</button>
        </div>
      </div>
    </Panel>
  )

  const sections = [
    {
      id: 'inventory',
      title: 'Matched & shortlisted inventory',
      right: <button className="btn btn-secondary btn-sm" onClick={() => store.openModal({ kind: 'attachProp', leadId: l.id })}><Icon name="plus" size={14} /> Attach property</button>,
      render: () => propRows.length === 0
        ? <div className="detail-empty">No shortlisted or matching inventory yet. Attach one to get started.</div>
        : propRows.map((row, i) => {
            const fb = (l.feedback || {})[row.p.id]
            const rejected = fb?.verdict === 'rejected'
            return (
              <div key={row.p.id} className={'invrow' + (i ? ' relrow-div' : '') + (rejected ? ' invrow-rej' : '')}>
                <div className="invrow-thumb" style={{ background: thumbTint(row.p.id) }}><Icon name="building" size={20} strokeWidth={1.4} /></div>
                <button className="invrow-main" onClick={() => go('properties', { propId: row.p.id, propOpen: true })}>
                  <div className="invrow-title">
                    <span className={rejected ? 'invrow-strike' : ''}>{row.p.society}</span>
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
          }),
    },
    {
      id: 'timeline',
      title: 'Inquiry interaction timeline',
      render: () => <Timeline events={l.timeline} />,
    },
  ]

  return (
    <>
      {topBar({ eyebrow: 'Leads', title: l.name, onBack: back })}
      <div className="app-body">
        <ModuleDetail
          def={LEADS_DEF} record={l} store={store} onEdit={openEdit}
          signals={<><StageTag stage={l.stage} />{overdue && <Overdue>Overdue</Overdue>}</>}
          primary={[{ label: 'Contact', icon: 'phone', onClick: () => store.openModal({ kind: 'outreach', leadId: l.id, channel: 'call' }) }]}
          nba={nbaBanner}
          railTop={followUpCard}
          beforeSheet={pipelineBar}
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
