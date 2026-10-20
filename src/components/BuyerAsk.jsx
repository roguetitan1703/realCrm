import { useEffect, useState } from 'react'
import Icon from './Icon.jsx'
import { Button } from './primitives.jsx'
import { api } from '../lib/api.js'
import { openSend } from '../modules/SendSheet.jsx'
import { whenLabel } from '../lib/format.js'

// ============================================================================
// WHAT A BUYER ASKED (listing-pages.md §A.6), opened from its alert
// ============================================================================
// Who: the agent holding the lead, on a phone between calls. What they want:
// the one thing the buyer asked for, done in one tap —
//   a call back      Call (the usual call flow, so the call is logged)
//   a visit          Confirm (it becomes the lead's booked site visit), or
//                    Another time (the schedule sheet)
//   new homes        Send them (the Send sheet, the lead as recipient)
// ============================================================================

// When: the app's one rule (format.js whenLabel), in the firm's locale.
const when = whenLabel

export default function BuyerAskModal({ store, go, Modal, id }) {
  const [s, setS] = useState({ loading: true })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  useEffect(() => {
    let live = true
    api.buyerAsk(id)
      .then(r => { if (live) setS({ loading: false, a: r }) })
      .catch(e => { if (live) setS({ loading: false, a: null, missing: e?.status === 404 }) })
    return () => { live = false }
  }, [id])

  const a = s.a
  const who = a?.lead?.name || a?.name || a?.lead?.phone || 'A buyer'
  const title = !a ? 'Buyer' : a.kind === 'callback' ? `${who} asked for a call back`
    : a.kind === 'visit' ? `${who} asked to visit`
    : `${a.homes.length === 1 ? '1 new home matches' : `${a.homes.length} new homes match`} ${who}`
  const openLead = () => { store.closeModal(); go('leads', { leadId: a.lead.id, leadOpen: true }) }

  const confirm = async () => {
    if (busy) return
    setBusy(true); setErr('')
    try {
      await api.confirmBuyerVisit(a.id)
      store.touched?.()
      store.toast('Site visit booked')
      setS(x => ({ ...x, a: { ...x.a, status: 'confirmed' } }))
    } catch (e) {
      setErr(e?.status === 409 ? 'That time has passed. Pick another time.'
        : e?.status === 403 ? (e?.body?.message || 'Only the person holding this lead, or the office, can confirm it.')
        : e instanceof TypeError ? 'No connection. Nothing was booked.' : 'Could not book it. Try again.')
    } finally { setBusy(false) }
  }

  // The schedule and Send sheets read the lead from the store; an alert can
  // name a lead no screen has loaded yet.
  const withLead = async (then) => {
    if (busy) return
    setBusy(true)
    try {
      if (!store.lookup('lead', a.lead.id)) {
        const r = await api.getLead(a.lead.id)
        const rec = r?.data || r?.lead || r
        if (rec?.id) store.cacheRecords('lead', [rec])
      }
      then()
    } catch { setErr('Could not open the lead. Try again.') } finally { setBusy(false) }
  }
  const anotherTime = () => withLead(() => store.openModal({ kind: 'scheduleFollowUp', leadId: a.lead.id }))
  const sendHomes = () => withLead(() => openSend(store, a.homes.map(h => ({ id: h.id, title: h.title, inCatalogue: true })), { leadId: a.lead.id }))

  return (
    <Modal title={title} onClose={store.closeModal} width={440}>
      {s.loading ? (
        <div className="mylinks-empty"><span className="snd-spin" aria-label="Loading" /></div>
      ) : !a ? (
        <>
          <div className="mylinks-empty">{s.missing ? 'This is no longer here.' : 'Could not load it.'}</div>
          <div className="mfm-foot"><Button variant="primary" onClick={store.closeModal}>Close</Button></div>
        </>
      ) : (
        <>
          <div className="bask">
            {a.home && <div className="bask-row"><Icon name="building" size={15} /><span>{a.home.title}</span></div>}
            {a.kind === 'visit' && <div className="bask-row"><Icon name="calendar" size={15} /><span>{when(a.at)}</span></div>}
            {a.kind === 'callback' && a.at && new Date(a.at) > new Date() && <div className="bask-row"><Icon name="clock" size={15} /><span>{when(a.at)}</span></div>}
            {a.kind === 'homes' && a.ask && <div className="bask-row"><Icon name="search" size={15} /><span>{a.ask}</span></div>}
            {a.kind === 'homes' && a.homes.map(h => <div key={h.id} className="bask-home">{h.title}</div>)}
            {/* What they typed, when it is not what the lead already says. */}
            {a.name && a.name !== a.lead.name && <div className="bask-row bask-sub"><Icon name="person" size={15} /><span>{a.name}</span></div>}
            {a.phone && a.lead.phone && String(a.phone).replace(/\D/g, '').slice(-10) !== String(a.lead.phone).replace(/\D/g, '').slice(-10)
              && <div className="bask-row bask-sub"><Icon name="phone" size={15} /><span className="mono-num">{a.phone}</span></div>}
          </div>
          {err && <div className="snd-err" role="alert">{err}</div>}
          <div className="mfm-foot">
            <Button onClick={openLead}>Open lead</Button>
            {a.kind === 'callback' && (a.lead.phone || a.phone) && (
              <Button variant="primary" icon="phone" onClick={() => store.openModal({ kind: 'contact', channel: 'call', name: who, phone: a.lead.phone || a.phone, recordType: 'lead', recordId: a.lead.id })}>Call</Button>
            )}
            {a.kind === 'visit' && (a.status === 'confirmed'
              ? <Button variant="primary" icon="check" disabled>Booked</Button>
              : <>
                <Button disabled={busy} onClick={anotherTime}>Another time</Button>
                <Button variant="primary" disabled={busy} onClick={confirm}>{busy ? 'Booking…' : 'Confirm'}</Button>
              </>)}
            {a.kind === 'homes' && a.homes.length > 0 && (
              <Button variant="primary" icon="wa" disabled={busy} onClick={sendHomes}>Send</Button>
            )}
          </div>
        </>
      )}
    </Modal>
  )
}
