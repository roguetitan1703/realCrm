import { Kpi, Panel, SectionHead, Avatar, StageTag } from '../components/primitives.jsx'
import { theme } from '../data/theme.js'
import Icon from '../components/Icon.jsx'

// The hero first screen. Every tile, bar and row is clickable — it drills into
// the underlying filtered list or record. KPIs reflect the real job (oversight/
// throughput), not vanity money.
export default function Dashboard({ store, go, topBar }) {
  const { state } = store
  const leads = state.leads
  const active = leads.filter(l => !l.stage.startsWith('Closed'))
  const overdue = leads.filter(l => l.overdue)
  const unassigned = leads.filter(l => !l.agentId)
  const newToday = leads.filter(l => l.minsAgo < 1440)
  const visits = leads.filter(l => l.stage === 'Site Visit')

  const toLeads = (leadFilter) => go('leads', { leadFilter, leadOpen: false, leadId: undefined })

  const stageCounts = theme.stages.map(s => ({ name: s, list: leads.filter(l => l.stage === s) }))
  const maxStage = Math.max(1, ...stageCounts.map(s => s.list.length))
  const srcMax = Math.max(1, ...theme.sources.map(sn => leads.filter(l => l.source === sn).length))

  const lb = state.agents.map(a => {
    const mine = leads.filter(l => l.agentId === a.id)
    return {
      a, assigned: mine.length,
      contacted: mine.filter(l => theme.stages.indexOf(l.stage) >= 1).length,
      visits: mine.filter(l => l.stage === 'Site Visit' || l.stage === 'Closed Won').length,
      closed: mine.filter(l => l.stage === 'Closed Won').length,
    }
  }).sort((x, y) => y.closed - x.closed)

  return (
    <>
      {topBar({ title: 'Dashboard', count: `${active.length} active · ${overdue.length} overdue` })}
      <div className="app-body" style={{ padding: '20px 22px 44px', display: 'flex', flexDirection: 'column', gap: 18 }}>
        {/* KPIs — the day's job, each drills into the exact list */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14 }}>
          <Kpi icon="clock" label="Overdue follow-ups" value={overdue.length} sub="action required" alert onClick={() => toLeads({ flag: ['overdue'] })} />
          <Kpi icon="person" label="Unassigned" value={unassigned.length} sub="need routing" onClick={() => toLeads({ flag: ['unassigned'] })} />
          <Kpi icon="plus" label="New today" value={newToday.length} sub="fresh enquiries" onClick={() => toLeads({ flag: ['new'] })} />
          <Kpi icon="calendar" label="Site visits" value={visits.length} sub="booked & upcoming" onClick={() => toLeads({ stage: ['Site Visit'] })} />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1.75fr 1fr', gap: 16, alignItems: 'start' }}>
          {/* pipeline — click a stage to open it */}
          <Panel>
            <SectionHead title="Pipeline by stage" right={`${active.length} active`} />
            {stageCounts.map(s => (
              <button key={s.name} className="drow" onClick={() => toLeads({ stage: [s.name] })}>
                <span style={{ width: 96, fontSize: 12.5, fontWeight: 600, flexShrink: 0, textAlign: 'left' }}>{s.name}</span>
                <div className="bar" style={{ flex: 1, height: 18 }}><i style={{ width: Math.round(s.list.length / maxStage * 100) + '%' }} /></div>
                <span className="u-serif mono-num" style={{ width: 26, textAlign: 'right', fontWeight: 600 }}>{s.list.length}</span>
                <Icon name="chevRight" size={15} className="ic drow-go" />
              </button>
            ))}
          </Panel>
          {/* sources — click to filter */}
          <Panel>
            <SectionHead title="Leads by source" />
            {theme.sources.map(sn => {
              const c = leads.filter(l => l.source === sn).length
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
          {/* leaderboard — click an agent to open their book (Team) */}
          <Panel>
            <SectionHead title="Agent leaderboard" right="click to view book" />
            <div style={{ display: 'grid', gridTemplateColumns: '1.7fr repeat(4,1fr)', fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.05em', paddingBottom: 9, borderBottom: '1px solid var(--line)' }}>
              <div>Agent</div><div style={{ textAlign: 'center' }}>Assigned</div><div style={{ textAlign: 'center' }}>Contacted</div><div style={{ textAlign: 'center' }}>Visits</div><div style={{ textAlign: 'center' }}>Closed</div>
            </div>
            {lb.map(r => (
              <button key={r.a.id} className="lb-row" onClick={() => go('team')}>
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
            <SectionHead title="Overdue follow-ups" right={overdue.length ? `${overdue.length}` : undefined} />
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
