import { useEffect, useMemo, useState } from 'react'
import { ListLayout } from '../layouts/layouts.jsx'
import { ModuleListView, ModuleCards, ModuleTable, ProjectRow, SelectDropdown, useSelection } from '../components/collections.jsx'
import { ModuleDetail } from '../components/ModuleDetail.jsx'
import { Button, Overdue, Timeline } from '../components/primitives.jsx'
import Icon from '../components/Icon.jsx'
import { initials, callbackSignal, whenLabel } from '../lib/format.js'
import { canAssignLead, isDeskRole } from '../lib/permissions.js'
import { OWNER_STAGES, OWNER_TERMINAL_STATUSES, ownerSegmentsOf, isCallbackTab } from '../data/ownerStatus.js'
import { useServerList } from '../lib/serverList.js'
import { useRecord } from '../lib/useRecord.js'
import { useKept, useKeptPager } from '../lib/useNav.js'
import { useServerData } from '../lib/useServerData.js'
import UnassignedBar from '../components/UnassignedBar.jsx'
import { api } from '../lib/api.js'
import { telLink } from '../lib/phone.js'
import { OWNERS_DEF, openCallOutcome } from './definitions.jsx'
import { useUndoableRenames } from '../components/ProjectRename.jsx'

// The project rows — same "township lens" as Properties' Group by project, and
// the same ProjectRow, over the cold-calling list. Clicking one filters the
// existing table by that project rather than opening a separate page:
// assigning/status-changing an owner is the same row-level UI either way.
// THE SEARCH goes to the server with it (`ask`, the list's own parameters):
// only projects holding a match come back, "N of M", each with the owners that
// matched shown under it in the list's own table (cards on a phone). It used
// to ignore the search box: typing a name or a flat number changed nothing.
// `picking` turns the rows into tick targets for Rename (desk only); "No
// project" is not a name and cannot be renamed.
function OwnerProjectGrid({ store, ask, def, phone, onOpen, onOpenOwner, onAssign, canAssign, refreshAt, picking, selection }) {
  const askKey = JSON.stringify(ask)
  const { data, loading, error } = useServerData(() => api.listOwnerProjects(ask).then(r => r?.data || []), [refreshAt, askKey], null)
  const { undoFor, undoing, undo } = useUndoableRenames(store)
  const rows = data || []
  // THE ROWS UNDER A PROJECT, as the record cache knows them — the list's own
  // rule (useServerList): written to the cache when they arrive, read back
  // through it, so a write that patches an owner (an assignment from the Agent
  // cell, a status) moves its row here at once rather than at the next read.
  useEffect(() => {
    const all = (data || []).flatMap(pj => pj.owners || [])
    if (all.length) store.cacheRecords('owner', all, true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data])
  const known = store.state.cache?.owner
  const ownersOf = (pj) => (known ? pj.owners.map(o => (known[o.id] && known[o.id] !== o ? { ...o, ...known[o.id] } : o)) : pj.owners)
  if (loading && !data) return <div className="list-spin" role="status" aria-label="Loading"><span /></div>
  if (error) return <div className="detail-missing">Could not load projects.</div>
  // From the answer, not the question: while a new search is in flight the
  // rows on screen are the last answer's, and must not be labelled as this one's.
  const searching = rows.some(pj => pj.owners !== undefined)
  if (!rows.length) return ask.q
    ? <div className="empty"><div className="e-t">No owners match</div><div className="e-s">Adjust the filter or search, or import a list.</div></div>
    : <div className="detail-missing">No owners yet. Import a list to start.</div>
  return (
    <div className={'pjl' + (loading ? ' is-loading' : '')}>
      {rows.map(pj => {
        const tickable = picking && !!pj.norm
        const r = !picking ? undoFor(pj.norm) : null
        // WHO IS ON THIS PROJECT, by first name — the question a manager opens
        // the screen with, once a township has been shared out.
        const who = (pj.holders || []).slice(0, 3).map(h => `${String(h.name).split(' ')[0]} ${h.n}`).join(' · ')
          + ((pj.holders || []).length > 3 ? ` · +${pj.holders.length - 3}` : '')
        return (
          <ProjectRow key={pj.key} name={pj.name} independent={!pj.norm}
            sub={pj.locality} loc={pj.locality}
            noun="owner" counts={pj.counts} searching={searching}
            facts={[
              { cls: 'pjl-call', node: pj.counts.new > 0 ? <><b>{pj.counts.new}</b> to call</> : 'All called' },
              { cls: 'pjl-int', node: pj.counts.interested > 0 ? <><b>{pj.counts.interested}</b> interested</> : null },
              { cls: 'pjl-unas', node: pj.counts.unassigned > 0 ? <><b>{pj.counts.unassigned}</b> unassigned</> : null },
              { cls: 'pjl-who', node: who || null },
            ]}
            actions={[
              ...(canAssign && !picking ? [{ label: 'Assign', icon: 'userPlus', onClick: () => onAssign(pj) }] : []),
              ...(r ? [{ label: undoing === r.id ? 'Undoing…' : 'Undo rename', icon: 'refresh', busy: undoing === r.id, onClick: () => undo(r.id) }] : []),
            ]}
            picked={tickable ? selection.has(pj.key) : undefined}
            onClick={() => (picking ? (tickable && selection.toggle({ id: pj.key, key: pj.key, name: pj.name })) : onOpen(pj.key))}>
            {searching && !picking && pj.owners?.length > 0 && (
              <div className="pjl-flats">
                {phone
                  ? <ModuleCards def={def} rows={ownersOf(pj)} store={store} onOpen={onOpenOwner} phone />
                  : <ModuleTable def={def} rows={ownersOf(pj)} store={store} onOpen={onOpenOwner} />}
              </div>
            )}
          </ProjectRow>
        )
      })}
    </div>
  )
}

// The record a caller works from. Its own component (not a branch inside
// Owners) because it holds hooks of its own — rendering it from partway through
// the list component would change the hook count between the two views.
function OwnerRecord({ store, ownerId, topBar, phone, onBack, go }) {
  // THE CACHED RECORD, which every write patches. This read
  // `fetched || cached`, so a copy fetched before a status change or a
  // callback beat the patched one and the record showed the old value until
  // the next read. useRecord fetches what the cache lacks (a list row has no
  // history), keeps it in the cache, and does not re-read a write's own reply.
  const { record: o } = useRecord(store, 'owner', ownerId)
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
  const callFromDesk = () => store.logContactAction('owner', o.id, 'call').then(res => {
    if (res?.timeline_event?.id) openCallOutcome(store, o, 'owner', res.timeline_event)
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
            // CALL ON THE DESK TOO, as on a lead (same functions): a plain tel:
            // link, which Windows hands to the paired phone, logged as the phone
            // logs it, with the call sheet opened on that entry.
            ...(o.phone ? [
              phone
                ? { label: 'Call', icon: 'phone', onClick: () => contact('call') }
                : { label: 'Call', icon: 'phone', href: telLink(o.phone) || `tel:${o.phone}`, onClick: () => callFromDesk() },
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
  // In the URL with the other filters, so Back from an owner keeps the search.
  const q = bag.q || ''
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
  const sortKey = bag.sortKey || (isCallbackTab(tab) ? 'callback' : 'name')
  const sortDir = bag.sortDir || 'asc'

  // GROUPED BY PROJECT is where Calling opens, on a phone too: a calling list
  // is townships, and a caller picks the building before the flat. Arriving
  // with a tab, a project or a caller already chosen means the list.
  // Kept on the history entry, as the page is, so back from an owner lands on
  // the list it was opened from rather than the project cards.
  const [view, setView] = useKept('calling.view', bag.tab || bag.step || bag.status || bag.project || bag.caller || bag.config ? 'list' : 'projects')
  const { page, setPage, pageSize, setPageSize } = useKeptPager('calling', !!phone)
  const selection = useSelection()
  const selected = selection.ids
  // "Select all 42": every row the filter holds, not the twenty on screen —
  // taking a finished calling list back is the whole list, never a page.
  const [allMatching, setAllMatching] = useState(false)
  const clearSel = () => { selection.clear(); setAllMatching(false); setPicking(false) }
  // Select on the project cards, for Rename (owners and managers).
  const [picking, setPicking] = useState(false)
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
    setPage(1); clearSel()
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
  // Changing page keeps the ticks (useSelection); what is being asked for does not.
  const setPageP = (v) => setPage(v)

  // A checked row belongs to the list it was checked in.
  useEffect(() => { clearSel() }, [view, projectSel])

  // Calling's refetch token: moves with owner writes and untyped ones, not
  // with a lead or a listing written (asOf, store.jsx).
  const ownersAsOf = store.asOf('lead', 'property')

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
      holdOrder: true, viewDeps: [tab, status, agentSel, projectSel, towerSel, configSel, phone],
      // Grouped by project shows cards, not this page of rows.
      off: view === 'projects' },
    // Calling reads owners: a lead or a listing written cannot change them.
    [ownersAsOf, tab, status, agentSel, projectSel, towerSel, configSel, phone],
    { store, kind: 'owner' },
  )
  const { data: counts } = useServerData(
    // The dropdown's status only: a step tab is counted across, not within.
    () => api.getOwnerTabs({ ...scope, segment, stage: status }).then(r => r?.tabs || {}),
    [ownersAsOf, q, tab, status, agentSel, projectSel, towerSel, configSel, phone], {})

  // The picked project's towers, for the Tower filter. Without a project there
  // is no tower to offer, and this was a second firm-wide project read beside
  // the cards' own on every load.
  const { data: projectList } = useServerData(
    () => (projectSel ? api.listOwnerProjects().then(r => r?.data || []) : Promise.resolve([])), [ownersAsOf, !!projectSel], [])
  const currentProject = (projectList || []).find(p => (p.key === 'No project' ? '_none' : p.key) === projectSel)
  const facets = {
    towers: (currentProject?.towers || []).map(t => ({ value: t, label: t })),
    configs: (counts || {}).byConfig || [],
  }

  // THE TAB ROW IS SHORT ON PURPOSE: where a caller works from, not every
  // status. All · the callback piles (the tabs that are a time: late, later
  // today, every one booked) · the first two steps of the firm's walk (New,
  // and Call Not Received: the never-dialled and the ring-again) · Unassigned
  // for whoever hands work out. Every other status is in the Status dropdown,
  // under its own name.
  const c = counts || {}
  const tabStage = c.tabStage || {}
  const byStage = c.byStage || {}
  const firmStages = (state.settings.ownerStages?.length ? state.settings.ownerStages : OWNER_STAGES)
    .filter(s => !OWNER_TERMINAL_STATUSES.includes(s))
  const steps = firmStages.slice(0, 2)
  // The pills are the calling list's catalogue (leadSegments.ts, served), each
  // counted by the predicate that filters it — the same one every figure that
  // links here counts with, so "Callbacks overdue 7" anywhere opens 7 rows.
  // The firm's first two steps sit after the callback piles; Unassigned last,
  // for whoever hands work out.
  const segCount = (k) => c.segments?.[k] ?? c[k] ?? 0
  const pills = ownerSegmentsOf(state).filter(s => s.surface?.includes('pill'))
  const segs = [
    { key: 'all', label: 'All', count: c.total ?? 0 },
    ...pills.filter(s => s.key !== 'unassigned')
      .map(s => ({ key: s.key, label: s.label, tone: s.tone || undefined, count: segCount(s.key) })),
    ...steps.map(s => ({ key: `step:${s}`, label: s, count: tabStage[s] ?? 0 })),
    ...(canAssign && !phone ? pills.filter(s => s.key === 'unassigned').map(s => ({ key: s.key, label: s.label, count: segCount(s.key) })) : []),
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
  const def = useMemo(() => (isCallbackTab(tab) ? OWNERS_DEF
    : { ...OWNERS_DEF, columns: OWNERS_DEF.columns.filter(c => c.key !== 'callback') }), [tab])

  const open = (o) => {
    store.cacheRecords('owner', [o], true)
    // ON TOP OF the list's state, not instead of it. These replaced the whole
    // selection, so the open project went with it and Back landed on the
    // project cards instead of the project's list.
    setSel(s => ({ ...s, ownerId: o.id, ownerOpen: true }))
  }
  // The list this owner belongs to: where the arrow goes when nothing of ours
  // is underneath. Otherwise it goes where the person came from (useNav).
  const back = () => setSel(s => ({ ...s, ownerOpen: false, ownerId: undefined }))

  const total = source.total ?? 0
  const selCount = allMatching ? total : selected.size
  // Whose rows these are, when it is one person: the Agent filter, or else the
  // ticked rows themselves.
  const fromAgentIds = allMatching
    ? (agentSel !== 'all' && agentSel !== '_none' && !agentSel.includes(',') ? [agentSel] : [])
    : selection.rows.map(r => r.agentId || null)
  const bulkAssign = () => store.openModal({
    kind: 'bulkAssign', isOwner: true,
    leadIds: allMatching ? [] : [...selected],
    // The list's own parameters, so the server moves exactly what it listed.
    match: allMatching ? { ...scope, segment, stage } : undefined,
    count: selCount, fromAgentIds,
    onDone: clearSel,
  })

  if (openId) {
    return <OwnerRecord store={store} ownerId={openId} topBar={topBar} phone={phone} onBack={back} go={go} />
  }

  // GROUP BY PROJECT, or the project's chip with × back to the cards.
  const mayRename = isDeskRole(role) && view === 'projects'
  const pickCtl = mayRename ? (
    <button className={'grp-toggle' + (picking ? ' on' : '')} aria-pressed={picking}
      onClick={() => (picking ? clearSel() : setPicking(true))}>
      <Icon name="check" size={14} />Select
    </button>
  ) : null
  const groupCtl = projectSel ? (
    <span className="proj-chip">
      <Icon name="building" size={14} />
      <span className="proj-chip-t">{currentProject?.name || (projectSel === '_none' ? 'No project' : projectSel)}</span>
      <button type="button" aria-label="Back to all projects" onClick={leaveProject}><Icon name="x" size={13} /></button>
    </span>
  ) : (
    <button className={'grp-toggle' + (view === 'projects' ? ' on' : '')}
      onClick={() => { clearSel(); setView(view === 'projects' ? 'list' : 'projects') }}>
      <Icon name="building" size={14} />{phone ? 'By project' : 'Group by project'}
    </button>
  )


  const { header, toolbar, body } = ModuleListView({
    def, source, store, onOpen: open,
    filters: { ...(towerSel ? { tower: [towerSel] } : {}), ...(configSel ? { config: configSel.split(',') } : {}) }, onFilters, facets,
    search: q, onSearch: (v) => patchBag({ q: v }),
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
    selection: (mayRename && picking && (phone || selected.size > 0)) ? {
      count: selected.size,
      actions: [{ label: 'Rename', icon: 'edit', onClick: () => store.openModal({ kind: 'renameProjects', keys: selection.rows.map(r => r.key), onDone: clearSel }) }],
      onClear: clearSel,
    } : (canAssign && view === 'list' && selCount > 0) ? {
      count: selCount,
      actions: [
        ...(!allMatching && total > selected.size ? [{ label: `Select all ${total}`, tone: 'quiet', onClick: () => {
          selection.set(new Set(source.rows.map(r => r.id)), source.rows); setAllMatching(true)
        } }] : []),
        { label: 'Bulk assign', icon: 'userPlus', onClick: bulkAssign },
      ],
      onClear: clearSel,
    } : null,
    page, onPage: view === 'projects' ? undefined : setPageP, pageSize, onPageSize: view === 'projects' ? undefined : setPageSize,
    showViewSwitch: false,
    // GROUP BY PROJECT, first in the bar: it changes what the list IS. Inside a
    // project it becomes that project's chip, and × goes back to the cards.
    // On a phone it sits beside the two dropdowns instead, one row of controls.
    // Select (Rename) beside the search on a phone: the dropdown row is full.
    toolbarLeft: phone ? pickCtl || undefined : <>{groupCtl}{pickCtl}</>,
    cta: { label: 'New owner', onClick: () => store.openModal({ kind: 'newOwner' }) },
    emptyTitle: 'No owners match', emptyHint: 'Adjust the filter or search, or import a list.',
    renderTable: (list, v) => v === 'projects'
      ? <OwnerProjectGrid
          store={store} picking={picking} selection={selection}
          ask={{ ...(q ? { q } : {}), ...(scope.mine ? { mine: 1 } : {}) }}
          def={def} phone={phone} onOpenOwner={open}
          refreshAt={ownersAsOf}
          canAssign={canAssign}
          onAssign={(pj) => store.openModal({ kind: 'assignProject', project: pj })}
          onOpen={(key) => toProject(key === 'No project' ? '_none' : key)} />
      : v === 'grid'
        ? <ModuleCards def={def} rows={list} store={store} onOpen={open} phone={phone} />
        : <ModuleTable def={def} rows={list} store={store} onOpen={open} sortKey={sortKey} sortDir={sortDir} onSort={(v) => patchBag({ sortKey: v })} onSortDir={(v) => patchBag({ sortDir: v })}
            selectable={canAssign} selectedIds={selected}
            onSelectionChange={(ids, rows) => { setAllMatching(false); selection.set(ids, rows) }} />,
  })

  return (
    <>
      {topBar({
        title: 'Calling',
        actions: (phone || !isDeskRole(role)) ? null : <Button variant="secondary" size="sm" icon="layers" onClick={() => go('import', { kind: 'owners' })}>Import</Button>
      })}
      <UnassignedBar store={store} side="owners" go={go} onShow={() => pickTab('unassigned')} />
      {header}
      <ListLayout toolbar={toolbar}>{body}</ListLayout>
    </>
  )
}
