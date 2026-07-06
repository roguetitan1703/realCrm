import Icon from '../../components/Icon.jsx'
import { theme } from '../../data/theme.js'

export default function MobileMe({ store, me }) {
  const mine = store.state.leads.filter(l => l.agentId === me.id)
  const stat = (n, l) => <div className="m-kpi"><div className="v">{n}</div><div className="l">{l}</div></div>

  return (
    <>
      <div className="m-detail-band" style={{ display: 'flex', alignItems: 'center', gap: 13 }}>
        <span className={'av av-lg ' + me.avatar}>{me.initials}</span>
        <div>
          <div style={{ fontFamily: 'var(--disp)', fontWeight: 600, fontSize: 17 }}>{me.name}</div>
          <div className="u-muted" style={{ fontSize: 12.5 }}>Field agent · {theme.brand.firmName}</div>
        </div>
      </div>
      <div className="m-kpi-row">
        {stat(mine.length, 'Assigned')}
        {stat(mine.filter(l => l.stage === 'Site Visit' || l.stage === 'Closed Won').length, 'Visits')}
        {stat(mine.filter(l => l.stage === 'Closed Won').length, 'Closed')}
      </div>
      <div className="m-sec-h">Account</div>
      <button className="m-card" onClick={() => store.setRole('admin')}>
        <span className="av av-md" style={{ background: 'var(--chrome)' }}><Icon name="switch" size={16} /></span>
        <div className="m-c-main">
          <div className="m-c-name">Switch to desktop</div>
          <div className="m-c-sub">Full admin workspace</div>
        </div>
        <Icon name="chevRight" size={18} style={{ color: 'var(--faint)' }} />
      </button>
      <button className="m-card" onClick={() => store.toast('Signed out (demo)')}>
        <span className="av av-md" style={{ background: 'var(--card-2)', color: 'var(--muted)', border: '1px solid var(--line)' }}><Icon name="x" size={16} /></span>
        <div className="m-c-main"><div className="m-c-name">Sign out</div></div>
      </button>
    </>
  )
}
