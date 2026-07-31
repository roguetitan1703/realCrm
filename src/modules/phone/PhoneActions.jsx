// The action button. One thumb-reachable control that carries the actions for
// whatever is on screen — which is why the detail page drops its "Quick
// actions" rail block on a phone rather than restyling it.
//
// On an open record the actions come from the MODULE_DEFINITION, through the
// same buildActionTiers() the desk rail uses. Not a hand-written list: a
// second list is a list that drifts, which is exactly how the old mobile app
// ended up opening four modals nothing handled.
//
// Everything definition-driven that APPENDS to a record — remark, call log,
// visit log, share, schedule — is available to every role. Only the actions
// that CHANGE a record's facts are gated.
import { useState, useEffect } from 'react'
import Icon from '../../components/Icon.jsx'
import { canEditListing, canDeleteRecord } from '../../lib/permissions.js'
import { buildActionTiers, LEADS_DEF, PROPERTIES_DEF } from '../definitions.jsx'

export default function PhoneActions({ store, go, context = {} }) {
  const [open, setOpen] = useState(false)
  const kind = context.kind || 'today'
  const role = store.state.role

  useEffect(() => { setOpen(false) }, [kind, context.id])

  const close = () => setOpen(false)

  let actions = []
  if (kind === 'lead' || kind === 'prop') {
    const isLead = kind === 'lead'
    const def = isLead ? LEADS_DEF : PROPERTIES_DEF
    const list = isLead ? store.state.leads : store.state.properties
    const record = list.find(x => x.id === context.id)
    if (record) {
      const { quick, manage } = buildActionTiers(def, store, record, context.actionCtx || {})
      actions = [...quick, ...manage]
      // Listing facts are desk-owned; an agent keeps everything that appends.
      if (!isLead && !canEditListing(role)) {
        actions = actions.filter(a => !EDITS_A_LISTING.has(a.id))
      }
      // Destroying history is the owner's call, on either module.
      if (!canDeleteRecord(role)) {
        actions = actions.filter(a => a.id !== 'delete' && a.id !== 'merge')
      }
      // On a phone, calling means the device dialer — there is no telephony and
      // none is planned. The confirm flow opens tel:, logs the call, and asks
      // for the outcome when the agent comes back, which is the only moment
      // they actually know how it went.
      if (isLead && record.phone) {
        actions = [
          { id: 'call', icon: 'phone', label: 'Call', onClick: () => store.openModal({ kind: 'contact', channel: 'call', name: record.name, phone: record.phone, recordType: 'lead', recordId: record.id }) },
          ...actions.filter(a => a.id !== 'logCall'),
        ]
      }
    }
  } else {
    actions = [{ id: 'newLead', icon: 'plus', label: 'New lead', onClick: () => store.openModal({ kind: 'newLead' }) }]
    if (canEditListing(role)) {
      actions.push({ id: 'addProp', icon: 'building', label: 'Add property', onClick: () => go('properties', { propAdd: true, propId: null }) })
    }
  }

  if (!actions.length) return null

  return (
    <>
      {open && <div className="pa-backdrop" onClick={close} />}
      {open && (
        <div className="pa-menu">
          {actions.map((a) => (
            <button key={a.id} className={'pa-item' + (a.tone === 'danger' ? ' danger' : '')}
              onClick={() => { close(); a.onClick() }}>
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

// Definition action ids that rewrite a listing's facts rather than adding to
// its history. Kept beside the permission check so adding an action to
// PROPERTIES_DEF forces a decision about which side of the line it sits on.
// 'ownerUpdate' is deliberately NOT here — it sends the owner a WhatsApp, which
// is an agent's job. 'copy' only reads.
const EDITS_A_LISTING = new Set(['status', 'addOwner', 'tenancy', 'deposit'])
