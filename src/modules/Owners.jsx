import { useEffect, useState } from 'react'
import { ListLayout } from '../layouts/layouts.jsx'
import { ModuleListView, ModuleCards, ModuleTable } from '../components/collections.jsx'
import { ModuleDetail } from '../components/ModuleDetail.jsx'
import { Button } from '../components/primitives.jsx'
import Icon from '../components/Icon.jsx'
import { initials } from '../lib/format.js'
import { canAssignLead } from '../lib/permissions.js'
import { OWNER_STATUSES } from '../data/ownerStatus.js'
import { useServerList } from '../lib/serverList.js'
import { api } from '../lib/api.js'
import { OWNERS_DEF } from './definitions.jsx'

// Segment pill counts, straight from the database — same pattern as Leads.
function useOwnersSummary(dataAsOf) {
  const [counts, setCounts] = useState({})
  useEffect(() => {
    let live = true
    api.getOwnersSummary().then(r => { if (live && r?.success) setCounts(r.summary) }).catch(() => {})
    return () => { live = false }
  }, [dataAsOf])
  return counts
}

// The project cards — same "township lens" as Properties' Group by project,
// over the cold-calling list. Clicking one filters the existing table by that
// project rather than opening a separate page: assigning/status-changing an
// owner is the same row-level UI either way, so there is nothing a dedicated
// project-detail screen would add.
function OwnerProjectGrid({ onOpen }) {
  const [rows, setRows] = useState(null)
  useEffect(() => {
    let live = true
    api.listOwnerProjects().then(r => { if (live) setRows(r?.data || []) }).catch(() => { if (live) setRows([]) })
    return () => { live = false }
  }, [])
  if (rows === null) return <div className="list-spin" role="status" aria-label="Loading"><span /></div>
  if (!rows.length) return <div className="detail-missing">No owners yet — import a list to get started.</div>
  return (
    <div className="grid-cards">
      {rows.map(pj => (
        <button key={pj.key} className="projcard" onClick={() => onOpen(pj.key)}>
          <div className="pj-head">
            <div className="pj-id">
              <div className="pj-name">{pj.name}</div>
              {pj.locality && <div className="pj-sub"><Icon name="pin" size={13} className="ic" />{pj.locality}</div>}
            </div>
            <span className="pj-count"><b>{pj.counts.total}</b> owner{pj.counts.total !== 1 ? 's' : ''}</span>
          </div>
          <div className="pj-legend">
            <span className="pj-dot avail">{pj.counts.new} to call</span>
            {pj.counts.interested > 0 && <span className="pj-dot sold">{pj.counts.interested} interested</span>}
          </div>
        </button>
      ))}
    </div>
  )
}

