import { useState } from 'react'
import { Empty } from '../components/primitives.jsx'
import Icon from '../components/Icon.jsx'

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

// Map the seed's relative day labels onto real dates around "today" so the grid
// is realistically populated. (In production, follow-ups carry an ISO date.)
function resolveDate(label, today) {
  const d = new Date(today)
  const map = { Today: 0, Yesterday: -1, Tomorrow: 1 }
  if (label in map) { d.setDate(d.getDate() + map[label]); return d }
  const dowIdx = DOW.indexOf(label)
  if (dowIdx >= 0) {
    // next occurrence of that weekday (incl. today)
    const diff = (dowIdx - d.getDay() + 7) % 7
    d.setDate(d.getDate() + diff); return d
  }
  return null
}
const ymd = (d) => d ? `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}` : null

export default function Calendar({ store, go, topBar }) {
  const { state } = store
  const today = new Date()
  const [cursor, setCursor] = useState(new Date(today.getFullYear(), today.getMonth(), 1))
  const [picked, setPicked] = useState(ymd(today))

  // build event list with resolved dates
  const events = state.leads.filter(l => l.followUp).map(l => {
    const date = resolveDate(l.followUp.date, today)
    const isVisit = /visit/i.test(l.followUp.action)
    const overdue = l.overdue
    return { lead: l, date, key: ymd(date), time: l.followUp.time, action: l.followUp.action, isVisit, overdue, agentId: l.agentId }
  }).filter(e => e.date)

  const byDay = {}
  events.forEach(e => { (byDay[e.key] = byDay[e.key] || []).push(e) })
  Object.values(byDay).forEach(list => list.sort((a, b) => (a.time > b.time ? 1 : -1)))

  // month grid cells (6 weeks)
  const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1)
  const start = new Date(first); start.setDate(1 - first.getDay())
  const cells = Array.from({ length: 42 }, (_, i) => { const d = new Date(start); d.setDate(start.getDate() + i); return d })
  const todayKey = ymd(today)

  const pickedList = (byDay[picked] || [])
  const pickedDate = picked ? cells.find(c => ymd(c) === picked) || parseKey(picked) : null

  const prev = () => setCursor(c => new Date(c.getFullYear(), c.getMonth() - 1, 1))
  const next = () => setCursor(c => new Date(c.getFullYear(), c.getMonth() + 1, 1))

  return (
    <>
      {topBar({ title: 'Calendar', count: `${events.length} scheduled` })}
      <div className="app-body" style={{ padding: '20px 22px 44px' }}>
        <div className="cal-wrap">
          <div className="cal">
            <div className="cal-top">
              <div className="cal-title">{MONTHS[cursor.getMonth()]} {cursor.getFullYear()}</div>
              <button className="btn btn-ghost btn-sm" onClick={() => { setCursor(new Date(today.getFullYear(), today.getMonth(), 1)); setPicked(todayKey) }}>Today</button>
              <span className="u-spring" />
              <div className="cal-nav">
                <button onClick={prev} title="Previous month"><Icon name="chevLeft" size={16} /></button>
                <button onClick={next} title="Next month"><Icon name="chevRight" size={16} /></button>
              </div>
            </div>
            <div className="cal-dow">{DOW.map(d => <span key={d}>{d}</span>)}</div>
            <div className="cal-grid">
              {cells.map((d, i) => {
                const key = ymd(d)
                const out = d.getMonth() !== cursor.getMonth()
                const list = byDay[key] || []
                const cls = ['cell', out && 'out', key === todayKey && 'today'].filter(Boolean).join(' ')
                return (
                  <div key={i} className={cls} onClick={() => setPicked(key)} style={{ cursor: 'pointer' }}>
                    <div className="c-num">{d.getDate()}</div>
                    {list.slice(0, 2).map((e, j) => (
                      <button key={j} className={'ev-chip' + (e.overdue ? ' overdue' : e.isVisit ? ' visit' : '')}
                        onClick={(ev) => { ev.stopPropagation(); go('leads', { leadId: e.lead.id, leadOpen: true }) }}>
                        <span className="ev-t">{e.time.replace(/ ?[ap]m/i, '')}</span>
                        <span className="ev-n">{e.lead.name}</span>
                      </button>
                    ))}
                    {list.length > 2 && <span className="ev-more" onClick={(ev) => { ev.stopPropagation(); setPicked(key) }}>+{list.length - 2} more</span>}
                  </div>
                )
              })}
            </div>
          </div>

          {/* day agenda */}
          <div className="cal-day">
            <div className="cd-head">
              <div className="cd-h">{pickedDate ? `${DOW[pickedDate.getDay()]}, ${MONTHS[pickedDate.getMonth()].slice(0, 3)} ${pickedDate.getDate()}` : 'Pick a day'}</div>
              <div className="cd-sub">{pickedList.length ? `${pickedList.length} scheduled` : 'Nothing scheduled'}</div>
            </div>
            {pickedList.length === 0
              ? <div className="cd-empty">No follow-ups this day.</div>
              : pickedList.map(e => {
                const a = store.agentById(e.agentId)
                return (
                  <button key={e.lead.id} className="cd-row" onClick={() => go('leads', { leadId: e.lead.id, leadOpen: true })}>
                    <span className={'cd-time' + (e.overdue ? ' overdue' : '')}>{e.time}</span>
                    <div className="cd-b">
                      <div className="cd-n">{e.lead.name}</div>
                      <div className="cd-a">{e.action}</div>
                    </div>
                    {a && <span className={`av av-sm ${a.avatar}`}>{a.initials}</span>}
                  </button>
                )
              })}
          </div>
        </div>
        {events.length === 0 && <div style={{ maxWidth: 400, marginTop: 16 }}><Empty title="Nothing scheduled" sub="Set a follow-up from any lead." /></div>}
      </div>
    </>
  )
}

function parseKey(key) {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y, m, d)
}
