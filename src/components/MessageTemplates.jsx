import { useState, useEffect, useRef } from 'react'
import { Button } from './primitives.jsx'
import Icon from './Icon.jsx'
import { isDeskRole } from '../lib/permissions.js'
import { introText } from '../lib/matching.js'
import { DEFAULT_WHATSAPP_INTRO, DEFAULT_INTRO_MESSAGE } from '../data/theme.js'

/**
 * THE FIRM'S TWO MESSAGE TEMPLATES — one component, two surfaces.
 *
 * Settings → Message templates and the phone's Me screen each had their own
 * editor over the same stored value: one committed on blur with placeholder
 * chips, the other on a Save button with a placeholder legend, and neither knew
 * about the other. Two editors for one sentence do not stay in agreement, and
 * the day they disagree nobody is looking. This is the only one.
 *
 * WHO SEES WHAT (desk-rework.md §2, G):
 *
 *   WhatsApp message  filled in from a lead, sent to that buyer   desk only
 *   Intro message     a standing sentence, no lead in it          everyone
 *
 * An agent sees the intro READ-ONLY, resolved, with a Copy button, and a line
 * naming who can change it — so they know who to ask rather than assuming it is
 * broken. They see no sign the other template exists: it is not a message they
 * can send from here, and a control that is visible but refused reads as the
 * app being broken.
 *
 * Hiding an editor is not a permission. The server refuses a settings write
 * from an agent outright — routes/workspace.ts.
 */
export default function MessageTemplates({ store }) {
  const { state } = store
  const desk = isDeskRole(state.role)
  const firmName = state.settings?.firmName || ''
  // From the store, not a prop: this renders on a screen mounted from a shared
  // ctx that carries no user, and {agentName} resolving to nothing would be
  // pasted into a client's chat before anyone noticed.
  const agentName = store.me?.()?.name || ''
  // `||`, not `??`: an empty stored template is not a template. It is also
  // what the consumer does — followUpMessage() falls back the same way — so a
  // blank box here and the message that actually goes out cannot disagree.
  const intro = state.settings?.introMessage || DEFAULT_INTRO_MESSAGE

  if (!desk) {
    return (
      <section className="msgt-card">
        <div className="msgt-h">Intro message</div>
        <IntroPreview text={introText(intro, { firmName, agentName })} />
        <div className="msgt-who">Your owner or manager can change this.</div>
      </section>
    )
  }

  return (
    <>
      <TemplateEditor
        title="WhatsApp message"
        sub="Filled in from the lead when the WhatsApp button is pressed."
        value={state.settings?.whatsappIntroTemplate || DEFAULT_WHATSAPP_INTRO}
        fallback={DEFAULT_WHATSAPP_INTRO}
        tokens={['{name}', '{requirement}', '{locality}', '{source}', '{firmName}']}
        onSave={(v) => store.patchSettings({ whatsappIntroTemplate: v }, 'WhatsApp message saved')}
        onReset={() => store.patchSettings({ whatsappIntroTemplate: DEFAULT_WHATSAPP_INTRO }, 'WhatsApp message reset')}
      />
      <TemplateEditor
        title="Intro message"
        sub="Every agent can read this one and copy it. No lead fields."
        value={intro}
        fallback={DEFAULT_INTRO_MESSAGE}
        tokens={['{agentName}', '{firmName}']}
        onSave={(v) => store.patchSettings({ introMessage: v }, 'Intro message saved')}
        onReset={() => store.patchSettings({ introMessage: DEFAULT_INTRO_MESSAGE }, 'Intro message reset')}
        preview={introText(intro, { firmName, agentName })}
      />
    </>
  )
}

function TemplateEditor({ title, sub, value, fallback, tokens, onSave, onReset, preview }) {
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
    <section className="msgt-card">
      <div className="msgt-h">{title}</div>
      <div className="msgt-s">{sub}</div>
      <div className="msgt-ph">
        {tokens.map(t => (
          <button key={t} type="button" className="msgt-tok" onClick={() => insert(t)}>+ {t}</button>
        ))}
      </div>
      <textarea
        className="textarea msgt-t"
        rows={4}
        value={draft}
        onChange={e => setDraft(e.target.value)}
      />
      {preview !== undefined && <IntroPreview text={preview} />}
      <div className="msgt-foot">
        <Button variant="primary" disabled={!dirty} onClick={() => onSave(draft.trim())}>Save</Button>
        <Button variant="ghost" disabled={String(value || '').trim() === fallback.trim()} onClick={onReset}>
          Reset to default
        </Button>
      </div>
    </section>
  )
}

/** The resolved sentence, and the button that puts exactly it on the clipboard. */
function IntroPreview({ text }) {
  const [copied, setCopied] = useState(false)
  // Confirmed only once the write RESOLVES. A "Copied" that fires regardless is
  // how somebody pastes an old clipboard into a client's chat.
  const copy = () => {
    navigator.clipboard?.writeText(text)
      .then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500) })
      .catch(() => {})
  }
  return (
    <div className="msgt-prev">
      <div className="msgt-prev-t">{text}</div>
      <button type="button" className="btn btn-quiet msgt-copy" onClick={copy} disabled={!text}>
        <Icon name={copied ? 'check' : 'copy'} size={13} /> {copied ? 'Copied' : 'Copy'}
      </button>
    </div>
  )
}
