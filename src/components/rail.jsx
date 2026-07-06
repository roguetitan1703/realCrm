// Action rail + its sections (NBA banner, quick actions, scheduler). One rail,
// module-appropriate prime CTA. On narrow widths (see styles.css .dl-rail) it
// collapses to the "Actions" strip and expands on hover.
import { useState } from 'react'
import Icon from './Icon.jsx'
import { Button, Segmented, QuickChip, SectionHead } from './primitives.jsx'

export function ActionRail({ children }) {
  return (
    <div className="dl-rail">
      <div className="rail-strip">
        <Icon name="chevRight" className="chev" />
        <span className="lbl">Actions</span>
      </div>
      <div className="rail-full">
        <div className="rail">{children}</div>
      </div>
    </div>
  )
}
export function RailSection({ title, right, children }) {
  return (
    <div className="r-sec">
      {title && <SectionHead title={title} right={right} />}
      {children}
    </div>
  )
}

export function NbaBanner({ label = 'Next best action', title, cta }) {
  return (
    <div className="rail-nba">
      <span className="n-ic"><Icon name="phone" size={18} /></span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="n-l">{label}</div>
        <div className="n-t">{title}</div>
      </div>
      {cta && <Button variant="primary" size="sm" onClick={cta.onClick}>{cta.label}</Button>}
    </div>
  )
}

export function QuickActions({ items }) {
  return (
    <div className="qa-grid">
      {items.map((a, i) => (
        <button key={i} className="qa" onClick={a.onClick}>
          <Icon name={a.icon} size={18} />{a.label}
        </button>
      ))}
    </div>
  )
}

// ---- ActionGroup: scalable, segregated actions any module reuses. ----
// groups: [{ head, items:[{icon,label,sub,tone,onClick}] }]. A single flat
// `items` array works too (renders one unlabelled group).
export function ActionGroup({ groups, items }) {
  const g = groups || [{ items: items || [] }]
  return (
    <div className="agrp">
      {g.map((grp, gi) => (
        <div key={gi}>
          {grp.head && <div className="ag-head">{grp.head}</div>}
          <div className="agrp" style={{ gap: 6 }}>
            {grp.items.map((a, i) => (
              <button key={i} className={'ga' + (a.tone ? ' ' + a.tone : '')} onClick={a.onClick} disabled={a.disabled}>
                <span className="ga-ic"><Icon name={a.icon} size={16} /></span>
                <span className="ga-b">
                  <span className="ga-l">{a.label}</span>
                  {a.sub && <span className="ga-s">{a.sub}</span>}
                </span>
                <Icon name="chevRight" size={15} className="ic ga-r" />
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

// ---- Scheduler — decluttered: what · when · time · save. ----
// "Pick a date" reveals the native date input only when needed, so the common
// path (today/tomorrow/weekend + a time) stays two taps.
export function Scheduler({ onSave, saveLabel = 'Add to calendar' }) {
  const [action, setAction] = useState('call')
  const [quick, setQuick] = useState('today')
  const [date, setDate] = useState('')
  const [time, setTime] = useState('11:00')
  const picking = quick === 'pick'
  return (
    <div className="sched">
      <Segmented block value={action} onChange={setAction}
        options={[{ value: 'call', label: 'Call' }, { value: 'site', label: 'Site visit' }, { value: 'meeting', label: 'Meeting' }]} />
      <div className="s-when">
        {[['today', 'Today'], ['tomorrow', 'Tomorrow'], ['weekend', 'Weekend'], ['pick', 'Date…']].map(([v, l]) => (
          <QuickChip key={v} on={quick === v} onClick={() => setQuick(v)}>{l}</QuickChip>
        ))}
      </div>
      <div className="s-dt">
        {picking && <input className="input" type="date" value={date} onChange={e => setDate(e.target.value)} />}
        <input className="input" type="time" value={time} onChange={e => setTime(e.target.value)} />
      </div>
      <Button variant="primary" block icon="calendar" style={{ marginTop: 10 }}
        onClick={() => onSave({ action, quick, date, time })}>{saveLabel}</Button>
    </div>
  )
}
