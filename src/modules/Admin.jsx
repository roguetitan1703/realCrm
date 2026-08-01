/**
 * ============================================================================
 * 🛰️ SUPERADMIN CONSOLE — the platform desk above every tenant
 * ============================================================================
 * Delpat-only. Reached at /admin (or ?admin). Superadmins sign in with email +
 * password — never the tenant phone OTP — and land on a minimal overview: the
 * tenant roster with headline counts, and the health of the tamper-evident
 * audit ledger. Wears the PLATFORM identity, never a customer's brand.
 * ============================================================================
 */

import { useState, useEffect } from 'react'
import { api } from '../lib/api.js'
import { PLATFORM } from '../data/platform.js'

// A curated accent palette — the only colours a workspace can wear. Restricting
// to these keeps the theming legible everywhere (nav, pills, meters); an
// arbitrary hue can't produce an unreadable desk.
const COLOR_PRESETS = ['#1E6F52', '#1D4ED8', '#7C3AED', '#B45309', '#B91C1C', '#0F766E', '#0E7490', '#BE185D']

export default function Admin() {
  const [authed, setAuthed] = useState(() => Boolean(api.getAdminToken?.()))
  const [email, setEmail] = useState('delpatllp@gmail.com')
  const [password, setPassword] = useState('')
  const [signingIn, setSigningIn] = useState(false)
  const [error, setError] = useState('')

  const [data, setData] = useState(null)
  const [loadErr, setLoadErr] = useState('')

  // Workspace provisioning (the ONE place a tenant is created).
  const emptyForm = { firmName: '', city: '', ownerName: '', ownerEmail: '', ownerPhone: '', primaryColor: '#1E6F52' }
  const [form, setForm] = useState(emptyForm)
  const setF = (k, v) => setForm(s => ({ ...s, [k]: v }))
  const [provisioning, setProvisioning] = useState(false)
  const [provErr, setProvErr] = useState('')
  const [provisioned, setProvisioned] = useState(null)
  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.ownerEmail.trim())
  const canProvision = form.firmName.trim() && form.city.trim() && emailOk

  const provision = async (e) => {
    e.preventDefault()
    if (!canProvision) { setProvErr('Firm name, city and a valid owner email are required.'); return }
    setProvisioning(true); setProvErr('')
    try {
      const res = await api.adminOnboard({
        firmName: form.firmName.trim(), city: form.city.trim(),
        ownerName: form.ownerName.trim(), ownerEmail: form.ownerEmail.trim(),
        ownerPhone: form.ownerPhone.trim(), primaryColor: form.primaryColor,
      })
      setProvisioned(res)
      setForm(emptyForm)
      loadOverview()
    } catch (err) {
      setProvErr(err?.message?.replace(/^API Error:.*?— /, '') || 'Could not provision the workspace.')
    } finally {
      setProvisioning(false)
    }
  }

  useEffect(() => { document.title = `Superadmin · ${PLATFORM.vendor}` }, [])

  const loadOverview = () => {
    api.adminOverview()
      .then(res => { setData(res); setLoadErr('') })
      .catch(() => {
        // A dead/expired token lands here — bounce back to the login form.
        setLoadErr('Your session expired. Please sign in again.')
        api.clearAdminToken?.()
        setAuthed(false)
      })
  }

  useEffect(() => { if (authed) loadOverview() }, [authed])

  const signIn = async (e) => {
    e.preventDefault()
    if (!email.trim() || !password) { setError('Enter your email and password.'); return }
    setSigningIn(true); setError('')
    try {
      const res = await api.superadminLogin(email.trim(), password)
      if (!res?.token) throw new Error('bad')
      setPassword('')
      setAuthed(true)
    } catch (err) {
      setError('Those credentials didn’t match. Try again.')
    } finally {
      setSigningIn(false)
    }
  }

  const signOut = () => {
    api.clearAdminToken?.()
    setAuthed(false)
    setData(null)
  }

  // ── Login gate ──────────────────────────────────────────────────────────
  if (!authed) {
    return (
      <div style={{
        minHeight: '100dvh', display: 'grid', placeItems: 'center',
        background: '#0F1F18', color: '#fff', padding: 24,
      }}>
        <div style={{ width: '100%', maxWidth: 380 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 28 }}>
            <img src="/brand-mark.svg" width={38} height={38} alt={PLATFORM.vendor} style={{ display: 'block', borderRadius: 8 }} />
            <div>
              <div style={{ fontFamily: 'var(--disp)', fontWeight: 700, fontSize: 17, letterSpacing: '-0.02em' }}>
                {PLATFORM.vendor} Superadmin
              </div>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)' }}>Platform console · above all tenants</div>
            </div>
          </div>

          <form onSubmit={signIn} style={{
            background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 14, padding: '26px 22px',
          }}>
            <label style={labelStyle}>Email</label>
            <input
              type="email" value={email} onChange={e => setEmail(e.target.value)}
              autoFocus autoCapitalize="none" autoCorrect="off" spellCheck={false}
              style={fieldStyle}
            />
            <label style={{ ...labelStyle, marginTop: 16 }}>Password</label>
            <input
              type="password" value={password} onChange={e => setPassword(e.target.value)}
              placeholder="••••••••" style={fieldStyle}
            />
            {error && <div style={{ color: '#F2A88C', fontSize: 12.5, marginTop: 12 }}>{error}</div>}
            {loadErr && !error && <div style={{ color: '#F2A88C', fontSize: 12.5, marginTop: 12 }}>{loadErr}</div>}
            <button type="submit" disabled={signingIn} style={{
              width: '100%', marginTop: 20, height: 44, borderRadius: 9, border: 'none',
              background: '#C6842A', color: '#1a1205', fontWeight: 700, fontSize: 14.5,
              cursor: signingIn ? 'wait' : 'pointer',
            }}>
              {signingIn ? 'Signing in…' : 'Sign in'}
            </button>
          </form>

          <div style={{ textAlign: 'center', marginTop: 20, fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>
            Delpat staff only. Tenant users sign in at their own workspace.
          </div>
        </div>
      </div>
    )
  }

  // ── Authenticated console ────────────────────────────────────────────────
  const audit = data?.audit
  return (
    <div style={{ minHeight: '100dvh', background: 'var(--bg, #F6F5F2)', color: 'var(--ink, #1a1a1a)' }}>
      <header style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '16px 28px', borderBottom: '1px solid var(--line, #e5e3dd)', background: '#0F1F18', color: '#fff',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <img src="/brand-mark.svg" width={30} height={30} alt={PLATFORM.vendor} style={{ display: 'block', borderRadius: 7 }} />
          <div style={{ fontFamily: 'var(--disp)', fontWeight: 700, fontSize: 15.5 }}>{PLATFORM.vendor} Superadmin</div>
        </div>
        <button onClick={signOut} style={{
          background: 'transparent', border: '1px solid rgba(255,255,255,0.25)', color: '#fff',
          borderRadius: 8, padding: '7px 14px', fontSize: 13, cursor: 'pointer',
        }}>Sign out</button>
      </header>

      <main style={{ maxWidth: 980, margin: '0 auto', padding: '28px 24px' }}>
        {/* Provision a new workspace — the ONLY place a tenant is created */}
        <section style={cardStyle}>
          <div style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--muted)', marginBottom: 4 }}>Provision workspace</div>
          <div style={{ fontFamily: 'var(--disp)', fontWeight: 700, fontSize: 19, marginBottom: 16 }}>Onboard a consultancy</div>

          {provisioned ? (
            <div>
              <div style={{
                display: 'flex', gap: 10, alignItems: 'center', padding: '10px 14px', borderRadius: 10,
                background: 'rgba(30,111,82,0.1)', color: '#1E6F52', fontWeight: 600, fontSize: 14, marginBottom: 16,
              }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'currentColor' }} />
                {provisioned.tenant.name} is live — hand these to the client.
              </div>
              <dl style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '10px 18px', margin: 0, fontSize: 13.5 }}>
                <dt style={dtStyle}>Workspace URL</dt>
                <dd style={ddStyle}><span className="mono-num" style={{ wordBreak: 'break-all' }}>{`${window.location.origin}/${provisioned.tenant.slug}`}</span> — or they type “{provisioned.tenant.name}” at the login screen</dd>
                <dt style={dtStyle}>Owner login</dt>
                <dd style={ddStyle}><span className="mono-num">{provisioned.loginWith}</span> — email + the password below</dd>
                <dt style={dtStyle}>Owner password</dt>
                <dd style={ddStyle}><span className="mono-num">{provisioned.initialPassword}</span> — hand this over; they change it on first login</dd>
                <dt style={dtStyle}>Lead ingest key</dt>
                <dd style={ddStyle}><span className="mono-num" style={{ wordBreak: 'break-all' }}>{provisioned.ingest.secret}</span></dd>
                <dt style={dtStyle}>Ingest URL</dt>
                <dd style={ddStyle}><span className="mono-num" style={{ wordBreak: 'break-all' }}>{`${api.baseUrl()}/ingest/${provisioned.ingest.tenantSlug}/99acres?key=${provisioned.ingest.secret}`}</span></dd>
              </dl>
              <button onClick={() => setProvisioned(null)} style={{ ...ghostBtn, marginTop: 18 }}>Onboard another</button>
            </div>
          ) : (
            <form onSubmit={provision}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
                <div><label style={fLabel}>Firm name</label><input style={fInput} value={form.firmName} onChange={e => setF('firmName', e.target.value)} placeholder="Meridian Estates" /></div>
                <div><label style={fLabel}>City</label><input style={fInput} value={form.city} onChange={e => setF('city', e.target.value)} placeholder="Pune" /></div>
                <div><label style={fLabel}>Owner name</label><input style={fInput} value={form.ownerName} onChange={e => setF('ownerName', e.target.value)} placeholder="Rohan Shah" /></div>
                <div><label style={fLabel}>Owner email</label><input style={fInput} type="email" value={form.ownerEmail} onChange={e => setF('ownerEmail', e.target.value)} placeholder="rohan@meridian.in" /></div>
                <div><label style={fLabel}>Owner mobile (optional)</label><input style={fInput} value={form.ownerPhone} onChange={e => setF('ownerPhone', e.target.value)} placeholder="98xxx xxxxx" /></div>
                <div>
                  <label style={fLabel}>Accent colour</label>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', height: 44 }}>
                    {COLOR_PRESETS.map(c => (
                      <button key={c} type="button" onClick={() => setF('primaryColor', c)} aria-label={`Use ${c}`} title={c}
                        style={{
                          width: 26, height: 26, borderRadius: 7, background: c, cursor: 'pointer', padding: 0,
                          border: form.primaryColor.toLowerCase() === c.toLowerCase() ? '2px solid var(--ink, #1a1a1a)' : '2px solid transparent',
                          boxShadow: form.primaryColor.toLowerCase() === c.toLowerCase() ? '0 0 0 2px #fff inset' : 'none',
                        }} />
                    ))}
                  </div>
                </div>
              </div>
              <div style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: 10 }}>The owner signs in with their email — a one-time code is sent there. A new firm starts empty; no demo data.</div>
              {provErr && <div style={{ color: '#B4342A', fontSize: 12.5, marginTop: 10 }}>{provErr}</div>}
              <button type="submit" disabled={!canProvision || provisioning} style={{
                marginTop: 16, height: 44, padding: '0 22px', borderRadius: 9, border: 'none',
                background: canProvision ? '#C6842A' : '#d8cbb4', color: '#1a1205', fontWeight: 700, fontSize: 14,
                cursor: canProvision && !provisioning ? 'pointer' : 'not-allowed',
              }}>{provisioning ? 'Provisioning…' : 'Provision workspace'}</button>
            </form>
          )}
        </section>

        {!data && !loadErr && <div style={{ color: 'var(--muted)', marginTop: 20 }}>Loading overview…</div>}

        {/* Audit ledger health */}
        {audit && (
          <section style={{ ...cardStyle, marginTop: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
              <div>
                <div style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--muted)' }}>Audit ledger</div>
                <div style={{ fontFamily: 'var(--disp)', fontWeight: 700, fontSize: 20, marginTop: 4 }}>
                  {audit.count} entr{audit.count === 1 ? 'y' : 'ies'}
                </div>
              </div>
              <div style={{
                display: 'inline-flex', alignItems: 'center', gap: 8, padding: '8px 14px', borderRadius: 999,
                background: audit.ok ? 'rgba(30,111,82,0.12)' : 'rgba(190,50,40,0.12)',
                color: audit.ok ? '#1E6F52' : '#B4342A', fontWeight: 600, fontSize: 13.5,
              }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'currentColor' }} />
                {audit.ok ? 'Chain intact — untampered' : `Chain broken at #${audit.brokenAtSeq}`}
              </div>
            </div>

            {audit.recent?.length > 0 && (
              <div style={{ marginTop: 18, borderTop: '1px solid var(--line, #e5e3dd)', paddingTop: 14 }}>
                {audit.recent.map(r => (
                  <div key={r.seq} style={{ display: 'flex', gap: 12, alignItems: 'baseline', padding: '6px 0', fontSize: 13 }}>
                    <span className="mono-num" style={{ color: 'var(--muted)', minWidth: 34 }}>#{r.seq}</span>
                    <span style={{ minWidth: 130, fontWeight: 600 }}>{r.action}</span>
                    <span style={{ color: 'var(--muted)', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {r.summary || r.actor_label || ''}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {/* Tenant roster */}
        {data?.tenants && (
          <section style={{ ...cardStyle, marginTop: 20 }}>
            <div style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--muted)', marginBottom: 14 }}>
              Tenants ({data.tenants.length})
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5, minWidth: 560 }}>
                <thead>
                  <tr style={{ textAlign: 'left', color: 'var(--muted)', fontSize: 12 }}>
                    <th style={thStyle}>Workspace</th>
                    <th style={thStyle}>Plan</th>
                    <th style={thStyle}>Status</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>Users</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>Leads</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>Properties</th>
                  </tr>
                </thead>
                <tbody>
                  {data.tenants.map(t => (
                    <tr key={t.id} style={{ borderTop: '1px solid var(--line, #e5e3dd)' }}>
                      <td style={tdStyle}>
                        <div style={{ fontWeight: 600 }}>{t.name}</div>
                        <a href={`/?ws=${t.slug}`} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent, #1E6F52)', fontSize: 12, textDecoration: 'none' }} className="mono-num">
                          {`/${t.slug}`} ↗
                        </a>
                      </td>
                      <td style={tdStyle}>{t.subscription_plan}</td>
                      <td style={tdStyle}>
                        <span style={{
                          fontSize: 12, fontWeight: 600,
                          color: t.subscription_status === 'ACTIVE' ? '#1E6F52' : '#B4342A',
                        }}>{t.subscription_status}</span>
                      </td>
                      <td style={{ ...tdStyle, textAlign: 'right' }} className="mono-num">{t.users}</td>
                      <td style={{ ...tdStyle, textAlign: 'right' }} className="mono-num">{t.leads}</td>
                      <td style={{ ...tdStyle, textAlign: 'right' }} className="mono-num">{t.properties}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </main>
    </div>
  )
}

const labelStyle = { fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.6)', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 7 }
const fieldStyle = { width: '100%', height: 42, borderRadius: 9, border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.06)', color: '#fff', padding: '0 12px', fontSize: 14, outline: 'none', boxSizing: 'border-box' }
const cardStyle = { background: 'var(--card, #fff)', border: '1px solid var(--line, #e5e3dd)', borderRadius: 14, padding: '22px 22px' }
const thStyle = { padding: '4px 10px', fontWeight: 600 }
const tdStyle = { padding: '11px 10px', verticalAlign: 'top' }
const fLabel = { fontSize: 11, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 6 }
const fInput = { width: '100%', height: 42, borderRadius: 9, border: '1px solid var(--line, #e5e3dd)', background: 'var(--bg, #fff)', color: 'var(--ink, #1a1a1a)', padding: '0 12px', fontSize: 14, outline: 'none', boxSizing: 'border-box' }
const dtStyle = { fontWeight: 600, color: 'var(--muted)' }
const ddStyle = { margin: 0 }
const ghostBtn = { height: 40, padding: '0 18px', borderRadius: 9, border: '1px solid var(--line, #e5e3dd)', background: 'transparent', color: 'var(--ink, #1a1a1a)', fontWeight: 600, fontSize: 13.5, cursor: 'pointer' }
