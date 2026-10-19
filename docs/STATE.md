# State — where the last session left the system

**Overwritten every session, never appended.** `git log` is the history; this is
the handoff. Only what git cannot tell you belongs here: what is *deployed* (as
opposed to committed), what is waiting on the user, and what was checked against
a live database so the next session neither re-derives it nor assumes it.

The work itself is in `docs/BACKLOG.md`; set-aside work in `docs/PARKED.md`.

**Last session: 2026-10-19 → 20.** The catalog (Work OS #131, spec
`specs/listing-pages.md` §A) was built end to end by two builders, reviewed
four times and walked fresh twice. On the way: work goes only to people who
can take it; "Leave unassigned" is honoured; list rows no longer overwrite a
lead's shortlist. All on `development`, nothing deployed.

---

## Deployed

Not re-read this session; as of 17 Oct:

| | at | how |
|---|---|---|
| Backend — AWS EC2 (PM2 runs prod and dev) | `78458b6` (5 Oct) | `scripts/deploy-api.sh` on the box, `main` only |
| Dev API (`api.dev.re.delpat.in`) | `0eb1c5c` — far behind `development` | pull + `npm i` + `pm2 restart re-api-dev` |
| `main` | `820514e` (6 Oct) | |
| `development` | `cf81d05` and the doc commit after it | |

---

## Waiting on the user

- **Yes/no on two read-only production runs**, which gate any release of
  `development`:
  1. `npx tsx --env-file=.env backend/src/scripts/stale-rota-ids.ts` — dead
     ids on each firm's rotas, and each firm's saved strategies. A saved lead
     `strategy='manual'` was never read before; it now leaves leads unassigned
     and stops the lead sweeps. If bhumi or mahalaxmi have it, they change.
  2. Phone formats per tenant (the script was in a scratchpad and is gone;
     rewrite it read-only: messy phones in leads/owners/users, lead pairs newly
     matching on the last 10 digits).
- **Re-test on the dev preview** (dev API must be redeployed first), then the
  release. Re-run `alert-first-run-preview.ts` the morning of the deploy.
- **`PLAN.md` §6** questions still open (Q1 and Q5 answered 19 Oct).
- Decided 12 Oct and still standing: onboarding keeps `vijay@123`; the audit
  ledger stays hidden from firm owners.

---

## Changes a paying firm will notice on deploy

- Rota members who cannot take work (suspended, no login, left) are skipped,
  and Settings → Assigning shows them greyed with Remove.
- A saved "Leave unassigned" takes effect (leads and owners), and the desk
  gets `lead_unrouted`.
- Routing settings save for owner/manager only; strategies round_robin/manual.
- Typed and imported lead/owner phones store +91…; foreign numbers stay as
  typed. Staff numbers still use `normalizePhone` (BACKLOG Small).
- `crm_share_events` gains `view_day` + a unique index (runOnce) and `seen_at`.
- The lead and property list endpoints stop sending timeline/shortlist/history.
  The browser guards against the old API too, so the order of deploys is safe.

---

## Checked this session

- **Dev database** (`delpat`): builders' scenario probes (A: 28/28 and 10/10
  on the last round), two fresh-eyes walks on iPhone 13 and desk, a merged-API
  smoke on :5131 (paged list rows carry no shortlist/history; a full lead's
  shortlist matches `lead_shortlist`; routing reads `manual`). Every probe row
  removed by id; audit_log rows stay (hash-chained). delpat's lead strategy is
  `manual` with the sweep on — it was so before.
- **Production:** nothing read this session.

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
