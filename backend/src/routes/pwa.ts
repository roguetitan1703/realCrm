/**
 * ============================================================================
 * 📱 PWA IDENTITY — per-tenant manifest + home-screen icons
 * ============================================================================
 * White-label installability: each tenant's installed app shows THEIR name and
 * icon. The manifest is small and derived from the tenant record; icons are
 * either the PNGs generated once at onboarding (stored on the tenant) or an
 * initials-on-brand-color SVG fallback so every tenant is installable
 * immediately. Served at the site origin (not under /api) so browsers can read
 * it as the app manifest. In dev, Vite proxies /pwa to this backend.
 * ============================================================================
 */

import { Router, Request, Response } from 'express';
import { Resvg } from '@resvg/resvg-js';
import { createHash } from 'crypto';
import { sql } from '../services/db';

export const pwaRouter = Router();

const PLATFORM = { name: 'Real Estate by Delpat', initials: 'RE', primary: '#1E6F52', surface: '#F6F5F2' };

async function getTenant(slug: string): Promise<any | null> {
  if (!slug || slug === '_platform') return null;
  const rows = await sql`SELECT id, name, slug, brand_config, pwa_config FROM tenants WHERE slug = ${slug} OR id = ${slug} LIMIT 1`;
  if (!rows[0]) return null;
  const settingsRows = await sql`SELECT value FROM crm_settings WHERE tenant_id = ${rows[0].id} AND key = 'default' LIMIT 1`;
  const settings = settingsRows[0]?.value || {};
  if (settings.firmName) {
    rows[0].name = settings.firmName;
  }
  return rows[0];
}

function initialsOf(name: string): string {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return PLATFORM.initials;
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }
  return parts.slice(0, 2).map(w => w[0]).join('').toUpperCase();
}

/**
 * The caption under the installed home-screen icon. Android gives it roughly
 * 12-14 characters and silently truncates the rest, so a long firm name has to
 * be shortened HERE or the OS does it mid-word — "Real Estate by Delpat" was
 * being installed as "Real Estate by", which reads like a broken string rather
 * than a company. Cutting on a word boundary gives "Real Estate" instead.
 */
function shortNameOf(name: string, override?: string): string {
  const explicit = String(override || '').trim();
  if (explicit) return explicit.slice(0, 14);
  const full = String(name || '').trim();
  if (full.length <= 14) return full;
  let out = '';
  for (const w of full.split(/\s+/)) {
    if ((out ? out.length + 1 : 0) + w.length > 14) break;
    out = out ? `${out} ${w}` : w;
  }
  // Stopping on a word boundary is not enough on its own: "Real Estate by
  // Delpat" fits "Real Estate by" in exactly 14, and a name ending in a
  // connector still reads as a sentence that got cut off. Drop trailing
  // connectors (and any dangling punctuation) until it ends on a real word.
  let prev;
  do {
    prev = out;
    out = out.replace(/[\s,&·|/-]+$/, '').replace(/\s+(by|and|of|the|for|at|in|on|with|&)$/i, '');
  } while (out !== prev);
  // A single word longer than the budget still has to be cut somewhere.
  return out || full.slice(0, 14);
}

function iconSvg(initials: string, bg: string, opts: { rounded?: boolean; fg?: string; logoUrl?: string } = {}): string {
  const fg = opts.fg || '#ffffff';
  const fillBg = opts.logoUrl ? '#ffffff' : bg;
  const rect = opts.rounded
    ? `<rect width="512" height="512" rx="104" fill="${fillBg}"/>`
    : `<rect width="512" height="512" fill="${fillBg}"/>`;

  if (opts.logoUrl && (opts.logoUrl.startsWith('data:image/') || opts.logoUrl.startsWith('http'))) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">` +
      rect +
      `<image href="${opts.logoUrl}" x="64" y="64" width="384" height="384" preserveAspectRatio="xMidYMid meet"/>` +
      `</svg>`;
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">` +
    rect +
    `<text x="256" y="256" dy="0.35em" text-anchor="middle" font-family="Arial,'Space Grotesk',sans-serif" font-weight="700" font-size="230" fill="${fg}">${initials}</text>` +
    `</svg>`;
}

