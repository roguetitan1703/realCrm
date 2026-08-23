# Desk rework — A to H

Decisions taken with the user 22–23 Aug 2026, walked letter by letter. This is
the **execution document**: it holds what was agreed, why, and where the build
has got to. Update the ledger at the bottom after every step.

The two ideas in §1 and §2 are underneath most of what follows. Build them and
the rest stops being eight separate fixes.

---

## §1 One definition of contact — BUILT (step 1)

Contact is **any timeline event authored by a real person** — call, whatsapp,
sms, email, remark, note, stage change, **follow-up booked** — **or** any
activity of type call, meeting, site visit.

`author <> 'System'` is the whole guard, and the type list is still a list:
`assignment`, `creation` and `lead` are System-written today and would start
counting the day one of them carried a name. A lead is not contacted because
somebody created it. `follow_up` was added on 23 Aug after the audit — booking a
next step is work done on the lead — and it moved **one** lead, on `urban`;
bhumi, delpat, raipur and skyline-realty did not change. Lead creation, the status mirror and
the re-enquiry events are System-written; count those and every lead is
contacted the moment it arrives.

Lives in `backend/src/services/leadSegments.ts` — key, label, help and SQL in
one file. Keys are stable (they appear in query strings), labels are not.

Measured on bhumi before building: not-contacted 83 under the old rule, **7**
under this one. 76 leads had been demonstrably worked.

## §2 Enquiry rows are the history; the lead row is the current ask

`crm_lead_enquiries` already holds every enquiry **including the first** — the
ingest writes a row for the arrival too. So the lead's own columns carry no
history worth protecting.

| Holds | Means | On a repeat enquiry |
|---|---|---|
| `crm_lead_enquiries` | Every enquiry, first included | Gains a row. Never overwritten |
| `crm_leads.req.*` | The latest ask — card, list, filters, matching | Overwritten |
| `crm_leads.source` | Where the lead **arrived** from — attribution | Untouched |
| `crm_leads.created_at` | First received | Untouched |

Source is the exception: overwriting it rewrites where the lead came from. The
list's "latest source" and Details' "all sources" both derive from the enquiry
rows instead.

---

## A · Counts that agree with each other

| Label | Means | Where |
|---|---|---|
| All | Everything in the current view | Filter row |
| Today | Arrived today | Filter row, KPI |
| Not contacted | Nobody has called, messaged, remarked, booked anything or moved it — ever | Filter row, KPI |
| No reply | We reached out, nothing back, nothing logged for N days | Filter row, KPI |
| Follow-up overdue | A booked follow-up whose time has passed | Filter row, KPI |
| Going cold | Still open, nothing recorded for N days | Filter row, dashboard |
| Came back | Enquired again | Filter row |

- **− Past SLA** — never-contacted with a clock, wearing a second name on a
  second screen.
- **− Never called** — "called" is not the desk's word, and the count was wrong.
- **− No answer, not retried → No reply** — it never knew whether anyone
  retried; it inferred that from `updated_at`.
- **+ Going cold as one thing** — was a toggle between two other segments. Now
  open and silent for N days, which gives `reminderDays` a job.

## B · Filters that react to each other

**The rule: every facet counts under the other filters, but not under itself.**
Choose agent Binod and the segment pills show Binod's numbers; then choose No
reply and the status counts narrow further while the segment pills keep showing
what switching would give you.

**Counts of zero stay visible, dimmed and unclickable** — the row must not
reflow every time a filter is touched.

- **+ Agent as a top-level control** — beside Type and Status, height-capped
  with internal scroll (`max_agents` is 25), plus Unassigned and Me. Removed
  from the nested panel; two controls for one question is how the pills and the
  KPI strip started disagreeing.
- **− Needs attention** — Past SLA is gone by A, and "Nobody assigned" is the
  Agent dropdown's Unassigned entry.
- **+ Source and Locality from the data**, ordered by count. They list
  *configured* sources today, so a portal with zero leads is offerable.
- **+ Phone: tapping a segment scrolls the row to it**, so its neighbours stay
  visible.

