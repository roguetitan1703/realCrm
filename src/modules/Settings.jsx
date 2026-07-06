import { Panel, SectionHead, StageTag } from '../components/primitives.jsx'
import Icon from '../components/Icon.jsx'
import { theme } from '../data/theme.js'

const SWATCHES = [
  ['Paper', '#F6F5F2'], ['Card', '#FFFFFF'], ['Ink', '#23231F'], ['Chrome', '#22242A'], ['Green', '#1E6F52'],
]

export default function Settings({ topBar }) {
  return (
    <>
      {topBar({ title: 'Settings' })}
      <div className="app-body" style={{ padding: '20px 22px 44px' }}>
        <div style={{ maxWidth: 860, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ background: 'var(--chrome)', color: '#fff', borderRadius: 12, padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 13 }}>
            <Icon name="layers" size={22} style={{ color: '#7FD4B0' }} />
            <div>
              <div style={{ fontFamily: 'var(--disp)', fontWeight: 600, fontSize: 15 }}>White-label — this is your brand, your data</div>
              <div style={{ fontSize: 12.5, color: 'var(--on-chrome-mut)' }}>Everything below is a config swap. The next brokerage is a new theme, not a rebuild.</div>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr', gap: 16, alignItems: 'start' }}>
            <Panel>
              <SectionHead title="Brand" />
              <div style={{ display: 'flex', gap: 15, alignItems: 'center', marginBottom: 16 }}>
                <div style={{ width: 64, height: 64, borderRadius: 12, background: 'var(--accent)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--disp)', fontWeight: 700, fontSize: 22 }}>{theme.brand.initials}</div>
                <div style={{ flex: 1 }}>
                  <div className="u-muted" style={{ fontSize: 11, marginBottom: 5 }}>Firm name</div>
                  <div style={{ background: 'var(--card-2)', border: '1px solid var(--line)', borderRadius: 8, padding: '10px 12px', fontWeight: 600 }}>{theme.brand.firmName}</div>
                </div>
              </div>
              <div className="u-muted" style={{ fontSize: 11, marginBottom: 8 }}>Brand colours</div>
              <div style={{ display: 'flex', gap: 10 }}>
                {SWATCHES.map(([n, c]) => (
                  <div key={n} style={{ textAlign: 'center' }}>
                    <div style={{ width: 46, height: 46, borderRadius: 8, border: '1px solid rgba(0,0,0,.08)', background: c }} />
                    <div className="u-muted" style={{ fontSize: 10, marginTop: 4 }}>{n}</div>
                  </div>
                ))}
              </div>
            </Panel>
            <Panel>
              <SectionHead title="Pipeline stages" />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {theme.stages.map(s => (
                  <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 9, background: 'var(--card-2)', border: '1px solid var(--line-2)', borderRadius: 8, padding: '8px 11px' }}>
                    <Icon name="dots" size={13} style={{ color: 'var(--faint)' }} /><StageTag stage={s} />
                  </div>
                ))}
              </div>
            </Panel>
          </div>
          <Panel>
            <SectionHead title="Lead sources" />
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 9 }}>
              {theme.sources.map(s => <span key={s} style={{ border: '1px solid var(--line)', borderRadius: 6, padding: '6px 13px', fontSize: 12.5, fontWeight: 600, color: 'var(--ink-2)' }}>{s}</span>)}
              <span style={{ border: '1px dashed var(--accent-line)', color: 'var(--accent)', borderRadius: 6, padding: '6px 13px', fontSize: 12.5, fontWeight: 600 }}>+ Add source</span>
            </div>
          </Panel>
        </div>
      </div>
    </>
  )
}
