/**
 * ============================================================================
 * 🛰️ SUPERADMIN CONSOLE — the platform desk above every tenant
 * ============================================================================
 * Delpat-only. Reached at /admin (or ?admin). Superadmins sign in with email +
 * password — never the tenant phone OTP — and land on a powerful overview:
 * the tenant roster, bulk onboarding wizard, and audit chain.
 * ============================================================================
 */

import { useState, useEffect } from 'react'
import { api } from '../lib/api.js'
import { PLATFORM } from '../data/platform.js'
import { AppShell } from '../layouts/layouts.jsx'
import { Button, Field, Input, PageHeader, RowMenu, Pager } from '../components/primitives.jsx'
import Icon from '../components/Icon.jsx'

const COLOR_PRESETS = ['#7C3AED', '#1E6F52', '#1D4ED8', '#B45309', '#B91C1C', '#0F766E', '#0E7490', '#BE185D']

const ADMIN_NAV = [
  { section: 'Platform Control' },
  { key: 'workspaces', label: 'Workspaces', icon: 'building' },
  { key: 'audit', label: 'Audit Ledger', icon: 'shield' },
]

export default function Admin() {
  const [authed, setAuthed] = useState(() => Boolean(api.getAdminToken?.()))
  const [email, setEmail] = useState('delpatllp@gmail.com')
  const [password, setPassword] = useState('')
  const [signingIn, setSigningIn] = useState(false)
  const [error, setError] = useState('')

  const [data, setData] = useState(null)
  const [loadErr, setLoadErr] = useState('')
  const [activeNav, setActiveNav] = useState('workspaces') // 'workspaces' | 'audit'

  // Modals & Drawers
  const [showOnboardModal, setShowOnboardModal] = useState(false)
  const [inspectTenant, setInspectTenant] = useState(null)
  const [handoverSummary, setHandoverSummary] = useState(null)

  const loadData = async () => {
    try {
      setLoadErr('')
      const res = await api.adminOverview()
      if (res?.success) setData(res)
      else throw new Error(res?.error || 'Could not fetch superadmin overview')
    } catch (err) {
      setLoadErr(err.message || 'Failed to load superadmin overview')
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
      setError(err.message || 'Login failed')
    } finally {
      setSigningIn(false)
    }
  }

  const doAdminLogout = () => {
    api.adminLogout()
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
              <div style={{ color: '#fff', fontWeight: 700, fontSize: 18 }}>Delpat Superadmin</div>
              <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12 }}>Platform Operations Console</div>
            </div>
          </div>

          {error && <div style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', color: '#f87171', padding: '10px 14px', borderRadius: 8, fontSize: 13, marginBottom: 16 }}>{error}</div>}

          <form onSubmit={doAdminLogin}>
            <Field label="Superadmin Email">
              <Input type="email" value={email} onChange={e => setEmail(e.target.value)} required />
            </Field>
            <div style={{ height: 14 }} />
            <Field label="Password">
              <Input type="password" value={password} onChange={e => setPassword(e.target.value)} required />
            </Field>
            <Button variant="primary" block type="submit" disabled={signingIn} style={{ marginTop: 20, height: 44, background: '#7c3aed', borderColor: '#7c3aed' }}>
              {signingIn ? 'Signing in…' : 'Sign in to Console'}
            </Button>
          </form>
        </div>
      </div>
    )
  }

  // --------------------------------------------------------------------------
  // AUTHENTICATED: SUPERADMIN DESK (SIDEBAR NAVIGATION + PURPLE ACCENT)
  // --------------------------------------------------------------------------
  const tenants = data?.tenants || []
  const auditLogs = data?.audit?.recent || []
  const auditOk = data?.audit?.ok
  const totalUsers = tenants.reduce((acc, t) => acc + (t.users || 0), 0)
  const totalLeads = tenants.reduce((acc, t) => acc + (t.leads || 0), 0)

  const kpis = [
    { label: 'Workspaces', value: tenants.length },
    { label: 'Total Users', value: totalUsers },
    { label: 'Active Leads', value: totalLeads },
    { label: 'Audit Ledger', value: auditOk ? 'Intact' : 'Broken', tone: auditOk ? undefined : 'alert' },
  ]

  const adminFooter = {
    name: 'Delpat Superadmin',
    role: 'Platform Owner',
    items: [
      { icon: 'x', label: 'Sign out', onClick: doAdminLogout }
    ]
  }

  return (
    <div className="viewport" style={{ '--accent': '#7c3aed', '--accent-wash': 'rgba(124, 58, 237, 0.1)' }}>
      <AppShell
        nav={ADMIN_NAV}
        active={activeNav}
        onNav={setActiveNav}
        footer={adminFooter}
        firmName="Delpat Platform"
        sub="Superadmin Console"
      >
        <PageHeader
          kpis={kpis}
          right={
            <Button variant="primary" icon="userPlus" onClick={() => setShowOnboardModal(true)} style={{ background: '#7c3aed', borderColor: '#7c3aed' }}>
              Onboard Workspace
            </Button>
          }
        />

        <div style={{ padding: 24, maxWidth: 1200, margin: '0 auto' }}>
          {loadErr && (
            <div style={{ background: '#fee2e2', border: '1px solid #fca5a5', color: '#991b1b', padding: 14, borderRadius: 10, marginBottom: 20 }}>
              {loadErr}
            </div>
          )}

          {/* VIEW 1: WORKSPACES (Default) */}
          {activeNav === 'workspaces' && (
            <div className="panel acc-panel" style={{ background: '#fff', borderRadius: 14, border: '1px solid var(--line, #e5e3dd)', padding: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 16, color: 'var(--ink)' }}>Active Workspaces</div>
                  <div style={{ fontSize: 12, color: 'var(--muted)' }}>Manage client consultancy instances and credentials</div>
                </div>
              </div>

              <div style={{ overflowX: 'auto' }}>
                <table className="acc-tbl" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 13 }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--line, #e5e3dd)', color: 'var(--muted)', fontSize: 11.5, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                      <th style={{ padding: '10px 12px' }}>Workspace</th>
                      <th style={{ padding: '10px 12px' }}>Slug</th>
                      <th style={{ padding: '10px 12px' }}>Status</th>
                      <th style={{ padding: '10px 12px' }}>Users</th>
                      <th style={{ padding: '10px 12px' }}>Leads</th>
                      <th style={{ padding: '10px 12px', textAlign: 'right' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tenants.map(t => {
                      const primaryColor = t.brand_config?.color || '#7c3aed'
                      return (
                        <tr key={t.id} style={{ borderBottom: '1px solid var(--line, #e5e3dd)' }}>
                          <td style={{ padding: '12px' }}>
                            <div className="acc-who" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                              <span className="av av-sm" style={{ width: 34, height: 34, borderRadius: 8, background: primaryColor, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 13 }}>
                                {t.brand_config?.initials || t.name.slice(0, 2).toUpperCase()}
                              </span>
                              <div className="acc-name">
                                <div className="acc-n" style={{ fontWeight: 700, fontSize: 14, color: 'var(--ink)' }}>{t.name}</div>
                                <div className="u-muted acc-role" style={{ fontSize: 11, color: 'var(--muted)' }}>Created {new Date(t.created_at).toLocaleDateString()}</div>
                              </div>
                            </div>
                          </td>
                          <td style={{ padding: '12px' }}>
                            <code style={{ background: '#f4f3ef', padding: '3px 8px', borderRadius: 6, fontSize: 12.5, color: 'var(--ink)' }}>/{t.slug}</code>
                          </td>
                          <td style={{ padding: '12px' }}>
                            <span className="pill acc-pill-on" style={{ background: '#dcfce7', color: '#15803d', padding: '3px 10px', borderRadius: 12, fontSize: 11, fontWeight: 700 }}>
                              {t.subscription_status || 'ACTIVE'}
                            </span>
                          </td>
                          <td style={{ padding: '12px', fontWeight: 600 }}>{t.users || 0}</td>
                          <td style={{ padding: '12px', fontWeight: 600 }}>{t.leads || 0}</td>
                          <td style={{ padding: '12px', textAlign: 'right' }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8 }}>
                              <button
                                className="btn btn-sm btn-quiet"
                                onClick={() => setInspectTenant(t)}
                                style={{ fontSize: 12, fontWeight: 600, color: '#7c3aed' }}
                              >
                                View Details
                              </button>
                              <button
                                className="btn btn-sm btn-quiet"
                                onClick={() => window.open(`/${t.slug}`, '_blank')}
                                style={{ fontSize: 12, fontWeight: 600 }}
                              >
                                Open Desk
                              </button>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* VIEW 2: AUDIT LEDGER */}
          {activeNav === 'audit' && (
            <div className="panel acc-panel" style={{ background: '#fff', borderRadius: 14, border: '1px solid var(--line, #e5e3dd)', padding: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 16, color: 'var(--ink)' }}>Tamper-Evident Audit Ledger</div>
                  <div style={{ fontSize: 12, color: 'var(--muted)' }}>Cryptographic chain status: {auditOk ? 'Intact' : 'Broken'}</div>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {auditLogs.map(log => (
                  <div key={log.seq} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', background: '#f9f8f6', borderRadius: 8, border: '1px solid var(--line)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <span className="mono-num" style={{ background: '#7c3aed', color: '#fff', padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 700 }}>
                        #{log.seq}
                      </span>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--ink)' }}>{log.summary || log.action}</div>
                        <div style={{ fontSize: 11, color: 'var(--muted)' }}>{log.tenant_id} · {new Date(log.created_at).toLocaleString()}</div>
                      </div>
                    </div>
                    <code style={{ fontSize: 10, color: 'var(--muted)', background: '#fff', padding: '2px 6px', borderRadius: 4, border: '1px solid var(--line)' }}>
                      {log.prev_hash ? log.prev_hash.slice(0, 12) + '…' : 'GENESIS'}
                    </code>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

      {/* MODAL 1: ONBOARD WORKSPACE + BULK USERS WIZARD */}
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

      {/* MODAL 2: HANDOVER CREDENTIALS SUMMARY */}
      {handoverSummary && (
        <HandoverModal
          data={handoverSummary}
          onClose={() => setHandoverSummary(null)}
        />
      )}

      {/* MODAL 3: INSPECT TENANT */}
      {inspectTenant && (
        <InspectTenantModal
          tenant={inspectTenant}
          onClose={() => setInspectTenant(null)}
        />
      )}
      </AppShell>
    </div>
  )
}

// ----------------------------------------------------------------------------
// WIZARD: ONBOARD WORKSPACE & BULK TEAM PROVISIONING
// ----------------------------------------------------------------------------
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
  })

  // Bulk team setup array
  const [team, setTeam] = useState([
    { name: '', loginId: '', email: '', phone: '', role: 'agent', password: '' }
  ])

  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [showPasteBox, setShowPasteBox] = useState(false)
  const [rawText, setRawText] = useState('')

  const setF = (k, v) => setForm(s => ({ ...s, [k]: v }))

  const parsePastedRoster = () => {
    if (!rawText.trim()) return
    const lines = rawText.split('\n').map(l => l.trim()).filter(Boolean)
    
    let newForm = { ...form }
    let rows = []
    let curName = '', curEmail = '', curPhone = ''

    for (const line of lines) {
      if (/^firm:\s*/i.test(line) || /^workspace:\s*/i.test(line)) {
        newForm.firmName = line.replace(/^firm:\s*|^workspace:\s*/i, '').trim()
        continue
      }
      if (/^slug:\s*/i.test(line)) {
        newForm.slug = line.replace(/^slug:\s*/i, '').trim().toLowerCase()
        continue
      }
      if (/^city:\s*/i.test(line)) {
        newForm.city = line.replace(/^city:\s*/i, '').trim()
        continue
      }
      if (/^owner:\s*/i.test(line)) {
        const parts = line.replace(/^owner:\s*/i, '').split(',').map(p => p.trim())
        if (parts[0]) newForm.ownerName = parts[0]
        const email = parts.find(p => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p))
        if (email) newForm.ownerEmail = email
        const phone = parts.find(p => /^\+?\d{10,12}$/.test(p.replace(/\s+/g, '')))
        if (phone) newForm.ownerPhone = phone.replace(/\D/g, '').slice(-10)
        const pw = parts.find(p => p.length >= 4 && p !== parts[0] && p !== email && p !== phone)
        if (pw) newForm.ownerPassword = pw
        continue
      }

      if (line.includes(',') || line.includes('\t')) {
        const parts = line.split(/,|\t/).map(p => p.trim())
        if (parts.length >= 2) {
          let name = parts[0].replace(/^[\*\-\•\d\.\s]+/, '').replace(/^Full Name:\s*/i, '').trim()
          if (!name || /firm name|workspace name/i.test(name)) continue

          let loginId = parts[1] && !parts[1].includes('@') && !/^\d+$/.test(parts[1]) ? parts[1] : ''
          let email = parts.find(p => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p)) || ''
          let phone = parts.find(p => /^\+?\d{10,12}$/.test(p.replace(/\s+/g, ''))) || ''
          let customPw = parts.find(p => /^[a-zA-Z0-9@#$]{5,20}$/.test(p) && p !== name && p !== loginId && p !== email && p !== phone && p !== 'agent' && p !== 'manager')
          
          const firstWord = name.split(/\s+/)[0].toLowerCase().replace(/[^a-z0-9]/g, '') || 'user'
          const autoPw = customPw || `${firstWord}123`

          rows.push({
            name,
            loginId,
            email,
            phone: phone ? phone.replace(/\D/g, '').slice(-10) : '',
            role: 'agent',
            password: autoPw
          })
        }
      } else {
        const nameMatch = line.match(/(?:full name|name):\s*([^\*\n]+)/i)
        const emailMatch = line.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/)
        const phoneMatch = line.match(/(?:\+?91[\s\-]?)?(\d{10})/)

        if (nameMatch) {
          if (curName) {
            const firstWord = curName.split(/\s+/)[0].toLowerCase().replace(/[^a-z0-9]/g, '') || 'user'
            rows.push({ name: curName, loginId: '', email: curEmail, phone: curPhone, role: 'agent', password: `${firstWord}123` })
          }
          curName = nameMatch[1].replace(/[\*]/g, '').trim()
          curEmail = ''; curPhone = ''
        } else if (emailMatch) {
          curEmail = emailMatch[0]
        } else if (phoneMatch) {
          curPhone = phoneMatch[1]
        } else if (!curName && line.length > 2 && !line.startsWith('[') && !line.includes('@')) {
          curName = line.replace(/[\*]/g, '').trim()
        }
      }
    }
    if (curName) {
      const firstWord = curName.split(/\s+/)[0].toLowerCase().replace(/[^a-z0-9]/g, '') || 'user'
      rows.push({ name: curName, loginId: '', email: curEmail, phone: curPhone, role: 'agent', password: `${firstWord}123` })
    }

    setForm(newForm)
    if (rows.length > 0) {
      setTeam(rows)
    }
    setShowPasteBox(false)
    setRawText('')
  }

  const updateTeamRow = (idx, field, val) => {
    setTeam(list => {
      const copy = [...list]
      copy[idx] = { ...copy[idx], [field]: val }
      return copy
    })
  }

  const addTeamRow = () => {
    setTeam(list => [...list, { name: '', loginId: '', email: '', phone: '', role: 'agent', password: '' }])
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
        loginId: t.loginId.trim(),
        email: t.email.trim(),
        phone: t.phone.trim(),
        role: t.role,
        // No shared fallback. An empty password means the server generates one
        // for THIS person; a constant here means every seat on every firm we
        // ever onboard shares a login.
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
      <div style={{ width: '100%', maxWidth: 640, background: '#fff', borderRadius: 16, border: '1px solid var(--line)', padding: 24, boxShadow: '0 20px 50px rgba(0,0,0,0.3)', maxHeight: '90vh', overflowY: 'auto' }}>
        
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, borderBottom: '1px solid var(--line)', paddingBottom: 14 }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 18, color: 'var(--ink)' }}>Onboard Workspace</div>
            <div style={{ fontSize: 12, color: 'var(--muted)' }}>Step {step} of 2 — {step === 1 ? 'Firm & Owner Credentials' : 'Bulk Team Setup'}</div>
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
                {showPasteBox ? 'Hide Quick Paste Area' : 'Paste All Workspace & Roster Data in One Go'}
              </Button>
            </div>

            {showPasteBox && (
              <div style={{ background: '#f4f3ef', padding: 14, borderRadius: 10, border: '1px solid var(--line)', marginBottom: 18 }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--ink)', marginBottom: 6 }}>
                  Paste Workspace, Owner, and Team Roster Text
                </label>
                <textarea
                  value={rawText}
                  onChange={e => setRawText(e.target.value)}
                  placeholder={`Firm: Bhumi PropCity\nCity: Pune\nOwner: Bhumi PropCity, bhumipropcity@gmail.com, 8983337303, 00000000\n\nVinod Goswami, vinod, vinod.bhumipropcity@gmail.com, 9172287808, agent, vinod123\nBinod Bishwakarma, binod, binodbhumipropcity@gmail.com, 9172361915, agent, binod123`}
                  rows={6}
                  style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid var(--line)', fontSize: 12, fontFamily: 'monospace', resize: 'vertical', marginBottom: 10 }}
                />
                <Button size="sm" variant="primary" onClick={() => { parsePastedRoster(); setShowPasteBox(false); }} disabled={!rawText.trim()}>
                  Populate Form & Team Roster
                </Button>
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr', gap: 14, marginBottom: 14 }}>
              <Field label="Firm Name *">
                <Input value={form.firmName} onChange={e => setF('firmName', e.target.value)} placeholder="e.g. Bhumi Real Estate" autoFocus />
              </Field>
              <Field label="Workspace Slug (URL)">
                <Input value={form.slug} onChange={e => setF('slug', e.target.value)} placeholder="e.g. bhumi" />
              </Field>
              <Field label="City *">
                <Input value={form.city} onChange={e => setF('city', e.target.value)} placeholder="e.g. Pune" />
              </Field>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
              <Field label="Owner Full Name">
                <Input value={form.ownerName} onChange={e => setF('ownerName', e.target.value)} placeholder="e.g. Aniket Sharma" />
              </Field>
              <Field label="Owner Email (Login) *">
                <Input type="email" value={form.ownerEmail} onChange={e => setF('ownerEmail', e.target.value)} placeholder="aniket@bhumi.com" />
              </Field>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 16 }}>
              <Field label="Owner Phone">
                <Input value={form.ownerPhone} onChange={e => setF('ownerPhone', e.target.value)} placeholder="9876543210" />
              </Field>
              <Field label="Custom Initial Password">
                <Input value={form.ownerPassword} onChange={e => setF('ownerPassword', e.target.value)} placeholder="Bhumi@2026" />
              </Field>
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
              Add agents or managers for <b>{form.firmName}</b>. They will be created automatically alongside the workspace owner.
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
              {team.map((row, i) => (
                <div key={i} style={{ display: 'grid', gridTemplateColumns: '1.1fr 0.8fr 1.2fr 0.9fr 0.9fr 0.7fr 24px', gap: 8, alignItems: 'center', background: '#f9f8f6', padding: 10, borderRadius: 10, border: '1px solid var(--line)' }}>
                  <Input value={row.name} onChange={e => updateTeamRow(i, 'name', e.target.value)} placeholder="Full Name *" style={{ fontSize: 12.5 }} />
                  <Input value={row.loginId} onChange={e => updateTeamRow(i, 'loginId', e.target.value)} placeholder="User ID (optional)" style={{ fontSize: 12.5 }} />
                  <Input type="email" value={row.email} onChange={e => updateTeamRow(i, 'email', e.target.value)} placeholder="Email (optional)" style={{ fontSize: 12.5 }} />
                  <Input value={row.phone} onChange={e => updateTeamRow(i, 'phone', e.target.value)} placeholder="Phone (optional)" style={{ fontSize: 12.5 }} />
                  <Input value={row.password} onChange={e => updateTeamRow(i, 'password', e.target.value)} placeholder="Password" style={{ fontSize: 12.5, fontWeight: 600, color: '#7c3aed' }} />
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
                {showPasteBox ? 'Hide Paste Box' : 'Paste CSV / WhatsApp Text'}
              </Button>
            </div>

            {showPasteBox && (
              <div style={{ background: '#f4f3ef', padding: 14, borderRadius: 10, border: '1px solid var(--line)', marginBottom: 20 }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--ink)', marginBottom: 6 }}>
                  Paste CSV, Excel, or WhatsApp Roster Text
                </label>
                <textarea
                  value={rawText}
                  onChange={e => setRawText(e.target.value)}
                  placeholder={`e.g. Vinod Goswami, vinod.bhumipropcity@gmail.com, 9172287808\nor paste WhatsApp messages with Full Name, Email, Phone...`}
                  rows={5}
                  style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid var(--line)', fontSize: 12, fontFamily: 'monospace', resize: 'vertical', marginBottom: 10 }}
                />
                <Button size="sm" variant="primary" onClick={parsePastedRoster} disabled={!rawText.trim()}>
                  Load Roster into Grid
                </Button>
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--line)', paddingTop: 16 }}>
              <Button variant="ghost" onClick={() => setStep(1)}>← Back</Button>
              <Button variant="primary" disabled={busy} onClick={handleFinish}>
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

  const copyToClipboard = () => {
    navigator.clipboard.writeText(formattedText)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
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

// ----------------------------------------------------------------------------
// INSPECT TENANT MODAL
// ----------------------------------------------------------------------------
function InspectTenantModal({ tenant, onClose }) {
  return (
    <div className="modal-overlay" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: 20 }}>
      <div style={{ width: '100%', maxWidth: 500, background: '#fff', borderRadius: 16, border: '1px solid var(--line)', padding: 24, boxShadow: '0 20px 50px rgba(0,0,0,0.3)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, borderBottom: '1px solid var(--line)', paddingBottom: 12 }}>
          <div style={{ fontWeight: 700, fontSize: 17, color: 'var(--ink)' }}>{tenant.name}</div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 18, color: 'var(--muted)' }}>✕</button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, fontSize: 13, color: 'var(--ink)', marginBottom: 20 }}>
          <div><b>Workspace ID:</b> <code>{tenant.id}</code></div>
          <div><b>Slug Path:</b> <code>/{tenant.slug}</code></div>
          <div><b>Plan:</b> {tenant.subscription_plan || 'PRO'}</div>
          <div><b>Status:</b> {tenant.subscription_status || 'ACTIVE'}</div>
          <div><b>Total Users:</b> {tenant.users || 0}</div>
          <div><b>Total Leads:</b> {tenant.leads || 0}</div>
          <div><b>Total Properties:</b> {tenant.properties || 0}</div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <Button variant="ghost" onClick={onClose}>Close</Button>
          <Button variant="primary" onClick={() => window.open(`/${tenant.slug}`, '_blank')}>
            Open Workspace Desk ➔
          </Button>
        </div>
      </div>
    </div>
  )
}
