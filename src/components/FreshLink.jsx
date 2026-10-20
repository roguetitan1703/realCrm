import { useState } from 'react'
import { Button } from './primitives.jsx'
import { api } from '../lib/api.js'
import { refusal, heldText, openWa } from '../lib/share.js'

// ============================================================================
// SEND A FRESH LINK — a buyer pressed Talk to us on an expired link
// ============================================================================
// Who: the agent who sent it (or holds the buyer), on a phone between calls.
// What they want: the same homes back in that buyer's WhatsApp, in one tap.
// The server makes the new link through Send, so its refusals are Send's.
// ============================================================================

const isPhone = () => typeof window !== 'undefined' && !!window.matchMedia?.('(max-width: 1023px)').matches

/** Send's refusals, in words. A 403 names the holder in its own message. */
function refusalText(e) {
  const why = refusal(e)
  if (why.code === 'flats_not_available' || why.code === 'flats_not_found') return 'These homes are no longer available.'
  if (why.code === 'sharing_stopped') return 'Sharing is stopped. An owner can allow it again in Settings.'
  if (why.code === 'private_flats_without_recipient') return 'These homes are not in the catalogue. Send them to a named buyer.'
  if (why.status === 409 && /lead_held_by/.test(why.code)) return heldText(why.holderName).title
  if (why.status === 403) return e?.body?.message && !/^[a-z_]+$/.test(e.body.message) ? e.body.message : 'Only the person who sent this link, or the office, can send it again.'
  if (why.status === 429) return 'Too many tries. Wait a minute and try again.'
  if (e instanceof TypeError) return 'No connection. Nothing was sent.'
  return 'Could not make the link. Try again.'
}

/**
 * The button and what follows it. `PhoneStep` (SendSheet's SenderPhone) asks
 * for the sender's number when the server has none; without it the refusal is
 * said in words. `foot` wraps the actions so a modal can make them sticky.
 */
export default function FreshLink({ store, code, PhoneStep, children, footClass = 'mfm-foot', variant = 'primary' }) {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [step, setStep] = useState('idle')
  const [result, setResult] = useState(null)

  const send = async () => {
    if (busy) return
    setBusy(true); setErr('')
    // The desk's tab is opened by the tap itself: one opened after the wait
    // for the server is blocked. A phone leaves for WhatsApp in place.
    const tab = isPhone() ? null : window.open('', '_blank')
    try {
      const r = await api.freshShareLink(code)
      setResult(r)
      setStep('done')
      store?.touched?.()
      if (tab) { if (r?.waUrl) tab.location.href = r.waUrl; else tab.close() }
      else if (r?.waUrl) openWa(r.waUrl)
    } catch (e) {
      tab?.close()
      const why = refusal(e)
      if (why.status === 422 && /sender_phone_missing/.test(why.code || e.message)) {
        if (PhoneStep) setStep('phone')
        else setErr('Your mobile number is not on file. Add it in the CRM, then try again.')
      } else setErr(refusalText(e))
    } finally { setBusy(false) }
  }

  if (step === 'phone' && PhoneStep) {
    return <PhoneStep store={store} me={store?.me?.()} saveLabel="Save and send"
      onSaved={() => { setStep('idle'); setTimeout(send, 0) }} onCancel={() => setStep('idle')} />
  }

  return (
    <>
      {err && <div className="snd-err" role="alert">{err}</div>}
      <div className={footClass}>
        {children}
        {step === 'done' && result?.waUrl
          ? <Button variant={variant} icon="wa" onClick={() => openWa(result.waUrl)}>Open WhatsApp</Button>
          : <Button variant={variant} icon="wa" disabled={busy} onClick={send}>{busy ? 'Making link…' : 'Send a fresh link'}</Button>}
      </div>
    </>
  )
}
