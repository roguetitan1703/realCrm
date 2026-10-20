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
import { parsePhoneNumberFromString, getCountryCallingCode } from 'libphonenumber-js/max'

/**
 * Read a typed, imported or stored number.
 *   { ok: true,  e164, country }        a valid number
 *   { ok: false, reason, raw }          'empty' | 'letters' | 'invalid'
 * `country` is the ISO code used when the number has no country code of its
 * own (the firm's: locale.country). A number with "+" or "00" keeps its own.
 * A number written with the country code but no "+" ("919876543210") is read
 * as that country's when the digits do not make a valid national number.
 */
export function readPhone(raw, country = 'IN') {
  const typed = String(raw ?? '').trim()
  if (!typed) return { ok: false, reason: 'empty', raw: typed }
  // Letters are never a phone number ("98765 4321v"); a guess would invent one.
  if (/[a-z]/i.test(typed)) return { ok: false, reason: 'letters', raw: typed }
  const s = typed.replace(/^\s*00/, '+')
  const p = parsePhoneNumberFromString(s, country)
  if (p && p.isValid()) return { ok: true, e164: p.number, country: p.country || null }
  return { ok: false, reason: 'invalid', raw: typed }
}

/** The E.164 form, or null when the number cannot be read with confidence. */
export function toE164(raw, country = 'IN') {
  const r = readPhone(raw, country)
  return r.ok ? r.e164 : null
}

/** A number for a person to read: national format in the firm's own country, international otherwise. Unreadable: as stored. */
export function formatPhone(stored, country = 'IN') {
  const s = String(stored ?? '').trim()
  if (!s) return ''
  const p = parsePhoneNumberFromString(s.replace(/^00/, '+'), country)
  if (!p || !p.isValid()) return s
  return p.country === country ? p.formatNational() : p.formatInternational()
}

/** The digits wa.me wants (country code and number, nothing else), or '' when unreadable. */
export function waDigits(stored, country = 'IN') {
  const e = toE164(stored, country)
  return e ? e.slice(1) : ''
}

/** "+91" for a country code, for the picker. */
export function callingCode(country) {
  try { return `+${getCountryCallingCode(country)}` } catch { return '' }
}
