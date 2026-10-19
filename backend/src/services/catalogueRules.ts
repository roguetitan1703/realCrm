/**
 * WHAT IS LIVE IN THE CATALOGUE — one predicate, read by the public pages
 * (sharing.ts) and by Show in catalogue's counts (store.ts setCatalogue), so
 * "2 live" in the desk's toast and the flats a buyer sees cannot disagree.
 *
 * A flat is LIVE when it is ticked and Available (no status reads as
 * Available). Ticked but not Available is WAITING: it appears when it is.
 * HAS_PHOTO: at least one item that is not a video.
 */
import { sql } from './db.js';

/** SQL on a crm_properties row: Available (the catalogue's status rule). */
export const IS_AVAILABLE = sql`coalesce(status, 'Available') ILIKE 'available'`;

/** SQL on a crm_properties row: has a photo (a video alone does not count). */
export const HAS_PHOTO = sql`EXISTS (SELECT 1 FROM jsonb_array_elements(coalesce(media, '[]'::jsonb)) m WHERE m->>'kind' IS DISTINCT FROM 'video')`;

/** SQL: this firm's live catalogue flats. */
export const CATALOGUE_WHERE = (tenantId: string) =>
  sql`tenant_id = ${tenantId} AND in_catalogue = TRUE AND ${IS_AVAILABLE}`;
