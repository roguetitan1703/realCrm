// ============================================================================
// THE FIRM'S LOCALE — money, phone numbers and bedroom words, in one place
// ============================================================================
// Every firm on this system was in India, so ₹, lakh/crore, +91 and "BHK" were
// written straight into a dozen formatters on both sides of the wire. A firm
// elsewhere now says how it counts in its settings row (crm_settings `default`,
// key `locale`):
//
//     locale: { country: 'US', currency: 'USD', numberLocale: 'en-US',
//               phoneCountry: '1', rooms: 'bed' }
//
// Absent — or any one field absent — means India, field by field. A firm that
// never set it sees exactly what it saw before this file existed: that is the
// contract, and the INR branches below reproduce the old formatters byte for
// byte rather than approximating them.
//
// The timezone is NOT here. It already lives in settings as `timezone`
// (backend store.ts deskConfigOf) and is read from there.
//
// Shared by the frontend and the backend, like propertyFields.js. Every
// function takes the locale as its last argument. The browser may omit it and
// gets the firm the tab is signed into (setFirmLocale, called by the store from
// the settings it loaded — one tab is one workspace, the URL decides which).
// The SERVER MUST PASS IT: it serves every firm from one process, never calls
// setFirmLocale, and an omitted argument there is always India.
// ============================================================================

export const INDIA_LOCALE = Object.freeze({
  country: 'IN', currency: 'INR', numberLocale: 'en-IN', phoneCountry: '91', rooms: 'BHK',
})

const str = (v) => (typeof v === 'string' && v.trim() ? v.trim() : null)

/** A stored `locale` value (or nothing) → a complete locale, India per missing field. */
export function resolveLocale(raw) {
  const r = raw && typeof raw === 'object' ? raw : {}
  const cc = String(r.phoneCountry ?? '').replace(/\D/g, '')
  return {
    country: str(r.country)?.toUpperCase() || INDIA_LOCALE.country,
    currency: str(r.currency)?.toUpperCase() || INDIA_LOCALE.currency,
    numberLocale: str(r.numberLocale) || INDIA_LOCALE.numberLocale,
    phoneCountry: cc || INDIA_LOCALE.phoneCountry,
    rooms: r.rooms === 'bed' ? 'bed' : INDIA_LOCALE.rooms,
  }
}

// The browser's firm. See the header: never set on the server.
let current = INDIA_LOCALE
export function setFirmLocale(raw) { current = resolveLocale(raw) }
export const firmLocale = () => current

// ---- Money -------------------------------------------------------------------

const SYMBOLS = { INR: '₹', USD: '$' }
export function currencySymbol(loc = current) {
  if (SYMBOLS[loc.currency]) return SYMBOLS[loc.currency]
  try {
    const part = new Intl.NumberFormat(loc.numberLocale, { style: 'currency', currency: loc.currency, currencyDisplay: 'narrowSymbol' })
      .formatToParts(0).find(p => p.type === 'currency')
    if (part) return part.value
  } catch { /* an unknown code falls through to itself */ }
  return loc.currency + ' '
}

const lakhs = (loc) => loc.currency === 'INR'

/**
 * An amount split into the number to show and its unit. India: k / L / Cr.
 * Everywhere else: K / M / B.
 *
 * Two decimals, trailing zeros dropped by String() — ₹2.25L, not ₹2L over a
 * stored ₹2,25,000. No scale guessing: a stored value is the full amount.
 */
export function moneyParts(v, loc = current) {
  const steps = lakhs(loc)
    ? [['Cr', 10000000], ['L', 100000], ['k', 1000], ['', 1]]
    : [['B', 1000000000], ['M', 1000000], ['K', 1000], ['', 1]]
  // The unit is chosen on the ROUNDED figure: 99,995 rounds to 100 thousand,
  // which is ₹1L, not "₹100k" — and $999,995 is $1M, not "$1000K".
  const round = (d) => Math.round((v / d) * 100) / 100
  let i = steps.findIndex(([, d]) => v >= d)
  while (i > 0 && round(steps[i][1]) * steps[i][1] >= steps[i - 1][1]) i--
  const [unit, div] = steps[i]
  return { shown: round(div), unit }
}

