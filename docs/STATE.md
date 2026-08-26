# State — where the last session left the system

**Overwritten every session, never appended.** `git log` is the history; this is
the handoff. Only what git cannot tell you belongs here: what is *deployed* (as
opposed to committed), what is waiting on the user, and what was checked against
a live database so the next session neither re-derives it nor assumes it.

Open bugs go in `docs/KNOWN-ISSUES.md`, not here. Point at them.

**Last session: 2026-08-27.**

---

## Deployed

| | at | when |
|---|---|---|
| Frontend — Vercel, automatic on push to `main` | `1aed7e2` | 2026-08-19 |
| Backend — AWS, **by hand** | `1aed7e2` | 2026-08-19 |
| **Dev** frontend — Vercel preview, CLI | `0081cda` | 2026-08-27 |
| **Dev** backend — `re-api-dev`, EC2 | `0081cda` | 2026-08-27 |

**Nothing from 2026-08-19 onwards is deployed.** The live desk is running the
19th's code. `development` is ~25 commits ahead: the 22nd's outage fixes, the
Leads filter refactor, and desk rework steps 1–7 (A–H).

Consequence to remember: **the deployed backend still sends `lead_retry_due`** —
30 in the last 7 days on bhumi — from a pile that was deleted in `9a4abd3`.

---

## Notifications: tested end to end on dev, and they work

All 14 live types fired on `delpat`, against the dev backend and the Vercel
preview, on an installed PWA — as an agent first, then as the owner. Every one
arrived at the right role, rendered a readable sentence, and opened the screen it
names. **Verified by the user on 2026-08-27**, not inferred from code.

Three things the testing found and fixed, in `0081cda` and `6349a85`:

- **Tapping an alert with the app open reloaded it.** `client.navigate()` is a
  full document navigation; the `position:fixed` tab bar then sat off the bottom
  of the viewport until a resize. The worker posts the URL now and the router
  handles it in place.
- **An agent tapping a bulk-assign alert** landed on `?screen=leads&agent=<self>`
  with no visible control — the Agent dropdown is gated on `canAssign`. Dropped
  on read, since the same link is right for a manager.
- **`lead_reassigned` and `owner_reassigned` rendered the same sentence** as
  `lead_assigned` / `owner_assigned`. They say "moved" now.

The harness is `backend/src/scripts/test-notifications.ts` — it walks the
catalogue, so a type added there is covered automatically. Run it from the repo
ROOT (`.env` is resolved against `process.cwd()`), with `APP_ENV=development`.

**Two types are still unproven:** `owner_assigned` and `owner_reassigned` deliver
and route, but `delpat` has no owners, so they open an empty calling screen.
Nothing is known to be wrong with them.

---

## What this session did

All uncommitted, on `development`. **The backend must be deployed (or the dev
API restarted) before any of it shows numbers** — against the 19-Aug API the new
per-agent fields come back undefined and every cell reads 0.

1. **"Last activity" meant four different values.** The going-cold pile read the
   last person-authored event, the panel label read `updated_at`, and the sort
   key *named* "Last activity" — **the leads list's default order** — was
   `created_at`. A lead called an hour ago sorted below one nobody had opened.
   Now one expression, `lastPersonActivity()`, used by the sort, carried as
   `lastActivityAt`, printed by the panel.
2. **The dashboard is per-agent.** The load-bar roster and the duplicated
   Going-cold list are replaced by one table: `agent · open · not contacted ·
   nothing booked · went cold today · worked today`, every cell opening that
   agent's filtered list. The Going cold tile now counts **today's crossings**
   (6 on bhumi) instead of the standing pile (177).
3. **Today, on the phone.** Its spine changed from what is booked to what is
   silent — `quiet`, their open leads with nothing scheduled, longest-first,
   from its own query. The old feed selected 200 rows by arrival date, so a lead
   last touched five weeks ago could not appear in the group that exists for it.
   Mobile: the call button was a ~27×23px target nested inside a ~300px one
   (invalid markup) — now two sibling controls with a 44px target; the context
   line was one ellipsised row in ~190px — now two lines; `Install` removed (it
   is already on Me, inside `ThisDevice`).
4. **`no_next_step` is a real segment and a pill.** Four groups on the phone had
   a "See all" that called `go('leads')` with an undefined filter.
