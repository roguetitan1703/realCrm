import { useEffect, useState } from 'react'
import { api } from '../lib/api.js'
import { WaCanvas } from '../components/chrome.jsx'
import { Segmented } from '../components/primitives.jsx'
import Icon from '../components/Icon.jsx'
import { thumbTint, fitReasons } from '../lib/format.js'
import { whatsappLink, matchesForLead } from '../lib/matching.js'
import { MESSAGE_LANGUAGES } from '../data/vocabLocale.js'

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
  const leadId = wa?.leadId || null
  useEffect(() => {
    if (!leadId) { setCands([]); return }
    let live = true
    api.getLeadMatches(leadId).then(r => { if (live) setCands(r?.data || []) }).catch(() => { if (live) setCands([]) })
    return () => { live = false }
  }, [leadId])

  if (!wa) return null
  const p = store.lookup('property', wa.propId)
  const l = store.lookup('lead', wa.leadId)

  // Shortlisted first — someone put them there on purpose — then what the
  // system found, minus anything already shortlisted.
  const options = (() => {
    if (!l) return []
    const short = (l.shortlist || []).map(id => store.lookup('property', id)).filter(Boolean)
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
  const send = () => {
    if (l) {
      const note = p ? `Sent ${p.society} (${p.priceLabel}) details on WhatsApp` : 'Sent a WhatsApp message'
      store.logContactAction('lead', l.id, 'wa')
        .then(res => {
          const evtId = res?.timeline_event?.id
          if (evtId) store.editRemark('lead', l.id, evtId, note)
        })
    }
    window.open(whatsappLink(wa.message, l?.phone), '_blank', 'noopener')
    store.closeWhatsApp()
  }

  return (
    <div className="overlay wa-overlay" onClick={store.closeWhatsApp}>
      <div className="wa-sheet" onClick={e => e.stopPropagation()}>
        <div className="wa-grab" />
        <div className="wa-head">
          <Icon name="wa" size={19} fill />
          <div className="wa-head-t">{l ? l.name : 'WhatsApp message'}</div>
          {l?.phone && <span className="wa-head-p mono-num">{l.phone}</span>}
          <button className="wa-x" onClick={store.closeWhatsApp} aria-label="Close"><Icon name="x" /></button>
        </div>

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
      </div>
    </div>
  )
}
