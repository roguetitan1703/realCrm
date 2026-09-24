# The Mahalaxmi batch — every open concern, in parts

**Opened 2026-09-22**, the week Mahalaxmi (second paying client) started using
calling and imports for real. This is the one list. We go **one part at a
time**: discuss → build → check → push → deploy to prod → tick it off here.

Rules for this file:
- Every raw note the user gave is in the **coverage table** at the bottom, mapped
  to an item. Nothing gets dropped without a line saying why.
- Each item holds: **what was said**, **what we know** (measured, with the date),
  **decided**, **open**. A "we know" line is a database or code fact, not a guess.
- `bhumi` and `mahalaxmi` are paying — any write to their data is named in the
  item and confirmed first.

Status marks: ⬜ open · 🟡 discussing · 🔨 building · ✅ shipped (commit)

---

## Part 0 — Already done (2026-09-22)

| | Item | Result |
|---|---|---|
| ✅ | **410 on connection keys** ("This key predates key storage — rotate it") | Nothing was lost. Keys were locked under the old `.env.example` JWT placeholder (Bhumi, Delpat) or the built-in (Urban, Raipur). Re-locked on prod with `keys:check --apply`: **19 of 20 open, 1 is Delpat's `int_99acres_test` fixture which never had a copy.** No portal touched. `54a0d4c`, `35c88e7` |
| ✅ | **Copy confirmation** — Copy on keys / teammate added / password reset threw `copyText is not defined` | Missing imports. `01c6bbb` |
| ✅ | **EC2 was on a stale branch** (`stabilization-prod-prep`) | Now on `main`; `scripts/deploy-api.sh` refuses anything else; boot banner and `/health` show the running commit. `bea3994` |
| ✅ | **Alerts "Turn on" did nothing** | Brave's "Use Google services for push messaging" was off. Not our code. |

---

## Part 1 — Broken today on a paying client (fix first)

### 1.1 ⏸ Today screen does not scroll on iPhone (installed app) — PARKED
- **23 Sep:** "it's not that simple, we will talk about it later." Parked at the
  user's request; the diagnosis below stands for when it comes back.
- **Know (23 Sep):** the user describes the app being drawn TALLER than the
  screen — the part below the fold has no scroll to reach it and the whole page
  rubber-bands. In WebKit at iPhone 13 size (Safari, not standalone) Today
  scrolls correctly: `.m-body` 919px of content in 664px, last card clears the
  tab bar. So it is standalone-only: `100vh` / `100dvh` is not the visible
  height in the installed app. Fix shape: set the app height from the real
  viewport (`visualViewport`) and follow its changes, instead of the CSS unit.
- **Said:** in the PWA on iPhone, everything after "Show 1 more" is cut off and
  cannot be scrolled to. Fine in the browser.
- **Know:** nothing yet. Standalone iOS has its own viewport height and
  safe-area; a fixed-height container with `overflow: hidden` fits Safari and
  clips in standalone.
- **Open:** reproduce on `iPhone 13` in standalone geometry, measure the
  scroll container.

### 1.2 ✅ The owners import lost two-thirds of the rows and broke unit numbers — `4479591`
- **Said:** imported 4k+ owner records with unit numbers etc., got only **1,380**,
  and the units came out wrong afterwards. How does the server handle a big import?
- **Know (22 Sep, earlier pass):** the owner import flattens tower / unit / BHK /
  area into one `unit_ref` string and invents the name **"Owner"** when a name
  is missing. Why rows went missing is **not measured yet**: dedupe by phone?
  request size or time limit? rows skipped with no report?
- **Answered:** **mahalaxmi**, and the user **undid** the import after seeing
  the damage. So there is nothing to repair; the job is to find out why it
  happened before they import again.
