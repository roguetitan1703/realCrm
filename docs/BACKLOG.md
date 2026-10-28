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

The order is `PLAN.md` §3 (20 Oct – 12 Dec), written from the usage snapshot
`usage-2026-10-17.md`. Decisions waiting on Om are `PLAN.md` §6.

- **Feed watch: the Delpat half.** The owner's `feed_silent` alert is built on
  `development` (`services/feedWatch.ts`, catalogue `FEED_SILENT`); before the
  deploy Om runs `scripts/feed-watch-preview.ts` read-only on production. Left:
  silent feeds in the console (it shows no connections today, only lead
  sources on the firm page) and a message to Om (`email.ts sendMail` to
  `superadmins.email` exists; no channel built). *Delpat*

## Next — in plan order

- **One place to say what happened.** Outcome on 20% of bhumi's calls (Ravish
  163 calls, Anil 110: none), 51% of mahalaxmi's; mahalaxmi sets a status on
  36% of leads with no call logged. The outcome sheet opens as the dialer takes
  the screen, says "Optional." (`Modals.jsx:1604`) beside a status pill that
  asks the same fact. One sheet on return from the dialer, outcome sets the
  status by a visible map, a status change with no contact asks one tap
  (waits on PLAN Q3). Absorbs "one outcome model" (`CALL_OUTCOMES`,
  `WA_OUTCOMES`, `VISIT_OUTCOMES`). *agent*
