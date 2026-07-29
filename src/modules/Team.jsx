import { useEffect, useState } from 'react'
import { Avatar, Button, IconButton, Field, Input, PhoneInput, SectionHead, PageHeader, Segmented } from '../components/primitives.jsx'
import Icon from '../components/Icon.jsx'
import { api } from '../lib/api.js'

const ROLE_LABEL = { admin: 'Owner / Admin', owner: 'Owner', agent: 'Sales Advisor', manager: 'Sales Manager' }
const roleLabel = (r) => ROLE_LABEL[r] || (r ? r[0].toUpperCase() + r.slice(1) : 'Sales Advisor')

// The api client throws Error("API Error: 400 … — <detail>"); show just the detail.
const cleanErr = (err) => {
  const m = String(err?.message || '')
  const i = m.indexOf('—')
  return i >= 0 ? m.slice(i + 1).trim() : (m.replace(/^API Error:\s*/, '') || 'Something went wrong')
}
const isSuspended = (u) => String(u.status || '').toLowerCase() === 'suspended'
const timeAgo = (ts) => {
  if (!ts) return 'never'
  const s = Math.max(0, (Date.now() - new Date(ts).getTime()) / 1000)
  if (s < 90) return 'just now'
  if (s < 3600) return `${Math.round(s / 60)}m ago`
  if (s < 86400) return `${Math.round(s / 3600)}h ago`
  return `${Math.round(s / 86400)}d ago`
}

