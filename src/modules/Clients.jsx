import { useEffect, useState } from 'react'
import { ListLayout } from '../layouts/layouts.jsx'
import { ModuleListView, ModuleCards, ModuleTable } from '../components/collections.jsx'
import { ModuleDetail } from '../components/ModuleDetail.jsx'
import { StatusTag, Avatar, Button } from '../components/primitives.jsx'
import { initials, reqLine } from '../lib/format.js'
import { CLIENTS_DEF, partiesDef } from './definitions.jsx'
import { api } from '../lib/api.js'
import { useServerList } from '../lib/serverList.js'
import { useServerData } from '../lib/useServerData.js'

// ============================================================================
// 👤 CONTACTS — the people whose property this firm manages
// ============================================================================
// WHAT IT IS NOT, because it has twice been both: it is not the calling list
// (people being rung to WIN a property — a pipeline with stages, a queue and
// callbacks, which lives in Calling), and it is not the leads (buyers and
// tenants, which live in Leads). A contact comes into being when a property is
// added: the owner of a flat on our books.
//
// THREE KINDS OF PERSON, each on its own tab (decided 24 Sep): OWNERS whose
// flat we manage, TENANTS renting through us, BUYERS who bought through us.
// It once had a Clients tab reading the leads table, which put the same person
// on two screens under two names; a tenant or a buyer is here only because an
// agreement names them (Close the deal), never because they enquired.
export default function Clients(props) {
  const tab = props.sel?.contactsTab || 'owners'
  if (tab === 'tenants' || tab === 'buyers') return <Parties {...props} kind={tab === 'tenants' ? 'rent' : 'sale'} />
  return <Owners {...props} />
}

/**
 * Tenants or buyers: the people an agreement names, one row per agreement.
 * A row opens the FLAT, which is where the agreement lives (renew, end, the
 * file). The lead they came from is linked on it; it is not the tenant.
 */
function Parties({ store, go, topBar, phone, kind }) {
  const { state } = store
  const def = partiesDef(kind)
  const [q, setQ] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [flt, setFlt] = useState({ status: ['active'] })
  const [sortKey, setSortKey] = useState('ends')
  const [sortDir, setSortDir] = useState('asc')
  const status = flt.status?.[0] || 'all'
  const source = useServerList(
    (params) => api.listAgreements({
      kind, status, q: params.q, page: params.page, limit: params.limit,
      sort: sortKey, dir: sortDir,
    }).then(r => ({ data: r?.rows || [], total: r?.total ?? 0, counts: r?.counts || {} })),
    { search: q, page, pageSize },
    [kind, status, sortKey, sortDir, state.dataAsOf],
  )
  const c = source.counts || {}
  const facets = {
    status: kind === 'rent'
      ? [
          { value: 'active', label: 'Renting now', count: c.active ?? 0 },
          { value: 'ending', label: 'Ending in 30 days', count: c.ending ?? 0 },
          { value: 'past', label: 'Moved out or renewed', count: c.past ?? 0 },
        ]
      : [
          { value: 'active', label: 'Current', count: c.active ?? 0 },
          { value: 'past', label: 'Ended', count: c.past ?? 0 },
        ],
  }
  const open = (a) => (a.propertyId
    ? go('properties', { propId: a.propertyId, propOpen: true })
    : a.leadId ? go('leads', { leadId: a.leadId, leadOpen: true }) : null)
  const { header, toolbar, body } = ModuleListView({
    def, source, store, onOpen: open, phone,
    filters: flt, onFilters: (v) => { setFlt(v); setPage(1) }, facets,
    search: q, onSearch: (v) => { setQ(v); setPage(1) },
    sortKey, onSortKey: (v) => { setSortKey(v); setPage(1) }, sortDir, onSortDir: (v) => { setSortDir(v); setPage(1) },
    view: 'list', showViewSwitch: false,
    page, onPage: setPage, pageSize, onPageSize: (v) => { setPageSize(v); setPage(1) },
    emptyTitle: kind === 'rent' ? 'No tenants here' : 'No buyers here',
    emptyHint: 'Clear the filter or search.',
    renderTable: (list, v) => v === 'grid'
      ? <ModuleCards def={def} rows={list} store={store} onOpen={open} phone={phone} />
      : <ModuleTable def={def} rows={list} store={store} onOpen={open} />,
  })
  return (
    <>
      {topBar({ title: def.name, eyebrow: 'Contacts' })}
      {header}
      <ListLayout toolbar={toolbar}>{body}</ListLayout>
    </>
  )
}

