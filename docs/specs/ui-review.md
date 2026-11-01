# UI review: what is wrong, and what to do instead

This review walks the flows in [user-flows.md](user-flows.md) through the real app and records what fails. The proposals are written from the two people in CLAUDE.md §1, not from the current layout.

**How it was checked (1 Nov 2026)**
- **Stack:** the dev API (port 5011) and the dev web app (port 5183), on the development database, workspace `delpat`.
- **Drivers:** Playwright on `devices['iPhone 13']` and on a 1366×768 desk.
- **Accounts:** kavish (agent, phone), akashpatel (owner, desk) and siddharthvarma (manager, phone).
- **Screenshots:** in `ui-review/`. Every one named below is there.
- **Usage numbers:** production, read-only, last 60 days, written bhumi / mahalaxmi, the same reads as user-flows.md.

**Severity**
- **High:** costs the agent or the owner something every day, or makes a number untrustworthy.
- **Medium:** slows a common flow, or breaks a CLAUDE.md rule.
- **Low:** polish, or a rare path.

---

## 1. Findings

### High

**F1. A call never ends with the next step, and recording one is split across four controls.**
- **Hurts:** agent, every call. Owner too: Performance cannot say who is stuck when nothing is recorded.
- **Flow:** X1, X7.
- **Evidence:**
  - Tapping **Call** first opens a confirm sheet: "This records an action and will redirect you to your dialer. Continue?" (`Modals.jsx:1793`, `ui-review/p-agent-call-confirm.png`).
  - Back from the dialer, an optional sheet offers the outcome in a dropdown that defaults to "No outcome yet", with **Skip**.
  - **Record outcome** is a second sheet, with a different control and a disabled Save (`ui-review/p-agent-record-outcome.png`).
  - The timeline's "Add outcome & remark" is a third.
  - A booking is a fourth action, in the FAB.
  - Only "Asked to call back" asks for a time, and only on a lead (`Modals.jsx:631`).
- **Production:**
  - Outcomes written on 14% of bhumi's lead calls (158 of 1,105).
  - 46 follow-up events against 1,105 calls.
  - Leads holding a next step today: 42 of 1,080 and 12 of 615.
- **Severity:** High.

**F2. The callback machinery is built and never used, and an owner who did not answer is never tried again.**
- **Hurts:** agent (caller), owner.
- **Flow:** X7, X3.
- **Evidence:**
  - Calling, Today, the dashboard and the Calling badge are all built around "Callbacks overdue" and "Callbacks later today".
  - Owners with a callback booked: 0 of 809 at bhumi, 0 of 3,737 at mahalaxmi.
  - Bhumi's single caller made 495 calls to 483 different owners, and recorded 169 of them as no answer.
  - "Asked to call back" on an owner books nothing (`Modals.jsx:631`). The callback is a separate FAB item with its own picker.
- **Severity:** High.

**F3. "Owner" means three different people.**
- **Hurts:** agent and owner, on every record.
- **Flow:** A3, X7, X10, B8.
- **Evidence:**
  - **Calling list:** the homeowner being rung ("Owners to call", "Unnamed owner").
  - **Properties and Contacts:** the landlord or seller ("Call owner", "OWNER · INTERNAL", Contacts → Owners).
  - **Leads:** the agent on a lead. The record shows **"Assigned Owner: Kavish Deshmukh"** (`ModuleFields.jsx:247,414`), and the action is "Reassign owner" (`definitions.jsx:489`).
  - A calling-list owner's record therefore reads "Assigned Owner: Kavish Deshmukh" (`ui-review/p-agent-owner.png`).
  - The desk table already calls the same field **Agent**. One word with two meanings breaks CLAUDE.md §3.3.
- **Severity:** High.

**F4. One pile carries different names and different numbers on different screens.**
- **Hurts:** owner/manager. They stop trusting the numbers.
- **Flow:** B1, B2, C1, A2.
- **Evidence** (owner, delpat, same minute):

