import { useState } from 'react'
import { ListLayout, DetailLayout } from '../layouts/layouts.jsx'
import { FilterBar, SortControl, Table, PropertyCard } from '../components/collections.jsx'
import { StatusTag, Source, Quoted, Fit, Button, Panel, SectionHead, GlanceCard, KV, Timeline } from '../components/primitives.jsx'
import { ActionRail, RailSection, NbaBanner, ActionGroup } from '../components/rail.jsx'
import { leadsForProperty } from '../data/seed.js'
import { thumbTint, propFacts, quotedLine, ratePsf, unitLabel, fmtDate, renewalSignal } from '../lib/format.js'
import Icon from '../components/Icon.jsx'

const LOCALITIES = ['Wakad', 'Baner', 'Kothrud', 'Hinjewadi', 'Viman Nagar', 'Kalyani Nagar', 'Wagholi']
const SORT_OPTS = { society: 'Name', locality: 'Locality', carpet: 'Carpet area', recent: 'Recently added' }

// full spec sheet (stable identifying facts — the backbone of the record)
function specSheet(p) {
  const rows = [
    { k: 'Config', v: p.type },
    { k: 'Carpet area', v: p.carpet ? p.carpet + ' sqft' : '—' },
  ]
  if (p.type !== 'Plot') rows.push({ k: 'Floor', v: p.totalFloors ? `${p.floor} of ${p.totalFloors}` : '—' })
  rows.push({ k: 'Facing', v: p.facing || '—' })
  rows.push({ k: 'Furnishing', v: p.furnishing })
  rows.push({ k: 'Age', v: p.age ? p.age + ' yrs old' : 'New / under-construction' })
  if (p.deal === 'rent' && p.tenants) rows.push({ k: 'Preferred tenants', v: p.tenants })
  rows.push({ k: p.deal === 'rent' ? 'Available from' : 'Possession', v: p.possession })
  return rows
}

// commercials — the money detail, in full, but framed as indicative reference data
function commercials(p) {
  if (p.deal === 'rent') {
    return [
      { k: 'Monthly rent', v: p.priceLabel },
      { k: 'Deposit', v: p.depositLabel || '—' },
      { k: 'Negotiable', v: p.negotiable ? 'Yes' : 'Fixed' },
      { k: 'Bills', v: p.billsByOwner ? 'Owner pays elec. & gas' : 'Tenant pays utilities' },
    ]
  }
  return [
    { k: 'Asking price', v: p.priceLabel },
    { k: 'Rate', v: ratePsf(p) || '—' },
    { k: 'Negotiable', v: p.negotiable ? 'Yes — indicative' : 'Fixed' },
    { k: 'Deal type', v: 'Owner direct · no chain' },
  ]
}

const propFields = () => [
  { key: 'deal', label: 'Deal', icon: 'tag', multi: false, options: [{ value: 'sale', label: 'For sale' }, { value: 'rent', label: 'For rent' }] },
  { key: 'type', label: 'Config', icon: 'layers', options: ['1BHK', '2BHK', '3BHK', 'Commercial', 'Plot'].map(t => ({ value: t, label: t })) },
  { key: 'locality', label: 'Locality', icon: 'building', options: LOCALITIES.map(l => ({ value: l, label: l })) },
  { key: 'status', label: 'Status', icon: 'check', options: ['Available', 'Under offer', 'Closed'].map(s => ({ value: s, label: s })) },
  { key: 'furnishing', label: 'Furnishing', icon: 'home', options: ['Fully furnished', 'Semi-furnished', 'Unfurnished'].map(s => ({ value: s, label: s })) },
]

