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
export const PLATFORM = {
  name: 'Real Estate',
  initials: 'RE',
  vendor: 'Delpat',
  kind: 'CRM',
  tagline: 'White-label CRM for real estate desks',
  host: 'realestate.delpat.in',
  // Browser tab title before a workspace is selected.
  docTitle: 'Real Estate by Delpat',
  version: 'v2.4.0',
}

/** Browser tab title for a signed-in / selected tenant. */
export function tenantDocTitle(firmName) {
  return firmName ? `${firmName} · CRM` : PLATFORM.docTitle
}

/**
 * Workspaces this browser can jump straight into. Seeded with the live demo
 * tenant so the owner taps once instead of typing his own firm name — and so
 * the field reads as a real workspace picker, not a decorative input.
 */
export const KNOWN_WORKSPACES = [
  { slug: 'bhumipropcity', tenantId: 'bhumi-propcity', firmName: 'Bhumi Propcity', city: 'Pune', initials: 'BP' },
]

/** Normalize whatever was typed ("Bhumi Propcity", "app.bhumipropcity.com") to a slug. */
export function normalizeSlug(input) {
  return String(input || '')
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^app\./, '')
    .replace(/\.com.*$/, '')
    .replace(/[^a-z0-9-]/g, '')
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