export default function Team({ store, go, topBar }) {
  const { state } = store
  const inactive = (id) => state.inactiveAgentIds.includes(id)
  const toLeads = (leadFilter) => go && go('leads', { leadFilter, leadOpen: false, leadId: undefined })

  // Real 30-day metrics from the backend, keyed by agent id. Fetched once on
  // mount; the roster degrades to state-derived numbers if the call fails, so
  // the desk still ranks correctly offline.
  const [perf, setPerf] = useState({})
  useEffect(() => {
    let live = true
    Promise.all(state.agents.map(a =>
      api.getAgentPerformance(a.id).then(r => [a.id, r?.metrics]).catch(() => [a.id, null])
    )).then(pairs => {
      if (!live) return
      setPerf(Object.fromEntries(pairs.filter(([, m]) => m)))
    })
    return () => { live = false }
  }, [state.agents.length])

  // Per-agent workload + performance from live state.
  const roster = state.agents.map(a => {
    const mine = state.leads.filter(l => l.agentId === a.id)
    const open = mine.filter(l => !l.stage.startsWith('Closed')).length
    const won = mine.filter(l => l.stage === 'Closed Won').length
    const lost = mine.filter(l => l.stage === 'Closed Lost').length
    const overdue = mine.filter(l => l.overdue).length
    const settled = won + lost
    const stateWinRate = settled ? Math.round((won / settled) * 100) : null
    const m = perf[a.id]
    // Prefer the backend's real 30-day numbers; fall back to state-derived.
    const calls = m?.total_outbound_calls ?? null
    const visits = m?.site_visits_done ?? null
    const winRate = m?.visit_conversion_rate_percentage != null ? Math.round(m.visit_conversion_rate_percentage) : stateWinRate
    return { a, open, won, overdue, winRate, calls, visits, off: inactive(a.id) }
  })

  const activeCount = roster.filter(r => !r.off).length
  const openLeads = state.leads.filter(l => !l.stage.startsWith('Closed'))
  const unassigned = openLeads.filter(l => !l.agentId).length
  const overdueTotal = state.leads.filter(l => l.overdue).length

  const evenShare = activeCount ? openLeads.length / activeCount : 0
  const maxLoad = Math.max(1, ...roster.map(r => r.open))

  // Rank: on-duty first, then most closed, then busiest — a real standings order.
  const ranked = roster.slice().sort((x, y) =>
    (x.off - y.off) || (y.won - x.won) || (y.open - x.open))
  const leaderId = ranked.find(r => !r.off && r.won > 0)?.a.id

  // Glance KPIs — same compact ph-stats row as Import and the other modules.
  const kpis = [
    { label: 'On the desk', value: `${activeCount}/${state.agents.length}` },
    { label: 'Open leads', value: openLeads.length, onClick: () => toLeads({}) },
    { label: 'Unassigned', value: unassigned, tone: unassigned > 0 ? 'alert' : undefined, onClick: () => toLeads({ flag: ['unassigned'] }) },
    { label: 'Overdue', value: overdueTotal, tone: overdueTotal > 0 ? 'alert' : undefined, onClick: () => toLeads({ flag: ['overdue'] }) },
  ]

  return (
    <>
      {topBar({ title: 'Team' })}
      <PageHeader kpis={kpis} right={<Button variant="primary" icon="userPlus" onClick={() => store.openModal({ kind: 'addAgent' })}>Add teammate</Button>} />
      <div className="app-body pagewrap">
        {/* PRIMARY: who can sign in + admin controls */}
        <AccessPanel store={store} />

        {/* SECONDARY: how the desk is performing */}
        <div className="acc-panel">
          <SectionHead title="Team activity" right={<span className="u-muted acc-hint">Who's carrying the load and who's closing</span>} />
          <div className="board">
          {ranked.map(({ a, open, won, overdue, winRate, calls, visits, off }, i) => {
            const overloaded = !off && open > evenShare * 1.5 && open > 3
            const isLeader = a.id === leaderId
            const pct = Math.round((open / maxLoad) * 100)
            const rank = i + 1
            return (
              <div key={a.id} className={'bcard' + (off ? ' off' : '') + (isLeader ? ' lead' : '')}>
                <div className={'rank' + (off ? '' : rank <= 3 ? ' r' + rank : '')}>{off ? '–' : rank}</div>

                <div className="bwho">
                  <Avatar agent={a} size="lg" />
                  <div className="bid">
                    <div className="bname">
                      {a.name}
                      {off ? <span className="btag off">Off duty</span>
                        : overloaded ? <span className="btag over">Overloaded</span>
                        : isLeader ? <span className="btag top">Top closer</span> : null}
                    </div>
                    <div className="brole">{roleLabel(a.role)} · Pune</div>
                  </div>
                </div>

                <div className="bload">
                  <div className="bload-top">
                    <span className="bload-n"><b>{open}</b> open</span>
                    <span className={'bload-tag ' + (overdue ? 'warn' : 'ok')}>{overdue ? `${overdue} overdue` : 'On track'}</span>
                  </div>
                  <div className="bmeter"><i className={overloaded ? 'hot' : ''} style={{ width: pct + '%' }} /></div>
                </div>

                <div className="bstats">
                  <div className="bstat"><div className="bv accent">{won}</div><div className="bl">Won</div></div>
                  <div className="bstat"><div className="bv">{winRate == null ? '—' : <>{winRate}<span className="bu">%</span></>}</div><div className="bl">Win rate</div></div>
                  <div className="bstat"><div className="bv">{calls == null ? '—' : calls}</div><div className="bl">Calls · 30d</div></div>
                  <div className="bstat"><div className="bv">{visits == null ? '—' : visits}</div><div className="bl">Visits</div></div>
                </div>

                <div className="bactions">
                  <Button size="sm" onClick={() => store.openModal({ kind: 'reassign', fromId: a.id })}>Reassign</Button>
                  <IconButton icon={off ? 'refresh' : 'switch'} title={off ? 'Bring on duty' : 'Take off duty'} onClick={() => store.toggleAgent(a.id)} />
                </div>
              </div>
            )
          })}
          </div>
        </div>

        <SessionsPanel store={store} />
      </div>
    </>
  )
}

