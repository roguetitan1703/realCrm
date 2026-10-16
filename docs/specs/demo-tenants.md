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

---

## 8. Presets, coverage and daily refresh (plan, 17 Oct)

Plan only, nothing built. The skill that drives it is drafted in
`demo-tenant-skill.md`. The coverage numbers come from a read-only query
of `demo-showcase` on the development database on 17 Oct. That firm was built
on 12 Oct and has not been refreshed since.

### 8.1 Coverage: what the generator lights up today

What `demo-showcase` holds:

- **Leads:** 179 leads, none of them unassigned. 104 have a booked follow-up, and **all 104 are overdue; none is due today**.
- **Calling:** 346 owners, 46 with nobody assigned and 21 callbacks overdue.
- **Listings:** 140.
- **History:** 2,192 events. The last day with any activity is 12 Oct, which has 13 events.
- **Site visits:** 26.
- **Agreements:** 13, all rent. 4 end within 30 days. There are no sales.
- **Alerts:** 103. The build deleted the alerts it raised itself; these came afterwards from the development API's sweep: 72 `followup_due`, 16 `lead_untouched`, 11 `site_visit_reminder` and 4 `agreement_ending`.
- **Empty tables:** `crm_lead_enquiries`, `lead_shortlist`, `push_subscriptions`, `webhook_inbox`, `crm_import_jobs` and `crm_units` all hold 0 rows.
- **Settings:** `crm_settings` holds only `city`, `stages`, `sources` and `firmName`.

| Screen / feature | Data today | What a demo needs to look alive | Generator change |
|---|---|---|---|
| Dashboard, Needs attention | Calling side yes: 46 unassigned in one project. **Leads side: 0 unassigned** | 3 to 6 unassigned leads that arrived today | S: some of today's arrivals with no agent |
| Leads tabs: Today, Not contacted, Follow-up overdue | Yes on build day | The same every day | Daily job, §8.3 |
| Leads tab: Going cold | Yes. Open leads silent for `reminderDays` (default) | The firm's `reminderDays` set to the value the plan used | XS: write `reminderDays` |
| Leads tab: **Came back**, and the Last enquiry column | **Empty**: no `crm_lead_enquiries` rows; `createLead` does not record an enquiry | About 5% of leads with a second enquiry more than 6 h after the first | M: arrivals through `recordEnquiry`, or better through the real ingest path (§8.3) |
| Lead record: history, site visits | Yes | — | — |
| Lead record: **shortlist** and feedback | **Empty** (`lead_shortlist` 0) | 2 to 4 listings on every Interested or Site Visit lead, one with a verdict | S: through the shortlist upsert (store.ts:695), not raw SQL |
| Lead record: matching flats | Computed (`/leads/:id/matches`). It works when a lead's requirement overlaps the stock | Interested leads whose requirement fits 2 or more listings | XS: draw residential requirements from the stock, as commercial ones already are |
| Calling: tower and configuration filters, Key Received, callbacks | Yes | — | — |
| Properties, projects, photos, Copy photo link, gallery | Yes | — | — |
| Contacts → Tenants, Ending in 30 days | Yes: 4 | — | — |
| Contacts → **Buyers** | **Empty**: 0 sale agreements; sale closes find no free sale unit | 3 to 5 sales | S: reserve sale units for sale closes |
| Phone Today, an agent's to-do | Yes on build day; **stale after**: today's bookings turn into overdue ones | Overdue, due today and a visit later today, every day | Daily job, §8.3 |
| Calendar | Reads lead follow-ups; alive when fresh. No calendar tasks (`calendar_task_assigned`) | A few bookings a manager made for an agent | S |
| Performance today | Yes on build day. **Empty after a refresh run before the build's time of day** | Today's work up to now, growing through the day | Daily job, §8.3 |
| Performance yesterday, 7 days, range view | Yes: 12+ days, one agent slipping (`offDays`) | 14 to 30 days | Done. 30 days means `AGE` up to 45 |
| Alerts bell | Raised by whichever API sweeps that database (the build deletes its own) | Open alerts that name something doable today | None. The sweep does it once the data is current |
| Team, **Alerts column** | **Everyone "off"**: no `push_subscriptions` and no session `push_state` | Someone with alerts on, and "shown this week" > 0 | **Om decides**, §8.5 |
| Settings → Response times | **Defaults** (work hours 9 to 21, SLA 24 h), while the generator plans 10:00 to 19:30 | The firm's own hours, matching its history | XS: write `workHours`, `slaHours`, `reminderDays`, `timezone` |
| Settings → Message templates | The code's default English intro | An intro message in the firm's name and language | XS |
| Settings → Brand | Colour only, no logo | Logo when the profile has one | S |
| Settings → Connections | A Website connection with a working key. **Inbox empty**; no portal connections | 10 to 20 real deliveries in the inbox, and one portal connection | M: today's arrivals POSTed to the key (§8.3) |
| Import history | Empty | One finished import of the calling list | S: owners through the import job |
| Agreement with a file | None | One with a PDF | XS |
| Admin console, Ledger | Yes (352 audit rows, made by the generator) | — | — |

