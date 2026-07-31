// The agent's work queue. Not a dashboard: no counters, no greeting, no chart.
// Every row here is a thing that has to be done today, and tapping it opens the
// lead. The actions that create work live in the action button, not on a strip
// of their own.
import { Overdue, StageTag } from '../../components/primitives.jsx'
import { initials, reqShort } from '../../lib/format.js'
import InstallPrompt from '../../components/InstallPrompt.jsx'
import Icon from '../../components/Icon.jsx'

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

export default function PhoneToday({ store, me, go, topBar }) {
  const { state } = store
  // An agent's queue is their own leads. A manager or owner on a phone is
  // looking at the same queue for the whole desk — the scope changes, the
  // screen does not.
  const scoped = state.role === 'agent' && me
    ? state.leads.filter(l => l.agentId === me.id)
    : state.leads

  const onOpen = (l) => go('leads', { leadId: l.id, leadOpen: true })

  const overdue = scoped.filter(l => l.overdue)
  const todayFu = scoped.filter(l => l.followUp && !l.overdue && l.followUp.date === 'Today')
  const fresh = scoped.filter(l => l.stage === 'New')
  const upcoming = scoped.filter(l => l.followUp && !l.overdue && l.followUp.date !== 'Today')

  const groups = [
    { key: 'overdue', label: 'Overdue', rows: overdue, tone: 'overdue' },
    { key: 'today', label: 'Due today', rows: todayFu },
    { key: 'fresh', label: 'Not yet contacted', rows: fresh },
    { key: 'upcoming', label: 'Upcoming', rows: upcoming },
  ].filter(g => g.rows.length)

  return (
    <>
      {topBar({ title: 'Today' })}
      <div className="q-wrap">
        <InstallPrompt />
        {groups.map(g => (
          <section key={g.key} className="q-group">
            <div className={'q-head' + (g.tone === 'overdue' ? ' q-head-alert' : '')}>
              {g.label}<span className="q-count">{g.rows.length}</span>
            </div>
            {g.rows.map(l => <Row key={l.id} l={l} onOpen={onOpen} store={store} tone={g.tone} />)}
          </section>
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