// ── Manage access — the full user roster with owner/manager admin controls ──────
// Backend enforces RBAC; we mirror it here only to avoid offering an action the
// server will reject. Every mutation re-pulls the desk so the ranked board above
// reflects a suspend / delete / seat-swap immediately.
function AccessPanel({ store }) {
  const meId = store.state.activeAgentId
  const [users, setUsers] = useState(null)   // null = loading
  const [busy, setBusy] = useState('')       // id of the row currently mutating
  const [reveal, setReveal] = useState(null) // { title, name, handle, password }
  const [seat, setSeat] = useState(null)     // user whose seat is being reassigned
  const [edit, setEdit] = useState(null)     // user being edited (name/email/phone/role)

  const load = () => api.getUsers().then(r => setUsers(r.users || [])).catch(() => setUsers([]))
  useEffect(() => { load() }, [])

  const me = (users || []).find(u => u.id === meId)
  const myRole = me?.role || (store.state.role === 'agent' ? 'agent' : 'owner')
  const canManage = (role) => myRole === 'owner' ? true : myRole === 'manager' ? role === 'agent' : false
  const canDelete = myRole === 'owner'

  const act = (id, fn, okMsg) => {
    setBusy(id)
    Promise.resolve(fn())
      .then(() => { if (okMsg) store.toast(okMsg); store.reloadServer?.(); return load() })
      .catch(err => store.toast(cleanErr(err), 'warn'))
      .finally(() => setBusy(''))
  }
  const toggleSuspend = (u) => act(u.id,
    () => api.setUserStatus(u.id, isSuspended(u) ? 'active' : 'suspended'),
    isSuspended(u) ? `${u.name} reactivated` : `${u.name} suspended — signed out and paused from routing`)
  const forceLogout = (u) => act(u.id, () => api.forceLogout(u.id), `Signed ${u.name} out on every device`)
  const del = (u) => {
    if (!window.confirm(`Delete ${u.name}? Their past deals stay for attribution, but they can no longer sign in. This can't be undone from here.`)) return
    act(u.id, () => api.deleteUser(u.id), `${u.name} removed`)
  }
  const resetPw = (u) => {
    setBusy(u.id)
    api.adminResetPassword(u.id)
      .then(r => setReveal({ title: 'Password reset', name: u.name, handle: u.login_id || u.email, password: r.initialPassword }))
      .catch(err => store.toast(cleanErr(err), 'warn'))
      .finally(() => setBusy(''))
  }

  return (
    <div className="panel acc-panel">
      <SectionHead title="Manage access"
        right={<span className="u-muted acc-hint">Add, edit, and control who can sign in</span>} />
      {users == null ? (
        <div className="acc-tbl-wrap"><table className="tbl acc-tbl"><tbody>
          {[0, 1, 2].map(i => (
            <tr key={i}>
              <td><div className="acc-who"><span className="skel skel-av" /><div className="acc-name"><span className="skel skel-line" style={{ width: 120 }} /><span className="skel skel-line sm" style={{ width: 70 }} /></div></div></td>
              <td><span className="skel skel-line" style={{ width: 150 }} /></td>
              <td><span className="skel skel-line" style={{ width: 60 }} /></td>
              <td><span className="skel skel-line" style={{ width: 50 }} /></td>
              <td className="acc-actcol"><span className="skel skel-line" style={{ width: 180 }} /></td>
            </tr>
          ))}
        </tbody></table></div>
      ) : (
        <div className="acc-tbl-wrap">
          <table className="tbl acc-tbl">
            <thead>
              <tr><th>Person</th><th>Signs in with</th><th>Status</th><th>Last active</th><th className="acc-actcol">Actions</th></tr>
            </thead>
            <tbody>
              {users.map(u => {
                const mine = canManage(u.role)
                const self = u.id === meId
                const rowBusy = busy === u.id
                return (
                  <tr key={u.id} className={isSuspended(u) ? 'acc-off' : ''}>
                    <td>
                      <div className="acc-who">
                        <span className="av av-sm" style={{ background: 'var(--chrome)' }}>{(u.metadata?.initials) || (u.name || '?').split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase()}</span>
                        <div className="acc-name">
                          <div className="acc-n">{u.name}{self && <span className="acc-youtag">You</span>}</div>
                          <div className="u-muted acc-role">{roleLabel(u.role)}</div>
                        </div>
                      </div>
                    </td>
                    <td><span className="mono-num acc-handle">{u.login_id || u.email || '—'}</span>{u.must_change_password && <span className="acc-mustchg" title="Will set their own password on first sign-in">sets password on first login</span>}</td>
                    <td><span className={'pill ' + (isSuspended(u) ? 'acc-pill-off' : 'acc-pill-on')}><span className="dot" />{isSuspended(u) ? 'Suspended' : 'Active'}</span></td>
                    <td className="u-muted acc-last">{timeAgo(u.last_active)}</td>
                    <td className="acc-actcol">
                      {mine ? (
                        <div className="acc-actions">
                          <button className="acc-act" disabled={rowBusy} onClick={() => setEdit(u)} title="Edit name, email, phone or role">Edit</button>
                          <button className="acc-act" disabled={rowBusy} onClick={() => resetPw(u)} title="Reset password — you hand over the new one">Reset password</button>
                          <button className="acc-act" disabled={rowBusy} onClick={() => setSeat(u)} title="Hand this seat (and its leads) to a new person">Reassign seat</button>
                          <button className="acc-act" disabled={rowBusy} onClick={() => forceLogout(u)} title="Revoke every device this person is signed in on">Force logout</button>
                          <button className="acc-act" disabled={rowBusy || self} onClick={() => toggleSuspend(u)}>{isSuspended(u) ? 'Reactivate' : 'Suspend'}</button>
                          {canDelete && <button className="acc-act danger" disabled={rowBusy || self} onClick={() => del(u)}>Delete</button>}
                        </div>
                      ) : (
                        <span className="u-muted acc-noperm">{self ? '—' : 'Owner-managed'}</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {edit && <EditUserModal store={store} user={edit} canManage={canManage} onClose={() => setEdit(null)}
        onDone={() => { setEdit(null); store.reloadServer?.(); load() }} />}
      {reveal && <RevealCard data={reveal} store={store} onClose={() => setReveal(null)} />}
      {seat && <SeatModal store={store} user={seat} onClose={() => setSeat(null)}
        onDone={(res) => { setSeat(null); store.reloadServer?.(); load(); setReveal({ title: 'Seat reassigned', name: res.name, handle: res.loginId || res.handle, password: res.initialPassword }) }} />}
    </div>
  )
}

// One-time credential reveal shared by reset-password and seat-reassign.
function RevealCard({ data, store, onClose }) {
  const [copied, setCopied] = useState(false)
  const copy = () => {
    const text = `${store.state.settings?.firmName || 'Workspace'} login\nID / email: ${data.handle}\nPassword: ${data.password}`
    navigator.clipboard?.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500) }).catch(() => {})
  }
  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" style={{ width: 400 }} onClick={e => e.stopPropagation()}>
        <div className="m-head"><h3>{data.title}</h3><button className="btn btn-icon btn-quiet" onClick={onClose}><Icon name="x" /></button></div>
        <div className="m-content">
          <div className="u-muted" style={{ fontSize: 13, marginBottom: 14 }}>Hand this to {data.name} — they'll change it on first sign-in. It won't be shown again.</div>
          <div style={{ background: 'var(--card-2)', border: '1px solid var(--line)', borderRadius: 10, padding: '12px 14px', marginBottom: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 13.5, padding: '4px 0' }}><span className="u-muted">ID / email</span><span className="mono-num" style={{ fontWeight: 600, wordBreak: 'break-all' }}>{data.handle}</span></div>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 13.5, padding: '4px 0', borderTop: '1px solid var(--line-2)' }}><span className="u-muted">Password</span><span className="mono-num" style={{ fontWeight: 600 }}>{data.password}</span></div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <Button variant="secondary" onClick={copy}><Icon name={copied ? 'check' : 'copy'} size={14} />{copied ? 'Copied' : 'Copy'}</Button>
            <Button variant="primary" block onClick={onClose}>Done</Button>
          </div>
        </div>
      </div>
    </div>
  )
}

// Hand a seat (its login_id + all its leads) to a new person. Backend keeps the
// row, swaps identity, forces a password change and kicks the old sessions.
function SeatModal({ store, user, onClose, onDone }) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [saving, setSaving] = useState(false)
  const needsEmail = user.role !== 'agent'
  const submit = () => {
    if (!name.trim()) { store.toast('New person’s name is required', 'warn'); return }
    if (needsEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) { store.toast('An owner/manager seat needs a valid email', 'warn'); return }
    setSaving(true)
    api.reassignSeat(user.id, { name: name.trim(), email: email.trim(), phone: phone.trim() })
      .then(res => onDone({ name: name.trim(), handle: email.trim() || res.loginId, loginId: res.loginId, initialPassword: res.initialPassword }))
      .catch(err => { store.toast(cleanErr(err), 'warn'); setSaving(false) })
  }
  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" style={{ width: 420 }} onClick={e => e.stopPropagation()}>
        <div className="m-head"><h3>Reassign seat</h3><button className="btn btn-icon btn-quiet" onClick={onClose}><Icon name="x" /></button></div>
        <div className="m-content">
          <div className="u-muted" style={{ fontSize: 12.5, marginBottom: 14 }}>
            Hands <b style={{ color: 'var(--ink)' }}>{user.login_id || user.email}</b>’s seat — and every lead on it — to a new person. {user.name} loses access immediately.
          </div>
          <Field label="New person’s full name"><Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Sneha Kulkarni" autoFocus /></Field>
          <Field label={needsEmail ? 'Email' : 'Email (optional)'}><Input value={email} onChange={e => setEmail(e.target.value)} placeholder="name@firm.com" type="email" /></Field>
          <Field label="Mobile number (optional)"><PhoneInput value={phone} onChange={e => setPhone(e.target.value)} placeholder="98xxx xxxxx" /></Field>
          <Button variant="primary" block disabled={saving} style={{ marginTop: 12 }} onClick={submit}>{saving ? 'Reassigning…' : 'Reassign seat'}</Button>
        </div>
      </div>
    </div>
  )
}

