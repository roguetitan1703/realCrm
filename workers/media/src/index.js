// ============================================================================
// re-media — listing photos and videos on our own domain (media.re.delpat.in)
// ============================================================================
// Two jobs, both straight against the R2 bucket through its binding, so no
// bytes pass through the API on EC2:
//
//   GET/HEAD /<key>          A LISTING's photo or video (`<firm>/property/…`).
//                            Served with Range (a video seeks without arriving
//                            whole) and cached at Cloudflare's edge. Every other
//                            kind — agreements, visit selfies — is refused here
//                            and stays behind the API's /files route.
//
//   PUT /upload/<key>?ct=&exp=&sig=
//                            An upload, only with a ticket the API signed for
//                            exactly this key, this content type and this
//                            expiry (HMAC-SHA256 with UPLOAD_SECRET). The bucket
//                            stays private; the ticket is the permission.
//
// WHY: uploads went to <account>.r2.cloudflarestorage.com, which office
// firewalls and antivirus file under "cloud storage" and block — a client's
// desk sat on "uploading" for ever while the same account uploaded fine from
// elsewhere. And every view was streamed out of EC2, billed by AWS as data out.
// On our own domain neither happens.
//
// Deploy: npm run media:deploy (wrangler.toml beside this file). The secret:
//   npx wrangler secret put UPLOAD_SECRET --config workers/media/wrangler.toml
// The API must hold the same value as MEDIA_UPLOAD_SECRET.
// ============================================================================

const PUBLIC_KEY = /^[A-Za-z0-9_-]+\/property\/[A-Za-z0-9/._-]+$/
const ANY_KEY = /^[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+\/[A-Za-z0-9/._-]+$/
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
  'Access-Control-Allow-Methods': 'GET, HEAD, PUT, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Range, If-None-Match',
  'Access-Control-Expose-Headers': 'Content-Length, Content-Range, ETag, Accept-Ranges',
  'Access-Control-Max-Age': '86400',
}

const text = (status, body) => new Response(body, { status, headers: { ...CORS, 'Content-Type': 'text/plain; charset=utf-8' } })

function safeKey(key) {
  return key.length <= 512 && !key.includes('..') && !key.includes('//') && ANY_KEY.test(key)
}

async function hmacHex(secret, message) {
  const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sig = await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(message))
  return [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, '0')).join('')
}

// Constant-time compare, so a signature cannot be guessed a byte at a time.
function same(a, b) {
  if (a.length !== b.length) return false
  let d = 0
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return d === 0
}

async function upload(request, env, key) {
  if (!env.UPLOAD_SECRET) return text(503, 'Uploads are not configured.')
  const u = new URL(request.url)
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
}

function rangeHeader(range, size) {
  if (!range) return null
  const offset = 'suffix' in range ? size - range.suffix : (range.offset ?? 0)
  const length = 'suffix' in range ? range.suffix : (range.length ?? size - offset)
  return `bytes ${offset}-${offset + length - 1}/${size}`
}

async function serve(request, env, ctx, key) {
  if (!PUBLIC_KEY.test(key)) return text(404, 'Not found')
  const cache = caches.default
  const cacheKey = new Request(new URL(request.url).toString(), { method: 'GET' })

  // The edge cache holds whole files; a part (a video seeking) is read from the
  // bucket, which costs no data either.
  if (request.method === 'GET' && !request.headers.has('Range')) {
    const hit = await cache.match(cacheKey)
    if (hit) {
      // The browser already has it: say so instead of sending it again.
      const inm = request.headers.get('If-None-Match')
      if (inm && inm === hit.headers.get('ETag')) {
        return new Response(null, { status: 304, headers: { ...CORS, ETag: inm, 'Cache-Control': IMMUTABLE } })
      }
      return hit
    }
  }

  if (request.method === 'HEAD') {
    const head = await env.MEDIA.head(key)
    if (!head) return text(404, 'Not found')
    const h = new Headers(CORS)
    head.writeHttpMetadata(h)
    h.set('ETag', head.httpEtag); h.set('Content-Length', String(head.size)); h.set('Accept-Ranges', 'bytes')
    h.set('Cache-Control', IMMUTABLE); h.set('X-Content-Type-Options', 'nosniff')
    return new Response(null, { status: 200, headers: h })
  }

  const ranged = request.headers.has('Range')
  const obj = await env.MEDIA.get(key, { onlyIf: request.headers, ...(ranged ? { range: request.headers } : {}) })
  if (!obj) return text(404, 'Not found')
  const h = new Headers(CORS)
  obj.writeHttpMetadata(h)
  h.set('ETag', obj.httpEtag)
  h.set('Cache-Control', IMMUTABLE)
  h.set('Accept-Ranges', 'bytes')
  // Media is never HTML; a stored file must not be sniffed into one.
  h.set('X-Content-Type-Options', 'nosniff')
  // No body: the If-None-Match matched.
  if (!('body' in obj) || !obj.body) return new Response(null, { status: 304, headers: h })

  if (ranged && obj.range) {
    h.set('Content-Range', rangeHeader(obj.range, obj.size))
    const len = 'suffix' in obj.range ? obj.range.suffix : (obj.range.length ?? obj.size - (obj.range.offset ?? 0))
    h.set('Content-Length', String(len))
    return new Response(obj.body, { status: 206, headers: h })
  }
  h.set('Content-Length', String(obj.size))
  const res = new Response(obj.body, { status: 200, headers: h })
  // Whole files only, and only after they are sent: a Range reply is not the file.
  ctx.waitUntil(cache.put(cacheKey, res.clone()))
  return res
}

export default {
  async fetch(request, env, ctx) {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS })
    const path = decodeURIComponent(new URL(request.url).pathname.replace(/^\/+/, ''))
    try {
      if (request.method === 'PUT' && path.startsWith('upload/')) {
        const key = path.slice('upload/'.length)
        if (!safeKey(key)) return text(400, 'Bad key')
        return await upload(request, env, key)
      }
      if (request.method === 'GET' || request.method === 'HEAD') {
        if (!safeKey(path)) return text(404, 'Not found')
        return await serve(request, env, ctx, path)
      }
      return text(405, 'Method not allowed')
    } catch (e) {
      console.error('[re-media]', e?.stack || e)
      return text(500, 'Could not complete that. Try again.')
    }
  },
}
