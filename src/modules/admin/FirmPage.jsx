import { useEffect, useState } from 'react'
import { api } from '../../lib/api.js'
import { copyText } from '../../lib/clipboard.js'
import { supportFragment } from '../../lib/support.js'
import { Button } from '../../components/primitives.jsx'
import Icon from '../../components/Icon.jsx'
import Ledger, { fmtWhen } from './Ledger.jsx'

// ============================================================================
// ONE FIRM, AS DELPAT SEES IT
// ============================================================================
// Who reads it: Delpat, answering "is this firm working, is anyone stuck, and
// can I look at what they see". Three tabs:
//   Overview   leads arriving by source (a source gone quiet is a broken portal),
//              who worked in the last week, what it keeps in storage
//   People     who can sign in and what is in their way (locked, still on the
//              password they were handed, never signed in, alerts not arriving),
//              where they are signed in, the last sign-ins and failures
//   Audit log  its ledger
// Open desk opens the firm's own screens, read only, as its owner, for two
// hours (routes/admin.ts); it is on the firm's ledger.

const DAY = 86400000
const ago = (at) => {
  if (!at) return 'Never'
  const d = Math.floor((Date.now() - new Date(at).getTime()) / DAY)
  return d <= 0 ? 'Today' : d === 1 ? 'Yesterday' : `${d} days ago`
}
const mb = (bytes) => (bytes >= 1e9 ? `${(bytes / 1e9).toFixed(1)} GB` : `${(bytes / 1e6).toFixed(1)} MB`)
/** "Chrome on Android", from a user agent. Enough to tell two devices apart. */
function deviceOf(ua = '') {
  const os = /iPhone|iPad/.test(ua) ? 'iPhone' : /Android/.test(ua) ? 'Android' : /Windows/.test(ua) ? 'Windows' : /Mac OS/.test(ua) ? 'Mac' : /Linux/.test(ua) ? 'Linux' : 'Unknown device'
  const br = /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : ''
  return br ? `${br} on ${os}` : os
}

function Panel({ title, right, children }) {
  return (
    <section className="adm-panel">
      <div className="adm-panel-t"><span>{title}</span>{right}</div>
      {children}
    </section>
  )
}

