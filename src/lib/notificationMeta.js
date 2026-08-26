// How a notification LOOKS. One place, keyed on the type the row already
// carries — the server sends `type`, so nothing new has to travel.
//
// Icons live here rather than inside the message because they were inside the
// message: six different emoji sat at the front of six different titles, next
// to a drawer that already draws its own dot and layout. Two icons per row,
// one of them a character in a sentence, and no rule about which types got one.
//
// See docs/specs/notifications.md.

/** type → { icon, tone }. Tone drives colour only: it never adds a word. */
const META = {
  lead_assigned: { icon: 'userPlus', tone: 'info' },
  lead_assigned_bulk: { icon: 'userPlus', tone: 'info' },
  lead_new: { icon: 'leads', tone: 'info' },
  lead_unrouted: { icon: 'alert', tone: 'urgent' },
  lead_reassigned: { icon: 'switch', tone: 'info' },
  lead_moved_away: { icon: 'switch', tone: 'info' },
  // A manager's alert, not a hand-off notice — urgent, like the SLA escalation
  // it sits beside. Deliberately not an Assignments-tab type below: nothing has
  // been assigned to the person reading it.
  lead_reassign_loop: { icon: 'alert', tone: 'urgent' },
  owner_reassign_loop: { icon: 'alert', tone: 'urgent' },
  lead_untouched: { icon: 'clock', tone: 'attention' },
  lead_untouched_escalated: { icon: 'alert', tone: 'urgent' },
  lead_retry_due: { icon: 'phone', tone: 'attention' },
  followup_set: { icon: 'calendar', tone: 'info' },
  followup_due: { icon: 'clock', tone: 'attention' },
  site_visit_reminder: { icon: 'mapPin', tone: 'attention' },
  calendar_task_assigned: { icon: 'calendar', tone: 'info' },
  remark_added: { icon: 'note', tone: 'info' },
  owner_assigned: { icon: 'userPlus', tone: 'info' },
  owner_reassigned: { icon: 'switch', tone: 'info' },
  // RETIRED TYPES KEEP THEIR FACE. Nothing sends these any more, but every row
  // already in a drawer still carries the type, and a live desk should not see
  // its history turn into a column of generic bells. Removed 26 Aug: lead_new
  // (the same event as lead_assigned, 216 and 216 over one set of links),
  // lead_untouched_escalated and lead_stale_sla (three types for one idea),
  // lead_retry_due (the pile is gone), lead_moved_away and followup_set (told
  // people what they had just done), lead_repeat_rejected (folded into
  // lead_repeat, and its link went to a path this app does not have).
  lead_stale_sla: { icon: 'clock', tone: 'attention' },
}

const FALLBACK = { icon: 'bell', tone: 'info' }

export const notifMeta = (type) => META[type] || FALLBACK

/** Types that belong under the drawer's Assignments tab.
 *  This used to be `title.includes('assign')` — a tab that reads the copy, and
 *  therefore empties the day the copy changes. */
const ASSIGNMENT_TYPES = new Set([
  'lead_assigned', 'lead_assigned_bulk', 'lead_reassigned',
  'calendar_task_assigned', 'owner_assigned', 'owner_reassigned',
])
export const isAssignment = (n) => ASSIGNMENT_TYPES.has(n?.type)

/**
 * Strip decoration from a stored title.
 *
 * 728 notifications were written with an emoji at the front. They are not
 * rewritten and not deleted — an emoji leading a title is decoration, not
 * content, so dropping it at render loses nothing and every historic row lines
 * up with the new ones immediately. The wording stays exactly as it was sent,
 * which is the honest thing to show.
 */
export const cleanTitle = (t) =>
  String(t || '').replace(/^[\p{Extended_Pictographic}️‍\s]+/u, '').trim()
