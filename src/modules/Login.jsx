/**
 * ============================================================================
 * 🏛️ INSTITUTIONAL WORKSPACE LOGIN
 * ============================================================================
 * A calm, disciplined, human-designed authentication desk.
 *
 * Identity gate: the first step is choosing a WORKSPACE. Until one is chosen
 * the screen wears the platform's identity (Real Estate by Delpat) — never a
 * customer's. Pick "bhumipropcity" and the whole desk becomes theirs: mark,
 * name, city, URL, browser tab. Branding follows the workspace, not the app.
 * ============================================================================
 */

import { useState, useRef, useEffect } from 'react'
import { PLATFORM, recentWorkspaces, rememberWorkspace, resolveWorkspace, normalizeSlug, tenantDocTitle } from '../data/platform.js'
import { api } from '../lib/api.js'
import { applyPwaIdentity, isStandalone, slugFromLocation } from '../lib/pwa.js'
import { applyBrandColor, DEFAULT_ACCENT } from '../lib/brand.js'
import { Button } from '../components/primitives.jsx'
import Icon from '../components/Icon.jsx'
import { Toasts } from '../components/chrome.jsx'

// Password field with a show/hide toggle — reused across sign-in, first-login
// change, and reset so a mistyped password is always checkable.
function PwField({ value, onChange, placeholder, autoFocus, disabled }) {
  const [show, setShow] = useState(false)
  return (
    <div className="input-group">
      <input type={show ? 'text' : 'password'} value={value} onChange={onChange}
        placeholder={placeholder} autoFocus={autoFocus} disabled={disabled}
        autoCapitalize="none" autoCorrect="off" spellCheck={false}
        style={{ fontWeight: 600, fontSize: 15 }} />
      <button type="button" onClick={() => setShow(s => !s)} tabIndex={-1} disabled={disabled}
        aria-label={show ? 'Hide password' : 'Show password'}
        title={show ? 'Hide password' : 'Show password'}
        style={{ display: 'flex', alignItems: 'center', padding: '0 12px', background: 'var(--card-2)',
          border: 'none', borderLeft: '1px solid var(--line)', color: 'var(--muted)', cursor: 'pointer' }}>
        <Icon name={show ? 'eyeOff' : 'eye'} size={16} />
      </button>
    </div>
  )
}