Parked: Configuration, Budget band and Project as filters. All three wanted;
each needs an explicit **Not stated** option first, and a filter that silently
drops unknowns invents a fact.

## C · A lead who came back twice

`crm_lead_enquiries` groups payloads into six-hour sessions and counts 2; the
timeline writes one row per push and shows 4. **The session wins** — one person
came back once, which is what a human would say.

| Kind | Fields | Card & list | Details |
|---|---|---|---|
| Replacing | config, budget, locality, deal type | Latest, plain | Every value asked |
| Accumulating | property interested, sources | `latest +N` | Full set |

Details, accumulating:

```
Attribution Source     99acres, Property Circle
Property Interested    Godrej Green Vistas, Godrej Green Cove
Requirement Config     2 BHK, 3 BHK
Budget                 ₹68L – ₹95L
Preferred Locality     Mahalunge
First received         16 Aug, 10:17 pm
Last enquiry           22 Aug, 11:28 pm
```

Enquiries, as sessions with their payloads:

```
2 enquiries
  22 Aug, 10:27 – 11:28 pm                  2 enquiries in this visit
    11:28 pm   99acres           2 BHK   ₹70L   Godrej Green Cove
    10:27 pm   Property Circle   3 BHK   ₹95L   Godrej Green Vistas
  16 Aug, 10:17 – 10:19 pm                  3 enquiries in this visit
    ...
```

- **− The "N listings" pill** and **− the "90% match" percentage** — a score the
  desk cannot inspect or argue with. Nothing replaces it for now.
- **+ Matching on the accumulated span** — 2–3 BHK, ₹68L–₹95L, not a single
  latest point.
- **+ Repeat badge in the list, with a count.**
- **+ List shows the latest enquiry time**; Details keeps First received **and**
  Last enquiry.
- The header currently renders two property values with no separator — a
  straight bug.

## D · One event per thing

A stage change writes two rows in the same second for one fact:

```
Stage Changed -> Call Not Received: Stage updated via CRM view    Binod · 11:33
Status Updated: Status changed from "New" to "Call Not Received". System · 11:33
```

They collapse to one. A repeat enquiry likewise writes **a single event** saying
the lead re-enquired and that the stage moved.

## E · A lead who comes back is a live lead

Arrived again → move to the first configured stage. The timeline explains what
happened. This **overrides** the reason-based conditional shipped in `eccac72`,
where any rejection reading as do-not-call stayed shut.

- **+ Rejected leads reopen**, whatever the reason — and the rejection reason is
  **surfaced**, so an agent can see this person was rejected and came back.
- **+ Closed deals reopen too.** Leads stay leads; a Deals module later is where
  closed business will live.
- **= The agent does not change.** Reassignment is a separate rule, in F.
- **= "New" means the first configured stage**, not the literal string.

## F · Settings in the desk's own words

| Control today | Stored | What it really does |
|---|---|---|
| First response | `slaHours` | Real — drives the escalation alert |
| Ongoing follow-up | `reminderDays` | ~~Nothing~~ — step 1 wired it to Going cold |
| Pick up unowned | `sweep_unassigned_hours` | Waits 4 hours to assign a live enquiry |
| Reassign idle | `reassign_idle_hours` | Hours, default 2 |

Replaced by:

```
Response times
  A new lead should hear back within        [ 24 ] hours
    Alerts the assignee, then escalates to a manager.
  Treat a lead as gone cold after           [  3 ] days
    Shows on the dashboard under Going cold, and in the Leads filters.

Assignment
  Assign leads that have no agent                        [toggle]
  Reassign a lead if no activity on it for  [ 3 ] days   [toggle]
  Tell a manager if a lead is reassigned more than [ 3 ] times
    It keeps being reassigned. The manager is told each time after that.
```

- **− "SLA"** — not a word the desk speaks.
- **− The unowned hours field.** Nothing ever sets `agent_id` back to NULL, so a
  lead is unowned only at arrival. The ~1 minute grace period stays, hardcoded.
