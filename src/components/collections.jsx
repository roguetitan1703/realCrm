// Collection components: Toolbar (the ONE filter/sort bar), Table, ListRow, Card grid.
import { useState, useEffect, useRef } from 'react'
import Icon from './Icon.jsx'
import { StageTag, StatusTag, Source, Overdue, Unassigned, Avatar, Money, NewTag, Quoted, PageHeader, ViewSwitch, Pager } from './primitives.jsx'
import { quotedLine, unitLabel } from '../lib/format.js'
import { getNestedValue } from './ModuleFields.jsx'

// ---- SearchField: a text input that reports value AFTER a short pause. ----
// The box itself is an uncontrolled-feeling local buffer so every keystroke
// lands instantly; `onChange` (which drives the actual filter + a page reset)
// fires only once typing settles. Without this, filtering on every keystroke
// against a click-away-prone popover made fast typing feel like it was being
// fought — the "grace to type" the search needed.
function SearchField({ value, onChange, placeholder, className, iconSize = 15, ...inputProps }) {
  const [local, setLocal] = useState(value)
  const first = useRef(true)
  useEffect(() => { setLocal(value) }, [value])
  useEffect(() => {
    if (first.current) { first.current = false; return }
    if (local === value) return
    const t = setTimeout(() => onChange(local), 300)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [local])
  const clear = () => { setLocal(''); onChange('') }
  return (
    <div className={className}>
      <Icon name="search" size={iconSize} />
      <input value={local} onChange={e => setLocal(e.target.value)} placeholder={placeholder} {...inputProps} />
      {local && <button className="cx" onClick={clear} title="Clear" aria-label="Clear search"><Icon name="x" size={iconSize - 2} /></button>}
    </div>
  )
}

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
// The only thing shown when a list has no rows YET. Deliberately not a skeleton:
// a skeleton claims a layout before the data can support it, and it is the same
// wall of grey whether one row is coming or two hundred.
function ListSpinner() {
  return <div className="list-spin" role="status" aria-label="Loading"><span /></div>
}

export function ModuleListView({
  def, records, store, onOpen,
  filters, onFilters, search, onSearch, sortKey, onSortKey, sortDir, onSortDir,
  kpis, segments, view, onView, viewExtra, showViewSwitch = true, cta, toolbarRight, emptyTitle, emptyHint, renderTable,
  phone, page = 1, onPage, pageSize = 20, onPageSize, source,
}) {
  // Two sources, one surface. `records` is the classic in-memory collection,
  // queried here. `source` is a page the SERVER already filtered, sorted and cut
  // — used by modules whose collection is too big to hold in a browser, which is
  // every module once a real firm's book is in it. Filters, search, sort and the
  // pager are identical either way; only who did the work changes.
  const server = !!source
  const list = server
    ? (source.rows || [])
    : runModuleQuery(def, records, { filters, search, sortKey, sortDir, store })
  const total = server ? (source.total || 0) : list.length
  const pageCount = Math.max(1, Math.ceil(total / pageSize))
  // A server page is already the page; an in-memory list still has to be cut.
  const cut = (from, to) => (server ? list : list.slice(from, to))
  const loading = server && source.loading

  const fields = typeof def.filterFields === 'function' ? def.filterFields(store) : (def.filterFields || [])
  const sortOptions = def.sortOptions.map(s => ({ value: s.key, label: s.label }))

  // Lean in-page header: module KPIs (left) + scope segments (right). NOT the breadcrumb.
  // KPIs are dropped on a phone: a row of numbers costs a third of the screen
  // and the segment pills below already carry the same counts, tappable.
  const header = ((!phone && kpis?.length) || segments)
    // [] not null — a default parameter only fills in for undefined, so null
    // sailed past `kpis = []` and PageHeader read .length off it.
    ? <PageHeader kpis={phone ? [] : kpis} segments={segments} />
    : null

  // On a phone the desktop bar does not shrink — it wraps into three rows of
  // popovers that open off the edge of the screen. Filter and sort move into
  // one bottom sheet, which is where a thumb expects them.
  if (phone) {
    // Cumulative reveal, not page-jump: a numbered pager asks for a precise tap
    // a thumb can't reliably make. "Load more" only ever grows the list, so the
    // scroll position a thumb already found never gets pulled out from under it.
    // On a server source the rows ARE the accumulation (the hook appends each
    // page), so there is nothing to cut — and `more` comes from the true total,
    // not from the length of what happens to be downloaded.
    const shown = server ? list.length : (onPage ? Math.min(page * pageSize, list.length) : list.length)
    const phoneList = server ? list : list.slice(0, shown)
    const more = total - shown
    return {
      header,
      toolbar: (
        <PhoneToolbar
          def={def} fields={fields} filters={filters} onFilters={onFilters}
          search={search} onSearch={onSearch}
          sortKey={sortKey} onSortKey={onSortKey} sortDir={sortDir} onSortDir={onSortDir}
          sortOptions={sortOptions} resultCount={total}
        />
      ),
      // One layout, no switch. A table needs a horizontal scroll to be read on
      // a 390px screen, and choosing between two bad options is not a feature.
      // "Nothing matches" is a claim about the data. It must not be made while
      // the answer is still in flight, or the first frame of every search reads
      // as no results.
      body: list.length === 0
        ? (loading
            ? <ListSpinner />
            : <div className="empty"><div className="e-t">{emptyTitle || `No ${def.name.toLowerCase()} match`}</div><div className="e-s">{emptyHint || 'Try clearing a filter or search.'}</div></div>)
        : <>
            {renderTable ? renderTable(phoneList, 'grid') : <ModuleCards def={def} rows={phoneList} store={store} onOpen={onOpen} />}
            {more > 0 && (
              <button className="btn btn-secondary btn-block loadmore" disabled={loading} onClick={() => onPage(page + 1)}>
                {loading ? 'Loading…' : `Load ${Math.min(more, pageSize)} more`}
              </button>
            )}
          </>,
      list,
    }
  }

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
        {onView && showViewSwitch && <ViewSwitch value={view} onChange={onView} extra={viewExtra} />}
      </>}
      cta={cta}
    />
  )

  const pageList = onPage ? cut((page - 1) * pageSize, page * pageSize) : list

  const body = list.length === 0
    ? (loading
        ? <ListSpinner />
        : <div className="empty"><div className="e-t">{emptyTitle || `No ${def.name.toLowerCase()} match`}</div><div className="e-s">{emptyHint || 'Try clearing a filter or search.'}</div></div>)
    // While a new page loads, the rows already on screen stay put and only fade.
    // Replacing them with skeletons throws away readable data to show a shape.
    : <div className={'list-body' + (loading ? ' is-loading' : '')}>
        {renderTable
          ? renderTable(pageList, view)
          : <ModuleTable def={def} rows={pageList} store={store} onOpen={onOpen} sortKey={sortKey} sortDir={sortDir} onSort={onSortKey} />}
        {onPage && <Pager page={page} pageCount={pageCount} onPage={onPage} total={total} pageSize={pageSize} onPageSize={onPageSize} />}
      </div>

  return { header, toolbar, body, list, total }
}

