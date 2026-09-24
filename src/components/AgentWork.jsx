// ============================================================================
// PERFORMANCE — the team, one agent, and an agent's own day
// ============================================================================
// THREE VIEWS OF THE SAME DAY, each a story told in the same order:
//
//   people contacted → how the calls went → what came of it → the rest → what
//   is still open
//
//   • TeamBoard, the owner or manager: the team's day, then one row per agent
//     to open, then what is still unresolved across the team.
//   • AgentWork mode="drill": one agent, opened from the team, the same story.
//   • AgentWork mode="self": "My work" on Today, the agent's own day and what
//     is pending with them. Simpler: no breakdown chart, no team.
//
// PEOPLE, NOT CALLS, lead. Three calls to one number is one person, and the
// contact status is per person (services/activityReport.ts `contactOf`):
// picked up if any call that day was answered, otherwise the last call. So the
// slices add up to the people contacted. Calls stay visible, never the headline.
//
// WHAT HAPPENED AND WHAT IS OPEN LOOK DIFFERENT. The report sections are plain
// panels; "Needs attention" / "Pending" is tinted, because it is a list of
// things to do rather than a record of things done. Not picking up is a
// contact status, not a failing, so it lives in the breakdown and only becomes
// "try again" on the agent's own list.
//
// Every number opens the people behind it (the same query), and a red number
// follows the fair rules in the report's header.
import { useState } from 'react'
import { api } from '../lib/api.js'
import { useServerData } from '../lib/useServerData.js'
import { Segmented } from './primitives.jsx'
import Icon from './Icon.jsx'
import { stageLabel } from '../data/pipelineRoles.js'
import { tally, fmt, word, fuWord, shiftDay, dayName, useSide, MEASURE_TITLE, DETAIL_TITLE, titleOf } from './ActivityDay.jsx'

// What a person's calls came to, in the order a manager reads it.
const CONTACT = [
  { key: 'answered', label: 'Picked up', color: '#2f7d54' },
  { key: 'no_answer', label: 'Did not pick up', color: '#c79a2b' },
  { key: 'unreachable', label: 'Busy or switched off', color: '#d27433' },
  { key: 'wrong_number', label: 'Wrong number', color: '#b23a3a' },
  { key: 'no_outcome', label: 'Result not written', color: '#a6ada9' },
  { key: 'other', label: 'Other', color: '#6f8090' },
]
const CONTACT_LABEL = Object.fromEntries(CONTACT.map(c => [c.key, c.label]))
const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0)

/** The team's day as one person: every count, summed. */
function teamTally(people) {
  // Merged by measure and detail, so "Interested" is one row, not one per agent.
  const merged = new Map()
  for (const c of people.flatMap(p => p.counts || [])) {
    const k = `${c.measure}|${c.detail ?? ''}`
    const m = merged.get(k) || { measure: c.measure, detail: c.detail, n: 0, records: 0 }
    m.n += c.n; m.records += c.records || 0
    merged.set(k, m)
  }
  return tally({ counts: [...merged.values()] })
}

/** Titles for the list a number opens. */
const listTitle = (who, day, measure, detail) => titleOf([
  who, dayName(day?.day, day?.today),
  measure === 'contact' ? (detail === 'retry' ? 'To try again' : CONTACT_LABEL[detail]) : MEASURE_TITLE[measure],
  measure === 'contact' ? '' : (DETAIL_TITLE[detail] || (measure === 'status' ? stageLabel(detail) : '')),
])

