# ROADMAP 2 — from a lead list to a desk that tells you what to do

`ROADMAP.md` tracks what the product was missing. This one starts from what a
live desk is actually doing wrong, measured on `bhumi` on 2026-08-11, and asks
what the product should do about it.

Every number below is a real query against production, not an estimate.

---

## 1. What the desk looks like right now

120 leads, 7 agents, 3 portal connections, 6 days of real operation.

```
stage                 n    avg days since update   >3d
  New                  43          1.2              3
  Call Not Received    26          2.4             13
  Follow-Up            16          2.6             10
  Interested           15          2.0              4
  Rejected             13          2.7              8
  Site Visit            3          2.2              1
  Deal Closed           2          1.7              1
  Callback              2          2.7              1
```

**38 of 120 leads have never been contacted at all.** Not called, not messaged,
no remark. A third of everything the firm paid a portal for.

### Speed to first contact, by source

```
source          n    contacted   median hours   within 1h   → warm
  Housing.com   56      41           1.6           13        23%
  MagicBricks   53      39          15.3            2        15%
  99acres       10       2          13.6            0        10%
```

Same desk, same agents, same week. Housing leads are touched in 1.6 hours and
reach a warm stage at 23%. MagicBricks leads wait 15.3 hours and reach 15%.

This is the single most important relationship in the product and **nothing in
Nivaas measures it.** A brokerage's largest recurring cost is portal
subscriptions; their conversion is governed by how fast someone rings back; and
the CRM sitting in the middle of both reports neither.

### What the dashboard says while all of the above is true

```
Overdue follow-ups  0        ← reads a boolean column nothing ever sets (0 of 120)
Unassigned          0        ← always 0; auto-routing and pick-up mean it never fires
Arrived today       2
```

Three tiles, two structurally incapable of moving.

### The state of a "promise"

16 leads sit in stage **Follow-Up**. 15 have no follow-up record at all. The 3
that exist look like this:

```json
{"date": "This Sunday", "time": "10:30 am", "action": "Site Visit — …"}
```

`date` is a display string chosen from hardcoded chips
(`'Today', 'Tomorrow', 'This Saturday', 'This Sunday', '2026-07-15'` — the last
a literal date a month in the past). Nothing can sort it, query it, or fire on
it. Every feature that depends on "when is this due" is dark as a consequence:
overdue follow-ups, due-today, a trustworthy calendar, follow-up reminders.

### Notifications

The owner's feed holds **140 notifications, 102 unread**. The bell shows 30,
because the frontend counts the 30 rows the API returned rather than the total
the API also sent. Most of the 102 concern leads that were handled days ago —
nothing closes an alert when its work is done.

---

## 2. The thesis

Nivaas today is an accurate **record** of what happened. A desk does not need a
record in the morning; it needs to know **what is at risk, what was promised,
and whether it is keeping up.**

Everything below serves that shift. The ordering principle: a number belongs on
screen only if it is a pile someone works down, and it must shrink when they do.

---

## 3. Themes

### E1 — Speed to lead

The 1.6h vs 15.3h gap above is worth more than any feature in this document.

- **Time to first contact** as a first-class measure: per lead, per agent, per
  source, per hour of day. Median and "within 1h" share, because the average is
  dragged around by one overnight lead.
- **The arrival window matters.** Before building alerting, find out whether
  MagicBricks' 15.3h is because those leads arrive at night. If it is, the fix
  is a morning queue ordered by arrival, not a faster alert.
- **Sub-hour urgency.** The SLA is currently 24h. On a portal lead, 24 hours is
  already lost. A "rung within the hour" target is a different product: it wants
  a live queue on the phone, not a next-day digest.
- **Show the agent their own number.** Not a leaderboard — their median, this
  week, against the desk's.

### E2 — The retry ladder

26 leads (22% of the desk) sit in **Call Not Received**, 13 untouched for 3+
days. It has no exit rule, so it is where leads go to die quietly.

- **Attempts as data.** A lead rung once at 11am and one rung four times across
  three days at different hours are entirely different, and today the system
  cannot tell them apart.
- **A ladder, not a stage:** attempt 1 → 2 → 3 at spread hours, then park with a
  reason. Parking is a decision the desk makes, not decay.
- **Vary the hour.** Three attempts all at 11am is one attempt repeated.
- **Then, and only then, "unreachable" means something** — and becomes real
  feedback to the portal about number quality.

### E3 — The promise

Fixing the follow-up date model is what turns Nivaas from a list into an agenda.