**Gaps, ranked by what a pitch notices:**

1. Stale after day one.
2. Came back is empty.
3. The Team Alerts column reads "off" for everyone.
4. No shortlist.
5. The Connections inbox is empty.
6. No unassigned leads.
7. Settings sit at their defaults.
8. No buyers.
9. Calendar tasks, import history and agreement files.

### 8.2 Market presets

**One option, `"market": "us" | "india" | "gujarat"`.** It can go in the profile, or be passed as `--market=` to override it. The preset lives in `demo-profiles/markets/<market>.json` and is merged *under* the profile: any field the profile names wins.

| Field | `gujarat` (today's profiles) | `india` | `us` |
|---|---|---|---|
| Names | Patel, Shah, Desai… | A pan-India pool | US pool |
| Localities | Profile (Vadodara) | Profile (Pune, Bengaluru…) | Profile (e.g. Austin) |
| Kinds and sizes | BHK; carpet sqft; offices, warehouses | BHK; carpet sqft | Bedrooms and baths ("3 bd / 2 ba"); sq ft; single-family, condo, townhome |
| Prices | ₹; rent per month; sale in lakhs | ₹ | $; rent per month; sale $250k to $900k |
| Deal terms | 11-month rent, deposit 2 to 3 months | Same | 12-month lease, deposit 1 month |
| Phones | `+91 99555 xxxxx` (fiction block) | Same | `+1 <area> 555-01xx`, the range reserved for fiction |
| Sources | 99acres, MagicBricks, Housing.com, Walk-in, Referral, Website | Same | Zillow, Realtor.com, Website, Open house, Referral, Sign call |
| Notes language | Gujarati in Latin script | Hinglish | Plain English (as `film.json` already does) |
| Timezone, hours | Asia/Kolkata, 10:00 to 19:30 | Same | Profile (America/Chicago…), 9:00 to 18:00 |
| Deal mix | Profile | Profile | Sale-heavy (0.7 sale) |

**The generator** assumes India in about a dozen places. Make them read the preset:

- the `IST` constant and office hours (seed-demo-tenant.ts:44, 101–117);
- `en-IN` in the follow-up text (:371);
- the `+91` numbers (:132–139);
- the default sources (:264);
- the BHK area bands and lakh rounding (:244–245);
- deposits counted in months (:255, 758);
- two Gujarati fallbacks (:420 `site par malvanu`, :470 `chavi office ma aapi didhi`).

It must also write the firm's `timezone`, `workHours`, `sources` and templates into `crm_settings`. That is size **S to M**, with no product risk. **`india` and `gujarat` need no product change.**

**What blocks a US firm in the product.** Nothing stores a currency, country or locale today. `crm_settings` (key `default`) is the home for them: `updateSettings` merges any key, so no migration is needed. The backend reads them through `deskConfigOf` (store.ts:2826); the frontend reads `store.state.settings` and `src/lib/format.js`.

**Every default must give the paying firms exactly what they get today**: `currency 'INR'`, `locale 'en-IN'`, `phoneCountry '91'`. Each blocker is checked by comparing outputs before and after on a fixed set of inputs, plus read-only queries on `bhumi`.

| Blocker | Where | A real per-firm setting | Size | Risk to the paying firms |
|---|---|---|---|---|
| **Currency.** ₹ and Cr/L/k hardcoded | Central: `format.js` (`moneyParts` :39, `money`, `moneyEcho` :306, `budgetRange` :356, `ratePsf` :709). Bypasses: `matching.js:138`, `importSchema.js:16-35, 125`, `Agreements.jsx:25, 314, 317, 387, 390`, `definitions.jsx:1063`, `Modals.jsx:842, 846`, `agreements.ts:56`, `store.ts:4956`. `en-IN` grouping on counts in about 8 more files | `currency` + `locale` read by one money formatter per side; the bypasses folded in | **M** (2 to 3 days) | Low with INR as the default; display only |
| **Budget parsing.** Lakh and crore scaling | `Modals.jsx:970-976` (≤25 means crores, <100,000 means lakhs), `importSchema.js applyBareScale`, `parser.ts:124-130 money_in`, `parser.ts:278 RENT_CEILING = 500000` (a $400k sale budget is filed as rent) | The same `currency` picks the scale rules and the ceiling | **S to M** | **Medium**: a mistake changes how new Bhumi enquiries are recorded. Fixed inputs → identical outputs |
| **Phone.** +91 forced; 6 separate normalisers | `roster.ts:66`, `auth.ts:84` (login), `team.ts:130, 193, 315, 482`, `parser.ts:108-116`, `importSchema.js:70-83`, `Admin.jsx:236, 263, 277`; dialling `Modals.jsx:1575`, `matching.js:551-558`; a fixed "+91" prefix `primitives.jsx:215`, `Team.jsx:405`; placeholders in 5 files | `phoneCountry`; one `normalizePhone(raw, country)` per side; the copies deleted (rule 2). Matching on the last 10 digits holds for US numbers too | **M** (2 days) | **Highest**: a phone is identity (login, `findLeadByPhone`, merges). Stored `+91XXXXXXXXXX` must stay byte for byte |
| **Timezone.** Helper exists, no screen to set it, bypassed | `timezoneOf` (store.ts:2806–2858) exists. Bypasses: `agreements.ts:70, 111, 133, 177, 489`, `alertLifecycle.ts:121`, `notifications.ts:459`, `notificationCopy.ts:36`, `store.ts:2664 followUpWhen`, `parser.ts:182, 196 +05:30`, zone-less `en-IN` in `ingestion.ts:437`, `store.ts:4023`. Frontend: `format.js` dates plus about 9 bypasses | Already a setting (`crm_settings.timezone`); route the bypasses through it. The demo writes it directly, so no UI yet | **S to M** (1 day) | Low: the default is Kolkata |
| **Vocabulary.** BHK, RK, carpet / super built-up, RERA, Token Pending, Key Received, 11-month lease, deposit in months, Godown, Vastu, "Call Not Received / Switch Off" | `propertyFields.js` (:66, 74-93, 139-150, 165, 199-217, 234-239, 295, 335), `format.js:15 configLabel`, `Modals.jsx:660`, `parser.ts` BHK extraction, `ownerStatus.js:24-29`, `agreements.ts:268`; about 170 BHK hits in 20 files | A `market` key choosing a vocabulary set in `propertyFields.js` (one catalogue, two dialects). Stages are already per-firm | **L** (4 to 6 days), plus product calls (does a US firm have a calling list? WhatsApp or SMS?) | Low if the India set is today's file unchanged |
| **Sources and connections** | `theme.js:31`, `store.ts:183`; suggestions `Connections.jsx:22`. The parser is data-driven, so Zillow is a config row | Sources already per-firm; suggestions by `market` | **XS** | None |
| **Language** | Only an optional Marathi message language (`vocabLocale.js:84`) | Hide it outside India | **XS** | None |

**For a US firm:** currency, budget parsing, phone and timezone together come to about a week. That makes a *demo* honest on money, phones and time. Vocabulary is the rest, about another week, and needs product calls first. **Until vocabulary ships, a US demo shows "BHK".**

### 8.3 Daily refresh

**`--refresh` alone does not keep a demo alive, and run every day it damages it.** It moves every row forward by whole days. It then steps back one day every row that lands after now (seed-demo-tenant.ts:575–581). Run at night or early in the morning, before the build's time of day, it does two things:

- Nothing is left on "today", so Performance today and the to-do's "done today" are empty all day.
- The build day's rows are stacked onto yesterday. On the next run, yesterday's stack moves forward and steps back again, and picks up the day before it. **Yesterday grows by one day of history on every run.** After two weeks it holds 15 days of calls, and the range view shows one spike.

Run *after* the build's time of day, it works. But the demo is a day stale every morning until it runs, and "today" is frozen at the build's clock for the rest of the day.

**Alerts** also need more than moved dates. Notifications are in the refresh's table list, so old alerts are carried forward as new ones and pile up. Meanwhile the API's sweep raises alerts against the moved follow-ups as well.

**What keeps today alive:** a nightly roll, plus a tick through the day. New activity is replayed, not simulated:

- **Roll** (00:30 in the firm's timezone): shift by whole days as `--refresh` does. Rows that land after now are **not** stepped back. They are lifted out into `brand_config.demo.held`: today's script, about 50 to 80 events. Alerts are not shifted; any older than 7 days are deleted, and the sweep raises fresh ones.
- **Tick** (`--tick`, every 15 minutes in office hours): put back the held rows whose time has passed. Today's *new arrivals* are not held rows. They are POSTed through the firm's own ingest key at their time, and a few go to phones that already exist. That fills the Connections inbox, the enquiry rows ("Came back") and routing for real, and raises the real "new lead" alert.
- **Result:** the firm stays the same age for ever, with no snowball. Performance today grows through the day. The bell fills as follow-ups fall due. Yesterday is always the build's yesterday, so nothing visibly repeats. Simulating new work every day (arrivals ≈ closes, with pruning) was considered: it is several times the work for a difference no viewer sees.
- **Cost:** the roll is the refresh, rewritten (S). The tick is M. The ingest-key arrivals need the API reachable from where the job runs.

**Where each demo lives.** The spec says pitches are shown on production. `demo-showcase` and `demo-film` live on development, and so does `demo-vadodara` (anchored 9 Oct). Production was not read in this session, so whether it holds any `demo-` firm is unchecked. The job runs from the checkout that matches the database. EC2 already runs both side by side (`re-api` and `re-api-dev`, `docs/ops/DEPLOY.md:279`).

| Option | For | Against |
|---|---|---|
| **PM2 cron app on the EC2 box** (`pm2 start … --cron … --no-autorestart`, one per database checkout) | Next to the API it POSTs to; the database URLs are already there; nothing new holds production credentials | The script ships with the hand deploy, so it can lag the code |
| GitHub Action | Logs in one place | Production's database URL goes into GitHub secrets; a Supabase connection from outside; cannot reach the API on localhost |
| In-app scheduler | Already a 5-minute timer | Demo logic inside the process that serves Bhumi; a bug in it runs against the paying firms |

**Recommended: a PM2 cron app on EC2.** It runs `--roll` nightly and `--tick` every 15 minutes, in each demo's database checkout. It refuses any firm without the generator's marker, exactly as `--refresh` does today.

### 8.4 Build order

1. Fix the refresh snowball (S). Until the tick exists, run it only after the build's clock time.
2. Settings written from the profile; shortlist; buyers; unassigned leads (S each).
3. The market preset in the generator, with the `gujarat` and `india` presets (S to M). No product change.
4. The roll and the tick, with arrivals through the ingest key (M), plus the PM2 app.
5. The skill, from `demo-tenant-skill.md`.
6. US: product currency, budget parsing, phone and timezone settings (about a week, reviewed as money/identity work). Then vocabulary, after Om's product calls. Then the `us` preset.

### 8.5 For Om to decide

- **Which database a sales demo lives on.** The spec says production. A daily job there is a standing scheduled writer to production, and §6 asks for Om's OK on every production write. *Yes:* one standing OK for the roll and tick, on `demo-` firms carrying the marker. *No:* sales demos stay on development and are shown from the development frontend. Recommended: yes, so prospects see the real URL.
- **The Team Alerts column.** Faking device rows would make the sweep push to endpoints that do not exist, and would break "no fake features". Recommended: the presenter signs in on their own phone as the demo agent and turns alerts on, which is real. Otherwise the column reads "off".
- **A US demo before or after the US product work.** Before means showing ₹, +91 and BHK to a US broker. Recommended: after the currency, phone and timezone work. Vocabulary needs product calls first: a calling list, WhatsApp or SMS, and the stage names.
