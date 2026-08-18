import { useEffect, useState } from 'react'
import { api } from '../lib/api.js'
import { WaCanvas } from '../components/chrome.jsx'
import { Segmented } from '../components/primitives.jsx'
import Icon from '../components/Icon.jsx'
import { thumbTint, fitReasons } from '../lib/format.js'
import { whatsappLink, matchesForLead } from '../lib/matching.js'
import { MESSAGE_LANGUAGES } from '../data/vocabLocale.js'
import { WA_OUTCOMES } from '../data/callOutcomes.js'

// ============================================================================
// 💬 THE WHATSAPP COMPOSER — one component, every entry point
// ============================================================================
// It used to take three screens to send one message: a channel chooser, then a
// "pick a match" list, then this. And opening it from a lead with no property
// (mobile does exactly that) rendered nothing at all, because it returned null
// without one.
//
// Now the property is chosen INSIDE the composer, from the lead's own shortlist
// first and system matches after — so the common case, sharing something
// already shortlisted, is one click from the lead. Sending with no property is
// a first-class option, not a dead end: plenty of follow-ups are just a message.
// ============================================================================

export default function WaModal({ store }) {
  const wa = store.state.waState
  // Candidate listings for the attach menu. Fetched for the lead in play rather
  // than derived from every property in the firm; the shortlist is pinned from
  // the cache. Declared before the early return — a hook cannot be conditional.
  const [cands, setCands] = useState([])
  // The logged event, once the message has gone. Holding its id is what makes
  // the outcome step possible without a second round trip to find it.
  const [sent, setSent] = useState(null)
  const [outcome, setOutcome] = useState(WA_OUTCOMES[0].value)
  const [reply, setReply] = useState('')
  const leadId = wa?.leadId || null
  useEffect(() => {
    if (!leadId) { setCands([]); return }
    let live = true
    api.getLeadMatches(leadId).then(r => {
      if (!live) return
      const rows = r?.data || []
      setCands(rows)
      // Into the shared cache, not only this component's state. Picking a MATCHED
      // listing set `propId` and left composeFor unable to resolve it — so
      // attaching a match produced the generic follow-up text with no property in
      // it, exactly as the shortlist did. A record the composer can offer is a
      // record the composer must be able to describe.
      if (rows.length) store.cacheRecords('property', rows)
    }).catch(() => { if (live) setCands([]) })
    return () => { live = false }
  }, [leadId])

  if (!wa) return null
  const l = store.lookup('lead', wa.leadId)
  // The lead carries its shortlisted properties from the server. Reaching for
  // the browser's property cache FIRST is what broke this: that cache holds
  // whatever the listings page paged in, which on a desk with thousands of
  // rows is none of the shortlist — so tapping "Share Match" on a shortlisted
  // flat opened a composer reading "No property — message only" with zero
  // options, on a lead that had four. Same defect as the record's inventory
  // section; this is the client-facing half of it, and it decided what a
  // buyer actually received.
  const fromLead = (id) => (l?.shortlistProps || []).find(x => x.id === id) || null
  const p = fromLead(wa.propId) || store.lookup('property', wa.propId)

  // Shortlisted first — someone put them there on purpose — then what the
  // system found, minus anything already shortlisted.
  const options = (() => {
    if (!l) return []
    const short = (l.shortlist || []).map(id => fromLead(id) || store.lookup('property', id)).filter(Boolean)
    const shortIds = new Set(short.map(x => x.id))
    const matched = matchesForLead(l, cands).filter(m => !shortIds.has(m.id))
    return [
      ...short.map(x => ({ p: x, tag: 'Shortlisted' })),
      ...matched.map(x => ({ p: x, tag: `${fitReasons(x, l.req).score}% match` })),
    ]
  })()

  const copy = () => {
    navigator.clipboard?.writeText(wa.message || '')
      .then(() => store.toast('Message copied'))
      .catch(() => store.toast('Could not copy — select the text and copy it', 'warn'))
  }
  // PERSIST it. store.logEvent() only dispatches into local React state, so the
  // entry looked right until the next server read — and any other action that
  // reloads (logging a call does) replaced the timeline with the server's copy,
  // silently erasing the WhatsApp send that was never written anywhere.
  const noteFor = () => (p ? `Sent ${p.society} (${p.priceLabel}) details on WhatsApp` : 'Sent a WhatsApp message')
  const send = () => {
    if (l) {
      const note = noteFor()
      store.logContactAction('lead', l.id, 'wa')
        .then(res => {
          const evtId = res?.timeline_event?.id
          if (evtId) { store.editRemark('lead', l.id, evtId, note); setSent(evtId) }
          else store.closeWhatsApp()
        })
    }
    window.open(whatsappLink(wa.message, l?.phone), '_blank', 'noopener')
    // NOT closed here. The composer used to vanish the instant WhatsApp opened,
    // which is why a message could never carry an outcome: by the time the agent
    // came back and knew whether anyone had replied, the only way to say so was
    // to find the entry in the timeline and edit it. 219 WhatsApp events on the
    // live desk carry no outcome at all, against 186 calls that mostly do —
    // the difference is entirely that calls were asked and messages were not.
    //
    // So the sheet stays, showing the outcome step, and is waiting when the tab
    // is switched back. Closing it without answering is allowed and leaves the
    // entry exactly as it is: sent, outcome unknown, which is the truth.
  }

  const saveOutcome = () => {
    // The key, not the label — see the note in callOutcomes.js.
    if (l && sent) store.editRemark('lead', l.id, sent, reply.trim() || noteFor(), outcome)
    store.closeWhatsApp()
  }

  return (
    // Once a reply has been typed into the outcome step, a stray tap on the
    // backdrop no longer throws it away — the same rule the modal frame applies.
    <div className="overlay wa-overlay" onClick={() => { if (!reply.trim()) store.closeWhatsApp() }}>
      <div className="wa-sheet" onClick={e => e.stopPropagation()}>
        <div className="wa-grab" />
        <div className="wa-head">
          <Icon name="wa" size={19} fill />
          <div className="wa-head-t">{l ? l.name : 'WhatsApp message'}</div>
          {l?.phone && <span className="wa-head-p mono-num">{l.phone}</span>}
          <button className="wa-x" onClick={store.closeWhatsApp} aria-label="Close"><Icon name="x" /></button>
        </div>

        {/* AFTER THE SEND. One question, the chips the rest of the app uses for
            an outcome, and a box for what they actually said — which is the part
            a colleague reads six weeks later. */}
        {sent ? (
          <>
            <div className="wa-out">
              <label className="wa-attach-l">What happened</label>
              <div className="chiprow wrap">
                {WA_OUTCOMES.map(o => (
                  <button key={o.value} type="button"
                    className={'chipo' + (o.value === outcome ? ' on' : '')}
                    onClick={() => setOutcome(o.value)}>{o.label}</button>
                ))}
              </div>
              <textarea className="input wa-out-t" rows={3} value={reply}
                onChange={e => setReply(e.target.value)} placeholder="Their reply, in their words" />
            </div>
            <div className="wa-foot">
              <button className="btn btn-primary wa-send" onClick={saveOutcome}>
                <Icon name="check" />Save outcome
              </button>
              <button className="btn wa-alt" onClick={store.closeWhatsApp}>Not yet</button>
            </div>
          </>
        ) : (<>

        {l && (
          <div className="wa-attach">
            <label className="wa-attach-l">Attach</label>
            <div className="wa-sel-w">
              <select className="wa-sel" value={p?.id || ''}
                onChange={e => store.recompose({ propId: e.target.value || null })}>
                <option value="">No property — message only</option>
                {options.length > 0 && (
                  <optgroup label="Shortlisted">
                    {options.filter(o => o.tag === 'Shortlisted').map(({ p: op }) => (
                      <option key={op.id} value={op.id}>{op.society} · {op.priceLabel}</option>
                    ))}
                  </optgroup>
                )}
                {options.some(o => o.tag !== 'Shortlisted') && (
                  <optgroup label="Matches">
                    {options.filter(o => o.tag !== 'Shortlisted').map(({ p: op, tag }) => (
                      <option key={op.id} value={op.id}>{op.society} · {op.priceLabel} · {tag}</option>
                    ))}
                  </optgroup>
                )}
              </select>
              <Icon name="chevDown" size={15} />
            </div>
            {p && (
              <span className="wa-chip">
                <span className="wa-chip-th" style={{ background: thumbTint(p.id) }}>
                  <Icon name="building" size={13} strokeWidth={1.4} />
                </span>
                {p.society}
                <button type="button" onClick={() => store.recompose({ propId: null })} aria-label="Detach">
                  <Icon name="x" size={12} />
                </button>
              </span>
            )}
          </div>
        )}

        {p && (
          <div className="wa-ctl">
            <Segmented value={wa.lang} onChange={v => store.recompose({ lang: v })} options={MESSAGE_LANGUAGES} />
            <Segmented value={wa.tone} onChange={v => store.recompose({ tone: v })} options={['Standard', 'Short']} />
            {/* Only offered when there is one to add. A dead toggle on every
                listing that has no description teaches people to ignore it. */}
            {p.description && wa.tone !== 'Short' && (
              <button type="button"
                className={'wa-desc' + (wa.withDescription ? ' on' : '')}
                aria-pressed={!!wa.withDescription}
                onClick={() => store.recompose({ withDescription: !wa.withDescription })}>
                <Icon name={wa.withDescription ? 'check' : 'plus'} size={13} />
                Description
                <span className="wa-desc-n">{p.description.trim().length}</span>
              </button>
            )}
          </div>
        )}

        <WaCanvas message={wa.message} deva={wa.lang === 'Marathi'}
          style={{ borderRadius: 0, minHeight: 190, flex: 1, overflowY: 'auto' }} />

        <div className="wa-foot">
          <button className="btn btn-primary wa-send" onClick={send} disabled={!wa.message}>
            <Icon name="wa" />Open in WhatsApp
          </button>
          <button className="btn wa-alt" onClick={copy} disabled={!wa.message}><Icon name="copy" />Copy</button>
        </div>
        </>)}
      </div>
    </div>
  )
}