function Owners({ store, go, sel, setSel, topBar, phone }) {
  const { state } = store
  // WHAT THEY GAVE US, as a filter: Landlords first, because a flat to let is
  // the work that comes back every eleven months. Clearing it shows everyone.
  const [flt, setFlt] = useState({ role: ['Landlord'] })
  const seg = flt.role?.[0] || 'all'
  const [q, setQ] = useState('')
  const [sortKey, setSortKey] = useState('name')
  const [sortDir, setSortDir] = useState('asc')
  const [view, setView] = useState('list')
  const [selClient, setSelClient] = useState(null)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const setFltP = (v) => { setFlt(v); setPage(1) }
  const setQP = (v) => { setQ(v); setPage(1) }
  const setSortKeyP = (v) => { setSortKey(v); setPage(1) }
  const setSortDirP = (v) => { setSortDir(v); setPage(1) }
  const setPageSizeP = (v) => { setPageSize(v); setPage(1) }

  // Arriving at Contacts is a fresh arrival: an open record must not survive it
  // (the record is LOCAL state and would render over the list).
  useEffect(() => { setSelClient(null); setPage(1) }, [state.dataAsOf])

  // The directory is two derived views over the leads and the listings, and
  // both are paged and counted in SQL. Building them in the browser is what
  // made a few hundred contacts require every lead and every property.
  const source = useServerList(
    (params) => api.listContacts({ ...params, tab: 'owners', role: seg === 'all' ? undefined : seg }),
    { search: q, sortKey, sortDir, page, pageSize },
    [seg, state.dataAsOf],
  )
  const rows = (source.rows || []).map(r => ({
    ...r,
    // WHICH FLAT, first. This is a person you ring about a specific unit, and
    // the flat number used to live inside the record and nowhere else.
    detail: [
      [r.project, r.unit].filter(Boolean).join(' · '),
      r.listings === 1
        ? `1 listing · ${r.firstTitle || ''}${r.firstType ? ` (${r.firstType})` : ''}`
        : r.listings > 1 ? `${r.listings} listings` : null,
    ].filter(Boolean).join(' · ') || r.locality || '',
    signal: <StatusTag status={r.role} />,
    onClick: () => setSelClient(r),
  }))
  const counts = source.counts || {}

  // An owner's portfolio, fetched when one is opened. Owners are derived from
  // the listings, so "their properties" is a query on owner name -- it was an
  // array the row carried only because every property was already in memory.
  // Their listings, by the link on the listing — not by searching their name,
  // which returned every property that merely mentioned it and nothing at all
  // for an owner whose name we do not hold.
  const { data: portfolio } = useServerData(
    () => (selClient?.kind === 'supply' && selClient.ownerId)
      ? api.listProperties({ ownerId: selClient.ownerId, limit: 50 }).then(r => r?.data || [])
      : Promise.resolve([]),
    [selClient?.id], [])

  // What they have given us: a flat to let, a flat to sell, or both.
  const facets = {
    roles: [
      { value: 'Landlord', label: 'Landlords', count: counts.Landlord ?? 0 },
      { value: 'Seller', label: 'Sellers', count: counts.Seller ?? 0 },
    ],
  }

  // No KPI strip. It repeated the pills directly under it — "0 Owners · 0
  // Sellers · 0 Landlords" above "All 0 · Sellers 0 · Landlords 0" — the same
  // three numbers twice, one of them unclickable noise.

  const { header, toolbar, body } = ModuleListView({
    def: CLIENTS_DEF, source: { ...source, rows }, store,
    onOpen: (r) => setSelClient(r),
    filters: flt, onFilters: setFltP, facets,
    search: q, onSearch: setQP,
    sortKey, onSortKey: setSortKeyP, sortDir, onSortDir: setSortDirP,
    view, onView: setView,
    page, onPage: setPage, pageSize, onPageSize: setPageSizeP,
    // A listing owner is not created here — they exist because a listing names
    // them, so the CTA that adds one is adding the property. Someone you want
    // to cold-call and don't hold a listing for belongs in Calling instead.
    // An owner is not created here. They exist because a property of theirs is
    // on our books, so the control that adds one adds the property. Someone we
    // are still trying to win a property from belongs in Calling.
    cta: { label: 'Add property', onClick: () => go('properties', { propAdd: true, propId: null }) },
    emptyTitle: 'No owners match',
    emptyHint: 'Adjust the role, filter or search.',
    renderTable: (list, v) => v === 'grid'
      ? <ModuleCards def={CLIENTS_DEF} rows={list} store={store} onOpen={(r) => setSelClient(r)} />
      : <ModuleTable def={CLIENTS_DEF} rows={list} store={store} onOpen={(r) => setSelClient(r)} sortKey={sortKey} sortDir={sortDir} onSort={setSortKeyP} />,
  })

  // Full-page detail takeover — same pattern as Leads & Properties (not a drawer).
  if (selClient) {
    return (
      <>
        {topBar({ eyebrow: 'Contacts', title: selClient.name, onBack: () => setSelClient(null) })}
        <div className="app-body">
          <ModuleDetail
            def={CLIENTS_DEF} record={selClient} store={store}
            avatar={<span className="av av-lg av-supply">{initials(selClient.name)}</span>}
            actionCtx={{ onClose: () => setSelClient(null) }}
            sections={[{
              id: 'portfolio',
              title: 'Their properties',
              render: () => (
                <div className="cli-portfolio">
                  {(portfolio || []).map(p => (
                    <div key={p.id} className="cli-prop">
                      <div>
                        <div className="cli-prop-t">{p.society || p.title} <span className="u-muted cli-prop-meta">({p.type} · {p.locality})</span></div>
                        <div className="relrow-sub">{p.carpet ? p.carpet + ' sqft · ' : ''}{p.deal === 'rent' ? 'For Rent' : 'For Sale'}</div>
                      </div>
                      <Button size="sm" variant="secondary" onClick={() => go('properties', { propId: p.id, propOpen: true })}>View property →</Button>
                    </div>
                  ))}
                  {/* The calling record is the same row: one place for the
                      history of every conversation with this person. */}
                  {selClient.ownerId && (
                    <Button variant="secondary" onClick={() => go('calling', { ownerId: selClient.ownerId, ownerOpen: true })}>
                      Open their calling record →
                    </Button>
                  )}
                </div>
              ),
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
        actions: <Button variant="secondary" size="sm" icon="layers" onClick={() => go('import', { kind: 'properties' })}>Import</Button>
      })}
      {header}
      <ListLayout toolbar={toolbar}>{body}</ListLayout>
    </>
  )
}
