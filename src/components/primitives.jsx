// Small pure components — each maps to a class in styles.css. Change look = edit styles.css.
import Icon from './Icon.jsx'
import { theme } from '../data/theme.js'

// ---- Button ----
export function Button({ variant = 'ghost', size, block, icon, children, ...rest }) {
  const cls = ['btn', 'btn-' + variant, size === 'sm' && 'btn-sm', block && 'btn-block'].filter(Boolean).join(' ')
  return (
    <button className={cls} {...rest}>
      {icon && <Icon name={icon} />}
      {children}
    </button>
  )
}
export function IconButton({ icon, variant = 'ghost', ...rest }) {
  return <button className={`btn btn-${variant} btn-icon`} {...rest}><Icon name={icon} /></button>
}

// ---- Field / Input ----
export function Field({ label, children }) {
  return <label className="field"><span>{label}</span>{children}</label>
}
export function Input({ error, ...rest }) {
  return <input className={'input' + (error ? ' err' : '')} {...rest} />
}
export function PhoneInput({ value, onChange, ...rest }) {
  return (
    <div className="input-group">
      <span className="prefix">+91</span>
      <input value={value} onChange={onChange} {...rest} />
    </div>
  )
}
export function Textarea(props) { return <textarea className="textarea" {...props} /> }

export function Segmented({ options, value, onChange, block }) {
  return (
    <div className={'seg' + (block ? ' seg-block' : '')}>
      {options.map(o => {
        const val = typeof o === 'string' ? o : o.value
        const label = typeof o === 'string' ? o : o.label
        return <button key={val} className={val === value ? 'on' : ''} onClick={() => onChange(val)}>{label}</button>
      })}
    </div>
  )
}
export function QuickChip({ on, children, ...rest }) {
  return <button className={'qchip' + (on ? ' on' : '')} {...rest}>{children}</button>
}
export function Toggle({ on, ...rest }) { return <button className={'toggle' + (on ? ' on' : '')} {...rest} /> }

// ---- Signals (contained) ----
export function StageTag({ stage }) {
  const cls = theme.stageClass[stage] || 'stage-new'
  const label = stage === 'Closed Won' ? 'Closed won' : stage === 'Closed Lost' ? 'Closed lost' : stage === 'Site Visit' ? 'Site visit' : stage
  return <span className={'stage ' + cls}><span className="dot" />{label}</span>
}
export function StatusTag({ status }) {
  const cls = theme.statusClass[status] || 'status-closed'
  return <span className={'pill ' + cls}><span className="dot" />{status}</span>
}
export function Source({ children }) { return <span className="source">{children}</span> }
export function Overdue({ children }) { return <span className="overdue"><span className="dot" />{children}</span> }
export function Unassigned() { return <span className="unassigned-tag">Unassigned</span> }
export function CountBadge({ n, tone }) { return <span className={'count-badge' + (tone ? ' ' + tone : '')}>{n}</span> }
export function NewTag() { return <span className="new-tag">New</span> }
export function Money({ children, sub }) { return <span className={sub ? 'money-sub' : 'money'}>{children}</span> }
// Quiet, indicative money line for properties. Pass a quotedLine() result.
export function Quoted({ q }) {
  if (!q) return null
  return <span className="quoted"><span className="q-k">{q.label}</span><span className="q-f">{q.figure}</span>{q.note && <span className="q-n">{q.note}</span>}</span>
}

export function Avatar({ agent, size = 'md', empty }) {
  if (empty || !agent) return <span className={`av av-${size} av-empty`}>?</span>
  return <span className={`av av-${size} ${agent.avatar}`}>{agent.initials}</span>
}

export function Fit({ ok, children }) {
  return <span className={'fit ' + (ok ? 'ok' : 'no')}><Icon name={ok ? 'check' : 'x'} size={11} />{children}</span>
}

