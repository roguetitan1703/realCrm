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
import { api } from '../lib/api.js'
import { useServerData } from '../lib/useServerData.js'

import Leads from './Leads.jsx'
import Owners from './Owners.jsx'
import Properties from './Properties.jsx'
import PhoneToday from './phone/PhoneToday.jsx'
import PhoneMe from './phone/PhoneMe.jsx'
import PhoneActions from './phone/PhoneActions.jsx'
import Modals from './Modals.jsx'
import WaModal from './WaModal.jsx'

// Five screens, because an agent in the field has five jobs: see what's due,
// work a lead, work the calling queue, look up inventory, be themselves.
// Calling is here and not folded into Leads because it is the other half of an
// agent's day and it was previously unreachable on a phone entirely — an agent
// could be assigned seven hundred owners to ring and had no screen that listed
// one of them. Team/Settings/Import/Connections are desk work and deliberately
// have no phone screen.
const TABS = [
  { key: 'today', label: 'Today', icon: 'home' },
  { key: 'leads', label: 'Leads', icon: 'leads' },
  { key: 'calling', label: 'Calling', icon: 'phone' },
  { key: 'properties', label: 'Props', icon: 'building' },
  { key: 'me', label: 'Me', icon: 'person' },
]

const SCREENS = { leads: Leads, calling: Owners, properties: Properties }

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
  // firmName has no hardcoded fallback: until the firm's name hydrates there is
  // no name to show, and the bar renders fine without one. Printing a bundled
  // demo firm instead meant a client watched someone else's brand for the first
  // second and a half of every launch.
  const topBar = (opts) => (
    <MobileTopBar
      title={opts.title}
      sub={opts.eyebrow}
      onBack={opts.onBack}
      firmName={state.settings?.firmName || ''}
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

  // The tab badge is one number, and the server already scopes it: an agent's
  // summary counts their own pipeline, an owner's counts the firm's. This used
  // to filter every lead in memory to produce it.
  const { data: leadCounts } = useServerData(() => api.getLeadsSummary(), [state.dataAsOf], null, '/leads/summary')
  const { data: ownerSummary } = useServerData(() => api.getOwnersSummary(true), [state.dataAsOf], null, '/owners/summary?mine=1')
  const overdueN = leadCounts?.overdue || 0
  // Late callbacks only. Badging the size of the queue would put 732 on the tab
  // permanently, which is decoration — this is the number that means "someone
  // is waiting on you right now".
  const lateCallbacks = ownerSummary?.summary?.queue?.callbacksOverdue || 0

  const BADGES = { today: overdueN + lateCallbacks, calling: lateCallbacks }
  const tabs = {
    tabs: TABS.map(t => (BADGES[t.key] ? { ...t, badge: BADGES[t.key] } : t)),
    active: tab,
    onNav: (k) => go(k),
  }

  // Context for the action button: on an open record it offers that record's
  // actions, otherwise the create/log actions that don't need one.
  const actionCtx = sel.leadOpen && sel.leadId ? { kind: 'lead', id: sel.leadId }
    : sel.ownerOpen && sel.ownerId ? { kind: 'owner', id: sel.ownerId }
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
      onRefresh={() => store.loadServerState?.()}
      fab={<PhoneActions store={store} go={go} context={actionCtx} />}
      modals={<>{state.waState && <WaModal store={store} />}<Modals store={store} go={go} /></>}
    >
      {body}
    </MobileShell>
  )
}
