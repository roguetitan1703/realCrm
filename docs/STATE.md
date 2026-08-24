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

## The prod watcher writes to production every time you edit the backend. Read this first.

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
- **It happened again on step 5, and there were NINE of them.** A watcher was
  still up, so the three `ADD COLUMN IF NOT EXISTS` statements F needs
  (`reassign_idle_days`, `owner_reassign_idle_days`, `reassign_alert_count`)
  reached production the moment `db.ts` was saved. Additive, defaulted, no row
  rewritten — but **it could not be verified from here**: this machine's sandbox
  refuses a connection to the production database URL outright. Confirm the
  three columns exist and every `crm_routing_rules` toggle still reads what it
  did.
- **`npx tsx watch backend/src/index.ts` carries no environment of its own** —
  it inherits one. `run-api.ts` is a launcher: it puts `APP_ENV` and `PORT` into
  `process.env` and spawns exactly that command, so one backend is a chain of
  seven processes (`npm` → `cmd` → `tsx` → `run-api` → `cmd` → `npx` → `tsx` →
  the server). Counting the inner halves as separate servers overcounts badly;
  check which PID holds the port, and ask the server itself
  (`/api/v1/workspace/resolve?slug=test-org` answers with `env`).
  **Typed by hand in a shell with no `APP_ENV` it does point at production**:
  `appEnv()` falls through to `'local'` and `databaseUrl()` returns
  `DATABASE_URL` for anything that is not `development`. That is the case to
  avoid, and it is the one nothing in the command's name warns you about.
  30 abandoned node processes were found and killed on 23 Aug — roughly eight
  abandoned backends and their launcher halves, plus vite and a scratch script
  from a session whose file had already been deleted. Each abandoned backend
  reruns `initSchema()` and the whole `runOnce` chain on every save against
  whatever database it was launched with, and holds Supabase connections while
  doing nothing. Use `npm run dev:api`, and check `netstat` before starting.

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
the build has got to. **All seven steps are done**, all on `development`, none
deployed.

| # | Step | State |
|---|---|---|
| 1 | Contact predicate + segment catalogue | done — `19287fb` |
| 2 | Facet counts + filter controls | done |
| 3 | The enquiry model | done |
| 4 | Timeline and reopening | done |
| 5 | Settings | done |
| 6 | WhatsApp templates | done |
| 7 | This device | done |

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

Step 5's verification wrote to dev and was cleaned up: one lead (`l_shape_0303`)
was handed back and forth five times through the real API to prove the manager
alert fires at 4 and 5 and not before. Its 5 assignment events and the 6
notifications they raised were read, then deleted; the lead is back with its
original agent.

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

**Step 4 (D, E) is built.** The duplicate stage/status rows were already fixed
at the writer — the last pair on the live desk is 17 Aug — so what shipped is
the read-time collapse of the 199 paired mirrors already on bhumi's records,
**paired-only** because the other 64 are rejections whose reason survives
nowhere else. A repeat enquiry now writes one event per session instead of one
per push plus a second row on reopen; rejected AND closed leads reopen whatever
the reason; the reason is kept rather than nulled so the desk can see it, and is
cleared only when a person moves the stage.

**Step 5 (F) is built.** Settings → Follow-up SLA is Settings → **Response
times**, and both its controls now say what they do: "A new lead should hear
back within [24] hours" (`slaHours`, already driving the escalation) and "Treat
a lead as gone cold after [3] days" (`reminderDays`, wired to Going cold in step
1 while the control still called itself "Ongoing follow-up"). The stored keys
are unchanged, so no desk's number moved.

Three things about assignment, in the desk's words and in days:

- **The unowned hours field is gone.** Nothing in the product sets `agent_id`
  back to NULL, so a lead is unowned only at arrival; the field was asking how
  long a live enquiry should sit with nobody on it. One minute of grace remains,
  hardcoded, so arrival-time routing wins the race.
- **The idle rule is in days and reads the §1 predicate.** It read `updated_at`,
  which a portal push moves without a person going near the lead, so a lead
  could be Going cold on the dashboard and active to the sweep at once.
- **"Tell a manager if a lead is reassigned more than [3] times"**, and every
  time after that — in `recordAssignment()`, so a manual hand-off counts like a
  sweep's, counted from the record's own history. Hand-offs only, leads only.

**Both idle toggles are OFF on every tenant and nothing moved.** What they would
take on the dev clone at the 3-day default: leads — delpat 161, urban 40, raipur
40, skyline-realty 11; owners — delpat 731, raipur 22, urban 22. **Turning one
on hands that many records over in a single pass**, with one batched
notification per agent. Say that number out loud before switching it on for a
client.

