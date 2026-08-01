import { useEffect, useState } from 'react'
import { ListLayout } from '../layouts/layouts.jsx'
import { useServerList } from '../lib/serverList.js'
import { useRecord } from '../lib/useRecord.js'
import { api } from '../lib/api.js'
import { ModuleListView, ModuleTable, PropertyCard, ProjectCard } from '../components/collections.jsx'
import { buildProjects, unitsInProject, unitsByWing } from '../lib/projects.js'
import { ModuleDetail } from '../components/ModuleDetail.jsx'
import { StatusTag, Quoted, Button, KV, Timeline, MoreRows, useCap, CappedList, Panel, SectionHead } from '../components/primitives.jsx'
import { NbaBanner } from '../components/rail.jsx'
import { leadsForProperty } from '../lib/matching.js'
import { fileUrl } from '../lib/media.js'
import Lightbox from '../components/Lightbox.jsx'
import { quotedLine, unitLabel, fmtDate, renewalSignal, configLabel } from '../lib/format.js'
import { AREA_UNITS, labelOf } from '../data/propertyFields.js'
import Icon from '../components/Icon.jsx'
import { PROPERTIES_DEF } from './definitions.jsx'
import PropertyWizard from './PropertyWizard.jsx'
import { canEditListing } from '../lib/permissions.js'

// The filter bar speaks in arrays ({ status: ['Available','Blocked'] }) because
// its controls are multi-select; the API speaks in comma-separated values. This
// is the whole translation, kept in one place so no screen invents its own.
const API_FILTERS = ['status', 'deal', 'type', 'locality', 'project']
function toQuery({ page, limit, q, ...filters }) {
  const out = { page, limit, q }
  for (const k of API_FILTERS) {
    const v = filters[k]
    if (Array.isArray(v)) { if (v.length) out[k] = v.join(',') }
    else if (v) out[k] = v
  }
  return out
}

// Counts for the stat strip, straight from Postgres. Refetched whenever the
// desk's data moves, so adding a listing moves the number without a reload.
function usePropertiesSummary(dataAsOf) {
  const [summary, setSummary] = useState({ total: 0, byStatus: {}, byDeal: {} })
  useEffect(() => {
    let live = true
    api.getPropertiesSummary()
      .then(r => { if (live && r?.success) setSummary(r.summary) })
      .catch(() => {})   // the strip degrades to zeros; the list still works
    return () => { live = false }
  }, [dataAsOf])
  return summary
}

