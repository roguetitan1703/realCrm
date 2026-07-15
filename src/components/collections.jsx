// Collection components: Toolbar (the ONE filter/sort bar), Table, ListRow, Card grid.
import { useState, useEffect, useRef } from 'react'
import Icon from './Icon.jsx'
import { StageTag, StatusTag, Source, Overdue, Unassigned, Avatar, Money, NewTag, Quoted, PageHeader, ViewSwitch } from './primitives.jsx'
import { quotedLine, unitLabel } from '../lib/format.js'
import { getNestedValue } from './ModuleFields.jsx'

// ---- runModuleQuery: pure search+filter+sort from a MODULE_DEFINITION ----
// Shared by ModuleListView and any custom module view (e.g. Properties card grid,
// Clients segmented directory) that wants the SAME query semantics but a different
// render surface. Keeps one query brain, many surfaces.
export function runModuleQuery(def, records, { filters = {}, search = '', sortKey, sortDir = 'asc', store } = {}) {
  let list = records.slice()
  // filters (per-key logic from the definition; falls back to simple includes)
  for (const [key, vals] of Object.entries(filters)) {
    if (!vals || !vals.length) continue
    list = list.filter(r => def.rowMatch
      ? def.rowMatch(r, key, vals, store)
      : vals.includes(getNestedValue(r, key)))
  }
  // search across the definition's searchFields (dot-path aware)
  const q = (search || '').trim().toLowerCase()
  if (q && def.searchFields?.length) {
    list = list.filter(r => def.searchFields.some(f => {
      const v = getNestedValue(r, f)
      return v != null && String(v).toLowerCase().includes(q)
    }))
  }
  // sort via the chosen sortOption's value()
  const so = def.sortOptions?.find(s => s.key === sortKey)
  if (so) {
    list.sort((a, b) => {
      const av = so.value(a, store), bv = so.value(b, store)
      const c = av < bv ? -1 : av > bv ? 1 : 0
      return sortDir === 'asc' ? c : -c
    })
  }
  return list
}

// ---- ModuleListView: the standardized collection screen for ANY module. ----
// Renders FilterBar (search + config-driven filters + Sort) and a Table, all
// driven by the MODULE_DEFINITION. Modules pass their already-fetched records,
// an onOpen(record) handler, and optional segments/extra toolbar nodes.
// NOTE: this is a PURE builder (no hooks) — modules call it directly and may
// early-return before/after it, so it must never call useState/useMemo/etc.
export function ModuleListView({
  def, records, store, onOpen,
  filters, onFilters, search, onSearch, sortKey, onSortKey, sortDir, onSortDir,
  kpis, segments, view, onView, cta, toolbarRight, emptyTitle, emptyHint, renderTable,
}) {
  const list = runModuleQuery(def, records, { filters, search, sortKey, sortDir, store })

  const fields = typeof def.filterFields === 'function' ? def.filterFields(store) : (def.filterFields || [])
  const sortOptions = def.sortOptions.map(s => ({ value: s.key, label: s.label }))

  // Lean in-page header: module KPIs (left) + scope segments (right). NOT the breadcrumb.
  const header = (kpis?.length || segments)
    ? <PageHeader kpis={kpis} segments={segments} />
    : null

  const toolbar = (
    <FilterBar
      fields={fields}
      value={filters}
      onChange={onFilters}
      search={{ value: search, onChange: onSearch, placeholder: `Search ${def.name.toLowerCase()}…` }}
      right={<>
        <SortControl
          value={sortKey} dir={sortDir} options={sortOptions}
          onSort={onSortKey} onDir={() => onSortDir(sortDir === 'asc' ? 'desc' : 'asc')}
        />
        {toolbarRight}
        {onView && <ViewSwitch value={view} onChange={onView} />}
      </>}
      cta={cta}
    />
  )

  const body = list.length === 0
    ? <div className="empty"><div className="e-t">{emptyTitle || `No ${def.name.toLowerCase()} match`}</div><div className="e-s">{emptyHint || 'Try clearing a filter or search.'}</div></div>
    : renderTable
      ? renderTable(list, view)
      : <ModuleTable def={def} rows={list} store={store} onOpen={onOpen} sortKey={sortKey} sortDir={sortDir} onSort={onSortKey} />

  return { header, toolbar, body, list }
}

