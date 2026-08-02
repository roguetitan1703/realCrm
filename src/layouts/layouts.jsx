import { useState, useRef } from 'react'
import { Sidebar, TopBar, TabBar, MobileTopBar } from '../components/chrome.jsx'

// ---- desktop app shell: sidebar | (topbar / body) ----
export function AppShell({ nav, active, activeSub, onNav, footer, topbar, children, firmName, logoUrl, sub }) {
  return (
    <div className="app-desktop">
      <Sidebar items={nav} active={active} activeSub={activeSub} onNav={onNav} footer={footer} firmName={firmName} logoUrl={logoUrl} sub={sub} />
      <div className="app-main">
        {topbar}
        <div className="app-body">{children}</div>
      </div>
    </div>
  )
}

// ---- list layout: toolbar pinned, content scrolls ----
export function ListLayout({ toolbar, children }) {
  return (
    <div className="list-layout">
      <div className="ll-toolbar">{toolbar}</div>
      <div className="ll-content">{children}</div>
    </div>
  )
}

// ---- detail layout: main column + docked action rail ----
export function DetailLayout({ children, rail }) {
  return (
    <div className="detail-layout">
      <div className="dl-main">{children}</div>
      {rail}
    </div>
  )
}

// ---- mobile shell: sticky top, scrolling body, sticky tab bar ----
// `framed` wraps it in a phone device frame (for viewing on desktop).
export function MobileShell({ top, children, tabs, fab, actionBar, framed, modals }) {
  const [pulling, setPulling] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const startY = useRef(0)
  const bodyRef = useRef(null)

  const handleTouchStart = (e) => {
    if (bodyRef.current && bodyRef.current.scrollTop <= 0) {
      startY.current = e.touches[0].clientY
    } else {
      startY.current = 0
    }
  }

  const handleTouchMove = (e) => {
    if (!startY.current) return
    const diff = e.touches[0].clientY - startY.current
    if (diff > 65 && bodyRef.current && bodyRef.current.scrollTop <= 0) {
      setPulling(true)
    } else if (diff < 20) {
      setPulling(false)
    }
  }

  const handleTouchEnd = () => {
    if (pulling) {
      setPulling(false)
      setRefreshing(true)
      setTimeout(() => {
        window.location.reload()
      }, 200)
    }
    startY.current = 0
  }

  const shell = (
    <div className="app-mobile" style={{ position: 'relative' }}>
      {top}
      {(pulling || refreshing) && (
        <div style={{ position: 'absolute', top: 58, left: 0, right: 0, zIndex: 99, display: 'flex', justifyContent: 'center', pointerEvents: 'none' }}>
          <div style={{ background: 'var(--card, #fff)', color: 'var(--accent, #1E6F52)', padding: '6px 16px', borderRadius: 999, fontSize: 12, fontWeight: 700, boxShadow: '0 4px 16px rgba(0,0,0,0.2)', border: '1px solid var(--line)' }}>
            {refreshing ? '🔄 Refreshing CRM…' : '↓ Release to refresh'}
          </div>
        </div>
      )}
      <div className="m-body" ref={bodyRef} onTouchStart={handleTouchStart} onTouchMove={handleTouchMove} onTouchEnd={handleTouchEnd}>
        {children}
      </div>
      {fab}
      {actionBar}
      {tabs && <TabBar {...tabs} />}
      {modals}
    </div>
  )
  if (!framed) return shell
  return <div className="m-frame-bg"><div className="m-frame">{shell}</div></div>
}

export { TopBar, TabBar, MobileTopBar }
