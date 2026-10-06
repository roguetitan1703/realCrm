/**
 * PAGES ANYONE MAY OPEN, WITHOUT SIGNING IN.
 *
 *   GET /api/v1/public/gallery/:slug/:ref   a listing's photos, for its photo link
 *                                     (services/gallery.ts decides what is shown)
 *
 * A link that is wrong, turned off or replaced answers 404 with the same body,
 * so the page cannot be used to learn which listings exist.
 */
import { Router, Request, Response } from 'express';
import { publicGallery } from '../services/gallery';
import { mediaCdn } from '../services/media';

export const publicRouter = Router();

// ── THE LINK PREVIEW (Open Graph) ──────────────────────────────────────────
// WhatsApp, Facebook, Telegram and the rest build the card under a pasted link
// from <meta property="og:…"> in the page's HTML, and none of them runs
// JavaScript. The gallery is a single-page app, so every photo link showed the
// same bare "Real Estate by Delpat" shell — or nothing.
//
// vercel.json sends ONLY those crawlers' requests for /<firm>/photos/<code>
// here (matched on user agent); people still get the app. Same rule as the
// page itself: the project, the firm, the photos — no price, no flat, no owner.
export const shareRouter = Router();

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`;

shareRouter.get('/gallery/:slug/:ref', async (req: Request, res: Response) => {
  const slug = String(req.params.slug || '');
  const ref = String(req.params.ref || '');
  const apiBase = (process.env.PUBLIC_API_URL || `${req.protocol}://${req.get('host')}`).replace(/\/+$/, '');
  const appHost = String(req.headers['x-forwarded-host'] || '').split(',')[0].trim();
  const pageUrl = appHost ? `https://${appHost}/${encodeURIComponent(slug)}/photos/${encodeURIComponent(ref)}` : '';
  let g: any = null;
  try { g = await publicGallery(slug, ref); } catch { g = null; }

  res.set('Content-Type', 'text/html; charset=utf-8');
  // Crawlers cache the card themselves; ten minutes here keeps a re-share cheap
  // and lets a changed cover photo show up the same day.
  res.set('Cache-Control', 'public, max-age=600');
  if (!g) {
    res.status(404);
    return res.send('<!doctype html><html><head><meta charset="utf-8"><title>This link does not work any more</title>'
      + '<meta property="og:title" content="This link does not work any more"></head><body></body></html>');
  }

  const photos = g.media.filter((m: any) => m.kind === 'photo');
  const videos = g.media.length - photos.length;
  const firm = g.firm?.name || '';
  const title = g.project || (firm ? `Photos from ${firm}` : 'Photos');
  const desc = [photos.length ? plural(photos.length, 'photo') : null, videos ? plural(videos, 'video') : null, firm || null]
    .filter(Boolean).join(' · ');

  // The cover: the first photo (it carries the firm's mark). From the CDN when
  // there is one — with MEDIA_CDN_RESIZE a 1200×630 JPEG cut by Cloudflare, the
  // size every app asks for and small enough for WhatsApp; without it, the
  // photo itself. A listing with only videos gets the firm's logo.
  const cover = photos[0];
  const path = (k: string) => k.split('/').map(encodeURIComponent).join('/');
  const cdn = mediaCdn();
  const resize = cdn && /^(1|true|yes)$/i.test(String(process.env.MEDIA_CDN_RESIZE || ''));
  let image = '', iw = 0, ih = 0;
  if (cover) {
    if (resize) { image = `${cdn}/cdn-cgi/image/width=1200,height=630,fit=cover,gravity=top,format=jpeg,quality=75/${path(cover.key)}`; iw = 1200; ih = 630; }
    else { image = cdn ? `${cdn}/${path(cover.key)}` : `${apiBase}/files/${path(cover.key)}`; iw = cover.w || 0; ih = cover.h || 0; }
  } else if (g.firm?.logoUrl) {
    image = `${apiBase}${g.firm.logoUrl}`;
  }

  const meta = (p: string, c: unknown) => (c ? `<meta property="${p}" content="${esc(c)}">` : '');
  const name = (n: string, c: unknown) => (c ? `<meta name="${n}" content="${esc(c)}">` : '');
  return res.send(`<!doctype html><html lang="en"><head><meta charset="utf-8">
<title>${esc(title)}</title>
${name('description', desc)}
${meta('og:type', 'website')}
${meta('og:site_name', firm)}
${meta('og:title', title)}
${meta('og:description', desc)}
${meta('og:url', pageUrl)}
${meta('og:image', image)}
${image.startsWith('https:') ? meta('og:image:secure_url', image) : ''}
${image && cover ? meta('og:image:type', 'image/jpeg') : ''}
${iw ? meta('og:image:width', iw) : ''}
${ih ? meta('og:image:height', ih) : ''}
${meta('og:image:alt', title)}
${name('twitter:card', image ? 'summary_large_image' : 'summary')}
${name('twitter:title', title)}
${name('twitter:description', desc)}
${name('twitter:image', image)}
</head><body>${pageUrl ? `<a href="${esc(pageUrl)}">${esc(title)}</a>` : esc(title)}</body></html>`);
});

publicRouter.get('/gallery/:slug/:ref', async (req: Request, res: Response) => {
  try {
    const g = await publicGallery(req.params.slug, req.params.ref);
    if (!g) return res.status(404).json({ error: 'This link does not work any more.' });
    res.set('Cache-Control', 'private, max-age=60');
    return res.json({ success: true, ...g });
  } catch (err: any) {
    return res.status(500).json({ error: 'Could not open the photos' });
  }
});