export default function Owners({ store, go, sel, topBar, phone }) {
  const { state } = store
  const [flt, setFlt] = useState({})
  const [q, setQ] = useState('')
  const [sortKey, setSortKey] = useState('recent')
  const [sortDir, setSortDir] = useState('desc')
  const [view, setView] = useState('projects')
  const [seg, setSeg] = useState('all')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [selOwner, setSelOwner] = useState(null)
  const [selected, setSelected] = useState(new Set())

  const role = state.role
  const canAssign = canAssignLead(role)

  const setSegP = (v) => { setSeg(v); setView('list'); setPage(1); setSelected(new Set()) }
  const setPageP = (v) => { setPage(v); setSelected(new Set()) }

  // A checked row belongs to the list it was checked in. Switching to the
  // project grid, picking a different project, or leaving one all change
  // which rows are even on screen — the selection has to clear with them, not
  // silently carry an id from Godrej into a bulk-assign run on the full list.
  useEffect(() => { setSelected(new Set()) }, [view, flt.project])

  const source = useServerList(
    (params) => api.listOwners({
      page: params.page, limit: params.limit, q: params.q,
      stage: seg === 'all' ? undefined : seg,
      project: flt.project || undefined,
      // The filter panel's own fields — same names the backend already reads
      // for listLeads, so Locality and Sales Executive behave identically.
      locality: params.locality, agent: params.agent,
      sortKey: params.sortKey, sortDir: params.sortDir,
    }),
    { filters: flt, search: q, sortKey, sortDir, page, pageSize },
    [state.dataAsOf, seg, flt.project],
  )

  const counts = useOwnersSummary(state.dataAsOf)
  const segs = [
    { key: 'all', label: 'All', on: seg === 'all', count: counts.total ?? 0, onClick: () => setSegP('all') },
    ...OWNER_STATUSES.map(s => ({
      key: s, label: s, on: seg === s, count: counts.byStage?.[s] ?? 0, onClick: () => setSegP(s),
    })),
  ]

  const open = (o) => {
    store.cacheRecords('owner', [o])
    setSelOwner(o)
  }

  const bulkAssign = () => store.openModal({
    kind: 'bulkAssign', leadIds: [...selected], isOwner: true,
    onDone: () => setSelected(new Set()),
  })

  if (selOwner) {
    const live = store.lookup('owner', selOwner.id) || selOwner
    return (
      <>
        {topBar({ eyebrow: 'Owners', title: live.name || 'Unnamed owner', onBack: () => setSelOwner(null) })}
        <div className="app-body">
          <ModuleDetail
            def={OWNERS_DEF} record={live} store={store}
            avatar={<span className="av av-lg av-supply">{initials(live.name || live.phone || '?')}</span>}
            onEdit={() => store.openModal({ kind: 'editOwner', ownerId: live.id })}
            actionCtx={{ onClose: () => setSelOwner(null) }}
          />
        </div>
      </>
    )
  }

  const { header, toolbar, body } = ModuleListView({
    def: OWNERS_DEF, source, store, onOpen: open,
    filters: flt, onFilters: (v) => { setFlt(v); setPage(1) },
    search: q, onSearch: (v) => { setQ(v); setPage(1) },
    sortKey, onSortKey: (v) => { setSortKey(v); setPage(1) }, sortDir, onSortDir: (v) => { setSortDir(v); setPage(1) },
    segments: segs, view, onView: setView,
    page, onPage: view === 'projects' ? undefined : setPageP, pageSize, onPageSize: view === 'projects' ? undefined : setPageSize,
    showViewSwitch: false,
    // One control at a time, not two that can disagree: inside a project, the
    // chip itself is the way back (× returns to the grid, same as clicking
    // "Group by project" used to try to do) — showing both together read as
    // two disconnected buttons, and neither obviously undid the other.
    toolbarRight: flt.project ? (
      <span className="proj-chip">
        <span className="proj-chip-t">{flt.project === '_none' ? 'No project' : flt.project}</span>
        <button onClick={() => { setFlt({ ...flt, project: undefined }); setView('projects') }}><Icon name="x" size={12} /></button>
      </span>
    ) : (
      <button className={'grp-toggle' + (view === 'projects' ? ' on' : '')}
        onClick={() => setView(view === 'projects' ? 'list' : 'projects')}>
        <Icon name="building" size={14} />Group by project
      </button>
    ),
    cta: { label: 'New owner', onClick: () => store.openModal({ kind: 'newOwner' }) },
    emptyTitle: 'No owners match', emptyHint: 'Adjust the filter or search, or import a list.',
    renderTable: (list, v) => v === 'projects'
      ? <OwnerProjectGrid onOpen={(key) => { setFlt({ ...flt, project: key === 'No project' ? '_none' : key }); setView('list') }} />
      : v === 'grid'
        ? <ModuleCards def={OWNERS_DEF} rows={list} store={store} onOpen={open} phone={phone} />
        : <ModuleTable def={OWNERS_DEF} rows={list} store={store} onOpen={open} sortKey={sortKey} sortDir={sortDir} onSort={(v) => { setSortKey(v); setPage(1) }}
            selectable={canAssign} selectedIds={selected} onSelectionChange={setSelected} />,
  })

  return (
    <>
      {topBar({
        title: 'Owners',
        actions: phone ? null : <Button variant="secondary" size="sm" icon="layers" onClick={() => go('import', { kind: 'owners' })}>Import</Button>
      })}
      {header}
      {canAssign && view === 'list' && selected.size > 0 && (
        <div className="selbar">
          <span className="selbar-count">{selected.size} selected</span>
          <div className="selbar-actions">
            <Button variant="primary" size="sm" onClick={bulkAssign}>Bulk assign</Button>
            <Button variant="quiet" size="sm" onClick={() => setSelected(new Set())}>Clear</Button>
          </div>
        </div>
      )}
      <ListLayout toolbar={toolbar}>{body}</ListLayout>
    </>
  )
}