- **Know (23 Sep, from the user's review screen):** the file offered **4,108
  rows ready**, ~100 "duplicate", ~19 null. **1,380 landed.** So ~2,700 rows
  were SENT AND LOST, not filtered: the browser fires one request per row, all
  at once, and the only trace is a count in a toast.
- **Know (23 Sep, cause of the mangled unit):** `guessMapping` silently claims
  columns the person never mapped (Tower, Configuration, Carpet, Saleable — and
  `Building` matches the Project synonyms), then `previewRows` GLUES them into
  one `unitRef` string. The user mapped Unit no. only and got
  `VTP LEONARA - BUILDING B · 2 BHK Apartment · 1603 · 658.54/1087.97 sqft`.
- **Know:** the import history lives in browser state only (`store.jsx`
  `importLogs`), so Undo is gone after a reload. Undo is not audited.
- **DECIDED (23 Sep) — rebuild, not a patch:**
  1. Real columns on the owner record: project, tower, unit no., config, carpet,
     saleable. No composed text. This is what makes 4.4 and 6.1 possible, so
     5.3 folds in here.
  2. **Uniqueness is the UNIT, not the person** — key is project + tower + unit.
     One owner with three flats is three calling rows; the same flat twice in a
     file is the duplicate.
  3. Example sheet per import type. For owners the sheet is **name, phone,
     tower/building, unit, project**. Everything else is optional, recognised if
     present, never required.
  4. **A column that is not mapped is not used AND NOT KEPT** (23 Sep). The
     current import folds every unmapped column into the notes; that stops.
     Anything worth keeping is mapped to a field — Notes included. Guesses are
     pre-filled but visible and clearable, and nothing runs off a guess the
     person did not see.
  5. **Identity is tower + unit within a project**, for owner rows and for
     properties alike (23 Sep). A project with no towers keys on project + unit.
  6. Empty means empty: `NULL`, `N/A`, `-` are blank, never a value. No invented
     names.
  7. Server-side job: upload → list sheets (5.2) → map → server-computed counts
     → write in batches of 500 with a per-row outcome → download of every row
     that did not land → resumable, browser can be closed.
  8. Undo moves to the server, survives a reload, and is audited.
- **Shipped 23 Sep (`4479591`).** Verified on dev: 4,119 rows → 4,000 added, 119
  skipped with reasons, 0 failed, 21s (was 95s for 500 before the rota fix);
  undo removed exactly 4,000. Through the real screen: 1,237 → 1,215 added, 22
  skipped, skipped-rows CSV carries each reason, undo works, no page errors.
  Blank check: names "NULL"/"N/A" stored empty; one phone on two flats made two
  rows.
- **Still to do here:** the delpat rows written before this carry the old
  `unit_ref` text and no tower/unit columns (712 rows). They display through
  `unitLabel`, which falls back to the old line, so nothing is broken — but a
  tower filter (4.4) will not see them until they are split.

### 1.3 ✅ Every action is logged as the assigned agent — it was not — `bb24b1a`
- **Said:** "the person who is assigned directly logs the action — even if I call
  from admin it says Zahir".
- **Know:** not measured. Suspect: timeline / call log writes use the lead's
  `agent_id` instead of the signed-in user.
- **Why it matters:** this corrupts the "who is working the book" view for the
  manager (§1 of CLAUDE.md), and it corrupts the EOD report in Part 8.
- **Know (22 Sep, mahalaxmi):** the STORE is right. Calls from the owner's
  account are recorded against `owner_mahalaxmi`, not the assignee. Two real
  faults nearby: owner stage changes are authored `'System'`
  (`ctx.actorLabel` is always null because `req.user` carries no name), and the
  audit log therefore has no actor names at all.
- **Said (23 Sep):** a call made from the owner's desk must read as the owner
  (or System), never as the assigned agent.
- **ANSWERED 23 Sep — the app was right.** Every action from the owner account
  on 22 Sep is stored against Madhukar Gunjal. Exactly two carry Zahir (a call
  at 12:28, a WhatsApp at 12:35) and **Zahir's iPhone held a live session from
  the office IP 163.223.138.27 at that moment** — the same network as the
  owner's desktop. Reproduced on dev: a lead assigned to one agent, called from
  the owner's desk, reads "Akash", the caller, not the assignee.
- **Fixed anyway (`bb24b1a`):** owner stage changes and callbacks were filed as
  "System" and the audit ledger had **no actor names at all** (routes pass
  `req.user?.name`; a token carries no name), while three call sites wrote the
  raw user id into the name column. The name is resolved from the id once in
  `audit()`, cached 5 minutes; owner events store the person's id like every
  other timeline write.

### 1.4 ✅ Status dropdown clipped in the properties list — `a44afd3`
- **Said:** in list view with a single row, the status dropdown opens inside a
  container too short for it and is cut off.
- **Fix shape:** the menu renders outside the table's overflow (a portal, or
  flips upward). One component, used by every list, not a per-screen patch.

