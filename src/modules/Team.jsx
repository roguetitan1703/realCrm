import { useEffect, useState } from 'react'
import { Avatar, Button, Field, Input, PhoneInput, SectionHead, PageHeader, Segmented, RowMenu, Pager } from '../components/primitives.jsx'
import Icon from '../components/Icon.jsx'
import { api } from '../lib/api.js'
import { useServerData } from '../lib/useServerData.js'
import { buildRoster, RosterRow } from '../components/roster.jsx'
import { whenLabel } from '../lib/format.js'

const ROLE_LABEL = { admin: 'Owner / Admin', owner: 'Owner', agent: 'Sales Advisor', manager: 'Sales Manager' }
const roleLabel = (r) => ROLE_LABEL[r] || (r ? r[0].toUpperCase() + r.slice(1) : 'Sales Advisor')

// The api client throws Error("API Error: 400 … — <detail>"); show just the detail.
const cleanErr = (err) => {
  const m = String(err?.message || '')
  const i = m.indexOf('—')
  return i >= 0 ? m.slice(i + 1).trim() : (m.replace(/^API Error:\s*/, '') || 'Something went wrong')
}
const isSuspended = (u) => String(u.status || '').toLowerCase() === 'suspended'
// When something happened is one rule, in one function — see whenLabel.
const timeAgo = (ts) => (ts ? whenLabel(ts) : 'never')

