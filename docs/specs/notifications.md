# Notifications — an alert is open work

**Status:** 🧭 decided 12 Oct, not built. Replaces the old `notifications.md`
(how an alert reads; its voice rules carry over in §8) and
`notification-delivery.md` (whether it arrives; its mechanics carry over in §5).

**Who it is for.** The agent, on a phone between calls: tell me the moment
something is mine to do, and stop telling me once I have done it. The manager,
at a desk: tell me when the desk itself is stuck, and show me which agents
cannot be reached.

---

## 1. What the data said (production, read-only, 12 Oct, last 14 days)

- **Agents act; the bell does not know.** Mahalaxmi agents worked 77% of
  new-lead alerts within 24 h — and had read 0 of 463. `read` was set only by
  the bell drawer, and one tap there marked everything read. Unread piles: 139–
  296 per agent. A count that only grows is wallpaper (`CLAUDE.md` §1).
- **The push works when it lands.** Action within 2 h on a new lead: 35% when
  the push showed on a screen, 6% when it did not.
- **A quarter of what we send never shows.**
  - 110 of 458 iPhone sends failed to connect (Node gave each attempt 250 ms;
    fixed `4fbfc20`).
  - 208 alerts accepted by Google/Microsoft and shown nowhere; after 20:00 sent
    outnumbered shown 85 to 23 — an idle Android phone holds normal-priority
    messages, and our 6-hour expiry ran out overnight.
  - Two bhumi agents have never had a subscription (0 of 73 shown); nothing on
    any manager's screen says so.
  - Phones keep receiving after their own sign-in ended (Siddhi's iPhone: 20
    sent, 0 shown, no session on it) — the check is per person, not per device.
  - A dead endpoint is re-registered on every app open (38 × 410 for one).
- **Nothing judges an alert by its result.** "Enquired again" was acted on 15
  times in 55; nothing would ever notice.

Every one of these is the same mistake: **an alert was modelled as a message**
— sent, sitting in an inbox, read or not — **when to an agent it is a piece of
work**, open until it is done.

## 2. The rule

**An alert announces an item of open work. It closes when that work is done,
wherever it was done.** Almost every alert already has a twin in Today:

| Alert | Its item in Today | Closes when |
|---|---|---|
| `lead_assigned`, `lead_reassigned`, `lead_untouched` | Not yet contacted | the lead has person-authored contact after the alert, or is no longer the recipient's |
| `lead_assigned_bulk` | Not yet contacted (each lead) | every lead in the batch is contacted or moved |
| `followup_due`, `site_visit_reminder`, `calendar_task_assigned` | Overdue · Due today · Upcoming | the booking gets an outcome, is rescheduled, or is cleared |
| `lead_repeat` | Came back today | contact after the repeat |
| `owner_assigned`, `owner_reassigned` | Owners to call | the owner is called or moved |
| `agreement_ending` | Tenancies expiring | the agreement is renewed or ended |
| `lead_unrouted` *(desk)* | Nobody assigned | the lead has an agent |
| `lead_reassign_loop`, `remark_added` | — | the recipient opens it |

Plus, for every alert: the record is rejected or closed → closed, reason
`not_yours`.

**The close test is the one Today already uses** (`services/leadSegments.ts`
and the owner/agreement equivalents), called, never copied. So the bell and
Today cannot disagree about the same work (`CLAUDE.md` §3.2, §3.3). The bell
shows open alerts only; its count is a number someone can act on today.

## 3. Lifecycle

One row per alert in `notifications`, gaining:

| Column | Meaning |
|---|---|
| `record_kind`, `record_ids` | what it is about (`lead` / `owner` / `agreement`, one or many ids). Today it is only parseable from `link` |
| `shown_at` | first time any device reported it on screen |
| `read_at` | opened — tapped on the phone or in the drawer (exists since `4fbfc20`) |
| `closed_at`, `close_reason` | `done` · `not_yours` · `opened` |
| `send_after` | when the push may go out (§4); NULL once sent |

`read` stays as a derived convenience for the old client until it is retired.

**Who closes it.** One function, `closeSettled(tenant, record?)`: evaluates
open alerts against their type's close test and stamps the ones that pass.
Called (a) after any write to a record, scoped to that record — the bell is
right within the request — and (b) by the existing sweep, tenant-wide, as the
safety net. One implementation, two callers.

## 4. When it reaches the phone — urgency, decided in the catalogue

