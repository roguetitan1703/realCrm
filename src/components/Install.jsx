import { useEffect, useState } from 'react'
import Icon from './Icon.jsx'
import { DeviceRow } from './primitives.jsx'
import { canInstall, onInstallAvailable, promptInstall, installEnv, isStandalone } from '../lib/pwa.js'
import InstallGuide from './InstallGuide.jsx'

// ============================================================================
// 📲 Install this app — ONE implementation
// ============================================================================
// There were four: InstallRow (imported nowhere, so dead), InstallPrompt (phone
// Today), InstallPanel (web Settings) and a fourth written inline in PhoneMe.
// Each had its own copy, its own idea of when to hide itself, and only one of
// them noticed `appinstalled` — so on the others the card sat there asking for
// something already done.
//
// `variant="prompt"` is the card that appears in a page's flow when the app is
// running in a browser tab. `variant="row"` is the settings line. Being
// installed silences both: it is the only signal that means "handled", which is
// why there is no dismiss — a dismissal with no expiry once meant a device
// never asked again.
//
// Testing: `beforeinstallprompt` only fires when a service worker is
// registered, and the worker is production-only. In `vite dev` this shows the
// manual route, not an Install button — use `vite preview` or the deploy.
export default function Install({ variant = 'prompt' }) {
  const [installable, setInstallable] = useState(canInstall())
  const [installed, setInstalled] = useState(isStandalone)
  const [alreadyOnDevice, setAlreadyOnDevice] = useState(false)
  const [guide, setGuide] = useState(false)

  useEffect(() => onInstallAvailable(setInstallable), [])
  // IS THIS APP ALREADY ON THE MACHINE, asked from a browser tab. Chromium
  // only, and only for a manifest listed in its own `related_applications`
  // (backend/src/routes/pwa.ts). Everywhere else it is absent or answers
  // nothing, and the row goes on offering Install — which is what it did
  // before and is not wrong. A tick that cannot LAUNCH the app is still worth
  // more than a button that would install a second copy of it.
  useEffect(() => {
    let live = true
    navigator.getInstalledRelatedApps?.()
      .then(apps => { if (live && apps?.length) setAlreadyOnDevice(true) })
      .catch(() => {})
    return () => { live = false }
  }, [])
  useEffect(() => {
    const done = () => setInstalled(true)
    window.addEventListener('appinstalled', done)
    const mq = window.matchMedia?.('(display-mode: standalone)')
    mq?.addEventListener?.('change', (e) => e.matches && done())
    return () => window.removeEventListener('appinstalled', done)
  }, [])

  if (installed) return null

  // In a browser, with the app already installed. No button: a link that cannot
  // open the installed app is worse than nothing, and Install here would offer a
  // duplicate.
  if (alreadyOnDevice) {
    if (variant !== 'row') return null
    return <DeviceRow icon="check" title="Installed" />
  }

  // An iPad reports itself as a Mac, so even the desk can be looking at one.
  // iPhone has no install API: the button opens the Share-sheet guide rather
  // than a system dialog, because a sentence under a card is a sentence people
  // skim, and the thing that stops them skimming is something to press.
  const env = installEnv()

  // Only where it says what to DO. "Standalone app windowing and instant alert
  // notifications" told nobody anything they could act on.
  const hint = env.ios
    ? (env.canAddToHome ? '' : 'Open in Safari to install.')
    : (installable ? '' : 'Browser menu → Install app.')

  const button = env.ios
    ? <button className="btn btn-primary btn-sm" onClick={() => setGuide(true)}>Install</button>
    : installable && <button className="btn btn-primary btn-sm" onClick={promptInstall}>Install</button>

  // `me-row` used to be on this and not on the alerts row beside it — and
  // `.me-row` is a bordered card, so one of the two lines under This device sat
  // in a box and the other did not. Same component for both now.
  if (variant === 'row') {
    return (
      <DeviceRow icon="plus" title="Install on this device" sub={hint} action={button}>
        {guide && <InstallGuide onClose={() => setGuide(false)} />}
      </DeviceRow>
    )
  }

  return (
    <div className="install-card">
      <span className="install-card-icon"><Icon name="plus" size={16} /></span>
      <div className="install-card-body">
        <div className="install-card-title">Add to your home screen</div>
        {hint && <div className="install-card-sub">{hint}</div>}
      </div>
      {button}
      {guide && <InstallGuide onClose={() => setGuide(false)} />}
    </div>
  )
}
