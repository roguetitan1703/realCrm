/**
 * ============================================================================
 * 🖼️ MEDIA STORAGE — Cloudflare R2 (S3-compatible)
 * ============================================================================
 * One pipeline shared by visit-proof selfies (B4) and property photos/videos
 * (Block C). Postgres only ever stores the object KEY — never bytes, never a
 * URL. Delivery is resolved at render time, so we can move from the current
 * API proxy to a CDN hostname later with a one-line change and no migration.
 *
 * Note on the SDK: @aws-sdk/client-s3 is the S3 *protocol* client. R2 speaks
 * the S3 API, and this is the client Cloudflare's own R2 docs recommend. It is
 * pointed at R2_ENDPOINT and never contacts AWS.
 *
 * Traffic shape, deliberately asymmetric:
 *   UPLOAD   → presigned PUT, browser straight to R2. Multi-MB phone photos
 *              never pass through the Express process.
 *   DOWNLOAD → proxied by GET /files/:key so the bucket can stay private (no
 *              public access, no custom domain, no Cloudflare plan upgrade).
 *              Objects are immutable, so the response is cached hard and each
 *              browser fetches a given object at most once.
 * ============================================================================
 */

import crypto from 'crypto';
import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

// Objects are never overwritten — replacing a photo writes a NEW key — so
// every object is immutable and can be cached for a year with no
// invalidation logic anywhere in the system.
export const IMMUTABLE_CACHE_CONTROL = 'public, max-age=31536000, immutable';

// Presigned PUT lifetime. Short: the browser uses it within seconds of asking.
const UPLOAD_URL_TTL_SECONDS = 300;

// What a client is allowed to upload. Enforced twice — here when minting the
// presigned URL (the signature pins Content-Type, so the browser cannot PUT a
// different type than it declared) and again by the caller's own validation.
// Images arrive already resized and watermarked by the browser. Video cannot
// be — no browser API can re-encode one — so it is stored as sent and flagged
// `watermarked: false` on the property record, which is what a later
// server-side ffmpeg pass will look for. Accepting it now means the file is
// captured at the site visit, when the agent is standing in the flat; a slot
// that rejects the upload just loses the footage.
export const ALLOWED_UPLOAD_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'video/mp4': 'mp4',
  'video/quicktime': 'mov',
  'video/webm': 'webm',
};

let client: S3Client | null = null;

/** True when R2 credentials are present. Media features degrade to a clear
 *  error rather than crashing boot when they're not — local dev and CI run
 *  fine without R2 configured. */
export function mediaConfigured(): boolean {
  return Boolean(
    process.env.R2_ENDPOINT &&
    process.env.R2_ACCESS_KEY_ID &&
    process.env.R2_SECRET_ACCESS_KEY &&
    process.env.R2_BUCKET_NAME
  );
}

function bucket(): string {
  return process.env.R2_BUCKET_NAME as string;
}

/** Lazily built so a missing/invalid config can't take down the API at import
 *  time — only the media routes fail, and they fail with a useful message. */
function s3(): S3Client {
  if (!mediaConfigured()) {
    throw new Error('R2 is not configured — set R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME.');
  }
  if (!client) {
    client = new S3Client({
      // R2 ignores region but the S3 client requires one.
      region: 'auto',
      endpoint: process.env.R2_ENDPOINT,
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID as string,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY as string,
      },
    });
  }
  return client;
}

/**
 * Build an object key. Tenant-prefixed so one tenant's media is trivially
 * separable (listing, bulk delete, retention sweeps) and so a key leaking from
 * one workspace can be recognised as foreign to another.
 *
 * The random segment is 128 bits. That matters: while the bucket is private
 * and reads go through our proxy, keys are also the last line of defence if
 * delivery ever moves to a public CDN hostname — an unguessable key is what
 * makes "unlisted" media safe there.
 */
export function buildMediaKey(tenantId: string, kind: string, ext: string): string {
  const now = new Date();
  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
  const safeTenant = String(tenantId).replace(/[^a-zA-Z0-9_-]/g, '') || 'unknown';
  const safeKind = String(kind).replace(/[^a-zA-Z0-9_-]/g, '') || 'misc';
  const rand = crypto.randomBytes(16).toString('hex');
  return `${safeTenant}/${safeKind}/${yyyy}/${mm}/${rand}.${ext}`;
}

/** The tenant segment of a key, used to reject cross-tenant reads. */
export function tenantOfKey(key: string): string | null {
  const first = String(key).split('/')[0];
  return first || null;
}

/**
 * Keys we generate never contain traversal segments; anything that does was
 * not minted by us and must not reach the storage layer.
 */
export function isSafeKey(key: string): boolean {
  if (!key || key.length > 512) return false;
  if (key.startsWith('/')) return false;
  if (key.includes('..') || key.includes('//') || key.includes('\\')) return false;
  return /^[A-Za-z0-9/._-]+$/.test(key);
}

/**
 * Mint a presigned PUT so the browser can upload straight to R2.
 * Content-Type is part of the signature — the browser must send exactly the
 * type it asked for, so a client cannot declare an image and store something
 * else. Cache-Control is baked in at write time, so it is already correct on
 * the object if delivery later moves to a CDN reading R2 directly.
 */
export async function presignUpload(key: string, contentType: string): Promise<string> {
  const cmd = new PutObjectCommand({
    Bucket: bucket(),
    Key: key,
    ContentType: contentType,
    CacheControl: IMMUTABLE_CACHE_CONTROL,
  });
  return getSignedUrl(s3(), cmd, { expiresIn: UPLOAD_URL_TTL_SECONDS });
}

export interface FetchedObject {
  body: NodeJS.ReadableStream;
  contentType: string;
  contentLength?: number;
  etag?: string;
  lastModified?: Date;
}

/**
 * Read an object for the download proxy. `ifNoneMatch` is forwarded so R2 can
 * answer 304 itself and we never pull bytes we're about to discard.
 * Returns null on 304/404 — the caller distinguishes via `notModified`.
 */
export async function fetchObject(
  key: string,
  ifNoneMatch?: string
): Promise<{ object?: FetchedObject; notModified?: boolean; missing?: boolean }> {
  try {
    const out = await s3().send(new GetObjectCommand({
      Bucket: bucket(),
      Key: key,
      IfNoneMatch: ifNoneMatch,
    }));
    return {
      object: {
        body: out.Body as NodeJS.ReadableStream,
        contentType: out.ContentType || 'application/octet-stream',
        contentLength: out.ContentLength,
        etag: out.ETag,
        lastModified: out.LastModified,
      },
    };
  } catch (err: any) {
    const status = err?.$metadata?.httpStatusCode;
    if (status === 304) return { notModified: true };
    if (status === 404 || err?.name === 'NoSuchKey') return { missing: true };
    throw err;
  }
}
