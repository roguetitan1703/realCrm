import { useState } from 'react'
import { Avatar, Segmented } from '../../components/primitives.jsx'
import { MESSAGE_LANGUAGES } from '../../data/vocabLocale.js'
import { getPref, setPref } from '../../lib/prefs.js'
import { pushPermission } from '../../lib/push.js'
import Icon from '../../components/Icon.jsx'

const ROLE_LABEL = { admin: 'Owner · Admin', manager: 'Manager', agent: 'Field agent' }

export default function PhoneMe({ store, me, topBar }) {
  const { state } = store
  const [lang, setLang] = useState(() => getPref('msgLang', 'Hinglish'))
  const [tone, setTone] = useState(() => getPref('msgTone', 'Standard'))
  const blocked = pushPermission() === 'denied'

  const pick = (setter, key) => (v) => { setter(v); setPref(key, v) }

  return (
    <>
      {topBar({ title: 'Me' })}
      <div className="q-wrap">
        <div className="me-band">
          <Avatar agent={me} size="lg" empty={!me} />
          <div style={{ minWidth: 0 }}>
            <div className="me-name">{me?.name || state.settings.firmName}</div>
            <div className="me-role">
              {ROLE_LABEL[state.role] || 'Field agent'}
              {me?.phone ? ` · ${me.phone}` : ''}
            </div>
          </div>
        </div>

        <div className="q-group">
          <div className="q-head">Messages</div>
          <div className="me-row">
            <div className="me-label">Language</div>
            <Segmented options={MESSAGE_LANGUAGES} value={lang} onChange={pick(setLang, 'msgLang')} block />
          </div>
          <div className="me-row">
            <div className="me-label">Length</div>
            <Segmented options={['Standard', 'Short']} value={tone} onChange={pick(setTone, 'msgTone')} block />
          </div>
        </div>

        {/* Alerts are on by default and there is no switch. The only thing worth
            saying is when the browser itself has blocked them, because then the
            app is silent through no choice of the agent's. */}
        {blocked && (
          <div className="q-group">
            <div className="q-head">Alerts</div>
            <div className="me-row me-row-alert">
              <Icon name="bell" size={15} />
              <span>Blocked in your browser settings for this site.</span>
            </div>
          </div>
        )}

        <button className="me-signout" onClick={() => store.logout()}>
          <Icon name="x" size={16} />Sign out
        </button>
      </div>
    </>
  )
}
