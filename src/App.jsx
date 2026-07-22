import { useState, useEffect } from 'react'
import { useStore } from './lib/store.jsx'
import { AppShell } from './layouts/layouts.jsx'
import { TopBar, Toasts } from './components/chrome.jsx'

import Login from './modules/Login.jsx'
import Onboarding from './modules/Onboarding.jsx'
import Dashboard from './modules/Dashboard.jsx'
import Leads from './modules/Leads.jsx'
import Properties from './modules/Properties.jsx'
import Clients from './modules/Clients.jsx'
import Calendar from './modules/Calendar.jsx'
import Team from './modules/Team.jsx'
import Settings from './modules/Settings.jsx'
import Integrations from './modules/Integrations.jsx'
import Roadmap from './modules/Roadmap.jsx'
import ImportPage from './modules/ImportPage.jsx'
import WaModal from './modules/WaModal.jsx'
import Modals from './modules/Modals.jsx'
import Mobile from './modules/Mobile.jsx'

const NAV = [
  { section: 'Workspace' },
  { key: 'dashboard', label: 'Dashboard', icon: 'grid' },
  { key: 'leads', label: 'Leads', icon: 'leads' },
  { key: 'properties', label: 'Properties', icon: 'building' },
  { key: 'clients', label: 'Contacts', icon: 'people' },
  { key: 'calendar', label: 'Calendar', icon: 'calendar' },
  { section: 'Manage' },
  { key: 'import', label: 'Import', icon: 'layers' },
  { key: 'team', label: 'Team', icon: 'team' },
  { key: 'settings', label: 'Settings', icon: 'settings' },
  { key: 'integrations', label: 'Integrations', icon: 'zap' },
  { section: "What's next" },
  { key: 'roadmap', label: 'Roadmap', icon: 'roadmap' },
]

const SCREENS = {
  dashboard: Dashboard, leads: Leads, properties: Properties, clients: Clients,
  calendar: Calendar, import: ImportPage, team: Team, settings: Settings, integrations: Integrations, roadmap: Roadmap,
}

// Optional deep-link bootstrap for URL parameters (?screen=leads&lead=l2&prop=p7).
// No-op unless params are present; safe to keep in production.
function bootFromUrl() {
  if (typeof window === 'undefined') return null
  const p = new URLSearchParams(window.location.search)
  if (![...p.keys()].length) return null
  return {
    screen: p.get('screen') || 'dashboard',
    sel: {
      leadId: p.get('lead') || undefined, leadOpen: !!p.get('lead'),
      propId: p.get('prop') || undefined, propOpen: !!p.get('prop'),
    },
    forceLogin: p.has('autologin') || p.has('demo'),
    role: p.get('role') || null,
  }
}

function useResponsiveLayout() {
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === 'undefined') return false
    return window.innerWidth < 1024
  })
  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 1024)
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])
  return isMobile
}

export default function App() {
  const store = useStore()
  const { state } = store
  const boot = bootFromUrl()
  const [screen, setScreen] = useState(boot?.screen || 'dashboard')
  const [sel, setSel] = useState(boot?.sel || {})
  const [onboarding, setOnboarding] = useState(false)
  const isResponsiveMobile = useResponsiveLayout() || boot?.role === 'agent'

  if (onboarding) {
    return <Onboarding store={store} onCancel={() => setOnboarding(false)} />
  }

  if (!state.loggedIn && !boot?.forceLogin) {
    return <Login store={store} onStartOnboard={() => setOnboarding(true)} />
  }

  // Responsive layout switching: when viewport < 1024px, render sleek Mobile Layout without phone frame
  if (isResponsiveMobile) {
    return (
      <>
        <Mobile store={store} framed={false} />
        <Toasts toasts={state.toasts} />
      </>
    )
  }

  const leads = state.leads
  const newCount = leads.filter(l => l.stage === 'New').length
  const unread = leads.filter(l => l.overdue).length + leads.filter(l => !l.agentId).length

  // RBAC Navigation filtering: Agent role hides system management & settings
  const allowedKeys = state.role === 'agent' ? ['dashboard', 'leads', 'properties', 'clients', 'calendar'] : null
  const nav = NAV
    .filter(n => !allowedKeys || (n.key && allowedKeys.includes(n.key)) || (n.section && ['Workspace'].includes(n.section)))
    .map(n => (n.key === 'leads' ? { ...n, badge: newCount } : n))

  const go = (key, patch = {}) => {
    setScreen(key)
    setSel(s => ({
      ...s,
      leadOpen: patch.leadOpen !== undefined ? patch.leadOpen : false,
      propOpen: patch.propOpen !== undefined ? patch.propOpen : false,
      ...patch,
    }))
  }

  const handleRoleSwitch = () => {
    const nextRole = state.role === 'admin' ? 'agent' : 'admin'
    store.setRole(nextRole)
    store.toast(`Switched access tier to: ${nextRole === 'admin' ? 'Owner / Admin (Full RBAC)' : 'Sales Agent (Limited RBAC)'}`)
  }

  const footer = {
    agent: store.me(),
    name: store.me().name || 'Rakesh Sethi',
    role: state.role === 'admin' ? 'Owner · Admin' : 'Sales Agent · RBAC',
    onSwitch: handleRoleSwitch,
  }

  const profileItems = []
  if (state.role === 'admin') {
    profileItems.push(
      { icon: 'settings', label: 'Settings', onClick: () => go('settings') },
      { icon: 'plus', label: 'Provision new workspace (Onboard)', onClick: () => setOnboarding(true) },
      { icon: 'team', label: 'Manage team', onClick: () => go('team') },
      { icon: 'zap', label: 'API Integrations & Webhooks', onClick: () => go('integrations') },
      { icon: 'refresh', label: 'Reset database state', onClick: () => { if (window.confirm('Permanent Action: This will wipe and reset all leads, properties, and settings to clean defaults. Continue?')) store.resetDatabase() } },
    )
  }
  profileItems.push(
    { icon: 'switch', label: state.role === 'admin' ? 'Switch access: Sales Agent (Limited RBAC)' : 'Switch access: Owner / Admin (Full RBAC)', onClick: handleRoleSwitch },
    { icon: 'x', label: 'Sign out', onClick: () => store.logout() }
  )

  const profile = {
    agent: store.me(),
    name: store.me().name || 'Rakesh Sethi',
    role: state.role === 'admin' ? 'Owner · Admin' : 'Sales Agent · RBAC',
    items: profileItems,
  }

  const ctx = {
    store, go, sel, setSel,
    topBar: (opts) => (
      <TopBar {...opts}
        onSearch={opts.onSearch === false ? undefined : () => store.setSearch(true)}
        onBell={opts.onBell === false ? undefined : () => store.setNotif(true)}
        profile={profile}
        unread={unread} />
    ),
  }

  // Enforce RBAC on direct screen access
  const effectiveScreen = (state.role === 'agent' && ['team', 'settings', 'integrations', 'roadmap'].includes(screen)) ? 'dashboard' : screen
  const Screen = SCREENS[effectiveScreen] || Dashboard

  return (
    <>
      <AppShell nav={nav} active={effectiveScreen} onNav={go} footer={footer} topbar={null} firmName={state.settings.firmName}>
        <Screen key={`${effectiveScreen}-${sel.leadId || ''}-${sel.propId || ''}`} {...ctx} />
      </AppShell>
      {state.waState && <WaModal store={store} />}
      <Modals store={store} go={go} />
      <Toasts toasts={state.toasts} />
    </>
  )
}
