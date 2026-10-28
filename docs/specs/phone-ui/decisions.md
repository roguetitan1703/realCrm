# Decisions for Om, and what to build first

Each one: the choice in plain words, a real example, what yes and no mean,
my recommendation. The rule set behind most of these is `follow-ups.md` §5
(worktree `b-phone-redesign`); its D1–D5 are restated here only where this
design depends on them.

## 1. Does a reached call come with a next step pre-chosen?

Prakash speaks to Nilesh for six minutes, taps "Connected · discussed", and
taps Save without touching the Next row.
- **Yes:** the lead gets "call tomorrow 11:00". The Save button said so
  (`Save · call Wed 11:00`); `No next step` was one tap away. One call in
  forty books anything today; this makes it the default rather than the
  exception.
- **No:** Save with nothing chosen books nothing. Nothing is invented, and
  the lead sits in "Nothing booked" — where 222 of bhumi's 246 open leads
  already sit.
- **Recommendation: yes**, for discussed / sent details / interested. The
  booking is printed on the button before it is made, and Undo covers the
  mis-tap. For not received, follow-ups.md D1 already recommends yes.

## 2. Wrong number ends the lead

Mohd. Arif's number from 99acres belongs to someone else.
- **Yes:** "Wrong number" → Rejected with the new reason **Wrong number**
  (not in `REJECTION_REASONS` today), out of every pile; a fresh enquiry from
  the portal with the same number reopens it as Came back.
- **No:** it stays open at Call Not Received, as today — and comes back to
  the top of the queue every day, which is how the "keeps coming back"
  complaint arises.
- **Recommendation: yes.** Add the reason; close the lead.

## 3. Is a reason required to reject?

Thereza says no, she only wants Koregaon Park.
- **Yes:** Save waits until a reason chip is tapped; Others is always there.
  The firm's rejection report (bhumi: 90 No requirement, 43 Locality, 38
  Others…) stays meaningful.
- **No:** one tap fewer; Others grows until the report says nothing.
- **Recommendation: yes.** It is the only required field on a reached call,
  and it is required because the status would be a lie without it.

## 4. Undo: until the next action, or on a timer?

Prakash saves "Callback Thu 11:00" for Rahul and immediately rings Sunita.
- **Until the next action (recommended):** the ack bar with Undo stays until
  he does something else; no racing a countdown with a thumb.
- **Timer (8 s):** cleaner screen, but a mis-tap found at second nine means
  opening the record and editing the call row.
- **Recommendation: until the next action.** The record's Edit (author-only,
  already enforced) is the long-way-round for anything later.

## 5. Where does a call with no outcome live?

Prakash skips the sheet three times on a busy morning.
- **A pile on Now, first in the order (recommended):** "No outcome 3", each
  row opening the sheet; on the manager's Team glance as "no outcome 3" per
  agent — a question ("you called, what happened?"), never a score.
- **Only on the record:** quieter, and the outcome rate stays at 20–50%.
- **Recommendation: the pile.** It is also the cold-restart recovery path:
  the app asks the server for it on every open, so a lost local state still
  lands on the right sheet.

## 6. Does the Overdue pile decay?

A booking nobody tried for ten days.
- **Yes (3 or 7 days → cleared, tagged "missed"):** Overdue holds only what
  can still be cleared this week; the lead drops to Going cold.
- **No:** overdue is overdue until somebody tries or rejects.
- **Recommendation: no, not yet.** With "closing a lead clears its booking"
  (30 of 37 overdue today sit on closed leads) and "a not-received try moves
  the booking", the pile shrinks on its own. Revisit from the numbers after
  a month. Overdue is sorted most-recent first so the 200-deep agent sees
  this week before August.

## 7. Queue order: fixed, or the agent's choice?

- **Fixed (recommended):** No outcome → Visit today → Overdue → Due → New
  (Came back first) → Never called → Going cold. Piles filter the same list.
- **Agent sorts:** a sort control on Now; the manager can no longer say "the
  next person was X and he skipped her".
- **Recommendation: fixed**, with swipe-left "Later today" as the escape.

## 8. Owner conversion from the outcome sheet

Shailesh says yes, manage my flat.
- **Now:** "Add their flat as a listing" opens Add property with the owner
  prefilled; the calling record links when project + tower + unit match
  (contacts-leads.md phase A). Honest, two screens.
- **Later:** the one-move conversion (phase B) — carries person, unit and
  call history across. Wanted, not built.
- **Recommendation:** ship the button to Add property now; phase B when the
  calling list is actually worked (mahalaxmi: 39 owner calls logged in 30
  days, by status mostly).

## 9. Manager's "no outcome" count per agent

- **Show it (recommended):** it is the one figure that explains the 20%
  outcome rate agent by agent, and it is something the manager can ask about
  today.
- **Hide it:** agents may read it as surveillance and skip logging calls at
  all (which the usage data shows some already do: status set, no call).
- **Recommendation: show it**, as a count with a destination, never as a
  percentage or a rank.

---

## Build first — the smallest slice that moves the outcome rate

**Slice 1 (one builder, one merge): the return card.**
1. Local `pending_call` on Call; on focus or cold start, open the outcome
   sheet for it. Fallback: a "my calls without an outcome, 48 h" query.
2. The sheet as drawn: chips with their consequence, Next row with the
   pre-chosen booking, Save button naming what it writes, Skip.
3. One server write `call-result` (outcome + status + booking + remark) with
   follow-ups.md §5 rules 1–3 and 5: Call closes nothing; not reached moves
   or creates the next try; reached finishes the booking and books Next;
   Rejected/Deal Closed clears the booking. Undo = the inverse of that write.
4. The ack bar with Undo.

That alone turns "2,364 calls, 749 outcomes, ~61 bookings" into a path
where the outcome and the next try are the default of two taps. Everything
else in this design is a list reading what that write produced.

**Slice 2:** Now as the queue (order + piles + "No outcome"), the status
sheet from the row (same write minus the call).
**Slice 3:** owners on the same sheet and route (`callback_at`), the dial
no longer sets Contacted, "Callback done" removed.
**Slice 4:** visit logging as one write; Send homes ack with Book/Skip;
Team glance with "no outcome" and reach.

Measure after slice 1, per firm per week: outcome rate, bookings per call,
not-received calls with a next try within 10 minutes (today 0 of 493).
