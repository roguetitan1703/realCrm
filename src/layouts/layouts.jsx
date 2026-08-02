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
export function MobileShell({ top, children, tabs, fab, actionBar, framed, modals, onRefresh }) {
  const [pullDist, setPullDist] = useState(0)
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
    if (!startY.current || refreshing) return
    const diff = e.touches[0].clientY - startY.current
    if (diff > 0 && bodyRef.current && bodyRef.current.scrollTop <= 0) {
      setPullDist(Math.min(diff * 0.45, 65))
    } else {
      setPullDist(0)
    }
  }

  const handleTouchEnd = async () => {
    if (pullDist >= 45 && !refreshing) {
      setRefreshing(true)
      setPullDist(55)
      try {
        if (onRefresh) await Promise.resolve(onRefresh())
      } catch (e) {}
      setTimeout(() => {
        setRefreshing(false)
        setPullDist(0)
      }, 500)
    } else {
      setPullDist(0)
    }
    startY.current = 0
  }

  const activeDist = refreshing ? 55 : pullDist
  const progress = Math.min(pullDist / 45, 1)

  const shell = (
    <div className="app-mobile" style={{ position: 'relative' }}>
      {top}
      {activeDist > 0 && (
        <div style={{
          position: 'absolute',
          top: 54,
          left: '50%',
          transform: `translateX(-50%) translateY(${Math.min(activeDist - 36, 20)}px)`,
          zIndex: 99,
          width: 36,
          height: 36,
          borderRadius: '50%',
          background: 'var(--card, #ffffff)',
          boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
          border: '1px solid var(--line, #e5e3dd)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          pointerEvents: 'none'
        }}>
          <svg
            width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--accent, #1E6F52)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
            style={{
              transform: refreshing ? 'rotate(0deg)' : `rotate(${progress * 270}deg)`,
              animation: refreshing ? 'spin 0.8s linear infinite' : 'none'
            }}
          >
            <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2" />
          </svg>
        </div>
      )}
      <div
        className="m-body"
        ref={bodyRef}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        style={{
          transform: activeDist > 0 ? `translateY(${activeDist * 0.35}px)` : 'none',
          transition: (refreshing || pullDist === 0) ? 'transform 0.25s cubic-bezier(0.2, 0.8, 0.2, 1)' : 'none'
        }}
      >
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