| Concept | Where it shows, and what it says |
|---|---|
| Follow-ups past due | Dashboard "Follow-up overdue 22"; Leads pill "Follow-up overdue 22"; Calendar "22 OVERDUE"; Performance "18 Missed follow-ups"; Today "Overdue"; Team today "missed follow-ups" |
| New leads not rung | Dashboard and pill "Not contacted 7"; Performance "Leads not yet contacted 5"; Today "Not yet contacted" |
| Owners not yet rung | Dashboard "Never called 726"; Calling pill "New 706"; project card "702 to call"; Today "Owners to call" |
| Answered | Dashboard Team today, Kavish: "15 calls · 14 answered" (counts calls); Performance, Kavish: Calls 15, Answered 2 (counts people) |

  - Today hard-codes its labels (`PhoneToday.jsx:333-356`) instead of reading `leadSegments.ts`, the catalogue CLAUDE.md §3.2 says screens must read.
  - Performance's tables list 5 people where the dashboard lists 7.
  - Screenshots: `ui-review/d-owner-home.png`, `ui-review/d-owner-performance.png`, `ui-review/p-mgr-team.png`.
- **Severity:** High.

**F5. The owner's desk opens on inventory breakdowns. The per-agent table is below the fold.**
- **Hurts:** owner/manager at a desk.
- **Flow:** B1.
- **Evidence:** at 1366×768 the screen above the fold is:
  - 5 tiles;
  - **LEADS BY SOURCE**: lifetime totals, for example "Portal One 169";
  - **CALLING QUEUE** outcomes by status ("New 706").

  TEAM TODAY, the "who do I talk to" table, starts at the bottom edge (`ui-review/d-owner-home.png`). A lifetime count only ever grows (CLAUDE.md §1, "wallpaper"). In production the firm owner's work is assigning: 1,975 / 2,199 assignments against 6 calls.
- **Severity:** High.

**F6. The phone list and the record disagree about how many buyers match a flat.**
- **Hurts:** agent sending homes, owner.
- **Flow:** X11, X6.
- **Evidence:**
  - Oakridge Towers B-101 (1 BHK, rent): its card says "144 buyers" (`ui-review/p-agent-props-project.png`). The record says "INTERESTED TENANTS · 4 matched" (`ui-review/p-agent-prop.png`).
  - The card's number comes from SQL `demandFor()` (`backend/src/services/store.ts:5235`). It counts a lead with no deal, no locality or no budget as a match, which breaks CLAUDE.md §3.1 ("unknown is not a default").
  - The list on the record comes from `leadsForProperty()` (`src/lib/matching.js:57`).
  - That is two implementations of one idea (§3.2), and a count that does not come from the rows it describes (§3.3).
- **Severity:** High.

### Medium

**F7. WhatsApp from a phone sends a fixed template and is logged twice. The composer is desk-only.**
- **Hurts:** agent.
- **Flow:** X2.
- **Evidence:**
  - On a phone, the lead's WhatsApp opens the same "This records an action…" confirm (`ui-review/p-agent-wa.png`) and sends `followUpMessage`.
  - The composer (WaModal), which lets the agent pick or edit the message, is filtered out of the phone FAB (`PhoneActions.jsx:60`).
  - On a calling-list owner, WhatsApp is both a full-width button and the first FAB item. The code comment that justifies it ("an owner's record has no full-width contact bar", `PhoneActions.jsx:31`) is no longer true (`ui-review/p-agent-owner-fab.png`).
- **Severity:** Medium.

**F8. The FAB follows no single rule.**
- **Hurts:** agent.
- **Flow:** A21.
- **Evidence** (measured on each screen):
  - **Lead record:** Edit lead, Reschedule follow-up, Add remark. Edit and Remark share the pencil icon (`ui-review/p-agent-lead-fab.png`). No **Send homes** and no **Book**: the follow-up sits under "Reschedule".
  - **Owner record:** WhatsApp, which duplicates the screen; Schedule callback; Add remark. No **Record outcome** and no **Convert to property**.
  - **Property record:** 8 items. **Send** and **Set status** are already buttons on the record, and **Call owner** is already in its OWNER block (`ui-review/p-agent-prop-fab.png`).
  - **Props list:** "New lead" comes before "Add property". The Calling list offers only "New owner".
  - So the FAB sometimes repeats the screen and sometimes holds the only route to an action.
