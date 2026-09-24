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
function Num({ n, children, onOpen, tone }) {
  if (!n) return null
  return (
    <button type="button" className={'ad-num' + (tone ? ` ${tone}` : '')} onClick={onOpen}>
      <b>{n.toLocaleString('en-IN')}</b> {children}
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
function DayLines({ person, side, isToday, open }) {
  const { n, statuses } = tally(person)
  const calls = n('call')
  return (
    <>
      <Line head="Calls">
        {calls
          ? <button key="c" type="button" className="ad-num" onClick={() => open('call')}><b>{calls}</b> {calls === 1 ? 'call' : 'calls'}</button>
          : <span key="c0" className="ad-zero">0 calls</span>}
        {calls > 0 && person.people > 0 && (
          <Num key="p" n={person.people} onOpen={() => open('people')}>{person.people === 1 ? 'person' : 'people'}</Num>
        )}
        {REACH_WORDS.map(([k, one, many]) => (
          <Num key={k} n={n('call', k)} tone={k === 'no_outcome' ? 'quiet' : ''}
            onOpen={() => open('call', k)}>{n('call', k) === 1 ? one : many}</Num>
        ))}
      </Line>
      <Line head="Also">
        <Num key="w" n={n('whatsapp')} onOpen={() => open('whatsapp')}>{n('whatsapp') === 1 ? 'WhatsApp' : 'WhatsApps'}</Num>
        <Num key="n" n={n('note')} onOpen={() => open('note')}>{n('note') === 1 ? 'note' : 'notes'}</Num>
        {side === 'leads' && <Num key="v" n={n('visit')} onOpen={() => open('visit')}>{n('visit') === 1 ? 'site visit' : 'site visits'}</Num>}
      </Line>
      <Line head="Now">
        {statuses.map(s => (
          <Num key={s.detail} n={s.n} onOpen={() => open('status', s.detail)}>{s.detail}</Num>
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
/**
 * Sentences that are TRUE today, and only those. Each names somebody a manager
 * can go and talk to; a warning that is not true is noise, and noise teaches
 * people to skip the panel.
 */
function warnings(rows, data, side) {
  const out = []
  const isToday = data.day === data.today
  // Before noon "hasn't made a call" is true of everyone and says nothing.
  const lateEnough = !isToday || data.hour >= 12
  const agents = rows.filter(r => r.role === 'agent' && !r.gone && r.duty !== 'OFF_DUTY' && r.holding > 0)
  if (lateEnough) {
    for (const r of agents) {
      if (!r.t.n('call') && !r.t.n('whatsapp')) {
        // Named for the side it is about. "Hasn't made a call" on the Calling
        // side was false for somebody who had spent the day ringing leads.
        const what = side === 'calling' ? 'anyone on the calling list' : 'a lead'
        out.push({ key: `idle-${r.id}`, text: isToday ? `${r.name} hasn't called ${what} today.` : `${r.name} didn't call ${what}.` })
      }
    }
  }
  if (side === 'leads') {
    const waiting = rows.map(r => ({ r, k: r.t.n('came_in', 'not_called') })).filter(x => x.k > 0).sort((a, b) => b.k - a.k)
    const total = waiting.reduce((s, x) => s + x.k, 0)
    if (total) {
      const who = waiting.slice(0, 2).map(x => `${x.k} with ${x.r.name || 'someone who has left'}`).join(', ')
      out.push({ key: 'waiting', text: `${plural(total, 'enquiry', 'enquiries')} that came in ${isToday ? 'today' : 'that day'} ${total === 1 ? "hasn't" : "haven't"} been called — ${who}.` })
    }
  }
  if (isToday) {
    for (const r of rows) {
      const late = r.t.n('followup_late')
      if (late >= 3) out.push({ key: `late-${r.id}`, text: `${r.name || 'Someone who has left'} has ${plural(late, side === 'calling' ? 'callback' : 'follow-up', side === 'calling' ? 'callbacks' : 'follow-ups')} late.` })
    }
  }
  return out
}

/** "Team today" — one row per person on the desk, the same words in columns. */
export function TeamToday({ store, hasCalling }) {
  const { state } = store
  const [side, setSide] = useSide('leads')
  const [date, setDate] = useState(null)
  const eff = hasCalling ? side : 'leads'
  const { data } = useDay({ side: eff, date, person: null, dataAsOf: state.dataAsOf })
  const [sort, setSort] = useState({ key: 'call', dir: -1 })

  const isToday = !data || data.day === data.today
  const rows = (data?.people || [])
    .map(withPeople)
    .map(p => ({ ...p, t: tally(p) }))
    // The owner and managers only appear on a day they did something; an
    // agent always does, because a row of zeroes is the finding.
    .filter(p => p.role === 'agent' || (p.counts || []).length)

  const cols = [
    { key: 'call', label: 'Calls', v: r => r.t.n('call') },
    { key: 'people', label: 'People', v: r => r.people || 0, measure: 'people' },
    { key: 'answered', label: 'Answered', v: r => r.t.n('call', 'answered'), measure: 'call', detail: 'answered' },
    { key: 'no_outcome', label: 'No outcome', v: r => r.t.n('call', 'no_outcome'), measure: 'call', detail: 'no_outcome' },
    { key: 'whatsapp', label: 'WhatsApps', v: r => r.t.n('whatsapp') },
    { key: 'note', label: 'Notes', v: r => r.t.n('note') },
    ...(eff === 'leads' ? [{ key: 'visit', label: 'Site visits', v: r => r.t.n('visit') }] : []),
    { key: 'status', label: 'Now', v: r => r.t.n('status') },
    ...(isToday ? [{ key: 'followup_late', label: 'Late', v: r => r.t.n('followup_late'), tone: 'alert' }] : []),
    ...(eff === 'leads' ? [{ key: 'not_called', label: 'New, not called', v: r => r.t.n('came_in', 'not_called'), measure: 'came_in', detail: 'not_called', tone: 'alert' }] : []),
  ]
  const col = cols.find(c => c.key === sort.key) || cols[0]
  const sorted = [...rows].sort((a, b) => (col.v(a) - col.v(b)) * sort.dir || String(a.name).localeCompare(String(b.name)))

  const open = (r, c, detail) => {
    const measure = c.measure || c.key
    const d = detail ?? c.detail
    store.openModal({
      kind: 'activityRecords', side: eff, date: data?.day, person: r.id, measure, detail: d,
      title: [r.name, dayName(data?.day, data?.today), MEASURE_TITLE[measure], DETAIL_TITLE[d] || (measure === 'status' ? d : '')].filter(Boolean).join(' · '),
    })
  }

  return (
    <section className="ad ad-team">
      <div className="ad-top">
        <span className="ad-title">{isToday ? 'Team today' : 'Team'}</span>
        <DayStepper day={data?.day} today={data?.today} onDay={(d) => setDate(d === data?.today ? null : d)} />
        {hasCalling && <Segmented options={[{ value: 'leads', label: 'Leads' }, { value: 'calling', label: 'Calling' }]} value={side} onChange={setSide} />}
      </div>
      {data && warnings(rows, data, eff).map(w => <div key={w.key} className="ad-warn">{w.text}</div>)}
      <div className="dt-wrap">
        <table className="dt ad-table">
          <thead>
            <tr>
              <th>Person</th>
              {cols.map(c => (
                <th key={c.key} className="dt-n">
                  <button type="button" className={'ad-sort' + (sort.key === c.key ? ' on' : '')}
                    onClick={() => setSort(s => ({ key: c.key, dir: s.key === c.key ? -s.dir : -1 }))}>{c.label}</button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map(r => (
              <tr key={r.id} className={r.gone || r.duty === 'OFF_DUTY' ? 'off' : ''}>
                <th scope="row"><span className="ad-who">{r.name || 'Someone who has left'}</span></th>
                {cols.map(c => {
                  const v = c.v(r)
                  return (
                    <td key={c.key} className="dt-n">
                      {c.key === 'status' && v > 0
                        ? <span className="ad-now">{r.t.statuses.map(s => (
                            <button key={s.detail} type="button" className="ad-num" onClick={() => open(r, c, s.detail)}><b>{s.n}</b> {s.detail}</button>
                          ))}</span>
                        : <button type="button" disabled={!v}
                            className={'dt-v' + (v > 0 && c.tone === 'alert' ? ' alert' : '') + (v === 0 ? ' zero' : '')}
                            onClick={() => open(r, c)}>{v}</button>}
                    </td>
                  )
                })}
              </tr>
            ))}
            {data && !sorted.length && (
              <tr><td colSpan={cols.length + 1} className="detail-empty">Nobody on this side.</td></tr>
            )}
          </tbody>
        </table>
      </div>
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
    if (r.measure === 'status') return r.detail
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
