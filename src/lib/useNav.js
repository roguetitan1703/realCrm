import { useState, useRef, useEffect, useCallback } from 'react'
import { parseUrl, bootNav, stampNavWorkspace, urlFor, isRoot, isStandaloneApp, TAKEOVER_KEYS, RECORD_KEYS } from './nav.js'
import { currentTenant } from './api.js'

// ── What each history entry carries ─────────────────────────────────────────
// `depth`  how many of OUR places sit under this one in this tab. The floor and
//          its spare copy are 0. Back can only be handed to the browser above
//          0: below it is a deep link, a fresh tab, or another site.
// `ws`     the workspace the entry was written in. A tab that signs into a
//          second firm keeps the first firm's entries underneath.
// `scroll` where the scrollers stood when this place was left for another.
// `keep`   list state that is not a filter (page, grouping) — see useKept().
// Every write goes through writeEntry so `entry` mirrors the entry we are on;
// the overlay guard has to put back an entry it has already been popped off.
let entry = null
const readEntry = () => window.history.state || {}
function writeEntry(state, url, push) {
  const next = { ...state, nav: true, ws: currentTenant() }
  if (push) window.history.pushState(next, '', url)
  else window.history.replaceState(next, '', url)
  entry = next
}

// The entry being returned to, between a popstate and the screen it names
// mounting. useKept reads it then and only then: a screen arrived at fresh
// must not inherit the page its last visit was left on.
let restoring = null

/** Can the in-app back arrow hand this press to the browser? */
export function canStepBack() {
  const s = readEntry()
  return Boolean(s.nav && s.depth > 0 && s.ws === currentTenant())
}

// ── Scroll ──────────────────────────────────────────────────────────────────
// The shell owns the scrollers: `.m-body` on a phone, `.app-body` (and a list's
// `.ll-content`) on the desk. They outlive the screens inside them, so a list
// scrolled to row 60 handed its offset to the record opened from it, and back
// found the list re-fetched and sitting at the top.
const SCROLLERS = '.m-body, .app-body, .ll-content'
const readScroll = () => [...document.querySelectorAll(SCROLLERS)].map(el => el.scrollTop)
const STOPS = ['wheel', 'touchstart', 'keydown', 'mousedown']
let settling = null
function applyScroll(tops) {
  settling?.()
  const want = tops || []
  const put = () => {
    let done = true
    document.querySelectorAll(SCROLLERS).forEach((el, i) => {
      const t = want[i] || 0
      if (Math.abs(el.scrollTop - t) <= 1) return
      el.scrollTop = t
      if (Math.abs(el.scrollTop - t) > 1) done = false
    })
    return done
  }
  if (put()) return
  // The rows under the offset are still being fetched. Keep trying until they
  // arrive, the person touches the screen, or it is plain they are not coming.
  let stop = false
  const quit = () => { stop = true; settling = null; for (const ev of STOPS) window.removeEventListener(ev, quit, true) }
  for (const ev of STOPS) window.addEventListener(ev, quit, true)
  settling = quit
  const until = Date.now() + 4000
  const tick = () => { if (stop) return; if (put() || Date.now() > until) { quit(); return } setTimeout(tick, 60) }
  setTimeout(tick, 60)
}

// ── List state that is not a filter ─────────────────────────────────────────
// The page a list is on and how it is grouped stay OUT of the URL (an entry
// per page tap is not navigation), which used to mean out of everything: the
// list unmounts when a record takes the screen, so back from a lead found page
// 1 of a list left on page 3, and a phone's "Load more" rows were gone with
// the place you had scrolled to. They ride on the history entry instead —
// invisible, and exactly as durable as the entry. `revive` adapts what was
// kept when it is read back.
export function useKept(key, initial, revive) {
  const [v, setV] = useState(() => {
    const kept = restoring?.keep?.[key]
    return kept === undefined ? initial : (revive ? revive(kept) : kept)
  })
  const last = useRef(v)
  useEffect(() => {
    if (last.current === v) return
    last.current = v
    const s = readEntry()
    writeEntry({ ...s, keep: { ...(s.keep || {}), [key]: v } }, window.location.href, false)
  }, [key, v])
  return [v, setV]
}

/** A list's page and page size, kept on its entry. A phone list grows by
 *  "Load more", and rebuilt on its third page it would hold rows 41–60 only,
 *  so it comes back as one page holding all three. */
export function useKeptPager(key, accumulate) {
  const [p, setP] = useKept(`${key}.pager`, { page: 1, pageSize: 20 },
    accumulate ? (k) => ({ page: 1, pageSize: Math.min(200, (k.page || 1) * (k.pageSize || 20)) }) : undefined)
  const setPage = useCallback((page) => setP(x => (x.page === page ? x : { ...x, page })), [setP])
  const setPageSize = useCallback((pageSize) => setP(x => (x.pageSize === pageSize ? x : { ...x, pageSize })), [setP])
  return { page: p.page, pageSize: p.pageSize, setPage, setPageSize }
}

