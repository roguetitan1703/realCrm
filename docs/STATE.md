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

**Nothing from 2026-08-19 onwards is deployed.** The `development` branch is
that far ahead: the 22nd's outage fixes, the Leads filter refactor, and desk
rework steps 1–3. The live desk is running the 19th's code.

---

## A migration ran against production this session. Read this first.

**`2026_08_23_enquiry_payloads_v3` was applied to the production database at
01:00:49 UTC on 2026-08-23** — not deliberately. A backend started with
`npm run dev:api:prod` runs `tsx watch` against the **production** database, and
it restarted on an edit to `store.ts`, which ran the boot migration chain. Two
lessons, neither optional:

- **A `runOnce` gate added on this machine reaches production the moment a
  watcher restarts**, months before the code is deployed. Adding one is a
  production write.
- **The dev watcher and the prod watcher were both running**, so the same
  rebuild raced itself on development and left sessions claiming 8 payloads over
  6 lines. `runOnce` is not concurrency-safe across two processes.

**What it did, measured read-only afterwards.** The rebuild only writes
`crm_lead_enquiries`; no lead, timeline row or notification was touched.

| | bhumi | delpat |
|---|---|---|
| Enquiry sessions | 315 over 290 leads | 68 over 67 leads |
| Payload rows now stored | 332 | 83 |
| Sessions whose count disagrees with its own payload list | **0** | 0 |
| Sessions with duplicated delivery references | **0** | 0 |
| Inbox pushes carrying a lead | 333 | 83 |
| Of those, belonging to no session | **0** | 0 |
| Leads that have enquired more than once | **21** | 1 |

Nothing was lost: every one of bhumi's 333 lead-bearing pushes still holds a
`raw_body` (the 30-day purge has not run), so the rebuild was replayable end to
end, and the one push that is not a payload is the enquiry id a portal delivered
three times. The production run was single and unraced; the corrupted counts
were only ever on development, and the clone below replaced them.

