import { useEffect, useMemo, useState } from 'react'
import { ListLayout } from '../layouts/layouts.jsx'
import { ModuleListView, ModuleCards, ModuleTable, SelectDropdown } from '../components/collections.jsx'
import { ModuleDetail } from '../components/ModuleDetail.jsx'
import { Button, Overdue, Timeline } from '../components/primitives.jsx'
import Icon from '../components/Icon.jsx'
import { initials, callbackSignal, whenLabel } from '../lib/format.js'
import { canAssignLead } from '../lib/permissions.js'
import { OWNER_STAGES, OWNER_TERMINAL_STATUSES } from '../data/ownerStatus.js'
import { useServerList } from '../lib/serverList.js'
import { useServerData } from '../lib/useServerData.js'
import { api } from '../lib/api.js'
import { OWNERS_DEF } from './definitions.jsx'

// The project cards — same "township lens" as Properties' Group by project,
// over the cold-calling list. Clicking one filters the existing table by that
// project rather than opening a separate page: assigning/status-changing an
// owner is the same row-level UI either way, so there is nothing a dedicated
// project-detail screen would add.
function OwnerProjectGrid({ onOpen, onAssign, canAssign, refreshAt }) {
  const [rows, setRows] = useState(null)
  useEffect(() => {
    let live = true
    api.listOwnerProjects().then(r => { if (live) setRows(r?.data || []) }).catch(() => { if (live) setRows([]) })
    return () => { live = false }
  }, [refreshAt])
  if (rows === null) return <div className="list-spin" role="status" aria-label="Loading"><span /></div>
  if (!rows.length) return <div className="detail-missing">No owners yet. Import a list to start.</div>
  return (
    <div className="grid-cards">
      {rows.map(pj => (
        <div key={pj.key} className="projcard pj-box">
          <button className="pj-open" onClick={() => onOpen(pj.key)}>
            <div className="pj-head">
              <div className="pj-id">
                <div className="pj-name">{pj.name}</div>
                {pj.locality && <div className="pj-sub"><Icon name="pin" size={13} className="ic" />{pj.locality}</div>}
              </div>
              <span className="pj-count"><b>{pj.counts.total}</b> owner{pj.counts.total !== 1 ? 's' : ''}</span>
            </div>
            <div className="pj-legend">
              {pj.counts.new > 0
                ? <span className="pj-dot avail">{pj.counts.new} to call</span>
                : <span className="pj-sub">All called</span>}
              {pj.counts.interested > 0 && <span className="pj-dot sold">{pj.counts.interested} interested</span>}
            </div>
            {/* WHO IS ON IT. A township handed to one caller and then partly
                shared out reads as "728 owners" and nothing else — this is the
                question a manager opens the screen with. */}
            <div className="pj-who">
              {(pj.holders || []).slice(0, 4).map(h => (
                <span key={h.id} className="pj-who-one">{String(h.name).split(' ')[0]} <b>{h.n}</b></span>
              ))}
              {(pj.holders || []).length > 4 && <span className="pj-who-one">+{pj.holders.length - 4} more</span>}
              {pj.counts.unassigned > 0 && <span className="pj-who-one pj-who-none">Unassigned <b>{pj.counts.unassigned}</b></span>}
            </div>
          </button>
          {canAssign && (
            <button className="pj-assign" onClick={() => onAssign(pj)}>
              <Icon name="userPlus" size={13} />Assign
            </button>
          )}
        </div>
      ))}
    </div>
  )
}

// The record a caller works from. Its own component (not a branch inside
// Owners) because it holds hooks of its own — rendering it from partway through
// the list component would change the hook count between the two views.
function OwnerRecord({ store, ownerId, topBar, phone, onBack, go }) {
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
      <div className="fu-head">Callback</div>
      {o.callbackAt ? (
        <div className="fu-active">
          <div>
            <div className="fu-title">{o.callbackNote || 'Call back'}</div>
            <div className={'fu-when' + (cb?.tone === 'overdue' ? ' is-late' : '')}>{cb?.label}</div>
          </div>
          <button className="btn btn-ghost btn-sm fu-done" onClick={() => store.setOwnerCallback(o.id, null)}>Done</button>
        </div>
      ) : (
        <div className="detail-empty">
          {o.lastCallAt ? `Last called ${whenLabel(o.lastCallAt)}. No callback set.` : 'Not called yet.'}
        </div>
      )}
      <Button variant="secondary" size="sm" block icon="calendar"
        onClick={() => store.openModal({ kind: 'ownerCallback', ownerId: o.id })}>
        {o.callbackAt ? 'Reschedule' : 'Schedule callback'}
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
              onEditRemark={(eventId, text, outcome) => store.editRemark('owner', o.id, eventId, text, outcome)} />,
          }]}
          actionCtx={{ onClose: onBack, go }}
        />
      </div>
    </>
  )
}

