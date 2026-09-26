/**
 * ============================================================================
 * 🛰️ SUPERADMIN CONSOLE — the platform desk above every tenant
 * ============================================================================
 * Delpat-only. Reached at /admin (or ?admin). Superadmins sign in with email +
 * password, never a firm's sign-in, for a 12-hour session. Firms (each opens
 * its page: modules/admin/FirmPage.jsx), onboarding a firm, and Delpat's own
 * log.
 * ============================================================================
 */

import { useState, useEffect } from 'react'
import { api } from '../lib/api.js'
import { copyText } from '../lib/clipboard.js'
import { AppShell } from '../layouts/layouts.jsx'
import { Button, Field, Input } from '../components/primitives.jsx'
import Icon from '../components/Icon.jsx'
import FirmPage from './admin/FirmPage.jsx'
import Ledger from './admin/Ledger.jsx'

const COLOR_PRESETS = ['#7C3AED', '#1E6F52', '#1D4ED8', '#B45309', '#B91C1C', '#0F766E', '#0E7490', '#BE185D']

const ADMIN_NAV = [
  { section: 'Platform' },
  { key: 'workspaces', label: 'Firms', icon: 'building' },
  { key: 'audit', label: 'Delpat log', icon: 'shield' },
]

const DAY_MS = 86400000
const agoShort = (at) => {
  if (!at) return 'Never'
  const d = Math.floor((Date.now() - new Date(at).getTime()) / DAY_MS)
  return d <= 0 ? 'Today' : d === 1 ? 'Yesterday' : `${d} days ago`
}

