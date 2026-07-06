/**
 * ============================================================================
 * 🏢 ELEVATED WORKSPACE LOGIN & INTERACTIVE OTP VERIFICATION ENGINE
 * ============================================================================
 * Features:
 * 1. Real URL-based workspace resolution display (Bhumi Propcity Pune SaaS)
 * 2. Interactive Role Selection toggle (Owner Admin vs Field Sales Agent)
 * 3. Animated OTP Phase 1: Phone input with Exotel/WABA dispatch simulation
 * 4. Animated OTP Phase 2: Interactive 4-box OTP input with auto-advance,
 *    paste support, countdown timer, and one-click demo auto-fill!
 * 5. Realistic loading spinners, hover states, and toast notifications!
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

  // Handle Role Toggle
  const handleRoleChange = (newRole) => {
    setRole(newRole)
    store.dispatch({ type: 'ROLE', role: newRole })
    const roleName = newRole === 'admin' ? 'Owner / Tenant Admin' : 'Sales Agent / Field PWA'
    store.toast(`Switched workspace access role to: ${roleName}`, 'ok')
  }

  // Phase 1: Send OTP Simulation
  const handleSendOtp = (e) => {
    if (e) e.preventDefault()
    const targetPhone = phone.trim() || '98220 41556'
    setLoading(true)
    
    // Simulate network delay for Exotel / WhatsApp API bridge
    setTimeout(() => {
      setLoading(false)
      setPhase('otp')
      setTimer(30)
      store.toast(`📲 OTP 4217 dispatched to +91 ${targetPhone} via WhatsApp & SMS!`, 'ok')
      // Focus first OTP input box on next tick
      setTimeout(() => inputRefs[0].current?.focus(), 100)
    }, 1100)
  }

  // Handle OTP Box Typing & Auto-Advance
  const handleOtpChange = (index, val) => {
    const char = val.slice(-1) // Take last character if multiple typed
    if (!/^\d*$/.test(char)) return // Only allow numbers

    const newOtp = [...otp]
    newOtp[index] = char
    setOtp(newOtp)

    // Auto-advance to next box
    if (char && index < 3) {
      inputRefs[index + 1].current?.focus()
    }

    // If all 4 digits filled, auto-trigger verify after brief delay
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

  // Handle Paste OTP
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
    store.toast('⚡ Auto-filled demo verification code: 4217', 'ok')
    handleVerify('4217')
  }

  // Phase 2: Verify & Login
  const handleVerify = (codeToVerify) => {
    const fullCode = typeof codeToVerify === 'string' ? codeToVerify : otp.join('')
    if (fullCode.length < 4) {
      store.toast('⚠️ Please enter the complete 4-digit verification code.', 'warn')
      return
    }

    setVerifying(true)
    setTimeout(() => {
      setVerifying(false)
      const roleName = role === 'admin' ? 'Owner / Tenant Admin' : 'Sales Agent / Field Executive'
      store.toast(`🚀 Welcome to ${theme.brand.firmName}! Signed in as ${roleName}.`, 'ok')
      store.login()
    }, 1000)
  }

  const handleResend = () => {
    setTimer(30)
    store.toast('🔄 Fresh OTP sent to your mobile number via Exotel Voice Bridge.', 'ok')
  }

  return (
    <div style={{
      minHeight: '100dvh',
      background: 'var(--chrome)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 24,
      position: 'relative',
      overflow: 'hidden',
      fontFamily: 'var(--sans)'
    }}>
      {/* Background Brand Watermark */}
      <div style={{
        position: 'absolute',
        fontFamily: 'var(--disp)',
        fontWeight: 800,
        fontSize: 420,
        color: 'rgba(30,111,82,.06)',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        lineHeight: 1,
        pointerEvents: 'none',
        userSelect: 'none',
        letterSpacing: '-0.05em'
      }}>
        {theme.brand.initials}
      </div>

      {/* Floating Toast Stack During Login */}
      <Toasts toasts={state.toasts || []} />

      <div style={{ position: 'relative', width: 440, maxWidth: '100%', zIndex: 10 }}>
        {/* URL Workspace Branding Header */}
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          {/* Active SaaS URL Badge */}
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            background: 'rgba(255, 255, 255, 0.08)',
            border: '1px solid rgba(255, 255, 255, 0.15)',
            padding: '5px 14px',
            borderRadius: 20,
            fontSize: 12,
            color: '#fff',
            marginBottom: 16,
            backdropFilter: 'blur(8px)'
          }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#10B981', boxShadow: '0 0 8px #10B981' }} />
            <span style={{ fontWeight: 600 }}>app.bhumipropcity.com</span>
            <span style={{ color: 'rgba(255,255,255,0.5)' }}>· Pune SaaS</span>
          </div>

          <div style={{
            width: 76,
            height: 76,
            margin: '0 auto 14px',
            borderRadius: 18,
            background: 'linear-gradient(135deg, var(--accent) 0%, #134e3a 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontFamily: 'var(--disp)',
            fontWeight: 800,
            fontSize: 32,
            color: '#fff',
            boxShadow: '0 12px 24px rgba(30, 111, 82, 0.35)',
            border: '1px solid rgba(255,255,255,0.2)'
          }}>
            {theme.brand.initials}
          </div>
          <h1 style={{ fontFamily: 'var(--disp)', fontWeight: 700, fontSize: 26, color: '#fff', margin: '0 0 4px', letterSpacing: '-0.02em' }}>
            {theme.brand.firmName}
          </h1>
          <div style={{ fontSize: 13, color: 'var(--on-chrome-mut)', fontWeight: 500 }}>
            {theme.brand.city} Premium Real Estate Advisory Desk
          </div>
        </div>

        {/* Glassmorphic Login Card */}
        <div style={{
          background: 'var(--bg)',
          borderRadius: 20,
          padding: '28px 26px',
          boxShadow: '0 24px 60px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.1)',
          position: 'relative'
        }}>
          {/* Role Access Selector (RBAC Simulation) */}
          <div style={{ marginBottom: 22, paddingBottom: 18, borderBottom: '1px solid var(--line)' }}>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--muted)', marginBottom: 8, textAlign: 'center' }}>
              Select Workspace Role (RBAC Demo)
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, background: 'var(--bg-subtle)', padding: 4, borderRadius: 12 }}>
              <button
                type="button"
                onClick={() => handleRoleChange('admin')}
                style={{
                  padding: '8px 12px',
                  borderRadius: 9,
                  border: 'none',
                  background: role === 'admin' ? '#fff' : 'transparent',
                  boxShadow: role === 'admin' ? '0 2px 8px rgba(0,0,0,0.08)' : 'none',
                  fontSize: 13,
                  fontWeight: 600,
                  color: role === 'admin' ? 'var(--fg)' : 'var(--muted)',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6
                }}
              >
                <Icon name="settings" size={14} /> Owner / Admin
              </button>
              <button
                type="button"
                onClick={() => handleRoleChange('agent')}
                style={{
                  padding: '8px 12px',
                  borderRadius: 9,
                  border: 'none',
                  background: role === 'agent' ? '#fff' : 'transparent',
                  boxShadow: role === 'agent' ? '0 2px 8px rgba(0,0,0,0.08)' : 'none',
                  fontSize: 13,
                  fontWeight: 600,
                  color: role === 'agent' ? 'var(--fg)' : 'var(--muted)',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6
                }}
              >
                <Icon name="person" size={14} /> Sales Agent
              </button>
            </div>
          </div>

          {phase === 'phone' ? (
            /* PHASE 1: PHONE NUMBER INPUT */
            <form onSubmit={handleSendOtp}>
              <div style={{ marginBottom: 20 }}>
                <h3 style={{ fontFamily: 'var(--disp)', fontSize: 18, fontWeight: 700, color: 'var(--fg)', margin: '0 0 6px' }}>
                  Sign in to your desk
                </h3>
                <p style={{ fontSize: 13, color: 'var(--muted)', margin: 0, lineHeight: 1.5 }}>
                  Enter your mobile number to receive a secure WhatsApp WABA & SMS verification code.
                </p>
              </div>

              <div className="field" style={{ marginBottom: 22 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--fg)', marginBottom: 6, display: 'block' }}>
                  Indian Mobile Number
                </label>
                <div className="input-group" style={{ display: 'flex', alignItems: 'center', border: '1.5px solid var(--line)', borderRadius: 10, overflow: 'hidden', background: '#fff', transition: 'border-color 0.2s' }}>
                  <span className="prefix" style={{ padding: '10px 14px', background: 'var(--bg-subtle)', borderRight: '1px solid var(--line)', fontWeight: 600, fontSize: 14, color: 'var(--fg)' }}>
                    +91
                  </span>
                  <input
                    type="tel"
                    value={phone}
                    onChange={e => setPhone(e.target.value)}
                    placeholder="98220 41556"
                    autoFocus
                    disabled={loading}
                    style={{ flex: 1, border: 'none', padding: '10px 14px', fontSize: 15, outline: 'none', fontFamily: 'var(--mono)', fontWeight: 500 }}
                  />
                </div>
              </div>

              <Button
                variant="primary"
                block
                type="submit"
                disabled={loading}
                style={{
                  height: 44,
                  fontSize: 15,
                  fontWeight: 600,
                  borderRadius: 10,
                  background: loading ? '#0e4632' : 'var(--accent)',
                  color: '#fff',
                  border: 'none',
                  cursor: loading ? 'wait' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  boxShadow: '0 4px 12px rgba(30,111,82,0.25)',
                  transition: 'all 0.2s ease'
                }}
              >
                {loading ? (
                  <>
                    <span style={{ display: 'inline-block', width: 16, height: 16, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                    Dispatching via Exotel / WABA...
                  </>
                ) : (
                  <>
                    <span>Send Verification Code</span>
                    <Icon name="arrowRight" size={16} />
                  </>
                )}
              </Button>
            </form>
          ) : (
            /* PHASE 2: INTERACTIVE OTP INPUT */
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 18 }}>
                <div>
                  <h3 style={{ fontFamily: 'var(--disp)', fontSize: 18, fontWeight: 700, color: 'var(--fg)', margin: '0 0 4px' }}>
                    Verify Verification Code
                  </h3>
                  <p style={{ fontSize: 13, color: 'var(--muted)', margin: 0 }}>
                    Sent to <strong style={{ color: 'var(--fg)' }}>+91 {phone || '98220 41556'}</strong>
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setPhase('phone')}
                  style={{ background: 'none', border: 'none', color: 'var(--accent)', fontSize: 12, fontWeight: 600, cursor: 'pointer', padding: '4px 8px', borderRadius: 6 }}
                >
                  Change Number
                </button>
              </div>

              {/* Interactive 4-Box OTP Input */}
              <div
                onPaste={handleOtpPaste}
                style={{ display: 'flex', gap: 12, justifyContent: 'center', marginBottom: 20 }}
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
                    style={{
                      width: 60,
                      height: 64,
                      border: `2px solid ${digit ? 'var(--accent)' : 'var(--line)'}`,
                      borderRadius: 12,
                      textAlign: 'center',
                      fontFamily: 'var(--disp)',
                      fontWeight: 700,
                      fontSize: 26,
                      color: 'var(--fg)',
                      background: digit ? 'rgba(30,111,82,0.04)' : '#fff',
                      outline: 'none',
                      transition: 'all 0.15s ease',
                      boxShadow: digit ? '0 0 0 4px rgba(30,111,82,0.1)' : 'none'
                    }}
                  />
                ))}
              </div>

              {/* Quick Auto-Fill Demo Pill */}
              <div style={{ textAlign: 'center', marginBottom: 20 }}>
                <button
                  type="button"
                  onClick={handleAutoFill}
                  disabled={verifying}
                  style={{
                    background: 'var(--bg-subtle)',
                    border: '1px dashed var(--accent)',
                    padding: '6px 14px',
                    borderRadius: 20,
                    fontSize: 12,
                    fontWeight: 600,
                    color: 'var(--accent)',
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    transition: 'all 0.2s ease'
                  }}
                >
                  <span>⚡ Click to auto-fill Demo OTP</span>
                  <strong style={{ background: 'var(--accent)', color: '#fff', padding: '1px 6px', borderRadius: 8, fontSize: 11 }}>4217</strong>
                </button>
              </div>

              {/* Verify Button */}
              <Button
                variant="primary"
                block
                onClick={() => handleVerify()}
                disabled={verifying || otp.some(d => d === '')}
                style={{
                  height: 44,
                  fontSize: 15,
                  fontWeight: 600,
                  borderRadius: 10,
                  background: verifying ? '#0e4632' : 'var(--accent)',
                  color: '#fff',
                  border: 'none',
                  cursor: verifying ? 'wait' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  boxShadow: '0 4px 12px rgba(30,111,82,0.25)',
                  marginBottom: 16
                }}
              >
                {verifying ? (
                  <>
                    <span style={{ display: 'inline-block', width: 16, height: 16, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                    Verifying Workspace & RBAC...
                  </>
                ) : (
                  <>
                    <span>Verify & Enter Workspace</span>
                    <Icon name="check" size={16} />
                  </>
                )}
              </Button>

              {/* Countdown Timer & Voice Call Option */}
              <div style={{ textAlign: 'center', fontSize: 13, color: 'var(--muted)' }}>
                {timer > 0 ? (
                  <span>Resend code in <strong style={{ color: 'var(--fg)', fontFamily: 'var(--mono)' }}>00:{timer < 10 ? `0${timer}` : timer}s</strong></span>
                ) : (
                  <div style={{ display: 'flex', justifyContent: 'center', gap: 16 }}>
                    <button type="button" onClick={handleResend} style={{ background: 'none', border: 'none', color: 'var(--accent)', fontWeight: 600, cursor: 'pointer', fontSize: 13 }}>
                      🔄 Resend SMS
                    </button>
                    <span>·</span>
                    <button type="button" onClick={handleResend} style={{ background: 'none', border: 'none', color: 'var(--accent)', fontWeight: 600, cursor: 'pointer', fontSize: 13 }}>
                      📞 Get Voice Call OTP
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Security & Footer Info */}
        <div style={{ textAlign: 'center', marginTop: 22, color: 'var(--on-chrome-mut)', fontSize: 12, lineHeight: 1.6 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, marginBottom: 4 }}>
            <Icon name="shield" size={13} style={{ color: '#10B981' }} />
            <span style={{ fontWeight: 600, color: '#fff' }}>Protected by 256-bit Row-Level Security</span>
          </div>
          <div>Your firm&apos;s own private cloud · {theme.brand.firmName}, {theme.brand.city}</div>
        </div>
      </div>

      {/* Global Spinner Animation CSS */}
      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  )
}