- **+ "No activity" is the predicate from §1.**
- **= Stops at Rejected and Deal Closed.** Not open work.
- **= The owner calling list gets the same two rules** — days, no unowned hours.
- Reassignment **never changes the stage**. Ownership and progress are different
  facts.
- Reassignment does not stop: if nobody ever acts it keeps reassigning, and the
  manager is told **every time** past the third.

## G · Two WhatsApp templates, not one message

| Template | What it is | Edits | Sees |
|---|---|---|---|
| WhatsApp message | Fills in from the lead and opens WhatsApp when the button is pressed | Owner, Manager | Owner, Manager |
| Intro message | A short standing introduction — firm and agent name, no lead fields. Copy and paste anywhere | Owner, Manager | Everyone |

The agent sees the intro read-only with a **Copy** button and a line saying the
owner can edit it, so they know who to ask. No sign the other template exists.

Lives in Settings → Messages, the same component on the phone's Me screen. One
implementation, two surfaces.

## H · Alerts and install, one shape

`readyRegistration()` races `navigator.serviceWorker.ready` against a 5s timer.
A cold load loses that race, so `pushStatus()` returns `permission:'unsupported'`
— "not ready yet" reported as "this browser cannot do push". Three symptoms, one
fault:

1. The false "alerts unavailable" on first tab load.
2. The **empty card** in Settings → Alerts: `PushRow` returns `null` while
   `pushStatus()` is pending, and the `<Panel>` around it renders regardless.
3. The permission **never asked** — `autoEnablePush()` → `currentSubscription()`
   → the same race.

- **+ "Checking…"** while the worker starts; re-check when it becomes ready.
- **+ One shape, one section** — Alerts and install as identical rows under
  **This device**, which already exists.
- **+ Wait on `getRegistration()`, not a stopwatch.** `undefined` means there is
  genuinely none, so answer now; a registration means wait on its own state
  change. The sign-out hang stays impossible.
- **= Inside the installed app, the install row stays hidden.**
- **+ In a browser with the app installed: a tick, "Installed".** No button — a
  link that cannot launch the app is worse than nothing.
- **− The empty card.** If both rows have nothing to say, the card does not exist.

**The timeout guards something real**: `serviceWorker.ready` never resolves when
no registration covers the document — reachable since the worker was scoped to
`/<slug>/`, because a URL missing the trailing slash sits outside every scope.
A stopwatch cannot tell that from "still activating". `getRegistration()` can.

**Open question:** whether the installed tick can render in a browser tab at
all. Needs `related_applications` in the manifest plus
`getInstalledRelatedApps()`, Chromium only. To be tried and reported, not
promised. If it does not work the row keeps offering Install, which is what it
does today and is not wrong.

---

## Build order

Dependency order, not priority. Steps 2–5 all read what step 1 defines.

| # | Step | Depends on | Letters | State |
|---|---|---|---|---|
| 1 | Contact predicate + segment catalogue | — | §1, A | **done** `19287fb` |
| 2 | Facet counts + filter controls | 1 | B | **done** |
| 3 | The enquiry model | — | C | **done** |
| 4 | Timeline and reopening | 3 | D, E | **done** |
| 5 | Settings | 1 | F | **done** |
| 6 | WhatsApp templates | — | G | **done** |
| 7 | This device | — | H | todo |

### Ledger

Append one block per step. Numbers, not adjectives.

**Step 1 — `19287fb`, 23 Aug 2026.** `leadSegments.ts` created; `untouched_sla`
deleted; `reminderDays` given a job as `coldDays`. Verified in a browser against
the shape-cloned dev desk: tiles and pills both read Not contacted 7 · No reply
65 · Going cold 142 · Today 1 · Overdue 8 · Came back 21, no console errors.
Dev pool capped at 4 (`db.ts`) — the Supabase dev project caps the whole
project at 15 clients.

**Step 2 — 23 Aug 2026.** `getLeadsSummary(filters)` takes the same query
parameters as `/leads/page` and counts under them, each facet excluding its own
dimension (`leadFilterParts` in `store.ts`, one builder read by both). Agent
promoted to a top-level control beside Type and Status, searchable past 7
options, built from the whole roster so an agent holding nothing shows a dead 0
rather than vanishing. Source and Locality come from the data with counts, in
place of the firm's configured list and the browser's own collection. Zero
options everywhere stay rendered, dimmed and unclickable. The phone's segment
row scrolls the tapped pill into view.

