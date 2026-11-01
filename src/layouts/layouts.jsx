import { useState, useRef, useEffect } from 'react'
import { Sidebar, TopBar, TabBar, MobileTopBar } from '../components/chrome.jsx'
import Icon from '../components/Icon.jsx'

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

// ---- pull down to refresh ----
// One implementation for every phone screen: the body is the one scroller, so a
// pull that starts at its very top and is dragged down past THRESHOLD calls
// `onRefresh` (which re-reads through the same hooks every list already uses).
const PULL_THRESHOLD = 64
function usePullToRefresh(onRefresh) {
  const [pull, setPull] = useState(0)          // px the indicator is dragged
  const [busy, setBusy] = useState(false)
  const bodyRef = useRef(null)
  const refreshRef = useRef(onRefresh)
  refreshRef.current = onRefresh

  // Native listeners: React's touchmove is passive, and a pull has to cancel the
  // browser's own scroll/overscroll or the gesture is cut short after a few px.
  useEffect(() => {
    const el = bodyRef.current
    if (!el) return
    let startY = null, dist = 0, busyNow = false
    const reset = () => { startY = null; dist = 0; setPull(0) }
    const onStart = (e) => {
      startY = (el.scrollTop <= 0 && !busyNow && e.touches.length === 1) ? e.touches[0].clientY : null
      dist = 0
    }
    const onMove = (e) => {
      if (startY == null) return
      const dy = e.touches[0].clientY - startY
      if (dy <= 0 || el.scrollTop > 0) { if (dist) reset(); else startY = null; return }
      if (e.cancelable) e.preventDefault()
      dist = Math.min(dy * 0.5, PULL_THRESHOLD + 24)
      setPull(dist)
    }
    const onEnd = async () => {
      const armed = startY != null && dist >= PULL_THRESHOLD
      if (!armed) { reset(); return }
      startY = null; busyNow = true; setBusy(true); setPull(PULL_THRESHOLD * 0.6)
      try { await refreshRef.current?.() } finally { busyNow = false; setBusy(false); dist = 0; setPull(0) }
    }
    el.addEventListener('touchstart', onStart, { passive: true })
    el.addEventListener('touchmove', onMove, { passive: false })
    el.addEventListener('touchend', onEnd)
    el.addEventListener('touchcancel', reset)
    return () => {
      el.removeEventListener('touchstart', onStart); el.removeEventListener('touchmove', onMove)
      el.removeEventListener('touchend', onEnd); el.removeEventListener('touchcancel', reset)
    }
  }, [])

  const indicator = (pull > 0 || busy) ? (
    <div className="m-ptr" style={{ height: pull }} role={busy ? 'status' : undefined}>
      <span className={'m-ptr-spin' + (busy || pull >= PULL_THRESHOLD ? ' on' : '')} />
    </div>
  ) : null
  return { bodyRef, indicator }
}

// ---- mobile shell: sticky top, scrolling body, sticky tab bar ----
// `framed` wraps it in a phone device frame (for viewing on desktop).
export function MobileShell({ top, children, tabs, fab, actionBar, framed, modals, onRefresh }) {
  const ptr = usePullToRefresh(onRefresh)
  const shell = (
    <div className="app-mobile">
      {top}
      <div className="m-body" ref={ptr.bodyRef}>{onRefresh && ptr.indicator}{children}</div>
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
