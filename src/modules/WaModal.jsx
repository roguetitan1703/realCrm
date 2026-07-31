import { WaCanvas } from '../components/chrome.jsx'
import { Segmented } from '../components/primitives.jsx'
import Icon from '../components/Icon.jsx'
import { thumbTint, fitReasons } from '../lib/format.js'
import { whatsappLink, matchesForLead } from '../lib/matching.js'

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
  if (!wa) return null
  const p = store.state.properties.find(x => x.id === wa.propId) || null
  const l = store.state.leads.find(x => x.id === wa.leadId) || null

  // Shortlisted first — someone put them there on purpose — then what the
  // system found, minus anything already shortlisted.
  const options = (() => {
    if (!l) return []
    const short = (l.shortlist || []).map(id => store.state.properties.find(x => x.id === id)).filter(Boolean)
    const shortIds = new Set(short.map(x => x.id))
    const matched = matchesForLead(l, store.state.properties).filter(m => !shortIds.has(m.id))
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
  const send = () => {
    if (l) {
      store.logEvent(l.id, 'wa', p
        ? `Sent ${p.society} (${p.priceLabel}) details on WhatsApp`
        : 'Sent a WhatsApp message')
    }
    window.open(whatsappLink(wa.message, l?.phone), '_blank', 'noopener')
    store.closeWhatsApp()
  }

  return (
    <div className="overlay" onClick={store.closeWhatsApp}>
      <div className="wa-sheet" onClick={e => e.stopPropagation()}>
        <div className="wa-head">
          <Icon name="wa" size={19} fill />
          <div className="wa-head-t">{l ? l.name : 'WhatsApp message'}</div>
          {l?.phone && <span className="wa-head-p mono-num">{l.phone}</span>}
          <button className="wa-x" onClick={store.closeWhatsApp} aria-label="Close"><Icon name="x" /></button>
        </div>

        {l && (
          <div className="wa-pick">
            <button className={'wa-opt' + (!p ? ' on' : '')} onClick={() => store.recompose({ propId: null })}>
              <span className="wa-opt-b">
                <span className="wa-opt-n">No property</span>
                <span className="wa-opt-s">Message only</span>
              </span>
            </button>
            {options.map(({ p: op, tag }) => (
              <button key={op.id} className={'wa-opt' + (p?.id === op.id ? ' on' : '')}
                onClick={() => store.recompose({ propId: op.id })}>
                <span className="wa-opt-th" style={{ background: thumbTint(op.id) }}>
                  <Icon name="building" size={15} strokeWidth={1.4} />
                </span>
                <span className="wa-opt-b">
                  <span className="wa-opt-n">{op.society}</span>
                  <span className="wa-opt-s">{op.priceLabel} · {tag}</span>
                </span>
              </button>
            ))}
          </div>
        )}

        {p && (
          <div className="wa-ctl">
            <Segmented value={wa.lang} onChange={v => store.recompose({ lang: v })} options={['Hinglish', 'English', 'Marathi']} />
            <Segmented value={wa.tone} onChange={v => store.recompose({ tone: v })} options={['Standard', 'Short']} />
            <button className="wa-var" title="Another wording" onClick={() => store.recompose({ variant: wa.variant + 1 })}>
              <Icon name="refresh" size={15} />
            </button>
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