- **Severity:** Medium.

**F9. Booking a time uses two different pickers.**
- **Hurts:** agent.
- **Flow:** X3.
- **Evidence:**
  - **Owner callback:** presets "In 2 hours / Later today / Tomorrow morning / In 3 days / Next week" plus a datetime field (`Modals.jsx:1813-1880`).
  - **Lead follow-up:** day chips, five fixed times (10:30 am … 6:00 pm), and the toggles "Pick Custom Calendar Date" / "Enter Exact Time" (`Modals.jsx:2581-2630`).
  - The lead toast reads "on 2026-11-02 at 4:30 pm", an ISO date.
  - This breaks §3.2.
- **Severity:** Medium.

**F10. An owner's "Callback done" closes the booking with nothing recorded. That free close was removed from leads.**
- **Hurts:** owner; it teaches agents that closing means nothing happened.
- **Flow:** X3.
- **Evidence:**
  - `definitions.jsx:787` offers "Callback done · Clears it from the queue".
  - The lead side carries the comment "THERE IS NO MARK FOLLOW-UP DONE" (`definitions.jsx:456`), for the same reason.
  - One rule, two answers.
- **Severity:** Medium.

**F11. Calendar counts in the browser over a 200-row cap, says "25 scheduled" next to "3 upcoming", and leaves out callbacks.**
- **Hurts:** owner, and agents who reach it from Me.
- **Flow:** B15, A18.
- **Evidence:**
  - `Calendar.jsx:42-58` reads `listLeads({segment:'followup', limit:200})` and filters and counts in the browser, which breaks §4 ("server-side everything").
  - The header shows "25 SCHEDULED / 16 SITE VISITS / 22 OVERDUE", none of them clickable, beside "ALL UPCOMING APPOINTMENTS (3)".
  - Dates print as "2026-11-02".
  - There is no agent filter, and owner callbacks are absent.
  - "No follow-ups scheduled on this specific day." is explanatory copy (§5).
  - Screenshot: `ui-review/d-owner-calendar.png`.
- **Severity:** Medium.

**F12. Two of Today's groups count only the rows the browser happened to receive.**
- **Hurts:** agent, owner.
- **Flow:** A2.
- **Evidence:**
  - "Due today" and "Upcoming" take their counts from rows filtered out of the feed in the browser (`PhoneToday.jsx:335,356`).
  - The other groups use the server's counts.
  - This breaks §3.3 and §4.
- **Severity:** Medium.

**F13. The phone has no single search. "Who is calling me?" means guessing a tab.**
- **Hurts:** agent.
- **Flow:** A16.
- **Evidence:**
  - The phone top bar holds only the bell (`Phone.jsx:81`).
  - Leads, Calling and Props each have their own box.
  - The desk has one search across leads, properties and contacts (Ctrl K, `SearchModal`).
- **Severity:** Medium.

**F14. The calling list cannot be walked: every owner is a round trip, and the order starts with "Unnamed owner".**
- **Hurts:** agent (caller).
- **Flow:** X7.
- **Evidence:**
  - One owner takes about 7 taps: project card → owner → Call → Yes, continue → dialer → outcome sheet → back → back.
  - Inside a project the list is sorted by name, so unnamed rows come first (`ui-review/p-agent-calling-project.png`).
  - There is no "next", and no end-of-batch state.
  - Mahalaxmi has 3,301 of 3,737 owners still at New.
- **Severity:** Medium. The work is also badly shaped, which makes it High for that one caller.

