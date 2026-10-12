# Backlog

**The one list.** Features, bugs and things to check all live here, one line
each. Detail belongs in a spec (`docs/specs/`) or in the commit, never here.

How it is worked:
- **Now** is what we picked. Everything else is a candidate.
- A sweep or bug hunt adds lines to **Bugs**; a passing thought adds to
  **Small**; something set aside goes to `PARKED.md` (with its numbers) and
  leaves this file. Picking a parked item up moves it back here.
- A line leaves when it ships (the commit says so) or is declined (PARKED).
- Bugs carry a number and the date it was measured. Unmeasured is "To verify".
- Mark who it is for when it is not obvious: **agent** (phone, between calls)
  or **manager** (desk, by agent).

Paying tenants are `bhumi` and `mahalaxmi`. A line that writes their data says so.

---

## Now

_Nothing picked._

## Next — candidates, most useful first

- **A call completes the follow-up it was made for.** Today closing a booking is
  its own flow, opening the timeline row, adding an outcome, then rescheduling
  (~6 controls); logging the call leaves the booking open. *agent*
- **One outcome model.** A call (`CALL_OUTCOMES`), a WhatsApp share
  (`WA_OUTCOMES`, its own sheet in `WaModal.jsx`) and a site visit
  (`VISIT_OUTCOMES`, "What came of it?") ask "what happened" three different
  ways; the visit options are unexplained and "Booked" is ambiguous. *agent*
- **Skeletons, not spinners or zeros.** Lists use `ListSpinner` (deliberately,
  Aug); sidebar badges read 0 before the desk summary lands; only
  `state.hydrated` tells "not loaded" from "empty", and one panel reads it.
  One shared skeleton for list, table and tiles.
- **Property import: choose a default sale/rent.** Rows without one are refused
  (`imports.ts`), with no option to apply one to the file. *manager*
- **Leads pagination restyle** (`Pager`, `primitives.jsx`). Look not yet agreed.
- **Group-by as a kanban** — leads (no group-by at all today) and calling inside
  a project (a table today). Needs a design pass before code.
- **See how firms actually use it, and suggest.** Read-only pass over
  production activity (who works what, what is never touched) → a short list of
  proposals. *manager*

## To decide

- **Onboarding passwords.** Onboarding hands out `vijay` / `vijay@123` (decided
  24 Sep, must-change on). The Team screen generates `tiger-pune-42` and shows
  it only after saving. Keep, or one generator shown before saving, with Copy
  carrying the workspace link?
- **Audit ledger visible to the firm's owner.** It records always; the Settings
  view is hidden on purpose (PARKED). The user has asked for it on.

## Small

- Schedule follow-up has no busy guard; a double tap sends two writes (the
  server drops an identical one, `sameBooking`).
- Boot sends four requests (bootstrap, desk-summary, owners summary, unread
  count); bootstrap's size has never been measured.
- Chart palette repeats after 6 sources (`styles.css` `data-i`).
- Row menus follow their button when it scrolls out of view instead of closing.
- Credential Copy does not include the workspace link.
- `.env` lines split on `\n` only; check `grep -c $'\r' .env` on EC2 first.

## Bugs

Measured on production, read-only, 12 Oct, unless marked.

- **Alerts are not being read.** 14 days: bhumi 299 alerts, 6 read (all by
  Amit); mahalaxmi 463, 0 read by any of the four agents. Either they never
  reach a screen people look at, or they are noise. *agent*
- **"Going cold" is most of the book** — bhumi 493 of 585 open (84%, at their
  7-day setting), mahalaxmi 168 of 231 (73%, 1-day). 19 and 35 crossed the line
  in the last day. A pile nobody can work. *manager*
- **A lead's Callback stores no time** — bhumi 19 of 20, mahalaxmi 42 of 42 have
  none, so nothing can say a callback is late. (Owners store one.) *agent*
- **Booked site visits with no time** — bhumi 5 of 29 (typed text only).
- **2 of bhumi's 7 agents have no push subscription** (Vinod, Anil); alerts to
  them are undeliverable before they are sent.
- **`/api/v1/ingest` has no rate limit** (code). A leaked key fills a desk.

## To verify

- **iPhone push failures (1.7).** Step 1 records the whole failure reason
  (`a44afd3`). Suspicion only — read `push_deliveries` on production before
  building anything.
- **After the API deploy:** a photo link previews in WhatsApp, Slack and
  Telegram; Siddhi's leads show Siddhi.

## Bigger pieces — each has a spec

- **Enquiries** — a person is not an enquiry. `specs/enquiries.md`, planning.
- **Photo-link enquiry** ("I'm interested"). `specs/gallery-enquiry.md`, waiting
  on who gets the lead.
- **PWA on a real device** — install identity, offline. `specs/pwa.md`.
- **Branding audit** across login, desk, phone, PWA, email, share.
  `specs/branding.md`.
- **Backup restore, per tenant**, and **retention** for every growing table.
  `specs/data-lifecycle.md`.
- **Rotate the secrets exposed during development** — user-side.

`docs/archive/` holds the old ROADMAP, ROADMAP-2 (desk themes E1–E10, measured
11 Aug, status not re-checked) and the Mahalaxmi batch, for their reasoning.
