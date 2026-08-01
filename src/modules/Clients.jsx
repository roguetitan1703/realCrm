import { useEffect, useState } from 'react'
import { ListLayout } from '../layouts/layouts.jsx'
import { ModuleListView, ModuleCards, ModuleTable } from '../components/collections.jsx'
import { ModuleDetail } from '../components/ModuleDetail.jsx'
import { StageTag, StatusTag, Avatar, Button, KV } from '../components/primitives.jsx'
import { initials, reqLine, budgetRange } from '../lib/format.js'
import { CLIENTS_DEF } from './definitions.jsx'
import { api } from '../lib/api.js'
import { useServerList } from '../lib/serverList.js'
import { useServerData } from '../lib/useServerData.js'

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
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const setFltP = (v) => { setFlt(v); setPage(1) }
  const setQP = (v) => { setQ(v); setPage(1) }
  const setSortKeyP = (v) => { setSortKey(v); setPage(1) }
  const setSortDirP = (v) => { setSortDir(v); setPage(1) }
  const setSegP = (v) => { setSeg(v); setPage(1) }
  const setPageSizeP = (v) => { setPageSize(v); setPage(1) }

  // Clicking Clients/Owners in the sub-nav while a contact was open did
  // nothing visible: the sub-nav changed `sel.contactsTab`, but the open
  // contact is LOCAL state and kept rendering over the list. Navigation has to
  // win over a selection — so changing tab closes the record.
  useEffect(() => { setSelClient(null); setPage(1) }, [tab])

  // The directory is two derived views over the leads and the listings, and
  // both are paged and counted in SQL. Building them in the browser is what
  // made a few hundred contacts require every lead and every property.
  const source = useServerList(
    (params) => api.listContacts({ ...params, tab, role: seg === 'all' ? undefined : seg }),
    { search: q, sortKey, sortDir, page, pageSize },
    [tab, seg, state.dataAsOf],
  )
  const rows = (source.rows || []).map(r => ({
    ...r,
    detail: r.kind === 'demand'
      ? [r.rawLead?.req?.config, r.rawLead?.req?.locality, budgetRange(r.rawLead?.req)].filter(Boolean).join(' · ')
      : r.listings === 1
        ? `1 listing · ${r.firstTitle || ''}${r.firstType ? ` (${r.firstType})` : ''}`
        : `${r.listings} listings across ${(r.localities || []).join(', ')}`,
    signal: r.kind === 'demand' ? <StageTag stage={r.stage} /> : <StatusTag status="Active owner" />,
    onClick: () => setSelClient(r),
  }))
  const counts = source.counts || {}

  // An owner's portfolio, fetched when one is opened. Owners are derived from
  // the listings, so "their properties" is a query on owner name -- it was an
  // array the row carried only because every property was already in memory.
  const { data: portfolio } = useServerData(
    () => (selClient?.kind === 'supply' && selClient.name)
      ? api.listProperties({ q: selClient.name, limit: 50 }).then(r => r?.data || [])
      : Promise.resolve([]),
    [selClient?.id], [])

  // A role pill from the other store (e.g. "Landlord") would silently zero out
  // this list, so reset to All whenever the sub-nav switches stores.
  useEffect(() => { setSeg('all') }, [tab])

  // Role pills WITHIN the active store — Buyer/Tenant under Clients,
  // Seller/Landlord under Owners. Not a flat 5-way mix of both stores.
  const roleOptions = tab === 'clients'
    ? [{ key: 'all', label: 'All' }, { key: 'Buyer', label: 'Buyers' }, { key: 'Tenant', label: 'Tenants' }]
    : [{ key: 'all', label: 'All' }, { key: 'Seller', label: 'Sellers' }, { key: 'Landlord', label: 'Landlords' }]
  const segs = roleOptions.map(o => ({
    ...o, on: seg === o.key, count: counts[o.key] ?? 0, onClick: () => setSegP(o.key),
  }))

  const kpis = roleOptions.map(o => ({
    label: o.key === 'all' ? (tab === 'clients' ? 'Clients' : 'Owners') : o.label,
    value: counts[o.key] ?? 0,
    onClick: () => setSegP(o.key),
  }))

  const { header, toolbar, body } = ModuleListView({
    def: CLIENTS_DEF, source: { ...source, rows }, store,
    onOpen: (r) => setSelClient(r),
    filters: flt, onFilters: setFltP,
    search: q, onSearch: setQP,
    sortKey, onSortKey: setSortKeyP, sortDir, onSortDir: setSortDirP,
    kpis, segments: segs, view, onView: setView,
    page, onPage: setPage, pageSize, onPageSize: setPageSizeP,
    // Owners aren't created directly (that's B3's stated, deliberate gap —
    // they're derived from a property's owner field); the CTA that actually
    // adds a new one is adding the property.
    cta: tab === 'clients'
      ? { label: 'New client', onClick: () => store.openModal({ kind: 'newLead' }) }
      : { label: 'Add property', onClick: () => go('properties', { propAdd: true, propId: null }) },
    emptyTitle: tab === 'clients' ? 'No clients match' : 'No owners match',
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
            avatar={<span className={'av av-lg ' + (selClient.kind === 'supply' ? 'av-supply' : 'av-demand')}>{initials(selClient.name)}</span>}
            actionCtx={{ onClose: () => setSelClient(null) }}
            sections={[{
              id: 'portfolio',
              title: selClient.kind === 'demand' ? 'Associated requirement & lead' : 'Listed properties portfolio',
              render: () => selClient.kind === 'demand' && selClient.rawLead ? (
                <div className="cli-portfolio">
                  <KV items={[
                    { k: 'Looking for', v: `${selClient.rawLead.req?.config || 'Any'} · ${selClient.rawLead.req?.deal || 'sale'}` },
                    { k: 'Preferred locality', v: selClient.rawLead.req?.locality || '—' },
                    { k: 'Current stage', v: selClient.rawLead.stage || 'New' },
                  ]} />
                  <Button variant="secondary" onClick={() => go('leads', { leadId: selClient.rawLeadId, leadOpen: true })}>
                    Open full lead workflow & timeline →
                  </Button>
                </div>
              ) : selClient.kind === 'supply' ? (
                <div className="cli-portfolio">
                  {(portfolio || []).map(p => (
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