export default function Team({ store, go, topBar }) {
  const { state } = store
  const inactive = (id) => state.inactiveAgentIds.includes(id)
  const toLeads = (leadFilters) => go && go('leads', { leadFilters, leadOpen: false, leadId: undefined })

  // ONE read for the whole roster. This screen used to fire
  // getAgentPerformance once PER AGENT on mount — nine requests for nine
  // integers — while ALSO fetching the desk summary that could answer the same
  // question in one. The per-agent 30-day call and visit counts now come back
  // with the summary, and buildRoster is shared with the dashboard so the two
  // screens cannot show different numbers for the same person (§3.3).
  const { data: desk } = useServerData(() => api.getDeskSummary(), [state.dataAsOf], null, '/workspace/desk-summary')
  const perfLoaded = !!desk
  const perAgent = desk?.perAgent || {}
  const built = buildRoster({
    agents: state.agents, perAgent, perAgentCalls: desk?.perAgentCalls || {}, inactive,
  })
  const roster = built.rows

  const activeCount = roster.filter(r => !r.off).length
  const openTotal = desk?.leads?.open || 0
  const unassigned = desk?.leads?.unassigned || 0
  const overdueTotal = desk?.leads?.overdue || 0

  // Order and scale come from buildRoster, so the dashboard's top five are the
  // same five people in the same sequence. Ranking by `won` put every agent on
  // 0 in alphabetical order and called it standings.
  const { evenShare, maxLoad } = built
  const ranked = roster

  // Glance KPIs — same compact ph-stats row as Import and the other modules.
  const kpis = [
    { label: 'On the desk', value: `${activeCount}/${state.agents.length}` },
    { label: 'Open leads', value: openTotal, onClick: () => toLeads({}) },
    { label: 'Unassigned', value: unassigned, tone: unassigned > 0 ? 'alert' : undefined, onClick: () => toLeads({ flag: ['unassigned'] }) },
    { label: 'Overdue', value: overdueTotal, tone: overdueTotal > 0 ? 'alert' : undefined, onClick: () => toLeads({ seg: 'overdue' }) },
  ]

  return (
    <>
      {topBar({ title: 'Team' })}
      <PageHeader kpis={kpis} right={<Button variant="primary" icon="userPlus" onClick={() => store.openModal({ kind: 'addAgent' })}>Add teammate</Button>} />
      <div className="app-body pagewrap">
        {/* PRIMARY: who can sign in + admin controls */}
        <AccessPanel store={store} />

        {/* SECONDARY: how the desk is performing */}
        {/* `panel`, like the two either side of it. The old board carried its own
            card styling per agent, so this wrapper never needed the class —
            take the board away and the section lost its surface entirely and sat
            bare on the page background. */}
        <div className="panel acc-panel">
          {/* No caption. It read "Who's carrying the load and who's closing" —
              explanatory copy justifying the panel, which the rules forbid, and
              it stopped being true when the columns changed. The rows say it. */}
          <SectionHead title="Team activity" right={desk ? `${activeCount} on the desk` : undefined} />
          {!perfLoaded
            ? <div className="list-spin" role="status" aria-label="Loading"><span /></div>
            : ranked.map(r => (
              <RosterRow key={r.a.id} r={r} evenShare={evenShare} maxLoad={maxLoad}
                onOpen={() => toLeads({ agent: [r.a.id] })}
                actions={(row) => (
                  <Button size="sm" onClick={() => store.openModal({ kind: 'reassign', fromId: row.a.id })}>Reassign</Button>
                )} />
            ))}
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
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const setPageSizeP = (v) => { setPageSize(v); setPage(1) }

  const load = () => api.getUsers().then(r => setUsers(r.users || [])).catch(() => setUsers([]))
  useEffect(() => { load() }, [])

  const pageCount = Math.max(1, Math.ceil((users?.length || 0) / pageSize))
  // A row acted on could move the person off the page they were on (a
  // suspend re-sorts nothing here, but a shrinking last page after a delete
  // would otherwise strand the view past the end).
  useEffect(() => { if (page > pageCount) setPage(pageCount) }, [pageCount, page])
  const pageRows = (users || []).slice((page - 1) * pageSize, page * pageSize)

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
  const [resetTarget, setResetTarget] = useState(null) // user being reset
  const resetPw = (u) => setResetTarget(u)
  // Off duty is READ here (the status pill below) but not toggled here — the
  // action lived in this menu once and read as a confusing near-duplicate of
  // Suspend, so it's gone. Routing eligibility is set from Settings → Routing.
  const off = (u) => store.state.inactiveAgentIds.includes(u.id)

  return (
    <div className="panel acc-panel">
      <SectionHead title="Manage access"
        right={<span className="u-muted acc-hint">Add, edit, and control who can sign in</span>} />
      {users == null ? (
        <div className="acc-tbl-wrap"><table className="tbl acc-tbl"><tbody>
          {[0, 1, 2].map(i => (
            <tr key={i}>
              <td><div className="acc-who"><span className="skel skel-av" /><div className="acc-name"><span className="skel skel-line" style={{ width: 120 }} /><span className="skel skel-line sm" style={{ width: 70 }} /></div></div></td>
              <td><span className="skel skel-line" style={{ width: 80 }} /></td>
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
              <tr><th>Person</th><th>User ID</th><th>Email</th><th>Status</th><th>Last active</th><th className="acc-actcol">Actions</th></tr>
            </thead>
            <tbody>
              {pageRows.map(u => {
                const mine = canManage(u.role)
                const self = u.id === meId
                const rowBusy = busy === u.id
                // Everything rare, or destructive, or both — behind the ⋯. What's
                // left visible (Edit, Reassign seat, Suspend) is what an owner
                // actually reaches for most.
                const overflow = [
                  { icon: 'shield', label: 'Reset password', onClick: () => resetPw(u) },
                  { icon: 'x', label: 'Force logout', onClick: () => forceLogout(u) },
                  ...(!self && canDelete ? [{ icon: 'trash', label: 'Delete', tone: 'danger', onClick: () => del(u) }] : []),
                ]
                return (
                  <tr key={u.id} className={isSuspended(u) ? 'acc-off' : ''}>
                    <td>
                      <div className="acc-who">
                        <span className="av av-sm">{(u.metadata?.initials) || (u.name || '?').split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase()}</span>
                        <div className="acc-name">
                          <div className="acc-n">{u.name}{self && <span className="acc-youtag">You</span>}</div>
                          <div className="u-muted acc-role">{roleLabel(u.role)} · ID: <b style={{ color: 'var(--ink)' }}>{u.login_id || '—'}</b></div>
                        </div>
                      </div>
                    </td>
                    <td><span className="mono-num acc-handle">{u.login_id || '—'}</span></td>
                    <td><span className="mono-num acc-handle">{u.email || '—'}</span></td>
                    <td>
                      <span className={'pill ' + (isSuspended(u) ? 'acc-pill-off' : 'acc-pill-on')}><span className="dot" />{isSuspended(u) ? 'Suspended' : 'Active'}</span>
                      {!isSuspended(u) && off(u) && <span className="pill acc-pill-duty" style={{ marginLeft: 6 }}>Off duty</span>}
                      {u.must_change_password && <span className="acc-mustchg" title="They set their own password on first sign-in">first-login password pending</span>}
                    </td>
                    <td className="u-muted acc-last">{timeAgo(u.last_active)}</td>
                    <td className="acc-actcol">
                      {mine ? (
                        <div className="acc-actions">
                          <button className="acc-act" disabled={rowBusy} onClick={() => setEdit(u)} title="Edit name, email, phone or role">Edit</button>
                          {/* Handing over your own seat, suspending yourself or
                              deleting yourself are not real actions — they'd
                              either sign you out mid-click or lock the firm out
                              of its own owner account. Not disabled, absent:
                              a greyed-out Delete button on your own row still
                              asks "could I delete myself?", which is a question
                              this screen has no business raising. */}
                          {!self && <button className="acc-act" disabled={rowBusy} onClick={() => setSeat(u)} title="Hand this seat (and its leads) to a new person">Reassign seat</button>}
                          {!self && <button className="acc-act" disabled={rowBusy} onClick={() => toggleSuspend(u)}>{isSuspended(u) ? 'Reactivate' : 'Suspend'}</button>}
                          <RowMenu items={overflow} disabled={rowBusy} />
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
          <Pager page={page} pageCount={pageCount} onPage={setPage} total={users.length} pageSize={pageSize} onPageSize={setPageSizeP} />
        </div>
      )}

      {edit && <EditUserModal store={store} user={edit} canManage={canManage} onClose={() => setEdit(null)}
        onDone={() => { setEdit(null); store.reloadServer?.(); load() }} />}
      {resetTarget && <ResetPasswordModal store={store} user={resetTarget} onClose={() => setResetTarget(null)}
        onDone={(res) => { const u = resetTarget; setResetTarget(null); store.reloadServer?.(); load(); setReveal({ title: 'Password reset', name: u.name, handle: u.login_id || u.email, byId: !!u.login_id, password: res.password }) }} />}
      {reveal && <RevealCard data={reveal} store={store} onClose={() => setReveal(null)} />}
      {seat && <SeatModal store={store} user={seat} onClose={() => setSeat(null)}
        onDone={(res) => { setSeat(null); store.reloadServer?.(); load(); setReveal({ title: 'Seat reassigned', name: res.name, handle: res.loginId || res.handle, byId: !!res.loginId, password: res.initialPassword }) }} />}
    </div>
  )
}

// One-time credential reveal shared by reset-password and seat-reassign.
function RevealCard({ data, store, onClose }) {
  const [copied, setCopied] = useState(false)
  const [left, setLeft] = useState(3)   // seconds it stays locked open, so it can't be dismissed by accident
  useEffect(() => {
    if (left <= 0) return
    const t = setTimeout(() => setLeft(n => n - 1), 1000)
    return () => clearTimeout(t)
  }, [left])
  const locked = left > 0
  const tryClose = () => { if (!locked) onClose() }
  const idLabel = data.byId ? 'User ID' : 'Email'
  const copy = () => {
    const firm = store.state.settings?.firmName || 'Workspace'
    const text = `${firm} sign-in\n${idLabel}: ${data.handle}\nTemporary password: ${data.password}`
    copyText(text).then(ok => { if (ok) { setCopied(true); setTimeout(() => setCopied(false), 1500) } })
  }
  return (
    <div className="overlay" onClick={tryClose}>
      <div className="modal" style={{ width: 400 }} onClick={e => e.stopPropagation()}>
        <div className="m-head"><h3>{data.title}</h3>
          <button className="btn btn-icon btn-quiet" onClick={tryClose} disabled={locked} style={locked ? { opacity: .4, cursor: 'default' } : undefined}><Icon name="x" /></button>
        </div>
        <div className="m-content">
          <div className="u-muted" style={{ fontSize: 13, marginBottom: 14 }}>Give these to <b style={{ color: 'var(--ink)' }}>{data.name}</b>. The password <b style={{ color: 'var(--ink)' }}>won't be shown again</b> — copy it now. They set their own on first sign-in.</div>
          <div style={{ background: 'var(--card-2)', border: '1px solid var(--line)', borderRadius: 10, padding: '12px 14px', marginBottom: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 13, padding: '4px 0' }}><span className="u-muted">{idLabel}</span><span className="mono-num" style={{ fontWeight: 600, wordBreak: 'break-all' }}>{data.handle}</span></div>
          </div>
          {/* Password is the thing that matters — make it the hero, not a table row. */}
          <div style={{ marginBottom: 14 }}>
            <div className="u-muted" style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 6 }}>Temporary password</div>
            <div className="mono-num" style={{ fontSize: 20, fontWeight: 700, letterSpacing: '.02em', background: 'var(--accent-wash)', color: 'var(--accent-ink)', border: '1px solid var(--accent-line)', borderRadius: 10, padding: '12px 14px', textAlign: 'center', wordBreak: 'break-all' }}>{data.password}</div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <Button variant="secondary" onClick={copy}><Icon name={copied ? 'check' : 'copy'} size={14} />{copied ? 'Copied' : 'Copy'}</Button>
            <Button variant="primary" block onClick={tryClose} disabled={locked}>{locked ? `Keep open (${left})` : 'Done'}</Button>
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
          <Field label="User ID (used to sign in — fixed)">
            <Input value={user.login_id || '—'} disabled readOnly />
          </Field>
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
                {/* A phone gets a phone. Two sessions from one handset were two
                    identical monitor icons. */}
                <Icon name={isHandheld(s.user_agent) ? 'phone' : 'monitor'} size={16} className="ic acc-sess-ic" />
                <div className="acc-sess-meta">
                  <div className="acc-sess-ua">{prettyUA(s.user_agent)}{current && <span className="acc-youtag">This device</span>}</div>
                  {/* WHEN IT STARTED, which is the only thing that separates two
                      sessions on the SAME phone — same browser, same OS, same IP,
                      and the row showed none of the three. created_at was already
                      being returned by listSessions and thrown away here. */}
                  {/* NO IP. It is captured and it belongs in the audit ledger,
                      but on this screen it was the only thing telling two rows
                      apart and it is the wrong tool for the job: a whole office
                      shares one address, and a phone on mobile data changes its
                      own between one sign-in and the next. Two sessions from one
                      desk read as one place, two from one handset read as two.
                      What actually separates two sessions is when each began. */}
                  <div className="u-muted acc-sess-sub">
                    signed in {timeAgo(s.created_at)} · active {timeAgo(s.last_seen_at)}
                  </div>
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

const isHandheld = (ua) => /iPhone|iPad|Android|Mobile/i.test(String(ua || ''))

/**
 * Name the device as precisely as the browser is willing to say — and no more.
 *
 * "Chrome on Windows" was every desk session in the firm, so seven rows read
 * identically and the list could not do the one job it exists for. Everything
 * below is squeezed out of the same user-agent string that was already stored:
 * the browser's major version, the OS version, and — on Android only — the
 * handset model, which is the one place a real device name is actually sent.
 *
 * What no header carries is the machine's own name. There is no "HP Victus" in
 * a user-agent, in a Client Hint, or anywhere else a web page can reach: on
 * Windows and macOS the model field is deliberately empty, because it would
 * fingerprint the person. So two Chrome-on-Windows sessions are told apart by
 * their browser version and their sign-in time, and if a firm needs more than
 * that the honest answer is a name the user types, not one we guess.
 */
function prettyUA(ua) {
  const s = String(ua || '')
  if (!s) return 'Unknown device'

  // Order matters: Edge and every Chromium browser also say "Chrome", and
  // everything on iOS says "Safari" whatever it really is.
  const br = /Edg\//i.test(s) ? ['Edge', /Edg\/(\d+)/i]
    : /OPR\//i.test(s) ? ['Opera', /OPR\/(\d+)/i]
      : /CriOS/i.test(s) ? ['Chrome', /CriOS\/(\d+)/i]
        : /Firefox/i.test(s) ? ['Firefox', /Firefox\/(\d+)/i]
          : /Chrome\//i.test(s) ? ['Chrome', /Chrome\/(\d+)/i]
            : /Safari/i.test(s) ? ['Safari', /Version\/(\d+)/i]
              : ['Browser', null]
  const ver = br[1] ? (s.match(br[1]) || [])[1] : null
  const browser = ver ? `${br[0]} ${ver}` : br[0]

  // The Android model sits in the platform block: "(Linux; Android 14; SM-G991B)".
  // A WebView appends " Build/…" to it, which is not part of the name.
  const droid = s.match(/Android\s+([\d.]+)[;)]\s*([^);]*)/i)
  if (droid) {
    const model = (droid[2] || '').replace(/\s*Build\/.*$/i, '').replace(/\bwv\b/i, '').trim()
    return [browser, `Android ${droid[1]}`, model && model !== 'K' ? model : null].filter(Boolean).join(' · ')
  }
  const ios = s.match(/(iPhone|iPad)[^)]*OS\s+([\d_]+)/i)
  if (ios) return `${browser} · ${ios[1]} ${ios[2].replace(/_/g, '.')}`
  // Windows 10 and 11 both report NT 10.0 — there is nothing to add.
  const os = /Windows/i.test(s) ? 'Windows'
    : /Mac OS X\s*([\d_.]+)/i.test(s) ? 'macOS ' + (s.match(/Mac OS X\s*([\d_.]+)/i)[1] || '').replace(/_/g, '.')
      : /CrOS/i.test(s) ? 'ChromeOS' : /Linux/i.test(s) ? 'Linux' : null
  return [browser, os].filter(Boolean).join(' · ')
}

function ResetPasswordModal({ store, user, onClose, onDone }) {
  const [password, setPassword] = useState('Firm@2026')
  const [mustChange, setMustChange] = useState(true)
  const [saving, setSaving] = useState(false)

  const submit = (e) => {
    if (e) e.preventDefault()
    if (!password.trim()) { store.toast('Enter a new password.', 'warn'); return }
    setSaving(true)
    api.adminResetPassword(user.id, password.trim(), mustChange)
      .then(() => onDone({ password: password.trim(), mustChange }))
      .catch(err => { store.toast(cleanErr(err), 'warn'); setSaving(false) })
  }

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" style={{ width: 420 }} onClick={e => e.stopPropagation()}>
        <div className="m-head">
          <h3>Reset Password — {user.name}</h3>
          <button className="btn btn-icon btn-quiet" onClick={onClose}><Icon name="x" /></button>
        </div>
        <div className="m-content">
          <div className="u-muted" style={{ fontSize: 13, marginBottom: 14 }}>
            Set a custom new password for <b style={{ color: 'var(--ink)' }}>{user.name}</b> ({user.login_id || user.email}).
          </div>

          <Field label="New Password">
            <Input value={password} onChange={e => setPassword(e.target.value)} placeholder="Type new password" autoFocus />
          </Field>

          <div style={{ marginBottom: 18, background: 'var(--card-2)', padding: 12, borderRadius: 10, border: '1px solid var(--line)' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontSize: 13, color: 'var(--ink)', fontWeight: 600 }}>
              <input
                type="checkbox"
                checked={mustChange}
                onChange={e => setMustChange(e.target.checked)}
                style={{ width: 16, height: 16, accentColor: 'var(--accent)' }}
              />
              <span>Require user to change password on next sign-in</span>
            </label>
          </div>

          <Button variant="primary" block disabled={saving} onClick={submit}>
            {saving ? 'Resetting Password…' : 'Set New Password'}
          </Button>
        </div>
      </div>
    </div>
  )
}
