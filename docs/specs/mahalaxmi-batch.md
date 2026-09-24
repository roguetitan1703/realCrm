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

### 2.4 ✅ Super admin: bulk user creation
- **Said:** users are created one at a time, setting each password by hand; the
  paste box exists but nothing says what to paste.
- **Done:** the paste box states its format (one person per line — Name, Phone,
  Role, optional Email / User ID / Password; comma or Excel columns). Every row
  shows its user ID and password **as it appears**, planned by the server
  (`services/roster.ts` `planRoster`, `POST /admin/onboard/preview`) and sent
  back unchanged, so the handover matches what was shown. The console used to
  invent `firstname123` passwords while parsing; gone. A roster with a short
  password, a duplicate ID or a shared email is refused before the tenant row
  is written.

### 2.5 ✅ Handover summary is missing the team's credentials, and onboarding bugs
- **Said:** the handover summary has no user list (login id + password) to copy.
- **Know (22 Sep):** `provisionTenant` builds `createdTeam` but **never returns
  it**, so the summary shows the owner only. Agents created without a password
  **get the owner's password**. Onboarded agents are **not put into routing**
  (cause of 1.6).
- **Direction:** return the team; generate a password per person; add them to
  routing; the summary lists everyone with Copy.
- **Done:** `provisionTenant` returns the team and the owner's login id; a blank
  password is generated per person (never the owner's); the whole team goes into
  the round-robin with the owner; team phones stored as `+91…` like every other
  writer. The onboarding placeholders carried Bhumi staff names, emails, phones
  and passwords in the public bundle — replaced with invented ones.
- **Not checked against a database** — no DB in that session. Verified by
  driving the form in a browser with the admin API answered by `planRoster`.

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

### 4.1 ✅ Project group view with "Assign project" — `87c3adc`
- **Said:** they assign a whole project to one person, so give bulk assign on the
  project group.
- **Direction:** an assign action on the project card assigns every open owner
  in the project, through distribute (2.3).

### 4.2 ✅ Inside a project: a calling list with bulk assign — open a card, tick rows, Bulk assign (splits between people since `906fbe8`)
- **Said:** opening a project shows a lead-list-like view for calling, with bulk
  assign there too.

### 4.3 ✅ The project card shows who holds it — `87c3adc`
- **Decided:** after assigning the project and then moving a few inside it, the
  card reads e.g. **"Rupali 40 · Aniket 8 · Unassigned 5"**. Count and names come
  from one query (CLAUDE.md §3.3).

### 4.4 🔶 Tower filter
- **Said:** needed for calling (owners) and properties.
- **State (25 Sep):** Calling has it (Filter → Tower, inside a project). Properties does not.
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

### 4.6 ✅ Project names ignore case and spacing — `e3122d0`
- **Said:** "Sai Heights" and "sai heights" split into two groups, in both
  properties and calling.
- **Know (22 Sep):** case-sensitive today. Only **2 splits exist, both delpat**.
- **Direction:** group by a normalised key and display the most common spelling.
  No data rewrite needed.

---

## Part 5 — Imports (owners, leads, properties)

### 5.1 ✅ Downloadable example sheet per import type — `4479591`
- **Said:** first "the mapping is also good, just make sure it works"; later
  "better to give out the sheet example instead of mapping it".
- **Direction:** both. A **Download example** for owners, leads and properties,
  with exact headers. A file with those headers skips mapping; any other file
  still maps.
- **Open:** confirm mapping stays as the fallback.

### 5.2 ✅ Multi-sheet Excel: choose the sheet — `4479591`
- **Said:** there's no sheet selection when the uploaded Excel has several sheets.
- **Know:** not checked. Probably reads only the first sheet, silently.

### 5.3 ✅ Owner import keeps its real columns — `4479591`; unit and project optional since `d8aed1d`
- **Decided:** tower, unit, configuration (BHK) and area become real fields, not
  flattened into `unit_ref`. A missing name stays empty (never "Owner").
- **Asked:** what happens to Bhumi's existing properties? **Answered:**
  unaffected; this changes the import path only.
- **Open:** backfill delpat's 732 existing flattened rows (safe tenant). Does
  Mahalaxmi's import (1.2) need a repair? It's a paying-client write, so named first.

### 5.4 ✅ Large imports — server-side job, `4479591`; Mahalaxmi imported 3,731 rows on it
- **Said:** how does the server handle 4k+ rows?
- **Direction:** chunked, idempotent, with a per-row result (added / updated /
  skipped + reason) and a final count that equals the rows in the file.

---

## Part 6 — Contacts rethink (clients / owners)

**The thinking is written up: [contacts-leads.md](./contacts-leads.md#2026-09-23--the-rethink)**
— what Contacts is today, what it invents, the measured numbers for both paying
clients, the proposed one-person identity, and the three questions for the user.
Phase A ships with Part 1; B and C wait on answer 1.

### 6.1 ✅ Unit number visible in Contacts → Owners — `ce1020c`
- **Said:** the owners created while adding properties show other information,
  and the unit number only appears after opening the record.

### 6.2 ✅ Hardcoded values in the owners list — gone, `ce1020c` / `44eabbf`
- **Know (22 Sep, `store.ts listContacts` ~1759–1781):** grouped by
  **owner_name** (two different people with one name merge into one row),
  `phone: r.phone || '+91 —'` (invents a phone), `minsAgo: 120` hardcoded (a fake
  "last activity"). All three break "no fake features".
- **Fold into 6.x.** Don't patch these separately.

---

## Part 7 — Properties

### 7.1 ✅ Verification visit, separate from stage
- **Said:** when they add a property they visit it to confirm everything, and
  need a checkmark for that.
- **Direction:** `verified_at` / `verified_by`, a toggle on the record, and a
  filter. Not a stage.
- **Built (25 Sep):** "Mark as verified" in the property's actions (undo behind
  More actions), a Verified badge beside the name, a tick in the list, a
  Verified filter (Yes / No, in SQL), and a line in the history.

### 7.2 ✅ "Added by" in property detail
- **Know (22 Sep):** the column exists from 11 Sep. **bhumi: 2 of 7** recent
  properties stamped; the rest are blank.
- **Open:** backfill from the audit log where it's provable. A bhumi write, so
  it needs an OK.
- **Built (25 Sep), without the write:** the property read falls back to the
  audit log's `property.create` by a person when the column is empty, so the
  sheet's "Added by" fills for older listings and no paying firm's row is
  changed. Imports and anything with no person behind it stay blank.

### 7.3 ✅ Property timeline records what happened to it
- **Said:** the timeline should record activity and status changes, starting
  with "added by whom".
- **Depends on:** 1.3 (right actor) and 7.2.
- **Found:** the property page read only the old `timeline` column. Calls and
  WhatsApps to the owner, remarks and agreement lines were saved to the shared
  timeline and shown until a reload, then never again.
- **Built (25 Sep):** the page reads the shared timeline. Written going
  forward: added (how: copied, imported, from calling, from a closed deal),
  status, price, owner, photos added or removed, verified, photo link, and
  shortlisted or taken off for a lead. Older listings show "Added" at their
  creation time.

### 7.4 ✅ Duplicate property
- **Said:** give an option; decide what gets duplicated and what doesn't.
- **Proposal:** copy project, tower, location, configuration, area, amenities,
  price fields and type. **Don't copy** unit number, owner, photos and videos,
  stage, verification, timeline, created-by, or shares.
- **Built (25 Sep) to that list:** "Duplicate for another flat" (More actions,
  desk and phone) opens the property form filled from an allowed list of
  fields; floor and description are also left out. The flat number is required
  before it saves; it opens the new flat, whose history says what it was
  copied from.

### 7.5 ✅ Shareable photo / video gallery link
- **Said:** photos and videos are uploaded, but can't be shared in one tap on
  WhatsApp. Wanted: a link that opens a plain viewer with the firm's name and
  branding, included in Share on WhatsApp (and any share message), and copyable
  from the page.
- **Know (22 Sep):** bhumi has **15 media items on 4 listings**. The `/files`
  proxy is unauthenticated by design (`<img>` can't send a token).
- **Direction:** a per-property unguessable token, a public read-only gallery
  page, and a way to revoke the link. Internal fields never appear (same
  `NEVER_SHARED_FIELDS` rule as the message).
- **Built (25 Sep):** `/g/<id>.<signature>` (services/gallery.ts): an HMAC
  over firm, listing and a version, so every listing with a photo has a link
  with nothing to create. Turn off (`gallery_off`) and New link (bumps
  `gallery_version`, the old one dies). The page (modules/Gallery.jsx) shows the
  firm's name and logo, what the flat is, price, area, floor, furnishing,
  facing, possession, amenities, description and the photos, from an allow-list
  built on the server; no owner, flat number or key. The link is in every
  share and "Copy listing details" message, and on the Photos panel (Copy,
  Open, Turn off).

### 7.6 🔶 "Attach property" needs a real review
- **Said:** attach property needs a serious review and a check of how it's
  actually used.
- **Open:** measure use first (how many attaches per firm, from where), then
  review the flow with the user.
- **Reviewed and fixed (25 Sep):** a shortlisted flat could not be taken off
  (the store had it, no screen called it); attaching wrote a history line only
  in the browser that did it; two attaches in quick succession sent a list
  without the first and dropped it; the modal closed after every attach; two
  flats in one building looked identical in it. Now: Remove on a shortlisted
  row, history on the lead AND the flat, shortlist changes queued per lead, the
  modal stays open with rows marked Added and a Done count, flat numbers shown.
- **Not measured on production.** Dev holds demo use only (delpat 1, urban 27,
  raipur 28). The production count needs the user's OK to read.

---

## Part 8 — Reports

### 8.1 ✅ Agent activity — daily, for the agent and for the manager (the client asked, 24 Sep) — see "C, as built" at the end
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

---

## 2026-09-24 — the next big pieces, as the user described them

### 8.1 (expanded) Agent activity — what they actually did
- **Said:** the owner wants to see each agent's work daily; agents want to see
  their own. "We have to be real about it" — counted from actions only.
- **Measured, bhumi, last 30 days (timeline events by a person):** calls 485,
  WhatsApp 409, stage changes 445, remarks 307, follow-ups booked 12, site
  visits 4. Mahalaxmi so far: calls 18, remarks 18, stage changes 49.
- **The honesty problem:** a "call" is recorded when the agent TAPS Call. The
  app cannot know the phone rang or anyone answered. Only **114 of 485** calls
  (24%) carry an outcome afterwards. So "calls" must be reported as "dialled",
  with outcomes counted separately — or the report will say an agent spoke to
  40 people when they tapped 40 buttons.
- **Open:** which actions count, and how; what a day's report shows; where it
  lives (screen, end-of-day push); what stops it being gamed (a stage flipped
  back and forth is two "changes").

### 10 ✅ Conversion — the end of each pipeline becomes a record — built as D, below
- **Owners (said 24 Sep):** Key Received is the end of calling; there should be
  a **conversion** from there into a property — the agent fills in the rest of
  the listing. Converting makes the owner a Contact (Contacts = owners whose
  property we manage). This is the "they agreed → take the property" step
  written up and deferred on 23 Sep; it now has a trigger.
- **Leads (said 24 Sep):** when a lead goes through — the agreement is signed and
  uploaded — it should land somewhere lasting: the client's current rentals,
  which double as **renewal reminders** for the year ahead.
- **Know:** the product already has a tenancy on a property (tenant, dates) and a
  "Tenancies expiring" group in Today. **0 tenancies are recorded on bhumi or
  mahalaxmi** — nothing creates one when a lead closes, so the reminders exist
  and are never fed.
- **Open:** where closed business lives (a Rentals view by flat and end date vs
  a second list in Contacts); what a sale records (no renewal); the agreement as
  an uploaded document on the tenancy; whether Key Received starts conversion
  automatically or offers it.

### 1.8 ✅ Carry the sheet's call outcomes into the calling list — at import `d381de2`; the back-fill was declined, see PARKED.md
- Their Sierra sheet's Call Status (not interested 281, wrong number 30,
  interested 39, …) was dropped at import; every row reads New. Map it at import
  and apply it to the rows already imported from the stored sheet. Paying-client
  write — confirmed first.

---

## 2026-09-24 (later) — decisions, and the activity report thought through as a business

**Decided:** conversion is a **button**, on both sides — "Convert to property" on
a calling row at Key Received, "Close the deal" on a lead. Nothing converts on
its own when a status is set.

### The three nouns, so the naming question has an answer
The confusion is real: Contacts today means "owners whose property we manage",
and Properties is also "what we manage". The way out is to give each screen ONE
kind of thing:

| Screen | Holds | Comes from |
|---|---|---|
| **Leads** | people asking for a flat — prospects | enquiries, imports |
| **Calling** | owners we are asking for a flat — prospects | imports |
| **Properties** | the FLATS we have | added, or converted from Calling |
| **Contacts** | the PEOPLE we do business with — owners and tenants/buyers | a conversion, or a deal closed |
| **Rentals** (new) | the AGREEMENTS between them — who, which flat, until when | a deal closed |

So: keep the name **Contacts**, and let it mean what it says — everyone who has
become business (an owner whose flat we took on, a tenant or buyer who closed),
each with their role. Prospects stay in their pipelines. A flat is a Property;
an agreement is a Rental.

### What the tenancy feature actually is (measured 24 Sep)
The user suspected it was shallow. It is:
- a JSON blob on the property: tenant name (free text), tenant phone, start,
  end, deposit — **no rent amount**, **no agreement document**;
- **one per flat, overwritten** on renewal — the previous tenancy is lost;
- **not linked to anybody**: the tenant is a string, not the lead who rented;
- the only reminder is Today's "Tenancies expiring" group (≤ 60 days);
- **0 recorded** on bhumi or mahalaxmi.
Rentals should be built as a real record (flat, owner, tenant = the lead, rent,
deposit, dates, agreement file, history of renewals), and the old blob migrated
into it where any exists (none do on the paying firms).

### Agent activity — the business first

**Who reads it, and what they are trying to find out**
- **The agent, end of the day:** "What did I get done — and can I show it?" and
  "What have I left for tomorrow?" It is proof of work as much as a to-do list.
- **The owner/manager, during and at the end of the day:** "Did everyone
  actually work today? Who is falling behind, and on what? Is any customer
  being ignored?" He is not asking for charts; he is deciding who to talk to.

**What an agent can actually do — and so what can be counted**
(every one of these is already recorded with who did it and when)

| They… | Recorded as | Shown as |
|---|---|---|
| tap Call on someone | a call | **Calls made** |
| write down how the call went | the call's outcome | **Answered / Didn't pick up / Busy / Switched off** |
| send a WhatsApp | a WhatsApp | **WhatsApps sent** |
| write a note on its own | a remark | **Notes written** |
| write a note on a call or message | the note on it | counted with that call, not twice |
| book a call back, visit or meeting | a follow-up | **Follow-ups set** |
| do a follow-up that was due | follow-up closed by the work | **Follow-ups done on time / late** |
| let one pass | follow-up past due | **Follow-ups missed** |
| take someone to a flat (with photo) | a visit | **Site visits** |
| change where a customer stands | a status change | **by what it BECAME** (below) |

**Not activity:** being assigned leads, the rota moving leads, opening a record
to look at it. None of these is work the agent did.

**The words — rules the screen follows**
1. Verbs a broker uses, never product words. Not "stage changes", "events",
   "moved forward", "touched" — "calls made", "notes written", "site visits".
2. **A status change is told as what the customer now is**, never as movement:
   "4 now interested · 2 visits booked · 3 said not interested · 1 deal closed".
   "Moved forward 6" means nothing to a firm owner; "4 now interested" does.
3. **"Calls made" never claims a conversation.** A call is a tap on the button;
   the app cannot know anyone answered. "Answered" is shown only where the
   agent wrote the outcome down — measured, that is 114 of 485 calls on bhumi
   (24%). The report will, usefully, push that number up.
4. Show both **calls made** and **people called**: five taps on one number is
   five calls and one person.
5. A status flipped and flipped back counts as nothing.
6. The day is the firm's day, midnight to midnight in its own timezone.
7. **Every number opens the list of people behind it.** A number you cannot
   open is a number nobody trusts.

**The agent's view — "My day"** (Today, top, phone first)
> **Today** — 38 calls to 31 people · 12 answered · 9 WhatsApps · 6 notes · 1 site visit
> **Where they stand now** — 4 interested · 2 visits booked · 3 not interested
> **Follow-ups** — 5 done · 2 missed · 7 due tomorrow
> **New today** — 6 came in · 4 called · **2 not called yet**

**The manager's view — "Team today"** (desk)
One row per person, the same words in columns, sortable, every cell opens the
people behind it. Above it, sentences — only the ones that are true today:
> Zahir hasn't made a call today.
> 3 enquiries that came in this morning haven't been called — 2 with Aniket.
> Khushboo has 4 follow-ups from yesterday still open.

**Open, for the owner (Mahalaxmi) and the user**
1. Do these words match how they talk? Anything he specifically asked to see?
2. Is "today" enough, or does he want the week / a chosen date?
3. An end-of-day message to each agent and to the manager — yes, and at what time?
4. Targets (e.g. 50 calls a day) — not built unless asked; a target shown
   without being asked for reads as surveillance.

### Activity — the calling side, and one switch (decided 24 Sep)
- **One switch, Leads | Calling**, on both "My day" and "Team today". Never both
  on one screen — the user wants each view clean, not the two crammed together.
- **Calling is chasing, not inbound**, so it is measured as EFFORT TODAY, never
  as coverage. No "called 3 of 700 · 697 uncalled" — on a 700-row list that is a
  number that shames a full day's work and changes nobody's next call.
- What the calling view counts, in the same words as leads:
  **calls made · people called · answered · didn't pick up · busy · switched
  off · wrong number** — the outcome breakdown comes only from outcomes the
  caller logged, which is the point: it shows who logs and pushes the rest to.
- **Where they stand now** — only statuses a PERSON set today, told as what the
  owner now is: "3 interested · 1 key received · 5 not interested · 2 do not
  call". Excluded: the automatic "New → Contacted" the app writes on a first
  dial (authored 'System', metadata.auto = true — see noteOwnerContact) and the
  default a row arrives with.
- Follow-ups become **callbacks**: set · done · missed · due tomorrow.

### 1.8 (decided 24 Sep) — a Status column at import, not a script
- **Checked:** the Sierra sheet's Notes came from "Sales Comment"; its **Call
  Status column was not imported** and lives only in crm_import_rows. The Owner
  Calling sheet's "Feedback" did come in as notes. 13 calling notes mention an
  outcome in all.
- **Decided:** the importer gets a **Status** field with an automatic
  translation of the usual words (not interested / NI → Not Interested; wrong no
  → Do Not Call; interested → Interested; received / not received / nr / busy /
  cut / cnc / switched off → Contacted); anything unrecognised stays a note; the
  review step shows the counts before importing. **Imported statuses are
  authored "Import", never a person — they must not count as activity.** The
  rows already in are fixed by running the same rule once over the stored
  sheets, counts shown before it writes.

### Parked (24 Sep)
- **Monthly agent performance.** After the daily report has run long enough to
  have data, and outcomes are being logged.

---

## 2026-09-24 — what "done" means for the next set of work (agreed before starting)

**A. Status column at import** — (1) a Status field on the Map step, auto-matched
to Call Status / Status / Feedback / Outcome; (2) the Review step shows the
translation counts BEFORE anything is written; (3) after import every row's
status matches that line, and the sheet's own words are kept on the record;
(4) these statuses are authored "Import" and count 0 as activity; (5) importing
the same file again changes nothing.

**B. Mahalaxmi's rows already imported** — (1) read-only dry run on production
first, counts per status and sheet, 0 writes, user says go; (2) exactly those
counts change and nothing else, bhumi untouched, only rows still at New (a row
an agent has worked is left alone), each changed row gets an "Imported as"
entry; (3) a second run changes 0 rows.

**C. Activity report** — (1) My day with a Leads | Calling switch, plain words,
every number opens its records; (2) Team today, one row per active person, only
true warnings; (3) numbers proven against an independent database count for a
real bhumi agent and day; (4) system / import / rota entries count 0, "calls
made" never shown as "answered", a status flipped back counts 0, the firm's
day; (5) phone and desk, no page errors.

**D. Conversion and Rentals** — defined the same way when started.

## C, as built (24 Sep)

**Where.** "My day" at the top of Today on the phone (and the Dashboard panel
for an agent at a desk). "Team today" in full on the Team page (it replaced
the "Team activity" roster): a row per person in the same words as My day,
what they hold, and Reassign. The Dashboard carries a compact one — the true
sentences and one line per person — and everything on it opens the Team page.
The Dashboard's "By agent" table is gone for the desk: its facts are each
person's Holds line.

The first build was a ten-column grid of numbers with a red sentence per
person above it. That is not what was agreed ("a row per person in the same
words") and was rebuilt; the check that missed it verified the numbers, not
the screen against this text. Both have the Leads | Calling switch and a
‹ day › stepper. Every number opens the people behind it; a row opens the record.
Code: `backend/src/services/activityReport.ts` (what counts — one list of
facts, the counts and the lists read the same query), `routes/activity.ts`,
`src/components/ActivityDay.jsx`.

**Decisions made while building, so they are not re-litigated:**
- "Answered" is decided in one place — `reach` on each call outcome in
  `src/data/callOutcomes.js`. Calls with no outcome are shown as "no outcome
  written".
- Status changes now record `{from, to}` (leads and owners). Older rows are read
  from their titles. A person's day on one record counts as what they last set,
  and nothing if it ends where it started.
- A rejection no longer writes a second "Rejected: …" remark; the reason and
  note ride on the status line. Old ones are not counted as notes.
- "Worked today" is gone from the By-agent table: it counted every event a
  person wrote, bulk assignments included, and would have disagreed with Team
  today.
- Warnings, only when true: idle ("hasn't called a lead today" / "…anyone on
  the calling list today", only after noon, only agents on duty holding work
  on that side); enquiries that came in and haven't been called, with whom;
  3+ follow-ups/callbacks late.
- Late / due tomorrow are shown for today only — a past day cannot know them.
- The calling side has no "done" for callbacks: a cleared callback is not proof
  anybody rang.

**Checked.** Siddhi, bhumi, 23 Sep, report vs a hand-written query on production
(read-only): 34 calls = 9 answered + 16 not received + 2 busy/off + 7 no
outcome; 5 WhatsApps; 6 notes; her New → Follow-Up → New flip counted 0, Deal
Closed 1. On dev with a probe lead: agent's taps → 3 calls / 1 person / 1
answered / 1 not received / 1 no outcome / 1 WhatsApp / 1 note / Now 1
Follow-Up; the System auto status counted 0; an agent asking for another
person's day gets their own. Phone (iPhone 13 viewport) and desk driven, no page
errors, no sideways scroll; probe rows deleted.

**Not built, decided.** An end-of-day push — not required (24 Sep): the report
is on screen whenever anyone opens it. Targets — deliberately not built.


## D — Conversion, Agreements, Contacts (decided 24 Sep, building)

**Decided with the user:** Contacts = Owners · Tenants · Buyers. Rentals and
sales are ONE record, an Agreement (kind rent | sale); renewals and reminders
only on rent. No separate Rentals screen — Tenants shows each agreement's flat,
rent and end date; reminders come through Today. Each pipeline has a FINAL
stage held as a role, not a name: renamable, not deletable, "Make final" moves
it. Project names (4.6) go in first.

**What done means:**
- **D0 Project names.** "Sai Heights", "sai heights" and "SaiHeights" are one
  card in Calling and in Properties, shown with the most common spelling; the
  filter, Assign project and the card's counts cover every spelling. No stored
  name is rewritten.
- **D1 Final stage.** Settings say which stage is final for leads and for
  calling; nothing reads the name `Deal Closed` / `Key Received` outside the
  defaults. In the editor the final stage is tagged, renames with its records,
  cannot be removed, and "Make final" moves the role. The paying firms' stored
  lists are not rewritten — the role defaults to today's names.
- **D2 Convert to property.** On a calling record at the final stage: a form
  filled from the record → a property linked to the owner, who appears in
  Contacts → Owners. The same project + tower + unit attaches to the existing
  flat instead of duplicating. The record shows what it became; pressing again
  cannot make a second one.
- **D3 Close the deal.** On a lead at the final stage: rent → an Agreement
  (rent), the lead in Contacts → Tenants, the flat Rented; sale → an Agreement
  (sale), Contacts → Buyers, the flat Sold. A flat outside our inventory is
  allowed. Same no-duplicate rule.
- **D4 Agreement.** Flat, owner, tenant/buyer, amount, deposit, start, end (rent
  defaults to 11 months), the agreement file, status. Renewal makes a new
  agreement linked to the old, which is kept. Today's expiring group reads
  agreements; the agent is alerted 30 days before a rent ends (catalogue entry,
  recipient count asserted). The tenancy blob and its form are gone.
- **D5 Contacts.** Owners · Tenants · Buyers on the one module standard; a
  person opens with their flats and agreements.
- **Checked:** build and backend parse; phone and desk driven; the rows each
  button writes read back from the database; probes deleted; the only change to
  bhumi / mahalaxmi is the additive schema on deploy.

### D, as built (24 Sep)

- **D0** `projectNorm` (store.ts) groups and filters Calling, Properties, the
  project page, Assign project and the import's same-flat check. Checked on
  dev: four spellings → one card of 4; any spelling filters to all.
- **D1** `src/data/pipelineRoles.js`. Calling: the final status is a role —
  rename carries it, removal refused (400), "Make final" moves it, an ending
  cannot be final. **Leads:** "Deal Closed" and "Rejected" are also what every
  "open" count in SQL excludes (~70 reads), so their stored value stays and the
  firm renames the NAME SHOWN (`stageLabels`): every tag, picker, the activity
  report and new history lines say "Booked"; the record still stores Deal
  Closed. A name another stage already shows is refused. "Make final" is
  Calling only — nothing on the leads side needs the final stage moved.
- **D2/D3** `services/agreements.ts`, `routes/agreements.ts`,
  `POST /owners/:id/convert`, `components/Agreements.jsx`, and a `finish` slot
  in the shared record header (ModuleDetail ← progression.finish). A second
  press is 409 with the existing id. Close the deal moves the lead to the final
  stage through updateLead and the flat to Leased / Sold. Mark as rejected is
  hidden on a closed deal.
- **D4** `crm_agreements` (db.ts). Renewal = a new row with `renews_id`; End
  frees a Leased flat. Reminder `agreement_ending` (catalogue, copy, sweep):
  once per agreement, the agent or the desk. The tenancy blob's UI, store
  actions and quick actions are gone; the one stored blob (demo `urban`) moves
  by `runOnce('2026_09_24_tenancy_to_agreements_v2')`. Today's "Tenancies
  expiring" reads agreements — it read `config->'tenancy'`, which nothing ever
  wrote, so it had been empty on every desk.
- **D5** Contacts → Owners · Tenants · Buyers (sidebar, `?tab=`), Tenants and
  Buyers one row per agreement.
- **Checked on dev (delpat):** every button through the real endpoints and the
  real screens; the agreement PDF uploaded and serves (one probe file stays in
  the dev bucket — no delete route); the reminder sweep for delpat alone sent 1
  then 0; probe rows deleted (owners, properties, leads, agreements, events,
  notifications). Nothing run against production.

---

## E — 25 Sep: Today, My work, Performance (as built) and the superadmin plan

### Today, My work, Performance — `development`
- **Who:** the agent (phone or desk) wants what to do next and how their day
  is going; the owner wants who needs a word, and one person's work when asked.
- **Today** is one page on phone and desk (`modules/phone/PhoneToday.jsx`):
  *To do* (the work queue) and *My work* (`components/AgentWork.jsx`). Tabs on
  a phone, side by side on a desk. An agent's desk lands on Today; the
  Dashboard is the desk's. Owners and managers on a phone get a third tab,
  *Team*.
- **My work:** the day (tiles, what moved, every count, what they hold now,
  each number opening its records), a day stepper, and the last 14 days as a
  bar a day (picked up drawn inside). Tapping a bar reads that day.
- **Performance** (desk, owner and managers): a card per person for today, 7
  or 30 days (calls, % picked up, a small chart, site visits, deals closed,
  follow-ups done, and today's fair red: missed follow-ups, new leads not
  called, no calls after noon). A card opens that person's page, the same page
  as their My work, with Their leads and Reassign.
- **Team** is people management only. The dashboard's Team today stays at the
  bottom; a row opens that person on Performance.
- **Restructured the same day (the user's direction, 25 Sep):** one story in
  fixed order: people contacted → how the calls went → what came of it → the
  rest → what is still open. Manager overview: team summary (people contacted
  leads, calls beside it), a donut of contact status per PERSON (picked up if
  any call that day was answered, else the last call; `contactOf` in
  activityReport.ts, so the slices add up to people contacted), outcomes as
  bars, an agent table to open, and a tinted Needs attention with who each item
  sits with. Drill-down: the same for one agent plus other activity and pending
  work. Self view (My work): my performance, my activity, my pending work.
  Every number opens its people. Not picking up is a contact status; it becomes
  "people to try again" only on the agent's own list.
- **Removed:** the 7/30-day cards, the 14-day chart and `/activity/range`; the
  direction was one day, told as a story, not more data.

### Superadmin — decided 25 Sep, not built
- **Getting into a firm's desk:** a support session, **read-only**, **always
  allowed** (no opt-in by the firm). A session row marked with the superadmin,
  two hours, not sliding; opened in a new tab with its own sessionStorage key so
  the operator's own login is untouched; a banner with the end time and Exit;
  start and end written to the firm's own ledger. The raw superadmin-token path
  into firm routes (`middleware/auth.ts`) goes, with the `'superadmin'` role
  checks it left behind.
- **Firm page** `/admin/firms/<slug>`: team (role, login id, status, last
  login, locked, still on the password it was handed), live sessions with Sign
  out, logins and failures, leads in and the last lead per source, who worked
  in the last 7 days, storage use (E7). Actions: reset the owner's password,
  sign a person out, open desk.
- **Ledger per firm:** 9.1 (hashing fix, per-firm chains, legacy verifier,
  incremental check) and `GET /admin/firms/:id/audit`, paged and filtered on
  the server. The firm's Settings view stops verifying every firm's rows.
- **Superadmin session:** a session row, 12 hours, real logout, lockout.
- **Onboarding (2.4, 2.5):** branch `claude/super-admin-capabilities-plg7uc`
  merges cleanly and is mostly right (one `planRoster`, refusal before the firm
  row, team returned and routed, Bhumi staff details out of the public bundle).
  Before taking it: **enforce `must_change_password` on the server** (nothing
  does today; with `vijay@123` any teammate can sign in as any other), check
  **duplicate phones** in the plan (`(tenant_id, phone)` is unique), and wrap
  provisioning in one transaction.
- **Also in this area:** 9.2 portal setup email; the ten live default passwords
  (KNOWN-ISSUES); E2 rotating secrets (the user's, by hand).
- **Order:** the branch with its fixes → superadmin session → support session
  → firm page → 9.1 and the ledger.

### Still open elsewhere
- Part 7, Properties (7.1 verification visit, 7.5 gallery link, 7.2–7.4, 7.6):
  set aside by the user, not started.

