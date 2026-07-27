import { useEffect, useState } from 'react'
import Icon from './Icon.jsx'
import { canInstall, onInstallAvailable, promptInstall, isIOS, isStandalone } from '../lib/pwa.js'

// ============================================================================
// 📲 Install prompt — put the firm's app on the home screen
// ============================================================================
// One dismissible card that adapts to the platform: Android exposes a real
// install button (via the deferred beforeinstallprompt event); iOS has no such
// API, so we show the "Add to Home Screen" gesture instead. Renders nothing when
// the app is already installed (standalone) or the user dismissed it.

const DISMISS_KEY = 'install_prompt_dismissed'

export default function InstallPrompt() {
  const [installable, setInstallable] = useState(canInstall())
  const [dismissed, setDismissed] = useState(() => {
    try { return localStorage.getItem(DISMISS_KEY) === '1' } catch (e) { return false }
  })

  useEffect(() => onInstallAvailable(setInstallable), [])

  if (dismissed || isStandalone()) return null

  const ios = isIOS()
  // Nothing to offer: not installable on Android and not iOS (e.g. desktop that
  // hasn't fired the event) — stay out of the way.
  if (!installable && !ios) return null

  const dismiss = () => {
    setDismissed(true)
    try { localStorage.setItem(DISMISS_KEY, '1') } catch (e) {}
  }

  const install = async () => {
    const ok = await promptInstall()
    if (ok) dismiss()
  }

  return (
    <div className="install-card">
      <span className="install-card-icon"><Icon name="plus" size={16} /></span>
      <div className="install-card-body">
        <div className="install-card-title">Add to your home screen</div>
        {ios ? (
          <div className="install-card-sub">
            Tap the <b>Share</b> button, then <b>Add to Home Screen</b>.
          </div>
        ) : (
          <div className="install-card-sub">Install the app for one-tap access and alerts.</div>
        )}
      </div>
      {!ios && installable && (
        <button className="btn btn-primary btn-sm" onClick={install}>Install</button>
      )}
      <button className="install-card-x" onClick={dismiss} aria-label="Dismiss">
        <Icon name="x" size={14} />
      </button>
    </div>
  )
}
