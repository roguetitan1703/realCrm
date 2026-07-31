import { useEffect, useState } from 'react'
import { theme } from '../data/theme.js'
import Icon from '../components/Icon.jsx'
import { api } from '../lib/api.js'
import Connections from './Connections.jsx'

// The old LeadCapture block lived here: ONE key for the whole workspace, with
// a hardcoded list of three portals and a URL per portal. It is replaced by
// Connections (D1) — a key per provider, so a key can be rotated or paused for
// one portal without breaking the rest, and the key alone tells us which
// tenant and which provider a push belongs to.

const CARDS = [
  { key: '99acres', mark: '99', desc: 'Auto-import buyer leads the moment they enquire.', staged: true },
  { key: 'MagicBricks', mark: 'MB', desc: 'Sync listings and pull matched enquiries.', staged: true },
  { key: 'Website sync', mark: '⌘', desc: 'Enquiry forms drop straight into your pipeline.', staged: false },
]

// Calling and WhatsApp aren't "integrations" — no account, no API, nothing to
// switch on. Every phone number in the CRM is tap-to-call (opens the phone's
// dialer) and every share opens WhatsApp with the message ready. These rows just
// demonstrate that: clicking them opens the real dialer / WhatsApp.
const BUILT_IN = [
  { key: 'call', mark: '☎', title: 'Calling', desc: 'Tap any phone number to call — your phone\'s dialer opens with the number filled in. Calls are logged against the lead.', open: () => { window.location.href = 'tel:' }, cta: 'Open dialer' },
  { key: 'wa', mark: 'WA', title: 'WhatsApp', desc: 'Share a listing and WhatsApp opens with the message ready to send from your own number — no Business API, no extra cost.', open: () => window.open('https://wa.me/', '_blank', 'noopener'), cta: 'Open WhatsApp' },
]

export default function Integrations({ store, topBar }) {
  return (
    <>
      {topBar({ title: 'Integrations' })}
      <div className="app-body" style={{ padding: '20px 22px 44px' }}>
        <div style={{ maxWidth: 900 }}>
          <Connections store={store} />

          {/* Bring-your-data — the migration on-ramp */}
          <div style={{ fontSize: 11, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--muted)', fontWeight: 700, marginBottom: 10 }}>Bring your data</div>
          <button onClick={() => store.openModal({ kind: 'import' })}
            style={{ width: '100%', textAlign: 'left', background: 'var(--card)', border: '1px solid var(--accent-line)', borderRadius: 12, padding: '18px 20px', display: 'flex', alignItems: 'center', gap: 16, cursor: 'pointer', fontFamily: 'inherit', marginBottom: 26 }}>
            <div style={{ width: 46, height: 46, borderRadius: 10, background: 'var(--accent-wash)', color: 'var(--accent-ink)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Icon name="layers" size={22} /></div>
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: 'var(--disp)', fontWeight: 600, fontSize: 15.5 }}>Import from Excel / Google Sheets</div>
              <div className="u-muted" style={{ fontSize: 12.5, marginTop: 2 }}>Bring your existing clients & inventory in one go — drop a sheet, we map the columns. No manual re-entry.</div>
            </div>
            <span className="btn btn-primary btn-sm"><Icon name="plus" size={14} />Import</span>
          </button>

          {/* Built-in channels — calling + WhatsApp, no setup */}
          <div style={{ fontSize: 11, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--muted)', fontWeight: 700, marginBottom: 10 }}>Built in · nothing to connect</div>
          <div className="u-muted" style={{ fontSize: 13.5, marginBottom: 14, maxWidth: 600 }}>Calling and WhatsApp work the moment you add a contact — they open your phone's dialer and WhatsApp directly. There's no account to link and no API to pay for.</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 26 }}>
            {BUILT_IN.map(b => (
              <button key={b.key} onClick={b.open}
                style={{ textAlign: 'left', background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 12, padding: '17px 18px', display: 'flex', flexDirection: 'column', gap: 11, cursor: 'pointer', fontFamily: 'inherit' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ width: 42, height: 42, borderRadius: 9, background: 'var(--accent-wash)', color: 'var(--accent-ink)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--disp)', fontWeight: 700, fontSize: 15 }}>{b.mark}</div>
                  <div style={{ flex: 1 }}><div style={{ fontFamily: 'var(--disp)', fontWeight: 600, fontSize: 14.5 }}>{b.title}</div><div className="u-muted" style={{ fontSize: 12 }}>{b.desc}</div></div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11.5, fontWeight: 600, color: 'var(--accent-ink)', background: 'var(--accent-wash)', borderRadius: 14, padding: '4px 10px' }}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#10b981' }} />Always on
                  </span>
                  <span className="btn btn-ghost btn-sm">{b.cta}</span>
                </div>
              </button>
            ))}
          </div>

          <div style={{ fontSize: 11, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--muted)', fontWeight: 700, marginBottom: 10 }}>Connect your channels</div>
          <div className="u-muted" style={{ fontSize: 13.5, marginBottom: 18, maxWidth: 600 }}>Portal leads land in {theme.brand.firmName} automatically through the capture URLs above — no copy-paste. These cards cover the portals you can wire up.</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            {CARDS.map(c => {
              const isActive = store.state.integrations?.[c.key]?.status === 'active'
              return (
                <button key={c.key} onClick={() => store.openModal({ kind: 'integration', card: c })}
                  style={{ textAlign: 'left', background: 'var(--card)', border: '1px solid ' + (isActive ? 'var(--accent-line)' : 'var(--line)'), borderRadius: 12, padding: '17px 18px', display: 'flex', flexDirection: 'column', gap: 11, cursor: 'pointer', fontFamily: 'inherit' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ width: 42, height: 42, borderRadius: 9, background: isActive ? 'var(--accent-wash)' : 'var(--card-2)', border: '1px solid var(--line)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--disp)', fontWeight: 700, fontSize: 15, color: isActive ? 'var(--accent-ink)' : 'var(--ink)' }}>{c.mark}</div>
                    <div style={{ flex: 1 }}><div style={{ fontFamily: 'var(--disp)', fontWeight: 600, fontSize: 14.5 }}>{c.key}</div><div className="u-muted" style={{ fontSize: 12 }}>{c.desc}</div></div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11.5, fontWeight: 600, color: isActive ? 'var(--accent-ink)' : c.staged ? 'var(--ink-2)' : 'var(--muted)', background: isActive ? 'var(--accent-wash)' : c.staged ? 'var(--line-2)' : 'var(--line)', borderRadius: 14, padding: '4px 10px' }}>
                      <span style={{ width: 6, height: 6, borderRadius: '50%', background: isActive ? '#10b981' : 'currentColor' }} />
                      {isActive ? 'Active · Connected' : c.staged ? 'Connects to your account' : 'Custom add-on'}
                    </span>
                    <span className="btn btn-ghost btn-sm">{isActive ? 'Configure' : 'View'}</span>
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      </div>
    </>
  )
}
