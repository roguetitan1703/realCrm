# Demo tenants: a firm a local broker recognises, built from one profile

**Who it is for.** Delpat, sitting with a broker in their city, showing them
their own market inside the product. The broker should see localities they
work, projects they sell, names that sound like their clients, and a desk that
looks like a working Tuesday: some of it done, some of it late.

**What it is.** A generator that takes one profile (a city, a firm, a market)
and builds a demo firm on **production**, where demos are shown. Vadodara is
its first profile, not a special case. It replaces the Gemini-era
`demo-tenant-generator` (Raipur, Pune), which is kept only as a source of
ideas: the per-city profile, data shaped to light up specific screens, and
agent shorthand in remarks.

---

## 1. Why the old generator is not reused

| It did | What that breaks today |
|---|---|
| Read `DATABASE_URL` with no environment check | Wrote production silently, no dry run |
| Protected `bhumi`, `delpat`, `test-org`, then deleted every table for the slug | `--tenant=mahalaxmi` erases a paying firm |
| Raw `INSERT`s into each table | No assignment history, no ledger; tenancies written as the old property blob, which since 24 Sep is converted once and never again, so Tenants and the 30-day alert stay empty |
| Times relative to the moment it ran, `Math.random` | Stale by demo day; Performance "today" empty; no two runs alike, so no flow can be rehearsed |
| Random numbers on real Indian prefixes | A tap on Call or WhatsApp rings a stranger |
| Integrations with inbox rows marked "parsed" that created nothing; keys discarded | A feature that does not work, shown as working |
| Raipur/Pune branches for team, coordinates, surnames, colours | Not generic: a third city gets Raipur's map and Pune's team |
| No photos, no tower/configuration on calling rows, no Key Received | The best demo moments (photo link, Make cover, configuration filter) show nothing |

---

## 2. Start from the pitch, not from the tables

Every profile names the flows it will be pitched with. Each flow names the
records it needs, and the generator guarantees them: same names, same state,
every run. Everything else is volume around them.

| Flow | Shown on | Needs |
|---|---|---|
| **The owner's morning** | Dashboard → Needs attention → Hand out | Unassigned calling rows in one project; missed follow-ups on two named agents; one agent idle today |
| **An agent's phone** | Today → call → outcome → callback | A named agent with 3 overdue, 2 due today, 1 site visit at a time after the demo starts |
| **A live enquiry** | A real POST to the firm's ingest key → lead appears and is routed | The ingest key `provisionTenant` returns; a one-line command to send it |
| **A flat** | Properties → project → Duplicate, photos, Copy photo link → open on a phone | One project with 20+ units across towers, photos on its flats |
| **Supply side** | Calling → project → Tower / Configuration → Key Received → Convert to property | 150+ owners in two projects, a few at Key Received |
| **A rent deal** | Close the deal → Contacts → Tenants → Ending in 30 days | Agreements ending in 10–25 days |
| **How the team did** | Performance → yesterday → one agent | Activity on each of the last 14 days, including today up to now |

---

## 3. The profile

One JSON per firm, in `backend/src/scripts/demo-profiles/`. What the broker
told us at profiling goes here; nothing about a city is in the code.

```jsonc
{
  "slug": "demo-vadodara",            // must start "demo-"
  "seed": 20261001,                   // same seed, same firm
  "firm": { "name": "…", "city": "Vadodara", "color": "#…", "logo": "logo.png" },
  "market": {                          // from profiling: what this broker does
    "deal": { "sale": 0.6, "rent": 0.4 },
    "segment": "resale"                 // resale | new-launch | mixed
  },
  "team": [                            // real names given at profiling, or invented
    { "name": "…", "role": "owner", "email": "…", "phone": "+91…" },
    { "name": "…", "role": "manager", "phone": "+91…" },
    { "name": "…", "role": "agent", "phone": "+91…" }
  ],
  "phonePool": ["+91…", "+91…"],       // numbers WE answer; see §6
  "people": { "first": ["…"], "last": ["…"] },
  "localities": [{ "name": "Alkapuri", "lat": 22.31, "lng": 73.17 }],
  "projects": [{
    "name": "…", "builder": "…", "locality": "Gotri",
    "towers": ["A", "B", "C"], "floors": 14, "perFloor": 4,
    "configs": { "2 BHK": { "sale": [5200000, 6800000], "rent": [16000, 22000] } },
    "photos": "photos/<project>/"      // optional, see §7
  }],
  "phrases": {                          // how agents here actually type
    "call": ["not ans", "call cut", "busy hatu, sanje call karvano"],
    "remark": ["3bhk joie che, budget 60 sudhi", "family sathe visit karse"],
    "callback": ["sanje 7 pachi call karo"]
  },
  "volume": { "leads": 220, "owners": 400, "units": 160 }
}
```

