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
import { Button, Field, Input, PageHeader, Segmented, RowMenu, Pager } from '../components/primitives.jsx'
import Icon from '../components/Icon.jsx'

const COLOR_PRESETS = ['#1E6F52', '#1D4ED8', '#7C3AED', '#B45309', '#B91C1C', '#0F766E', '#0E7490', '#BE185D']

export default function Admin() {
  const [authed, setAuthed] = useState(() => Boolean(api.getAdminToken?.()))
  const [email, setEmail] = useState('delpatllp@gmail.com')
  const [password, setPassword] = useState('')
  const [signingIn, setSigningIn] = useState(false)
  const [error, setError] = useState('')

  const [data, setData] = useState(null)
  const [loadErr, setLoadErr] = useState('')
  const [tab, setTab] = useState('tenants') // 'tenants' | 'audit'

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
      <div className="viewport" style={{ background: '#0a0d0b', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <div style={{ width: '100%', maxWidth: 400, background: '#121614', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 16, padding: 32, boxShadow: '0 24px 64px rgba(0,0,0,0.5)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
            <div style={{ width: 40, height: 40, borderRadius: 10, background: 'var(--accent, #1E6F52)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 800, fontSize: 18 }}>
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
            <div style={{ height: 24 }} />
            <Button variant="primary" block type="submit" disabled={signingIn}>
              {signingIn ? 'Authenticating…' : 'Sign into Platform Console'}
            </Button>
          </form>
        </div>
      </div>
    )
  }

  // --------------------------------------------------------------------------
  // AUTHENTICATED: SUPERADMIN DESK
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

  return (
    <div className="viewport" style={{ overflowY: 'auto', background: 'var(--bg, #f6f5f2)' }}>
      {/* Top Console Bar */}
      <div style={{ background: '#121614', color: '#fff', padding: '14px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: 'var(--accent, #1E6F52)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 15 }}>D</div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 15, color: '#fff' }}>Delpat Platform Superadmin</div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>Multi-Tenant Management Console</div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)' }}>delpatllp@gmail.com</span>
          <Button size="sm" variant="ghost" onClick={doAdminLogout} style={{ color: '#f87171' }}>Sign Out</Button>
        </div>
      </div>

      <PageHeader
        kpis={kpis}
        right={
          <Button variant="primary" icon="userPlus" onClick={() => setShowOnboardModal(true)}>
            Onboard Workspace
          </Button>
        }
      />

      <div className="app-body pagewrap" style={{ padding: 24, maxWidth: 1200, margin: '0 auto' }}>
        <div style={{ marginBottom: 20 }}>
          <Segmented
            value={tab}
            onChange={setTab}
            options={[
              { key: 'tenants', label: `Workspaces (${tenants.length})` },
              { key: 'audit', label: `Audit Ledger (${data?.audit?.count || 0})` },
            ]}
          />
        </div>

        {loadErr && (
          <div style={{ background: '#fee2e2', border: '1px solid #fca5a5', color: '#991b1b', padding: 14, borderRadius: 10, marginBottom: 20 }}>
            {loadErr}
          </div>
        )}

        {/* TAB 1: WORKSPACE ROSTER (Copied Team.jsx AccessPanel Table UI) */}
        {tab === 'tenants' && (
          <div className="panel acc-panel" style={{ background: '#fff', borderRadius: 14, border: '1px solid var(--line, #e5e3dd)', padding: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 16, color: 'var(--ink)' }}>Active Workspaces</div>
                <div style={{ fontSize: 12, color: 'var(--muted)' }}>Manage consultancy tenants and bulk user provisioning</div>
              </div>
              <Button size="sm" onClick={() => loadData()}>Refresh Roster</Button>
            </div>

            <div className="acc-tbl-wrap">
              <table className="tbl acc-tbl" style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--line, #e5e3dd)', textAlign: 'left', fontSize: 12, color: 'var(--muted)' }}>
                    <th style={{ padding: '10px 12px' }}>Workspace</th>
                    <th style={{ padding: '10px 12px' }}>URL Path</th>
                    <th style={{ padding: '10px 12px' }}>Plan & Status</th>
                    <th style={{ padding: '10px 12px' }}>Users</th>
                    <th style={{ padding: '10px 12px' }}>Leads</th>
                    <th style={{ padding: '10px 12px' }}>Properties</th>
                    <th className="acc-actcol" style={{ padding: '10px 12px', textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {tenants.map(t => {
                    const primaryColor = t.brand_config?.primaryColor || '#1E6F52'
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
                        <td style={{ padding: '12px', fontWeight: 600 }}>{t.properties || 0}</td>
                        <td className="acc-actcol" style={{ padding: '12px', textAlign: 'right' }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8 }}>
                            <button className="acc-act" onClick={() => setInspectTenant(t)} style={{ padding: '5px 10px', borderRadius: 6, border: '1px solid var(--line)', background: '#fff', fontSize: 12, cursor: 'pointer' }}>
                              Inspect
                            </button>
                            <button className="acc-act" onClick={() => window.open(`/${t.slug}`, '_blank')} style={{ padding: '5px 10px', borderRadius: 6, border: '1px solid var(--accent)', color: 'var(--accent)', background: 'transparent', fontSize: 12, cursor: 'pointer', fontWeight: 600 }}>
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

        {/* TAB 2: AUDIT LEDGER (De-cluttered) */}
        {tab === 'audit' && (
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
                    <code style={{ fontSize: 11, color: 'var(--muted)', background: '#e5e3dd', padding: '2px 6px', borderRadius: 4 }}>#{log.seq}</code>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--ink)' }}>{log.summary}</div>
                      <div style={{ fontSize: 11, color: 'var(--muted)' }}>Actor: {log.actor_label} · Tenant: {log.tenant_id || 'system'}</div>
                    </div>
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--muted)' }}>{new Date(log.created_at).toLocaleString()}</div>
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
    city: '',
    ownerName: '',
    ownerEmail: '',
    ownerPhone: '',
    ownerPassword: 'Bhumi@2026',
    mustChangePassword: true,
    primaryColor: '#1E6F52',
  })

  // Bulk team setup array
  const [team, setTeam] = useState([
    { name: '', email: '', phone: '', role: 'agent', password: 'Bhumi@2026' }
  ])

  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const setF = (k, v) => setForm(s => ({ ...s, [k]: v }))

  const updateTeamRow = (idx, field, val) => {
    setTeam(list => {
      const copy = [...list]
      copy[idx] = { ...copy[idx], [field]: val }
      return copy
    })
  }

  const addTeamRow = () => {
    setTeam(list => [...list, { name: '', email: '', phone: '', role: 'agent', password: 'Bhumi@2026' }])
  }

  const removeTeamRow = (idx) => {
    setTeam(list => list.filter((_, i) => i !== idx))
  }

  const canProceed = form.firmName.trim() && form.city.trim() && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.ownerEmail.trim())

  const handleFinish = async (e) => {
    if (e) e.preventDefault()
    if (!canProceed) { setError('Firm name, city and owner email are required'); return }
    setBusy(true); setError('')

    // Clean valid team members
    const cleanedTeam = team
      .filter(t => t.name.trim() && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t.email.trim()))
      .map(t => ({
        name: t.name.trim(),
        email: t.email.trim(),
        phone: t.phone.trim(),
        role: t.role,
        password: t.password.trim() || 'Bhumi@2026'
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
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
              <Field label="Firm Name *">
                <Input value={form.firmName} onChange={e => setF('firmName', e.target.value)} placeholder="e.g. BHUmi Real Estate" autoFocus />
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
                <div key={i} style={{ display: 'grid', gridTemplateColumns: '1.2fr 1.5fr 1fr 0.9fr 28px', gap: 8, alignItems: 'center', background: '#f9f8f6', padding: 10, borderRadius: 10, border: '1px solid var(--line)' }}>
                  <Input value={row.name} onChange={e => updateTeamRow(i, 'name', e.target.value)} placeholder="Full Name" style={{ fontSize: 12.5 }} />
                  <Input type="email" value={row.email} onChange={e => updateTeamRow(i, 'email', e.target.value)} placeholder="Email / Login ID" style={{ fontSize: 12.5 }} />
                  <Input value={row.phone} onChange={e => updateTeamRow(i, 'phone', e.target.value)} placeholder="Phone" style={{ fontSize: 12.5 }} />
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

            <Button size="sm" onClick={addTeamRow} style={{ marginBottom: 20 }}>+ Add Team Member</Button>

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

  const formattedText = `Welcome to ${tenant.name} CRM

Workspace URL:
https://${window.location.host}/${tenant.slug}

Owner Credentials:
- User ID: ${owner.login_id || owner.email}
- Email: ${owner.email}
- Password: ${initialPassword}

${team.length > 0 ? `Team Credentials:\n${team.map(t => `- ${t.name} (${t.role}): User ID: ${t.loginId || t.email} | Email: ${t.email} | Password: ${t.password}`).join('\n')}\n` : ''}
Installed PWA:
Open https://${window.location.host}/${tenant.slug} on your phone and tap "Add to Home Screen".`

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
