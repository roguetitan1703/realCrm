# Draft skill: `demo-tenant`

Draft, 17 Oct 2026. The design is `demo-tenants.md` §8. It becomes a skill
(in `Delpat-Tech/delpat-skills`, beside `tutorial-videos`) once `--market`
and `--tick` exist; until then, steps marked *(planned)* do not run.

---

```yaml
name: demo-tenant
description: Build, refresh, check or remove a demo firm in the real estate CRM
  by Delpat from one profile: a market (US, India, Gujarat), a firm name, a team
  and the flows the pitch needs. Use when asked for a demo client, a demo firm,
  sample or seeded data for a pitch, a recording or screenshots, or to make a
  demo look current. Never for a paying firm.
```

## When to use it

- "Make a demo for a broker in Pune / a US brokerage / the product film."
- "The demo looks stale" or "keep the demo fresh every day."
- "Remove demo-x."

Not for: test fixtures (`npm run seed:dev`), tutorial recordings that have
their own reset (`tutorial-videos`), or anything on `bhumi` or `mahalaxmi`.

## Ask first (one message, every question with a default)

1. **Market:** `us`, `india` or `gujarat`. It sets names, localities, currency,
   phone format, sizes (sqft vs BHK), listing sources, note language,
   timezone and working hours. Default: `india`.
2. **City**, and whether the localities are real public area names (default)
   or invented (for anything shown outside Delpat).
3. **Firm name and colour.** For anything shown in public: invented, never a real
   firm's name or branding.
4. **Team:** how many agents, and who works what (offices and shops,
   warehouses, residential). Default: owner, manager, three agents.
5. **What the pitch shows.** Pick from the flows in `demo-tenants.md` §2: the
   owner's morning, an agent's phone, a live enquiry, a flat, the supply side, a
   rent deal, how the team did. Each adds the records that flow needs.
6. **Where it is shown:** development (screenshots, film) or production (live
   pitches). Production needs Om's OK on every write.
7. **Kept fresh daily?** If yes, it gets the daily job (§8.3 of the spec).
8. **Phones:** `fiction` (99555 block; required for anything public) or random.

## What it does

1. Write the profile `backend/src/scripts/demo-profiles/<name>.json` from the
   answers. `slug` starts `demo-`. A market preset fills everything the person
   did not name; the profile overrides the preset field by field.
2. Plan, and show the plan to the person:
   `npx tsx backend/src/scripts/seed-demo-tenant.ts --profile=<name> --env=<env>`
3. On a yes, build. Photos need `npm run dev` running, or `--no-photos`:
   `... --write` (production: `--env=production --confirm=<slug>`).
4. If kept fresh: install the daily job *(planned)*: `... --tick`, see the spec.
5. Verify (below), then report the sign-in, the URL and what was checked.

## Safety rules (never relaxed)

- Only slugs starting `demo-`. The generator refuses `bhumi`, `mahalaxmi`,
  `delpat`, `skyline-realty`, `test-org`, `tutorial`, `urban`, `raipur`, and
  any firm whose `brand_config.demo.generator` is not its own.
- Plan before write, every time. Show the plan; write only on a yes.
- Production: `--confirm=<slug>` and Om's OK for each run. A scheduled job on
  production is set up once, with Om's OK, and named in `docs/STATE.md`.
- Never read or write `bhumi` or `mahalaxmi`, even to copy their shape. Their
  shape is in the code.
- Never run the API's boot from the script (`CRM_NO_BOOT=1` is set for you).
- Do not change product code to make a demo look right. A demo that needs a
  product change gets a BACKLOG line; the change is ordinary work.
- Anything shown outside Delpat: invented firm, people, projects, builders;
  phones `fiction`; never a building's outside in photos.
- Clean up: a demo nobody will use again is removed with `--delete`, which
  removes its photos too.

## Verify (open each, signed in as the role named)

| Screen | As | Must show |
|---|---|---|
| Dashboard | owner | Needs attention with unassigned rows and overdue follow-ups by agent; one agent idle today |
| Leads, tabs | owner | Today, Not contacted, Going cold, Follow-up overdue, Came back: none empty |
| Today (phone, `iPhone 13`) | the named agent | overdue, due today, a site visit later today |
| Calendar | agent | bookings this week |
| Performance → today, yesterday, 7 days | owner | activity on every day, one agent visibly lower |
| Team | owner | everyone listed; Alerts column state as decided in spec §8.1 |
| Alerts bell | agent | at least one open alert that names something doable today |
| Properties → a project | owner | towers, photos, Copy photo link opens on a phone |
| Calling → a project | agent | Tower / Configuration filters; a few at Key Received |
| Contacts → Tenants → Ending in 30 days | owner | 3 to 5 agreements |
| A lead | agent | shortlist, matching flats, history in order |
| Settings → Connections | owner | Website connection with a key and deliveries in its inbox |
| Money and phones | any | the market's currency and phone format everywhere (US needs spec §8.2 shipped) |

Measure, do not eyeball: count rows per tab with a read-only query
(`default_transaction_read_only`) and compare with the screen.

## Report

Firm, URL, database, sign-ins (`Demo@1234` unless the profile says), the
flows lit, anything empty and why, and the daily job's state.