// ---- ModuleCards: grid of cards from a definition's `card(record,store)` fn. ----
export function ModuleCards({ def, rows, store, onOpen }) {
  if (!def.card) return <ModuleTable def={def} rows={rows} store={store} onOpen={onOpen} />
  return (
    <div className="grid-cards">
      {rows.map(rec => (
        <button key={rec.id} className="rcard" onClick={onOpen ? () => onOpen(rec) : undefined}>
          {def.card(rec, store)}
        </button>
      ))}
    </div>
  )
}

// ---- ModuleTable: renders a definition's columns[] against records. ----
export function ModuleTable({ def, rows, store, onOpen, sortKey, sortDir, onSort }) {
  const columns = def.columns.map(c => ({ key: c.key, label: c.label, sortable: c.sortable }))
  const tableRows = rows.map(rec => ({
    id: rec.id || rec._id,
    onClick: onOpen ? () => onOpen(rec) : undefined,
    cells: def.columns.map(c => c.render ? c.render(rec, store) : getNestedValue(rec, c.key)),
  }))
  return <Table columns={columns} rows={tableRows} sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
}

// Value picker popover for a filter field. Long option lists (localities,
// sources, stages) get an inline search box; selected values show a checkbox.
function FilterValuePicker({ f, align, selected, onToggle }) {
  const [q, setQ] = useState('')
  const searchable = (f.options?.length || 0) > 7
  const opts = searchable && q.trim()
    ? f.options.filter(o => String(o.label ?? o.value).toLowerCase().includes(q.trim().toLowerCase()))
    : f.options
  return (
    <div className={'popover fvp' + (align === 'right' ? ' right' : '')}>
      <div className="p-head">{f.label}{f.multi !== false && <span className="fvp-hint">select any</span>}</div>
      {searchable && (
        <div className="fvp-search">
          <Icon name="search" size={13} />
          <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder={`Search ${f.label.toLowerCase()}…`} />
        </div>
      )}
      <div className="fvp-list">
        {opts.length === 0 && <div className="fvp-empty">No matches</div>}
        {opts.map(o => {
          const on = selected.includes(o.value)
          return (
            <button key={o.value} className={'p-item fvp-item' + (on ? ' on' : '')} onClick={() => onToggle(o.value)}>
              <span className={'fvp-box' + (on ? ' on' : '')}>{on && <Icon name="check" size={12} />}</span>
              <span className="fvp-lbl">{o.label ?? o.value}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ---- FilterBar: scalable add-filter → pick field → pick value + native search ----
// Config-driven, no per-module custom pills. Module owns state and passes:
//   fields:  [{ key, label, icon, multi, options:[{value,label}] }]
//   value:   { [fieldKey]: [selectedValues] }   (module state)
//   onChange(nextValue)
//   search:  { value, onChange, placeholder }    (optional)
//   sort:    <SortControl {...} />                (optional node on the right)
export function FilterBar({ fields = [], value = {}, onChange, search, right, cta }) {
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
    <FilterValuePicker f={f} align={align} selected={value[f.key] || []} onToggle={(v) => toggleVal(f, v)} />
  )

  return (
    <div className="fbar" ref={barRef}>
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

// Custom sort control — a styled popover menu (NOT a native <select>), matching
// the app's filter popovers so Sort + Filter read as one system. The trigger
// shows the active field; the menu lists options with a check + an asc/desc row.
export function SortControl({ value, options, dir, onSort, onDir }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  useEffect(() => {
    if (!open) return
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [open])

  const activeLabel = options.find(o => o.value === value)?.label || 'Sort'

  return (
    <div className="sortc" ref={ref}>
      <button className={'sortc-btn' + (open ? ' open' : '')} onClick={() => setOpen(o => !o)}>
        <Icon name={dir === 'asc' ? 'sortAsc' : 'sortDesc'} size={14} className="sortc-ic" />
        <span className="sortc-l">Sort</span>
        <span className="sortc-v">{activeLabel}</span>
        <Icon name="chevDown" size={14} className="sortc-cv" />
      </button>
      <button
        className="sortc-dir"
        title={dir === 'asc' ? 'Ascending — click for descending' : 'Descending — click for ascending'}
        onClick={onDir}
      >
        <Icon name={dir === 'asc' ? 'sortAsc' : 'sortDesc'} size={14} />
      </button>
      {open && (
        <div className="popover sortc-pop">
          <div className="p-head">Sort by</div>
          {options.map(o => (
            <button
              key={o.value}
              className={'p-item' + (o.value === value ? ' on' : '')}
              onClick={() => { onSort(o.value); setOpen(false) }}
            >
              {o.label}
              {o.value === value && <Icon name="check" size={15} className="ic p-chk" />}
            </button>
          ))}
          <div className="p-sep" />
          <div className="sortc-dirs">
            <button className={'sortc-diropt' + (dir === 'asc' ? ' on' : '')} onClick={() => { if (dir !== 'asc') onDir(); setOpen(false) }}>
              <Icon name="sortAsc" size={14} />Ascending
            </button>
            <button className={'sortc-diropt' + (dir === 'desc' ? ' on' : '')} onClick={() => { if (dir !== 'desc') onDir(); setOpen(false) }}>
              <Icon name="sortDesc" size={14} />Descending
            </button>
          </div>
        </div>
      )}
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
          <tr key={r.id} className={r.selected ? 'sel' : ''} onClick={r.onClick} style={{ cursor: r.onClick ? 'pointer' : 'default' }}>
            {r.cells.map((cell, i) => (
              <td key={i} onClick={r.onClick} style={{ cursor: r.onClick ? 'pointer' : 'default' }}>{cell}</td>
            ))}
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

// ---- Property card: data-dense body. No image block. ----
export function PropertyCard({ p, onClick, matchCount }) {
  const facts = [
    p.carpet || p.area ? `${p.carpet || p.area} sqft` : null,
    p.type !== 'Plot' && p.totalFloors ? `${p.floor || '-'}/${p.totalFloors} flr` : p.floor ? `${p.floor} flr` : null,
    p.furnishing && p.furnishing !== '—' ? p.furnishing : null,
    p.facing ? `${p.facing} facing` : null
  ].filter(Boolean)

  const societyName = p.society || p.project || (p.title ? p.title.split(' - ')[0] : 'Unnamed Property')

  return (
    <button className="pcard" onClick={onClick} style={{ overflow: 'hidden', display: 'flex', flexDirection: 'column', padding: '16px', gap: 12, textAlign: 'left' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <span className="unit-tag" style={{ margin: 0 }}>{p.type || 'Property'}</span>
          <span style={{ fontSize: 11.5, fontWeight: 600, padding: '2px 8px', borderRadius: 6, background: 'var(--card-2)', color: 'var(--ink-2)', border: '1px solid var(--line)', textTransform: 'uppercase' }}>
            {p.deal === 'rent' ? 'For Rent' : 'For Sale'}
          </span>
          {p.tower && <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>Tower {p.tower}{p.unit ? ` · #${p.unit}` : ''}</span>}
        </div>
        <StatusTag status={p.status || 'Available'} />
      </div>

      <div className="pc-top" style={{ padding: 0, border: 'none' }}>
        <div className="pc-id" style={{ textAlign: 'left' }}>
          <div className="pc-title" style={{ fontSize: 16, fontWeight: 600, color: 'var(--ink)' }}>{societyName}</div>
          <div className="pc-sub" style={{ marginTop: 3, fontSize: 13, color: 'var(--muted)' }}>
            <Icon name="pin" size={13} style={{ marginRight: 4, verticalAlign: -1 }} />
            {p.locality || 'Pune'}
          </div>
        </div>
      </div>

      {facts.length > 0 && (
        <div className="pc-facts" style={{ margin: 0 }}>
          {facts.map((f, i) => <span key={i}>{f}</span>)}
        </div>
      )}

      <div className="pc-foot" style={{ borderTop: '1px solid var(--line)', paddingTop: 12, marginTop: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <span style={{ fontSize: 10.5, textTransform: 'uppercase', color: 'var(--faint)', fontWeight: 600, letterSpacing: '0.04em' }}>Quoted Price</span>
          <span style={{ fontFamily: 'var(--disp)', fontSize: 17, fontWeight: 600, color: 'var(--ink)' }}>
            {p.priceLabel || p.price || 'Price on request'}
          </span>
        </div>
        {matchCount > 0 && (
          <span className="pc-demand" style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 9px', borderRadius: 14, background: 'var(--accent-wash)', color: 'var(--accent)', fontWeight: 600, fontSize: 12 }}>
            <Icon name="people" size={14} />
            {matchCount} buyer{matchCount > 1 ? 's' : ''}
          </span>
        )}
      </div>
    </button>
  )
}

// Re-export signal atoms used when composing table cells, so modules import from one place.
export { StageTag, StatusTag, Source, Overdue, Unassigned, Avatar, Money }
