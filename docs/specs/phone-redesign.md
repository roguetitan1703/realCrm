# Phone redesign: the agent between calls

Status: 🧭 planning, for Om to approve. Mockups: `docs/specs/phone-redesign/`
(one HTML per screen, a PNG of each at iPhone 13 size).

**Who it is for.** The agent, on a phone, between calls. They want the next
person to ring and a way to say what happened with one thumb. An owner or
manager on a phone is the second phase (§6).

**What it does not change.** Every screen still comes from `MODULE_DEFINITION`
and the shared machinery: `ModuleDetail`, `PhoneActions`, `MobileShell`,
`Modals.jsx`, `PhoneToday` (which is the same page on desk and phone). Nothing
here is a new screen. Each section names the shared component the change lands
in, and what data each element reads (real fields only).

Out of scope, being fixed by another builder now: Call clearing the booked
follow-up, the Today badge missing overdue, the 38px New lead name field, the
clipped calendar grid, the demo-showcase calendar crash.

---

## 0. What the audit found, checked again

Audit of 28 Oct (screenshots in the session scratchpad, `phone-audit/shots`),
re-driven on 28 Oct against the development database at iPhone 13
(390×664), tenant `delpat`. Two of the audit's findings were wrong as worded,
and are corrected here.

| Finding | Evidence | Holds? |
|---|---|---|
| Today rows show only a time | Overdue row "Yash Iyer · Site Visit · **11:00 am**". The booking is **Fri 28 Aug**, two months ago (record header says so). The row reads as "today at 11". `PhoneToday.jsx LeadRow` prints `l.followUp.time` for overdue rows | Yes |
| One person in two groups | Yash Iyer is under Overdue **and** Not yet contacted; Sana Sharma under Due today **and** Not yet contacted. The server's `fresh` count only excludes came-back leads, not booked ones (`store.ts getTodayFeed`) | Yes, new |
| Names truncated | "Ananya Bhos…" 103/108px, "Mr. SUNIL SHI…" 114/125, "Ms. THEREZA SABRINA FRANK LOBO" 114/251 | Yes |
| The FAB covers rows | The FAB sits at y 538–592 over the last visible row's Call button ("Call Mr. SUNIL SHINDE" under it); on the lead record it covers the Details count. `.m-body` reserves 78px, the tab bar alone is 72 | Yes |
| Lead record meta is a run-on | `.rh-facts` is 4 lines, 92px: phone · email · 3 BHK · Fairhaven · RENT · Fernhill Towers · Via Portal Two | Yes |
| "Wrong number" printed twice | `LatestRemark` prints the outcome label in bold, then `said()`, which falls back to the event label, which is the same words | Yes |
| Status pill wraps | "Call Not Received" breaks onto 2 lines in the half-width status box | Yes |
| First screen does not show the next step | It does show it ("Overdue · Site Visit · Fri 28 Aug") but with no way to finish it except Log visit; a booked call or meeting has no Done on the phone record. Reschedule is behind the FAB | Partly: shown, not finishable |
| No single place to say what happened | Outcome sheet opens while the dialer takes over, says "Optional.", a `<select>` defaulting to "No outcome yet"; status is a separate control on the page behind it | Yes |
| Search missing on phone | **Corrected.** Leads and Calling lists have search. What is missing is search from Today or the top bar; the desk's global search (`SearchModal`, `api.search`) is never offered on the phone | Partly |
| Owner edit missing | `Owners.jsx` passes `onEdit` only on the desk; `PhoneActions` adds Edit for leads only. An owner record on the phone cannot be edited | Yes |
| Owner record says the callback twice | "Callback Tue, 13 Oct, 3:41 pm" in the facts and again on the line below; WhatsApp is both a full-width button and in the FAB | Yes, new |
| Owner/manager has no Team view on phone | **Corrected.** Today → Team exists for owner and manager (`TeamBoard`): team totals, per-agent cards, Needs attention by agent. What it lacks is "who stopped": no agent's last contact is shown anywhere | Partly |
| Tap targets under 44px | Bell 40×40; To do / My work / Team 33px tall; filter pills 40px; Me: Sign out 30, Change 29, Copy 28; Calling's search input 21px | Yes |

---

## 1. Today: who to ring next

**Who:** the agent. **Job:** open the app and ring the next person.

