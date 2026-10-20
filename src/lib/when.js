// WHEN SOMETHING HAPPENED — whenLabel, re-exported by format.js. Its own file
// so the buyer's pages (Public.jsx, via share.js) do not load the desk's
// helpers to say "Sent 3:42 PM".
import { firmLocale } from './locale.js'

export const TIME = { hour: 'numeric', minute: '2-digit' }

/**
 * WHEN SOMETHING HAPPENED. The one function. Every screen uses it.
 *
 * The rule, and the reason for it:
 *
 *   under an hour   "12 min ago"            still unfolding; the clock time
 *                                           would make you do the subtraction
 *   today           "3:42 PM"
 *   yesterday       "Yesterday, 3:42 PM"
 *   this year       "5 Aug, 3:42 PM"
 *   older           "5 Aug 2025, 3:42 PM"
 *
 * Relative time is only honest while the answer is "just now". Past that it
 * destroys the thing people actually need. "48h ago" on a call cannot be lined
 * up against what the client says, cannot be repeated back to them, cannot be
 * compared to the portal's own report, and cannot even be read twice with the
 * same meaning — it changes every time the page renders. An agent looking at a
 * lead's history needs to say "you called him Tuesday evening", and no amount
 * of arithmetic in their head turns "2d ago" into that reliably.
 *
 * The opposite mistake is a full timestamp. Nobody needs seconds, a timezone
 * or the year on something from this morning, and a wall of ISO strings is
 * unreadable in a timeline. So: the smallest form that still pins the moment.
 */
export function whenLabel(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  // floor, not round: at 30 seconds `round` gives 1, so a thing that just
  // happened reads "1 min ago" instead of "just now".
  const mins = Math.floor((Date.now() - d.getTime()) / 60000)
  // Future stamps happen: a portal in another timezone, a clock a few seconds
  // fast. Reading them as "in 3 minutes" is worse than reading the time.
  if (mins >= 0 && mins < 60) return mins < 1 ? 'just now' : `${mins} min ago`

  const now = new Date()
  const time = d.toLocaleTimeString(firmLocale().numberLocale, TIME)
  const sameDay = (a, b) => a.toDateString() === b.toDateString()
  if (sameDay(d, now)) return time
  const yesterday = new Date(now); yesterday.setDate(now.getDate() - 1)
  if (sameDay(d, yesterday)) return `Yesterday, ${time}`

  const date = d.toLocaleDateString(firmLocale().numberLocale, d.getFullYear() === now.getFullYear()
    ? { day: 'numeric', month: 'short' }
    : { day: 'numeric', month: 'short', year: 'numeric' })
  return `${date}, ${time}`
}
