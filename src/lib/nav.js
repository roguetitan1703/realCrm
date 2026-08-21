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
// Keys a navigation CLEARS unless it sets them itself. Anything left here
// survives every later trip through the app, because `sel` is one object that
// screens read on mount — so a tile tapped once would otherwise still be
// filtering the book an hour later with no chip on screen to explain it.
import { currentTenant } from './api.js'

export const TAKEOVER_KEYS = [
  'leadOpen', 'leadId', 'ownerOpen', 'ownerId', 'propOpen', 'propId', 'propAdd', 'propProject', 'projOpen', 'projKey',
  'leadFilters', 'ownerSeg', 'ownerStage',
]

// Opening a record is not leaving the screen.
//
// `go()` clears every takeover key a navigation does not set, which is right
// for moving between screens and wrong for opening a row: the filter went with
// it, and `<Leads>` swaps the whole list component out for the record, so the
// list's own state was destroyed at the same moment. Come back and you had a
// full unfiltered book. These are the keys that mean "a record took the screen
// over", and a navigation made only of them keeps the filters underneath.
export const RECORD_KEYS = [
  'leadOpen', 'leadId', 'ownerOpen', 'ownerId', 'propOpen', 'propId', 'propAdd', 'projOpen', 'projKey',
]

// ── One filter bag, in the URL ──────────────────────────────────────────────
// Every screen that filters had its own private useState for it, so a filter
// was invisible to the URL, to history, to a reload and to the component the
// moment it unmounted. Worse, the dashboard navigated with keys the list did
// not read: `{ stage: [...] }` went into a bag nothing forwarded to the API and
// no chip rendered, so clicking a stage on the dashboard did NOTHING. It is one
// object now, and it lives in the query string, which is the only place that
// survives all four.
const FILTER_SCALARS = ['seg', 'intent', 'stage', 'sortKey', 'sortDir']
const FILTER_LISTS = ['source', 'locality', 'agent', 'flag']

function readFilters(p) {
  const f = {}
  for (const k of FILTER_SCALARS) { const v = p.get(k); if (v) f[k] = v }
  for (const k of FILTER_LISTS) { const v = p.getAll(k); if (v.length) f[k] = v }
  return Object.keys(f).length ? f : undefined
}

function writeFilters(p, f) {
  if (!f) return
  for (const k of FILTER_SCALARS) if (f[k] && f[k] !== 'all') p.set(k, f[k])
  for (const k of FILTER_LISTS) for (const v of (f[k] || [])) p.append(k, v)
}

/** Read screen + selection out of the current URL. */
export function parseUrl(search = window.location.search) {
  const p = new URLSearchParams(search)
  const lead = p.get('lead')
  const owner = p.get('owner')
  const prop = p.get('prop')
  const project = p.get('project')
  return {
    screen: p.get('screen') || null,
    sel: {
      leadId: lead || undefined, leadOpen: !!lead,
      ownerId: owner || undefined, ownerOpen: !!owner,
      propId: prop || undefined, propOpen: !!prop,
      projKey: project || undefined, projOpen: !!project,
      propAdd: p.get('new') === 'property' || undefined,
      contactsTab: p.get('tab') || undefined,
      leadFilters: readFilters(p),
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
  if (sel.ownerOpen && sel.ownerId) p.set('owner', sel.ownerId)
  if (sel.propOpen && sel.propId) p.set('prop', sel.propId)
  if (sel.projOpen && sel.projKey) p.set('project', sel.projKey)
  if (sel.propAdd) p.set('new', 'property')
  if (sel.contactsTab) p.set('tab', sel.contactsTab)
  writeFilters(p, sel.leadFilters)
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

// ── A record id belongs to the workspace it was opened in ───────────────────
// The workspace lives in the PATH and the open record lives in the QUERY, so
// they travel independently: edit `/delpat?screen=leads&lead=l_17…` down to
// `?screen=leads&lead=l_17…`, sign in somewhere else, and that other firm's
// desk opens a lead id it has never held. It 404s and says "This lead no
// longer exists", which is not what happened — the lead exists, it is not
// theirs. Ids carry no tenant (`l_<ts>_<rand>`), so nothing can tell a foreign
// id from a deleted one by looking at it.
//
// So the TAB remembers which workspace it was last navigating in, and a boot
// that lands somewhere else drops the record. Tab-scoped on purpose: a push
// notification opens a fresh tab with no stamp, and its deep link still works.
const NAV_WS = 'crm_nav_ws'

/** Called on every URL the desk writes, so the stamp is always the workspace
 *  the person was actually reading records in — never one merely visited. */
export function stampNavWorkspace() {
  try { window.sessionStorage?.setItem(NAV_WS, currentTenant()) } catch (e) {}
}

/** parseUrl(), minus any record this workspace has no claim to. */
export function bootNav(search = window.location.search) {
  const at = parseUrl(search)
  let prev = null
  try { prev = window.sessionStorage?.getItem(NAV_WS) ?? null } catch (e) { prev = null }
  if (prev !== null && prev !== currentTenant()) {
    for (const k of TAKEOVER_KEYS) at.sel[k] = undefined
    at.sel.leadOpen = false
    at.sel.ownerOpen = false
    at.sel.propOpen = false
    at.sel.projOpen = false
  }
  return at
}