// ── The head: which side, which day ─────────────────────────────────────────
function Head({ title, hasCalling, side, onSide, day, onDay, actions }) {
  return (
    <div className="pv-head">
      {title && <h2 className="aw-title">{title}</h2>}
      {hasCalling && (
        <Segmented options={[{ value: 'leads', label: 'Leads' }, { value: 'calling', label: 'Calling' }]} value={side} onChange={onSide} />
      )}
      <span className="pv-head-r">
        {day && (
          <span className="ad-day pv-day">
            <button type="button" aria-label="Day before" onClick={() => onDay(shiftDay(day.day, -1))}><Icon name="chevLeft" size={15} /></button>
            <span className="ad-day-l">{dayName(day.day, day.today)}</span>
            <button type="button" aria-label="Day after" disabled={day.day >= day.today} onClick={() => onDay(shiftDay(day.day, 1))}><Icon name="chevRight" size={15} /></button>
          </span>
        )}
        {actions}
      </span>
    </div>
  )
}

function Section({ title, className = '', right, children }) {
  return (
    <section className={'panel pv-sec ' + className}>
      <div className="pv-sec-t"><span>{title}</span>{right}</div>
      {children}
    </section>
  )
}

// ── 1. The summary: people contacted first ──────────────────────────────────
function Summary({ t, open, self }) {
  const Fig = ({ n, label, onClick }) => (
    <button type="button" className="pv-fig" onClick={onClick}><b>{fmt(n)}</b><span>{label}</span></button>
  )
  return (
    <div className="pv-sum">
      <button type="button" className="pv-hero" onClick={() => open('people')}>
        <b>{fmt(t.people)}</b><span>{word(t.people, 'person', 'people')} contacted</span>
      </button>
      <div className="pv-figs">
        <Fig n={t.calls} label={word(t.calls, 'call', 'calls')} onClick={() => open('call')} />
        <Fig n={t.n('contact', 'answered')} label="picked up" onClick={() => open('contact', 'answered')} />
        {!self && <Fig n={t.n('followup_set')} label="follow-ups booked" onClick={() => open('followup_set')} />}
      </div>
    </div>
  )
}

// ── 2. How the calls went: one donut, contact status only ───────────────────
function ContactStatus({ t, open }) {
  const slices = CONTACT.map(c => ({ ...c, n: t.n('contact', c.key) })).filter(s => s.n > 0)
  const total = slices.reduce((s, x) => s + x.n, 0)
  if (!total) return <div className="detail-empty">Nobody was called.</div>
  const R = 46, C = 2 * Math.PI * R
  let at = 0
  return (
    <div className="pv-donut">
      <svg viewBox="0 0 120 120" className="pv-donut-svg" role="img" aria-label="How the calls went">
        <circle cx="60" cy="60" r={R} fill="none" stroke="var(--line-2)" strokeWidth="16" />
        {slices.map(s => {
          const len = (s.n / total) * C
          const el = (
            <circle key={s.key} cx="60" cy="60" r={R} fill="none" stroke={s.color} strokeWidth="16"
              strokeDasharray={`${len} ${C - len}`} strokeDashoffset={-at} transform="rotate(-90 60 60)" />
          )
          at += len
          return el
        })}
        <text x="60" y="58" textAnchor="middle" className="pv-donut-n">{fmt(total)}</text>
        <text x="60" y="74" textAnchor="middle" className="pv-donut-l">{word(total, 'person', 'people')}</text>
      </svg>
      <div className="pv-legend">
        {slices.map(s => (
          <button type="button" key={s.key} className="pv-leg" onClick={() => open('contact', s.key)}>
            <i style={{ background: s.color }} />
            <span className="pv-leg-l">{s.label}</span>
            <b>{fmt(s.n)}</b>
            <em>{pct(s.n, total)}%</em>
          </button>
        ))}
      </div>
    </div>
  )
}

// ── 3. What came of it: the statuses people were moved to ───────────────────
function Outcomes({ t, open }) {
  const rows = t.statuses
  if (!rows.length) return <div className="detail-empty">No one moved to a new status.</div>
  const max = Math.max(...rows.map(r => r.n))
  return (
    <div className="pv-out">
      {rows.map(r => (
        <button type="button" key={r.detail} className="pv-out-r" onClick={() => open('status', r.detail)}>
          <span className="pv-out-l">{stageLabel(r.detail)}</span>
          <span className="pv-out-bar"><i style={{ width: `${(r.n / max) * 100}%` }} /></span>
          <b>{fmt(r.n)}</b>
        </button>
      ))}
    </div>
  )
}

