import { useEffect, useRef, useState } from 'react'
import Icon from './Icon.jsx'
import Lightbox from './Lightbox.jsx'
import { fileUrl, processListingImage, uploadMedia } from '../lib/media.js'

// ============================================================================
// A LISTING'S PHOTOS AND VIDEOS — one editor, in the add/edit form and on the
// listing itself. The listing page could show photos and not change them, so
// setting a different cover meant opening the whole form to re-upload in a new
// order. The first item is the cover everywhere a listing is shown.
//
// Unlike the visit-proof camera (B4), the gallery IS allowed here: listing
// photos are normally shot earlier, or supplied by the owner, and there is
// nothing to prove — the constraint there was about authenticity, which
// doesn't apply to marketing images.
//
// Uploads are tracked PER FILE, not per batch. Dropping twelve photos over a
// site's mobile signal and having the eighth fail is the normal case, and a
// batch-level "some failed" leaves you with no way to tell which or to fix it
// without starting over. Each tile carries its own state and its own retry,
// and holds on to the original File so a retry costs one request, not a
// re-pick.
//
// Every change goes out through onChange at once — the caller decides whether
// that is a form field or a save. Order is dragging on a desk; a phone cannot
// drag inside a scrolling page reliably, so each tile also has Make cover.
// Removing a file keeps the file itself, so Undo puts it back where it was.
// ============================================================================
const MAX_VIDEO_MB = 60

