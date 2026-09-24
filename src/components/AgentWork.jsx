// ============================================================================
// ONE PERSON'S WORK, AND THE TEAM'S — "My work" and the Performance page
// ============================================================================
// WHO READS IT:
//   • an agent, on a phone or at a desk: how is my day going, what have I left
//     undone, and how have the last two weeks gone. It is half of Today (the
//     other half is the list of things to do), so it never repeats that list.
//   • the owner or a manager: the team at a glance, one card per person, and
//     then one person's page, which is the SAME page the agent sees of
//     themselves. What an owner is shown about somebody is what that somebody
//     can see about themselves, and nothing else.
//
// Every number is counted by services/activityReport.ts: the day from
// `activityDay`, a stretch of days from `activityRange`, both from one list of
// facts. The day's numbers open their records; a stretch's totals are plain
// figures, because there is no list behind "64 calls over two weeks" worth
// scrolling.
//
// A red number is somebody being told off, so red is used only for the fair
// rules in the report's header: a missed follow-up, a new lead not called, no
// calls after noon.
import { useState } from 'react'
import { api } from '../lib/api.js'
import { useServerData } from '../lib/useServerData.js'
import { dayLabel } from '../lib/format.js'
import { Segmented } from './primitives.jsx'
import Icon from './Icon.jsx'
import { stageLabel, finalStageOf } from '../data/pipelineRoles.js'
import {
  tally, fmt, word, fuWord, shiftDay, dayName, useSide, Detail,
  MEASURE_TITLE, DETAIL_TITLE, titleOf,
} from './ActivityDay.jsx'

const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0)

/** What closing is called on this side: deals on leads, the firm's own last
 *  calling status (Key Received) on calling. */
const closedWord = (side, final, n) => (side === 'leads' ? word(n, 'deal closed', 'deals closed') : stageLabel(final))

/** Every day from `from` to `to`, inclusive, as YYYY-MM-DD. */
function daysBetween(from, to) {
  const out = []
  for (let d = from; d && d <= to && out.length < 40; d = shiftDay(d, 1)) out.push(d)
  return out
}

/** "Mon 22" under a bar; just the date when there are many bars. */
function barLabel(day, many) {
  const d = new Date(`${day}T12:00:00Z`)
  const n = d.getUTCDate()
  if (many) return n === 1 || d.getUTCDay() === 1 ? String(n) : ''
  return `${['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'][d.getUTCDay()]} ${n}`
}

// ── The chart: calls per day, the part that was picked up drawn inside ───────
export function CallBars({ from, to, daily = [], selected, onPick, small = false }) {
  const days = daysBetween(from, to)
  const byDay = Object.fromEntries(daily.map(d => [d.day, d]))
  const max = Math.max(1, ...days.map(d => byDay[d]?.calls || 0))
  const many = days.length > 14
  return (
    <div className={'cb' + (small ? ' cb-small' : '')} style={{ '--cb-n': days.length }}>
      <div className="cb-bars">
        {days.map(d => {
          const v = byDay[d] || { calls: 0, pickedUp: 0 }
          const h = v.calls ? Math.max(6, (v.calls / max) * 100) : 0   // 0: a flat line, so the day still has a place
          const inner = v.calls ? (v.pickedUp / v.calls) * 100 : 0
          const tip = `${dayLabel(d)}: ${fmt(v.calls)} ${word(v.calls, 'call', 'calls')}, ${fmt(v.pickedUp)} picked up`
          const Tag = onPick ? 'button' : 'span'
          return (
            <Tag key={d} type={onPick ? 'button' : undefined} title={tip} aria-label={tip}
              className={'cb-col' + (selected === d ? ' on' : '')} onClick={onPick ? () => onPick(d) : undefined}>
              <span className={'cb-bar' + (v.calls ? '' : ' zero')} style={v.calls ? { height: `${h}%` } : undefined}>
                {inner > 0 && <span className="cb-in" style={{ height: `${inner}%` }} />}
              </span>
            </Tag>
          )
        })}
      </div>
      {!small && (
        <div className="cb-days" aria-hidden="true">
          {days.map(d => <span key={d} className={selected === d ? 'on' : ''}>{barLabel(d, many)}</span>)}
        </div>
      )}
    </div>
  )
}

