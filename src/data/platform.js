/**
 * PLATFORM identity — what the product is BEFORE a tenant is chosen.
 *
 * `theme.brand` (data/theme.js) is the *tenant's* identity: Bhumi Propcity.
 * This is the *platform's* identity: the white-label engine that Bhumi's desk
 * runs on. Keeping them separate is the whole point — a visitor who has not
 * picked a workspace yet must never see someone else's brand, or the identity
 * of the product gets confused with the identity of one customer.
 *
 * Rule of thumb: pre-workspace surfaces (login step 1, onboarding) use PLATFORM.
 * Everything after a workspace is chosen uses the tenant brand.
 */
import pkg from '../../package.json'

export const PLATFORM = {
  name: 'Real Estate',
  initials: 'RE',
  vendor: 'Delpat',
  kind: 'CRM',
  host: 'realestate.delpat.in',
  // Browser tab title before a workspace is selected.
  docTitle: 'Real Estate by Delpat',
  // Real, single-source version — comes from package.json, never hand-typed.
  version: `v${pkg.version}`,
}

/** Browser tab title for a signed-in / selected tenant. */
export function tenantDocTitle(firmName) {
  return firmName ? `${firmName} · CRM` : PLATFORM.docTitle
}

/**
 * Workspaces THIS browser has actually opened before — read from localStorage,
 * not a hardcoded demo list. A fresh device shows none until the first sign-in.
 */
const RECENTS_KEY = 'crm_recent_workspaces'

export function recentWorkspaces() {
  try {
    const v = JSON.parse(window.localStorage?.getItem(RECENTS_KEY) || '[]')
    return Array.isArray(v) ? v.filter(w => w && w.tenantId && w.firmName) : []
  } catch { return [] }
}

/** Record a workspace the user successfully opened, most-recent first (max 4). */
export function rememberWorkspace(ws) {
  if (!ws?.tenantId) return
  try {
    const next = [{ slug: ws.slug, tenantId: ws.tenantId, firmName: ws.firmName, initials: ws.initials, city: ws.city || '' },
      ...recentWorkspaces().filter(w => w.tenantId !== ws.tenantId)].slice(0, 4)
    window.localStorage?.setItem(RECENTS_KEY, JSON.stringify(next))
  } catch { /* storage blocked */ }
}

// No hardcoded workspaces — resolution goes through the backend resolver, which
// is hyphen-insensitive, so a typed name maps to the real tenant regardless.
export const KNOWN_WORKSPACES = []

/** Normalize whatever was typed ("Skyline Realty", "app.skylinerealty.in") to a
 *  slug. MUST match the slug the backend mints at onboarding
 *  (firmName.replace(/[^a-z0-9]+/g,'-')) so a firm typed by name resolves to its
 *  real tenant id — e.g. "Meridian Estates" -> "meridian-estates", not
 *  "meridianestates". The backend resolve is also hyphen-insensitive as a
 *  belt-and-braces match. */
export function normalizeSlug(input) {
  return String(input || '')
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^app\./, '')
    .replace(/\.(com|in|co|net|org).*$/, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/** Resolve a typed workspace to its brand. Unknown slugs still resolve — titled from the slug. */
export function resolveWorkspace(input) {
  const slug = normalizeSlug(input)
  if (!slug) return null
  const known = KNOWN_WORKSPACES.find(w => w.slug === slug || w.tenantId === slug)
  if (known) return known
  const firmName = slug.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
  return {
    slug,
    tenantId: slug,
    firmName,
    city: '',
    initials: firmName.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase(),
  }
}
