import { useEffect, useState } from 'react'
import { theme } from '../data/theme.js'
import Icon from '../components/Icon.jsx'
import { api } from '../lib/api.js'

// Portals we hand a ready-made push URL. The portal only needs a URL, so the
// tenant key rides in ?key=.
const INGEST_SOURCES = [
  { key: '99acres', label: '99acres' },
  { key: 'magicbricks', label: 'MagicBricks' },
  { key: 'website', label: 'Website form' },
]

function LeadCapture({ store }) {
  const [cfg, setCfg] = useState(null)
  const [copied, setCopied] = useState('')
  const canManage = store.state.role === 'admin'

  useEffect(() => { api.getIngestConfig().then(r => r?.success && setCfg(r)).catch(() => {}) }, [])

  const urlFor = (source) => cfg ? `${api.baseUrl()}/ingest/${cfg.tenantSlug}/${source}?key=${cfg.secret}` : ''
  const copy = (source) => {
    const u = urlFor(source)
    if (!u) return
    navigator.clipboard?.writeText(u).then(() => { setCopied(source); setTimeout(() => setCopied(''), 1400) }).catch(() => {})
  }
  const rotate = () => {
    if (!window.confirm('Rotate the ingest key? Any URL you already gave a portal will stop working until you paste the new one.')) return
    api.regenerateIngestKey().then(r => { if (r?.success) { setCfg(r); store.toast('Ingest key rotated — update your portals') } }).catch(() => store.toast('Could not rotate key', 'warn'))
  }

  return (
    <div style={{ marginBottom: 30 }}>
      <div style={{ fontSize: 11, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--muted)', fontWeight: 700, marginBottom: 10 }}>Lead capture URLs</div>
      <div className="u-muted" style={{ fontSize: 13.5, marginBottom: 14, maxWidth: 640 }}>
        Paste the matching URL into your portal's lead push / webhook field. New enquiries land in {theme.brand.firmName} automatically, de-duplicated and round-robined to your team. Keep the key private.
      </div>
      <div style={{ background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 12, overflow: 'hidden' }}>
        {INGEST_SOURCES.map((s, i) => (
          <div key={s.key} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 16px', borderTop: i ? '1px solid var(--line-2)' : 'none' }}>
            <div style={{ width: 96, flexShrink: 0, fontWeight: 600, fontSize: 13.5 }}>{s.label}</div>
            <code style={{ flex: 1, minWidth: 0, fontSize: 12, fontFamily: 'var(--mono)', color: 'var(--ink-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {cfg ? urlFor(s.key) : 'Loading…'}
            </code>
            <button className="btn btn-secondary btn-sm" onClick={() => copy(s.key)} disabled={!cfg} style={{ flexShrink: 0 }}>
              <Icon name={copied === s.key ? 'check' : 'copy'} size={13} />{copied === s.key ? 'Copied' : 'Copy'}
            </button>
          </div>
        ))}
      </div>
      {canManage && (
        <button className="btn btn-ghost btn-sm" onClick={rotate} style={{ marginTop: 10, color: 'var(--muted)' }}>
          <Icon name="refresh" size={13} />Rotate key
        </button>
      )}
    </div>
  )
}

const CARDS = [
  { key: '99acres', mark: '99', desc: 'Auto-import buyer leads the moment they enquire.', staged: true },
  { key: 'MagicBricks', mark: 'MB', desc: 'Sync listings and pull matched enquiries.', staged: true },
  { key: 'Calling & SMS', mark: '☎', desc: 'Click-to-call and log every conversation.', staged: true },
  { key: 'WhatsApp Business API', mark: 'WA', desc: 'Send generated messages from your own number.', staged: true },
  { key: 'Website sync', mark: '⌘', desc: 'Enquiry forms drop straight into your pipeline.', staged: false },
]

export default function Integrations({ store, topBar }) {
  return (
    <>
      {topBar({ title: 'Integrations' })}
      <div className="app-body" style={{ padding: '20px 22px 44px' }}>
        <div style={{ maxWidth: 900 }}>
          <LeadCapture store={store} />

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

          <div style={{ fontSize: 11, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--muted)', fontWeight: 700, marginBottom: 10 }}>Connect your channels</div>
          <div className="u-muted" style={{ fontSize: 13.5, marginBottom: 18, maxWidth: 600 }}>These switch on with your own accounts. Leads, calls and messages flow straight into {theme.brand.firmName} — no copy-paste. All integrations are live and wired directly to your PostgreSQL database credentials.</div>
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
