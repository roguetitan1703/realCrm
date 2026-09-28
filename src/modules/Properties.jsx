import { useEffect, useMemo, useState } from 'react'
import { ListLayout } from '../layouts/layouts.jsx'
import { useServerList } from '../lib/serverList.js'
import { useRecord } from '../lib/useRecord.js'
import { api } from '../lib/api.js'
import { ModuleListView, ModuleTable, PropertyCard, ProjectCard } from '../components/collections.jsx'
import { priceRangeLabel } from '../lib/projects.js'
import { useServerData } from '../lib/useServerData.js'
import { ModuleDetail } from '../components/ModuleDetail.jsx'
import { StatusTag, Quoted, Button, KV, Timeline, MoreRows, useCap, CappedList, Panel, SectionHead } from '../components/primitives.jsx'
import { NbaBanner } from '../components/rail.jsx'
import { leadsForProperty } from '../lib/matching.js'
import { fileUrl } from '../lib/media.js'
import { copyText } from '../lib/clipboard.js'
import Lightbox from '../components/Lightbox.jsx'
import { latestPlus, quotedLine, unitLabel, fmtDate, configLabel } from '../lib/format.js'
import { AgreementList, useAgreementsFor } from '../components/Agreements.jsx'
import { AREA_UNITS, labelOf } from '../data/propertyFields.js'
import Icon from '../components/Icon.jsx'
import { PROPERTIES_DEF } from './definitions.jsx'
import PropertyWizard, { fromCopy, scoreOf } from './PropertyWizard.jsx'
import { canEditListing, canAddListing } from '../lib/permissions.js'

// The filter bar speaks in arrays ({ status: ['Available','Blocked'] }) because
// its controls are multi-select; the API speaks in comma-separated values. This
// is the whole translation, kept in one place so no screen invents its own.
// Every key the filter bar can set. It listed five, while PROPERTIES_DEF
// defines twelve — so Configuration, Category, Property type, Furnishing,
// Facing, Possession, Ownership and Transaction were dropped on the floor.
// While the browser held the whole book the client filtered them locally and
// nobody noticed; once the list became a server page they did nothing at all.
// The filter fields the panel offers, which are also the keys nav.js mirrors
// into the query string. `type` is API-only (a legacy column nothing filters on
// from the UI), so the two lists are near-identical but not the same thing.
export const PROP_FILTER_KEYS = [
  'project', 'deal', 'category', 'bhk', 'subtype', 'locality',
  'status', 'furnishing', 'facing', 'possession', 'ownership', 'transaction', 'verified', 'tower', 'unit',
]

const API_FILTERS = [
  'status', 'deal', 'type', 'locality', 'project',
  'category', 'bhk', 'subtype', 'furnishing', 'facing',
  'possession', 'ownership', 'transaction', 'verified', 'tower', 'tab', 'unit',
]
function toQuery({ page, limit, q, ...filters }) {
  const out = { page, limit, q }
  for (const k of API_FILTERS) {
    const v = filters[k]
    if (Array.isArray(v)) { if (v.length) out[k] = v.join(',') }
    else if (v) out[k] = v
  }
  return out
}

/**
 * Properties is a ROUTER, and holds no hooks of its own.
 *
 * It used to declare the list's state and then, further down, return the
 * wizard / record / project takeover before reaching the reads below — so
 * opening a listing rendered FEWER hooks than the list did, and React threw
 * "Rendered more hooks than during the previous render" on the way back. The
 * takeovers are siblings, not early exits, and the list's state belongs to the
 * list.
 */