Locality also stopped being a `LIKE`: both the option's count and the rows it
opens now reduce to the same normalised key, so they cannot disagree.

Verified in a browser (293-lead shape clone, 1440×900 + iPhone 13):
unfiltered 293; one agent 95 with pills 2 · 35 · 51; adding `going_cold` gave 51
with stage counts summing to 51; list total == summary total at every step; the
Agent facet held its full counts while agent was selected; `source=Website` (3)
left six zero pills on screen and disabled; the phone row scrolled 0→470 with the
tapped pill fully visible; no console errors.

**Step 3 — 23 Aug 2026.** `crm_lead_enquiries` gained `payloads`: the session
kept a count of the enquiries it was made of and not the enquiries, so the
record could say "2 enquiries in this visit" with nothing underneath it. The
payloads are stored rather than resolved from `webhook_inbox` at read time,
because data-lifecycle purges those bodies at 30 days and the history has to
outlive them. `payload_count` is now written as the length of that list — it was
`payload_count + 1`, a second answer to "how many", and two backends replaying
the same inbox rows left a session claiming 8 payloads over 6 lines.

`enquiryRollup()` is the one derivation of the whole ask — sets latest-first for
source, config, locality and property interested; the budget span; first and
last. The record sheet reads it, the header reads its first value and a `+N`,
`getLeadCandidates` narrows on the span and `askedFor()` scores on it, so the
suggestions and the sheet describe the same person. `facetFit` matches any
config asked for rather than the latest, and locality compares through one
helper that reads a value or a list.

The rebuild deletes only what it can rebuild — a session with a purged payload
keeps its count and its span rather than being replaced by nothing.

Removed: the `N listings` pill, the `90% match` on the record, the `% fit` on
Attach a property and the `82% match` tag in the WhatsApp composer. The record
header printed two property values with no separator at all — an array rendered
straight — and now reads `Godrej Green Vistas +1`, the set being on the sheet.
The list's time column is `Last enquiry`, sorted on the same expression it
renders.

Verified in a browser (293-lead shape clone, 1440×900 + iPhone 13, `delpat` on
development): a lead with 2 sessions over 5 payloads renders 2 sessions and 5
lines, the badge says `2 enquiries`, Details reads Attribution Source `99acres,
Property Circle` · Config `2 BHK, 3 BHK` · Property Interested `Godrej Green
Vistas, Godrej Green Cove` · Budget To `₹95L` · First received `16 Aug, 10:17
pm` · Last enquiry `Yesterday, 11:28 pm`. The Came back segment opened 20 rows
each carrying a repeat badge. No `% match` or `N listings` anywhere on the list
or the record. On the phone all 5 payload lines sit inside 390px and the body
does not scroll sideways. No console errors.

The dev desk was re-cloned so its sessions carry payloads
(`shape-clone-to-dev.ts`), which also fixed the scrubber rewriting ISO instants:
`2026-08-22T…` matched its phone pattern and every payload line lost its time.