**F15. Alerts are mostly unread, and a "due now" alert stays "due now" for weeks.**
- **Hurts:** agent (noise), owner.
- **Flow:** X8.
- **Evidence:**
  - About 10% of alerts are ever read: 219 of 2,106 and 126 of 1,456. `lead_assigned`: 114 of 1,366.
  - On dev the drawer shows "Follow-up due now · 18d ago" and "Site visit due now · 60d ago", unread, in alarm red (`ui-review/p-agent-notifs.png`).
  - CLAUDE.md §1: an alert that does not name something doable today is noise.
- **Severity:** Medium.

**F16. Status and outcome are two controls over overlapping facts, and rejection reasons are stored in two spellings.**
- **Hurts:** agent, owner (reports).
- **Flow:** X5.
- **Evidence:**
  - Six ways move a status: the row pill, the record dropdown, Mark as rejected, an outcome's auto-advance, Callback's booking, and owner contact's auto "Contacted".
  - "Call not received" exists both as an outcome and as a status.
  - In production the stage titles are "→ Rejected: No Requirement" (at least 72) and "→ Rejected — No Requirement" (at least 28).
- **Severity:** Medium.

**F17. A phone number prints three ways, and an unnamed owner's title is the raw number.**
- **Hurts:** agent.
- **Flow:** X1, X7, A16.
- **Evidence:**
  - The record header shows "+91 98192 56642".
  - The call sheet, the search results and the property's OWNER block show "+919819256642".
  - The desk list shows "91968589010" (`ui-review/d-owner-leads.png`).
  - An unnamed owner's title is "+919953573851", the avatar shows "+", and the formatted number repeats under it (`ui-review/p-agent-owner.png`).
  - `formatPhone()` exists and is not used everywhere: one concept, several implementations.
- **Severity:** Medium.

**F18. The leads screen asks about the same thing in three rows, and the filter sheet has an empty section.**
- **Hurts:** agent (phone), owner (desk).
- **Flow:** X9.
- **Evidence:**
  - **Phone:** TYPE and STATUS dropdowns, then the pills, then the search box and a funnel. It is 300px of controls before the first lead (`ui-review/p-agent-leads.png`).
  - The STATUS value "Follow-Up" sits next to the pill "Follow-up overdue".
  - The Filter & sort sheet shows a "FROM ALERT" heading with nothing under it (`definitions.jsx:251`, `ui-review/p-agent-filter.png`).
  - **Desk:** two search boxes, the global one and "Search leads…" (`ui-review/d-owner-leads.png`).
- **Severity:** Medium.

**F19. A half-typed property draft is shared between workspaces.**
- **Hurts:** anyone in two firms: Delpat staff, or a support session.
- **Flow:** A15.
- **Evidence:** `PropertyWizard.jsx:61` stores the draft under the single key `crm_property_draft`, with no tenant in it. This breaks CLAUDE.md §3.5.
- **Severity:** Medium.

**F20. The owner's reset-password dialog pre-fills a shared password, and the card that follows can say something untrue.**
- **Hurts:** owner, and the firm's security.
- **Flow:** B10.
- **Evidence:**
  - `Team.jsx:554` sets `useState('Firm@2026')` as the starting password.
  - The superadmin path generates a password instead.
  - The reveal card always says "They set their own on first sign-in" (`Team.jsx:323`), even when "Require user to change password" was unticked.
  - Production: 9 `user.password_reset_by_admin` at bhumi.
  - **For builder A**, since it is auth work.
- **Severity:** Medium.

**F21. A manager or owner on a phone has dead ends.**
- **Hurts:** owner/manager on a phone.
- **Flow:** C2, C4.
- **Evidence:**
  - The payment bar shows but goes nowhere (`App.jsx:213`).
  - The Calling badge counts the person's own late callbacks while the list shows the firm's (WORK-STATE Later).
  - Leads has no Select on a phone, although Calling does.
- **Severity:** Medium.

**F22. Sharing and buyer forms are built and barely reached, and the lead record has no "send homes" entry.**
- **Hurts:** agent.
- **Flow:** X6, D4.
- **Evidence:**
  - Production: 13 links from 2 people at bhumi, 0 at mahalaxmi; 0 buyer asks.
  - From a lead on a phone, sending means scrolling to SHORTLISTED AND MATCHING FLATS, ticking flats, then sending. The FAB carries no Send.
  - The flows work. They are hard to find.
