# Work state

## Now
Catalog release readiness: everything merged on `development` (cf81d05); waits on Om's yes to two read-only production runs (STATE.md).

## Next
1. Run the two production reads once Om says yes; report per firm
2. Om re-tests the dev preview (dev API redeploy first), then Release 1 + catalog
3. Help desk: report a problem, then the help centre
4. Cutroom records the US film (RUN.md)

## Later
- A firm's weekly off for "days worked" — waits on how the firms actually work
- Alerts are stamped with the app's clock and links/events with the database's; on a skewed host (this PC: DB 2.5s ahead) "a fresh link after the alert" closes a tap made right after a send — waits on checking the AWS host's skew
- Idle-owner sweep threw after its first owner since 23 Sep (fixed in review 3) — waits on a read-only prod check of which firms had `owner_reassign_idle_enabled`
- Meta integration (WhatsApp + Instagram) — waits on Om's go and a spec
- US date order in SQL-built strings (agreement_ending's `to_char(end_date, 'DD Mon')`) — waits on a US firm going live
- A firm provisioned outside India has its roster phones stored +91 until settings carry `locale` — waits on provisioning taking a locale
- Production holds a `crm_settings` row for `bhumi-propcity`, a tenant that does not exist (9 rows, 8 tenants) — waits on Om
- Homeowner calling stages carry India's default words ("Key Received") for a US firm — waits on stages joining the market preset
- Daily demo refresh (`--tick`) — waits on Om choosing dev or prod for demos
