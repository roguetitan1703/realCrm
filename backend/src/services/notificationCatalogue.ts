/**
 * ============================================================================
 * 🔔 EVERY ALERT THIS PRODUCT SENDS, IN ONE PLACE
 * ============================================================================
 * What each one is CALLED, WHO gets it, WHAT fires it, whether it reaches a
 * PHONE, and what — if anything — the firm can set to change it. Side by side,
 * so the whole alerting behaviour can be read at once and changed in one file.
 *
 * The same move `leadSegments.ts` made for the piles. The WORDS were already in
 * one place (`notificationCopy.ts`); the RULES were not — 36 `notify()` and
 * `notifyRoles()` call sites across store.ts, ingestion.ts and notifications.ts,
 * each deciding its own audience and its own `push: true`, with no list of them
 * anywhere. Nobody could answer "what do we send this desk in a day" by reading
 * code, and the answer turned out to be:
 *
 *   MEASURED, bhumi, 14 days to 2026-08-26 — 606 alerts for 216 arriving leads,
 *   2.8 per lead. The owner received 233 (16.6/day). FOUR OF SEVEN AGENTS HAVE
 *   READ ZERO of theirs — Mohit 0 of 72, Mukesh 0 of 64, Vinod 0 of 57,
 *   Ravish 0 of 43. The channel is not at risk of becoming noise; it is noise,
 *   and more than half the desk has stopped looking.
 *
 * TWO THINGS THAT TABLE MAKES OBVIOUS AND THE CALL SITES HID:
 *
 *   - `lead_new` and `lead_assigned` fired 216 and 216 over the SAME 216 links.
 *     One arriving lead, two alerts, every time.
 *   - `lead_untouched`, `lead_untouched_escalated` and `lead_stale_sla` are
 *     three types for one idea: nobody has responded yet.
 *
 * `gate` IS THE COLUMN THAT MATTERS. `notifications.ts` reads exactly ONE
 * setting in the whole file — `slaHours`. Everything marked `null` below is
 * ungated: the firm cannot turn it down, cannot turn it off, and has no control
 * on any screen that refers to it. That was 471 of the 606.
 *
 * THIS TABLE DESCRIBES WHAT HAPPENS TODAY, not what should. Every `push` value
 * below was read off the call site it replaces, so wiring this in changed the
 * behaviour of nothing. Turning the volume down is a separate decision, taken
 * in the open, by editing a column here.
 *
 * KEYS ARE STABLE. A type is stored on every historical row in `notifications`
 * and read by the client's icon map (`src/lib/notificationMeta.js`). Rename the
 * label; leave the key alone.
 * ============================================================================
 */

/** Who an alert is addressed to. Descriptive of the call site today. */
export type Audience =
  | 'assignee'        // the one person who now holds the record
  | 'previous'        // the person it was taken away from
  | 'desk'            // owners + managers, via notifyRoles
  | 'owner'           // the firm's owners only (feedWatch.ts asserts there is one)
  | 'actor';          // the person who did the thing (rare, and usually wrong)

export interface NotifKind {
  key: string;
  /** What a person would call it. Not shown yet; the Settings → Alerts section
   *  parked on 2026-08-26 is what will render these. */
  label: string;
  audience: Audience;
  /** What causes it, in one line. If this cannot be written in one line the
   *  alert is doing more than one job. */
  trigger: string;
  /** When it reaches a phone (spec §4). `drawer` never buzzes; everything
   *  else does, at its tier. A call site cannot decide this. */
  urgency: Urgency;
  /** Which test closes it (alertLifecycle.ts). Required: an alert with no
   *  close test is a pile that only grows. */
  closesWhen: CloseTest;
  /** Derived from urgency, kept for the readers of the old column. */
  push?: boolean;
  /** The settings key the firm can change to affect it, or null for "nothing
   *  on any screen controls this". */
  gate: string | null;
  /** Set when the type is still arriving from the DEPLOYED backend but no
   *  longer exists in this source tree. Kept so the catalogue describes what a
   *  desk actually receives, not what we wish it received. */
  deployedOnly?: true;
}