5. **Every KPI caption is gone** — six on the dashboard, two on the phone.
   "Labels and values only" is a standing product rule and the tiles had been
   explaining themselves since they were built.
6. **A live owner password was in the public JS bundle.** `Admin.jsx` hardcoded
   `Bhumi@2026` four times as the onboarding default; the bhumi owner account was
   still on it, unflagged. Both sources closed — the form pre-fills nothing, and
   `backfillPasswordAuth()` no longer hashes one shared constant across every
   tenant with `must_change_password = FALSE`. **Ten accounts still hold a known
   default; rotating them is a manual job — see KNOWN-ISSUES.**
7. **The KPI strip is three tiles.** All 16 never-contacted leads are at stage
   New and 11 arrived today, so "Not contacted", "Today" and the New bar were
   one pile counted three times. "Today" and the Leads-by-stage panel are gone;
   what is left is disjoint and clearable.
8. **Every alert is in one file** — `services/notificationCatalogue.ts`, the
   same move `leadSegments.ts` made for the piles. 21 types, each with who gets
   it, what fires it, whether it pushes and what the firm can change. `notify()`
   now reads `push` from there instead of 36 call sites each passing
   `push: true`, and a type that is not declared warns at boot and does not
   push. **Behaviour is unchanged** — every value was read off the call site it
   replaces. Measured: 606 alerts in 14 days for 216 leads; 13 of 21 types are
   ungated by any setting; 4 of 7 agents have read none of theirs.
9. **Seven alert types deleted, 21 → 14.** `lead_new` (the same event as
   `lead_assigned` — 216 and 216 over one set of 216 links),
   `lead_untouched_escalated` + `lead_stale_sla` (three types for one idea; the
   2x and 6x slaHours windows were invented in the file and nobody set them),
   `lead_retry_due` (its pile was deleted in `9a4abd3`), `followup_set` and
   `lead_moved_away` (told people what they had just done), and
   `lead_repeat_rejected` (folded into `lead_repeat`; its link pointed at
   `/leads/<id>`, a path this app does not have). `remark_added` demoted to the
   drawer. `followup_due` now reads `at` instead of `due_at`, a key nothing
   writes — it had fired zero times ever. Bulk-assign alerts link to the
   recipient's own filtered list instead of the whole desk's.
   **Expected effect on the measured fortnight: 606 alerts to roughly 250.**
   Retired types keep their icon so existing drawer rows still render.
10. **Notification clicks opened a browser tab when the app was closed.** The
   push URL was `/<slug>?screen=…` against a manifest scope of `/<slug>/` — one
   missing character putting every deep link outside the installed app. Fixed at
   the sender and normalised in the service worker, so the frontend deploy alone
   restores it even against the old backend.
11. **Bugs found and fixed from a walkthrough (26 Aug):**
   - **Re-saving an appointment wrote a duplicate 'Rescheduled' row every
     time.** The guard was `JSON.stringify(incoming) !== JSON.stringify(stored)`
     — but the stored copy comes back out of a JSONB column, and Postgres
     normalises jsonb key order, so the two strings never matched even when
     every value was identical. Now compared field by field, and the notify
     shares the same guard.
   - **Share Match opened with the wrong message.** The composer takes a
     one-shot snapshot at open; a *matched* listing is not in the cache until
     `getLeadMatches` returns, so it fell through to the plain follow-up text.
     Changing the language only "fixed" it because that re-runs the compose.
     Now recomposes once when the listing resolves.
   - **A WhatsApp share wrote `(undefined)` into the timeline** — `priceLabel`
     is the optional "Quoted price" field and most listings have none.
   - **Support WhatsApp is no longer a Settings field.** It is Delpat's number,
     not the firm's, and every client could edit it. Now
     `VITE_SUPPORT_WHATSAPP` at build time; unset, the control is not offered.
   - Bulk-assign and owner-arrival alerts link to the recipient's own filtered
     list rather than the whole desk's.
   - Distribution charts use six hues instead of six dilutions of the accent.
   - The pager lost five of its six boxes.
12. **Documents thinned** — `CLAUDE.md` 426 → ~215 lines and now opens with who
   the product is for; incidents to `docs/incidents.md`, open items to
   `docs/KNOWN-ISSUES.md`.

