/**
 * ============================================================================
 * 🏛️ BHUMI PROPCITY — INSTITUTIONAL WORKSPACE LOGIN
 * ============================================================================
 * A calm, disciplined, human-designed authentication desk.
 * Stripped of all artificial stats, technical buzzwords, and AI filler.
 * Relies on timeless typography, generous whitespace, and restrained elegance.
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

  useEffect(() => {
    let interval = null
    if (phase === 'otp' && timer > 0) {
      interval = setInterval(() => setTimer(t => t - 1), 1000)
    }
    return () => clearInterval(interval)
  }, [phase, timer])

  const handleRoleChange = (newRole) => {
    setRole(newRole)
    store.dispatch({ type: 'ROLE', role: newRole })
    const roleTitle = newRole === 'admin' ? 'Owner / Admin' : 'Sales Agent'
    store.toast(`Switched access level to: ${roleTitle}`, 'ok')
  }

  const handleSendOtp = (e) => {
    if (e) e.preventDefault()
    const targetPhone = phone.trim() || '98220 41556'
    setLoading(true)
    
    setTimeout(() => {
      setLoading(false)
      setPhase('otp')
      setTimer(30)
      store.toast(`Verification code sent to +91 ${targetPhone}`, 'ok')
      setTimeout(() => inputRefs[0].current?.focus(), 80)
    }, 900)
  }

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

  const handleOtpKeyDown = (index, e) => {
    if (e.key === 'Backspace' && !otp[index] && index > 0) {
      inputRefs[index - 1].current?.focus()
    }
  }

  const handleOtpPaste = (e) => {
    e.preventDefault()
    const pasted = e.clipboardData.getData('text').slice(0, 4).split('')
    if (pasted.length === 4 && pasted.every(c => /^\d$/.test(c))) {
      setOtp(pasted)
      inputRefs[3].current?.focus()
      handleVerify(pasted.join(''))
    }
  }

  const handleAutoFill = () => {
    const demoCode = ['4', '2', '1', '7']
    setOtp(demoCode)
    handleVerify('4217')
  }

  const handleVerify = (codeToVerify) => {
    const fullCode = typeof codeToVerify === 'string' ? codeToVerify : otp.join('')
    if (fullCode.length < 4) {
      store.toast('Please enter the 4-digit verification code.', 'warn')
      return
    }

    setVerifying(true)
    setTimeout(() => {
      setVerifying(false)
      store.toast(`Welcome to ${theme.brand.firmName}`, 'ok')
      store.login()
    }, 800)
  }

  const handleResend = () => {
    setTimer(30)
    store.toast('Fresh verification code sent via voice bridge.', 'ok')
  }

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

        {/* Top Brand Mark */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, zIndex: 2 }}>
          <div style={{
            width: 40,
            height: 40,
            borderRadius: 'var(--radius)',
            background: 'rgba(255, 255, 255, 0.1)',
            border: '1px solid rgba(255, 255, 255, 0.15)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontFamily: 'var(--disp)',
            fontWeight: 700,
            fontSize: 18,
            color: '#FFFFFF'
          }}>
            {theme.brand.initials}
          </div>
          <div>
            <div style={{ fontFamily: 'var(--disp)', fontWeight: 700, fontSize: 18, letterSpacing: '-0.02em', color: '#FFFFFF' }}>
              {theme.brand.firmName}
            </div>
            <div style={{ fontSize: 12, color: 'rgba(255, 255, 255, 0.55)', fontWeight: 500 }}>
              {theme.brand.city}, India
            </div>
          </div>
        </div>

        {/* Center Editorial Statement */}
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
            The operating system for residential real estate advisory.
          </h1>
          <p style={{
            fontSize: 16,
            lineHeight: 1.6,
            color: 'rgba(255, 255, 255, 0.65)',
            margin: 0,
            fontWeight: 400
          }}>
            Managing sales pipelines, client relationships, and inventory across premium developments in Pune and Maharashtra.
          </p>
        </div>

        {/* Footer Minimal Metadata */}
        <div style={{ zIndex: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 24, borderTop: '1px solid rgba(255, 255, 255, 0.1)', fontSize: 12, color: 'rgba(255, 255, 255, 0.5)' }}>
          <div>Private Cloud Workspace</div>
          <div className="mono-num">© {new Date().getFullYear()} {theme.brand.firmName}</div>
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
          {/* Subtle URL Indicator */}
          <div style={{ marginBottom: 36 }}>
            <div style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              fontSize: 12,
              color: 'var(--muted)',
              fontFamily: 'var(--mono)'
            }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)' }} />
              <span>app.bhumipropcity.com</span>
            </div>
          </div>

          {/* Form Header */}
          <div style={{ marginBottom: 32 }}>
            <h2 style={{ fontFamily: 'var(--disp)', fontWeight: 700, fontSize: 26, color: 'var(--ink)', margin: '0 0 8px', letterSpacing: '-0.02em' }}>
              Sign in
            </h2>
            <p style={{ fontSize: 14, color: 'var(--muted)', margin: 0, lineHeight: 1.5 }}>
              Enter your mobile number to access your desk.
            </p>
          </div>

          {/* Role Toggle (Clean Segmented Control) */}
          <div style={{ marginBottom: 28 }}>
            <div className="seg seg-block" style={{ background: 'var(--line-2)', padding: 3, borderRadius: 'var(--radius)' }}>
              <button
                type="button"
                className={role === 'admin' ? 'on' : ''}
                onClick={() => handleRoleChange('admin')}
                style={{ flex: 1, padding: '8px 12px', fontSize: 13, cursor: 'pointer', textAlign: 'center' }}
              >
                Owner / Admin
              </button>
              <button
                type="button"
                className={role === 'agent' ? 'on' : ''}
                onClick={() => handleRoleChange('agent')}
                style={{ flex: 1, padding: '8px 12px', fontSize: 13, cursor: 'pointer', textAlign: 'center' }}
              >
                Sales Agent
              </button>
            </div>
          </div>

          {/* AUTHENTICATION FORM CARD */}
          <div style={{
            background: 'var(--card)',
            border: '1px solid var(--line)',
            borderRadius: 'var(--radius-lg)',
            padding: '28px 24px',
            boxShadow: 'var(--shadow)'
          }}>
            {phase === 'phone' ? (
              /* PHASE 1: MOBILE NUMBER INPUT */
              <form onSubmit={handleSendOtp}>
                <div className="field" style={{ marginBottom: 24 }}>
                  <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink-2)', marginBottom: 8, display: 'block', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                    Mobile Number
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
                </div>

                <Button
                  variant="primary"
                  block
                  type="submit"
                  disabled={loading}
                  style={{ height: 44, fontSize: 14.5, cursor: loading ? 'wait' : 'pointer', fontWeight: 600 }}
                >
                  {loading ? (
                    <>
                      <span style={{ display: 'inline-block', width: 14, height: 14, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                      <span>Sending code...</span>
                    </>
                  ) : (
                    <>
                      <span>Continue</span>
                      <Icon name="arrowRight" size={16} />
                    </>
                  )}
                </Button>
              </form>
            ) : (
              /* PHASE 2: INTERACTIVE OTP INPUT */
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 20 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>
                    Enter 4-digit code
                  </div>
                  <button
                    type="button"
                    onClick={() => setPhase('phone')}
                    className="btn-quiet"
                    style={{ fontSize: 12, padding: 0, color: 'var(--accent)', fontWeight: 600 }}
                  >
                    Change number
                  </button>
                </div>

                {/* 4-Box OTP Input */}
                <div
                  onPaste={handleOtpPaste}
                  style={{ display: 'flex', gap: 10, justifyContent: 'space-between', marginBottom: 22 }}
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
                        width: '100%',
                        height: 56,
                        border: `1.5px solid ${digit ? 'var(--accent)' : 'var(--line)'}`,
                        borderRadius: 'var(--radius)',
                        textAlign: 'center',
                        fontFamily: 'var(--disp)',
                        fontWeight: 700,
                        fontSize: 22,
                        color: 'var(--ink)',
                        background: digit ? 'var(--accent-wash)' : 'var(--card)',
                        outline: 'none',
                        transition: 'all 0.15s ease'
                      }}
                    />
                  ))}
                </div>

                {/* Continue Button */}
                <Button
                  variant="primary"
                  block
                  onClick={() => handleVerify()}
                  disabled={verifying || otp.some(d => d === '')}
                  style={{ height: 44, fontSize: 14.5, cursor: verifying ? 'wait' : 'pointer', fontWeight: 600, marginBottom: 16 }}
                >
                  {verifying ? (
                    <>
                      <span style={{ display: 'inline-block', width: 14, height: 14, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                      <span>Verifying...</span>
                    </>
                  ) : (
                    <>
                      <span>Verify & Sign In</span>
                      <Icon name="check" size={16} />
                    </>
                  )}
                </Button>

                {/* Demo Auto-fill & Resend Options */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 12, color: 'var(--muted)' }}>
                  <button
                    type="button"
                    onClick={handleAutoFill}
                    className="btn-quiet"
                    style={{ fontSize: 12, padding: 0, color: 'var(--ink-2)' }}
                  >
                    Use demo code <strong className="mono-num" style={{ color: 'var(--ink)' }}>4217</strong>
                  </button>

                  {timer > 0 ? (
                    <span className="mono-num">00:{timer < 10 ? `0${timer}` : timer}</span>
                  ) : (
                    <button
                      type="button"
                      onClick={handleResend}
                      className="btn-quiet"
                      style={{ fontSize: 12, padding: 0, color: 'var(--accent)', fontWeight: 600 }}
                    >
                      Resend SMS
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Minimal Support Help */}
          <div style={{ textAlign: 'center', marginTop: 28, fontSize: 12, color: 'var(--muted)' }}>
            Need access? Contact your firm&apos;s administration desk.
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
        }
      `}</style>
    </div>
  )
}
