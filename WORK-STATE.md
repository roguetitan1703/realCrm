# Work state

## Now
Release 1 is live (main a036eb4, API 45a68f6, 27 Oct). Om is teaching bhumi and mahalaxmi; pick the next task from the 27 Oct meeting.

## Next
1. Work OS #154 bulk unassign a finished calling list
2. Work OS #153 WhatsApp tap opens with an intro template (lead / owner calling), wording from Om
3. Work OS #155 merge misspelt project names in bulk (aliases, preview, undo), needs a spec first
4. Work OS #129 help desk: report a problem, then the help centre (#156 demos feed it)
5. Work OS #130 collapsible sidebar

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
