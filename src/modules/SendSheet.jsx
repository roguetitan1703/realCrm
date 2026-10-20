import { useEffect, useRef, useState } from 'react'
import Icon from '../components/Icon.jsx'
import { Button, Input, PhoneInput, Toggle } from '../components/primitives.jsx'
import { api } from '../lib/api.js'
import { configLabel, personLabel, unitLabel } from '../lib/format.js'
import { formatPhone, readPhone } from '../lib/phone.js'
import { copyText } from '../lib/clipboard.js'
import { canPickWhatsApp, openWhatsAppChat } from '../lib/matching.js'
import { canPickContact, pickContact, refusal, expiryLabel, heldText, catalogueToast } from '../lib/share.js'
import { canChangeCatalogue } from '../lib/permissions.js'
import WaSend from '../components/WaSend.jsx'

// ============================================================================
// SEND — one sheet for every way a home goes out (listing-pages.md §A, §A.5)
// ============================================================================
// Who: an agent between calls, on a phone, with a buyer on the line or just
// off it; or someone at the desk sending a few flats from the list. What they
// want: the homes in that person's WhatsApp, in as few taps as the job allows.
//
// Opened from the lead's shortlist (the lead is the recipient), from the
// Properties list's selection and from a property's own Share (the recipient
// is chosen here). The server makes the link, puts the homes on the lead's
// shortlist and logs "Sent 3 homes" on its timeline; this sheet only gathers
// the three facts that need a person: which homes, to whom, with prices or not.
// ============================================================================

/** What the sheet shows for one home. Callers pass the rows they already hold. */
export function homeOf(p) {
  return {
    id: p.id,
    title: p.society || p.project || p.title || 'Property',
    sub: [configLabel(p), p.locality].filter(Boolean).join(' · '),
    unit: unitLabel(p),
    inCatalogue: !!p.inCatalogue,
  }
}

/** Opens the sheet on these properties. `leadId` makes that lead the
 *  recipient; `suggested` are leads to offer before anything is typed. */
export function openSend(store, props, { leadId, lead, suggested, onSent } = {}) {
  store.openModal({ kind: 'send', homes: props.filter(Boolean).map(homeOf), leadId: leadId || lead?.id, lead, suggested, onSent })
}

