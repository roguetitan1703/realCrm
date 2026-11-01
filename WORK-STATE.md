# Work state

## Now
Release waits on Om: (1) promote 0695296 in Vercel — realestate.delpat.in still serves 27 Oct (a036eb4), API runs 6078505 (28 Oct); (2) his go to push development to main (smoke 41/41 on 82be595; includes sign-in hardening that asks Firm@2026/short-password users for a new one at next sign-in); (3) EC2: `npm run deploy:api` (runs the closed-lead repair once: bhumi 23, mahalaxmi 9), `npm run backup` + cron. Frontend before backend.

## Next
0. UI review (docs/specs/ui-review.md, published for Om): waits on Om picking proposals; recommended P1 after-call sheet + P3 one word one number
1. Phone UI and UX, new from the user flows (the earlier spec 9d5b0f7 rearranged the current screens and is superseded): the fresh design is on `b-phone-redesign` (c7e7aa1, docs/specs/phone-ui/) and published for Om. Waits on his review and its 9 decisions plus follow-ups D1–D5. Then slice 1: the after-call sheet, its `call-result` write, ack + Undo. Built on its own branch, merged only when Om approves it whole
2. Feed watch: owner alert merged (28a7fe9); production read 28 Oct: 0 alerts at bhumi/mahalaxmi, 2 at delpat. Delpat half (console view, a daily email to Om via sendMail) waits on Om
2c. Local setup + dev data stays current: merged 28 Oct (`npm run setup:local`, `npm run dev:refresh`, README). Shared dev db needs `npm run dev:refresh -- --adopt=delpat` once; callback figures match their lists, merged (9514127)
3. Desk mismatches: fixed and merged (d9d82df + this merge); naming of "Not yet contacted"/"Never called" and the Performance default wait on Om
4. Work OS #153 WhatsApp intro templates, wording from Om
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
- Billing due dates on the 29th–31st slide to the 28th after February (Postgres month add) — waits on a firm due on those days
- Calling a tenant or buyer from Contacts logs on their lead; when a colleague holds that lead the log now 404s (visibility gate, 28 Oct) — waits on deciding where that call belongs
- Pressing Call closes the booked follow-up before the outcome (fix 3dcb711 on `s-phone-bugs`, held): with outcomes on 20% of bhumi's calls, closing only on an outcome would leave most called bookings overdue — waits on Om, or on the redesign's after-call sheet
- The firm logo renders as a broken image in the desk sidebar (seen on delpat, dev) — waits on checking brand_config's logo URL
- On a phone, an owner's or manager's Calling tab badge counts their own late callbacks (Today's feed is theirs) while their Calling list shows the firm's — waits on the owner's phone pages in the redesign
- `webhookSender.ts` (outbound webhooks) has no caller and its menu entry is gone — waits on deciding to delete it or build outbound webhooks
- Nightly backup: script + cron line merged (9d67760, DEPLOY.md "Nightly backup"); production dump taken 28 Oct 15:21 on this PC, verified against live counts; Supabase free plan keeps none — waits on the next push to main and Om installing the cron on the EC2
- Regression test suite (there are no tests: 0 test files): agent-phone, owner-desk and permission flows as Playwright + API tests, run before every push to main — parked by Om 28 Oct, builder S or A later; the smoke tests in tests/smoke/ (s-smoke) are its seed
- Dev API (api.dev.re.delpat.in, re-api-dev on the EC2) answers 502 (28 Oct) — waits on Om looking at PM2 on the box
- Duty status (crm_agents.duty_status): nothing sets it, every agent ACTIVE in prod; route now desk-only — waits on Om saying remove it
- The shared dev database has no firm marked synthetic, so its dates do not move yet — waits on Om running `npm run dev:refresh -- --adopt=delpat` (and any other fixture firm) against it
- A row's status menu stays open while its button sits under the sticky top bar (still "in view" by geometry) — waits on a desk polish pass
- Locality spellings split one area into several ("Mahalunge", "Mhalunge", "Mahlunge", "ahalunge" on bhumi's Available flats): buyer matching reads them as different areas — waits on a locality pick list for listings, or Om saying merge them
- Flats priced in thousands (bhumi 2: ₹75, ₹8,500 for sale; mahalaxmi 4: ₹30, ₹34 rent) fit every lead whose budget is only a ceiling, so one bhumi card says 210 buyers — waits on Om saying fix the prices or add a sanity check on the price field
- 169 of bhumi's 669 open leads have no deal (buy or rent) and now match no flat — waits on Om, or on the after-call sheet asking it
- The idle-owner sweep's assignment alert reads "undefined owners assigned to you" (notificationCopy.ts owner_assigned gets no `n` from the sweep; seen on delpat dev, 1 Nov) — waits on the next notifications batch