export default function Properties({ store, go, sel, setSel, topBar, phone }) {
  const { state } = store
  const mayEdit = canEditListing(state.role)
  const [flt, setFlt] = useState({})
  const [q, setQ] = useState('')
  const [view, setView] = useState('list')
  const [sortKey, setSortKey] = useState('recent')
  const [sortDir, setSortDir] = useState('asc')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  // Any change to what's being asked for invalidates whatever page you were on —
  // page 3 of "3BHK in Baner" is a different page 3 once the filter changes.
  const setFltP = (v) => { setFlt(v); setPage(1) }
  const setQP = (v) => { setQ(v); setPage(1) }
  const setSortKeyP = (v) => { setSortKey(v); setPage(1) }
  const setSortDirP = (v) => { setSortDir(v); setPage(1) }
  const setPageSizeP = (v) => { setPageSize(v); setPage(1) }

  // Add/edit is a stepped PAGE, not a modal (spec C-add) — rendered inside this
  // screen the same way the detail takeover is, so no new route is needed.
  // A listing's facts are desk-owned. An agent reaching the wizard by any route
  // — deep link, stale sel, a button we missed — lands back on the list.
  if (sel.propAdd && mayEdit) return <PropertyWizard store={store} go={go} sel={sel} topBar={topBar} />
  if (sel.propOpen && sel.propId) return <PropertyDetail store={store} go={go} sel={sel} setSel={setSel} topBar={topBar} mayEdit={mayEdit} phone={phone} />
  if (sel.projOpen && sel.projKey) return <ProjectDetail store={store} go={go} sel={sel} setSel={setSel} topBar={topBar} />

  const open = (id) => go('properties', { propId: id, propOpen: true })
  const openProject = (key) => go('properties', { projKey: key, projOpen: true })

  // Counts come from Postgres, not from counting an array the browser had to
  // download first. `Listings` is the firm's real total — it used to be the
  // length of whatever happened to be in memory, which is the same number only
  // for as long as the whole book fits there.
  const summary = usePropertiesSummary(state.dataAsOf)
  const kpis = [
    { label: 'Listings', value: summary.total, onClick: () => setFltP({}) },
    { label: 'Available', value: summary.byStatus?.Available || 0, tone: 'accent', onClick: () => setFltP({ status: ['Available'] }) },
    { label: 'Rentals', value: summary.byDeal?.rent || 0, onClick: () => setFltP({ deal: ['rent'] }) },
  ]

  // The listings themselves: one page, fetched for the filters actually on
  // screen. The project view is an aggregate over the whole book and cannot be
  // built from a page, so it keeps the in-memory collection until it gets its
  // own endpoint.
  const source = useServerList(
    (params) => api.listProperties(toQuery(params)),
    { filters: flt, search: q, sortKey, sortDir, page, pageSize, accumulate: !!phone },
    [state.dataAsOf],
  )

  // Shared query engine drives filter/search/sort; a custom renderTable keeps the
  // module-specific card grid (with demand count) + demand-column table view.
  // Project view aggregates ALL units into cards — pagination is meaningless
  // (and would silently drop units from the aggregate), so it only applies
  // to the two flat unit views.
  const paginated = view !== 'projects'
  const { header, toolbar, body } = ModuleListView({
    def: PROPERTIES_DEF, store,
    // Flat unit views read one server page. The project view aggregates every
    // unit in the firm into cards, which a page cannot answer — it stays on the
    // in-memory collection until it has an endpoint of its own.
    records: paginated ? undefined : state.properties,
    source: paginated ? source : undefined,
    onOpen: (p) => open(p.id),
    filters: flt, onFilters: setFltP,
    search: q, onSearch: setQP,
    sortKey, onSortKey: setSortKeyP, sortDir, onSortDir: setSortDirP,
    kpis, view, onView: setView, phone,
    page, onPage: paginated ? setPage : undefined, pageSize, onPageSize: paginated ? setPageSizeP : undefined,
    // Grid/list toggle only applies to the flat unit views, hide it in project view.
    showViewSwitch: view !== 'projects',
    // No import button here: the top bar already carries Import / Revert on
    // every screen, and two buttons for one action in one viewport is a
    // question ("are these different?") rather than a convenience.
    toolbarRight: <>
      <button className={'grp-toggle' + (view === 'projects' ? ' on' : '')}
        onClick={() => setView(view === 'projects' ? 'list' : 'projects')}>
        <Icon name="building" size={14} />Group by project
      </button>
    </>,
    cta: mayEdit ? { label: 'Add property', onClick: () => go('properties', { propAdd: true, propId: null }) } : null,
    emptyHint: 'Try clearing a filter or search.',
    renderTable: (list, v) => v === 'projects'
      ? <div className="grid-cards">{buildProjects(list).map(pj => <ProjectCard key={pj.key} project={pj} onClick={() => openProject(pj.key)} />)}</div>
      : v === 'grid'
        ? <div className="grid-cards">{list.map(p => <PropertyCard key={p.id} p={p} matchCount={leadsForProperty(p, state.leads).length} onClick={() => open(p.id)} />)}</div>
        : <PropTable def={PROPERTIES_DEF} list={list} store={store} onOpen={open} allLeads={state.leads} />,
  })

  return (
    <>
      {topBar({
        title: 'Properties',
        actions: (phone || !mayEdit) ? null : <Button variant="secondary" size="sm" icon="layers" onClick={() => go('import', { kind: 'properties' })}>Import / Revert</Button>
      })}
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

// Table view: definition columns + a module-specific "Buyers" demand column injected.
function PropTable({ def, list, store, onOpen, allLeads }) {
  const demandCol = { key: 'demand', label: 'Buyers', render: (p) => {
    const demand = leadsForProperty(p, allLeads).length
    return demand ? <span className="pc-demand"><Icon name="people" size={13} />{demand}</span> : <span className="cell-quiet">—</span>
  } }
  // insert Buyers just before the trailing Quoted column
  const cols = def.columns.slice()
  cols.splice(cols.length - 1, 0, demandCol)
  const augmented = { ...def, columns: cols }
  return <ModuleTable def={augmented} rows={list} store={store} onOpen={(p) => onOpen(p.id)} />
}

// ---------------------------------------------------------------------------
// PropertyDetail — thin wrapper: supplies the property's UNIQUE sections to the
// standard ModuleDetail. Field viewing/editing + action rail are standardized.
function PropertyDetail({ store, go, sel, setSel, topBar, mayEdit, phone }) {
  const [gallery, setGallery] = useState(null)
  // Fetched on its own when we don't already hold it — a listing opened from a
  // deep link, a notification, or page 40 of the list is no longer conditional
  // on the whole book being in memory.
  const { record: p, loading, error } = useRecord(store, 'property', sel.propId)
  const back = () => setSel(s => ({ ...s, propOpen: false }))
  if (!p) {
    return (
      <>
        {topBar({ title: 'Property', eyebrow: 'Properties', onBack: back })}
        {loading
          ? <div className="list-spin" role="status" aria-label="Loading"><span /></div>
          : <div className="detail-missing">{error === 'not-found' ? 'This listing no longer exists.' : 'Could not open this listing.'}</div>}
      </>
    )
  }

  const buyers = leadsForProperty(p, store.state.leads)
  const proj = p.project || p.society
  const siblings = store.state.properties.filter(x => x.id !== p.id && (x.project || x.society) === proj)
  const tenancy = p.deal === 'rent' ? p.tenancy : null
  const renewal = renewalSignal(tenancy)
  // Edit reuses the add page (spec) — one form to maintain, not two.
  const openEdit = () => go('properties', { propAdd: true, propId: p.id, propOpen: false })

  // Rail: Next-Best-Action banner (renewal or share).
  const nba = renewal && renewal.tone !== 'ok'
    ? <NbaBanner label={renewal.tone === 'overdue' ? 'Renewal · overdue' : 'Renewal due'} icon="clock"
        title={renewal.label} sub={tenancy.tenant}
        cta={{ label: 'Handle renewal', icon: 'calendar', onClick: () => store.openModal({ kind: 'tenancy', propId: p.id }) }} />
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
  const photos = media.length === 0 ? null : (
    <Panel>
      <SectionHead title="Photos" right={`${media.length}`} />
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
      id: 'tenancy', when: () => p.deal === 'rent',
      title: 'Tenancy & deposit',
      right: !mayEdit ? null : tenancy
        ? <button className="btn btn-ghost btn-sm" onClick={() => store.openModal({ kind: 'tenancy', propId: p.id })}><Icon name="edit" size={13} />Manage</button>
        : <button className="btn btn-ghost btn-sm" onClick={() => store.openModal({ kind: 'tenancy', propId: p.id })}><Icon name="plus" size={13} />Record</button>,
      render: () => !tenancy
        ? <div className="detail-empty">Flat is vacant. Record a tenancy when it's let — track the agreement window and deposit here.</div>
        : <>
            {renewal && renewal.tone !== 'ok' && (
              <div className={'renewal-banner ' + renewal.tone}>
                <Icon name="clock" size={15} /><span className="u-spring">{renewal.label}</span>
                <button className="btn btn-sm" onClick={() => store.openModal({ kind: 'tenancy', propId: p.id })}>Renew</button>
              </div>
            )}
            <KV items={[
              { k: 'Tenant', v: tenancy.tenant + (tenancy.phone ? ` · ${tenancy.phone}` : '') },
              { k: 'Agreement', v: `${fmtDate(tenancy.start)} → ${fmtDate(tenancy.end)}` },
              { k: renewal ? 'Renewal' : 'Status', v: renewal ? renewal.label : 'Active' },
              { k: 'Deposit', v: tenancy.depositReturned ? `${tenancy.depositLabel} · returned` : `${tenancy.depositLabel} · held` },
            ]} />
          </>,
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
              <Button size="sm" variant="ghost" onClick={() => go('clients', { contactsTab: 'owners' })}>
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
                <div className="relrow-sub">{b.lead.req.config} · {b.lead.req.locality} · {b.fitLine}</div>
              </button>
              <Button variant="secondary" size="sm" onClick={() => store.openWhatsApp(p.id, b.lead.id)}>Share</Button>
            </div>
          )}</CappedList>,
    },
    {
      id: 'history',
      title: 'Listing history',
      right: <button className="btn btn-ghost btn-sm" onClick={() => store.openModal({ kind: 'ownerUpdate', propId: p.id })}><Icon name="wa" size={13} />Update owner</button>,
      render: () => (p.timeline && p.timeline.length)
        ? <Timeline events={p.timeline} agents={store.state.agents} currentUserId={store.state.activeAgentId}
            onEditRemark={(eventId, text) => store.editRemark('property', p.id, eventId, text)} />
        : <div className="detail-empty">No activity logged yet. Owner updates, calls, remarks and status changes appear here.</div>,
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
          actionCtx={{ onClose: back }}
        />
      </div>
      {gallery !== null && (
        <Lightbox items={p.media || []} index={gallery} onClose={() => setGallery(null)} />
      )}
    </>
  )
}

