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
- **Time:** every timestamp is written relative to an anchor and stored with
  it (`brand_config.demo.anchor`). `--refresh` on the morning of a demo shifts
  every timestamp in the firm by (now − anchor): overdue stays 4 hours
  overdue, the visit stays at 4 pm today.

---

## 5. Safety

- Writes only a tenant whose `brand_config.demo.generator` marker it set
  itself. Reset and delete refuse anything without the marker, and refuse
  `bhumi`, `mahalaxmi`, `delpat` by name as well.
- **Production:** a dry run always comes first and prints what it would write,
  table by table. `--write` asks for the user's OK each time; one approval
  does not cover the next run.
- `postgres(url, { max: 1 })`. Never left running.

---

## 6. Phone numbers: they must work, and they must reach us

Call and WhatsApp have to work in a demo, so every number is a real one, and a
real number belongs to somebody. A pool of numbers Delpat answers
(`phonePool`) is shared across leads and owners. The records the flows tap use
the presenter's own phone, so the call rings in the room and WhatsApp opens a
chat we control. Leads and owners may share a number (no merge outside webhook
and import). Team members each need their own number within the firm (unique
index on `users`).

The live-enquiry flow must send from a number **outside** the pool, or the
webhook matches an existing lead and merges into it.

---

## 7. Open before the first production run

1. **Photos.** Our own or the broker's photos per project, uploaded through the
   media service. Not portal photos: they belong to other brokers.
2. **The pool's numbers**, and which phone the presenter carries.
3. The flows a given broker gets, from profiling.
