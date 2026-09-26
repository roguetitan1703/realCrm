/**
 * ============================================================================
 * THE PHOTO LINK FOR A LISTING (7.5)
 * ============================================================================
 * A client should get a listing's photos in one tap, from WhatsApp, without
 * signing in:
 *
 *     /<firm slug>/photos/<project name>-<code>      e.g.
 *     /delpat/photos/lakeview-residency-4k2m9x7q1z0p
 *
 * The page shows the firm's name and logo, the project's name, and the photos
 * and videos. Nothing else: no price, no flat number, no owner (the user's
 * call, 26 Sep). This file decides what is sent, so the page cannot show more.
 *
 * THE CODE IS A SIGNATURE, NOT A STORED TOKEN: an HMAC over the firm, the
 * listing and a version, keyed by the server's secret, in 12 base-36
 * characters (about 60 bits). Every listing with a photo has a link the moment
 * it has a photo, nothing is written to create one, and it cannot be guessed.
 * The project name in the address is for people reading it; the code alone
 * finds the listing, among that firm's listings with photos. Turning the link
 * off is `gallery_off`; replacing it (the old one stops) bumps `gallery_version`.
 * ============================================================================
 */
import crypto from 'crypto';
import { sql } from './db.js';

function secret(): string {
  const s = process.env.JWT_SECRET;
  if (!s) throw new Error('JWT_SECRET is not set; refusing to sign photo links with a default.');
  return s;
}

const CODE_LEN = 12;
function code(tenantId: string, propertyId: string, version: number): string {
  const hex = crypto.createHmac('sha256', secret())
    .update(`gallery|${tenantId}|${propertyId}|${version || 0}`).digest('hex');
  return BigInt('0x' + hex.slice(0, 15)).toString(36).padStart(CODE_LEN, '0').slice(-CODE_LEN);
}

/** "Lakeview Residency" → "lakeview-residency". Only for reading. */
function words(name: string): string {
  return String(name || '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '').slice(0, 48).replace(/-+$/, '') || 'photos';
}

const projectOf = (row: any) => row.project || row.config?.society || '';

/** The path of a listing's photo link, or null when it has none to show. */
export function galleryPath(row: any): string | null {
  if (!row || row.gallery_off) return null;
  if (!Array.isArray(row.media) || row.media.length === 0) return null;
  // The firm's slug is its id (provisionTenant makes them the same).
  return `/${row.tenant_id}/photos/${words(projectOf(row))}-${code(row.tenant_id, row.id, row.gallery_version || 0)}`;
}

const safeEq = (a: string, b: string) => a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));

/**
 * What a client may see, for a link. Null for a link that is wrong, turned
 * off, replaced, or for a listing with no photos: all of them answer "this link
 * does not work", and none says which.
 */
export async function publicGallery(slug: string, ref: string): Promise<any | null> {
  const m = new RegExp(`^[a-z0-9-]*?-?([a-z0-9]{${CODE_LEN}})$`).exec(String(ref || '').toLowerCase());
  if (!m || !/^[a-z0-9-]{1,64}$/.test(String(slug || ''))) return null;
  const want = m[1];
  const [t] = await sql`SELECT id, name, slug, brand_config FROM tenants WHERE slug = ${slug} OR id = ${slug} LIMIT 1`;
  if (!t) return null;
  // The firm's listings that have a link at all; the code picks one.
  const rows = await sql`
    SELECT id, tenant_id, project, config, media, gallery_version FROM crm_properties
     WHERE tenant_id = ${t.id} AND coalesce(gallery_off, FALSE) = FALSE
       AND jsonb_array_length(coalesce(media, '[]'::jsonb)) > 0`;
  const row = (rows as any[]).find(r => safeEq(want, code(r.tenant_id, r.id, r.gallery_version || 0)));
  if (!row) return null;
  const media = (Array.isArray(row.media) ? row.media : []).filter((x: any) => x && x.key)
    .map((x: any) => ({ key: x.key, kind: x.kind === 'video' ? 'video' : 'photo' }));
  if (!media.length) return null;
  const brand = t.brand_config || {};
  return {
    firm: {
      name: brand.firmName || t.name || '',
      // Served by /pwa/<slug>/logo, the same place the app's own icon comes from.
      logoUrl: brand.logoUrl ? `/pwa/${t.slug || t.id}/logo` : '',
      color: brand.primaryColor || null,
    },
    project: projectOf(row),
    media,
  };
}