// ── One person's page ────────────────────────────────────────────────────────
/**
 * @param person   the user id; for "My work" the signed-in person
 * @param title    "My work", or the person's name on the Performance page
 * @param book     what they hold now (desk summary), shown to the desk only
 * @param actions  the desk's buttons for this person (Reassign, their leads)
 */
export function AgentWork({ store, person, title, heading = true, hasCalling, defaultSide = 'leads', book, ownerBook, onBook, actions }) {
  const { state } = store
  const [side, setSide] = useSide(hasCalling ? defaultSide : 'leads')
  const eff = hasCalling ? side : 'leads'
  const [date, setDate] = useState(null)
  const { data: day } = useServerData(
    () => api.getActivity({ side: eff, date, person }), [eff, date, person, state.dataAsOf], null)
  const { data: range } = useServerData(
    () => api.getActivityRange({ side: eff, days: 14, person }), [eff, person, state.dataAsOf], null)

  const find = (d) => (d?.people || []).find(p => p.id === person) || (d?.people || [])[0]
  const t = tally(find(day))
  const r = find(range)
  const rt = tally(r)
  const isToday = !day || day.day === day.today
  const pickDay = (d) => setDate(!day || d === day.today ? null : d)
  const open = (measure, detail) => store.openModal({
    kind: 'activityRecords', side: eff, date: day?.day, person, measure, detail,
    title: titleOf([title === 'My work' ? '' : title, dayName(day?.day, day?.today), MEASURE_TITLE[measure],
      DETAIL_TITLE[detail] || (measure === 'status' ? stageLabel(detail) : '')]),
  })

  const final = finalStageOf(state.settings, eff)
  const closed = rt.n('status', final)
  const moved = t.statuses.slice(0, 4)

  return (
    <div className="aw">
      {/* The title is left out where the tab or the top bar already says it. */}
      {(heading || hasCalling || actions) && (
        <div className="aw-top">
          {heading && <h2 className="aw-title">{title}</h2>}
          {hasCalling && (
            <Segmented options={[{ value: 'leads', label: 'Leads' }, { value: 'calling', label: 'Calling' }]} value={side} onChange={(v) => { setSide(v); setDate(null) }} />
          )}
          {actions && <span className="aw-actions">{actions}</span>}
        </div>
      )}

      {/* THE DAY. Today unless a day was picked, here or on the chart. */}
      <section className="panel aw-panel">
        <div className="aw-sub">
          <span className="aw-sub-t">{day ? dayName(day.day, day.today) : 'Today'}</span>
          {day && (
            <span className="ad-day">
              <button type="button" aria-label="Day before" onClick={() => pickDay(shiftDay(day.day, -1))}><Icon name="chevLeft" size={15} /></button>
              <button type="button" aria-label="Day after" disabled={day.day >= day.today} onClick={() => pickDay(shiftDay(day.day, 1))}><Icon name="chevRight" size={15} /></button>
            </span>
          )}
          {!isToday && <button type="button" className="aw-today" onClick={() => setDate(null)}>Today</button>}
        </div>
        {!day ? <div className="ad-wait tall" aria-busy="true" /> : (
          <>
            <div className="ad-tiles">
              <button type="button" className="ad-tile" onClick={() => open('call')}>
                <b>{fmt(t.calls)}</b><span>{word(t.calls, 'call', 'calls')}</span>
                <em>{t.calls ? `${fmt(t.pickedUp)} picked up` : ' '}</em>
              </button>
              {isToday ? (
                <>
                  <button type="button" className="ad-tile" onClick={() => open('followup_today')}>
                    <b>{fmt(t.dueToday)}</b><span>{fuWord(eff, t.dueToday)} due today</span><em>&nbsp;</em>
                  </button>
                  <button type="button" className={'ad-tile' + (t.missed ? ' alert' : '')} onClick={() => open('followup_missed')}>
                    <b>{fmt(t.missed)}</b><span>missed {fuWord(eff, t.missed)}</span><em>&nbsp;</em>
                  </button>
                </>
              ) : (
                <>
                  <button type="button" className="ad-tile" onClick={() => open('people')}>
                    <b>{fmt(t.people)}</b><span>{word(t.people, 'person called', 'people called')}</span><em>&nbsp;</em>
                  </button>
                  <button type="button" className="ad-tile" onClick={() => open('followup_set')}>
                    <b>{fmt(t.n('followup_set'))}</b><span>{fuWord(eff, t.n('followup_set'))} booked</span><em>&nbsp;</em>
                  </button>
                </>
              )}
              {eff === 'leads' ? (
                <button type="button" className={'ad-tile' + (t.notCalled ? ' alert' : '')} onClick={() => open('came_in', 'not_called')}>
                  <b>{fmt(t.notCalled)}</b><span>new {word(t.notCalled, 'lead', 'leads')} not called</span>
                  <em>{t.n('came_in') ? `${fmt(t.n('came_in'))} came in` : ' '}</em>
                </button>
              ) : (
                <button type="button" className="ad-tile" onClick={() => open('status', final)}>
                  <b>{fmt(t.n('status', final))}</b><span>{stageLabel(final)}</span><em>&nbsp;</em>
                </button>
              )}
            </div>
            <div className="ad-moved">
              <span className="ad-moved-t">Moved to</span>
              {moved.length
                ? moved.map(s => <button key={s.detail} type="button" onClick={() => open('status', s.detail)}><b>{s.n}</b> {stageLabel(s.detail)}</button>)
                : <span className="ad-quiet">No change</span>}
            </div>
            <Detail t={t} side={eff} isToday={isToday} open={open} hideMoved
              book={book && (eff === 'calling' ? ownerBook : book)} onBook={onBook} />
          </>
        )}
      </section>

      {/* THE LAST TWO WEEKS. A bar a day; tap one to read that day above. */}
      <section className="panel aw-panel">
        <div className="aw-sub"><span className="aw-sub-t">Last 14 days</span>
          <span className="cb-key"><i className="k-all" />calls<i className="k-in" />picked up</span>
        </div>
        {!range ? <div className="ad-wait tall" aria-busy="true" /> : (
          <>
            <CallBars from={range.from} to={range.today} daily={r?.daily || []}
              selected={day?.day} onPick={pickDay} />
            <div className="aw-totals">
              <span><b>{fmt(rt.calls)}</b> {word(rt.calls, 'call', 'calls')}</span>
              <span><b>{pct(rt.pickedUp, rt.calls)}%</b> picked up</span>
              <span><b>{fmt(rt.people)}</b> {word(rt.people, 'person', 'people')} called</span>
              {eff === 'leads' && <span><b>{fmt(rt.n('visit'))}</b> {word(rt.n('visit'), 'site visit', 'site visits')}</span>}
              {eff === 'leads' && <span><b>{fmt(rt.n('followup_done'))}</b> follow-ups done</span>}
              <span><b>{fmt(closed)}</b> {closedWord(eff, final, closed)}</span>
            </div>
          </>
        )}
      </section>
    </div>
  )
}