**Lands in:** `src/modules/phone/PhoneToday.jsx` (`TodoList`, `LeadRow`,
`OwnerRow`, `Group`), server `getTodayFeed` (`backend/src/services/store.ts`).
Same component on the desk's Today, so the desk gets the same rows.

**Change.**

1. **One list, each person once.** The ring groups (Overdue, Callbacks due,
   Due today, Callbacks later today, Came back today, Not yet contacted, Owners
   to call) become one ordered list. A person appears once, under the most
   urgent reason: overdue (oldest first) → due now and later today (by time)
   → came back today → new (newest first) → owners to call. Thin dividers keep
   the order readable ("Overdue 2", "Today 1", "New 3"), not separate cards.
   Tenancies expiring, Nobody assigned (desk) and Upcoming stay below as they
   are: they are not someone to ring now.
2. **Each row says why now, with the date.** Line 1: the name in full (wraps to
   a second line, never an ellipsis). Line 2: the reason and its moment:
   "Site visit · Fri 28 Aug, 11:00 am" in alert red when overdue, "Call · 5:00
   pm" for today, "Came back · 2 enquiries" for a repeat, "New · 2 BHK · Rent ·
   Fairhaven" for an uncontacted lead. Money stays off the row.
3. **Two 48×48 buttons per row: Call and WhatsApp.** On a booked visit or
   meeting that is due or overdue, the second button is the finish (Log visit /
   Done), because that is the work; WhatsApp is then on the record (open
   question 6). Reschedule leaves the row (it is on the record, one tap away):
   three buttons cost the name its width.
4. **Counts and rows from one query** (CLAUDE.md §3.3). The server dedupes: a
   lead that is overdue or booked today is not counted under `fresh`. Today
   the client filters `fresh` from the 200-row feed while the count comes from
   another expression, which is why one person shows twice.
5. **Backlogs stay one line** (`BulkRow`, past 12): unchanged.

**Data per element.**

| Element | Source |
|---|---|
| Name | `personLabel(l)` (`l.name`, else the number); owner `o.name` |
| Reason | the group the server put it in; `l.followUp.action` via `followUpAction` |
| Moment | `followUpLabel(l.followUp)` (reads `followUp.at`, gives the day when it is not today); owner `callbackSignal(o.callbackAt)`; new: `whenLabel(l.createdAt)`; came back: `l.cameBackToday`, `l.enquiryCount` |
| Requirement (new rows) | `reqShort(l.req, { budget: false })` |
| Call / WhatsApp | `openModal({ kind: 'contact', channel })`, the path every Call already uses |
| Finish | `followUpFinish(l.followUp)` → `visitProof` / `followUpDone` modals |
| Divider counts | `feed.counts` (`overdue`, `fresh`, `cameBack`) and `feed.owners.counts`, after the server dedupe |

---

## 2. After a call: one sheet

**Who:** the agent, back from the dialer, phone in one hand. **Job:** say what
happened and what is next, in two or three taps.

**Lands in:** `ContactConfirmModal` (`src/modules/Modals.jsx`), its
`step === 'outcome'` branch becomes the after-contact sheet. Outcome lists stay
in `src/data/callOutcomes.js`. The outcome→status map is a new catalogue,
`src/data/outcomeStatus.js` (CLAUDE.md §3.2: one concept, one file, the screen
reads it). Booking reuses `ScheduleFollowUpModal`'s presets and
`store.setFollowUp`.

**Evidence.** Outcome on 20% of bhumi's calls (Ravish 163 calls, Anil 110:
none), 51% of mahalaxmi's; mahalaxmi sets a status on 36% of leads with no call
logged (PLAN §1). The sheet opens as the dialer takes the screen, so the agent
returns to a sheet they never saw arrive; it says "Optional."; the outcome is a
dropdown defaulting to "No outcome yet"; the status pill asking the same fact
is on the page behind it.

**Change.**

1. **Opens on return.** The call is logged on tap, as now
   (`logContactAction`). The sheet is shown when the page becomes visible
   again after the dialer (`visibilitychange`), not while it is leaving. If
   the page never hid (desk, a blocked `tel:`), it shows at once.