- **A stored instant, not a phrase.** Relative chips ("Tomorrow", "This
  weekend") stay in the UI; they resolve to a timestamp on save.
- **Repair the 3 existing rows** — a fix to the generator does not fix what it
  generated.
- **Then the features that have been waiting on it:** due today, overdue,
  reminder before a site visit, a calendar that can be trusted, and the
  `followup_due` notification that has been inert since it was written.
- **A site visit needs an outcome.** 3 leads sit in Site Visit; a visit that
  happened and a visit nobody recorded look identical.

### E4 — A risk-first dashboard

Replace "what happened" with three bands, in this order.

**At risk** — untouched past SLA (11) · no answer, not retried 3+ days (13) ·
promised with no date (15).

**Committed today** — site visits today, follow-ups due, callbacks due.
Unblocked by E3.

**Keeping up** — arrived vs contacted today, median time to first contact,
source quality.

Retire **Overdue follow-ups** (counts a flag nothing sets) and demote
**Unassigned** to a settings-health check — it is 0 because routing works, and
the day it is not, that is a configuration alarm, not a daily KPI.

Split closed outcomes out of the stage chart. `New 43` beside `Rejected 13` and
`Deal Closed 2` in one bar chart adds open work to finished work.

### E5 — Notifications that close

The feed and the "at risk" band should be the same question asked two ways. If
something does not belong in *at risk* or *committed today*, it does not deserve
to interrupt anyone.

- **Resolve on action.** A lead leaving the arrival stage should close its SLA
  alerts. This is what fixes the 102-unread pile — not a retention timer.
- **Retention is then small:** purge read notifications after 30 days.
- **Missing alert, highest value:** no answer, not retried in 3 days → the
  assigned agent. That is the 13, and nothing tells anyone about them.
- **Re-notify the agent on escalation.** At 48h the alert goes to owner and
  manager only; the person who can actually make the call was told once at 24h
  and never again.
- **The badge must use the count the server already computes** (102, not 30).
- **The SLA sweep looks back only 144h.** Anything older is invisible forever —
  2 leads today, and it only grows.
- **Digest, not drip.** Seven agents receiving individual alerts all day will
  learn to ignore them. One morning list beats ten interruptions.

### E6 — Source economics

The firm's biggest recurring cost, currently invisible.

- **Cost per warm lead, per portal.** Volume, reject rate, warm rate, speed, and
  what they pay. Housing 23% warm vs MagicBricks 15% is a renewal conversation
  with a number attached.
- **Rejection reasons.** 13 rejected, no reason captured. "Wrong budget", "number
  doesn't exist", "already bought", "just browsing" are four different facts and
  three of them are portal quality. This is what makes the table above
  actionable rather than interesting.
- **Duplicate rate per source** — already measurable, never surfaced.
- **This is the report the owner forwards to the portal.** Build it to be sent.

### E7 — What a manager can actually see

```
agent      leads   untouched
 0896_4      19       11      ← 58% never contacted
 0657_3      22        4      ← 18%
```

Routing is even. Follow-through is not, by a factor of three, and no screen
shows it.

- **Per-agent: speed, contact rate, retry discipline, conversion.** Coaching
  facts, not a scoreboard.
- **Wire the performance endpoint that already exists** and is unused.
- **Scope `perAgentCalls`** — it currently ships every agent's calling
  throughput to every agent's browser.

### E8 — Lifecycle and hygiene

- **Leads need an end.** Nothing is ever archived or parked; the desk only grows.
- **Notification retention** (E5) and **webhook inbox retention** — raw payloads
  accumulate forever.
- **Import history is browser-only.** Losing it loses the ability to revert.

### E9 — Portal integration robustness

- **Ingest has no rate limit.** A write-only key, but a leaked one fills a desk
  faster than agents can reject it.
- **A connection that stops receiving should say so.** MagicBricks changing its
  payload mid-day was found by hand, days later.
- **Mapping health surfaced in the UI** — "3 of 11 fields mapped" belongs on the
  connection card, not in a modal nobody opens.
- **Dead-letter visibility.** A failed delivery currently exists only in a log.

---

## 4. Sequencing

### Now — this week

1. **Schedule modal writes a real date.** Unblocks E3 and everything under it.
2. **KPI row → the at-risk band.** Untouched past SLA, no-answer-not-retried,
   arrived today.
3. **No-answer-not-retried notification** to the assigned agent, and re-notify
   the agent at escalation.
4. **Badge uses the server's unread count.**

### Next

5. Resolve-on-action for notifications + 30-day purge of read ones.
6. Time to first contact, measured and shown (E1).
7. Attempts on the calling queue (E2).
8. Rejection reasons (E6).

### Later

9. Source economics report (E6).
10. Manager view + the unused performance endpoint (E7).
11. Sub-hour SLA and a live phone queue (E1).
12. Lifecycle, retention, connection health (E8, E9).

---

## 5. What is not in here

`ROADMAP.md` remains the source of truth for committed scope. This document is
the case for what the live data says should come next; when the two disagree,
`ROADMAP.md` wins until this one is folded into it.
