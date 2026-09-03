// The agent's work queue. Not a dashboard: no counters, no greeting, no chart.
// Every row here is a thing that has to be done today, and tapping it opens the
// record.
//
// Two things were wrong with the version this replaces.
//
// The first is scale. Every group rendered its full membership, drawn from a
// feed capped at 200 leads — so a firm that imported a thousand got a "Not yet
// contacted" group holding the first two hundred of them, a header that counted
// the rows it happened to receive rather than the rows that exist, and every
// other group pushed below a scroll with no bottom. The fix is that a group's
// SIZE and a group's ROWS are now two different things: counts come from their
// own query, and a group past BULK stops pretending to be a list and becomes a
// single line with the real number and a way into it. Six overdue calls is a
// list. Nine hundred uncontacted leads is a task, and the honest way to show a
// task is to name it and open it.
//
// The second is that the calling queue did not appear here at all, so an agent
// with seven hundred owners to ring opened Today and saw nothing about them.
import { useEffect, useState } from 'react'
import { api } from '../../lib/api.js'
import { isTerminal } from '../../data/leadStatus.js'
import { Overdue, StageTag, MoreRows, useCap } from '../../components/primitives.jsx'
import { initials, reqShort, renewalSignal, unitLabel, callbackSignal, followUpOverdue, personLabel } from '../../lib/format.js'
import Icon from '../../components/Icon.jsx'

const CLOSED = (l) => isTerminal(l.stage)

// Past this, a group is a backlog rather than a to-do list, and it collapses to
// one line. Twelve is about a screen and a half of rows on a phone — enough to
// scan, few enough that the group below it is still reachable with one flick.
const BULK = 12

// "4:30 pm" → minutes, so the day reads in the order it happens rather than in
// whatever order the leads were created.
function timeRank(t) {
  const m = String(t || '').match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i)
  if (!m) return 24 * 60
  let h = Number(m[1]) % 12
  if (/pm/i.test(m[3] || '')) h += 12
  return h * 60 + Number(m[2] || 0)
}

// A row is a CONTROL, not a div with an onClick -- it is the primary way an
// agent moves through their day and it had no focus state and no semantics.
// The call button is a SIBLING of the opening button, never nested inside it:
// a button inside a button is invalid, and the phone icon was a 27x23px target
// sitting 8px from a 300px one, so a mis-tap opened the record instead of
// dialling. Both are now full-height and separated.
// How long since a person did anything on it. Days, not "3 hours ago" -- the
// group exists because these have been sitting, and an hour is not sitting.
// Whether Today shows the "Nothing booked" pile. Off for now; the read that
// builds it is unchanged, so this is the only line between here and it coming
// back.
const SHOW_QUIET = false

function quietFor(l) {
  const at = l.lastActivityAt || l.createdAt
  if (!at) return null
  const d = Math.floor((Date.now() - new Date(at).getTime()) / 86400000)
  return d >= 1 ? `${d}d` : 'today'
}

function LeadRow({ l, onOpen, store, tone, quiet }) {
  return (
    <div className="q-row">
      <button type="button" className="q-open" onClick={() => onOpen(l)}>
        <span className="av av-md">{initials(personLabel(l))}</span>
        <span className="q-main">
          <span className="q-name">{personLabel(l)}</span>
          <span className="q-sub">{l.followUp ? l.followUp.action : reqShort(l.req)}</span>
        </span>
        <span className="q-right">
          {tone === 'overdue'
            ? <Overdue>{l.followUp?.time || 'Overdue'}</Overdue>
            : quiet ? <span className="source mono-num">{quietFor(l)}</span>
              : l.followUp ? <span className="source">{l.followUp.time}</span> : <StageTag stage={l.stage} />}
        </span>
      </button>
      <button
        type="button"
        className="q-call"
        aria-label={`Call ${personLabel(l)}`}
        onClick={() => store.openModal({ kind: 'contact', channel: 'call', name: l.name, phone: l.phone, recordType: 'lead', recordId: l.id })}
      ><Icon name="phone" size={17} /></button>
    </div>
  )
}

