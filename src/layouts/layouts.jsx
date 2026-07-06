// Layout primitives. Screens compose through these and hold NO layout styling.
import { Sidebar, TopBar, TabBar, MobileTopBar } from '../components/chrome.jsx'

// ---- desktop app shell: sidebar | (topbar / body) ----
export function AppShell({ nav, active, onNav, footer, topbar, children }) {
  return (
    <div className="app-desktop">
      <Sidebar items={nav} active={active} onNav={onNav} footer={footer} />
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
  const shell = (
    <div className="app-mobile" style={{ position: 'relative' }}>
      {top}
      <div className="m-body">{children}</div>
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