export default function SendSheet({ store, Modal, homes: initial = [], leadId, lead: leadRow, suggested = [], onSent }) {
  const sharing = store.state.settings?.sharing || {}
  const lead = (leadId && store.lookup('lead', leadId)) || leadRow || null
  const [homes, setHomes] = useState(initial)
  // 'pick' | 'none' | 'lead' | 'new'
  const [to, setTo] = useState(lead ? { kind: 'lead', lead } : { kind: 'pick' })
  const [showPrice, setShowPrice] = useState(!!sharing.showPriceOnCatalogue)
  // 'form' | 'phone' (ask the sender's number) | 'held' (409) | 'done'
  const [step, setStep] = useState('form')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState(null)
  const [held, setHeld] = useState('')
  const [err, setErr] = useState('')
  // Whether WhatsApp already opened on its own after the link was made. Where
  // it did not, the done sheet's Open WhatsApp is the way there.
  const [opened, setOpened] = useState(false)
  const me = store.me()

  const close = store.closeModal
  const privateOnes = to.kind === 'none' ? homes.filter(h => !h.inCatalogue) : []
  const sendable = to.kind === 'none' ? homes.length - privateOnes.length : homes.length
  const ready = homes.length > 0 && sendable > 0 && (
    to.kind === 'lead' || to.kind === 'none' || (to.kind === 'new' && readPhone(to.phone).ok))

  const recipientName = to.kind === 'lead' ? personLabel(to.lead) : to.kind === 'new' ? (to.name?.trim() || formatPhone(to.phone)) : ''

  const send = async (app) => {
    if (!ready || busy) return
    setBusy(true); setErr('')
    // A desk browser blocks a tab opened after a network round trip, so it is
    // opened now, while the click still counts, and pointed at WhatsApp once
    // the link exists — or closed if it does not.
    const desk = !canPickWhatsApp() && !window.matchMedia?.('(max-width: 1023px)').matches
    const tab = desk ? window.open('', '_blank') : null
    try {
      const body = {
        propertyIds: (to.kind === 'none' ? homes.filter(h => h.inCatalogue) : homes).map(h => h.id),
        showPrice,
        ...(to.kind === 'lead' ? { leadId: to.lead.id } : {}),
        ...(to.kind === 'new' ? { newPerson: { name: (to.name || '').trim(), phone: to.phone.trim() } } : {}),
      }
      const r = await api.createShareLink(body)
      setResult(r)
      setStep('done')
      store.touched?.()
      onSent?.(r)
      const wa = parseWa(r?.waUrl)
      // Only the desk's pre-opened tab and an Android app intent survive the
      // wait for the server. A new window opened now (iPhone Safari, a phone
      // with no app choice) is blocked; the done sheet's button opens it.
      if (tab) { if (r?.waUrl) { tab.location.href = r.waUrl; setOpened(true) } else tab.close() }
      else if (wa && app && canPickWhatsApp()) { openWhatsAppChat(wa.text, wa.phone, app); setOpened(true) }
    } catch (e) {
      tab?.close()
      const why = refusal(e)
      if (why.status === 422 && /sender_phone_missing/.test(why.code || e.message)) setStep('phone')
      else if (why.status === 409 && /lead_held_by/.test(why.code || e.message)) { setHeld(why.holderName); setStep('held') }
      else if (why.code === 'private_flats_without_recipient') {
        // The server's word on which homes are not in the catalogue wins over
        // what the list row said when the sheet opened.
        const out = new Set(e.body?.ids || [])
        setHomes(hs => hs.map(h => (out.has(h.id) ? { ...h, inCatalogue: false } : h)))
        setErr(out.size === 1 ? '1 home is not in the catalogue. Send it to a named buyer.' : `${out.size} homes are not in the catalogue. Send them to a named buyer.`)
      }
      else if (why.code === 'flats_not_available') {
        const gone = new Set(e.body?.ids || [])
        if (gone.size < homes.length) setHomes(hs => hs.filter(h => !gone.has(h.id)))
        setErr(gone.size >= homes.length ? 'These homes are no longer available.' : gone.size === 1 ? '1 home is no longer available and was left out.' : `${gone.size} homes are no longer available and were left out.`)
      }
      else if (why.code === 'sharing_stopped') setErr('Sharing is stopped. An owner can allow it again in Settings.')
      else if (e instanceof TypeError) setErr('No connection. Nothing was sent.')
      else setErr(e?.body?.message && !/^[a-z_]+$/.test(e.body.message) ? e.body.message : 'Could not make the link. Try again.')
    } finally {
      setBusy(false)
    }
  }

  // Nothing can go to no recipient: the desk can put them in the catalogue
  // from here. Ticked homes that are not Available wait, and stay out.
  const addToCatalogue = async () => {
    if (busy) return
    setBusy(true); setErr('')
    try {
      const ids = privateOnes.map(h => h.id)
      const r = await api.setCatalogue(ids, true)
      store.touched?.()
      store.toast(catalogueToast(r, true))
      // Which ones are waiting is not said; Make link asks the server, whose
      // answer (private_flats_without_recipient) marks those out again.
      setHomes(hs => hs.map(h => (ids.includes(h.id) ? { ...h, inCatalogue: true } : h)))
    } catch (e) {
      setErr(e?.status === 403 ? 'Only an owner or manager can change the catalogue.' : 'Could not change the catalogue. Try again.')
    } finally { setBusy(false) }
  }

  // What can go, not what was picked; none at all names the picked ones.
  const shownN = sendable > 0 ? sendable : homes.length
  const title = shownN === 1 ? 'Send 1 home' : `Send ${shownN} homes`

  if (step === 'phone') {
    return (
      <Modal title="Your mobile number" onClose={close} width={440}>
        <SenderPhone store={store} me={me}
          onSaved={() => { setStep('form'); setTimeout(() => send(), 0) }}
          onCancel={() => setStep('form')} />
      </Modal>
    )
  }

  if (step === 'held') {
    return (
      <Modal title={title} onClose={close} width={440}>
        <div className="snd-held">
          <Icon name="alert" size={18} />
          <div>
            <div className="snd-held-t">{heldText(held).title}</div>
            <div className="snd-held-s">{heldText(held).sub}</div>
          </div>
        </div>
        <div className="mfm-foot">
          <Button onClick={() => { setStep('form'); setTo({ kind: 'pick' }) }}>Back</Button>
          <Button variant="primary" onClick={close}>Done</Button>
        </div>
      </Modal>
    )
  }

  if (step === 'done') {
    const link = result?.link
    // Nothing has reached anyone yet: the link exists, WhatsApp sends it.
    const name = result?.lead?.name || recipientName
    const openWa = () => { const wa = parseWa(result.waUrl); if (wa) openWhatsAppChat(wa.text, wa.phone) }
    return (
      <Modal title={name ? `Link ready for ${name}` : 'Link ready'} onClose={close} width={440}>
        <div className="snd-done">
          <span className="snd-done-ic"><Icon name="check" size={18} /></span>
          <div className="snd-done-main">
            <div className="snd-done-url mono-num">{link?.url || ''}</div>
            <div className="snd-done-s">{[sendable === 1 ? '1 home' : `${sendable} homes`, expiryLabel(link)].filter(Boolean).join(' · ')}</div>
            {result?.lead?.created && <div className="snd-done-s">{name ? `${name} added as a lead` : 'Added as a lead'}</div>}
          </div>
        </div>
        <div className="mfm-foot">
          <Button icon="copy" onClick={() => copyText(link?.url || '').then(ok => store.toast(ok ? 'Link copied' : 'Could not copy. Select the link and copy it.', ok ? undefined : 'warn'))}>Copy link</Button>
          {result?.waUrl && !opened
            ? <><Button onClick={close}>Done</Button><Button variant="primary" icon="wa" onClick={openWa}>Open WhatsApp</Button></>
            : <>
              {result?.waUrl && <Button icon="wa" onClick={openWa}>WhatsApp</Button>}
              <Button variant="primary" onClick={close}>Done</Button>
            </>}
        </div>
      </Modal>
    )
  }

  return (
    <Modal title={title} onClose={close} width={460}>
      <div className="snd">
        <div className="snd-homes">
          {homes.map(h => (
            <div key={h.id} className={'snd-home' + (to.kind === 'none' && !h.inCatalogue ? ' is-out' : '')}>
              <div className="snd-home-main">
                <div className="snd-home-t">{h.title}{h.unit && <span className="unit-tag">{h.unit}</span>}</div>
                <div className="snd-home-s">{to.kind === 'none' && !h.inCatalogue ? 'Not in the catalogue' : h.sub}</div>
              </div>
              {homes.length > 1 && (
                <button type="button" className="inv-x" aria-label={`Leave out ${h.title}`} onClick={() => setHomes(hs => hs.filter(x => x.id !== h.id))}>
                  <Icon name="x" size={14} />
                </button>
              )}
            </div>
          ))}
        </div>

        <div className="snd-sec">To</div>
        <Recipient store={store} to={to} setTo={setTo} fixed={!!lead} suggested={suggested} />

        <label className="snd-row">
          <span>Show price</span>
          <Toggle on={showPrice} type="button" aria-pressed={showPrice} aria-label="Show price" onClick={() => setShowPrice(v => !v)} />
        </label>

        {to.kind === 'none' && homes.length > 0 && sendable === 0 && (
          <div className="snd-dead" role="status">
            <div className="snd-dead-t">{homes.length === 1 ? 'This home is not in the catalogue' : 'None of these homes are in the catalogue'}</div>
            <div className="snd-dead-acts">
              <Button size="sm" icon="userPlus" onClick={() => setTo({ kind: 'pick' })}>Choose a recipient</Button>
              {canChangeCatalogue(store.state.role) && (
                <Button size="sm" icon="eye" disabled={busy} onClick={addToCatalogue}>Add to the catalogue</Button>
              )}
            </div>
          </div>
        )}
        {privateOnes.length > 0 && sendable > 0 && (
          <div className="snd-note">{privateOnes.length === 1 ? '1 left out: not in the catalogue' : `${privateOnes.length} left out: not in the catalogue`}</div>
        )}
        {err && <div className="snd-err" role="alert">{err}</div>}
      </div>
      <div className="mfm-foot">
        <Button onClick={close}>Cancel</Button>
        <WaSend label={busy ? 'Sending…' : recipientName ? `Send to ${recipientName.split(' ')[0]}` : 'Make link'}
          disabled={!ready || busy} onSend={send} />
      </div>
    </Modal>
  )
}

