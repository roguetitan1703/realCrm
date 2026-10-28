# Work state

## Now
Push `development` to `main` (32 commits: sidebar #130, desk fixes, feed watch, small fixes, backup script, npm deploy:api/backup, smoke tests). Smoke 39/39 on development d50811d; waits on Om's go, then `npm run deploy:api` and the backup cron on the EC2. Production got 6078505 on 28 Oct (deploy confirmed by 401 on /workspace/reset and /pulse).

## Next
1. Phone redesign for the agent, on its own branch `b-phone-redesign` (merges only when Om approves it whole): spec + mockups done (9d5b0f7), waits on Om's six answers; then Today as one "who to ring next" list, one sheet after every call, record's first screen = next step; 44px targets. Then an owner's Team page on phone
2. Feed watch: owner alert merged (28a7fe9); production read 28 Oct: 0 alerts at bhumi/mahalaxmi, 2 at delpat. Delpat half (console view, a daily email to Om via sendMail) waits on Om
2a. /ingest rate limit (held pushes released by the sweep) + agents can't assign leads/owners — builder A on `a-ingest`, third round after two reviews; production peaks read 28 Oct (max 8/min, 26/hour, 27/day); re-review before merge
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
- Daily demo refresh (`--tick`) — waits on Om choosing dev or prod for demos
- Calling on a phone has no Select mode, so bulk assign/take back is desk-only — waits on Om saying a manager does this from a phone
- Leads has no "Select all matching" (Owners now does) — waits on a broker asking to take back leads in bulk
- Merging duplicate leads from the screen sends `merge_strategy: combine_timeline`, which the server answers 400: merge probably always fails — waits on a check in the UI
- Calling a tenant or buyer from Contacts logs on their lead; when a colleague holds that lead the log now 404s (visibility gate, 28 Oct) — waits on deciding where that call belongs
- Pressing Call closes the booked follow-up before the outcome (fix 3dcb711 on `s-phone-bugs`, held): with outcomes on 20% of bhumi's calls, closing only on an outcome would leave most called bookings overdue — waits on Om, or on the redesign's after-call sheet
- The firm logo renders as a broken image in the desk sidebar (seen on delpat, dev) — waits on checking brand_config's logo URL
- Dashboard "Later today" (callbacks due later today) opens the whole Callbacks tab: `callbacks_today` exists on the server but Calling has no pill for it — waits on the Calling pill row being revisited (redesign or Om's naming answer)
- `webhookSender.ts` (outbound webhooks) has no caller and its menu entry is gone — waits on deciding to delete it or build outbound webhooks
- Nightly backup: script + cron line merged (9d67760, DEPLOY.md "Nightly backup"); production dump taken 28 Oct 15:21 on this PC, verified against live counts; Supabase free plan keeps none — waits on the next push to main and Om installing the cron on the EC2
- Regression test suite (there are no tests: 0 test files): agent-phone, owner-desk and permission flows as Playwright + API tests, run before every push to main — parked by Om 28 Oct, builder S or A later; the smoke tests in tests/smoke/ (s-smoke) are its seed
- Duty status (crm_agents.duty_status): nothing sets it, every agent ACTIVE in prod; route now desk-only — waits on Om saying remove it
