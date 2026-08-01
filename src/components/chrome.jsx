// App chrome: Sidebar nav, TopBar, mobile TabBar, Toasts, WhatsApp bubble.
import { useState, useEffect, useRef } from 'react'
import Icon from './Icon.jsx'
import { theme } from '../data/theme.js'
import { Avatar } from './primitives.jsx'
import { subscribeConnection } from '../lib/api.js'
import { subscribeOutbox } from '../lib/outbox.js'

// Initials from whatever firm name we actually have. Never a bundled default:
// two wrong letters in the corner of every screen is still the wrong firm.
const brandInitials = (n) => String(n || '').trim().split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase()

// ---- desktop sidebar ----
export function Sidebar({ items, active, activeSub, onNav, footer, firmName, logoUrl, sub }) {
  const name = firmName || ''
  const initials = String(name).trim().split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase()
  return (
    <nav className="nav">
      <div className="n-brand">
        <div className={'n-mono' + (logoUrl ? ' has-logo' : '')}>{logoUrl ? <img src={logoUrl} alt="" /> : initials}</div>
        <div><div className="n-fn">{name}</div>{sub ? <div className="n-sub">{sub}</div> : null}</div>
      </div>
      <div className="n-list">
        {items.map(it => it.section
          ? <div key={it.section} className="n-sec">{it.section}</div>
          : (
            <div key={it.key}>
              <a className={active === it.key ? 'on' : ''} onClick={() => onNav(it.key)}>
                <Icon name={it.icon} />{it.label}
                {it.badge != null && <span className="n-badge">{it.badge}</span>}
              </a>
              {/* A section that holds two stores (Contacts → Clients | Owners)
                  discloses them here rather than stacking a second pill row on
                  top of the page's own role pills. Only shown while the section
                  is open, so the nav stays short for everyone else. */}
              {it.children && active === it.key && (
                <div className="n-sub-list">
                  {it.children.map(c => (
                    <a key={c.sub} className={'n-sub-item' + (activeSub === c.sub ? ' on' : '')}
                      onClick={() => onNav(it.key, { [it.subKey]: c.sub })}>
                      {c.label}
                      {c.count != null && <span className="n-sub-count">{c.count}</span>}
                    </a>
                  ))}
                </div>
              )}
            </div>
          ))}
      </div>
      {footer && (
        <div className="n-foot">
          <Avatar agent={footer.agent} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="nf-name">{footer.name}</div>
            <div className="n-sub">{footer.role}</div>
          </div>
          {footer.onSwitch && (
            <button className="btn btn-icon" style={{ background: 'rgba(255,255,255,.07)', borderColor: 'rgba(255,255,255,.14)', color: '#fff' }}
              title="Switch to agent app" onClick={footer.onSwitch}><Icon name="switch" /></button>
          )}
        </div>
      )}
      <div className="n-poweredby">
        <img src="/brand-mark.svg" width={14} height={14} alt="" />
        <span>Powered by <strong>Delpat</strong></span>
      </div>
    </nav>
  )
}

// ---- desktop top bar ----
// Left: back?+eyebrow/title. Center: global search. Right: bell + profile menu.
// Module CTAs live in the toolbar now, NOT here. `actions` still render (detail
// quick actions like Status/WhatsApp) just left of the bell.
export function TopBar({ title, eyebrow, onBack, onSearch, onBell, unread, actions, profile }) {
  return (
    <div className="topbar">
      {onBack && (
        <button className="tb-back" onClick={onBack} title="Back"><Icon name="chevLeft" size={18} /></button>
      )}
      <div className="tb-titles">
        {eyebrow && <div className="tb-eyebrow">{eyebrow}</div>}
        {onBack ? <div className="tb-h">{title}</div> : <h1>{title}</h1>}
      </div>

      {/* centered global search */}
      <div className="u-spring" />
      {onSearch && (
        <div className="tb-search" onClick={onSearch}><Icon name="search" size={15} /><span>Search leads, properties, clients…</span><kbd>/</kbd></div>
      )}
      <div className="u-spring" />

      {actions}
      <ConnectionBadge />
      {onBell && (
        <button className="bell" onClick={onBell}><Icon name="bell" />{unread ? <span className="bdot">{unread}</span> : null}</button>
      )}
      {profile && <ProfileMenu {...profile} />}
    </div>
  )
}

// Silent while the API is healthy; unmissable the moment it isn't — so a backend
// outage can never quietly pretend to save work (changes would vanish on refresh).
export function ConnectionBadge() {
  const [conn, setConn] = useState({ ok: true, checked: false })
  const [queued, setQueued] = useState(0)
  useEffect(() => subscribeConnection(setConn), [])
  useEffect(() => subscribeOutbox(setQueued), [])
  // A queued write is held work, not saved work. It stays visible until it
  // lands, so "I logged that visit" is never a thing the app quietly lied about.
  if (queued) {
    return (
      <span className="conn-badge queued" title="Logged on this device, waiting for a connection to save.">
        <Icon name="clock" size={13} />{queued} waiting to save
      </span>
    )
  }
  if (conn.ok) return null
  return (
    <span className="conn-badge" title="Changes are not being saved to the server. Reconnect before continuing.">
      <Icon name="zap" size={13} />Offline — not saving
    </span>
  )
}

