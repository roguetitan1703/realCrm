import { useState } from 'react'
import { theme } from '../data/theme.js'
import { Button } from '../components/primitives.jsx'

export default function Login({ store }) {
  const [phase, setPhase] = useState('phone')
  const [phone, setPhone] = useState('')
  const cont = () => (phase === 'phone' ? setPhase('otp') : store.login())

  return (
    <div style={{ minHeight: '100dvh', background: 'var(--chrome)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, position: 'relative', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', fontFamily: 'var(--disp)', fontWeight: 700, fontSize: 480, color: 'rgba(30,111,82,.07)', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', lineHeight: 1, pointerEvents: 'none' }}>{theme.brand.initials}</div>
      <div style={{ position: 'relative', width: 380, maxWidth: '100%' }}>
        <div style={{ textAlign: 'center', marginBottom: 22 }}>
          <div style={{ width: 72, height: 72, margin: '0 auto 16px', borderRadius: 12, background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--disp)', fontWeight: 700, fontSize: 28, color: '#fff' }}>{theme.brand.initials}</div>
          <div style={{ fontFamily: 'var(--disp)', fontWeight: 600, fontSize: 24, color: '#fff' }}>{theme.brand.firmName}</div>
          <div style={{ fontSize: 13, color: 'var(--on-chrome-mut)', marginTop: 4 }}>{theme.brand.city}</div>
        </div>
        <div style={{ background: 'var(--bg)', borderRadius: 14, padding: '22px 20px', boxShadow: 'var(--shadow-pop)' }}>
          {phase === 'phone' ? (
            <>
              <h3 style={{ fontFamily: 'var(--disp)', fontSize: 17, marginBottom: 4 }}>Sign in to your desk</h3>
              <div className="u-muted" style={{ fontSize: 13, marginBottom: 18 }}>Enter your mobile number to continue.</div>
              <div className="field" style={{ marginBottom: 18 }}>
                <label>Mobile number</label>
                <div className="input-group"><span className="prefix">+91</span>
                  <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="98220 41556" autoFocus />
                </div>
              </div>
            </>
          ) : (
            <>
              <h3 style={{ fontFamily: 'var(--disp)', fontSize: 17, marginBottom: 4 }}>Enter the code</h3>
              <div className="u-muted" style={{ fontSize: 13, marginBottom: 18 }}>We sent a 4-digit code to your number.</div>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginBottom: 14 }}>
                {['4', '2', '1', '7'].map((d, i) => (
                  <div key={i} style={{ width: 52, height: 58, border: `1.5px solid ${i === 0 ? 'var(--accent)' : 'var(--line)'}`, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--disp)', fontWeight: 700, fontSize: 24, background: '#fff' }}>{d}</div>
                ))}
              </div>
              <div className="u-muted" style={{ fontSize: 12, textAlign: 'center', marginBottom: 16 }}>Demo — any code works.</div>
            </>
          )}
          <Button variant="primary" block onClick={cont}>{phase === 'phone' ? 'Continue' : 'Verify & enter'}</Button>
        </div>
        <div style={{ textAlign: 'center', fontSize: 12, color: 'var(--on-chrome-mut)', marginTop: 18 }}>Your firm's own system · {theme.brand.firmName}, {theme.brand.city}</div>
      </div>
    </div>
  )
}
