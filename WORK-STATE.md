# Work state

## Now
Push `development` to `main` (32 commits: sidebar #130, desk fixes, feed watch, small fixes, backup script, npm deploy:api/backup, smoke tests). Smoke 39/39 on development d50811d; waits on Om's go, then `npm run deploy:api` and the backup cron on the EC2. Production got 6078505 on 28 Oct (deploy confirmed by 401 on /workspace/reset and /pulse).

## Next
1. Phone redesign for the agent, on its own branch `b-phone-redesign` (merges only when Om approves it whole): spec + mockups done (9d5b0f7), waits on Om's six answers; then Today as one "who to ring next" list, one sheet after every call, record's first screen = next step; 44px targets. Then an owner's Team page on phone
2. Feed watch: owner alert merged (28a7fe9); production read 28 Oct: 0 alerts at bhumi/mahalaxmi, 2 at delpat. Delpat half (console view, a daily email to Om via sendMail) waits on Om
2c. Local setup + dev data stays current: merged 28 Oct (`npm run setup:local`, `npm run dev:refresh`, README). Shared dev db needs `npm run dev:refresh -- --adopt=delpat` once; dashboard "Callbacks due" says 7 and opens 15 (found by the local seed) — next for a builder
3. Desk mismatches: fixed and merged (d9d82df + this merge); naming of "Not yet contacted"/"Never called" and the Performance default wait on Om
4. Work OS #153 WhatsApp intro templates, wording from Om
5. Work OS #155 merge misspelt project names, needs a spec and Om's scope
6. Work OS #129 help desk (#156 demos feed it)

## Later
- A firm's weekly off for "days worked" — waits on how the firms actually work
- Alerts are stamped with the app's clock and links/events with the database's; on a skewed host (this PC: DB 2.5s ahead) "a fresh link after the alert" closes a tap made right after a send — waits on checking the AWS host's skew
- Idle-owner sweep threw after its first owner since 23 Sep (fixed in review 3) — waits on a read-only prod check of which firms had `owner_reassign_idle_enabled`
- Meta integration (WhatsApp + Instagram) — waits on Om's go and a spec
- US date order in SQL-built strings (agreement_ending's `to_char(end_date, 'DD Mon')`) — waits on a US firm going live
- A firm provisioned outside India has its roster phones stored +91 until settings carry `locale` — waits on provisioning taking a locale
- Production holds a `crm_settings` row for `bhumi-propcity`, a tenant that does not exist (9 rows, 8 tenants) — waits on Om
- Homeowner calling stages carry India's default words ("Key Received") for a US firm — waits on stages joining the market preset
- "Call not received" moves a listing owner to Contacted (`routes/actions.ts:135`), waits on Om saying whether a no-answer is first outreach
- Abandoning the import wizard at the map step leaves an "uploaded, 0 created" job in History, waits on a cleanup rule
- Four write scripts import the services without CRM_NO_BOOT (dedupe-leads, remap-connections, reprocess-inbox, test-notifications): run against production they start initSchema, waits on their next use
- Calling on a phone has no Select mode, so bulk assign/take back is desk-only — waits on Om saying a manager does this from a phone
- Leads has no "Select all matching" (Owners now does) — waits on a broker asking to take back leads in bulk
- Merge duplicate lead: the 400 is fixed (client sent a strategy the server refuses), but nothing sets `duplicateOf`, so the action never shows — waits on Om deciding whether duplicate detection is wanted (BACKLOG, A control that does nothing)
- Calling a tenant or buyer from Contacts logs on their lead; when a colleague holds that lead the log now 404s (visibility gate, 28 Oct) — waits on deciding where that call belongs
- Pressing Call closes the booked follow-up before the outcome (fix 3dcb711 on `s-phone-bugs`, held): with outcomes on 20% of bhumi's calls, closing only on an outcome would leave most called bookings overdue — waits on Om, or on the redesign's after-call sheet
- The firm logo renders as a broken image in the desk sidebar (seen on delpat, dev) — waits on checking brand_config's logo URL
- Dashboard "Later today" and "Callbacks due" (late callbacks only) both open the whole Callbacks tab: `callbacks_today`/`callbacks_overdue` exist on the server but Calling has no pill for them, so on local data the tile says 7 and the list 15 (smoke desk test 1 fails there; the shared dev data has no future callbacks, so it passed by accident) — waits on the Calling pill row being revisited (redesign or Om's naming answer)
- `webhookSender.ts` (outbound webhooks) has no caller and its menu entry is gone — waits on deciding to delete it or build outbound webhooks
- Nightly backup: script + cron line merged (9d67760, DEPLOY.md "Nightly backup"); production dump taken 28 Oct 15:21 on this PC, verified against live counts; Supabase free plan keeps none — waits on the next push to main and Om installing the cron on the EC2
- Regression test suite (there are no tests: 0 test files): agent-phone, owner-desk and permission flows as Playwright + API tests, run before every push to main — parked by Om 28 Oct, builder S or A later; the smoke tests in tests/smoke/ (s-smoke) are its seed
- Dev API (api.dev.re.delpat.in, re-api-dev on the EC2) answers 502 (28 Oct) — waits on Om looking at PM2 on the box
- Duty status (crm_agents.duty_status): nothing sets it, every agent ACTIVE in prod; route now desk-only — waits on Om saying remove it
- The shared dev database has no firm marked synthetic, so its dates do not move yet — waits on Om running `npm run dev:refresh -- --adopt=delpat` (and any other fixture firm) against it
- A row's status menu stays open while its button sits under the sticky top bar (still "in view" by geometry) — waits on a desk polish pass
