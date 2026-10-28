# Follow-ups: what a booking is, what finishes it, what moves it

Status: 🧭 planning, for Om to decide (§5). No code changed for this.

**Who it is for.** The agent, between calls, who booked "call me in 2-3 days"
and needs the app to say, after the next attempt, what happens to that booking
without them having to work it out. Second, the owner reading overdue on Today
and Performance, who needs "overdue" to mean "nobody tried".

**Om's report.** A follow-up was booked from a call. Two days later the agent
calls, nobody picks up, the agent logs "not received". The record still says
overdue ("you have not followed up") and the agent has to reschedule by hand.
Nobody knows what moves forward on its own.

**How this was checked.** Every row marked ✓ was driven through the API on a
local stack (scratch Postgres, `setup:local` demo firm `delpat`, API on the
`development` code at `ec2e5c6`, agent `kavish`, manager `siddharthvarma`),
reading the row and Today's counts after each step. Rows marked R were read
from the code only. Development and production run the same rules here: the
"Call closes the booking" write dates from 18 Aug (`3791cf2`).

---

## 1. The short version

1. **A lead's booked call ends when you press Call**, before anyone says how it
   went. An unanswered call erases the reminder and is counted as a finished
   follow-up on Performance.
2. **An owner's callback never ends on a call.** It stays overdue whatever the
   call's outcome, until someone picks a new time or taps "Callback done",
   which records nothing.
3. **"Call not received" moves a lead to Call Not Received, and does nothing to
   an owner.** The owner was already moved to Contacted by the dial itself.
4. **Booked visits, meetings and bookings with no kind in their wording ignore
   calls**, so they stay overdue after any number of attempts. That is Om's
   scenario for a lead, word for word.
5. **Nothing ever moves a booking forward on its own**, on either side. No
   outcome books anything, including "Asked to call back".

---

## 2. As it is today

Key: **stays** = the booking/callback is untouched, **closes** = it is cleared
(and for a lead a `Completed` row is written, which Performance counts as a
follow-up done). "Overdue" is Today's Overdue group, the Leads/Calling overdue
pills and the phone's Today badge (`Phone.jsx:98-104`), which all count from
the same server expressions.

### 2a. Lead with a booked follow-up (`crm_leads.follow_up`)

A booking's kind is read from its wording (`src/data/followUpKinds.js:22`):
"site visit" → visit, "meeting|demo" → meeting, "call|callback" → call,
anything else → no kind.

