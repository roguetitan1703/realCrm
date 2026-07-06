// Collection components: Toolbar (the ONE filter/sort bar), Table, ListRow, Card grid.
import { useState, useEffect, useRef } from 'react'
import Icon from './Icon.jsx'
import { StageTag, StatusTag, Source, Overdue, Unassigned, Avatar, Money, NewTag, Quoted } from './primitives.jsx'
import { quotedLine, unitLabel } from '../lib/format.js'

// ---- FilterBar: scalable add-filter → pick field → pick value + native search ----
// Config-driven, no per-module custom pills. Module owns state and passes:
//   fields:  [{ key, label, icon, multi, options:[{value,label}] }]
//   value:   { [fieldKey]: [selectedValues] }   (module state)
//   onChange(nextValue)
//   search:  { value, onChange, placeholder }    (optional)
//   sort:    <SortControl {...} />                (optional node on the right)
export function FilterBar({ fields = [], value = {}, onChange, search, segments, right, cta }) {
  const [open, setOpen] = useState(null)   // null | 'add' | fieldKey (value picker)
  const barRef = useRef(null)
  useEffect(() => {
    if (!open) return
    const h = (e) => { if (barRef.current && !barRef.current.contains(e.target)) setOpen(null) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [open])

  const active = fields.filter(f => (value[f.key] || []).length)
  const set = (key, vals) => onChange({ ...value, [key]: vals })
  const labelFor = (f, v) => (f.options.find(o => o.value === v)?.label) ?? v
  const toggleVal = (f, v) => {
    const cur = value[f.key] || [], has = cur.includes(v)
    const next = f.multi === false ? (has ? [] : [v]) : (has ? cur.filter(x => x !== v) : [...cur, v])
    set(f.key, next)
    if (f.multi === false) setOpen(null)
  }
  // one shared value-picker popover, used from both the chip and the add-menu
  const ValuePicker = ({ f, align }) => (
    <div className={'popover' + (align === 'right' ? ' right' : '')}>
      <div className="p-head">{f.label}</div>
      {f.options.map(o => {
        const on = (value[f.key] || []).includes(o.value)
        return (
          <button key={o.value} className={'p-item' + (on ? ' on' : '')} onClick={() => toggleVal(f, o.value)}>
            {o.label}{on && <Icon name="check" size={15} className="ic p-chk" />}
          </button>
        )
      })}
    </div>
  )

  return (
    <div className="fbar" ref={barRef}>
      {segments && (
        <div className="tabs">
          {segments.map(s => (
            <button key={s.key} className={s.on ? 'on' : ''} onClick={s.onClick}>
              {s.label}{s.count != null && <span className={'count-badge' + (s.on ? ' accent' : '')}>{s.count}</span>}
            </button>
          ))}
        </div>
      )}
      {segments && (search || fields.length) ? <div className="divider" /> : null}
      {search && (
        <div className="f-search">
          <Icon name="search" size={15} />
          <input value={search.value} onChange={e => search.onChange(e.target.value)} placeholder={search.placeholder || 'Search…'} />
          {search.value && <button className="cx" onClick={() => search.onChange('')} title="Clear"><Icon name="x" size={13} /></button>}
        </div>
      )}
      {search && fields.length ? <div className="divider" /> : null}

      {active.map(f => (
        <span className="chipf" key={f.key} style={{ position: 'relative' }}>
          <button className="ck" style={{ border: 'none', background: 'transparent', cursor: 'pointer', font: 'inherit', color: 'inherit', padding: 0 }}
            onClick={() => setOpen(open === f.key ? null : f.key)}>
            {f.label}: <b style={{ fontWeight: 600 }}>{(value[f.key] || []).map(v => labelFor(f, v)).join(', ')}</b>
          </button>
          <button className="cx" title="Remove" onClick={() => set(f.key, [])}><Icon name="x" size={12} /></button>
          {open === f.key && <ValuePicker f={f} />}
        </span>
      ))}

      {fields.length > 0 && (
        <div style={{ position: 'relative' }}>
          <button className="f-add" onClick={() => setOpen(open === 'add' ? null : 'add')}>
            <Icon name="plus" size={14} />Filter
          </button>
          {open === 'add' && (
            <div className="popover">
              <div className="p-head">Filter by</div>
              {fields.map(f => (
                <button key={f.key} className={'p-item' + ((value[f.key] || []).length ? ' on' : '')} onClick={() => setOpen(f.key)}>
                  <span className="p-ic"><Icon name={f.icon || 'tag'} size={16} /></span>{f.label}
                  {(value[f.key] || []).length ? <Icon name="check" size={15} className="ic p-chk" /> : null}
                </button>
              ))}
            </div>
          )}
          {/* picking a value for a not-yet-active field, chosen from the add-menu */}
          {open && open !== 'add' && !active.find(a => a.key === open) && (() => {
            const f = fields.find(x => x.key === open)
            return f ? <ValuePicker f={f} /> : null
          })()}
        </div>
      )}

      {active.length > 0 && <button className="f-clear" onClick={() => onChange({})}>Clear all</button>}
      <div className="u-spring" />
      {right}
      {cta && <button className="btn btn-primary btn-sm" onClick={cta.onClick} style={{ marginLeft: 4 }}><Icon name="plus" size={15} />{cta.label}</button>}
    </div>
  )
}

// ---- Toolbar: segments + labelled Sort control + view switch (every module) ----
export function Toolbar({ segments, sort, views }) {
  return (
    <div className="toolbar">
      {segments && (
        <div className="tabs">
          {segments.map(s => (
            <button key={s.key} className={s.on ? 'on' : ''} onClick={s.onClick}>
              {s.label}{s.count != null && <span className={'count-badge' + (s.on ? ' accent' : '')}>{s.count}</span>}
            </button>
          ))}
        </div>
      )}
      {sort && <><div className="divider" /><SortControl {...sort} /></>}
      <div className="u-spring" />
      {views && (
        <div className="viewsw">
          {views.map(v => (
            <button key={v.key} className={v.on ? 'on' : ''} title={v.title} onClick={v.onClick}>
              <Icon name={v.icon} />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export function SortControl({ value, options, dir, onSort, onDir }) {
  return (
    <div className="ctrl">
      <span className="ctrl-l">Sort</span>
      <select value={value} onChange={e => onSort(e.target.value)}>
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <button className="dir" title={dir === 'asc' ? 'Ascending' : 'Descending'} onClick={onDir}>
        <Icon name={dir === 'asc' ? 'sortAsc' : 'sortDesc'} size={14} />
      </button>
    </div>
  )
}

// ---- Table (dense) ----
export function Table({ columns, rows, sortKey, sortDir, onSort }) {
  return (
    <table className="tbl">
      <thead>
        <tr>
          {columns.map(c => (
            <th key={c.key} onClick={c.sortable ? () => onSort(c.key) : undefined} style={c.sortable ? undefined : { cursor: 'default' }}>
              {c.label}{c.key === sortKey && <span className="caret">{sortDir === 'asc' ? '▲' : '▼'}</span>}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map(r => (
          <tr key={r.id} className={r.selected ? 'sel' : ''} onClick={r.onClick}>
            {r.cells.map((cell, i) => <td key={i}>{cell}</td>)}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

// ---- ListRow (comfortable) ----
export function ListRow({ avatar, name, meta, right, onClick }) {
  return (
    <button className="lrow" onClick={onClick}>
      {avatar}
      <div className="l-main">
        <div className="l-name">{name}</div>
        <div className="l-meta">{meta}</div>
      </div>
      {right && <div className="l-right">{right}</div>}
    </button>
  )
}

// ---- Property card: tiny thumb + data-dense body. No image block. ----
// Broker scans identity + stock facts + status + demand, money quiet at the end.
export function PropertyCard({ p, onClick, matchCount }) {
  const facts = [p.carpet ? p.carpet + ' sqft' : null, p.type !== 'Plot' && p.totalFloors ? `${p.floor}/${p.totalFloors} flr` : null, p.furnishing && p.furnishing !== '—' ? p.furnishing : null].filter(Boolean)
  return (
    <button className="pcard" onClick={onClick}>
      <div className="pc-top">
        <span className="pc-thumb" style={{ background: p.thumbBg }}><Icon name="building" size={20} strokeWidth={1.4} /></span>
        <div className="pc-id">
          <div className="pc-title">{p.society}</div>
          <div className="pc-sub">{unitLabel(p) && <span className="unit-tag" style={{ marginLeft: 0, marginRight: 6 }}>{unitLabel(p)}</span>}{p.type} · {p.deal === 'rent' ? 'Rent' : 'Sale'} · {p.locality}</div>
        </div>
        <StatusTag status={p.status} />
      </div>
      <div className="pc-facts">{facts.map((f, i) => <span key={i}>{f}</span>)}</div>
      <div className="pc-foot">
        <Quoted q={quotedLine(p)} />
        {matchCount ? <span className="pc-demand"><Icon name="people" size={13} />{matchCount}</span> : null}
      </div>
    </button>
  )
}

// Re-export signal atoms used when composing table cells, so modules import from one place.
export { StageTag, StatusTag, Source, Overdue, Unassigned, Avatar, Money }
