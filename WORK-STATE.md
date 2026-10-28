# Work state

## Now
Production deploy of 6078505 (security hotfix incl. the `/workspace/reset` wipe, #154, back navigation, four phone fixes): `main` pushed 28 Oct, Vercel deploying; waits on Om running deploy-api.sh, then a 404 check on /workspace/reset and the PM2 log grep for "Truncating all CRM tables".

## Next
1. Phone redesign for the agent, on its own branch `b-phone-redesign` (merges only when Om approves it whole): spec + mockups done (9d5b0f7), waits on Om's six answers; then Today as one "who to ring next" list, one sheet after every call, record's first screen = next step; 44px targets. Then an owner's Team page on phone
2. Feed watch (BACKLOG Now, PLAN W1–2): `feed_silent` alert when an active portal feed goes quiet 7+ days — builder B on `b-feed-watch`
3. Desk mismatches from the audit (builder S on `s-desk`): counts that disagree with their lists, tiles landing with no chip, Esc on dialogs, agents see Import
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
- Duty status (crm_agents.duty_status): nothing sets it, every agent ACTIVE in prod; route now desk-only — waits on Om saying remove it
