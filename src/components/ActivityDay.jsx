// ============================================================================
// WHAT SOMEBODY DID — "My day" for an agent, "Team today" for the desk
// ============================================================================
// Every number is counted by services/activityReport.ts from actions a person
// took, and every number opens the people behind it from the same query.
//
// WHO READS IT, and so what is on the first line:
//   • the owner, at a desk: who needs a word today. Each person is ONE row of
//     three answers (how much calling, what it moved, what is left undone)
//     and the rest waits behind a click. It was every count on one screen,
//     a sheet of numbers nobody could read in the time they had;
//   • the agent, on a phone: how my day is going and what I still owe.
//
// THE WORDS are a broker's and a school English reader's: "calls", "picked
// up", "missed follow-ups". No dashes, no product words. A call is a tap, so
// "picked up" only ever comes from an outcome somebody wrote down.
//
// A NUMBER IN RED IS SOMEBODY BEING TOLD OFF, so each has a fair rule, written
// once in the report's header: a follow-up is missed only once its day has
// ended, counted from the day it became theirs; a new lead counts as not
// called after an hour; "no calls" shows after noon, for agents on duty who
// hold records on that side.
//
// Leads | Calling is a switch beside the title, never both on one screen, and
// each side is its own set of facts: calls to leads, or calls to owners.
import { useEffect, useState } from 'react'
import { api } from '../lib/api.js'
import { useServerData } from '../lib/useServerData.js'
import { dayLabel, whenLabel } from '../lib/format.js'
import { Segmented } from './primitives.jsx'
import Icon from './Icon.jsx'
import { stageLabel } from '../data/pipelineRoles.js'

// ── Reading one person's counts ─────────────────────────────────────────────
const fmt = (n) => Number(n || 0).toLocaleString('en-IN')
const word = (n, one, many) => (n === 1 ? one : many)

/** What a call's written outcome says about whether anybody picked up. */
const REACH = [
  ['answered', 'picked up', 'picked up'],
  ['no_answer', 'did not pick up', 'did not pick up'],
  ['unreachable', 'busy or switched off', 'busy or switched off'],
  ['wrong_number', 'wrong number', 'wrong numbers'],
  ['no_outcome', 'result not written', 'result not written'],
]
const REACH_LABEL = Object.fromEntries(REACH.map(([k, one]) => [k, one]))

function tally(person) {
  const c = person?.counts || []
  const n = (measure, detail) => c.filter(x => x.measure === measure && (detail === undefined || x.detail === detail))
    .reduce((s, x) => s + x.n, 0)
  const statuses = c.filter(x => x.measure === 'status').sort((a, b) => b.n - a.n)
  return {
    n, statuses,
    calls: n('call'),
    pickedUp: n('call', 'answered'),
    people: c.find(x => x.measure === 'people')?.n || 0,
    missed: n('followup_missed'),
    dueToday: n('followup_today'),
    notCalled: n('came_in', 'not_called'),
    effort: n('call') + n('whatsapp') + n('note') + n('status') + n('visit') + n('followup_set') + n('followup_done'),
  }
}