- **Severity:** Medium.

### Low

**F23. Explanatory copy, which CLAUDE.md §5 forbids:**
- "This records an action and will redirect you to your dialer. Continue?" (`Modals.jsx:1793`);
- "Optional. How did it go with {name}?";
- "Follow-ups, callbacks and new enquiries show up here." (`PhoneToday.jsx:376`);
- "Clears it from the queue" (`definitions.jsx:789`);
- "No follow-ups scheduled on this specific day." (`Calendar.jsx:156`);
- import and settings captions (`ImportPage.jsx:264,312,496`; `Settings.jsx:755,764,769`).

**F24. "Add outcome & remark" is offered on every timeline row, including remarks and bookings.** That is a third way to the outcome form, beside **Record outcome** (`ui-review/p-agent-lead-record.png`).

**F25. Pills with nothing in them stay on screen.** "Callbacks later today 0", "Call Not Received 0", "Blocked 0" and "Unassigned 0" (`ui-review/p-agent-calling-project.png`). The project cards say "All called" on projects whose owners were never rung.

**F26. Forms that lose typed work** (read in code, not driven):
- the superadmin Onboard ✕ throws away the whole roster (`Admin.jsx:467,574`);
- the buyer's ask sheet X (`Public.jsx:787`);
- the Connections field-mapper X (`Connections.jsx:767`);
- message-template drafts are lost when switching Settings sections.

**F27. Some screen state is kept out of the URL:** the Settings section, the import step, the Ledger filters and Team's page. A reload during an import leaves the server job behind.

**F28. Two confirm styles.** `window.confirm` is used for deleting a lead, owner or property, ending an agreement, deleting a teammate and undoing an import, while Settings uses the app's own confirm modal. A destructive action on a phone gets the browser's grey dialog.

**Counts:** 28 findings. High 6 (F1–F6), Medium 16 (F7–F22), Low 6 (F23–F28).

---

## 2. What must not change

People are used to these, and they work:

1. **The five phone tabs**: Today, Leads, Calling, Props, Me. Today is home, and **To do / My work / Team** are its halves.
2. **Call and WhatsApp on every row and every record, one tap away.** The record's full-width contact buttons stay.
3. **The status pill on a row is a menu.** The status can change without opening the record (1,260 / 1,484 agent status changes).
4. **The FAB as the + in the bottom-right corner, changing with the screen.** Om rates it highly. Only its contents change below.
5. **Lead piles as pills**, with server counts (`leadSegments.ts`). Filters live in the URL, and opening a record keeps them.
6. **The desk's table plus full-page record**, with sortable columns and bulk select on the desk.
7. **Calling grouped by project**, as a way to browse and to assign by project.
8. **Site-visit proof**: location, then a live photo, then an outcome.
9. **The auto-advance rules**: no answer → Call Not Received; a call → Contacted for an owner.
10. **`tel:` on the desk**, which works with a paired phone.

---

## 3. Proposals, ranked by impact on the agent and the owner

Each proposal gives the problem, what the person does instead, what it replaces, and the findings it closes. None of them depends on today's screen positions.

### P1. One after-call step that always ends with the next step booked. (F1, F2, F9, F10, F16, F23, F24)
- **For:** the agent, between calls, one thumb.
- **Instead:**
  1. Tap **Call**. The dialer opens at once. There is no confirm; the call is logged quietly, as it is today.
  2. Coming back to the app opens a bottom sheet titled with the name, holding **five big outcome buttons**: *Didn't pick up*, *Busy / off*, *Talked*, *Wrong number*, *Not interested*.
  3. Each one leads to its natural next step on the same sheet:
     - **Didn't pick up / Busy:** "Try again" chips: *in 2 h · this evening · tomorrow 11 am · pick…*. One tap saves the outcome and books the retry.
     - **Talked:** status chips from the firm's own stages; next step *Call · Visit · Demo* with the same time chips; a note.
     - **Not interested / Wrong number:** reason chips, then the record closes as rejected.
  4. A toast confirms with Undo: "Rahul Mehta · no answer · retry 6 pm · Undo".
