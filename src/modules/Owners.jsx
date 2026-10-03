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
import UnassignedBar from '../components/UnassignedBar.jsx'
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
            // RECORD CALL on a desk: nothing dials from a desk, and "Call" sent
            // callers to Add remark instead, so the call itself was never logged.
            ...(o.phone ? [
              phone
                ? { label: 'Call', icon: 'phone', onClick: () => contact('call') }
                : { label: 'Record call', icon: 'phone', onClick: () => store.openModal({ kind: 'logCall', recordType: 'owner', recordId: o.id, record: o }) },
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
  // TWO CONTROLS, ONE QUESTION EACH. The tab row is where a caller works from —
  // everyone, the scheduled callbacks, the first two steps of the walk (`step`),
  // nobody's rows. The Status dropdown (`status`) is any status, on top of
  // Callbacks or Unassigned. A step tab and a dropdown status would be two
  // statuses at once, which is never a row, so picking one clears the other.
  const tab = bag.tab || (bag.step ? `step:${bag.step}` : 'all')
  const segment = bag.tab || undefined
  const status = bag.status
  const stage = bag.step || status
  const projectSel = bag.project
  const towerSel = bag.tower
  // Several configurations at once, one URL value: "2 BHK,3 BHK".
  const configSel = bag.config || ''
  const agentSel = bag.caller || 'all'
  // A to Z, like Leads: this is where each owner SITS. The Callbacks tab is the
  // one list whose order is its point — soonest first, so whoever is already
  // due is at the top — and a sort picked by hand still wins.
  const sortKey = bag.sortKey || (tab === 'callbacks' ? 'callback' : 'name')
  const sortDir = bag.sortDir || 'asc'

  const [q, setQ] = useState('')
  // GROUPED BY PROJECT is where Calling opens, on a phone too: a calling list
  // is townships, and a caller picks the building before the flat. Arriving
  // with a tab, a project or a caller already chosen means the list.
  const [view, setView] = useState(bag.tab || bag.step || bag.status || bag.project || bag.caller || bag.config ? 'list' : 'projects')
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
    const step = key.startsWith('step:') ? key.slice(5) : undefined
    patchBag({
      tab: step || key === 'all' ? undefined : key, step,
      ...(step ? { status: undefined } : {}),
      sortKey: undefined, sortDir: undefined,
    })
    setView('list')
  }
  const setStatusP = (v) => { patchBag({ status: v, step: undefined }); setView('list') }
  const setAgentP = (v) => { patchBag({ caller: v }); setView('list') }
  // The Filter menu: Configuration anywhere, Tower only inside a project.
  const onFilters = (v) => {
    patchBag({ tower: projectSel ? v?.tower?.[0] : undefined, config: (v?.config || []).join(',') || undefined })
    setView('list')
  }
  const toProject = (key) => { patchBag({ project: key, tower: undefined }); setView('list') }
  // LEAVING A PROJECT is going back to the cards with nothing left switched on:
  // the tab, the tower and the sort all belonged to that project's list.
  const leaveProject = () => {
    patchBag({ project: undefined, tower: undefined, config: undefined, tab: undefined, step: undefined, status: undefined, sortKey: undefined, sortDir: undefined })
    setView('projects')
  }
  const setPageP = (v) => { setPage(v); setSelected(new Set()) }

  // A checked row belongs to the list it was checked in.
  useEffect(() => { setSelected(new Set()) }, [view, projectSel])

  // ONE SET OF PARAMETERS for the rows and for the tab counts, so a tab can
  // never promise rows its list cannot find.
  const scope = {
    q: q || undefined,
    // AN AGENT'S PHONE IS THEIR OWN LIST. An owner or manager on a phone sees
    // the firm, as at the desk: "mine" for them was the rows assigned to the
    // owner personally — none — so Calling on the owner's phone was empty.
    mine: phone && role === 'agent' ? 1 : undefined,
    project: projectSel || undefined,
    tower: towerSel || undefined,
    config: configSel || undefined,
    agent: agentSel === 'all' ? undefined : agentSel,
  }
  const source = useServerList(
    (params) => api.listOwners({
      ...scope, page: params.page, limit: params.limit, q: params.q,
      segment, stage,
      sortKey: params.sortKey, sortDir: params.sortDir,
    }),
    // Same as Leads: a row you just called keeps its place in the queue.
    { filters: {}, search: q, sortKey, sortDir, page, pageSize, accumulate: !!phone,
      holdOrder: true, viewDeps: [tab, status, agentSel, projectSel, towerSel, configSel, phone] },
    [state.dataAsOf, tab, status, agentSel, projectSel, towerSel, configSel, phone],
    { store, kind: 'owner' },
  )
  const { data: counts } = useServerData(
    // The dropdown's status only: a step tab is counted across, not within.
    () => api.getOwnerTabs({ ...scope, segment, stage: status }).then(r => r?.tabs || {}),
    [state.dataAsOf, q, tab, status, agentSel, projectSel, towerSel, configSel, phone], {})

  const { data: projectList } = useServerData(
    () => api.listOwnerProjects().then(r => r?.data || []), [state.dataAsOf], [])
  const currentProject = (projectList || []).find(p => (p.key === 'No project' ? '_none' : p.key) === projectSel)
  const facets = {
    towers: (currentProject?.towers || []).map(t => ({ value: t, label: t })),
    configs: (counts || {}).byConfig || [],
  }

  // THE TAB ROW IS SHORT ON PURPOSE: where a caller works from, not every
  // status. All · Callbacks (the one tab that is a time) · the first two steps
  // of the firm's walk (New, and Call Not Received: the never-dialled and the
  // ring-again) · Unassigned for whoever hands work out. Every other status is
  // in the Status dropdown, under its own name.
  const c = counts || {}
  const tabStage = c.tabStage || {}
  const byStage = c.byStage || {}
  const firmStages = (state.settings.ownerStages?.length ? state.settings.ownerStages : OWNER_STAGES)
    .filter(s => !OWNER_TERMINAL_STATUSES.includes(s))
  const steps = firmStages.slice(0, 2)
  const segs = [
    { key: 'all', label: 'All', count: c.total ?? 0 },
    { key: 'callbacks', label: 'Callbacks', count: c.callbacks ?? 0 },
    ...steps.map(s => ({ key: `step:${s}`, label: s, count: tabStage[s] ?? 0 })),
    ...(canAssign && !phone ? [{ key: 'unassigned', label: 'Unassigned', count: c.unassigned ?? 0 }] : []),
  ].map(s => ({ ...s, on: tab === s.key, disabled: s.key !== 'all' && !s.count && tab !== s.key, onClick: () => pickTab(s.key) }))
  // Every status the firm uses, then the two endings, then any status the firm
  // dropped that rows still carry — so no row is reachable only through All.
  const allStatuses = [...firmStages, ...OWNER_TERMINAL_STATUSES]
  const stray = Object.keys(byStage).filter(s => byStage[s] > 0 && !allStatuses.includes(s))
  const statusOptions = [
    { value: 'all', label: 'All' },
    ...[...allStatuses, ...stray].map(s => ({ value: s, label: s, count: byStage[s] ?? 0 })),
  ]

  // The callback time is a column on the one tab that is about it. Everywhere
  // else it was "Not called" down seven hundred rows.
  const def = useMemo(() => (tab === 'callbacks' ? OWNERS_DEF
    : { ...OWNERS_DEF, columns: OWNERS_DEF.columns.filter(c => c.key !== 'callback') }), [tab])

  const open = (o) => {
    store.cacheRecords('owner', [o])
    // ON TOP OF the list's state, not instead of it. These replaced the whole
    // selection, so the open project went with it and Back landed on the
    // project cards instead of the project's list.
    setSel(s => ({ ...s, ownerId: o.id, ownerOpen: true }))
  }
  const back = () => setSel(s => ({ ...s, ownerOpen: false, ownerId: undefined }))

  const bulkAssign = () => store.openModal({
    kind: 'bulkAssign', leadIds: [...selected], isOwner: true,
    onDone: () => setSelected(new Set()),
  })

  if (openId) {
    return <OwnerRecord store={store} ownerId={openId} topBar={topBar} phone={phone} onBack={back} go={go} />
  }

  // GROUP BY PROJECT, or the project's chip with × back to the cards.
  const groupCtl = projectSel ? (
    <span className="proj-chip">
      <Icon name="building" size={14} />
      <span className="proj-chip-t">{currentProject?.name || (projectSel === '_none' ? 'No project' : projectSel)}</span>
      <button type="button" aria-label="Back to all projects" onClick={leaveProject}><Icon name="x" size={13} /></button>
    </span>
  ) : (
    <button className={'grp-toggle' + (view === 'projects' ? ' on' : '')}
      onClick={() => setView(view === 'projects' ? 'list' : 'projects')}>
      <Icon name="building" size={14} />{phone ? 'By project' : 'Group by project'}
    </button>
  )


  const { header, toolbar, body } = ModuleListView({
    def, source, store, onOpen: open,
    filters: { ...(towerSel ? { tower: [towerSel] } : {}), ...(configSel ? { config: configSel.split(',') } : {}) }, onFilters, facets,
    search: q, onSearch: (v) => { setQ(v); setPage(1) },
    sortKey, onSortKey: (v) => patchBag({ sortKey: v }), sortDir, onSortDir: (v) => patchBag({ sortDir: v }),
    segments: segs, view, onView: setView,
    phone,
    leftAddon: (
      <div className="leads-dd-row">
        <SelectDropdown label="Status" value={status || 'all'} onChange={setStatusP} options={statusOptions} />
        {canAssign && <SelectDropdown
          label="Agent" value={agentSel} onChange={setAgentP} searchable
          options={[
            { value: 'all', label: 'All' },
            ...((counts || {}).byAgent || []).map(a => ({
              value: a.value,
              label: a.value === state.activeAgentId ? 'Me' : a.label,
              count: a.count,
            })),
          ]}
        />}
        {phone && groupCtl}
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
    // GROUP BY PROJECT, first in the bar: it changes what the list IS. Inside a
    // project it becomes that project's chip, and × goes back to the cards.
    // On a phone it sits beside the two dropdowns instead, one row of controls.
    toolbarLeft: phone ? undefined : groupCtl,
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
      <UnassignedBar store={store} side="owners" go={go} onShow={() => pickTab('unassigned')} />
      {header}
      <ListLayout toolbar={toolbar}>{body}</ListLayout>
    </>
  )
}
