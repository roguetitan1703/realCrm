/**
 * ============================================================================
 * 💾 LOCAL DISK CACHE for proxied media
 * ============================================================================
 * The /files proxy would otherwise round-trip to R2 on every browser that
 * hasn't cached an object yet. Ten agents opening the same listing means ten
 * identical fetches across the internet. This keeps a copy on the API box's
 * own disk so only the first one pays that cost; the rest are a local read.
 *
 * This is safe to do naively because media objects are IMMUTABLE — replacing a
 * photo writes a new key, it never rewrites an existing one. So a cached copy
 * can never be stale, and the TTL below is purely a disk-space policy rather
 * than a correctness one. That is why there is no invalidation logic anywhere.
 *
 * Two guards keep it from becoming a liability on a small instance:
 *   • TTL      — images 2 days, video 7 days (video is expensive to re-pull).
 *   • Size cap — a hard byte ceiling, oldest-first eviction when exceeded.
 * Both are env-tunable. If the cache directory is unwritable the whole layer
 * disables itself and the proxy simply behaves as it did before.
 * ============================================================================
 */

import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';

const DAY = 24 * 60 * 60 * 1000;

const CACHE_DIR = process.env.MEDIA_CACHE_DIR || path.join(os.tmpdir(), 're-media-cache');
const IMAGE_TTL_MS = Number(process.env.MEDIA_CACHE_TTL_DAYS || 2) * DAY;
const VIDEO_TTL_MS = Number(process.env.MEDIA_CACHE_VIDEO_TTL_DAYS || 7) * DAY;
const MAX_BYTES = Number(process.env.MEDIA_CACHE_MAX_MB || 2048) * 1024 * 1024;

let enabled = true;

try {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
} catch (e: any) {
  console.warn('[mediaCache] disabled — cannot create cache dir:', e?.message);
  enabled = false;
}

export function cacheEnabled(): boolean {
  return enabled;
}

function ttlFor(contentType: string): number {
  return contentType.startsWith('video/') ? VIDEO_TTL_MS : IMAGE_TTL_MS;
}

/** Object keys contain slashes and arbitrary length; hash to a flat filename. */
function slot(key: string): string {
  return crypto.createHash('sha256').update(key).digest('hex');
}

function paths(key: string) {
  const s = slot(key);
  return {
    body: path.join(CACHE_DIR, s),
    meta: path.join(CACHE_DIR, `${s}.json`),
    tmp: path.join(CACHE_DIR, `${s}.${process.pid}.tmp`),
  };
}

export interface CachedMeta {
  contentType: string;
  etag?: string;
  lastModified?: string;
  size: number;
  storedAt: number;
}

/**
 * Return a cached entry if present and still within TTL. Returns null on any
 * inconsistency (missing body, unreadable meta, expired) — a cache miss is
 * always a safe outcome, so nothing here should ever throw.
 */
export function readCache(key: string): { meta: CachedMeta; bodyPath: string } | null {
  if (!enabled) return null;
  const p = paths(key);
  try {
    const raw = fs.readFileSync(p.meta, 'utf-8');
    const meta = JSON.parse(raw) as CachedMeta;
    if (!fs.existsSync(p.body)) return null;
    if (Date.now() - meta.storedAt > ttlFor(meta.contentType)) {
      void evict(key);
      return null;
    }
    return { meta, bodyPath: p.body };
  } catch {
    return null;
  }
}

/**
 * Returns a writable stream to tee an R2 response into, plus commit/abort.
 * Bytes go to a temp file and are only renamed into place once the source
 * stream finished cleanly — so a connection dropped mid-download can never
 * leave a truncated file that would later be served as if it were whole.
 */
export function beginWrite(key: string, meta: Omit<CachedMeta, 'storedAt' | 'size'>) {
  if (!enabled) return null;
  const p = paths(key);
  let out: fs.WriteStream;
  try {
    out = fs.createWriteStream(p.tmp);
  } catch {
    return null;
  }
  out.on('error', () => { try { fs.unlinkSync(p.tmp); } catch { /* already gone */ } });

  return {
    stream: out,
    commit() {
      out.end(() => {
        try {
          fs.renameSync(p.tmp, p.body);
          const full: CachedMeta = { ...meta, size: out.bytesWritten, storedAt: Date.now() };
          fs.writeFileSync(p.meta, JSON.stringify(full));
          void sweep();
        } catch {
          try { fs.unlinkSync(p.tmp); } catch { /* already gone */ }
        }
      });
    },
    abort() {
      out.destroy();
      try { fs.unlinkSync(p.tmp); } catch { /* already gone */ }
    },
  };
}

async function evict(key: string): Promise<void> {
  const p = paths(key);
  try { fs.unlinkSync(p.body); } catch { /* already gone */ }
  try { fs.unlinkSync(p.meta); } catch { /* already gone */ }
}

let sweeping = false;

/**
 * Drop expired entries, then oldest-first until under the byte ceiling.
 * Cheap enough to run after a write; guarded so concurrent requests don't
 * stack up overlapping sweeps.
 */
export async function sweep(): Promise<void> {
  if (!enabled || sweeping) return;
  sweeping = true;
  try {
    const files = fs.readdirSync(CACHE_DIR).filter(f => f.endsWith('.json'));
    const entries: { slot: string; meta: CachedMeta }[] = [];

    for (const f of files) {
      const slotName = f.slice(0, -'.json'.length);
      try {
        const meta = JSON.parse(fs.readFileSync(path.join(CACHE_DIR, f), 'utf-8')) as CachedMeta;
        if (Date.now() - meta.storedAt > ttlFor(meta.contentType)) {
          try { fs.unlinkSync(path.join(CACHE_DIR, slotName)); } catch { /* already gone */ }
          try { fs.unlinkSync(path.join(CACHE_DIR, f)); } catch { /* already gone */ }
          continue;
        }
        entries.push({ slot: slotName, meta });
      } catch {
        // Unreadable metadata means the pair is unusable — drop both.
        try { fs.unlinkSync(path.join(CACHE_DIR, slotName)); } catch { /* already gone */ }
        try { fs.unlinkSync(path.join(CACHE_DIR, f)); } catch { /* already gone */ }
      }
    }

    let total = entries.reduce((n, e) => n + (e.meta.size || 0), 0);
    if (total <= MAX_BYTES) return;

    entries.sort((a, b) => a.meta.storedAt - b.meta.storedAt);
    for (const e of entries) {
      if (total <= MAX_BYTES) break;
      try { fs.unlinkSync(path.join(CACHE_DIR, e.slot)); } catch { /* already gone */ }
      try { fs.unlinkSync(path.join(CACHE_DIR, `${e.slot}.json`)); } catch { /* already gone */ }
      total -= e.meta.size || 0;
    }
  } catch (e: any) {
    console.warn('[mediaCache] sweep failed:', e?.message);
  } finally {
    sweeping = false;
  }
}

// Periodic sweep so a long-lived process with few writes still expires things.
if (enabled) {
  const timer = setInterval(() => { void sweep(); }, 6 * 60 * 60 * 1000);
  timer.unref();
}