**Step 3, second pass — the readers, not just the two the example named.**
`latest +N` was applied to the record header and nowhere else, so the card and
the desk list — which both go through `reqShort()` — still printed
`Godrej Green VistasGodrej Green Cove`. Fixed there, and swept: Contacts' row
and its detail, the interested-buyer rows on a listing and in the WhatsApp
composer, the client-facing `followUpMessage` (which would have said "a 2
BHK,3 BHK in Mahalunge,Wakad" to a buyer), the locality predicate in
`rowMatch`, the locality that goes into the attach-property query, and the
in-memory search in `routes/records.ts`, where an array would have been a 500
rather than a missed match. The third raw locality compare — the one deciding a
visit count sent to an owner — now goes through `localityFit` like the other
two.

**The order was wrong, and it was ours.** `mergeRepeatReq` appends, so the
lead's list is oldest-first; the rollup was building its sets newest-first. One
concept, two orders — `latest +N` was labelling the OLDEST project as the
latest. Arrival order is now canonical in both, `latestOf()` is the single
reader of "which one is it now", and the sheet prints the list in the order the
person asked.

**Editing a lead destroyed the accumulation.** `ModuleFormModal` put the array
into a text box (`A,B,C`) and saved that string back as one value, so opening
Edit and pressing Save flattened the history without anybody typing. A schema
field can now declare `toForm`/`fromForm`; `req.interest` uses the one
`listText`/`textList` pair, and so does the quick-add form.

Verified in a browser on a lead carrying three projects: the list row reads
`3 BHK · Buy · Mahalunge · Up to ₹95L · VTP Belair +2`, the header the same, the
sheet all three in order, the edit box `Godrej Green Vistas, Godrej Green Cove,
VTP Belair` — and after **Save changes** with nothing typed, the stored value is
still the three-element list. Contacts reads the same. No console errors.

`docs/specs/repeat-enquiries.md` is **deleted** — superseded by §2 and C here,
and its §8b contradicted E. The code comments that cited it now cite this file.

**Audit of steps 1–3, 23 Aug 2026.** Checked against the artifact item by item
before starting step 4. One deliverable was missing.

**§1's segment catalogue was never actually served.** `publicSegments()` was
exported and called from nowhere — dead code — while `definitions.jsx` kept its
own copy of every pill label and `Dashboard.jsx` its own copy of every tile
label. Three copies, which is what the file was created to end, and its own
header comment claimed the labels were "served to the frontend (workspace
bootstrap) rather than repeated there", which was not true. They had already
drifted: the catalogue marks Not contacted `tone: 'alert'` and the pill was
rendering without it.

Now in the bootstrap payload as `leadSegments`. The Leads pills and the
dashboard tiles both read it; each keeps an explicit fallback list, because the
frontend deploys on a push and the backend by hand, so a browser can be a week
ahead of the API it is talking to and a Leads screen with no pills is worse than
a stale label. When the two disagree the server wins.

Verified in a browser: pills read All 293 · Today 1 · Not contacted 7 · No reply
72 · Going cold 161 · Follow-up overdue 8 · Came back 21, with the alert tone on
the three the catalogue marks — proof they are the served list, since the old
local copy did not mark Not contacted. The dashboard's tiles read the same words
and the same numbers (7, 72, 161, 1). No console errors.

What was checked and found correct: the Agent control's Unassigned entry, the
whole roster including someone holding nothing, off-roster holders, the 280px
cap with internal scroll and the search past 7 options; the zero-count options
rendered dimmed and disabled; the filter panel down to Source and Locality from
the data; `reminderDays` driving `coldDays`; and the dashboard reading the SAME
`leadSegments()` expressions under the SAME `leadScope()` as the list, so a tile
and the pill it opens cannot diverge for an agent either. "Past SLA",
"Never called" and "Needs attention" survive only in comments explaining why
they went — the "Never called" on the dashboard is the OWNER calling queue,
where it is accurate.

**Step 4 — 23 Aug 2026.** D and E, which are one write path.

**The duplicate writer was already fixed** — the last `Status Updated` +
`Stage Changed ->` pair on the live desk is 17 Aug. What remained was the
history: 199 of bhumi's 263 mirrors sit beside a person-authored twin, and an
agent opening one of those records still read the fact twice. They are dropped
at READ time, paired-only, in `collapseStatusMirrors()`. That restriction is
load-bearing: **64 of the 263 have no twin, and every one is a rejection whose
reason survives nowhere else** — a blanket purge would have destroyed them.
Nothing is written or deleted; the ledger keeps what happened.

**A repeat enquiry writes one event, once per session.** It used to write a
`lead` row per PUSH — four rows for the man who opened four listings in five
minutes, against a counter reading one — plus a separate `stage_change` beside
it when the lead reopened. Now: one row, saying both facts.

