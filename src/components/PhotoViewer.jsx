import { useCallback, useEffect, useRef, useState } from 'react'
import { fileUrl } from '../lib/media.js'
import Icon from './Icon.jsx'

/**
 * A HOME'S PHOTOS, for a buyer. One photo at a time in a frame that fits it
 * whole (never cropped, never at whatever size the file happens to be), and a
 * strip of thumbnails to move through them. Swipe, the arrows, a thumbnail or
 * the keyboard all move it. Used by the old photo link (Gallery.jsx) and every
 * home on the buyer's pages (Public.jsx), so a photo behaves the same on both.
 */
export default function PhotoViewer({ media = [], title = '', keyboard = true }) {
  const [at, setAt] = useState(0)
  const strip = useRef(null)
  const touch = useRef(null)
  const n = media.length
  const go = useCallback((i) => setAt(((i % n) + n) % n), [n])

  useEffect(() => { setAt(0) }, [media])

  useEffect(() => {
    if (!keyboard || n < 2) return undefined
    const onKey = (e) => {
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target?.tagName || '')) return
      if (e.key === 'ArrowRight') go(at + 1)
      if (e.key === 'ArrowLeft') go(at - 1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [at, n, go, keyboard])

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

  if (!n) return null
  const m = media[Math.min(at, n - 1)]
  return (
    <>
      <div className="gv-stage" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
        {m.kind === 'video'
          ? <video key={m.key} className="gv-media" src={fileUrl(m.key)} controls playsInline preload="metadata" />
          : <img key={m.key} className="gv-media" src={fileUrl(m.key)} alt={`${title || 'Photo'}, ${at + 1} of ${n}`} draggable={false} />}
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
    </>
  )
}
