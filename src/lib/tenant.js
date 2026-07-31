// ============================================================================
// 🏢 TENANT IDENTITY — the signed-in firm, readable outside React
// ============================================================================
// Message templates, share text and owner updates all need the firm's name and
// city. They are generated in plain modules (lib/matching.js) and in components
// that don't take the store, so before this existed they fell back to the
// BUNDLED DEMO BRAND — which is how a client received "Skyline Realty" at the
// bottom of a message sent by a different firm entirely.
//
// One holder, written by the store whenever tenant settings change, read
// everywhere else. Empty until a tenant is resolved — and empty must render as
// nothing, never as a placeholder firm.
// ============================================================================

let current = { firmName: '', city: '' }

export function setTenantIdentity(next = {}) {
  current = {
    firmName: next.firmName ?? current.firmName ?? '',
    city: next.city ?? current.city ?? '',
  }
}

export function firmName() { return current.firmName || '' }
export function city() { return current.city || '' }

/** `" — Bhumi Propcity"` or `''`. For signing off a message without leaving a
 *  dangling dash when no firm is resolved yet. */
export function signOff() {
  return current.firmName ? `— ${current.firmName}` : ''
}

/** Joins the parts of a phrase that has optional pieces, e.g. a locality that
 *  may be unknown, without emitting "in ." or a doubled separator. */
export function phrase(...parts) {
  return parts.filter(p => p != null && String(p).trim() !== '').join(' ').replace(/\s+/g, ' ').trim()
}
