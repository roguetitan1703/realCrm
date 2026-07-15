import { useState } from 'react'
import { Empty, PageHeader } from '../components/primitives.jsx'
import Icon from '../components/Icon.jsx'

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

// Map the seed's relative day labels onto real dates around "today" so the grid
// is realistically populated. (In production, follow-ups carry an ISO date.)
function resolveDate(label, today) {
  if (!label) return null
  if (/^\d{4}-\d{2}-\d{2}/.test(label)) {
    const parts = label.split('-').map(Number)
    return new Date(parts[0], parts[1] - 1, parts[2])
  }
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
const ymd = (d) => d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` : null

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

  const kpis = [
    { label: 'Scheduled', value: events.length },
    { label: 'Site visits', value: events.filter(e => e.isVisit).length, tone: 'accent' },
    { label: 'Overdue', value: events.filter(e => e.overdue).length, tone: 'alert' },
  ]

  return (
    <>
      {topBar({ title: 'Calendar' })}
      <PageHeader kpis={kpis} />
      <div className="app-body cal-body">
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
              ? (
                <div className="cd-pad">
                  <div className="cd-empty cd-empty-bordered">No follow-ups scheduled on this specific day.</div>
                  {events.length > 0 && (
                    <div className="cd-upcoming">
                      <div className="cd-upcoming-h">All upcoming appointments ({events.length})</div>
                      <div className="cd-list">
                        {events.map(e => {
                          const a = store.agentById(e.agentId)
                          return (
                            <button key={e.lead.id + e.key + e.time} className="cd-row" onClick={() => go('leads', { leadId: e.lead.id, leadOpen: true })}>
                              <div className="cd-when cd-when-wide">
                                <div className="cd-date">{e.key}</div>
                                <div className="cd-time">{e.time}</div>
                              </div>
                              <div className="cd-b">
                                <div className="cd-n">{e.lead.name}</div>
                                <div className="cd-a">{e.action}</div>
                                {a && <div className="cd-agent"><span className={`av av-sm ${a.avatar} cd-av`}>{a.initials}</span><span>{a.name}</span></div>}
                              </div>
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )
              : (
                <div className="cd-pad cd-list">
                  {pickedList.map(e => {
                    const a = store.agentById(e.agentId)
                    return (
                      <button key={e.lead.id + e.time} className="cd-row" onClick={() => go('leads', { leadId: e.lead.id, leadOpen: true })}>
                        <div className="cd-when"><div className="cd-time cd-time-lg">{e.time}</div></div>
                        <div className="cd-b">
                          <div className="cd-n cd-n-lg">{e.lead.name}</div>
                          <div className="cd-a">{e.action}</div>
                          {a && <div className="cd-agent"><span className={`av av-sm ${a.avatar} cd-av`}>{a.initials}</span><span>Assigned: <strong>{a.name}</strong></span></div>}
                        </div>
                      </button>
                    )
                  })}
                </div>
              )}
          </div>
        </div>
        {events.length === 0 && <div style={{ maxWidth: 400, marginTop: 16 }}><Empty title="Nothing scheduled" sub="Set a follow-up from any lead." /></div>}
      </div>
    </>
  )
}

function parseKey(key) {
  if (!key) return null
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y, m - 1, d)
}
