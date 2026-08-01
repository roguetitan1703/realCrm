// The phone chrome. NOT a second app: it supplies the same ctx the desk supplies
// (store, go, sel, setSel, topBar) and renders the SAME module screens. What
// changes is the frame around them — bottom tabs and a thumb-reachable action
// button instead of a sidebar and a toolbar.
//
// This replaces src/modules/mobile/*, which was a parallel set of screens that
// drifted: it filtered on '2BHK' string matches, wrote invented property facts,
// and opened four modal kinds nothing on that side handled. Every one of those
// bugs was a consequence of the fork, not of the phone.
import { MobileShell, MobileTopBar } from '../layouts/layouts.jsx'
import { Avatar } from '../components/primitives.jsx'
import Icon from '../components/Icon.jsx'

import Leads from './Leads.jsx'
import Properties from './Properties.jsx'
import PhoneToday from './phone/PhoneToday.jsx'
import PhoneMe from './phone/PhoneMe.jsx'
import PhoneActions from './phone/PhoneActions.jsx'
import Modals from './Modals.jsx'
import WaModal from './WaModal.jsx'

// Four screens, because an agent in the field has four jobs: see what's due,
// work a lead, look up inventory, be themselves. Team/Settings/Import/
// Connections are desk work and deliberately have no phone screen.
const TABS = [
  { key: 'today', label: 'Today', icon: 'home' },
  { key: 'leads', label: 'Leads', icon: 'leads' },
  { key: 'properties', label: 'Props', icon: 'building' },
  { key: 'me', label: 'Me', icon: 'person' },
]

const SCREENS = { leads: Leads, properties: Properties }

export default function Phone({ store, framed = false, screen, sel, setSel, go: navGo }) {
  const { state } = store
  // Nav is owned by App and mirrored to the URL, so the phone and the desk
  // cannot disagree about where you are, a reload lands back on this record,
  // and the back button unwinds through screens instead of leaving the app.
  const tab = (SCREENS[screen] || screen === 'today' || screen === 'me') ? screen : 'today'
  const me = store.me()

  // A screen the phone doesn't carry (import, team, settings…) is never linked
  // from here — modules read ctx.phone and drop those affordances — so `go`
  // only has to handle the tabs it owns.
  const go = (key, patch = {}) => {
    if (SCREENS[key] || key === 'today' || key === 'me') return navGo(key, patch)
    navGo(tab, patch)
  }

  const unreadNotifs = (state.notifications || []).filter(n => !n.read).length

  // The module's own topBar call renders into the scrolling body and sticks to
  // the top of it, so a list can scroll under its own header without the shell
  // needing to know which screen is mounted.
  const topBar = (opts) => (
    <MobileTopBar
      title={opts.title}
      sub={opts.eyebrow}
      onBack={opts.onBack}
      firmName={state.settings?.firmName || state.brand?.name || 'Delpat Realty'}
      logoUrl={state.brand?.logoUrl}
      right={
        <button className="m-bell" onClick={() => store.setNotif(true)} aria-label="Notifications">
          <Icon name="bell" size={19} />
          {unreadNotifs ? <span className="bdot">{unreadNotifs}</span> : null}
        </button>
      }
    />
  )

  const ctx = { store, go, sel, setSel, topBar, phone: true }

  const myLeads = me ? state.leads.filter(l => l.agentId === me.id) : []
  const overdueN = (state.role === 'agent' ? myLeads : state.leads).filter(l => l.overdue).length

  const tabs = {
    tabs: TABS.map(t => (t.key === 'today' && overdueN ? { ...t, badge: overdueN } : t)),
    active: tab,
    onNav: (k) => go(k),
  }

  // Context for the action button: on an open record it offers that record's
  // actions, otherwise the create/log actions that don't need one.
  const actionCtx = sel.leadOpen && sel.leadId ? { kind: 'lead', id: sel.leadId }
    : sel.propOpen && sel.propId ? { kind: 'prop', id: sel.propId }
    : { kind: tab }

  const Screen = SCREENS[tab]
  const body = Screen
    ? <Screen key={`${tab}-${sel.leadId || ''}-${sel.propId || ''}`} {...ctx} />
    : tab === 'me'
      ? <PhoneMe store={store} me={me} topBar={topBar} />
      : <PhoneToday store={store} me={me} go={go} topBar={topBar} />

  return (
    <MobileShell
      framed={framed}
      tabs={tabs}
      fab={<PhoneActions store={store} go={go} context={actionCtx} />}
      modals={<>{state.waState && <WaModal store={store} />}<Modals store={store} go={go} /></>}
    >
      {body}
    </MobileShell>
  )
}
