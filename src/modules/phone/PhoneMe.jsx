import { Avatar } from '../../components/primitives.jsx'
import ThisDevice from '../../components/ThisDevice.jsx'
import Icon from '../../components/Icon.jsx'
import MessageTemplates from '../../components/MessageTemplates.jsx'
import { roleLabel } from '../../lib/permissions.js'

export default function PhoneMe({ store, me, topBar }) {
  const { state } = store

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
                {roleLabel(state.role)}
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

        {/* Alerts and install — the same component and the same two rows the
            desk's Settings → This device renders. This screen had its own card
            with its own heading over the same two facts. */}
        <div className="msgt-card">
          <div className="msgt-h">This device</div>
          <ThisDevice store={store} />
        </div>

        {/* The firm's message templates — the SAME component Settings →
            Message templates renders. Two editors over one sentence do not
            stay in agreement; this screen had its own, committing on blur,
            while the desk's committed on a button. */}
        <div className="msgt-wrap">
          <MessageTemplates store={store} />
        </div>

      </div>
    </>
  )
}
