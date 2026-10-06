/**
 * ============================================================================
 * THE PREVIEW CARD FOR A LISTING'S PHOTO LINK
 * ============================================================================
 * The image WhatsApp (and every other app) shows under a shared photo link.
 * 1200×630, the size they all ask for:
 *
 *   ┌──────────────────────┬───────────┬────────────────┐
 *   │                      │  photo 2  │  [logo]        │
 *   │       cover          ├───────────┤  Firm name     │
 *   │                      │  photo 3  │  Project       │
 *   │                      │           │  8 photos · 1… │
 *   └──────────────────────┴───────────┴────────────────┘
 *
 * The cover is the listing's first photo — the one an agent picks with Make
 * cover — and the next two sit beside it, so one weak cover does not decide
 * the card and the firm is always on it. Same limits as the gallery itself:
 * no price, no flat number, no owner.
 *
 * MADE ONCE PER VERSION OF THE LISTING'S PHOTOS. The key carries a fingerprint
 * of what is drawn (which photos, the counts, the firm's name and logo, the
 * project), so a changed gallery is a new file at a new address, which the apps
 * fetch fresh; the old one for that listing is deleted. Made the first time the
 * link is previewed, so a listing nobody shares costs nothing. Stored in the
 * bucket under the firm's /property/ folder and served by the CDN like any
 * listing photo.
 *
 * JPEG, not PNG: a photo collage as PNG is ~1 MB, and WhatsApp drops large
 * preview images. resvg draws it, jpeg-js encodes it — both pure, no system
 * libraries — and the font ships with the code (assets/fonts, OFL) because the
 * server has none worth rendering with.
 * ============================================================================
 */
import crypto from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';
import { Resvg } from '@resvg/resvg-js';
import jpeg from 'jpeg-js';
import { mediaConfigured, objectExists, pruneObjects, readObjectBuffer, writeObject } from './media.js';

const W = 1200, H = 630;
const FONT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../assets/fonts');
const FONTS = ['IBMPlexSans-Bold.ttf', 'IBMPlexSans-SemiBold.ttf', 'IBMPlexSans-Medium.ttf'].map(f => path.join(FONT_DIR, f));

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`;

/** Lines of at most `max` characters, at word breaks, `lines` of them, the last with an ellipsis if cut. */
function wrap(text: string, max: number, lines: number): string[] {
  const words = String(text || '').trim().split(/\s+/).filter(Boolean);
  const out: string[] = [];
  let cur = '';
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (next.length <= max) { cur = next; continue; }
    if (cur) out.push(cur);
    cur = w.length > max ? w.slice(0, max - 1) + '…' : w;
    if (out.length === lines) break;
  }
  if (cur && out.length < lines) out.push(cur);
  if (out.length === lines && out.join(' ').length < words.join(' ').length) {
    out[lines - 1] = out[lines - 1].replace(/[\s,.-]*$/, '').slice(0, max - 1) + '…';
  }
  return out.slice(0, lines);
}

interface CardInput {
  tenantId: string; propertyId: string;
  firm: string; color: string | null; logoData: string;
  project: string;
  photos: string[];          // keys, cover first
  photoCount: number; videoCount: number;
}

/** The bucket key this exact card lives at. */
export function cardKey(c: CardInput): string {
  const fp = crypto.createHash('sha1').update(JSON.stringify([
    1, c.firm, c.color, crypto.createHash('sha1').update(c.logoData || '').digest('hex'),
    c.project, c.photos.slice(0, 3), c.photoCount, c.videoCount,
  ])).digest('hex').slice(0, 16);
  return `${c.tenantId}/property/share/${c.propertyId}-${fp}.jpg`;
}

const clipRect = (id: string, x: number, y: number, w: number, h: number) =>
  `<clipPath id="${id}"><rect x="${x}" y="${y}" width="${w}" height="${h}"/></clipPath>`;
const photo = (id: string, data: string, x: number, y: number, w: number, h: number) =>
  `<image clip-path="url(#${id})" href="${data}" x="${x}" y="${y}" width="${w}" height="${h}" preserveAspectRatio="xMidYMid slice"/>`;

function svgFor(c: CardInput, imgs: string[]): string {
  const accent = /^#[0-9a-f]{6}$/i.test(c.color || '') ? c.color! : '#1E6F52';
  const PANEL = 420, GAP = 6;
  const left = W - PANEL;
  // Photos: one big beside two small; fewer photos take the room there is.
  const tiles: string[] = [];
  const defs: string[] = [];
  if (imgs.length >= 3) {
    const bigW = Math.round(left * 0.64), smallW = left - bigW - GAP, smallH = (H - GAP) / 2;
    defs.push(clipRect('p0', 0, 0, bigW, H), clipRect('p1', bigW + GAP, 0, smallW, smallH), clipRect('p2', bigW + GAP, smallH + GAP, smallW, smallH));
    tiles.push(photo('p0', imgs[0], 0, 0, bigW, H), photo('p1', imgs[1], bigW + GAP, 0, smallW, smallH), photo('p2', imgs[2], bigW + GAP, smallH + GAP, smallW, smallH));
  } else if (imgs.length === 2) {
    const bigW = Math.round(left * 0.64), smallW = left - bigW - GAP;
    defs.push(clipRect('p0', 0, 0, bigW, H), clipRect('p1', bigW + GAP, 0, smallW, H));
    tiles.push(photo('p0', imgs[0], 0, 0, bigW, H), photo('p1', imgs[1], bigW + GAP, 0, smallW, H));
  } else if (imgs.length === 1) {
    defs.push(clipRect('p0', 0, 0, left, H));
    tiles.push(photo('p0', imgs[0], 0, 0, left, H));
  } else {
    // Only videos: the firm's colour where the photos would be, with a play
    // mark (the count is already in the panel).
    const cx = left / 2, cy = H / 2;
    tiles.push(`<rect x="0" y="0" width="${left}" height="${H}" fill="${accent}"/>`,
      `<circle cx="${cx}" cy="${cy}" r="78" fill="#ffffff" fill-opacity="0.18"/>`,
      `<path d="M ${cx - 24} ${cy - 38} L ${cx + 42} ${cy} L ${cx - 24} ${cy + 38} Z" fill="#ffffff"/>`);
  }

  // The panel: logo, firm, project, what is inside.
  // ~346px of text width: 13 characters of the project at 44px bold, 20 of the firm at 30.
  const px = left + 44, maxChars = 13;
  const parts: string[] = [`<rect x="${left}" y="0" width="${PANEL}" height="${H}" fill="#ffffff"/>`,
    `<rect x="${left}" y="0" width="8" height="${H}" fill="${accent}"/>`];
  let y = 64;
  if (c.logoData) {
    parts.push(`<image href="${c.logoData}" x="${px}" y="${y}" width="${PANEL - 96}" height="96" preserveAspectRatio="xMinYMid meet"/>`);
    y += 96 + 30;
  }
  for (const line of wrap(c.firm, 20, 2)) {
    parts.push(`<text x="${px}" y="${y + 30}" font-family="IBM Plex Sans" font-weight="600" font-size="30" fill="#4a4a4a">${esc(line)}</text>`);
    y += 40;
  }
  y += 26;
  parts.push(`<rect x="${px}" y="${y}" width="64" height="4" rx="2" fill="${accent}"/>`);
  y += 30;
  for (const line of wrap(c.project || 'Photos', maxChars, 3)) {
    parts.push(`<text x="${px}" y="${y + 44}" font-family="IBM Plex Sans" font-weight="700" font-size="44" fill="#161616">${esc(line)}</text>`);
    y += 54;
  }
  const inside = [c.photoCount ? plural(c.photoCount, 'photo') : null, c.videoCount ? plural(c.videoCount, 'video') : null].filter(Boolean).join(' · ');
  parts.push(`<text x="${px}" y="${H - 52}" font-family="IBM Plex Sans" font-weight="500" font-size="28" fill="#6b6b6b">${esc(inside)}</text>`);

  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`
    + `<defs>${defs.join('')}</defs><rect width="${W}" height="${H}" fill="#ffffff"/>${tiles.join('')}${parts.join('')}</svg>`;
}