| Urgency | Reaches the phone | Types |
|---|---|---|
| **now** | immediately, high priority | `lead_assigned`, `lead_reassigned`, `lead_unrouted` |
| **at its time** | when the thing is due | `followup_due`, `site_visit_reminder` (an hour before) |
| **morning** | one notification at the start of the day, summarising | `lead_repeat`, `agreement_ending`, `owner_assigned`, `owner_reassigned`, `lead_assigned_bulk`, `lead_untouched`, `calendar_task_assigned`, `lead_reassign_loop` |
| **drawer** | never buzzes | `remark_added`, `lead_moved_away` |

**One fixed night window, no setting** (decided 12 Oct: a setting is one more
thing for a firm to misunderstand). Inside it nothing buzzes. At its end, each
person gets **one** push for whatever is **still open** — "3 new leads
overnight" — and nothing for work already done. The window is ours to tune from
when agents actually work; measure the hours of person-authored activity per
firm before fixing it (starting point 21:00–08:00 IST).

Every alert enters the bell immediately whatever its urgency; urgency only
decides the buzz.

## 5. Delivery — a device, not an address

A **device** is a push subscription plus the sign-in that registered it plus
what its browser last reported. The rules:

1. **Send only to a live device** — its own sign-in is live. Signing out,
   expiry and revocation end its pushes. Rows from before binding get a grace
   week to re-bind on their next open (the app re-uploads on every signed-in
   open).
2. **Record what the browser says** on every signed-in open: `on`, `off`,
   `default` (not asked), `denied`, `unsupported`. A refusal leaves a trace.
3. **A dead endpoint stays dead.** On 404/410 it is remembered; `/subscribe`
   refuses it with 410, and the app drops the subscription and makes a new one.
4. **Retry what failed below HTTP** (DNS, TCP, TLS): twice, a minute apart.
   A refusal with a status code is not retried.
5. **`now` and `at its time` go at `urgency: high`.**
6. **Expiry follows urgency**: a `now` push expires after 6 h; a morning
   summary at the end of the working day.

Carried over unchanged: the device receipt (`ack` token in the encrypted
payload → `/notifications/ack` on display and on tap), `pushsubscriptionchange`
rebinding, the 90-day log prune, `toSelf` off.

## 6. Measurement — every type earns its push

Per type, per firm, per week, from the lifecycle columns:
sent → shown → opened → closed `done` (and median time to each), and action
within 2 h **with** the push shown against **without**. Read in the superadmin
console.

A type whose action rate is no better with the push than without moves down a
tier (now → morning → drawer). That is a one-line catalogue change, decided by
the numbers — the catalogue improves with time instead of being rebuilt.

## 7. Reachability, where the manager acts

On Team and Performance, beside each agent: **Phone on** · **Blocked** ·
**Browser can't** · **No device**, and "N of M shown this week". The manager's
question is who to talk to today; "Anil's phone gets nothing" is an answer to
it. The superadmin firm page shows the same, plus per sign-in state.

## 8. Voice (carried over)

Sentence case; no emoji; title says what happened, body says which record; no
system words ("SLA", "stale"); text comes from `notificationCopy.ts`, never a
call site. Plurals in one place.

## 9. The catalogue entry

`notificationCatalogue.ts` already holds key, label, audience, trigger, push,
gate. It gains `closesWhen` (a named close test from §2) and `urgency` (§4);
`push` becomes `urgency !== 'drawer'`. A new alert is one entry; the engine does
lifecycle, delivery, retry and measurement for it. A type without `closesWhen`
fails the boot check, like an undeclared type does today.

## 10. First run

Close every open alert whose work is already done, with reason `done` or
`not_yours`, through `runOnce`. **Writes status columns on bhumi's and
mahalaxmi's `notifications`.** Before running: the count it would close per
tenant, per type, stated and confirmed by the user.

## 11. Build order

1. Columns + `record_kind/ids` on new alerts; back-fill ids from `link`.
2. Close tests in the catalogue, `closeSettled()`, write-path and sweep callers.
   Bell reads open alerts only. First-run measurement → user → run.
3. Device model (§5 rules 1–3) — the held patches on
   `stash@{0} notif-patches-pending-design` are its starting point.
4. Urgency and the night window; morning summary; retries; priority.
5. Measurement read-out; reachability on Team/Performance.

Each step ships alone. Steps 1–2 end the piles; 3–4 end the lost pushes;
5 makes the next change a decision instead of a guess.

## 12. Open

- The night window's hours — measure first (§4).
- Whether `lead_untouched` survives at all once `lead_assigned` closes on
  contact: it re-announces the same open item. Decide from §6's numbers.