// ── 4. The rest of the day's work ───────────────────────────────────────────
function OtherActivity({ t, side, open }) {
  const items = [
    { n: t.n('whatsapp'), label: word(t.n('whatsapp'), 'WhatsApp', 'WhatsApps'), m: 'whatsapp' },
    { n: t.n('note'), label: word(t.n('note'), 'note', 'notes'), m: 'note' },
    ...(side === 'leads' ? [{ n: t.n('visit'), label: word(t.n('visit'), 'site visit', 'site visits'), m: 'visit' }] : []),
    { n: t.n('followup_set'), label: `${fuWord(side, t.n('followup_set'))} booked`, m: 'followup_set' },
    ...(side === 'leads' ? [{ n: t.n('followup_done'), label: `${word(t.n('followup_done'), 'follow-up', 'follow-ups')} done`, m: 'followup_done' }] : []),
  ]
  return (
    <div className="pv-other">
      {items.map(i => (
        <button type="button" key={i.m} className={'pv-other-i' + (i.n ? '' : ' zero')} onClick={() => i.n && open(i.m)} disabled={!i.n}>
          <b>{fmt(i.n)}</b><span>{i.label}</span>
        </button>
      ))}
    </div>
  )
}

// ── 5. What is still open, for one person ───────────────────────────────────
function Pending({ t, side, isToday, open, book, onBook }) {
  const rows = [
    side === 'leads' && book?.neverContacted > 0 && { n: book.neverContacted, label: 'Leads not yet contacted', tone: 'alert', go: () => onBook?.('never_contacted') },
    side === 'leads' && t.notCalled > 0 && { n: t.notCalled, label: 'New leads not called', tone: 'alert', go: () => open('came_in', 'not_called') },
    isToday && t.missed > 0 && { n: t.missed, label: `Missed ${fuWord(side, t.missed)}`, tone: 'alert', go: () => open('followup_missed') },
    isToday && t.dueToday > 0 && { n: t.dueToday, label: `${side === 'calling' ? 'Callbacks' : 'Follow-ups'} due today`, go: () => open('followup_today') },
    t.n('call', 'no_outcome') > 0 && { n: t.n('call', 'no_outcome'), label: 'Calls with no result written', go: () => open('call', 'no_outcome') },
    (t.n('contact', 'no_answer') + t.n('contact', 'unreachable')) > 0 && {
      n: t.n('contact', 'no_answer') + t.n('contact', 'unreachable'), label: 'People to try again', go: () => open('contact', 'retry'),
    },
  ].filter(Boolean)
  if (!rows.length) return <div className="pv-clear"><Icon name="check" size={15} />Nothing pending.</div>
  return (
    <div className="pv-pend">
      {rows.map(r => (
        <button type="button" key={r.label} className={'pv-pend-r' + (r.tone ? ` ${r.tone}` : '')} onClick={r.go}>
          <b>{fmt(r.n)}</b><span>{r.label}</span><Icon name="chevRight" size={15} className="pv-go" />
        </button>
      ))}
    </div>
  )
}