- **Finish what was booked.** Past due now: bhumi 24 of 33, mahalaxmi 7 of 9.
  Done on the phone lead record (`FollowUpDoneModal` is ready); moving to Site
  Visit books the visit; "Did it happen?" the day after. Visit proof rule waits
  on PLAN Q4 (also settles: history's Add outcome closes a visit with no proof).
  A call about a booked visit still completes nothing. *agent*
- **Team: who stopped.** One line per agent inactive 7+ days holding open leads
  (Siddhi: 65 open, last active 11 Oct). Then one support call per owner. *owner*
- **Business rails.** Weekly numbers script (PLAN §4, read-only); a release
  every two weeks (window: PLAN Q8); `docs/ops/ONBOARDING.md` from the
  mahalaxmi go-live; a written price (PLAN Q2). *Delpat*
- **Help desk** (Work OS #129) — Om, 19 Oct: both. (1) Report a problem to
  Delpat from inside the app, prefilled with firm, person, screen, version;
  (2) a help centre of how-to pages and videos in the app (the tutorial-videos
  engine exists). How-to demos (Work OS #156): Soham and Om (intern) make them
  with CutRoom.
- **Collapsible sidebar** (Work OS #130) — ride in a release, never its own. *owner*
- **WhatsApp intro templates** (Work OS #153) — lead and owner calling, with the
  agent's name and the project. A lead's WhatsApp already prefills from
  `whatsappIntroTemplate`; owner calling sends empty (`Modals.jsx`). Waits on
  Om's wording. *agent*
- **Bulk unassign a finished calling list** (Work OS #154) — `POST
  /owners/bulk-assign` already takes null; needs an entry point, owner only.
  Next to build. *owner*
- **Bulk merge misspelt project names** (Work OS #155) — nothing exists
  (`projectNorm` in `store.ts` only normalises); needs a spec. Waits on Om:
  scope (owners, leads, flats) and whether aliases apply at intake. *owner*

## Small

- Visit slots on the buyer forms offer every day of the next week: the firm's
  days off are stored nowhere (only `workHours`), so `buyerAsks.ts visitSlots`
  has nothing to skip. Needs a days-off setting first (same gap as "days
  worked", WORK-STATE Later). Waits on Om.
- Boot sends four requests (bootstrap, desk-summary, owners summary, unread
  count); bootstrap's size has never been measured.
- Demo connections on `raipur` and `urban` still default `deal: 'sale'`.
- Sale-stamped leads from before the rule (bhumi 252, mahalaxmi 67) cannot be
  told from real sales by count; `scripts/reprocess-inbox.ts --overwrite=deal`
  reads the stored payload.
- The app has never stored an audit-chain check (`audit_checks` empty); the
  chain verifies clean, 7 chains, 13,941 rows.
- `.env` lines split on `\n` only; check `grep -c $'\r' .env` on EC2 first.
- **Owners have no duplicate flag or merge** (specs/phone.md). After the phone
  repair, owners on one number: bhumi 10 new + 31 already, mahalaxmi 6 + 127
  (production dry run, 20 Oct). Only a search by the number shows them. *owner*
- The dev R2 bucket's CORS refuses `localhost:5190` (builder ports), so visit
  proof cannot upload from a builder's frontend.
- Enquiry spam: one machine rotating numbers fills a firm's 100/day cap in
  ~100 min, then real buyers are refused for the day. The buyer forms (Call me
  back, Book a visit, New homes like these) now share that one pool. Needs a challenge (e.g.
  Turnstile) or per-firm adaptive limits.

## Bugs

Measured on production, read-only, 12 Oct, unless marked. Alert delivery
gaps are in `specs/notifications.md` §1, not here.

- **"Going cold" is most of the book** — bhumi 493 of 585 open (84%, at their
  7-day setting), mahalaxmi 168 of 231 (73%, 1-day). 19 and 35 crossed the line
  in the last day. Likely our model, not the agents: real portal leads may not
  behave the way the pile assumes. Study how real leads actually move before
  changing the rule. *manager*
- **A lead's Callback stores no time** — bhumi 19 of 20, mahalaxmi 42 of 42 have
  none, so nothing can say a callback is late. (Owners store one.) *agent*
- **Booked site visits with no time** — bhumi 5 of 29 (typed text only).
- **A control that does nothing** (code, 18 Oct). "Merge duplicate" shows only
  when `duplicateOf` is set, and nothing sets it (checked 28 Oct: no route writes
  `duplicate_of`). Its request, once reachable, is now accepted by the server. *owner*

## To verify

- **Import undo on production** (imports.ts `revertImport`, 21 Oct): not read,
  the production read was refused here. Count per tenant: done properties jobs
  and their `config.importBatchId` listings; leads and owners carrying a batch
  with no job (older desk batches, which now have no undo).
- **Now due, phones** (specs/phone.md; API deployed 27 Oct): the boot log's
  `[Phones] E.164 repair` line matches the dry run (bhumi 1 user, 4 leads, 52
  owners, 55 properties; mahalaxmi 3, 1, 6, 7) and names no user collision.
  The desk's phone boxes (lead, owner, team, profile, reply-to, listing owner,
  console roster) were not driven in a browser; the catalogue form was.
  Production after the repair (27 Oct): owners bhumi 805 E.164 / 1 other,
  mahalaxmi 3,737 / 0; leads bhumi 1,033 / 3, mahalaxmi 547 / 0. The enquiry form's plain-field fallback
  when the phone box chunk fails was not driven in a browser.

- **A listing owner's Callback stays on To do after the call**: checked 28 Oct,
  it is the rule (an owner's callback never ends on a call; a lead's ends on
  Call, before the outcome). Both are wrong; one model proposed in
  `specs/follow-ups.md`, waits on Om's D1–D5. *agent*
- **Now due, frontend** (deployed 27 Oct): /privacy, /terms and /data-deletion
  open in an incognito window with the full text in the page source (Meta App
  Review).
- **Now due, API** (deployed 27 Oct): a photo link previews in WhatsApp, Slack
  and Telegram; Siddhi's leads show Siddhi.
- **Now due, notifications** (`specs/notifications.md` §13; first run done 27
  Oct: closed 3,263 at bhumi (37 open), 1,233 at mahalaxmi (41 open)): Apple
  failures (110 of 458 in 14 days before) drop to near zero; the first 09:00
  summary goes out; Team shows Anil's and Vinod's state; after a week, console
  → Alerts says which types change behaviour, and whether `lead_untouched`
  earns its place (spec §12).

## Bigger pieces — each has a spec

- **Enquiries** — a person is not an enquiry. `specs/enquiries.md`, planning.
- **PWA on a real device** — install identity, offline. `specs/pwa.md`.
- **Branding audit** across login, desk, phone, PWA, email, share.
  `specs/branding.md`.
- **Backup restore, per tenant**, and **retention** for every growing table.
  `specs/data-lifecycle.md`.
- **Rotate the secrets exposed during development** — user-side.

`docs/archive/` holds the old ROADMAP, ROADMAP-2 (desk themes E1–E10, measured
11 Aug, status not re-checked) and the Mahalaxmi batch, for their reasoning.
