import { useState } from 'react'
import { ListLayout } from '../layouts/layouts.jsx'
import { ModuleListView, ModuleTable, PropertyCard, ProjectCard } from '../components/collections.jsx'
import { buildProjects, unitsInProject, unitsByWing } from '../lib/projects.js'
import { ModuleDetail } from '../components/ModuleDetail.jsx'
import { StatusTag, Quoted, Button, KV, Timeline } from '../components/primitives.jsx'
import { NbaBanner } from '../components/rail.jsx'
import { leadsForProperty } from '../lib/matching.js'
import { quotedLine, unitLabel, fmtDate, renewalSignal } from '../lib/format.js'
import Icon from '../components/Icon.jsx'
import { PROPERTIES_DEF } from './definitions.jsx'

export default function Properties({ store, go, sel, setSel, topBar }) {
  const { state } = store
  const [flt, setFlt] = useState({})
  const [q, setQ] = useState('')
  const [view, setView] = useState('grid')
  const [sortKey, setSortKey] = useState('recent')
  const [sortDir, setSortDir] = useState('asc')

  if (sel.propOpen && sel.propId) return <PropertyDetail store={store} go={go} sel={sel} setSel={setSel} topBar={topBar} />
  if (sel.projOpen && sel.projKey) return <ProjectDetail store={store} go={go} sel={sel} setSel={setSel} topBar={topBar} />

  const open = (id) => go('properties', { propId: id, propOpen: true })
  const openProject = (key) => go('properties', { projKey: key, projOpen: true })

  const available = state.properties.filter(p => (p.status || 'Available') === 'Available').length
  const rentals = state.properties.filter(p => p.deal === 'rent').length
  const kpis = [
    { label: 'Listings', value: state.properties.length, onClick: () => setFlt({}) },
    { label: 'Available', value: available, tone: 'accent', onClick: () => setFlt({ status: ['Available'] }) },
    { label: 'Rentals', value: rentals, onClick: () => setFlt({ deal: ['rent'] }) },
  ]

  // Shared query engine drives filter/search/sort; a custom renderTable keeps the
  // module-specific card grid (with demand count) + demand-column table view.
  const { header, toolbar, body } = ModuleListView({
    def: PROPERTIES_DEF, records: state.properties, store,
    onOpen: (p) => open(p.id),
    filters: flt, onFilters: setFlt,
    search: q, onSearch: setQ,
    sortKey, onSortKey: setSortKey, sortDir, onSortDir: setSortDir,
    kpis, view, onView: setView,
    // Grid/list toggle only applies to the flat unit views, hide it in project view.
    showViewSwitch: view !== 'projects',
    toolbarRight: <>
      <button className={'grp-toggle' + (view === 'projects' ? ' on' : '')}
        onClick={() => setView(view === 'projects' ? 'grid' : 'projects')}>
        <Icon name="building" size={14} />Group by project
      </button>
      <Button variant="secondary" size="sm" icon="building" onClick={() => store.openModal({ kind: 'addUnits' })}>Add units</Button>
    </>,
    cta: { label: 'Add property', onClick: () => store.openModal({ kind: 'addProperty' }) },
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
        actions: <Button variant="secondary" size="sm" icon="layers" onClick={() => go('import', { kind: 'properties' })}>Import / Revert</Button>
      })}
      {header}
      <ListLayout toolbar={toolbar}>{body}</ListLayout>
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
function PropertyDetail({ store, go, sel, setSel, topBar }) {
  const p = store.state.properties.find(x => x.id === sel.propId)
  const back = () => setSel(s => ({ ...s, propOpen: false }))
  if (!p) { return <>{topBar({ title: 'Property', eyebrow: 'Properties', onBack: back })}<div className="detail-missing">Not found.</div></> }

  const buyers = leadsForProperty(p, store.state.leads)
  const proj = p.project || p.society
  const siblings = store.state.properties.filter(x => x.id !== p.id && (x.project || x.society) === proj)
  const tenancy = p.deal === 'rent' ? p.tenancy : null
  const renewal = renewalSignal(tenancy)
  const openEdit = () => store.openModal({ kind: 'editRecord', moduleId: 'properties', recordId: p.id })

  // Rail: Next-Best-Action banner (renewal or share).
  const nba = renewal && renewal.tone !== 'ok'
    ? <NbaBanner label={renewal.tone === 'overdue' ? 'Renewal · overdue' : 'Renewal due'} icon="clock"
        title={renewal.label} sub={tenancy.tenant}
        cta={{ label: 'Handle renewal', icon: 'calendar', onClick: () => store.openModal({ kind: 'tenancy', propId: p.id }) }} />
    : <NbaBanner label={buyers[0] ? `Interested ${p.deal === 'rent' ? 'tenant' : 'buyer'}` : 'Share listing'} icon="wa"
        title={buyers[0] ? `Send to ${buyers[0].lead.name.split(' ')[0]}` : 'Pick a recipient'}
        sub={buyers[0] ? `${p.type} · ${p.locality}` : 'No matched contacts yet'}
        cta={{ label: 'WhatsApp', icon: 'wa', onClick: () => store.openModal({ kind: 'pickBuyer', propId: p.id }) }} />

  // Module-unique related sections (the record sheet already covers all fields).
  const sections = [
    {
      id: 'tenancy', when: () => p.deal === 'rent',
      title: 'Tenancy & deposit',
      right: tenancy
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
      id: 'siblings', when: () => siblings.length > 0,
      title: `Other units in ${proj || 'this project'}`, right: `${siblings.length} more`,
      render: () => (
        <div className="tbl-scroll">
          <table className="tbl tbl-flush">
            <thead><tr><th>Unit</th><th>Config · floor</th><th>Carpet</th><th>Owner</th><th>Status</th><th>Quoted</th></tr></thead>
            <tbody>
              {siblings.map(s => (
                <tr key={s.id} onClick={() => go('properties', { propId: s.id, propOpen: true })}>
                  <td><span className="unit-tag unit-tag-flush">{unitLabel(s) || '—'}</span></td>
                  <td className="cell-txt">{s.type} · {s.totalFloors ? `${s.floor}/${s.totalFloors}` : '—'}</td>
                  <td className="cell-txt">{s.carpet ? s.carpet + ' sqft' : '—'}</td>
                  <td className="cell-txt">{s.owner}</td>
                  <td><StatusTag status={s.status} /></td>
                  <td><Quoted q={quotedLine(s)} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ),
    },
    {
      id: 'buyers',
      title: `Interested ${p.deal === 'rent' ? 'tenants' : 'buyers'}`, right: `${buyers.length} matched`,
      render: () => buyers.length === 0
        ? <div className="detail-empty">No matching contacts yet.</div>
        : buyers.map((b, i) => (
            <div key={b.lead.id} className={'relrow' + (i ? ' relrow-div' : '')}>
              <button className="relrow-main" onClick={() => go('leads', { leadId: b.lead.id, leadOpen: true })}>
                <div className="relrow-name">{b.lead.name}</div>
                <div className="relrow-sub">{b.lead.req.config} · {b.lead.req.locality} · {b.fitLine}</div>
              </button>
              <Button variant="secondary" size="sm" onClick={() => store.openWhatsApp(p.id, b.lead.id)}>Share</Button>
            </div>
          )),
    },
    {
      id: 'history',
      title: 'Listing history',
      right: <button className="btn btn-ghost btn-sm" onClick={() => store.openModal({ kind: 'ownerUpdate', propId: p.id })}><Icon name="wa" size={13} />Update owner</button>,
      render: () => (p.timeline && p.timeline.length)
        ? <Timeline events={p.timeline} />
        : <div className="detail-empty">No activity logged yet. Owner updates, calls and status changes appear here.</div>,
    },
  ]

  return (
    <>
      {topBar({ eyebrow: 'Properties', title: p.society, onBack: back })}
      <div className="app-body">
        <ModuleDetail
          def={PROPERTIES_DEF} record={p} store={store} onEdit={openEdit}
          title={p.society}
          primary={[{ label: 'WhatsApp', icon: 'wa', onClick: () => store.openModal({ kind: 'pickBuyer', propId: p.id }) }]}
          nba={nba}
          sections={sections}
          actionCtx={{ onClose: back }}
        />
      </div>
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
              <Button variant="primary" icon="plus" onClick={() => store.openModal({ kind: 'addUnits', projKey: key })}>Add units</Button>
            </div>
          </div>
        </div>

        {wingGroups.map(group => (
          <div key={group.wing} className="panel wing-panel">
            <div className="sh"><span className="t">{group.wing}</span><span className="r">{group.units.length} unit{group.units.length !== 1 ? 's' : ''}</span></div>
            <div className="tbl-scroll">
              <table className="tbl tbl-flush">
                <thead><tr><th>Unit</th><th>Config · floor</th><th>Carpet</th><th>Owner</th><th>Status</th><th>Quoted</th></tr></thead>
                <tbody>
                  {group.units.map(u => (
                    <tr key={u.id} onClick={() => openUnit(u.id)}>
                      <td><span className="unit-tag unit-tag-flush">{unitLabel(u) || '—'}</span></td>
                      <td className="cell-txt">{u.type} · {u.totalFloors ? `${u.floor}/${u.totalFloors}` : (u.floor || '—')}</td>
                      <td className="cell-txt">{u.carpet ? u.carpet + ' sqft' : '—'}</td>
                      <td className="cell-txt">{u.owner || '—'}</td>
                      <td><StatusTag status={u.status || 'Available'} /></td>
                      <td><Quoted q={quotedLine(u)} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </div>
    </>
  )
}
