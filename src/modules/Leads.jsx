import { useState } from 'react'
import { ListLayout, DetailLayout } from '../layouts/layouts.jsx'
import { FilterBar, SortControl, Table } from '../components/collections.jsx'
import { StageTag, Source, Overdue, Unassigned, Avatar, Money, GlanceCard, Button, Panel, SectionHead, KV, Timeline, Stepper } from '../components/primitives.jsx'
import { ActionRail, RailSection, NbaBanner, ActionGroup, Scheduler } from '../components/rail.jsx'
import { theme } from '../data/theme.js'
import { reqShort, budgetRange, fitReasons, thumbTint, initials } from '../lib/format.js'
import { matchesForLead } from '../data/seed.js'
import Icon from '../components/Icon.jsx'

const SORT_OPTS = { activity: 'Last activity', budget: 'Budget', name: 'Name', stage: 'Stage' }

// filterable fields for leads — config drives the scalable FilterBar (no custom pills)
const leadFields = (agents) => [
  { key: 'flag', label: 'Needs attention', icon: 'clock', options: [{ value: 'overdue', label: 'Overdue' }, { value: 'unassigned', label: 'Unassigned' }, { value: 'new', label: 'New today' }] },
  { key: 'stage', label: 'Stage', icon: 'layers', options: theme.stages.map(s => ({ value: s, label: s })) },
  { key: 'deal', label: 'Deal', icon: 'tag', options: [{ value: 'sale', label: 'Sale' }, { value: 'rent', label: 'Rent' }] },
  { key: 'source', label: 'Source', icon: 'trend', options: theme.sources.map(s => ({ value: s, label: s })) },
  { key: 'locality', label: 'Locality', icon: 'building', options: LOCALITIES.map(l => ({ value: l, label: l })) },
  { key: 'agent', label: 'Agent', icon: 'person', options: [{ value: '_none', label: 'Unassigned' }, ...agents.map(a => ({ value: a.id, label: a.first }))] },
]
const LOCALITIES = ['Wakad', 'Baner', 'Kothrud', 'Hinjewadi', 'Viman Nagar', 'Kalyani Nagar', 'Wagholi']

