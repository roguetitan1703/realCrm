import { Kpi, Panel, SectionHead, Avatar, StageTag } from '../components/primitives.jsx'
import Icon from '../components/Icon.jsx'
import { api } from '../lib/api.js'
import { useServerData } from '../lib/useServerData.js'
import { WON_STATUS } from '../data/leadStatus.js'

// The hero first screen. Every tile, bar and row is clickable — it drills into
// the underlying filtered list or record. KPIs reflect the real job (oversight/
// throughput), not vanity money.
export default function Dashboard({ store, go, topBar }) {
  const { state } = store
  // Every number on this screen is a count. Not one of them needs a lead row,
  // and this screen used to hold all of them in memory to produce a handful of
  // integers -- the clearest example in the app of downloading a book to read
  // its page count.
  const { data: desk } = useServerData(() => api.getDeskSummary(), [state.dataAsOf], null, '/workspace/desk-summary')
  const { data: overduePage } = useServerData(
    () => api.listLeads({ segment: 'overdue', limit: 12 }), [state.dataAsOf], { data: [] })
  const overdue = overduePage?.data || []

  const totals = desk?.leads || { total: 0, open: 0, overdue: 0, won: 0, new_today: 0, unassigned: 0 }
  // Until the counts arrive we do not know them, and rendering 0 says something
  // false and alarming -- "you have no leads today" is a very different message
  // from "still loading". An em dash says the honest thing.
  const n = (v) => (desk ? v : '—')
  const byStage = desk?.byStage || {}
  const bySource = desk?.bySource || {}
  const perAgent = desk?.perAgent || {}

  const toLeads = (leadFilter) => go('leads', { leadFilter, leadOpen: false, leadId: undefined })

  const { stages } = state.settings
  // Sources that have actually sent a lead, counted server-side. `bySource` is
  // the firm's real traffic, not settings.sources -- which a new Connections
  // integration never touches.
  const sources = Object.keys(bySource).sort((a, b) => bySource[b] - bySource[a])
  const stageCounts = stages.map(s => ({ name: s, n: byStage[s] || 0 }))
  const maxStage = Math.max(1, ...stageCounts.map(s => s.n))
  const srcMax = Math.max(1, ...sources.map(sn => bySource[sn]))
  const visitCount = byStage['Site Visit'] || 0

  // "Contacted" and "Visits" mean whatever this firm's stage order says they
  // mean, so the meaning is applied here where the settings live; the server
  // just returns the per-stage counts.
  const lb = state.agents.map(a => {
    const row = perAgent[a.id] || { total: 0, won: 0, byStage: {} }
    const st = row.byStage || {}
    const countStages = (pred) => stages.filter(pred).reduce((sum, name) => sum + (st[name] || 0), 0)
    return {
      a, assigned: row.total,
      contacted: countStages((_, i) => i >= 1),
      visits: countStages(name => name === 'Site Visit' || name === WON_STATUS),
      closed: row.won,
    }
  }).sort((x, y) => y.closed - x.closed)

  return (
    <>
      {topBar({ title: 'Dashboard' })}
      <div className="app-body" style={{ padding: '20px 22px 44px', display: 'flex', flexDirection: 'column', gap: 18 }}>
        {/* KPIs — the day's job, each drills into the exact list */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14 }}>
          <Kpi icon="clock" label="Overdue follow-ups" value={n(totals.overdue)} sub="action required" alert onClick={() => toLeads({ flag: ['overdue'] })} />
          <Kpi icon="person" label="Unassigned" value={n(totals.unassigned)} sub="need routing" onClick={() => toLeads({ flag: ['unassigned'] })} />
          <Kpi icon="plus" label="New today" value={n(totals.new_today)} sub="fresh enquiries" onClick={() => toLeads({ flag: ['new'] })} />
          <Kpi icon="calendar" label="Site visits" value={n(visitCount)} sub="booked & upcoming" onClick={() => toLeads({ stage: ['Site Visit'] })} />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1.75fr 1fr', gap: 16, alignItems: 'start' }}>
          {/* pipeline — click a stage to open it */}
          <Panel>
            <SectionHead title="Pipeline by stage" right={desk ? `${totals.open} active` : ''} />
            {stageCounts.map(s => (
              <button key={s.name} className="drow" onClick={() => toLeads({ stage: [s.name] })}>
                <span style={{ width: 96, fontSize: 12.5, fontWeight: 600, flexShrink: 0, textAlign: 'left' }}>{s.name}</span>
                <div className="bar" style={{ flex: 1, height: 18 }}><i style={{ width: Math.round(s.n / maxStage * 100) + '%' }} /></div>
                <span className="u-serif mono-num" style={{ width: 26, textAlign: 'right', fontWeight: 600 }}>{s.n}</span>
                <Icon name="chevRight" size={15} className="ic drow-go" />
              </button>
            ))}
          </Panel>
          {/* sources — click to filter */}
          <Panel>
            <SectionHead title="Leads by source" />
            {sources.length === 0 && <div className="detail-empty">No leads yet.</div>}
            {sources.map(sn => {
              const c = bySource[sn]
              return (
                <button key={sn} className="drow drow-col" onClick={() => toLeads({ source: [sn] })}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', marginBottom: 4, fontSize: 12.5 }}>
                    <span style={{ fontWeight: 600 }}>{sn}</span><span className="u-muted">{c}</span>
                  </div>
                  <div className="bar" style={{ width: '100%' }}><i style={{ width: Math.round(c / srcMax * 100) + '%' }} /></div>
                </button>
              )
            })}
          </Panel>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1.75fr 1fr', gap: 16, alignItems: 'start' }}>
          {/* agent leaderboard */}
          <Panel>
            <SectionHead title={state.role === 'agent' ? 'My Performance' : 'Agent performance'} />
            <div className="lb-h">
              <div>Agent</div><div style={{ textAlign: 'center' }}>Assigned</div><div style={{ textAlign: 'center' }}>Contacted</div><div style={{ textAlign: 'center' }}>Visits</div><div style={{ textAlign: 'center' }}>Closed</div>
            </div>
            {(state.role === 'agent' ? lb.filter(r => r.a.id === state.activeAgentId) : lb).map(r => (
              <button key={r.a.id} className="lb-row" onClick={() => go('leads', { agentFilter: r.a.id })}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}><Avatar agent={r.a} size="sm" /><span style={{ fontWeight: 600 }}>{r.a.first}</span></div>
                <div style={{ textAlign: 'center', fontWeight: 600 }} className="mono-num">{r.assigned}</div>
                <div style={{ textAlign: 'center', fontWeight: 600 }} className="mono-num">{r.contacted}</div>
                <div style={{ textAlign: 'center', fontWeight: 600 }} className="mono-num">{r.visits}</div>
                <div style={{ textAlign: 'center', fontWeight: 700, color: 'var(--accent)' }} className="mono-num">{r.closed}</div>
              </button>
            ))}
          </Panel>
          {/* overdue — click a row to open the lead */}
          <Panel>
            <SectionHead title="Overdue follow-ups" right={totals.overdue ? `${totals.overdue}` : undefined} />
            {overdue.length === 0 && <div className="u-muted" style={{ fontSize: 13, textAlign: 'center', padding: '14px 0' }}>All caught up.</div>}
            {overdue.map(l => {
              const a = store.agentById(l.agentId)
              return (
                <button key={l.id} onClick={() => go('leads', { leadId: l.id, leadOpen: true })}
                  style={{ textAlign: 'left', width: '100%', display: 'flex', alignItems: 'center', gap: 11, background: '#FCF6F5', border: '1px solid #EDD9D6', borderRadius: 9, padding: '11px 12px', cursor: 'pointer', marginBottom: 8, fontFamily: 'inherit' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 13.5 }}>{l.name}</div>
                    <div className="u-muted" style={{ fontSize: 12, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{l.followUp?.action}</div>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--alert)' }}>{l.followUp?.date}</div>
                    {a && <span style={{ display: 'inline-flex', marginTop: 4 }}><Avatar agent={a} size="sm" /></span>}
                  </div>
                </button>
              )
            })}
          </Panel>
        </div>
      </div>
    </>
  )
}
