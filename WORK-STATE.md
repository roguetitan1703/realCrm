# Work state

## Now
Release readiness: phone model (A, `a-phone-model`, review fixes in progress) and buyer forms + view retention (B, `b-forms`) — both paused by the session limit until 23:20 IST 20 Oct, work saved in their worktrees.

## Next
1. Resume A and B; review; merge
2. Om: dev preview re-test (dev API redeploy first), then the release (`docs/releases/2026-10-20.md`)
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