2. **What happened: chips, not a dropdown.** The call's nine outcomes as
   44px chips, the commonest first (Call not received, Discussed, Asked to
   call back, Sent details, Coming for a visit, Not interested, Booked
   elsewhere, Busy/switched off, Wrong number). WhatsApp gets its six.
   "Optional." and "This records an action and will redirect you…" go
   (CLAUDE.md §5).
3. **Status follows, visibly.** Picking an outcome fills the Status row from
   the map, shown as "Status → Callback". The agent can change it in place
   (same status list as the record). One fact, one control.
4. **What's next.** A row of presets for the next step: Today 5 pm,
   Tomorrow 11 am, In 3 days, Pick… plus its kind (Call / Site visit /
   Meeting), the kind pre-chosen by the outcome (visit → Site visit). "Asked
   to call back" and "Coming for a visit" need a time to save, which also
   ends Callbacks with no time (bhumi 19 of 20, mahalaxmi 42 of 42). A
   rejected outcome hides the row and asks the reason instead (the reject
   modal's list, `REJECTION_REASONS`).
5. **Note** stays, one line, grows when typed into.
6. **Skip** stays (never force a fact, PLAN §3). Save is the sticky last row;
   a backdrop tap does not close it once anything is picked (CLAUDE.md §5).
7. **Finishes what was booked.** If the lead had a booked call, saving closes
   it (the server already does this on a logged call). If the booking was a
   meeting or visit, the sheet says so in one line ("Site visit booked Fri 28
   Aug") with Log visit / Done beside it.

**The map** (`src/data/outcomeStatus.js`; status names from `LEAD_STATUSES`):

| Outcome (`value`) | Status | Next step offered |
|---|---|---|
| `no_answer`, `unreachable` | Call Not Received, unless the lead is already Interested or Site Visit (same "not backwards" rule as `maybeAutoAdvanceStage`) | Call, Today 5 pm |
| `discussed`, `details_sent` | Follow-Up (open question 5) | Call |
| `callback` | Callback | Call, time required |
| `visit` | Site Visit | Site visit, date required |
| `not_interested` | Rejected · reason No Requirement | none |
| `booked_elsewhere` | Rejected · reason Already purchased / rented | none |
| `wrong_number` | open question 3 | none |
| `wa_details_sent`, `wa_discussed` | Follow-Up / Interested | Call |
| `wa_after_no_answer` | Call Not Received (same rule) | Call |
| `wa_visit` | Site Visit | Site visit, date required |
| `wa_not_looking` | Rejected · reason No Requirement | none |
| `wa_no_reply` | no change | Call |

**Server.** Today the sheet would need three writes (outcome on the event,
status, booking) that can half-fail on a bad connection. One route makes it
one write: `POST /records/:id/actions/after-contact` `{ eventId, outcome,
remark, stage, rejectionReason, followUp }`, in one transaction, using the
existing writers (`updateTimelineEvent`, the stage-change action, the lead
update that `store.setFollowUp` sends as `updateLead({ followUp })`), and
only for a lead the caller may move (`assertLeadWrite`). Owners get the same
sheet with their own outcome and status lists (`OWNER_STAGES`) as a second
step.

PLAN Q3 (a status change with no contact asks Called · Messaged · Neither) is
separate and still waits on Om; this sheet does not depend on it.

---

## 3. Lead record: the first screen

**Who:** the agent who just opened a lead from Today or the list. **Job:** see
who this is and what is due, then call.

**Lands in:** `src/components/ModuleDetail.jsx` (phone branch of the header),
`LEADS_DEF.headerFacts` and `progression` (`src/modules/definitions.jsx`),
`LatestRemark` (in ModuleDetail), `LeadRecord`'s `nextUp`
(`src/modules/Leads.jsx`), `MobileShell`'s `actionBar` slot
(`src/layouts/layouts.jsx`, exists and is unused). The owner record
(`Owners.jsx`) gets the same treatment from the same component.

**Change.** The first screen (664px less the top bar and the action bar) holds
four things, in this order, and nothing else:

1. **Who.** Name (+2× badge). Two fact lines at most: the ask ("2 BHK · Rent ·
   Fairhaven · Fernhill Towers") and where from ("+91 99102 37570 · Portal Two
   · 11 Aug"). Email moves to Details (it is already there). Budget stays in
   Details (money is never a hero).
2. **Next step**, a card: "Overdue · Site visit · Fri 28 Aug, 11:00 am" with
   its finish (Log visit for a visit, **Done** for a meeting or demo via
   `FollowUpDoneModal`, nothing for a call since Call is below) and
   Reschedule. With nothing booked: "Nothing booked" and **Book next**. This
   is "Finish what was booked" (BACKLOG Next) on the phone.
3. **Last said**: one entry, two lines max. The outcome is printed once: when
   the text equals the outcome label it is not repeated.
4. **Status**, full width so "Call Not Received" fits on one line. "Mark as
   rejected" moves into More: it is rare and destructive, and beside the
   status it took half the row.

**Bottom action bar** (the `actionBar` slot, sticky above the tab bar): Call ·
WhatsApp · More. More opens the existing `PhoneActions` sheet (the FAB's
list, unchanged, now also carrying Mark as rejected and Edit). On a record the
FAB is not drawn, so nothing floats over the record.

**Data per element.**

| Element | Source |
|---|---|
| Name, badge | `personLabel(l)`, `LEADS_DEF.titleBadge` |
| Ask line | `reqShort(l.req, { budget: false })` (`req.config`, `req.deal`, `req.locality`, `req.interest`) |
| Where-from line | `formatPhone(l.phone)`, `l.source`, `arrivedOn(l.lastEnquiryAt \|\| l.createdAt)` |
| Next step | `nextStepOf(l)`, `followUpAction`, `followUpLabel`, `followUpOverdue`, `followUpFinish` |
| Last said | `l.timeline` newest human entry (`LatestRemark`): `metadata.outcome`, `metadata.remark`, `authorName`, `timestamp` |
| Status | `LEADS_DEF.progression` (`l.stage`, `settings.stages`) |
| Call / WhatsApp | `contact('call' \| 'wa')` |

---

## 4. Targets, the FAB, search, owner edit

**Lands in:** `src/styles.css` (shared classes), `Phone.jsx`,
`PhoneActions.jsx`, `MobileTopBar`, `OWNERS_DEF.actions`.

- **44px minimum** on every phone control: `.m-bell` 40→44; `Segmented` on
  phone 33→44 tall; segment pills 40→44; Me's Sign out / Change / Copy;
  Calling's search box. One rule in the shared classes, not per screen.
- **The FAB stops covering rows.** On a record it is replaced by the bottom
  action bar (§3). On lists and Today, open question 1: move New lead / Add
  property / New owner into the top bar as a 44px "+" beside the bell, and
  draw no FAB. If no, `.m-body` reserves the FAB's height so the last row
  clears it.
- **Search from anywhere.** A 44px search button in the phone top bar opens the
  desk's `SearchModal` (`api.search`, server-side). No new search.
- **Owner edit on the phone.** `OWNERS_DEF` gains an `edit` action
  (`openModal({ kind: 'editOwner' })`), gated by the same rule the server
  applies to an owner write, so it shows in More on the owner record. The
  owner record also stops printing the callback twice (facts and the line
  below) and stops offering WhatsApp in More beside its full-width button.

---

## 5. Build order

Each step ships on its own, is checked at iPhone 13 with geometry measured,
and leaves the desk unchanged unless it says so.

1. **Targets and clearance** (S). 44px rule in `styles.css`; `.m-body` bottom
   reserve; owner record de-duplication; owner Edit in More. No data change.
2. **Lead record first screen** (S/M). Header lines, last-said de-dup,
   full-width status, next-step card with Done / Log visit / Reschedule /
   Book next, Mark as rejected into More. Ships "Finish what was booked" on
   the phone.
3. **Record action bar** (S). `MobileShell` `actionBar`; no FAB on records.
4. **After-contact sheet** (M). The catalogue, the sheet, the one server
   route, leads only. Measured against PLAN W2–4's numbers (outcome rate,
   status-without-contact). Then owners.
5. **Today: one list** (M). Server dedupe and the feed's `fresh` count; rows
   with reason and day; two buttons per row.
6. **Search and "+" in the top bar** (S), if Om says yes to question 1.
7. **Phase 2, Team by agent** (§6) (M).

---

## 6. Phase 2: Team on the phone (owner, manager)

**Who:** the owner or manager away from the desk. **Job:** know who stopped
and who is behind, by agent, and who to ring about it today.

**Lands in:** `TeamBoard` (`src/components/AgentWork.jsx`), already on Today →
Team; server `getDeskSummary` `perAgent`. It is the BACKLOG "Team: who
stopped" item, built once for desk and phone.

**Change.** The first card on Team is **By agent**: one row each, stopped
first, then by overdue. Row: name · last contact ("11 Oct", red at 7+ days) ·
open · overdue · not contacted. Tapping opens that person's page (exists).
Team totals and the donut move below it.

**Data.** `perAgent[id].open`, `.overdue`, `.neverContacted` exist. **Last
contact does not exist**: the only per-user date is `last_active` from
`sessions.last_seen_at` (`routes/team.ts`), which says the app was open, not
that anyone was rung. Needs `lastContactAt` per agent in `getDeskSummary`:
the latest event authored by that agent under the contact definition
(desk-rework §1). Siddhi (65 open, last active 11 Oct) is the example it must
show.

---

## 7. Questions for Om

1. **Remove the FAB from lists and Today; put "+" (New lead) in the top bar.**
   Example: on Today the FAB sits over Mr. Sunil Shinde's Call button.
   *Yes:* no floating button anywhere; new lead is top-right, one tap, as now.
   *No:* the FAB stays on lists, the list reserves its height so the last row
   is reachable, but it still floats over rows mid-scroll. Records lose it
   either way (§3). **Recommendation: yes.**
2. **Drop our "Continue?" step before the dialer.** Example: Call → our sheet
   "This records an action… Continue?" → iPhone's own "Call +91…?" → dialer:
   two confirmations. *Yes:* one tap less per call; an accidental tap that
   iPhone cancels still logs a call with no outcome (as Skip does today), so
   call counts may rise slightly. *No:* keep it, cut to the name, number and
   Call. **Recommendation: yes on the phone; keep it on the desk's Record
   call.**
3. **What status does "Wrong number" set?** Example: Kavish rings Nikhil
   Chavan, wrong number. *Rejected, with a new reason "Wrong number":* the
   lead leaves the open book and the owner can count them; it changes the
   firm's reason list, which was kept as the client gave it. *No change:* the
   lead stays open and keeps showing up to ring. **Recommendation: Rejected
   with a new reason "Wrong number".**
4. **Is a next step chosen for the agent?** Example: after "Discussed", should
   "Tomorrow 11 am" be pre-picked? *Yes:* most saves book something; bookings
   the agent did not mean will appear and go overdue. *No:* nothing is
   pre-picked and the Save button says "Save · nothing booked", so the choice
   is visible. **Recommendation: no** (an unchosen booking is an invented
   fact, CLAUDE.md §3.1).
5. **"Connected · discussed requirements" sets Follow-Up or Interested?**
   *Follow-Up:* Interested stays a judgment the agent makes. *Interested:*
   more leads read Interested than are. **Recommendation: Follow-Up.**
6. **On a due visit or meeting row in Today, does the finish replace
   WhatsApp?** Example: Yash Iyer's overdue site visit shows Log visit + Call;
   WhatsApp is one tap away on his record. *Yes:* the work is one tap from
   Today, as now. *No:* Call + WhatsApp on every row, Log visit on the record.
   **Recommendation: yes.**

---

## 8. Mockups

`docs/specs/phone-redesign/`, 390px wide, tokens from `src/styles.css`
(`--bg` linen #F6F5F2, `--chrome` charcoal #22242A, `--alert`, `--st-visit`
ochre #B07A2E for booked). The accent is the firm's brand colour
(`brand_config`); mockups use the default `--accent`, so delpat's red shows as
green here. Names are the development `delpat` fixtures seen in the audit;
the Team numbers are illustrative (Siddhi's line is PLAN §1's example). Every
control in them measures at least 44px (checked with Playwright when the PNGs
were rendered). Shared styles: `phone.css`, icons: `icons.js`.

| File | Screen |
|---|---|
| `today.html` / `.png` | §1 Today, one list |
| `after-call.html` / `.png` | §2 after-call sheet, "Asked to call back" picked |
| `lead-record.html` / `.png` | §3 lead record first screen with action bar |
| `owner-record.html` / `.png` | §4 owner record, de-duplicated, Edit in More |
| `team.html` / `.png` | §6 Team by agent (phase 2) |
