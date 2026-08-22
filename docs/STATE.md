# State

Where the system actually is, right now. **Overwritten every session, never
appended** — the moment this grows a history it becomes a third document nobody
finishes, and `git log` is already the history.

What belongs here is only what git cannot tell you: what is *deployed* (as
opposed to committed), what is waiting on the user, and what was checked
against the live database so the next session neither re-derives it nor assumes
it.

---

## Deployed

| | at | when |
|---|---|---|
| Frontend — Vercel, automatic on push to `main` | `1aed7e2` | 2026-08-19 |
| Backend — AWS, **by hand**, port 5000 | `1aed7e2` | 2026-08-19 |

**Nothing from 2026-08-19→22 is deployed.** Twenty-two commits sit on the
`development` branch, unpushed, plus the two from the 22nd's outage below. The
live desk is running the 19th's code.

### The API was down for eight hours on 2026-08-22 — 06:45 to 14:38 UTC

Supabase terminated the pool's connections (`57P01`, admin command — their
maintenance, not ours). One rejection had no handler, and Node exits on an
unhandled rejection, so the process died. **PM2 did not restart it and the user
restarted by hand eight hours later.**

Why PM2 was blind, from `pm2 describe re-api`: production runs
`npm run dev:backend` → **`tsx watch backend/src/index.ts`**. `tsx watch`
survives its child crashing by design; npm survived because the watcher did;
PM2 reported `online` throughout. Autorestart was never broken — `restarts: 53`
proves it fires — nothing PM2 watched had exited.

The database was never wrong: `dev:backend` sets no `APP_ENV`, so `appEnv()`
returned `local` and `databaseUrl()` fell through to `DATABASE_URL`. But
`.env.production` was therefore never loaded and `assertEnvMatchesDatabase()`
ran as a warning — **the wrong-database guard has been off in production since
it was written.**

Fixed on `development`, both unverified in production because they cannot be:

- `backend/src/index.ts` — `unhandledRejection` / `uncaughtException` handlers.
  A connection fault logs and stays up (postgres.js reconnects); anything else
  still `exit(1)`s so a supervisor can act. Verified in the development
  environment by terminating 11 in-flight connections: the API kept serving.
- `ecosystem.config.cjs` — **new, committed so the start command stops living
  only inside one box's PM2 daemon.** Runs `node --import tsx
  backend/src/index.ts` as one process, so PM2's pid is the API's pid. Sets
  `APP_ENV=production`, `watch:false`, backoff, `min_uptime`, `time`.

**Cost, measured:** `webhook_inbox` is inbox-first, so nothing that *arrived*
was lost — 4 of 4 pushes on the 22nd parsed, nothing pending or failed, and
`ingest_rejects` empty for three days. But the last push was 06:00:36 UTC and
the next was after the restart. Against the previous 14 days' hourly profile,
**~11 bhumi enquiries hit a closed socket between 11:30 and 20:15 IST** — the
desk's busiest window. There is no record of any of them anywhere: a push that
never lands writes no inbox row. Recovery is only from the portal dashboards.

### Development environment — up, and not deployed anywhere

A second Supabase project (`hziiyelgcfsgokdegicd`, ap-northeast-1) separate from
production (`zxdidrhhqtxepyhkging`, ap-southeast-1).

**2026-08-22: dev is now a copy of production MINUS bhumi.** The synthetic seed
was too thin to test against — it wrote lead rows and nothing else, so every
screen but Leads rendered against empty tables. `db-backup.sh --cron` dumped
production (read-only, 1.6M) and the dump was restored over dev's `public`
schema, then bhumi was removed.

**bhumi is not on dev and must not be put there.** Removed after the restore:
290 leads, 1,712 timeline events, 811 notifications, 334 webhook_inbox payloads,
310 enquiries, 8 users, 8 agents, 4 integrations, 2,446 audit rows, the tenant
row, and the three `archive_bhumi_*` tables dropped (517 + 1,512 + 650). A
sweep of every text/jsonb column found 285 remaining mentions of the word, all
on **delpat's own rows** — 128 properties whose builder is "Bhumi Developers",
4 imported timeline notes, 1 failed-login audit row, and 11 `ingest_rejects`
naming the path `/api/v1/ingest/bhumi` (metadata only, no body is stored for an
unauthenticated push). No bhumi-tenant row remains.

**`push_subscriptions` and `sessions` were emptied on dev deliberately.** `.env`
is shared between the two environments — same VAPID, same SMTP, same R2 — so a
sweep running on the dev backend would otherwise push to real phones and mail
real addresses. Do not restore them.

Dev now holds: `delpat` 94 leads, `raipur` 46, `urban` 46, `skyline-realty` 12;
26 of 28 tables matched production row-for-row before bhumi was removed.

**The dump on disk still contains bhumi** — `backups/realcrm_prod_20260822_215649.sql.gz`.
It is a real production backup and `backups/` is gitignored; delete it or keep
it deliberately.

**Signing in:** `npm run seed:dev:login` provisions the `delpat` tenant and
`akashpatel` / `00000000` on the DEVELOPMENT database — the user's own org,
synthetic end to end. The script refuses to run if the URL it resolved names the
same Supabase project as `DATABASE_URL`. `seed-dev.ts` gave its four agents
global ids (`u_dev_pr`), so seeding a second tenant silently created nobody and
still printed "Created 4"; ids are per-tenant now and the count is read back
from the database.

```bash
npm run dev:api          # development db, :5001, watch
npm run dev:api:prod     # production db, :5000, watch — deliberately
npm run start:api:dev    # development db, :5001 (EC2, on demand)
npm run seed:dev -- --tenant=delpat --n=200
npm run seed:dev:login   # delpat / akashpatel / 00000000, development db only
npm run build            # production mode      npm run build:dev
npm run deploy:dev       # build:dev + vercel deploy --prebuilt
```

`APP_ENV` is `production` | `development`; `development` selects
`DEV_DATABASE_URL` and refuses to fall back. Config is `.env` (shared secrets)
plus `.env.<APP_ENV>`; **none of the three is committed any more.**

---

## Waiting on the user

- **`VITE_API_URL` must be set in Vercel's Production environment.**
  `.env.production` was committed and no longer is, so the next production build
  **will fail** — deliberately, with the fix in the message. This is the one
  thing that breaks a deploy if forgotten.
- **Port 5001 needs a public URL** before a Vercel preview can be isolated.
  `.env.development` points at `http://localhost:5001`, which a Vercel build
  cannot reach. Until then a preview build talks to whatever `VITE_API_URL`
  says — and if that is production, the environment marker will say PRODUCTION,
  which is the truth and the warning.
