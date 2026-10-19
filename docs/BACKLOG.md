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

- **Release 1** — everything on `development` (`releases/2026-10-13.md`).
  Waits on Om's re-test on the dev preview; re-run the first-run preview the
  morning of the deploy, and have the reopen script written before it.
- **Feed watch** — an active integration silent 7+ days after a normal month
  raises one alert to the owner and to Delpat. bhumi's 99acres sent nothing for
  4 weeks (12 Sep – 9 Oct) and nobody noticed. *owner, Delpat*

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
  engine exists).
- **Collapsible sidebar** (Work OS #130) — ride in a release, never its own. *owner*
- **Catalog** (Work OS #131) — built on `development` (`specs/listing-pages.md`
  §A, §A.5): public catalogue + shared links, plus work only to people who can
  take it. Waits on the final walk, then on Om's yes to `stale-rota-ids.ts`
  (read-only), since stale rota ids at the paying firms stop getting leads.

## Small

- Schedule follow-up has no busy guard; a double tap sends two writes (the
  server drops an identical one, `sameBooking`).
- Boot sends four requests (bootstrap, desk-summary, owners summary, unread
  count); bootstrap's size has never been measured.
- Chart palette repeats after 6 sources (`styles.css` `data-i`).
- Row menus follow their button when it scrolls out of view instead of closing.
- Credential Copy does not include the workspace link.
- Demo connections on `raipur` and `urban` still default `deal: 'sale'`.
- Sale-stamped leads from before the rule (bhumi 252, mahalaxmi 67) cannot be
  told from real sales by count; `scripts/reprocess-inbox.ts --overwrite=deal`
  reads the stored payload.
- `test:ingest` / `test:leadflows` hit a real endpoint; which tenant is unaudited.
- The app has never stored an audit-chain check (`audit_checks` empty); the
  chain verifies clean, 7 chains, 13,941 rows.
- `.env` lines split on `\n` only; check `grep -c $'\r' .env` on EC2 first.
- Add lead offers an agent "Unassigned" (it now means "the firm's rule
  decides") and lets an agent name a colleague; the rules say agents don't
  assign. *agent*
- "Back on their link" (`maybeReturned`) is check-then-insert; two parallel
  opens can raise it twice.
- Property `owner_phone` is still stored as typed (dev: delpat 20 of 26);
  only owner records made from it are normalised.
- Staff numbers (team, profile, sign-in lookup, reply-to) still use
  `normalizePhone`, which cuts a foreign number to +91 and its last 10 —
  the second phone rule beside `phoneAsStored`; moving it needs the sign-in
  lookup migrated with it.
- A lead whose full record never loads (offline) keeps its homes and history
  sections spinning instead of showing what the list row has. *agent*
- The dev R2 bucket's CORS refuses `localhost:5190` (builder ports), so visit
  proof cannot upload from a builder's frontend.

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
- **`/api/v1/ingest` has no rate limit** (code). A leaked key fills a desk.
- **4 paying-firm users cannot sign in by phone code** (production, read-only,
  17 Oct): bhumi 1 of 4 and mahalaxmi 3 of 5 user phones are stored as bare 10
  digits, and the sign-in lookup matches `+91…` exactly. Older than the locale
  work. *agent*
- **A column header sorts one way only** (code, dev). Clicking Last enquiry
  again does not flip it (`Table` calls `onSort(key)`, never the direction);
  only the toolbar arrow does. Newest-first takes two controls. *manager*
- **Two controls that do nothing** (code, 18 Oct). The profile menu offers "API
  Integrations & Webhooks", but `dispatchOutboundWebhook` has no caller. "Merge
  duplicate" shows only when `duplicateOf` is set, and nothing sets it. *owner*

## To verify

- **Stale ids on production rotas** (dev delpat had `u_mue1klh4`): both rotas
  now skip them, but how many firms carry them, and so how many portal leads
  went to "a former member", is unmeasured. Run `backend/src/scripts/stale-rota-ids.ts`
  (read-only) once Om approves production reads. *agent*
- **Shortlists cut by a reopened lead** (dev, 20 Oct; fixed on `development`):
  a lead reopened from the list showed the legacy column, and removing one home
  rewrote `lead_shortlist` from it (5 rows → 1). Live since list rows were
  merged over records; how many production shortlists shrank is unmeasured —
  count `lead_shortlist`-removal timeline events that dropped more than one
  home, read-only, with Om's yes. *agent*
- **A listing owner's Callback stays on To do after the call** (seen on the
  demo, 17 Oct): a lead's booked call closes on Call, an owner's did not.
  Check whether that is the rule or a gap. *agent*
- **After the Vercel deploy:** /privacy, /terms and /data-deletion open in an
  incognito window with the full text in the page source (Meta App Review).
- **After the API deploy:** a photo link previews in WhatsApp, Slack and
  Telegram; Siddhi's leads show Siddhi.
- **After the API deploy — notifications** (`specs/notifications.md` §13):
  the boot log's first-run line matches the preview (bhumi ~2,177 closed,
  mahalaxmi ~717); Apple failures (110 of 458 in 14 days before) drop to near
  zero; the first 09:00 summary goes out; Team shows Anil's and Vinod's state;
  after a week, console → Alerts says which types change behaviour, and
  whether `lead_untouched` earns its place (spec §12).

## Bigger pieces — each has a spec

- **WhatsApp and Instagram through Meta** (Tech Provider: Embedded Signup with
  Coexistence, webhook, inbox, New contacts queue). Brief only, no spec yet;
  the legal pages it needs are live at /privacy, /terms, /data-deletion.
- **Enquiries** — a person is not an enquiry. `specs/enquiries.md`, planning.
- **PWA on a real device** — install identity, offline. `specs/pwa.md`.
- **Branding audit** across login, desk, phone, PWA, email, share.
  `specs/branding.md`.
- **Backup restore, per tenant**, and **retention** for every growing table.
  `specs/data-lifecycle.md`.
- **Rotate the secrets exposed during development** — user-side.

`docs/archive/` holds the old ROADMAP, ROADMAP-2 (desk themes E1–E10, measured
11 Aug, status not re-checked) and the Mahalaxmi batch, for their reasoning.