/**
 * WHEN IT BUZZES (docs/specs/notifications.md §4). The rule a person can say:
 * work HANDED to you buzzes now (assigned, moved, booked for you, came back);
 * reminders come at their time; the rest waits for the morning summary. Tried
 * on dev 13 Oct: a lead assigned by hand was held for 9 am, and the person
 * assigning it expected the phone to ring.
 *   now      — immediately, high priority: someone has to act now.
 *   at_time  — fired by the sweep when the thing comes due.
 *   morning  — held, and sent as one summary at the end of the night window.
 *   drawer   — never buzzes.
 * Nothing buzzes inside the night window; `now` and `at_time` raised there are
 * held to its end too, and dropped if their work was done in the meantime.
 */
export type Urgency = 'now' | 'at_time' | 'morning' | 'drawer';

/** The close tests alertLifecycle.ts knows. */
export const CLOSE_TESTS = ['lead_worked', 'lead_worked_desk', 'lead_routed', 'booking', 'owner_worked', 'agreement', 'share_work', 'buyer_ask', 'feed_alive', 'opened'] as const;
export type CloseTest = typeof CLOSE_TESTS[number];

/**
 * WHERE A NEWER ALERT STANDS FOR AN OLDER ONE (alertLifecycle.ts `superseded`).
 * By default any newer open alert under the same close test, to the same
 * person, about the same record, replaces the older: "assigned", then "still
 * waiting", then an SLA alert are one call to make. Under these tests only an
 * alert of the SAME type does. The share alerts say different things — "Sneha
 * is interested in Maple Court" is the business; "opened an expired link" or
 * "back on their link" is not — and a buyer opening an expired link closed
 * their unanswered interested alert, leaving the weaker one in the bell.
 * listing-pages.md §A.5 supersedes interested by interested only.
 */
export const SUPERSEDES_SAME_TYPE_ONLY: ReadonlySet<CloseTest> = new Set<CloseTest>(['share_work', 'buyer_ask']);

const K = (k: NotifKind): NotifKind => ({ ...k, push: k.urgency !== 'drawer' });

