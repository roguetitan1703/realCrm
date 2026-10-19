// ============================================================================
// SHARING — the small pieces every share screen needs, in one place
// ============================================================================
// docs/specs/listing-pages.md §A. A link is a set of homes, optionally bound to
// a lead, with an expiry fixed when it was made. These helpers are read by the
// Send sheet, Links I've shared, the lead's homes-sent section, Add as lead and
// the buyer's pages, so a link's state reads the same everywhere.
// ============================================================================

import { whenLabel } from './format.js'
import { firmLocale } from './locale.js'

// ── The visitor's device, on the buyer's pages ──────────────────────────────
// A random id this browser keeps for this firm's pages. Not a fingerprint: a
// different phone, another browser or cleared data is a new device, which is
// the truth. Storage can be blocked (private mode, an in-app browser that
// refuses it); then the visit is simply not recognised again.
export function deviceId(tenant) {
  const key = `nv_device_${tenant}`
  try {
    const have = window.localStorage.getItem(key)
    if (have) return have
    const made = randomId()
    window.localStorage.setItem(key, made)
    return made
  } catch {
    return ''
  }
}

function randomId() {
  try {
    if (crypto?.randomUUID) return crypto.randomUUID()
    const b = crypto.getRandomValues(new Uint8Array(16))
    return Array.from(b, x => x.toString(16).padStart(2, '0')).join('')
  } catch {
    return `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`
  }
}

// ── A number from the phone's own contacts ──────────────────────────────────
// The Contact Picker API exists on Android Chrome and nowhere else that
// matters (iPhone has none). Where it is missing the button is not drawn.
export const canPickContact = () =>
  typeof navigator !== 'undefined' && !!navigator.contacts?.select && typeof window !== 'undefined' && 'ContactsManager' in window

/**
 * Opens the picker. Resolves to `{ name, phone }`, to `null` when the person
 * closed it without choosing, and rejects with `'denied'` when the browser
 * refused (permission or policy) — the caller says so and the typed path
 * stays open.
 */
export async function pickContact() {
  try {
    const got = await navigator.contacts.select(['name', 'tel'], { multiple: false })
    const c = got?.[0]
    if (!c) return null
    return { name: (c.name?.[0] || '').trim(), phone: (c.tel?.[0] || '').trim() }
  } catch (e) {
    throw 'denied'
  }
}

/** Reads the clipboard for a phone number. `null` when there is none or the
 *  browser will not say; the caller falls back to the box. */
export async function pasteNumber() {
  try {
    const t = await navigator.clipboard.readText()
    const m = String(t || '').match(/\+?[\d][\d\s()-]{7,}\d/)
    return m ? m[0].replace(/[\s()-]/g, '') : null
  } catch {
    return null
  }
}

export const canPaste = () => typeof navigator !== 'undefined' && !!navigator.clipboard?.readText

/** Enough digits to be a phone number at all. The server normalises it. */
export const looksLikePhone = (v) => String(v || '').replace(/\D/g, '').length >= 10

// ── What a link is doing ────────────────────────────────────────────────────
export const LINK_STATE_LABEL = { active: 'Live', expired: 'Expired', off: 'Turned off', stopped: 'Stopped' }

/** "Expires 2 Nov" / "Expired 19 Oct" — a date, never a countdown. */
export function expiryLabel(link) {
  if (!link?.expiresAt) return ''
  const d = new Date(link.expiresAt)
  if (isNaN(d.getTime())) return ''
  const day = d.toLocaleDateString(firmLocale().numberLocale, { day: 'numeric', month: 'short' })
  return (link.state === 'expired' || d < new Date()) ? `Expired ${day}` : `Expires ${day}`
}

/** The state of one sent home, as the lead's record shows it. */
export function sentHomeLine(s) {
  // A home the buyer asked about from the catalogue was never sent to them.
  const parts = [s.sentAt || s.link ? (s.sentAt ? `Sent ${whenLabel(s.sentAt)}` : 'Sent') : 'Enquired']
  // Opens of this home's own page. Opens of the list it was sent in are a
  // different number and read as one, quietly, after it.
  if (s.opens > 0) parts.push(`Opened ${s.opens}×`)
  if (s.opens > 0 && s.lastOpenedAt) parts.push(`last ${whenLabel(s.lastOpenedAt)}`)
  if (s.linkOpens > 0) parts.push(`list opened ${s.linkOpens}×`)
  return parts.join(' · ')
}

/** 409 lead_held_by, in words. `holderName` is a person, or "the office" for a
 *  number that is an unassigned lead or held by someone no longer active. */
export function heldText(holderName) {
  const h = String(holderName || '').trim()
  if (!h) return { title: 'This number is another agent’s lead', sub: 'They have been told.' }
  if (/^the office$/i.test(h)) return { title: 'This number is already a lead with the office', sub: 'Ask your manager to assign it.' }
  return { title: `This number is ${h}'s lead`, sub: `${h.split(' ')[0]} has been told.` }
}

/** Refusals the share screens answer in words of their own. */
export const refusal = (err) => {
  const code = err?.body?.error || err?.body?.code || ''
  return { status: err?.status || 0, code, holderName: err?.body?.holderName || '' }
}

/** Opens WhatsApp from a URL the server built. Never a new tab on a phone:
 *  that leaves an empty tab behind when WhatsApp takes over. */
export function openWa(url) {
  if (!url) return
  const phone = typeof window !== 'undefined' && window.matchMedia?.('(max-width: 1023px)').matches
  if (phone) window.location.href = url
  else window.open(url, '_blank', 'noopener')
}
