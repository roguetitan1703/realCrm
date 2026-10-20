/**
 * PAGES ANYONE MAY OPEN, WITHOUT SIGNING IN (docs/specs/listing-pages.md §A).
 *
 *   GET  /api/v1/public/s/:tenant/:code              a shared link or a tap's ref
 *   POST /api/v1/public/s/:tenant/:code/interested   {propertyId} → { waUrl }
 *   POST /api/v1/public/s/:tenant/:code/talk         → { waUrl }
 *   GET  /api/v1/public/catalogue/:tenant            ?deal=&config=&locality=&page=
 *   GET  /api/v1/public/catalogue/:tenant/:slug      one flat
 *   POST /api/v1/public/catalogue/:tenant/enquiry    {name, phone, propertyId?, message?}
 *   GET  /api/v1/public/gallery/:slug/:ref           an old photo link (§A.4)
 *   GET  /api/v1/public/forms/:tenant/slots          the visit times a buyer may pick
 *   POST /api/v1/public/forms/:tenant/ask            Call me back / Book a visit / New homes like these (§A.6)
 *
 * services/sharing.ts decides what is shown, so a page cannot show more. A
 * code that is wrong, off, stopped or expired answers one identical body.
 * Every route here is rate-limited per address; the visitor's browser is the
 * `X-Device-Id` header the page keeps in localStorage (nv_device_<tenant>).
 */
import { Router, Request, Response } from 'express';
import { resolveGallery } from '../services/gallery';
import { mediaCdn } from '../services/media';
import { ensureCard } from '../services/shareCard';
import { runWithContext } from '../services/context';
import { hit, spent } from '../services/rateLimit';
import { sql } from '../services/db';
import { sharingOf } from '../services/store';
import {
  firmBySlug, firmPublic, openCode, interested, talk, catalogueList, catalogueFlat, catalogueEnquiry,
  resolveOldPhotoLink, deviceIdOf, ShareError, publicFlat, resolveCode, linkRows, linkState, markStaffDevice,
  SHOWN_COLUMNS, CATALOGUE_WHERE, catalogueUrlOf, firmPhone, isPreviewFetcher, type Firm, type PublicReq,
} from '../services/sharing';
import { localeOf } from '../services/store';
import { phoneKey } from '../services/phone';
import { buyerAsk, slotsFor } from '../services/buyerAsks';

export const publicRouter = Router();

const ipOf = (req: Request) => req.ip || req.socket?.remoteAddress || 'unknown';
const pubReq = (req: Request): PublicReq => ({
  deviceId: deviceIdOf(req.headers['x-device-id']),
  userAgent: (req.headers['user-agent'] as string) || null,
  method: req.method,
  origin: (req.headers.origin as string) || null,
  user: req.user ? { id: (req.user as any).id, tenant_id: (req.user as any).tenant_id, role: (req.user as any).role } : null,
});

/** Run a public handler as the firm in the URL — never the header's or a session's firm. */
async function asFirm<T>(req: Request, f: Firm, fn: () => Promise<T>): Promise<T> {
  const pr = pubReq(req);
  const u = pr.user;
  const staff = u && u.tenant_id === f.id ? u : null;
  // The firm in the URL is the one any write here belongs to; index.ts closes
  // that firm's settled alerts after the response, never the header's.
  (req as any).publicTenantId = f.id;
  if (staff && pr.deviceId) await markStaffDevice(f.id, pr.deviceId, staff.id).catch(() => {});
  return runWithContext({
    tenantId: f.id, userId: staff?.id || null, role: staff?.role || null, actorType: staff ? 'user' : 'system',
    actorLabel: null, ip: ipOf(req), userAgent: (req.headers['user-agent'] as string) || null,
  }, fn);
}

/**
 * THE ONE GATE FOR ANYTHING THAT RESOLVES A CODE: the page, Talk to us and the
 * preview card. Lookups per address, and a tighter allowance for codes that
 * match nothing, so guessing is slow long before it is fruitful — on every
 * door, not just the page.
 */
// THE LIMIT IS ON MISSES, NOT ON BUYERS. Indian mobile carriers put many
// people behind one public address (CGNAT), so a tight per-address limit on
// real opens answered 429 to real buyers. Valid opens get a generous ceiling;
// what is tight is the allowance for codes that are no use — unknown, off,
// stopped or expired — so guessing stays slow. On the API every one of them
// spends it alike. On the /share preview card a real-but-unusable code does
// not spend it for a preview user agent (see that route), and that list also
// matches scripts (curl, python): a script there can tell an expired code
// from one that never existed by watching the allowance. Accepted: it does
// not make guessing faster, since unknown codes still spend it.
const codeGate = (ip: string) => hit(`s:${ip}`, 600, 60_000) && !spent(`miss:${ip}`, 30, 10 * 60_000);
const codeMiss = (ip: string) => { hit(`miss:${ip}`, 1_000_000, 10 * 60_000); };

