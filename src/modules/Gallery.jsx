import { useEffect, useState } from 'react'
import { api } from '../lib/api.js'
import { fileUrl } from '../lib/media.js'
import { configLabel, fmtMoney } from '../lib/format.js'
import { AREA_UNITS, FACING, FURNISH, POSSESSION, SOCIETY_AMENITIES, labelOf } from '../data/propertyFields.js'
import Lightbox from '../components/Lightbox.jsx'
import Icon from '../components/Icon.jsx'

// ============================================================================
// A LISTING'S PHOTOS, FOR A CLIENT — /g/<ref> (7.5)
// ============================================================================
// Who opens it: a buyer or tenant, from a WhatsApp message, on a phone, not
// signed in to anything. They want to see the flat. So: the firm's name at the
// top, what the flat is and what it costs, the photos big enough to judge, and
// nothing else. What may be shown is decided by the server (services/
// gallery.ts); this page cannot show the owner or the flat number because it is
// never sent them.
//
// Mounted on its own (main.jsx), like /admin: no workspace, no sign-in, no
// store.
export default function Gallery({ refId }) {
  const [state, setState] = useState({ loading: true, data: null })
  const [open, setOpen] = useState(null)

  useEffect(() => {
    let live = true
    api.publicGallery(refId)
      .then(r => { if (live) setState({ loading: false, data: r?.success ? r : null }) })
      .catch(() => { if (live) setState({ loading: false, data: null }) })
    return () => { live = false }
  }, [refId])

  const d = state.data
  useEffect(() => {
    if (d) document.title = [d.listing.name, d.firm.name].filter(Boolean).join(' · ')
  }, [d])

  if (state.loading) {
    return <div className="gv"><div className="gv-wrap"><div className="gv-wait" /><div className="gv-wait tall" /></div></div>
  }
  if (!d) {
    return (
      <div className="gv">
        <div className="gv-wrap gv-gone">
          <Icon name="eyeOff" size={26} />
          <h1>This link does not work any more</h1>
          <p>Ask the person who sent it for a new one.</p>
        </div>
      </div>
    )
  }

  const L = d.listing
  const rent = L.deal === 'rent'
  const price = L.priceLabel || (L.price ? fmtMoney(L.price) : '')
  const area = L.carpet ? `${L.carpet.toLocaleString('en-IN')} ${labelOf(AREA_UNITS, L.areaUnit || 'sqft')}` : null
  const facts = [
    area,
    L.floor ? `Floor ${L.floor}${L.totalFloors ? ` of ${L.totalFloors}` : ''}` : null,
    labelOf(FURNISH, L.furnishType) || null,
    L.facing ? `${labelOf(FACING, L.facing)} facing` : null,
    L.possession ? labelOf(POSSESSION, L.possession) : null,
  ].filter(Boolean)
  const what = configLabel({ bhk: L.bhk, subtype: L.subtype, category: L.category, type: L.type })

  return (
    <div className="gv" style={d.firm.color ? { '--gv-accent': d.firm.color } : undefined}>
      <header className="gv-bar">
        <div className="gv-wrap gv-bar-in">
          {d.firm.logoUrl
            ? <img className="gv-logo" src={d.firm.logoUrl} alt="" />
            : <span className="gv-mono">{(d.firm.name || '?').slice(0, 1)}</span>}
          <span className="gv-firm">{d.firm.name}</span>
        </div>
      </header>

      <main className="gv-wrap">
        <section className="gv-head">
          <div className="gv-tag">{rent ? 'For rent' : 'For sale'}</div>
          <h1 className="gv-title">{L.name || what}</h1>
          <div className="gv-sub">{[what, L.locality].filter(Boolean).join(' · ')}</div>
          {price && <div className="gv-price">{price}{rent && L.price && !L.priceLabel ? <span> / month</span> : null}</div>}
          {facts.length > 0 && <div className="gv-facts">{facts.map(f => <span key={f}>{f}</span>)}</div>}
        </section>

        <section className="gv-grid">
          {d.media.map((m, i) => (
            <button type="button" key={m.key} className={'gv-tile' + (i === 0 ? ' first' : '')} onClick={() => setOpen(i)}
              aria-label={m.kind === 'video' ? `Play video ${i + 1}` : `Open photo ${i + 1}`}>
              {m.kind === 'video'
                ? <span className="gv-vid"><Icon name="play" size={26} fill /></span>
                : <img src={fileUrl(m.key)} alt="" loading={i < 4 ? 'eager' : 'lazy'} />}
            </button>
          ))}
        </section>

        {L.amenities?.length > 0 && (
          <section className="gv-block">
            <h2>Amenities</h2>
            <p>{L.amenities.map(a => labelOf(SOCIETY_AMENITIES, a)).join(' · ')}</p>
          </section>
        )}
        {L.description && (
          <section className="gv-block">
            <h2>About it</h2>
            <p className="gv-desc">{L.description}</p>
          </section>
        )}
        <footer className="gv-foot">Shared by {d.firm.name}</footer>
      </main>

      {open !== null && <Lightbox items={d.media} index={open} onClose={() => setOpen(null)} />}
    </div>
  )
}