/** The recipient box: a lead, a new person, a contact, or nobody. */
function Recipient({ store, to, setTo, fixed, suggested }) {
  const [q, setQ] = useState('')
  const [denied, setDenied] = useState(false)

  const fromContacts = async () => {
    setDenied(false)
    try {
      const c = await pickContact()
      if (c?.phone) setTo({ kind: 'new', name: c.name, phone: c.phone })
    } catch { setDenied(true) }
  }

  if (to.kind === 'lead') {
    return (
      <div className="snd-to">
        <span className="snd-to-av">{(personLabel(to.lead)[0] || '?').toUpperCase()}</span>
        <div className="snd-to-main">
          <div className="snd-to-t">{personLabel(to.lead)}</div>
          {to.lead.phone && <div className="snd-to-s mono-num">{formatPhone(to.lead.phone)}</div>}
        </div>
        {!fixed && <button type="button" className="inv-x" aria-label="Change recipient" onClick={() => setTo({ kind: 'pick' })}><Icon name="x" size={14} /></button>}
      </div>
    )
  }

  if (to.kind === 'none') {
    return (
      <div className="snd-to">
        <span className="snd-to-av is-none"><Icon name="share" size={15} /></span>
        <div className="snd-to-main"><div className="snd-to-t">No recipient</div></div>
        <button type="button" className="inv-x" aria-label="Choose a recipient" onClick={() => setTo({ kind: 'pick' })}><Icon name="x" size={14} /></button>
      </div>
    )
  }

  if (to.kind === 'new') {
    return (
      <div className="snd-new">
        <div className="snd-new-grid">
          <Input value={to.name || ''} onChange={e => setTo({ ...to, name: e.target.value })} placeholder="Name" aria-label="Name" />
          <PhoneInput value={to.phone || ''} onChange={e => setTo({ ...to, phone: e.target.value })}
            aria-label="Mobile number" autoFocus={!to.phone} />
        </div>
        <button type="button" className="lnk snd-lnk" onClick={() => setTo({ kind: 'pick' })}>Search leads instead</button>
      </div>
    )
  }

  const term = q.trim()
  const digits = term.replace(/\D/g, '')
  return (
    <div className="snd-pick">
      <LeadSearch q={q} setQ={setQ} suggested={suggested} onPick={(l) => setTo({ kind: 'lead', lead: l })} />
      <div className="snd-ways">
        <button type="button" className="chipo" onClick={() => setTo({ kind: 'new', name: digits.length >= 6 ? '' : term, phone: digits.length >= 6 ? term : '' })}>
          <Icon name="userPlus" size={14} />New person
        </button>
        {canPickContact() && (
          <button type="button" className="chipo" onClick={fromContacts}><Icon name="people" size={14} />Pick from contacts</button>
        )}
      </div>
      {denied && <div className="snd-err">Contacts are blocked for this site. Type the number instead.</div>}
      <button type="button" className="btn btn-ghost btn-block snd-norec" onClick={() => setTo({ kind: 'none' })}>Continue without a recipient</button>
    </div>
  )
}