// An owner in the calling queue. The right-hand slot carries the callback time
// rather than a stage, because that is the fact that decides whether this one
// gets dialled next.
function OwnerRow({ o, onOpen, store }) {
  const cb = callbackSignal(o.callbackAt)
  return (
    <div className="q-row">
      <button type="button" className="q-open" onClick={() => onOpen(o)}>
        <span className="av av-md av-supply">{initials(o.name || o.phone || '?')}</span>
        <span className="q-main">
          <span className="q-name">{o.name || 'Unnamed owner'}</span>
          <span className="q-sub">{o.callbackNote || [o.project, o.unitRef].filter(Boolean).join(' · ') || o.locality || o.phone}</span>
        </span>
        <span className="q-right">
          {cb
            ? (cb.tone === 'overdue' ? <Overdue>{cb.label}</Overdue> : <span className="source">{cb.label}</span>)
            : <span className="source">Not called</span>}
        </span>
      </button>
      <button
        type="button"
        className="q-call"
        aria-label={`Call ${o.name || 'owner'}`}
        onClick={() => store.openModal({ kind: 'contact', channel: 'call', name: o.name, phone: o.phone, recordType: 'owner', recordId: o.id })}
      ><Icon name="phone" size={17} /></button>
    </div>
  )
}

// Inventory has its own clock, and it is the half of the day a lead list can
// never show: a tenancy runs out whether or not anyone opened the record.
function RenewalRow({ p, onOpen, signal }) {
  return (
    <button type="button" className="q-row q-row-1" onClick={() => onOpen(p)}>
      <span className="q-ic"><Icon name="building" size={17} /></span>
      <span className="q-main">
        <span className="q-name">{p.society || p.title}{unitLabel(p) && <span className="unit-tag">{unitLabel(p)}</span>}</span>
        <span className="q-sub">{p.tenancy?.tenant ? `${p.tenancy.tenant} · ${p.locality}` : p.locality}</span>
      </span>
      <span className="q-right">
        {signal.tone === 'overdue' ? <Overdue>{signal.label}</Overdue> : <span className="source">{signal.label}</span>}
      </span>
    </button>
  )
}

// A backlog, stated rather than listed. This is the whole answer to "what
// happens when I import a thousand" — the number is real, the tap opens the
// filtered list, and it costs one line instead of the entire screen.
function BulkRow({ g, onSeeAll }) {
  return (
    <button className="q-bulk" onClick={() => onSeeAll(g)}>
      <span className="q-bulk-n">{g.count.toLocaleString('en-IN')}</span>
      <span className="q-bulk-t">
        <span className="q-bulk-l">{g.label}</span>
      </span>
      <Icon name="chevRight" size={16} className="ic" />
    </button>
  )
}

function Group({ g, onOpen, store, onSeeAll }) {
  const { cap, more, showMore } = useCap(g.rows.length, 6)
  return (
    <section className="q-group">
      <div className={'q-head' + (g.tone === 'overdue' ? ' q-head-alert' : '')}>
        {g.label}<span className="q-count">{g.count.toLocaleString('en-IN')}</span>
        {/* Only when the group holds more than it shows — a "See all" on six of
            six rows is a link back to the same six rows. */}
        {/* Only when the group HAS somewhere to land. 'Due today',
            'Upcoming' and 'Tenancies expiring' have no filter behind them, and
            this called go('leads') with an undefined one -- a link out of a
            named group into the unfiltered list. */}
        {g.count > g.rows.length && (g.filter || g.screen) && (
          <button className="q-seeall" onClick={() => onSeeAll(g)}>See all</button>
        )}
      </div>
      {g.rows.slice(0, cap).map(r => (
        g.kind === 'renewal' ? <RenewalRow key={r.p.id} p={r.p} signal={r.signal} onOpen={onOpen} />
          : g.kind === 'owner' ? <OwnerRow key={r.id} o={r} onOpen={onOpen} store={store} />
            : <LeadRow key={r.id} l={r} onOpen={onOpen} store={store} tone={g.tone} quiet={g.quiet} />
      ))}
      {/* `more` straight from useCap, which already floors it at zero. This
          used to re-derive the remainder as `rows.length - cap` and take the
          min of the two, meaning to be careful — but cap keeps growing past
          the last row, so that second expression goes negative and won the
          min. A negative is truthy, so the button never went away and every
          further tap counted further down: "-4 left", "-10 left". */}
      <MoreRows more={more} step={6} onMore={showMore} />
    </section>
  )
}

