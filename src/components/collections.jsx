// Collection components: Toolbar (the ONE filter/sort bar), Table, ListRow, Card grid.
import { useState, useEffect, useRef } from 'react'
import Icon from './Icon.jsx'
import { StageTag, StatusTag, Source, Overdue, Unassigned, Avatar, Money, NewTag, Quoted, PageHeader, ViewSwitch, Pager, Button } from './primitives.jsx'
import { quotedLine, unitLabel } from '../lib/format.js'
import { priceRangeLabel } from '../lib/projects.js'
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
  kpis, segments, leftAddon, view, onView, viewExtra, showViewSwitch = true, cta, toolbarRight, emptyTitle, emptyHint, renderTable, selection,
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
  const header = ((!phone && kpis?.length) || segments || leftAddon)
    // [] not null — a default parameter only fills in for undefined, so null
    // sailed past `kpis = []` and PageHeader read .length off it.
    ? <PageHeader kpis={phone ? [] : kpis} segments={segments} leftAddon={leftAddon} />
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
            {renderTable ? renderTable(phoneList, 'grid') : <ModuleCards def={def} rows={phoneList} store={store} onOpen={onOpen} phone={phone} />}
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
      selection={selection}
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
// On a phone a module may declare `phoneCard` (a compact row layout, in place
// of the desktop grid tile) and `phoneActions` (what the row can do).
//
// The actions used to render as a fixed column on the RIGHT of the row, with
// the text squeezed into whatever was left. That was wrong twice over: three
// buttons took 120px of a 390px screen so the text ran out of the card, and the
// buttons sat vertically centred against a three-line block, leaving a tall
// empty column beside them. So the row now gets the FULL width for its text and
// the definition places the actions itself — the layout is the module's, the
// list of actions is still the definition's, and there is still exactly one
// place that says what a lead row can do.
//
// A row with actions can't be a <button> that wraps another <button> — nested
// buttons are invalid HTML and the browser silently closes the outer one early
// — so it renders as a clickable div, with the actions stopping their own click
// from also opening the record.
export function ModuleCards({ def, rows, store, onOpen, phone }) {
  if (!def.card) return <ModuleTable def={def} rows={rows} store={store} onOpen={onOpen} />
  // A phone module that declares a row renders as a LIST — one panel, hairline
  // dividers — not as a column of separate floating cards with air between
  // them. Detached cards read as a grid that lost its second column.
  const asList = Boolean(phone && def.phoneCard)
  return (
    <div className={'grid-cards' + (asList ? ' cardlist' : '')}>
      {rows.map(rec => {
        const actions = phone && def.phoneActions ? def.phoneActions(rec, store) : []
        if (asList) {
          const actionBar = actions.length > 0 ? (
            <div className="rcard-actions" onClick={e => e.stopPropagation()}>
              {actions.map(a => (
                <Button
                  key={a.key || a.icon}
                  // Same order of prominence the record header uses: the call
                  // is the accent, WhatsApp is the black one beside it.
                  variant={a.key === 'call' ? 'primary' : a.tone === 'wa' ? 'secondary' : 'ghost'}
                  size="sm"
                  aria-label={a.label} title={a.label} onClick={a.onClick}
                >
                  <Icon name={a.icon} size={16} />
                </Button>
              ))}
            </div>
          ) : null
          return (
            <div key={rec.id} className="rcard rcard-row" role="button" tabIndex={0}
              onClick={onOpen ? () => onOpen(rec) : undefined}
              onKeyDown={onOpen ? (e) => { if (e.key === 'Enter') onOpen(rec) } : undefined}>
              {def.phoneCard(rec, store, actionBar)}
            </div>
          )
        }
        return (
          <button key={rec.id} className="rcard" onClick={onOpen ? () => onOpen(rec) : undefined}>
            {def.card(rec, store)}
          </button>
        )
      })}
    </div>
  )
}

