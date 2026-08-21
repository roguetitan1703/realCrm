import { useState } from 'react'
import { Kpi, Panel, SectionHead, Avatar, Segmented } from '../components/primitives.jsx'
import { buildRoster, RosterRow } from '../components/roster.jsx'
import { api } from '../lib/api.js'
import { useServerData } from '../lib/useServerData.js'
import { whenLabel } from '../lib/format.js'

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
  // The at-risk list, sorted oldest-activity-first so the top of it is the lead
  // that has been waiting longest. Same two flags the tiles above count, asked
  // of the same endpoint, so the panel and the tiles cannot disagree.
  // NEVER CALLED is its own question, so it is its own request.
  //
  // A lead nobody has dialled and a lead dialled once and dropped need different
  // work from different people, and the first pile is the one a desk can clear
  // in an afternoon. It cannot be filtered out of the rows in the browser: the
  // panel holds six of fifty-one, so a client-side filter would hide five of six
  // rows and still print 51 in the header.
  // TWO PILES, NOT A PILE AND A SUBSET OF ITSELF.
  //
  // The toggle was All / Never called, where All meant `untouched_sla` PLUS
  // `noanswer_stale` and Never called meant the first of them. So switching
  // narrowed a list that was already sorted longest-waiting-first, and the six
  // rows on screen were usually the same six either way — the control looked
  // broken because nothing moved.
  //
  // And `untouched_sla` is not a filter the Leads screen offers, so "See all"
  // handed it a flag with no option behind it and the list opened with no
  // filter applied at all. These two ARE its options, by the names it uses —
  // one vocabulary, and the panel can hand the list something it understands.
  const [coldMode, setColdMode] = useState('never')
  const coldSeg = coldMode === 'never' ? 'never_contacted' : 'noanswer_stale'
  const coldFlags = [coldSeg]
  const { data: atRiskPage } = useServerData(
    // Six, not eight. The panel sits beside the calling queue and grew taller
    // than it; the header count carries the total and "See all" carries the rest.
    () => api.listLeads({ flag: coldFlags, sortKey: 'activity', sortDir: 'asc', limit: 6 }),
    [state.dataAsOf, coldMode], { data: [] })
  const atRisk = atRiskPage?.data || []
  // The server's count for the same query, NOT atRisk.length — the list is
  // capped at 8, and reporting the rows you rendered as the total is how a
  // header once claimed 200 of 1,000.
  const atRiskTotal = atRiskPage?.total ?? 0
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

  // THE KEYS THE LIST ACTUALLY READS. This used to hand over `{ stage: [...] }`
  // and `{ flag: [...] }` in a bag called `leadFilter` that the Leads screen
  // seeded into a private useState and then forwarded to the API for exactly
  // three of its keys — source, locality and agent. So a source tile worked, an
  // agent tile did nothing, and clicking a STAGE on the distribution did
  // nothing at all: no request changed, no chip appeared, the book just sat
  // there. One shape now, and it is the URL's.
  const toLeads = (leadFilters) => go('leads', { leadFilters, leadOpen: false, leadId: undefined })
  const toCalling = (ownerSeg, ownerStage) => go('calling', { ownerSeg, ownerStage, ownerOpen: false, ownerId: undefined })

  const { stages } = state.settings
  // Sources that have actually sent a lead, counted server-side. `bySource` is
  // the firm's real traffic, not settings.sources -- which a new Connections
  // integration never touches.
  const sources = Object.keys(bySource).sort((a, b) => bySource[b] - bySource[a])
  const stageCounts = stages.map(s => ({ name: s, n: byStage[s] || 0 }))

  // Outreach outcomes, sorted by size — the same shape as the source list, so
  // "where they come from" and "where they end up" read as one pair.
  const outcomes = Object.entries(oStage).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1])

  // The roster, built by the SAME function the Team page uses — this screen used
  // to derive its own "contacted" by counting every stage past index 0, which is
  // a guess about what a stage means rather than a measurement.
  const roster = buildRoster({ agents: state.agents, perAgent, perAgentCalls })
  // An agent sees only themselves; the desk sees everyone, top few here and the
  // rest on the Team page rather than a second full table on the dashboard.
  const myRows = state.role === 'agent'
    ? roster.rows.filter(r => r.a.id === state.activeAgentId)
    : roster.rows.slice(0, 5)

  // A DISTRIBUTION, not eight charts.
  //
  // This was one full-width bar per row, so eight stages cost eight rows of
  // mostly empty track — and on a desk where four of them read 0, four of those
  // rows carried no information at all while taking the same height as the ones
  // that did. The proportion is now one stacked bar read in a glance, and the
  // numbers are a two-column list under it. Same facts, about a third of the
  // height, and the eye is no longer dragged to whichever bar is longest —
  // which on a lead book is reliably "Rejected".
  const Distribution = ({ rows, onPick }) => {
    const total = rows.reduce((s, r) => s + r.n, 0) || 1
    const live = rows.filter(r => r.n > 0)
    return (
      <>
        <div className="dist-bar">
          {live.map((r, i) => (
            <i key={r.name} title={`${r.name} — ${r.n}`} data-i={i % 6}
              style={{ width: (r.n / total * 100) + '%' }} />
          ))}
        </div>
        <div className="dist-grid">
          {rows.map((r, i) => (
            <button key={r.name} className={'dist-row' + (r.n === 0 ? ' zero' : '')}
              onClick={() => onPick(r)}>
              <span className="dist-dot" data-i={live.findIndex(x => x.name === r.name) % 6} />
              <span className="dist-k">{r.name}</span>
              <span className="dist-n">{r.n}</span>
            </button>
          ))}
        </div>
      </>
    )
  }

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
          {/* These two replaced "Overdue follow-ups" and "Unassigned", which on a
              live desk read 0 and 0 permanently: overdue counts a boolean column
              nothing writes, and unassigned is always 0 because routing and
              pick-up work. Two of five tiles could not move. These two can, and
              they go down when the desk works them — which is the whole test. */}
          {/* "never contacted" is true again. The tile used to count leads
              sitting on the arrival stage and call that never contacted, which
              is a fact about a dropdown — it read 4 on bhumi while 60 people
              had gone 48 hours without a call or a message. The segment behind
              it now asks whether anyone reached out. */}
          <Kpi icon="clock" label="Past SLA" value={n(totals.untouched_sla)} sub="never contacted"
            alert={totals.untouched_sla > 0} onClick={() => toLeads({ flag: ['untouched_sla'] })} />
          <Kpi icon="phone" label="No answer" value={n(totals.noanswer_stale)} sub="not retried"
            alert={totals.noanswer_stale > 0}
            onClick={() => toLeads({ seg: 'noanswer_stale' })} />
          {hasCalling && (
            <Kpi icon="phone" label="Late callbacks" value={oq.callbacksOverdue} sub="owners waiting on a call"
              alert={oq.callbacksOverdue > 0} onClick={() => toCalling('callbacks_overdue')} />
          )}
          <Kpi icon="plus" label="Arrived today" value={n(totals.new_today)} sub="fresh enquiries" onClick={() => toLeads({ seg: 'today' })} />
          {hasCalling && (
            <Kpi icon="check" label="Calls logged today" value={oq.calledToday} sub="outbound, today" onClick={() => toCalling('never_called')} />
          )}
        </div>

        {/* The shape of the lead book: what stage it sits at, and where it came
            from. Both are distributions of the same 140 rows read two ways, so
            they belong on one row — stacked, they read as two unrelated
            findings and burn a screen height between them. */}
        <div className="dash-cols">
          <Panel>
            {/* The header counted OPEN while the bars below it include Deal
                Closed and Rejected, so it labelled 103 over bars summing to
                120. Two populations, one panel, nothing saying so. */}
            <SectionHead title="Leads by stage" right={desk ? `${totals.total} total` : ''} />
            <Distribution rows={stageCounts} onPick={(r) => toLeads({ stage: r.name })} />
          </Panel>

          <Panel>
            <SectionHead title="Leads by source" right={desk ? `${sources.length} live` : ''} />
            {sources.length === 0
              ? <div className="detail-empty">No leads yet.</div>
              : <Distribution rows={sources.map(sn => ({ name: sn, n: bySource[sn] }))}
                  onPick={(r) => toLeads({ source: [r.name] })} />}
          </Panel>
        </div>

        {/* What is waiting. Both halves are worklists rather than distributions,
            and the outbound one appears only on a desk that does cold-calling. */}
        <div className={'dash-cols' + (hasCalling ? '' : ' one')}>
          {hasCalling && (
            <Panel>
              <SectionHead title="Calling queue" right={`${oq.open} open`} />
              {/* ONE ROW OF FIGURES, not a 2x2 tile grid with its own bar chart
                  under it. That was a dashboard drawn inside a panel on the
                  dashboard — the same four numbers at KPI weight, competing with
                  the strip at the top of the page for the same attention. These
                  are reference figures for one queue; the urgent one is already
                  a tile above. */}
              <div className="qfig">
                <button className={'qfig-i' + (oq.callbacksOverdue ? ' alert' : '')} onClick={() => toCalling('callbacks_overdue')}>
                  <span className="qfig-v">{oq.callbacksOverdue}</span><span className="qfig-l">Late</span>
                </button>
                <button className="qfig-i" onClick={() => toCalling('callbacks_today')}>
                  <span className="qfig-v">{oq.callbacksToday}</span><span className="qfig-l">Due today</span>
                </button>
                <button className="qfig-i" onClick={() => toCalling('to_call')}>
                  <span className="qfig-v">{oq.toCall}</span><span className="qfig-l">Never called</span>
                </button>
                <button className="qfig-i" onClick={() => toCalling('unassigned')}>
                  <span className="qfig-v">{oq.unassigned}</span><span className="qfig-l">Unassigned</span>
                </button>
              </div>
              <div className="dash-sub">Outcomes</div>
              {outcomes.length === 0
                ? <div className="detail-empty">Nothing called yet.</div>
                : <Distribution rows={outcomes.map(([name, n]) => ({ name, n }))}
                    onPick={(r) => toCalling('open', r.name)} />}
            </Panel>
          )}

          {/* This panel ran the same dead `overdue` flag as the tile did, so it
              printed "All caught up." to a desk holding 13 leads rung once and
              dropped and 11 never contacted at all. False reassurance is worse
              than a wrong number: nobody goes looking behind it. It now lists
              the leads that are actually at risk, longest-waiting first. */}
          <Panel>
            <SectionHead title="Going cold" right={
              <span className="sh-tools">
                <Segmented value={coldMode} onChange={setColdMode}
                  options={[
                    { value: 'never', label: 'Never called' },
                    { value: 'noanswer', label: 'No answer, not retried' },
                  ]} />
                {atRiskTotal ? <span>{atRiskTotal}</span> : null}
              </span>
            } />
            {atRisk.length === 0 && <div className="detail-empty">Nothing going cold.</div>}
            <div className="od-list">
              {atRisk.map(l => {
                const a = store.agentById(l.agentId)
                // WHY this row is here. It read `l.stage` — so every row said
                // "New", which is the least informative fact available and
                // answers a question nobody asked.
                //
                // "Never contacted" was inferred from the lead sitting on the
                // arrival stage, and on bhumi one of those rows had three
                // WhatsApp messages and an unanswered call against it: the agent
                // had typed "Call not received" into the remark box instead of
                // choosing it from the dropdown, so the stage said nothing had
                // happened while the timeline said four things had.
                //
                // The claim is now measured rather than reworded — untouched_sla
                // asks whether anyone reached out — so the two reasons below are
                // both true, and the toggle above narrows to the first of them.
                const noAnswer = l.stage === 'Call Not Received'
                const reason = noAnswer ? 'No answer, not retried' : 'Never contacted'
                const since = new Date(l.updatedAt || l.createdAt).getTime()
                const days = Math.floor((Date.now() - since) / 86400000)
                const wait = days >= 1 ? `${days} day${days === 1 ? '' : 's'}` : 'today'
                return (
                  <button key={l.id} className="od-row" onClick={() => go('leads', { leadId: l.id, leadOpen: true })}>
                    <div className="od-main">
                      <div className="od-name">{l.name}</div>
                      <div className="od-sub">{reason} · {wait}</div>
                    </div>
                    <div className="od-right">
                      <div className="od-when">{whenLabel(l.updatedAt || l.createdAt)}</div>
                      {a && <Avatar agent={a} size="sm" />}
                    </div>
                  </button>
                )
              })}
            </div>
            {/* The panel shows a handful and says how many there are; the way to
                see the rest is the list it came from, not a longer panel that
                outgrows whatever sits beside it. */}
            {atRiskTotal > atRisk.length && (
              <button className="od-all" onClick={() => toLeads({ seg: coldSeg })}>
                See all {atRiskTotal}
              </button>
            )}
          </Panel>
        </div>

        {/* Who is doing the work. The SAME rows the Team page renders, at the
            compact density and capped — a full table of every agent belongs on
            the screen that is about the team, not on the one that is about
            today. "All N" goes there rather than growing this panel. */}
        <Panel>
          <SectionHead title={state.role === 'agent' ? 'My performance' : 'Team'}
            right={state.role !== 'agent' && roster.rows.length > myRows.length
              ? <button className="od-all od-all-inline" onClick={() => go('team')}>All {roster.rows.length}</button>
              : undefined} />
          {myRows.map(r => (
            <RosterRow key={r.a.id} r={r} compact
              evenShare={roster.evenShare} maxLoad={roster.maxLoad}
              onOpen={() => toLeads({ agent: [r.a.id] })} />
          ))}
        </Panel>
      </div>
    </>
  )
}
