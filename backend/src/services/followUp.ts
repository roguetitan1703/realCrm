/**
 * WHAT A FOLLOW-UP IS: its kind ("Site visit", "Call"), without the person.
 *
 * Until 25 Sep the schedule form stored `action` as "<kind> — <lead name>", so
 * anything that printed it said the person's name back to them beside their
 * own name. It now stores the kind alone; older rows still carry the name,
 * and this strips it. The browser's twin is followUpAction() in format.js.
 */
export function followUpKind(fu: any): string {
  const raw = String(fu?.action || '').trim();
  if (!raw) return 'Follow-up';
  return raw.split(/\s+—\s+/)[0].trim() || raw;
}

/**
 * A BOOKING THE SERVER WILL NOT SAVE, and why — a 422 the client shows as is.
 *
 * `callback_needs_time`: a person moving a lead to Callback with no call
 * booked. 13 of 13 at bhumi and 30 of 30 at mahalaxmi (1 Nov) carried none:
 * the status said "ring them back" and nothing said when, so nothing could
 * call it late either. Refused rather than booked for them, because the only
 * time the server could pick is one nobody chose.
 */
export class BookingRefused extends Error {
  status = 422;
  code: string;
  constructor(code: string, message: string) { super(message); this.name = 'BookingRefused'; this.code = code; }
}

/** The 422 body for a refused booking, or null when `err` is something else. */
export function bookingRefusedBody(err: any) {
  return err instanceof BookingRefused ? { success: false, error: err.code, message: err.message } : null;
}