// Edit a person's details / access level. Login handle (login_id / seat) is not
// changed here — that's the seat-reassign flow; this is name / contact / role.
function EditUserModal({ store, user, canManage, onClose, onDone }) {
  const [name, setName] = useState(user.name || '')
  const [email, setEmail] = useState(user.email || '')
  const [phone, setPhone] = useState(String(user.phone || '').replace(/^\+91/, ''))
  const [role, setRole] = useState(user.role === 'owner' ? 'owner' : user.role)
  const [saving, setSaving] = useState(false)
  const canSetRole = canManage('owner') && user.role !== 'owner'  // only an owner reassigns roles; owner row is fixed here
  const needsEmail = role !== 'agent'
  const submit = () => {
    if (!name.trim()) { store.toast('Name is required', 'warn'); return }
    if (needsEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) { store.toast('An owner or manager needs a valid email', 'warn'); return }
    setSaving(true)
    api.updateUser(user.id, { name: name.trim(), email: email.trim(), phone: phone.trim(), role })
      .then(() => { store.toast(`${name.trim()} updated`); onDone() })
      .catch(err => { store.toast(cleanErr(err), 'warn'); setSaving(false) })
  }
  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" style={{ width: 420 }} onClick={e => e.stopPropagation()}>
        <div className="m-head"><h3>Edit {user.name}</h3><button className="btn btn-icon btn-quiet" onClick={onClose}><Icon name="x" /></button></div>
        <div className="m-content">
          <div className="u-muted" style={{ fontSize: 12.5, marginBottom: 14 }}>
            Signs in with <b style={{ color: 'var(--ink)' }}>{user.login_id || user.email || '—'}</b>{user.login_id ? ' (agent ID)' : ''}. Changing the sign-in seat itself is “Reassign seat”.
          </div>
          <Field label="Full name"><Input value={name} onChange={e => setName(e.target.value)} autoFocus /></Field>
          <Field label={needsEmail ? 'Email' : 'Email (optional)'}><Input value={email} onChange={e => setEmail(e.target.value)} placeholder="name@firm.com" type="email" /></Field>
          <Field label="Mobile number (optional)"><PhoneInput value={phone} onChange={e => setPhone(e.target.value)} placeholder="98xxx xxxxx" /></Field>
          {canSetRole && (
            <Field label="Access level">
              <Segmented value={role} onChange={setRole} options={[{ value: 'agent', label: 'Sales agent' }, { value: 'manager', label: 'Manager' }]} />
            </Field>
          )}
          <Button variant="primary" block disabled={saving} style={{ marginTop: 12 }} onClick={submit}>{saving ? 'Saving…' : 'Save changes'}</Button>
        </div>
      </div>
    </div>
  )
}

