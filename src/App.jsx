import { useState, useEffect } from 'react'
import { useStore } from './lib/store.jsx'
import { AppShell } from './layouts/layouts.jsx'
import { TopBar, Toasts, StaleBanner } from './components/chrome.jsx'
import { PLATFORM, tenantDocTitle } from './data/platform.js'
import { ownerCount } from './lib/format.js'
import { autoEnablePush } from './lib/push.js'

import Login from './modules/Login.jsx'
import Dashboard from './modules/Dashboard.jsx'
import Leads from './modules/Leads.jsx'
import Properties from './modules/Properties.jsx'
import Clients from './modules/Clients.jsx'
import Calendar from './modules/Calendar.jsx'
import Team from './modules/Team.jsx'
import Settings from './modules/Settings.jsx'
import Integrations from './modules/Integrations.jsx'
import ImportPage from './modules/ImportPage.jsx'
import WaModal from './modules/WaModal.jsx'
import Modals from './modules/Modals.jsx'
import Phone from './modules/Phone.jsx'

const NAV = [
  { section: 'Workspace' },
  { key: 'dashboard', label: 'Dashboard', icon: 'grid' },
  { key: 'leads', label: 'Leads', icon: 'leads' },
  { key: 'properties', label: 'Properties', icon: 'building' },
  // Contacts holds TWO separate stores (B3) — demand and supply. They're nav
  // children, not in-page tabs, because switching store is navigation; the
  // pills inside the page are for filtering a role WITHIN the active store.
  { key: 'clients', label: 'Contacts', icon: 'people', subKey: 'contactsTab' },
  { key: 'calendar', label: 'Calendar', icon: 'calendar' },
  { section: 'Manage' },
  { key: 'import', label: 'Import', icon: 'layers' },
  { key: 'team', label: 'Team', icon: 'team' },
  { key: 'settings', label: 'Settings', icon: 'settings' },
  { key: 'integrations', label: 'Integrations', icon: 'zap' },
]