export default function Owners({ store, go, sel, setSel, topBar, phone }) {
  const { state } = store
  // THE FILTER LIVES IN THE URL (nav.js, the calling bag), as it does on Leads
  // and Properties. It was private state here: a reload lost the tab and the
  // project, and leaving a project kept a tab switched on that nothing
  // explained, so × showed an empty list instead of the project cards.
  //
  // `q`, the page, the view and the selection stay local: a history entry per
  // keystroke is not navigation.
  const bag = sel.ownerFilters || {}
  const tab = bag.tab || (bag.status ? `status:${bag.status}` : 'all')
  const status = tab.startsWith('status:') ? tab.slice(7) : undefined
  const segment = status || tab === 'all' ? undefined : tab
  const projectSel = bag.project
  const towerSel = bag.tower
  const agentSel = bag.caller || 'all'
  // A to Z, like Leads: this is where each owner SITS. The Callbacks tab is the
  // one list whose order is its point — soonest first, so whoever is already
  // due is at the top — and a sort picked by hand still wins.
  const sortKey = bag.sortKey || (tab === 'callbacks' ? 'callback' : 'name')
  const sortDir = bag.sortDir || 'asc'

  const [q, setQ] = useState('')
  // The project grid is a desk lens — a phone gets the queue itself. Arriving
  // with a tab, a project or a caller already chosen means the list.
  const [view, setView] = useState(phone || bag.tab || bag.status || bag.project || bag.caller ? 'list' : 'projects')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [selected, setSelected] = useState(new Set())
  // The open record lives in the URL too — see Leads and Properties.
  const openId = sel?.ownerOpen ? sel.ownerId : null

  const role = state.role
  const canAssign = canAssignLead(role)

  // REPLACE rather than push (useNav): back leaves the screen, it does not walk
  // back through every tab tapped on the way.
  const patchBag = (patch) => {
    setSel(s => {
      const next = { ...(s.ownerFilters || {}), ...patch }
      for (const k of Object.keys(next)) if (next[k] === undefined || next[k] === null || next[k] === '' || next[k] === 'all') delete next[k]
      return { ...s, ownerFilters: Object.keys(next).length ? next : undefined }
    })
    setPage(1); setSelected(new Set())
  }
  // A tab is its own order: a sort picked on another tab does not follow it.
  const pickTab = (key) => {
    const st = key.startsWith('status:') ? key.slice(7) : undefined
    patchBag({ tab: st || key === 'all' ? undefined : key, status: st, sortKey: undefined, sortDir: undefined })
    setView('list')
  }
  const setAgentP = (v) => { patchBag({ caller: v }); setView('list') }
  // The Filter menu holds Tower only, and only inside a project.
  const onFilters = (v) => { patchBag({ tower: projectSel ? v?.tower?.[0] : undefined }); setView('list') }
  const toProject = (key) => { patchBag({ project: key, tower: undefined }); setView('list') }
  // LEAVING A PROJECT is going back to the cards with nothing left switched on:
  // the tab, the tower and the sort all belonged to that project's list.
  const leaveProject = () => {
    patchBag({ project: undefined, tower: undefined, tab: undefined, status: undefined, sortKey: undefined, sortDir: undefined })
    setView('projects')
  }
  const setPageP = (v) => { setPage(v); setSelected(new Set()) }

  // A checked row belongs to the list it was checked in.
  useEffect(() => { setSelected(new Set()) }, [view, projectSel])

  // ONE SET OF PARAMETERS for the rows and for the tab counts, so a tab can
  // never promise rows its list cannot find.
  const scope = {
    q: q || undefined,
    mine: phone ? 1 : undefined,
    project: projectSel || undefined,
    tower: towerSel || undefined,
    agent: agentSel === 'all' ? undefined : agentSel,
  }
  const source = useServerList(
    (params) => api.listOwners({
      ...scope, page: params.page, limit: params.limit, q: params.q,
      segment, stage: status,
      sortKey: params.sortKey, sortDir: params.sortDir,
    }),
    // Same as Leads: a row you just called keeps its place in the queue.
    { filters: {}, search: q, sortKey, sortDir, page, pageSize, accumulate: !!phone,
      holdOrder: true, viewDeps: [tab, agentSel, projectSel, towerSel, phone] },
    [state.dataAsOf, tab, agentSel, projectSel, towerSel, phone],
    { store, kind: 'owner' },
  )
  const { data: counts } = useServerData(
    () => api.getOwnerTabs({ ...scope, segment, stage: status }).then(r => r?.tabs || {}),
    [state.dataAsOf, q, tab, agentSel, projectSel, towerSel, phone], {})

  const { data: projectList } = useServerData(
    () => api.listOwnerProjects().then(r => r?.data || []), [state.dataAsOf], [])
  const currentProject = (projectList || []).find(p => (p.key === 'No project' ? '_none' : p.key) === projectSel)
  const facets = { towers: (currentProject?.towers || []).map(t => ({ value: t, label: t })) }

  // THE TABS ARE THE WALK. Calling goes New → Contacted → Interested → Key
  // Received, or ends; these are the firm's own statuses, in its order, each
  // counted over the rows on screen. The old tabs were callback times — Late,
  // Due today — over a list where a handful of rows have a callback at all.
  // Callbacks stays as the one tab that is a time: it is where the scheduled
  // calls are. Closed holds both endings, which nobody rings. A status the firm
  // dropped but rows still carry gets a tab while it holds any, so no row is
  // reachable only through All.
  const byStage = (counts || {}).byStage || {}
  const firmStages = (state.settings.ownerStages?.length ? state.settings.ownerStages : OWNER_STAGES)
    .filter(s => !OWNER_TERMINAL_STATUSES.includes(s))
  const stray = Object.keys(byStage).filter(s => byStage[s] > 0 && !firmStages.includes(s) && !OWNER_TERMINAL_STATUSES.includes(s))
  const segs = [
    { key: 'all', label: 'All', count: counts?.total ?? 0 },
    { key: 'callbacks', label: 'Callbacks', count: counts?.callbacks ?? 0 },
    ...[...firmStages, ...stray].map(s => ({ key: `status:${s}`, label: s, count: byStage[s] ?? 0 })),
    { key: 'closed', label: 'Closed', count: counts?.closed ?? 0 },
    ...(canAssign && !phone ? [{ key: 'unassigned', label: 'Unassigned', count: counts?.unassigned ?? 0 }] : []),
  ].map(s => ({ ...s, on: tab === s.key, disabled: s.key !== 'all' && !s.count, onClick: () => pickTab(s.key) }))

  // The callback time is a column on the one tab that is about it. Everywhere
  // else it was "Not called" down seven hundred rows.
  const def = useMemo(() => (tab === 'callbacks' ? OWNERS_DEF
    : { ...OWNERS_DEF, columns: OWNERS_DEF.columns.filter(c => c.key !== 'callback') }), [tab])

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
    return <OwnerRecord store={store} ownerId={openId} topBar={topBar} phone={phone} onBack={back} go={go} />
  }

  const { header, toolbar, body } = ModuleListView({
    def, source, store, onOpen: open,
    filters: towerSel ? { tower: [towerSel] } : {}, onFilters, facets,
    search: q, onSearch: (v) => { setQ(v); setPage(1) },
    sortKey, onSortKey: (v) => patchBag({ sortKey: v }), sortDir, onSortDir: (v) => patchBag({ sortDir: v }),
    segments: segs, view, onView: setView,
    phone,
    leftAddon: canAssign ? (
      <div className="leads-dd-row">
        <SelectDropdown
          label="Agent" value={agentSel} onChange={setAgentP} searchable
          options={[
            { value: 'all', label: 'All' },
            ...((counts || {}).byAgent || []).map(a => ({
              value: a.value,
              label: a.value === state.activeAgentId ? 'Me' : a.label,
              count: a.count,
            })),
          ]}
        />
      </div>
    ) : null,
    // The toolbar IS the selection bar — see FilterBar. No second band.
    selection: (canAssign && view === 'list' && selected.size > 0) ? {
      count: selected.size,
      actions: [{ label: 'Bulk assign', icon: 'userPlus', onClick: bulkAssign }],
      onClear: () => setSelected(new Set()),
    } : null,
    page, onPage: view === 'projects' ? undefined : setPageP, pageSize, onPageSize: view === 'projects' ? undefined : setPageSize,
    showViewSwitch: false,
    // GROUP BY PROJECT, first in the bar: it changes what the list IS. Inside a
    // project it becomes that project's chip, and × goes back to the cards.
    toolbarLeft: projectSel ? (
      <span className="proj-chip">
        <Icon name="building" size={14} />
        <span className="proj-chip-t">{currentProject?.name || (projectSel === '_none' ? 'No project' : projectSel)}</span>
        <button type="button" aria-label="Back to all projects" onClick={leaveProject}><Icon name="x" size={13} /></button>
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
      ? <OwnerProjectGrid
          refreshAt={state.dataAsOf}
          canAssign={canAssign}
          onAssign={(pj) => store.openModal({ kind: 'assignProject', project: pj })}
          onOpen={(key) => toProject(key === 'No project' ? '_none' : key)} />
      : v === 'grid'
        ? <ModuleCards def={def} rows={list} store={store} onOpen={open} phone={phone} />
        : <ModuleTable def={def} rows={list} store={store} onOpen={open} sortKey={sortKey} sortDir={sortDir} onSort={(v) => patchBag({ sortKey: v })}
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
