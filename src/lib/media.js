// ============================================================================
// 📷 MEDIA PIPELINE — resize, watermark, upload
// ============================================================================
// One pipeline shared by visit-proof selfies (B4) and property photos
// (Block C). Everything happens in the browser before a single byte leaves the
// device, then the bytes go straight to R2 via a presigned PUT — they never
// pass through our API.
//
// Why resize on the device: a modern phone camera produces 4–12MB per shot. An
// agent on mobile data opening a listing with 15 of those is the actual
// performance problem in this app — far more than any storage cost. Capping
// the long edge at 1920px turns a 12MB frame into roughly 400KB with no
// visible loss at any size we ever render it.
//
// Why watermark on the device, into the pixels: agents share property photos
// by sending the FILE into WhatsApp, not by sending a link. A CSS overlay
// would vanish the moment that happens. Burning it into the bitmap is the only
// version that survives leaving the app — which is the entire point of it.
// ============================================================================

import { api, fileUrl } from './api.js'

export { fileUrl }

// Long-edge cap for a stored original. Full-screen on a 3x phone is ~1200px;
// 1920 leaves room to zoom without storing a 12MB camera frame.
const MAX_DIM = 1920
const JPEG_QUALITY = 0.85

/** Read a Blob into an HTMLImageElement, and always release the object URL. */
function loadImage(blob) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob)
    const img = new Image()
    img.onload = () => { URL.revokeObjectURL(url); resolve(img) }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('That image could not be read.')) }
    img.src = url
  })
}

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(b => (b ? resolve(b) : reject(new Error('Could not process the image.'))), type, quality)
  })
}

/**
 * Draw the firm's mark across the bottom of the frame. Deliberately a plain
 * text bar rather than a logo image: it needs no network fetch (this runs on a
 * phone that may be on one bar of signal at a site), it can't fail to load,
 * and it stays legible over any photo because it sits on its own scrim.
 */
function drawWatermark(ctx, w, h, lines) {
  const pad = Math.round(w * 0.025)
  const size = Math.max(13, Math.round(w * 0.028))
  const gap = Math.round(size * 0.42)
  const barH = pad * 2 + lines.length * size + (lines.length - 1) * gap

  const grad = ctx.createLinearGradient(0, h - barH * 1.6, 0, h)
  grad.addColorStop(0, 'rgba(0,0,0,0)')
  grad.addColorStop(1, 'rgba(0,0,0,0.62)')
  ctx.fillStyle = grad
  ctx.fillRect(0, h - barH * 1.6, w, barH * 1.6)

  ctx.textBaseline = 'top'
  ctx.textAlign = 'left'
  lines.forEach((line, i) => {
    const y = h - barH + pad + i * (size + gap)
    // First line is the firm; the rest is provenance (time, coords) at a
    // lighter weight so the mark reads as a mark, not a caption.
    ctx.font = `${i === 0 ? '700' : '500'} ${i === 0 ? size : Math.round(size * 0.82)}px system-ui, -apple-system, sans-serif`
    ctx.fillStyle = i === 0 ? 'rgba(255,255,255,0.97)' : 'rgba(255,255,255,0.82)'
    ctx.fillText(line, pad, y)
  })
}

/**
 * The anti-crop mark for LISTING media (spec C3w).
 *
 * A corner logo alone is useless here: anyone can crop the corner off and
 * repost the photo as their own, which is the actual thing being defended
 * against. So the firm's name is also tiled diagonally across the whole frame
 * at low opacity — faint enough not to spoil the photo, present enough that
 * removing it means destroying the image.
 *
 * Deliberately different from the visit-proof stamp, which is a legible
 * provenance caption for an internal record nobody is trying to steal.
 */
