import { useEffect, useState } from 'react'
import Icon from './Icon.jsx'
import { canInstall, onInstallAvailable, promptInstall, isIOS, isStandalone } from '../lib/pwa.js'

// ============================================================================
// 📲 Install — the PERMANENT route, as opposed to the one-time nudge card
// ============================================================================
// InstallPrompt is a dismissible card on Today, and dismissing it writes a
// localStorage flag that never expires — so waving it away once removed the
// only way to install the app. It also only ever rendered on the phone's Today
// tab, meaning a desktop browser was never offered anything at all and had to
// be installed through the browser's own address-bar control, which most people
// do not know is there.
//
// This row is that missing route: always present while the app is installable
// and not already installed, never dismissible.
export default function InstallRow() {
  const [installable, setInstallable] = useState(canInstall())
  useEffect(() => onInstallAvailable(setInstallable), [])

  // Already installed — there is nothing to offer.
  if (isStandalone()) return null

  const ios = isIOS()
  // iOS has no install API at all: Safari only offers Share → Add to Home
  // Screen, so the instruction IS the feature there. Elsewhere, no deferred
  // beforeinstallprompt means the browser has judged the app not installable
  // (or already installed it), and claiming otherwise would be a dead button.
  if (!installable && !ios) return null

  return (
    <div className="q-group">
      <div className="q-head">App</div>
      <div className="me-row install-row">
        <span className="install-row-ic"><Icon name="plus" size={15} /></span>
        <div className="install-row-body">
          <div className="install-row-title">Install on this device</div>
          <div className="install-row-sub">
            {ios
              ? 'Tap Share, then Add to Home Screen. Alerts need this on iPhone.'
              : 'Opens without the browser bar and can receive alerts.'}
          </div>
        </div>
        {!ios && installable && (
          <button className="btn btn-primary btn-sm" onClick={promptInstall}>Install</button>
        )}
      </div>
    </div>
  )
}
