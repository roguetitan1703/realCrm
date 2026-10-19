import { useEffect, useState } from 'react'
import Icon from './Icon.jsx'
import { Button, Input } from './primitives.jsx'
import { api, currentTenant } from '../lib/api.js'
import { phonePlaceholder } from '../lib/locale.js'
import { canPaste, canPickContact, pasteNumber, pickContact, looksLikePhone, refusal } from '../lib/share.js'

// ============================================================================
// ADD AS LEAD — from a buyer's I'm interested tap (listing-pages.md §A.1d)
// ============================================================================
// Who: the agent, on a phone, with the buyer's WhatsApp message open. They
// tapped the alert, or the ref link inside the message. What they want: the
// person on the CRM, holding the link and the home they tapped, without
// retyping anything. The only thing the CRM cannot know is the number —
// WhatsApp does not hand it to a link — so it is one Paste or one Pick.
//
// The same form serves the alert (inside the desk's modal frame) and the tap
// link opened by a signed-in member of the firm (on the buyer's page).
// ============================================================================

/**
 * `tap` is `{ code, propertyId?, at? }` from the public response's
 * `staff.tap`; `home` is the title of the home tapped, when known.
 * `onDone(result)` gets `{ lead, matched }`.
 */
export default function AddFromTap({ tap, home, onDone, onCancel, footClass = 'mfm-foot' }) {
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [busy, setBusy] = useState(false)
  const [state, setState] = useState(null) // null | { kind: 'held'|'denied'|'error'|'nopaste', ... }

  const paste = async () => {
    const n = await pasteNumber()
    if (n) { setPhone(n); setState(null) } else setState({ kind: 'nopaste' })
  }
  const pick = async () => {
    try {
      const c = await pickContact()
      if (c?.phone) { setPhone(c.phone); if (c.name && !name) setName(c.name); setState(null) }
    } catch { setState({ kind: 'denied' }) }
  }

  const save = async () => {
    if (!looksLikePhone(phone) || busy) return
    setBusy(true); setState(null)
    try {
      const r = await api.leadFromTap(tap.code, { phone: phone.trim(), ...(name.trim() ? { name: name.trim() } : {}) })
      onDone?.({ lead: r?.lead || null, matched: !!r?.matched })
    } catch (e) {
      const why = refusal(e)
      if (why.status === 409) setState({ kind: 'held', holder: why.holderName })
      else if (e instanceof TypeError) setState({ kind: 'error', text: 'No connection. Nothing was saved.' })
      else setState({ kind: 'error', text: 'Could not add the lead. Try again.' })
    } finally { setBusy(false) }
  }

  if (state?.kind === 'held') {
    return (
      <>
        <div className="snd-held">
          <Icon name="alert" size={18} />
          <div>
            <div className="snd-held-t">{state.holder ? `This number is ${state.holder}'s lead` : 'This number is another agent’s lead'}</div>
            <div className="snd-held-s">{state.holder ? `${state.holder.split(' ')[0]} has been told.` : 'They have been told.'}</div>
          </div>
        </div>
        <div className={footClass}>
          <Button onClick={() => { setState(null); setPhone('') }}>Use another number</Button>
          <Button variant="primary" onClick={onCancel}>Done</Button>
        </div>
      </>
    )
  }

  return (
    <>
      {home && (
        <div className="aft-home">
          <span className="aft-home-ic"><Icon name="building" size={15} /></span>
          <div className="aft-home-main">
            <div className="aft-home-t">{home}</div>
            <div className="aft-home-s">Tapped I'm interested</div>
          </div>
        </div>
      )}
      <div className="aft">
        <div className="field">
          <label htmlFor="aft-phone">Mobile number</label>
          <Input id="aft-phone" value={phone} onChange={e => setPhone(e.target.value)} inputMode="tel"
            placeholder={phonePlaceholder('98xxx xxxxx')} onKeyDown={e => { if (e.key === 'Enter') save() }} />
        </div>
        {(canPaste() || canPickContact()) && (
          <div className="snd-ways">
            {canPaste() && <button type="button" className="chipo" onClick={paste}><Icon name="copy" size={14} />Paste</button>}
            {canPickContact() && <button type="button" className="chipo" onClick={pick}><Icon name="people" size={14} />Pick from contacts</button>}
          </div>
        )}
        {state?.kind === 'nopaste' && <div className="snd-none">No number on the clipboard. Copy it from the chat, or type it.</div>}
        {state?.kind === 'denied' && <div className="snd-err">Contacts are blocked for this site. Type the number instead.</div>}
        <div className="field">
          <label htmlFor="aft-name">Name</label>
          <Input id="aft-name" value={name} onChange={e => setName(e.target.value)} placeholder="Optional" />
        </div>
        {state?.kind === 'error' && <div className="snd-err" role="alert">{state.text}</div>}
      </div>
      <div className={footClass}>
        {onCancel && <Button onClick={onCancel}>Cancel</Button>}
        <Button variant="primary" icon="userPlus" disabled={!looksLikePhone(phone) || busy} onClick={save}>{busy ? 'Adding…' : 'Add as lead'}</Button>
      </div>
    </>
  )
}

/**
 * The desk's Add as lead, opened from a share_interested alert. Reads the tap
 * through the public route (a signed-in read is not counted as a view), so
 * the home and any lead it already landed on are known before anything is
 * typed.
 */
export function AddFromTapModal({ store, go, Modal, code }) {
  const [info, setInfo] = useState({ loading: true })
  useEffect(() => {
    let live = true
    api.publicShare(currentTenant(), code)
      .then(r => { if (live) setInfo({ loading: false, data: r }) })
      .catch(() => { if (live) setInfo({ loading: false, data: null }) })
    return () => { live = false }
  }, [code])

  const d = info.data
  const tap = d?.staff?.tap || { code }
  const home = d?.flats?.find(f => f.id === tap.propertyId) || d?.flats?.[0]
  const homeTitle = home ? [home.project || home.title, home.config].filter(Boolean).join(' · ') : ''
  const lead = d?.staff?.lead
  const openLead = (id) => { store.closeModal(); go('leads', { leadId: id, leadOpen: true }) }

  return (
    <Modal title="Add as lead" onClose={store.closeModal} width={440}>
      {info.loading ? (
        <div className="mylinks-empty"><span className="snd-spin" aria-label="Loading" /></div>
      ) : lead ? (
        <>
          <div className="snd-done">
            <span className="snd-done-ic"><Icon name="check" size={18} /></span>
            <div className="snd-done-main">
              <div className="snd-done-url">{lead.name || 'Already a lead'}</div>
              {homeTitle && <div className="snd-done-s">{homeTitle}</div>}
            </div>
          </div>
          <div className="mfm-foot">
            <Button onClick={store.closeModal}>Close</Button>
            <Button variant="primary" onClick={() => openLead(lead.id)}>Open lead</Button>
          </div>
        </>
      ) : (
        <AddFromTap tap={tap} home={homeTitle} onCancel={store.closeModal}
          onDone={({ lead: made, matched }) => {
            store.touched?.()
            store.toast(matched ? 'Already a lead · the tap is on it' : 'Lead added')
            if (made?.id) openLead(made.id); else store.closeModal()
          }} />
      )}
    </Modal>
  )
}
