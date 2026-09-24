// ============================================================================
// WHAT SOMEBODY DID — "My day" for an agent, "Team today" for the desk
// ============================================================================
// Every number is counted by services/activityReport.ts from actions a person
// took, and every number opens the people behind it from the same query. The
// rules for the words are in docs/specs/mahalaxmi-batch.md ("Agent activity —
// the business first"); the ones that shape this file:
//
//   • broker's verbs, never product words — "calls", "notes", "site visits";
//   • a call is a tap, so "answered" only ever comes from a written outcome,
//     and calls with none are counted out loud;
//   • a status change reads as what the customer now is — "4 Interested";
//   • Leads | Calling is a switch, never both on one screen.
import { useEffect, useState } from 'react'
import { api } from '../lib/api.js'
import { useServerData } from '../lib/useServerData.js'
import { dayLabel, whenLabel } from '../lib/format.js'
import { Segmented } from './primitives.jsx'
import Icon from './Icon.jsx'
import { stageLabel } from '../data/pipelineRoles.js'

// ── Words ───────────────────────────────────────────────────────────────────
const plural = (n, one, many) => `${n.toLocaleString('en-IN')} ${n === 1 ? one : many}`

/** What a call's written outcome says about whether anybody picked up. */
const REACH_WORDS = [
  ['answered', 'answered', 'answered'],
  ['no_answer', 'not received', 'not received'],
  ['unreachable', 'busy or off', 'busy or off'],
  ['wrong_number', 'wrong number', 'wrong numbers'],
  ['no_outcome', 'no outcome written', 'no outcome written'],
]

/** Title for the list a number opens. */
const MEASURE_TITLE = {
  call: 'Calls', people: 'People called', whatsapp: 'WhatsApps', note: 'Notes', visit: 'Site visits',
  status: 'Now', followup_set: 'Booked', followup_done: 'Done', followup_late: 'Late', followup_tomorrow: 'Due tomorrow',
  came_in: 'Came in',
}
const DETAIL_TITLE = {
  answered: 'answered', no_answer: 'not received', unreachable: 'busy or off', wrong_number: 'wrong number',
  no_outcome: 'no outcome written', called: 'called', not_called: 'not called yet',
}

// ── Reading one person's counts ─────────────────────────────────────────────
function tally(person) {
  const c = person?.counts || []
  const n = (measure, detail) => c.filter(x => x.measure === measure && (detail === undefined || x.detail === detail))
    .reduce((s, x) => s + x.n, 0)
  const statuses = c.filter(x => x.measure === 'status').sort((a, b) => b.n - a.n)
  return { n, statuses }
}

