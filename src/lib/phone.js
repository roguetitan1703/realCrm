// ---- Phone numbers: the one module (docs/specs/phone.md) ----------------------
// Every phone is stored as exact E.164 ("+919876543210"), and two numbers are
// the same person only when those strings are equal. Reading what someone typed
// or what a portal sent is libphonenumber-js's job, with the firm's country as
// the default for a number that carries no country code. The backend and every
// screen import this file, so a number is read one way everywhere.
//
// Uses the "max" metadata: full per-country number patterns. The default "min"
// set checks little more than length, and passed numbers max refuses (an
// Indian "+91 22 1234 5678"). One set for the server and the bundle, so a
// number the form accepts is a number the server stores.
import { parsePhoneNumberFromString, getCountryCallingCode, validatePhoneNumberLength, isSupportedCountry, getCountries } from 'libphonenumber-js/max'
import { firmLocale } from './locale.js'
export { isE164, waDigits, waLink, telLink } from './phoneLink.js'

/**
 * Read a typed, imported or stored number.
 *   { ok: true,  e164, country }        a valid number
 *   { ok: false, reason, raw }          'empty' | 'letters' | 'too_short' | 'too_long' | 'invalid'
 * `country` is the ISO code used when the number has no country code of its
 * own (the firm's: locale.country). A number with "+" or "00" keeps its own.
 * A number written with the country code but no "+" ("919876543210") is read
 * as that country's when the digits do not make a valid national number.
 */
export function readPhone(raw, country = firmLocale().country) {
  const typed = String(raw ?? '').trim()
  if (!typed) return { ok: false, reason: 'empty', raw: typed }
  // Letters are never a phone number ("98765 4321v"); a guess would invent one.
  if (/[a-z]/i.test(typed)) return { ok: false, reason: 'letters', raw: typed }
  const s = typed.replace(/^\s*00/, '+')
  const p = parsePhoneNumberFromString(s, country)
  if (p && p.isValid()) return { ok: true, e164: p.number, country: p.country || null }
  let len
  try { len = validatePhoneNumberLength(s, country) } catch { len = undefined }
  const reason = len === 'TOO_SHORT' ? 'too_short' : len === 'TOO_LONG' ? 'too_long' : 'invalid'
  return { ok: false, reason, raw: typed }
}

const COUNTRY_NAME = (country) => {
  try { return new Intl.DisplayNames(['en'], { type: 'region' }).of(country) || country } catch { return country }
}

/** Why a number cannot be saved, in words a person can act on. '' when it can, or nothing was typed. */
export function phoneProblem(raw, country = firmLocale().country) {
  const r = readPhone(raw, country)
  if (r.ok || r.reason === 'empty') return ''
  if (r.reason === 'letters') return 'A phone number has no letters'
  const where = String(raw).trim().startsWith('+') || String(raw).trim().startsWith('00') ? '' : ` for ${COUNTRY_NAME(country)}`
  if (r.reason === 'too_short') return `Too short${where}`
  if (r.reason === 'too_long') return `Too long${where}`
  return `Not a valid number${where}`
}

/** What a portal, a sheet or a webhook sent, as it is kept: E.164 when it can be
 *  read, exactly as received when it cannot (never guessed, never matched). */
export function keepPhone(raw, country = firmLocale().country) {
  const typed = String(raw ?? '').trim()
  if (!typed) return null
  return toE164(typed, country) || typed
}

/** The E.164 form, or null when the number cannot be read with confidence. */
export function toE164(raw, country = firmLocale().country) {
  const r = readPhone(raw, country)
  return r.ok ? r.e164 : null
}

/**
 * A stored number for a person to read: "+91 98765 43210", "+971 50 123 4567".
 * Always with its country code, so a foreign number never reads as a local
 * one. A value that cannot be read is shown exactly as stored. `country` is
 * only the reading hint for a value that is not E.164 yet; the browser
 * defaults to the firm's (the server must pass it).
 */
export function formatPhone(stored, country = firmLocale().country) {
  const s = String(stored ?? '').trim()
  if (!s) return ''
  const r = readPhone(s, country)
  if (!r.ok) return s
  return parsePhoneNumberFromString(r.e164).formatInternational()
}

/** "+91" for a country code, for the picker. */
export function callingCode(country) {
  try { return `+${getCountryCallingCode(country)}` } catch { return '' }
}

/** A country code the picker offers ("IN", "AE"). */
export function isPhoneCountry(country) {
  return typeof country === 'string' && /^[A-Z]{2}$/.test(country) && isSupportedCountry(country)
}

/** Every country the picker offers, by name, with its calling code. */
export function phoneCountries() {
  return getCountries()
    .map(code => ({ code, name: COUNTRY_NAME(code), dial: callingCode(code) }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

/** A person as a list shows them: their name, else their number (format.js's
 *  comment above the old copy says why a number and never an invented name). */
export function personLabel(p) {
  if (!p) return '—'
  const n = String(p.name || '').trim()
  if (n) return n
  return formatPhone(p.phone) || '—'
}
