import { Kpi, Panel, SectionHead, Avatar, StageTag } from '../components/primitives.jsx'
import Icon from '../components/Icon.jsx'
import { api } from '../lib/api.js'
import { useServerData } from '../lib/useServerData.js'
import { WON_STATUS } from '../data/leadStatus.js'

// The first screen. It answers three questions in this order, and nothing else:
// what needs doing right now, how each of the two pipelines is moving, and who
// is doing the work. Everything on it is clickable and drills into the exact
// filtered list behind the number.
//
// It had grown by accretion — a KPI strip, then a leads block, then a calling
// block bolted under it, then a roster — eight panels down one column with no
// stated relationship between them. The structure below is the relationship:
// the desk has TWO pipelines, inbound and outbound, and they sit side by side
// at every level rather than stacked in the order they happened to be built.
export default function Dashboard({ store, go, topBar }) {
  const { state } = store
  // Every number on this screen is a count. Not one of them needs a lead row,
  // and this screen used to hold all of them in memory to produce a handful of
  // integers -- the clearest example in the app of downloading a book to read
  // its page count.
  const { data: desk } = useServerData(() => api.getDeskSummary(), [state.dataAsOf], null, '/workspace/desk-summary')
  const { data: overduePage } = useServerData(
    () => api.listLeads({ segment: 'overdue', limit: 8 }), [state.dataAsOf], { data: [] })
  const overdue = overduePage?.data || []
  const { data: ownerSummary } = useServerData(() => api.getOwnersSummary(), [state.dataAsOf], null, '/owners/summary')

  const totals = desk?.leads || { total: 0, open: 0, overdue: 0, won: 0, new_today: 0, unassigned: 0 }
  // Until the counts arrive we do not know them, and rendering 0 says something
  // false and alarming -- "you have no leads today" is a very different message
  // from "still loading". An em dash says the honest thing.
  const n = (v) => (desk ? v : '—')
  const byStage = desk?.byStage || {}
  const bySource = desk?.bySource || {}
  const perAgent = desk?.perAgent || {}
  const perAgentCalls = desk?.perAgentCalls || {}
  const oq = ownerSummary?.summary?.queue || null
  const oStage = ownerSummary?.summary?.byStage || {}
  const hasCalling = !!oq && oq.total > 0

  const toLeads = (leadFilter) => go('leads', { leadFilter, leadOpen: false, leadId: undefined })
  const toCalling = (ownerSeg, ownerStage) => go('calling', { ownerSeg, ownerStage, ownerOpen: false, ownerId: undefined })

  const { stages } = state.settings
  // Sources that have actually sent a lead, counted server-side. `bySource` is
  // the firm's real traffic, not settings.sources -- which a new Connections
  // integration never touches.
  const sources = Object.keys(bySource).sort((a, b) => bySource[b] - bySource[a])
  const stageCounts = stages.map(s => ({ name: s, n: byStage[s] || 0 }))
  const maxStage = Math.max(1, ...stageCounts.map(s => s.n))
  const srcMax = Math.max(1, ...sources.map(sn => bySource[sn]))

  // Outreach outcomes, sorted by size — the same shape as the source bars, so
  // "where they come from" and "where they end up" read as one pair.
  const outcomes = Object.entries(oStage).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1])
  const outMax = Math.max(1, ...outcomes.map(o => o[1]))

  // The roster. Lead columns come from the per-stage counts (which stages mean
  // "contacted" is the firm's own settings question, applied here rather than
  // hardcoded in SQL); the calling columns are counted in Postgres, not
  // inferred — "called" is a real last_call_at, not a stage guessed at.
  const lb = state.agents.map(a => {
    const row = perAgent[a.id] || { total: 0, won: 0, byStage: {} }
    const calls = perAgentCalls[a.id] || { owners: 0, called: 0, calledToday: 0, interested: 0 }
    const st = row.byStage || {}
    const countStages = (pred) => stages.filter(pred).reduce((sum, name) => sum + (st[name] || 0), 0)
    return {
      a, assigned: row.total,
      contacted: countStages((_, i) => i >= 1),
      closed: row.won,
      owners: calls.owners, called: calls.called, calledToday: calls.calledToday,
    }
  }).sort((x, y) => (y.closed - x.closed) || (y.calledToday - x.calledToday))
  const rosterHasCalling = hasCalling && lb.some(r => r.owners > 0)

  // A stage/outcome bar row. One component for both columns, because they are
  // the same control asking the same thing of two different pipelines.
  const BarRow = ({ label, count, max, onClick }) => (
    <button className="drow drow-col" onClick={onClick}>
      <div className="drow-line">
        <span className="drow-k">{label}</span><span className="drow-n">{count}</span>
      </div>
      <div className="bar"><i style={{ width: Math.round(count / max * 100) + '%' }} /></div>
    </button>
  )

  return (
    <>
      {topBar({ title: 'Dashboard' })}
      <div className="app-body dash">
        {/* What needs doing right now — across BOTH pipelines, not just leads.
            Late callbacks belong beside overdue follow-ups: they are the same
            fact about the same day, and separating them by three panels meant
            the calling half of the desk was never the first thing anyone saw.
            The strip drops to four tiles on a desk that does no cold-calling. */}
        <div className={'dash-kpis' + (hasCalling ? ' has-calling' : '')}>
          <Kpi icon="clock" label="Overdue follow-ups" value={n(totals.overdue)} sub="action required" alert onClick={() => toLeads({ flag: ['overdue'] })} />
          {hasCalling && (
            <Kpi icon="phone" label="Late callbacks" value={oq.callbacksOverdue} sub="owners waiting on a call"
              alert={oq.callbacksOverdue > 0} onClick={() => toCalling('callbacks_overdue')} />
          )}
          <Kpi icon="person" label="Unassigned" value={n(totals.unassigned)} sub="need routing" onClick={() => toLeads({ flag: ['unassigned'] })} />
          <Kpi icon="plus" label="Arrived today" value={n(totals.new_today)} sub="fresh enquiries" onClick={() => toLeads({ flag: ['new'] })} />
          {hasCalling && (
            <Kpi icon="check" label="Calls logged today" value={oq.calledToday} sub="outbound, today" onClick={() => toCalling('never_called')} />
          )}
        </div>

        {/* The two pipelines, side by side. Inbound on the left because it is
            the one every firm runs; outbound appears only when there is one. */}
        <div className={'dash-cols' + (hasCalling ? '' : ' one')}>
          <Panel>
            <SectionHead title="Leads by stage" right={desk ? `${totals.open} active` : ''} />
            {stageCounts.map(s => (
              <BarRow key={s.name} label={s.name} count={s.n} max={maxStage} onClick={() => toLeads({ stage: [s.name] })} />
            ))}
          </Panel>

          {hasCalling && (
            <Panel>
              <SectionHead title="Calling queue" right={`${oq.open} open`} />
              {/* Not stage bars: a calling queue is not a funnel, it is a
                  worklist, and what matters is how much of it is waiting. */}
              <div className="dash-tiles">
                <button className={'dash-tile' + (oq.callbacksOverdue ? ' alert' : '')} onClick={() => toCalling('callbacks_overdue')}>
                  <span className="dt-v">{oq.callbacksOverdue}</span><span className="dt-l">Late callbacks</span>
                </button>
                <button className="dash-tile" onClick={() => toCalling('callbacks_today')}>
                  <span className="dt-v">{oq.callbacksToday}</span><span className="dt-l">Due today</span>
                </button>
                <button className="dash-tile" onClick={() => toCalling('to_call')}>
                  <span className="dt-v">{oq.toCall}</span><span className="dt-l">Never called</span>
                </button>
                <button className="dash-tile" onClick={() => toCalling('unassigned')}>
                  <span className="dt-v">{oq.unassigned}</span><span className="dt-l">Unassigned</span>
                </button>
              </div>
              <div className="dash-sub">Outcomes</div>
              {outcomes.length === 0
                ? <div className="detail-empty">Nothing called yet.</div>
                : outcomes.map(([name, count]) => (
                    <BarRow key={name} label={name} count={count} max={outMax} onClick={() => toCalling('open', name)} />
                  ))}
            </Panel>
          )}
        </div>

        {/* Where the work comes from, and what is late. Both are lists you scan
            rather than numbers you act on, so they sit below the two pipelines. */}
        <div className="dash-cols">
          <Panel>
            <SectionHead title="Leads by source" right={desk ? `${sources.length} live` : ''} />
            {sources.length === 0 && <div className="detail-empty">No leads yet.</div>}
            {sources.map(sn => (
              <BarRow key={sn} label={sn} count={bySource[sn]} max={srcMax} onClick={() => toLeads({ source: [sn] })} />
            ))}
          </Panel>
          <Panel>
            <SectionHead title="Overdue follow-ups" right={totals.overdue ? String(totals.overdue) : undefined} />
            {overdue.length === 0 && <div className="detail-empty">All caught up.</div>}
            {overdue.map(l => {
              const a = store.agentById(l.agentId)
              return (
                <button key={l.id} className="od-row" onClick={() => go('leads', { leadId: l.id, leadOpen: true })}>
                  <div className="od-main">
                    <div className="od-name">{l.name}</div>
                    <div className="od-sub">{l.followUp?.action}</div>
                  </div>
                  <div className="od-right">
                    <div className="od-when">{l.followUp?.date}</div>
                    {a && <Avatar agent={a} size="sm" />}
                  </div>
                </button>
              )
            })}
          </Panel>
        </div>

        {/* Who is doing the work — one roster covering both pipelines, because
            it is one person doing both. The calling columns appear only when
            there is a calling queue to report on. */}
        <Panel>
          <SectionHead title={state.role === 'agent' ? 'My performance' : 'Team performance'} />
          <div className={'lb' + (rosterHasCalling ? ' lb-calling' : '')}>
            <div className="lb-h">
              <div>Agent</div>
              <div>Leads</div><div>Contacted</div><div>Closed</div>
              {rosterHasCalling && <><div>Owners</div><div>Called</div><div>Today</div></>}
            </div>
            {(state.role === 'agent' ? lb.filter(r => r.a.id === state.activeAgentId) : lb).map(r => (
              <button key={r.a.id} className="lb-row" onClick={() => go('leads', { agentFilter: r.a.id })}>
                <div className="lb-who"><Avatar agent={r.a} size="sm" /><span>{r.a.first}</span></div>
                <div className="mono-num">{r.assigned}</div>
                <div className="mono-num">{r.contacted}</div>
                <div className="mono-num lb-win">{r.closed}</div>
                {rosterHasCalling && <>
                  <div className="mono-num">{r.owners}</div>
                  <div className="mono-num">{r.called}</div>
                  <div className="mono-num lb-win">{r.calledToday}</div>
                </>}
              </button>
            ))}
          </div>
        </Panel>
      </div>
    </>
  )
}
