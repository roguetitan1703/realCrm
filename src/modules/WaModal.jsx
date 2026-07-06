import { WaCanvas } from '../components/chrome.jsx'
import { Segmented, Button, Money } from '../components/primitives.jsx'
import Icon from '../components/Icon.jsx'
import { thumbTint } from '../lib/format.js'

export default function WaModal({ store }) {
  const wa = store.state.waState
  const p = store.state.properties.find(x => x.id === wa.propId)
  const l = store.state.leads.find(x => x.id === wa.leadId)
  if (!p) return null
  const statusLabel = wa.lang === 'Marathi' ? 'Writing in Marathi…' : wa.lang === 'English' ? 'Writing in English…' : 'Writing in Hinglish…'
  const copy = () => { try { navigator.clipboard.writeText(wa.message || '') } catch {} store.toast('Message copied') }

  return (
    <div className="overlay" onClick={store.closeWhatsApp}>
      <div style={{ width: 460, maxWidth: '100%', maxHeight: '92vh', background: 'var(--chrome)', borderRadius: 12, overflow: 'hidden', display: 'flex', flexDirection: 'column', boxShadow: 'var(--shadow-pop)' }} onClick={e => e.stopPropagation()}>
        <div style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 10, color: '#fff' }}>
          <Icon name="wa" size={19} fill />
          <div style={{ flex: 1, fontFamily: 'var(--disp)', fontWeight: 600, fontSize: 15 }}>WhatsApp message</div>
          <button className="btn btn-icon" style={{ background: 'transparent', border: 'none', color: 'var(--on-chrome-mut)' }} onClick={store.closeWhatsApp}><Icon name="x" /></button>
        </div>
        <div style={{ padding: '0 16px 12px' }}>
          <div style={{ background: 'rgba(255,255,255,.06)', border: '1px solid rgba(30,111,82,.4)', borderRadius: 10, padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 11 }}>
            <div style={{ width: 40, height: 40, borderRadius: 8, background: thumbTint(p.id), display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: 'var(--muted)' }}><Icon name="building" size={20} strokeWidth={1.4} /></div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ color: '#fff', fontWeight: 600, fontSize: 13.5 }}>{p.title}</div>
              <div style={{ color: 'var(--on-chrome-mut)', fontSize: 11.5 }}>{p.society} · {p.deal === 'rent' ? 'For rent' : 'For sale'}{l ? ' · for ' + l.name.split(' ')[0] : ''}</div>
            </div>
            <span style={{ fontWeight: 700, fontSize: 15, color: '#7FD4B0' }} className="mono-num">{p.priceLabel}</span>
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 10, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--on-chrome-mut)', marginBottom: 5, fontWeight: 700 }}>Language</div>
              <Segmented value={wa.lang} onChange={v => store.recompose({ lang: v })} options={['Hinglish', 'English', 'Marathi']} />
            </div>
            <div>
              <div style={{ fontSize: 10, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--on-chrome-mut)', marginBottom: 5, fontWeight: 700 }}>Tone</div>
              <Segmented value={wa.tone} onChange={v => store.recompose({ tone: v })} options={['Standard', 'Short']} />
            </div>
          </div>
        </div>
        <WaCanvas composing={wa.composing} message={wa.message} statusLabel={statusLabel} deva={wa.lang === 'Marathi'}
          style={{ borderRadius: 0, minHeight: 220, flex: 1, overflowY: 'auto' }} />
        {!wa.composing && wa.message && (
          <div style={{ padding: '12px 14px', display: 'flex', gap: 9, borderTop: '1px solid rgba(255,255,255,.08)' }}>
            <button className="btn btn-primary" style={{ flex: 1.4, justifyContent: 'center' }} onClick={copy}><Icon name="copy" />Copy message</button>
            <button className="btn" style={{ flex: 1, justifyContent: 'center', background: 'rgba(255,255,255,.06)', color: '#fff', border: '1px solid rgba(255,255,255,.14)' }} onClick={() => store.recompose({ variant: wa.variant + 1 })}><Icon name="refresh" />Regenerate</button>
          </div>
        )}
      </div>
    </div>
  )
}
