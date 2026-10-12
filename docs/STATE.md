# State — where the last session left the system

**Overwritten every session, never appended.** `git log` is the history; this is
the handoff. Only what git cannot tell you belongs here: what is *deployed* (as
opposed to committed), what is waiting on the user, and what was checked against
a live database so the next session neither re-derives it nor assumes it.

The work itself is in `docs/BACKLOG.md`; set-aside work in `docs/PARKED.md`.

**Last session: 2026-10-12** (second session that day): docs restructured into
STATE / BACKLOG / PARKED; the old known issues re-measured on production; then
**notifications rebuilt as open work** (`specs/notifications.md`, all five
steps, built and verified on dev — §13 says what and how).

---

## Deployed

| | at | how |
|---|---|---|
| Backend — AWS EC2 (one box, PM2 runs prod and dev) | **`78458b6` (5 Oct)**, read from `/health` 12 Oct | `scripts/deploy-api.sh` on the box, `main` only |
| Frontend — Delpat's Vercel | not read; Branch Tracking is OFF, the user deploys by hand | |
| Dev API (`api.dev.re.delpat.in`) | **stopped by the user** (12 Oct) | |
| `main` | `820514e` (6 Oct) | |
| `development` | ahead of `main`: marketing/demo, docs, `4fbfc20` (alert read fix, Apple connect fix) and **the alert lifecycle** (app + API, needs both deployed). Pushed | |

**Production API is 7 commits behind `main`** (photo-link previews, the
Binod/Siddhi rename fix, reserved `admin`/`pwa` slugs). The user will deploy
them soon. Order: API first, then frontend.

---

## Waiting on the user

- **Deploy the API, then the frontend.** The API deploy runs the alert first run
  on production (`2026_10_12_alert_lifecycle_first_run`): it **writes status
  columns on bhumi's and mahalaxmi's `notifications`** — previewed read-only on
  12 Oct, bhumi 2,177 of 2,202 open alerts close, mahalaxmi 717 of 751. Re-run
  `npx tsx backend/src/scripts/alert-first-run-preview.ts --tenant=bhumi,mahalaxmi`
  just before deploying if days have passed. Then the checks under "To verify"
  in BACKLOG.
- Decided 12 Oct: onboarding keeps `vijay@123`; the audit ledger stays hidden
  from firm owners; default passwords on delpat/skyline are ignored (people
  changed their own).
- **Merge `development` → `main`** when convenient (docs and marketing only).
- **webloom / delpat-skills** branches as left on 12 Oct: webloom's walkthrough
  counter fix `fc94993` on `feat/real-estate-crm-page`; delpat-skills
  `feat/natural-pace` unmerged.

---

## Checked this session

- **Production, read only** (`default_transaction_read_only`, one scratch script,
  deleted): every old known issue re-measured; results are the Bugs and Small
  sections of BACKLOG. Notable: bhumi's owner no longer holds the default
  password; the audit chain verifies clean (7 chains, 13,941 rows);
  `lead_retry_due`/`lead_stale_sla` have not fired since 1 Sep / 12 Aug;
  alerts are almost never read (bhumi 6 of 299, mahalaxmi 0 of 463 in 14 days).
- **The user's old note**, item by item against current code: 13 done, 5
  partial, 6 open. Only the open and partial ones are in BACKLOG.
- **Dev database:** the alert lifecycle's columns and first run applied (the
  first-run marker was cleared once and re-run so dev matches what production
  will get: 117 record-less alerts expired). Probe leads `PROBE …` on `delpat`
  and their alerts, deliveries and timeline rows created and deleted by id; one
  probe subscription and one gone-endpoint row likewise. Nothing written to
  production: the first-run preview copies into a TEMP table, switches the
  transaction read-only and rolls back; production's `notifications` still has
  its original 9 columns afterwards.
- **Production, read only:** agents' working hours by hour (night window
  21:00–09:00 IST), and the delivery gaps behind `specs/notifications.md` §1.

---

## Do not repeat

- **The motion-graphics engine is not here.** It is `Delpat-Tech/cutroom`
  (`D:\Work\Delpat\projects\cutroom`, DESIGN.md + HANDOFF.md). This repo keeps
  only `marketing/demo/` (tutorials, snapshot scripts, the demo profile), which
  cutroom will bake from. Do not add film code to `tutorial-videos` or here.
- **Demo recordings and snapshots use `demo-showcase` only**, never a client
  firm; shoot in working hours (Today and Performance count today's activity);
  take the walkthrough straight after a reset (it saves a call). The end
  snapshot once captured "Saving…"; the recorder now waits for the save.
- Dev has demo data on `delpat`: `npm run seed:dev:activity` (three days of
  agent work; `-- --clear` removes it) and `npm run seed:dev:inventory` (19
  flats `p_demo_`, 22 owners `own_demo_`, 4 agreements, 2 leads; `-- --clear`).
  The activity seed does not set `crm_owners.last_call_at`.
- Left on dev because the user converted it: calling row "zeta probe heights"
  (`own_1790258291624_0_7945dd`) and the flat made from it.
- The dev database is shared with the user's own preview testing. Delete only
  your own probe rows, by id.
- Read-only scripts that import `services/store.ts` must set `CRM_NO_BOOT=1`.
- Playwright's WebKit build is not downloaded; phone checks run in Chromium
  with the iPhone 13 descriptor.
- Caddy overwrites `X-Forwarded-Host` on the API box, so `og:url` was removed
  from the share card; do not put it back from the request host.
- Remotion leaves a webpack bundle per render in `%TEMP%`; thirty of them once
  filled `C:`. The installed tutorial-videos deletes them; check `C:` before
  rendering anything.