// ── The team: one card per person ────────────────────────────────────────────
const PERIODS = [
  { value: 'today', label: 'Today' },
  { value: '7', label: '7 days' },
  { value: '30', label: '30 days' },
]

/**
 * The Performance page's board, and the manager's Team tab on the phone.
 * The period decides the calls and what was closed; what needs a word is
 * always today's, because that is what can still be done something about.
 */
export function TeamBoard({ store, hasCalling, onOpenPerson, heading = true }) {
  const { state } = store
  const [side, setSide] = useSide('leads')
  const eff = hasCalling ? side : 'leads'
  const [period, setPeriod] = useState('today')
  const { data: day } = useServerData(() => api.getActivity({ side: eff }), [eff, state.dataAsOf], null)
  const days = period === '30' ? 30 : 7
  const { data: range } = useServerData(() => api.getActivityRange({ side: eff, days }), [eff, days, state.dataAsOf], null)

  const lateEnough = !!day && day.hour >= 12
  const final = finalStageOf(state.settings, eff)
  const dayOf = new Map((day?.people || []).map(p => [p.id, p]))
  const rangeOf = new Map((range?.people || []).map(p => [p.id, p]))
  const ids = [...new Set([...dayOf.keys(), ...rangeOf.keys()])]
  const cards = ids.map(id => {
    const d = dayOf.get(id), r = rangeOf.get(id)
    const base = d || r
    const today = tally(d)
    const span = period === 'today' ? today : tally(r)
    return { id, name: base.name, role: base.role, duty: base.duty, gone: base.gone, holding: d?.holding || 0, today, span, daily: r?.daily || [] }
  })
    // Agents always have a card: an empty one is the finding. The owner and
    // managers appear when they did something themselves.
    .filter(c => c.role === 'agent' || c.span.effort > 0 || c.today.effort > 0)
    // By name, so a person is in the same place every day; off duty and
    // people who have left go last.
    .sort((a, b) => ((a.gone || a.duty === 'OFF_DUTY') - (b.gone || b.duty === 'OFF_DUTY'))
      || String(a.name || '~').localeCompare(String(b.name || '~')))

  const ready = !!day && !!range
  return (
    <div className="tb">
      <div className="aw-top">
        {heading && <h2 className="aw-title">Team</h2>}
        {hasCalling && (
          <Segmented options={[{ value: 'leads', label: 'Leads' }, { value: 'calling', label: 'Calling' }]} value={side} onChange={setSide} />
        )}
        <span className="aw-actions"><Segmented options={PERIODS} value={period} onChange={setPeriod} /></span>
      </div>
      {!ready ? (
        <div className="tb-grid" aria-busy="true">{[0, 1, 2].map(i => <div key={i} className="tb-card tb-wait" />)}</div>
      ) : !cards.length ? (
        <div className="panel detail-empty">Nobody on this side yet.</div>
      ) : (
        <div className="tb-grid">
          {cards.map(c => {
            const off = c.gone || c.duty === 'OFF_DUTY'
            const attn = []
            if (c.today.missed) attn.push(`${fmt(c.today.missed)} missed ${fuWord(eff, c.today.missed)}`)
            if (eff === 'leads' && c.today.notCalled) attn.push(`${fmt(c.today.notCalled)} new ${word(c.today.notCalled, 'lead', 'leads')} not called`)
            // The fair rule for "no calls": after noon, an agent on duty who
            // holds records on this side.
            if (lateEnough && !c.today.calls && c.role === 'agent' && !off && c.holding > 0) attn.push('No calls yet today')
            // Only what happened: a row of zeros says nothing a blank does not.
            const closedN = c.span.n('status', final), visits = c.span.n('visit')
            const facts = [
              eff === 'leads' && visits > 0 && <span key="v"><b>{fmt(visits)}</b> {word(visits, 'site visit', 'site visits')}</span>,
              closedN > 0 && <span key="c"><b>{fmt(closedN)}</b> {closedWord(eff, final, closedN)}</span>,
              c.span.n('followup_done') > 0 && <span key="f"><b>{fmt(c.span.n('followup_done'))}</b> follow-ups done</span>,
            ].filter(Boolean)
            return (
              <button key={c.id} type="button" className={'tb-card' + (off ? ' off' : '')} onClick={() => onOpenPerson?.(c)}>
                <span className="tb-top">
                  <span className="tb-name">
                    {c.name || 'Someone who has left'}
                    {c.duty === 'OFF_DUTY' && <span className="tt-tag">Off duty</span>}
                  </span>
                  <span className="tb-calls">
                    <span><b>{fmt(c.span.calls)}</b> {word(c.span.calls, 'call', 'calls')}</span>
                    {c.span.calls > 0 && <em>{pct(c.span.pickedUp, c.span.calls)}% picked up</em>}
                  </span>
                </span>
                {range && <CallBars small from={range.from} to={range.today} daily={c.daily} />}
                {facts.length > 0 && <span className="tb-facts">{facts}</span>}
                <span className={'tb-attn' + (attn.length ? '' : ' ok')}>
                  {attn.length ? attn.map(a => <span key={a}>{a}</span>) : <span>Nothing left undone today</span>}
                </span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