const SLOW = { error: 'slow_down', message: 'Too many requests. Try again in a few minutes.' };
/**
 * A 429 a page can still act on: the firm's card, its number and the
 * catalogue, the same fields as the unavailable body, so the buyer is offered
 * WhatsApp to the firm rather than "No connection". Shape:
 *   { error: 'slow_down', message, firm: {name, logo, accent, locale}, cta: { phone }, catalogueUrl }
 * `firm` and `cta` are absent only when the firm in the URL does not exist.
 */
async function slow(res: Response, tenant: string) {
  const f = await firmBySlug(tenant).catch(() => null);
  if (!f) return res.status(429).json(SLOW);
  return res.status(429).json({
    ...SLOW, firm: firmPublic(f, await localeOf(f.id)), cta: { phone: await firmPhone(f.id) }, catalogueUrl: await catalogueUrlOf(f),
  });
}
const NOT_FOUND = { error: 'not_found', message: 'This page does not exist.' };

function shareFail(res: Response, err: any) {
  if (err instanceof ShareError) return res.status(err.status).json({ error: err.code, message: err.message, ...err.extra });
  console.error('[Public] failed:', err?.message || err);
  return res.status(500).json({ error: 'failed', message: 'Something went wrong.' });
}

// ── Shared links and taps ───────────────────────────────────────────────────

publicRouter.get('/s/:tenant/:code', async (req: Request, res: Response) => {
  const ip = ipOf(req);
  if (!codeGate(ip)) return slow(res, String(req.params.tenant));
  try {
    const f = await firmBySlug(String(req.params.tenant));
    if (!f) return res.status(404).json(NOT_FOUND);
    const out = await asFirm(req, f, () => openCode(f, String(req.params.code), pubReq(req), typeof req.query.flat === 'string' ? req.query.flat : null));
    if (out.miss) codeMiss(ip);
    res.set('Cache-Control', 'private, no-store');
    return res.json(out.body);
  } catch (err) { return shareFail(res, err); }
});

publicRouter.post('/s/:tenant/:code/interested', async (req: Request, res: Response) => {
  const ip = ipOf(req);
  if (!codeGate(ip) || !hit(`tap:${ip}`, 60, 60_000)) return slow(res, String(req.params.tenant));
  try {
    const f = await firmBySlug(String(req.params.tenant));
    if (!f) return res.status(404).json(NOT_FOUND);
    const out = await asFirm(req, f, () => interested(f, String(req.params.code), String(req.body?.propertyId || ''), pubReq(req)));
    if (!out) { codeMiss(ip); return res.status(404).json(NOT_FOUND); }
    return res.json(out);
  } catch (err) { return shareFail(res, err); }
});

publicRouter.post('/s/:tenant/:code/talk', async (req: Request, res: Response) => {
  const ip = ipOf(req);
  if (!codeGate(ip) || !hit(`talk:${ip}`, 30, 60_000)) return slow(res, String(req.params.tenant));
  try {
    const f = await firmBySlug(String(req.params.tenant));
    if (!f) return res.status(404).json(NOT_FOUND);
    const out = await asFirm(req, f, () => talk(f, String(req.params.code), pubReq(req)));
    if (out.miss) codeMiss(ip);
    return res.json({ waUrl: out.waUrl });
  } catch (err) { return shareFail(res, err); }
});

// ── The catalogue ───────────────────────────────────────────────────────────

publicRouter.get('/catalogue/:tenant', async (req: Request, res: Response) => {
  if (!hit(`cat:${ipOf(req)}`, 600, 60_000)) return slow(res, String(req.params.tenant));
  try {
    const f = await firmBySlug(String(req.params.tenant));
    if (!f) return res.status(404).json(NOT_FOUND);
    const q = req.query;
    const str = (v: any) => (typeof v === 'string' && v.trim() ? v.trim() : undefined);
    const out = await asFirm(req, f, () => catalogueList(f, {
      deal: str(q.deal), config: str(q.config), locality: str(q.locality), page: Number(q.page) || 1, limit: Number(q.limit) || 24,
    }, pubReq(req)));
    res.set('Cache-Control', 'private, no-store');
    return res.json(out);
  } catch (err) { return shareFail(res, err); }
});