**E, in full.** The reason-based conditional is gone: a rejected lead reopens
whatever the reason, `Deal Closed` reopens too, the agent does not change, and
the arrival stage is the first configured one. The rejection reason is **kept**
rather than nulled — `updateLead` cleared it on every save where the stage was
not Rejected, so the fact E asks to be surfaced would have vanished on the next
unrelated edit. It is now cleared only when that patch moves the stage, i.e.
when a person decides. Measured first: no lead on any tenant carried a reason
while not rejected, so the state this creates is always a reopen.

Both repeat alerts had stopped being true and were rewritten: `lead_repeat_rejected`
said "left rejected" for a lead that now reopens, and `lead_repeat` called a
closed deal a rejection off a boolean. They name the stage it came from.

Verified by pushing twice at a rejected lead through the **real ingest
endpoint** on the development API. Stage `Rejected → New`, `rejection_reason`
"No Requirement" preserved, ONE System event —
`Rejected → New — enquired again via MagicBricks (was rejected: No Requirement)` —
and the second push added no event and folded into the same session
(`payload_count` 2). In the browser the record's status line reads
`New · Was rejected — No Requirement`, and a lead holding 7 raw rows of which 3
are legacy mirrors renders 4. No console errors.

Not covered, deliberately: the reopen writes through raw SQL and so leaves no
`audit_log` row — the same as before this change, not a regression, but the
ledger cannot answer "who reopened this" for a machine reopen.

**Step 5 — F, 23 Aug 2026.** Settings speaks the desk's words, and two of its
controls turned out to be lying about what they did.

*Response times* (was "Follow-up SLA"). "A new lead should hear back within
[24] hours" — `slaHours`, unchanged, already driving the escalation. "Treat a
lead as gone cold after [3] days" — `reminderDays`, which step 1 wired to Going
cold while the control still called itself "Ongoing follow-up" and claimed to
nudge a lead "back to the top", which nothing does. The stored KEY stays
`reminderDays`: it is what every tenant's settings JSON holds, and renaming it
resets the number to 3 on any desk that had set one. The sentence names the
pile using the label the server serves, so it cannot end up naming something the
Leads screen no longer calls that.

*Assignment.* The unowned hours field is gone — nothing in the product ever sets
`agent_id` back to NULL, so the number was asking how long a live enquiry should
sit with nobody on it. One minute of grace is left, hardcoded, and only so
arrival-time routing wins the race and the timeline reads correctly.

*The idle rule is in days and asks the §1 question.* It read `updated_at`, which
a portal push or any background stamp moves without a person going near the
lead — so a lead could be reported Going cold on the dashboard and count as
active to the sweep at the same moment. Both now read
`noPersonActivitySince()`. Off on every tenant, so nothing moved: at 3 days it
would select delpat 161, urban 40, raipur 40, skyline-realty 11 — 161 being the
same 161 the Going cold tile shows, which is the point. Owners: delpat 731,
raipur 22, urban 22. **Turning either toggle on hands that many records over in
one pass.**

*Found on the way.* The idle sweep's own exclusion was
`(follow_up->>'date')::date >= CURRENT_DATE`, an unguarded cast over a field
holding whatever an agent typed — 20 leads across four tenants carry "This
Sunday", "Today", "Yesterday". Every one raises 22007 and takes the sweep down
with it. It has never fired because the rule is off everywhere; the day a firm
turned it on it would have thrown instead of reassigning, silently. Now
`FOLLOWUP_UPCOMING`, guarded the way `FOLLOWUP_PAST_DUE` already was.

*Manager alert.* "Tell a manager if a lead is reassigned more than [3] times",
`reassign_alert_count`, and every time after that. It lives in
`recordAssignment()` — the one function every path that changes `agent_id` goes
through — so a manual hand-off counts the same as a sweep's, and it is counted
from the record's own history rather than a flag that would go quiet exactly as
it started mattering. Hand-offs only: the arrival route and the unowned sweep
write an `assignment` row with no previous agent, and nobody has passed that
lead on. Leads only; owners are reassigned by the same sweep and carry the same
history, but the control is offered on the Leads side alone and a threshold
nobody can see is not a feature.