**A live landmine was found and defused.** The idle sweep excluded leads with a
booked follow-up via `(follow_up->>'date')::date >= CURRENT_DATE` — an unguarded
cast over free text. 20 leads across four dev tenants carry "This Sunday",
"Today", "Yesterday"; each raises 22007 and takes the whole sweep down. The rule
is off everywhere, so it has never fired — the day a firm turned it on it would
have thrown instead of reassigning, silently. Now `FOLLOWUP_UPCOMING`, guarded
the way `FOLLOWUP_PAST_DUE` already was.

**Step 6 (G) is built, and it closed a hole.** There are two message templates
now — the **WhatsApp message** (filled in from a lead, desk only) and the
**Intro message** (a standing sentence, no lead fields, every agent can read and
copy it). One editor component serves Settings and the phone's Me screen, which
had grown two. An agent on a desktop could not see the intro at all, because the
phone/desk switch is screen size only and Settings was refused to agents
outright; Settings now filters its own nav by role.

**`POST /api/v1/workspace/settings` had no role check** — any signed-in agent
could rewrite the firm's stages, sources, name and templates. Nothing exploited
it: every screen that writes there was already behind a desk-role check, so the
rule was true by luck rather than by enforcement. It is enforced now (403,
verified through the API), and it had to be before showing an agent a template
they may read but not change.

**Step 7 (H) is built.** One stopwatch was producing three symptoms: the false
"alerts unavailable" on a cold load, the empty card in Settings, and the
permission never being asked. `readyRegistration()` raced
`serviceWorker.ready` against a 5-second timer and read a lost race as "this
browser cannot do push". It asks `getRegistration()` now — `undefined` is a real
answer, immediately — and waits on the registration's own state when there is
one. Sign-out cannot wait at all any more, by construction. Alerts and install
are two rows under one **This device** heading on both surfaces; there were
three headings for two facts about one phone.

`navigator.getInstalledRelatedApps()` exists in Chromium and answers (0 on a
machine without the app). The manifest carries `related_applications` built from
the forwarded host. **Whether it returns 1 for an installed app is unverified** —
that needs a real install. If it never answers, the row goes on offering
Install.

**`store.me()` was returning the wrong person**, found while verifying the
above. It ended `|| state.agents[0]` — not "unknown" but the first name on the
roster — so a session whose user id matched no roster row wore a colleague's
name and face, and step 6's intro message resolves `{agentName}` through it.
Gone, along with `activeAgentId`'s invented `'a1'` default. It can now be nobody
legitimately: briefly before the roster loads, and permanently for a user with
no roster row — **`skyline-realty`'s owner Aarav Mehta is in that state today**.
The sentence drops the placeholder rather than printing braces, and Copy is
disabled until the name is known.

**Verifying any of this needs the built bundle, not `vite dev`.** The service
worker is production-only and `/<slug>/sw.js` is a Vercel rewrite, so nothing in
push or install is live under `npm run dev`. Build with `npm run build:dev` and
serve `dist/` with that one rewrite emulated.

