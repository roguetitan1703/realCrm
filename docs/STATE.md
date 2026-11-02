# State — where the last session left the system

**Overwritten every session, never appended.** `git log` is the history; this is
the handoff. Only what git cannot tell you belongs here: what is *deployed* (as
opposed to committed), what is waiting on the user, and what was checked against
a live database so the next session neither re-derives it nor assumes it.

The work itself is in `docs/BACKLOG.md`; set-aside work in `docs/PARKED.md`.

**Last session: 2026-11-02.** Release 2 is live on both halves (c440165):
billing bar (overdue only, per-firm warn days), project rename/merge with Undo,
one matching rule for card counts and records, same-number enquiry race fixed,
grouped search on Properties and Calling, compact project rows, one-line desk
tables, no default password (and no forced change for anyone already on it),
callbacks with no time refused by the API and shown "time not set". The
closed-lead booking repair ran once at boot (04:48 UTC): bhumi 23, mahalaxmi 9,
urban 2, delpat 1 cleared; 0 closed leads hold a booking (read-only check).
Nightly backup is live on the EC2 (pg_dump 17.11 from PGDG, production is
Postgres 17.6; first dump 6.0 MB verified; cron 21:00 UTC). Speed work is in
progress on `a-auth-speed` and `b-speed` (WORK-STATE Now).

---

## Deployed

As of 2 Nov 2026, 05:00 UTC:

| | at | how |
|---|---|---|
| Frontend — Vercel | `c440165` (`/version.json` = `c440165282c8`) | promoted by Om |
| Backend — AWS EC2 (`re-api` under PM2) | `c440165` (`/health`) | `npm run deploy:api` on the box, by Om |
| Dev API (`re-api-dev`) | stopped on the box | needs `npm install` before restart |
| `main` | `c440165` | pushed 2 Nov on Om's go |
| `development` | ahead by the backup-script fix (13c4d3d) and work-state | |

---

## Waiting on the user

- **AWS security group:** confirm ports 5000 and 5001 have no inbound rule.
- **`re-api-dev` is stopped:** run `npm install`, then restart it, when the dev
  preview is wanted again.
- **"Call not received → Contacted"** question: open.
- **A one-page what's-new for the firms:** yes or no.
- **Ask Akash** whether the intern's Meta setup is done (Work OS #157).
- **`PLAN.md` §6** questions still open.

---

## Checked this session

- **Production after the deploy, read only (27 Oct):**
  - Migrations applied: `push_subscription_session`,
    `share_events_one_view_per_day`, `phones_e164`,
    `2026_10_12_alert_lifecycle_first_run`.
  - Alert first run closed 3,263 at bhumi (37 open) and 1,233 at mahalaxmi
    (41 open).
  - Phones in E.164: owners bhumi 805 / 1 other, mahalaxmi 3,737 / 0; leads
    bhumi 1,033 / 3, mahalaxmi 547 / 0.
- **Production before the deploy, read only (`BEGIN READ ONLY`, `transaction_read_only = on`; 21 Oct):**
  - Rotas: 0 stale ids at bhumi and mahalaxmi. Strategies: bhumi leads
    round_robin, owners manual, sweeps off; mahalaxmi round_robin both,
    sweeps off. Honouring "Leave unassigned" changes nothing for them.
  - Shortlist bug: never fired. `auth_otp`: never held a row.
  - Phone repair dry run (final reader, 21 Oct): bhumi users 1 / leads 4 /
    owners 52 / property owner phones 55; mahalaxmi 3 / 1 / 6 / 7. Left as
    they are: bhumi 11, mahalaxmi 14. User collisions 0; owners on one number
    after it: bhumi 10, mahalaxmi 6.
  - Imports (21 Oct): bhumi 2 owner imports (1,271 owners), mahalaxmi 7
    (3,731; 1,034 worked by a person) plus 4 uploads never run; no lead or
    property imports. Every batch still holds what it added: the batch-delete
    endpoint was never used. The only undo ever was our own, 7 Aug, 494 bhumi
    leads, archived first.
  - No `crm_share_*`, `crm_buyer_asks` or `crm_job_runs` tables yet, so the
    first 180-day view cleanup deletes nothing.
- **Dev database** (`delpat`): final walk of f05dc8d on iPhone 13 and desk:
  links, the three forms, catalogue, one alert per arrival, "Replace it", a
  stranger cannot move a visit, greyed rota members, "Not stated" bar, phones,
  import + undo ("Undone · 1 kept"), one reset mail per 10 minutes, OTP 410.
  The Edit-owner picker fix (f28f5fb) was not driven in a browser. Probe rows
  removed and counted; 61 audit rows stay (hash-chained); 3 properties'
  `updated_at` moved. The 349 owners a probe sweep moved off Mohit are back,
  rota indices reset.

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
- **Read-only means `sql.begin('READ ONLY', …)`.** The pooler drops the
  `default_transaction_read_only` startup parameter (shown on dev, 20 Oct: a
  write went through). Every earlier production read was plain SELECTs.
- `DEV_DATABASE_URL` and `JWT_SECRET` are in `.env`, not `.env.development`;
  a scratch script reading only the latter connects to localhost and gets
  ECONNRESET.
- No Playwright browser is downloaded on this machine: launch with
  `chromium.launch({ channel: 'msedge' })` and the iPhone 13 descriptor.
- `npm run build` needs `VITE_API_URL` set locally (no production env file
  here): `VITE_API_URL=http://localhost:5001 npm run build`.
- Caddy overwrites `X-Forwarded-Host` on the API box, so `og:url` was removed
  from the share card; do not put it back from the request host.
- Remotion leaves a webpack bundle per render in `%TEMP%`; thirty of them once
  filled `C:`. The installed tutorial-videos deletes them; check `C:` before
  rendering anything.
