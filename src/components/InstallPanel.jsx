import { useEffect, useState } from 'react'
import { Panel, SectionHead, Button } from './primitives.jsx'
import { canInstall, onInstallAvailable, promptInstall, isIOS, isStandalone } from '../lib/pwa.js'

// The desk's install route. Same reasoning as InstallRow on the phone: a laptop
// was never offered one and had to be installed through the browser's own
// address-bar control, which most people do not know is there.
export default function InstallPanel() {
  const [installable, setInstallable] = useState(canInstall())
  useEffect(() => onInstallAvailable(setInstallable), [])

  if (isStandalone()) return null
  const ios = isIOS()

  return (
    <Panel>
      <SectionHead title="App Installation" />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '4px 0' }}>
        <div>
          <div className="sys-t" style={{ fontWeight: 600, fontSize: 14 }}>Install CRM Application</div>
          <div className="sys-s" style={{ color: 'var(--muted)', fontSize: 13, marginTop: 4, lineHeight: 1.4 }}>
            {ios
              ? 'In Safari, tap the Share icon then select "Add to Home Screen" to install and enable push alerts.'
              : installable
                ? 'Install on your desktop or mobile device for standalone app windowing and instant alert notifications.'
                : 'Open your browser settings menu and choose "Install App" or "Add to Home Screen".'}
          </div>
        </div>
        {!ios && installable && (
          <div>
            <Button variant="primary" size="sm" onClick={promptInstall}>Install App</Button>
          </div>
        )}
      </div>
    </Panel>
  )
}
