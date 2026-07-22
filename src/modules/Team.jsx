import { Avatar, Button, Kpi, IconButton } from '../components/primitives.jsx'

const ROLE_LABEL = { admin: 'Owner / Admin', agent: 'Sales Advisor', manager: 'Sales Manager' }
const roleLabel = (r) => ROLE_LABEL[r] || (r ? r[0].toUpperCase() + r.slice(1) : 'Sales Advisor')

export default function Team({ store, go, topBar }) {
  const { state } = store
  const inactive = (id) => state.inactiveAgentIds.includes(id)
  const toLeads = (leadFilter) => go && go('leads', { leadFilter, leadOpen: false, leadId: undefined })

  // Per-agent workload + performance from live state.
  const roster = state.agents.map(a => {
    const mine = state.leads.filter(l => l.agentId === a.id)
    const open = mine.filter(l => !l.stage.startsWith('Closed')).length
    const won = mine.filter(l => l.stage === 'Closed Won').length
    const lost = mine.filter(l => l.stage === 'Closed Lost').length
    const overdue = mine.filter(l => l.overdue).length
    const settled = won + lost
    const winRate = settled ? Math.round((won / settled) * 100) : null
    return { a, open, won, overdue, winRate, off: inactive(a.id) }
  })

  const activeCount = roster.filter(r => !r.off).length
  const openLeads = state.leads.filter(l => !l.stage.startsWith('Closed'))
  const unassigned = openLeads.filter(l => !l.agentId).length
  const overdueTotal = state.leads.filter(l => l.overdue).length

  const evenShare = activeCount ? openLeads.length / activeCount : 0
  const maxLoad = Math.max(1, ...roster.map(r => r.open))

  // Rank: on-duty first, then most closed, then busiest — a real standings order.
  const ranked = roster.slice().sort((x, y) =>
    (x.off - y.off) || (y.won - x.won) || (y.open - x.open))
  const leaderId = ranked.find(r => !r.off && r.won > 0)?.a.id

  return (
    <>
      {topBar({ title: 'Team' })}
      <div className="app-body pagewrap">
        {/* Desk pulse — same KPI tiles as the dashboard, so it feels like one product */}
        <div className="desk-strip">
          <Kpi icon="people" label="On the desk" value={`${activeCount}/${state.agents.length}`} sub="agents on duty" />
          <Kpi icon="switch" label="Open across team" value={openLeads.length} sub="live leads in play" onClick={() => toLeads({})} />
          <Kpi icon="person" label="Unassigned" value={unassigned} sub="waiting to be picked up" alert={unassigned > 0} onClick={() => toLeads({ flag: ['unassigned'] })} />
          <Kpi icon="clock" label="Overdue" value={overdueTotal} sub="past the SLA window" alert={overdueTotal > 0} onClick={() => toLeads({ flag: ['overdue'] })} />
        </div>

        <div className="row-between row-gap-b">
          <div className="grow lead-copy">Your desk, ranked. See who's carrying the load and who's winning — move leads off an agent in one action, nothing gets lost.</div>
          <Button variant="primary" icon="userPlus" onClick={() => store.openModal({ kind: 'addAgent' })}>Add agent</Button>
        </div>

        <div className="board">
          {ranked.map(({ a, open, won, overdue, winRate, off }, i) => {
            const overloaded = !off && open > evenShare * 1.5 && open > 3
            const isLeader = a.id === leaderId
            const pct = Math.round((open / maxLoad) * 100)
            const rank = i + 1
            return (
              <div key={a.id} className={'bcard' + (off ? ' off' : '') + (isLeader ? ' lead' : '')}>
                <div className={'rank' + (off ? '' : rank <= 3 ? ' r' + rank : '')}>{off ? '–' : rank}</div>

                <div className="bwho">
                  <Avatar agent={a} size="lg" />
                  <div className="bid">
                    <div className="bname">
                      {a.name}
                      {off ? <span className="btag off">Off duty</span>
                        : overloaded ? <span className="btag over">Overloaded</span>
                        : isLeader ? <span className="btag top">Top closer</span> : null}
                    </div>
                    <div className="brole">{roleLabel(a.role)} · Pune</div>
                  </div>
                </div>

                <div className="bload">
                  <div className="bload-top">
                    <span className="bload-n"><b>{open}</b> open</span>
                    <span className={'bload-tag ' + (overdue ? 'warn' : 'ok')}>{overdue ? `${overdue} overdue` : 'On track'}</span>
                  </div>
                  <div className="bmeter"><i className={overloaded ? 'hot' : ''} style={{ width: pct + '%' }} /></div>
                </div>

                <div className="bstats">
                  <div className="bstat"><div className="bv accent">{won}</div><div className="bl">Won</div></div>
                  <div className="bstat"><div className="bv">{winRate === null ? '—' : <>{winRate}<span className="bu">%</span></>}</div><div className="bl">Win rate</div></div>
                </div>

                <div className="bactions">
                  <Button size="sm" onClick={() => store.openModal({ kind: 'reassign', fromId: a.id })}>Reassign</Button>
                  <IconButton icon={off ? 'refresh' : 'switch'} title={off ? 'Bring on duty' : 'Take off duty'} onClick={() => store.toggleAgent(a.id)} />
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </>
  )
}
