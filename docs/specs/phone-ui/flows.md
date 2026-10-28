# The agent's day, as flows

Phone UI for the real estate CRM by Delpat. Designed from how agents work, not
from the screens that exist. Vocabulary is the product's own (`leadStatus.js`,
`callOutcomes.js`, `ownerStatus.js`, `leadSegments.ts`); anything the server
cannot do today is marked **[new server]**.

## What production says the gap is (last 60 days, both paying firms)

- 2,364 calls logged; an outcome on 749 (32%).
- About 61 next-step bookings in the same 60 days — **one call in forty books
  anything**. Zero owner callbacks set right now at either firm.
- After a call that did not get through: **0 of 308** lead calls and **0 of
  185** owner calls had a next try booked within ten minutes; 163 of the 308
  leads and all 185 owners were never called again.
- Every overdue booking on a lead today is a Site Visit (37), and 30 sit on
  leads already Rejected or Deal Closed: closing a lead never cleared it.

So the design's job is not "make bookings move correctly"; it is to make the
**call → next step moment happen at all**, with the next try as the one-tap
default, and to make the list the place where that next try shows up. The
as-is rules and the proposed rule set are in `docs/specs/follow-ups.md`
(worktree `b-phone-redesign`); section 11 below is that rule set, in the
agent's words, with the few additions this design needs.

## The idea in one paragraph

The app is a **queue**, not a database. It opens on the one person to ring
next, with Call under the thumb. A call is a **moment with two halves**: before
(who, why now, what was last said) and after (what happened, what is next).
The after-half is one sheet that opens by itself when the agent comes back
from the dialer — and again after a cold restart, because the server knows a
call was started and no outcome was written. Every outcome chip carries its
consequence printed on it (the status it sets, the next step it books), so one
tap records the call, moves the status and books the follow-up. Every save
prints one line of fact with **Undo**, and the queue advances to the next
person. The rules for what the system does on its own are short, fixed, and
printed in the app's words (section 11), so an agent can predict them.

## Shapes used everywhere

- **Person row** — name (2 lines max, first name bold; number as the name when
  there is none; Devanagari as typed), status chip, one line of "why now"
  (`Overdue 2 d · Callback Thu 11:00`, `New · Housing.com · 4 min ago`), one
  line of last remark. Tap the name → record. Tap the chip → status sheet.
  Call button on the right edge, ≥48 px.
- **Sheet** — a bottom sheet with a sticky action row. Backdrop tap closes it
  only while nothing has been chosen or typed; after that only the X or Save.
- **Ack bar** — one line at the bottom after any save:
  `Rahul Mehta → Callback · Thu 11:00 · Undo`. It stays until the next action,
  not for N seconds. Undo reverts every write the action made (outcome, status,
  booking, remark) as one unit.
- **Why-now** — the queue's reason, in the pile's own word: Overdue, Due now,
  New, Came back, Never called, Going cold, Visit today.

## Queue order (the "Now" screen)

One list, fixed order, soonest-to-act first. The piles are counts that filter
this same list; they never open a different screen:

