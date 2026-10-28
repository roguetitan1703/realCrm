// A TAB THAT OUTLIVES A DEPLOY. A desk left open for days, or the installed
// app on an agent's phone, keeps running the build it loaded: every fix shipped
// since is missing on that screen, and nothing tells anyone. Each build writes
// /version.json (vite.config.js `build-version`); the desk's pulse asks for it
// now and then, and when a newer build is live the page reloads itself — but
// only at a moment that loses nothing (safeToReload). Otherwise it waits and
// the next check tries again.

/* global __BUILD_ID__ */
const BUILD = typeof __BUILD_ID__ !== 'undefined' ? __BUILD_ID__ : 'dev'
const EVERY = 5 * 60 * 1000
const RELOADED_FOR = 'build-reload-for'

let newer = null      // the live build id, once it differs from ours
let lastCheck = 0

/** Text typed into any field on screen. Shared with main.jsx's chunk-error reload. */
export function somethingTyped() {
  return [...document.querySelectorAll('input:not([type=hidden]):not([type=checkbox]):not([type=radio]), textarea')]
    .some(el => el.value && el.value.trim())
}

/** Nothing a reload would throw away: no dialog or sheet open, nothing typed, no save in the air. */
function safeToReload(pendingWrites) {
  if (pendingWrites) return false
  if (document.querySelector('.overlay')) return false
  return !somethingTyped()
}

async function liveBuild() {
  try {
    const res = await fetch('/version.json', { cache: 'no-store' })
    if (!res.ok) return null
    const v = await res.json()
    return typeof v?.build === 'string' ? v.build : null
  } catch { return null }
}

/**
 * Called from the desk's pulse. `force` (the tab was just looked at again)
 * skips the interval. Reloads only when it is safe and only once per target
 * build, so a host still serving the old page cannot loop it.
 */
export async function reloadIfNewBuild({ force = false, pendingWrites = false } = {}) {
  if (BUILD === 'dev') return
  if (!newer) {
    if (!force && Date.now() - lastCheck < EVERY) return
    lastCheck = Date.now()
    const live = await liveBuild()
    if (!live || live === BUILD) return
    newer = live
  }
  if (!safeToReload(pendingWrites)) return
  try {
    if (sessionStorage.getItem(RELOADED_FOR) === newer) return
    sessionStorage.setItem(RELOADED_FOR, newer)
  } catch { return }
  window.location.reload()
}