publicRouter.post('/catalogue/:tenant/enquiry', async (req: Request, res: Response) => {
  const ip = ipOf(req);
  // Per address only as a flood ceiling (a shared carrier address is many
  // buyers); the real limits are per number (below) and the firm's daily cap.
  if (!hit(`enq:${ip}`, 10, 10 * 60_000)) return slow(res, String(req.params.tenant));
  try {
    const f = await firmBySlug(String(req.params.tenant));
    if (!f) return res.status(404).json(NOT_FOUND);
    const b = req.body || {};
    // THE HIDDEN FIELD. A person never sees `company`; a form-filling bot fills
    // every box. Answered exactly like a real enquiry, and nothing is made.
    if (String(b.company || b.website || '').trim()) return res.json({ ok: true });
    // Keyed by the exact number (docs/specs/phone.md); one that cannot be read
    // is refused by catalogueEnquiry before it reaches anything.
    const key = phoneKey(b.phone, (await localeOf(f.id)).country);
    if (key && !hit(`enq-phone:${f.id}:${key}`, 3, 60 * 60_000)) return slow(res, f.slug);
    const out = await asFirm(req, f, () => catalogueEnquiry(f, {
      name: b.name, phone: b.phone, propertyId: b.propertyId, message: b.message,
    }, pubReq(req)));
    return res.json(out);
  } catch (err) { return shareFail(res, err); }
});

publicRouter.get('/catalogue/:tenant/:slug', async (req: Request, res: Response) => {
  if (!hit(`cat:${ipOf(req)}`, 600, 60_000)) return slow(res, String(req.params.tenant));
  try {
    const f = await firmBySlug(String(req.params.tenant));
    if (!f) return res.status(404).json(NOT_FOUND);
    const out = await asFirm(req, f, () => catalogueFlat(f, String(req.params.slug), pubReq(req)));
    if (!out) return res.status(404).json(await goneBody(f));
    res.set('Cache-Control', 'private, no-store');
    return res.json(out);
  } catch (err) { return shareFail(res, err); }
});

/** A flat that is not there: the firm's card, its number and the catalogue, so the page is not a dead end. */
async function goneBody(f: Firm) {
  return { ...NOT_FOUND, firm: firmPublic(f, await localeOf(f.id)), cta: { phone: await firmPhone(f.id) }, catalogueUrl: await catalogueUrlOf(f) };
}

// ── The buyer forms (§A.6) ──────────────────────────────────────────────────

publicRouter.get('/forms/:tenant/slots', async (req: Request, res: Response) => {
  if (!hit(`cat:${ipOf(req)}`, 600, 60_000)) return slow(res, String(req.params.tenant));
  try {
    const f = await firmBySlug(String(req.params.tenant));
    if (!f) return res.status(404).json(NOT_FOUND);
    res.set('Cache-Control', 'private, no-store');
    return res.json(await slotsFor(f));
  } catch (err) { return shareFail(res, err); }
});

publicRouter.post('/forms/:tenant/ask', async (req: Request, res: Response) => {
  const ip = ipOf(req);
  // The catalogue form's limits: a flood ceiling per address (a carrier
  // address is many buyers), three an hour per number, and the firm's daily
  // cap in buyerAsks.ts. A code that resolves nothing spends the miss allowance.
  if (!hit(`ask:${ip}`, 10, 10 * 60_000) || (req.body?.code && !codeGate(ip))) return slow(res, String(req.params.tenant));
  try {
    const f = await firmBySlug(String(req.params.tenant));
    if (!f) return res.status(404).json(NOT_FOUND);
    const b = req.body || {};
    // The hidden field: a bot fills it, a person never sees it. Answered like a real ask.
    if (String(b.company || b.website || '').trim()) return res.json({ ok: true });
    const digits = String(b.phone || '').replace(/\D/g, '').slice(-10);
    if (digits.length === 10 && !hit(`ask-phone:${f.id}:${digits}`, 3, 60 * 60_000)) return slow(res, f.slug);
    const out = await asFirm(req, f, () => buyerAsk(f, {
      kind: b.kind, name: b.name, phone: b.phone, code: b.code, propertyId: b.propertyId,
      date: b.date, time: b.time, filters: b.filters,
    }, pubReq(req)));
    return res.json(out);
  } catch (err: any) {
    if (err instanceof ShareError && err.status === 404 && req.body?.code) codeMiss(ip);
    return shareFail(res, err);
  }
});

