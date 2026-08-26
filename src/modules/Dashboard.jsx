import { useState } from 'react'
import { Kpi, Panel, SectionHead } from '../components/primitives.jsx'
import { buildRoster, DeskTable } from '../components/roster.jsx'
import { api } from '../lib/api.js'
import { useServerData } from '../lib/useServerData.js'

// THE MANAGER'S SCREEN. One question: is the team working the book, and who is
// stuck. Tiles for what can be cleared today, then a row per agent with a
// column per thing that can be said to them -- every cell opening that agent's
// filtered list.
//
// It was a report about the book wearing a workspace's clothes: six desk-wide
// totals, each with a caption explaining itself, over a stage chart, a source
// chart, a queue panel, a duplicate of one of the tiles, and a load-bar roster.
// Nothing on it was per-agent except the roster, at the bottom, and the roster
// answered "who is busy" when the question is "who is stuck".
//
// THREE OF THE TILES WERE ONE PILE. On bhumi all 16 never-contacted leads sit
// at stage New and 11 of them arrived today, so "Not contacted", "Today" and
// the New bar in Leads-by-stage were the same rows described three times.
//
// NO CAPTIONS ON THE TILES. Every one of them carried a line explaining itself
// -- "nobody has reached out", "booked, time gone by", "open and gone quiet",
// "fresh enquiries" -- which is the one thing this product does not do: labels
// and values only, the buttons are the message. If a label needs a sentence
// under it, the label is wrong.
// THREE TILES, NOT SIX. On bhumi all 16 never-contacted leads sit at stage New
// and 11 of them arrived today, so "Not contacted", "Today" and the New bar in
// Leads-by-stage were one pile counted three times on one screen. What is left
// is disjoint and each of it can be cleared: nobody has reached out, a booked
// time has passed, it crossed the firm's own quiet line today.
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
  // The going-cold LIST is gone from this screen: it was the tile above printed
  // a second time, six rows of it, and "who is this happening to" is a question
  // the per-agent table answers for the whole desk in one row each.
  const { data: ownerSummary } = useServerData(() => api.getOwnersSummary(), [state.dataAsOf], null, '/owners/summary')

  const totals = desk?.leads || { total: 0, open: 0, overdue: 0, won: 0, new_today: 0, unassigned: 0 }
  // The firm's own number from Settings -> Response times, not a literal 3.
  const coldDays = store.state.settings?.reminderDays || 3
  // Until the counts arrive we do not know them, and rendering 0 says something
  // false and alarming -- "you have no leads today" is a very different message
  // from "still loading". An em dash says the honest thing.
  const n = (v) => (desk ? v : '—')
  // A TILE AND THE PILL IT OPENS WEAR THE SAME WORD. Both read the catalogue
  // the SQL lives beside (backend/src/services/leadSegments.ts); the argument
  // here is only what to say if the API is older than this build. "Past SLA" on
  // this screen against "Never called" on the list — one expression, two names —
  // is what a served label exists to prevent.
  const segLabel = (key, fallback) =>
    (state.leadSegments || []).find(s => s.key === key)?.label || fallback
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

  // Sources that have actually sent a lead, counted server-side. `bySource` is
  // the firm's real traffic, not settings.sources -- which a new Connections
  // integration never touches.
  const sources = Object.keys(bySource).sort((a, b) => bySource[b] - bySource[a])

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
    : roster.rows.slice(0, 8)

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
          {/* The tile and the pill it opens now read ONE expression and wear ONE
              word. "Past SLA" was never_contacted with a clock on it and linked
              through to a flag the Leads screen did not offer, so the list
              opened unfiltered. */}
          <Kpi icon="clock" label={segLabel('never_contacted', 'Not contacted')} value={n(totals.never_contacted)}
            alert={totals.never_contacted > 0} onClick={() => toLeads({ seg: 'never_contacted' })} />
          {/* BACK, because the reason it went is fixed. It was pulled when
              `overdue` counted a boolean column nothing wrote and read 0 for
              ever; it now runs FOLLOWUP_OVERDUE, the same expression as the
              pill it opens — 8 leads on the dev clone of the live desk, 9 and
              14 on the other two. desk-rework.md A lists it as a KPI, and it is
              the tile Late callbacks beside it was always meant to pair with. */}
          <Kpi icon="calendar" label={segLabel('overdue', 'Follow-up overdue')} value={n(totals.overdue)}
            alert={totals.overdue > 0} onClick={() => toLeads({ seg: 'overdue' })} />
          {/* THE FLOW, NOT THE HEAP. This read the standing pile: 177 of
              bhumi's 246 open leads, 72% of the book, growing, and no desk
              works a number like that -- it teaches people to skip the strip it
              sits in. Six crossed the line the firm set in the last day. The
              pile is still one tap away, on the pill, where a backlog belongs. */}
          <Kpi icon="clock" label="Went cold today" value={n(totals.cold_today)}
            alert={totals.cold_today > 0} onClick={() => toLeads({ seg: 'going_cold' })} />
          {hasCalling && (
            <Kpi icon="phone" label="Late callbacks" value={oq.callbacksOverdue}
              alert={oq.callbacksOverdue > 0} onClick={() => toCalling('callbacks_overdue')} />
          )}
          {hasCalling && (
            <Kpi icon="check" label="Calls logged today" value={oq.calledToday} onClick={() => toCalling('never_called')} />
          )}
        </div>

        {/* WHERE THE BOOK COMES FROM. One panel, not two.
            "Leads by stage" went with it: the stage pills on the Leads screen
            and the per-agent table below already answer it, and a bar chart of
            a distribution changes nobody's afternoon. Source does not have
            another home and it is a real question -- 150 of bhumi's 338 arrive
            through one portal, which is a commercial fact about the firm. */}
        <div className="dash-cols one">
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
        {hasCalling && (
          <div className="dash-cols one">
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
          </div>
        )}

        {/* THE MANAGER'S PAGE. One row per agent, one column per thing that can
            be said to them today, every cell opening that agent's filtered
            list. It replaces the load-bar roster -- which answered "who is
            busy" when the question is "who is stuck" -- and the Going cold
            panel, which was the tile above printed a second time. An agent sees
            only their own row. */}
        <Panel>
          <SectionHead title={state.role === 'agent' ? 'My desk' : 'By agent'}
            right={state.role !== 'agent' && roster.rows.length > myRows.length
              ? <button className="od-all od-all-inline" onClick={() => go('team')}>All {roster.rows.length}</button>
              : undefined} />
          <DeskTable rows={myRows} onCell={(r, seg) => toLeads(seg ? { agent: [r.a.id], seg } : { agent: [r.a.id] })} />
        </Panel>
      </div>
    </>
  )
}