export default function Properties({ store, go, sel, setSel, topBar, phone }) {
  // THE DESK QUESTION, asked without a record in hand: may this role edit
  // listings in general. Enough for the list toolbar; NOT enough for a specific
  // listing, because an agent may edit the ones they added — see
  // canEditListing(). Anything holding a record asks again with it.
  const mayEditAny = canEditListing(store.state.role)
  const mayAdd = canAddListing(store.state.role)
  // The wizard serves BOTH adding and editing — openEdit() reopens it with the
  // record's own id — so the rule depends on which one this is. A new listing
  // follows mayAdd; the same screen carrying a propId is an edit and is judged
  // against that listing's author, or opening the add path would have handed
  // every agent an edit path with it.
  const editing = sel.propAdd && sel.propId
  const mayEditThis = mayEditAny
  if (sel.propAdd && (editing ? mayEditThis : mayAdd)) {
    return <PropertyWizard store={store} go={go} sel={sel} topBar={topBar} phone={phone} />
  }
  if (sel.propOpen && sel.propId) return <PropertyDetail store={store} go={go} sel={sel} setSel={setSel} topBar={topBar} phone={phone} />
  return <PropertyList store={store} go={go} sel={sel} setSel={setSel} topBar={topBar} phone={phone} mayEdit={mayEditAny} mayAdd={mayAdd} />
}

