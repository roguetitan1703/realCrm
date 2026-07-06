import { useState } from 'react'
import { ListLayout } from '../layouts/layouts.jsx'
import { FilterBar, SortControl, Table } from '../components/collections.jsx'
import { StageTag, StatusTag, Avatar, CountBadge } from '../components/primitives.jsx'
import { initials, reqLine, budgetRange } from '../lib/format.js'

const SORT_OPTS = { name: 'Name', role: 'Role', activity: 'Recent' }
const LOCALITIES = ['Wakad', 'Baner', 'Kothrud', 'Hinjewadi', 'Viman Nagar', 'Kalyani Nagar', 'Wagholi']

// Clients = one directory of everyone the firm deals with (buyers, tenants,
// sellers, landlords). Renders through the SAME ListLayout + Table primitive as
// Leads — role is a segment tab, not a bespoke view.
export default function Clients({ store, go, topBar }) {
  const { state } = store
  const [seg, setSeg] = useState('all')
  const [flt, setFlt] = useState({})
  const [q, setQ] = useState('')
  const [sortKey, setSortKey] = useState('name')
  const [sortDir, setSortDir] = useState('asc')

  // build a uniform contact list
  const rows = []
  state.leads.forEach(l => rows.push({
    id: 'lead-' + l.id, kind: 'demand', role: l.req.deal === 'rent' ? 'Tenant' : 'Buyer',
    name: l.name, phone: l.phone, locality: l.req.locality, minsAgo: l.minsAgo,
    detail: `${l.req.config} · ${l.req.locality} · ${budgetRange(l.req)}`,
    signal: <StageTag stage={l.stage} />,
    onClick: () => go('leads', { leadId: l.id, leadOpen: true }),
  }))
  const owners = {}
  state.properties.forEach(p => {
    const o = (owners[p.owner] = owners[p.owner] || { name: p.owner, props: [] })
    o.props.push(p)
  })
  Object.values(owners).forEach(o => {
    const hasRent = o.props.some(p => p.deal === 'rent'), hasSale = o.props.some(p => p.deal === 'sale')
    const role = hasRent && !hasSale ? 'Landlord' : hasSale && !hasRent ? 'Seller' : 'Owner'
    const locs = [...new Set(o.props.map(p => p.locality))]
    const anyAvail = o.props.some(p => p.status === 'Available')
    rows.push({
      id: 'owner-' + o.name, kind: 'supply', role,
      name: o.name, phone: store.demoPhone(o.name), locality: locs[0], minsAgo: 999999,
      detail: `${o.props.length} listing${o.props.length > 1 ? 's' : ''} · ${locs.join(', ')}`,
      signal: <StatusTag status={anyAvail ? 'Available' : 'Closed'} />,
      onClick: () => go('properties', { propId: o.props[0].id, propOpen: true }),
    })
  })

  const roleGroup = (role) => role === 'Owner' ? ['Seller', 'Landlord'] : [role]
  const segs = [
    { key: 'all', label: 'All' },
    { key: 'Buyer', label: 'Buyers' },
    { key: 'Tenant', label: 'Tenants' },
    { key: 'Seller', label: 'Sellers' },
    { key: 'Landlord', label: 'Landlords' },
  ].map(s => ({
    ...s, on: seg === s.key,
    count: s.key === 'all' ? rows.length : rows.filter(r => roleGroup(r.role).includes(s.key)).length,
    onClick: () => setSeg(s.key),
  }))

  const fields = [
    { key: 'locality', label: 'Locality', icon: 'building', options: LOCALITIES.map(l => ({ value: l, label: l })) },
  ]

  let view = rows
  if (seg !== 'all') view = view.filter(r => roleGroup(r.role).includes(seg))
  if ((flt.locality || []).length) view = view.filter(r => flt.locality.includes(r.locality))
  if (q.trim()) {
    const s = q.trim().toLowerCase()
    view = view.filter(r => r.name.toLowerCase().includes(s) || (r.detail || '').toLowerCase().includes(s) || (r.phone || '').includes(s))
  }
  const val = (r) => sortKey === 'role' ? r.role : sortKey === 'activity' ? r.minsAgo : r.name.toLowerCase()
  view.sort((a, b) => { const c = val(a) < val(b) ? -1 : val(a) > val(b) ? 1 : 0; return sortDir === 'asc' ? c : -c })

  const columns = [
    { key: 'name', label: 'Name', sortable: true },
    { key: 'role', label: 'Role', sortable: true },
    { key: 'detail', label: 'Requirement / listings' },
    { key: 'locality', label: 'Locality' },
    { key: 'signal', label: 'Status' },
  ]
  const tableRows = view.map(r => ({
    id: r.id, onClick: r.onClick,
    cells: [
      <div className="u-row" style={{ gap: 11 }}>
        <span className="av av-sm" style={{ background: r.kind === 'supply' ? 'var(--accent)' : 'var(--chrome)' }}>{initials(r.name)}</span>
        <div><div className="name">{r.name}</div><div className="sub mono-num">{r.phone}</div></div>
      </div>,
      <span className="source">{r.role}</span>,
      <span style={{ fontSize: 13 }}>{r.detail}</span>,
      r.locality,
      r.signal,
    ],
  }))

  return (
    <>
      {topBar({ title: 'Clients', count: `${rows.length} contacts` })}
      <ListLayout toolbar={
        <FilterBar
          segments={segs} fields={fields} value={flt} onChange={setFlt}
          search={{ value: q, onChange: setQ, placeholder: 'Search clients…' }}
          right={<SortControl value={sortKey} dir={sortDir} onSort={setSortKey}
            onDir={() => setSortDir(d => d === 'asc' ? 'desc' : 'asc')}
            options={Object.entries(SORT_OPTS).map(([value, label]) => ({ value, label }))} />}
          cta={{ label: 'New client', onClick: () => store.openModal({ kind: 'newLead' }) }}
        />
      }>
        {view.length === 0
          ? <div className="empty"><div className="e-t">No clients match</div><div className="e-s">Adjust the segment, filter or search.</div></div>
          : <Table columns={columns} rows={tableRows} sortKey={sortKey} sortDir={sortDir} onSort={setSortKey} />}
      </ListLayout>
    </>
  )
}
