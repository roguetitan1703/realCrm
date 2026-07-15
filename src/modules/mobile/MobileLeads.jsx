import { useState, useMemo } from 'react'
import { initials, reqShort, budgetRange } from '../../lib/format.js'
import { StageTag } from '../../components/primitives.jsx'
import Icon from '../../components/Icon.jsx'
import MobileSearchFilter from './MobileSearchFilter.jsx'

export default function MobileLeads({ store, me, open }) {
  const [seg, setSeg] = useState('all')
  const [q, setQ] = useState('')
  const [sort, setSort] = useState('date')

  const allMine = store.state.leads.filter(l => l.agentId === me.id)

  const segs = [
    { key: 'all', label: 'All', n: allMine.length },
    { key: 'overdue', label: 'Overdue', n: allMine.filter(l => l.overdue).length },
    { key: 'new', label: 'New', n: allMine.filter(l => l.stage === 'New').length },
    { key: 'visit', label: 'Site Visit', n: allMine.filter(l => l.stage === 'Site Visit').length },
    { key: 'nego', label: 'Negotiate', n: allMine.filter(l => l.stage === 'Negotiation').length },
    { key: 'closed', label: 'Won', n: allMine.filter(l => l.stage === 'Closed Won').length },
  ]

  const sortOptions = [
    { key: 'date', label: 'Follow-up / Recent' },
    { key: 'name', label: 'Name (A to Z)' },
    { key: 'stage', label: 'Pipeline Stage' },
    { key: 'budget', label: 'Budget (High to Low)' }
  ]

  const sortedAndFiltered = useMemo(() => {
    let list = [...allMine]
    if (seg === 'overdue') list = list.filter(l => l.overdue)
    else if (seg === 'new') list = list.filter(l => l.stage === 'New')
    else if (seg === 'visit') list = list.filter(l => l.stage === 'Site Visit')
    else if (seg === 'nego') list = list.filter(l => l.stage === 'Negotiation')
    else if (seg === 'closed') list = list.filter(l => l.stage === 'Closed Won')

    if (q.trim()) {
      const s = q.trim().toLowerCase()
      list = list.filter(l =>
        (l.name || '').toLowerCase().includes(s) ||
        (l.req?.locality || '').toLowerCase().includes(s) ||
        (l.phone || '').includes(s) ||
        (l.req?.config || '').toLowerCase().includes(s)
      )
    }

    list.sort((a, b) => {
      if (sort === 'name') return (a.name || '').localeCompare(b.name || '')
      if (sort === 'stage') return (a.stage || '').localeCompare(b.stage || '')
      if (sort === 'budget') {
        const bgA = (a.req.budgetMax || 0)
        const bgB = (b.req.budgetMax || 0)
        return bgB - bgA
      }
      // date default: overdue first, then follow-ups, then created
      if (a.overdue !== b.overdue) return a.overdue ? -1 : 1
      return 0
    })

    return list
  }, [allMine, seg, q, sort])

  return (
    <>
      <MobileSearchFilter
        q={q}
        onSearchChange={setQ}
        placeholder="Search name, locality, BHK, phone…"
        segs={segs}
        activeSeg={seg}
        onSegChange={setSeg}
        sortOptions={sortOptions}
        activeSort={sort}
        onSortChange={setSort}
        sortLabel={sort === 'name' ? 'Name' : sort === 'budget' ? 'Budget' : sort === 'stage' ? 'Stage' : 'Recent'}
      />

      {sortedAndFiltered.map(l => (
        <div key={l.id} className="m-card" style={{ marginBottom: 8, cursor: 'pointer' }} onClick={() => open('lead', l.id)}>
          <span className={'av av-md ' + me.avatar}>{initials(l.name)}</span>
          <div className="m-c-main">
            <div className="m-c-name" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              {l.name}
              {l.overdue && <span className="fit" style={{ background: 'var(--alert-wash)', color: 'var(--alert)', padding: '1px 6px', fontSize: 10, borderRadius: 4 }}>Overdue</span>}
            </div>
            <div className="m-c-sub">{reqShort(l.req)} · {budgetRange(l.req)}</div>
          </div>
          <div className="m-c-right">
            <StageTag stage={l.stage} />
            <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
              <button
                className="btn btn-secondary btn-sm"
                style={{ padding: '4px 8px', fontSize: 11 }}
                onClick={(e) => {
                  e.stopPropagation()
                  store.openModal({ kind: 'outreach', leadId: l.id, channel: 'call' })
                }}
              >
                <Icon name="phone" size={12} />
              </button>
              <button
                className="btn btn-secondary btn-sm"
                style={{ padding: '4px 8px', fontSize: 11, color: '#25D366' }}
                onClick={(e) => {
                  e.stopPropagation()
                  store.openModal({ kind: 'outreach', leadId: l.id, channel: 'wa' })
                }}
              >
                <Icon name="wa" size={12} />
              </button>
            </div>
          </div>
        </div>
      ))}

      {sortedAndFiltered.length === 0 && (
        <div className="empty" style={{ marginTop: 20 }}>
          <div className="e-t">No leads found</div>
          <div className="e-s">Try clearing search or segment filter.</div>
        </div>
      )}
    </>
  )
}