// ── One agent: their own day ("self") or opened from the team ("drill") ─────
export function AgentWork({ store, person, title, heading = true, mode = 'self', hasCalling, defaultSide = 'leads', book, ownerBook, onBook, actions }) {
  const { state } = store
  const [side, setSide] = useSide(hasCalling ? defaultSide : 'leads')
  const eff = hasCalling ? side : 'leads'
  const [date, setDate] = useState(null)
  const { data: day } = useServerData(
    () => api.getActivity({ side: eff, date, person }), [eff, date, person, state.dataAsOf], null)
  const me = (day?.people || []).find(p => p.id === person) || (day?.people || [])[0]
  const t = tally(me)
  const isToday = !day || day.day === day.today
  const self = mode === 'self'
  const open = (measure, detail) => store.openModal({
    kind: 'activityRecords', side: eff, date: day?.day, person, measure, detail,
    title: listTitle(self ? '' : title, day, measure, detail),
  })
  const b = eff === 'calling' ? ownerBook : book

  return (
    <div className="pv">
      <Head title={heading ? title : null} hasCalling={hasCalling} side={side} onSide={(v) => { setSide(v); setDate(null) }}
        day={day} onDay={(d) => setDate(d === day?.today ? null : d)} actions={actions} />
      {!day ? <div className="ad-wait tall" aria-busy="true" /> : (
        <>
          <Section title={self ? 'My performance' : 'Summary'}>
            <Summary t={t} open={open} self={self} />
            {self && t.statuses.length > 0 && (
              <div className="pv-moved">
                {t.statuses.slice(0, 4).map(s => (
                  <button type="button" key={s.detail} onClick={() => open('status', s.detail)}><b>{s.n}</b> {stageLabel(s.detail)}</button>
                ))}
              </div>
            )}
          </Section>
          {!self && (
            <div className="pv-pair">
              <Section title="How the calls went"><ContactStatus t={t} open={open} /></Section>
              <Section title="What came of it"><Outcomes t={t} open={open} /></Section>
            </div>
          )}
          <Section title={self ? 'My activity' : 'Other activity'}><OtherActivity t={t} side={eff} open={open} /></Section>
          <Section title={self ? 'My pending work' : 'Pending work'} className="pv-attn">
            <Pending t={t} side={eff} isToday={isToday} open={open} book={b} onBook={onBook} />
          </Section>
        </>
      )}
    </div>
  )
}

// ── The team ─────────────────────────────────────────────────────────────────
/**
 * The manager's overview of one day. `books` is the desk summary's per-agent
 * holding (never contacted), `onOpenPerson` opens an agent's drill-down, and
 * `onBook(agentId, seg)` opens their leads.
 */
