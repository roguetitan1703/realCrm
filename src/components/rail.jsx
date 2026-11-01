// Action rail + its sections (NBA banner, quick actions, scheduler). One rail,
// module-appropriate prime CTA. On narrow widths (see styles.css .dl-rail) it
// collapses to the "Actions" strip and expands on hover.
import { useState } from 'react'
import Icon from './Icon.jsx'
import { Button, SectionHead } from './primitives.jsx'

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

export function NbaBanner({ label = 'Next best action', title, sub, icon = 'phone', cta }) {
  return (
    <div className="rail-nba">
      <div className="nba-top">
        <span className="n-ic"><Icon name={icon} size={16} /></span>
        <span className="n-l">{label}</span>
      </div>
      <div className="n-t">{title}</div>
      {sub && <div className="n-s">{sub}</div>}
      {cta && <Button variant="primary" size="sm" block onClick={cta.onClick} icon={cta.icon}>{cta.label}</Button>}
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

