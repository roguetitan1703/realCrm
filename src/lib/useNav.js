import { useState, useRef, useEffect, useCallback } from 'react'
import { parseUrl, bootNav, stampNavWorkspace, urlFor, isRoot, isStandaloneApp, TAKEOVER_KEYS, RECORD_KEYS } from './nav.js'

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
    if (window.history.state?.nav) return
    const url = urlFor(first.screen || home, first.sel)
    stampNavWorkspace()
    window.history.replaceState({ nav: true, floor: true }, '', url)
    if (!isStandaloneApp()) {
      window.history.pushState({ nav: true }, '', url)
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
  useEffect(() => {
    if (!enabled) return
    if (fromPop.current) { fromPop.current = false; return }
    const next = urlFor(screen, sel)
    const place = JSON.stringify([screen, sel.leadId, sel.leadOpen, sel.ownerId, sel.ownerOpen,
      sel.propId, sel.propOpen, sel.projKey, sel.projOpen, sel.propAdd, sel.contactsTab])
    const samePlace = placeRef.current === place
    placeRef.current = place
    stampNavWorkspace()
    if (next !== window.location.search) {
      if (samePlace) window.history.replaceState({ nav: true }, '', next)
      else window.history.pushState({ nav: true }, '', next)
    }
  }, [screen, sel, enabled])

  useEffect(() => {
    const onPop = () => {
      // A back press with a form on screen means "close the form", every time.
      // It never means "go to the previous screen and leave the form floating
      // over it", and on a phone — where back is a system gesture people use
      // constantly — that is the only reading anyone expects. Consume the
      // press by putting the entry back, so one gesture closes one thing.
      if (overlayRef.current?.isOpen()) {
        overlayRef.current.close()
        window.history.pushState({ nav: true }, '', urlFor(screen, sel))
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
          window.history.pushState({ nav: true }, '', urlFor(screen, sel))
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
      window.history.pushState({ nav: true }, '', e.data.url)
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
        if (recordOnly && (k === 'leadFilters' || k === 'propFilters')) continue
        next[k] = null
      }
      return { ...next, ...patch }
    })
  }, [])

  return { screen, setScreen: setScreenState, sel, setSel: setSelState, go, boot: first }
}

export { isStandaloneApp }