### 1.5 ✅ "Owner abc" — adding an owner on a property created no owner at all — `ce1020c`
- **Found 23 Sep:** mahalaxmi's one property carries `owner_name = "abc"` and a
  phone; their owners table was **empty**. Adding an owner on a property wrote
  two text fields on the listing and created no record, and Contacts → Owners
  grouped that text into a contact. See Part 6 / the Contacts spec.
- **Shipped:** the listing's owner is now a real owner record with its flat.

### 1.6 ✅ Mahalaxmi: only the owner is in lead rotation — not a bug
- **Answered 22 Sep:** a deliberate setting. The team met Mahalaxmi, gave the
  demo and redistributed the leads by hand. Nothing to fix. (Onboarding still
  leaves new agents out of routing by default. That is covered in 2.5.)

### 1.7 🔨 iPhone alerts failing with no reason recorded — step 1 shipped `a44afd3`
- **Know (22 Sep):** last 3 days, deliveries to `web.push.apple.com` show
  `failed` **27 × bhumi, 16 × mahalaxmi**, with **no status code and no error
  text**. In the same period 42 and 28 alerts reached a screen.
- **DECIDED (23 Sep), two steps:**
  1. **Record the whole reason** (ships with Part 1): status code, response
     body, message, `code`, `cause.code`, every nested `errors[].code`, the
     error type, and which push service. An empty status code means the request
     never got an HTTP answer — DNS, TCP or TLS — and none of that is stored
     today.
  2. **Then fix what it names.** Candidates: EC2 resolving Apple over
     unroutable IPv6, a wrong VAPID `sub`, or firewall timeouts. Not guessed
     between while the log is blank.
- **Open:** `getent ahosts web.push.apple.com` and a curl to it, from EC2, may
  answer today.

---

## Part 2 — People, seats, suspend, reassign

### 2.1 ✅ Login ID must be changeable when a seat goes to someone else — `613b536`
- **Said:** when a seat is reassigned, the login ID stays the old person's name
  and we're stuck with it.
- **Know:** the user id doubles as the login id. Changing it rewrites every
  row's `agent_id`.
- **Direction:** keep the internal id stable and make `login_id` a separate,
  editable, per-tenant-unique field. Sessions are revoked on change.
- **Shipped 23 Sep.** The login id is editable on the person, unique per firm,
  at least 3 characters; changing it moves no data (records point at the
  internal id) and drops their sessions. **And the seat answer is no**: see 2.2.

### 2.2 ✅ Suspend, and what happens to the work — `b753c1c`, `fae0c3f`
- **Know (22 Sep):** suspending revokes sessions, so push stops. **The leads stay
  on the suspended agent**: nobody works them and nothing flags them. Suspended
  people can still be **picked as assignees** (`activeAgents` excludes only
  OFF_DUTY). Un-suspending changes nothing, because the leads never left.
  (Answers "leads came back?": they never went anywhere.)
- **Direction:** suspending shows the person's open work (leads, owners,
  follow-ups) and offers **distribute** (2.3) in the same step. Suspended people
  can't be chosen anywhere (UI and server both check).
