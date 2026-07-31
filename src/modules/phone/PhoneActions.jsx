// The action button. One thumb-reachable control that carries the actions for
// whatever is on screen — the reason Today has no launcher strip of its own.
//
// Everything here that APPENDS to a record (remark, call, visit, share) is
// available to every role: logging what happened in the field is the job, and
// no permission model may stand in front of it. Only the actions that CHANGE a
// record's facts are gated.
import { useState, useEffect } from 'react'
import Icon from '../../components/Icon.jsx'
import { canEditListing } from '../../lib/permissions.js'

export default function PhoneActions({ store, go, context = {} }) {
  const [open, setOpen] = useState(false)
  const kind = context.kind || 'today'
  const role = store.state.role

  useEffect(() => { setOpen(false) }, [kind, context.id])

  const close = () => setOpen(false)
  const act = (fn) => () => { close(); fn() }

  let actions = []
  if (kind === 'lead') {
    const id = context.id
    actions = [
      { label: 'Log call', icon: 'phone', run: () => store.openModal({ kind: 'logCall', leadId: id }) },
      { label: 'Log site visit', icon: 'camera', run: () => store.openModal({ kind: 'visitProof', leadId: id }) },
      { label: 'WhatsApp', icon: 'wa', run: () => store.openWhatsApp(null, id) },
      { label: 'Add remark', icon: 'note', run: () => store.openModal({ kind: 'remark', recordType: 'lead', recordId: id }) },
      { label: 'Schedule', icon: 'calendar', run: () => store.openModal({ kind: 'scheduleFollowUp', leadId: id }) },
      { label: 'Attach property', icon: 'building', run: () => store.openModal({ kind: 'attachProp', leadId: id }) },
    ]
  } else if (kind === 'prop') {
    const id = context.id
    const p = store.state.properties.find(x => x.id === id)
    actions = [
      { label: 'Share to buyers', icon: 'wa', run: () => store.openModal({ kind: 'pickBuyer', propId: id }) },
      { label: 'Call owner', icon: 'phone', run: () => store.openModal({ kind: 'contact', channel: 'call', name: p?.owner, phone: p?.ownerPhone, recordType: 'property', recordId: id }) },
      { label: 'Add remark', icon: 'note', run: () => store.openModal({ kind: 'remark', recordType: 'property', recordId: id }) },
    ]
    if (canEditListing(role)) {
      actions.push({ label: 'Change status', icon: 'trend', run: () => store.openModal({ kind: 'propStatus', propId: id }) })
    }
  } else {
    actions = [{ label: 'New lead', icon: 'plus', run: () => store.openModal({ kind: 'newLead' }) }]
    if (canEditListing(role)) {
      actions.push({ label: 'Add property', icon: 'building', run: () => go('properties', { propAdd: true, propId: null }) })
    }
  }

  return (
    <>
      {open && <div className="pa-backdrop" onClick={close} />}
      {open && (
        <div className="pa-menu">
          {actions.map((a) => (
            <button key={a.label} className="pa-item" onClick={act(a.run)}>
              <span className="pa-ic"><Icon name={a.icon} size={16} /></span>{a.label}
            </button>
          ))}
        </div>
      )}
      <button
        className={'pa-fab' + (open ? ' on' : '')}
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        aria-label="Actions"
      >
        <Icon name="plus" size={24} />
      </button>
    </>
  )
}
