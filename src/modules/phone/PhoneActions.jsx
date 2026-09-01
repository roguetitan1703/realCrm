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
import { canEditListing, canAddListing, canDeleteRecord, canEditLead } from '../../lib/permissions.js'
import { buildActionTiers, LEADS_DEF, PROPERTIES_DEF, OWNERS_DEF } from '../definitions.jsx'

export default function PhoneActions({ store, go, context = {} }) {
  const [open, setOpen] = useState(false)
  const kind = context.kind || 'today'
  const role = store.state.role

  useEffect(() => { setOpen(false) }, [kind, context.id])

  const close = () => setOpen(false)

  let actions = []
  if (kind === 'owner') {
    // The calling queue's own record. Same definition-driven tiers as a lead —
    // Call and WhatsApp stay in the sheet here rather than being stripped,
    // because an owner's record has no full-width contact bar of its own.
    const record = store.lookup('owner', context.id)
    if (record) {
      const { quick, manage } = buildActionTiers(OWNERS_DEF, store, record, context.actionCtx || {})
      actions = [...quick, ...manage]
      if (!canDeleteRecord(role)) actions = actions.filter(a => a.id !== 'delete')
    }
  } else if (kind === 'lead' || kind === 'prop') {
    const isLead = kind === 'lead'
    const def = isLead ? LEADS_DEF : PROPERTIES_DEF
    // The record the sheet is acting on, from the cache rather than by scanning
    // the whole collection. Whatever opened this sheet already loaded it.
    const record = store.lookup(isLead ? 'lead' : 'property', context.id)
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
      // Call and WhatsApp are NOT here. They sit on the lead's own screen, full
      // width, one tap — reaching the client is the reason the page gets opened
      // at all, so it does not belong behind a menu. This button used to
      // prepend a Call and carry the definition's WhatsApp besides, which made
      // three routes to two things.
      if (isLead) {
        actions = actions.filter(a => a.id !== 'whatsapp' && a.id !== 'logCall')
        // Editing a lead's facts, for whoever may: the desk always, an agent
        // only on a lead they created. Gated here as well as hidden, because
        // the server refuses it either way and an action that 403s is worse
        // than one that isn't offered.
        if (canEditLead(role, store.state.activeAgentId, record)) {
          actions = [
            { id: 'edit', icon: 'edit', label: 'Edit lead', onClick: () => store.openModal({ kind: 'editRecord', moduleId: 'leads', recordId: record.id }) },
            ...actions,
          ]
        }
      }
    }
  } else if (kind === 'calling') {
    actions = [{ id: 'newOwner', icon: 'plus', label: 'New owner', onClick: () => store.openModal({ kind: 'newOwner' }) }]
  } else {
    actions = [{ id: 'newLead', icon: 'plus', label: 'New lead', onClick: () => store.openModal({ kind: 'newLead' }) }]
    // The FAB is where an agent standing in a flat actually adds one, so this
    // is the add rule, not the edit rule. See canAddListing().
    if (canAddListing(role)) {
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
              {/* The sub-line, which this dropped. Every definition supplies one
                  for the actions whose meaning depends on the record — what the
                  follow-up is and when it is due, who a lead would be reassigned
                  from — and without it "Mark follow-up done" is a tick with no
                  subject: the sheet named an action but never the thing it acted
                  on. The desk's More menu had shown it all along. */}
              <span className="pa-ic"><Icon name={a.icon} size={16} /></span>
              <span className="pa-lbl">{a.label}{a.sub && <span className="pa-sub">{a.sub}</span>}</span>
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