function PropertyList({ store, go, sel, setSel, topBar, phone, mayEdit, mayAdd }) {
  const { state } = store
  // THE FILTER LIVES IN THE URL, exactly as the Leads bag does — see nav.js.
  // It was a private useState here, so filtering the book and opening a listing
  // threw the filter away (<Properties> swaps the list component out for the
  // record, destroying its state) and so did a reload. Measured before the
  // change: 20 rows filtered to 14, open a listing, come back to 20 with no
  // chip and nothing in the URL saying what had happened.
  //
  // `q`, the page, the view and the selection stay local, same as Leads: a
  // history entry per keystroke is not navigation.
  const bag = sel.propFilters || {}
  const sortKey = bag.sortKey || 'recent'
  const sortDir = bag.sortDir || 'asc'
  const tab = bag.tab || 'all'
  const flt = useMemo(() => {
    const o = {}
    for (const k of PROP_FILTER_KEYS) if (bag[k]?.length) o[k] = bag[k]
    return o
  }, [JSON.stringify(bag)])
  const projectSel = flt.project?.length === 1 ? flt.project[0] : null

  const [q, setQ] = useState('')
  // GROUPED BY PROJECT IS WHERE THE DESK STARTS: a firm's inventory is
  // townships, and a flat is found by its building first. Arriving with a
  // filter, a tab or a project already chosen means the list. A phone gets the
  // list, as Calling's does.
  const filtered = Object.keys(flt).length > 0 || tab !== 'all'
  const [view, setView] = useState(phone || filtered ? 'list' : 'projects')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [selected, setSelected] = useState(new Set())

  // Any change to what's being asked for invalidates whatever page you were on —
  // page 3 of "3BHK in Baner" is a different page 3 once the filter changes.
  // REPLACE rather than push: back should leave the screen, not walk back
  // through six filter states.
  const patchBag = (patch) => {
    setSel(s => {
      const next = { ...(s.propFilters || {}), ...patch }
      for (const k of Object.keys(next)) {
        const v = next[k]
        if (v === undefined || v === null || v === 'all' || (Array.isArray(v) && !v.length)) delete next[k]
      }
      return { ...s, propFilters: Object.keys(next).length ? next : undefined }
    })
    setPage(1); setSelected(new Set())
  }
  // The panel hands back the WHOLE bag, so replace the filter keys wholesale
  // and keep the sort, the tab and the project, which live in the same bag but
  // are not the panel's.
  const setFltP = (v) => {
    const cleared = Object.fromEntries(PROP_FILTER_KEYS.filter(k => k !== 'project').map(k => [k, undefined]))
    const next = { ...cleared, ...(v || {}) }
    if (!projectSel) next.tower = undefined
    patchBag(next)
    setView('list')
  }
  const pickTab = (key) => { patchBag({ tab: key }); setView('list') }
  const toProject = (key) => { patchBag({ project: [key], tower: undefined }); setView('list') }
  // LEAVING A PROJECT goes back to the cards with nothing left switched on.
  const leaveProject = () => {
    const cleared = Object.fromEntries([...PROP_FILTER_KEYS, 'tab', 'sortKey', 'sortDir'].map(k => [k, undefined]))
    patchBag(cleared)
    setView('projects')
  }
  // An old link to the project page (?project=) lands here, on the same list.
  useEffect(() => {
    if (!sel.projOpen || !sel.projKey) return
    // The key is read HERE, not inside the updater: React may run an updater
    // twice, and the second run sees the key the first one cleared.
    const key = sel.projKey
    setSel(s => ({ ...s, projOpen: false, projKey: undefined, propFilters: { project: [key] } }))
    setView('list')
  }, [sel.projOpen, sel.projKey])

  // THE ONE PROJECT PICKED: its facts for the band above the list, and its
  // towers for the Tower filter. Read from the project aggregate, the same one
  // its card on the grid was drawn from.
  const { data: project } = useServerData(
    () => (projectSel ? api.getProject(projectSel).then(r => r?.project || null) : Promise.resolve(null)),
    [projectSel, state.dataAsOf], null)
  const setQP = (v) => { setQ(v); setPage(1) }
  const setSortKeyP = (v) => patchBag({ sortKey: v })
  const setSortDirP = (v) => patchBag({ sortDir: v })
  const setPageSizeP = (v) => { setPageSize(v); setPage(1) }
  const setPageP = (v) => { setPage(v); setSelected(new Set()) }
  useEffect(() => { setSelected(new Set()) }, [view, projectSel])

  const open = (id) => go('properties', { propId: id, propOpen: true })

  // ONE QUESTION for the rows and for the tab counts, so a tab can never
  // promise listings its list cannot find.
  const source = useServerList(
    (params) => api.listProperties(toQuery({ ...params, tab: tab === 'all' ? undefined : tab })),
    { filters: flt, search: q, sortKey, sortDir, page, pageSize, accumulate: !!phone },
    [state.dataAsOf, tab],
    { store, kind: 'property' },
  )
  const { data: counts } = useServerData(
    () => api.getPropertyTabs(toQuery({ ...flt, q })).then(r => r?.tabs || {}),
    [state.dataAsOf, q, JSON.stringify(flt)], {})

  // THE TABS ARE WHAT A LISTING IS DOING. The strip of Listings / Available /
  // Rentals they replace was three firm-wide totals that ignored every filter
  // on screen. Available splits by deal because an available flat is worked as
  // a sale or as a rental; the three off the market do not. A listing that
  // never said sale or rent is in neither, and has its own tab while any exist.
  const c = counts || {}
  const segs = [
    { key: 'all', label: 'All', count: c.total ?? 0 },
    { key: 'available_sale', label: 'Available for sale', count: c.available_sale ?? 0 },
    { key: 'available_rent', label: 'Available for rent', count: c.available_rent ?? 0 },
    ...(c.available_unstated > 0 || tab === 'available_unstated'
      ? [{ key: 'available_unstated', label: 'Available, deal not stated', count: c.available_unstated ?? 0 }] : []),
    { key: 'Blocked', label: 'Blocked', count: c.Blocked ?? 0 },
    { key: 'Sold', label: 'Sold', count: c.Sold ?? 0 },
    { key: 'Leased', label: 'Leased', count: c.Leased ?? 0 },
  ].map(s => ({ ...s, on: tab === s.key, disabled: s.key !== 'all' && !s.count, onClick: () => pickTab(s.key) }))

  // DUPLICATE, from the rows. One row is the ordinary duplicate: the form,
  // filled in, where its own flat number and photos are added. Several is a
  // batch of copies made at once, each without a flat number until somebody
  // adds it — a firm lists the flats it has, and a floor is not all one owner.
  const picked = (source.rows || []).filter(p => selected.has(p.id))
  const duplicate = () => {
    if (picked.length === 1) { go('properties', { propAdd: true, propId: null, propCopyOf: picked[0].id }); return }
    store.openModal({
      kind: 'confirm',
      title: `Duplicate ${picked.length} listings?`,
      lines: picked.map(p => [p.society || p.project, unitLabel(p), configLabel(p)].filter(Boolean).join(' · ')),
      confirmLabel: `Duplicate ${picked.length}`,
      onConfirm: () => {
        const rows = picked.map(p => { const f = fromCopy(p); return { ...f, completeness: scoreOf(f), copiedFrom: p.id } })
        setSelected(new Set())
        store.addProperties(rows).then(() => store.touched?.())
      },
    })
  }

  const paginated = view !== 'projects'
  const { header, toolbar, body } = ModuleListView({
    def: PROPERTIES_DEF, store,
    source,
    onOpen: (p) => open(p.id),
    filters: flt, onFilters: setFltP,
    facets: { towers: (projectSel ? project?.wings || [] : []).map(t => ({ value: t, label: t })) },
    search: q, onSearch: setQP,
    sortKey, onSortKey: setSortKeyP, sortDir, onSortDir: setSortDirP,
    segments: segs, view, onView: setView, phone,
    page, onPage: paginated ? setPageP : undefined, pageSize, onPageSize: paginated ? setPageSizeP : undefined,
    // Grid/list toggle only applies to the flat unit views, hide it in project view.
    showViewSwitch: view !== 'projects',
    selection: (mayAdd && view !== 'projects' && selected.size > 0) ? {
      count: selected.size,
      actions: [{ label: 'Duplicate', icon: 'copy', onClick: duplicate }],
      onClear: () => setSelected(new Set()),
    } : null,
    // GROUP BY PROJECT, first in the bar — the same control Calling has. Inside
    // a project it becomes that project's chip, and × goes back to the cards.
    toolbarLeft: projectSel ? (
      <span className="proj-chip">
        <Icon name="building" size={14} />
        <span className="proj-chip-t">{project?.name || projectSel}</span>
        <button type="button" aria-label="Back to all projects" onClick={leaveProject}><Icon name="x" size={13} /></button>
      </span>
    ) : (
      <button className={'grp-toggle' + (view === 'projects' ? ' on' : '')}
        onClick={() => setView(view === 'projects' ? 'list' : 'projects')}>
        <Icon name="building" size={14} />Group by project
      </button>
    ),
    cta: mayAdd ? {
      label: projectSel ? 'Add unit' : 'Add property',
      onClick: () => go('properties', { propAdd: true, propId: null, ...(projectSel ? { propProject: projectSel } : {}) }),
    } : null,
    emptyHint: 'Try clearing a filter or search.',
    renderTable: (list, v) => v === 'projects'
      ? <ProjectGrid onOpen={toProject} />
      : v === 'grid'
        ? <div className="grid-cards">{list.map(p => <PropertyCard key={p.id} p={p} matchCount={p.demandCount || 0} onClick={() => open(p.id)} />)}</div>
        : <PropTable def={PROPERTIES_DEF} list={list} store={store} onOpen={open}
            selectable={mayAdd} selectedIds={selected} onSelectionChange={setSelected} />,
  })

  // The project's facts, above its list: what the page for it used to show,
  // without being a second screen that the list's search and filters never
  // reached.
  const facts = project ? [
    project.developer || null,
    project.locality || null,
    `${project.counts.total} unit${project.counts.total !== 1 ? 's' : ''}`,
    project.wings?.length ? `${project.wings.length} wing${project.wings.length > 1 ? 's' : ''}` : null,
    priceRangeLabel(project.priceRange),
  ].filter(Boolean) : []

  return (
    <>
      {topBar({
        title: 'Properties',
        actions: (phone || !mayEdit) ? null : <Button variant="secondary" size="sm" icon="layers" onClick={() => go('import', { kind: 'properties' })}>Import</Button>
      })}
      {projectSel && project && (
        <div className="proj-band">
          <span className="proj-band-t">{project.name}</span>
          {facts.map((f, i) => <span key={i} className="proj-band-f">{f}</span>)}
        </div>
      )}
      {header}
      <ListLayout toolbar={toolbar}>{body}</ListLayout>
    </>
  )
}

