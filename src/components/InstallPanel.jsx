import { useEffect, useState } from 'react'
import { Panel, SectionHead, Button } from './primitives.jsx'
import { canInstall, onInstallAvailable, promptInstall, isIOS, isStandalone } from '../lib/pwa.js'

// The desk's install route. Same reasoning as InstallRow on the phone: the only
// install affordance in the product was a dismissible card on the phone's Today
// tab, so a laptop was never offered one and a dismissed card never came back.
export default function InstallPanel() {
  const [installable, setInstallable] = useState(canInstall())
  useEffect(() => onInstallAvailable(setInstallable), [])

  if (isStandalone()) return null
  const ios = isIOS()
  // No deferred prompt means the browser has decided this is not installable
  // right now — usually because it already is. A button that cannot do anything
  // is worse than no button.
  if (!installable && !ios) return null

  return (
    <Panel>
      <SectionHead title="App" />
      <div className="sys-row">
        <div>
          <div className="sys-t">Install on this device</div>
          <div className="sys-s">
            {ios
              ? 'In Safari, tap Share then Add to Home Screen. Alerts require this on iPhone and iPad.'
              : 'Opens in its own window without the browser bar, and can receive alerts when closed.'}
          </div>
        </div>
        {!ios && installable && <Button variant="primary" onClick={promptInstall}>Install</Button>}
      </div>
    </Panel>
  )
}