// One read for the whole screen: rows for the groups that are lists, counts for
// the groups that are backlogs, both sides of the desk in a single request.
function useTodayFeed(dataAsOf) {
  const [feed, setFeed] = useState({ leads: [], renewals: [], quiet: [], counts: {}, owners: { counts: {} } })
  // LOADING IS NOT EMPTY. Without this the state before the answer and the
  // state of having no work are the same object -- empty arrays -- so Today
  // opened on "Nothing due", a definite and wrong answer, and then silently
  // became a different screen when the request landed. On a phone, on a slow
  // connection, that is indistinguishable from a broken screen: the one thing
  // it says is the one thing that is not true.
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    let live = true
    setLoading(true)
    // The phone is 'my day'. A manager on a desk still sees the firm.
    api.getToday(true)
      .then(r => {
        if (!live || !r?.success) return
        setFeed({
          leads: r.leads || [], renewals: r.renewals || [], quiet: r.quiet || [],
          counts: r.counts || {}, owners: r.owners || { counts: {} },
        })
      })
      .catch(() => {})
      // Settled, not succeeded. A failed request must still stop claiming to be
      // loading, or a dropped connection spins for ever.
      .finally(() => { if (live) setLoading(false) })
    return () => { live = false }
  }, [dataAsOf])
  return { ...feed, loading }
}

/**
 * The shape of the answer, before the answer.
 *
 * Deliberately the same geometry as a real group -- a heading bar, then rows
 * the height of a lead row -- so the screen does not resize under the thumb
 * when the data lands. Two groups is enough to read as "a list is coming";
 * filling the viewport with grey would overstate what is usually there.
 */
