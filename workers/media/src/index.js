// ============================================================================
// re-upload — uploads into the media bucket, on our own domain (upload.delpat.in)
// ============================================================================
// One job. `PUT /<key>?ct=&exp=&sig=` writes the body into the bucket through
// its binding, only with a ticket the API signed for exactly this key, this
// content type and this expiry (HMAC-SHA256 with UPLOAD_SECRET). The bucket
// itself accepts no writes from browsers; the ticket is the permission.
//
// WHY: uploads went to <account>.r2.cloudflarestorage.com — the only address R2
// accepts uploads on — and office firewalls and antivirus file that under
// "cloud storage" and block it. A client's desk sat on "uploading" and nothing
// reached the bucket, while the same account uploaded fine from elsewhere.
//
// Reading is NOT here: listing photos and videos are served by the bucket's own
// custom domain, cdn.delpat.in; agreements and visit selfies by the API's
// /files, with a ticket. Two ways to serve one file is how they drift.
//
// Deploy: npm run media:deploy. The secret, once:
//   npx wrangler secret put UPLOAD_SECRET --config workers/media/wrangler.toml
// The API holds the same value as MEDIA_UPLOAD_SECRET.
// ============================================================================

const KEY = /^[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+\/[A-Za-z0-9/._-]+$/
const IMMUTABLE = 'public, max-age=31536000, immutable'
// The free plan's request-body limit. The API allows 60MB videos.
const MAX_UPLOAD_BYTES = 100 * 1024 * 1024
// Mirrors ALLOWED_UPLOAD_TYPES in backend/src/services/media.ts.
const UPLOAD_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/quicktime', 'video/webm', 'application/pdf'])

const CORS = {
  // The ticket is the permission, not the origin, and no cookie is ever sent:
  // an allowlist would only be one more thing a firm's own domain falls
  // outside of. Same stance as the API's cors().
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'PUT, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400',
}

const text = (status, body) => new Response(body, { status, headers: { ...CORS, 'Content-Type': 'text/plain; charset=utf-8' } })

async function hmacHex(secret, message) {
  const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sig = await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(message))
  return [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, '0')).join('')
}

// Constant-time compare, so a signature cannot be found a byte at a time.
function same(a, b) {
  if (a.length !== b.length) return false
  let d = 0
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return d === 0
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS })
    if (request.method !== 'PUT') return text(405, 'Uploads only.')
    try {
      if (!env.UPLOAD_SECRET) return text(503, 'Uploads are not configured.')
      const u = new URL(request.url)
      const key = decodeURIComponent(u.pathname.replace(/^\/+/, ''))
      if (key.length > 512 || key.includes('..') || key.includes('//') || !KEY.test(key)) return text(400, 'Bad key')
      const ct = u.searchParams.get('ct') || ''
      const exp = Number(u.searchParams.get('exp') || 0)
      const sig = u.searchParams.get('sig') || ''
      if (!UPLOAD_TYPES.has(ct)) return text(400, 'That file type is not accepted.')
      if (!exp || exp * 1000 < Date.now()) return text(403, 'This upload link has expired. Try again.')
      if (!same(sig, await hmacHex(env.UPLOAD_SECRET, `${key}\n${ct}\n${exp}`))) return text(403, 'This upload link is not valid.')
      // The browser must send the type it was signed for, as with R2's own links.
      if ((request.headers.get('Content-Type') || '').split(';')[0].trim() !== ct) return text(400, 'The file type does not match the upload link.')
      const len = Number(request.headers.get('Content-Length') || 0)
      if (!len) return text(411, 'The upload has no length.')
      if (len > MAX_UPLOAD_BYTES) return text(413, 'That file is too large.')
      await env.MEDIA.put(key, request.body, { httpMetadata: { contentType: ct, cacheControl: IMMUTABLE } })
      return new Response(null, { status: 200, headers: CORS })
    } catch (e) {
      console.error('[re-upload]', e?.stack || e)
      return text(500, 'Could not save that. Try again.')
    }
  },
}