// The unit table used by BOTH the "other units in this project" section on a
// listing and each wing block on a project page. It was written out twice,
// identically, and neither copy had a limit — a 200-unit township rendered 200
// rows into a record page, which on a phone is a wall you scroll past to reach
// anything below it.
function UnitsTable({ units, onOpen }) {
  const { cap, more, showMore } = useCap(units.length, 10)
  return (
    <>
      <div className="tbl-scroll">
        <table className="tbl tbl-flush">
          <thead><tr><th>Unit</th><th>Config · floor</th><th>Carpet</th><th>Owner</th><th>Status</th><th>Quoted</th></tr></thead>
          <tbody>
            {units.slice(0, cap).map(u => (
              <tr key={u.id} onClick={() => onOpen(u.id)}>
                <td><span className="unit-tag unit-tag-flush">{unitLabel(u) || '—'}</span></td>
                <td className="cell-txt">{configLabel(u)} · {u.totalFloors ? `${u.floor}/${u.totalFloors}` : (u.floor || '—')}</td>
                <td className="cell-txt">{u.carpet ? `${u.carpet} ${labelOf(AREA_UNITS, u.areaUnit || 'sqft')}` : '—'}</td>
                <td className="cell-txt">{u.owner || '—'}</td>
                <td><StatusTag status={u.status || 'Available'} /></td>
                <td><Quoted q={quotedLine(u)} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <MoreRows more={more} step={10} noun="units" onMore={showMore} />
    </>
  )
}

// ---------------------------------------------------------------------------
// ProjectGrid — the township lens. The grouping is a GROUP BY on the server, so
// this reads project rows directly instead of aggregating every unit in the
// firm in the browser (which is what made this view require the collection).
function ProjectGrid({ onOpen }) {
  const { data, loading, error } = useServerData(() => api.listProjects(), [], { data: [] }, '/properties/projects')
  const rows = data?.data || []
  if (loading && !rows.length) return <div className="list-spin" role="status" aria-label="Loading"><span /></div>
  if (error) return <div className="detail-missing">Could not load projects.</div>
  if (!rows.length) return <div className="detail-missing">No projects yet.</div>
  return <div className="grid-cards">{rows.map(pj => <ProjectCard key={pj.key} project={pj} onClick={() => onOpen(pj.key)} />)}</div>
}

// Table view: definition columns + a module-specific "Buyers" demand column injected.
// `demandCount` rides on the row from the server, counted by one join over the
// page being rendered. It used to be leadsForProperty() run per row against
// every lead in the firm.
function PropTable({ def, list, store, onOpen, selectable, selectedIds, onSelectionChange }) {
  const demandCol = { key: 'demand', label: 'Buyers', render: (p) => (
    p.demandCount ? <span className="pc-demand"><Icon name="people" size={13} />{p.demandCount}</span> : <span className="cell-quiet">—</span>
  ) }
  // insert Buyers just before the trailing Quoted column
  const cols = def.columns.slice()
  cols.splice(cols.length - 1, 0, demandCol)
  const augmented = { ...def, columns: cols }
  return <ModuleTable def={augmented} rows={list} store={store} onOpen={(p) => onOpen(p.id)}
    selectable={selectable} selectedIds={selectedIds} onSelectionChange={onSelectionChange} />
}

// ---------------------------------------------------------------------------
// PropertyDetail — thin wrapper: supplies the property's UNIQUE sections to the
// standard ModuleDetail. Field viewing/editing + action rail are standardized.
function PropertyDetail({ store, go, sel, setSel, topBar, phone }) {
  const [gallery, setGallery] = useState(null)
  // Fetched on its own when we don't already hold it — a listing opened from a
  // deep link, a notification, or page 40 of the list is no longer conditional
  // on the whole book being in memory.
  const { record: p, loading, error } = useRecord(store, 'property', sel.propId)
  // The live rent on this flat, if any — for the renewal banner. Called here,
  // above the early returns, as every hook in this component must be.
  const { rows: liveAgreements } = useAgreementsFor({ propertyId: sel.propId, status: 'active' }, store)
  const mayEdit = canEditListing(store.state.role)
  // The two things this page needs beyond the listing itself, each its own read:
  // the buyers it matches, and the other units in its project. Both used to be
  // array scans over collections held in memory for exactly this.
  const { data: candidates } = useServerData(
    () => sel.propId ? api.getPropertyBuyers(sel.propId).then(r => r?.buyers || []) : Promise.resolve([]),
    [sel.propId], [])
  const projKey = p?.project || p?.society || ''
  const { data: siblingPage } = useServerData(
    () => projKey ? api.listProperties({ project: projKey, excludeId: sel.propId, limit: 24 }) : Promise.resolve({ data: [] }),
    [projKey, sel.propId], { data: [] })
  const siblings = siblingPage?.data || []
  const back = () => setSel(s => ({ ...s, propOpen: false }))
  // Same as the lead record: an id this workspace cannot resolve returns to the
  // list rather than parking on a message that guesses at why.
  useEffect(() => {
    if (error !== 'not-found') return
    store.toast('Listing not found')
    setSel(s => ({ ...s, propOpen: false, propId: undefined }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [error])
  if (!p) {
    return (
      <>
        {topBar({ title: 'Property', eyebrow: 'Properties', onBack: back })}
        {loading
          ? <div className="list-spin" role="status" aria-label="Loading"><span /></div>
          : <div className="detail-missing">{error === 'not-found' ? null : 'Could not open this listing.'}</div>}
      </>
    )
  }

  const proj = p.project || p.society
  const buyers = leadsForProperty(p, candidates || [])
  // A rent ending within 60 days is the one thing about a let flat that needs
  // doing, so it takes the banner.
  const ending = (liveAgreements || []).find(a => a.kind === 'rent' && a.daysLeft != null && a.daysLeft <= 60)
  // Edit reuses the add page (spec) — one form to maintain, not two.
  const openEdit = () => go('properties', { propAdd: true, propId: p.id, propOpen: false })

  // Rail: Next-Best-Action banner (renewal or share).
  const nba = ending
    ? <NbaBanner label="Renewal due" icon="clock"
        title={ending.daysLeft === 0 ? 'Rent agreement ends today' : `Rent agreement ends in ${ending.daysLeft} days`}
        sub={ending.party?.name || ''}
        cta={{ label: 'Renew', icon: 'calendar', onClick: () => store.openModal({ kind: 'agreement', mode: 'renew', agreementId: ending.id }) }} />
    : <NbaBanner label={buyers[0] ? `Interested ${p.deal === 'rent' ? 'tenant' : 'buyer'}` : 'Share listing'} icon="wa"
        title={buyers[0] ? `Send to ${buyers[0].lead.name.split(' ')[0]}` : 'Pick a recipient'}
        sub={buyers[0] ? `${p.type} · ${p.locality}` : 'No matched contacts yet'}
        cta={{ label: 'WhatsApp', icon: 'wa', onClick: () => store.openModal({ kind: 'pickBuyer', propId: p.id }) }} />

  // Photos sit directly under the identity band rather than four panels down.
  // A listing IS its photos — they are what gets forwarded, and burying them
  // under tenancy and a township's worth of other units meant nobody scrolled
  // far enough to notice a listing had none.
  // C8. Watermarked on the device before upload, so what's shown here is exactly
  // what a client receives if it's forwarded on.
  const media = (p.media || [])
  // 7.5 The photo link: one tap copies it; it is also in every share message.
  // Off, it can be turned back on; New makes a fresh one and the old stops.
  const link = p.galleryPath ? `${window.location.origin}${p.galleryPath}` : ''
  const copyLink = () => copyText(link).then(ok => store.toast(ok ? 'Photo link copied' : 'Could not copy. Your browser blocked it.', ok ? undefined : 'warn'))
  const linkTools = !mayEdit && !link ? null : (
    <span className="pgal-tools">
      {link ? (
        <>
          <button type="button" className="btn btn-ghost btn-sm" onClick={copyLink}><Icon name="copy" size={13} />Copy photo link</button>
          <a className="btn btn-ghost btn-sm" href={link} target="_blank" rel="noopener noreferrer"><Icon name="eye" size={13} />Open</a>
          {mayEdit && <button type="button" className="btn btn-ghost btn-sm" onClick={() => {
            if (window.confirm('Turn off the photo link? Anyone who has it will see nothing.')) store.setPropertyGallery(p.id, 'off').then(r => r && store.toast('Photo link turned off'))
          }}>Turn off</button>}
        </>
      ) : (
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => store.setPropertyGallery(p.id, 'new').then(r => r && store.toast('New photo link made'))}>
          <Icon name="share" size={13} />Turn on photo link
        </button>
      )}
    </span>
  )
  const photos = media.length === 0 ? null : (
    <Panel>
      <SectionHead title={`Photos · ${media.length}`} right={linkTools} />
      <div className="pgal">
        {media.map((m, i) => (
          // Every tile the same size, cover named rather than enlarged. A
          // double-width first tile made a two-photo listing look broken, and
          // it disagreed with the picker in the add form, where the cover is a
          // badge. Opens in place — a target="_blank" threw the raw file at a
          // new tab and lost the record the agent was reading.
          <button type="button" key={m.key} className="pgal-i" onClick={() => setGallery(i)}>
            {m.kind === 'video'
              ? <span className="pgal-vidbox"><Icon name="play" size={22} fill /></span>
              : <img src={fileUrl(m.key)} alt="" loading="lazy" />}
            {i === 0 && <span className="pgal-cover">Cover</span>}
            {m.kind === 'video' && <span className="pgal-cover pgal-vid">Video</span>}
          </button>
        ))}
      </div>
    </Panel>
  )

  // Module-unique related sections (the record sheet already covers all fields).
  const sections = [
    {
      // WHO HAS IT, on what terms — the agreements this flat is in
      // (components/Agreements.jsx). It was a `tenancy` blob: no rent, no
      // document, one per flat and overwritten at renewal. A deal closed on a
      // lead lands here; "Record" is for a tenancy the CRM never saw close.
      id: 'agreements',
      title: 'Agreements',
      right: !mayEdit ? null
        : <button className="btn btn-ghost btn-sm" onClick={() => store.openModal({ kind: 'agreement', mode: 'new', propertyId: p.id })}><Icon name="plus" size={13} />Record</button>,
      render: () => <AgreementList query={{ propertyId: p.id }} store={store} empty="No agreement on this flat yet." show={{ flat: false }} />,
    },
    {
      // Collapsed. This is a neighbour's inventory, not this listing's — useful
      // when you go looking for it, a wall of rows when you don't.
      id: 'siblings', when: () => siblings.length > 0, collapsed: true,
      title: `Other units in ${proj || 'this project'}`, right: `${siblings.length} more`,
      render: () => <UnitsTable units={siblings} onOpen={(id) => go('properties', { propId: id, propOpen: true })} />,
    },
    {
      // C7. The owner is OPTIONAL and internal — never in anything a client
      // receives. It can be captured with the listing (the broker is often on
      // the phone to the owner) or added here later, and editing it happens
      // here rather than in the stepped form, so fixing a phone number isn't a
      // trip through three steps.
      id: 'owner',
      title: 'Owner · internal',
      right: mayEdit ? <button className="btn btn-ghost btn-sm" onClick={() => store.openModal({ kind: 'ownerEdit', propId: p.id })}>
        <Icon name="edit" size={13} />{p.owner || p.ownerPhone ? 'Edit owner' : 'Add owner'}
      </button> : null,
      render: () => !p.owner && !p.ownerPhone
        ? <div className="detail-empty">
            No owner recorded.{mayEdit && <> <button className="lnk" onClick={() => store.openModal({ kind: 'ownerEdit', propId: p.id })}>Add the owner</button>.</>}
          </div>
        : (
          <div className="own">
            <span className="own-never">Never shared with clients</span>
            <KV items={[
              { k: 'Name', v: p.owner || '—' },
              { k: 'Phone', v: p.ownerPhone || '—' },
              { k: 'Email', v: p.ownerEmail || '—' },
              { k: 'Key / access', v: p.keyAccess || '—' },
            ]} />
            <div className="own-acts">
              {p.ownerPhone && (
                <>
                  <Button size="sm" variant="secondary" icon="phone"
                    onClick={() => store.openModal({ kind: 'contact', channel: 'call', name: p.owner, phone: p.ownerPhone, recordType: 'property', recordId: p.id })}>
                    Call owner
                  </Button>
                  <Button size="sm" variant="secondary" icon="wa"
                    onClick={() => store.openModal({ kind: 'contact', channel: 'wa', name: p.owner, phone: p.ownerPhone, recordType: 'property', recordId: p.id })}>
                    WhatsApp
                  </Button>
                </>
              )}
              <Button size="sm" variant="ghost" onClick={() => go('clients')}>
                All owners →
              </Button>
            </div>
          </div>
        ),
    },
    {
      id: 'buyers',
      title: `Interested ${p.deal === 'rent' ? 'tenants' : 'buyers'}`, right: `${buyers.length} matched`,
      render: () => buyers.length === 0
        ? <div className="detail-empty">No matching contacts yet.</div>
        : <CappedList items={buyers} step={6} noun="contacts">{(b, i) => (
            <div key={b.lead.id} className={'relrow' + (i ? ' relrow-div' : '')}>
              <button className="relrow-main" onClick={() => go('leads', { leadId: b.lead.id, leadOpen: true })}>
                <div className="relrow-name">{b.lead.name}</div>
                <div className="relrow-sub">{[latestPlus(b.lead.req.config), latestPlus(b.lead.req.locality), b.fitLine].filter(Boolean).join(' · ')}</div>
              </button>
              <Button variant="secondary" size="sm" onClick={() => store.openWhatsApp(p.id, b.lead.id)}>Share</Button>
            </div>
          )}</CappedList>,
    },
    {
      id: 'history',
      title: 'History',
      right: <button className="btn btn-ghost btn-sm" onClick={() => store.openModal({ kind: 'ownerUpdate', propId: p.id })}><Icon name="wa" size={13} />Update owner</button>,
      render: () => (p.timeline && p.timeline.length)
        ? <Timeline events={p.timeline} agents={store.state.agents} currentUserId={store.state.activeAgentId}
            onEditRemark={(eventId, text, outcome) => store.editRemark('property', p.id, eventId, text, outcome)} />
        : <div className="detail-empty">Nothing yet.</div>,
    },
  ]

  return (
    <>
      {topBar({ eyebrow: 'Properties', title: p.society, onBack: back })}
      <div className="app-body">
        <ModuleDetail
          def={PROPERTIES_DEF} record={p} store={store} onEdit={mayEdit ? openEdit : null} phone={phone}
          title={p.society}
          primary={[{ label: 'WhatsApp', icon: 'wa', onClick: () => store.openModal({ kind: 'pickBuyer', propId: p.id }) }]}
          nba={nba}
          beforeSheet={photos}
          sections={sections}
          actionCtx={{ onClose: back, go }}
        />
      </div>
      {gallery !== null && (
        <Lightbox items={p.media || []} index={gallery} onClose={() => setGallery(null)} />
      )}
    </>
  )
}