// ============================================================================
// useNav — screen + selection, mirrored to the URL, with a back-to-exit guard
// ============================================================================
// Owned by App and handed down to whichever chrome is rendering, so the desk
// and the phone share one source of truth for "where am I".
//
// `home` is the screen that counts as the root for the exit guard: 'dashboard'
// on the desk, 'today' on a phone.
//
// `overlay` is how nav learns about anything drawn ON TOP of a screen — the
// modals, the search panel, the notification drawer. Nav does not own that
// state (the store does), and for a long time it did not know it existed
// either: opening "New lead" and then tapping a bottom-tab or pressing back
// changed the screen underneath while the form stayed on top of it, over a
// page it no longer belonged to. Pass { isOpen, close }.
export function useNav({ home, onExitWarning, overlay, enabled = true }) {
  // Read through a ref so the popstate handler always sees the CURRENT overlay
  // state. Closing over the value instead would re-register the listener on
  // every open and close, and worse, a stale closure would answer "nothing is
  // open" for the one press that matters.
  const overlayRef = useRef(overlay)
  overlayRef.current = overlay
  const first = useRef(bootNav()).current
  const [screen, setScreenState] = useState(first.screen || home)
  const [sel, setSelState] = useState(first.sel)

  // Set when a popstate is what changed the state, so the effect below doesn't
  // immediately push the entry the user just went back through.
  const fromPop = useRef(false)
  // Second back within this window actually leaves.
  const exitArmed = useRef(false)

  // TWO entries are seeded, not one, and the second is the one the app sits on.
  //
  // Backing out of the earliest history entry does not fire popstate — the
  // document is simply gone — so a guard can never see the press that would
  // close the app. The spare entry underneath is what makes that press
  // observable: back lands on it, popstate fires, and the handler below can
  // decide whether to warn or to let go.
  //
  // Only on a genuinely fresh entry, which `history.state` tells us: it is null
  // the first time the app is opened and survives a reload. Seeding on every
  // load would duplicate the current entry on each refresh, and backing out of
  // a record would then land on the same record again.
  useEffect(() => {
    // NOTHING TO MIRROR UNTIL THERE IS A DESK. This ran above the sign-in gate,
    // so the login screen wrote `?screen=dashboard` into its own URL — naming a
    // screen nobody can reach yet, on a page that is not it. Worse on the bare
    // root, where it made a workspace picker look like a route.
    if (!enabled) return
    if (window.history.state?.nav) { entry = window.history.state; return }
    const url = urlFor(first.screen || home, first.sel)
    stampNavWorkspace()
    writeEntry({ floor: true, depth: 0 }, url, false)
    if (!isStandaloneApp()) {
      writeEntry({ depth: 0 }, url, true)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled])

  // Where we are, ignoring how the list under it is filtered. Changing a filter
  // is not a navigation: pushing an entry for each one means back walks through
  // six filter states before it leaves the screen, and on a phone — where back
  // is a system gesture and the exit guard counts entries — that is the
  // difference between one press and seven. Filters REPLACE the current entry,
  // so the URL still carries them (reload and sharing keep working) without
  // burying the screen you came from.
  const placeRef = useRef(null)
  // Set by back() when it fell back to the parent: that step is "up", not
  // "forward", so it takes over the record's entry instead of stacking a list
  // on a record that the next back would return to.
  const replaceNext = useRef(false)
  // The scrollers as they stood when the navigation was asked for. By the
  // time the effect below runs the new screen is already drawn.
  const leftScroll = useRef([])
  useEffect(() => {
    if (!enabled) return
    const place = JSON.stringify([screen, sel.leadId, sel.leadOpen, sel.ownerId, sel.ownerOpen,
      sel.propId, sel.propOpen, sel.projKey, sel.projOpen, sel.propAdd, sel.person, sel.contactId])
    const firstRun = placeRef.current === null
    const samePlace = placeRef.current === place
    placeRef.current = place
    if (fromPop.current) {
      fromPop.current = false
      restoring = null
      if (!samePlace) applyScroll(readEntry().scroll)
      return
    }
    const next = urlFor(screen, sel)
    const up = replaceNext.current
    replaceNext.current = false
    stampNavWorkspace()
    if (next !== window.location.search) {
      const cur = readEntry()
      if (samePlace || up) writeEntry({ ...cur, scroll: undefined }, next, false)
      else {
        writeEntry({ ...cur, scroll: leftScroll.current }, window.location.href, false)
        writeEntry({ depth: (cur.depth || 0) + 1 }, next, true)
      }
    }
    if (!samePlace && !firstRun) applyScroll([])
  }, [screen, sel, enabled])

  useEffect(() => {
    const onPop = () => {
      // The entry just left, as last written; history.state is already the
      // one under it.
      const left = entry
      entry = readEntry()
      // A back press with a form on screen means "close the form", every time.
      // It never means "go to the previous screen and leave the form floating
      // over it", and on a phone — where back is a system gesture people use
      // constantly — that is the only reading anyone expects. Consume the
      // press by putting the entry back, so one gesture closes one thing.
      if (overlayRef.current?.isOpen()) {
        overlayRef.current.close()
        writeEntry(left || { depth: (entry.depth || 0) + 1 }, urlFor(screen, sel), true)
        return
      }
      const at = parseUrl()
      const nextScreen = at.screen || home

      // Back pressed with nothing left of ours to unwind. Rather than letting
      // the app close on a single stray tap — which on Android is one thumb
      // twitch away at all times — the first press is spent on a warning and
      // the entry is put back.
      if (isRoot(nextScreen, at.sel, home) && isRoot(screen, sel, home)) {
        if (!exitArmed.current) {
          writeEntry(left || { depth: (entry.depth || 0) + 1 }, urlFor(screen, sel), true)
          exitArmed.current = true
          onExitWarning?.()
          setTimeout(() => { exitArmed.current = false }, 2500)
          return
        }
        // Armed: this is the second press. We are standing on the seeded floor
        // entry, so one more step back leaves the document — which is the only
        // way to close a PWA, since script cannot do it.
        window.history.back()
        return
      }

      fromPop.current = true
      restoring = entry
      setScreenState(nextScreen)
      setSelState(at.sel)
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [screen, sel, home, onExitWarning])

  // TAPPING AN ALERT WHILE THE APP IS ALREADY OPEN.
  //
  // The service worker used to call client.navigate() on the window it found,
  // which is a full document load to change a query string -- a visible reload
  // on a phone, after which the position:fixed tab bar sat off the bottom of
  // the viewport until a resize put it back. The worker now posts the URL
  // instead (see the notificationclick handler in public/sw.js) and this routes
  // it in place, the same way a back press is handled.
  //
  // pushState, not replaceState: the screen the person was looking at when the
  // alert arrived is somewhere they should be able to press back to.
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return
    const onMsg = (e) => {
      if (e.data?.type !== 'notification-navigate' || !e.data.url) return
      let at
      // parseUrl takes a QUERY STRING, not a URL.
      try { at = parseUrl(new URL(e.data.url, window.location.origin).search) } catch { return }
      const cur = readEntry()
      writeEntry({ ...cur, scroll: readScroll() }, window.location.href, false)
      writeEntry({ depth: (cur.depth || 0) + 1 }, e.data.url, true)
      fromPop.current = true
      setScreenState(at.screen || home)
      setSelState(at.sel)
    }
    navigator.serviceWorker.addEventListener('message', onMsg)
    return () => navigator.serviceWorker.removeEventListener('message', onMsg)
  }, [home])

  // Same signature the modules already call: go('leads', { leadId, leadOpen }).
  // Every takeover flag is cleared unless this call sets it, so leaving the
  // add-property wizard and tapping Properties cannot re-open the wizard.
  const go = useCallback((key, patch = {}) => {
    // Every navigation dismisses what is on top of the screen. Tapping a tab
    // while a half-filled form is open is an unambiguous "not now" — and a
    // form that survives the trip is worse than one that closes, because it
    // then submits against whatever screen you landed on.
    overlayRef.current?.close()
    leftScroll.current = readScroll()
    replaceNext.current = false
    // OPENING A ROW IS NOT LEAVING THE SCREEN. A navigation whose patch is made
    // only of record keys — clicking a lead in a filtered list — keeps the
    // filters it was standing on. Anything else (a sidebar item, a dashboard
    // tile, a tab) is a fresh arrival and clears them, which is what stops a
    // tile tapped an hour ago still silently filtering the book.
    const recordOnly = Object.keys(patch).length > 0
      && Object.keys(patch).every(k => RECORD_KEYS.includes(k))
    setScreenState(key)
    setSelState(s => {
      const next = { ...s }
      for (const k of TAKEOVER_KEYS) {
        if (patch[k] !== undefined) continue
        // Opening a record keeps the filters underneath it — for whichever
        // list you were standing on, not just Leads.
        if (recordOnly && (k === 'leadFilters' || k === 'propFilters' || k === 'ownerFilters' || k === 'contactFilters')) continue
        next[k] = null
      }
      return { ...next, ...patch }
    })
  }, [])

  // A screen changing its own selection (opening a row it lists, closing a
  // record) is a navigation too, and is measured the same way.
  const setSel = useCallback((u) => {
    leftScroll.current = readScroll()
    replaceNext.current = false
    setSelState(u)
  }, [])

  // ── THE BACK ARROW ────────────────────────────────────────────────────────
  // One answer for every record and secondary screen, on both chromes: the
  // arrow does what the phone's back gesture does. Each record used to close
  // itself onto its OWN module's list, so Leads → a lead → one of its homes →
  // back landed on the property list — a screen the person never visited, with
  // the lead and the filtered list behind it both gone.
  //
  // `parent` is only for when nothing of ours is underneath — a deep link, an
  // alert opened in a fresh tab, the first entry after a reload. Then the arrow
  // goes UP to the record's list instead of off the app.
  const back = useCallback((parent) => {
    if (canStepBack()) { window.history.back(); return }
    parent?.()
    // After, not before: parent() is itself a go() or setSel(), which clear it.
    replaceNext.current = true
  }, [])

  return { screen, setScreen: setScreenState, sel, setSel, go, back, boot: first }
}

export { isStandaloneApp }
