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
  // No deferred prompt yet means we name the browser's own menu instead of
  // showing a button that cannot do anything.
  const ios = isIOS()

  return (
    <Panel>
      <SectionHead title="App" />
      <div className="sys-row">
        <div>
          <div className="sys-t">Install on this device</div>
          <div className="sys-s">
            {ios
              ? 'In Safari, tap Share then Add to Home Screen. Alerts require this on iPhone and iPad.'
              : installable
                ? 'Opens in its own window without the browser bar, and can receive alerts when closed.'
                : 'Open the browser menu and choose Install app.'}
          </div>
        </div>
        {!ios && installable && <Button variant="primary" onClick={promptInstall}>Install</Button>}
      </div>
    </Panel>
  )
}
