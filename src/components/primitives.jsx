// Small pure components — each maps to a class in styles.css. Change look = edit styles.css.
import { useState, useEffect, useRef, useLayoutEffect } from 'react'
import { createPortal } from 'react-dom'
import Icon from './Icon.jsx'
import { theme, stageClassFor } from '../data/theme.js'
import { relTime, agentName } from '../lib/format.js'
import { fileUrl, formatDistance } from '../lib/media.js'

// ---- Button ----
export function Button({ variant = 'ghost', size, block, icon, children, className, ...rest }) {
  const cls = ['btn', 'btn-' + variant, size === 'sm' && 'btn-sm', block && 'btn-block', className].filter(Boolean).join(' ')
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

// ---- RowMenu: the compact "⋯" overflow for a table row's less-used actions.
// Frequent actions stay as visible buttons beside it; this is for the ones
// that are rare, destructive, or both — reset password, force logout, delete.
// The popover renders in a portal at document.body: table wrappers scroll with
// overflow-x:auto, which (per spec) forces overflow-y:auto too, clipping any
// absolutely-positioned popover anchored inside a bottom row. A portal, positioned
// from the trigger button's live rect, escapes that clipping entirely.
export function RowMenu({ items, disabled }) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState(null)
  const btnRef = useRef(null)
  const popRef = useRef(null)

  useLayoutEffect(() => {
    if (!open || !btnRef.current) return
    const r = btnRef.current.getBoundingClientRect()
    setPos({ top: r.bottom + 4, right: window.innerWidth - r.right })
  }, [open])

  // Capture phase: runs before any row's onClick can stopPropagation in the
  // bubble phase, so opening one row's menu reliably closes any other that's open.
  useEffect(() => {
    if (!open) return
    const close = (e) => {
      if (btnRef.current?.contains(e.target)) return
      if (popRef.current?.contains(e.target)) return
      setOpen(false)
    }
    window.addEventListener('click', close, true)
    window.addEventListener('scroll', close, true)
    return () => {
      window.removeEventListener('click', close, true)
      window.removeEventListener('scroll', close, true)
    }
  }, [open])

  if (!items.length) return null
  return (
    <div className="rowmenu">
      <button ref={btnRef} className="rowmenu-btn" aria-label="More actions" disabled={disabled} onClick={(e) => { e.stopPropagation(); setOpen(o => !o) }}>
        <Icon name="dots" size={16} />
      </button>
      {open && pos && createPortal(
        <div ref={popRef} className="popover rowmenu-pop" role="menu" style={{ position: 'fixed', top: pos.top, right: pos.right, left: 'auto' }} onClick={e => e.stopPropagation()}>
          {items.map((it, i) => (
            <button key={i} className={'p-item' + (it.tone === 'danger' ? ' danger' : '')} onClick={() => { setOpen(false); it.onClick() }}>
              <span className="p-ic"><Icon name={it.icon} size={15} /></span>{it.label}
            </button>
          ))}
        </div>,
        document.body
      )}
    </div>
  )
}

// The standard row-count choices across every paginated table in the app —
// one set, so "rows per page" means the same thing wherever it appears.
export const PAGE_SIZE_OPTIONS = [10, 20, 50, 100]

// Windowed page numbers with '…' gaps: always show first, last, and a run
// around the current page, so jumping to page 1 or the end is one click
// instead of N clicks through every page in between.
function pageWindow(page, pageCount) {
  const out = []
  let last = 0
  for (let p = 1; p <= pageCount; p++) {
    if (p === 1 || p === pageCount || (p >= page - 1 && p <= page + 1)) {
      if (last && p - last > 1) out.push('…' + p)
      out.push(p)
      last = p
    }
  }
  return out
}

