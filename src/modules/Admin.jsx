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

export default function Admin() {
  const [authed, setAuthed] = useState(() => Boolean(api.getAdminToken?.()))
  const [email, setEmail] = useState('delpatllp@gmail.com')
  const [password, setPassword] = useState('')
  const [signingIn, setSigningIn] = useState(false)
  const [error, setError] = useState('')

  const [data, setData] = useState(null)
  const [loadErr, setLoadErr] = useState('')

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
        {!data && !loadErr && <div style={{ color: 'var(--muted)' }}>Loading overview…</div>}

        {/* Audit ledger health */}
        {audit && (
          <section style={cardStyle}>
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
                        <div className="mono-num" style={{ color: 'var(--muted)', fontSize: 12 }}>app.{t.slug}.com</div>
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
