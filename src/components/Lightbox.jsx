import { useEffect, useState, useCallback } from 'react'
import Icon from './Icon.jsx'
import { fileUrl } from '../lib/media.js'

// ============================================================================
// 🖼 LIGHTBOX — one viewer for property media, everywhere it is shown
// ============================================================================
// The record sheet used a plain <a target="_blank">, which threw the raw file
// at a new browser tab: no close, no next photo, and the agent loses the
// record they were reading. The picker in the wizard had its own private
// overlay, so the two behaved differently for the same photo.
//
// `srcFor` lets the picker hand over the local object URL it already holds, so
// a just-uploaded photo opens instantly instead of round-tripping to R2.
// ============================================================================

export default function Lightbox({ items = [], index = 0, onClose, srcFor }) {
  const [i, setI] = useState(index)
  useEffect(() => setI(index), [index])

  const n = items.length
  const go = useCallback((d) => setI(x => (x + d + n) % n), [n])

  useEffect(() => {
    const key = (e) => {
      if (e.key === 'Escape') onClose()
      else if (e.key === 'ArrowRight' && n > 1) go(1)
      else if (e.key === 'ArrowLeft' && n > 1) go(-1)
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [onClose, go, n])

  if (!n) return null
  const m = items[i]
  if (!m) return null
  const src = srcFor ? srcFor(m.key) : fileUrl(m.key)

  return (
    <div className="lbx" role="dialog" aria-label="Media" onClick={onClose}>
      <div className="lbx-bar" onClick={e => e.stopPropagation()}>
        <span className="lbx-count">{i + 1} / {n}</span>
        <a className="lbx-btn" href={fileUrl(m.key)} target="_blank" rel="noreferrer" title="Open the file">
          <Icon name="upload" size={15} />
        </a>
        <button type="button" className="lbx-btn" onClick={onClose} aria-label="Close">
          <Icon name="x" size={17} />
        </button>
      </div>

      {n > 1 && (
        <button type="button" className="lbx-nav prev" aria-label="Previous"
          onClick={e => { e.stopPropagation(); go(-1) }}>
          <Icon name="chevLeft" size={22} />
        </button>
      )}

      <div className="lbx-stage" onClick={e => e.stopPropagation()}>
        {m.kind === 'video'
          ? <video src={fileUrl(m.key)} controls autoPlay playsInline />
          : <img src={src} alt="" />}
      </div>

      {n > 1 && (
        <button type="button" className="lbx-nav next" aria-label="Next"
          onClick={e => { e.stopPropagation(); go(1) }}>
          <Icon name="chevRight" size={22} />
        </button>
      )}
    </div>
  )
}