- **Switch PM2 onto `ecosystem.config.cjs`, and NOT with `deploy.sh`.**
  `dev:backend` does not exist on `development`, so after the merge
  `pm2 restart re-api` runs a missing script and the API does not come back.
  Once, by hand:
  ```bash
  cd ~/realestate && git pull origin main && npm install
  pm2 delete re-api && pm2 start ecosystem.config.cjs && pm2 save
  pm2 logs re-api --lines 30
  ```
  The proof is the boot banner: it must read `🟢 PRODUCTION · port 5000 · db
  zxdid…`, not `local`. That also closes the old `APP_ENV=production` item —
  it is declared in the config now instead of typed from memory. Note that
  `assertRequiredConfig()` becomes fatal rather than advisory, so a first start
  can refuse; the message names the variable.
  After this, `deploy.sh` works unchanged.
- **`PUBLIC_API_URL` is not set locally** and the push delivery receipts need
  it. Without it the log stops at `sent` and never reaches `displayed`.
- **The going-cold metric is undecided.** Measured on bhumi: "never contacted"
  is 74, of which 26 carry remarks proving contact ("Visit done I will show
  another options tomorrow"). Open + never contacted + past 48h is 38; of those
  12 have no remark at all and 2 have nothing but a creation event. The proposal
  is *going cold = open + nothing recorded for N days*, N being `reminderDays`
  (today a control that changes nothing), which gives 53 at 7 days and 143 at
  48h. Nothing has been changed.
- **Manager deletes.** The user's model is that a manager is owner-equivalent
  minus billing; the server refuses manager deletes (`canDeleteRecord` is
  owner/admin/superadmin). The client now agrees with the server. Widening it is
  a deliberate change to both sides.
- **Whether to rename the branch** — it is `development`, matching everything
  else.

---

## Not verified, and it matters

**The Leads filter refactor HAS now been driven in a browser** (2026-08-22,
Playwright, `delpat` on the development database, 200 seeded leads, 1440x900).
All five stated invariants hold:

| | result |
|---|---|
| Filter is written to the URL and filters the rows | `?screen=leads&seg=noanswer_stale` → 27 of 200 |
| The active filter is on a control you can see | segment pill `segpill` → `segpill on` |
| Opening a record keeps the filter underneath it | back returns to `&seg=noanswer_stale` |
| A filter change REPLACES the history entry | `history.length` constant at 6 over three filter changes; one Back leaves the screen |
| A sidebar item is a fresh arrival and clears filters | `?screen=leads`, 200 rows |
| A filtered list survives being sent to someone | same URL in a new tab → the same 27 rows |

Two smaller things found while driving it, neither fixed:

- **Page size is not in the URL bag.** Set 100/page, open a record, come back:
  it is 20 again. Same shape as the filter rule — screen state that cannot
  survive the list unmounting — but it is a page size, not a filter.
- **Sidebar items are `<a>` with no `href`, and the segment pills carry no
  `aria-pressed`.** The active segment is communicated by class alone, so the
  nav is not reachable by keyboard as a link and the active filter is invisible
  to a screen reader. Not a regression from this refactor.

Nothing else from this session has been clicked.

**The crash guard was never fired by a real 57P01.** The failure could not be
reproduced locally: production connects direct (`db.<ref>.supabase.co`), which
is what Supabase drops on maintenance, while `DEV_DATABASE_URL` goes through
`pooler.supabase.com`, which absorbs it. What was verified is that the API
survives its connections being terminated mid-query, and that the handler
classifies a 57P01-shaped error as recoverable and an ordinary Error as a bug.
The rejecting promise in production was one postgres.js creates for itself on
reconnect — its stack carried none of the origin frames a `sql` call site adds —
so no call-site `try/catch` could have caught it. **Pointing production at the
pooler too is a second, independent mitigation and has not been done.**

Service workers are production-only, so the alerts prompt, the ack loop and
`pushsubscriptionchange` cannot be seen locally at all — they need a real HTTPS
origin. `vite preview` cannot show them either: `/<slug>/sw.js` is a rewrite
that lives in `vercel.json`, and nothing local honours it.

---

## Verified against the live database this session

Stated so it is not re-derived, and not trusted past its date.

- **Push works; reach does not.** 6 of 18 non-bhumi endpoints accepted a real
  push, 12 returned 410. Of bhumi's 7 agents, **4 have no subscription at all** —
  Anil Dangi, Mukesh Goswami, Ravish Singh, Vinod Goswami — so 6 of one day's 15
  push-flagged alerts were undeliverable before they were sent. The three with
  subscriptions (Binod, Amit, Mohit) have endpoints that survived four sends, so
  those are being accepted.
- Mukesh has **3 live sessions** (2 Windows Chrome, 1 iPhone Safari) and 6
  unread feed rows. The in-app notification exists; only the push is missing. An
  iPhone in Safari cannot receive web push at all unless installed.
- **`lead_new` does not push, by design** — 6 of bhumi's alerts that day were
  feed-only for the owner. Matrix in `docs/specs/notification-delivery.md`.
- **Enquiry counter works**: 304 enquiry rows over 280 bhumi leads, 15 with more
  than one. **3 rejected leads have enquired again** (reasons: "No Requirement"
  ×2, "Already purchased / rented"), one of them three times.
- **The Assignments tab count and its list disagree** — bhumi reads 276 and
  opens onto 290 rows. Parked, one-line fix, see `docs/PARKED.md`.
- **`crm_leads.updated_at` existed only in `migrations/010`**, which nothing
  runs. Production had it by hand; a fresh database did not, and the idle sweep,
  retry sweep and going-cold segments all read it. Now in `initSchema`. Found by
  diffing the two environments — one column of drift across 28 tables.
- **The production schema was changed from this machine**, additively:
  `push_deliveries` created, `push_subscriptions` gained `user_agent` and
  `last_success_at`. Zero rows written. The deployed backend ignores them until
  it is updated.
- Roles in the database are only `owner`, `manager`, `agent` — **no `admin` row
  exists anywhere**. bhumi has 7 agents and 1 owner, no managers. delpat has 2
  managers, raipur and urban 1 each.
- **bhumi's `slaHours` is unset**, so the untouched sweep runs at the 24h
  default and escalates at 48h.

---

## Watch after the next deploy

- **Push subscriptions rebuild once per device** when a device next loads the
  app. A device that stays silent did not re-subscribe.
- **The alerts prompt is a new overlay** at the top of every screen when a
  browser has no subscription. Dismissible, silent for 7 days per workspace.
- **The delivery log starts recording** the moment the backend is updated. Read
  it with `npx tsx backend/src/scripts/push-delivery-report.ts --tenant=bhumi`,
  which is read-only and safe on bhumi.
- **Filters now live in the URL.** A filtered list is a link; back leaves the
  screen rather than walking through filter states; opening a record keeps the
  filter underneath it.