Verified in a browser on the dev clone: nav reads Response times, both sentences
render with their numbers, the unowned rule has no hours field, the idle rule
reveals "3 days" when switched on (and was switched straight back — 0 assignment
events before and after), the manager row shows "3 times", the Calling tab
carries the days field and no manager row, no console errors. Through the real
API: one lead handed back and forth five times produced NO alert at hand-offs
1–3, then "Reassigned 4 times" and "Reassigned 5 times", one row each to the
owner and both managers. Probe rows read, then deleted — 6 notifications, 5
assignment events; the lead is back with its original agent.

Not covered: bhumi's numbers. This machine cannot reach the production database
(the sandbox refuses it), so every count above is the dev clone. Exactly one of
production's seven tenants has any sweep enabled at all.

**Step 6 — G, 23 Aug 2026.** Two templates, one editor, and a permission that
turned out not to exist.

There was ONE stored template, `whatsappIntroTemplate`, holding the message
filled in from a lead. It is now the **WhatsApp message**, and the second one —
**Intro message**, `introMessage`, firm and agent name, no lead fields — is new.
The old key is NOT renamed: it is what every tenant's settings JSON holds, and a
rename hands a paying client the default in place of the sentence they wrote.
Both defaults live in `src/data/theme.js` with the distinction written above
them, because "intro" now names one of them and the key names the other.

**Two editors became one.** Settings → Message templates and the phone's Me
screen each had their own — one committing on blur with placeholder chips, one
on a Save button with a placeholder legend, neither aware of the other, both
over the same value. `components/MessageTemplates.jsx` is the only one now, and
both screens render it.

**The agent's view.** Intro only, resolved against the firm and their own name,
read-only, with a Copy button and a line naming who can change it. `introText()`
resolves it in one place because it goes to a CLIPBOARD — an agent pasting
"{agentName}" into a client's chat has been handed that by us. No sign the
WhatsApp template exists.

**A desktop agent could not see it at all.** The phone/desk switch is screen
size only, and Settings was refused to agents outright, so an agent on a monitor
had no surface for a template the spec says everyone can read. Settings now
filters its own nav by role: an agent sees Message templates, Alerts and This
device, and lands on the first of them rather than on a blank Brand pane.

**`POST /workspace/settings` had no role check.** Any signed-in agent could
rewrite the firm's pipeline stages, source list, name and templates. Nothing was
holding the rule — every screen that writes there was already behind a desk-role
check, so it was true by luck. It mattered the moment the intro became something
an agent is SHOWN: a template they may read but not change needs a server that
says so, not a hidden textarea. Measured first: no agent-facing screen calls it.

Verified in a browser on the dev clone. Owner: both editors, chips insert,
Copy puts the RESOLVED sentence on the clipboard (read back), a save survives a
reload, Reset returns the default and then disables itself, and the textarea
holds the raw template while the preview holds the resolved one. Agent on an
iPhone 13 viewport: intro only, resolved to "Kavish Deshmukh", Copy, the
who-line, **0 textareas**, no mention of the WhatsApp template. Agent at 1400px:
the same, reached through Settings, nav listing three sections. Through the API:
an agent's `POST /workspace/settings` returns 403 and persists nothing; the
owner's still saves. No console errors on any of it.

Not covered: `{agentName}` resolves from `store.me()`, which is the roster row
for the signed-in user. On a workspace where that lookup comes back empty the
placeholder resolves to nothing and the sentence closes up — it does not render
braces, but it does not name anybody either.

---

## Carried forward, unchanged

- Configuration, Budget and Project filters — wanted, parked until **Not stated**
  is settled.
- Percentage match on requirements — parked, to be done properly.
- A Deals module, so closed business leaves the leads list.

## Testing this

The development desk is a **shape clone of bhumi** —
`backend/src/scripts/shape-clone-to-dev.ts` puts the live desk's stage
distribution, timeline structure and enquiry sessions into `delpat` under
generated names and numbers. Every segment count matches production to the row.
Sign in at `/delpat` as `akashpatel` / `00000000`.

`backend/src/scripts/segment-audit.ts` is read-only and points at production —
run it before and after anything that changes what a segment counts.
