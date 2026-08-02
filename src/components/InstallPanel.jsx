import { useEffect, useState } from 'react'
import { Panel, SectionHead, Button } from './primitives.jsx'
import { canInstall, onInstallAvailable, promptInstall, installEnv, isStandalone } from '../lib/pwa.js'
import InstallGuide from './InstallGuide.jsx'

// The desk's install route. Same reasoning as InstallRow on the phone: a laptop
// was never offered one and had to be installed through the browser's own
// address-bar control, which most people do not know is there.
export default function InstallPanel() {
  const [installable, setInstallable] = useState(canInstall())
  const [guide, setGuide] = useState(false)
  useEffect(() => onInstallAvailable(setInstallable), [])

  if (isStandalone()) return null
  // An iPad reports itself as a Mac, so the desk panel can be looking at one.
  const env = installEnv()

  return (
    <Panel>
      <SectionHead title="App Installation" />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '4px 0' }}>
        <div>
          <div className="sys-t" style={{ fontWeight: 600, fontSize: 14 }}>Install CRM Application</div>
          <div className="sys-s" style={{ color: 'var(--muted)', fontSize: 13, marginTop: 4, lineHeight: 1.4 }}>
            {env.ios
              ? env.canAddToHome
                ? 'Add it to your home screen to enable push alerts.'
                : 'Open this link in Safari to install.'
              : installable
                ? 'Install on your desktop or mobile device for standalone app windowing and instant alert notifications.'
                : 'Open your browser settings menu and choose "Install App" or "Add to Home Screen".'}
          </div>
        </div>
        {env.ios ? (
          <div>
            <Button variant="primary" size="sm" onClick={() => setGuide(true)}>Install App</Button>
          </div>
        ) : installable && (
          <div>
            <Button variant="primary" size="sm" onClick={promptInstall}>Install App</Button>
          </div>
        )}
      </div>
      {guide && <InstallGuide onClose={() => setGuide(false)} />}
    </Panel>
  )
}
