import { useState } from 'react'
import { MobileShell, MobileTopBar } from '../../layouts/layouts.jsx'
import { StageTag, StatusTag, Stepper, Timeline } from '../../components/primitives.jsx'
import { Scheduler } from '../../components/rail.jsx'
import Icon from '../../components/Icon.jsx'
import { theme } from '../../data/theme.js'
import { budgetRange, thumbTint } from '../../lib/format.js'
import { matchesForLead } from '../../data/seed.js'
import MobileSpeedDial from './MobileSpeedDial.jsx'

function Sheet({ title, onClose, children }) {
  return (
    <div className="overlay sheet" onClick={onClose} style={{ zIndex: 70 }}>
      <div className="sheet-card" onClick={e => e.stopPropagation()} style={{ maxHeight: '88vh', display: 'flex', flexDirection: 'column' }}>
        <div className="sheet-grip" />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px', padding: '0 4px', flexShrink: 0 }}>
          <div style={{ fontFamily: 'var(--disp)', fontWeight: 600, fontSize: '17px', color: 'var(--ink)' }}>{title}</div>
          <button onClick={onClose} style={{ border: 'none', background: 'var(--line-2)', width: '28px', height: '28px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--ink-2)' }}>
            <Icon name="x" size={15} />
          </button>
        </div>
        <div style={{ overflowY: 'auto', flex: 1, padding: '2px 4px 16px' }}>
          {children}
        </div>
      </div>
    </div>
  )
}

function followFrom(f, l) {
  const type = f.action === 'site' ? 'Site visit' : f.action === 'meeting' ? 'Meeting' : 'Call'
  const dateLabel = f.quick === 'today' ? 'Today' : f.quick === 'tomorrow' ? 'Tomorrow' : f.quick === 'weekend' ? 'This weekend' : (f.date || 'Scheduled')
  return { action: `${type} — ${l.name}`, date: dateLabel, time: f.time || '11:00 am' }
}