---

## 4. How it writes

- **The firm:** `provisionTenant()`, the superadmin console's path. It never
  takes a slug that exists (it suffixes), so it cannot overwrite a firm.
- **Records:** the app's own services, inside `runWithContext` for the tenant:
  `createLead`, `createOwnersBatch`, `createProperty`, `createAgreement`, and
  hand-outs through `bulkAssignOwners` / the lead equivalent, which write the
  assignment history themselves. Ledger, history and agreements are therefore
  real.
- **History:** a service stamps `now()`, so past calls, remarks and status
  changes are the one direct write. Same shapes the services write:
  `author` = user id, `metadata.outcome` from `callOutcomes.js`,
  `metadata.from`/`to` on status changes.
- **Time:** everything is planned relative to the moment of the build, in
  office hours (10:00 to 19:30 India time; night folds into the next morning,
  in order). The build time is stored (`brand_config.demo.anchor`).
  `--refresh` moves every date forward by whole calendar days, so a 4 pm call
  stays at 4 pm and "due today" stays today. **Build after 11 am**: "today"
  holds only the work done before the build, and every refresh keeps that.
- **Not through the app, on purpose:** the ledger. Audit rows keep the real
  time they were written, so the ledger says the generator made the firm,
  which is true.

---

## 5. Running it

```bash
npx tsx backend/src/scripts/seed-demo-tenant.ts --profile=vadodara --env=development             # plan: writes nothing
npx tsx backend/src/scripts/seed-demo-tenant.ts --profile=vadodara --env=development --write     # build or rebuild
npx tsx backend/src/scripts/seed-demo-tenant.ts --profile=vadodara --env=development --refresh   # dates up to today
npx tsx backend/src/scripts/seed-demo-tenant.ts --profile=vadodara --env=development --delete
```

Photos need the Vite dev server (`npm run dev`), or pass `--no-photos`.
Everyone in the firm signs in with the profile's `password` (default
`Demo@1234`). A build takes about 7 minutes against the development database.

---

## 6. Safety

- Only a slug starting `demo-`, never `bhumi`, `mahalaxmi`, `delpat`,
  `skyline-realty`, `test-org`, `tutorial`, `urban`, `raipur`. A firm is
  remade or deleted only when it carries this script's marker
  (`brand_config.demo.generator`).
- Plan mode is the default. **Production** needs `--env=production` and
  `--confirm=<slug>` on every run, and the user's OK each time.
- It refuses a database that has not run this checkout's newest one-time
  migration: production's API must be deployed first.
- It never runs the server's boot (`CRM_NO_BOOT=1`), so it cannot migrate
  anything.

---

## 7. Decided

- **Phone numbers are random.** Nobody contacts these people; a tap that rings
  a stranger is accepted.
- **Photos** are openly licensed interiors from Openverse
  (`demo-profiles/photos.json`, CC0 or CC BY, share-alike dropped), never a
  building's outside. Each upload is stamped with the firm's name by the app's
  own `processListingImage()`, the way every listing photo is.
- **Owners who listed with us** sit at Key Received with the agent who listed
  them, after a call: they are past the calling funnel.
- **The live enquiry** uses the firm's real Website connection (its key is in
  Settings → Connections). Send it from a number no lead has, or it merges.