/**
 * One amount, as the firm writes it.
 *
 *   compact (default)  the desk: ₹4.5k, ₹2.25L, ₹1.2Cr · $4.5K, $450K, $1.25M
 *   message            what a client is sent: ₹85 L, ₹1.20 Cr, ₹45,000 — the
 *                      WhatsApp templates always spaced the unit and kept two
 *                      places, and a firm's clients have been reading that.
 *                      Outside India it is the compact form.
 *
 * '' for anything that is not a positive amount, so a caller renders nothing.
 */
export function formatMoney(n, { perMonth = false, style = 'compact' } = {}, loc = current) {
  const v = Number(n)
  if (!isFinite(v) || v <= 0) return ''
  const sym = currencySymbol(loc)
  const tail = perMonth ? '/mo' : ''
  if (style === 'message' && lakhs(loc)) {
    if (v >= 10000000) return `${sym}${(v / 10000000).toFixed(2).replace(/\.00$/, '')} Cr${tail}`
    if (v >= 100000) return `${sym}${(v / 100000).toFixed(2).replace(/\.00$/, '')} L${tail}`
    return `${sym}${v.toLocaleString(loc.numberLocale)}${tail}`
  }
  const { shown, unit } = moneyParts(v, loc)
  return sym + shown + unit + tail
}

/** A range on one unit where both ends share it — "₹50–90L", not "₹50L–₹90L". */
export function formatMoneyRange(min, max, { perMonth = false } = {}, loc = current) {
  const a = moneyParts(min, loc), b = moneyParts(max, loc)
  const sym = currencySymbol(loc)
  const tail = perMonth ? '/mo' : ''
  return a.unit === b.unit
    ? `${sym}${a.shown}–${b.shown}${b.unit}${tail}`
    : `${sym}${a.shown}${a.unit}–${sym}${b.shown}${b.unit}${tail}`
}

/** The whole figure, grouped the firm's way: ₹45,00,000 · $4,500,000. */
export function moneyFull(n, loc = current) {
  return currencySymbol(loc) + Math.round(Number(n)).toLocaleString(loc.numberLocale)
}

/** A count or plain number, grouped the firm's way: 1,23,456 · 123,456. */
export function numberText(n, loc = current) {
  return Number(n || 0).toLocaleString(loc.numberLocale)
}

/**
 * A typed amount → the full number. India reads "45L", "1.2Cr", "25k".
 * Elsewhere "450K", "1.2M", "2B". A bare number is taken as written.
 */
export function parseMoneyText(v, loc = current) {
  if (v === null || v === undefined || v === '') return NaN
  if (typeof v === 'number') return v
  const s = String(v).trim()
  if (lakhs(loc)) {
    if (/cr/i.test(s)) return parseFloat(s) * 10000000
    if (/l/i.test(s)) return parseFloat(s) * 100000
    if (/k/i.test(s)) return parseFloat(s) * 1000
    return Number(s)
  }
  // The scale is the word straight after the number, nothing further on: the
  // "m" of "2500/mo" is a month, not a million. A word it does not know is NOT
  // read as no scale — "$1.2 Million" stored as $1 is a budget nobody can tell
  // from a real one — so it returns NaN and the caller treats it as unread.
  const m = s.replace(/,/g, '').match(/(\d+(?:\.\d+)?)\s*([a-z]*)/i)
  if (!m) return NaN
  const word = m[2].toLowerCase()
  if (!word) return parseFloat(m[1])
  const scale = SCALE_WORDS[word]
  return scale ? parseFloat(m[1]) * scale : NaN
}

const SCALE_WORDS = {
  k: 1e3, thousand: 1e3,
  m: 1e6, mm: 1e6, mn: 1e6, million: 1e6,
  b: 1e9, bn: 1e9, billion: 1e9,
}

// ---- Phone numbers -------------------------------------------------------------
// Both markets this supports have a 10-digit national number (India's mobiles,
// the North American plan), which is also why matching a lead by its last ten
// digits (findLeadByPhone) holds for either.

/** Any typed number → +<country><last ten digits>. '' when there are no digits. */
export function phoneE164(raw, loc = current) {
  const digits = String(raw || '').replace(/\D/g, '')
  return digits ? `+${loc.phoneCountry}${digits.slice(-10)}` : ''
}

