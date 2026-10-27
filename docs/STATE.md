# State — where the last session left the system

**Overwritten every session, never appended.** `git log` is the history; this is
the handoff. Only what git cannot tell you belongs here: what is *deployed* (as
opposed to committed), what is waiting on the user, and what was checked against
a live database so the next session neither re-derives it nor assumes it.

The work itself is in `docs/BACKLOG.md`; set-aside work in `docs/PARKED.md`.

**Last session: 2026-10-27.** Release 1 is live: the catalog (Work OS #131,
`specs/listing-pages.md` §A), the alert lifecycle, Performance 7/30 days,
the phone model (E.164), code sign-in retired, the import undo and the retired
batch delete. The API crash-looped once on a missing `libphonenumber-js`
install; `scripts/deploy-api.sh` now checks `npm ls` and installs. What the
firms notice: `releases/2026-10-13.md` and `releases/2026-10-20.md`. #131 and
#132 (Performance range) are Done in Work OS.

---

## Deployed

As of 27 Oct 2026:

| | at | how |
|---|---|---|
| Frontend — Vercel | `a036eb4` (27 Oct) | `main` = `origin/main` |
| Backend — AWS EC2 (`re-api` under PM2) | `45a68f6` (27 Oct) | `scripts/deploy-api.sh` on the box, by hand |
| Dev API (`re-api-dev`) | stopped on the box | needs `npm install` before restart |
| `main` | `a036eb4` | |
| `development` | `a036eb4` + `570fd23` (work-state) | ahead by docs only |

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
