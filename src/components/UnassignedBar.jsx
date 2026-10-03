import { useState } from 'react'
import { api } from '../lib/api.js'
import { useServerData } from '../lib/useServerData.js'
import { canAssignLead } from '../lib/permissions.js'
import { Button } from './primitives.jsx'

// ============================================================================
// RECORDS WITH NOBODY ON THEM — said on the screen they are on
// ============================================================================
// WHO IT IS FOR: the owner or manager, who hands work out. A lead or a calling
// row with no agent is work nobody will do, and the only place that said so, or
// offered to fix it, was Settings → Assigning — a screen nobody opens while
// working the list. This is the same count (routing/backlog) and the same one
// press (assign-unowned), on Leads and on Calling.
//
// It happens for ordinary reasons: a sheet imported while calling rows are left
// for a manager to pick, enquiries arriving while nobody is taking turns, a
// person who left still holding records. Taking turns only decides who gets a
// record as it ARRIVES; what was already there stays with nobody.
//
// `side` is 'leads' or 'owners'. `onShow` filters the list to them.
const SIDES = {
  leads: { one: 'lead', many: 'leads', rota: 'active_agent_ids' },
  owners: { one: 'owner', many: 'owners', rota: 'owner_active_agent_ids' },
}

export default function UnassignedBar({ store, side, go, onShow }) {
  const { state } = store
  const mayAssign = canAssignLead(state.role)
  const [at, setAt] = useState(0)
  const [busy, setBusy] = useState(false)
  const { data } = useServerData(
    () => (mayAssign ? api.routingBacklog() : Promise.resolve(null)),
    [at, state.dataAsOf, mayAssign], null)
  const n = data ? (side === 'leads' ? data.leads : data.owners) : 0
  if (!mayAssign || !n) return null

  const s = SIDES[side]
  const word = n === 1 ? s.one : s.many
  // Who takes turns on this side. Handing out deals the records to them in
  // turn; with nobody taking turns there is nobody to deal to.
  const turn = (state.routing?.[s.rota] || []).map(id => store.agentById(id)).filter(Boolean)

  const handOut = async () => {
    setBusy(true)
    try {
      const res = await api.assignUnowned(side)
      store.toast(res.assigned
        ? `Shared: ${res.perTarget.filter(p => p.n).map(p => `${p.name} ${p.n}`).join(', ')}`
        : 'Nothing left to share')
      setAt(x => x + 1)
      store.settled?.()
    } catch (err) {
      store.toast(String(err.message || 'Could not share them').replace(/^API Error: \d+ [^—]*— ?/, ''), 'warn')
    }
    setBusy(false)
  }
  const ask = () => store.openModal({
    kind: 'confirm',
    title: `Share ${n} ${word} equally between these agents?`,
    lines: turn.map(a => a.name),
    confirmLabel: 'Share them',
    onConfirm: handOut,
  })

  return (
    <div className="unas-bar">
      <span className="unas-t"><b>{n.toLocaleString('en-IN')}</b> {word} {n === 1 ? 'is' : 'are'} not given to any agent yet</span>
      <span className="unas-acts">
        {onShow && <Button variant="ghost" size="sm" onClick={onShow}>See {n === 1 ? 'it' : 'them'}</Button>}
        {turn.length
          ? <Button variant="primary" size="sm" disabled={busy} onClick={ask}>{busy ? 'Sharing…' : 'Share with agents'}</Button>
          : <Button variant="secondary" size="sm" onClick={() => go('settings', { settingsSection: 'routing', settingsSide: side })}>Pick agents to share with</Button>}
      </span>
    </div>
  )
}