/**
 * A stored number as a person reads it. Indian numbers are shown as stored,
 * as they always were. A North American one reads +1 512-555-0143.
 */
export function phoneLabel(raw, loc = current) {
  if (raw == null) return raw
  if (loc.phoneCountry !== '1') return raw
  const d = String(raw).replace(/\D/g, '')
  const ten = d.length === 11 && d.startsWith('1') ? d.slice(1) : d.length === 10 ? d : null
  return ten ? `+1 ${ten.slice(0, 3)}-${ten.slice(3, 6)}-${ten.slice(6)}` : raw
}

/**
 * Why a typed mobile number cannot be saved yet, in words a person can act
 * on, or '' when it can (or nothing is typed). The same ten-digit rule as
 * phoneE164 and looksLikePhone; said aloud, because a Save that is simply
 * disabled does not tell anyone what is wrong.
 */
export function phoneProblem(raw, loc = current) {
  const d = String(raw || '').replace(/\D/g, '')
  if (!d || d.length >= 10) return ''
  return loc.phoneCountry === '1' ? 'Enter a 10-digit phone number' : 'Enter a 10-digit mobile number'
}

/**
 * A number read on its own (the sender's number, a recipient), grouped so it
 * can be read back aloud: +91 98765 43210. Elsewhere phoneLabel; a number
 * that is not a clean ten digits stays as stored.
 */
export function phoneSpaced(raw, loc = current) {
  if (raw == null || loc.phoneCountry !== '91') return phoneLabel(raw, loc)
  const d = String(raw).replace(/\D/g, '')
  const ten = d.length === 12 && d.startsWith('91') ? d.slice(2) : d.length === 10 ? d : null
  return ten ? `+91 ${ten.slice(0, 5)} ${ten.slice(5)}` : raw
}

/** What a phone field's example shows. `india` is the field's own Indian
 *  example, kept as it was; `national` asks for the number without its code. */
export function phonePlaceholder(india, { national = false } = {}, loc = current) {
  if (loc.phoneCountry === '91') return india
  if (loc.phoneCountry === '1') return national ? '512 555 0143' : '+1 512 555 0143'
  return national ? '' : `+${loc.phoneCountry}`
}

// ---- Bedrooms --------------------------------------------------------------------
// The STORED token never changes ('1rk', '2', '5plus', and legacy text like
// "3 BHK Apartment"); only the words a person sees do. A US firm reads
// "3 bed" and "Studio" over exactly the values an Indian firm reads as
// "3 BHK" and "1 RK".

/** A bedroom token → its label: '3' → "3 BHK" / "3 bed". */
export function roomLabel(value, loc = current) {
  // Older rows carry "2 BHK" as text; without this they read "2 BHK BHK".
  const v = String(value).trim().replace(/\s*bhk$/i, '').toLowerCase()
  if (loc.rooms === 'bed') {
    if (v === '1rk') return 'Studio'
    if (v === '5plus') return '5+ bed'
    return `${v} bed`
  }
  if (v === '1rk') return '1 RK'
  if (v === '5plus') return '5+ BHK'
  return `${v} BHK`
}

/** The heading over a bedroom picker. */
export const roomsHeading = (loc = current) => (loc.rooms === 'bed' ? 'Beds' : 'BHK')

/** Free text that may name a config ("3 BHK Apartment") in the firm's words. */
export function roomsText(text, loc = current) {
  if (loc.rooms !== 'bed' || typeof text !== 'string') return text
  return text
    .replace(/(\d+(?:\.5)?)(\+?)\s*B\.?H\.?K\b(\+?)/gi, (m, n, a, b) => `${n}${a || b} bed`)
    .replace(/\b1\s*RK\b/gi, 'Studio')
    .replace(/(\d+(?:\.5)?)\s*bds?\b/gi, '$1 bed')
}

/** The pattern that reads a bedroom count out of text, in the firm's words too. */
export function roomsPattern(loc = current) {
  return loc.rooms === 'bed'
    ? /(\d+(?:\.5)?)\s*(?:bhk|bed(?:room)?s?|bds?|br)\b/
    : /(\d+(?:\.5)?)\s*bhk/
}
