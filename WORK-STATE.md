# Work state

## Now
Actions feel slow (Om 2 Nov). Merged on development: shortlist bursts (7 taps → 2 requests) and rename undo 2.9s → 1.2s (b-speed), a sold/rented flat on a lead shows its status and cannot be ticked (71d4f4b); auth check 2–4 → 1 round trip per request (a-auth-speed, reviewed; review's fail-open finding fixed in 40b1a15); smoke 41/41. B on `b-speed2`: shell requests once per screen, narrower refresh after writes, optimistic owner status/callback/remark.
Release 2 (c440165) is live on both halves; backup nightly on the EC2 (STATE.md).

## Next
D1. Waits on Om: daily date refresh for production demo firms (urban, raipur, …) — today only the development db refreshes; it is a daily production write limited to demo firms (recommended yes, measure first, review)
D2. Waits on Om: #153 intro wording (drafts given 2 Nov) and what is wrong with today's share message
D3. Waits on Om: the delpat production login, for the signed-in live check
S0. Each screen loads 6–7 shell requests (bootstrap, desk-summary, owners/summary, notifications ×2, device-state); Leads and Calling fetch routing/backlog 3 times; desk Calling sends 11 at once against a 10-connection pool (measured on dev 2 Nov)
S1. Speed, after B's shortlist work (audit 2 Nov, ranked): owner status/callback optimistic + store the returned owner + Owners.jsx `fetched || cached` prefers stale fetched; Record call = one endpoint (contact-log + editRemark + callback in sequence today); follow-up/Callback modal closes at once; inline assign and AssignModal optimistic, notify after responding; Add remark closes at once; Today "Done" leaves at once; reject owner one request; skip refetching the lead a write just returned and narrow what `settled()` refreshes; updateLead reads the lead twice; hand-out rota N locked queries → `dealRota(n)`; moveAll per-target loop; property edit per-field events; verifyProperty labelled optimistic but is not
S2. Bug: `noteOwnerContact` (store.ts ~4740) reportedly writes "Stage → Contacted" on every contact with an owner already Contacted — verify, then fix with S1
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
- Backups stay on the EC2 only (no off-box copy, BACKUP_COPY_TO unset): a lost box loses them — waits on Work OS #172 (a standalone backup service for every product's database)
- The EC2 has a pending kernel upgrade (needs a reboot); check `pm2 startup`/`pm2 save` brings re-api back before rebooting — waits on Om choosing a quiet hour
- Regression test suite (there are no tests: 0 test files): agent-phone, owner-desk and permission flows as Playwright + API tests, run before every push to main — parked by Om 28 Oct, builder S or A later; the smoke tests in tests/smoke/ (s-smoke) are its seed
- Dev API (api.dev.re.delpat.in, re-api-dev on the EC2) answers 502 (28 Oct) — waits on Om looking at PM2 on the box
- Duty status (crm_agents.duty_status): nothing sets it, every agent ACTIVE in prod; route now desk-only — waits on Om saying remove it
- The shared dev database has no firm marked synthetic, so its dates do not move yet — waits on Om running `npm run dev:refresh -- --adopt=delpat` (and any other fixture firm) against it
- A row's status menu stays open while its button sits under the sticky top bar (still "in view" by geometry) — waits on a desk polish pass
- Locality spellings split one area into several ("Mahalunge", "Mhalunge", "Mahlunge", "ahalunge" on bhumi's Available flats): buyer matching reads them as different areas — waits on a locality pick list for listings, or Om saying merge them
- Flats priced in thousands (bhumi 2: ₹75, ₹8,500 for sale; mahalaxmi 4: ₹30, ₹34 rent) fit every lead whose budget is only a ceiling, so one bhumi card says 210 buyers — waits on Om saying fix the prices or add a sanity check on the price field
- 169 of bhumi's 669 open leads have no deal (buy or rent) and now match no flat — waits on Om, or on the after-call sheet asking it
- The idle-owner sweep's assignment alert reads "undefined owners assigned to you" (notificationCopy.ts owner_assigned gets no `n` from the sweep; seen on delpat dev, 1 Nov) — waits on the next notifications batch
- Every authenticated request pays three sequential DB trips before its handler (session read, `last_seen_at` update awaited, settings read): ~0.4s of each request on dev — waits on a speed pass over the auth middleware
- postgres.js describes a parameterised statement the first time a connection runs it (two round trips, and no pipelining behind it); `IN ${sql(list)}` gives a new statement per list length so it is never reused, and idle connections close after 20s — waits on a speed pass (unnest arrays, longer idle_timeout)
- Visit feedback (`store.visitFeedback`) sends the whole shortlist outside the shortlist queue, so a verdict saved while attaches are in flight can drop them — waits on the visit-feedback screen's next change
- Owners called again while already Contacted carry false "Stage → Contacted / First outreach logged" lines from before the fix (dev had none; production not counted, the read was refused) — waits on a read-only prod count, then Om saying remove them through runOnce
- An owner's callback card (Done / Reschedule) is desk-only: the phone record has no rail, so a phone clears a callback only from the quick actions — waits on the owner's phone pages in the redesign
