import { useState, useEffect, useCallback, useMemo } from 'react'
import { useStore } from './lib/store.jsx'
import { useNav } from './lib/useNav.js'
import { AppShell } from './layouts/layouts.jsx'
import { TopBar, Toasts, StaleBanner } from './components/chrome.jsx'
import { PLATFORM, tenantDocTitle } from './data/platform.js'
import { autoEnablePush } from './lib/push.js'
import { api } from './lib/api.js'
import { useServerData } from './lib/useServerData.js'

import Login from './modules/Login.jsx'
import Dashboard from './modules/Dashboard.jsx'
import Leads from './modules/Leads.jsx'
import Owners from './modules/Owners.jsx'
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
  // The outbound half of the desk. It sat under Contacts as a child, which is
  // where it broke: Contacts is a directory of people you already have a
  // relationship with, and this is a pipeline — statuses, routing, a queue,
  // callbacks. Every surface that organises around pipelines (Today, the
  // dashboard, the phone tabs) had nowhere to hang it while it was a sub-item.
  { key: 'calling', label: 'Calling', icon: 'phone' },
  { key: 'properties', label: 'Properties', icon: 'building' },
  // Contacts is the directory of people, both sides of the desk: Clients
  // (derived from leads) and Listing owners (derived from the listings we
  // hold). Both are views over records that already exist — nothing here is
  // created or assigned, which is exactly what separates it from Calling.
  { key: 'clients', label: 'Contacts', icon: 'people', subKey: 'contactsTab' },
  { key: 'calendar', label: 'Calendar', icon: 'calendar' },
  { section: 'Manage' },
  { key: 'import', label: 'Import', icon: 'layers' },
  { key: 'team', label: 'Team', icon: 'team' },
  { key: 'settings', label: 'Settings', icon: 'settings' },
  { key: 'integrations', label: 'Integrations', icon: 'zap' },
]

const SCREENS = {
  dashboard: Dashboard, leads: Leads, calling: Owners, properties: Properties, clients: Clients,
  calendar: Calendar, import: ImportPage, team: Team, settings: Settings, integrations: Integrations,
}