function drawAntiCropMark(ctx, w, h, firmName) {
  const text = (firmName || 'Listing').toUpperCase()
  const size = Math.max(12, Math.round(w * 0.021))

  ctx.save()
  ctx.font = `700 ${size}px system-ui, -apple-system, sans-serif`
  ctx.textBaseline = 'middle'
  // Rotate about the centre and cover the diagonal, so the tiling reaches
  // every corner no matter the aspect ratio.
  ctx.translate(w / 2, h / 2)
  ctx.rotate(-Math.PI / 6)
  const span = Math.hypot(w, h)
  const stepX = ctx.measureText(text).width + size * 2.4
  const stepY = size * 3.6
  ctx.lineWidth = Math.max(1, size / 9)
  ctx.lineJoin = 'round'
  for (let y = -span; y < span; y += stepY) {
    // Offset alternate rows so the marks don't form removable straight columns.
    const off = (Math.round(y / stepY) % 2) * (stepX / 2)
    for (let x = -span + off; x < span; x += stepX) {
      // Dark outline UNDER a light fill. White alone disappears over a bright
      // wall or an overexposed sky — extremely common in listing photos — and
      // an invisible watermark defends nothing. The pair stays legible on any
      // background while each half remains faint enough not to spoil the shot.
      ctx.strokeStyle = 'rgba(0,0,0,0.085)'
      ctx.strokeText(text, x, y)
      ctx.fillStyle = 'rgba(255,255,255,0.13)'
      ctx.fillText(text, x, y)
    }
  }
  ctx.restore()

  // Corner mark — the readable attribution, on its own scrim so it stays
  // legible over a bright sky or a white wall.
  const pad = Math.round(w * 0.022)
  const cs = Math.max(13, Math.round(w * 0.028))
  ctx.save()
  ctx.font = `700 ${cs}px system-ui, -apple-system, sans-serif`
  ctx.textBaseline = 'bottom'
  const tw = ctx.measureText(firmName || 'Listing').width
  ctx.globalAlpha = 0.45
  ctx.fillStyle = '#000000'
  ctx.fillRect(pad - cs * 0.4, h - pad - cs * 1.5, tw + cs * 0.8, cs * 1.7)
  ctx.globalAlpha = 0.95
  ctx.fillStyle = '#ffffff'
  ctx.fillText(firmName || 'Listing', pad, h - pad)
  ctx.restore()
}

/**
 * Resize + watermark a LISTING photo. Every uploaded image carries the mark —
 * the spec allows no exception, because these files leave the CRM as WhatsApp
 * attachments and the burned-in mark is the only thing that travels with them.
 */
export async function processListingImage(blob, firmName) {
  const img = await loadImage(blob)
  const scale = Math.min(1, MAX_DIM / Math.max(img.width, img.height))
  const w = Math.round(img.width * scale)
  const h = Math.round(img.height * scale)

  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  ctx.drawImage(img, 0, 0, w, h)
  drawAntiCropMark(ctx, w, h, firmName)

  const out = await canvasToBlob(canvas, 'image/jpeg', JPEG_QUALITY)
  return { blob: out, width: w, height: h }
}

/**
 * Resize + watermark, returning a JPEG blob ready to upload.
 * `stampLines` is the watermark content — for a visit selfie that's the firm,
 * the capture time and the GPS fix, so the proof carries its own provenance
 * even if the file is later viewed outside the CRM.
 */
export async function processImage(blob, stampLines = []) {
  const img = await loadImage(blob)
  const scale = Math.min(1, MAX_DIM / Math.max(img.width, img.height))
  const w = Math.round(img.width * scale)
  const h = Math.round(img.height * scale)

  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  ctx.drawImage(img, 0, 0, w, h)
  if (stampLines.length) drawWatermark(ctx, w, h, stampLines)

  return canvasToBlob(canvas, 'image/jpeg', JPEG_QUALITY)
}

/**
 * Upload a processed blob to R2 and resolve its object KEY.
 * The server mints the key (tenant-prefixed, 128 bits of randomness) so a
 * client can never choose where its bytes land. The PUT must send exactly the
 * Content-Type that was signed, or R2 rejects the signature.
 */
export async function uploadMedia(blob, kind = 'misc') {
  const contentType = blob.type || 'image/jpeg'
  const { key, uploadUrl } = await api.mediaUploadUrl(contentType, kind)

  const res = await fetch(uploadUrl, {
    method: 'PUT',
    body: blob,
    headers: { 'Content-Type': contentType },
  })
  if (!res.ok) throw new Error(`Upload failed (${res.status}). Check your connection and try again.`)
  return key
}

/**
 * Current position, as a promise. Rejects with a message worth showing a user:
 * for a site visit this is a hard requirement, so the copy has to explain what
 * to do rather than just report a failure.
 */
export function getPosition({ timeout = 15000 } = {}) {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('This device cannot provide a location, so a visit cannot be verified here.'))
      return
    }
    navigator.geolocation.getCurrentPosition(
      pos => resolve({
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        accuracy: pos.coords.accuracy,
      }),
      err => {
        const msg = err.code === err.PERMISSION_DENIED
          ? 'Location is off for this site. Turn it on in your browser settings to log a visit.'
          : err.code === err.TIMEOUT
            ? 'Could not get a location fix. Step outside or into the open and try again.'
            : 'Location is unavailable right now. Try again in a moment.'
        reject(new Error(msg))
      },
      { enableHighAccuracy: true, timeout, maximumAge: 0 }
    )
  })
}

/** Human-readable distance for the soft "were they actually there" signal. */
export function formatDistance(m) {
  if (m == null) return ''
  return m < 1000 ? `${m} m` : `${(m / 1000).toFixed(1)} km`
}
