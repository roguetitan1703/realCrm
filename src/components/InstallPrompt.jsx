import { useEffect, useState } from 'react'
import Icon from './Icon.jsx'
import { canInstall, onInstallAvailable, promptInstall, isIOS, isStandalone } from '../lib/pwa.js'

// ============================================================================
// 📲 Install prompt — put the firm's app on the home screen
// ============================================================================
// Shown whenever the app is running in a browser tab, and only then. It used to
// be dismissible, and the dismissal was written to localStorage with no expiry
// — so one stray tap, months ago, on a device that was never installed, meant
// the app never asked again. Being installed is what silences it now, which is
// the only signal that actually means "handled".
//
// The card adapts to what the browser gives us: Android/desktop Chrome hand
// over a real install event, iOS has no such API and needs the Share-sheet
// gesture spelled out, and everything else gets the browser's own menu named.
//
// Note for testing: `beforeinstallprompt` only fires when a service worker is
// registered, and the worker is production-only (a SW in `vite dev` would cache
// hashed modules and fight HMR). In `vite dev` this card shows the manual
// route, not an Install button — use `vite preview` or the deploy to see it.

export default function InstallPrompt() {
  const [installable, setInstallable] = useState(canInstall())
  const [installed, setInstalled] = useState(isStandalone)

  useEffect(() => onInstallAvailable(setInstallable), [])
  // Installing from our own button doesn't reload the tab, and neither does
  // installing from the browser's menu — without this the card would sit there
  // asking for something already done.
  useEffect(() => {
    const done = () => setInstalled(true)
    window.addEventListener('appinstalled', done)
    const mq = window.matchMedia?.('(display-mode: standalone)')
    mq?.addEventListener?.('change', (e) => e.matches && done())
    return () => window.removeEventListener('appinstalled', done)
  }, [])

  if (installed) return null

  const ios = isIOS()

  return (
    <div className="install-card">
      <span className="install-card-icon"><Icon name="plus" size={16} /></span>
      <div className="install-card-body">
        <div className="install-card-title">Add to your home screen</div>
        <div className="install-card-sub">
          {ios
            ? <>Tap <b>Share</b>, then <b>Add to Home Screen</b>.</>
            : installable
              ? 'Install for one-tap access and alerts.'
              : <>Open the browser menu and choose <b>Install app</b>.</>}
        </div>
      </div>
      {!ios && installable && (
        <button className="btn btn-primary btn-sm" onClick={promptInstall}>Install</button>
      )}
    </div>
  )
}
