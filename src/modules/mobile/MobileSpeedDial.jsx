import { useState } from 'react'
import Icon from '../../components/Icon.jsx'

export default function MobileSpeedDial({ store, context = {} }) {
  const [open, setOpen] = useState(false)

  // Determine actions based on context kind ('today', 'leads', 'properties', 'lead', 'prop')
  const kind = context.kind || 'today'

  let actions = []
  if (kind === 'lead') {
    actions = [
      { label: 'Schedule Follow-up', icon: 'calendar', action: () => { setOpen(false); context.onSchedule?.() }, color: '#1E6F52', wash: '#E8FBEF' },
      { label: 'Advance Pipeline Stage', icon: 'trend', action: () => { setOpen(false); context.onStage?.() }, color: '#4E6688', wash: '#EEF2F7' },
      { label: 'Log Note for Lead', icon: 'note', action: () => { setOpen(false); store.openModal({ kind: 'note', leadId: context.id }) }, color: '#B07A2E', wash: '#FDF7EC' },
      { label: 'Attach / Share Property', icon: 'wa', action: () => { setOpen(false); store.openModal({ kind: 'pickMatch', leadId: context.id }) }, color: '#25D366', wash: '#E8FBEF' }
    ]
  } else if (kind === 'prop') {
    actions = [
      { label: 'Share to Matching Buyers', icon: 'wa', action: () => { setOpen(false); store.openModal({ kind: 'pickBuyer', propId: context.id }) }, color: '#25D366', wash: '#E8FBEF' },
      { label: 'Call Owner Direct', icon: 'phone', action: () => { setOpen(false); store.openModal({ kind: 'callOwner', owner: context.owner }) }, color: '#1E6F52', wash: '#E8FBEF' },
      { label: 'Log Property Note', icon: 'note', action: () => { setOpen(false); store.openModal({ kind: 'note', propId: context.id }) }, color: '#B07A2E', wash: '#FDF7EC' }
    ]
  } else {
    // General tabs: today, leads, properties
    actions = [
      { label: 'New Walk-in Lead', icon: 'plus', action: () => { setOpen(false); store.openModal({ kind: 'newLead' }) }, color: '#1E6F52', wash: '#E8FBEF' },
      { label: 'Add Listing Property', icon: 'building', action: () => { setOpen(false); store.openModal({ kind: 'addProperty' }) }, color: '#4E6688', wash: '#EEF2F7' },
      { label: 'Log Instant Note', icon: 'note', action: () => { setOpen(false); store.openModal({ kind: 'note' }) }, color: '#B07A2E', wash: '#FDF7EC' }
    ]
  }

  return (
    <>
      {open && (
        <div
          className="m-sd-backdrop"
          onClick={() => setOpen(false)}
        />
      )}

      {open && (
        <div className="m-speeddial-menu" style={{ bottom: 'calc(130px + env(safe-area-inset-bottom))' }}>
          {actions.map((act, i) => (
            <button
              key={i}
              className="m-sd-item"
              onClick={act.action}
              style={{
                border: '1px solid var(--line)',
                background: 'var(--card)',
                boxShadow: '0 8px 24px rgba(0,0,0,0.18)',
                padding: '10px 16px 10px 12px',
                borderRadius: '24px',
                display: 'flex',
                alignItems: 'center',
                gap: '12px'
              }}
            >
              <div
                style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '50%',
                  background: act.wash,
                  color: act.color,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0
                }}
              >
                <Icon name={act.icon} size={16} />
              </div>
              <span style={{ fontSize: '13.5px', fontWeight: 600, color: 'var(--ink)' }}>{act.label}</span>
            </button>
          ))}
        </div>
      )}

      <button
        className="fab"
        onClick={() => setOpen(!open)}
        style={{
          bottom: 'calc(72px + env(safe-area-inset-bottom))',
          right: '16px',
          width: '52px',
          height: '52px',
          padding: 0,
          borderRadius: '50%',
          background: open ? '#15523C' : 'var(--accent)',
          color: '#fff',
          boxShadow: open ? '0 12px 28px rgba(0, 0, 0, 0.28)' : '0 8px 24px rgba(30, 111, 82, 0.35)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'all 0.2s cubic-bezier(0.34, 1.56, 0.64, 1)',
          zIndex: 50
        }}
        title="Quick Actions"
      >
        <div style={{ transform: open ? 'rotate(45deg)' : 'rotate(0deg)', transition: 'transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="plus" size={24} />
        </div>
      </button>
    </>
  )
}
