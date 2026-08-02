import { useEffect, useState } from 'react'
import Icon from './Icon.jsx'
import { canInstall, onInstallAvailable, promptInstall, installEnv, isStandalone } from '../lib/pwa.js'
import InstallGuide from './InstallGuide.jsx'

// ============================================================================
// 📲 Install — the PERMANENT route, as opposed to the one-time nudge card
// ============================================================================
// InstallPrompt sits on Today. This row is the one on Me, so the app is always
// reachable from the same place a person goes to change anything else about
// their device. Both are silenced by exactly one thing: being installed.
export default function InstallRow() {
  const [installable, setInstallable] = useState(canInstall())
  const [guide, setGuide] = useState(false)
  useEffect(() => onInstallAvailable(setInstallable), [])

  // Already installed — there is nothing to offer.
  if (isStandalone()) return null

  // iOS has no install API at all: Safari only offers Share → Add to Home
  // Screen, so the button opens a guide to that gesture rather than a system
  // dialog. Elsewhere, no deferred beforeinstallprompt yet means we name the
  // browser's own menu rather than showing a button that cannot do anything.
  const env = installEnv()

  return (
    <div className="q-group">
      <div className="q-head">App</div>
      <div className="me-row install-row">
        <span className="install-row-ic"><Icon name="plus" size={15} /></span>
        <div className="install-row-body">
          <div className="install-row-title">Install on this device</div>
          <div className="install-row-sub">
            {env.ios
              ? env.canAddToHome
                ? 'Alerts need this on iPhone.'
                : 'Open this link in Safari to install.'
              : installable
                ? 'Opens without the browser bar and can receive alerts.'
                : 'Open the browser menu and choose Install app.'}
          </div>
        </div>
        {env.ios
          ? <button className="btn btn-primary btn-sm" onClick={() => setGuide(true)}>Install</button>
          : installable && <button className="btn btn-primary btn-sm" onClick={promptInstall}>Install</button>}
      </div>
      {guide && <InstallGuide onClose={() => setGuide(false)} />}
    </div>
  )
}
