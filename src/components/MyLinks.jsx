import { useState } from 'react'
import Icon from './Icon.jsx'
import { Button } from './primitives.jsx'
import { api } from '../lib/api.js'
import { useServerData } from '../lib/useServerData.js'
import { phoneLabel } from '../lib/locale.js'
import { copyText } from '../lib/clipboard.js'
import { LINK_STATE_LABEL, expiryLabel } from '../lib/share.js'
import { SenderPhone, LeadSearch } from '../modules/SendSheet.jsx'

// ============================================================================
// ME → YOUR MOBILE NUMBER and LINKS I'VE SHARED (listing-pages.md §A)
// ============================================================================
// Who: an agent on a phone, between calls — did the buyer open what I sent
// this morning, did anyone on the group link tap Interested; or an owner at
// the desk turning off a link that leaked. Nested under Me, never in the main
// navigation: there is no link management, only your own links, each one
// either live or not.
// ============================================================================

/** The sender's own number. Send needs it: a buyer's tap opens WhatsApp to it. */
export function MePhone({ store }) {
  const me = store.me()
  const [editing, setEditing] = useState(false)
  const phone = me?.phone || ''
  return (
    <div className="mel">
      <div className="mel-row">
        <span className="devrow-ic"><Icon name="phone" size={15} /></span>
        <div className="mel-body">
          <div className="mel-t">Your mobile number</div>
          <div className={'mel-v mono-num' + (phone ? '' : ' is-none')}>{phone ? phoneLabel(phone) : 'Not added'}</div>
        </div>
        {!editing && <Button size="sm" onClick={() => setEditing(true)}>{phone ? 'Change' : 'Add'}</Button>}
      </div>
      {editing && (
        <div className="mel-edit">
          <SenderPhone store={store} me={me} saveLabel="Save"
            onSaved={() => { setEditing(false); store.toast('Number saved') }}
            onCancel={() => setEditing(false)} />
        </div>
      )}
    </div>
  )
}

export function MyLinks({ store, go }) {
  const tick = store.state.mutationTick || 0
  const [bump, setBump] = useState(0)
  const { data, loading, error } = useServerData(
    () => api.myShareLinks().then(r => r?.data || []),
    [tick, bump], null)
  const rows = data || []
  const reload = () => setBump(b => b + 1)

  const turnOff = (l) => store.openModal({
    kind: 'confirm',
    title: 'Turn off this link?',
    lines: [l.lead ? l.lead.name : 'No recipient', homesWord(l)],
    confirmLabel: 'Turn off',
    onConfirm: () => api.turnOffShareLink(l.id)
      .then(() => { store.toast('Link turned off'); reload() })
      .catch(() => store.toast('Could not turn it off. Try again.', 'warn')),
  })
  const attach = (l) => store.openModal({ kind: 'attachLink', linkId: l.id, onDone: reload })
  const copy = (l) => copyText(l.url).then(ok => store.toast(ok ? 'Link copied' : 'Could not copy. Your browser blocked it.', ok ? undefined : 'warn'))

  return (
    <div className="mylinks">
      <div className="msgt-h mylinks-h">Links I've shared{rows.length ? <span className="mylinks-n">{rows.length}</span> : null}</div>
      {loading && data === null ? (
        <div className="mylinks-empty"><span className="snd-spin" aria-label="Loading" /></div>
      ) : error ? (
        <div className="mylinks-empty">
          <span>{/fetch|network|Failed/i.test(error) ? 'No connection.' : 'Could not load your links.'}</span>
          <button type="button" className="lnk" onClick={reload}>Try again</button>
        </div>
      ) : rows.length === 0 ? (
        <div className="mylinks-empty">No links yet</div>
      ) : (
        <div className="mylinks-list">
          {rows.map(l => {
            const live = l.state === 'active'
            return (
              <div key={l.id} className={'myl' + (live ? '' : ' is-dead')}>
                <div className="myl-top">
                  {l.lead
                    ? <button type="button" className="myl-who" onClick={() => go?.('leads', { leadId: l.lead.id, leadOpen: true })}>{l.lead.name || 'Lead'}</button>
                    : <span className="myl-who is-none">No recipient</span>}
                  <span className={'myl-state s-' + (l.state || 'active')}>{LINK_STATE_LABEL[l.state] || l.state}</span>
                </div>
                <div className="myl-sub">{[homesWord(l), expiryLabel(l)].filter(Boolean).join(' · ')}</div>
                <div className="myl-nums mono-num">
                  <span><b>{l.views ?? 0}</b> {l.views === 1 ? 'view' : 'views'}</span>
                  <span><b>{l.devices ?? 0}</b> {l.devices === 1 ? 'person' : 'people'}</span>
                  <span className={l.interested ? 'is-int' : ''}><b>{l.interested ?? 0}</b> interested</span>
                </div>
                <div className="myl-foot">
                  {live && <button type="button" className="myl-act" onClick={() => copy(l)}><Icon name="copy" size={14} />Copy</button>}
                  {!l.lead && live && <button type="button" className="myl-act" onClick={() => attach(l)}><Icon name="userPlus" size={14} />Attach to a lead</button>}
                  {live && <button type="button" className="myl-act is-off" onClick={() => turnOff(l)}>Turn off</button>}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

const homesWord = (l) => {
  const n = l.flats?.length ?? l.homes ?? 0
  return `${n} ${n === 1 ? 'home' : 'homes'}`
}

/** Attach a no-recipient link to a lead: its views, devices and taps move onto
 *  that lead (POST /share-links/:id/attach). */
export function AttachLinkModal({ store, Modal, linkId, onDone }) {
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState(false)
  const pick = (lead) => {
    if (busy) return
    setBusy(true)
    api.attachShareLink(linkId, lead.id)
      .then(() => { store.toast(`Attached to ${lead.name || 'the lead'}`); store.closeModal(); store.touched?.(); onDone?.() })
      .catch(() => { store.toast('Could not attach. Try again.', 'warn'); setBusy(false) })
  }
  return (
    <Modal title="Attach to a lead" onClose={store.closeModal} width={440}>
      <div className="snd-pick">
        <LeadSearch q={q} setQ={setQ} onPick={pick} autoFocus />
      </div>
    </Modal>
  )
}
