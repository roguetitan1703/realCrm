# State — where the last session left the system

**Overwritten every session, never appended.** `git log` is the history; this is
the handoff. Only what git cannot tell you belongs here: what is *deployed* (as
opposed to committed), what is waiting on the user, and what was checked against
a live database so the next session neither re-derives it nor assumes it.

The work itself is in `docs/BACKLOG.md`; set-aside work in `docs/PARKED.md`.

**Last session: 2026-10-15 → 17.** Om's dev-preview testing turned into one
update (hand-over alerts, working hours, two tab rows, follow-up Done from
Today, Performance over a range on `specs/performance.md`, legal pages); then a
read-only usage snapshot of both paying firms (`usage-2026-10-17.md`) and a
plan written from it by Fable (`PLAN.md`). BACKLOG and PARKED now follow the
plan.

---

## Deployed

| | at | how |
|---|---|---|
| Backend — AWS EC2 (one box, PM2 runs prod and dev) | **`78458b6` (5 Oct)**, read from `/health` 17 Oct | `scripts/deploy-api.sh` on the box, `main` only |
| Dev API (`api.dev.re.delpat.in`) | **`0eb1c5c`**, read 17 Oct — behind `development`; pull + `npm i` + `pm2 restart re-api-dev` before re-testing | |
| Frontend — Delpat's Vercel | not read; the user deploys by hand | |
| `main` | `820514e` (6 Oct) | |
| `development` | `main` + 45 commits, nothing on `main` missing from it | |

---

## Waiting on the user

- **Re-test on the dev preview**, then Release 1 (`releases/2026-10-13.md`):
  `development` → `main` (fast-forward), API first, then frontend. Re-run
  `alert-first-run-preview.ts` the morning of the deploy — last run 16 Oct:
  bhumi 2,284 of 2,308 close, mahalaxmi 1,014 of 1,021.
- **The eight questions in `PLAN.md` §6** (help desk, price, the one-tap
  contact question, visit proof, catalog scope, bhumi's Meta verification,
  usage notes to owners, the deploy window).
- **Work OS is not linked to this repo** (`get_project` by remote: unmatched;
  the project is "Real Estate CRM"). Work OS #102 says delpat.in; the legal
  pages are on realestate.delpat.in, undeployed. Not changed — Om's call.
- Decided 12 Oct and still standing: onboarding keeps `vijay@123`; the audit
  ledger stays hidden from firm owners.

---

## Checked this session

- **Production, read only** (one scratch script, deleted): the usage snapshot,
  18 Aug – 16 Oct, both firms; and the alert first-run preview (above).
- **Dev database** (`delpat` only): working hours set to 10 and back to 9–21
  through the UI; a race probe lead `TEST 96 · race` (three Done saves at once →
  one Completed row) created and deleted by id; builders' probe leads deleted
  by id. Om's TEST 1–6 cases from 13 Oct are still there on purpose.

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
- No Playwright browser is downloaded on this machine: launch with
  `chromium.launch({ channel: 'msedge' })` and the iPhone 13 descriptor.
- `npm run build` needs `VITE_API_URL` set locally (no production env file
  here): `VITE_API_URL=http://localhost:5001 npm run build`.
- Caddy overwrites `X-Forwarded-Host` on the API box, so `og:url` was removed
  from the share card; do not put it back from the request host.
- Remotion leaves a webpack bundle per render in `%TEMP%`; thirty of them once
  filled `C:`. The installed tutorial-videos deletes them; check `C:` before
  rendering anything.