// ---------------------------------------------------------------------------
// ProjectDetail — a project is a DERIVED aggregate, not a stored record. This is
// a lightweight page: a header band of project facts + the units grid grouped by
// wing. Each unit row opens its normal PropertyDetail. "Add units" bulk-adds.
function ProjectDetail({ store, go, sel, setSel, topBar }) {
  const key = sel.projKey
  const back = () => setSel(s => ({ ...s, projOpen: false, projKey: undefined }))
  const project = buildProjects(store.state.properties).find(pj => pj.key === key)
  if (!project) { return <>{topBar({ title: 'Project', eyebrow: 'Properties', onBack: back })}<div className="detail-missing">No units in this project.</div></> }

  const { name, locality, developer, counts, priceRange, wings } = project
  const wingGroups = unitsByWing(unitsInProject(store.state.properties, key))
  const openUnit = (id) => go('properties', { propId: id, propOpen: true })

  const facts = [
    `${counts.total} unit${counts.total !== 1 ? 's' : ''}`,
    `${counts.available} available`,
    counts.sold ? `${counts.sold} sold` : null,
    wings.length ? `${wings.length} wing${wings.length > 1 ? 's' : ''}` : null,
    priceRange.label !== '—' ? priceRange.label : null,
  ].filter(Boolean)

  return (
    <>
      {topBar({ eyebrow: 'Properties', title: name, onBack: back })}
      <div className="app-body pagewrap">
        <div className="rechead">
          <div className="rh-top">
            <div className="rh-id">
              <div className="rh-icon"><Icon name="building" size={22} /></div>
              <div className="rh-idtext">
                <div className="rh-title">{name}</div>
                <div className="rh-facts">
                  {developer ? <span>{developer}</span> : null}
                  <span>{locality}</span>
                  {facts.map((f, i) => <span key={i}>{f}</span>)}
                </div>
              </div>
            </div>
            <div className="rh-actions">
              {/* C9: a handful of units is "add another in this project" (the
                  wizard keeps the building context and you only change what
                  differs); a builder's whole sheet is the Excel importer. The
                  tabular bulk-add modal that sat between them is retired. */}
              <Button variant="primary" icon="plus" onClick={() => go('properties', { propAdd: true, propId: null, propProject: key })}>Add unit</Button>
            </div>
          </div>
        </div>

        {wingGroups.map(group => (
          <div key={group.wing} className="panel wing-panel">
            <div className="sh"><span className="t">{group.wing}</span><span className="r">{group.units.length} unit{group.units.length !== 1 ? 's' : ''}</span></div>
            <UnitsTable units={group.units} onOpen={openUnit} />
          </div>
        ))}
      </div>
    </>
  )
}
