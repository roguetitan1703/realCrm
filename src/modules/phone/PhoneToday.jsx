// The agent's work queue. Not a dashboard: no counters, no greeting, no chart.
// Every row here is a thing that has to be done today, and tapping it opens the
// lead. The actions that create work live in the action button, not on a strip
// of their own.
//
// It used to be four groups keyed almost entirely off `followUp`, which on a
// real desk meant one of them ("Not yet contacted") held every new lead in the
// firm and the other three were empty — so the whole screen read as one endless
// list. The groups below are ordered by how much the day depends on them, and
// the two new ones (No next step, Unassigned) are the gaps that quietly lose
// deals: a lead being worked with nothing scheduled after it, and a lead nobody
// owns. Both are always answerable from data we actually hold, rather than
// needing a timestamp the follow-up model does not carry.
import { Overdue, StageTag, MoreRows, useCap } from '../../components/primitives.jsx'
import { initials, reqShort, renewalSignal, unitLabel } from '../../lib/format.js'
import InstallPrompt from '../../components/InstallPrompt.jsx'
import Icon from '../../components/Icon.jsx'

const CLOSED = (l) => String(l.stage || '').startsWith('Closed')

// "4:30 pm" → minutes, so the day reads in the order it happens rather than in
// whatever order the leads were created.
function timeRank(t) {
  const m = String(t || '').match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i)
  if (!m) return 24 * 60
  let h = Number(m[1]) % 12
  if (/pm/i.test(m[3] || '')) h += 12
  return h * 60 + Number(m[2] || 0)
}

function Row({ l, onOpen, store, tone }) {
  return (
    <div className="q-row" onClick={() => onOpen(l)}>
      <span className="av av-md">{initials(l.name)}</span>
      <div className="q-main">
        <div className="q-name">{l.name}</div>
        <div className="q-sub">{l.followUp ? l.followUp.action : reqShort(l.req)}</div>
      </div>
      <div className="q-right">
        {tone === 'overdue'
          ? <Overdue>{l.followUp?.time || 'Overdue'}</Overdue>
          : l.followUp ? <span className="source">{l.followUp.time}</span> : <StageTag stage={l.stage} />}
        <button
          className="btn btn-secondary btn-sm q-call"
          aria-label={`Call ${l.name}`}
          onClick={(e) => {
            e.stopPropagation()
            store.openModal({ kind: 'contact', channel: 'call', name: l.name, phone: l.phone, recordType: 'lead', recordId: l.id })
          }}
        ><Icon name="phone" size={13} /></button>
      </div>
    </div>
  )
}

// One queue group. Its own component so each keeps its own reveal state — a
// busy desk's "Not yet contacted" is every new lead in the firm, and dumping
// all of them under a heading turned Today into a scroll with no bottom.
// Inventory has its own clock, and it is the half of the day a lead list can
// never show: a tenancy runs out whether or not anyone opened the record. These
// are the only property rows on Today, and they only appear when one is
// actually expiring.
function RenewalRow({ p, onOpen, signal }) {
  return (
    <div className="q-row" onClick={() => onOpen(p)}>
      <span className="q-ic"><Icon name="building" size={17} /></span>
      <div className="q-main">
        <div className="q-name">{p.society || p.title}{unitLabel(p) && <span className="unit-tag">{unitLabel(p)}</span>}</div>
        <div className="q-sub">{p.tenancy?.tenant ? `${p.tenancy.tenant} · ${p.locality}` : p.locality}</div>
      </div>
      <div className="q-right">
        {signal.tone === 'overdue' ? <Overdue>{signal.label}</Overdue> : <span className="source">{signal.label}</span>}
      </div>
    </div>
  )
}

