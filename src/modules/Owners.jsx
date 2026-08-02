import { useEffect, useState } from 'react'
import { ListLayout } from '../layouts/layouts.jsx'
import { ModuleListView, ModuleCards, ModuleTable, SelectDropdown } from '../components/collections.jsx'
import { ModuleDetail } from '../components/ModuleDetail.jsx'
import { Button, Overdue, Timeline } from '../components/primitives.jsx'
import Icon from '../components/Icon.jsx'
import { initials, callbackSignal, relTime } from '../lib/format.js'
import { canAssignLead } from '../lib/permissions.js'
import { OWNER_STATUSES } from '../data/ownerStatus.js'
import { useServerList } from '../lib/serverList.js'
import { useServerData } from '../lib/useServerData.js'
import { api } from '../lib/api.js'
import { OWNERS_DEF } from './definitions.jsx'

// Segment pill counts, straight from the database — same pattern as Leads.
function useOwnersSummary(dataAsOf, mine) {
  const [counts, setCounts] = useState({})
  useEffect(() => {
    let live = true
    api.getOwnersSummary(mine).then(r => { if (live && r?.success) setCounts(r.summary) }).catch(() => {})
    return () => { live = false }
  }, [dataAsOf, mine])
  return counts
}

// The pills are the queue, not the status list.
//
// Six status pills answered "how many are marked Contacted", which is a report.
// A caller opening this screen is asking "what do I dial next", and the answer
// is ordered: anyone already late, anyone due today, then the ones nobody has
// tried. Status is still reachable — it is the second row of pills — but it is
// no longer what the screen opens on.
const QUEUE_SEGMENTS = [
  { key: 'callbacks_overdue', label: 'Late callbacks', count: 'callbacksOverdue', tone: 'alert' },
  { key: 'callbacks_today', label: 'Due today', count: 'callbacksToday' },
  { key: 'to_call', label: 'Never called', count: 'toCall' },
  { key: 'callbacks', label: 'All callbacks', count: 'callbacksUpcoming' },
  { key: 'unassigned', label: 'Unassigned', count: 'unassigned' },
]

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

// The record a caller works from. Its own component (not a branch inside
// Owners) because it holds hooks of its own — rendering it from partway through
// the list component would change the hook count between the two views.
function OwnerRecord({ store, ownerId, topBar, phone, onBack }) {
  const cached = store.lookup('owner', ownerId)
  // Reload or a deep link lands here with nothing cached. Fetching also gets
  // the timeline, which the list rows never carry.
  const { data: fetched } = useServerData(
    () => api.getOwner(ownerId).then(r => r?.owner || null),
    [ownerId, store.state.dataAsOf], null)
  const o = fetched || cached
  if (!o) {
    return (
      <>
        {topBar({ eyebrow: 'Calling', title: 'Owner', onBack })}
        <div className="app-body"><div className="list-spin" role="status" aria-label="Loading"><span /></div></div>
      </>
    )
  }

  const contact = (channel) => store.openModal({
    kind: 'contact', channel, name: o.name, phone: o.phone, email: o.email,
    recordType: 'owner', recordId: o.id,
  })
  const cb = callbackSignal(o.callbackAt)

  // The callback card is this module's follow-up card: the one piece of state a
  // cold call produces that has to survive until the next one.
  const callbackCard = (
    <div className="fu-card">
      <div className="fu-h"><Icon name="phone" size={13} className="ic" />Callback</div>
      {o.callbackAt ? (
        <div className="fu-body">
          <div className="fu-main">
            <div className="fu-title">{o.callbackNote || 'Call back'}</div>
            <div className={'fu-when' + (cb?.tone === 'overdue' ? ' is-late' : '')}>{cb?.label}</div>
          </div>
          <button className="btn btn-ghost btn-sm fu-done" onClick={() => store.setOwnerCallback(o.id, null)}>Done</button>
        </div>
      ) : (
        <div className="detail-empty">
          {o.lastCallAt ? `Last called ${relTime(o.lastCallAt)}. No callback set.` : 'Not called yet.'}
        </div>
      )}
      <Button variant="secondary" size="sm" block icon="calendar"
        onClick={() => store.openModal({ kind: 'ownerCallback', ownerId: o.id })}>
        {o.callbackAt ? 'Reschedule callback' : 'Schedule callback'}
      </Button>
    </div>
  )

  return (
    <>
      {topBar({ eyebrow: 'Calling', title: o.name || 'Unnamed owner', onBack })}
      <div className="app-body">
        <ModuleDetail
          def={OWNERS_DEF} record={o} store={store} phone={phone}
          avatar={<span className="av av-lg av-supply">{initials(o.name || o.phone || '?')}</span>}
          signals={cb?.tone === 'overdue' ? <Overdue>Callback {cb.label}</Overdue> : null}
          onEdit={phone ? undefined : () => store.openModal({ kind: 'editOwner', ownerId: o.id })}
          // Same reasoning as a lead: reaching the person is why this page is
          // open, so it is full width on the record rather than behind a menu.
          primary={[
            ...(o.phone ? [
              { label: 'Call', icon: 'phone', onClick: () => contact('call') },
              { label: 'WhatsApp', icon: 'wa', tone: 'wa', onClick: () => contact('wa') },
            ] : []),
            ...(o.email ? [{ label: 'Email', icon: 'mail', onClick: () => contact('email') }] : []),
          ]}
          railTop={callbackCard}
          sections={[{
            id: 'timeline',
            title: 'Call history',
            render: () => <Timeline events={o.timeline || []} agents={store.state.agents}
              currentUserId={store.state.activeAgentId}
              onEditRemark={(eventId, text) => store.editRemark('owner', o.id, eventId, text)} />,
          }]}
          actionCtx={{ onClose: onBack }}
        />
      </div>
    </>
  )
}

