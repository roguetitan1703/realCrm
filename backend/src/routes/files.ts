/**
 * ============================================================================
 * 📤📥 MEDIA ROUTES — presigned upload + cached download proxy
 * ============================================================================
 * Two routers, deliberately mounted differently:
 *
 *   mediaRouter  → /api/v1/media   AUTHENTICATED. Mints presigned PUTs. Only a
 *                  signed-in tenant user can obtain permission to write, and
 *                  the key is minted server-side under that user's tenant, so
 *                  a client can never choose where its bytes land.
 *
 *   filesRouter  → /files          UNAUTHENTICATED, by necessity: a browser
 *                  does not send Authorization headers on <img src>. Access
 *                  control therefore lives one layer up — the API only puts a
 *                  photo key in a JSON response for a viewer allowed to see it
 *                  (visit-proof photos are owner/manager-only, see B4). Keys
 *                  are 128 bits of randomness, so they are unguessable and
 *                  function as bearer tokens for that one object.
 *
 *                  This is the standard "unlisted media" model. It is a real
 *                  tradeoff and worth naming: anyone HOLDING a key can fetch
 *                  that object without logging in. Property photos get
 *                  forwarded to clients on WhatsApp anyway, so they carry no
 *                  secrecy. Visit-proof selfies are gated by never handing the
 *                  key to an agent in the first place. If that ever needs to
 *                  be stronger, this is the single place to add a signed-token
 *                  query param — the storage layer above already supports it.
 * ============================================================================
 */

import fs from 'fs';
import { Router, Request, Response } from 'express';
import { requireTenantAuth } from '../middleware/auth';
import { beginWrite, readCache } from '../services/mediaCache';
import {
  ALLOWED_UPLOAD_TYPES,
  IMMUTABLE_CACHE_CONTROL,
  buildMediaKey,
  fetchObject,
  isSafeKey,
  mediaConfigured,
  presignUpload,
} from '../services/media';
import { audit } from '../services/audit';

export const mediaRouter = Router();
export const filesRouter = Router();

/** One place for the response headers, so a disk hit and an R2 miss are
 *  byte-for-byte indistinguishable to the browser. */
function setMediaHeaders(
  res: Response,
  contentType: string,
  etag?: string,
  lastModified?: string,
  length?: number
): void {
  res.setHeader('Content-Type', contentType);
  res.setHeader('Cache-Control', IMMUTABLE_CACHE_CONTROL);
  if (etag) res.setHeader('ETag', etag);
  if (lastModified) res.setHeader('Last-Modified', lastModified);
  if (length != null) res.setHeader('Content-Length', String(length));
  // Media is never HTML; stop a stored file from being sniffed into one.
  res.setHeader('X-Content-Type-Options', 'nosniff');
}

mediaRouter.use(requireTenantAuth);

/**
 * POST /api/v1/media/upload-url
 * Body: { contentType, kind? }  →  { key, uploadUrl, expiresIn }
 *
 * The caller then PUTs the bytes straight to R2 with that exact Content-Type,
 * and afterwards sends us the KEY (never the URL) to attach to a record.
 */
mediaRouter.post('/upload-url', async (req: Request, res: Response) => {
  try {
    if (!mediaConfigured()) {
      return res.status(503).json({ error: 'Media storage is not configured on this server.' });
    }
    const contentType = String(req.body?.contentType || '');
    const ext = ALLOWED_UPLOAD_TYPES[contentType];
    if (!ext) {
      return res.status(400).json({
        error: `Unsupported file type. Allowed: ${Object.keys(ALLOWED_UPLOAD_TYPES).join(', ')}`,
      });
    }
    // The client picks a category, not a path. Anything unexpected is coerced
    // to a safe bucket by buildMediaKey rather than trusted.
    const kind = String(req.body?.kind || 'misc');
    const key = buildMediaKey(req.tenantId!, kind, ext);
    const uploadUrl = await presignUpload(key, contentType);
    return res.json({ key, uploadUrl, expiresIn: 300 });
  } catch (e: any) {
    console.error('[media] presign failed:', e?.message);
    return res.status(500).json({ error: 'Could not start the upload. Try again.' });
  }
});

/**
 * GET /files/<key>
 * Streams the object from R2 with immutable caching. Objects are never
 * overwritten (a replacement is a new key), so a browser that has fetched one
 * never needs to ask again. ETag/If-None-Match is still honoured for the case
 * where the browser cache was evicted — R2 answers 304 and no bytes move.
 *
 * A RegExp path is used because the key contains slashes; this avoids
 * depending on Express 5's wildcard-parameter syntax.
 */
filesRouter.get(/^\/(.+)$/, async (req: Request, res: Response) => {
  try {
    if (!mediaConfigured()) return res.status(503).send('Media storage is not configured.');

    const key = decodeURIComponent((req.params as any)[0] || '');
    if (!isSafeKey(key)) return res.status(400).send('Bad key');

    const inm = req.headers['if-none-match'] as string | undefined;

    // 1. Local disk first. Objects are immutable, so a hit is always valid and
    //    needs no revalidation against R2 — this is the whole latency win.
    const hit = readCache(key);
    if (hit) {
      if (inm && hit.meta.etag && inm === hit.meta.etag) {
        res.setHeader('Cache-Control', IMMUTABLE_CACHE_CONTROL);
        return res.status(304).end();
      }
      setMediaHeaders(res, hit.meta.contentType, hit.meta.etag, hit.meta.lastModified, hit.meta.size);
      return fs.createReadStream(hit.bodyPath)
        .on('error', () => { if (!res.headersSent) res.status(500).end(); else res.destroy(); })
        .pipe(res);
    }

    // 2. Miss — pull from R2, serving the client and filling the cache in one pass.
    const result = await fetchObject(key, inm);

    if (result.notModified) {
      res.setHeader('Cache-Control', IMMUTABLE_CACHE_CONTROL);
      return res.status(304).end();
    }
    if (result.missing || !result.object) return res.status(404).send('Not found');

    const o = result.object;
    setMediaHeaders(res, o.contentType, o.etag, o.lastModified?.toUTCString(), o.contentLength);

    const body: any = o.body;
    const writer = beginWrite(key, {
      contentType: o.contentType,
      etag: o.etag,
      lastModified: o.lastModified?.toUTCString(),
    });

    body.on('error', (err: any) => {
      console.error('[files] stream error:', err?.message);
      // A partial download must never be committed as a whole cached object.
      writer?.abort();
      if (!res.headersSent) res.status(500).end();
      else res.destroy();
    });

    if (writer) {
      // end:false — the cache writer is closed by commit(), only once the
      // source finished cleanly, so a dropped connection leaves no entry.
      body.pipe(writer.stream, { end: false });
      body.on('end', () => writer.commit());
      // Client hung up mid-transfer: bytes are incomplete, so discard.
      res.on('close', () => { if (!res.writableEnded) writer.abort(); });
    }
    return body.pipe(res);
  } catch (e: any) {
    console.error('[files] read failed:', e?.message);
    return res.status(500).send('Could not read the file.');
  }
});