export default function Leads({ store, go, sel, setSel, topBar }) {
  const { state } = store
  const [flt, setFlt] = useState(sel.leadFilter || {})
  const [q, setQ] = useState('')
  const [sortKey, setSortKey] = useState('activity')
  const [sortDir, setSortDir] = useState('asc')

  const open = sel.leadOpen && sel.leadId
  if (open) return <LeadRecord store={store} go={go} sel={sel} setSel={setSel} topBar={topBar} />

  let list = state.leads.slice()
  // scalable filters
  const has = (k) => (flt[k] || []).length
  if (has('stage')) list = list.filter(l => flt.stage.includes(l.stage))
  if (has('deal')) list = list.filter(l => flt.deal.includes(l.req.deal))
  if (has('source')) list = list.filter(l => flt.source.includes(l.source))
  if (has('locality')) list = list.filter(l => flt.locality.includes(l.req.locality))
  if (has('agent')) list = list.filter(l => flt.agent.includes(l.agentId || '_none'))
  if (has('flag')) {
    list = list.filter(l =>
      (flt.flag.includes('overdue') && l.overdue) ||
      (flt.flag.includes('unassigned') && !l.agentId) ||
      (flt.flag.includes('new') && l.minsAgo < 1440))
  }
  // module-native search
  if (q.trim()) {
    const s = q.trim().toLowerCase()
    list = list.filter(l => l.name.toLowerCase().includes(s) || l.phone.includes(s) || l.req.locality.toLowerCase().includes(s) || l.req.config.toLowerCase().includes(s))
  }
  const val = (l) => sortKey === 'name' ? l.name.toLowerCase() : sortKey === 'budget' ? l.req.budgetMax : sortKey === 'stage' ? theme.stages.indexOf(l.stage) : l.minsAgo
  list.sort((a, b) => { const c = val(a) < val(b) ? -1 : val(a) > val(b) ? 1 : 0; return sortDir === 'asc' ? c : -c })

  const counts = {
    all: state.leads.length,
    overdue: state.leads.filter(l => l.overdue).length,
    unassigned: state.leads.filter(l => !l.agentId).length,
  }

  const toolbar = (
    <FilterBar
      fields={leadFields(store.activeAgents())}
      value={flt} onChange={setFlt}
      search={{ value: q, onChange: setQ, placeholder: 'Search name, phone, locality…' }}
      right={<SortControl value={sortKey} dir={sortDir} onSort={setSortKey}
        onDir={() => setSortDir(d => d === 'asc' ? 'desc' : 'asc')}
        options={Object.entries(SORT_OPTS).map(([value, label]) => ({ value, label }))} />}
      cta={{ label: 'New lead', onClick: () => store.openModal({ kind: 'newLead' }) }}
    />
  )

  const columns = [
    { key: 'name', label: 'Name', sortable: true },
    { key: 'req', label: 'Requirement' },
    { key: 'budget', label: 'Budget', sortable: true },
    { key: 'stage', label: 'Stage', sortable: true },
    { key: 'source', label: 'Source' },
    { key: 'agent', label: 'Agent' },
    { key: 'next', label: 'Next follow-up' },
  ]
  const rows = list.map(l => {
    const a = store.agentById(l.agentId)
    const nf = l.followUp ? `${l.followUp.date} · ${l.followUp.time}` : '—'
    return {
      id: l.id, onClick: () => go('leads', { leadId: l.id, leadOpen: true }),
      cells: [
        <div><div className="name">{l.name}</div><div className="sub mono-num">{l.phone}</div></div>,
        reqShort(l.req),
        <Money>{budgetRange(l.req)}</Money>,
        <StageTag stage={l.stage} />,
        <Source>{l.source}</Source>,
        a ? <div className="u-row" style={{ gap: 8 }}><Avatar agent={a} size="sm" /><span style={{ fontSize: 13 }}>{a.first}</span></div> : <Unassigned />,
        l.overdue ? <Overdue>{nf}</Overdue> : <span className="mono-num" style={{ fontSize: 13, color: 'var(--muted)' }}>{nf}</span>,
      ],
    }
  })

  return (
    <>
      {topBar({ title: 'Leads', count: `${counts.all} total · ${counts.overdue} overdue · ${counts.unassigned} unassigned` })}
      <ListLayout toolbar={toolbar}>
        {list.length === 0
          ? <div className="empty"><div className="e-t">No leads match</div><div className="e-s">Try clearing a filter or search.</div></div>
          : <Table columns={columns} rows={rows} sortKey={sortKey} sortDir={sortDir} onSort={setSortKey} />}
      </ListLayout>
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
  const nbaTitle = l.followUp ? l.followUp.action : (matches[0] ? `Send ${matches[0].society}` : 'Contact this lead')
  const back = () => setSel(s => ({ ...s, leadOpen: false }))
  const top1 = matches[0]

  // merged property list: shortlisted (attached) pinned first, then system matches
  const shortlistIds = l.shortlist || []
  const byId = (id) => store.state.properties.find(p => p.id === id)
  const fbMap = l.feedback || {}
  const propRows = [
    ...shortlistIds.map(byId).filter(Boolean).map(p => ({ p, shortlisted: true, fit: fitReasons(p, l.req).score, line: quotedShort(p) })),
    ...matches.filter(m => !shortlistIds.includes(m.id)).map(m => ({ p: m, shortlisted: false, fit: fitReasons(m, l.req).score, line: quotedShort(m) })),
  ].sort((a, b) => (fbMap[a.p.id]?.verdict === 'rejected' ? 1 : 0) - (fbMap[b.p.id]?.verdict === 'rejected' ? 1 : 0))

  // TWO CLEAR OUTREACH PATHS + manage. "Contact" is plain (no property needed);
  // "Share a property" is the matched/generated feature.
  const actionGroups = [
    { head: 'Contact', items: [
      { icon: 'phone', label: 'Call & log', sub: l.phone, onClick: () => store.openModal({ kind: 'outreach', leadId: l.id, channel: 'call' }) },
      { icon: 'sms', label: 'Send SMS', onClick: () => store.openModal({ kind: 'outreach', leadId: l.id, channel: 'sms' }) },
      { icon: 'wa', label: 'WhatsApp (message)', onClick: () => store.openModal({ kind: 'outreach', leadId: l.id, channel: 'wa' }) },
      { icon: 'note', label: 'Add note', onClick: () => store.openModal({ kind: 'note', leadId: l.id }) },
    ] },
    { head: 'Share a property', items: [
      { icon: 'wa', label: 'WhatsApp a property', tone: 'accent', sub: top1 ? `best: ${top1.society}` : 'pick from matches', onClick: () => store.openModal({ kind: 'pickMatch', leadId: l.id }) },
      { icon: 'plus', label: 'Attach to shortlist', onClick: () => store.openModal({ kind: 'attachProp', leadId: l.id }) },
    ] },
    { head: 'Manage', items: [
      { icon: 'userPlus', label: l.agentId ? 'Reassign owner' : 'Assign owner', sub: a ? a.name : 'Unassigned', onClick: () => store.openModal({ kind: 'assign', leadId: l.id }) },
      { icon: 'edit', label: 'Edit details', onClick: () => store.openModal({ kind: 'editLead', leadId: l.id }) },
      ...(l.duplicateOf ? [{ icon: 'copy', label: 'Merge duplicate', tone: 'danger', onClick: () => store.merge(l.id) }] : []),
    ] },
  ]

  return (
    <>
      {topBar({ eyebrow: 'Leads', title: l.name, onBack: back,
        actions: <>
          <Button size="sm" onClick={() => store.openModal({ kind: 'outreach', leadId: l.id, channel: 'call' })} icon="phone">Call</Button>
          <Button variant="secondary" size="sm" onClick={() => store.openModal({ kind: 'outreach', leadId: l.id, channel: 'wa' })} icon="wa">WhatsApp</Button>
        </> })}
      <div className="app-body">
        <DetailLayout rail={
          <ActionRail>
            <RailSection>
              <NbaBanner label={overdue ? 'Next best action · overdue' : 'Next best action'} title={nbaTitle}
                cta={{ label: l.followUp ? 'Do it' : 'Call now', onClick: () => store.openModal({ kind: 'outreach', leadId: l.id, channel: 'call' }) }} />
            </RailSection>
            <RailSection title="Actions">
              <ActionGroup groups={actionGroups} />
            </RailSection>
            <RailSection title="Schedule follow-up">
              <Scheduler onSave={(f) => store.setFollowUp(l.id, followFrom(f, l))} />
            </RailSection>
            <RailSection title="Stage" right="tap to advance">
              <Stepper stages={theme.stages.filter(s => s !== 'Closed Lost')} current={l.stage} onPick={(s) => store.setStage(l.id, s)} />
              <div style={{ marginTop: 9, textAlign: 'right' }}>
                <button className="btn btn-quiet btn-sm" style={{ color: 'var(--muted)', textDecoration: 'underline' }} onClick={() => store.setStage(l.id, 'Closed Lost')}>Mark as lost</button>
              </div>
            </RailSection>
          </ActionRail>
        }>
          {/* glance card — at-a-glance, deal-aware */}
          <GlanceCard
            thumb={<span className={'av av-lg ' + (a ? a.avatar : '')} style={a ? undefined : { background: 'var(--chrome)' }}>{initials(l.name)}</span>}
            eyebrow={`${l.req.deal === 'rent' ? 'Tenant' : 'Buyer'} · ${l.source}`}
            name={l.name}
            sub={<span className="mono-num">{l.phone}</span>}
            meta={[
              <StageTag stage={l.stage} />,
              a ? <span className="u-muted" style={{ fontSize: 12.5 }}>Owner · <b style={{ color: 'var(--ink)' }}>{a.name}</b></span> : <Unassigned />,
              l.duplicateOf ? <span className="fit no">Possible duplicate</span> : null,
            ].filter(Boolean)}
            facts={[
              { k: 'Looking for', v: `${l.req.config} · ${l.req.deal}` },
              { k: 'Budget', v: budgetRange(l.req) },
              { k: 'Locality', v: l.req.locality },
              { k: 'Timeline', v: l.req.timeline, mut: true },
            ]}
          />

          {/* requirement notes */}
          {l.req.notes && (
            <Panel>
              <SectionHead title="Requirement notes" />
              <div className="note-box" style={{ marginTop: 0 }}>{l.req.notes}</div>
            </Panel>
          )}

          {/* Properties for this lead: shortlisted (attached) pinned on top, then
              system matches — one area, not two far-apart sections. */}
          <Panel>
            <SectionHead title="Properties for this lead"
              right={<button className="btn btn-ghost btn-sm" onClick={() => store.openModal({ kind: 'attachProp', leadId: l.id })}><Icon name="plus" size={14} />Attach</button>} />
            {propRows.length === 0 && <div className="u-muted" style={{ fontSize: 13 }}>No shortlisted or matching inventory yet. Attach one to get started.</div>}
            {propRows.map((row, i) => {
              const fb = (l.feedback || {})[row.p.id]
              const rejected = fb?.verdict === 'rejected'
              return (
              <div key={row.p.id} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 0', borderTop: i ? '1px solid var(--line-2)' : 'none', opacity: rejected ? 0.55 : 1 }}>
                <div style={{ width: 46, height: 46, borderRadius: 8, background: thumbTint(row.p.id), display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--faint)', flexShrink: 0 }}>
                  <Icon name="building" size={22} strokeWidth={1.4} />
                </div>
                <button onClick={() => go('properties', { propId: row.p.id, propOpen: true })}
                  style={{ flex: 1, minWidth: 0, textAlign: 'left', background: 'transparent', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>
                  <div style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
                    <span style={{ textDecoration: rejected ? 'line-through' : 'none' }}>{row.p.society}</span>
                    {fb?.verdict === 'liked' && <span className="fit ok" style={{ padding: '1px 7px' }}>👍 Liked</span>}
                    {rejected && <span className="fit no" style={{ padding: '1px 7px' }}>👎 {fb.reason}</span>}
                    {!fb && (row.shortlisted
                      ? <span className="fit ok" style={{ padding: '1px 7px' }}><Icon name="check" size={11} />Shortlisted</span>
                      : <span className="source">{row.fit}% match</span>)}
                  </div>
                  <div className="u-muted" style={{ fontSize: 12.5 }}>{row.p.type} · {row.p.locality} · {row.line}</div>
                </button>
                <button className="btn btn-ghost btn-sm" title="Log site-visit outcome" onClick={() => store.openModal({ kind: 'visitFeedback', leadId: l.id, propId: row.p.id })}><Icon name="check" size={14} />Visit</button>
                <Button variant="secondary" size="sm" onClick={() => store.openWhatsApp(row.p.id, l.id)}>Share</Button>
              </div>
            )})}
          </Panel>

          {/* timeline */}
          <Panel>
            <SectionHead title="Timeline" />
            <Timeline events={l.timeline} />
          </Panel>
        </DetailLayout>
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
