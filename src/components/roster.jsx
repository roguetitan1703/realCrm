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
// Now: `buildRoster` decides what an agent's numbers ARE and `DeskTable` draws
// them on the dashboard. The Team page's card roster (RosterRow) is gone: that
// page shows what people DID — the full Team today, components/ActivityDay.jsx.
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
      // The manager's columns. Each is the same expression as the pill it opens.
      neverContacted: r.neverContacted ?? 0,
      noNextStep: r.noNextStep ?? 0,
      goingCold: r.goingCold ?? 0,
      coldToday: r.coldToday ?? 0,
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
 * THE MANAGER'S TABLE.
 *
 * One row per agent, one column per thing the manager can say to them today.
 * Every cell opens the leads list filtered to that agent AND that condition,
 * counted by the same expression the pill behind it runs — so a cell and the
 * list it opens cannot disagree.
 *
 * It replaces two panels rather than joining them: the load-bar roster (which
 * answers "who is busy", not "who is stuck") and a Going-cold list that was the
 * dashboard's own tile printed a second time.
 *
 * WHY THESE FIVE. Open is the plate. Not contacted and Nothing booked are the
 * two ways work stalls, and they are different failures needing different
 * conversations. Went cold today is the flow across the line the firm set —
 * the standing pile is 72% of the book and nobody works a number like that.
 * Worked today is the only column that goes UP, and without it a quiet day and
 * a busy one look identical.
 */
export function DeskTable({ rows, onCell }) {
  const cols = [
    { key: 'open', label: 'Open', seg: null },
    { key: 'neverContacted', label: 'Not contacted', seg: 'never_contacted', tone: 'alert' },
    // A NUMBER, NOT A LINK. The pile it opened has no pill on the Leads list
    // any more, so clicking through would land a manager on filtered rows with
    // nothing on screen naming why. The count is still worth showing — it is
    // one of the two ways work stalls — so the column stays and the navigation
    // goes, the same as Open and Worked today beside it.
    { key: 'noNextStep', label: 'Nothing booked', seg: null },
    { key: 'coldToday', label: 'Went cold today', seg: 'going_cold', tone: 'alert' },
    // "Worked today" was here: every event a person wrote, bulk assignments and
    // all, so an owner handing out 700 rows read as 700 things done. What a
    // person did is Team today now (components/ActivityDay.jsx), counted from
    // actions only; a second, looser number beside it would disagree with it.
  ]
  return (
    <div className="dt-wrap">
      <table className="dt">
        <thead>
          <tr>
            <th>Agent</th>
            {cols.map(c => <th key={c.key} className="dt-n">{c.label}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.a.id} className={r.off ? 'off' : ''}>
              <th scope="row">
                <button className="dt-who" onClick={() => onCell(r, null)}>
                  <Avatar agent={r.a} size="sm" />
                  <span>{r.a.first || r.a.name}</span>
                  {r.off && <span className="rst-tag off">Off duty</span>}
                </button>
              </th>
              {cols.map(c => {
                const v = r[c.key] ?? 0
                return (
                  <td key={c.key} className="dt-n">
                    <button
                      className={'dt-v' + (v > 0 && c.tone === 'alert' ? ' alert' : '') + (v > 0 && c.up ? ' up' : '') + (v === 0 ? ' zero' : '')}
                      disabled={v === 0}
                      onClick={() => onCell(r, c.seg)}
                    >{v}</button>
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