**Not verified in a browser.** `npm run build` passes and the backend parses;
nothing has been driven at a phone or desk viewport.

**Not done, on the user's instruction:** the next-step-after-outcome flow — the
call modal already asks for an outcome, and changing what follows it is a
question for the broker first.

---

## Verified against the production database — 2026-08-26, read-only

Tenant `bhumi`. No writes were made.

| | |
|---|---|
| Leads | 338 total, **246 open** |
| Never contacted (open) | **16** — was 74 before the §1 contact fix |
| **All 16 are also at stage New**, and 11 of them arrived today | "Not contacted", "Today" and the New bar were one pile counted three times |
| Follow-up overdue | 7 |
| Going cold (3 days) | **177** — 7 days: 123, 14 days: 24, 30 days: 0 |
| Crossed into cold in the last 24h | **6** |
| Arrived today | 17 · at stage New: 18 |
| Unassigned | 0 |
| Stages | Call Not Received 105 · Rejected 87 · Follow-Up 69 · Interested 41 · New 12 · Callback 11 · Site Visit 8 · Deal Closed 5 |
| Sources | Housing.com 150 · MagicBricks 103 · 99acres 50 · Property Circle 32 · Website 3 |
| Person-authored events, per day, last 14 days | 37–162 (median ~65) |
| Event types, 14 days | whatsapp 284 · stage_change 257 · remark 254 · call 213 · follow_up 8 · email 2 |
| **Owners** | **0** — the whole calling-queue surface is empty for this client |
| Agents | 7 + the firm account; 13 push subscriptions across 5 users |
| Notifications, 7 days | lead_assigned 99 · lead_new 99 · **lead_retry_due 30** · lead_assigned_bulk 21 · lead_untouched 17 · lead_repeat 11 · lead_untouched_escalated 3 |
| Routing sweeps | **both disabled** (`sweep_unassigned_enabled:false`, `reassign_idle_enabled:false`) |
| `crm_settings` `desk` row | **absent** — the firm has never set "gone cold after N days"; 3 is our default |

**Two shape facts that will bite a script:** production has **`crm_agents`, not
`agents`**, and `crm_owners` has `stage`, not `status`. Check
`information_schema.tables` before trusting a scratch query.

**The reading that matters:** the desk logs 37–162 person-actions a day and
177 of 246 open leads are "going cold". Those are not in contradiction — the team
works a subset and the tail accumulates. It means the 177 is measuring the tail,
not neglect, and 6/day is the number that describes what is actually happening.

---

## Waiting on the user

- **`VITE_API_URL` must be set in Vercel's Production environment.**
  `.env.production` is no longer committed, so the next production build **will
  fail** — deliberately, with the fix in the message. This is the one thing that
  breaks a deploy if forgotten.
- **Switch PM2 onto `ecosystem.config.cjs`, not via `deploy.sh`.** `dev:backend`
  does not exist on `development`, so after the merge `pm2 restart re-api` runs a
  missing script and the API does not come back. Once, by hand:
  ```bash
  cd ~/realestate && git pull origin main && npm install
  pm2 delete re-api && pm2 start ecosystem.config.cjs && pm2 save
  pm2 logs re-api --lines 30
  ```
  Proof is the boot banner: `🟢 PRODUCTION · port 5000 · db zxdid…`, not `local`.
- **Port 5001 needs a public URL** before a Vercel preview can be isolated.
- **`PUBLIC_API_URL` is not set locally**, so push delivery receipts stop at
  `sent` and never reach `displayed`.
- **Manager deletes** — the user's model is owner-equivalent minus billing; the
  server refuses. Widening it changes both sides.
- **A browser pass on the new dashboard and Today.** Built and unverified
  visually; the user asked for no Playwright this session.

---

## Do not repeat

- **Do not leave `npm run dev:api:prod` running.** It is a production writer: a
  watcher restart runs `initSchema()` against production.
- **`npm run build` does not compile the backend.** Parse changed backend files
  with `npx esbuild … --outdir=/tmp/ck`.
- **Re-cloning the development database wipes `metadata.retry_notified`** and the
  whole notification backlog re-fires to a real phone.