**No reply is gone** (24 Aug, at the desk's word): the pile, its tile, its pill
and its push `lead_retry_due`. It was 68 of Going cold's own 161 plus 6 rows
that were in it only because `updated_at` had moved. One clocked idea now, one
number the firm sets. **Nothing pages a going-cold lead** — parked with numbers
in `docs/PARKED.md`, because the honest version of that alert is 161 leads on
bhumi and needs a decision about who hears it.

**H's "identical rows" had not actually been built.** Install rendered
`me-row install-row` and alerts rendered `install-row`; `.me-row` is a bordered
card, so one line under This device sat in a box and the other was bare. Both
come from one `DeviceRow` now — same class, same border, same background, same
icon tile, measured in the browser.

**`push_subscriptions` on dev was NOT empty** — 3 rows, added 22–23 Aug, which
is how a dev sweep paged a real phone with 66 "No answer for N days" alerts at
once (the re-clone had wiped `metadata.retry_notified`, so the whole backlog
became un-notified and eligible in one pass). The rows are deleted and the
table is empty again, as this file always said it was. **Re-cloning dev resets
every once-per-lead notification flag** — expect a burst on the next sweep
unless the flags are cleared with it.

**A–H were read back against the decision document on 24 Aug** and three things
came out of it. **Follow-up overdue is a KPI again** — it had been pulled when
`overdue` counted a dead boolean and read 0 for ever, which stopped being true
when the expression was fixed; it reads 8 / 9 / 14 on the dev tenants and the
tile opens the pill showing the same rows. **No reply ran on a hardcoded 3 days**
while Going cold ran on the firm's setting, so the control moved one pile and
not the other; one number drives both now, and the retry alert reads it too —
set to 7, No reply went 74 → 52 and Going cold 161 → 122 together. **`help` is
no longer served** to a client that renders nothing; it stays in
`leadSegments.ts` as the one written meaning.

**The Source column keeps the arrival portal and now shows `+N`** for the ones
they have come through since, counted in the same query as the row. The
document derives the column from the enquiry rows; it does not, because the
Source facet and filter are computed from `crm_leads.source` and a "latest"
column would put a row under a portal whose own filter does not return it.
Attribution stays put, the rest is no longer invisible.

**Routing writes on Save now, not on every click**, with the number beside each
rule and greyed rather than hidden when the rule is off, and the Calling side
carries the manager threshold. That last one forced three fixes: the two owner
sweeps wrote their own timeline rows and `bulkAssignOwners` wrote **no history
at all**, so an owner moved between callers changed hands silently and nothing
could count the hand-offs. All three go through `recordAssignment()` now.

**THE IDLE SWEEP LOOPED.** Turned on for the first time on the dev desk it
reassigned **480 times across 140 leads in nine minutes**, four hand-offs on
some, 297 notifications. A reassignment is written by System, so it is not
"activity", so the lead was eligible again the moment it landed on someone new —
and the sweep runs every five minutes. The previous expression avoided this only
by accident: it read `updated_at`, which the sweep's own UPDATE reset. The clock
now restarts on the hand-off (`notHandedOnSince`), so whoever holds it gets the
same N days the last person got; on the churned desk the old predicate would
have taken the same 140 again and the new one takes 0.

Underneath it: **a backend that lost the port kept sweeping.** `setInterval` was
outside the `listen` callback with no error handler, so an `EADDRINUSE` process
lingered with a timer over every tenant and no banner to say it existed — four
of them here. The timer is inside the callback now and a second instance exits
saying the port is taken.

Verified on a live tick, on `skyline-realty`: 6 moved, then the other 5, then
**none** — each record exactly once, where the old code would have moved all 11
again every five minutes. That tenant's routing was put back and the rows
deleted.

`bhumi` is unaffected: both sweeps off, and production runs the 19 Aug backend.
The dev desk was re-cloned and the 272 notifications from the window deleted
(127 older ones of the same types kept). **delpat's idle rule was turned OFF** —
it would have churned the restored clone immediately; the 4 days it was set to
are still stored, so it is one toggle to put back.

**Going cold still runs at the 3-day default on every desk** — no tenant has
ever set `reminderDays` — which is 161 of bhumi's 217 open leads, three-quarters
of the desk. At 7 days it is 122, at 14 it is 19. The control is now in front of
the client under its own name; the number is theirs to choose. The figure quoted
when A was agreed ("7 days ≈ 53") was measured under the OLD expression.

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

**Steps 1–3 were audited against the artifact and one deliverable was
missing** (2026-08-23): §1's segment catalogue was never served. `publicSegments()`
was dead code while `definitions.jsx` and `Dashboard.jsx` each kept their own
copy of every label — the three copies the file existed to end — and they had
already drifted on Not contacted's alert tone. It now ships in the bootstrap
payload as `leadSegments`; both screens read it and keep an explicit fallback,
because the frontend deploys on a push and the backend by hand.

**Steps 1 and 2 were driven in a browser** (2026-08-23, re-checked after the
audit). Unfiltered the pills read All 293 · Today 1 · Not contacted 7 · No reply
72 · Going cold 161 · Follow-up overdue 8 · Came back 21, and the dashboard tiles
read the same words and the same numbers from the same expressions under the
same scope. (No reply and Going cold moved from 65 and 142 when the dev desk was
re-cloned — the numbers follow the clone; the agreement between the two surfaces
is the invariant.) One agent (95 leads) moved every number with
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

- **Not contacted is 7, checked with a second query** rather than by re-running
  `leadSegments.ts` — bhumi 7 of 301, dev delpat 7 of 293. Every one sits on
  stage New with a single System-written creation event and nothing else. The
  same predicate a week ago would have read **95** on bhumi and 87 on dev, so
  the number moves with work done, not with the clock: unlike No reply and Going
  cold it carries no `now()` at all, which is why it held at 7 while those two
  moved with the re-clone and the date. Two of bhumi's seven arrived on 10
  August and nobody has touched them since — a fact for the desk, not a bug.
- **Person-authored timeline types, both databases:** note, call, stage_change,
  whatsapp, remark, follow_up, email. `assignment` (3,659), `creation` (506) and
  `lead` (30) are System-written without exception.

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