export default function MobileLeadDetail({ store, me, id, back, open, tabs, modals }) {
  const l = store.state.leads.find(x => x.id === id)
  const [sheet, setSheet] = useState(null)

  if (!l) return <MobileShell framed top={<MobileTopBar title="Lead" onBack={back} />} tabs={tabs} modals={modals}><div style={{ padding: 20 }}>Not found.</div></MobileShell>

  const matches = matchesForLead(l, store.state.properties)
  const shortlistIds = l.shortlist || []
  const props = [
    ...shortlistIds.map(pid => store.state.properties.find(p => p.id === pid)).filter(Boolean).map(p => ({ p, shortlisted: true })),
    ...matches.filter(m => !shortlistIds.includes(m.id)).map(m => ({ p: m, shortlisted: false })),
  ]

  const top = (
    <MobileTopBar
      title={l.name}
      sub={l.phone}
      onBack={back}
      right={
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <StageTag stage={l.stage} />
          <button
            className="btn btn-secondary btn-sm"
            style={{ padding: '4px 8px', fontSize: 11, background: 'rgba(255,255,255,.14)', color: '#fff', border: 'none' }}
            onClick={() => store.openModal({ kind: 'editLead', leadId: l.id })}
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
      fab={<MobileSpeedDial store={store} context={{ kind: 'lead', id: l.id, onSchedule: () => setSheet('schedule'), onStage: () => setSheet('stage') }} />}
    >
      {/* Top CTA Action Bar ("on the above side not at the bottom as the bottom nav will be there") */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px', marginBottom: '4px' }}>
        <button
          onClick={() => store.openModal({ kind: 'outreach', leadId: l.id, channel: 'call' })}
          style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '5px', padding: '10px 4px', background: 'var(--card)', border: '1px solid var(--line)', borderRadius: '14px', color: 'var(--ink)', fontWeight: 700, fontSize: '11.5px', cursor: 'pointer', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}
        >
          <span style={{ width: '30px', height: '30px', borderRadius: '50%', background: '#E8FBEF', color: '#1E6F52', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="phone" size={15} />
          </span>
          Call
        </button>
        <button
          onClick={() => store.openWhatsApp(null, l.id)}
          style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '5px', padding: '10px 4px', background: 'var(--card)', border: '1px solid var(--line)', borderRadius: '14px', color: 'var(--ink)', fontWeight: 700, fontSize: '11.5px', cursor: 'pointer', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}
        >
          <span style={{ width: '30px', height: '30px', borderRadius: '50%', background: '#E8FBEF', color: '#25D366', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="wa" size={15} />
          </span>
          WhatsApp
        </button>
        <button
          onClick={() => store.openModal({ kind: 'outreach', leadId: l.id, channel: 'sms' })}
          style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '5px', padding: '10px 4px', background: 'var(--card)', border: '1px solid var(--line)', borderRadius: '14px', color: 'var(--ink)', fontWeight: 700, fontSize: '11.5px', cursor: 'pointer', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}
        >
          <span style={{ width: '30px', height: '30px', borderRadius: '50%', background: '#EEF2F7', color: '#4E6688', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="sms" size={15} />
          </span>
          SMS / Text
        </button>
      </div>

      {/* requirement band */}
      <div className="m-detail-band">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px 18px' }}>
          {[
            ['Looking for', `${l.req.config} · ${l.req.deal}`],
            ['Budget', budgetRange(l.req)],
            ['Locality', l.req.locality],
            ['Timeline', l.req.timeline]
          ].map(([k, v]) => (
            <div key={k}>
              <div style={{ fontSize: 10.5, letterSpacing: '.05em', textTransform: 'uppercase', color: 'var(--muted)', fontWeight: 600 }}>{k}</div>
              <div style={{ fontWeight: 600, fontSize: 13.5, marginTop: 2 }}>{v}</div>
            </div>
          ))}
        </div>
        {l.req.notes && <div className="note-box" style={{ marginTop: 12 }}>{l.req.notes}</div>}
      </div>

      {/* properties for this lead */}
      <div>
        <div className="m-sec-h" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>Properties for this lead</span>
          <button
            style={{ border: 'none', background: 'transparent', color: 'var(--accent)', fontWeight: 700, fontSize: 11, cursor: 'pointer', letterSpacing: '.04em' }}
            onClick={() => store.openModal({ kind: 'attachProp', leadId: l.id })}
          >
            + ATTACH
          </button>
        </div>
        {props.length === 0 && <div className="u-muted" style={{ fontSize: 13, padding: '4px 2px' }}>No matches yet. Attach one to share.</div>}
        {props.map(({ p, shortlisted }) => {
          const fb = (l.feedback || {})[p.id]
          const rejected = fb?.verdict === 'rejected'
          return (
          <button key={p.id} className="m-card-prop" style={{ marginBottom: 8, opacity: rejected ? 0.6 : 1 }} onClick={() => open('prop', p.id)}>
            <div className="m-cp-top">
              <div className="m-cp-name" style={{ textDecoration: rejected ? 'line-through' : 'none' }}>
                <span className="av av-sm" style={{ background: thumbTint(p.id), color: 'var(--faint)', borderRadius: 6, width: 22, height: 22, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name="building" size={12} />
                </span>
                {p.society}
              </div>
              <div style={{ display: 'flex', gap: 4 }}>
                {fb?.verdict === 'liked' && <span className="fit ok" style={{ padding: '1px 6px' }}>👍 Liked</span>}
                {rejected && <span className="fit no" style={{ padding: '1px 6px' }}>👎 {fb.reason}</span>}
                {!fb && shortlisted && <span className="fit ok" style={{ padding: '1px 6px' }}><Icon name="check" size={10} />Shortlisted</span>}
                <StatusTag status={p.status} />
              </div>
            </div>
            <div className="m-cp-sub">{p.type} · {p.locality} · {p.priceLabel}</div>
            <div className="m-cp-bot" style={{ justifyContent: 'space-between' }}>
              <button
                className="btn btn-ghost btn-sm"
                style={{ padding: '4px 10px' }}
                onClick={(e) => { e.stopPropagation(); store.openModal({ kind: 'visitFeedback', leadId: l.id, propId: p.id }) }}
              >
                <Icon name="check" size={12} />Log visit
              </button>
              <button
                className="btn btn-secondary btn-sm"
                style={{ padding: '4px 10px' }}
                onClick={(e) => { e.stopPropagation(); store.openWhatsApp(p.id, l.id) }}
              >
                Share
              </button>
            </div>
          </button>
        )})}
      </div>

      {/* timeline */}
      <div className="m-sec-h">Timeline</div>
      <div className="m-detail-band"><Timeline events={l.timeline} /></div>

      {/* bottom sheets */}
      {sheet === 'stage' && (
        <Sheet title="Move stage" onClose={() => setSheet(null)}>
          <Stepper
            stages={theme.stages.filter(s => s !== 'Closed Lost')}
            current={l.stage}
            onPick={(s) => { store.setStage(l.id, s); setSheet(null) }}
          />
          <button
            className="btn btn-danger btn-block"
            style={{ marginTop: 12, padding: 13 }}
            onClick={() => { store.setStage(l.id, 'Closed Lost'); setSheet(null) }}
          >
            Mark as lost
          </button>
        </Sheet>
      )}
      {sheet === 'schedule' && (
        <Sheet title="Schedule follow-up" onClose={() => setSheet(null)}>
          <Scheduler onSave={(f) => { store.setFollowUp(l.id, followFrom(f, l)); setSheet(null) }} />
        </Sheet>
      )}
    </MobileShell>
  )
}