export const NOTIFICATIONS: NotifKind[] = [
  // ---- A lead arrives ------------------------------------------------------
  // ONE alert per arriving lead, to the person who now holds it. It was two:
  // lead_new fired at the desk over the same 216 links in the same fortnight.
  K({ key: 'lead_assigned', label: 'A lead was assigned to you', audience: 'assignee',
      trigger: 'agent_id set on a lead, by routing or by hand', urgency: 'now', closesWhen: 'lead_worked', gate: null }),
  K({ key: 'lead_assigned_bulk', label: 'Several leads were assigned to you', audience: 'assignee',
      // All 27 measured carried the link `?screen=leads` — an alert about
      // specific records that opens the unfiltered list.
      trigger: 'a bulk assign covering more than one record', urgency: 'now', closesWhen: 'lead_worked', gate: null }),
  K({ key: 'lead_unrouted', label: 'A lead arrived with nobody to take it', audience: 'desk',
      trigger: 'a lead is created and the rota is empty or auto-assign is off', urgency: 'now', closesWhen: 'lead_routed', gate: null }),
  K({ key: 'lead_repeat', label: 'Someone enquired again', audience: 'assignee',
      trigger: 'a second enquiry lands on an existing lead, outside the 6-hour session window', urgency: 'now', closesWhen: 'lead_worked', gate: null }),

  // ---- It changed hands ----------------------------------------------------
  K({ key: 'lead_reassigned', label: 'A lead moved to you', audience: 'assignee',
      trigger: 'agent_id changes on a lead that already had one', urgency: 'now', closesWhen: 'lead_worked', gate: 'reassign_idle_days' }),
  K({ key: 'owner_assigned', label: 'An owner was assigned to you', audience: 'assignee',
      trigger: 'agent_id set on a calling-queue row', urgency: 'now', closesWhen: 'owner_worked', gate: null }),
  K({ key: 'owner_reassigned', label: 'An owner moved to you', audience: 'assignee',
      trigger: 'agent_id changes on a calling-queue row', urgency: 'now', closesWhen: 'owner_worked', gate: 'owner_reassign_idle_days' }),
  K({ key: 'lead_reassign_loop', label: 'A lead keeps being reassigned', audience: 'desk',
      trigger: 'hand-off count past the number set in Routing', urgency: 'morning', closesWhen: 'opened', gate: 'reassign_alert_count' }),
  K({ key: 'owner_reassign_loop', label: 'An owner keeps being reassigned', audience: 'desk',
      trigger: 'the same, over the calling queue', urgency: 'morning', closesWhen: 'opened', gate: 'owner_reassign_alert_count' }),

  // ---- Nobody has responded ------------------------------------------------
  // ONE TYPE. It was three -- lead_untouched, lead_untouched_escalated and
  // lead_stale_sla -- for one idea, split across two files, and the manager's
  // copy fired at a multiple of slaHours that nobody sets.
  K({ key: 'lead_untouched', label: 'A lead is still waiting', audience: 'assignee',
      trigger: 'no contact recorded within slaHours of arrival', urgency: 'morning', closesWhen: 'lead_worked', gate: 'slaHours' }),

  K({ key: 'followup_due', label: 'A booked next step is due', audience: 'assignee',
      trigger: 'a booked follow-up falls due (within the last 24 hours)', urgency: 'at_time', closesWhen: 'booking', gate: null }),
  K({ key: 'site_visit_reminder', label: 'A site visit is coming up', audience: 'assignee',
      trigger: 'a booked site visit approaches', urgency: 'at_time', closesWhen: 'booking', gate: null }),
  K({ key: 'calendar_task_assigned', label: 'A task was assigned to you', audience: 'assignee',
      trigger: 'a calendar task is created against a user', urgency: 'now', closesWhen: 'booking', gate: null }),
  // A rent runs out. The one alert about inventory: a tenancy ends whether or
  // not anyone opens the record, and a renewal is the business to be had.
  K({ key: 'agreement_ending', label: 'A rent agreement ends in 30 days', audience: 'assignee',
      trigger: 'an active rent agreement is 30 days from its end date — once per agreement; the desk if nobody is on it',
      urgency: 'morning', closesWhen: 'agreement', gate: null }),
  // ---- A buyer on a shared link (docs/specs/listing-pages.md §A) -----------
  // To the lead's CURRENT holder, worked out when the buyer acts, else the
  // link's creator, else the desk. `share_work` closes them: on a lead, when
  // contact is logged after the alert or a fresh link is sent to that lead; on
  // a tap with no lead (an I'm interested press, or Talk to us on an expired
  // link), when Add as lead or attach puts it on a lead, or the link's sender
  // makes a newer link carrying that flat.
  K({ key: 'share_interested', label: "A buyer tapped I'm interested", audience: 'assignee',
      // One per flat per link per firm-day; the tap row is kept every time.
      trigger: "I'm interested pressed on a shared link, at most one per flat per link per day", urgency: 'now', closesWhen: 'share_work', gate: null }),
  K({ key: 'share_expired_open', label: 'A buyer opened an expired link', audience: 'assignee',
      trigger: 'Talk to us pressed on an expired shared link, at most one per link per day', urgency: 'now', closesWhen: 'share_work', gate: null }),
  K({ key: 'share_returned', label: 'A buyer is back on their link', audience: 'assignee',
      // Drawer to start with (spec §6: a type earns its push). A buyer looking
      // again is worth seeing; whether it is worth a buzz is for the numbers.
      trigger: 'a lead opens the link sent to them on a new day, at most one per lead per day', urgency: 'drawer', closesWhen: 'share_work', gate: null }),
  K({ key: 'share_number_held', label: 'A colleague tried to send homes to your lead', audience: 'assignee',
      // §A.1d step 4: the number is not duplicated; the person holding it is told.
      // To the desk instead when nobody active holds it; contact by anyone closes it.
      trigger: "Send or Add as lead used a number that is already a lead (this person's, or nobody active's)", urgency: 'drawer', closesWhen: 'lead_worked_desk', gate: null }),

  // ---- A buyer's form on a link or the catalogue (listing-pages.md §A.6) ---
  // To the lead's holder, else the link's sender, else the desk (buyerAsks.ts,
  // which logs a zero). ONE ARRIVAL, ONE ALERT: a form that makes or names a
  // lead sends this alert only — no lead_assigned, lead_unrouted or
  // lead_repeat beside it (landEnquiry announce: false) — so it says whether
  // the lead is new, unassigned or was closed. `buyer_ask` closes it: what
  // share_work closes, and, for a lead that arrived with nobody holding it,
  // somebody now holding it (the desk's assign-me lifecycle). The same buyer
  // asking again the same day folds into the open alert ("asked 3×").
  K({ key: 'buyer_callback', label: 'A buyer asked for a call back', audience: 'assignee',
      trigger: 'Call me back sent on a shared link or the catalogue; a lead the form made is booked a call for now, or the next opening', urgency: 'now', closesWhen: 'buyer_ask', gate: null }),
  K({ key: 'buyer_visit', label: 'A buyer asked to visit', audience: 'assignee',
      trigger: 'Book a visit sent on a shared link or the catalogue: a requested slot inside working hours, to confirm', urgency: 'now', closesWhen: 'buyer_ask', gate: null }),
  K({ key: 'buyer_homes', label: 'A buyer asked for homes like these', audience: 'assignee',
      trigger: 'New homes like these sent on a shared link or the catalogue', urgency: 'now', closesWhen: 'buyer_ask', gate: null }),
  K({ key: 'buyer_new_homes', label: 'New homes match a buyer', audience: 'assignee',
      // A sales opening, not a fire: the morning summary.
      trigger: "a home matching a buyer's New homes like these enters the catalogue or becomes Available again — at most once a day per lead", urgency: 'morning', closesWhen: 'share_work', gate: null }),

  // ---- A portal stopped sending (feedWatch.ts) ----------------------------
  // bhumi's 99acres sent nothing from 12 Sep to 9 Oct and nobody noticed for
  // four weeks: a silent portal is leads the firm pays for, lost, and blamed on
  // the CRM. ONE open alert per connection, to the owners; a push closes it
  // (`feed_alive`), pausing or deleting the connection closes it `not_yours`.
  // Raised again only after that one has closed. The rule is FEED_SILENT below.
  K({ key: 'feed_silent', label: 'A portal has sent nothing for a week', audience: 'owner',
      trigger: 'an active connection whose last push is older than FEED_SILENT.silentDays, after at least FEED_SILENT.minPushes in the FEED_SILENT.priorDays before it',
      urgency: 'morning', closesWhen: 'feed_alive', gate: null }),

  K({ key: 'remark_added', label: 'Someone left a remark', audience: 'assignee',
      // Demoted to the drawer. Somebody typing a note on your record is worth
      // knowing and is not worth a buzz.
      trigger: 'a remark is written on a record somebody else holds', urgency: 'drawer', closesWhen: 'opened', gate: null }),
];