const shiftDay = (ymd, by) => {
  const d = new Date(`${ymd}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + by)
  return d.toISOString().slice(0, 10)
}
const dayName = (day, today) => day === today ? 'Today' : day === shiftDay(today, -1) ? 'Yesterday' : dayLabel(day)

/** The side a person starts on — per viewer, per workspace, and only a convenience. */
function useSide(defaultSide) {
  const key = `crm_activity_side_${window.location.pathname.split('/')[1] || ''}`
  const [side, setSide] = useState(() => {
    try { return localStorage.getItem(key) || defaultSide } catch { return defaultSide }
  })
  const pick = (v) => { setSide(v); try { localStorage.setItem(key, v) } catch { /* private window */ } }
  return [side, pick]
}

function DayStepper({ day, today, onDay }) {
  if (!day) return null
  return (
    <span className="ad-day">
      <button type="button" aria-label="Day before" onClick={() => onDay(shiftDay(day, -1))}><Icon name="chevLeft" size={15} /></button>
      <span className="ad-day-l">{dayName(day, today)}</span>
      <button type="button" aria-label="Day after" disabled={day >= today} onClick={() => onDay(shiftDay(day, 1))}><Icon name="chevRight" size={15} /></button>
    </span>
  )
}

/** A number and its word, opening the people behind it. Zero is not a link. */
function Num({ n, children, onOpen, tone, pre, joined }) {
  if (!n) return null
  return (
    <button type="button" className={'ad-num' + (tone ? ` ${tone}` : '') + (joined ? ' joined' : '')} onClick={onOpen}>
      {pre && `${pre} `}<b>{n.toLocaleString('en-IN')}</b> {children}
    </button>
  )
}

function Line({ head, children }) {
  // A Num with nothing to count renders nothing, but its element is still
  // truthy — so a line of zeroes kept its heading. Counted by what shows.
  const items = [children].flat(3).filter(el => el && (el.type !== Num || el.props.n > 0))
  if (!items.length) return null
  return (
    <div className="ad-line">
      <span className="ad-head">{head}</span>
      <span className="ad-items">{items}</span>
    </div>
  )
}

// ── The day, for one person ─────────────────────────────────────────────────
function DayLines({ person, side, isToday, open, hideCalls }) {
  const { n, statuses } = tally(person)
  const calls = n('call')
  return (
    <>
      {!hideCalls && <Line head="Calls">
        {calls
          ? <button key="c" type="button" className="ad-num" onClick={() => open('call')}><b>{calls}</b> {calls === 1 ? 'call' : 'calls'}</button>
          : <span key="c0" className="ad-zero">0 calls</span>}
        {calls > 0 && person.people > 0 && (
          <Num key="p" n={person.people} pre="to" joined onOpen={() => open('people')}>{person.people === 1 ? 'person' : 'people'}</Num>
        )}
        {REACH_WORDS.map(([k, one, many]) => (
          <Num key={k} n={n('call', k)} tone={k === 'no_outcome' ? 'quiet' : ''}
            onOpen={() => open('call', k)}>{n('call', k) === 1 ? one : many}</Num>
        ))}
      </Line>}
      <Line head="Also">
        <Num key="w" n={n('whatsapp')} onOpen={() => open('whatsapp')}>{n('whatsapp') === 1 ? 'WhatsApp' : 'WhatsApps'}</Num>
        <Num key="n" n={n('note')} onOpen={() => open('note')}>{n('note') === 1 ? 'note' : 'notes'}</Num>
        {side === 'leads' && <Num key="v" n={n('visit')} onOpen={() => open('visit')}>{n('visit') === 1 ? 'site visit' : 'site visits'}</Num>}
      </Line>
      <Line head="Now">
        {statuses.map(s => (
          <Num key={s.detail} n={s.n} onOpen={() => open('status', s.detail)}>{stageLabel(s.detail)}</Num>
        ))}
      </Line>
      <Line head={side === 'calling' ? 'Callbacks' : 'Follow-ups'}>
        <Num key="s" n={n('followup_set')} onOpen={() => open('followup_set')}>booked</Num>
        {side === 'leads' && <Num key="d" n={n('followup_done')} onOpen={() => open('followup_done')}>done</Num>}
        {isToday && <Num key="l" n={n('followup_late')} tone="alert" onOpen={() => open('followup_late')}>late</Num>}
        {isToday && <Num key="t" n={n('followup_tomorrow')} onOpen={() => open('followup_tomorrow')}>due tomorrow</Num>}
      </Line>
      {side === 'leads' && (
        <Line head="New">
          <Num key="i" n={n('came_in')} onOpen={() => open('came_in')}>came in</Num>
          <Num key="c" n={n('came_in', 'called')} onOpen={() => open('came_in', 'called')}>called</Num>
          <Num key="x" n={n('came_in', 'not_called')} tone="alert" onOpen={() => open('came_in', 'not_called')}>not called yet</Num>
        </Line>
      )}
    </>
  )
}

/** People called: the server's own count of distinct records behind the calls. */
function withPeople(p) {
  if (!p) return p
  return { ...p, people: (p.counts || []).find(x => x.measure === 'people')?.n || 0 }
}

function useDay({ side, date, person, dataAsOf }) {
  return useServerData(() => api.getActivity({ side, date, person }), [side, date, person, dataAsOf], null)
}

/**
 * "My day" — the person's own work. Phone first, top of Today; also the
 * dashboard's panel for an agent at a desk.
 */
export function MyDay({ store, hasCalling, defaultSide = 'leads', variant }) {
  const { state } = store
  const [side, setSide] = useSide(hasCalling ? defaultSide : 'leads')
  const [date, setDate] = useState(null)
  const me = state.activeAgentId || state.session?.userId || null
  const { data } = useDay({ side: hasCalling ? side : 'leads', date, person: me, dataAsOf: state.dataAsOf })
  const person = withPeople((data?.people || []).find(p => p.id === me))
  const isToday = !data || data.day === data.today
  const open = (measure, detail) => store.openModal({
    kind: 'activityRecords', side, date: data?.day, person: me, measure, detail,
    title: [dayName(data?.day, data?.today), MEASURE_TITLE[measure], DETAIL_TITLE[detail] || (measure === 'status' ? detail : '')].filter(Boolean).join(' · '),
  })
  return (
    <section className={'ad' + (variant ? ` ad-${variant}` : '')}>
      <div className="ad-top">
        <span className="ad-title">My day</span>
        <DayStepper day={data?.day} today={data?.today} onDay={(d) => setDate(d === data?.today ? null : d)} />
        {hasCalling && <Segmented options={[{ value: 'leads', label: 'Leads' }, { value: 'calling', label: 'Calling' }]} value={side} onChange={setSide} />}
      </div>
      {!data ? <div className="ad-line ad-wait" aria-busy="true" /> : <DayLines person={person} side={side} isToday={isToday} open={open} />}
    </section>
  )
}

// ── The desk ────────────────────────────────────────────────────────────────
const joinNames = (names) => names.length <= 1 ? names.join('')
  : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`

/**
 * Sentences that are TRUE today, and only those. Each names somebody a manager
 * can go and talk to; a warning that is not true is noise, and noise teaches
 * people to skip the panel. People with the same finding share one sentence —
 * four red lines saying one thing about four names was a wall, not a warning.
 */
function warnings(rows, data, side) {
  const out = []
  const isToday = data.day === data.today
  // Before noon "hasn't called" is true of everyone and says nothing.
  const lateEnough = !isToday || data.hour >= 12
  if (lateEnough) {
    const idle = rows.filter(r => r.role === 'agent' && !r.gone && r.duty !== 'OFF_DUTY' && r.holding > 0
      && !r.t.n('call') && !r.t.n('whatsapp'))
    if (idle.length) {
      // Named for the side it is about: somebody who spent the day ringing
      // leads has called people, just not these.
      const what = side === 'calling' ? 'anyone on the calling list' : 'a lead'
      const verb = !isToday ? "didn't" : idle.length === 1 ? "hasn't" : "haven't"
      out.push({ key: 'idle', text: `${joinNames(idle.map(r => r.name))} ${verb} called ${what}${isToday ? ' today' : ''}.` })
    }
  }
  if (side === 'leads') {
    const waiting = rows.map(r => ({ r, k: r.t.n('came_in', 'not_called') })).filter(x => x.k > 0).sort((a, b) => b.k - a.k)
    const total = waiting.reduce((s, x) => s + x.k, 0)
    if (total) {
      const who = waiting.slice(0, 2).map(x => `${x.k} with ${x.r.name || 'someone who has left'}`).join(', ')
      const verb = total === 1 ? "hasn't" : "haven't"
      out.push({ key: 'waiting', text: `${plural(total, 'enquiry', 'enquiries')} that came in ${isToday ? 'today' : 'that day'} ${verb} been called — ${who}.` })
    }
  }
  if (isToday) {
    const late = rows.map(r => ({ r, k: r.t.n('followup_late') })).filter(x => x.k >= 3).sort((a, b) => b.k - a.k)
    if (late.length) {
      const noun = side === 'calling' ? 'Callbacks' : 'Follow-ups'
      out.push({ key: 'late', text: `${noun} late — ${late.map(x => `${x.r.name || 'someone who has left'} ${x.k}`).join(', ')}.` })
    }
  }
  return out
}

/**
 * What a person HOLDS, beside what they did — the facts the dashboard's "By
 * agent" table carried: open, never contacted, went cold today. That was a
 * second per-person table next to this one; one person, one row, both halves.
 * Counted by the desk summary, and each opens that person's list on that pile.
 */
function Holds({ side, book, onBook }) {
  if (!book) return null
  if (side === 'calling') {
    return (
      // Not a link: the calling list's Agent filter is screen state, not the
      // URL, so it would land on everybody's rows with nothing saying whose.
      book.owners > 0 && (
        <div className="ad-line"><span className="ad-head">Holds</span>
          <span className="ad-items"><span className="ad-num" style={{ cursor: 'default' }}><b>{book.owners.toLocaleString('en-IN')}</b> on the calling list</span></span></div>
      )
    )
  }
  return (
    <Line head="Holds">
      <Num key="o" n={book.open} onOpen={() => onBook?.(null)}>open</Num>
      <Num key="n" n={book.neverContacted} tone="alert" onOpen={() => onBook?.('never_contacted')}>not contacted</Num>
      <Num key="c" n={book.coldToday} tone="alert" onOpen={() => onBook?.('going_cold')}>went cold today</Num>
    </Line>
  )
}

/** The day in one line, for the dashboard. */
function Summary({ r, side, isToday }) {
  const { n, statuses } = r.t
  const bits = []
  const calls = n('call')
  if (calls) bits.push(`${plural(calls, 'call', 'calls')} to ${plural(r.people, 'person', 'people')}`)
  if (n('call', 'answered')) bits.push(`${n('call', 'answered')} answered`)
  if (statuses.length) bits.push(statuses.slice(0, 3).map(s => `${s.n} ${stageLabel(s.detail)}`).join(' · '))
  if (n('whatsapp')) bits.push(plural(n('whatsapp'), 'WhatsApp', 'WhatsApps'))
  const late = isToday ? n('followup_late') : 0
  const waiting = side === 'leads' ? n('came_in', 'not_called') : 0
  return (
    <span className="ad-sum">
      <span className={bits.length ? '' : 'ad-zero'}>{bits.length ? bits.join(' · ') : (isToday ? 'Nothing yet today' : 'Nothing that day')}</span>
      {late > 0 && <span className="ad-sum-flag">{late} late</span>}
      {waiting > 0 && <span className="ad-sum-flag">{waiting} new not called</span>}
    </span>
  )
}

/**
 * "Team today" — a row per person, in the same words as My day.
 *
 * Two densities, one component. The Team page is the full version: each
 * person's day line by line, every number opening its people, what they hold,
 * and the row's own action (Reassign). The dashboard's is `compact`: the true
 * sentences, then one line per person, and anything on it opens the Team page.
 *
 * It was a ten-column grid of numbers — built from what the report counts, not
 * from how it was agreed to read — which on a quiet morning was a sheet of
 * zeroes under a stack of red lines.
 */
export function TeamToday({ store, hasCalling, compact = false, onOpenFull, actions, book = {}, ownerBook = {}, onBook }) {
  const { state } = store
  const [side, setSide] = useSide('leads')
  const [date, setDate] = useState(null)
  const eff = hasCalling ? side : 'leads'
  const { data } = useDay({ side: eff, date, person: null, dataAsOf: state.dataAsOf })

  const isToday = !data || data.day === data.today
  const effort = (r) => r.t.n('call') + r.t.n('whatsapp') + r.t.n('note') + r.t.n('status') + r.t.n('visit')
    + r.t.n('followup_set') + r.t.n('followup_done')
  const rows = (data?.people || [])
    .map(withPeople)
    .map(p => ({ ...p, t: tally(p) }))
    // Agents always have a row — an empty one is the finding. The owner and
    // managers appear on a day they did something themselves.
    .filter(p => p.role === 'agent' || effort(p) > 0)
  // Who did most first; nobody-yet at the bottom, by name.
  const sorted = [...rows].sort((a, b) => effort(b) - effort(a) || String(a.name).localeCompare(String(b.name)))

  const openFor = (r) => (measure, detail) => {
    if (compact) { onOpenFull?.(); return }
    store.openModal({
      kind: 'activityRecords', side: eff, date: data?.day, person: r.id, measure, detail,
      title: [r.name, dayName(data?.day, data?.today), MEASURE_TITLE[measure], DETAIL_TITLE[detail] || (measure === 'status' ? detail : '')].filter(Boolean).join(' · '),
    })
  }
  const ws = data ? warnings(rows, data, eff) : []

  return (
    <section className={'ad ad-team' + (compact ? ' ad-compact' : '')}>
      <div className="ad-top">
        <span className="ad-title">{isToday ? 'Team today' : 'Team'}</span>
        <DayStepper day={data?.day} today={data?.today} onDay={(d) => setDate(d === data?.today ? null : d)} />
        {hasCalling && <Segmented options={[{ value: 'leads', label: 'Leads' }, { value: 'calling', label: 'Calling' }]} value={side} onChange={setSide} />}
        {compact && onOpenFull && <button type="button" className="ad-open" onClick={onOpenFull}>Open<Icon name="chevRight" size={14} /></button>}
      </div>
      {ws.length > 0 && (
        <ul className="ad-warns">
          {ws.map(w => <li key={w.key}>{w.text}</li>)}
        </ul>
      )}
      {!data ? <div className="ad-line ad-wait" aria-busy="true" /> : (
        <div className="ad-people">
          {sorted.map(r => (
            compact ? (
              <button key={r.id} type="button" className="ad-person ad-person-c" onClick={onOpenFull}>
                <span className="ad-pname">{r.name || 'Someone who has left'}</span>
                <Summary r={r} side={eff} isToday={isToday} />
              </button>
            ) : (
              <div key={r.id} className={'ad-person' + (r.gone || r.duty === 'OFF_DUTY' ? ' off' : '')}>
                <div className="ad-pside">
                  <span className="ad-pname">{r.name || 'Someone who has left'}</span>
                  {r.duty === 'OFF_DUTY' && <span className="rst-tag off">Off duty</span>}
                  {actions && !r.gone && <span className="ad-pact">{actions(r)}</span>}
                </div>
                <div className="ad-plines">
                  {effort(r) === 0 && (
                    <div className="ad-line"><span className="ad-head">Today</span>
                      <span className="ad-zero">{isToday ? 'Nothing yet today' : 'Nothing that day'}</span></div>
                  )}
                  {effort(r) > 0
                    ? <DayLines person={r} side={eff} isToday={isToday} open={openFor(r)} />
                    : <DayLines person={{ ...r, counts: (r.counts || []).filter(c => ['followup_late', 'followup_tomorrow', 'came_in'].includes(c.measure)) }}
                        side={eff} isToday={isToday} open={openFor(r)} hideCalls />}
                  <Holds side={eff} book={eff === 'calling' ? ownerBook[r.id] : book[r.id]} onBook={(seg) => onBook?.(r.id, eff, seg)} />
                </div>
              </div>
            )
          ))}
          {!sorted.length && <div className="detail-empty">Nobody on this side.</div>}
        </div>
      )}
    </section>
  )
}

// ── The people behind a number ──────────────────────────────────────────────
const REACH_LABEL = Object.fromEntries(REACH_WORDS.map(([k, one]) => [k, one]))

export function ActivityRecords({ store, go, side, date, person, measure, detail, title, Modal }) {
  const [rows, setRows] = useState(null)
  useEffect(() => {
    let live = true
    // "People called" is the calls, one line per person.
    api.getActivityRecords({ side, date, person, measure: measure === 'people' ? 'call' : measure, detail })
      .then(r => {
        if (!live) return
        let list = r?.records || []
        if (measure === 'people') {
          const seen = new Set()
          list = list.filter(x => (seen.has(x.id) ? false : seen.add(x.id)))
        }
        setRows(list)
      })
      .catch(() => { if (live) setRows([]) })
    return () => { live = false }
  }, [side, date, person, measure, detail])

  const openRecord = (r) => {
    store.closeModal()
    if (side === 'calling') go('calling', { ownerId: r.id, ownerOpen: true })
    else go('leads', { leadId: r.id, leadOpen: true })
  }
  const what = (r) => {
    if (r.measure === 'call') return REACH_LABEL[r.detail] || ''
    if (r.measure === 'status') return stageLabel(r.detail)
    if (r.measure === 'came_in') return DETAIL_TITLE[r.detail] || ''
    return ''
  }

  return (
    <Modal title={title} onClose={store.closeModal} width={520}>
      {rows === null ? <div className="ad-line ad-wait" aria-busy="true" />
        : !rows.length ? <div className="detail-empty">Nobody.</div>
          : (
            <div className="ad-list">
              {rows.map((r, i) => (
                <button key={`${r.id}-${i}`} type="button" className="ad-row" onClick={() => openRecord(r)}>
                  <span className="ad-row-main">
                    <span className="ad-row-name">{r.name || r.phone || 'Unnamed'}</span>
                    <span className="ad-row-sub">{[r.unit, what(r)].filter(Boolean).join(' · ') || r.phone}</span>
                  </span>
                  <span className="ad-row-at">{r.at ? whenLabel(r.at) : ''}</span>
                </button>
              ))}
            </div>
          )}
    </Modal>
  )
}