export default function MediaEditor({ media = [], firmName, onChange, onError, toast }) {
  // In-flight and failed items only. Anything that succeeded lives in `media`
  // (the saved value) — keeping one list would mean the form's value could
  // hold a photo that isn't actually in R2.
  const [queue, setQueue] = useState([])
  const [drag, setDrag] = useState(false)
  const [viewing, setViewing] = useState(null)
  // Which tile is being dragged, and which it is over — a tile, not a file.
  const [moving, setMoving] = useState(null)
  const [over, setOver] = useState(null)
  // Local object URLs, kept by key after upload so a tile shows the bitmap
  // already on the device rather than waiting on a round trip to R2 — the
  // reason an uploaded photo used to look like an empty box.
  const previews = useRef(new Map())
  const seq = useRef(0)
  // The list as it is RIGHT NOW. `upload` is created in one render and awaited
  // across several, so the `media` it closed over is stale by the time the
  // second file finishes — and `onChange([...media, second])` then wrote a list
  // that had never heard of the first. Uploading two photos kept exactly one.
  const latest = useRef(media)
  latest.current = media
  const commit = (next) => { latest.current = next; onChange(next) }

  useEffect(() => () => { for (const url of previews.current.values()) URL.revokeObjectURL(url) }, [])

  const srcFor = (key) => previews.current.get(key) || fileUrl(key)

  const upload = async (item) => {
    setQueue(q => q.map(x => (x.id === item.id ? { ...x, status: 'uploading', error: '' } : x)))
    try {
      let blob = item.file
      let w, h
      if (item.kind === 'photo') {
        const done = await processListingImage(item.file, firmName)
        blob = done.blob; w = done.width; h = done.height
      }
      const key = await uploadMedia(blob, 'property')
      previews.current.set(key, URL.createObjectURL(blob))
      setQueue(q => q.filter(x => x.id !== item.id))
      commit([...latest.current, {
        key, kind: item.kind, w, h, at: new Date().toISOString(),
        // Video leaves the device untouched: a browser cannot watermark one.
        // Recording that fact on the object is what lets a later server-side
        // pass find these and mark them, and lets sharing skip them until it
        // has. Storing it as "watermarked: false" rather than not storing it
        // means an unmarked file can never be mistaken for a marked one.
        ...(item.kind === 'video' ? { watermarked: false } : {}),
      }])
    } catch (e) {
      const msg = e.message || 'Upload failed'
      setQueue(q => q.map(x => (x.id === item.id ? { ...x, status: 'error', error: msg } : x)))
      onError?.(msg)
    }
  }

  const add = (files) => {
    const items = []
    for (const file of files) {
      const kind = file.type.startsWith('video/') ? 'video' : file.type.startsWith('image/') ? 'photo' : null
      if (!kind) { onError?.(`${file.name} is not a photo or a video`); continue }
      if (kind === 'video' && file.size > MAX_VIDEO_MB * 1024 * 1024) {
        onError?.(`${file.name} is over ${MAX_VIDEO_MB}MB. Make it shorter or send it as a link.`)
        continue
      }
      items.push({ id: `m${++seq.current}`, file, kind, status: 'queued', preview: URL.createObjectURL(file) })
    }
    if (!items.length) return
    setQueue(q => [...q, ...items])
    // Sequential, not parallel: an agent on site is on one bar of signal, and
    // twelve simultaneous PUTs is how you turn a slow upload into twelve
    // failed ones.
    items.reduce((p, item) => p.then(() => upload(item)), Promise.resolve())
  }

  const onDrop = (e) => {
    e.preventDefault(); setDrag(false)
    if (moving !== null) return            // a tile being reordered, not a file
    if (e.dataTransfer?.files?.length) add(e.dataTransfer.files)
  }

  const move = (from, to) => {
    const list = latest.current
    if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length) return
    const next = list.slice()
    const [item] = next.splice(from, 1)
    next.splice(to, 0, item)
    commit(next)
  }

  const remove = (key) => {
    const list = latest.current
    const at = list.findIndex(x => x.key === key)
    if (at < 0) return
    const item = list[at]
    commit(list.filter(x => x.key !== key))
    toast?.(item.kind === 'video' ? 'Video removed' : 'Photo removed', undefined, {
      label: 'Undo',
      run: () => {
        const cur = latest.current
        if (cur.some(x => x.key === key)) return
        const next = cur.slice()
        next.splice(Math.min(at, next.length), 0, item)
        commit(next)
      },
    })
  }

  const empty = !media.length && !queue.length

  return (
    <div className="mp">
      <div
        className={'mp-zone' + (drag ? ' drag' : '') + (empty ? ' empty' : '')}
        onDragOver={e => { e.preventDefault(); if (moving === null) setDrag(true) }}
        onDragLeave={() => setDrag(false)}
        onDrop={onDrop}
      >
        {empty ? (
          <label className="mp-drop">
            <input type="file" accept="image/*,video/*" multiple hidden
              onChange={e => { add(e.target.files); e.target.value = '' }} />
            <Icon name="upload" size={22} />
            <strong>Drag photos and videos here</strong>
            <span>or</span>
            <span className="mp-browse">Browse files</span>
          </label>
        ) : (
          <div className="mp-grid">
            {media.map((m, i) => (
              <div key={m.key}
                className={'mp-item' + (moving === i ? ' mp-moving' : '') + (over === i && moving !== null && moving !== i ? ' mp-over' : '')}
                draggable={media.length > 1}
                onDragStart={e => { setMoving(i); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', m.key) }}
                onDragOver={e => { if (moving === null) return; e.preventDefault(); e.stopPropagation(); setOver(i) }}
                onDrop={e => { if (moving === null) return; e.preventDefault(); e.stopPropagation(); move(moving, i); setMoving(null); setOver(null) }}
                onDragEnd={() => { setMoving(null); setOver(null) }}>
                <button type="button" className="mp-open" onClick={() => setViewing(i)}
                  aria-label={m.kind === 'video' ? 'Play video' : 'View photo'}>
                  {m.kind === 'video'
                    ? <span className="mp-vid"><Icon name="play" size={20} fill /></span>
                    : <img src={srcFor(m.key)} alt="" loading="lazy" draggable={false} />}
                </button>
                {i === 0
                  ? <span className="mp-badge mp-cover">Cover</span>
                  : m.kind !== 'video' && (
                    <button type="button" className="mp-badge mp-makecover" onClick={() => move(i, 0)}>Make cover</button>
                  )}
                {m.kind === 'video' && <span className="mp-badge mp-vid-b">Video</span>}
                <button type="button" className="mp-x" aria-label="Remove" onClick={() => remove(m.key)}>
                  <Icon name="x" size={12} />
                </button>
              </div>
            ))}

            {queue.map(item => (
              <div key={item.id} className={'mp-item mp-' + item.status}>
                {item.kind === 'photo'
                  ? <img src={item.preview} alt="" />
                  : <span className="mp-vid"><Icon name="play" size={20} fill /></span>}
                {item.status !== 'error'
                  ? <span className="mp-state"><span className="mp-spin" />Uploading</span>
                  : (
                    <span className="mp-state mp-failed">
                      <Icon name="alert" size={12} />
                      <button type="button" onClick={() => upload(item)}>Retry</button>
                    </span>
                  )}
                {item.status === 'error' && (
                  <button type="button" className="mp-x" aria-label="Discard"
                    onClick={() => { URL.revokeObjectURL(item.preview); setQueue(q => q.filter(x => x.id !== item.id)) }}>
                    <Icon name="x" size={12} />
                  </button>
                )}
              </div>
            ))}

            <label className="mp-add">
              <input type="file" accept="image/*,video/*" multiple hidden
                onChange={e => { add(e.target.files); e.target.value = '' }} />
              <Icon name="plus" size={17} />
              <span>Add more</span>
            </label>
          </div>
        )}
      </div>

      {viewing !== null && (
        <Lightbox items={media} index={viewing} srcFor={srcFor} onClose={() => setViewing(null)} />
      )}
    </div>
  )
}
