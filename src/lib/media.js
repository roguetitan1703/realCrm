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
 * THE FIRM'S MARK on a LISTING photo: its logo and its name, together, in the
 * bottom-right corner on a light label — the way a brokerage signs its photos.
 *
 * It replaced two faint copies of the name written across the frame at an
 * angle. Firms said that read like a draft stamp on a Word document; it carried
 * no logo, and a client could not tell whose listing they were looking at.
 *
 * Sized from the photo's short side, so it is the same share of the picture on
 * a portrait phone shot and a wide one. No logo: the name alone. Neither: none.
 */
const logoCache = new Map()
function loadLogo(url) {
  if (!url) return Promise.resolve(null)
  if (!logoCache.has(url)) {
    logoCache.set(url, new Promise((resolve) => {
      const img = new Image()
      // Stored as a data URL (Settings → Brand); anything else must allow CORS,
      // or drawing it would taint the canvas and the photo could not be saved.
      if (!url.startsWith('data:')) img.crossOrigin = 'anonymous'
      img.onload = () => resolve(img)
      img.onerror = () => resolve(null)   // a broken logo never stops an upload
      img.src = url
    }))
  }
  return logoCache.get(url)
}

function drawBrandMark(ctx, w, h, firmName, logo) {
  const name = (firmName || '').trim()
  if (!name && !logo) return
  const short = Math.min(w, h)
  const pad = Math.round(short * 0.03)
  const logoH = Math.max(26, Math.round(short * 0.07))
  const inner = Math.round(logoH * 0.22)
  const font = Math.max(13, Math.round(logoH * 0.46))
  const logoW = logo ? Math.min(Math.round(logoH * (logo.width / logo.height || 1)), logoH * 3) : 0
  ctx.save()
  ctx.font = `700 ${font}px system-ui, -apple-system, "Segoe UI", sans-serif`
  const textW = name ? Math.ceil(ctx.measureText(name).width) : 0
  const gap = logo && name ? inner : 0
  const boxW = inner * 2 + logoW + gap + textW
  const boxH = logoH + inner * 2
  const x = w - pad - boxW
  const y = h - pad - boxH
  // A light label, so a logo in any colour reads on it and the photo under it
  // still shows through a little.
  ctx.shadowColor = 'rgba(0,0,0,0.18)'
  ctx.shadowBlur = Math.round(inner * 0.8)
  ctx.fillStyle = 'rgba(255,255,255,0.86)'
  const r = Math.round(boxH * 0.22)
  ctx.beginPath()
  ctx.moveTo(x + r, y); ctx.arcTo(x + boxW, y, x + boxW, y + boxH, r); ctx.arcTo(x + boxW, y + boxH, x, y + boxH, r)
  ctx.arcTo(x, y + boxH, x, y, r); ctx.arcTo(x, y, x + boxW, y, r); ctx.closePath()
  ctx.fill()
  ctx.shadowColor = 'transparent'
  if (logo) ctx.drawImage(logo, x + inner, y + inner, logoW, logoH)
  if (name) {
    ctx.fillStyle = 'rgba(20,20,20,0.92)'
    ctx.textBaseline = 'middle'
    ctx.textAlign = 'left'
    ctx.fillText(name, x + inner + logoW + gap, y + boxH / 2)
  }
  ctx.restore()
}

/**
 * Resize + watermark a LISTING photo. Every uploaded image carries the mark —
 * the spec allows no exception, because these files leave the CRM as WhatsApp
 * attachments and the burned-in mark is the only thing that travels with them.
 */
export async function processListingImage(blob, firmName, logoUrl) {
  const [img, logo] = await Promise.all([loadImage(blob), loadLogo(logoUrl)])
  const scale = Math.min(1, MAX_DIM / Math.max(img.width, img.height))
  const w = Math.round(img.width * scale)
  const h = Math.round(img.height * scale)

  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  ctx.drawImage(img, 0, 0, w, h)
  drawBrandMark(ctx, w, h, firmName, logo)

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
 * What the browser will do if we ask for a location, WITHOUT asking.
 *
 * 'granted' | 'prompt' | 'denied' | 'unknown' — the Permissions API is absent
 * on older Safari, hence the fourth. Two things depend on knowing this in
 * advance: whether a prompt is still possible at all (once it is 'denied' no
 * amount of retrying will ever raise one — only the browser's own site
 * settings can), and whether the request has to be made inside a tap.
 */
export async function geoPermission() {
  if (typeof navigator === 'undefined' || !navigator.permissions?.query) return 'unknown';
  try {
    const st = await navigator.permissions.query({ name: 'geolocation' });
    return st.state;
  } catch (e) { return 'unknown'; }
}

/**
 * Current position, as a promise. Rejects with a message worth showing a user:
 * for a site visit this is a hard requirement, so the copy has to explain what
 * to do rather than just report a failure.
 *
 * CALL THIS FROM A TAP. It used to run from the modal's mount effect, and the
 * effect is a separate task from the tap that opened the modal — so the request
 * carried no user gesture. Chrome on Android answers a gestureless request from
 * a site it has auto-blocked (which is what repeatedly dismissing the prompt
 * does) by denying it instantly, with no prompt shown; the agent then read
 * "turn it on in your browser settings" for a permission they had never
 * actually been asked for. Same shape as Notification.requestPermission on
 * iOS — see autoEnablePush in lib/push.js.
 */
export function getPosition({ timeout = 15000 } = {}) {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('This device cannot provide a location, so a visit cannot be verified here.'));
      return;
    }
    // Geolocation is unavailable outside a secure context, and the failure it
    // produces is indistinguishable from a denial.
    if (typeof window !== 'undefined' && window.isSecureContext === false) {
      reject(new Error('Location needs a secure (https) connection. Open the app from its normal address.'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      pos => resolve({
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        accuracy: pos.coords.accuracy,
      }),
      async err => {
        if (err.code === err.PERMISSION_DENIED) {
          // "Denied" is two different situations with two different fixes: the
          // browser is blocking the site (nothing on screen can change that),
          // or the person dismissed the prompt (tapping again re-asks).
          const st = await geoPermission();
          reject(new Error(st === 'denied'
            ? 'Location is blocked for this site. Allow it in your browser’s site settings, then try again.'
            : 'Location was not allowed. Tap Try again and choose Allow.'));
          return;
        }
        reject(new Error(err.code === err.TIMEOUT
          ? 'Could not get a location fix. Step outside or into the open and try again.'
          : 'Location is unavailable right now. Try again in a moment.'));
      },
      { enableHighAccuracy: true, timeout, maximumAge: 0 }
    );
  });
}

/** Human-readable distance for the soft "were they actually there" signal. */
export function formatDistance(m) {
  if (m == null) return ''
  return m < 1000 ? `${m} m` : `${(m / 1000).toFixed(1)} km`
}
