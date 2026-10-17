# Work state

## Now
A US demo firm for the product film: the app reads a firm locale (currency, phone country, bedroom words; India by default) and the demo generator builds any market from a researched profile.

## Next
1. Rebuild /demo-film as a US firm after 11 am IST, walk it, write cutroom's RUN.md, hand to cutroom
2. Om re-tests on the dev preview, then release (`docs/releases/2026-10-13.md`)

## Later
- A firm's weekly off for "days worked" — waits on how the firms actually work
- Meta integration (WhatsApp + Instagram) — waits on Om's go and a spec
- US date order in SQL-built strings (agreement_ending's `to_char(end_date, 'DD Mon')`) — waits on a US firm going live
- A firm provisioned outside India has its roster phones stored +91 until settings carry `locale` — waits on provisioning taking a locale
- Production holds a `crm_settings` row for `bhumi-propcity`, a tenant that does not exist (9 rows, 8 tenants) — waits on Om