const SCREENS = {
  dashboard: Dashboard, leads: Leads, properties: Properties, clients: Clients,
  calendar: Calendar, import: ImportPage, team: Team, settings: Settings, integrations: Integrations,
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
  // Screen size only. Role used to force the phone chrome, so an agent at a
  // desk got a phone app on a 27" monitor while a manager on a 13" laptop got
  // the desk. What an agent may see is RBAC's job, not the layout's.
  const isPhone = useResponsiveLayout()

  // Alerts are on by default — no toggle exists, so subscribing is the app's
  // job, once, as soon as there's a signed-in person to attach the device to.
  useEffect(() => {
    if (state.loggedIn) autoEnablePush()
  }, [state.loggedIn])

  // Tab title follows identity: the platform until a workspace is entered, the
  // firm's name inside the desk. Login owns the title while signed out.
  const signedIn = state.loggedIn || boot?.forceLogin
  useEffect(() => {
    if (signedIn) document.title = tenantDocTitle(state.settings.firmName)
  }, [signedIn, state.settings.firmName])

  // Workspace provisioning lives in the Delpat superadmin console (/admin), not
  // here — a visitor on the login page can no longer create tenants.
  if (!state.loggedIn && !boot?.forceLogin) {
    return <Login store={store} />
  }

  // Below 1024px the SAME modules render inside the phone chrome — bottom tabs
  // and an action button instead of a sidebar. Not a different app.
  if (isPhone) {
    return (
      <div className="viewport">
        {state.dataStale && <StaleBanner asOf={state.dataAsOf} />}
        {/* The deep link has to reach the phone too: a push notification links
            to ?screen=leads&lead=<id>, and without this the tap opened the app
            on Today, leaving the person to find the lead the alert was about. */}
        <Phone store={store} framed={false} boot={boot} />
        <Toasts toasts={state.toasts} />
      </div>
    )
  }

  const leads = state.leads
  const newCount = leads.filter(l => l.stage === 'New').length
  const unreadNotifs = (state.notifications || []).filter(n => !n.read).length
  const unread = leads.filter(l => l.overdue).length + leads.filter(l => !l.agentId).length + unreadNotifs

  // RBAC Navigation filtering: Agent role hides system management & settings
  const allowedKeys = state.role === 'agent' ? ['dashboard', 'leads', 'properties', 'clients', 'calendar'] : null
  const contactsTab = sel.contactsTab || 'clients'
  const nav = NAV
    .filter(n => !allowedKeys || (n.key && allowedKeys.includes(n.key)) || (n.section && ['Workspace'].includes(n.section)))
    .map(n => {
      if (n.key === 'leads') return { ...n, badge: newCount }
      if (n.key === 'clients') return {
        ...n,
        children: [
          { sub: 'clients', label: 'Clients', count: leads.length },
          { sub: 'owners', label: 'Owners', count: ownerCount(state.properties) },
        ],
      }
      return n
    })

  // Every flag that makes a screen render something OTHER than its list. They
  // are cleared on each navigation unless the caller explicitly sets one.
  //
  // This used to name only `leadOpen` and `propOpen` — the two that existed
  // when it was written — and spread the rest of `sel` forward untouched. So
  // once a takeover added since then was set, it never cleared: leaving the
  // add-property wizard and clicking Properties re-opened the wizard, because
  // `propAdd` was still true. Listing them in one place is what stops the next
  // takeover from quietly inheriting the same bug.
  const TAKEOVER_KEYS = ['leadOpen', 'leadId', 'propOpen', 'propId', 'propAdd', 'propProject', 'projOpen', 'projKey']

  const go = (key, patch = {}) => {
    setScreen(key)
    setSel(s => {
      const next = { ...s }
      for (const k of TAKEOVER_KEYS) if (patch[k] === undefined) next[k] = null
      return { ...next, ...patch }
    })
  }

  // me() returns null when the signed-in user isn't in the agent roster (the
  // invented fallback agent was removed). Reading .name off it crashed the shell.
  const me = store.me()
  const footer = {
    agent: me,
    name: me?.name || state.settings.firmName,
    role: state.role === 'admin' ? 'Owner · Admin' : 'Sales Agent',
  }

  // Profile menu carries only real product actions. Role comes from the signed-in
  // user (real RBAC) — no dev toggle; workspace provisioning + data reset are
  // Delpat/superadmin operations and live in the /admin console, not here.
  const profileItems = []
  if (state.role === 'admin') {
    profileItems.push(
      { icon: 'settings', label: 'Settings', onClick: () => go('settings') },
      { icon: 'team', label: 'Manage team', onClick: () => go('team') },
      { icon: 'zap', label: 'API Integrations & Webhooks', onClick: () => go('integrations') },
    )
  }
  profileItems.push(
    { icon: 'x', label: 'Sign out', onClick: () => store.logout() }
  )

  const profile = {
    agent: me,
    name: me?.name || state.settings.firmName,
    role: state.role === 'admin' ? 'Owner · Admin' : 'Sales Agent',
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
  const effectiveScreen = (state.role === 'agent' && ['team', 'settings', 'integrations'].includes(screen)) ? 'dashboard' : screen
  const Screen = SCREENS[effectiveScreen] || Dashboard

  return (
    <div className="viewport">
      {state.dataStale && <StaleBanner asOf={state.dataAsOf} />}
      <AppShell nav={nav} active={effectiveScreen} activeSub={contactsTab} onNav={go} footer={footer} topbar={null} firmName={state.settings.firmName} logoUrl={state.brand?.logoUrl} sub={state.settings.city || state.brand?.city || ''}>
        <Screen key={`${effectiveScreen}-${sel.leadId || ''}-${sel.propId || ''}`} {...ctx} />
      </AppShell>
      {state.waState && <WaModal store={store} />}
      <Modals store={store} go={go} />
      <Toasts toasts={state.toasts} />
    </div>
  )
}
