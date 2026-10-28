# Work state

## Now
Production deploy of 6078505 (security hotfix incl. the `/workspace/reset` wipe, #154, back navigation, four phone fixes): `main` pushed 28 Oct, Vercel deploying; waits on Om running deploy-api.sh, then a 404 check on /workspace/reset and the PM2 log grep for "Truncating all CRM tables".

## Next
1. Phone redesign for the agent, on its own branch `b-phone-redesign` (merges only when Om approves it whole): spec + mockups done (9d5b0f7), waits on Om's six answers; then Today as one "who to ring next" list, one sheet after every call, record's first screen = next step; 44px targets. Then an owner's Team page on phone
2. Feed watch: owner alert merged (28a7fe9); production read 28 Oct: 0 alerts at bhumi/mahalaxmi, 2 at delpat. Delpat half (console view, a daily email to Om via sendMail) waits on Om
2a. /ingest rate limit + agents can't assign in Add lead — builder A on `a-ingest`; review subagent before merge; run its peak-traffic script on production first
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
- No scheduled production backup: newest dump is 22 Aug (this PC, `backups/`); Supabase plan's backups unknown — waits on Om's go for a dump now and a nightly cron
- Duty status (crm_agents.duty_status): nothing sets it, every agent ACTIVE in prod; route now desk-only — waits on Om saying remove it
