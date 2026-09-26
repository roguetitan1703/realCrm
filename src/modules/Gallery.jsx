import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '../lib/api.js'
import { fileUrl } from '../lib/media.js'
import Icon from '../components/Icon.jsx'

// ============================================================================
// A LISTING'S PHOTOS, FOR A CLIENT — /<firm>/photos/<project>-<code> (7.5)
// ============================================================================
// Who opens it: a buyer or tenant, from a WhatsApp message, usually on a phone,
// not signed in to anything. They want to look at the place.
//
// So it is a viewer, not a page about a listing: the firm and the project at
// the top, one photo at a time in a frame that fits it whole (never cropped,
// never at whatever size the file happens to be), and a strip of thumbnails
// underneath to move through them. Swipe, the arrows, a thumbnail or the
// keyboard all move it. No price and no details (the user's call, 26 Sep);
// the server does not send them (services/gallery.ts). The frame is the
// viewer, so a photo does not open into a second one.
//
// Mounted on its own (main.jsx), like /admin: no workspace, no sign-in.
export default function Gallery({ slug, refId }) {
  const [state, setState] = useState({ loading: true, data: null })
  const [at, setAt] = useState(0)
  const strip = useRef(null)
  const touch = useRef(null)

  useEffect(() => {
    let live = true
    api.publicGallery(slug, refId)
      .then(r => { if (live) setState({ loading: false, data: r?.success ? r : null }) })
      .catch(() => { if (live) setState({ loading: false, data: null }) })
    return () => { live = false }
  }, [slug, refId])

  const d = state.data
  const media = d?.media || []
  const n = media.length
  const go = useCallback((i) => setAt(((i % n) + n) % n), [n])

  useEffect(() => {
    if (d) document.title = [d.project, d.firm.name].filter(Boolean).join(' · ')
  }, [d])

  // Arrow keys on a keyboard.
  useEffect(() => {
    if (n < 2) return undefined
    const onKey = (e) => {
      if (e.key === 'ArrowRight') go(at + 1)
      if (e.key === 'ArrowLeft') go(at - 1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [at, n, go])

  // The next and previous photos load before they are asked for, and the
  // current thumbnail stays in view in the strip.
  useEffect(() => {
    if (!n) return
    for (const i of [at + 1, at - 1]) {
      const x = media[((i % n) + n) % n]
      if (x && x.kind !== 'video') { const img = new Image(); img.src = fileUrl(x.key) }
    }
    strip.current?.querySelector('[aria-current="true"]')?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' })
  }, [at, n]) // eslint-disable-line react-hooks/exhaustive-deps

  const onTouchStart = (e) => { touch.current = e.touches[0].clientX }
  const onTouchEnd = (e) => {
    if (touch.current == null || n < 2) return
    const dx = e.changedTouches[0].clientX - touch.current
    touch.current = null
    if (Math.abs(dx) > 40) go(at + (dx < 0 ? 1 : -1))
  }

  if (state.loading) {
    return (
      <div className="gv" aria-busy="true">
        <div className="gv-wrap"><div className="gv-bar gv-bar-wait" /><div className="gv-stage gv-stage-wait" /></div>
      </div>
    )
  }
  if (!d) {
    return (
      <div className="gv">
        <div className="gv-gone">
          <Icon name="eyeOff" size={24} />
          <h1>This link does not work any more</h1>
          <p>Ask the person who sent it for a new one.</p>
        </div>
      </div>
    )
  }

  const m = media[at]
  return (
    <div className="gv" style={d.firm.color ? { '--gv-accent': d.firm.color } : undefined}>
      <div className="gv-wrap">
        <header className="gv-bar">
          {d.firm.logoUrl
            ? <img className="gv-logo" src={d.firm.logoUrl} alt="" />
            : <span className="gv-mono">{(d.firm.name || '?').trim().slice(0, 1).toUpperCase()}</span>}
          <span className="gv-firm">{d.firm.name}</span>
        </header>

        {d.project && <h1 className="gv-title">{d.project}</h1>}

        <div className="gv-stage" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
          {m.kind === 'video'
            ? <video key={m.key} className="gv-media" src={fileUrl(m.key)} controls playsInline preload="metadata" />
            : <img key={m.key} className="gv-media" src={fileUrl(m.key)} alt={`${d.project || 'Photo'}, ${at + 1} of ${n}`} draggable={false} />}
          {n > 1 && (
            <>
              <button type="button" className="gv-nav prev" aria-label="Previous" onClick={() => go(at - 1)}><Icon name="chevLeft" size={20} /></button>
              <button type="button" className="gv-nav next" aria-label="Next" onClick={() => go(at + 1)}><Icon name="chevRight" size={20} /></button>
              <span className="gv-count">{at + 1} / {n}</span>
            </>
          )}
        </div>

        {n > 1 && (
          <div className="gv-strip" ref={strip} aria-label="Photos">
            {media.map((x, i) => (
              <button type="button" key={x.key} aria-current={i === at} aria-label={`${x.kind === 'video' ? 'Video' : 'Photo'} ${i + 1}`}
                className={'gv-thumb' + (i === at ? ' on' : '')} onClick={() => go(i)}>
                {x.kind === 'video'
                  ? <span className="gv-thumb-vid"><Icon name="play" size={16} fill /></span>
                  : <img src={fileUrl(x.key)} alt="" loading="lazy" draggable={false} />}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