| Action | Booking | Status | Overdue / Today | Alert | |
|---|---|---|---|---|---|
| Press **Call** (phone Call or desk Record call; both send `contact-log`) on a **call** booking, any time, even 3 h before it is due | **closes** at once, `Completed` row (`routes/actions.ts:218` → `store.ts:7530`, `7550`) | unchanged | leaves Overdue (7 → 6) | `followup_due` closes "done" (`alertLifecycle.ts:94`) | ✓ |
| Call on a **visit, meeting, demo** or no-kind booking | stays | unchanged | stays overdue | stays open | ✓ |
| Call, then **Skip** | as the two rows above | unchanged | as above | as above | ✓ |
| Call, then **Call not received / Busy or switched off** | already closed (call) or stays (other kinds) | → **Call Not Received**, from New, Follow-Up or Callback; never back from Interested or Site Visit (`actions.ts:128`, `store.ts:7625`) | as above | as above | ✓ |
| Call, then **Discussed / Sent details / Asked to call back / Coming for a visit / Not interested / Booked elsewhere / Wrong number** | as above; **nothing is booked**, not even for "Asked to call back" | **unchanged**, all seven | a New lead stays New, so it stays under "Not yet contacted" on Today after a real conversation | none | ✓ |
| **WhatsApp** (any outcome, including "Sent after an unanswered call") | stays | unchanged | stays overdue | stays open | ✓ |
| **Add remark** ("called from my phone, not received") | stays | unchanged | stays overdue | stays open | ✓ |
| **Reschedule** (record card / FAB → `ScheduleFollowUpModal`, `Modals.jsx:2544`) | moves; `Rescheduled` row (`store.ts:2490-2505`) | unchanged | leaves Overdue if the new time is ahead | old one closes "done"; a manager rescheduling an agent's lead pushes `calendar_task_assigned` (`store.ts:2616`) | ✓ |
| **Done** with how it went (`FollowUpDoneModal`, Today row only, `actions.ts:161`) | closes, outcome on the booking row | unchanged | leaves Overdue | closes | ✓ meeting; the API also closes a call booking, no screen offers it |
| Done on a **visit** | refused: "A site visit is logged with a photo and location" (`actions.ts:172`) | | | | ✓ |
| **Log visit** with photo + GPS | visit booking closes (`store.ts:7486`) | → **Site Visit**, forward only | leaves Overdue | closes | ✓ |
| Log a **meeting** activity (API `type: meeting`) | **stays** (only `site_visit` closes, `store.ts:7485`) | unchanged | stays | stays | ✓ (no screen sends it) |
| Clear the booking (`followUp: null`) | closes and writes **`Completed`**, counted as done though nothing happened (`store.ts:2508`) | unchanged | leaves Overdue | closes | ✓ API; no screen offers it today |
| **Status by hand** → Call Not Received / Callback | stays; Callback needs no time (8b) | as chosen | stays overdue | stays | ✓ |
| Status by hand → **Rejected / Deal Closed** | stays in the row but is no longer overdue (`FOLLOWUP_OVERDUE` = open + past due, `store.ts:2880`) | as chosen | leaves Overdue (9 → 8) | closes "not yours" | ✓ |
| **Manager** presses Call on an agent's lead | closes the agent's call booking | | | | ✓ the agent then **cannot** add the outcome (403, author-only, `actions.ts:104`) |
| Booking falls due | — | — | Overdue from the minute it passes (`FOLLOWUP_PAST_DUE`, `store.ts:2866`) | `followup_due` push at the time, only if due in the last 24 h, once (`notifications.ts:353-410`) | ✓ |

### 2b. Owner on the calling list (`crm_owners.callback_at`)

| Action | Callback | Status | Overdue / Today | Alert | |
|---|---|---|---|---|---|
| Booking falls due | — | — | "Callbacks overdue" (`leadSegments.ts:395`); Performance counts it missed from the next day (`activityReport.ts:201`) | **none**; there is no callback alert in the catalogue | ✓ |
| Press **Call** | **stays** | New → **Contacted** on the dial, answered or not; `last_call_at` set (`store.ts:4673`) | stays overdue | — | ✓ |
| Call, then **any outcome**, including Call not received | stays | **unchanged** (the lead rule queries `crm_leads` only, `store.ts:7627`) | stays overdue (5 → 5) | — | ✓ |
| Every Call on an owner already Contacted | stays | writes another "Stage → Contacted · First outreach logged" row (`store.ts:4683` tests the result, not a change) | | | ✓ |
| **WhatsApp** | stays | New → Contacted | stays | — | ✓ |
| **Reschedule** (`OwnerCallbackModal`: 2 h, later today, tomorrow 11, 3 days, next week, `Modals.jsx:1800`) | moves; "Callback scheduled" row | unchanged | leaves overdue | — | ✓ |
| **Callback done** (record card on the desk `Owners.jsx:108`, action list on both `definitions.jsx:757`) | closes; a "Callback cleared" note, no outcome, not counted as done (`activityReport.ts:180`) | unchanged | leaves overdue | — | ✓ |
| Status by hand → Call Not Received / Switch Off… | stays | as chosen | stays overdue | — | ✓ |
| Status → Not Interested / Do Not Call | stays in the row, no longer overdue (6 → 5) | as chosen | leaves | — | ✓ |

### 2c. Phone and desk

Same server writes; the differences are in the screens (R).

| | Phone | Desk |
|---|---|---|
| Call | Call → "This records an action… Continue?" → dialler; the outcome sheet opens while the dialler takes the screen, "Optional.", Skip (`Modals.jsx:1693-1767`) | Record call: outcome or remark required before Save (`Modals.jsx:608`) |
| Finish a meeting | Today row only | Today row only; the lead record's card has no Done (`Leads.jsx:554`) |
| Reschedule | FAB → Reschedule | record card |
| Owner Callback done | action list | card + action list |

