import { Avatar } from './primitives.jsx'

// ============================================================================
// THE ROSTER — one definition, two densities
// ============================================================================
// The dashboard drew a table and the Team page drew cards, from two different
// derivations of two different endpoints. Neither was good, both had to be
// maintained, and they could disagree — the dashboard called "contacted"
// everything past stage index 0 (a guess) while Team read a per-agent
// performance endpoint once per agent (nine requests for nine integers).
//
// Now: `buildRoster` decides what an agent's numbers ARE, `RosterRow` decides
// what they look like, and `compact` decides how much of it a screen shows.
// The dashboard shows the top few and links here; this page shows all of them
// with the actions. Same rows, same order, same figures.
//
// Every metric below is COUNTED in SQL by getDeskSummary — none is derived from
// a collection the browser happens to hold.
// ============================================================================

/**
 * What the desk needs to know about a person, in the order it matters.
 *
 * The columns this replaces were dead weight on a real desk: `Closed` read 0
 * for all seven agents, `Contacted` read 0 for five of them, and `Called` and
 * `Today` read 0 for six — while `Leads` ranged from 0 to 72. The imbalance was
 * the only story in the table and it was the one column nothing emphasised.
 */
export function buildRoster({ agents, perAgent = {}, perAgentCalls = {}, wonLabel = 'Won', inactive = () => false }) {
  const rows = agents.map(a => {
    const r = perAgent[a.id] || {}
    const c = perAgentCalls[a.id] || {}
    const assigned = r.total ?? 0
    const open = r.open ?? 0
    // Untouched is the failure that matters and the one that goes DOWN when
    // someone works: leads sitting in the arrival stage, still un-rung.
    const untouched = (r.byStage || {}).New ?? 0
    const worked = Math.max(assigned - untouched, 0)
    return {
      a,
      assigned, open, untouched, worked,
      // A share, not a count — 4 of 5 and 40 of 50 are different performances.
      workedPct: assigned > 0 ? Math.round((worked / assigned) * 100) : null,
      calls30d: r.calls30d ?? 0,
      visits30d: r.visits30d ?? 0,
      won: r.won ?? 0,
      overdue: r.overdue ?? 0,
      owners: c.owners ?? 0,
      calledToday: c.calledToday ?? 0,
      off: inactive(a.id),
    }
  })
  // Effort first. Ranking by `won` put every agent on 0 in roster order, which
  // is alphabetical and says nothing; calls in the last 30 days separates a desk
  // that is working from one that is not.
  rows.sort((x, y) => (Number(x.off) - Number(y.off))
    || (y.calls30d - x.calls30d) || (y.worked - x.worked) || (y.assigned - x.assigned))
  // THE SHARE AND THE NUMBER IT JUDGES MUST MEASURE THE SAME THING.
  //
  // This averaged `open` and the badge below compared the result against
  // `assigned` — a threshold built from a smaller pool than the number it
  // gates. On bhumi that is 166 open over 8 people, so the line sat at 31,
  // while assigned counts ran 26 to 40: FIVE OF EIGHT agents wore "Overloaded"
  // on a desk whose load is even. A badge five of eight people wear says
  // nothing, and it says it about the client's whole team.
  //
  // Off-duty agents are excluded from the divisor but their leads still sit in
  // the numerator, which is right — work parked with somebody who is away is
  // still work the desk is carrying.
  const onDuty = rows.filter(r => !r.off).length
  const evenShare = onDuty ? rows.reduce((s, r) => s + r.assigned, 0) / onDuty : 0
  const maxLoad = Math.max(1, ...rows.map(r => r.assigned))
  return { rows, evenShare, maxLoad, wonLabel }
}

/**
 * One person. `compact` is the dashboard: identity, the load bar, two figures.
 * Full adds the rest and whatever actions the screen passes in.
 *
 * The load bar is the point of the row. A number cannot show that one agent
 * holds 72 of 94 leads; a bar against the even share can, at a glance, without
 * anybody having to do the division.
 */
export function RosterRow({ r, evenShare, maxLoad, wonLabel = 'Won', compact = false, onOpen, actions }) {
  const overloaded = !r.off && r.assigned > evenShare * 1.5 && r.assigned > 3
  const pct = Math.round((r.assigned / maxLoad) * 100)
  return (
    <div className={'rst' + (compact ? ' rst-c' : '') + (r.off ? ' off' : '')}>
      <button className="rst-who" onClick={() => onOpen?.(r)} disabled={!onOpen}>
        <Avatar agent={r.a} size={compact ? 'sm' : 'lg'} />
        <span className="rst-id">
          <span className="rst-name">
            {compact ? (r.a.first || r.a.name) : r.a.name}
            {r.off && <span className="rst-tag off">Off duty</span>}
            {!r.off && overloaded && <span className="rst-tag over">Overloaded</span>}
          </span>
          {!compact && <span className="rst-role">{r.a.role || ''}</span>}
        </span>
      </button>

      <div className="rst-load">
        <div className="rst-load-t">
          <span><b>{r.assigned}</b> leads</span>
          {/* Untouched, not "overdue" — overdue reads a boolean column nothing
              writes and was 0 on every agent forever. */}
          <span className={'rst-load-tag ' + (r.untouched ? 'warn' : 'ok')}>
            {r.untouched ? `${r.untouched} untouched` : 'All touched'}
          </span>
        </div>
        <div className="rst-meter"><i className={overloaded ? 'hot' : ''} style={{ width: pct + '%' }} /></div>
      </div>

      {/* TWO figures: how much they dialled, and how much of their plate they
          have actually turned over. Everything else that used to sit here was
          removed for the same reason each time — it could not be compared.

          `Won` read 0 for every agent on both live tenants, and what a firm
          means by "closed" is not settled: agents use it for "closed off" as
          often as "deal secured", so the column asserted something nobody had
          agreed. `Owners` and `Visits · 30d` are both real counts, but a bare
          count of one pipeline standing beside metrics of another invites a
          comparison it cannot support — 5 visits against 6 calls says nothing
          about either. They come back with their own full set of numbers behind
          the leads/owners switch, not as orphans in this row. */}
      <div className="rst-stats">
        <span className="rst-stat"><b>{r.calls30d}</b><small>Calls · 30d</small></span>
        {/* A percentage of nothing is not 0%, it is nothing. */}
        <span className="rst-stat"><b>{r.workedPct == null ? '—' : r.workedPct + '%'}</b><small>Worked</small></span>
      </div>

      {!compact && actions && <div className="rst-act">{actions(r)}</div>}
    </div>
  )
}
