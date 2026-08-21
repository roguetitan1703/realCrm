import { useEffect, useState } from 'react'
import Icon from './Icon.jsx'
import { pushStatus, enablePush } from '../lib/push.js'
import { currentTenant } from '../lib/api.js'

// ============================================================================
// 🔔 Alerts on this device — one component, two presentations
// ============================================================================
// `variant="prompt"` renders nothing when alerts are working. It exists to be
// noticed by someone who does not know they are missing anything, so it is an
// OVERLAY at the top of the app rather than a card in a screen's flow: inline,
// it sat below whatever the person came to do and was scrolled past. Mounted
// once, in App, so it is the same on the phone and the desk.
//
// `variant="row"` always renders and sits inline, because on a settings screen
// "Active" is the answer to a question the person came to ask.
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
  // rather than the installed app, most often) — Install is the thing that
  // helps there, and two rows saying different things about one problem is how
  // people stop reading either.
  if (push.permission === 'unsupported') return null
  if (push.ok && variant === 'prompt') return null

  // Blocked is the one state a button cannot fix, so it routes to a person: the
  // agents on a real desk will not find Chrome's site settings from a written
  // instruction, and support can do it with them in a minute.
  const blocked = push.permission === 'denied'
  const support = String(store?.state?.settings?.supportWhatsapp || '').replace(/\D/g, '')

  const turnOn = async () => {
    setBusy(true)
    const res = await enablePush()
    setPush(await pushStatus())
    setBusy(false)
    if (res.ok) store?.toast?.('Alerts on for this device')
    else if (res.reason === 'error') store?.toast?.('Could not turn on alerts on this device', 'warn')
  }

  const dismiss = () => {
    try { localStorage.setItem(dismissKey(), String(Date.now())) } catch (e) {}
    setHidden(true)
  }

  // SAME CLASSES AS THE INSTALL CONTROL BESIDE IT. The prompt is `.install-card`
  // (the product's existing nudge: one line, accent wash) and the settings line
  // is `.install-row`. This carried `.me-row`, which is a COLUMN — so it
  // rendered as a slab with the icon, the title and the button stacked down the
  // middle of the screen.
  const label = push.ok
    ? 'Alerts on for this device'
    : blocked ? 'Alerts blocked on this device' : 'Alerts off on this device'

  const action = push.ok
    ? <Icon name="check" size={14} />
    : blocked
      ? (support && <a className="btn btn-primary btn-sm" href={`https://wa.me/${support}`} target="_blank" rel="noreferrer">Get help</a>)
      : <button className="btn btn-primary btn-sm" disabled={busy} onClick={turnOn}>{busy ? '…' : 'Turn on'}</button>

  if (variant === 'row') {
    return (
      <div className="install-row">
        <span className="install-row-ic"><Icon name="bell" size={15} /></span>
        <div className="install-row-body"><div className="install-row-title">{label}</div></div>
        {action}
      </div>
    )
  }

  return (
    <div className="push-overlay">
      <div className="install-card">
        <span className="install-card-icon"><Icon name="bell" size={15} /></span>
        <div className="install-card-body"><div className="install-card-title">{label}</div></div>
        {action}
        <button className="push-x" onClick={dismiss} aria-label="Dismiss"><Icon name="x" size={13} /></button>
      </div>
    </div>
  )
}