// ---- ModuleTable: renders a definition's columns[] against records. ----
// `selectable` + `selectedIds`/`onSelectionChange` add an optional leading
// checkbox column (header select-all-on-this-page, shift-click range select).
// `def.rowActions(record, store, ctx)` — if the definition declares it — adds
// a trailing actions column. Both are opt-in per module, driven entirely by
// what the caller passes, so a module that doesn't need them renders exactly
// the plain table it always did.
export function ModuleTable({ def, rows, store, onOpen, sortKey, sortDir, onSort, selectable, selectedIds, onSelectionChange }) {
  const lastIndex = useRef(null)
  const selected = selectedIds || new Set()
  const allOn = selectable && rows.length > 0 && rows.every(r => selected.has(r.id || r._id))
  const someOn = selectable && rows.some(r => selected.has(r.id || r._id))

  const toggleAll = () => {
    if (!onSelectionChange) return
    onSelectionChange(allOn ? new Set() : new Set(rows.map(r => r.id || r._id)))
  }
  // Shift-click extends the last click into a range, same on/off state as the
  // row that was shift-clicked — the affordance every spreadsheet-like table
  // already trains people to expect.
  const toggleRow = (id, idx, shiftKey) => {
    if (!onSelectionChange) return
    const next = new Set(selected)
    if (shiftKey && lastIndex.current != null) {
      const [from, to] = [lastIndex.current, idx].sort((a, b) => a - b)
      const turnOn = !next.has(id)
      for (let i = from; i <= to; i++) {
        const rid = rows[i]?.id || rows[i]?._id
        if (rid == null) continue
        if (turnOn) next.add(rid); else next.delete(rid)
      }
    } else {
      next.has(id) ? next.delete(id) : next.add(id)
    }
    lastIndex.current = idx
    onSelectionChange(next)
  }

  const columns = [
    // A <label> wrapping the <input>, not a <div> with a hand-rolled click
    // handler. The div version put its own onClick on the INPUT to stop the
    // click reaching the row (so opening the record didn't fire) — but that
    // same handler did nothing else, so a click landing exactly on the
    // checkbox square stopped right there and never toggled anything. Only
    // the div's padding around it worked. A <label> toggles its input on any
    // click inside it natively; the actual state change moves to onChange,
    // which fires reliably wherever the click landed.
    ...(selectable ? [{ key: '__select', label: (
      <label className="table-sel-cell" onClick={e => e.stopPropagation()}>
        <input type="checkbox" checked={allOn} ref={el => { if (el) el.indeterminate = !allOn && someOn }} onChange={toggleAll} />
      </label>
    ), sortable: false }] : []),
    ...def.columns.map(c => ({ key: c.key, label: c.label, sortable: c.sortable })),
    ...(def.rowActions ? [{ key: '__actions', label: '', sortable: false }] : []),
  ]
  const tableRows = rows.map((rec, idx) => {
    const id = rec.id || rec._id
    return {
      id,
      onClick: onOpen ? () => onOpen(rec) : undefined,
      cells: [
        ...(selectable ? [
          // React fires a checkbox's onChange off the underlying native click,
          // so e.nativeEvent still carries shiftKey here — same range-select
          // behaviour as before, now triggered by every click in the label,
          // not only ones that miss the input.
          <label key="__sel" className="table-sel-cell" onClick={e => e.stopPropagation()}>
            <input type="checkbox" checked={selected.has(id)}
              onChange={e => toggleRow(id, idx, !!e.nativeEvent?.shiftKey)} />
          </label>
        ] : []),
        ...def.columns.map(c => c.render ? c.render(rec, store) : getNestedValue(rec, c.key)),
        ...(def.rowActions ? [
          <span key="__act" className="row-actions" onClick={e => e.stopPropagation()}>{def.rowActions(rec, store, { onOpen })}</span>
        ] : []),
      ],
    }
  })
  return <Table columns={columns} rows={tableRows} sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
}

