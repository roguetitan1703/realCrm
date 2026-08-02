import Icon from '../components/Icon.jsx'
import Connections from './Connections.jsx'

// Two things live here, and both do something.
//
// Deleted with prejudice: a "Built in · nothing to connect" pair of cards for
// Calling and WhatsApp whose status pill read "Always on" as a hardcoded
// string and whose buttons navigated to `tel:` and `https://wa.me/` — neither
// of which goes anywhere — and three portal cards (99acres, MagicBricks,
// Website sync) that opened a config modal against a route that 404s. They
// described capabilities instead of providing them, and the portal ones are
// now genuinely handled by Connections.

export default function Integrations({ store, go, topBar }) {
  return (
    <>
      {topBar({ title: 'Integrations' })}
      <div className="app-body itg">
        <div className="itg-in">
          <Connections store={store} />

          <div className="itg-sec">Bring your data</div>
          <button className="itg-import" onClick={() => go('import')}>
            <span className="itg-import-i"><Icon name="layers" size={22} /></span>
            <span className="itg-import-b">
              <span className="itg-import-t">Import from Excel / Google Sheets</span>
            </span>
            <span className="btn btn-primary btn-sm"><Icon name="plus" size={14} />Import</span>
          </button>
        </div>
      </div>
    </>
  )
}