1. **Calls with no outcome** (mine, last 48 h) — the recovery pile. Each row
   opens the outcome sheet directly. **[new server: query "my calls without an
   outcome"; derivable from timeline `call` rows with empty `metadata.outcome`]**
2. **Visit today** — a booked Site Visit for today.
3. **Overdue** — booked follow-up/callback whose time passed, most recent first
   (not oldest: the 200-deep agent must see this week before August).
4. **Due now** — booked today, in time order.
5. **New** — arrived, nobody contacted; newest first. A repeat enquiry sorts
   above a first one ("Came back · 3rd enquiry").
6. **Never called** — open, never dialled, nothing booked.
7. **Going cold** — open, no person activity for the firm's N days.

Every count on the screen is one of these piles; nothing else is counted.

---

## (a) Open the app → who to ring

**For:** an agent at 10:05 with coffee, wanting the next call.

1. App opens on **Now**. Top: the up-next card — name, status, why-now, last
   remark, requirement in one line (`2 BHK · Wakad · ≤ 65 L`), **Call** and
   **WhatsApp**. Below: the queue in order, pile chips across the top with
   counts (`No outcome 3 · Overdue 7 · Due 4 · New 2 · Never called 12`).
2. Tap **Call** → see (b).
3. Tap a pile chip → the same list filtered; the chip is lit; tap again clears.
4. Tap a row's name → the record (e). Tap its status chip → inline status (b′).
5. Pull down → refresh; the top card may change (a lead arrived) and the ack
   bar says so: `New: Pooja Deshmukh · Housing.com · placed first`.

**Automatic:** the order. The agent never sorts. Overnight, the server rolls
and decays bookings (section 11), and the morning push says how many are due.

**Undo/correct:** nothing to undo; skipping a person is a swipe-left → "Later
today" (books +3 h, acknowledged, Undo) or "Not mine" (unassign → desk pile).

---

## (b) Call → outcome + next step → next person

**For:** an agent who has just hung up and wants to say what happened in one
thumb, then ring the next person.

### Before the call
1. Tap **Call** on the card or row. The app writes a `call` event ("Call
   started, 10:42") and remembers the lead id and event id locally
   (`pending_call`). The dialer opens.
2. No confirm modal. The record is the confirm; the Undo in the ack bar covers
   a mis-tap ("Call started · Undo" removes the event).

### Coming back
3. The app regains focus — or cold-starts. Either way it opens the **Outcome
   sheet** for the pending call, headed `Rahul Mehta · called 10:42 · 1 min
   ago`. Source of truth: local `pending_call`; fallback: the server's "my
   calls without an outcome" (so a restart that lost local storage still
   lands here). **[new server: the query above]**
4. The sheet is one screen, no scrolling at 640 px:
   - **What happened** — the ten outcomes as chips, in the order they happen
     on this desk (`Call not received` first: it is 60% of outcomes). Each chip
     shows its consequence in small text under the label:
     `Call not received · → Call Not Received · retry 1:45 pm`.
   - **Next** — appears filled as soon as a chip is tapped, in the chip's own
     default (section 11). Time chips (`In 2 h`, `6 pm`, `Tomorrow 11`,
     `Day after`) and `Pick…`; `No next step` is always there for a reached
     outcome. **The Save button names the booking it will make**:
     `Save · try again Wed 10:42`, `Save · call tomorrow 11:00`,
     `Save · Rejected`. One tap on a chip, one tap on Save, and the next try
     exists. The agent never has to go looking for "schedule".
   - **Remark** — one line, optional, keyboard not auto-opened.
   - Sticky row: **Save · <what it books>** (primary) and **Skip for now**.
5. **Save** → one write: outcome on the call event, status, booking, remark,
   atomically. **[new server: `POST /records/:id/actions/call-result` — today
   this is three requests (remark/outcome PATCH, stage-change, schedule) that
   can half-succeed]**
6. Ack bar: `Rahul Mehta → Callback · Thu 11:00 · Undo`. The queue advances;
   the next up-next card is already on screen behind the bar.
7. **Skip for now** → the sheet closes; the call stays in "No outcome" (pile
   1) with the row reading `Called 10:42 · outcome?`. Nothing is invented. The
   count is one the agent can clear today; it is never shown to the manager as
   a score, only as "N calls with no outcome" on the team glance.

### The outcomes, one by one

| Agent taps | Status set | Next step booked (default, editable) | What the sheet shows after the tap |
|---|---|---|---|
| **Call not received** | Call Not Received | **Next try pre-filled: tomorrow, same time** (follow-ups.md D1). Chips `In 2 h`, `Tomorrow 10:42`, `Pick…`. If the call was a booked one, the booking **moves** (it is not done); if nothing was booked, this creates the booking | `→ Call Not Received · next try Wed 10:42 · 2nd try`, Save reads `Save · try again Wed 10:42`, and a **WhatsApp instead** button (opens WA with the firm's "tried calling" text; logs `wa_after_no_answer`). On the **3rd** miss in a row the sheet also offers `Reject · Not Answering` beside Next try — offered, never automatic |
| **Busy or switched off** | Call Not Received | same as above | same |
| **Wrong number** | Rejected · reason **Wrong number** **[new: reason not in `REJECTION_REASONS`]** | none; leaves the queue | `→ Rejected · Wrong number · out of your queue`. If the lead has an email or a second number from the portal, a line `Email on file` — otherwise nothing else |
| **Asked to call back** | Callback | **Time required.** Chips: `In 1 h`, `6 pm`, `Tomorrow 11`, `Day after`, `Pick…`. "After 2–3 days" is the `Day after` chip (two days, 11:00) | `→ Callback · Thu 11:00`. Save is disabled until a time is chosen; the chip row is highlighted, not a modal |
| **Connected · discussed** | Follow-Up (only if currently New / Call Not Received / Callback; Interested and Site Visit stay as they are) | `Tomorrow 11:00`, pre-chosen and visible, `No next step` one tap away | `→ Follow-Up · call tomorrow 11:00`. A **Requirement** row unfolds (BHK · locality · budget · buy/rent chips) — optional, because the usage data shows requirements typed as prose |
| **Sent details on WhatsApp** | Follow-Up (same guard) | `Tomorrow 11:00` | `→ Follow-Up · call tomorrow 11:00` and **Send homes** (flow e) |
| **Interested** | Interested | Choice row: **Book visit** or **Call** (tomorrow 11:00) | `→ Interested · call tomorrow 11:00`; tapping Book visit swaps the Next row to the visit fields (d) |
| **Scheduling a site visit** | Site Visit | **Visit date/time required**; project/property picker from shortlist or search | `→ Site Visit · Sat 11:00 · Pride World City` |
| **Not interested** | Rejected + **reason required** (chips: the eight reasons + Others) | none | `→ Rejected · Locality mismatch`. Save waits for a reason; Others is always there |
| **Already booked elsewhere** | Rejected · Already purchased / rented | none | `→ Rejected · Already purchased` |

**Correct it:** Undo in the ack bar reverts the whole save. Later, on the
record, the call row has **Edit** (author only — the server already enforces
this) which reopens the same sheet with the saved values; saving again rewrites
status and booking by the same rules, and the timeline keeps both rows.

**Doesn't force:** no field but the ones the table marks "required" blocks
Save, and each required one is required because the status would be a lie
without it (a Callback with no time, a Rejected with no reason). Skip for now
is always available.

### (b′) Change status from the list, without opening the record

**For:** an agent who moved five leads on paper this morning and wants to
enter them in one minute.

1. On any list, tap the **status chip** on a row. The **Status sheet** opens
   over the list: the eight statuses as 48 px targets in two columns, the
   current one marked.
2. Tap a status. If it implies a next step or a reason, the sheet grows by one
   row — same chips as the outcome sheet:
   - Callback → time chips (required)
   - Site Visit → visit date/time (required), property (optional)
   - Follow-Up / Interested → `Tomorrow 11:00` pre-chosen, `No next step` beside it
   - Rejected → reason chips (required)
   - Call Not Received → retry time by rule, shown
   - New, Deal Closed → nothing more
3. **Save** → `stage_change` (+ booking) in one write **[new server: one
   write; today stage-change and schedule are separate]**. Ack bar with Undo.
   **The row stays where it is** with its new chip; the list does not re-sort
   until the agent leaves it, so the next row they meant to tap is still under
   their thumb.
4. A status change made this way is not a call. It does not write a call
   event. (The usage snapshot shows agents setting Call Not Received without
   logging a call — this keeps that honest rather than inventing a dial.)

---

## (c) A new lead arrives (push) → first call

**For:** an agent whose phone buzzes at 11:20 between calls.

1. Push: `Pooja Deshmukh · Housing.com · 2 BHK Wakad` (title = the person,
   body = where from + requirement; `lead_assigned`, urgency `now`).
2. Tap → the **First call** card, full screen: name, source, time arrived,
   requirement as portal sent it, the portal's message text if any, and the
   two buttons **Call** / **WhatsApp**. Below, a `Came back` line when it is a
   repeat (`3rd enquiry · last: Pride World City, 12 Oct`) with the earlier
   remarks.
3. Call → flow (b). WhatsApp → opens WA with the firm's greeting; on return
   the WA outcome sheet (`Details shared` / `No reply yet` / `Replied…`) and
   the same Next row, default `Call tomorrow 11:00`.
4. Not now → back to Now; the lead sits in **New** at the top with `arrived
   11:20`. The alert closes by itself when any contact is recorded
   (`lead_worked`) — no "mark read".

**Automatic:** assignment by the firm's routing; the alert closes on work.
**Acknowledged:** the ack bar on Now after the call: `Pooja Deshmukh →
Interested · visit Sat 11:00`. **Undo:** as (b).

---

## (d) A site visit: book, the day of, how it went

**For:** an agent taking a buyer to Pride World City on Saturday.

**Book** — from the outcome sheet (Scheduling a site visit / Interested → Book
visit), from the status sheet (Site Visit), or from the record's **Book**
button. Fields: date, time, property (from the shortlist; or search; or
"not decided"). Save → `→ Site Visit · Sat 11:00 · Pride World City`.
The system books `site_visit_reminder` an hour before.

**The day of** — Now shows a **Visit today** card at the top: name, time,
property, **Navigate** (maps link, only when the property has an address),
**Call**, and **Log visit**. At 10:00 the reminder push: `Visit at 11:00 ·
Rahul Mehta · Pride World City`.

**Log how it went** — **Log visit** → camera (live capture, no gallery) →
the photo is shown with the GPS fix (`±18 m · 0.3 km from Pride World City`
when the property has coordinates) → **How it went** chips: Interested ·
Negotiating · Booked · Not interested · No show → Next row (`Call tomorrow
11:00`; Booked → status Deal Closed offered, not forced; No show → reschedule
chips `Tomorrow`, `Sunday`, `Pick…`) → Remark → Save. One write: `site_visit`
activity with proof, outcome, booking cleared, next step booked.
**[new server: one write; today the proof, the follow-up completion and the
next booking are separate]**

**Location refused** → the sheet says `Location off · visit not logged` and
offers **Open settings**; nothing is logged without it (the firm's rule). The
booking stays in Overdue, honestly.

**Ack:** `Rahul Mehta · visit logged · Negotiating · call Mon 11:00 · Undo`.
Undo within the ack bar removes the activity and the booking change; the photo
is kept on the server for the audit and is not shown as a visit.

---

## (e) Share a property / catalogue on WhatsApp

**For:** an agent who has a buyer on the line wanting "send me options".

1. From the record or from the outcome sheet (`Sent details` / `Interested`):
   **Send homes**. A list of the lead's shortlist first, then **matches** (the
   server's matching, same criteria), then search. Each row: a thumbnail, `2
   BHK · Pride World City · Wakad`, and a tick. Price shown small (money is
   never the hero).
2. **Send 3** → the server makes the link (bound to this lead, the firm's
   expiry) and the app opens WhatsApp to the lead's number with the firm's
   text and the link. The `whatsapp` event is written with outcome
   `wa_details_sent` (a fact: the link exists and WhatsApp was opened).
3. On return: no sheet (the outcome is known). Ack bar: `Sent 3 homes to
   Rahul Mehta · link 7 days · Call tomorrow 11:00? Book · Skip`. Book writes
   the follow-up; Skip leaves `no next step`.
4. The buyer taps **I'm interested** on the page → `share_interested` push
   (`Rahul Mehta is interested in Pride World City 2 BHK`) → the lead rises in
   the queue under **Came back**. The agent calls; flow (b).
5. **Catalogue**: from Now's overflow, **Share catalogue** copies the firm's
   catalogue link or opens WhatsApp to a chosen contact. Not bound to a lead.

**Undo:** the ack bar's Undo turns the link off (the spec's "turn off = delete")
and removes the event. The WhatsApp message itself cannot be unsent by us.

---

## (f) The owner calling list

**For:** a caller working 3,700 imported owners to win flats to manage.

1. **Calling** tab. Same queue shape: pile chips `Callbacks overdue · Later
   today · Callbacks · Unassigned`, then the walk's statuses as a second row of
   chips (`New 3,396 · Call Not Received · Incoming N/A · Switch Off ·
   Contacted · Interested · Key Received`). The list is ordered: overdue
   callbacks, later-today callbacks by time, then New (never dialled), then the
   three "did not get through" statuses oldest-attempt first.
2. Row: owner name, `Pride World City · B-1204 · Wakad` (project · unit ·
   locality — the first thing a caller needs), status chip, callback time if
   any, last remark. **Call** on the right edge.
3. Call → dialer → **Owner outcome sheet** on return, same mechanics as (b):

| Tap | Status | Next | Shows |
|---|---|---|---|
| Call not received | Call Not Received (the dial itself no longer sets Contacted — follow-ups.md D4) | next try pre-filled, tomorrow same time; the callback moves | `→ Call Not Received · next try Wed 10:42` |
| Incoming not available | Incoming Not Available | same | |
| Switch off | Switch Off | same | |
| Spoke · call back | Contacted | **callback time required** | `→ Contacted · callback Thu 11:00` |
| Spoke · not now | Contacted | `In 2 weeks` default, editable | |
| Interested | Interested | callback chips, `Tomorrow 11` default; **Add their flat** button (today: opens Add property with the owner prefilled; the one-tap conversion is **not built** — listing-pages/contacts spec B) | `→ Interested · callback Tue 11:00` |
| Key received | Key Received | none; leaves the walk | `→ Key Received · Add the listing` |
| Not interested | Not Interested + reason chips (the six in `OWNER_REJECTION_REASONS`) | none | `→ Not Interested · Already with another agency` |
| Wrong number / Don't call | Do Not Call | none | `→ Do Not Call` |

4. Save writes: `last_call_at`, status, `callback_at` + `callback_note`,
   remark, and the call event's outcome — one write **[new server: one
   write; owner callbacks have never been booked in production, so the route
   exists but the moment does not]**. "Callback done" with no outcome goes
   (D5): a callback ends by this sheet, by Reschedule, or by Reject.
5. Status-only entry (how mahalaxmi works today): the chip on the row opens the
   owner status sheet, same growth rules (Contacted/Interested → callback time;
   Not Interested → reason). No call event invented.

**Automatic:** retries roll like leads; an overdue owner callback decays by
the same §11 rule. **Undo:** ack bar.

---

## (g) Add a walk-in / phone-in lead

**For:** an agent at the office when someone walks in, or on a call from an
unknown number.

1. **+** in the top bar (every screen) → **Add lead**: Phone first (country
   picker, firm's country default; the number is read as E.164 and refused
   with the reason if unreadable), then Name, then **Came from** chips
   (`Walk-in · Phone call · Reference · Website · Other`), then requirement
   chips (`Buy/Rent · BHK · locality · budget`) — all optional but phone.
2. As the number completes, the server is asked `findLeadByPhone`. A match
   shows **above the form**: `Already a lead · Rahul Mehta · Anil Dangi ·
   Interested` with **Open** — the form is not cleared (don't lose work); the
   agent chooses.
3. Save → the lead is created, assigned to the agent, `creation` event. Ack
   bar: `Added Pooja Deshmukh · yours · Call now · Later`. **Call now** starts
   flow (b); **Later** leaves her in **New**.

**Undo:** the ack bar's Undo removes the lead within the session (server: a
delete that is only offered when the lead has no event but creation).

---

## (h) Someone calls back — find them

**For:** an agent whose phone rings from a number they half-recognise.

1. **Search** icon in the top bar → a single field with the numeric keyboard
   up, placeholder `Number or name`. Typing 4+ digits searches leads **and**
   owners by digits-as-typed (`phoneLike`); letters search names.
2. Results in one list, each row saying which it is: `Lead · Interested ·
   Anil Dangi` / `Owner · B-1204 · Contacted`, with the last remark and
   **Open**, **Call**, **WhatsApp**. Tapping Open lands on the record with the
   **Log this call** button at the top (an incoming call is logged as a `call`
   event with direction in, then the same outcome sheet).
3. No result → `Not found` and **Add as lead with this number** (flow g with
   the digits already in).
4. Android only: when the app is opened from the dialer's contact-less screen
   with a number in the clipboard, the search field offers **Paste**.

Not possible without a native app: knowing who is calling. Named here so it is
not promised.

---

## (i) Manager glance at the team

**For:** the owner at 2 pm, phone in hand, wanting to know who to talk to.

1. **Team** tab (owners and managers only). One row per agent, sorted
   stopped-first: last activity time, then today's calls, then the open piles.
   `Siddhi · last 11 Oct · 65 open · 0 calls today` on top in the alert tone;
   `Ravish Singh · 2 min ago · 23 calls · 6 no outcome · 12 overdue` below.
2. Every figure is a tap into that agent's queue (read-only for a manager,
   with **Reassign** on multi-select). `No outcome 6` is the manager's
   question — "you called, what happened?" — not a score.
3. **Desk piles** across the top: `Nobody assigned 3 · New today 14 ·
   Overdue 41` — the first is the manager's own work (assign).
4. **Phone reach** beside each name: `On · Blocked · No device`, from the
   reachability query, so "Anil's phone gets nothing" is an answer.

Nothing is charted. Counts only, each with a destination.

---

## 11. What moves on its own — the rules an agent can trust

Printed in the app under Me → **Rules**, in these words, read from one
catalogue on the server **[new server: `followUpRules.ts`, one file, the way
`leadSegments.ts` holds the piles]**.

| When | The system does | You see | Undo |
|---|---|---|---|
| You press **Call**, **WhatsApp** or write a **remark** | Nothing moves. A booking stays until you say how it went | the row is unchanged | — |
| You save **Call not received** / **Busy or switched off** | Status → Call Not Received. The next try is booked **tomorrow at the same time** unless you picked In 2 h or a time. A booked call is not done; it **moves**. The row leaves Overdue — overdue means nobody tried (D2) | `→ Call Not Received · next try Wed 10:42 · 2nd try`; the row reads `Next try Wed 10:42` | Undo in the ack bar |
| **3rd miss in a row** | The sheet also offers `Reject · Not Answering` beside Next try. Never automatic (D3) | an extra chip | — |
| "Call me after 2–3 days" → booked Thu 11:00 → Thu you call, **not received** | The booking moves to **Fri 11:00**, same time, by the rule above. Rahul is not overdue, Performance shows a try, not a conversation | `Moved Thu 11:00 → Fri 11:00 · 1st try` on the row and in the timeline | Undo; or pick a time |
| You save **Rejected** or **Deal Closed** (any way: outcome, status chip, record) | The open booking is **cleared** — it is over. (30 of the 37 overdue bookings in production sit on closed leads.) | `→ Rejected · booking cleared` | Undo |
| You save **Wrong number** | Status → Rejected · Wrong number. Leaves every pile. A new enquiry from the same portal with the same number **reopens** it as Came back (that is the portal correcting itself) | `→ Rejected · Wrong number · out of your queue` | Undo |
| You save **Asked to call back** | Status → Callback at the time you picked. `followup_due` push at that time | `→ Callback · Thu 11:00` | Undo; Edit on the call row |
| You save any outcome with a **next step** | The previous open booking on the lead is replaced, never stacked | `replaces Mon 4:00 pm` beside the Next row before Save | Undo |
| You **log the call** that a booking was for | The booking is marked done (`Completed` row), whatever the outcome; the next step you pick is the new booking | `Follow-up Thu 11:00 · done` in the timeline | — |
| You **log a visit** | The visit booking is done; status stays Site Visit unless you pick Booked (→ Deal Closed, offered) | `visit logged` | Undo |
| A lead you hold **enquires again** | Rises to the top of New as Came back; `lead_repeat` push now (inside working hours) | `Came back · 3rd enquiry` | — |
| You do **anything** on a lead | Its open alerts close (no "mark read") | the bell count drops | — |
| Nothing happens for the firm's **N days** | Going cold. The firm's idle-reassignment sweep, if on, moves it (you get `lead_moved_away` in the drawer; the new holder gets a push) | `Moved to Mohit · idle 7 d` | the manager |

What the system **never** does by itself: reject a lead, close a deal, change
Interested or Site Visit to anything, or invent an outcome for a call.

---

## What this needs that does not exist (collected)

- **`POST /records/:id/actions/call-result`** — outcome + status + booking +
  remark in one write, with the retry rule applied server-side; the same for
  owners (`owner-call-result`) and for the status sheet (`stage-change` taking
  an optional booking). Undo = `POST …/undo/:actionId` that reverts the set.
- **The booking rules of follow-ups.md §5** on the server: Call no longer
  closes a booking; a not-reached outcome moves it (or creates it) to tomorrow
  same time with an attempt counter (`tries`) and `moved_from`; a reached
  outcome finishes it and books the chosen next step; Rejected/Deal Closed
  clears it; owners follow the same rules on `callback_at`, the dial no longer
  sets Contacted, "Callback done" goes. Today `DIDNT_REACH_THEM` only moves
  the status and nothing books anything.
- **"My calls without an outcome"** as a queue pile (timeline `call` rows by
  me, empty outcome, 48 h), and the up-next **queue endpoint** that returns
  the ordered list with a why-now key per row.
- **Rejection reason `Wrong number`** on leads; the "reopen on re-enquiry"
  rule for it.
- **Pending-call recovery**: the app persists `pending_call` locally and asks
  the pile above on every open.
- **Owner conversion** (Interested → their flat as a listing in one move) —
  the contacts spec's phase B, still not built; the sheet links to Add
  property with the owner prefilled.
- **Per-agent today figures** on the team glance: calls, calls without
  outcome, overdue, last activity — mostly in `activityReport`; "no outcome"
  is new.
- **Incoming-call logging** (direction on a call event) for flow (h).
