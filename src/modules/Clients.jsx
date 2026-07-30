import { useEffect, useState } from 'react'
import { ListLayout } from '../layouts/layouts.jsx'
import { ModuleListView, ModuleCards, ModuleTable } from '../components/collections.jsx'
import { ModuleDetail } from '../components/ModuleDetail.jsx'
import { StageTag, StatusTag, Avatar, Button, KV } from '../components/primitives.jsx'
import { initials, reqLine, budgetRange, ownerKeyOf } from '../lib/format.js'
import { CLIENTS_DEF } from './definitions.jsx'

// B3: Contacts is ONE section with TWO subnavs — Clients (demand: buyers,
// tenants) and Owners (supply: sellers, landlords) — backed by separate
// records (a person who is both gets two distinct rows, never merged). Each
// subnav gets its own role tab-pills underneath. An owner isn't its own
// stored record yet (it's derived from grouping properties by owner name),
// but it already has a stable id + is always reachable contextually from its
// property — the Contacts→Owners list is the "browse all owners" view, not
// the only path in.
export default function Clients({ store, go, sel, topBar }) {
  const { state } = store
  // Which store we're in is NAVIGATION, so it lives in the sidebar sub-nav and
  // is carried in `sel` — not in local component state. That way the nav and
  // the list can't disagree about which one is open, and a deep link works.
  const tab = sel?.contactsTab === 'owners' ? 'owners' : 'clients'
  const [seg, setSeg] = useState('all')
  const [flt, setFlt] = useState({})
  const [q, setQ] = useState('')
  const [sortKey, setSortKey] = useState('name')
  const [sortDir, setSortDir] = useState('asc')
  const [view, setView] = useState('list')
  const [selClient, setSelClient] = useState(null)

  // build a uniform contact list
  const rows = []
  state.leads.forEach(l => rows.push({
    id: 'lead-' + l.id,
    kind: 'demand',
    role: l.req?.deal === 'rent' ? 'Tenant' : 'Buyer',
    name: l.name,
    phone: l.phone,
    email: l.email || '',
    locality: l.req?.locality || 'Pune',
    minsAgo: l.minsAgo,
    rawLeadId: l.id,
    rawLead: l,
    detail: `${l.req?.config || 'Any'} · ${l.req?.locality || 'Pune'} · ${budgetRange(l.req)}`,
    signal: <StageTag stage={l.stage} />,
  }))

  const owners = {}
  state.properties.forEach(p => {
    const ownerKey = ownerKeyOf(p)
    const o = (owners[ownerKey] = owners[ownerKey] || { name: ownerKey, props: [] })
    o.props.push(p)
  })

  Object.values(owners).forEach(o => {
    const p = o.props[0]
    const hasSale = o.props.some(x => x.deal === 'sale')
    const hasRent = o.props.some(x => x.deal === 'rent')
    const role = hasSale && hasRent ? 'Seller / Landlord' : hasRent ? 'Landlord' : 'Seller'
    rows.push({
      id: 'owner-' + o.name.replace(/\s+/g, '-'),
      kind: 'supply',
      role,
      name: o.name,
      phone: p.ownerPhone || '+91 —',
      email: p.ownerEmail || '',
      locality: p.locality || 'Pune',
      minsAgo: 120,
      rawProps: o.props,
      detail: o.props.length === 1
        ? `1 listing · ${p.society} (${p.type})`
        : `${o.props.length} listings across ${[...new Set(o.props.map(x => x.locality))].join(', ')}`,
      signal: <StatusTag status="Active owner" />,
    })
  })

  rows.forEach(r => {
    r.onClick = () => setSelClient(r)
  })

  const roleMatch = (rRole, segKey) => {
    if (segKey === 'all') return true
    if (segKey === 'Seller') return rRole === 'Seller' || rRole === 'Seller / Landlord'
    if (segKey === 'Landlord') return rRole === 'Landlord' || rRole === 'Seller / Landlord'
    return rRole === segKey
  }

  const demandRows = rows.filter(r => r.kind === 'demand')
  const supplyRows = rows.filter(r => r.kind === 'supply')
  const scopeRows = tab === 'clients' ? demandRows : supplyRows

  // A role pill from the other store (e.g. "Landlord") would silently zero out
  // this list, so reset to All whenever the sub-nav switches stores.
  useEffect(() => { setSeg('all') }, [tab])

  // Role pills WITHIN the active store — Buyer/Tenant under Clients,
  // Seller/Landlord under Owners. Not a flat 5-way mix of both stores.
  const roleOptions = tab === 'clients'
    ? [{ key: 'all', label: 'All' }, { key: 'Buyer', label: 'Buyers' }, { key: 'Tenant', label: 'Tenants' }]
    : [{ key: 'all', label: 'All' }, { key: 'Seller', label: 'Sellers' }, { key: 'Landlord', label: 'Landlords' }]
  const segs = roleOptions.map(s => ({
    ...s,
    on: seg === s.key,
    count: s.key === 'all' ? scopeRows.length : scopeRows.filter(r => roleMatch(r.role, s.key)).length,
    onClick: () => setSeg(s.key),
  }))

  // Segment pre-filters the derived directory; the shared engine handles the rest.
  const records = seg === 'all' ? scopeRows : scopeRows.filter(r => roleMatch(r.role, seg))

  const kpis = tab === 'clients'
    ? [
        { label: 'Clients', value: demandRows.length, onClick: () => setSeg('all') },
        { label: 'Buyers', value: demandRows.filter(r => r.role === 'Buyer').length, onClick: () => setSeg('Buyer') },
        { label: 'Tenants', value: demandRows.filter(r => r.role === 'Tenant').length, onClick: () => setSeg('Tenant') },
      ]
    : [
        { label: 'Owners', value: supplyRows.length, onClick: () => setSeg('all') },
        { label: 'Sellers', value: supplyRows.filter(r => roleMatch(r.role, 'Seller')).length, onClick: () => setSeg('Seller') },
        { label: 'Landlords', value: supplyRows.filter(r => roleMatch(r.role, 'Landlord')).length, onClick: () => setSeg('Landlord') },
      ]

  const { header, toolbar, body } = ModuleListView({
    def: CLIENTS_DEF, records, store,
    onOpen: (r) => setSelClient(r),
    filters: flt, onFilters: setFlt,
    search: q, onSearch: setQ,
    sortKey, onSortKey: setSortKey, sortDir, onSortDir: setSortDir,
    kpis, segments: segs, view, onView: setView,
    // Owners aren't created directly (that's B3's stated, deliberate gap —
    // they're derived from a property's owner field); the CTA that actually
    // adds a new one is adding the property.
    cta: tab === 'clients'
      ? { label: 'New client', onClick: () => store.openModal({ kind: 'newLead' }) }
      : { label: 'Add property', onClick: () => store.openModal({ kind: 'addProperty' }) },
    emptyTitle: tab === 'clients' ? 'No clients match' : 'No owners match',
    emptyHint: 'Adjust the role, filter or search.',
    renderTable: (list, v) => v === 'grid'
      ? <ModuleCards def={CLIENTS_DEF} rows={list} store={store} onOpen={(r) => setSelClient(r)} />
      : <ModuleTable def={CLIENTS_DEF} rows={list} store={store} onOpen={(r) => setSelClient(r)} sortKey={sortKey} sortDir={sortDir} onSort={setSortKey} />,
  })

  // Full-page detail takeover — same pattern as Leads & Properties (not a drawer).
  if (selClient) {
    return (
      <>
        {topBar({ eyebrow: 'Contacts', title: selClient.name, onBack: () => setSelClient(null) })}
        <div className="app-body">
          <ModuleDetail
            def={CLIENTS_DEF} record={selClient} store={store}
            avatar={<span className={'av av-lg ' + (selClient.kind === 'supply' ? 'av-supply' : 'av-demand')}>{initials(selClient.name)}</span>}
            actionCtx={{ onClose: () => setSelClient(null) }}
            sections={[{
              id: 'portfolio',
              title: selClient.kind === 'demand' ? 'Associated requirement & lead' : 'Listed properties portfolio',
              render: () => selClient.kind === 'demand' && selClient.rawLead ? (
                <div className="cli-portfolio">
                  <KV items={[
                    { k: 'Looking for', v: `${selClient.rawLead.req?.config || 'Any'} · ${selClient.rawLead.req?.deal || 'sale'}` },
                    { k: 'Preferred locality', v: selClient.rawLead.req?.locality || 'Pune' },
                    { k: 'Current stage', v: selClient.rawLead.stage || 'New' },
                  ]} />
                  <Button variant="secondary" onClick={() => go('leads', { leadId: selClient.rawLeadId, leadOpen: true })}>
                    Open full lead workflow & timeline →
                  </Button>
                </div>
              ) : selClient.rawProps ? (
                <div className="cli-portfolio">
                  {selClient.rawProps.map(p => (
                    <div key={p.id} className="cli-prop">
                      <div>
                        <div className="cli-prop-t">{p.society} <span className="u-muted cli-prop-meta">({p.type} · {p.locality})</span></div>
                        <div className="relrow-sub">{p.carpet ? p.carpet + ' sqft · ' : ''}{p.deal === 'rent' ? 'For Rent' : 'For Sale'}</div>
                      </div>
                      <Button size="sm" variant="secondary" onClick={() => go('properties', { propId: p.id, propOpen: true })}>View property →</Button>
                    </div>
                  ))}
                </div>
              ) : null,
            }]}
          />
        </div>
      </>
    )
  }

  return (
    <>
      {topBar({
        title: 'Contacts',
        actions: <Button variant="secondary" size="sm" icon="layers" onClick={() => go('import', { kind: 'clients' })}>Import</Button>
      })}
      {header}
      <ListLayout toolbar={toolbar}>{body}</ListLayout>
    </>
  )
}