// ── Old photo links (§A.4) ──────────────────────────────────────────────────
// The photo link's own page is gone. A link already in a buyer's chat resolves
// here: a flat in the catalogue → `redirect` to its catalogue page; anything
// else, including a wrong code → "no longer available" and the catalogue.
publicRouter.get('/gallery/:slug/:ref', async (req: Request, res: Response) => {
  if (!hit(`s:${ipOf(req)}`, 120, 60_000)) return res.status(429).json(SLOW);
  try {
    const f = await firmBySlug(String(req.params.slug));
    if (!f) return res.status(404).json(NOT_FOUND);
    let propertyId: string | null = null;
    try { propertyId = (await resolveGallery(String(req.params.slug), String(req.params.ref)))?.propertyId || null; } catch { propertyId = null; }
    const out = propertyId ? await resolveOldPhotoLink(f, propertyId) : await resolveOldPhotoLink(f, '');
    res.set('Cache-Control', 'private, max-age=60');
    if (out.redirect) return res.json({ success: true, redirect: out.redirect });
    return res.status(404).json(await goneBody(f));
  } catch (err) { return shareFail(res, err); }
});

// ── THE LINK PREVIEW (Open Graph) ──────────────────────────────────────────
// WhatsApp, Facebook, Telegram and the rest build the card under a pasted link
// from <meta property="og:…"> in the page's HTML, and none of them runs
// JavaScript. The pages are a single-page app, so without this every link
// showed the same bare "Real Estate by Delpat" shell — or nothing.
//
// vercel.json sends /<firm>/<code>, /<firm>/homes[/<slug>] and the old
// /<firm>/photos/<ref> here when the user agent looks like a link-preview
// fetcher — a wide net (any "bot", "preview", HTTP library…), because every app
// that draws a card has its own name. A person caught by it is sent straight on
// with ?app=1, which the rule skips, so a wrong match costs one redirect, not
// the page. Same rules as the pages: publicFlat() decides what a flat shows.
// A preview fetch is never counted as an open.
export const shareRouter = Router();

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`;

interface Card { title: string; desc: string; image: string; iw: number; ih: number; jpeg: boolean; site: string }

/** The preview card's image for one flat: our collage (shareCard.ts), else its cover, else the firm's logo. */
async function flatCard(req: Request, f: Firm, row: any, projectShown: string): Promise<Pick<Card, 'image' | 'iw' | 'ih' | 'jpeg'>> {
  const apiBase = (process.env.PUBLIC_API_URL || `${req.protocol}://${req.get('host')}`).replace(/\/+$/, '');
  const media = (Array.isArray(row?.media) ? row.media : []).filter((x: any) => x && x.key);
  const photos = media.filter((m: any) => m.kind !== 'video');
  const videos = media.length - photos.length;
  const path = (k: string) => k.split('/').map(encodeURIComponent).join('/');
  const cdn = mediaCdn();
  const served = (k: string) => (cdn ? `${cdn}/${path(k)}` : `${apiBase}/files/${path(k)}`);
  const brand = f.brand || {};
  const card = row && media.length ? await ensureCard({
    tenantId: f.id, propertyId: row.id, firm: firmPublic(f).name, color: brand.primaryColor || null,
    logoData: typeof brand.logoUrl === 'string' && brand.logoUrl.startsWith('data:image/') ? brand.logoUrl : '',
    project: projectShown, photos: photos.map((m: any) => m.key), photoCount: photos.length, videoCount: videos,
  }) : null;
  if (card) return { image: served(card), iw: 1200, ih: 630, jpeg: true };
  if (photos[0]) return { image: served(photos[0].key), iw: Number(photos[0].w) || 0, ih: Number(photos[0].h) || 0, jpeg: true };
  return { image: brand.logoUrl ? `${apiBase}/pwa/${f.slug}/logo` : '', iw: 0, ih: 0, jpeg: false };
}