---

## 3. Om's scenario, step by step

**On a lead**, booked "Follow-up Call" for Thursday 11:00.

| Step | What happens | What the agent sees |
|---|---|---|
| Mon, books it | `Scheduled` row | "Next · Follow-up Call · Thu 11:00" |
| Thu 11:00 | `followup_due` push; Overdue +1 | Overdue group, badge |
| Presses Call | booking closed, `Completed` row, alert closed | the row leaves Overdue before the dialler opens |
| Picks "Call not received" | status → Call Not Received | "Nothing booked". The lead is in no group on Today except the quiet list; **nothing reminds anyone to ring again** |
| Friday | | nothing; Performance counted Thursday's follow-up as done |

If the booking was a **site visit or meeting** ("call to confirm the visit"),
or older free text with no "call" in it: the Call closes nothing, the status
moves to Call Not Received, and the row **stays overdue** until the agent opens
Reschedule. That is Om's report.

With the held fix `3dcb711` (s-phone-bugs) merged: Call no longer closes; **any
outcome**, including "Call not received", closes it. Same erased reminder,
one tap later; Skip leaves it overdue.

**On an owner**, callback Thursday 11:00.

| Step | What happens | What the agent sees |
|---|---|---|
| Thu 11:00 | no alert | "Callbacks overdue" +1, badge |
| Presses Call | `last_call_at`; New → Contacted | still in Callbacks overdue |
| Picks "Call not received" | nothing | status still **Contacted**, callback still overdue, "Callback Thu 11:00" in red |
| | must open Reschedule and pick a time, or tap Callback done (which erases it with no record) | Friday: Performance shows a missed follow-up |

---

## 4. What disagrees

1. **Pressing Call closes a lead's booked call; it never closes an owner's.**
2. **The lead's booking closes before the outcome**, so "not received" ends
   the reminder and counts as a follow-up done.
3. **Call closes any call booking at any time**: calling at 9 about something
   else ends the 4 pm booking.
4. **"Call not received" moves a lead's status and not an owner's**; the owner
   is set to Contacted by the dial, so an owner nobody has spoken to reads
   Contacted (STATE: "Call not received → Contacted", open).
5. **Owners have "Callback done" that records nothing**; leads lost that
   control in August for exactly that reason. A lead's call booking has no
   Done; its meeting has one, on Today only.
6. **Clearing a lead booking writes `Completed`**, the same row a real finish
   writes.
7. **Kind by wording**: a booking reading "Follow up" or "<name>" is never
   closed by a call or a visit, only by Done.
8. **Only "not reached" changes a status.** The other seven outcomes change
   nothing, so a New lead someone has spoken to stays in "Not yet contacted".
9. **"Asked to call back" books nothing**, and a lead can sit at status
   Callback with no time.
10. **Leads get a due alert; owners get none.** The lead's alert is for
    bookings due in the last 24 h only.
11. **Every call on a Contacted owner writes another "First outreach logged"**.
12. **A manager's call on an agent's lead leaves an outcome nobody can add**:
    the call is the manager's, the outcome is author-only.
13. **Overdue means two things**: a lead is overdue if nobody pressed Call
    (answered or not); an owner is overdue whatever happened.

---

## 5. Proposed: one rule set for leads and owners

**What a booking is.** The next thing promised to this person, with a time:
a call, a visit or a meeting. A lead's follow-up and an owner's callback are
the same thing and follow the same rules (§3.2 of CLAUDE.md: one concept, one
implementation).

**The rules, as an agent is taught them.**

1. **A booking stays until you say how it went.** Pressing Call, WhatsApp or
   writing a remark never ends it.
