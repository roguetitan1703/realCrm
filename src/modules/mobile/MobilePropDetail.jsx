import { MobileShell, MobileTopBar } from '../../layouts/layouts.jsx'
import { StatusTag, Quoted, KV } from '../../components/primitives.jsx'
import Icon from '../../components/Icon.jsx'
import { initials, thumbTint, quotedLine, propFacts, budgetRange } from '../../lib/format.js'
import { leadsForProperty } from '../../data/seed.js'
import MobileSpeedDial from './MobileSpeedDial.jsx'

export default function MobilePropDetail({ store, id, back, tabs, modals }) {
  const p = store.state.properties.find(x => x.id === id)
  if (!p) return <MobileShell framed top={<MobileTopBar title="Property" onBack={back} />} tabs={tabs} modals={modals}><div style={{ padding: 20 }}>Not found.</div></MobileShell>

  const buyers = leadsForProperty(p, store.state.leads)
  const top = (
    <MobileTopBar
      title={p.society}
      sub={`${p.deal === 'rent' ? 'For rent' : 'For sale'} · ${p.locality}`}
      onBack={back}
      right={
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <StatusTag status={p.status} />
          <button
            className="btn btn-secondary btn-sm"
            style={{ padding: '4px 8px', fontSize: 11, background: 'rgba(255,255,255,.14)', color: '#fff', border: 'none' }}
            onClick={() => store.openModal({ kind: 'propStatus', propId: p.id })}
          >
            <Icon name="edit" size={13} />
          </button>
        </div>
      }
    />
  )

  return (
    <MobileShell
      framed
      top={top}
      tabs={tabs}
      modals={modals}
      fab={<MobileSpeedDial store={store} context={{ kind: 'prop', id: p.id, owner: p.owner }} />}
    >
      {/* Top CTA Action Bar ("on the above side not at the bottom as the bottom nav will be there") */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px', marginBottom: '4px' }}>
        <button
          onClick={() => store.openModal({ kind: 'callOwner', owner: p.owner })}
          style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '5px', padding: '10px 4px', background: 'var(--card)', border: '1px solid var(--line)', borderRadius: '14px', color: 'var(--ink)', fontWeight: 700, fontSize: '11.5px', cursor: 'pointer', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}
        >
          <span style={{ width: '30px', height: '30px', borderRadius: '50%', background: '#E8FBEF', color: '#1E6F52', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="phone" size={15} />
          </span>
          Call Owner
        </button>
        <button
          onClick={() => store.openModal({ kind: 'pickBuyer', propId: p.id })}
          style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '5px', padding: '10px 4px', background: 'var(--card)', border: '1px solid var(--line)', borderRadius: '14px', color: 'var(--ink)', fontWeight: 700, fontSize: '11.5px', cursor: 'pointer', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}
        >
          <span style={{ width: '30px', height: '30px', borderRadius: '50%', background: '#E8FBEF', color: '#25D366', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="wa" size={15} />
          </span>
          Share Buyers
        </button>
        <button
          onClick={() => store.openModal({ kind: 'note', propId: p.id })}
          style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '5px', padding: '10px 4px', background: 'var(--card)', border: '1px solid var(--line)', borderRadius: '14px', color: 'var(--ink)', fontWeight: 700, fontSize: '11.5px', cursor: 'pointer', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}
        >
          <span style={{ width: '30px', height: '30px', borderRadius: '50%', background: '#FDF7EC', color: '#B07A2E', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="note" size={15} />
          </span>
          Log Note
        </button>
      </div>

      <div className="m-detail-band" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span className="av av-lg" style={{ background: thumbTint(p.id), color: 'var(--faint)', borderRadius: 11 }}>
          <Icon name="building" size={26} />
        </span>
        <div>
          <Quoted q={quotedLine(p)} />
          <div className="u-muted" style={{ fontSize: 12, marginTop: 3 }}>Owner · {p.owner}</div>
        </div>
      </div>

      <div className="m-sec-h">Spec</div>
      <div className="m-detail-band">
        <KV items={propFacts(p).map(f => ({ k: f.k, v: f.v }))} />
      </div>

      <div className="m-sec-h">Highlights</div>
      <div className="m-detail-band">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
          {p.features.map((f, i) => <span key={i} className="fit ok"><Icon name="check" size={11} />{f}</span>)}
        </div>
      </div>

      {buyers.length > 0 && (
        <>
          <div className="m-sec-h">Interested {p.deal === 'rent' ? 'tenants' : 'buyers'} · {buyers.length}</div>
          {buyers.map(b => (
            <div key={b.lead.id} className="m-card" style={{ marginBottom: 8, cursor: 'default' }}>
              <span className="av av-md" style={{ background: 'var(--chrome)' }}>{initials(b.lead.name)}</span>
              <div className="m-c-main">
                <div className="m-c-name" style={{ fontSize: 13.5, display: 'flex', alignItems: 'center', gap: 6 }}>
                  {b.lead.name}
                  {b.fitLine && (
                    <span className="fit ok" style={{ padding: '1px 6px', fontSize: 10, background: 'var(--accent-wash)', color: 'var(--accent-ink)' }}>
                      <Icon name="check" size={10} />{b.fitLine}
                    </span>
                  )}
                </div>
                <div className="m-c-sub">{b.lead.req.config} · {b.lead.req.locality} · {budgetRange(b.lead.req)}</div>
              </div>
              <button className="btn btn-secondary btn-sm" onClick={() => store.openWhatsApp(p.id, b.lead.id)}>Share</button>
            </div>
          ))}
        </>
      )}
    </MobileShell>
  )
}
