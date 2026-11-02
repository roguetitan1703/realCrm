import { useState, useEffect, useRef } from 'react'
import { Button } from './primitives.jsx'
import Icon from './Icon.jsx'
import { isDeskRole } from '../lib/permissions.js'
import { DEFAULT_WHATSAPP_INTRO, DEFAULT_OWNER_INTRO, leadIntroTemplate } from '../data/theme.js'
import { DEFAULT_SHARE_TEMPLATE, SHARE_TOKENS, shareTemplate } from '../data/shareMessage.js'

/**
 * THE FIRM'S WHATSAPP TEMPLATES, one component on two surfaces (Settings
 * and the phone's Me screen), so there is one editor per sentence.
 *
 *   To a lead        filled in from the lead, sent to that buyer
 *   To an owner      filled in from an owner on the calling list
 *   Property link    filled in by the server when a link is made
 *
 * Each is one line until it is tapped: three open textareas were a wall.
 *
 * Desk only. Hiding an editor is not a permission: the server refuses a
 * settings write from an agent outright (routes/workspace.ts).
 */
export default function MessageTemplates({ store }) {
  const { state } = store
  // The standing "intro message" an agent could copy was a third; removed as
  // not useful (2 Nov). Its stored value stays in settings, unread.
  if (!isDeskRole(state.role)) return null

  return (
    <>
      <TemplateEditor
        title="WhatsApp to a lead"
        value={leadIntroTemplate(state.settings)}
        fallback={DEFAULT_WHATSAPP_INTRO}
        tokens={['{name}', '{agentName}', '{firmName}', '{requirement}', '{locality}', '{source}']}
        onSave={(v) => store.patchSettings({ whatsappIntroTemplate: v }, 'WhatsApp message saved')}
        onReset={() => store.patchSettings({ whatsappIntroTemplate: DEFAULT_WHATSAPP_INTRO }, 'WhatsApp message reset')}
      />
      <TemplateEditor
        title="WhatsApp to an owner"
        value={state.settings?.ownerIntroTemplate || DEFAULT_OWNER_INTRO}
        fallback={DEFAULT_OWNER_INTRO}
        tokens={['{name}', '{agentName}', '{firmName}', '{project}', '{locality}']}
        onSave={(v) => store.patchSettings({ ownerIntroTemplate: v }, 'Owner message saved')}
        onReset={() => store.patchSettings({ ownerIntroTemplate: DEFAULT_OWNER_INTRO }, 'Owner message reset')}
      />
      <TemplateEditor
        title="Property link"
        value={shareTemplate(state.settings?.sharing)}
        fallback={DEFAULT_SHARE_TEMPLATE}
        tokens={SHARE_TOKENS}
        rows={9}
        onSave={(v) => putSharing(store, { messageTemplate: v }, 'Link message saved')}
        onReset={() => putSharing(store, { messageTemplate: null }, 'Link message reset')}
      />
    </>
  )
}

// `sharing` is stored as one object; `replyToFallback` is the server's answer,
// not a setting, so it is not sent back (as in Settings → Sharing).
function putSharing(store, patch, note) {
  const { replyToFallback: _shown, ...stored } = store.state.settings?.sharing || {}
  return store.patchSettings({ sharing: { ...stored, ...patch } }, note)
}

// NO `sub`. Each editor carried a sentence explaining itself -- "Filled in from
// the lead when the WhatsApp button is pressed", "Every agent can read this one
// and copy it" -- and the product's rule is labels and values only. The heading
// now says "template" so it is not mistaken for the message itself, and the
// token buttons under it show what gets filled in, which is the explanation.
function TemplateEditor({ title, value, fallback, tokens, rows = 4, onSave, onReset }) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState(value)
  // The stored value can change under an open editor — another tab saving, or
  // the desk state reloading after a save. Following it blindly would wipe what
  // is being typed, so it re-seeds only when the draft is still the old stored
  // value, i.e. nobody has touched it.
  const seen = useRef(value)
  useEffect(() => {
    if (value === seen.current) return
    setDraft(prev => (prev === seen.current ? value : prev))
    seen.current = value
  }, [value])

  const dirty = draft.trim() !== String(value || '').trim()
  const insert = (t) => setDraft(prev => (prev && !prev.endsWith(' ') ? prev + ' ' : prev) + t)

  return (
    <section className={'msgt-card msgt-fold' + (open ? ' open' : '')}>
      <button type="button" className="msgt-h msgt-fold-t" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span>{title}</span>
        {dirty && <span className="msgt-dirty" />}
        <Icon name={open ? 'chevUp' : 'chevDown'} size={15} className="msgt-go" />
      </button>
      {open && <>
      <div className="msgt-ph">
        {tokens.map(t => (
          <button key={t} type="button" className="msgt-tok" onClick={() => insert(t)}>+ {t}</button>
        ))}
      </div>
      <textarea
        className="textarea msgt-t"
        rows={rows}
        value={draft}
        onChange={e => setDraft(e.target.value)}
      />
      <div className="msgt-foot">
        <Button variant="primary" disabled={!dirty} onClick={() => onSave(draft.trim())}>Save</Button>
        <Button variant="ghost" disabled={String(value || '').trim() === fallback.trim()} onClick={onReset}>
          Reset to default
        </Button>
      </div>
      </>}
    </section>
  )
}