export default function FirmPage({ firmId, onBack }) {
  const [tab, setTab] = useState('overview')
  const [d, setD] = useState(null)
  const [err, setErr] = useState('')
  const [shown, setShown] = useState(null)   // a password just reset, shown once
  const [busy, setBusy] = useState('')

  const load = () => api.adminFirm(firmId).then(r => { setD(r); setErr('') }).catch(e => setErr(e.message || 'Could not read the firm'))
  useEffect(() => { setD(null); load() /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [firmId])

  const openDesk = async () => {
    setBusy('desk')
    try {
      const r = await api.adminSupport(firmId)
      const frag = supportFragment({ slug: r.slug, token: r.token, expiresAt: r.expiresAt, by: r.by, owner: r.owner })
      window.open(`/${r.slug}/${frag}`, '_blank')
    } catch (e) { alert(e.message || 'Could not open the desk') } finally { setBusy('') }
  }
  const signOut = async (u) => {
    if (!window.confirm(`Sign ${u.name} out on every device?`)) return
    setBusy(u.id)
    try { await api.adminSignOutUser(firmId, u.id); await load() } finally { setBusy('') }
  }
  const reset = async (u) => {
    if (!window.confirm(`Give ${u.name} a new password? Their current one stops working and they are signed out.`)) return
    setBusy(u.id)
    try { const r = await api.adminResetUserPassword(firmId, u.id); setShown({ name: u.name, loginWith: r.loginWith, password: r.password }); await load() }
    finally { setBusy('') }
  }

  const crumb = (name) => (
    <div className="adm-crumb"><button type="button" onClick={onBack}>Firms</button><span>/</span><b>{name}</b></div>
  )
  if (err) return <div className="adm-page">{crumb('')}<div className="adm-err">{err}</div></div>
  if (!d) return <div className="adm-page"><div className="adm-wait tall" aria-busy="true" /></div>

  const t = d.tenant
  const worked = new Map((d.worked || []).map(w => [w.user_id, w]))
  const active = d.team.filter(u => (u.status || '').toLowerCase() !== 'suspended')
  const nameOf = new Map(d.team.map(u => [u.id, u.name]))

  return (
    <div className="adm-page">
      {crumb(t.name)}
      <div className="adm-head">
        <div>
          <h1>{t.name}</h1>
          <div className="adm-sub"><code>/{t.slug}</code><span>{t.plan || 'PRO'} · {(t.status || 'ACTIVE').toLowerCase()}</span><span>Since {new Date(t.created_at).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })}</span></div>
        </div>
        <Button variant="secondary" icon="eye" disabled={busy === 'desk'} onClick={openDesk}>Open desk, read only</Button>
      </div>

      <nav className="adm-tabs">
        {[['overview', 'Overview'], ['people', 'People and sign-ins'], ['audit', 'Audit log']].map(([k, label]) => (
          <button key={k} type="button" className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{label}</button>
        ))}
      </nav>

      {tab === 'overview' && (
        <>
          <div className="adm-facts">
            <div><b>{active.length}</b><span>people</span></div>
            <div><b>{d.counts.leads.toLocaleString('en-IN')}</b><span>leads, {d.counts.leads_7d} this week</span></div>
            <div><b>{d.counts.owners.toLocaleString('en-IN')}</b><span>on the calling list</span></div>
            <div><b>{d.counts.properties.toLocaleString('en-IN')}</b><span>properties</span></div>
            <div><b>{d.counts.agreements}</b><span>agreements</span></div>
            <div><b>{d.storage ? mb(d.storage.bytes) : '—'}</b><span>{d.storage ? `${d.storage.objects.toLocaleString('en-IN')}${d.storage.capped ? '+' : ''} files` : 'storage'}</span></div>
          </div>
          <div className="adm-two">
            <Panel title="Leads arriving">
              {!d.sources.length ? <div className="adm-empty">No leads yet.</div> : (
                <table className="adm-tbl">
                  <thead><tr><th>Source</th><th>Last lead</th><th>This week</th></tr></thead>
                  <tbody>{d.sources.map(s => {
                    const quiet = s.last_at && Date.now() - new Date(s.last_at).getTime() > 3 * DAY
                    return <tr key={s.source}><td>{s.source}</td><td className={quiet ? 'adm-warn' : ''}>{ago(s.last_at)}</td><td>{s.n_7d}</td></tr>
                  })}</tbody>
                </table>
              )}
            </Panel>
            <Panel title="Work, last 7 days">
              <table className="adm-tbl">
                <thead><tr><th>Person</th><th>Actions</th><th>Last worked</th></tr></thead>
                <tbody>{active.map(u => {
                  const w = worked.get(u.id)
                  return <tr key={u.id}><td>{u.name}<span className="adm-role">{u.role}</span></td><td className={w ? '' : 'adm-warn'}>{w ? w.actions : 0}</td><td>{w ? ago(w.last_at) : 'Not this week'}</td></tr>
                })}</tbody>
              </table>
            </Panel>
          </div>
        </>
      )}

      {tab === 'people' && (
        <>
          <Panel title="Who can sign in">
            <table className="adm-tbl">
              <thead><tr><th>Person</th><th>Signs in with</th><th /><th>Last sign-in</th><th>Signed in on</th><th>Alerts</th><th /></tr></thead>
              <tbody>{d.team.map(u => {
                const suspended = (u.status || '').toLowerCase() === 'suspended'
                const locked = u.locked_until && new Date(u.locked_until) > new Date()
                const flags = [
                  suspended && ['Suspended', ''],
                  locked && ['Locked out', 'bad'],
                  u.must_change_password && ['Still on the password given', 'warn'],
                  !u.last_login && !suspended && ['Never signed in', 'warn'],
                ].filter(Boolean)
                return (
                  <tr key={u.id} className={suspended ? 'adm-off' : ''}>
                    <td>{u.name}<span className="adm-role">{u.role}</span></td>
                    <td className="adm-mono">{u.role === 'agent' ? (u.login_id || u.email) : (u.email || u.login_id)}</td>
                    <td>{flags.map(([f, tone]) => <span key={f} className={'adm-flag ' + tone}>{f}</span>)}</td>
                    <td>{u.last_login ? fmtWhen(u.last_login) : 'Never'}</td>
                    <td>{u.live_sessions ? `${u.live_sessions} ${u.live_sessions === 1 ? 'device' : 'devices'}` : 'Nowhere'}</td>
                    <td className={u.alerts_failed_7d ? 'adm-warn' : ''}>
                      {u.devices ? `${u.devices} on` : 'Off'}{u.last_alert_ok ? `, last reached ${ago(u.last_alert_ok).toLowerCase()}` : ''}{u.alerts_failed_7d ? `, ${u.alerts_failed_7d} failed this week` : ''}
                    </td>
                    <td className="adm-acts">
                      {!suspended && u.live_sessions > 0 && <button disabled={busy === u.id} onClick={() => signOut(u)}>Sign out</button>}
                      {!suspended && <button disabled={busy === u.id} onClick={() => reset(u)}>New password</button>}
                    </td>
                  </tr>
                )
              })}</tbody>
            </table>
          </Panel>
          <div className="adm-two">
            <Panel title="Signed in now">
              {!d.sessions.length ? <div className="adm-empty">Nobody.</div> : (
                <table className="adm-tbl">
                  <thead><tr><th>Person</th><th>Device</th><th>Last seen</th></tr></thead>
                  <tbody>{d.sessions.map(s => (
                    <tr key={s.id}>
                      <td>{s.name || nameOf.get(s.user_id) || 'Unknown'}{s.support_by && <span className="adm-flag">Delpat support</span>}</td>
                      <td>{deviceOf(s.user_agent)}<span className="adm-dim">{s.ip || ''}</span></td>
                      <td>{fmtWhen(s.last_seen_at)}</td>
                    </tr>
                  ))}</tbody>
                </table>
              )}
            </Panel>
            <Panel title="Recent sign-ins">
              {!d.logins.length ? <div className="adm-empty">None recorded.</div> : (
                <table className="adm-tbl">
                  <thead><tr><th>When</th><th>Who</th><th /></tr></thead>
                  <tbody>{d.logins.map(l => (
                    <tr key={l.seq}>
                      <td>{fmtWhen(l.created_at)}</td>
                      <td>{l.actor_label || l.actor_id}<span className="adm-dim">{deviceOf(l.user_agent)}</span></td>
                      <td>{l.action === 'auth.login' ? 'Signed in' : <span className="adm-flag bad">Failed</span>}</td>
                    </tr>
                  ))}</tbody>
                </table>
              )}
            </Panel>
          </div>
        </>
      )}

      {tab === 'audit' && <Panel title="Audit log"><Ledger firmId={firmId} /></Panel>}

      {shown && (
        <div className="modal-overlay adm-overlay" onClick={() => setShown(null)}>
          <div className="adm-modal" onClick={e => e.stopPropagation()}>
            <h3>New password for {shown.name}</h3>
            <p>Shown once.</p>
            <div className="adm-cred"><span>Sign in with</span><b>{shown.loginWith}</b></div>
            <div className="adm-cred"><span>Password</span><b className="adm-mono">{shown.password}</b></div>
            <div className="adm-modal-acts">
              <Button icon="copy" onClick={() => copyText(`${shown.loginWith}\n${shown.password}`)}>Copy both</Button>
              <Button variant="primary" onClick={() => setShown(null)}>Done</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