function Group({ g, onOpen, store, onSeeAll }) {
  const { cap, more, showMore } = useCap(g.rows.length, 6)
  return (
    <section className="q-group">
      <div className={'q-head' + (g.tone === 'overdue' ? ' q-head-alert' : '')}>
        {g.label}<span className="q-count">{g.rows.length}</span>
        {g.filter && g.rows.length > 6 && (
          <button className="q-seeall" onClick={() => onSeeAll(g.filter)}>See all</button>
        )}
      </div>
      {g.hint && <div className="q-hint">{g.hint}</div>}
      {g.rows.slice(0, cap).map(r => (g.kind === 'renewal'
        ? <RenewalRow key={r.p.id} p={r.p} signal={r.signal} onOpen={onOpen} />
        : <Row key={r.id} l={r} onOpen={onOpen} store={store} tone={g.tone} />))}
      <MoreRows more={more} step={6} onMore={showMore} />
    </section>
  )
}

export default function PhoneToday({ store, me, go, topBar }) {
  const { state } = store
  // An agent's queue is their own leads. A manager or owner on a phone is
  // looking at the same queue for the whole desk — the scope changes, the
  // screen does not.
  const scoped = state.role === 'agent' && me
    ? state.leads.filter(l => l.agentId === me.id)
    : state.leads

  const onOpen = (l) => go('leads', { leadId: l.id, leadOpen: true })
  const openProp = (p) => go('properties', { propId: p.id, propOpen: true })
  const seeAll = (flt) => go('leads', { leadFilter: flt })

  // Expiring tenancies, soonest first. Scoped to the whole desk: a renewal
  // belongs to the listing, not to whoever last touched the lead.
  const renewals = state.properties
    .map(p => ({ p, signal: renewalSignal(p.tenancy) }))
    .filter(r => r.signal && r.signal.tone !== 'ok')
    .sort((a, b) => a.signal.days - b.signal.days)

  const open = scoped.filter(l => !CLOSED(l))
  const overdue = open.filter(l => l.overdue)
  const todayFu = open
    .filter(l => l.followUp && !l.overdue && l.followUp.date === 'Today')
    .sort((a, b) => timeRank(a.followUp.time) - timeRank(b.followUp.time))
  const fresh = open.filter(l => l.stage === 'New')
  // Being worked, but with nothing scheduled after it — the state a lead is in
  // right before everyone forgets about it.
  const noNext = open.filter(l => l.stage !== 'New' && !l.followUp && !l.overdue)
  const unassigned = open.filter(l => !l.agentId)
  const upcoming = open.filter(l => l.followUp && !l.overdue && l.followUp.date !== 'Today')

  const isDesk = state.role !== 'agent'
  const groups = [
    { key: 'overdue', label: 'Overdue', rows: overdue, tone: 'overdue', filter: { flag: ['overdue'] } },
    { key: 'today', label: 'Due today', rows: todayFu },
    { key: 'fresh', label: 'Not yet contacted', rows: fresh, filter: { stage: ['New'] } },
    // Only the desk can hand a lead to someone, so only the desk is shown the
    // ones nobody owns.
    ...(isDesk ? [{ key: 'unassigned', label: 'Nobody assigned', rows: unassigned, filter: { flag: ['unassigned'] } }] : []),
    { key: 'renewals', label: 'Tenancies expiring', rows: renewals, kind: 'renewal' },
    { key: 'nonext', label: 'No next step', rows: noNext, hint: 'Being worked, with nothing scheduled after it.' },
    { key: 'upcoming', label: 'Upcoming', rows: upcoming },
  ].filter(g => g.rows.length)

  return (
    <>
      {topBar({ title: 'Today' })}
      <div className="q-wrap">
        <InstallPrompt />
        {groups.map(g => (
          <Group key={g.key} g={g} store={store} onSeeAll={seeAll}
            onOpen={g.kind === 'renewal' ? openProp : onOpen} />
        ))}
        {!groups.length && (
          <div className="empty">
            <div className="e-t">Nothing due</div>
            <div className="e-s">Leads with a follow-up or an overdue action show up here.</div>
          </div>
        )}
      </div>
    </>
  )
}