/**
 * Finds a lead by name or number — the Send sheet's recipient box and Attach
 * to a lead on a no-recipient link. Server-side search, six rows.
 */
export function LeadSearch({ q, setQ, onPick, suggested = [], autoFocus }) {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(false)
  const [failed, setFailed] = useState(false)
  const seq = useRef(0)
  const term = q.trim()

  useEffect(() => {
    if (term.length < 2) { setRows([]); setLoading(false); setFailed(false); return }
    const n = ++seq.current
    setLoading(true)
    const t = setTimeout(() => {
      api.listLeads({ q: term, limit: 6 })
        .then(r => { if (n === seq.current) { setRows(r?.data || []); setFailed(false) } })
        .catch(() => { if (n === seq.current) { setRows([]); setFailed(true) } })
        .finally(() => { if (n === seq.current) setLoading(false) })
    }, 220)
    return () => clearTimeout(t)
  }, [term])

  const list = term.length < 2 ? suggested.slice(0, 4) : rows
  return (
    <>
      <div className="snd-search">
        <Icon name="search" size={15} />
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search leads by name or number" aria-label="Search leads" autoFocus={autoFocus} />
        {loading && <span className="snd-spin" aria-label="Searching" />}
      </div>
      {term.length >= 2 && !loading && failed && <div className="snd-none">Could not search. Check the connection.</div>}
      {term.length >= 2 && !loading && !failed && rows.length === 0 && <div className="snd-none">No lead matches “{term}”</div>}
      {list.length > 0 && (
        <div className="snd-results">
          {term.length < 2 && <div className="snd-res-h">Matched</div>}
          {list.map(l => (
            <button type="button" key={l.id} className="snd-res" onClick={() => onPick(l)}>
              <span className="snd-to-av">{(personLabel(l)[0] || '?').toUpperCase()}</span>
              <span className="snd-res-main">
                <span className="snd-to-t">{personLabel(l)}</span>
                {l.phone && <span className="snd-to-s mono-num">{formatPhone(l.phone)}</span>}
              </span>
            </button>
          ))}
        </div>
      )}
    </>
  )
}