export default function Login({ store }) {
  const { state } = store
  const [phase, setPhase] = useState('workspace') // 'workspace' | 'creds' | 'change' | 'forgot' | 'reset'
  const [wsInput, setWsInput] = useState('')
  const [ws, setWs] = useState(null) // resolved workspace, or null = platform identity
  const [resolving, setResolving] = useState(false)
  const [savedUser, setSavedUser] = useState(() => {
    if (typeof localStorage === 'undefined') return null
    try {
      const str = localStorage.getItem('crm_pwa_last_user')
      return str ? JSON.parse(str) : null
    } catch (e) { return null }
  })
  // Credentials: handle = an email (owner/manager) or an assigned login ID (agent).
  const [handle, setHandle] = useState(() => savedUser?.handle || '')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  // First-login change + reset flows.
  const [newPw, setNewPw] = useState('')
  const [newPw2, setNewPw2] = useState('')
  const [forgotEmail, setForgotEmail] = useState('')
  const [forgotSent, setForgotSent] = useState(false)
  const [resetToken, setResetToken] = useState('')
  // Workspaces this browser has opened before (from localStorage, not a demo seed).
  const [recents, setRecents] = useState(() => recentWorkspaces())

  // The browser tab is part of the identity gate: platform name until a
  // workspace is chosen, the firm's name after.
  useEffect(() => {
    document.title = ws ? tenantDocTitle(ws.firmName) : PLATFORM.docTitle
  }, [ws])

  // Enter a workspace — but ONLY if it really exists. The backend resolver is
  // the authority: a typed name that doesn't match a real tenant 404s, and we
  // stop right here (no phone step, no OTP). This is what stops "type anything
  // and you're in". The firm's name/brand shown next come from the server row,
  // never from what was typed.
  const selectWorkspace = async (input, nextPhase = 'creds') => {
    const guess = resolveWorkspace(input)
    if (!guess) {
      store.toast('Enter your workspace name to continue.', 'warn')
      return
    }
    setResolving(true)
    try {
      const r = await api.resolveWorkspace(guess.tenantId)
      if (!r?.resolved || !r?.tenant) throw new Error('not-found')
      const t = r.tenant
      const bc = t.brand_config || {}
      const resolved = {
        slug: t.slug, tenantId: t.id, firmName: t.name,
        initials: bc.initials || String(t.name || '').split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase(),
        logoUrl: bc.logoUrl || '', primaryColor: bc.primaryColor || '',
      }
      api.setTenantId(t.id)
      applyPwaIdentity(t.id)                 // canonical id — matches the manifest/icon route
      applyBrandColor(bc.primaryColor)       // dress the login in the firm's real accent
      setWs(resolved)
      rememberWorkspace(resolved)   // this browser has now opened it
      setRecents(recentWorkspaces())
      // Reflect the workspace in the URL so it's shareable: baseurl/<slug>.
      try { window.history.pushState({}, '', `/${t.slug}`) } catch (e) {}
      setPhase(nextPhase)
      store.toast(`${t.name} workspace loaded`, 'ok')
    } catch (e) {
      store.toast('No workspace found with that name. Check the spelling, or ask your admin for the exact name.', 'warn')
    } finally {
      setResolving(false)
    }
  }

  // Auto-enter the workspace named in the URL path (baseurl/<slug>), query parameter,
  // or stored tenant id (PWA / previous session) on mount.
  useEffect(() => {
    const parts = window.location.pathname.replace(/^\/+|\/+$/g, '').split('/')
    const seg = decodeURIComponent(parts[0] || '')
    const token = new URLSearchParams(window.location.search).get('token')
    const queryWs = new URLSearchParams(window.location.search).get('ws')
    const storedSlug = slugFromLocation() || (typeof localStorage !== 'undefined' ? localStorage.getItem('crm_tenant_id') : '')
    const targetSlug = (seg && seg !== 'admin') ? seg : (queryWs || storedSlug)

    if (targetSlug) {
      if (parts[1] === 'reset' && token) { setResetToken(token); selectWorkspace(targetSlug, 'reset') }
      else selectWorkspace(targetSlug)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const leaveWorkspace = () => {
    if (isStandalone()) return // Installed PWA is locked to its firm
    setWs(null)
    setPhase('workspace')
    setPassword(''); setHandle('')
    applyBrandColor(DEFAULT_ACCENT) // back to the platform (Delpat) identity
    applyPwaIdentity(null)
    try { window.history.pushState({}, '', '/') } catch (e) {}
  }

  // ── Password auth handlers ─────────────────────────────────────────────────
  const doLogin = async (e) => {
    if (e) e.preventDefault()
    const targetHandle = (savedUser ? savedUser.handle : handle).trim()
    if (!targetHandle || !password) { store.toast('Enter your ID or email and password.', 'warn'); return }
    setLoading(true)
    try {
      const res = await api.login(targetHandle, password)
      if (!res?.token) throw new Error('no token')
      try {
        localStorage.setItem('crm_pwa_last_user', JSON.stringify({
          name: res.user?.name || targetHandle,
          handle: targetHandle,
          initials: res.user?.initials || String(res.user?.name || targetHandle).slice(0, 2).toUpperCase(),
          avatar: res.user?.avatar || '',
        }))
      } catch (e) {}
      if (res.mustChange) { setPhase('change'); setNewPw(''); setNewPw2(''); store.toast('Set a new password to continue.', 'ok'); return }
      store.toast(`Welcome to ${ws?.firmName || 'your desk'}`, 'ok')
      store.login({ token: res.token, user: res.user, tenant: { firmName: ws?.firmName, city: ws?.city } })
    } catch (err) {
      store.toast('Those credentials didn’t match. Please try again.', 'warn')
    } finally {
      setLoading(false)
    }
  }

  const doChangePassword = async (e) => {
    if (e) e.preventDefault()
    if (newPw.length < 8) { store.toast('New password must be at least 8 characters.', 'warn'); return }
    if (newPw !== newPw2) { store.toast('The two passwords don’t match.', 'warn'); return }
    setLoading(true)
    try {
      const r = await api.changePassword(password, newPw)  // current = the temp password just used
      if (r?.error) throw new Error(r.error)
      const res = await api.login(handle.trim(), newPw)    // clean re-login with the new password
      if (!res?.token) throw new Error('login failed')
      store.toast('Password updated — welcome.', 'ok')
      store.login({ token: res.token, user: res.user, tenant: { firmName: ws?.firmName, city: ws?.city } })
    } catch (err) {
      store.toast(err.message || 'Could not update the password.', 'warn')
    } finally {
      setLoading(false)
    }
  }

  const doForgot = async (e) => {
    if (e) e.preventDefault()
    setLoading(true)
    try { await api.forgotPassword(forgotEmail.trim()) } catch (e2) { /* silent */ }
    setForgotSent(true)   // always claim sent (no account enumeration)
    setLoading(false)
  }

  const doReset = async (e) => {
    if (e) e.preventDefault()
    if (newPw.length < 8) { store.toast('Password must be at least 8 characters.', 'warn'); return }
    if (newPw !== newPw2) { store.toast('The two passwords don’t match.', 'warn'); return }
    setLoading(true)
    try {
      const r = await api.resetPassword(resetToken, newPw)
      if (r?.error) throw new Error(r.error)
      store.toast('Password reset — sign in with your new password.', 'ok')
      setPhase('creds'); setPassword(''); setNewPw(''); setNewPw2('')
      try { window.history.replaceState({}, '', `/${ws?.tenantId || ''}`) } catch (e2) {}
    } catch (err) {
      store.toast(err.message || 'This reset link is invalid or has expired.', 'warn')
    } finally {
      setLoading(false)
    }
  }


  const LBL = { fontSize: 11, fontWeight: 600, color: 'var(--ink-2)', marginBottom: 8, display: 'block', textTransform: 'uppercase', letterSpacing: '0.06em' }
  const SPIN = { display: 'inline-block', width: 14, height: 14, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }
  const BTN = { height: 44, fontSize: 14.5, fontWeight: 600 }

  return (
    <div className="auth-root" style={{
      minHeight: '100dvh',
      width: '100vw',
      display: 'grid',
      gridTemplateColumns: 'minmax(420px, 1.15fr) minmax(420px, 1fr)',
      background: 'var(--bg)',
      color: 'var(--ink)',
      position: 'relative',
      overflow: 'hidden'
    }}>
      <Toasts toasts={state.toasts || []} />

      {/* ====================================================================== */}
      {/* COLUMN 1: CALM INSTITUTIONAL BRAND CANVAS (LEFT PANE)                */}
      {/* ====================================================================== */}
      <div className="auth-brand-pane" style={{
        background: '#13281E', // Deep institutional forest green
        color: '#FFFFFF',
        padding: '64px 72px',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        position: 'relative',
        overflow: 'hidden',
        borderRight: '1px solid rgba(255, 255, 255, 0.08)'
      }}>
        {/* Subtle, timeless geometric lines */}
        <div style={{
          position: 'absolute',
          top: 0,
          right: 0,
          bottom: 0,
          left: 0,
          backgroundImage: 'radial-gradient(rgba(255, 255, 255, 0.05) 1px, transparent 1px)',
          backgroundSize: '32px 32px',
          pointerEvents: 'none'
        }} />

        {/* Top Brand Mark — the platform logo before a workspace is chosen; a
            tenant's initials tile once one is. (Tenant logo upload comes later.) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, zIndex: 2 }}>
          {ws ? (
            ws.logoUrl ? (
              <img src={ws.logoUrl} width={40} height={40} alt={ws.firmName}
                style={{ display: 'block', borderRadius: 'var(--radius)', objectFit: 'cover', background: '#fff' }} />
            ) : (
              <div style={{
                width: 40, height: 40, borderRadius: 'var(--radius)',
                background: ws.primaryColor || 'var(--accent)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontFamily: 'var(--disp)', fontWeight: 700, fontSize: 18, color: '#FFFFFF',
                boxShadow: '0 0 0 1px rgba(255,255,255,0.14)'
              }}>
                {ws.initials}
              </div>
            )
          ) : (
            <img src="/brand-mark.svg" width={40} height={40} alt={PLATFORM.name} style={{ display: 'block', borderRadius: 'var(--radius)' }} />
          )}
          <div>
            <div style={{ fontFamily: 'var(--disp)', fontWeight: 700, fontSize: 18, letterSpacing: '-0.02em', color: '#FFFFFF' }}>
              {ws ? ws.firmName : 'Real Estate'}
            </div>
            <div style={{ fontSize: 12, color: 'rgba(255, 255, 255, 0.55)', fontWeight: 500 }}>
              {ws ? [ws.city, 'India'].filter(Boolean).join(', ') : `by ${PLATFORM.vendor}`}
            </div>
          </div>
        </div>

        {/* Center Editorial Statement — platform pitch before a workspace is
            chosen, the firm's own desk after. */}
        <div style={{ zIndex: 2, maxWidth: 460, margin: '60px 0' }}>
          <h1 style={{
            fontFamily: 'var(--disp)',
            fontWeight: 700,
            fontSize: 'clamp(32px, 3.5vw, 46px)',
            lineHeight: 1.15,
            letterSpacing: '-0.03em',
            color: '#FFFFFF',
            margin: '0 0 20px',
            fontFeatureSettings: '"ss01" on, "ss02" on'
          }}>
            {ws
              ? 'Your desk, ready when you are.'
              : 'Your property desk, in one place.'}
          </h1>
          <p style={{
            fontSize: 16,
            lineHeight: 1.6,
            color: 'rgba(255, 255, 255, 0.65)',
            margin: 0,
            fontWeight: 400
          }}>
            {ws
              ? `Pipelines, contacts and inventory for ${ws.firmName}${ws.city ? `, ${ws.city}` : ''}.`
              : 'Pipelines, contacts and inventory for your firm. Open your workspace to begin.'}
          </p>
        </div>

        {/* Footer Minimal Metadata */}
        <div style={{ zIndex: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 24, borderTop: '1px solid rgba(255, 255, 255, 0.1)', fontSize: 12, color: 'rgba(255, 255, 255, 0.5)' }}>
          <div>{ws ? `Powered by ${PLATFORM.vendor}` : `${PLATFORM.vendor} · white-label platform`}</div>
          <div className="mono-num">{PLATFORM.version}</div>
        </div>
      </div>

      {/* ====================================================================== */}
      {/* COLUMN 2: CLEAN AUTHENTICATION DESK (RIGHT PANE)                      */}
      {/* ====================================================================== */}
      <div className="auth-form-pane" style={{
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        padding: '56px 64px',
        background: 'var(--bg)',
        position: 'relative',
        overflowY: 'auto'
      }}>
        <div style={{ width: '100%', maxWidth: 380 }}>
          {/* Mobile-only brand lockup — the left pane is hidden under 1024px,
              so without this a phone would show no identity at all. */}
          <div className="auth-mobile-mark" style={{ display: 'none', alignItems: 'center', gap: 12, marginBottom: 28 }}>
            {ws ? (
              <div style={{
                width: 42, height: 42, borderRadius: 'var(--radius)', flexShrink: 0,
                background: 'var(--accent-wash)', color: 'var(--accent)', border: '1px solid var(--accent-line)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontFamily: 'var(--disp)', fontWeight: 700, fontSize: 16, overflow: 'hidden'
              }}>
                {ws.logoUrl ? <img src={ws.logoUrl} alt={ws.firmName} style={{ width: '100%', height: '100%', objectFit: 'contain' }} /> : ws.initials}
              </div>
            ) : (
              <img src="/brand-mark.svg" width={38} height={38} alt={PLATFORM.name} style={{ display: 'block', borderRadius: 'var(--radius)', flexShrink: 0 }} />
            )}
            <div>
              <div style={{ fontFamily: 'var(--disp)', fontWeight: 700, fontSize: 16, color: 'var(--ink)', letterSpacing: '-0.02em' }}>
                {ws ? ws.firmName : PLATFORM.name}
              </div>
              <div style={{ fontSize: 11.5, color: 'var(--muted)', fontWeight: 500 }}>
                {ws ? [ws.city, 'India'].filter(Boolean).join(', ') : `${PLATFORM.kind} by ${PLATFORM.vendor}`}
              </div>
            </div>
          </div>

          {/* Subtle URL indicator — the workspace address, once there is one.
              Before that it names the platform, so the origin is never blank. */}
          <div style={{ marginBottom: 36 }}>
            <div style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              fontSize: 12,
              color: 'var(--muted)',
              fontFamily: 'var(--mono)'
            }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: ws ? 'var(--accent)' : 'var(--line)' }} />
              <span>{ws ? `${PLATFORM.host}/${ws.slug}` : PLATFORM.host}</span>
            </div>
          </div>

          {/* Form Header */}
          <div style={{ marginBottom: 32 }}>
            <h2 style={{ fontFamily: 'var(--disp)', fontWeight: 700, fontSize: 26, color: 'var(--ink)', margin: '0 0 8px', letterSpacing: '-0.02em' }}>
              {ws ? 'Sign in' : 'Open your workspace'}
            </h2>
            <p style={{ fontSize: 14, color: 'var(--muted)', margin: 0, lineHeight: 1.5 }}>
              {ws
                ? <>Sign in to the <strong style={{ color: 'var(--ink)', fontWeight: 600 }}>{ws.firmName}</strong> desk with your ID or email and password.</>
                : 'Enter your firm’s workspace name to open its desk.'}
            </p>
          </div>

          {/* AUTHENTICATION FORM CARD */}
          <div style={{
            background: 'var(--card)',
            border: '1px solid var(--line)',
            borderRadius: 'var(--radius-lg)',
            padding: '28px 24px',
            boxShadow: 'var(--shadow)'
          }}>
            {phase === 'workspace' ? (
              /* PHASE 0: WORKSPACE — the identity gate */
              <form onSubmit={e => { e.preventDefault(); selectWorkspace(wsInput) }}>
                <div className="field" style={{ marginBottom: 20 }}>
                  <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink-2)', marginBottom: 8, display: 'block', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                    Workspace
                  </label>
                  <div className="input-group">
                    <input
                      type="text"
                      value={wsInput}
                      onChange={e => setWsInput(e.target.value)}
                      placeholder="Your firm's name"
                      autoFocus
                      disabled={resolving}
                      autoCapitalize="none"
                      autoCorrect="off"
                      spellCheck={false}
                      style={{ fontWeight: 600, fontSize: 15 }}
                    />
                  </div>
                  <div style={{ marginTop: 9, fontSize: 12, color: 'var(--muted)', fontFamily: 'var(--mono)', display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
                    <span style={{ width: 5, height: 5, borderRadius: '50%', background: wsInput.trim() ? 'var(--accent)' : 'var(--line)', flexShrink: 0 }} />
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {PLATFORM.host}/<span style={{ color: 'var(--ink-2)', fontWeight: 600 }}>{normalizeSlug(wsInput) || 'your-firm'}</span>
                    </span>
                  </div>
                </div>

                {recents.length > 0 && (
                  <div style={{ marginBottom: 22 }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                      Recent workspaces
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {recents.map(w => (
                        <button
                          key={w.tenantId}
                          type="button"
                          onClick={() => { setWsInput(w.slug); selectWorkspace(w.slug) }}
                          disabled={resolving}
                          style={{
                            width: '100%', display: 'flex', alignItems: 'center', gap: 12,
                            padding: '10px 12px', background: 'var(--bg)', border: '1px solid var(--line)',
                            borderRadius: 'var(--radius)', cursor: resolving ? 'wait' : 'pointer', textAlign: 'left'
                          }}
                        >
                          <span style={{
                            width: 32, height: 32, borderRadius: 'var(--radius)', flexShrink: 0,
                            background: 'var(--accent-wash)', color: 'var(--accent)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontFamily: 'var(--disp)', fontWeight: 700, fontSize: 13
                          }}>{w.initials}</span>
                          <span style={{ flex: 1, minWidth: 0 }}>
                            <span style={{ display: 'block', fontSize: 13.5, fontWeight: 600, color: 'var(--ink)' }}>{w.firmName}</span>
                            <span style={{ display: 'block', fontSize: 11.5, color: 'var(--muted)', fontFamily: 'var(--mono)' }}>{PLATFORM.host}/{w.slug}</span>
                          </span>
                          <Icon name="arrowRight" size={14} />
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <Button
                  variant="primary"
                  block
                  type="submit"
                  disabled={resolving}
                  style={{ height: 44, fontSize: 14.5, cursor: resolving ? 'wait' : 'pointer', fontWeight: 600 }}
                >
                  {resolving ? (
                    <>
                      <span style={{ display: 'inline-block', width: 14, height: 14, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                      <span>Loading workspace...</span>
                    </>
                  ) : (
                    <>
                      <span>Continue</span>
                      <Icon name="arrowRight" size={16} />
                    </>
                  )}
                </Button>
              </form>
            ) : phase === 'creds' ? (
              /* PHASE 1: PASSWORD SIGN-IN (email or agent ID) */
              <form onSubmit={doLogin}>
                {savedUser ? (
                  /* Native App User Card */
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', background: 'var(--card-2, #f4f3ef)', borderRadius: 12, marginBottom: 18, border: '1px solid var(--line, #e5e3dd)' }}>
                    <div style={{ width: 42, height: 42, borderRadius: '50%', background: 'var(--accent, #1E6F52)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 15, flexShrink: 0 }}>
                      {savedUser.initials || 'U'}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: 14.5, color: 'var(--ink, #1a1a1a)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{savedUser.name}</div>
                      <div style={{ fontSize: 12, color: 'var(--muted, #666)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{savedUser.handle}</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        try { localStorage.removeItem('crm_pwa_last_user') } catch (e) {}
                        setSavedUser(null); setHandle(''); setPassword('')
                      }}
                      style={{ fontSize: 12, color: 'var(--accent, #1E6F52)', background: 'transparent', border: 'none', cursor: 'pointer', fontWeight: 600, padding: '4px 8px' }}
                    >
                      Use another
                    </button>
                  </div>
                ) : (
                  <div className="field" style={{ marginBottom: 16 }}>
                    <label style={LBL}>Email</label>
                    <div className="input-group">
                      <input type="text" value={handle} onChange={e => setHandle(e.target.value)}
                        placeholder="you@firm.com" autoFocus disabled={loading}
                        autoCapitalize="none" autoCorrect="off" spellCheck={false}
                        style={{ fontWeight: 600, fontSize: 15 }} />
                    </div>
                  </div>
                )}
                <div className="field" style={{ marginBottom: 10 }}>
                  <label style={LBL}>Password</label>
                  <PwField value={password} onChange={e => setPassword(e.target.value)} placeholder="Your password" autoFocus={Boolean(savedUser)} disabled={loading} />
                </div>
                <div style={{ textAlign: 'right', marginBottom: 18 }}>
                  <button type="button" className="btn-quiet"
                    onClick={() => { setForgotEmail(handle.includes('@') ? handle : (savedUser?.handle || '')); setForgotSent(false); setPhase('forgot') }}
                    style={{ fontSize: 12, padding: 0, color: 'var(--accent)', fontWeight: 600 }}>Forgot password?</button>
                </div>
                <Button variant="primary" block type="submit" disabled={loading} style={{ ...BTN, cursor: loading ? 'wait' : 'pointer' }}>
                  {loading ? <><span style={SPIN} /><span>Signing in…</span></> : <><span>Sign in</span><Icon name="arrowRight" size={16} /></>}
                </Button>
              </form>
            ) : phase === 'change' ? (
              /* PHASE 2: FIRST-LOGIN PASSWORD CHANGE */
              <form onSubmit={doChangePassword}>
                <div style={{ fontSize: 12.5, color: 'var(--muted)', marginBottom: 16, lineHeight: 1.5 }}>
                  Set a new password to finish signing in.
                </div>
                <div className="field" style={{ marginBottom: 14 }}>
                  <label style={LBL}>New password</label>
                  <PwField value={newPw} onChange={e => setNewPw(e.target.value)} placeholder="At least 8 characters" autoFocus disabled={loading} />
                </div>
                <div className="field" style={{ marginBottom: 18 }}>
                  <label style={LBL}>Confirm password</label>
                  <PwField value={newPw2} onChange={e => setNewPw2(e.target.value)} placeholder="Repeat it" disabled={loading} />
                </div>
                <Button variant="primary" block type="submit" disabled={loading} style={{ ...BTN, cursor: loading ? 'wait' : 'pointer' }}>
                  {loading ? <><span style={SPIN} /><span>Updating…</span></> : <><span>Update &amp; continue</span><Icon name="check" size={16} /></>}
                </Button>
              </form>
            ) : phase === 'forgot' ? (
              /* PHASE 3: FORGOT PASSWORD (owner/manager self-serve) */
              <div>
                {forgotSent ? (
                  <div style={{ fontSize: 13.5, color: 'var(--ink-2)', lineHeight: 1.55 }}>
                    If an account with that email exists, a reset link is on its way. Check your inbox — the link expires in 30 minutes.
                  </div>
                ) : (
                  <form onSubmit={doForgot}>
                    <div style={{ fontSize: 12.5, color: 'var(--muted)', marginBottom: 16, lineHeight: 1.5 }}>
                      Enter your account email and we'll send a reset link. Agents: ask your admin to reset your password.
                    </div>
                    <div className="field" style={{ marginBottom: 18 }}>
                      <label style={LBL}>Email</label>
                      <div className="input-group">
                        <input type="email" value={forgotEmail} onChange={e => setForgotEmail(e.target.value)}
                          placeholder="you@firm.com" autoFocus disabled={loading}
                          autoCapitalize="none" autoCorrect="off" spellCheck={false} style={{ fontWeight: 600, fontSize: 15 }} />
                      </div>
                    </div>
                    <Button variant="primary" block type="submit" disabled={loading} style={{ ...BTN, cursor: loading ? 'wait' : 'pointer' }}>
                      {loading ? <><span style={SPIN} /><span>Sending…</span></> : <span>Send reset link</span>}
                    </Button>
                  </form>
                )}
                <div style={{ textAlign: 'center', marginTop: 16 }}>
                  <button type="button" className="btn-quiet" onClick={() => setPhase('creds')}
                    style={{ fontSize: 12, padding: 0, color: 'var(--accent)', fontWeight: 600 }}>Back to sign in</button>
                </div>
              </div>
            ) : (
              /* PHASE 4: RESET PASSWORD (from an emailed link) */
              <form onSubmit={doReset}>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)', marginBottom: 14 }}>Set a new password</div>
                <div className="field" style={{ marginBottom: 14 }}>
                  <label style={LBL}>New password</label>
                  <PwField value={newPw} onChange={e => setNewPw(e.target.value)} placeholder="At least 8 characters" autoFocus disabled={loading} />
                </div>
                <div className="field" style={{ marginBottom: 18 }}>
                  <label style={LBL}>Confirm password</label>
                  <PwField value={newPw2} onChange={e => setNewPw2(e.target.value)} placeholder="Repeat it" disabled={loading} />
                </div>
                <Button variant="primary" block type="submit" disabled={loading} style={{ ...BTN, cursor: loading ? 'wait' : 'pointer' }}>
                  {loading ? <><span style={SPIN} /><span>Saving…</span></> : <span>Reset password</span>}
                </Button>
              </form>
            )}
          </div>

          {/* Minimal Support Help */}
          <div style={{ textAlign: 'center', marginTop: 28, fontSize: 12, color: 'var(--muted)', display: 'flex', flexDirection: 'column', gap: 8 }}>
            {/* An installed app belongs to one firm: its manifest scope is that
                firm's path, so leaving the workspace would navigate out of
                scope and spill the app into a browser tab. The control stays in
                the browser, where switching workspaces is a real thing to do. */}
            {ws && !isStandalone() ? (
              <button
                type="button"
                onClick={leaveWorkspace}
                className="btn-quiet"
                style={{ fontSize: 12, padding: 0, color: 'var(--ink-2)', margin: '0 auto' }}
              >
                Not {ws.firmName}? Switch workspace
              </button>
            ) : (
              <div>Need access? Contact your firm&apos;s administration desk.</div>
            )}
          </div>
        </div>
      </div>

      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        @media (max-width: 1023px) {
          .auth-root {
            grid-template-columns: 1fr !important;
          }
          .auth-brand-pane {
            display: none !important;
          }
          .auth-form-pane {
            padding: 24px !important;
          }
          .auth-mobile-mark {
            display: flex !important;
          }
        }
      `}</style>
    </div>
  )
}
