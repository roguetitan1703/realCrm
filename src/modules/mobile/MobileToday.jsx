import { initials, reqShort } from '../../lib/format.js'
import { Overdue, StageTag } from '../../components/primitives.jsx'
import Icon from '../../components/Icon.jsx'

export default function MobileToday({ store, me, open, setTab }) {
  const mine = store.state.leads.filter(l => l.agentId === me.id)
  const overdue = mine.filter(l => l.overdue)
  const todayFu = mine.filter(l => l.followUp && !l.overdue && l.followUp.date === 'Today')
  const newAssigned = mine.filter(l => l.stage === 'New')
  const upcoming = mine.filter(l => l.followUp && !l.overdue && l.followUp.date !== 'Today')

  const Row = ({ l, tone }) => (
    <div className="m-card" style={{ marginBottom: 8, cursor: 'pointer' }} onClick={() => open('lead', l.id)}>
      <span className={'av av-md ' + me.avatar}>{initials(l.name)}</span>
      <div className="m-c-main">
        <div className="m-c-name" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {l.name}
          {tone === 'overdue' && <span className="fit" style={{ background: 'var(--alert-wash)', color: 'var(--alert)', padding: '1px 6px', fontSize: 10, borderRadius: 4 }}>Action Due</span>}
        </div>
        <div className="m-c-sub">{l.followUp ? l.followUp.action : reqShort(l.req)}</div>
      </div>
      <div className="m-c-right">
        {tone === 'overdue' ? <Overdue>{l.followUp?.time || 'Overdue'}</Overdue>
          : l.followUp ? <span className="source" style={{ fontWeight: 600 }}>{l.followUp.time}</span> : <StageTag stage={l.stage} />}
        <button
          className="btn btn-secondary btn-sm"
          style={{ padding: '3px 8px', fontSize: 11 }}
          onClick={(e) => {
            e.stopPropagation()
            store.openModal({ kind: 'outreach', leadId: l.id, channel: 'call' })
          }}
        >
          <Icon name="phone" size={12} />
        </button>
      </div>
    </div>
  )

  return (
    <>
      <div className="m-kpi-row">
        <button className="m-kpi alert" onClick={() => setTab('leads')}>
          <div className="v">{overdue.length}</div>
          <div className="l">Overdue</div>
        </button>
        <button className="m-kpi" onClick={() => setTab('leads')}>
          <div className="v">{todayFu.length}</div>
          <div className="l">Today</div>
        </button>
        <button className="m-kpi" onClick={() => setTab('leads')}>
          <div className="v">{newAssigned.length}</div>
          <div className="l">New</div>
        </button>
      </div>

      {overdue.length > 0 && (
        <>
          <div className="m-sec-h" style={{ color: 'var(--alert)' }}>Overdue follow-ups</div>
          {overdue.map(l => <Row key={l.id} l={l} tone="overdue" />)}
        </>
      )}

      {todayFu.length > 0 && (
        <>
          <div className="m-sec-h">Today's follow-ups</div>
          {todayFu.map(l => <Row key={l.id} l={l} />)}
        </>
      )}

      {newAssigned.length > 0 && (
        <>
          <div className="m-sec-h">New — not yet contacted</div>
          {newAssigned.map(l => <Row key={l.id} l={l} />)}
        </>
      )}

      {upcoming.length > 0 && (
        <>
          <div className="m-sec-h">Upcoming</div>
          {upcoming.map(l => <Row key={l.id} l={l} />)}
        </>
      )}

      {mine.length === 0 && (
        <div className="empty" style={{ marginTop: 20 }}>
          <div className="e-t">Nothing assigned yet</div>
          <div className="e-s">New leads routed to you show up here.</div>
        </div>
      )}
    </>
  )
}