- **Shipped 23 Sep.** Suspending states what they still hold (server numbers)
  and offers to hand it over; going ahead without is allowed and labelled
  "Suspend and leave the work with them". **Reassign seat keeps its name** (the
  user's call — people understand it) and now does three honest things: the new
  person gets their own account and login id, the leaver's OPEN work moves to
  them, the leaver is suspended and keeps authorship of their own history. Seat
  count unchanged.
- **Still open:** bhumi's suspended agent holds 63 open leads. The user will
  deal with it; nothing was moved.

### 2.3 ✅ Reassign work — to several people, and you choose what moves — `cbdd26c`
- **Said:** select multiple people and split the leads between them, not just one.
- **Know (22 Sep):** the reassign-leads route **has no permission check**, moves
  closed and rejected leads too, writes **no assignment history** (breaks the
  invariant "assignment is history"), has a single target, and the modal says
  "done" before the server answers.
- **Shipped 23 Sep.** Owner/manager only (server-enforced); **open work only**;
  the person picks WHAT moves — leads, the calling list or both, each with its
  real count; several people share it one record each in turn, with the split
  shown before confirming; every move writes its assignment event and notifies
  the receiver; the numbers afterwards are the server's. Suspended people cannot
  receive work — hidden in the picker AND refused by the server.

### 2.4 ⬜ Super admin: bulk user creation
- **Said:** users are created one at a time, setting each password by hand.
- **Direction:** paste or enter N users (name, phone, role, login id), with
  passwords generated per person.

### 2.5 ⬜ Handover summary is missing the team's credentials, and onboarding bugs
- **Said:** the handover summary has no user list (login id + password) to copy.
- **Know (22 Sep):** `provisionTenant` builds `createdTeam` but **never returns
  it**, so the summary shows the owner only. Agents created without a password
  **get the owner's password**. Onboarded agents are **not put into routing**
  (cause of 1.6).
- **Direction:** return the team; generate a password per person; add them to
  routing; the summary lists everyone with Copy.

---

## Part 3 — A lead that comes back

### 3.1 ✅ A repeat enquiry reopens the lead as New and shows in Today — `acd34da`
- **Said:** if a lead enquires again it should be new again, and should come back
  in Today. Keep the Came back section, but a lead that came back must also be in
  Today.
- **Know (22 Sep):** a repeat enquiry **never changes the stage**
  (`arrivalStage` unused). In 30 days **9 bhumi leads came back still Rejected,
  1 still Deal Closed**. The "Came back" pill counts **all-time**: a number that
  only grows.
- **Decided:** Rejected / Deal Closed → **New** (written as a stage change, with
  history). Open leads keep their stage but appear in Today as came-back.
  "Came back" becomes recent-only (window to set).
- **Answered:** "Came back" has **no time window**. It simply means the lead has
  enquired more than once. Its place in **Today** is what makes it actionable.
  (Replaces the "recent-only" line above.)
- **Answered by the code, unchanged:** the agent KEEPS the lead. Someone has
  been working this person and yesterday's call is why the enquiry exists;
  it is routed afresh only when nobody owns it or the owner has left.
- **Shipped 23 Sep.** Rejected / Deal Closed → the firm's arrival stage on a new
  enquiry session, written through updateLead so the timeline and the ledger
  record it, with the rejection reason kept so the record reads "Was rejected —
  <why>" beside a live status. Today carries a came-back-today flag, its own
  group at the top of the phone screen, and Not yet contacted no longer counts
  the same person twice. The "Came back" pill stays all-time, as the user asked.
- **Open (paying clients, needs an OK):** bhumi's 9 leads that came back inside
  30 days and one at Deal Closed are still closed — this fixes arrivals from
  now on, not the backlog. A one-off reopen of those 10 is a write to their
  data and has not been run.

---

## Part 4 — Calling organised by project

### 4.1 ⬜ Project group view with "Assign project"
- **Said:** they assign a whole project to one person, so give bulk assign on the
  project group.
- **Direction:** an assign action on the project card assigns every open owner
  in the project, through distribute (2.3).

### 4.2 ⬜ Inside a project: a calling list with bulk assign
- **Said:** opening a project shows a lead-list-like view for calling, with bulk
  assign there too.

### 4.3 ⬜ The project card shows who holds it
- **Decided:** after assigning the project and then moving a few inside it, the
  card reads e.g. **"Rupali 40 · Aniket 8 · Unassigned 5"**. Count and names come
  from one query (CLAUDE.md §3.3).

### 4.4 ⬜ Tower filter
- **Said:** needed for calling (owners) and properties.
- **Depends on:** 5.3. Tower must be a real column, not buried in `unit_ref`.

### 4.5 ✅ "Key Received" ends the calling walk, and Reject closes a record — `ce40bd1`
- **Said:** owners have their own funnel. It is about **getting a property to
  manage**, and "Deal Closed" makes no sense there. **Key received** replaces it.
- **Shipped 23 Sep.** The walk is **New → Contacted → Interested → Key
  Received**. The two endings (Not Interested, Do Not Call) left the walk and
  are set through **Mark as rejected** with a reason, which also clears any
  pending callback and is remembered on the record. **Callback left the list**:
  it is a time (`callback_at`, its own pill and sort), and as a status it said
  nothing and could sit on a record with no callback.
- **Across every firm (user asked, 23 Sep):**
  `npm run stages:calling -- --env=production [--apply]` rewrites each firm's
  stored list and moves records off a dropped status (Callback → Contacted,
  keeping the callback time). Run on dev: 3 firms updated, 12 records moved,
  every callback time kept. **Production expectation:** bhumi has no stored list
  (nothing to write), mahalaxmi's list loses Callback, delpat 1 record moves,
  urban and raipur 6 each, both paying clients 0 records.

### 4.6 ⬜ Project names ignore case and spacing
- **Said:** "Sai Heights" and "sai heights" split into two groups, in both
  properties and calling.
- **Know (22 Sep):** case-sensitive today. Only **2 splits exist, both delpat**.
- **Direction:** group by a normalised key and display the most common spelling.
  No data rewrite needed.

---

## Part 5 — Imports (owners, leads, properties)

### 5.1 ⬜ Downloadable example sheet per import type
- **Said:** first "the mapping is also good, just make sure it works"; later
  "better to give out the sheet example instead of mapping it".
- **Direction:** both. A **Download example** for owners, leads and properties,
  with exact headers. A file with those headers skips mapping; any other file
  still maps.
- **Open:** confirm mapping stays as the fallback.

### 5.2 ⬜ Multi-sheet Excel: choose the sheet
- **Said:** there's no sheet selection when the uploaded Excel has several sheets.
- **Know:** not checked. Probably reads only the first sheet, silently.

### 5.3 ⬜ Owner import keeps its real columns
- **Decided:** tower, unit, configuration (BHK) and area become real fields, not
  flattened into `unit_ref`. A missing name stays empty (never "Owner").
- **Asked:** what happens to Bhumi's existing properties? **Answered:**
  unaffected; this changes the import path only.
- **Open:** backfill delpat's 732 existing flattened rows (safe tenant). Does
  Mahalaxmi's import (1.2) need a repair? It's a paying-client write, so named first.

### 5.4 ⬜ Large imports
- **Said:** how does the server handle 4k+ rows?
- **Direction:** chunked, idempotent, with a per-row result (added / updated /
  skipped + reason) and a final count that equals the rows in the file.

---

## Part 6 — Contacts rethink (clients / owners)

**The thinking is written up: [contacts-leads.md](./contacts-leads.md#2026-09-23--the-rethink)**
— what Contacts is today, what it invents, the measured numbers for both paying
clients, the proposed one-person identity, and the three questions for the user.
Phase A ships with Part 1; B and C wait on answer 1.

### 6.1 ⬜ Unit number not visible at a glance in Contacts → Owners
- **Said:** the owners created while adding properties show other information,
  and the unit number only appears after opening the record.

### 6.2 ⬜ Hardcoded values in the owners list
- **Know (22 Sep, `store.ts listContacts` ~1759–1781):** grouped by
  **owner_name** (two different people with one name merge into one row),
  `phone: r.phone || '+91 —'` (invents a phone), `minsAgo: 120` hardcoded (a fake
  "last activity"). All three break "no fake features".
- **Fold into 6.x.** Don't patch these separately.

---

## Part 7 — Properties

### 7.1 ⬜ Verification visit, separate from stage
- **Said:** when they add a property they visit it to confirm everything, and
  need a checkmark for that.
- **Direction:** `verified_at` / `verified_by`, a toggle on the record, and a
  filter. Not a stage.

### 7.2 ⬜ "Added by" in property detail
- **Know (22 Sep):** the column exists from 11 Sep. **bhumi: 2 of 7** recent
  properties stamped; the rest are blank.
- **Open:** backfill from the audit log where it's provable. A bhumi write, so
  it needs an OK.

### 7.3 ⬜ Property timeline records what happened to it
- **Said:** the timeline should record activity and status changes, starting
  with "added by whom".
- **Depends on:** 1.3 (right actor) and 7.2.

### 7.4 ⬜ Duplicate property
- **Said:** give an option; decide what gets duplicated and what doesn't.
- **Proposal:** copy project, tower, location, configuration, area, amenities,
  price fields and type. **Don't copy** unit number, owner, photos and videos,
  stage, verification, timeline, created-by, or shares.
- **Open:** confirm the list.

### 7.5 ⬜ Shareable photo / video gallery link
- **Said:** photos and videos are uploaded, but can't be shared in one tap on
  WhatsApp. Wanted: a link that opens a plain viewer with the firm's name and
  branding, included in Share on WhatsApp (and any share message), and copyable
  from the page.
- **Know (22 Sep):** bhumi has **15 media items on 4 listings**. The `/files`
  proxy is unauthenticated by design (`<img>` can't send a token).
- **Direction:** a per-property unguessable token, a public read-only gallery
  page, and a way to revoke the link. Internal fields never appear (same
  `NEVER_SHARED_FIELDS` rule as the message).

### 7.6 ⬜ "Attach property" needs a real review
- **Said:** attach property needs a serious review and a check of how it's
  actually used.
- **Open:** measure use first (how many attaches per firm, from where), then
  review the flow with the user.

---

## Part 8 — Reports

### 8.1 ⬜ End-of-day work report, for the agent and for the manager
- **Said:** a self work report at end of day for agents, and one for the manager.
- **Depends on:** 1.3. With the wrong actor, the report is wrong.
- **Open:** what's in it (calls made, outcomes, visits, follow-ups done or
  missed, new leads touched), where it lives (screen, push, WhatsApp), and when.

---

## Part 9 — Platform

### 9.1 ⬜ Audit ledger per tenant, and the "broken" chain
- **Know (22 Sep):** a single global hash chain. It reports broken because Date
  values hash as `{}` when written and as ISO strings after reading back:
  **1,489 rows** (property.create 754, owner.create 735), **0 link breaks,
  0 forks**. First break at seq 227 (1 Aug). The verify loads all **7,620 rows**
  (3.7 s).
- **Decided:** per-tenant chains, a hashing fix, a legacy verifier for the old
  rows, and incremental verification.

### 9.2 ⬜ Portal setup email per connection ("emails for sources")
- **Said:** a generated email per portal connection, like the 99acres one sent
  for Mahalaxmi (endpoint + key + format).
- **Direction:** "Email setup" on each connection builds that text with Copy.
  The key is included only through the owner-only reveal path.

### 9.3 ⬜ Build catches undefined identifiers
- **Why:** the Copy break (Part 0) shipped because `vite build` doesn't catch a
  missing import in JSX. Add an eslint `no-undef` step to `npm run build`.

### 9.4 ⬜ env loader and CRLF
- **Know:** `.env` lines split on `\n` only. Harmless unless the file has CRLF.
  Check `grep -c $'\r' .env` on EC2 before touching it.

---

## Suggested order

1 → 3 → 2 → 5 → 4 → 7 → 6 (when the user is ready) → 8 → 9.
Part 1 hurts paying clients today. 3 and 2 are small and remove silent loss of
leads. 5 has to come before 4.4 (towers). 8 comes after 1.3.

---

## Coverage — every raw note → item

| Raw note (22 Sep) | Item |
|---|---|
| User id change when a seat is reassigned | 2.1 |
| Suspend ke baad reassign | 2.2, 2.3 |
| 410 reassign key | Part 0 (keys) |
| New enquiry should become new; come back in Today | 3.1 |
| Tower filter | 4.4 |
| Import owners for calling; also leads, maybe properties | 5.x |
| Example sheet to download; mapping also good | 5.1 |
| Calling organised by project; assign a project to someone; bulk assign on the group | 4.1 |
| Open a project → lead-list view, bulk assign there too | 4.2 |
| KEY RECEIVED as an owner calling stage; "in place of Deal Closed" | 4.5 |
| Flat/unit no. not visible in Contacts → Owners | 6.1 |
| Super admin: one-by-one user creation and passwords | 2.4 |
| User list not in the handover summary | 2.5 |
| Photo/video shareable gallery link, in WhatsApp share, copyable, branded viewer | 7.5 |
| Case-sensitive project names | 4.6 |
| Duplicate property: what copies, what doesn't | 7.4 |
| Suspended → leads reassigned → brought back, do leads come back? | 2.2 |
| If a person leaves they're suspended first: what happens to their leads | 2.2 |
| Distribute to multiple people, not one | 2.3 |
| Verification visit checkmark, separate from stage | 7.1 |
| Who added the property, in details | 7.2 |
| Copy confirmation | Part 0 |
| Admin onboarding: login id + password missing from summary | 2.5 |
| Emails for sources | 9.2 |
| Audit ledger is broken; per tenant | 9.1 |
| Photo sharing | 7.5 |
| Property added by? | 7.2 |
| Property unit verification visit | 7.1 |
| Duplicate copy for property | 7.4 |
| Bhumi's existing properties after the import change | 5.3 |
| Project card shows the names of people assigned | 4.3 |
| Hardcoded stuff in contacts; rethink client/owners | 6.2, Part 6 |
| What happens if I suspend an agent with active leads today | 2.2 |
| Came back section + must also be in Today, becomes New | 3.1 |
| Attach property: serious review and usage check | 7.6 |
| Self work report EOD for agents and for manager | 8.1 |
| Import: no sheet selection for multi-sheet Excel | 5.2 |
| Imported 4k owners, got 1,380, units messed up | 1.2 |
| How does the server handle a big import | 5.4 |
| Better to give an example sheet than mapping | 5.1 |
| "Owner abc" naming when adding an owner in a property | 1.5 |
| Status dropdown in properties list cut off | 1.4 |
| Property timeline: activity, status changes, starting with added by | 7.3 |
| Assigned person logs the action even when admin calls ("says Zahir") | 1.3 |
| Today screen not scrollable on iPhone PWA after "show 1 more" | 1.1 |
| *(found while checking)* Mahalaxmi agents not in routing | 1.6 |
| *(found while checking)* iPhone pushes failing with no reason | 1.7 |
| *(found while checking)* Copy break slipped past the build | 9.3 |
| *(found while checking)* env CRLF | 9.4 |

---

## 2026-09-24 — after the Mahalaxmi import

**Measured on production (read-only):** 3,731 calling rows in 8 projects, all with
unit numbers in their own column, towers on 3,421, 157 international numbers
stored correctly, 0 invented names — the live API (`f03dcd1`) already had the
new importer. **0 rows called yet. 921 with nobody on them** (VTP Verve PHA
570/670, VTP Sierra PHA 351/353).

**Decided with the user:**
- "PHA" projects and "Godrej Hill Retreat 2" are **real separate phases**. Not a
  naming bug; leave them.
- **Onboarding (2.4 bulk users, 2.5 handover credentials) is deprioritised** —
  it is the super-admin side and matters at the next client onboarding, not now.
- **Next, in order:** tower filter (4.4) and case/space-insensitive project names
  (4.6); then the end-of-day report (8.1) and the per-tenant audit ledger (9.1).

**Found in their sheets — what the importer threw away:**
- The VTP Sierra sheet (1,529 rows) carried a **Call Status** column: not
  interested 281, not received 274, received 105, call cut 71, busy 68,
  incoming not available 57, **interested 39, wrong number 30**. There was no
  field to map it to, so every row landed as New / never called — agents will
  re-ring 281 people who already said no and 30 wrong numbers. The raw rows are
  still stored (crm_import_rows), so this can be applied to the rows already
  imported without re-importing. **A write to a paying client — needs an OK.**
- "Assigned To" / "Lead Assign To" in that sheet is free text mixing names and
  outcomes ("nr 4 times", "self use") — not mappable. "NextAction" repeats the
  status. "Marketplace Added" is empty. Region / microMarket dropped (minor).
- **One number sits on 50 flats** in K-SHIRE (+918329745161, 50 different
  names) — almost certainly a builder's or society office. 12 on another.
- **Calling search does not match unit number or tower** — "1603" or
  "GGVT10101" finds nothing.