/**
 * WHEN A FEED COUNTS AS SILENT (docs/PLAN.md, feed watch). Silent: no push for
 * `silentDays`. Worth an alert only for a feed that was alive — at least
 * `minPushes` pushes in the `priorDays` ending at its last push — so a portal
 * that sends twice a month, or a connection set up and never used, is not
 * announced every week.
 */
export const FEED_SILENT = { silentDays: 7, priorDays: 28, minPushes: 8 } as const;

const BY_KEY = new Map(NOTIFICATIONS.map(k => [k.key, k]));

/**
 * Types no longer sent but still sitting, open, in desks' tables. They need a
 * close test like any other, or the first run would leave them in the bell for
 * ever. Never sent again, so no urgency.
 */
export const LEGACY_CLOSE: Record<string, CloseTest> = {
  lead_stale_sla: 'lead_worked',
  lead_retry_due: 'lead_worked',
  lead_new: 'lead_worked_desk',
  lead_untouched_escalated: 'lead_worked_desk',
  lead_repeat_rejected: 'lead_worked_desk',
  followup_set: 'booking',
  lead_moved_away: 'opened',
};

export const closeTestFor = (key: string): CloseTest =>
  BY_KEY.get(key)?.closesWhen ?? LEGACY_CLOSE[key] ?? 'opened';

/** An undeclared type does not buzz — see `pushes` below. */
export const urgencyFor = (key: string): Urgency => BY_KEY.get(key)?.urgency ?? 'drawer';

export const notifKind = (key: string): NotifKind | undefined => BY_KEY.get(key);

/**
 * Does this type reach a phone?
 *
 * ONE ANSWER, HERE. Every call site used to carry its own `push: true`, so
 * whether an alert buzzed a pocket was a property of the line of code that
 * happened to send it rather than of the alert. An unknown type does NOT push:
 * a type nobody has declared is a type nobody has decided about, and the safe
 * side of that is the drawer.
 */
export const pushes = (key: string): boolean => BY_KEY.get(key)?.push ?? false;

/**
 * Types this tree can send that are not declared above. Called at boot so a new
 * alert cannot be invented at a call site and quietly start pushing — the way
 * the twenty already there were.
 */
export function undeclared(types: string[]): string[] {
  return types.filter(t => !BY_KEY.has(t));
}
