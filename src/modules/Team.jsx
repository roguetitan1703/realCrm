import { Avatar, Button } from '../components/primitives.jsx'
import Icon from '../components/Icon.jsx'

export default function Team({ store, topBar }) {
  const { state } = store
  const inactive = (id) => state.inactiveAgentIds.includes(id)

  return (
    <>
      {topBar({ title: 'Team', count: `${state.agents.length} agents` })}
      <div className="app-body" style={{ padding: '20px 22px 44px' }}>
        <div style={{ maxWidth: 900 }}>
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: 18 }}>
            <div className="u-muted" style={{ flex: 1, fontSize: 13.5 }}>Distribute leads fairly, or hand-pick. When an agent leaves, their pipeline moves in one action — no lost clients.</div>
            <Button variant="primary" icon="userPlus" onClick={() => store.openModal({ kind: 'addAgent' })}>Add agent</Button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            {state.agents.map(a => {
              const mine = state.leads.filter(l => l.agentId === a.id)
              const active = mine.filter(l => !l.stage.startsWith('Closed')).length
              const closed = mine.filter(l => l.stage === 'Closed Won').length
              const overdue = mine.filter(l => l.overdue).length
              const off = inactive(a.id)
              return (
                <div key={a.id} className="panel" style={{ opacity: off ? 0.6 : 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <Avatar agent={a} size="lg" />
                    <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontFamily: 'var(--disp)', fontWeight: 600, fontSize: 16 }}>{a.name}</div><div className="u-muted" style={{ fontSize: 12 }}>{a.role === 'admin' ? 'Owner / Admin' : (a.role || 'Senior Sales Advisor')} · Pune</div></div>
                    <span style={{ fontSize: 11, fontWeight: 600, borderRadius: 12, padding: '3px 10px', color: off ? '#8A5350' : 'var(--accent-ink)', background: off ? '#EFE3E2' : 'var(--accent-wash)' }}>{off ? 'Inactive' : 'Active'}</span>
                  </div>
                  <div style={{ display: 'flex', margin: '15px 0', border: '1px solid var(--line-2)', borderRadius: 9, overflow: 'hidden' }}>
                    {[['Active', active, 'var(--ink)'], ['Closed', closed, 'var(--accent)'], ['Overdue', overdue, overdue ? 'var(--alert)' : 'var(--ink)']].map(([l, v, c], i) => (
                      <div key={l} style={{ flex: 1, textAlign: 'center', padding: '9px 4px', borderLeft: i ? '1px solid var(--line-2)' : 'none' }}>
                        <div className="u-serif mono-num" style={{ fontWeight: 600, fontSize: 18, color: c }}>{v}</div>
                        <div className="u-muted" style={{ fontSize: 10.5 }}>{l}</div>
                      </div>
                    ))}
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <Button size="sm" style={{ flex: 1, justifyContent: 'center' }} onClick={() => store.openModal({ kind: 'reassign', fromId: a.id })}>Reassign leads</Button>
                    <Button size="sm" variant={off ? 'primary' : 'ghost'} onClick={() => store.toggleAgent(a.id)}>{off ? 'Activate' : 'Deactivate'}</Button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </>
  )
}
