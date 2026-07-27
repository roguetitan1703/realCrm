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
import { sql } from '../services/db';

export const pwaRouter = Router();

const PLATFORM = { name: 'Real Estate by Delpat', initials: 'RE', primary: '#1E6F52', surface: '#F6F5F2' };

async function getTenant(slug: string): Promise<any | null> {
  if (!slug || slug === '_platform') return null;
  const rows = await sql`SELECT id, name, slug, brand_config, pwa_config FROM tenants WHERE slug = ${slug} OR id = ${slug} LIMIT 1`;
  return rows[0] || null;
}

function initialsOf(name: string): string {
  return String(name || '').trim().split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase() || PLATFORM.initials;
}

function iconSvg(initials: string, bg: string, fg = '#ffffff'): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">` +
    `<rect width="512" height="512" rx="104" fill="${bg}"/>` +
    `<text x="256" y="256" dy="0.35em" text-anchor="middle" font-family="'Space Grotesk',Arial,sans-serif" font-weight="700" font-size="230" fill="${fg}">${initials}</text>` +
    `</svg>`;
}

pwaRouter.get('/:slug/manifest.webmanifest', async (req: Request, res: Response) => {
  const slug = req.params.slug;
  const t = await getTenant(slug);
  const name = t?.name || PLATFORM.name;
  const brand = t?.brand_config || {};
  const pwa = t?.pwa_config || {};
  const primary = brand.primaryColor || PLATFORM.primary;
  const surface = brand.surfaceColor || PLATFORM.surface;

  // Always offer the SVG (works everywhere immediately); prefer stored PNGs when
  // onboarding has generated them.
  const icons: any[] = [];
  if (pwa.icon192) icons.push({ src: `/pwa/${slug}/icon-192.png`, sizes: '192x192', type: 'image/png', purpose: 'any' });
  if (pwa.icon512) icons.push({ src: `/pwa/${slug}/icon-512.png`, sizes: '512x512', type: 'image/png', purpose: 'maskable any' });
  icons.push({ src: `/pwa/${slug}/icon.svg`, sizes: 'any', type: 'image/svg+xml', purpose: 'any' });

  const startUrl = t ? `/?ws=${t.slug}` : '/';
  res.set('Content-Type', 'application/manifest+json');
  res.set('Cache-Control', 'public, max-age=300');
  return res.json({
    id: startUrl,
    name,
    short_name: name.length > 14 ? name.slice(0, 14) : name,
    description: `${name} — real estate desk`,
    start_url: startUrl,
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: surface,
    theme_color: primary,
    icons,
  });
});

pwaRouter.get('/:slug/icon.svg', async (req: Request, res: Response) => {
  const t = await getTenant(req.params.slug);
  const brand = t?.brand_config || {};
  const initials = brand.initials || (t ? initialsOf(t.name) : PLATFORM.initials);
  const bg = brand.primaryColor || PLATFORM.primary;
  res.set('Content-Type', 'image/svg+xml');
  res.set('Cache-Control', 'public, max-age=300');
  return res.send(iconSvg(initials, bg));
});

pwaRouter.get('/:slug/icon-:size.png', async (req: Request, res: Response) => {
  const t = await getTenant(req.params.slug);
  const pwa = t?.pwa_config || {};
  const b64: string | undefined = req.params.size === '512' ? pwa.icon512 : pwa.icon192;
  // No stored PNG yet → fall back to the SVG so the tenant is still installable.
  if (!b64) return res.redirect(302, `/pwa/${req.params.slug}/icon.svg`);
  const buf = Buffer.from(String(b64).replace(/^data:image\/png;base64,/, ''), 'base64');
  res.set('Content-Type', 'image/png');
  res.set('Cache-Control', 'public, max-age=31536000, immutable');
  return res.send(buf);
});