const shiftDay = (ymd, by) => {
  const d = new Date(`${ymd}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + by)
  return d.toISOString().slice(0, 10)
}
const dayName = (day, today) => day === today ? 'Today' : day === shiftDay(today, -1) ? 'Yesterday' : dayLabel(day)

/** The side a person starts on: per viewer, per workspace, and only a convenience. */
function useSide(defaultSide) {
  const key = `crm_activity_side_${window.location.pathname.split('/')[1] || ''}`
  const [side, setSide] = useState(() => {
    try { return localStorage.getItem(key) || defaultSide } catch { return defaultSide }
  })
  const pick = (v) => { setSide(v); try { localStorage.setItem(key, v) } catch { /* private window */ } }
  return [side, pick]
}

function useDay({ side, date, person, dataAsOf }) {
  return useServerData(() => api.getActivity({ side, date, person }), [side, date, person, dataAsOf], null)
}

// ── The head: title and switch together, the day on the right ───────────────
function Head({ title, hasCalling, side, onSide, data, onDay, right }) {
  const day = data?.day
  return (
    <div className="ad-top">
      <span className="ad-title">{title}</span>
      {hasCalling && (
        <Segmented options={[{ value: 'leads', label: 'Leads' }, { value: 'calling', label: 'Calling' }]} value={side} onChange={onSide} />
      )}
      <span className="ad-top-r">
        {day && (
          <span className="ad-day">
            <button type="button" aria-label="Day before" onClick={() => onDay(shiftDay(day, -1))}><Icon name="chevLeft" size={15} /></button>
            <span className="ad-day-l">{dayName(day, data.today)}</span>
            <button type="button" aria-label="Day after" disabled={day >= data.today} onClick={() => onDay(shiftDay(day, 1))}><Icon name="chevRight" size={15} /></button>
          </span>
        )}
        {right}
      </span>
    </div>
  )
}

/** The follow-up word for this side. */
const fuWord = (side, n) => side === 'calling' ? word(n, 'callback', 'callbacks') : word(n, 'follow-up', 'follow-ups')

// ── The detail: everything counted, in small blocks, zeros left out ─────────
function Stat({ n, label, tone, onOpen }) {
  if (!n) return null
  return (
    <button type="button" className={'ad-stat' + (tone ? ` ${tone}` : '')} onClick={onOpen}>
      <b>{fmt(n)}</b><span>{label}</span>
    </button>
  )
}

function Block({ title, children }) {
  const shown = [children].flat(2).filter(el => el && el.props?.n > 0)
  if (!shown.length) return null
  return (
    <div className="ad-block">
      <div className="ad-block-t">{title}</div>
      <div className="ad-block-s">{shown}</div>
    </div>
  )
}

function Detail({ t, side, isToday, open, book, onBook, hideMoved }) {
  const { n } = t
  const fu = side === 'calling' ? 'Callbacks' : 'Follow-ups'
  return (
    <div className="ad-detail">
      <Block title="Calls">
        <Stat key="all" n={t.calls} label={word(t.calls, 'call', 'calls')} onOpen={() => open('call')} />
        <Stat key="ppl" n={t.people} label={word(t.people, 'person called', 'people called')} onOpen={() => open('people')} />
        {REACH.map(([k, one, many]) => (
          <Stat key={k} n={n('call', k)} label={n('call', k) === 1 ? one : many} tone={k === 'no_outcome' ? 'quiet' : ''} onOpen={() => open('call', k)} />
        ))}
      </Block>
      {!hideMoved && <Block title="Moved to">
        {t.statuses.map(s => <Stat key={s.detail} n={s.n} label={stageLabel(s.detail)} onOpen={() => open('status', s.detail)} />)}
      </Block>}
      <Block title="Other work">
        <Stat key="w" n={n('whatsapp')} label={word(n('whatsapp'), 'WhatsApp', 'WhatsApps')} onOpen={() => open('whatsapp')} />
        <Stat key="n" n={n('note')} label={word(n('note'), 'note', 'notes')} onOpen={() => open('note')} />
        {side === 'leads' && <Stat key="v" n={n('visit')} label={word(n('visit'), 'site visit', 'site visits')} onOpen={() => open('visit')} />}
      </Block>
      <Block title={fu}>
        <Stat key="s" n={n('followup_set')} label="booked" onOpen={() => open('followup_set')} />
        {side === 'leads' && <Stat key="d" n={n('followup_done')} label="done" onOpen={() => open('followup_done')} />}
        {isToday && <Stat key="t" n={t.dueToday} label="due today" onOpen={() => open('followup_today')} />}
        {isToday && <Stat key="m" n={t.missed} label="missed" tone="alert" onOpen={() => open('followup_missed')} />}
        {isToday && <Stat key="x" n={n('followup_tomorrow')} label="due tomorrow" onOpen={() => open('followup_tomorrow')} />}
      </Block>
      {side === 'leads' && (
        <Block title="New leads">
          <Stat key="i" n={n('came_in')} label="came in" onOpen={() => open('came_in')} />
          <Stat key="c" n={n('came_in', 'called')} label="called" onOpen={() => open('came_in', 'called')} />
          <Stat key="j" n={n('came_in', 'just_in')} label="just came in" onOpen={() => open('came_in', 'just_in')} />
          <Stat key="x" n={t.notCalled} label="not called" tone="alert" onOpen={() => open('came_in', 'not_called')} />
        </Block>
      )}
      {book && side === 'leads' && (
        <Block title="Holds now">
          <Stat key="o" n={book.open} label="open leads" onOpen={() => onBook?.(null)} />
          <Stat key="n" n={book.neverContacted} label="never contacted" tone="alert" onOpen={() => onBook?.('never_contacted')} />
          <Stat key="c" n={book.coldToday} label="went cold today" tone="alert" onOpen={() => onBook?.('going_cold')} />
        </Block>
      )}
      {book && side === 'calling' && book.owners > 0 && (
        <div className="ad-block">
          <div className="ad-block-t">Holds now</div>
          <div className="ad-block-s"><span className="ad-stat static"><b>{fmt(book.owners)}</b><span>on the calling list</span></span></div>
        </div>
      )}
    </div>
  )
}

/** Titles for the list a number opens. */
const MEASURE_TITLE = {
  call: 'Calls', people: 'People called', whatsapp: 'WhatsApps', note: 'Notes', visit: 'Site visits',
  status: 'Moved to', followup_set: 'Booked', followup_done: 'Done', followup_missed: 'Missed',
  followup_today: 'Due today', followup_tomorrow: 'Due tomorrow', came_in: 'New leads',
}
const DETAIL_TITLE = {
  ...REACH_LABEL, called: 'called', not_called: 'not called', just_in: 'just came in',
}
const titleOf = (parts) => parts.filter(Boolean).join(', ')

// ── My day ──────────────────────────────────────────────────────────────────
/**
 * "My day": the person's own work. Phone first, top of Today; also the
 * dashboard's panel for an agent at a desk. Four tiles answer "how is it
 * going and what do I still owe"; the rest opens under "Everything".
 */
export function MyDay({ store, hasCalling, defaultSide = 'leads', variant }) {
  const { state } = store
  const [side, setSide] = useSide(hasCalling ? defaultSide : 'leads')
  const [date, setDate] = useState(null)
  const [more, setMore] = useState(false)
  const eff = hasCalling ? side : 'leads'
  const me = state.activeAgentId || state.session?.userId || null
  const { data } = useDay({ side: eff, date, person: me, dataAsOf: state.dataAsOf })
  const t = tally((data?.people || []).find(p => p.id === me))
  const isToday = !data || data.day === data.today
  const open = (measure, detail) => store.openModal({
    kind: 'activityRecords', side: eff, date: data?.day, person: me, measure, detail,
    title: titleOf([dayName(data?.day, data?.today), MEASURE_TITLE[measure], DETAIL_TITLE[detail] || (measure === 'status' ? stageLabel(detail) : '')]),
  })
  const moved = t.statuses.slice(0, 3)
  return (
    <section className={'ad ad-me' + (variant ? ` ad-${variant}` : '')}>
      <Head title="My day" hasCalling={hasCalling} side={side} onSide={setSide} data={data}
        onDay={(d) => setDate(d === data?.today ? null : d)} />
      {!data ? <div className="ad-wait" aria-busy="true" /> : (
        <>
          <div className="ad-tiles">
            <button type="button" className="ad-tile" onClick={() => open('call')}>
              <b>{fmt(t.calls)}</b><span>{word(t.calls, 'call', 'calls')}</span>
              {t.calls > 0 && <em>{fmt(t.pickedUp)} picked up</em>}
            </button>
            {isToday && (
              <button type="button" className="ad-tile" onClick={() => open('followup_today')}>
                <b>{fmt(t.dueToday)}</b><span>{fuWord(eff, t.dueToday)} due today</span>
              </button>
            )}
            {isToday && (
              <button type="button" className={'ad-tile' + (t.missed ? ' alert' : '')} onClick={() => open('followup_missed')}>
                <b>{fmt(t.missed)}</b><span>missed {fuWord(eff, t.missed)}</span>
              </button>
            )}
            {eff === 'leads' && (
              <button type="button" className={'ad-tile' + (t.notCalled ? ' alert' : '')} onClick={() => open('came_in', 'not_called')}>
                <b>{fmt(t.notCalled)}</b><span>new {word(t.notCalled, 'lead', 'leads')} not called</span>
              </button>
            )}
          </div>
          <div className="ad-moved">
            <span className="ad-moved-t">Moved to</span>
            {moved.length
              ? moved.map(s => <button key={s.detail} type="button" onClick={() => open('status', s.detail)}><b>{s.n}</b> {stageLabel(s.detail)}</button>)
              : <span className="ad-quiet">No change yet</span>}
            <button type="button" className="ad-more" onClick={() => setMore(m => !m)}>
              {more ? 'Less' : 'Everything'}<Icon name={more ? 'chevUp' : 'chevDown'} size={13} />
            </button>
          </div>
          {more && <Detail t={t} side={eff} isToday={isToday} open={open} hideMoved />}
        </>
      )}
    </section>
  )
}

// ── Team today ──────────────────────────────────────────────────────────────
/** One person's row: calls, what moved, what is left undone. */
function TeamRow({ r, side, isToday, lateEnough, onClick, expanded, actions }) {
  const t = r.t
  // "No calls" is only said out loud when it is fair to: an agent on duty who
  // holds records on this side, after noon (or on a past day).
  const quietFair = lateEnough && r.role === 'agent' && !r.gone && r.duty !== 'OFF_DUTY' && r.holding > 0
  const moved = t.statuses.slice(0, 2)
  const movedMore = t.statuses.length - moved.length
  const attn = []
  if (isToday && t.missed) attn.push(`${fmt(t.missed)} missed ${fuWord(side, t.missed)}`)
  if (side === 'leads' && t.notCalled) attn.push(`${fmt(t.notCalled)} new ${word(t.notCalled, 'lead', 'leads')} not called`)
  const share = t.calls ? Math.round((t.pickedUp / t.calls) * 100) : 0
  return (
    <div className={'tt-row' + (expanded ? ' open' : '') + (r.gone || r.duty === 'OFF_DUTY' ? ' off' : '')}>
      <button type="button" className="tt-main" onClick={onClick} aria-expanded={expanded}>
        <span className="tt-name">
          {r.name || 'Someone who has left'}
          {r.duty === 'OFF_DUTY' && <span className="tt-tag">Off duty</span>}
        </span>
        <span className="tt-calls">
          {t.calls ? (
            <>
              <span><b>{fmt(t.calls)}</b> {word(t.calls, 'call', 'calls')}<span className="tt-sub"> · {fmt(t.pickedUp)} picked up</span></span>
              <span className="tt-bar" aria-hidden="true"><i style={{ width: `${share}%` }} /></span>
            </>
          ) : <span className={quietFair && !t.n('whatsapp') ? 'tt-alert' : 'ad-quiet'}>{isToday ? 'No calls yet' : 'No calls'}</span>}
        </span>
        <span className="tt-moved">
          {moved.length
            ? <>{moved.map(s => `${s.n} ${stageLabel(s.detail)}`).join(', ')}{movedMore > 0 && <span className="ad-quiet"> +{movedMore} more</span>}</>
            : <span className="ad-quiet">No change</span>}
        </span>
        <span className="tt-attn">
          {attn.map(a => <span key={a}>{a}</span>)}
        </span>
      </button>
      {/* The slot is there on every row that could have an action, so the
          columns line up whether or not this person has one. */}
      {actions && <span className="tt-act">{!r.gone && actions(r)}</span>}
    </div>
  )
}

/**
 * "Team today": one row per person, the same rows on the dashboard and on the
 * Team page. The Team page's rows open to the detail (every count, each
 * opening its people) and carry Reassign; the dashboard's open the Team page.
 */
export function TeamToday({ store, hasCalling, compact = false, onOpenFull, actions, book = {}, ownerBook = {}, onBook }) {
  const { state } = store
  const [side, setSide] = useSide('leads')
  const [date, setDate] = useState(null)
  const [openId, setOpenId] = useState(null)
  const eff = hasCalling ? side : 'leads'
  const { data } = useDay({ side: eff, date, person: null, dataAsOf: state.dataAsOf })

  const isToday = !data || data.day === data.today
  const lateEnough = !!data && (!isToday || data.hour >= 12)
  const rows = (data?.people || [])
    .map(p => ({ ...p, t: tally(p) }))
    // Agents always have a row: an empty one is the finding. The owner and
    // managers appear on a day they did something themselves.
    .filter(p => p.role === 'agent' || p.t.effort > 0)
    // By name, so a person is in the same place every day; off duty and
    // people who have left go last.
    .sort((a, b) => ((a.gone || a.duty === 'OFF_DUTY') - (b.gone || b.duty === 'OFF_DUTY'))
      || String(a.name || '~').localeCompare(String(b.name || '~')))

  const openFor = (r) => (measure, detail) => store.openModal({
    kind: 'activityRecords', side: eff, date: data?.day, person: r.id, measure, detail,
    title: titleOf([r.name, dayName(data?.day, data?.today), MEASURE_TITLE[measure], DETAIL_TITLE[detail] || (measure === 'status' ? stageLabel(detail) : '')]),
  })

  return (
    <section className={'ad ad-team' + (compact ? ' ad-compact' : '')}>
      <Head title={isToday ? 'Team today' : 'Team'} hasCalling={hasCalling} side={side} onSide={setSide} data={data}
        onDay={(d) => setDate(d === data?.today ? null : d)}
        right={compact && onOpenFull && <button type="button" className="ad-open" onClick={onOpenFull}>Open<Icon name="chevRight" size={14} /></button>} />
      {!data ? <div className="ad-wait" aria-busy="true" /> : (
        <div className="tt">
          <div className="tt-head" aria-hidden="true">
            <span>Person</span><span>Calls</span><span>Moved to</span><span>Needs attention</span>
          </div>
          {rows.map(r => {
            const expanded = !compact && openId === r.id
            return (
              <div key={r.id}>
                <TeamRow r={r} side={eff} isToday={isToday} lateEnough={lateEnough}
                  expanded={expanded} actions={compact ? null : actions}
                  onClick={compact ? onOpenFull : () => setOpenId(expanded ? null : r.id)} />
                {expanded && (
                  <Detail t={r.t} side={eff} isToday={isToday} open={openFor(r)}
                    book={eff === 'calling' ? ownerBook[r.id] : book[r.id]}
                    onBook={(seg) => onBook?.(r.id, eff, seg)} />
                )}
              </div>
            )
          })}
          {!rows.length && <div className="detail-empty">Nobody on this side.</div>}
        </div>
      )}
    </section>
  )
}

// ── The people behind a number ──────────────────────────────────────────────
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
      {rows === null ? <div className="ad-wait" aria-busy="true" />
        : !rows.length ? <div className="detail-empty">Nobody.</div>
          : (
            <div className="ad-list">
              {rows.map((r, i) => (
                <button key={`${r.id}-${i}`} type="button" className="ad-row" onClick={() => openRecord(r)}>
                  <span className="ad-row-main">
                    <span className="ad-row-name">{r.name || r.phone || 'No name'}</span>
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