function sendCard(res: Response, c: Card, status = 200) {
  const meta = (p: string, v: unknown) => (v ? `<meta property="${p}" content="${esc(v)}">` : '');
  const name = (n: string, v: unknown) => (v ? `<meta name="${n}" content="${esc(v)}">` : '');
  res.set('Content-Type', 'text/html; charset=utf-8');
  // Crawlers cache the card themselves; ten minutes here keeps a re-share
  // cheap and lets a changed cover photo show up the same day.
  res.set('Cache-Control', 'public, max-age=600');
  // No og:url: the API cannot know the app's address, and an API address there
  // would be the one the apps open on tap. Without it they use the shared link.
  return res.status(status).send(`<!doctype html><html lang="en"><head><meta charset="utf-8">
<title>${esc(c.title)}</title>
${name('description', c.desc)}
${meta('og:type', 'website')}
${meta('og:site_name', c.site)}
${meta('og:title', c.title)}
${meta('og:description', c.desc)}
${meta('og:image', c.image)}
${c.image.startsWith('https:') ? meta('og:image:secure_url', c.image) : ''}
${c.image && c.jpeg ? meta('og:image:type', 'image/jpeg') : ''}
${c.iw ? meta('og:image:width', c.iw) : ''}
${c.ih ? meta('og:image:height', c.ih) : ''}
${meta('og:image:alt', c.title)}
${name('twitter:card', c.image ? 'summary_large_image' : 'summary')}
${name('twitter:title', c.title)}
${name('twitter:description', c.desc)}
${name('twitter:image', c.image)}
<script>(function(){var u=new URL(location.href);if(u.searchParams.has('app'))return;u.searchParams.set('app','1');location.replace(u.href)})()</script>
</head><body>${esc(c.title)}</body></html>`);
}

const mediaDesc = (row: any, firmName: string) => {
  const media = (Array.isArray(row?.media) ? row.media : []).filter((x: any) => x && x.key);
  const photos = media.filter((m: any) => m.kind !== 'video').length;
  const videos = media.length - photos;
  return [photos ? plural(photos, 'photo') : null, videos ? plural(videos, 'video') : null, firmName || null].filter(Boolean).join(' · ');
};

/** A card for one flat, as the catalogue or a link shows it. */
async function oneFlatCard(req: Request, res: Response, f: Firm, row: any, showProject: boolean) {
  const loc = await localeOf(f.id);
  const flat = publicFlat(row, { showPrice: false, showProject, loc });
  const firmName = firmPublic(f).name;
  const img = await flatCard(req, f, row, flat.project || flat.locality || flat.title);
  return sendCard(res, { title: flat.title, desc: mediaDesc(row, firmName), site: firmName, ...img });
}

/** The firm's own card: its name and logo, for a page that is not one flat. */
async function firmCard(req: Request, res: Response, f: Firm, title: string, desc: string, sampleRow: any | null, status = 200) {
  const firmName = firmPublic(f).name;
  const img = sampleRow ? await flatCard(req, f, sampleRow, title) : await flatCard(req, f, null, title);
  return sendCard(res, { title, desc, site: firmName, ...img }, status);
}

async function catalogueSample(f: Firm): Promise<{ n: number; row: any | null }> {
  const [{ n }] = await sql`SELECT count(*)::int AS n FROM crm_properties WHERE ${CATALOGUE_WHERE(f.id)}`;
  const [row] = await sql`
    SELECT ${SHOWN_COLUMNS} FROM crm_properties WHERE ${CATALOGUE_WHERE(f.id)}
       AND jsonb_array_length(coalesce(media, '[]'::jsonb)) > 0 ORDER BY created_at DESC LIMIT 1`;
  return { n, row: row || null };
}

const gone = (f: Firm) => ({ title: 'This home is no longer available', desc: `Homes from ${firmPublic(f).name}` });