- **The same sheet for leads and calling-list owners.** An owner's "talked" offers *Interested → Convert to property*.
- **Replaces:**
  - the Call/WhatsApp confirm (`ContactConfirmModal`);
  - "Call logged";
  - LogCallModal and the **Record outcome** button;
  - the timeline's "Add outcome & remark" on calls;
  - the Callback-status booking path;
  - the owner's "Callback done";
  - both time pickers (one component).
- **Keeps:** the outcome keys, auto-advance, `contact-log` and the timeline.
- **Measure:** the share of calls with an outcome (14% at bhumi now) and the share of open leads with a next step (42 of 1,080 now).

### P2. "Start calling": a queue that hands over the next person. (F14, F2, F12)
- **For:** the agent with a backlog, whether 349 owners or 46 cold leads.
- **Instead:**
  1. On Today, and on each Calling project, a **Start calling** button.
  2. It shows one card at a time, in an order the server keeps:
     1. callbacks and follow-ups due now;
     2. leads that came back today;
     3. new arrivals;
     4. retries now due;
     5. never called, with named owners before unnamed.
  3. Each card has **Call**, **Skip** and **Later**. After P1's sheet, the next card slides in.
  4. The end is stated: "Done · 18 called · 6 retries booked".
- **Replaces:** drilling project → list → owner → back → back as the only way to work the list, and the long Today groups as the way to find the next call.
- **Keeps:** the Today groups as the overview, and Calling's project cards for browsing and assigning.

### P3. One word and one number per thing, read from the catalogues. (F3, F4, F12, F25)
- **For:** the owner, who must trust a number in order to act on it, and the agent, who reads labels between calls.
- **Instead:**
  - Every pile, tile, Today group and Performance line takes its label and its count from `leadSegments.ts` or the owner segments, in the same request.
  - **The agent on a record is "Agent"** everywhere: "Assigned agent", "Reassign agent".
  - "Owner" stays for the person on the calling list. Contacts says **Landlords / Sellers**, as its tabs already do.
  - **Answered** counts people. A call count is labelled **calls**.
  - Empty pills are hidden, except All.
  - "Missed follow-ups" and "Follow-up overdue" become one name.
- **Replaces:** the hard-coded labels in `PhoneToday.jsx:333-356`, and the browser-side counts for Due today and Upcoming.
- **Keeps:** the piles themselves and their URL keys.

### P4. The owner's desk opens on people, not inventory. (F5, F4)
- **For:** the firm's owner at 10 am, at a desk.
- **Instead:**
  - The first screen is one row per agent:
    - calls today and the share with a result;
    - next steps overdue;
    - new leads not yet rung;
    - owners rung and owners due;
    - last activity, for example "idle 2 h".
  - Each number opens that agent's filtered list, and the filter lives in the URL.
  - One line above names the worst problem, with a name in it: "Aniket · 6 follow-ups overdue · 2 new leads not rung".
  - Leads-by-source and outcomes-by-status move to a **Book** view and to Performance.
- **Replaces:** the tile strip plus the source bar as the top of the dashboard.
- **Keeps:** the tile click-throughs (they become the column headers), and Performance for ranges.

### P5. A FAB with one rule: it carries what the screen does not show. (F7, F8, F22, F13)
- **For:** the agent; the thumb's one reach.
- **Instead:**
  - The FAB never repeats a visible button, and every item has its own icon.

