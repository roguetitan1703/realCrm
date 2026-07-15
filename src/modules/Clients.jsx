import { useState } from 'react'
import { ListLayout } from '../layouts/layouts.jsx'
import { ModuleListView, ModuleCards, ModuleTable } from '../components/collections.jsx'
import { ModuleDetail } from '../components/ModuleDetail.jsx'
import { StageTag, StatusTag, Avatar, Button, KV } from '../components/primitives.jsx'
import { initials, reqLine, budgetRange } from '../lib/format.js'
import { CLIENTS_DEF } from './definitions.jsx'

export default function Clients({ store, go, topBar }) {
  const { state } = store
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
    const ownerKey = p.owner || 'Unnamed Owner'
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

  const segs = [
    { key: 'all', label: 'All' },
    { key: 'Buyer', label: 'Buyers' },
    { key: 'Tenant', label: 'Tenants' },
    { key: 'Seller', label: 'Sellers' },
    { key: 'Landlord', label: 'Landlords' },
  ].map(s => ({
    ...s,
    on: seg === s.key,
    count: s.key === 'all' ? rows.length : rows.filter(r => roleMatch(r.role, s.key)).length,
    onClick: () => setSeg(s.key),
  }))

  // Segment pre-filters the derived directory; the shared engine handles the rest.
  const records = seg === 'all' ? rows : rows.filter(r => roleMatch(r.role, seg))

  const demandCount = rows.filter(r => r.kind === 'demand').length
  const supplyCount = rows.filter(r => r.kind === 'supply').length
  const kpis = [
    { label: 'Contacts', value: rows.length, onClick: () => setSeg('all') },
    { label: 'Demand', value: demandCount, tone: 'accent', onClick: () => setSeg('Buyer') },
    { label: 'Supply', value: supplyCount, onClick: () => setSeg('Seller') },
  ]

  const { header, toolbar, body } = ModuleListView({
    def: CLIENTS_DEF, records, store,
    onOpen: (r) => setSelClient(r),
    filters: flt, onFilters: setFlt,
    search: q, onSearch: setQ,
    sortKey, onSortKey: setSortKey, sortDir, onSortDir: setSortDir,
    kpis, segments: segs, view, onView: setView,
    cta: { label: 'New client', onClick: () => store.openModal({ kind: 'newLead' }) },
    emptyTitle: 'No clients match',
    emptyHint: 'Adjust the segment, filter or search.',
    renderTable: (list, v) => v === 'grid'
      ? <ModuleCards def={CLIENTS_DEF} rows={list} store={store} onOpen={(r) => setSelClient(r)} />
      : <ModuleTable def={CLIENTS_DEF} rows={list} store={store} onOpen={(r) => setSelClient(r)} sortKey={sortKey} sortDir={sortDir} onSort={setSortKey} />,
  })

  return (
    <>
      {topBar({
        title: 'Clients',
        actions: <Button variant="secondary" size="sm" icon="layers" onClick={() => go('import', { kind: 'clients' })}>Import / Revert</Button>
      })}
      {header}
      <div className="clients-split">
        <div className="clients-list">
          <ListLayout toolbar={toolbar}>{body}</ListLayout>
        </div>

        {/* Standardized detail drawer — same ModuleDetail as Leads & Properties */}
        {selClient && (
          <ModuleDetail
            def={CLIENTS_DEF} record={selClient} store={store}
            signals={<span className="md-deal">{selClient.role}</span>}
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
        )}
      </div>
    </>
  )
}