2. **You say how it went in the sheet after the call.** That sheet decides the
   booking:
   - **Spoke to them** (discussed, sent details, asked to call back, coming for
     a visit): the booked call is done. The sheet asks what's next.
     "Asked to call back" and "Coming for a visit" need a time to save.
   - **Didn't get through** (not received, busy or switched off): the call is
     **not** done; it **moves**. The sheet shows "Next try: Tomorrow 11:00"
     (same time tomorrow), with In 2 hours and Pick beside it.
   - **It's over** (not interested, booked elsewhere, wrong number): the
     booking ends and the lead is rejected with that reason.
   - **Skip**: the booking stays exactly as it was. If it was overdue, it still
     is.
3. **Overdue means nobody tried.** A not-reached attempt moves the booking, so
   the person is not overdue; Performance still shows it as a try, not a
   conversation (`CALL_REACH` already tells them apart).
4. **Visits and meetings are finished by doing them**: Log visit (proof, PLAN
   Q4) or Done with how it went. A call about them does not finish them; if the
   call says the visit moved, the sheet's "what's next" moves it.
5. **The status follows the outcome**, by the map in phone-redesign §2 (one
   file, `outcomeStatus.js`). Kept: not reached → Call Not Received (leads and
   owners; owners' busy/off → Switch Off); proven visit → Site Visit. Added:
   reached → Follow-Up for a lead, Contacted for an owner. Dropped: an owner
   moved to Contacted by dialling.
6. **Three tries with no answer, and the sheet asks.** After the third
   not-reached in a row the sheet also offers "Reject · Not answering"
   (`REJECTION_REASONS` already has it; owners have "Never answers"). Never
   automatic.

**What goes away.** Call closing the booking (`actions.ts:218`); "Callback
done" with no outcome; the `Completed` row on a hand clear; the dial's
New → Contacted; the repeated "First outreach logged" row.

**Where it lands.** The after-call sheet in `phone-redesign.md` §2, item 7,
changes from "If the lead had a booked call, saving closes it" to rule 2
above, and the server route `after-contact` does the booking write in the same
transaction (close, move, or nothing on Skip). Owners use the same sheet and
the same route with `callback_at`, as that spec's step 4 already plans. The
held fix `3dcb711` should not merge as it is: it closes the booking on
"Call not received" too. Merge it changed to "closes on a reached outcome"
or fold it into the sheet.

### Om's decisions

**D1. After "not received", does the next try come pre-filled?**
Example: Kavish rings Nikhil at 11:00 Thursday, no answer, and taps Save.
*Yes:* the call moves to Friday 11:00 unless he taps In 2 hours or Pick; one
tap total. *No:* Save stays disabled until he picks a time; two taps, and
nothing moves he did not choose. Phone-redesign Q4 recommends no pre-picked
next step because an unchosen booking is invented; this is different, the
call was already booked and is only being kept.
**Recommendation: yes, tomorrow at the same time, shown on the Save button.**

**D2. Does an attempt nobody answered count as following up?**
Example: Thursday's callback, not received, moved to Friday. *Yes:* Nikhil
leaves Overdue; Performance shows Kavish tried. *No:* he stays overdue until
somebody speaks to him, and agents learn to log "discussed" to clear it.
**Recommendation: yes.**

**D3. After how many unanswered tries does the sheet offer Reject?**
Example: Nikhil has not picked up on Thu, Fri, Sat. *Three:* Saturday's sheet
offers "Reject · Not answering" beside "Next try". *Never:* the call moves
forever and the lead stays in the open book. **Recommendation: three, offered,
never automatic.**

**D4. Does dialling an owner still make them Contacted?**
(STATE's open "Call not received → Contacted".) Example: Rupali dials an owner
who never picks up. *Yes, keep it:* the owner reads Contacted; the calling
list cannot tell spoken-to from rang-out. *No:* the outcome sets it (Call Not
Received, Switch Off, Contacted); a dial with Skip leaves New, and the
"never called" pile is read from `last_call_at`, as it already is.
**Recommendation: no, the outcome sets it.**

**D5. Owners' "Callback done" goes?**
Example: Rupali taps Callback done; today the callback vanishes and the
history says "Callback cleared". *Yes:* a callback ends by the after-call
sheet, Reschedule, or Reject, like a lead. *No:* keep a free clear for
callbacks that no longer matter (owner sold elsewhere and nobody rejected).
**Recommendation: yes; the stale case is Reject.**

PLAN Q4 (visit proof) is not decided here; rule 4 works either way.

---

## 6. Production queries to size it (read only)

Run each through the pooler with `postgres(url, { max: 1, ssl: 'require' })`
and the whole file inside one `BEGIN READ ONLY … ROLLBACK`. Checked against
the local stack: they parse and count the cases driven above correctly
(Q1 found the 5 call-closed bookings, 2 of them not reached).

```sql
BEGIN READ ONLY;

-- Q1. Reminders erased by a call (leads, 60 days): a 'Completed' row within
-- 5 s of a call, split by the call's outcome, and how many not-reached ones
-- had no new booking in 24 h and no further call or WhatsApp in 3 days.
SELECT t.slug,
       count(*) AS closed_by_call,
       count(*) FILTER (WHERE c.metadata->>'outcome' IN ('no_answer','unreachable')) AS not_reached,
       count(*) FILTER (WHERE c.metadata->>'outcome' IS NULL) AS no_outcome,
       count(*) FILTER (WHERE c.metadata->>'outcome' IN ('no_answer','unreachable')
         AND NOT EXISTS (SELECT 1 FROM crm_timeline_events n
                          WHERE n.tenant_id = d.tenant_id AND n.record_id = d.record_id
                            AND n.type = 'follow_up' AND n.title IN ('Scheduled','Rescheduled')
                            AND n.timestamp > d.timestamp AND n.timestamp < d.timestamp + interval '24 hours')
         AND NOT EXISTS (SELECT 1 FROM crm_timeline_events n
                          WHERE n.tenant_id = d.tenant_id AND n.record_id = d.record_id
                            AND n.type IN ('call','whatsapp')
                            AND n.timestamp > d.timestamp + interval '5 seconds'
                            AND n.timestamp < d.timestamp + interval '3 days')) AS not_reached_then_nothing_3d
  FROM crm_timeline_events d
  JOIN tenants t ON t.id = d.tenant_id
  JOIN LATERAL (SELECT c.metadata FROM crm_timeline_events c
                 WHERE c.tenant_id = d.tenant_id AND c.record_id = d.record_id AND c.type = 'call'
                   AND c.timestamp BETWEEN d.timestamp - interval '5 seconds' AND d.timestamp
                 ORDER BY c.timestamp DESC LIMIT 1) c ON true
 WHERE d.type = 'follow_up' AND d.title = 'Completed'
   AND d.timestamp > now() - interval '60 days'
   AND t.slug IN ('bhumi','mahalaxmi')
 GROUP BY t.slug;

-- Q2. Leads overdue now, by booking kind, and whether a call came after it fell due.
SELECT t.slug,
       CASE WHEN l.follow_up->>'action' ~* 'site\s*visit' THEN 'visit'
            WHEN l.follow_up->>'action' ~* 'meeting|demo'  THEN 'meeting'
            WHEN l.follow_up->>'action' ~* 'call|callback' THEN 'call'
            ELSE 'no kind (free text)' END AS kind,
       count(*) AS overdue,
       count(*) FILTER (WHERE x.last_call IS NOT NULL) AS called_after_due,
       count(*) FILTER (WHERE x.outcome IN ('no_answer','unreachable')) AS last_call_not_reached,
       round(avg(extract(epoch FROM now() - (l.follow_up->>'at')::timestamptz)) / 86400, 1) AS avg_days_late
  FROM crm_leads l
  JOIN tenants t ON t.id = l.tenant_id
  LEFT JOIN LATERAL (SELECT c.timestamp AS last_call, c.metadata->>'outcome' AS outcome
                       FROM crm_timeline_events c
                      WHERE c.tenant_id = l.tenant_id AND c.record_id = l.id AND c.type = 'call'
                        AND c.timestamp > (l.follow_up->>'at')::timestamptz
                      ORDER BY c.timestamp DESC LIMIT 1) x ON true
 WHERE t.slug IN ('bhumi','mahalaxmi')
   AND l.stage NOT IN ('Deal Closed','Rejected')
   AND l.follow_up->>'at' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}'
   AND (l.follow_up->>'at')::timestamptz < now()
 GROUP BY 1, 2 ORDER BY 1, 2;

-- Q3. Owners: callbacks overdue now, and what the last call after the callback time said.
SELECT t.slug,
       count(*) AS callbacks_overdue,
       count(*) FILTER (WHERE x.last_call IS NOT NULL) AS called_after_due,
       count(*) FILTER (WHERE x.outcome IN ('no_answer','unreachable')) AS last_call_not_reached,
       count(*) FILTER (WHERE x.last_call IS NOT NULL AND x.outcome IS NULL) AS last_call_no_outcome,
       count(*) FILTER (WHERE o.stage IN ('Call Not Received','Incoming Not Available','Switch Off')) AS status_not_reached,
       round(avg(extract(epoch FROM now() - o.callback_at)) / 86400, 1) AS avg_days_late,
       count(*) FILTER (WHERE o.callback_at < now() - interval '7 days') AS late_7d_plus
  FROM crm_owners o
  JOIN tenants t ON t.id = o.tenant_id
  LEFT JOIN LATERAL (SELECT c.timestamp AS last_call, c.metadata->>'outcome' AS outcome
                       FROM crm_timeline_events c
                      WHERE c.tenant_id = o.tenant_id AND c.record_id = o.id AND c.type = 'call'
                        AND c.timestamp > o.callback_at
                      ORDER BY c.timestamp DESC LIMIT 1) x ON true
 WHERE t.slug IN ('bhumi','mahalaxmi')
   AND coalesce(o.stage,'New') NOT IN ('Not Interested','Do Not Call')
   AND o.callback_at IS NOT NULL AND o.callback_at < now()
 GROUP BY 1;

-- Q4. After a call that did not get through (leads and owners, 3 to 60 days
-- ago): booked within 10 minutes, rung again within 1 and 3 days, never again.
SELECT t.slug,
       CASE WHEN EXISTS (SELECT 1 FROM crm_owners o WHERE o.tenant_id = c.tenant_id AND o.id = c.record_id)
            THEN 'owner' ELSE 'lead' END AS side,
       count(*) AS not_reached_calls,
       count(*) FILTER (WHERE nb.at IS NOT NULL AND nb.at < c.timestamp + interval '10 minutes') AS booked_within_10min,
       count(*) FILTER (WHERE nc.at IS NOT NULL AND nc.at < c.timestamp + interval '1 day') AS called_again_1d,
       count(*) FILTER (WHERE nc.at IS NOT NULL AND nc.at < c.timestamp + interval '3 days') AS called_again_3d,
       count(*) FILTER (WHERE nc.at IS NULL) AS never_called_again
  FROM crm_timeline_events c
  JOIN tenants t ON t.id = c.tenant_id
  LEFT JOIN LATERAL (SELECT min(n.timestamp) AS at FROM crm_timeline_events n
                      WHERE n.tenant_id = c.tenant_id AND n.record_id = c.record_id
                        AND n.type = 'follow_up' AND n.title IN ('Scheduled','Rescheduled','Callback scheduled')
                        AND n.timestamp > c.timestamp) nb ON true
  LEFT JOIN LATERAL (SELECT min(n.timestamp) AS at FROM crm_timeline_events n
                      WHERE n.tenant_id = c.tenant_id AND n.record_id = c.record_id
                        AND n.type = 'call' AND n.timestamp > c.timestamp) nc ON true
 WHERE c.type = 'call' AND c.metadata->>'outcome' IN ('no_answer','unreachable')
   AND c.timestamp > now() - interval '60 days' AND c.timestamp < now() - interval '3 days'
   AND t.slug IN ('bhumi','mahalaxmi')
 GROUP BY 1, 2 ORDER BY 1, 2;

ROLLBACK;
```

What each answers: Q1, how often the lead rule erases a reminder on a call
nobody answered, and how often nobody tried again. Q2, Om's lead case
(visits, meetings, no-kind bookings overdue after a call). Q3, Om's owner case.
Q4, whether agents re-book after "not received" today, which is what D1 would
do for them.