**The deployed backend (the 19th's code) does not read the `payloads` column**,
so the live desk is unaffected until the merge.

---

## The desk rework — A to H

The client walked through eight areas line by line on 22–23 Aug. Every decision,
and the order they have to be built in, is **`docs/specs/desk-rework.md`** — that
file is the one to read before touching leads, and its ledger is what says where
the build has got to. Three of seven steps are done, all on `development`, none
deployed.

| # | Step | State |
|---|---|---|
| 1 | Contact predicate + segment catalogue | done — `19287fb` |
| 2 | Facet counts + filter controls | done |
| 3 | The enquiry model | done |
| 4 | Timeline and reopening | next |
| 5 | Settings | todo |
| 6 | WhatsApp templates | todo |
| 7 | This device | todo |

**What changed on the desk so far.** "Past SLA" is deleted. Contact now means
anything a **person** did, which moves not-contacted from 83 to 7 on the live
desk. `reminderDays`, a Settings control nothing read, drives Going cold. Every
count beside the leads list is computed under the active filters, each facet
excluding its own dimension, and Agent sits beside Type and Status.

Step 3 added the **payloads** a session was made of — the record shows the
sitting and the enquiries inside it, Details accumulates (all sources, all
configs, every project, the budget span, first received **and** last enquiry),
the list's time column is Last enquiry, and the match percentage is gone from
the record, the attach dialog and the WhatsApp composer.

**`docs/specs/repeat-enquiries.md` is deleted.** It was the older draft, and its
§8b ("a rejected lead is never reopened automatically") contradicted desk-rework
**E**, which is the client's later decision. `desk-rework.md` §2 and C carry
everything still true, and the three code comments that cited the old file now
cite this one.

**Source is attribution.** `crm_leads.source` says where the lead arrived and is
never overwritten; the enquiry rows carry every source it has since come through,
and the record sheet shows the arrival plus the rest. The Source column and its
filter both read the arrival column, so the count and the rows it opens cannot
disagree. Settled with the user 23 Aug — do not reopen it.

---

## Development environment

A second Supabase project (`hziiyelgcfsgokdegicd`, ap-northeast-1) separate from
production (`zxdidrhhqtxepyhkging`, ap-southeast-1). It holds a copy of
production **minus bhumi**: `delpat` 293 leads, `raipur` 46, `urban` 46,
`skyline-realty` 12.

**bhumi is not on dev and must not be put there.** `push_subscriptions` and
`sessions` are deliberately empty — `.env` is shared between the two
environments (same VAPID, same SMTP, same R2), so a sweep on the dev backend
would otherwise push to real phones. Do not restore them.

**delpat's leads are a SHAPE CLONE of the live desk** —
`backend/src/scripts/shape-clone-to-dev.ts --write`, re-run this session so the
sessions carry their payloads. Dev now mirrors production: 314 sessions, 331
payloads, 21 leads that have enquired more than once, every count equal to its
own list. Re-run it whenever a change touches what the desk counts or shows.

Two things found while re-running it, both fixed: the scrubber rewrote **ISO
instants** (`2026-08-22T…` matches its phone pattern) so every payload line lost
its time; and the clone deletes and rewrites delpat's leads, which orphans the
83 rows in dev's `webhook_inbox` that pointed at the previous generation. Those
orphans are harmless but a future backfill on dev would rebuild sessions for
lead ids that no longer exist.

**The dump on disk still contains bhumi** —
`backups/realcrm_prod_20260822_215649.sql.gz`. `backups/` is gitignored; delete
it or keep it deliberately.

**Signing in:** `npm run seed:dev:login` provisions `delpat` and `akashpatel` /
`00000000` on the DEVELOPMENT database. The script refuses if the URL it
resolved names the same Supabase project as `DATABASE_URL`.

```bash
npm run dev:api          # development db, :5001, watch
npm run dev:api:prod     # PRODUCTION db, :5000, watch — see the warning above
npm run start:api:dev    # development db, :5001 (EC2, on demand)
npm run seed:dev -- --tenant=delpat --n=200
npm run build            # production mode      npm run build:dev
npm run deploy:dev       # build:dev + vercel deploy --prebuilt
```

---

## Waiting on the user

- **`VITE_API_URL` must be set in Vercel's Production environment.**
  `.env.production` is no longer committed, so the next production build **will
  fail** — deliberately, with the fix in the message. This is the one thing that
  breaks a deploy if forgotten.
- **Switch PM2 onto `ecosystem.config.cjs`, and NOT with `deploy.sh`.**
  `dev:backend` does not exist on `development`, so after the merge
  `pm2 restart re-api` runs a missing script and the API does not come back.
  Once, by hand:
  ```bash
  cd ~/realestate && git pull origin main && npm install
  pm2 delete re-api && pm2 start ecosystem.config.cjs && pm2 save
  pm2 logs re-api --lines 30
  ```
  The proof is the boot banner: `🟢 PRODUCTION · port 5000 · db zxdid…`, not
  `local`. `assertRequiredConfig()` becomes fatal rather than advisory, so a
  first start can refuse; the message names the variable. After this,
  `deploy.sh` works unchanged.
- **Port 5001 needs a public URL** before a Vercel preview can be isolated.
  Until then a preview build talks to whatever `VITE_API_URL` says.
- **`PUBLIC_API_URL` is not set locally** and the push delivery receipts need
  it. Without it the log stops at `sent` and never reaches `displayed`.
- **Manager deletes.** The user's model is that a manager is owner-equivalent
  minus billing; the server refuses manager deletes. Widening it is a deliberate
  change to both sides.
- **Whether to rename the branch** — it is `development`.

---

## Not verified, and it matters

**Step 3 was driven in a browser twice** (2026-08-23, Playwright, `delpat` on
the development database, the 293-lead shape clone, 1440×900 and iPhone 13).

The second pass exists because the first was shallow: `latest +N` had been
applied to the record header only, so the card and the desk list still printed
two projects with no separator. On a lead carrying three, the list row now reads
`3 BHK · Buy · Mahalunge · Up to ₹95L · VTP Belair +2`, the sheet all three in
arrival order, and **Save changes with nothing typed leaves the stored
three-element list intact** — it used to flatten to one string, which is the only
data-losing defect found in this step. Only `req.interest` is ever a list on a
lead row (3 leads on dev, the same shape on bhumi); config, locality and deal
stay scalar by `mergeRepeatReq`'s design.

First pass: a lead with 2 sessions over 5 payloads rendered 2 sessions and 5
lines; the badge read `2 enquiries`; Details read Attribution Source `99acres, Property Circle` ·
Config `2 BHK, 3 BHK` · Property Interested `Godrej Green Vistas, Godrej Green
Cove` · Budget To `₹95L` · First received `16 Aug, 10:17 pm` · Last enquiry
`Yesterday, 11:28 pm`. The Came back segment opened 20 rows, every one carrying
its repeat badge. No `% match` and no `N listings` anywhere on the list or the
record. On the phone all five payload lines sat inside 390px and the body did
not scroll sideways. No console errors in any pass.

**Steps 1 and 2 were driven in a browser** (2026-08-23). Unfiltered the pills
read All 293 · Today 1 · Not contacted 7 · No reply 65 · Going cold 142 ·
Follow-up overdue 8 · Came back 21, and the dashboard tiles read the same
numbers from the same expressions. One agent (95 leads) moved every number with
it while the Agent control held its own full counts; adding `going_cold`
narrowed the status counts to 51, which summed. List total and summary total
agreed at every step.

**The Leads filter refactor was driven in a browser** (2026-08-22). Filters are
in the URL, a filtered list survives being sent to someone, opening a record
keeps the filter underneath it, a filter change replaces the history entry, and
a sidebar item clears them.

Two smaller things found then, neither fixed: **page size is not in the URL
bag**, and **sidebar items are `<a>` with no `href` while the segment pills
carry no `aria-pressed`** — the active filter is invisible to a screen reader.

**The crash guard was never fired by a real 57P01.** Production connects direct
(`db.<ref>.supabase.co`), which is what Supabase drops on maintenance, while
`DEV_DATABASE_URL` goes through the pooler, which absorbs it. What was verified
is that the API survives its connections being terminated mid-query. **Pointing
production at the pooler is a second, independent mitigation and has not been
done.**

Service workers are production-only, so the alerts prompt, the ack loop and
`pushsubscriptionchange` cannot be seen locally at all.

---

## Verified against the live database this session

Stated so it is not re-derived, and not trusted past its date.

- The enquiry-table numbers in the production-migration section above, all
  measured read-only on 2026-08-23.
- **21 bhumi leads have enquired more than once**, over 315 sessions and 332
  payloads. Every session's stored count equals the number of payloads it holds.
- **Push works; reach does not** (2026-08-22). 6 of 18 non-bhumi endpoints
  accepted a real push, 12 returned 410. **4 of bhumi's 7 agents have no
  subscription at all** — Anil Dangi, Mukesh Goswami, Ravish Singh, Vinod
  Goswami. `lead_new` does not push, by design.
- **The Assignments tab count and its list disagree** — bhumi reads 276 and
  opens onto 290 rows. Parked, one-line fix, `docs/PARKED.md`.
- Roles in the database are only `owner`, `manager`, `agent`. bhumi has 7 agents
  and 1 owner, no managers.
- **bhumi's `slaHours` is unset**, so the sweep runs at the 24h default.

---

## Watch after the next deploy

- **The enquiry payloads become visible.** A lead's record shows each sitting and
  the enquiries inside it; the list's last column becomes Last enquiry and is
  sorted on the same expression it renders.
- **`crm_lead_enquiries.payloads` already exists in production** and is already
  populated — the migration above. `initSchema` will add nothing on deploy.
- **Push subscriptions rebuild once per device** when a device next loads the
  app. A device that stays silent did not re-subscribe.
- **The alerts prompt is a new overlay** when a browser has no subscription.
- **The delivery log starts recording** the moment the backend is updated —
  `npx tsx backend/src/scripts/push-delivery-report.ts --tenant=bhumi`.
- **Filters now live in the URL.** A filtered list is a link.
- **"Past SLA" is gone from the dashboard** and "Never called" from the Leads
  pills. Segment KEYS did not change, only labels, so old bookmarks still land.