// ---- SelectDropdown: a labelled single-value dropdown (lead type, status…). ----
// Same popover system as SortControl/FilterBar so a third control still reads
// as the same toolbar language, not a bespoke widget.
export function SelectDropdown({ value, options, onChange, label, align }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  useEffect(() => {
    if (!open) return
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [open])
  const active = options.find(o => o.value === value)
  return (
    <div className="seldd" ref={ref}>
      <button className={'seldd-btn' + (open ? ' open' : '')} onClick={() => setOpen(o => !o)}>
        <span className="seldd-l">{label}</span>
        <span className="seldd-v">{active?.label ?? value}</span>
        <Icon name="chevDown" size={14} className="seldd-cv" />
      </button>
      {open && (
        <div className={'popover seldd-pop' + (align === 'right' ? ' right' : '')}>
          {options.map(o => (
            <button key={o.value} className={'p-item' + (o.value === value ? ' on' : '')} onClick={() => { onChange(o.value); setOpen(false) }}>
              <span className="fvp-lbl">{o.label}</span>
              {o.count != null && <span className="count-badge">{o.count}</span>}
              {o.value === value && <Icon name="check" size={15} className="ic p-chk" />}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ---- QuickAssignMenu: assign/unassign one record from a row, no modal. ----
// Reuses bulkAssignLeads with a single id — one code path for one row and for
// a whole selection, rather than a separate single-assign endpoint.
export function QuickAssignMenu({ agents, currentId, onAssign, children, className, title }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  useEffect(() => {
    if (!open) return
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [open])
  return (
    <div className="qam" ref={ref}>
      {/* `children` makes the trigger the caller's own content — the owner cell
          passes the person's name and avatar, so the thing you click to change
          the owner IS the owner, rather than an unlabelled + button parked in a
          separate column while the name sits somewhere else. */}
      {/* stopPropagation: this used to only ever sit inside a rowActions cell
          that already stopped propagation around it (ModuleTable's
          `row-actions` span). Moving OwnerCell into a plain data column, with
          no such wrapper, meant a click here also reached the <td>'s own
          onClick and opened the record — so clicking "Reassign" navigated
          away before the popover was ever visible. */}
      <button className={(className || 'qam-btn') + (open ? ' open' : '')}
        title={title || 'Change owner'}
        onClick={e => { e.stopPropagation(); setOpen(o => !o) }}>
        {children || <Icon name="userPlus" size={14} />}
      </button>
      {open && (
        // Same reason as the trigger — this sits inside the same table cell,
        // so a click on any item here would otherwise also open the record.
        <div className="popover qam-pop right" onClick={e => e.stopPropagation()}>
          {agents.map(a => (
            <button key={a.id} className={'p-item' + (currentId === a.id ? ' on' : '')} onClick={() => { onAssign(a.id); setOpen(false) }}>
              {a.first}
            </button>
          ))}
          {currentId && (
            <button className="p-item danger" onClick={() => { onAssign(null); setOpen(false) }}>
              Unassign
            </button>
          )}
        </div>
      )}
    </div>
  )
}

/**
 * Who owns this record, and the control to change it — one cell, four honest
 * states. It used to be two things in two places: a Sales Executive column that
 * rendered `<Unassigned/>` whenever it could not resolve the id, and a separate
 * trailing column holding a bare + button. So a lead assigned to someone who
 * left showed "Unassigned" next to an add icon, and nowhere on the row did it
 * say who actually had it.
 *
 *   nobody            → "Assign", and it is the invitation to do so
 *   an active person  → their avatar and name
 *   someone who left  → their name, marked, because the lead needs rehoming
 *   an id we can't resolve at all → "Former owner", never a blank
 */
export function OwnerCell({ record, store, onAssign, canAssign }) {
  const owner = store.agentById(record.agentId)
  const orphaned = !!record.agentId && !owner
  const body = !record.agentId
    ? <span className="own-none"><Icon name="userPlus" size={13} />Assign</span>
    : owner
      ? <span className={'own-who' + (owner.departed ? ' gone' : '')}>
          <Avatar agent={owner} size="sm" />
          <span className="own-name">{owner.first || owner.name}</span>
          {owner.departed && <span className="own-tag">left</span>}
        </span>
      : <span className="own-who gone"><span className="own-name">Former owner</span></span>

  if (!canAssign) return <span className="own-cell">{body}</span>
  return (
    <QuickAssignMenu
      agents={store.activeAgents()} currentId={record.agentId} onAssign={onAssign}
      className={'own-cell own-btn' + (orphaned || (owner && owner.departed) ? ' own-alert' : '')}
      title={record.agentId ? 'Change owner' : 'Assign owner'}
    >
      {body}
      {/* A name with no affordance next to it reads as a printed fact. The
          caret is the only thing telling a manager this cell reassigns. */}
      <Icon name="chevDown" size={13} className="ic own-caret" />
    </QuickAssignMenu>
  )
}

/**
 * The stage tag, and the control to change it — one cell, so the row itself
 * can move a lead instead of forcing a trip into the detail page for a
 * one-field change. Read-only (a bare tag) for anyone `canSet` refuses,
 * matching the same gate the detail page's status dropdown already uses.
 */
export function StageCell({ record, store, stages, canSet, onSet, onReject }) {
  const [open, setOpen] = useState(false)
  // Which edge the menu hangs from. The popover is ~210px wide and was always
  // anchored left:0 to a button only as wide as its own label — so on a short
  // status like "New", in the right-hand status column, it ran off the screen.
  // A longer label pushed the button left and hid the bug. Measured rather than
  // assumed, because the same cell renders on a phone card too.
  const [align, setAlign] = useState('left')
  const ref = useRef(null)
  useEffect(() => {
    if (!open) return
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [open])
  useEffect(() => {
    if (!open || !ref.current) return
    const box = ref.current.getBoundingClientRect()
    // 210px is the popover's min-width; 12px keeps it off the viewport edge.
    setAlign(box.left + 210 + 12 > window.innerWidth ? 'right' : 'left')
  }, [open])
  if (!canSet) return <StageTag stage={record.stage} />
  return (
    <div className="stg-cell" ref={ref}>
      <button className={'stg-btn' + (open ? ' open' : '')} onClick={e => { e.stopPropagation(); setOpen(o => !o) }}>
        <StageTag stage={record.stage} />
        <Icon name="chevDown" size={12} className="stg-cv" />
      </button>
      {open && (
        <div className={'popover stg-pop' + (align === 'right' ? ' right' : '')} onClick={e => e.stopPropagation()}>
          {stages.map(s => (
            <button key={s} className={'p-item' + (s === record.stage ? ' on' : '')} onClick={() => { onSet(s); setOpen(false) }}>
              {s}
            </button>
          ))}
          {/* Rejecting is a status change like any other, so it belongs in the
              status menu — it was reachable only from the detail rail, which
              meant working down a list you had to open each dead lead to close
              it. Separated and toned because it is the one entry that asks a
              question back (the reason) instead of just setting a value. */}
          {onReject && (
            <>
              <div className="p-sep" />
              <button className="p-item danger" onClick={() => { setOpen(false); onReject(record) }}>
                <span className="p-ic"><Icon name="x" size={14} /></span>
                Mark as rejected
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
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

// `selection` turns this bar into the selection bar rather than adding a second
// one above it. Two bands meant the controls that reshuffle the list (search,
// filter, sort, view) stayed live next to a count of rows selected out of that
// list — so changing a filter silently left ids selected that were no longer on
// screen. Taking the controls away while a selection is live states the rule
// instead of documenting it: finish the selection, or clear it and re-filter.
export function FilterBar({ fields = [], value = {}, onChange, search, right, cta, selection }) {
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

  if (selection?.count > 0) {
    return (
      <div className="fbar fbar-sel">
        <span className="fsel-n">{selection.count} selected</span>
        <span className="fsel-hint">Filters and sort are paused while rows are selected</span>
        <div className="u-spring" />
        {(selection.actions || []).map(a => (
          <button key={a.label} className="btn btn-primary btn-sm" onClick={a.onClick}>
            {a.icon && <Icon name={a.icon} size={15} />}{a.label}
          </button>
        ))}
        <button className="f-clear" onClick={selection.onClear}>Clear</button>
      </div>
    )
  }

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
          <span className="pj-price">{priceRangeLabel(priceRange) || '—'}</span>
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