export default function Owners({ store, go, sel, setSel, topBar, phone }) {
  const { state } = store
  const [flt, setFlt] = useState({})
  const [q, setQ] = useState('')
  // Soonest callback first. "Recently added" was right for a list you browse
  // and wrong for a queue you work: it put the 732nd import at the top and the
  // person expecting a call at 11am somewhere on page thirty.
  const [sortKey, setSortKey] = useState('callback')
  const [sortDir, setSortDir] = useState('asc')
  // The project grid is a desk lens — a phone gets the queue itself, because a
  // caller in the field opens this to dial the next person, not to browse
  // townships. It also keeps the phone's Load-more path live: `onPage` is
  // withheld in the projects view, and a phone stuck there had no way to
  // reach page two.
  const [view, setView] = useState(phone ? 'list' : 'projects')
  // Two independent axes: which slice of the queue, and which status. A pill in
  // one row never silently clears the other — picking "Late callbacks" and then
  // "Interested" means both, which is a question a caller actually asks.
  const [seg, setSeg] = useState('all')
  const [stage, setStage] = useState('all')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [selected, setSelected] = useState(new Set())
  // The open record lives in the URL, not in local state — same as Leads and
  // Properties. Local state meant a reload lost the record, back left the app,
  // and the phone's action button had no way to know which owner was on screen,
  // so an owner's record on a phone offered no actions at all.
  const openId = sel?.ownerOpen ? sel.ownerId : null

  const role = state.role
  const canAssign = canAssignLead(role)

  const setSegP = (v) => { setSeg(v); setView('list'); setPage(1); setSelected(new Set()) }
  const setStageP = (v) => { setStage(v); setView('list'); setPage(1); setSelected(new Set()) }
  const setPageP = (v) => { setPage(v); setSelected(new Set()) }

  // A checked row belongs to the list it was checked in. Switching to the
  // project grid, picking a different project, or leaving one all change
  // which rows are even on screen — the selection has to clear with them, not
  // silently carry an id from Godrej into a bulk-assign run on the full list.
  useEffect(() => { setSelected(new Set()) }, [view, flt.project])

  // A tile on the dashboard or a group on Today names the slice it opens. Read
  // once and cleared, so it seeds the screen rather than pinning it — the pills
  // still work normally the moment you arrive.
  useEffect(() => {
    if (!sel?.ownerSeg && !sel?.ownerStage) return
    if (sel.ownerSeg) setSeg(sel.ownerSeg)
    if (sel.ownerStage) setStage(sel.ownerStage)
    setView('list'); setPage(1)
    setSel({ ownerSeg: undefined, ownerStage: undefined })
  }, [sel?.ownerSeg, sel?.ownerStage])

  const source = useServerList(
    (params) => api.listOwners({
      page: params.page, limit: params.limit, q: params.q,
      segment: seg === 'all' ? undefined : seg,
      mine: phone ? 1 : undefined,
      stage: stage === 'all' ? undefined : stage,
      project: flt.project || undefined,
      // The filter panel's own fields — same names the backend already reads
      // for listLeads, so Locality and Sales Executive behave identically.
      locality: params.locality, agent: params.agent,
      sortKey: params.sortKey, sortDir: params.sortDir,
    }),
    { filters: flt, search: q, sortKey, sortDir, page, pageSize, accumulate: !!phone },
    [state.dataAsOf, seg, stage, flt.project, phone],
  )

  // On a phone the queue is MINE — the pills, the rows and the tab badge all
  // agree, and a manager is not shown the firm's seven hundred while standing
  // in a lift. The desk still sees the desk.
  const counts = useOwnersSummary(state.dataAsOf, !!phone)
  const queue = counts.queue || {}
  const segs = [
    { key: 'all', label: 'Everyone', on: seg === 'all', count: counts.total ?? 0, onClick: () => setSegP('all') },
    ...QUEUE_SEGMENTS.map(s => ({
      key: s.key, label: s.label, tone: s.tone,
      on: seg === s.key, count: queue[s.count] ?? 0, onClick: () => setSegP(s.key),
    })),
  ]
  // Status is a dropdown, not a second row of pills — same control Leads uses,
  // in the same place. Six statuses beside five queue pills read as eleven
  // pills competing on one screen, and only one row of them was the queue.
  const stageOptions = [
    { value: 'all', label: 'All' },
    ...(state.settings.ownerStages?.length ? state.settings.ownerStages : OWNER_STATUSES)
      .map(s => ({ value: s, label: s, count: counts.byStage?.[s] ?? 0 })),
  ]

  const open = (o) => {
    store.cacheRecords('owner', [o])
    setSel({ ownerId: o.id, ownerOpen: true })
  }
  const back = () => setSel({ ownerOpen: false, ownerId: undefined })

  const bulkAssign = () => store.openModal({
    kind: 'bulkAssign', leadIds: [...selected], isOwner: true,
    onDone: () => setSelected(new Set()),
  })

  if (openId) {
    return <OwnerRecord store={store} ownerId={openId} topBar={topBar} phone={phone} onBack={back} />
  }

  const { header, toolbar, body } = ModuleListView({
    def: OWNERS_DEF, source, store, onOpen: open,
    filters: flt, onFilters: (v) => { setFlt(v); setPage(1) },
    search: q, onSearch: (v) => { setQ(v); setPage(1) },
    sortKey, onSortKey: (v) => { setSortKey(v); setPage(1) }, sortDir, onSortDir: (v) => { setSortDir(v); setPage(1) },
    segments: segs, view, onView: setView,
    phone,
    leftAddon: (
      <div className="leads-dd-row">
        <SelectDropdown label="Status" value={stage} onChange={setStageP} options={stageOptions} />
      </div>
    ),
    // The toolbar IS the selection bar — see FilterBar. No second band.
    selection: (canAssign && view === 'list' && selected.size > 0) ? {
      count: selected.size,
      actions: [{ label: 'Bulk assign', icon: 'userPlus', onClick: bulkAssign }],
      onClear: () => setSelected(new Set()),
    } : null,
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
        title: 'Calling',
        actions: phone ? null : <Button variant="secondary" size="sm" icon="layers" onClick={() => go('import', { kind: 'owners' })}>Import</Button>
      })}
      {header}
      <ListLayout toolbar={toolbar}>{body}</ListLayout>
    </>
  )
}
