# Work state

## Now
Security hotfix to production: `/workspace/reset` (no sign-in, wiped every firm), the agent split in bulk-assign, and the team role/roster routes are closed on `development` (764d0be, f593094). Waits on the route-sweep review, then Om's go to push `main` and run deploy-api.sh.

## Next
1. Phone, from the 28 Oct audit: Call clears the booked follow-up before the outcome; the Today badge leaves out overdue; New lead's Name field is 38px; calendar month grid clipped (desk too); calendar crashes on demo-showcase (Calendar.jsx:182)
2. Phone redesign for the agent: Today as one "who to ring next" list, one sheet after every call (outcome + next), record's first screen = next step + Call/WhatsApp; 44px targets. Then an owner's Team page on phone
3. Desk mismatches from the audit: counts that disagree with their lists, tiles landing with no chip, Esc on dialogs, agents see Import
4. Work OS #153 WhatsApp intro templates, wording from Om
5. Work OS #155 merge misspelt project names, needs a spec and Om's scope
6. Work OS #129 help desk (#156 demos feed it); #130 collapsible sidebar

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