// ---- Pager: rows-per-page + numbered pages, for any list past one screen ----
export function Pager({ page, pageCount, onPage, total, pageSize, onPageSize, pageSizeOptions = PAGE_SIZE_OPTIONS }) {
  if (!total) return null
  const from = (page - 1) * pageSize + 1
  const to = Math.min(page * pageSize, total)
  return (
    <div className="pager">
      {onPageSize && (
        <label className="pager-size">
          <span>Rows per page</span>
          <select value={pageSize} onChange={e => onPageSize(Number(e.target.value))}>
            {pageSizeOptions.map(n => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
      )}
      <span className="pager-range">{from}–{to} of {total}</span>
      {pageCount > 1 && (
        <div className="pager-nav">
          <button className="pager-btn" aria-label="Previous page" disabled={page <= 1} onClick={() => onPage(page - 1)}>
            <Icon name="chevLeft" size={14} />
          </button>
          {pageWindow(page, pageCount).map(p => typeof p === 'number'
            ? <button key={p} className={'pager-num' + (p === page ? ' on' : '')} onClick={() => onPage(p)}>{p}</button>
            : <span key={p} className="pager-ellipsis">…</span>
          )}
          <button className="pager-btn" aria-label="Next page" disabled={page >= pageCount} onClick={() => onPage(page + 1)}>
            <Icon name="chevRight" size={14} />
          </button>
        </div>
      )}
    </div>
  )
}

// ---- Field / Input ----
// `required` marks the fields a record cannot be useful without — the asterisk
// is the cheapest way to tell someone which of thirty boxes actually gate the
// save, so they stop reading the other twenty-odd as obligations.
export function Field({ label, children, required, hint }) {
  return (
    <label className="field">
      <span>{label}{required && <i className="req" aria-hidden="true">*</i>}</span>
      {children}
      {hint && <em className="field-hint">{hint}</em>}
    </label>
  )
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
  const cls = stageClassFor(stage)
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
  const avatarVal = agent.avatar || ''
  const isColor = avatarVal.startsWith('#') || avatarVal.startsWith('rgb') || avatarVal.startsWith('hsl')
  const cls = isColor || !avatarVal ? `av av-${size} av-a1` : `av av-${size} ${avatarVal}`
  const style = isColor ? { background: avatarVal, color: '#fff' } : undefined
  return <span className={cls} style={style}>{agent.initials || 'A'}</span>
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
export function KV({ items, rows }) {
  const list = items || rows || []
  return (
    <div className="kv">
      {list.map((it, i) => (
        <div key={i}><div className="k">{it.k}</div><div className="v">{it.v}</div></div>
      ))}
    </div>
  )
}
export function Progress({ pct }) { return <div className="bar"><i style={{ width: pct + '%' }} /></div> }

// ---- KPI tile (clickable → drills into the underlying list) ----
export function Kpi({ icon, label, value, sub, alert, onClick }) {
  const isClickable = Boolean(onClick && value !== 0 && value !== '0')
  const cls = 'kpi' + (alert ? ' alert' : '') + (isClickable ? ' clickable' : '')
  const inner = <>
    <div className="k-top"><span className="k-ic"><Icon name={icon} /></span><span className="k-l">{label}</span>{isClickable && <Icon name="arrowRight" size={15} className="ic k-go" />}</div>
    <div className="k-v">{value}</div>
    <div className="k-s">{sub}</div>
  </>
  return isClickable
    ? <button className={cls} onClick={onClick}>{inner}</button>
    : <div className={cls} style={{ cursor: 'default' }}>{inner}</div>
}

// ---- PageHeader: lean in-page strip under the breadcrumb ----
// Left: inline KPI stats the MODULE supplies. Right: optional scope segments.
// kpis: [{ label, value, tone?: 'alert'|'accent', onClick? }]
// segments: [{ key, label, count, on, onClick }]  (scope selector, NOT a filter)
export function PageHeader({ kpis = [], segments, right }) {
  if (!kpis.length && !segments && !right) return null
  return (
    <div className="pagehead">
      {kpis.length > 0 && (
        <div className="ph-stats">
          {kpis.map((k, i) => {
            const clickable = Boolean(k.onClick)
            const cls = 'ph-stat' + (k.tone ? ' ' + k.tone : '') + (clickable ? ' clickable' : '')
            const inner = <><span className="ph-v">{k.value}</span><span className="ph-l">{k.label}</span></>
            return clickable
              ? <button key={i} className={cls} onClick={k.onClick}>{inner}</button>
              : <div key={i} className={cls}>{inner}</div>
          })}
        </div>
      )}
      <div className="u-spring" />
      {segments && <SegmentPills segments={segments} />}
      {right}
    </div>
  )
}

// ---- SegmentPills: scope selector (All / Buyers / Tenants …) ----
export function SegmentPills({ segments = [] }) {
  return (
    <div className="segpills">
      {segments.map(s => (
        // `tone` marks a bucket that is a problem rather than a stage — an
        // overdue count reading the same as every other number is the one that
        // gets ignored. A zero count drops the tone: nothing overdue is not an
        // alert.
        <button key={s.key} onClick={s.onClick}
          className={'segpill' + (s.on ? ' on' : '') + (s.tone && s.count ? ' ' + s.tone : '')}>
          {s.label}{s.count != null && <span className="segpill-c">{s.count}</span>}
        </button>
      ))}
    </div>
  )
}

// ---- ViewSwitch: grid ↔ list toggle (shared by every module) ----
// Default modes are grid + list; a module can pass `extra` options (e.g. a
// "group by project" view) that render as additional segments.
export function ViewSwitch({ value, onChange, extra = [] }) {
  return (
    <div className="viewsw">
      <button className={value === 'grid' ? 'on' : ''} title="Grid" onClick={() => onChange('grid')}><Icon name="grid" /></button>
      <button className={value === 'list' ? 'on' : ''} title="List" onClick={() => onChange('list')}><Icon name="leads" /></button>
      {extra.map(o => (
        <button key={o.value} className={value === o.value ? 'on' : ''} title={o.title} onClick={() => onChange(o.value)}><Icon name={o.icon} /></button>
      ))}
    </div>
  )
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
// Journey stepper — shows a record's position along a progression as a track of
// connected nodes. Past = done, current = filled, ahead = reachable. Click any
// node to move there. Module-generic (used for lead stage AND property status).
const STEP_SHORT = { 'Site Visit': 'Visit', 'Negotiation': 'Nego', 'Closed Won': 'Won', 'Closed Lost': 'Lost', 'Token Pending': 'Token', 'Under Offer': 'Offer', 'Available': 'Available' }
export function Stepper({ stages, current, onPick }) {
  const idx = stages.indexOf(current)
  return (
    <div className="jstep" role="list">
      {stages.map((s, i) => {
        const state = i < idx ? 'done' : i === idx ? 'current' : 'ahead'
        return (
          <button key={s} className={'jstep-node ' + state} onClick={() => onPick(s)} role="listitem" title={s}>
            <span className="jstep-dot">{i < idx ? <Icon name="check" size={12} /> : i + 1}</span>
            <span className="jstep-label">{STEP_SHORT[s] || s}</span>
          </button>
        )
      })}
    </div>
  )
}

// ---- Timeline ----
// events: [{ id?, type, label, ago? | timestamp?, authorId? }]. `id`+`authorId`
// are only present on real DB-backed events (remarks, calls, stage changes…) —
// older client-only entries render fine but can't be edited (no id to target).
// Author-editable types (B1 remark, B5 call/wa/sms outcome+remark).
const EDITABLE_TYPES = new Set(['remark', 'call', 'wa', 'sms'])
const TYPE_TAG = { remark: 'Remark', call: 'Call', wa: 'WhatsApp', sms: 'SMS', visit: 'Site visit' }
// B4 outcomes are stored as stable keys; these are what a person reads.
const VISIT_OUTCOME_LABEL = {
  interested: 'Interested', not_interested: 'Not interested',
  negotiating: 'Negotiating', booked: 'Booked', no_show: 'No show',
}
const CALL_OUTCOMES = ['Connected & Discussed Requirements', 'Interested — Scheduling Site Visit', 'Requested Callback Later', 'No Answer / Ringing', 'Number Busy / Switched Off']

/**
 * The proof attached to a site visit (B4): the selfie, the GPS fix, and — when
 * the property has coordinates on file — how far the photo was taken from it.
 *
 * The photo is only here if the server decided this viewer may have it. Owners
 * and managers see every one; an agent sees the visits they logged themselves.
 * When it's withheld the entry still shows that proof exists, because hiding
 * that too would make an agent's own record look incomplete to their manager.
 */
function VisitProof({ meta }) {
  const { photoKey, photoWithheld, geo, distanceM } = meta
  if (!photoKey && !photoWithheld && !geo) return null
  return (
    <div className="ev-proof">
      {photoKey && (
        <a href={fileUrl(photoKey)} target="_blank" rel="noreferrer" className="ev-proof-img">
          <img src={fileUrl(photoKey)} alt="Visit proof" loading="lazy" />
        </a>
      )}
      {photoWithheld && <span className="ev-proof-locked"><Icon name="shield" size={12} />Proof on file</span>}
      {geo && (
        <span className="ev-proof-geo">
          <Icon name="mapPin" size={12} />
          {distanceM != null ? `${formatDistance(distanceM)} from the listing` : `±${Math.round(geo.accuracy || 0)}m accuracy`}
        </span>
      )}
    </div>
  )
}

export function Timeline({ events = [], agents = [], currentUserId, onEditRemark }) {
  const list = events || [];
  const fmtLabel = (txt) => (txt || '').replace(/\bagent (\S+)\b/gi, (m, id) => agentName(agents, id));
  return (
    <div className="tl">
      {list.map((e, i) => (
        <TimelineRow key={e.id || i} e={e} isLast={i === list.length - 1}
          agents={agents} currentUserId={currentUserId} onEditRemark={onEditRemark} fmtLabel={fmtLabel} />
      ))}
    </div>
  )
}

function TimelineRow({ e, isLast, agents, currentUserId, onEditRemark, fmtLabel }) {
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState(e.label || '')
  const [outcome, setOutcome] = useState(e.metadata?.outcome || '')
  const tag = TYPE_TAG[e.type]
  const canEdit = tag && EDITABLE_TYPES.has(e.type) && e.id && e.authorId && currentUserId && e.authorId === currentUserId && !!onEditRemark
  const ago = e.timestamp ? relTime(e.timestamp) : (e.ago || '')
  const author = e.authorId ? agentName(agents, e.authorId) : null
  const rawOutcome = e.metadata?.outcome
  const outcomeText = rawOutcome ? (VISIT_OUTCOME_LABEL[rawOutcome] || rawOutcome) : ''
  const save = () => {
    if (!text.trim() && !outcome) return
    onEditRemark(e.id, text.trim(), outcome || undefined)
    setEditing(false)
  }
  return (
    <div className="ev">
      <div className="rail-dot">
        <span className={'d' + (e.type === 'stage' || e.type === 'follow' || e.type === 'msg' || tag ? ' accent' : '')} />
        {!isLast && <span className="ln" />}
      </div>
      <div className="ev-b">
        {editing ? (
          <div className="ev-edit">
            {e.type === 'call' && (
              <select className="input" value={outcome} onChange={ev => setOutcome(ev.target.value)}>
                <option value="">No outcome yet</option>
                {CALL_OUTCOMES.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            )}
            <textarea className="textarea" value={text} onChange={ev => setText(ev.target.value)} rows={2} placeholder="Add a remark…" autoFocus />
            <div className="ev-edit-actions">
              <button className="btn btn-ghost btn-sm" onClick={() => { setEditing(false); setText(e.label || ''); setOutcome(e.metadata?.outcome || '') }}>Cancel</button>
              <button className="btn btn-primary btn-sm" onClick={save}>Save</button>
            </div>
          </div>
        ) : (
          <>
            <div className="ev-l">{tag && <span className="ev-remark-tag">{tag}</span>}{fmtLabel(e.label)}</div>
            {e.type === 'visit' && <VisitProof meta={e.metadata || {}} />}
            <div className="ev-a">
              {author ? `${author} · ` : ''}{ago}{outcomeText ? ` · ${outcomeText}` : ''}{e.metadata?.edited ? ' · edited' : ''}
              {canEdit && <button className="ev-edit-btn" onClick={() => setEditing(true)}>{e.metadata?.edited ? 'Edit' : 'Add outcome & remark'}</button>}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
