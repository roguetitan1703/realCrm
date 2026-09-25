// ============================================================================
// A SUPPORT VIEW — Delpat looking at a firm's desk, read only
// ============================================================================
// Opened from the superadmin console (routes/admin.ts /firms/:id/support): a
// two-hour token as the firm's owner that the server refuses every write for.
//
// IT LIVES IN THIS TAB ONLY. The console opens `/<slug>/#support=<payload>`;
// this reads the fragment (never sent to a server), keeps it in THIS tab's
// sessionStorage, and removes it from the address bar. So the operator's own
// sign-in to the same firm, in localStorage, is never read, replaced or signed
// out by it, and closing the tab ends it here.
//
// No imports: api.js reads this to choose the token, and a cycle there would
// load one of them half-initialised.

const key = (tenant) => `crm_support_${tenant}`

/** The support view for this workspace in this tab, or null. Expired is null. */
export function readSupport(tenant) {
  if (!tenant || typeof window === 'undefined') return null
  try {
    const raw = window.sessionStorage.getItem(key(tenant))
    if (!raw) return null
    const s = JSON.parse(raw)
    if (!s?.token || (s.expiresAt && new Date(s.expiresAt) <= new Date())) {
      window.sessionStorage.removeItem(key(tenant))
      return null
    }
    return s
  } catch { return null }
}

/** Take a support view handed over in the URL fragment, once, at start-up. */
export function captureSupport() {
  if (typeof window === 'undefined') return
  const m = /^#support=([A-Za-z0-9_-]+)$/.exec(window.location.hash || '')
  if (!m) return
  try {
    const json = decodeURIComponent(escape(window.atob(m[1].replace(/-/g, '+').replace(/_/g, '/'))))
    const s = JSON.parse(json)
    if (s?.slug && s?.token) window.sessionStorage.setItem(key(s.slug), JSON.stringify(s))
  } catch { /* a bad fragment is ignored; the tab opens signed out */ }
  window.history.replaceState(window.history.state, '', window.location.pathname + window.location.search)
}

/** The fragment the console opens a desk with. */
export function supportFragment(s) {
  const b64 = window.btoa(unescape(encodeURIComponent(JSON.stringify(s))))
  return `#support=${b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')}`
}

export function endSupport(tenant) {
  try { window.sessionStorage.removeItem(key(tenant)) } catch { /* nothing to clear */ }
}
