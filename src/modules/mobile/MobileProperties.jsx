import { useState, useMemo } from 'react'
import { thumbTint } from '../../lib/format.js'
import { StatusTag } from '../../components/primitives.jsx'
import Icon from '../../components/Icon.jsx'
import MobileSearchFilter from './MobileSearchFilter.jsx'

export default function MobileProperties({ store, open }) {
  const [seg, setSeg] = useState('all')
  const [q, setQ] = useState('')
  const [sort, setSort] = useState('price-desc')

  const allProps = store.state.properties

  const segs = [
    { key: 'all', label: 'All', n: allProps.length },
    { key: 'sale', label: 'For Sale', n: allProps.filter(p => p.deal === 'sale').length },
    { key: 'rent', label: 'For Rent', n: allProps.filter(p => p.deal === 'rent').length },
    { key: '2bhk', label: '2BHK', n: allProps.filter(p => p.type.includes('2BHK')).length },
    { key: '3bhk', label: '3BHK+', n: allProps.filter(p => p.type.includes('3BHK') || p.type.includes('4BHK') || p.type.includes('Villa')).length },
    { key: 'wakad', label: 'Wakad' },
    { key: 'baner', label: 'Baner' },
  ]

  const sortOptions = [
    { key: 'price-desc', label: 'Price: High to Low' },
    { key: 'price-asc', label: 'Price: Low to High' },
    { key: 'name', label: 'Society Name (A-Z)' },
    { key: 'type', label: 'Configuration Type' }
  ]

  const sortedAndFiltered = useMemo(() => {
    let list = [...allProps]
    if (seg === 'sale') list = list.filter(p => p.deal === 'sale')
    else if (seg === 'rent') list = list.filter(p => p.deal === 'rent')
    else if (seg === '2bhk') list = list.filter(p => p.type.includes('2BHK'))
    else if (seg === '3bhk') list = list.filter(p => p.type.includes('3BHK') || p.type.includes('4BHK') || p.type.includes('Villa'))
    else if (seg === 'wakad') list = list.filter(p => p.locality.toLowerCase().includes('wakad'))
    else if (seg === 'baner') list = list.filter(p => p.locality.toLowerCase().includes('baner'))

    if (q.trim()) {
      const s = q.trim().toLowerCase()
      list = list.filter(p =>
        p.society.toLowerCase().includes(s) ||
        p.locality.toLowerCase().includes(s) ||
        p.type.toLowerCase().includes(s) ||
        p.features?.some(f => f.toLowerCase().includes(s))
      )
    }

    list.sort((a, b) => {
      if (sort === 'name') return a.society.localeCompare(b.society)
      if (sort === 'type') return a.type.localeCompare(b.type)
      if (sort === 'price-asc') return (a.price || 0) - (b.price || 0)
      if (sort === 'price-desc') return (b.price || 0) - (a.price || 0)
      return 0
    })

    return list
  }, [allProps, seg, q, sort])

  return (
    <>
      <MobileSearchFilter
        q={q}
        onSearchChange={setQ}
        placeholder="Search society, locality, BHK, features…"
        segs={segs}
        activeSeg={seg}
        onSegChange={setSeg}
        sortOptions={sortOptions}
        activeSort={sort}
        onSortChange={setSort}
        sortLabel={sort === 'name' ? 'Society' : sort === 'type' ? 'Type' : sort === 'price-asc' ? 'Price ↑' : 'Price ↓'}
      />

      {sortedAndFiltered.map(p => (
        <button key={p.id} className="m-card-prop" style={{ marginBottom: 8 }} onClick={() => open('prop', p.id)}>
          <div className="m-cp-top">
            <div className="m-cp-name">
              <span className="av av-sm" style={{ background: thumbTint(p.id), color: 'var(--faint)', borderRadius: 6, width: 24, height: 24, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="building" size={13} />
              </span>
              {p.society}
            </div>
            <StatusTag status={p.status} />
          </div>
          <div className="m-cp-sub">{p.type} · {p.deal === 'rent' ? 'For rent' : 'For sale'} · {p.locality}</div>
          <div className="m-cp-bot">
            <div className="m-cp-price">{p.priceLabel}</div>
            <div className="m-cp-note" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              {p.features?.[0] ? <span className="fit ok" style={{ padding: '1px 6px', fontSize: 10.5 }}><Icon name="check" size={10} />{p.features[0]}</span> : null}
              <span>Indicative</span>
            </div>
          </div>
        </button>
      ))}

      {sortedAndFiltered.length === 0 && (
        <div className="empty" style={{ marginTop: 20 }}>
          <div className="e-t">No properties match</div>
          <div className="e-s">Try another search or segment filter.</div>
        </div>
      )}
    </>
  )
}
