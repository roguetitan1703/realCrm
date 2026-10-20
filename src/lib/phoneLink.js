// ---- A STORED number as a link (docs/specs/phone.md) ---------------------------
// Every readable number is stored as exact E.164, so a link needs no reading:
// wa.me and tel: take the stored string. Anything else stored is a number that
// could not be read, and gets no number in the link (WhatsApp asks who) rather
// than a guess. No libphonenumber here, so the buyer's pages can build their
// WhatsApp links without loading it; lib/phone.js re-exports these.

const E164 = /^\+[1-9]\d{6,14}$/

/** True when a stored value is exact E.164. */
export const isE164 = (stored) => E164.test(String(stored ?? ''))

/** The digits wa.me wants (country code and number), or '' when the stored value is not E.164. */
export const waDigits = (stored) => (isE164(stored) ? String(stored).slice(1) : '')

/** wa.me to a stored number. */
export function waLink(stored, text) {
  return `https://wa.me/${waDigits(stored)}${text != null ? `?text=${encodeURIComponent(text)}` : ''}`
}

/** tel: to a stored number, or '' when it is not E.164 (nothing to dial with confidence). */
export const telLink = (stored) => (isE164(stored) ? `tel:${stored}` : '')