function TodaySkeleton() {
  return (
    <div className="q-wrap" aria-busy="true" aria-label="Loading your day">
      {[0, 1].map(g => (
        <div key={g} className="sk-group">
          <div className="sk sk-head" />
          {[0, 1, 2].map(r => (
            <div key={r} className="sk-row">
              <div className="sk sk-line sk-w1" />
              <div className="sk sk-line sk-w2" />
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}

export default function PhoneToday({ store, me, go, topBar }) {
  const { state } = store
  const feed = useTodayFeed(state.dataAsOf)
  const scoped = feed.leads
  const c = feed.counts || {}
  const oc = feed.owners?.counts || {}

  const openLead = (l) => go('leads', { leadId: l.id, leadOpen: true })
  const openOwner = (o) => { store.cacheRecords('owner', [o]); go('calling', { ownerId: o.id, ownerOpen: true }) }
  const openProp = (p) => go('properties', { propId: p.id, propOpen: true })
  // A group knows where it goes. Previously "See all" only ever landed on the
  // leads list, which is wrong the moment a group is owners.
  const seeAll = (g) => (g.screen === 'calling'
    ? go('calling', { ownerSeg: g.segment })
    : go('leads', { leadFilters: g.filter }))

  const renewals = feed.renewals
    .map(p => ({ p, signal: renewalSignal(p.tenancy) }))
    .filter(r => r.signal && r.signal.tone !== 'ok')
    .sort((a, b) => a.signal.days - b.signal.days)

  const open = scoped.filter(l => !CLOSED(l))
  const overdue = open.filter(l => followUpOverdue(l.followUp))
  const todayFu = open
    .filter(l => l.followUp && !followUpOverdue(l.followUp) && l.followUp.date === 'Today')
    .sort((a, b) => timeRank(a.followUp.time) - timeRank(b.followUp.time))
  const fresh = open.filter(l => l.stage === 'New')
  const unassigned = open.filter(l => !l.agentId)
  const upcoming = open.filter(l => l.followUp && !followUpOverdue(l.followUp) && l.followUp.date !== 'Today')

  const isDesk = state.role !== 'agent'
  const ownerRows = feed.owners || {}

  // Ordered by how much the day depends on them, and interleaved rather than
  // grouped by module: a late callback and a late follow-up are the same kind
  // of problem, and splitting the screen into a leads half and an owners half
  // would mean scrolling past everything on one side to see the other.
  const groups = [
    { key: 'overdue', label: 'Overdue', rows: overdue, count: c.overdue ?? overdue.length, tone: 'overdue', filter: { flag: ['overdue'] } },
    { key: 'cbLate', label: 'Late callbacks', kind: 'owner', rows: ownerRows.callbacksOverdue || [], count: oc.callbacksOverdue ?? 0, tone: 'overdue', screen: 'calling', segment: 'callbacks_overdue' },
    { key: 'today', label: 'Due today', rows: todayFu, count: todayFu.length },
    { key: 'cbToday', label: 'Callbacks today', kind: 'owner', rows: ownerRows.callbacksToday || [], count: oc.callbacksToday ?? 0, screen: 'calling', segment: 'callbacks_today' },
    { key: 'fresh', label: 'Not yet contacted', rows: fresh, count: c.fresh ?? fresh.length, filter: { stage: 'New' } },
    { key: 'toCall', label: 'Owners to call', kind: 'owner', rows: ownerRows.toCall || [], count: oc.toCall ?? 0, screen: 'calling', segment: 'to_call' },
    // Only the desk can hand work to someone, so only the desk is shown what
    // nobody owns.
    ...(isDesk ? [{ key: 'unassigned', label: 'Nobody assigned', rows: unassigned, count: c.unassigned ?? unassigned.length, filter: { flag: ['unassigned'] } }] : []),
    { key: 'renewals', label: 'Tenancies expiring', rows: renewals, count: renewals.length, kind: 'renewal' },
    // THE GROUP MOST AGENTS' DAY IS ACTUALLY MADE OF. Its rows come from their
    // own query, ordered by longest-silent, rather than being filtered out of a
    // 200-row feed selected by arrival date -- which could not contain a lead
    // last touched five weeks ago, which is exactly the lead this group is for.
    // It is not collapsed to a BulkRow: on this desk it is the work.
    // HIDDEN FOR NOW, at the user's request — not deleted. The group is the one
    // most agents' day is actually made of (161 of bhumi's 217 open leads), and
    // the server still computes and sends it, so putting it back is this line.
    // Kept here rather than removed so the next person reads a decision instead
    // of wondering why the feed carries a `quiet` array nothing renders.
    ...(SHOW_QUIET ? [{ key: 'quiet', label: 'Nothing booked', rows: feed.quiet || [], count: c.quiet ?? 0,
      quiet: true, nocap: true, filter: { seg: 'no_next_step' } }] : []),
    { key: 'upcoming', label: 'Upcoming', rows: upcoming, count: upcoming.length },
  ].filter(g => g.count > 0)

  return (
    <>
      {topBar({ title: 'Today' })}
      {feed.loading ? <TodaySkeleton /> : (
      <div className="q-wrap">
        {groups.map(g => (
          // A group that can be worked through is a list. One that can only be
          // started is a line with a number on it.
          // `nocap`: a group whose rows ARE the day does not collapse into a
          // number, however large the count behind it. Everything else past
          // BULK is a backlog and states itself in one line.
          g.count > BULK && !g.nocap && (g.filter || g.screen)
            ? <BulkRow key={g.key} g={g} onSeeAll={seeAll} />
            : <Group key={g.key} g={g} store={store} onSeeAll={seeAll}
                onOpen={g.kind === 'renewal' ? openProp : g.kind === 'owner' ? openOwner : openLead} />
        ))}
        {!groups.length && (
          <div className="empty">
            <div className="e-t">Nothing due</div>
            <div className="e-s">Follow-ups, callbacks and new enquiries show up here.</div>
          </div>
        )}
      </div>
      )}
    </>
  )
}
