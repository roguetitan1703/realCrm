import { useEffect, useState } from 'react'
import Icon from './Icon.jsx'
import { pushStatus, enablePush } from '../lib/push.js'
import { currentTenant } from '../lib/api.js'

// ============================================================================
// 🔔 Alerts on this device — one component, two presentations
// ============================================================================
// `variant="prompt"` renders nothing when alerts are working; it exists to be
// noticed by someone who does not know they are missing anything, so it sits on
// Today and in the notification drawer. `variant="row"` always renders, because
// on the settings screen "Active" is the answer to a question the person came
// to ask.
//
// WHY A CONTROL OF OUR OWN AT ALL. The browser's permission prompt is one-shot:
// dismiss it twice and Chrome blocks the origin for good, and there is no API
// anywhere to undo that. So the app asks first, with a button, and only calls
// the browser when someone taps it — the standard "priming" pattern. It also
// means a device that was already granted but never subscribed (the state the
// per-origin permission hides — see lib/push.js) has somewhere to be fixed.

const DISMISS_DAYS = 7

// Per workspace, like every other stored key: one browser holds several firms,
// and dismissing this on one is not an answer for the others.
const dismissKey = () => `crm_push_prompt_dismissed_${currentTenant() || '_'}`

function dismissedRecently() {
  try {
    const at = Number(localStorage.getItem(dismissKey()) || 0)
    return at > 0 && Date.now() - at < DISMISS_DAYS * 86400 * 1000
  } catch (e) { return false }
}

export default function PushRow({ store, variant = 'prompt' }) {
  const [push, setPush] = useState(null)
  const [busy, setBusy] = useState(false)
  const [hidden, setHidden] = useState(() => variant === 'prompt' && dismissedRecently())

  useEffect(() => { pushStatus().then(setPush) }, [])

  if (!push || hidden) return null
  // Nothing here can be acted on: no push support at all (iOS in the browser
  // rather than the installed app, most often) — InstallRow is the thing that
  // helps there, and two rows saying different things about one problem is how
  // people stop reading either.
  if (push.permission === 'unsupported') return null
  if (push.ok && variant === 'prompt') return null

  const turnOn = async () => {
    setBusy(true)
    const res = await enablePush()
    setPush(await pushStatus())
    setBusy(false)
    if (res.ok) store?.toast?.('Alerts on for this device')
    else if (res.reason !== 'denied') store?.toast?.('Could not turn on alerts on this device', 'warn')
  }

  const dismiss = () => {
    try { localStorage.setItem(dismissKey(), String(Date.now())) } catch (e) {}
    setHidden(true)
  }

  // Blocked is the one state a button cannot fix, so it routes to a person.
  // The agents on a real desk are not going to find Chrome's site settings from
  // a written instruction, and support can do it with them in a minute.
  const blocked = push.permission === 'denied'
  const support = String(store?.state?.settings?.supportWhatsapp || '').replace(/\D/g, '')

  return (
    <div className="me-row push-row">
      <span className="install-row-ic">
        <Icon name="bell" size={15} />
      </span>
      <div className="install-row-body">
        <div className="install-row-title">
          {push.ok ? 'Alerts on for this device' : blocked ? 'Alerts blocked on this device' : 'Alerts off on this device'}
        </div>
      </div>
      {push.ok ? (
        <span className="push-row-on"><Icon name="check" size={13} /></span>
      ) : blocked ? (
        support
          ? <a className="btn btn-primary btn-sm" href={`https://wa.me/${support}`} target="_blank" rel="noreferrer">Get help</a>
          : null
      ) : (
        <button className="btn btn-primary btn-sm" disabled={busy} onClick={turnOn}>
          {busy ? '…' : 'Turn on'}
        </button>
      )}
      {variant === 'prompt' && !push.ok && (
        <button className="push-row-x" onClick={dismiss} aria-label="Dismiss">
          <Icon name="x" size={13} />
        </button>
      )}
    </div>
  )
}