| Screen | FAB |
|---|---|
| Today / Leads | **Find by name or number**, New lead, Add property |
| Calling | Find, New owner, Start calling |
| Props | Add property, Find |
| A lead | **Book next step**, **Send homes**, Log visit, Add remark, Edit |
| A calling-list owner | Book callback, Convert to property (at the final stage), Add remark, Edit |
| A property | Send to a buyer, Edit, Duplicate, Update the landlord, Copy details, Verify |
| Desk roles add | Assign / take back on a record; Select on lists |

  - **Find** searches leads, owners and contacts in one list, like the desk's Ctrl K. That also answers "who is calling me?".
  - **WhatsApp on a phone** opens the composer (pick or edit the text) instead of a fixed template behind a confirm.
- **Replaces:** the per-kind lists in `PhoneActions.jsx`, the owner's duplicate WhatsApp, and the property's duplicate Send, Set status and Call owner.

### P6. One matching engine, and a count that opens its rows. (F6)
- **Instead:** the server works out both the "N matched" count and its rows with one expression. Unknown is not a match. The card's number opens the record's matched list.
- **Replaces:** `demandFor()` SQL beside `leadsForProperty()` in the browser.

### P7. Alerts that are about today, and that close themselves. (F15)
- **Instead:**
  - A "due now" alert closes when its next step is done or moved, and expires at the end of its day, staying in the history but no longer unread.
  - The drawer shows **Now** (doable today) above **For your information**.
  - Assignment pushes are grouped per batch.
  - The read rate is measured per type, and a type that nobody reads is turned off by default.
- **Replaces:** the flat unread list.

### P8. A calendar that is an agenda on the phone and a team view on the desk. (F11)
- **Instead:**
  - The server reads per day and per agent, and the view includes owner callbacks.
  - **Phone:** Today / Tomorrow / This week lists, reached from Today's Upcoming, not only from Me.
  - **Desk:** an agent filter, the month grid, and header numbers that open their lists.
  - Dates read like "Mon 2 Nov".
- **Replaces:** the 200-row client calendar.

### P9. One filter row on the leads screen. (F18)
- **Phone:**
  - The pills come first.
  - A single **Filter** chip row holds Status, Type, Source, Locality and Sort; each chip shows its value when set.
  - Search goes into the FAB's Find, or a search icon in the top bar.
  - The "From alert" chip appears only when it is active.
- **Desk:** one search box (the list's), and the global search moves to Ctrl K only.
- **Replaces:** the dropdowns, then pills, then search plus funnel stack.

### P10. A manager can do the desk's two jobs on a phone. (F21)
- **Instead:**
  - Long-press in Leads to select, as Calling already allows → **Assign** / **Take back**.
  - The payment bar opens a small billing sheet: plan, due date, the last payments.
  - The Calling badge counts the firm's late callbacks.
- **Waits on:** Om saying a manager does bulk work from a phone (WORK-STATE Later).

### P11. Small fixes that need no design decision. (F17, F19, F20, F23, F26, F28)
- One formatter for every printed number; an unnamed owner reads "Unnamed owner".
- The property draft is keyed per firm.
- Reset password generates the password, and the reveal card's wording follows the checkbox (builder A).
- Remove the explanatory lines.
- Confirm before ✕ on dirty sheets.
- Use the app's confirm modal for every delete.

**Proposals:** 11. Ranked by impact on the two people in CLAUDE.md §1: P1, P2, P3, P4, P5 first. P1 and P2 change the agent's every call. P3 and P4 change whether the owner can act on what the desk shows.

---

## 4. What could not be verified

- **Phone or desk:** nothing in the database records whether a call was made from a phone or a desk.
- **Alert expiry in production:** the stale "due now" alerts were seen on dev, whose data is fixtures. How long production alerts stay open was not measured.
- **The real dial cycle:** the dialer and WhatsApp hand-offs were not driven end to end. In headless Playwright, `tel:` and `wa.me` do not open apps, so the "Call logged" sheet was read in code (`Modals.jsx:1762`), not seen after a real call.
- **Buyer pages, superadmin console, Settings, Team and Integrations:** mapped from code. They were not driven in this pass.
- **F26 and F27:** read in code, not driven.
- **Production rows:** none were written. Dev shows the smoke-test lead "Smoke 56598". This review added no rows.