// ---- Glance card (detail-view header — at-a-glance facts, not a text row) ----
// thumb: node | eyebrow: small caps | name: title | value/per: hero figure
// meta: array of nodes (tags) | facts: [{k,v,mut}] shown as a labelled grid.
export function GlanceCard({ thumb, eyebrow, name, value, per, sub, meta, facts }) {
  return (
    <div className="glance">
      {thumb && <div className="g-thumb">{thumb}</div>}
      <div className="g-lede">
        {eyebrow && <div className="g-eyebrow">{eyebrow}</div>}
        <div className="g-name">{name}</div>
        {value != null && <div className="g-value">{value}{per && <span className="g-per"> {per}</span>}</div>}
        {sub && <div className="g-sub">{sub}</div>}
        {meta && meta.length > 0 && <div className="g-meta">{meta.map((m, i) => <span key={i}>{m}</span>)}</div>}
      </div>
      {facts && facts.length > 0 && (
        <div className={'g-facts' + (thumb || value != null ? '' : ' no-rule')}>
          {facts.map((f, i) => (
            <div className="g-fact" key={i}><div className="fk">{f.k}</div><div className={'fv' + (f.mut ? ' mut' : '')}>{f.v}</div></div>
          ))}
        </div>
      )}
    </div>
  )
}

// ---- Panel / section header / KV / progress ----
export function Panel({ children, style }) { return <div className="panel" style={style}>{children}</div> }
export function SectionHead({ title, right }) {
  return <div className="sh"><span className="t">{title}</span>{right && <span className="r">{right}</span>}</div>
}
export function KV({ items }) {
  return (
    <div className="kv">
      {items.map((it, i) => (
        <div key={i}><div className="k">{it.k}</div><div className="v">{it.v}</div></div>
      ))}
    </div>
  )
}
export function Progress({ pct }) { return <div className="bar"><i style={{ width: pct + '%' }} /></div> }

// ---- KPI tile (clickable → drills into the underlying list) ----
export function Kpi({ icon, label, value, sub, alert, onClick }) {
  const cls = 'kpi' + (alert ? ' alert' : '') + (onClick ? ' clickable' : '')
  const inner = <>
    <div className="k-top"><span className="k-ic"><Icon name={icon} /></span><span className="k-l">{label}</span>{onClick && <Icon name="arrowRight" size={15} className="ic k-go" />}</div>
    <div className="k-v">{value}</div>
    <div className="k-s">{sub}</div>
  </>
  return onClick
    ? <button className={cls} onClick={onClick}>{inner}</button>
    : <div className={cls}>{inner}</div>
}

// ---- Empty state ----
export function Empty({ title, sub, action }) {
  return (
    <div className="empty">
      <div className="e-t">{title}</div>
      {sub && <div className="e-s">{sub}</div>}
      {action && <Button variant="primary" size="sm" onClick={action.onClick}>{action.label}</Button>}
    </div>
  )
}

// ---- Stage stepper ----
export function Stepper({ stages, current, onPick }) {
  const idx = stages.indexOf(current)
  return (
    <div className="stepper">
      {stages.map((s, i) => {
        const state = i < idx ? 'done' : i === idx ? 'current' : ''
        const short = s === 'Site Visit' ? 'Visit' : s === 'Negotiation' ? 'Nego' : s === 'Closed Won' ? 'Won' : s === 'Closed Lost' ? 'Lost' : s
        return <button key={s} className={state} onClick={() => onPick(s)}>{short}</button>
      })}
    </div>
  )
}

// ---- Timeline ----
export function Timeline({ events }) {
  return (
    <div className="tl">
      {events.map((e, i) => (
        <div className="ev" key={i}>
          <div className="rail-dot">
            <span className={'d' + (e.type === 'stage' || e.type === 'follow' || e.type === 'msg' ? ' accent' : '')} />
            {i < events.length - 1 && <span className="ln" />}
          </div>
          <div className="ev-b"><div className="ev-l">{e.label}</div><div className="ev-a">{e.ago}</div></div>
        </div>
      ))}
    </div>
  )
}
