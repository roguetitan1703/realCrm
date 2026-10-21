import { Avatar } from '../components/primitives.jsx'
import { MePhone, MyLinks } from '../components/MyLinks.jsx'
import { roleLabel } from '../lib/permissions.js'

// THE DESK'S "ME": the same two blocks the phone's Me tab carries — your own
// mobile number (Send needs it) and the links you have shared. Reached from
// the profile menu, never the sidebar: there is no link management, only
// your own links.
export default function Me({ store, go, topBar }) {
  const me = store.me()
  return (
    <>
      {topBar({ title: 'Your profile' })}
      <div className="app-body">
        <div className="pagewrap me-desk">
          <div className="me-desk-id">
            <Avatar agent={me} size="lg" empty={!me} />
            <div>
              <div className="me-desk-name">{me?.name || ''}</div>
              <div className="me-desk-role">{roleLabel(store.state.role)}</div>
            </div>
          </div>
          <MePhone store={store} />
          <MyLinks store={store} go={go} />
        </div>
      </div>
    </>
  )
}
