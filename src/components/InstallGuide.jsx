import { useEffect, useState } from 'react'
import Icon from './Icon.jsx'
import { installEnv } from '../lib/pwa.js'
import { copyText } from '../lib/clipboard.js'

// ============================================================================
// 📲 Install guide — the sheet iPhone needs and Android doesn't
// ============================================================================
// Android hands us a real install event: one button, one system dialog, done.
// iOS has no such API and never will, so installing there is a gesture the
// person has to perform themselves — and a one-line "tap Share, then Add to
// Home Screen" is not enough when they are holding the phone and cannot find
// Share. This sheet points at the actual control: which glyph, where on screen
// it sits in that browser, and what to tap after it.
//
// It also handles the case that breaks this in the field. Agents receive the
// link over WhatsApp, and iOS opens it in an embedded web view whose Share
// sheet has NO "Add to Home Screen" row at all. Following the instructions
// there fails every time, and the person concludes the app is broken. So when
// we are not in a browser that can install, the sheet stops giving install
// steps and gives the one step that matters: get to Safari.

export default function InstallGuide({ onClose }) {
  const env = installEnv()
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    const esc = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [onClose])

  const copyLink = async () => {
    if (!await copyText(window.location.href)) return setCopied(false)
    setCopied(true)
    setTimeout(() => setCopied(false), 2200)
  }

  // Safari puts Share in the bottom bar; Chrome and Edge on iOS put it in the
  // top-right menu. Naming the wrong corner is the same as naming nothing.
  const shareWhere = env.browser === 'chrome' || env.browser === 'edge'
    ? 'in the ⋯ menu, top right'
    : 'in the bar at the bottom of the screen'

  const steps = env.canAddToHome
    ? [
        { k: 'share', text: <>Tap the <b>Share</b> button — {shareWhere}.</>, glyph: 'share' },
        { k: 'scroll', text: <>Scroll down the list and tap <b>Add to Home Screen</b>.</>, glyph: 'plus' },
        { k: 'add', text: <>Tap <b>Add</b>, top right. The app appears on your home screen.</>, glyph: 'check' },
      ]
    : [
        { k: 'open', text: <>Tap the <b>Share</b> button, then <b>Open in Safari</b>.</>, glyph: 'share' },
        { k: 'copy', text: <>No Safari option? Copy the link below and paste it into Safari.</>, glyph: 'copy' },
        { k: 'again', text: <>In Safari, come back here and tap Install again.</>, glyph: 'refresh' },
      ]

  return (
    <>
      <div className="sheet-back ig-back" onClick={onClose} />
      <div className="sheet ig-sheet" role="dialog" aria-modal="true" aria-label="Install this app">
        <div className="sheet-grab" />
        <div className="sheet-head">
          {env.canAddToHome ? 'Add to your home screen' : 'Open in Safari first'}
          <button className="sheet-clear" onClick={onClose}>Done</button>
        </div>
        <div className="sheet-body">
          {!env.canAddToHome && (
            <div className="ig-note">
              You're viewing this inside another app. iPhone can only install from Safari.
            </div>
          )}
          <ol className="ig-steps">
            {steps.map((s, i) => (
              <li className="ig-step" key={s.k}>
                <span className="ig-num">{i + 1}</span>
                <span className="ig-text">{s.text}</span>
                <span className="ig-glyph"><Icon name={s.glyph} size={17} /></span>
              </li>
            ))}
          </ol>
          {!env.canAddToHome && (
            <button className="btn btn-ghost ig-copy" onClick={copyLink}>
              <Icon name={copied ? 'check' : 'copy'} size={15} />
              {copied ? 'Link copied' : 'Copy link'}
            </button>
          )}
        </div>
      </div>
    </>
  )
}