// ── Your sessions — the caller's own signed-in devices, with per-device revoke ──
function SessionsPanel({ store }) {
  const [data, setData] = useState(null)   // { sessions, current }
  const [busy, setBusy] = useState('')
  const load = () => api.getSessions().then(setData).catch(() => setData({ sessions: [], current: null }))
  useEffect(() => { load() }, [])
  const revoke = (id) => {
    setBusy(id)
    api.revokeSession(id).then(() => { store.toast('Signed out that device'); load() })
      .catch(err => store.toast(cleanErr(err), 'warn')).finally(() => setBusy(''))
  }
  const sessions = data?.sessions || []
  return (
    <div className="panel acc-panel">
      <SectionHead title="Your sessions" right={<span className="u-muted acc-hint">Devices signed in as you</span>} />
      {data == null ? (
        <div className="acc-sess">
          {[0, 1].map(i => (
            <div key={i} className="acc-sess-row">
              <span className="skel skel-av sm" />
              <div className="acc-sess-meta"><span className="skel skel-line" style={{ width: 140 }} /><span className="skel skel-line sm" style={{ width: 90, marginTop: 6 }} /></div>
            </div>
          ))}
        </div>
      ) : sessions.length === 0 ? (
        <div className="acc-empty">No other active sessions.</div>
      ) : (
        <div className="acc-sess">
          {sessions.map(s => {
            const current = s.id === data.current
            return (
              <div key={s.id} className="acc-sess-row">
                <Icon name="monitor" size={16} className="ic acc-sess-ic" />
                <div className="acc-sess-meta">
                  <div className="acc-sess-ua">{prettyUA(s.user_agent)}{current && <span className="acc-youtag">This device</span>}</div>
                  <div className="u-muted acc-sess-sub">{s.ip || 'unknown IP'} · active {timeAgo(s.last_seen_at)}</div>
                </div>
                {current
                  ? <span className="u-muted acc-noperm">Sign out from the menu</span>
                  : <button className="acc-act danger" disabled={busy === s.id} onClick={() => revoke(s.id)}>Revoke</button>}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// Turn a raw UA string into a short, human label.
function prettyUA(ua) {
  if (!ua) return 'Unknown device'
  const os = /Windows/i.test(ua) ? 'Windows' : /iPhone|iOS/i.test(ua) ? 'iPhone' : /Android/i.test(ua) ? 'Android' : /Mac/i.test(ua) ? 'Mac' : /Linux/i.test(ua) ? 'Linux' : 'Device'
  const br = /Edg/i.test(ua) ? 'Edge' : /Chrome/i.test(ua) ? 'Chrome' : /Firefox/i.test(ua) ? 'Firefox' : /Safari/i.test(ua) ? 'Safari' : 'Browser'
  return `${br} on ${os}`
}
