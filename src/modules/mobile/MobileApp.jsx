import { useState } from 'react'
import { MobileShell, MobileTopBar } from '../../layouts/layouts.jsx'
import { Avatar } from '../../components/primitives.jsx'
import { theme } from '../../data/theme.js'

import MobileToday from './MobileToday.jsx'
import MobileLeads from './MobileLeads.jsx'
import MobileProperties from './MobileProperties.jsx'
import MobileMe from './MobileMe.jsx'
import MobileLeadDetail from './MobileLeadDetail.jsx'
import MobilePropDetail from './MobilePropDetail.jsx'
import MobileSpeedDial from './MobileSpeedDial.jsx'
import MobileModals from './MobileModals.jsx'

const TABS = [
  { key: 'today', label: 'Today', icon: 'home' },
  { key: 'leads', label: 'Leads', icon: 'leads' },
  { key: 'properties', label: 'Props', icon: 'building' },
  { key: 'me', label: 'Me', icon: 'person' },
]

export default function MobileApp({ store, framed = false }) {
  const [tab, setTab] = useState('today')
  const [view, setView] = useState(null)   // {kind:'lead'|'prop', id}
  const me = store.me()

  const open = (kind, id) => setView({ kind, id })
  const back = () => setView(null)

  const myLeads = store.state.leads.filter(l => l.agentId === me.id)
  const overdueN = myLeads.filter(l => l.overdue).length

  const tabs = {
    tabs: TABS.map(t => (t.key === 'today' && overdueN ? { ...t, badge: overdueN } : t)),
    active: tab,
    onNav: (k) => { setTab(k); setView(null) },
  }

  // sub-views (lead / property detail) render full-screen over the shell
  if (view?.kind === 'lead') {
    return <MobileLeadDetail store={store} me={me} id={view.id} back={back} open={open} tabs={tabs} modals={<MobileModals store={store} />} />
  }
  if (view?.kind === 'prop') {
    return <MobilePropDetail store={store} me={me} id={view.id} back={back} open={open} tabs={tabs} modals={<MobileModals store={store} />} />
  }

  const Screen = { today: MobileToday, leads: MobileLeads, properties: MobileProperties, me: MobileMe }[tab] || MobileToday

  const top = tab === 'today'
    ? <MobileTopBar brand title={theme.brand.firmName} sub={`${me.name || 'Rakesh Sethi'} · ${store.state.role === 'admin' ? 'Owner / Admin' : 'Field agent'}`} right={<Avatar agent={me} size="md" />} />
    : <MobileTopBar
        title={{ leads: 'My leads', properties: 'Properties', me: 'My profile' }[tab]}
        sub={tab === 'leads' ? `${myLeads.length} assigned` : undefined}
        right={<Avatar agent={me} size="md" />}
      />

  const fab = <MobileSpeedDial store={store} context={{ kind: tab }} />

  return (
    <MobileShell
      framed={framed}
      top={top}
      tabs={tabs}
      fab={fab}
      modals={<MobileModals store={store} />}
    >
      <Screen store={store} me={me} open={open} setTab={setTab} />
    </MobileShell>
  )
}