/**
 * Asked once, in place, when Send finds the sender has no number on file: a
 * buyer's tap opens WhatsApp to the person who sent the link.
 */
export function SenderPhone({ store, me, onSaved, onCancel, saveLabel = 'Save and send' }) {
  const [phone, setPhone] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [tried, setTried] = useState(false)
  const save = async () => {
    setTried(true)
    if (!readPhone(phone).ok || busy) return
    setBusy(true); setErr('')
    try {
      await api.updateMyPhone(phone.trim())
      store.touched?.()
      await store.loadServerState?.()
      onSaved?.()
    } catch (e) {
      const code = refusal(e).code
      setErr(code === 'phone_invalid' ? (e?.body?.message || 'Not a valid number.')
        : code === 'phone_taken' ? 'Someone on this team already uses that number.'
        : e instanceof TypeError ? 'No connection. Nothing was saved.'
        : 'Could not save. Try again.')
    } finally { setBusy(false) }
  }
  return (
    <>
      <div className="field">
        <label htmlFor="snd-me-phone">Mobile number</label>
        <PhoneInput id="snd-me-phone" value={phone} onChange={e => { setPhone(e.target.value); setErr('') }} autoFocus
          showProblem={tried} onKeyDown={e => { if (e.key === 'Enter') save() }} />
      </div>
      {err && <div className="snd-err" role="alert">{err}</div>}
      <div className="mfm-foot">
        {onCancel && <Button onClick={onCancel}>Back</Button>}
        {/* Pressable with a short number: pressing it is how a person finds out why. */}
        <Button variant="primary" disabled={!phone.trim() || busy} onClick={save}>{busy ? 'Saving…' : saveLabel}</Button>
      </div>
    </>
  )
}

/** wa.me/<digits>?text=… → { phone, text }, so an Android phone can still
 *  choose WhatsApp or Business (openWhatsAppChat) for a link the server built. */
function parseWa(url) {
  if (!url) return null
  try {
    const u = new URL(url)
    // The server built it from a stored E.164 number (phoneLink.js waLink).
    const digits = u.pathname.slice(1)
    return { phone: digits ? `+${digits}` : '', text: u.searchParams.get('text') || '' }
  } catch { return null }
}
