# State — where the last session left the system

**Overwritten every session, never appended.** `git log` is the history; this is
the handoff. Only what git cannot tell you belongs here: what is *deployed* (as
opposed to committed), what is waiting on the user, and what was checked against
a live database so the next session neither re-derives it nor assumes it.

The work itself is in `docs/BACKLOG.md`; set-aside work in `docs/PARKED.md`.

**Last session: 2026-10-12** (second session that day): picked up the handover,
triaged the user's old running note against the code, re-measured every old
known issue on production, and restructured the docs into STATE / BACKLOG /
PARKED. No app behaviour changed.

---

## Deployed

| | at | how |
|---|---|---|
| Backend — AWS EC2 (one box, PM2 runs prod and dev) | **`78458b6` (5 Oct)**, read from `/health` 12 Oct | `scripts/deploy-api.sh` on the box, `main` only |
| Frontend — Delpat's Vercel | not read; Branch Tracking is OFF, the user deploys by hand | |
| Dev API (`api.dev.re.delpat.in`) | **stopped by the user** (12 Oct) | |
| `main` | `820514e` (6 Oct) | |
| `development` | ahead of `main` by marketing/demo and docs commits only — **no app code**. Pushed | |

**Production API is 7 commits behind `main`** (photo-link previews, the
Binod/Siddhi rename fix, reserved `admin`/`pwa` slugs). The user will deploy
them soon. Order: API first, then frontend.

---

## Waiting on the user

- **Deploy the API**, then the two checks under "To verify" in BACKLOG.
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
- Nothing written to any database.

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
