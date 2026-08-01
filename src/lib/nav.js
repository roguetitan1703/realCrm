// ============================================================================
// 🧭 Navigation ↔ URL
// ============================================================================
// Screen and selection used to live only in React state, which meant the app
// had exactly one URL. Three consequences, all of which read as bugs:
//
//   • Reloading anywhere put you back on the dashboard, losing the record you
//     were reading.
//   • The browser/Android back button had nothing of ours to go back THROUGH,
//     so from any screen it left the app entirely.
//   • A link to a record could not be shared, and a push notification's deep
//     link only worked because it was parsed once at boot.
//
// So navigation state is mirrored into the query string, and the query string
// is the thing that is read on load. One parser, one writer, shared by the desk
// and the phone so the two chromes can never disagree about where you are.

// Every flag that makes a screen render something OTHER than its list.
export const TAKEOVER_KEYS = [
  'leadOpen', 'leadId', 'propOpen', 'propId', 'propAdd', 'propProject', 'projOpen', 'projKey',
]

/** Read screen + selection out of the current URL. */
export function parseUrl(search = window.location.search) {
  const p = new URLSearchParams(search)
  const lead = p.get('lead')
  const prop = p.get('prop')
  const project = p.get('project')
  return {
    screen: p.get('screen') || null,
    sel: {
      leadId: lead || undefined, leadOpen: !!lead,
      propId: prop || undefined, propOpen: !!prop,
      projKey: project || undefined, projOpen: !!project,
      propAdd: p.get('new') === 'property' || undefined,
      contactsTab: p.get('tab') || undefined,
    },
    // Not navigation, but they ride the same query string and must survive it.
    ws: p.get('ws') || null,
    forceLogin: p.has('autologin') || p.has('demo'),
    role: p.get('role') || null,
  }
}

/** Build the query string for a screen + selection. */
export function urlFor(screen, sel = {}, search = window.location.search) {
  const cur = new URLSearchParams(search)
  const p = new URLSearchParams()
  // Carry the things that identify the session, not the page.
  for (const k of ['ws', 'autologin', 'demo', 'role']) {
    if (cur.has(k)) p.set(k, cur.get(k))
  }
  if (screen) p.set('screen', screen)
  if (sel.leadOpen && sel.leadId) p.set('lead', sel.leadId)
  if (sel.propOpen && sel.propId) p.set('prop', sel.propId)
  if (sel.projOpen && sel.projKey) p.set('project', sel.projKey)
  if (sel.propAdd) p.set('new', 'property')
  if (sel.contactsTab) p.set('tab', sel.contactsTab)
  const q = p.toString()
  return q ? `?${q}` : window.location.pathname
}

/** Is this the app's root — a top-level screen with no record taken over it? */
export function isRoot(screen, sel = {}, home) {
  if (screen !== home) return false
  return !TAKEOVER_KEYS.some(k => sel[k])
}

/** Running as an installed app rather than a browser tab. */
export function isStandaloneApp() {
  if (typeof window === 'undefined') return false
  return window.matchMedia?.('(display-mode: standalone)')?.matches
    || window.matchMedia?.('(display-mode: fullscreen)')?.matches
    || window.matchMedia?.('(display-mode: minimal-ui)')?.matches
    || window.navigator.standalone === true
}
