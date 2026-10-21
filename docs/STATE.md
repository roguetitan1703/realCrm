# State — where the last session left the system

**Overwritten every session, never appended.** `git log` is the history; this is
the handoff. Only what git cannot tell you belongs here: what is *deployed* (as
opposed to committed), what is waiting on the user, and what was checked against
a live database so the next session neither re-derives it nor assumes it.

The work itself is in `docs/BACKLOG.md`; set-aside work in `docs/PARKED.md`.

**Last session: 2026-10-19 → 21.** The catalog (Work OS #131,
`specs/listing-pages.md` §A, §A.6) is complete on `development` (f28f5fb):
shared links, the public catalogue, the three buyer forms, work only to people
who can take it, the phone model (E.164), code sign-in retired, the import
undo and the retired batch delete. Every merge was reviewed; a final walk on
dev (phone and desk) found no blocker and its two bugs are fixed. What the
firms will notice and the deploy order: `releases/2026-10-20.md`. Nothing
deployed.

---

## Deployed

Not re-read this session; as of 17 Oct:

| | at | how |
|---|---|---|
| Backend — AWS EC2 (PM2 runs prod and dev) | `78458b6` (5 Oct) | `scripts/deploy-api.sh` on the box, `main` only |
| Dev API (`api.dev.re.delpat.in`) | `0eb1c5c` — far behind `development` | pull + `npm ci` + `pm2 restart re-api-dev` |
| `main` | `820514e` (6 Oct) | |
| `development` | `f28f5fb` (21 Oct) | |

---

## Waiting on the user

- **Redeploy the dev API, re-test on the dev preview,** then the release
  (`releases/2026-10-20.md`: API first, `npm ci`, read the boot log, then the
  frontend). Re-run the phone dry run and `alert-first-run-preview.ts` the
  morning of the deploy.
- **AWS security group:** ports 5000 and 5001 must have no inbound rule.
- **A hotfix off `main`** for the two live holes (code sign-in; any agent
  deleting an import batch): yes or no. Recommended no if the release goes
  within days; neither was ever used in production (21 Oct).
- **`PLAN.md` §6** questions still open.

---

## Checked this session

- **Production, read only (`BEGIN READ ONLY`, `transaction_read_only = on`):**
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
