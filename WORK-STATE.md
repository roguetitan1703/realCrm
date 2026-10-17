# Work state

## Now
The US film demo is ready for cutroom: /demo-film is Limestone & Laurel Realty (Austin), built from `film-us`; cutroom's BRIEF.md and RUN.md say how to rebuild and record it.

## Next
1. Cutroom records; rebuild /demo-film between 10:00 and 16:00 Austin time on the shoot day (RUN.md)
2. Om re-tests on the dev preview, then release (`docs/releases/2026-10-13.md`)

## Later
- A firm's weekly off for "days worked" — waits on how the firms actually work
- Meta integration (WhatsApp + Instagram) — waits on Om's go and a spec
- US date order in SQL-built strings (agreement_ending's `to_char(end_date, 'DD Mon')`) — waits on a US firm going live
- A firm provisioned outside India has its roster phones stored +91 until settings carry `locale` — waits on provisioning taking a locale
- Production holds a `crm_settings` row for `bhumi-propcity`, a tenant that does not exist (9 rows, 8 tenants) — waits on Om
- Homeowner calling stages carry India's default words ("Key Received") for a US firm — waits on stages joining the market preset
- Daily demo refresh (`--tick`) — waits on Om choosing dev or prod for demos
