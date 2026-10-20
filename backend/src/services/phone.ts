/**
 * The server's side of the phone rule (docs/specs/phone.md; src/lib/phone.js
 * reads the numbers). What a writer or a lookup can want, and nothing else:
 *
 *   requirePhone  a person typed it (a form, the API): E.164, or a 422
 *                 phone_invalid with the reason. Blank is null.
 *   keepPhone     a portal, a webhook or a sheet sent it: E.164 when it can be
 *                 read, exactly as received when it cannot.
 *   editedPhone   an edit: requirePhone, except a number sent back unchanged.
 *   phoneKey      a lookup: E.164, or null — and a null key matches nobody.
 *
 * Each takes the firm's country (locale.country) for a number with no code.
 */
import { readPhone, toE164, keepPhone as keep, phoneProblem, isPlaceholderPhone } from '../../../src/lib/phone.js';

export class PhoneInvalidError extends Error {
  status = 422;
  code = 'phone_invalid';
  constructor(public field: string, public reason: string, message: string) { super(message); }
}

export function requirePhone(raw: unknown, country: string, field = 'phone'): string | null {
  const r = readPhone(raw, country);
  if (r.ok) return r.e164;
  if (r.reason === 'empty') return null;
  throw new PhoneInvalidError(field, r.reason, phoneProblem(raw, country));
}

/** An edit: a number sent back exactly as it is stored passes untouched (a
 *  form re-saving a record whose number was received unreadable is not typing
 *  it), anything else is read as typed. */
export function editedPhone(raw: unknown, stored: string | null | undefined, country: string, field = 'phone'): string | null {
  const s = String(raw ?? '').trim();
  if (stored && s === String(stored).trim()) return stored;
  return requirePhone(s, country, field);
}

export const keepPhone = (raw: unknown, country: string): string | null => keep(raw, country);

// Read as received (a lookup's value came from a portal, a sheet or a record),
// and a placeholder ("1234567890") is no key: it is stored, never matched.
export const phoneKey = (raw: unknown, country: string): string | null => {
  const k = toE164(raw, country, { received: true });
  return k && !isPlaceholderPhone(k, country) ? k : null;
};

/** The 422 body for a refused number, or null when `err` is something else. */
export function phoneInvalidBody(err: any) {
  return err instanceof PhoneInvalidError
    ? { success: false, error: 'phone_invalid', field: err.field, reason: err.reason, message: err.message }
    : null;
}
