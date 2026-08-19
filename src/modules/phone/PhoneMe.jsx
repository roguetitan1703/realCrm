import { useState, useEffect } from 'react'
import { Avatar, Button, Textarea } from '../../components/primitives.jsx'
import { pushStatus, enablePush as subscribeToPush } from '../../lib/push.js'
import { canInstall, onInstallAvailable, promptInstall, installEnv, isStandalone } from '../../lib/pwa.js'
import InstallGuide from '../../components/InstallGuide.jsx'
import Icon from '../../components/Icon.jsx'

const ROLE_LABEL = { admin: 'Owner · Admin', manager: 'Manager', agent: 'Field agent' }

export default function PhoneMe({ store, me, topBar }) {
  const { state } = store
  const isAdmin = state.role === 'admin' || state.role === 'owner'
  // NOT `Notification.permission`. That is one answer for the whole ORIGIN, so
  // a phone signed into four workspaces read "Active on this device" on all
  // four the moment any one of them was granted — including the three that had
  // no subscription and could not receive a thing. pushStatus() asks whether
  // THIS workspace's worker holds a subscription. See src/lib/push.js.
  const [push, setPush] = useState({ permission: 'default', subscribed: false, ok: false })
  useEffect(() => { pushStatus().then(setPush) }, [])
  const [installable, setInstallable] = useState(canInstall())
  const [guide, setGuide] = useState(false)
  const [intro, setIntro] = useState(() => state.settings?.whatsappIntroTemplate || '')

  useEffect(() => onInstallAvailable(setInstallable), [])

  // enablePush() is the one that actually asks the browser and registers the
  // subscription. pushPermission() only READS Notification.permission and takes
  // no argument, so `pushPermission(true)` was a no-op — the Enable button
  // rendered, was tappable, and did nothing at all.
  const requestPush = async () => {
    const res = await subscribeToPush()
    setPush(await pushStatus())
    if (!res.ok) {
      store.toast(res.reason === 'denied'
        ? 'Alerts are blocked for this site in your browser settings'
        : 'Could not turn on alerts on this device', 'warn')
    }
  }

  // patchSettings, not updateSettings — the store has no `updateSettings`, so
  // the optional call `store.updateSettings?.(...)` silently swallowed every
  // edit to this template and the text reverted on the next render.
  //
  // Committed on blur, not on change: saving per keystroke meant one API write
  // and one toast per character typed.
  const commitIntro = () => {
    const val = intro.trim()
    if (val === (state.settings?.whatsappIntroTemplate || '')) return
    store.patchSettings({ whatsappIntroTemplate: val }, 'Intro message saved')
  }

  const insertToken = (t) => setIntro(prev => (prev ? prev + ' ' : '') + t)

  return (
    <>
      {topBar({ title: 'Profile & Settings' })}
      <div className="q-wrap" style={{ padding: '14px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        
        {/* User & Profile Header Card */}
        <div style={{ background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 14, padding: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
            <Avatar agent={me} size="lg" empty={!me} />
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: 16, color: 'var(--ink)' }}>{me?.name || state.settings?.firmName || 'User Profile'}</div>
              <div style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: 2 }}>
                {ROLE_LABEL[state.role] || 'Field agent'}
                {me?.phone ? ` · ${me.phone}` : ''}
              </div>
            </div>
          </div>
          <button
            type="button"
            className="btn btn-quiet"
            style={{ fontSize: 12.5, color: 'var(--alert)', display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', borderRadius: 8 }}
            onClick={() => store.logout()}
          >
            <Icon name="x" size={14} /> Sign out
          </button>
        </div>

        {/* Unified App & Notifications Card */}
        <div style={{ background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 14, padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--ink)' }}>App & Push Alerts</div>
          
          {/* Notifications Status / Action */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, background: 'var(--card-2)', padding: 12, borderRadius: 10, border: '1px solid var(--line)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13 }}>
              <Icon name="bell" size={16} style={{ color: push.ok ? 'var(--accent)' : 'var(--muted)' }} />
              <div>
                <div style={{ fontWeight: 600 }}>Push Notifications</div>
                <div style={{ fontSize: 11.5, color: 'var(--muted)' }}>
                  {push.ok ? 'Active on this device'
                    : push.permission === 'denied' ? 'Blocked in browser settings'
                    : push.permission === 'unsupported' ? 'Not supported on this device'
                    : 'Off for this workspace'}
                </div>
              </div>
            </div>
            {!push.ok && push.permission !== 'denied' && push.permission !== 'unsupported' && (
              <Button variant="primary" size="sm" onClick={requestPush}>Enable</Button>
            )}
            {push.ok && (
              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent)', background: 'var(--accent-wash)', padding: '3px 8px', borderRadius: 6 }}>Active</span>
            )}
          </div>

          {/* Installation Status / Action */}
          {!isStandalone() && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, background: 'var(--card-2)', padding: 12, borderRadius: 10, border: '1px solid var(--line)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13 }}>
                <Icon name="plus" size={16} style={{ color: 'var(--accent)' }} />
                <div>
                  <div style={{ fontWeight: 600 }}>App Installation</div>
                  <div style={{ fontSize: 11.5, color: 'var(--muted)' }}>
                    {installEnv().ios
                      ? (installEnv().canAddToHome ? 'Add to Home Screen' : 'Open in Safari to install')
                      : installable ? 'Install standalone app window' : 'Use browser menu to install'}
                  </div>
                </div>
              </div>
              {installEnv().ios
                ? <Button variant="primary" size="sm" onClick={() => setGuide(true)}>Install</Button>
                : installable && <Button variant="primary" size="sm" onClick={promptInstall}>Install</Button>}
            </div>
          )}
          {guide && <InstallGuide onClose={() => setGuide(false)} />}
        </div>

        {/* Single WhatsApp Intro Message Template Card */}
        {isAdmin ? (
          <div style={{ background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 14, padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--ink)' }}>WhatsApp Intro Message</div>
              <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>Sent when introducing your firm to a new lead.</div>
            </div>

            <Textarea
              value={intro}
              onChange={e => setIntro(e.target.value)}
              onBlur={commitIntro}
              placeholder="Hello {name}, I received your inquiry for a {requirement} in {locality} via {source}. I am reaching out from {firmName}. When would be a convenient time to connect?"
              rows={4}
              style={{ fontSize: 13, lineHeight: 1.5, borderRadius: 10 }}
            />

            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {['{name}', '{requirement}', '{locality}', '{source}', '{firmName}'].map(chip => (
                <button
                  key={chip}
                  type="button"
                  className="qchip"
                  style={{ fontSize: 11, padding: '3px 8px' }}
                  onClick={() => insertToken(chip)}
                >
                  + {chip}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div style={{ background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 14, padding: 16 }}>
            <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--ink)' }}>WhatsApp Intro Message</div>
            <div style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: 4, lineHeight: 1.4 }}>
              "{intro || 'Hello {name}, I received your inquiry for a {requirement} in {locality} via {source}. I am reaching out from {firmName}. When would be a convenient time to connect?'}"
            </div>
            <div style={{ fontSize: 11, color: 'var(--faint)', marginTop: 8 }}>Managed by workspace admins.</div>
          </div>
        )}

      </div>
    </>
  )
}
