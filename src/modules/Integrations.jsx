import { theme } from '../data/theme.js'
import Icon from '../components/Icon.jsx'

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
          <div className="u-muted" style={{ fontSize: 13.5, marginBottom: 18, maxWidth: 600 }}>These switch on with your own accounts. Leads, calls and messages flow straight into {theme.brand.firmName} — no copy-paste. Nothing here is live in the demo; it's wired to your credentials on setup.</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            {CARDS.map(c => (
              <button key={c.key} onClick={() => store.openModal({ kind: 'integration', card: c })}
                style={{ textAlign: 'left', background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 12, padding: '17px 18px', display: 'flex', flexDirection: 'column', gap: 11, cursor: 'pointer', fontFamily: 'inherit' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ width: 42, height: 42, borderRadius: 9, background: 'var(--card-2)', border: '1px solid var(--line)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--disp)', fontWeight: 700, fontSize: 15, color: 'var(--ink)' }}>{c.mark}</div>
                  <div style={{ flex: 1 }}><div style={{ fontFamily: 'var(--disp)', fontWeight: 600, fontSize: 14.5 }}>{c.key}</div><div className="u-muted" style={{ fontSize: 12 }}>{c.desc}</div></div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11.5, fontWeight: 600, color: c.staged ? 'var(--accent-ink)' : 'var(--muted)', background: c.staged ? 'var(--accent-wash)' : 'var(--line-2)', borderRadius: 14, padding: '4px 10px' }}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'currentColor' }} />{c.staged ? 'Connects to your account' : 'Custom add-on'}
                  </span>
                  <span className="btn btn-ghost btn-sm">View</span>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </>
  )
}
