/**
 * ============================================================================
 * THE SHORT CODES IN /<firm>/<code>, AND WHAT HAPPENS TO LINKS WHEN A LEAD GOES
 * ============================================================================
 * One code space per firm for TWO kinds of thing: a shared link
 * (crm_share_links.code) and an "I'm interested" tap (crm_share_events.code).
 * The address /<firm>/<code> resolves either, so a code is checked against
 * both tables before it is handed out; each table's unique index is the last
 * word on a race.
 *
 * Six characters from 31: lowercase letters and digits without the ones that
 * read as each other (0/o, 1/l/i). About 887 million codes per firm, looked up
 * through a rate limit (routes/public.ts), so guessing one is not a plan.
 *
 * A code is never a word the app routes on. Every second path segment the app
 * or vercel.json answers today is listed below, plus the screen names, so a
 * future /<firm>/agents cannot collide with a code already sent to a buyer.
 * Only db.ts is imported: store.ts calls the lead hooks at the bottom, and a
 * cycle through it would be one more thing to reason about.
 * ============================================================================
 */
import crypto from 'crypto';
import { sql } from './db.js';

export const CODE_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';
export const CODE_LEN = 6;
export const CODE_RE = new RegExp(`^[${CODE_ALPHABET}]{${CODE_LEN}}$`);

/**
 * Words that are, or may become, routes under /<firm>/. From vercel.json
 * (privacy, terms, data-deletion, pwa, sw.js, photos), the app (admin, reset,
 * homes, the screens nav.js goes to) and the API's own top-level paths.
 * Most cannot be produced by the alphabet anyway; the list is the rule, not
 * the arithmetic.
 */
export const ROUTE_WORDS = new Set([
  'privacy', 'terms', 'data-deletion', 'pwa', 'sw.js', 'photos', 'homes', 'admin', 'reset',
  'login', 'logout', 'signin', 'signup', 'share', 'files', 'docs', 'api', 'health', 'legal',
  'manifest', 'icon', 'logo', 'help', 'support', 'embed',
  'calling', 'clients', 'import', 'integrations', 'leads', 'me', 'performance', 'properties',
  'settings', 'team', 'today', 'owners', 'agents', 'search', 'alerts', 'inbox', 'links', 'mylinks',
  'catalog', 'catalogue', 'gallery', 'reports', 'deals', 'tasks', 'visits', 'calendar',
]);

const randomCode = (): string => {
  const bytes = crypto.randomBytes(CODE_LEN);
  let out = '';
  for (let i = 0; i < CODE_LEN; i++) out += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  return out;
};

/** A code free in this firm across links and taps. Throws after 20 collisions (never expected). */
export async function freshCode(tenantId: string): Promise<string> {
  for (let i = 0; i < 20; i++) {
    const c = randomCode();
    if (ROUTE_WORDS.has(c)) continue;
    const [hit] = await sql`
      SELECT 1 FROM crm_share_links WHERE tenant_id = ${tenantId} AND code = ${c}
      UNION ALL
      SELECT 1 FROM crm_share_events WHERE tenant_id = ${tenantId} AND code = ${c}
      LIMIT 1`;
    if (!hit) return c;
  }
  throw new Error('Could not find a free share code');
}

/** A random suffix for a catalogue slug, same alphabet. */
export const slugSuffix = randomCode;

// ── What a link does when its lead changes ─────────────────────────────────

/** Merged: the links, their events and the devices follow the surviving lead. */
export async function shareLeadMerged(tenantId: string, fromLeadId: string, toLeadId: string): Promise<void> {
  await sql`UPDATE crm_share_links SET lead_id = ${toLeadId} WHERE tenant_id = ${tenantId} AND lead_id = ${fromLeadId}`;
  await sql`UPDATE crm_share_events SET lead_id = ${toLeadId} WHERE tenant_id = ${tenantId} AND lead_id = ${fromLeadId}`;
  await sql`UPDATE crm_share_devices SET lead_id = ${toLeadId} WHERE tenant_id = ${tenantId} AND lead_id = ${fromLeadId}`;
}

/**
 * Deleted: its links turn off (spec §A.1), and its devices are let go so the
 * next number from that browser starts clean. Events keep their lead id: they
 * are history, and a deleted lead's id names nobody.
 */
export async function shareLeadsDeleted(tenantId: string, leadIds: string[], actorId: string | null): Promise<void> {
  if (!leadIds.length) return;
  await sql`
    UPDATE crm_share_links SET turned_off_at = NOW(), turned_off_by = ${actorId}
     WHERE tenant_id = ${tenantId} AND lead_id IN ${sql(leadIds)} AND turned_off_at IS NULL`;
  await sql`DELETE FROM crm_share_devices WHERE tenant_id = ${tenantId} AND lead_id IN ${sql(leadIds)}`;
}
