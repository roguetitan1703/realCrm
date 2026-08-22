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
`development` branch, unpushed. The live desk is running the 19th's code and is
stable; every fix below is waiting.

### Development environment — up, and not deployed anywhere

A second Supabase project (`hziiyelgcfsgokdegicd`, ap-northeast-1) separate from
production (`zxdidrhhqtxepyhkging`, ap-southeast-1). Schema built, demo tenant
`skyline-realty` created, seeded with **150 synthetic leads across 4 agents, 56
unassigned**. No production row was copied and none should be — bhumi's leads
are real people.

```bash
npm run dev:api          # development db, :5001, watch
npm run dev:api:prod     # production db, :5000, watch — deliberately
npm run start:api:dev    # development db, :5001 (EC2, on demand)
npm run seed:dev -- --n=400
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
- **Set `APP_ENV=production` on the live 5000 process.** It warns without it and
  still runs; setting it arms the mismatch check.
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

**No UI change from this session has been clicked.** There are no test
credentials in this environment, so nothing behind a login was driven. Build is
green, the URL layer was tested directly, backend routes were curled, but the
Leads filter refactor touches the most-used screen in the product and has never
been rendered in a browser.

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
