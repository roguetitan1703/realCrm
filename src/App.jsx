import { useState } from 'react'
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
import WaModal from './modules/WaModal.jsx'
import Modals from './modules/Modals.jsx'
import Mobile from './modules/Mobile.jsx'

const NAV = [
  { section: 'Workspace' },
  { key: 'dashboard', label: 'Dashboard', icon: 'grid' },
  { key: 'leads', label: 'Leads', icon: 'leads' },
  { key: 'properties', label: 'Properties', icon: 'building' },
  { key: 'clients', label: 'Clients', icon: 'people' },
  { key: 'calendar', label: 'Calendar', icon: 'calendar' },
  { section: 'Manage' },
  { key: 'team', label: 'Team', icon: 'team' },
  { key: 'settings', label: 'Settings', icon: 'settings' },
  { key: 'integrations', label: 'Integrations', icon: 'zap' },
  { section: "What's next" },
  { key: 'roadmap', label: 'Roadmap', icon: 'roadmap' },
]

const SCREENS = {
  dashboard: Dashboard, leads: Leads, properties: Properties, clients: Clients,
  calendar: Calendar, team: Team, settings: Settings, integrations: Integrations, roadmap: Roadmap,
}

// Optional deep-link bootstrap for demo/screenshot (?screen=leads&lead=l2&prop=p7).
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
    forceLogin: p.has('demo'),
    role: p.get('role') || null,
  }
}

export default function App() {
  const store = useStore()
  const { state } = store
  const boot = bootFromUrl()
  const [screen, setScreen] = useState(boot?.screen || 'dashboard')
  const [sel, setSel] = useState(boot?.sel || {})
  const [onboarding, setOnboarding] = useState(false)

  if (onboarding) {
    return <Onboarding store={store} onCancel={() => setOnboarding(false)} />
  }

  if (!state.loggedIn && !boot?.forceLogin) {
    return <Login store={store} onStartOnboard={() => setOnboarding(true)} />
  }

  // Phone view = the CRM rendered for the agent role. Same store/data.
  if (state.role === 'agent' || boot?.role === 'agent') {
    return (
      <>
        <Mobile store={store} />
        <Toasts toasts={state.toasts} />
      </>
    )
  }

  const leads = state.leads
  const newCount = leads.filter(l => l.stage === 'New').length
  const unread = leads.filter(l => l.overdue).length + leads.filter(l => !l.agentId).length
  const nav = NAV.map(n => (n.key === 'leads' ? { ...n, badge: newCount } : n))

  const go = (key, patch = {}) => { setScreen(key); setSel(s => ({ ...s, ...patch })) }
  const footer = { agent: store.me(), name: 'Rakesh Sethi', role: 'Owner · Admin',
    onSwitch: () => { store.setRole('agent'); store.toast('Agent phone view') } }
  const profile = {
    agent: store.me(), name: 'Rakesh Sethi', role: 'Owner · Admin',
    items: [
      { icon: 'settings', label: 'Settings', onClick: () => go('settings') },
      { icon: 'plus', label: 'Provision new workspace (Onboard)', onClick: () => setOnboarding(true) },
      { icon: 'team', label: 'Manage team', onClick: () => go('team') },
      { icon: 'switch', label: 'Switch to agent (phone) view', onClick: () => { store.setRole('agent'); store.toast('Agent phone view') } },
      { icon: 'refresh', label: 'Reset demo data', onClick: () => store.resetDemo() },
      { icon: 'x', label: 'Sign out', onClick: () => store.toast('Signed out (demo)') },
    ],
  }

  const ctx = {
    store, go, sel, setSel,
    // shared topbar factory so screens render a consistent bar
    topBar: (opts) => (
      <TopBar {...opts}
        onSearch={opts.onSearch === false ? undefined : () => store.setSearch(true)}
        onBell={opts.onBell === false ? undefined : () => store.setNotif(true)}
        profile={profile}
        unread={unread} />
    ),
  }

  const Screen = SCREENS[screen] || Dashboard
  return (
    <>
      <AppShell nav={nav} active={screen} onNav={go} footer={footer} topbar={null} firmName={state.settings.firmName}>
        <Screen {...ctx} />
      </AppShell>
      {state.waState && <WaModal store={store} />}
      <Modals store={store} go={go} />
      <Toasts toasts={state.toasts} />
    </>
  )
}