shareRouter.get('/s/:slug/:code', async (req: Request, res: Response) => {
  // Behind the same gate as the page: the card resolves a code too. Every
  // unusable code, and a miss, gets the one firm card below.
  //
  // WHICH ADDRESS. A card request comes browser/bot → Vercel (external
  // rewrite) → Caddy → Express. Caddy (a bare reverse_proxy, no
  // trusted_proxies) does not trust an incoming X-Forwarded-For and sets it
  // to its own peer, so with trust proxy 1 req.ip is Vercel's egress address
  // for a card fetched through the app's domain, and the client's own address
  // for one fetched from the API directly. The address Vercel saw is not
  // recoverable safely: Vercel's egress range is not fixed, so a header
  // carrying it cannot be told from one a client typed when calling the API
  // directly. req.ip is therefore the key — unspoofable, but shared by many
  // buyers behind Vercel.
  //
  // So a spent budget does not refuse the card (that would let one prober
  // blank every preview on a shared egress address); it answers the firm's
  // card WITHOUT resolving the code, which teaches a prober nothing.
  const ip = ipOf(req);
  try {
    const f = await firmBySlug(String(req.params.slug));
    if (!f) return res.status(404).send('<!doctype html><title>Not found</title>');
    if (!codeGate(ip)) {
      res.set('Cache-Control', 'no-store');
      const name = firmPublic(f).name;
      return firmCard(req, res, f, `Homes from ${name}`, name, null);
    }
    const found = await resolveCode(f.id, String(req.params.code));
    const sharing = await sharingOf(f.id);
    // An unknown code is always a miss (see codeGate). Off, stopped or
    // expired is a miss too, except for a preview fetcher: those arrive
    // through Vercel, so `ip` is its shared egress address, and an expired
    // link forwarded around a few groups would spend every buyer's allowance
    // and blank their previews. The preview UA list also matches scripts
    // (curl, python), which is why unknown codes still spend: guessing stays
    // slow whatever the client calls itself.
    const usable = found && linkState(found.link, sharing.stopped) === 'active';
    if (!found || (!usable && !isPreviewFetcher(req.headers['user-agent'] as string))) codeMiss(ip);
    const firmName = firmPublic(f).name;
    const rows = found && linkState(found.link, sharing.stopped) === 'active' ? await linkRows(f.id, found.link) : [];
    const shown = found?.tap?.property_id ? rows.filter(r => r.id === found.tap.property_id) : rows;
    if (!shown.length) return firmCard(req, res, f, `Homes from ${firmName}`, firmName, null);
    if (shown.length === 1) return oneFlatCard(req, res, f, shown[0], true);
    const sample = shown.find(r => Array.isArray(r.media) && r.media.length) || null;
    return firmCard(req, res, f, `${plural(shown.length, 'home')} from ${firmName}`, firmName, sample);
  } catch (err: any) {
    console.warn('[share card] link failed:', err?.message);
    return res.status(500).send('<!doctype html><title>Homes</title>');
  }
});

shareRouter.get('/homes/:slug', async (req: Request, res: Response) => {
  try {
    const f = await firmBySlug(String(req.params.slug));
    if (!f) return res.status(404).send('<!doctype html><title>Not found</title>');
    const { n, row } = await catalogueSample(f);
    const firmName = firmPublic(f).name;
    return firmCard(req, res, f, `Homes from ${firmName}`, [n ? plural(n, 'home') : null, firmName].filter(Boolean).join(' · '), row);
  } catch (err: any) {
    console.warn('[share card] catalogue failed:', err?.message);
    return res.status(500).send('<!doctype html><title>Homes</title>');
  }
});

shareRouter.get('/homes/:slug/:flat', async (req: Request, res: Response) => {
  try {
    const f = await firmBySlug(String(req.params.slug));
    if (!f) return res.status(404).send('<!doctype html><title>Not found</title>');
    const s = String(req.params.flat || '').toLowerCase();
    const [row] = /^[a-z0-9-]{3,80}$/.test(s)
      ? await sql`SELECT ${SHOWN_COLUMNS} FROM crm_properties WHERE ${CATALOGUE_WHERE(f.id)} AND catalogue_slug = ${s} LIMIT 1`
      : [];
    const sharing = await sharingOf(f.id);
    if (!row) { const g = gone(f); return firmCard(req, res, f, g.title, g.desc, null, 404); }
    return oneFlatCard(req, res, f, row, sharing.catalogueShowsProject !== false);
  } catch (err: any) {
    console.warn('[share card] flat failed:', err?.message);
    return res.status(500).send('<!doctype html><title>Homes</title>');
  }
});

// The old photo link's card, resolved like the page (§A.4).
shareRouter.get('/gallery/:slug/:ref', async (req: Request, res: Response) => {
  try {
    const f = await firmBySlug(String(req.params.slug));
    if (!f) return res.status(404).send('<!doctype html><title>Not found</title>');
    let propertyId: string | null = null;
    try { propertyId = (await resolveGallery(String(req.params.slug), String(req.params.ref)))?.propertyId || null; } catch { propertyId = null; }
    const out = await resolveOldPhotoLink(f, propertyId || '');
    const sharing = await sharingOf(f.id);
    if (out.row) return oneFlatCard(req, res, f, out.row, sharing.catalogueShowsProject !== false);
    const g = gone(f);
    return firmCard(req, res, f, g.title, g.desc, null);
  } catch (err: any) {
    console.warn('[share card] photo link failed:', err?.message);
    return res.status(500).send('<!doctype html><title>Homes</title>');
  }
});