export function TeamBoard({ store, hasCalling, onOpenPerson, heading = true, books = {}, onBook }) {
  const { state } = store
  const [side, setSide] = useSide('leads')
  const eff = hasCalling ? side : 'leads'
  const [date, setDate] = useState(null)
  const { data: day } = useServerData(() => api.getActivity({ side: eff, date }), [eff, date, state.dataAsOf], null)
  const isToday = !day || day.day === day.today

  const people = (day?.people || [])
    .map(p => ({ ...p, t: tally(p) }))
    // Agents always have a row: an empty one is the finding. The owner and
    // managers appear on a day they did something themselves.
    .filter(p => p.role === 'agent' || p.t.effort > 0)
    // By name, the same place every day; not a ranking.
    .sort((a, b) => ((a.gone || a.duty === 'OFF_DUTY') - (b.gone || b.duty === 'OFF_DUTY'))
      || String(a.name || '~').localeCompare(String(b.name || '~')))
  const team = teamTally(people)
  const open = (measure, detail, who) => store.openModal({
    kind: 'activityRecords', side: eff, date: day?.day, person: who?.id || null, measure, detail,
    title: listTitle(who?.name || 'Team', day, measure, detail),
  })

  // Needs attention: what is unresolved, with who it sits with.
  const attn = [
    eff === 'leads' && { key: 'never', label: 'Leads not yet contacted', tone: 'alert',
      by: people.map(p => ({ p, n: books[p.id]?.neverContacted || 0 })), go: (p) => onBook?.(p.id, 'never_contacted') },
    eff === 'leads' && { key: 'new', label: 'New leads not called', tone: 'alert',
      by: people.map(p => ({ p, n: p.t.notCalled })), go: (p) => open('came_in', 'not_called', p) },
    isToday && { key: 'missed', label: `Missed ${eff === 'calling' ? 'callbacks' : 'follow-ups'}`, tone: 'alert',
      by: people.map(p => ({ p, n: p.t.missed })), go: (p) => open('followup_missed', undefined, p) },
    isToday && { key: 'due', label: `${eff === 'calling' ? 'Callbacks' : 'Follow-ups'} due today`,
      by: people.map(p => ({ p, n: p.t.dueToday })), go: (p) => open('followup_today', undefined, p) },
    { key: 'noresult', label: 'Calls with no result written',
      by: people.map(p => ({ p, n: p.t.n('call', 'no_outcome') })), go: (p) => open('call', 'no_outcome', p) },
  ].filter(Boolean)
    .map(a => ({ ...a, by: a.by.filter(x => x.n > 0), total: a.by.reduce((s, x) => s + x.n, 0) }))
    .filter(a => a.total > 0)

  return (
    <div className="pv">
      <Head title={heading ? 'Team' : null} hasCalling={hasCalling} side={side} onSide={(v) => { setSide(v); setDate(null) }}
        day={day} onDay={(d) => setDate(d === day?.today ? null : d)} />
      {!day ? <div className="ad-wait tall" aria-busy="true" /> : (
        <>
          <Section title="Team summary"><Summary t={team} open={(m, d) => open(m, d)} /></Section>
          <div className="pv-pair">
            <Section title="How the calls went"><ContactStatus t={team} open={(m, d) => open(m, d)} /></Section>
            <Section title="What came of it"><Outcomes t={team} open={(m, d) => open(m, d)} /></Section>
          </div>

          <Section title="Agents">
            <div className="pv-agents">
              <div className="pv-ag pv-ag-head" aria-hidden="true">
                <span>Agent</span><span>People</span><span>Calls</span><span>Picked up</span><span>What came of it</span><span />
              </div>
              {people.map(p => {
                const out = p.t.statuses.slice(0, 3)
                const more = p.t.statuses.length - out.length
                return (
                  <button type="button" key={p.id} className={'pv-ag' + (p.gone || p.duty === 'OFF_DUTY' ? ' off' : '')} onClick={() => onOpenPerson?.(p)}>
                    <span className="pv-ag-name">{p.name || 'Someone who has left'}{p.duty === 'OFF_DUTY' && <span className="tt-tag">Off duty</span>}</span>
                    <span className="pv-ag-n" data-l="people"><b>{fmt(p.t.people)}</b></span>
                    <span className="pv-ag-n" data-l="calls">{fmt(p.t.calls)}</span>
                    <span className="pv-ag-n" data-l="picked up">{fmt(p.t.n('contact', 'answered'))}</span>
                    <span className="pv-ag-out">
                      {out.length
                        ? <>{out.map(s => <span key={s.detail} className="pv-chip">{s.n} {stageLabel(s.detail)}</span>)}{more > 0 && <span className="ad-quiet">+{more}</span>}</>
                        : <span className="ad-quiet">No change</span>}
                    </span>
                    <Icon name="chevRight" size={15} className="pv-go" />
                  </button>
                )
              })}
              {!people.length && <div className="detail-empty">Nobody on this side.</div>}
            </div>
          </Section>

          <Section title="Needs attention" className="pv-attn">
            {!attn.length ? <div className="pv-clear"><Icon name="check" size={15} />Nothing unresolved.</div> : (
              <div className="pv-pend">
                {attn.map(a => (
                  <div key={a.key} className={'pv-attn-r' + (a.tone ? ` ${a.tone}` : '')}>
                    <span className="pv-attn-l"><b>{fmt(a.total)}</b><span>{a.label}</span></span>
                    <span className="pv-attn-who">
                      {a.by.map(x => (
                        <button type="button" key={x.p.id} className="pv-who" onClick={() => a.go(x.p)}>
                          {(x.p.name || 'Left').split(' ')[0]} <b>{fmt(x.n)}</b>
                        </button>
                      ))}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </Section>
        </>
      )}
    </div>
  )
}