export default function Properties({ store, go, sel, setSel, topBar }) {
  const { state } = store
  const [flt, setFlt] = useState({})
  const [q, setQ] = useState('')
  const [view, setView] = useState('cards')
  const [sortKey, setSortKey] = useState('recent')
  const [sortDir, setSortDir] = useState('asc')

  if (sel.propOpen && sel.propId) return <PropertyDetail store={store} go={go} sel={sel} setSel={setSel} topBar={topBar} />

  let list = state.properties.slice()
  const has = (k) => (flt[k] || []).length
  if (has('deal')) list = list.filter(p => flt.deal.includes(p.deal))
  if (has('type')) list = list.filter(p => flt.type.includes(p.type))
  if (has('locality')) list = list.filter(p => flt.locality.includes(p.locality))
  if (has('status')) list = list.filter(p => flt.status.includes(p.status))
  if (has('furnishing')) list = list.filter(p => flt.furnishing.includes(p.furnishing))
  if (q.trim()) {
    const s = q.trim().toLowerCase()
    list = list.filter(p => p.society.toLowerCase().includes(s) || p.locality.toLowerCase().includes(s) || p.owner.toLowerCase().includes(s) || p.type.toLowerCase().includes(s))
  }
  const val = (p) => sortKey === 'society' ? p.society.toLowerCase() : sortKey === 'locality' ? p.locality.toLowerCase() : sortKey === 'carpet' ? (p.carpet || 0) : 0
  list.sort((a, b) => { const c = val(a) < val(b) ? -1 : val(a) > val(b) ? 1 : 0; return sortDir === 'asc' ? c : -c })
  const withTint = list.map(p => ({ ...p, thumbBg: thumbTint(p.id) }))

  const toolbar = (
    <FilterBar
      fields={propFields()} value={flt} onChange={setFlt}
      search={{ value: q, onChange: setQ, placeholder: 'Search society, locality, owner…' }}
      right={<>
        <SortControl value={sortKey} dir={sortDir} onSort={setSortKey}
          onDir={() => setSortDir(d => d === 'asc' ? 'desc' : 'asc')}
          options={Object.entries(SORT_OPTS).map(([value, label]) => ({ value, label }))} />
        <div className="viewsw" style={{ marginLeft: 10 }}>
          <button className={view === 'cards' ? 'on' : ''} title="Cards" onClick={() => setView('cards')}><Icon name="grid" /></button>
          <button className={view === 'list' ? 'on' : ''} title="List" onClick={() => setView('list')}><Icon name="leads" /></button>
        </div>
      </>}
      cta={{ label: 'Add property', onClick: () => store.openModal({ kind: 'addProperty' }) }}
    />
  )

  const open = (id) => go('properties', { propId: id, propOpen: true })

  return (
    <>
      {topBar({ title: 'Properties', count: `${state.properties.length} listings` })}
      <ListLayout toolbar={toolbar}>
        {list.length === 0
          ? <div className="empty"><div className="e-t">No properties match</div><div className="e-s">Try clearing a filter or search.</div><Button variant="primary" size="sm" onClick={() => store.openModal({ kind: 'addProperty' })}>Add property</Button></div>
          : view === 'cards'
            ? <div className="grid-cards">{withTint.map(p => <PropertyCard key={p.id} p={p} matchCount={leadsForProperty(p, state.leads).length} onClick={() => open(p.id)} />)}</div>
            : <PropTable list={withTint} onOpen={open} allLeads={state.leads} />}
      </ListLayout>
    </>
  )
}