export default function Admin() {
  const [authed, setAuthed] = useState(() => Boolean(api.getAdminToken?.()))
  // No address pre-filled: the console's sign-in is in the public bundle.
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [signingIn, setSigningIn] = useState(false)
  const [error, setError] = useState('')

  const [data, setData] = useState(null)
  const [loadErr, setLoadErr] = useState('')
  const [activeNav, setActiveNav] = useState('workspaces')
  // A firm opened from the list. In the URL (?firm=), so a reload stays on it.
  const [firm, setFirmState] = useState(() => new URLSearchParams(window.location.search).get('firm'))
  const setFirm = (id) => {
    setFirmState(id)
    const p = new URLSearchParams(window.location.search)
    if (id) p.set('firm', id); else p.delete('firm')
    window.history.pushState(null, '', `${window.location.pathname}?${p}`)
  }
  useEffect(() => {
    const onPop = () => setFirmState(new URLSearchParams(window.location.search).get('firm'))
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  const [showOnboardModal, setShowOnboardModal] = useState(false)
  const [handoverSummary, setHandoverSummary] = useState(null)

  const loadData = async () => {
    try {
      setLoadErr('')
      const res = await api.adminOverview()
      if (res?.success) setData(res)
      else throw new Error(res?.error || 'Could not read the firms')
    } catch (err) {
      // An expired or signed-out console session: back to sign-in.
      if (/401|authentication/i.test(err.message || '')) { api.clearAdminToken(); setAuthed(false); return }
      setLoadErr(err.message || 'Could not read the firms')
    }
  }

  useEffect(() => {
    if (authed) loadData()
  }, [authed])

  const doAdminLogin = async (e) => {
    e.preventDefault()
    if (!email || !password) { setError('Email and password are required'); return }
    setSigningIn(true); setError('')
    try {
      const res = await api.adminLogin(email, password)
      if (res?.token) {
        setAuthed(true)
        loadData()
      } else {
        throw new Error(res?.error || 'Invalid credentials')
      }
    } catch (err) {
      setError('Those details did not match.')
    } finally {
      setSigningIn(false)
    }
  }

  const doAdminLogout = async () => {
    await api.adminLogout()
    setAuthed(false)
    setData(null)
  }

  // --------------------------------------------------------------------------
  // UN-AUTHENTICATED: LOGIN SCREEN
  // --------------------------------------------------------------------------
  if (!authed) {
    return (
      <div className="viewport" style={{ background: '#0f0c1b', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, '--accent': '#7c3aed' }}>
        <div style={{ width: '100%', maxWidth: 400, background: '#18122B', border: '1px solid rgba(124, 58, 237, 0.25)', borderRadius: 16, padding: 32, boxShadow: '0 24px 64px rgba(0,0,0,0.6)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
            <div style={{ width: 40, height: 40, borderRadius: 10, background: '#7c3aed', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 800, fontSize: 18 }}>
              D
            </div>
            <div>
              <div style={{ color: '#fff', fontWeight: 700, fontSize: 18 }}>Delpat</div>
              <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12 }}>Superadmin</div>
            </div>
          </div>

          {error && <div style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', color: '#f87171', padding: '10px 14px', borderRadius: 8, fontSize: 13, marginBottom: 16 }}>{error}</div>}

          <form onSubmit={doAdminLogin}>
            <Field label="Email">
              <Input type="email" value={email} onChange={e => setEmail(e.target.value)} required autoComplete="username" />
            </Field>
            <div style={{ height: 14 }} />
            <Field label="Password">
              <Input type="password" value={password} onChange={e => setPassword(e.target.value)} required autoComplete="current-password" />
            </Field>
            <Button variant="primary" block type="submit" disabled={signingIn} style={{ marginTop: 20, height: 44, background: '#7c3aed', borderColor: '#7c3aed' }}>
              {signingIn ? 'Signing in…' : 'Sign in'}
            </Button>
          </form>
        </div>
      </div>
    )
  }

  // --------------------------------------------------------------------------
  // AUTHENTICATED
  // --------------------------------------------------------------------------
  const tenants = data?.tenants || []
  const adminFooter = {
    name: 'Delpat',
    role: 'Superadmin',
    items: [{ icon: 'x', label: 'Sign out', onClick: doAdminLogout }],
  }

  return (
    <div className="viewport" style={{ '--accent': '#7c3aed', '--accent-wash': 'rgba(124, 58, 237, 0.1)' }}>
      <AppShell
        nav={ADMIN_NAV}
        active={activeNav}
        onNav={(k) => { setActiveNav(k); setFirm(null) }}
        footer={adminFooter}
        firmName="Delpat"
        sub="Superadmin"
      >
        <div className="app-body">
          {activeNav === 'workspaces' && firm && (
            <FirmPage firmId={firm} onBack={() => { setFirm(null); loadData() }} />
          )}

          {activeNav === 'workspaces' && !firm && (
            <div className="adm-page">
              <div className="adm-head">
                <h1>Firms</h1>
                <Button variant="primary" icon="userPlus" onClick={() => setShowOnboardModal(true)}>Onboard a firm</Button>
              </div>
              {loadErr && <div className="adm-err">{loadErr}</div>}
              {!data ? <div className="adm-wait tall" aria-busy="true" /> : (
                <section className="adm-panel">
                  <table className="adm-tbl adm-firms">
                    <thead><tr><th>Firm</th><th>People</th><th>Leads</th><th>This week</th><th>Calling</th><th>Properties</th><th>Last work</th><th>Last signed in</th></tr></thead>
                    <tbody>
                      {tenants.map(t => {
                        const idle = !t.last_work || Date.now() - new Date(t.last_work).getTime() > 3 * DAY_MS
                        return (
                          <tr key={t.id} className="adm-link" onClick={() => setFirm(t.id)}>
                            <td><b>{t.name}</b><span className="adm-dim">/{t.slug}</span></td>
                            <td>{t.users}</td>
                            <td>{Number(t.leads).toLocaleString('en-IN')}</td>
                            <td>{t.leads_7d}</td>
                            <td>{Number(t.owners).toLocaleString('en-IN')}</td>
                            <td>{Number(t.properties).toLocaleString('en-IN')}</td>
                            <td className={idle ? 'adm-warn' : ''}>{agoShort(t.last_work)}</td>
                            <td>{agoShort(t.last_seen)}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </section>
              )}
            </div>
          )}

          {activeNav === 'audit' && (
            <div className="adm-page">
              <div className="adm-head"><h1>Delpat log</h1></div>
              <section className="adm-panel"><Ledger firmId={null} /></section>
            </div>
          )}
        </div>

      {showOnboardModal && (
        <OnboardWorkspaceModal
          onClose={() => setShowOnboardModal(false)}
          onSuccess={(result) => {
            setShowOnboardModal(false)
            setHandoverSummary(result)
            loadData()
          }}
        />
      )}
      {handoverSummary && (
        <HandoverModal data={handoverSummary} onClose={() => setHandoverSummary(null)} />
      )}
      </AppShell>
    </div>
  )
}

// ----------------------------------------------------------------------------
// WIZARD: ONBOARD WORKSPACE & BULK TEAM PROVISIONING
// ----------------------------------------------------------------------------
const TEAM_COLS = '1.3fr 1fr 1.2fr 1fr 1.3fr 0.8fr 24px'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const isPhone = (c) => /^\+?[\d\s-]{10,15}$/.test(c) && c.replace(/\D/g, '').length >= 10
const isRole = (c) => /^(agent|manager)$/i.test(c)

/**
 * A pasted roster: one person per line, cells split by comma or tab — so a
 * WhatsApp list and a block copied out of Excel read the same. Email, phone and
 * role are recognised by their shape wherever they sit; the remaining cells are
 * name, user ID, password in that order. Anything left blank is planned by the
 * server, never invented here.
 */
function parseRoster(text) {
  const firm = {}
  const rows = []
  for (const raw of String(text || '').split('\n')) {
    const line = raw.trim()
    if (!line) continue
    const head = line.match(/^(firm|workspace|slug|city|owner)\s*:\s*(.*)$/i)
    if (head) {
      const key = head[1].toLowerCase(), val = head[2].trim()
      if (key === 'firm' || key === 'workspace') firm.firmName = val
      else if (key === 'slug') firm.slug = val.toLowerCase()
      else if (key === 'city') firm.city = val
      else {
        const cells = val.split(/,|\t/).map(c => c.trim()).filter(Boolean)
        const rest = []
        for (const c of cells) {
          if (EMAIL_RE.test(c)) firm.ownerEmail = c
          else if (isPhone(c)) firm.ownerPhone = c.replace(/\D/g, '').slice(-10)
          else rest.push(c)
        }
        if (rest[0]) firm.ownerName = rest[0]
        if (rest[1]) firm.ownerPassword = rest[1]
      }
      continue
    }
    const cells = line.split(/,|\t/).map(c => c.trim())
    const row = { name: '', loginId: '', email: '', phone: '', role: 'agent', password: '', autoId: true }
    const rest = []
    for (const c of cells) {
      if (!c) continue
      if (EMAIL_RE.test(c)) row.email = c
      else if (isPhone(c)) row.phone = c.replace(/\D/g, '').slice(-10)
      else if (isRole(c)) row.role = c.toLowerCase()
      else rest.push(c)
    }
    row.name = (rest[0] || '').replace(/^[*\-•\d.)\s]+/, '').trim()
    // A header row copied along with the sheet.
    if (!row.name || /^(full\s*)?name$/i.test(row.name)) continue
    if (rest[1]) { row.loginId = rest[1]; row.autoId = false }
    if (rest[2]) row.password = rest[2]
    rows.push(row)
  }
  return { firm, rows }
}

function PasteBox({ value, onChange, onApply, withFirm }) {
  const example = (withFirm ? 'Firm: Sai Realty\nCity: Pune\nOwner: Aniket Sharma, aniket@sairealty.in, 9800000001\n' : '')
    + 'Ravi Patil, 9800000002, agent\nMeena Joshi, 9800000003, manager, meena@sairealty.in\nKiran Rao, 9800000004, agent, kiran, Kiran@4521'
  return (
    <div style={{ background: '#f4f3ef', padding: 14, borderRadius: 10, border: '1px solid var(--line)', marginBottom: 18 }}>
      <div style={{ fontSize: 12, color: 'var(--ink)', marginBottom: 8, lineHeight: 1.6 }}>
        {withFirm && <div><b>Firm:</b> name · <b>City:</b> city · <b>Owner:</b> name, email, phone</div>}
        <div>One person per line — <b>Name, Phone, Role</b> · optional: Email, User ID, Password</div>
        <div style={{ color: 'var(--muted)' }}>Comma or Excel columns · Role is agent or manager · blank User ID / Password are generated</div>
      </div>
      <textarea
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={example}
        rows={6}
        style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid var(--line)', fontSize: 12, fontFamily: 'monospace', resize: 'vertical', marginBottom: 10 }}
      />
      <Button size="sm" variant="primary" onClick={onApply} disabled={!value.trim()}>Fill form</Button>
    </div>
  )
}

function OnboardWorkspaceModal({ onClose, onSuccess }) {
  const [step, setStep] = useState(1) // 1 = Workspace & Owner, 2 = Bulk Team Setup
  const [form, setForm] = useState({
    firmName: '',
    slug: '',
    city: '',
    ownerName: '',
    ownerEmail: '',
    ownerPhone: '',
    // BLANK, DELIBERATELY. This field pre-filled a client's name and the year
    // -- shipped in the public bundle -- so every workspace Delpat provisioned
    // got the same owner password, and the paying client's owner account was
    // still on it. Left empty, provisionTenant() generates a random one per
    // firm and returns it to this screen.
    ownerPassword: '',
    mustChangePassword: true,
    primaryColor: '#1E6F52',
    logoUrl: '',
  })

  // Every row carries its user ID and password from the moment it appears —
  // planned by the server (planRoster), shown here, and sent back unchanged.
  // `autoId` marks an ID that came from the name, so renaming the person
  // re-derives it instead of leaving the old name's ID behind.
  const blankRow = () => ({ name: '', loginId: '', email: '', phone: '', role: 'agent', password: '', autoId: true })
  const [team, setTeam] = useState([blankRow()])
  const [ownerLoginId, setOwnerLoginId] = useState('')
  const [issues, setIssues] = useState([])

  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [showPasteBox, setShowPasteBox] = useState(false)
  const [rawText, setRawText] = useState('')

  const setF = (k, v) => setForm(s => ({ ...s, [k]: v }))

  // Ask the server to fill every blank ID and password. Only blanks are filled,
  // so a value typed while the request was in flight is never overwritten.
  const plan = async (nextForm = form, nextTeam = team) => {
    const named = nextTeam.filter(t => t.name.trim())
    try {
      const res = await api.adminOnboardPreview({
        ownerName: nextForm.ownerName, ownerEmail: nextForm.ownerEmail, ownerPassword: nextForm.ownerPassword,
        team: named.map(({ autoId, ...t }) => t),
      })
      if (!res?.success) return
      setOwnerLoginId(res.owner.loginId)
      setForm(f => f.ownerPassword ? f : { ...f, ownerPassword: res.owner.password })
      setIssues(res.issues || [])
      setTeam(list => {
        let k = 0
        return list.map(row => {
          if (!row.name.trim()) return row
          const p = res.team[k++]
          if (!p || p.name !== row.name.trim()) return row
          return { ...row, loginId: row.loginId || p.loginId, password: row.password || p.password }
        })
      })
    } catch { /* the grid still works; the server plans on submit */ }
  }

  // The owner's password is generated on open, not after creation.
  useEffect(() => { plan() }, [])

  const parsePastedRoster = () => {
    const { firm, rows } = parseRoster(rawText)
    const nextForm = { ...form, ...firm }
    const nextTeam = rows.length ? rows : team
    setForm(nextForm)
    setTeam(nextTeam)
    setShowPasteBox(false)
    setRawText('')
    plan(nextForm, nextTeam)
  }

  const updateTeamRow = (idx, field, val) => {
    setTeam(list => {
      const copy = [...list]
      const row = { ...copy[idx], [field]: val }
      if (field === 'name' && row.autoId) row.loginId = ''
      if (field === 'loginId') row.autoId = !val
      copy[idx] = row
      return copy
    })
  }

  const addTeamRow = () => {
    setTeam(list => [...list, blankRow()])
  }

  const removeTeamRow = (idx) => {
    setTeam(list => list.filter((_, i) => i !== idx))
  }

  const canProceed = form.firmName.trim() && form.city.trim() && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.ownerEmail.trim())

  const handleFinish = async (e) => {
    if (e) e.preventDefault()
    if (!canProceed) { setError('Firm name, city and owner email are required'); return }
    setBusy(true); setError('')

    // Clean valid team members (only requires Name!)
    const cleanedTeam = team
      .filter(t => t.name.trim())
      .map(t => ({
        name: t.name.trim(),
        loginId: t.loginId.trim() || undefined,
        email: t.email.trim(),
        phone: t.phone.trim(),
        role: t.role,
        password: t.password.trim() || undefined,
      }))

    try {
      const res = await api.adminOnboard({
        ...form,
        ownerName: form.ownerName.trim() || 'Owner',
        ownerEmail: form.ownerEmail.trim(),
        ownerPhone: form.ownerPhone.trim(),
        ownerPassword: form.ownerPassword.trim(),
        mustChangePassword: form.mustChangePassword,
        initialTeam: cleanedTeam,
      })

      if (res?.success) {
        onSuccess(res)
      } else {
        throw new Error(res?.message || res?.error || 'Provisioning failed')
      }
    } catch (err) {
      setError(err.message || 'Provisioning failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="modal-overlay" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: 20 }}>
      <div style={{ width: '100%', maxWidth: 900, background: '#fff', borderRadius: 16, border: '1px solid var(--line)', padding: 24, boxShadow: '0 20px 50px rgba(0,0,0,0.3)', maxHeight: '90vh', overflowY: 'auto' }}>
        
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, borderBottom: '1px solid var(--line)', paddingBottom: 14 }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 18, color: 'var(--ink)' }}>Onboard Workspace</div>
            <div style={{ fontSize: 12, color: 'var(--muted)' }}>Step {step} of 2: {step === 1 ? 'Firm & Owner Credentials' : 'Bulk Team Setup'}</div>
          </div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 18, color: 'var(--muted)' }}>✕</button>
        </div>

        {error && (
          <div style={{ background: '#fee2e2', border: '1px solid #fca5a5', color: '#991b1b', padding: '10px 14px', borderRadius: 8, fontSize: 13, marginBottom: 16 }}>
            {error}
          </div>
        )}

        {/* STEP 1: FIRM & OWNER CREDENTIALS */}
        {step === 1 && (
          <div>
            <div style={{ marginBottom: 16 }}>
              <Button size="sm" variant="ghost" onClick={() => setShowPasteBox(!showPasteBox)} style={{ border: '1px solid var(--line)', background: '#f9f8f6', width: '100%', justifyContent: 'center' }}>
                {showPasteBox ? 'Hide paste box' : 'Paste firm, owner and team'}
              </Button>
            </div>

            {showPasteBox && <PasteBox withFirm value={rawText} onChange={setRawText} onApply={parsePastedRoster} />}

            <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr', gap: 14, marginBottom: 14 }}>
              <Field label="Firm Name *">
                <Input value={form.firmName} onChange={e => setF('firmName', e.target.value)} placeholder="e.g. Sai Realty" autoFocus />
              </Field>
              <Field label="Workspace Slug (URL)">
                <Input value={form.slug} onChange={e => setF('slug', e.target.value)} placeholder="e.g. sai-realty" />
              </Field>
              <Field label="City *">
                <Input value={form.city} onChange={e => setF('city', e.target.value)} placeholder="e.g. Pune" />
              </Field>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
              <Field label="Owner Full Name">
                <Input value={form.ownerName} onChange={e => setF('ownerName', e.target.value)} onBlur={() => plan()} placeholder="e.g. Aniket Sharma" />
              </Field>
              <Field label="Owner Email (Login) *">
                <Input type="email" value={form.ownerEmail} onChange={e => setF('ownerEmail', e.target.value)} placeholder="aniket@sairealty.in" />
              </Field>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 16 }}>
              <Field label="Owner Phone">
                <Input value={form.ownerPhone} onChange={e => setF('ownerPhone', e.target.value)} placeholder="9876543210" />
              </Field>
              <Field label="Owner Password">
                <Input value={form.ownerPassword} onChange={e => setF('ownerPassword', e.target.value)} onBlur={() => plan()} style={{ fontWeight: 600, color: '#7c3aed' }} />
              </Field>
            </div>

            <div style={{ marginBottom: 16, fontSize: 13, color: 'var(--ink)' }}>
              Owner User ID: <code style={{ background: '#f4f3ef', padding: '3px 8px', borderRadius: 6 }}>{ownerLoginId || '—'}</code>
              {form.ownerEmail.trim() && <span style={{ color: 'var(--muted)' }}> · or {form.ownerEmail.trim()}</span>}
            </div>

            {/* Password change toggle */}
            <div style={{ marginBottom: 18, background: '#f9f8f6', padding: 12, borderRadius: 10, border: '1px solid var(--line)' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontSize: 13, color: 'var(--ink)', fontWeight: 600 }}>
                <input
                  type="checkbox"
                  checked={form.mustChangePassword}
                  onChange={e => setF('mustChangePassword', e.target.checked)}
                  style={{ width: 16, height: 16, accentColor: 'var(--accent)' }}
                />
                <span>Force owner to change password on first login</span>
              </label>
            </div>

            {/* The firm's logo: the same data URL Settings saves. */}
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--ink)', marginBottom: 8 }}>Logo</label>
              <div className="adm-logo">
                <span className="adm-logo-box" style={{ background: form.logoUrl ? '#fff' : form.primaryColor }}>
                  {form.logoUrl ? <img src={form.logoUrl} alt="" /> : (form.firmName || '?').trim().slice(0, 1).toUpperCase()}
                </span>
                <label className="btn btn-secondary btn-sm">
                  {form.logoUrl ? 'Replace' : 'Upload logo'}
                  <input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" hidden onChange={e => {
                    const file = e.target.files?.[0]
                    e.target.value = ''
                    if (!file) return
                    if (file.size > 512 * 1024) { setError('The logo must be under 512 KB.'); return }
                    const reader = new FileReader()
                    reader.onload = () => { setError(''); setF('logoUrl', String(reader.result)) }
                    reader.readAsDataURL(file)
                  }} />
                </label>
                {form.logoUrl && <button type="button" className="btn btn-ghost btn-sm" onClick={() => setF('logoUrl', '')}>Remove</button>}
              </div>
            </div>

            {/* Primary Accent Color Selection */}
            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--ink)', marginBottom: 8 }}>Primary Brand Color</label>
              <div style={{ display: 'flex', gap: 10 }}>
                {COLOR_PRESETS.map(hex => (
                  <button
                    key={hex}
                    type="button"
                    onClick={() => setF('primaryColor', hex)}
                    style={{ width: 32, height: 32, borderRadius: '50%', background: hex, border: form.primaryColor === hex ? '3px solid #1a1a1a' : '2px solid transparent', cursor: 'pointer', outline: 'none' }}
                  />
                ))}
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <Button variant="ghost" onClick={onClose}>Cancel</Button>
              <Button variant="primary" disabled={!canProceed} onClick={() => setStep(2)}>
                Next: Add Team Members ➔
              </Button>
            </div>
          </div>
        )}

        {/* STEP 2: BULK TEAM SETUP */}
        {step === 2 && (
          <div>
            <div style={{ marginBottom: 14, fontSize: 13, color: 'var(--muted)' }}>
              Team for <b>{form.firmName}</b>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
              <div style={{ display: 'grid', gridTemplateColumns: TEAM_COLS, gap: 8, padding: '0 10px', fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.4 }}>
                <span>Name</span><span>User ID</span><span>Password</span><span>Phone</span><span>Email</span><span>Role</span><span />
              </div>
              {team.map((row, i) => (
                <div key={i} style={{ display: 'grid', gridTemplateColumns: TEAM_COLS, gap: 8, alignItems: 'center', background: '#f9f8f6', padding: 10, borderRadius: 10, border: '1px solid var(--line)' }}>
                  <Input value={row.name} onChange={e => updateTeamRow(i, 'name', e.target.value)} onBlur={() => plan()} placeholder="Full name" style={{ fontSize: 12.5 }} />
                  <Input value={row.loginId} onChange={e => updateTeamRow(i, 'loginId', e.target.value)} onBlur={() => plan()} style={{ fontSize: 12.5, fontFamily: 'monospace' }} />
                  <Input value={row.password} onChange={e => updateTeamRow(i, 'password', e.target.value)} onBlur={() => plan()} style={{ fontSize: 12.5, fontFamily: 'monospace', fontWeight: 600, color: '#7c3aed' }} />
                  <Input value={row.phone} onChange={e => updateTeamRow(i, 'phone', e.target.value)} placeholder="Phone" style={{ fontSize: 12.5 }} />
                  <Input type="email" value={row.email} onChange={e => updateTeamRow(i, 'email', e.target.value)} onBlur={() => plan()} placeholder="Email" style={{ fontSize: 12.5 }} />
                  <select value={row.role} onChange={e => updateTeamRow(i, 'role', e.target.value)} style={{ padding: '8px 6px', borderRadius: 6, border: '1px solid var(--line)', fontSize: 12, background: '#fff' }}>
                    <option value="agent">Agent</option>
                    <option value="manager">Manager</option>
                  </select>
                  {team.length > 1 ? (
                    <button type="button" onClick={() => removeTeamRow(i)} style={{ border: 'none', background: 'transparent', color: '#f87171', cursor: 'pointer', fontWeight: 700 }}>✕</button>
                  ) : <span />}
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
              <Button size="sm" onClick={addTeamRow}>+ Add Row</Button>
              <Button size="sm" variant="ghost" onClick={() => setShowPasteBox(!showPasteBox)} style={{ border: '1px solid var(--line)', background: '#f9f8f6' }}>
                {showPasteBox ? 'Hide paste box' : 'Paste team'}
              </Button>
            </div>

            {showPasteBox && <PasteBox value={rawText} onChange={setRawText} onApply={parsePastedRoster} />}

            {issues.length > 0 && (
              <div style={{ background: '#fee2e2', border: '1px solid #fca5a5', color: '#991b1b', padding: '10px 14px', borderRadius: 8, fontSize: 12.5, marginBottom: 16 }}>
                {issues.map(x => <div key={x}>{x}</div>)}
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--line)', paddingTop: 16 }}>
              <Button variant="ghost" onClick={() => setStep(1)}>← Back</Button>
              <Button variant="primary" disabled={busy || issues.length > 0} onClick={handleFinish}>
                {busy ? 'Provisioning Workspace…' : 'Complete Onboarding & Create Users'}
              </Button>
            </div>
          </div>
        )}

      </div>
    </div>
  )
}

// ----------------------------------------------------------------------------
// HANDOVER MODAL: CLEAN WHATSAPP/EMAIL COPY SUMMARY
// ----------------------------------------------------------------------------
function HandoverModal({ data, onClose }) {
  const [copied, setCopied] = useState(false)

  const tenant = data.tenant
  const owner = data.owner
  const initialPassword = data.initialPassword
  const team = data.team || []

  const agents = team.filter(t => t.role === 'agent')
  const managers = team.filter(t => t.role === 'manager')

  const formattedText = `Welcome to ${tenant.name} CRM

Workspace URL:
https://${window.location.host}/${tenant.slug}

Owner Credentials:
- User ID: ${owner.login_id || owner.email}
- Password: ${initialPassword}

${managers.length > 0 ? `Managers Credentials:\n${managers.map(t => `- ${t.name}: User ID: ${t.loginId || t.email} | Password: ${t.password}`).join('\n')}\n\n` : ''}${agents.length > 0 ? `Sales Executives Credentials:\n${agents.map(t => `- ${t.name}: User ID: ${t.loginId || t.email} | Password: ${t.password}`).join('\n')}\n\n` : ''}Installed PWA:
Open https://${window.location.host}/${tenant.slug} on your phone browser and tap "Add to Home Screen".`

  // This flipped to "Copied" on the very next line, whatever the write did --
  // on a sheet of workspace credentials, where believing you have them and
  // pasting the previous contents of your clipboard is the expensive mistake.
  const copyToClipboard = () => {
    copyText(formattedText).then(ok => { if (ok) { setCopied(true); setTimeout(() => setCopied(false), 2000) } })
  }

  return (
    <div className="modal-overlay" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: 20 }}>
      <div style={{ width: '100%', maxWidth: 540, background: '#fff', borderRadius: 16, border: '1px solid var(--line)', padding: 24, boxShadow: '0 20px 50px rgba(0,0,0,0.3)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#15803d', fontWeight: 700, fontSize: 17, marginBottom: 14 }}>
          <span>Workspace '{tenant.name}' Provisioned</span>
        </div>

        <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 14 }}>
          Copy this formatted handover summary and paste it directly to your client via WhatsApp or Email:
        </div>

        <textarea
          readOnly
          value={formattedText}
          rows={10}
          style={{ width: '100%', padding: 12, borderRadius: 10, border: '1px solid var(--line)', background: '#f9f8f6', fontFamily: 'monospace', fontSize: 12.5, color: 'var(--ink)', marginBottom: 16, resize: 'none' }}
        />

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Button variant="ghost" onClick={onClose}>Close</Button>
          <Button variant="primary" onClick={copyToClipboard}>
            {copied ? '✓ Copied to Clipboard!' : 'Copy Handover Summary'}
          </Button>
        </div>
      </div>
    </div>
  )
}