// Deep-link parsing lives in lib/nav.js now — it is the same parser the URL
// writer uses, so a link the app produces is always a link it can read back.

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
  // Screen size only. Role used to force the phone chrome, so an agent at a
  // desk got a phone app on a 27" monitor while a manager on a 13" laptop got
  // the desk. What an agent may see is RBAC's job, not the layout's.
  const isPhone = useResponsiveLayout()
  // One nav for both chromes, mirrored to the URL. `home` differs because the
  // root a back press unwinds to is the dashboard on a desk and Today on a
  // phone — otherwise back on Today would keep trying to reach a dashboard the
  // phone does not have.
  const warnExit = useCallback(() => store.toast('Press back again to exit'), [store])
  // Everything that draws over a screen, in one place, so nav can dismiss it
  // without knowing what any of them are. All three are separate pieces of
  // store state: the modal stack, the search panel and the alerts drawer.
  const overlay = useMemo(() => ({
    isOpen: () => Boolean(store.state.modal || store.state.searchOpen || store.state.notifOpen),
    close: () => {
      if (store.state.modal) store.closeModal()
      if (store.state.searchOpen) store.setSearch(false)
      if (store.state.notifOpen) store.setNotif(false)
    },
  }), [store])
  const { screen, setScreen, sel, setSel, go, boot } = useNav({
    home: isPhone ? 'today' : 'dashboard',
    onExitWarning: warnExit,
    overlay,
  })

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

  // Sidebar badges are four integers. They were four array scans over every
  // lead and every property the browser had downloaded to produce them. Read
  // here, ABOVE the early returns, because a hook cannot sit behind one — both
  // the login gate and the phone/desk switch return before the sidebar exists,
  // so a read placed next to its consumer would change the hook order on the
  // frame someone signs in or resizes past 1024px.
  const { data: desk } = useServerData(
    () => (state.loggedIn ? api.getDeskSummary() : Promise.resolve(null)),
    [state.dataAsOf, state.loggedIn],
    null,
    '/workspace/desk-summary',
  )
  // The calling queue's own counts — same read the Calling screen and Today
  // use, so the sidebar badge and the screen it opens never disagree.
  const { data: ownerSummary } = useServerData(
    () => (state.loggedIn ? api.getOwnersSummary() : Promise.resolve(null)),
    [state.dataAsOf, state.loggedIn],
    null,
    '/owners/summary',
  )
  const callQueue = ownerSummary?.summary?.queue || null
  const totals = desk?.leads || { total: 0, overdue: 0, unassigned: 0 }
  const newCount = desk?.byStage?.['New'] || 0
  // The bell badge is unread NOTIFICATIONS — the thing the bell opens onto.
  // It used to be `overdue + unassigned + unreadNotifs`, which was only ever
  // right by accident: both lead counts were permanently 0, so the sum happened
  // to equal the notification count. Replacing them with counts that actually
  // move exposed it — 143 on a bell whose drawer said 55.
  //
  // Lead piles are the dashboard's job and they have tiles of their own. A
  // count has to describe the rows behind the thing it is printed on.
  const unread = state.notifUnread || 0

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
        {state.dataStale && <StaleBanner />}
        <Phone store={store} framed={false} screen={screen} sel={sel} setSel={setSel} go={go} />
        <Toasts toasts={state.toasts} onDismiss={(id) => dispatch({ type: 'UNTOAST', id })} />
      </div>
    )
  }

  // RBAC Navigation filtering: Agent role hides system management & settings
  const allowedKeys = state.role === 'agent' ? ['dashboard', 'leads', 'calling', 'properties', 'clients', 'calendar'] : null
  const contactsTab = sel.contactsTab || 'clients'
  const nav = NAV
    .filter(n => !allowedKeys || (n.key && allowedKeys.includes(n.key)) || (n.section && ['Workspace'].includes(n.section)))
    .map(n => {
      if (n.key === 'leads') return { ...n, badge: newCount }
      // The badge is what is waiting to be dialled, not the size of the list.
      // 732 next to Calling forever is not a number anyone acts on.
      if (n.key === 'calling') return { ...n, badge: callQueue?.callbacksOverdue || 0 }
      if (n.key === 'clients') return {
        ...n,
        children: [
          { sub: 'clients', label: 'Clients', count: desk ? totals.total : undefined },
          { sub: 'owners', label: 'Listing owners', count: desk ? desk.owners : undefined },
        ],
      }
      return n
    })

  // `go` and the takeover-key clearing moved into useNav, so the desk and the
  // phone navigate through one function and both end up in the URL.

  // me() returns null when the signed-in user isn't in the agent roster (the
  // invented fallback agent was removed). Reading .name off it crashed the shell.
  const me = store.me()
  const footer = {
    agent: me,
    name: me?.name || state.settings.firmName,
    role: state.role === 'admin' ? 'Owner · Admin' : 'Sales Executive',
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
    role: state.role === 'admin' ? 'Owner · Admin' : 'Sales Executive',
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
      {state.dataStale && <StaleBanner />}
      <AppShell nav={nav} active={effectiveScreen} activeSub={contactsTab} onNav={go} footer={footer} topbar={null} firmName={state.settings.firmName} logoUrl={state.brand?.logoUrl} sub={state.settings.city || state.brand?.city || ''}>
        <Screen key={`${effectiveScreen}-${sel.leadId || ''}-${sel.ownerId || ''}-${sel.propId || ''}`} {...ctx} />
      </AppShell>
      {state.waState && <WaModal store={store} />}
      <Modals store={store} go={go} />
      <Toasts toasts={state.toasts} onDismiss={(id) => dispatch({ type: 'UNTOAST', id })} />
    </div>
  )
}
