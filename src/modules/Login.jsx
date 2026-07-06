/**
 * ============================================================================
 * 🏛️ BHUMI PROPCITY — INSTITUTIONAL WORKSPACE AUTHENTICATION DESK
 * ============================================================================
 * Built strictly according to ui-ux-pro-max and frontend-design principles:
 * - Zero emoji icons (exclusively clean Feather/Lucide-style SVG icons).
 * - Deliberate 2-column architectural split: Obsidian institutional chrome on
 *   the left vs. warm paper neutrals (#F6F5F2) on the right authentication desk.
 * - Tabular numerals (mono-num) for OTP and real estate telemetry.
 * - Interactive 4-box OTP engine with auto-advance, backspace, and paste.
 * - High-contrast light mode, visible focus rings, and proper accessibility.
 * ============================================================================
 */

import { useState, useRef, useEffect } from 'react'
import { theme } from '../data/theme.js'
import { Button } from '../components/primitives.jsx'
import Icon from '../components/Icon.jsx'
import { Toasts } from '../components/chrome.jsx'

export default function Login({ store }) {
  const { state } = store
  const [phase, setPhase] = useState('phone') // 'phone' | 'otp'
  const [phone, setPhone] = useState('')
  const [otp, setOtp] = useState(['', '', '', ''])
  const [loading, setLoading] = useState(false)
  const [verifying, setVerifying] = useState(false)
  const [timer, setTimer] = useState(30)
  const [role, setRole] = useState(state.role || 'admin')

  const inputRefs = [useRef(null), useRef(null), useRef(null), useRef(null)]

  // Countdown timer when in OTP phase
  useEffect(() => {
    let interval = null
    if (phase === 'otp' && timer > 0) {
      interval = setInterval(() => setTimer(t => t - 1), 1000)
    }
    return () => clearInterval(interval)
  }, [phase, timer])

  // Handle Role Toggle (RBAC preview)
  const handleRoleChange = (newRole) => {
    setRole(newRole)
    store.dispatch({ type: 'ROLE', role: newRole })
    const roleTitle = newRole === 'admin' ? 'Owner / Tenant Admin' : 'Sales Agent / Field Desk'
    store.toast(`Switched active desk permissions to: ${roleTitle}`, 'ok')
  }

  // Phase 1: Send OTP Dispatch Simulation
  const handleSendOtp = (e) => {
    if (e) e.preventDefault()
    const targetPhone = phone.trim() || '98220 41556'
    setLoading(true)
    
    setTimeout(() => {
      setLoading(false)
      setPhase('otp')
      setTimer(30)
      store.toast(`Verification code 4217 dispatched to +91 ${targetPhone} via Exotel & WhatsApp`, 'ok')
      setTimeout(() => inputRefs[0].current?.focus(), 80)
    }, 1000)
  }

  // Handle OTP Digit Input & Auto-Advance
  const handleOtpChange = (index, val) => {
    const char = val.slice(-1)
    if (!/^\d*$/.test(char)) return

    const newOtp = [...otp]
    newOtp[index] = char
    setOtp(newOtp)

    if (char && index < 3) {
      inputRefs[index + 1].current?.focus()
    }

    if (char && index === 3 && newOtp.every(d => d !== '')) {
      handleVerify(newOtp.join(''))
    }
  }

  // Handle Backspace navigation in OTP boxes
  const handleOtpKeyDown = (index, e) => {
    if (e.key === 'Backspace' && !otp[index] && index > 0) {
      inputRefs[index - 1].current?.focus()
    }
  }

  // Handle Paste Verification Code
  const handleOtpPaste = (e) => {
    e.preventDefault()
    const pasted = e.clipboardData.getData('text').slice(0, 4).split('')
    if (pasted.length === 4 && pasted.every(c => /^\d$/.test(c))) {
      setOtp(pasted)
      inputRefs[3].current?.focus()
      handleVerify(pasted.join(''))
    }
  }

  // One-click Demo Auto-Fill
  const handleAutoFill = () => {
    const demoCode = ['4', '2', '1', '7']
    setOtp(demoCode)
    store.toast('Auto-filled demo code 4217', 'ok')
    handleVerify('4217')
  }

  // Phase 2: Verify Code & Authenticate Workspace
  const handleVerify = (codeToVerify) => {
    const fullCode = typeof codeToVerify === 'string' ? codeToVerify : otp.join('')
    if (fullCode.length < 4) {
      store.toast('Please enter the complete 4-digit verification code.', 'warn')
      return
    }

    setVerifying(true)
    setTimeout(() => {
      setVerifying(false)
      const roleTitle = role === 'admin' ? 'Owner / Tenant Admin' : 'Sales Agent / Field Desk'
      store.toast(`Authenticated session for ${theme.brand.firmName} (${roleTitle})`, 'ok')
      store.login()
    }, 900)
  }

  const handleResend = () => {
    setTimer(30)
    store.toast('Fresh verification code dispatched via Exotel Voice Bridge.', 'ok')
  }

  return (
    <div className="auth-split-root" style={{
      minHeight: '100dvh',
      width: '100vw',
      display: 'grid',
      gridTemplateColumns: 'minmax(460px, 1.2fr) minmax(420px, 1fr)',
      background: 'var(--bg)',
      color: 'var(--ink)',
      position: 'relative',
      overflow: 'hidden'
    }}>
      {/* Floating System Notification Stack */}
      <Toasts toasts={state.toasts || []} />

      {/* ====================================================================== */}
      {/* COLUMN 1: INSTITUTIONAL REAL ESTATE TELEMETRY & HERO (LEFT PANE) */}
      {/* ====================================================================== */}
      <div className="auth-hero-pane" style={{
        background: 'var(--chrome)',
        color: 'var(--on-chrome)',
        padding: '56px 64px',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        position: 'relative',
        overflow: 'hidden',
        borderRight: '1px solid rgba(255, 255, 255, 0.08)'
      }}>
        {/* Subtle Architectural Grid Pattern */}
        <div style={{
          position: 'absolute',
          inset: 0,
          backgroundImage: 'linear-gradient(to right, rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.03) 1px, transparent 1px)',
          backgroundSize: '40px 40px',
          pointerEvents: 'none'
        }} />

        {/* Brand Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, zIndex: 2 }}>
          <div style={{
            width: 44,
            height: 44,
            borderRadius: 'var(--radius)',
            background: 'var(--accent)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontFamily: 'var(--disp)',
            fontWeight: 700,
            fontSize: 20,
            color: '#fff',
            boxShadow: '0 4px 12px rgba(30, 111, 82, 0.4)'
          }}>
            {theme.brand.initials}
          </div>
          <div>
            <div style={{ fontFamily: 'var(--disp)', fontWeight: 700, fontSize: 18, letterSpacing: '-0.02em', color: '#fff' }}>
              {theme.brand.firmName}
            </div>
            <div style={{ fontSize: 12, color: 'var(--on-chrome-mut)', fontWeight: 500 }}>
              {theme.brand.city} Private Cloud · Institutional Desk
            </div>
          </div>
        </div>

        {/* Editorial Value Proposition & Telemetry Showcase */}
        <div style={{ zIndex: 2, maxWidth: 520, margin: '48px 0' }}>
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            background: 'rgba(30, 111, 82, 0.25)',
            border: '1px solid rgba(196, 221, 208, 0.2)',
            padding: '5px 12px',
            borderRadius: 20,
            fontSize: 11,
            fontWeight: 600,
            color: '#86EFAC',
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
            marginBottom: 20
          }}>
            <Icon name="shield" size={13} />
            <span>Dedicated Tenant Infrastructure</span>
          </div>

          <h1 style={{
            fontFamily: 'var(--disp)',
            fontWeight: 700,
            fontSize: 'clamp(30px, 3.2vw, 44px)',
            lineHeight: 1.15,
            letterSpacing: '-0.03em',
            color: '#fff',
            margin: '0 0 16px'
          }}>
            Command your Pune real estate pipeline with precision.
          </h1>

          <p style={{
            fontSize: 15,
            lineHeight: 1.6,
            color: 'var(--on-chrome-mut)',
            margin: '0 0 36px',
            fontWeight: 400
          }}>
            Purpose-built for high-velocity Indian brokerages. Featuring sub-second 99acres & MagicBricks deduplication, Exotel 2-leg telephony bridges, and automated WhatsApp WABA dispatches.
          </p>

          {/* Institutional Telemetry Proof Cards (No emojis, pure SVG & tabular data) */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{
              background: 'var(--chrome-2)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              borderRadius: 'var(--radius-lg)',
              padding: '14px 18px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <div style={{ width: 36, height: 36, borderRadius: 8, background: 'rgba(16, 185, 129, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#10B981' }}>
                  <Icon name="phone" size={16} />
                </div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#fff' }}>Exotel Telephony Bridge</div>
                  <div style={{ fontSize: 12, color: 'var(--on-chrome-mut)', marginTop: 2 }}>2-leg instant dialer with automated timeline call recordings</div>
                </div>
              </div>
              <span className="mono-num" style={{ fontSize: 11, fontWeight: 700, background: 'rgba(16, 185, 129, 0.2)', color: '#10B981', padding: '3px 8px', borderRadius: 4 }}>
                0ms LATENCY
              </span>
            </div>

            <div style={{
              background: 'var(--chrome-2)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              borderRadius: 'var(--radius-lg)',
              padding: '14px 18px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <div style={{ width: 36, height: 36, borderRadius: 8, background: 'rgba(59, 130, 246, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#60A5FA' }}>
                  <Icon name="layers" size={16} />
                </div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#fff' }}>Universal Ingestion Engine</div>
                  <div style={{ fontSize: 12, color: 'var(--on-chrome-mut)', marginTop: 2 }}>B-Tree indexed phone & email deduplication across all portals</div>
                </div>
              </div>
              <span className="mono-num" style={{ fontSize: 11, fontWeight: 700, background: 'rgba(59, 130, 246, 0.2)', color: '#60A5FA', padding: '3px 8px', borderRadius: 4 }}>
                100% IDEMPOTENT
              </span>
            </div>
          </div>
        </div>

        {/* Footer Security Signature */}
        <div style={{ zIndex: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 20, borderTop: '1px solid rgba(255,255,255,0.08)', fontSize: 12, color: 'var(--on-chrome-mut)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Icon name="check" size={14} style={{ color: '#10B981' }} />
            <span>RERA Maharashtra Compliant · Row-Level Security</span>
          </div>
          <div className="mono-num">v2.4.0-PROD</div>
        </div>
      </div>

      {/* ====================================================================== */}
      {/* COLUMN 2: WARM PAPER AUTHENTICATION DESK (RIGHT PANE) */}
      {/* ====================================================================== */}
      <div className="auth-desk-pane" style={{
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        padding: '48px 56px',
        background: 'var(--bg)',
        position: 'relative',
        overflowY: 'auto'
      }}>
        <div style={{ width: '100%', maxWidth: 400 }}>
          {/* Active Workspace URL Indicator */}
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 32 }}>
            <div style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              background: 'var(--card)',
              border: '1px solid var(--line)',
              padding: '6px 14px',
              borderRadius: 20,
              fontSize: 12,
              color: 'var(--ink)',
              boxShadow: 'var(--shadow)'
            }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--accent)' }} />
              <span style={{ fontWeight: 600, fontFamily: 'var(--mono)' }}>app.bhumipropcity.com</span>
              <span style={{ color: 'var(--muted)' }}>· Pune SaaS</span>
            </div>
          </div>

          {/* Desk Header */}
          <div style={{ textAlign: 'center', marginBottom: 28 }}>
            <h2 style={{ fontFamily: 'var(--disp)', fontWeight: 700, fontSize: 24, color: 'var(--ink)', margin: '0 0 6px', letterSpacing: '-0.02em' }}>
              Sign in to your desk
            </h2>
            <p style={{ fontSize: 13.5, color: 'var(--muted)', margin: 0 }}>
              Enter your credentials to access your firm&apos;s private workspace.
            </p>
          </div>

          {/* RBAC Role Selector (Segmented Control style) */}
          <div style={{ marginBottom: 26, paddingBottom: 22, borderBottom: '1px solid var(--line)' }}>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--muted)', marginBottom: 8, textAlign: 'center' }}>
              Workspace Role Access
            </div>
            <div className="seg seg-block" style={{ background: 'var(--line-2)', padding: 3, borderRadius: 'var(--radius)' }}>
              <button
                type="button"
                className={role === 'admin' ? 'on' : ''}
                onClick={() => handleRoleChange('admin')}
                style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '8px 12px', fontSize: 13, cursor: 'pointer' }}
              >
                <Icon name="settings" size={14} />
                <span>Owner / Admin</span>
              </button>
              <button
                type="button"
                className={role === 'agent' ? 'on' : ''}
                onClick={() => handleRoleChange('agent')}
                style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '8px 12px', fontSize: 13, cursor: 'pointer' }}
              >
                <Icon name="person" size={14} />
                <span>Sales Agent</span>
              </button>
            </div>
          </div>

          {/* AUTHENTICATION FORM CARD */}
          <div style={{
            background: 'var(--card)',
            border: '1px solid var(--line)',
            borderRadius: 'var(--radius-lg)',
            padding: '24px',
            boxShadow: 'var(--shadow-pop)'
          }}>
            {phase === 'phone' ? (
              /* PHASE 1: MOBILE NUMBER INPUT */
              <form onSubmit={handleSendOtp}>
                <div className="field" style={{ marginBottom: 20 }}>
                  <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink-2)', marginBottom: 6, display: 'block', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Indian Mobile Number
                  </label>
                  <div className="input-group">
                    <span className="prefix" style={{ fontFamily: 'var(--mono)' }}>+91</span>
                    <input
                      type="tel"
                      value={phone}
                      onChange={e => setPhone(e.target.value)}
                      placeholder="98220 41556"
                      autoFocus
                      disabled={loading}
                      className="mono-num"
                      style={{ fontWeight: 600, fontSize: 15 }}
                    />
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 6 }}>
                    A 4-digit verification code will be sent via WhatsApp & SMS.
                  </div>
                </div>

                <Button
                  variant="primary"
                  block
                  type="submit"
                  disabled={loading}
                  style={{ height: 42, fontSize: 14, cursor: loading ? 'wait' : 'pointer' }}
                >
                  {loading ? (
                    <>
                      <span style={{ display: 'inline-block', width: 14, height: 14, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                      <span>Dispatching code...</span>
                    </>
                  ) : (
                    <>
                      <span>Send Verification Code</span>
                      <Icon name="arrowRight" size={15} />
                    </>
                  )}
                </Button>
              </form>
            ) : (
              /* PHASE 2: INTERACTIVE OTP INPUT */
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>Enter 4-digit code</div>
                    <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                      Sent to <span className="mono-num" style={{ fontWeight: 600, color: 'var(--ink)' }}>+91 {phone || '98220 41556'}</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setPhase('phone')}
                    className="btn-quiet"
                    style={{ fontSize: 12, padding: '2px 6px', color: 'var(--accent)' }}
                  >
                    Change
                  </button>
                </div>

                {/* Interactive 4-Box OTP Input */}
                <div
                  onPaste={handleOtpPaste}
                  style={{ display: 'flex', gap: 10, justifyContent: 'center', marginBottom: 18 }}
                >
                  {otp.map((digit, i) => (
                    <input
                      key={i}
                      ref={inputRefs[i]}
                      type="text"
                      inputMode="numeric"
                      maxLength={1}
                      value={digit}
                      onChange={e => handleOtpChange(i, e.target.value)}
                      onKeyDown={e => handleOtpKeyDown(i, e)}
                      disabled={verifying}
                      className="mono-num"
                      style={{
                        width: 56,
                        height: 60,
                        border: `2px solid ${digit ? 'var(--accent)' : 'var(--line)'}`,
                        borderRadius: 'var(--radius)',
                        textAlign: 'center',
                        fontFamily: 'var(--disp)',
                        fontWeight: 700,
                        fontSize: 22,
                        color: 'var(--ink)',
                        background: digit ? 'var(--accent-wash)' : 'var(--card)',
                        outline: 'none',
                        transition: 'border-color 0.15s, background 0.15s'
                      }}
                    />
                  ))}
                </div>

                {/* Quick Auto-Fill Demo Pill */}
                <div style={{ textAlign: 'center', marginBottom: 18 }}>
                  <button
                    type="button"
                    onClick={handleAutoFill}
                    disabled={verifying}
                    style={{
                      background: 'var(--card-2)',
                      border: '1px solid var(--line)',
                      padding: '5px 12px',
                      borderRadius: 16,
                      fontSize: 12,
                      fontWeight: 600,
                      color: 'var(--ink-2)',
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      transition: 'border-color 0.15s'
                    }}
                  >
                    <Icon name="zap" size={13} style={{ color: 'var(--accent)' }} />
                    <span>Auto-fill verification code: <strong className="mono-num" style={{ color: 'var(--accent)' }}>4217</strong></span>
                  </button>
                </div>

                {/* Verify Button */}
                <Button
                  variant="primary"
                  block
                  onClick={() => handleVerify()}
                  disabled={verifying || otp.some(d => d === '')}
                  style={{ height: 42, fontSize: 14, cursor: verifying ? 'wait' : 'pointer', marginBottom: 14 }}
                >
                  {verifying ? (
                    <>
                      <span style={{ display: 'inline-block', width: 14, height: 14, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                      <span>Verifying workspace access...</span>
                    </>
                  ) : (
                    <>
                      <span>Verify & Enter Workspace</span>
                      <Icon name="check" size={15} />
                    </>
                  )}
                </Button>

                {/* Countdown Timer & Resend Actions */}
                <div style={{ textAlign: 'center', fontSize: 12.5, color: 'var(--muted)' }}>
                  {timer > 0 ? (
                    <span>Resend code in <strong className="mono-num" style={{ color: 'var(--ink)' }}>00:{timer < 10 ? `0${timer}` : timer}s</strong></span>
                  ) : (
                    <div style={{ display: 'flex', justifyContent: 'center', gap: 14 }}>
                      <button type="button" onClick={handleResend} className="btn-quiet" style={{ fontSize: 12, padding: 0, color: 'var(--accent)', fontWeight: 600 }}>
                        Resend SMS
                      </button>
                      <span>·</span>
                      <button type="button" onClick={handleResend} className="btn-quiet" style={{ fontSize: 12, padding: 0, color: 'var(--accent)', fontWeight: 600 }}>
                        Voice Call OTP
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Footer Subtext */}
          <div style={{ textAlign: 'center', marginTop: 24, fontSize: 12, color: 'var(--muted)', lineHeight: 1.6 }}>
            <div>Protected by 256-bit institutional encryption.</div>
            <div style={{ fontWeight: 600, color: 'var(--ink)', marginTop: 2 }}>{theme.brand.firmName} Private Cloud Desk</div>
          </div>
        </div>
      </div>

      {/* Responsive Media Query & Animation Styles */}
      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        @media (max-width: 1023px) {
          .auth-split-root {
            grid-template-columns: 1fr !important;
          }
          .auth-hero-pane {
            display: none !important;
          }
          .auth-desk-pane {
            padding: 24px !important;
          }
        }
      `}</style>
    </div>
  )
}