// Offline-read banner: shown when the app is serving a cached snapshot because
// the server was unreachable at load. Tells the user the data is real but frozen
// as of a point in time, so nothing here masquerades as live.
export function StaleBanner({ asOf }) {
  const when = asOf
    ? new Date(asOf).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    : null
  return (
    <div className="stale-banner" role="status">
      <Icon name="zap" size={13} />
      <span>Offline — showing data{when ? ` as of ${when}` : ' from your last visit'}. Changes won’t save until you reconnect.</span>
    </div>
  )
}

function ProfileMenu({ name, role, agent, items = [] }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  useEffect(() => {
    if (!open) return
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [open])
  return (
    <div className="tb-profile" ref={ref}>
      <button className="tb-prof-btn" onClick={() => setOpen(o => !o)}>
        <Avatar agent={agent} size="sm" />
        <span className="tb-prof-name">{name}</span>
        <Icon name="chevDown" size={15} />
      </button>
      {open && (
        <div className="popover right" style={{ minWidth: 200 }}>
          <div style={{ padding: '9px 11px 8px' }}>
            <div style={{ fontWeight: 600, fontSize: 13.5 }}>{name}</div>
            <div className="u-muted" style={{ fontSize: 11.5 }}>{role}</div>
          </div>
          <div className="p-sep" />
          {items.map((it, i) => (
            <button key={i} className="p-item" onClick={() => { setOpen(false); it.onClick() }}>
              <span className="p-ic"><Icon name={it.icon} size={16} /></span>{it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ---- mobile tab bar ----
export function TabBar({ tabs, active, onNav }) {
  const activeIdx = tabs.findIndex(t => t.key === active)
  const idx = activeIdx >= 0 ? activeIdx : 0
  const count = tabs.length || 1

  return (
    <div className="tabbar">
      <div
        className="tab-slider"
        style={{
          width: `calc((100% - 16px - ${(count - 1) * 4}px) / ${count})`,
          transform: `translateX(calc(${idx} * (100% + 4px)))`,
        }}
      />
      {tabs.map(t => (
        <a key={t.key} className={active === t.key ? 'on' : ''} onClick={() => onNav(t.key)}>
          <span style={{ position: 'relative' }}>
            <Icon name={t.icon} size={22} />
            {t.badge ? <span className="tab-dot">{t.badge}</span> : null}
          </span>
          {t.label}
        </a>
      ))}
    </div>
  )
}

// ---- mobile top bar ----
// title/eyebrow, optional back, optional right slot (avatar / action). This is
// the CRM's phone chrome (agent role) — NOT a separate app.
export function MobileTopBar({ title, sub, onBack, right, brand, firmName, logoUrl }) {
  const displayFirm = firmName || ''
  const initials = displayFirm.split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase() || 'RE'
  return (
    <div className="m-top">
      {onBack ? (
        <button className="m-back" onClick={onBack} aria-label="Back"><Icon name="chevLeft" size={20} /></button>
      ) : (
        <div className={'n-mono' + (logoUrl ? ' has-logo' : '')} style={{ width: 34, height: 34, borderRadius: 9, background: 'var(--accent)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 13, flexShrink: 0, overflow: 'hidden' }}>
          {logoUrl ? <img src={logoUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} /> : initials}
        </div>
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="m-fn" style={{ fontSize: 15, fontWeight: 700, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {title || displayFirm}
        </div>
        {sub ? <div className="m-sub" style={{ fontSize: 11, color: 'var(--on-chrome-mut)' }}>{sub}</div> : (displayFirm && title !== displayFirm ? <div className="m-sub" style={{ fontSize: 11, color: 'var(--on-chrome-mut)' }}>{displayFirm}</div> : null)}
      </div>
      <ConnectionBadge />
      {right}
    </div>
  )
}

// ---- toasts ----
export function Toasts({ toasts }) {
  const [hovered, setHovered] = useState(false)
  if (!toasts || !toasts.length) return null

  const visibleToasts = toasts.slice(-4)
  const total = visibleToasts.length

  return (
    <div
      className="toast-stack"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {visibleToasts.map((t, idx) => {
        const depth = (total - 1) - idx
        const isAlert = t.tone === 'warn' || t.tone === 'err'

        const translateY = hovered ? depth * -56 : depth * -12
        const scale = hovered ? 1 : Math.max(0.85, 1 - depth * 0.04)
        const opacity = depth > 2 && !hovered ? 0 : 1

        return (
          <div
            key={t.id}
            className={`toast-card ${isAlert ? 'toast-alert' : ''}`}
            style={{
              transform: `translateY(${translateY}px) scale(${scale})`,
              opacity,
              zIndex: 100 - depth,
            }}
          >
            <span className={`toast-badge ${isAlert ? 'badge-alert' : 'badge-ok'}`}>
              <Icon name={isAlert ? 'x' : 'check'} size={14} />
            </span>
            <span className="toast-text">{t.text}</span>
          </div>
        )
      })}
    </div>
  )
}

// ---- WhatsApp canvas: a PREVIEW of the filled template ----
// Deliberately no "composing" animation and no delivered-tick: the message is
// assembled from property fields instantly, and nothing has been sent yet.
export function WaCanvas({ message, deva, style }) {
  return (
    <div className="wa-canvas" style={style}>
      {message && (
        <div className={'wa-bubble' + (deva ? ' u-deva' : '')}>
          {message}
          <div className="wa-time">Preview</div>
        </div>
      )}
    </div>
  )
}