function PropTable({ list, onOpen, allLeads }) {
  // Fields a broker actually scans: identity, config/deal, area, floor, furnishing,
  // status, demand. Money is ONE quiet trailing column, never a headline.
  const columns = [
    { key: 'society', label: 'Property' }, { key: 'config', label: 'Config · deal' },
    { key: 'carpet', label: 'Carpet' }, { key: 'floor', label: 'Floor' }, { key: 'furnishing', label: 'Furnishing' },
    { key: 'status', label: 'Status' }, { key: 'demand', label: 'Buyers' }, { key: 'quoted', label: 'Quoted' },
  ]
  const rows = list.map(p => {
    const demand = leadsForProperty(p, allLeads).length
    return {
      id: p.id, onClick: () => onOpen(p.id),
      cells: [
        <div className="u-row" style={{ gap: 11 }}>
          <div style={{ width: 38, height: 38, borderRadius: 8, background: p.thumbBg, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--faint)', flexShrink: 0 }}><Icon name="building" size={19} strokeWidth={1.4} /></div>
          <div><div className="name">{p.society}{unitLabel(p) && <span className="unit-tag">{unitLabel(p)}</span>}</div><div className="sub">{p.locality}</div></div>
        </div>,
        <span style={{ fontSize: 13 }}>{p.type} · {p.deal}</span>,
        <span style={{ fontSize: 13 }}>{p.carpet ? p.carpet + ' sqft' : '—'}</span>,
        <span style={{ fontSize: 13 }}>{p.type === 'Plot' ? '—' : (p.totalFloors ? `${p.floor}/${p.totalFloors}` : '—')}</span>,
        <span style={{ fontSize: 13 }}>{p.furnishing || '—'}</span>,
        <StatusTag status={p.status} />,
        demand ? <span className="pc-demand"><Icon name="people" size={13} />{demand}</span> : <span className="u-muted" style={{ fontSize: 13 }}>—</span>,
        <Quoted q={quotedLine(p)} />,
      ],
    }
  })
  return <Table columns={columns} rows={rows} />
}

// ---------------------------------------------------------------------------
function PropertyDetail({ store, go, sel, setSel, topBar }) {
  const p = store.state.properties.find(x => x.id === sel.propId)
  const back = () => setSel(s => ({ ...s, propOpen: false }))
  if (!p) { return <>{topBar({ title: 'Property', eyebrow: 'Properties', onBack: back })}<div style={{ padding: 22 }}>Not found.</div></> }
  const buyers = leadsForProperty(p, store.state.leads)
  const dealLabel = p.deal === 'rent' ? 'For rent' : 'For sale'
  // sibling units = same project, different record
  const proj = p.project || p.society
  const siblings = store.state.properties.filter(x => x.id !== p.id && (x.project || x.society) === proj)

  const tenancy = p.deal === 'rent' ? p.tenancy : null
  const renewal = renewalSignal(tenancy)

  const actionGroups = [
    { head: 'Share & match', items: [
      { icon: 'wa', label: 'WhatsApp this listing', tone: 'accent', sub: buyers[0] ? `${buyers.length} matched ${p.deal === 'rent' ? 'tenant' : 'buyer'}${buyers.length > 1 ? 's' : ''}` : 'Pick a recipient', onClick: () => store.openModal({ kind: 'pickBuyer', propId: p.id }) },
      { icon: 'copy', label: 'Copy listing details', onClick: () => { store.toast('Listing copied to clipboard') } },
    ] },
    { head: 'Owner', items: [
      { icon: 'wa', label: 'Send owner update', tone: 'accent', sub: `${buyers.length} matched · activity`, onClick: () => store.openModal({ kind: 'ownerUpdate', propId: p.id }) },
      { icon: 'phone', label: 'Call owner', sub: p.owner, onClick: () => store.openModal({ kind: 'callOwner', owner: p.owner, propId: p.id }) },
    ] },
    // rental-only: the second half of a rental deal lives here
    ...(p.deal === 'rent' ? [{ head: 'Tenancy', items: [
      { icon: 'people', label: tenancy ? 'Update tenancy' : 'Record tenancy', sub: tenancy ? tenancy.tenant : 'Mark as let / deposit', onClick: () => store.openModal({ kind: 'tenancy', propId: p.id }) },
      ...(tenancy && !tenancy.depositReturned ? [{ icon: 'check', label: 'Mark deposit returned', sub: tenancy.depositLabel, onClick: () => store.returnDeposit(p.id) }] : []),
    ] }] : []),
    { head: 'Manage listing', items: [
      { icon: 'tag', label: 'Set status', sub: p.status, onClick: () => store.openModal({ kind: 'propStatus', propId: p.id }) },
      { icon: 'edit', label: 'Edit details', onClick: () => store.openModal({ kind: 'addProperty', propId: p.id }) },
    ] },
  ]

  return (
    <>
      {topBar({ eyebrow: 'Properties', title: p.society, onBack: back,
        // One primary action — status & the rest live once, in the rail.
        actions: <Button variant="secondary" size="sm" onClick={() => store.openModal({ kind: 'pickBuyer', propId: p.id })} icon="wa">WhatsApp</Button> })}
      <div className="app-body">
        <DetailLayout rail={
          <ActionRail>
            <RailSection>
              {renewal && renewal.tone !== 'ok' ? (
                <NbaBanner label={renewal.tone === 'overdue' ? 'Renewal · overdue' : 'Renewal due'} icon="clock"
                  title={renewal.label} sub={tenancy.tenant}
                  cta={{ label: 'Handle renewal', icon: 'calendar', onClick: () => store.openModal({ kind: 'tenancy', propId: p.id }) }} />
              ) : (
                <NbaBanner label={buyers[0] ? `Interested ${p.deal === 'rent' ? 'tenant' : 'buyer'}` : 'Share listing'} icon="wa"
                  title={buyers[0] ? `Send to ${buyers[0].lead.name.split(' ')[0]}` : 'Pick a recipient'}
                  sub={buyers[0] ? `${p.type} · ${p.locality}` : 'No matched contacts yet'}
                  cta={{ label: 'WhatsApp', icon: 'wa', onClick: () => store.openModal({ kind: 'pickBuyer', propId: p.id }) }} />
              )}
            </RailSection>
            <RailSection title="Actions">
              <ActionGroup groups={actionGroups} />
            </RailSection>
          </ActionRail>
        }>
          {/* glance card — identity-first, deal-aware. No hero ₹. Slim banner thumb. */}
          <GlanceCard
            thumb={<div style={{ width: 64, height: 64, borderRadius: 10, background: thumbTint(p.id), display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--faint)' }}><Icon name="building" size={30} strokeWidth={1.3} /></div>}
            eyebrow={`${dealLabel} · ${p.locality}${unitLabel(p) ? ' · Unit ' + unitLabel(p) : ''}`}
            name={p.society}
            meta={[
              <StatusTag status={p.status} />,
              <Source>Owner · {p.owner}</Source>,
              <Quoted q={quotedLine(p)} />,
            ]}
            facts={propFacts(p)}
          />

          {/* detail cards below the glance */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <Panel>
              <SectionHead title="Spec sheet" />
              <KV items={specSheet(p)} />
            </Panel>
            <Panel>
              <SectionHead title="Commercials" right={<span className="u-muted" style={{ fontSize: 11 }}>indicative</span>} />
              <KV items={commercials(p)} />
            </Panel>
          </div>

          {/* rental tenancy — the second half of a rental deal (deposit + renewal) */}
          {p.deal === 'rent' && (
            <Panel>
              <SectionHead title="Tenancy & deposit"
                right={tenancy
                  ? <button className="btn btn-ghost btn-sm" onClick={() => store.openModal({ kind: 'tenancy', propId: p.id })}><Icon name="edit" size={13} />Manage</button>
                  : <button className="btn btn-ghost btn-sm" onClick={() => store.openModal({ kind: 'tenancy', propId: p.id })}><Icon name="plus" size={13} />Record</button>} />
              {!tenancy ? (
                <div className="u-muted" style={{ fontSize: 13 }}>Flat is vacant. Record a tenancy when it's let — track the agreement window and deposit here.</div>
              ) : (
                <>
                  {renewal && renewal.tone !== 'ok' && (
                    <div className={'renewal-banner ' + renewal.tone}>
                      <Icon name="clock" size={15} />
                      <span style={{ flex: 1 }}>{renewal.label}</span>
                      <button className="btn btn-sm" onClick={() => store.openModal({ kind: 'tenancy', propId: p.id })}>Renew</button>
                    </div>
                  )}
                  <KV items={[
                    { k: 'Tenant', v: tenancy.tenant + (tenancy.phone ? ` · ${tenancy.phone}` : '') },
                    { k: 'Agreement', v: `${fmtDate(tenancy.start)} → ${fmtDate(tenancy.end)}` },
                    { k: renewal ? 'Renewal' : 'Status', v: renewal ? renewal.label : 'Active' },
                    { k: 'Deposit', v: tenancy.depositReturned ? `${tenancy.depositLabel} · returned` : `${tenancy.depositLabel} · held` },
                  ]} />
                </>
              )}
            </Panel>
          )}

          {/* other units in the same project — the "3 flats, 3 prices" clarity */}
          {siblings.length > 0 && (
            <Panel>
              <SectionHead title={`Other units in ${p.project || p.society}`} right={`${siblings.length} more`} />
              <div style={{ overflowX: 'auto' }}>
                <table className="tbl" style={{ border: 'none' }}>
                  <thead><tr><th>Unit</th><th>Config · floor</th><th>Carpet</th><th>Owner</th><th>Status</th><th>Quoted</th></tr></thead>
                  <tbody>
                    {siblings.map(s => (
                      <tr key={s.id} onClick={() => go('properties', { propId: s.id, propOpen: true })}>
                        <td><span className="unit-tag" style={{ marginLeft: 0 }}>{unitLabel(s) || '—'}</span></td>
                        <td style={{ fontSize: 13 }}>{s.type} · {s.totalFloors ? `${s.floor}/${s.totalFloors}` : '—'}</td>
                        <td style={{ fontSize: 13 }}>{s.carpet ? s.carpet + ' sqft' : '—'}</td>
                        <td style={{ fontSize: 13 }}>{s.owner}</td>
                        <td><StatusTag status={s.status} /></td>
                        <td><Quoted q={quotedLine(s)} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Panel>
          )}

          <Panel>
            <SectionHead title="Location & connectivity" />
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
              {p.features.map((f, i) => <Fit key={i} ok>{f}</Fit>)}
            </div>
          </Panel>

          <Panel>
            <SectionHead title={`Interested ${p.deal === 'rent' ? 'tenants' : 'buyers'}`} right={`${buyers.length} matched`} />
            {buyers.length === 0 && <div className="u-muted" style={{ fontSize: 13 }}>No matching contacts yet.</div>}
            {buyers.map((b, i) => (
              <div key={b.lead.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 0', borderTop: i ? '1px solid var(--line-2)' : 'none' }}>
                <button onClick={() => go('leads', { leadId: b.lead.id, leadOpen: true })}
                  style={{ flex: 1, minWidth: 0, textAlign: 'left', background: 'transparent', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>
                  <div style={{ fontWeight: 600 }}>{b.lead.name}</div>
                  <div className="u-muted" style={{ fontSize: 12.5 }}>{b.lead.req.config} · {b.lead.req.locality} · {b.fitLine}</div>
                </button>
                <Button variant="secondary" size="sm" onClick={() => store.openWhatsApp(p.id, b.lead.id)}>Share</Button>
              </div>
            ))}
          </Panel>

          {/* listing history — owner updates, calls, status/tenancy changes */}
          <Panel>
            <SectionHead title="Listing history"
              right={<button className="btn btn-ghost btn-sm" onClick={() => store.openModal({ kind: 'ownerUpdate', propId: p.id })}><Icon name="wa" size={13} />Update owner</button>} />
            {(p.timeline && p.timeline.length)
              ? <Timeline events={p.timeline} />
              : <div className="u-muted" style={{ fontSize: 13 }}>No activity logged yet. Owner updates, calls and status changes appear here.</div>}
          </Panel>
        </DetailLayout>
      </div>
    </>
  )
}
