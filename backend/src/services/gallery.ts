/**
 * ============================================================================
 * THE PHOTO LINK FOR A LISTING (7.5)
 * ============================================================================
 * A client should get a listing's photos in one tap, from WhatsApp, without
 * signing in: `/g/<property id>.<signature>`, a plain page with the firm's name
 * and logo, the photos and videos, and the facts a client may see.
 *
 * WHY A SIGNATURE AND NOT A STORED TOKEN. Every listing with a photo has a link
 * the moment it has a photo, so a share message can always carry it; nothing
 * is created, and there is no "make a link first" step. The signature is an
 * HMAC over the firm, the listing and a version number, keyed by the server's
 * secret, so it cannot be guessed from the id. Turning the link off is
 * `gallery_off`; replacing it (the old link stops working) bumps
 * `gallery_version`.
 *
 * WHAT A CLIENT SEES is an ALLOW-list built here (publicGallery), never the row:
 * no owner, no flat number, no key location, no internal notes. The browser's
 * NEVER_SHARED_FIELDS (src/lib/matching.js) is the same rule for messages.
 * ============================================================================
 */
import crypto from 'crypto';
import { sql } from './db.js';

function secret(): string {
  const s = process.env.JWT_SECRET;
  if (!s) throw new Error('JWT_SECRET is not set; refusing to sign photo links with a default.');
  return s;
}

function sign(tenantId: string, propertyId: string, version: number): string {
  return crypto.createHmac('sha256', secret())
    .update(`gallery|${tenantId}|${propertyId}|${version || 0}`)
    .digest('base64url').slice(0, 22);
}

/** The path of a listing's photo link, or null when it has none to show. */
export function galleryPath(row: any): string | null {
  if (!row || row.gallery_off) return null;
  if (!Array.isArray(row.media) || row.media.length === 0) return null;
  return `/g/${row.id}.${sign(row.tenant_id, row.id, row.gallery_version || 0)}`;
}

const safeEq = (a: string, b: string) => a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));

/**
 * What a client may see, for a link. Null for a link that is wrong, turned
 * off, replaced, or for a listing with no photos: all of them answer "this link
 * does not work", and none says which.
 */
export async function publicGallery(ref: string): Promise<any | null> {
  const m = /^([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]{22})$/.exec(String(ref || ''));
  if (!m) return null;
  const [, id, sig] = m;
  const [row] = await sql`SELECT * FROM crm_properties WHERE id = ${id} LIMIT 1`;
  if (!row || row.gallery_off) return null;
  if (!safeEq(sig, sign(row.tenant_id, row.id, row.gallery_version || 0))) return null;
  const media = (Array.isArray(row.media) ? row.media : []).filter((x: any) => x && x.key)
    .map((x: any) => ({ key: x.key, kind: x.kind === 'video' ? 'video' : 'photo' }));
  if (!media.length) return null;

  const [t] = await sql`SELECT name, slug, brand_config FROM tenants WHERE id = ${row.tenant_id} LIMIT 1`;
  const brand = t?.brand_config || {};
  const cfg = row.config || {};
  return {
    firm: {
      name: brand.firmName || t?.name || '',
      // Served by /pwa/<slug>/logo, the same place the app's own icon comes from.
      logoUrl: brand.logoUrl ? `/pwa/${t?.slug || row.tenant_id}/logo` : '',
      color: brand.primaryColor || null,
    },
    listing: {
      name: row.project || cfg.society || '',
      locality: row.locality || '',
      deal: row.deal || cfg.deal || null,
      bhk: row.bhk || null,
      subtype: row.subtype || null,
      category: row.category || null,
      type: row.type || null,
      price: row.price_amount != null ? Number(row.price_amount) : null,
      priceLabel: cfg.priceLabel || null,
      carpet: row.carpet_sqft != null ? Number(row.carpet_sqft) : null,
      areaUnit: row.area_unit || 'sqft',
      floor: row.floor || null,
      totalFloors: row.total_floors != null ? Number(row.total_floors) : null,
      furnishType: row.furnish_type || null,
      facing: row.facing || null,
      possession: row.possession || null,
      amenities: Array.isArray(row.society_amenities) ? row.society_amenities : [],
      description: row.description || null,
    },
    media,
  };
}