/** Draw the card. Exported for the preview script; the route uses ensureCard. */
export async function renderCard(c: CardInput): Promise<Buffer> {
  const imgs: string[] = [];
  for (const k of c.photos.slice(0, 3)) {
    const buf = await readObjectBuffer(k).catch(() => null);
    const type = /\.png$/i.test(k) ? 'image/png' : /\.webp$/i.test(k) ? 'image/webp' : 'image/jpeg';
    if (buf) imgs.push(`data:${type};base64,${buf.toString('base64')}`);
  }
  const svg = svgFor(c, imgs);
  const r = new Resvg(svg, {
    fitTo: { mode: 'width', value: W },
    font: { loadSystemFonts: false, fontFiles: FONTS, defaultFontFamily: 'IBM Plex Sans' },
  });
  const out = r.render();
  const encoded = jpeg.encode({ data: Buffer.from(out.pixels), width: out.width, height: out.height }, 82);
  return Buffer.from(encoded.data);
}

// One render per key at a time: two crawlers asking at once share it.
const inflight = new Map<string, Promise<string | null>>();
// Cards this process knows are in the bucket, so a re-share asks nothing of it.
// Keys are content-addressed, so a remembered one can never be stale.
const known = new Set<string>();

/**
 * The card's key, made and stored if this version of the gallery has none yet.
 * Null when storage is not configured or drawing failed — the caller falls back
 * to the cover photo, so a share never loses its preview over this.
 */
export async function ensureCard(c: CardInput): Promise<string | null> {
  if (!mediaConfigured()) return null;
  const key = cardKey(c);
  if (known.has(key)) return key;
  if (inflight.has(key)) return inflight.get(key)!;
  const job = (async () => {
    try {
      if (await objectExists(key)) { known.add(key); return key; }
      const t0 = Date.now();
      const jpg = await renderCard(c);
      await writeObject(key, jpg, 'image/jpeg');
      known.add(key);
      console.log(`[shareCard] ${key} ${Math.round(jpg.length / 1024)}KB in ${Date.now() - t0}ms`);
      // The listing's earlier cards are for galleries that no longer exist.
      pruneObjects(`${c.tenantId}/property/share/${c.propertyId}-`, key).catch(() => {});
      return key;
    } catch (err: any) {
      console.warn('[shareCard] failed:', err?.message);
      return null;
    } finally {
      inflight.delete(key);
    }
  })();
  inflight.set(key, job);
  return job;
}