/** Rasterize the icon SVG to a PNG Buffer at the given width. */
function renderIconPng(initials: string, bg: string, size: number, logoUrl?: string): Buffer {
  const svg = iconSvg(initials, bg, { rounded: false, logoUrl });
  const r = new Resvg(svg, { fitTo: { mode: 'width', value: size }, font: { loadSystemFonts: true, defaultFontFamily: 'Arial' } });
  return r.render().asPng();
}

pwaRouter.get('/:slug/manifest.webmanifest', async (req: Request, res: Response) => {
  const slug = req.params.slug;
  const t = await getTenant(slug);
  const name = t?.name || PLATFORM.name;
  const brand = t?.brand_config || {};
  const pwa = t?.pwa_config || {};
  const primary = brand.primaryColor || PLATFORM.primary;
  const surface = brand.surfaceColor || PLATFORM.surface;

  // Always advertise PNGs — the icon route renders them on demand (server-side,
  // so it never depends on the browser) and caches them. A 512 maskable + a 192
  // "any" is what Chrome/Android need for a proper install (not a shortcut).
  //
  // The `?v=` is load-bearing on Android. Chrome captures the icon ONCE, at
  // install, and afterwards treats the URL as the identity of the image — a
  // firm that uploads a new logo would keep the old icon on every installed
  // phone, because /icon-512.png is still /icon-512.png. Stamping the signature
  // into the URL makes a new logo a new URL, which is the only thing Chrome
  // re-fetches.
  // Hashed, not the raw signature: the signature contains the brand colour, and
  // a '#' in a URL starts the fragment — "?v=BP_#1E6F52_logo…" would have been
  // truncated to "?v=BP_" by every client that read it.
  const v = createHash('sha1')
    .update(iconSignature(t ? initialsOf(t.name) : PLATFORM.initials, primary, brand.logoUrl))
    .digest('hex').slice(0, 12);
  const icons: any[] = [
    { src: `/pwa/${slug}/icon-192.png?v=${v}`, sizes: '192x192', type: 'image/png', purpose: 'any' },
    { src: `/pwa/${slug}/icon-512.png?v=${v}`, sizes: '512x512', type: 'image/png', purpose: 'any' },
    // Maskable means Android may crop it to a circle/squircle, keeping only the
    // middle ~80%. A logo drawn edge to edge would lose its edges, so the
    // renderer insets it — see iconSvg's 64px pad on a 512 canvas.
    { src: `/pwa/${slug}/icon-512.png?v=${v}`, sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    { src: `/pwa/${slug}/icon.svg?v=${v}`, sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
  ];

  // Path-based, not `/?ws=<slug>`. Two reasons, and the second was the visible
  // bug: `scope` is a path prefix, so only a path can fence the installed app to
  // one firm — a query string scopes nothing. And the login screen auto-enters a
  // workspace by reading the first path segment, so a start_url of
  // `/?ws=delpat` landed on the bare "type your firm name" prompt on every
  // launch, which is exactly what a firm-branded installed app must never show.
  const startUrl = t ? `/${t.slug}` : '/';
  res.set('Content-Type', 'application/manifest+json');
  res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
  return res.json({
    id: startUrl,
    name,
    short_name: shortNameOf(name, brand.shortName),
    description: `${name} — real estate desk`,
    start_url: startUrl,
    scope: startUrl,
    display: 'standalone',
    orientation: 'portrait',
    background_color: surface,
    theme_color: primary,
    icons,
  });
});

/**
 * GET /pwa/:slug/logo
 * The firm's uploaded logo as an image, so the boot payload can carry a URL
 * instead of the base64 data URI sitting in brand_config — 76KB of it on at
 * least one tenant, in the one response that gates first paint. A browser
 * caches this; a data URI in JSON is re-sent on every load.
 */
pwaRouter.get('/:slug/logo', async (req: Request, res: Response) => {
  const t = await getTenant(req.params.slug);
  const raw = String((t?.brand_config || {}).logoUrl || '');
  const m = /^data:([\w/+.-]+);base64,(.*)$/s.exec(raw);
  if (!m) {
    if (/^https?:\/\//.test(raw)) return res.redirect(raw);
    return res.status(404).end();
  }
  res.set('Content-Type', m[1]);
  res.set('Cache-Control', 'public, max-age=300');
  return res.end(Buffer.from(m[2], 'base64'));
});

pwaRouter.get('/:slug/icon.svg', async (req: Request, res: Response) => {
  const t = await getTenant(req.params.slug);
  const brand = t?.brand_config || {};
  const initials = t ? initialsOf(t.name) : PLATFORM.initials;
  const bg = brand.primaryColor || PLATFORM.primary;
  res.set('Content-Type', 'image/svg+xml');
  res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
  return res.send(iconSvg(initials, bg, { rounded: true, logoUrl: brand.logoUrl }));
});

// 180 is iOS's own home-screen size. It is not vanity: Safari does not read the
// manifest for the installed icon at all — it reads <link rel="apple-touch-icon">
// — and handing it a 192 leaves the OS to rescale on every launch surface. The
// three sizes share one renderer, so a new one costs a line.
const ICON_SIZES: Record<string, number> = { '180': 180, '192': 192, '512': 512 };

/**
 * What the cached PNG was rendered FROM. Any change to it must produce a
 * different string, or the cache serves yesterday's picture forever.
 *
 * This used to end in the word 'logo' — present or absent. So a firm that
 * REPLACED its logo kept the old one on every phone, because "has a logo" was
 * still true and the signature never moved. Hashing the logo bytes is what
 * makes "they changed it" visible.
 */
function iconSignature(initials: string, bg: string, logoUrl?: string): string {
  const logo = String(logoUrl || '');
  return `${initials}_${bg}_${logo ? 'logo' + createHash('sha1').update(logo).digest('hex').slice(0, 10) : 'nologo'}`;
}

pwaRouter.get('/:slug/icon-:size.png', async (req: Request, res: Response) => {
  const slug = req.params.slug;
  const size = ICON_SIZES[req.params.size] || 192;
  const key = `icon${size}`;
  const t = await getTenant(slug);
  const brand = t?.brand_config || {};
  const initials = t ? initialsOf(t.name) : PLATFORM.initials;
  const bg = brand.primaryColor || PLATFORM.primary;
  const signature = iconSignature(initials, bg, brand.logoUrl);
  const pwa = t?.pwa_config || {};

  // Serve the cached PNG ONLY if signature matches current brand config
  const stored: string | undefined = pwa[key];
  if (stored && pwa.signature === signature) {
    const buf = Buffer.from(String(stored).replace(/^data:image\/png;base64,/, ''), 'base64');
    res.set('Content-Type', 'image/png');
    res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
    return res.send(buf);
  }

  // Signature moved on, so every cached size is stale — not just this one. The
  // cache holds ONE signature for a tenant but a separate blob per size, so
  // merging the new signature in beside the old blobs marks all of them fresh:
  // fetching /icon-180.png would validate a months-old /icon-192.png, and the
  // next request for 192 would serve it. That is not theoretical — it is how a
  // tenant with a logo kept serving an initials icon at one size after the
  // others had been fixed. Replace the object rather than merging into it.
  //
  // Dropping the sibling sizes only when the signature actually moved matters:
  // dropping them every time would make each size evict the other two, so no
  // request would ever hit the cache.
  const png = renderIconPng(initials, bg, size, brand.logoUrl);
  if (t) {
    const patch = sql.json({ [key]: png.toString('base64'), signature });
    if (pwa.signature && pwa.signature !== signature) {
      await sql`UPDATE tenants SET pwa_config =
        (COALESCE(pwa_config, '{}'::jsonb) - 'icon180' - 'icon192' - 'icon512') || ${patch}
        WHERE id = ${t.id}`;
    } else {
      await sql`UPDATE tenants SET pwa_config = COALESCE(pwa_config, '{}'::jsonb) || ${patch} WHERE id = ${t.id}`;
    }
  }
  res.set('Content-Type', 'image/png');
  res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
  return res.send(png);
});