// ---- PhoneToolbar: search always visible, filter + sort in one bottom sheet ----
// Same definition, same query brain, same state as the desk — only the surface
// differs. A chip is a 40px tap target; the desk's nested popovers are not.
function PhoneToolbar({
  def, fields, filters, onFilters, search, onSearch,
  sortKey, onSortKey, sortDir, onSortDir, sortOptions, resultCount,
}) {
  const [sheet, setSheet] = useState(false)
  const activeCount = fields.reduce((n, f) => n + ((filters[f.key] || []).length ? 1 : 0), 0)

  const toggle = (f, v) => {
    const cur = filters[f.key] || []
    const has = cur.includes(v)
    const next = f.multi === false ? (has ? [] : [v]) : (has ? cur.filter(x => x !== v) : [...cur, v])
    onFilters({ ...filters, [f.key]: next })
  }

  return (
    <>
      <div className="ptool">
        <SearchField
          className="ptool-search" value={search} onChange={onSearch} iconSize={16}
          placeholder={`Search ${def.name.toLowerCase()}`}
          type="search" enterKeyHint="search" autoCorrect="off" autoCapitalize="none"
        />
        <button className={'ptool-btn' + (activeCount ? ' on' : '')} onClick={() => setSheet(true)}>
          <Icon name="filter" size={16} />
          {activeCount ? <span className="ptool-n">{activeCount}</span> : null}
        </button>
      </div>

      {sheet && (
        <>
          <div className="sheet-back" onClick={() => setSheet(false)} />
          <div className="sheet" role="dialog" aria-label="Filter and sort">
            <div className="sheet-grab" />
            <div className="sheet-head">
              <span>Filter &amp; sort</span>
              {activeCount > 0 && <button className="sheet-clear" onClick={() => onFilters({})}>Clear all</button>}
            </div>

            <div className="sheet-body">
              <div className="sheet-group">
                <div className="sheet-label">Sort by</div>
                <div className="chiprow">
                  {sortOptions.map(o => (
                    <button key={o.value} className={'chipo' + (o.value === sortKey ? ' on' : '')} onClick={() => onSortKey(o.value)}>
                      {o.label}
                    </button>
                  ))}
                </div>
                <div className="chiprow">
                  <button className={'chipo' + (sortDir === 'asc' ? ' on' : '')} onClick={() => sortDir !== 'asc' && onSortDir('asc')}>
                    <Icon name="sortAsc" size={13} />Ascending
                  </button>
                  <button className={'chipo' + (sortDir === 'desc' ? ' on' : '')} onClick={() => sortDir !== 'desc' && onSortDir('desc')}>
                    <Icon name="sortDesc" size={13} />Descending
                  </button>
                </div>
              </div>

              {fields.map(f => (
                <div className="sheet-group" key={f.key}>
                  <div className="sheet-label">{f.label}</div>
                  <div className="chiprow wrap">
                    {(f.options || []).map(o => {
                      const on = (filters[f.key] || []).includes(o.value)
                      return (
                        <button key={o.value} className={'chipo' + (on ? ' on' : '')} onClick={() => toggle(f, o.value)}>
                          {o.label ?? o.value}
                        </button>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>

            <div className="sheet-foot">
              <button className="sheet-go" onClick={() => setSheet(false)}>
                Show {resultCount} {resultCount === 1 ? def.singularName?.toLowerCase() || 'result' : def.name.toLowerCase()}
              </button>
            </div>
          </div>
        </>
      )}
    </>
  )
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
// Preserves declaration order of both the groups and the fields inside them.
// A module that declares no groups gets exactly the flat list it had before.
function groupFields(fields) {
  const order = []
  const byGroup = new Map()
  for (const f of fields) {
    const g = f.group || ''
    if (!byGroup.has(g)) { byGroup.set(g, []); order.push(g) }
    byGroup.get(g).push(f)
  }
  return order.map(g => [g, byGroup.get(g)])
}

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
        <SearchField className="f-search" value={search.value} onChange={search.onChange} placeholder={search.placeholder || 'Search…'} iconSize={15} />
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
              {/* Grouped when the module says so. A flat list of eleven filters
                  is a list you read; four short groups is a list you scan. */}
              {groupFields(fields).map(([groupName, items]) => (
                <div key={groupName || '_'}>
                  <div className="p-head">{groupName || 'Filter by'}</div>
                  {items.map(f => (
                    <button key={f.key} className={'p-item' + ((value[f.key] || []).length ? ' on' : '')} onClick={() => setOpen(f.key)}>
                      <span className="p-ic"><Icon name={f.icon || 'tag'} size={16} /></span>{f.label}
                      {(value[f.key] || []).length ? <Icon name="check" size={15} className="ic p-chk" /> : null}
                    </button>
                  ))}
                </div>
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

// ---- Project card: aggregates a township/society's units into one tile. ----
// Rendered in the Properties "group by project" view; opens the project detail.
export function ProjectCard({ project, onClick }) {
  const { name, locality, developer, wings, counts, priceRange, independent } = project
  return (
    <button className={'projcard' + (independent ? ' indep' : '')} onClick={onClick}>
      <div className="pj-head">
        <div className="pj-id">
          <div className="pj-name">{name}</div>
          <div className="pj-sub">
            <Icon name="pin" size={13} className="ic" />{locality}
            {developer ? <span className="pj-dev"> · {developer}</span> : null}
          </div>
        </div>
        <span className="pj-count"><b>{counts.total}</b> unit{counts.total !== 1 ? 's' : ''}</span>
      </div>

      <div className="pj-meter">
        <div className="pj-bar">
          <i className="avail" style={{ width: Math.round((counts.available / Math.max(1, counts.total)) * 100) + '%' }} />
        </div>
        <div className="pj-legend">
          <span className="pj-dot avail">{counts.available} available</span>
          {counts.sold > 0 && <span className="pj-dot sold">{counts.sold} sold</span>}
          {wings.length > 0 && <span className="pj-wings">{wings.length} wing{wings.length > 1 ? 's' : ''}</span>}
        </div>
      </div>

      <div className="pj-foot">
        <div>
          <span className="pj-flabel">Price range</span>
          <span className="pj-price">{priceRange.label}</span>
        </div>
        <Icon name="chevRight" size={16} className="ic pj-go" />
      </div>
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
            {p.locality || '—'}
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
