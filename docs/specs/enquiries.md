# Enquiries — a person is not an enquiry

**Status:** 🧭 planning · **Roadmap block:** new (F) · **Supersedes** the dedupe
approach sketched in `backend/src/scripts/dedupe-leads.ts`

> ## Update — 2026-08-07: the migration is gone, the model matters more
>
> After a call with the client, **both `bhumi` imports were reverted** — 494
> leads deleted (archived first), leaving 29 that all arrived by webhook. The
> client's decision: work only from the integration feed.
>
> **§6 below is therefore obsolete as a plan of work.** There is no duplicate
> backlog to collapse, no fabricated `deal` to repair across 517 rows, no
> enriched sheet coming, and no enquiry-date column to chase from the client.
> It is kept because the *reasoning* is still the argument for the model, and
> because the archive tables it describes still exist.
>
> Three things this changes:
>
> 1. **D11 gets simpler.** "Enquiries are built from raw, never from a derived
>    lead row" now has exactly one raw source: `webhook_inbox`. No sheet, no
>    reconciliation between two origins.
> 2. **The model is load-bearing, not a cleanup.** Every lead now arrives by
>    integration, so a repeat enquiry from one buyer is the normal case, not an
>    edge. Today the second push becomes a note and fills empty fields.
> 3. **Person resolution is the only dedupe left in the product**, and it landed
>    on 2026-08-07 as `findLeadByPhone()` (`CLAUDE.md §3.7`) — the webhook path
>    had been comparing cleaned phone strings and would have rebuilt exactly the
>    duplicates the client just paid to be rid of.
>
> Also fixed the same day, and the reason §5.1's "record an enquiry, derive the
> person" is worth building: `defaults['req.deal'] = 'sale'` was still stored in
> three saved parser configs long after the code stopped writing it, asserting a
> deal type on every push. 72 rows cleared, 22 of them on the client's board.
> See `CLAUDE.md §3.8`.

> One sentence: `crm_leads` is currently asked to be three things at once — a
> person, a requirement, and an enquiry — and the third one is *many*, so every
> repeat enquiry looks like a duplicate person and gets routed to a new agent.

---

## 1. The evidence this comes from

Measured on `bhumi` (2026-08-06, read-only). These numbers are the argument;
nothing here is inferred from the code.

| | |
|---|---|
| Rows in `crm_leads` | **517** |
| Actual people (distinct last-10-digits) | **202** |
| Rows that are not a distinct person | **315** |
| Rows with an unusable phone | 0 |

Two imports of one sheet, nine minutes apart:

| Batch | Time | Rows | People |
|---|---|---|---|
| `imp_1785744575550` | 2026-08-03 08:09:37 | 247 | 179 |
| `imp_1785745109448` | 2026-08-03 08:18:31 | 247 | 179 |
| MagicBricks / Housing / Website | Aug 4–6 | 23 | 23 |

All 179 people appear in **both** batches — the importer then compared raw phone
strings, so `+919876543210` and `98765 43210` were different people (fixed
2026-08-05 in `1538925`, after this happened).

And **the sheet itself repeated people**: 38 people on more than one line, 68
extra rows *inside a single batch*. 247 lines described 179 people. One person
appears on 10 lines.

Group sizes are 2, 4, 6, 8, 10, 12 and 20 — every one exactly 2× its sheet
count, with 23 singletons for the webhook leads. That arithmetic closes: exactly
one duplicate import, no third.

**The repeats are not duplicates.** Within one batch they disagree on budget —
up to 3 distinct budgets for one person — and sometimes on configuration. They
are one person's enquiry history. The column that would have told them apart,
"property interested", was never mapped, which is *why* they collapse into
identical-looking rows. Strip the discriminator from ten distinct events and you
get ten apparent duplicates.

The visible symptom: **122 people are assigned to 2 agents, 17 to 3, 13 to 4,
and 6 to five or six.** Round-robin gave each copy to a different person, so up
to six agents are cold-calling one number.

---

## 2. Decisions (locked)

| # | Decision | |
|---|---|---|
| **D1** | **The person is the canonical record.** One row per phone per tenant, forever. The requirement (deal, config, budget, locality) stays as fields on that person. Enquiries live beneath it. | locked |
| **D2** | **Enquiries get a first-class table**, `crm_enquiries` — not a JSONB blob on the timeline. It follows the precedent already set and documented by `activities`. | locked |
| **D3** | **A re-enquiry changes the status.** The CRM does not wait for an agent to notice. Only **terminal** statuses reopen (`Deal Closed`, `Rejected`); an open lead is already live. | locked |
| **D4** | Reopening lands on a new **`Re-enquired`** status — a 9th value in `LEAD_STATUSES`. Never `New`; `New` means never touched, and reusing it would erase exactly the history we want visible. | locked |
| **D5** | **Assignment belongs to the person, not the enquiry.** Routing runs once, on first appearance. Every later enquiry **notifies the owning agent** instead of routing again. | locked |
| **D6** | **An enquiry is never deduplicated.** It is a fact that happened. Two identical sheet rows are two enquiries. | locked |
| **D7** | **Storage truth and display grouping are different questions.** Both rows stored; the record groups them with a `2×` multiplier. | locked |
| **D8** | On merge, **most work wins and credit is preserved**. Where nobody has worked the person — which is ~173 of 179 — it ties, and those rebalance round-robin. | locked |
| **D9** | **The client never learns the word "enquiry."** The desk still says Leads, one row per person. This model surfaces as richness on the record, never as a second module. | locked |
| **D10** | `crm_timeline_events` **dissolution is deferred** to its own block. This spec adds a fourth source to the read-time feed and does not disturb the existing three. | locked |

### The store-selection rule

Goes into `CLAUDE.md` when this builds. It is what stops the muddle recurring:

- Came from **outside**, and is a fact that happened → **`crm_enquiries`**
- An **agent did it**, and the firm measures it → **`activities`**
- The **system changed a record's state** → **`audit_log`**
- None of the above → it probably does not need storing

---

## 3. Why a table, and what is deferred

`activities` already carries the reasoning, in its own schema comment:

> *Why this is its own table and not another `crm_timeline_events` row: the
> derived property views and the `site_visits_done` metric all query by
> `property_id` and `outcome`. As real indexed columns those are cheap; buried
> in a JSONB metadata blob they are not. […] the two are merged into one feed at
> read time, so the UI still shows a single timeline.*

Enquiries need exactly that: "Godrej Green Vistas drew 40 enquiries this month,
12 of them from MagicBricks" is a question a broker asks constantly, and it is a
`GROUP BY` on indexed columns or it is nothing.

**The deferred half, recorded so it is not rediscovered.** `crm_timeline_events`
is currently doing two unrelated jobs. Of the types in use, `stage_change`,
`assignment`, `lead_reassigned`, `lead_unrouted`, `merge` and `creation` are
**`audit_log`'s job being done twice** — once hash-chained, once not; and
`remark_added`, `note` and `followup_set` are work product, which is
`activities`' job. The end state is that `crm_timeline_events` dissolves and
"timeline" becomes purely a read-time union. That is a separate block: it
touches every record view, the phone surface, notifications and the audit
ledger, on a live client's data. **Not now. But nothing new lands in it.**

---

## 4. Data model

```sql
CREATE TABLE crm_enquiries (
  id            TEXT PRIMARY KEY,
  tenant_id     TEXT NOT NULL,
  lead_id       TEXT NOT NULL,          -- the person. Owns the enquiry.

  -- WHEN. Two columns, because they are two different facts and conflating
  -- them is how "10 enquiries" becomes a number with no chronology.
  occurred_at   TIMESTAMPTZ,            -- NULLABLE: when they actually enquired
  recorded_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),  -- when we learned of it

  -- WHAT they asked about.
  property_text TEXT,                   -- free prose: "Joyville Hinjawadi"
  property_id   TEXT,                   -- REFERENCE ONLY, nullable, usually null
  deal          TEXT,                   -- sale | rent, vocabulary-guarded
  config        TEXT,
  locality      TEXT,
  budget_min    BIGINT,
  budget_max    BIGINT,
  message       TEXT,                   -- what the buyer actually typed

  -- WHERE IT CAME FROM. Makes two identical enquiries distinguishable and
  -- traceable back to raw, which is why D6 can safely never deduplicate.
  channel       TEXT NOT NULL,          -- portal | import | manual | walk-in
  source        TEXT,                   -- 'MagicBricks', 'Housing.com', …
  inbox_id      TEXT,                   -- webhook_inbox row, for portal pushes
  import_batch_id TEXT,                 -- for imports
  source_row    INTEGER,                -- the line number in that sheet
  metadata      JSONB DEFAULT '{}'::jsonb,

  -- DELIVERY identity, not enquiry identity. See §5.5 — this is the only thing
  -- that may ever collapse two enquiry writes into one, and it exists so that a
  -- portal retry and an inbox replay do not inflate the count.
  dedupe_key    TEXT,

  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_enq_delivery ON crm_enquiries (tenant_id, dedupe_key)
  WHERE dedupe_key IS NOT NULL;

CREATE INDEX idx_enq_lead     ON crm_enquiries (tenant_id, lead_id, COALESCE(occurred_at, recorded_at) DESC);
CREATE INDEX idx_enq_source   ON crm_enquiries (tenant_id, source, recorded_at DESC);
CREATE INDEX idx_enq_property ON crm_enquiries (tenant_id, property_text) WHERE property_text IS NOT NULL;
```

**`property_id` is a reference only**, never ownership — the same rule
`activities` already enforces. A property record must never accumulate enquiries
of its own; the relationship can change without mutating it.

**No `agent_id` on an enquiry.** An enquiry is inbound and has no owner. The
*response* has an owner, and that is an `activity`. (For the historical
migration only, the agent holding the row at the time is stamped into
`metadata.migrated_from_agent_id`, so the fact is not lost.)

### What stays on `crm_leads`

The person, and their *current* requirement — derived from their enquiries:

| Field | Reconciliation rule |
|---|---|
| `budget_min` / `budget_max` | **lowest ever enquired / highest ever enquired.** The columns are literally a range and are currently unused (`budget_min` is populated on 1 of 517 rows). Nothing is lost and the agent sees the true span to match stock against. |
| `deal` | latest enquiry wins; every value preserved on the enquiries |
| `requirement` / `req.config` | the set — "1 BHK, 2 BHK" is a real answer |
| `locality` | the set |
| `req.interest` | **derived, never flattened** — the distinct set of `property_text` |
| `stage`, `agent_id`, `follow_up` | belong to the person. One each. Never touched by an enquiry except per D3/D4. |

---

## 5. Rules

### 5.1 An enquiry arrives (portal, import, or by hand)

```
resolve person by last-10-digits of phone, within tenant
  ├─ no match → create person, ROUTE (round-robin), status = New
  └─ match    → do NOT route. Attach enquiry to the existing person.
                ├─ status is terminal → status = 'Re-enquired', notify owner
                └─ status is open     → status unchanged, notify owner,
                                        SLA clock refreshed
recompute the derived requirement (budget span, sets)
```

D5 in one line: **routing happens once per person.** This is the rule that stops
six agents dialling one number, and it stops it for imports and webhooks alike.

### 5.2 Re-enquiry, visibly

`Re-enquired` is a status, so it filters as a pill. What it came back *from* is
**derived, not a flag we maintain**: the enquiry is a permanent row and the
status change is an `audit_log` entry, so "Deal Closed → re-enquired 6 Aug via
MagicBricks about Joyville Hinjawadi" reconstructs from stored fact.

`rejection_reason` already exists as a column, which makes *"rejected for low
budget, came back at ₹32,000"* a query. That is probably the most valuable
question this whole model unlocks.

### 5.3 Display

Never a fake date. Where `occurred_at IS NULL`:

```
Joyville Hinjawadi · 2 BHK · ₹25,000 · MagicBricks        2×
   recorded 3 Aug — enquiry date not supplied · rows 47, 112
Godrej Green Vistas · 2 BHK · ₹32,000 · MagicBricks       1×
   12 Jul 2026
```

The lead list shows an enquiry count badge. That count is a `COUNT(*)`, not
`rows.length` — the trap `CLAUDE.md §3.3` already names.

### 5.4 Ordering with a nullable date

Every ordering uses `COALESCE(occurred_at, recorded_at)`. Enquiries with no real
date sort by when we learned of them, and say so on screen.

### 5.5 Every path that creates a lead — and the count

**Invariant: a person cannot exist with zero enquiries.** They are in the CRM
*because* they enquired. So the count is never 0, and it is never "updated" as a
separate step — it is `COUNT(*)` over the enquiries table. There is no counter
to drift.

**The enquiry is written inside person-resolution, never by the caller.** Today
three server entry points create a lead — `routes/leads.ts:155`,
`routes/records.ts:92`, `services/ingestion.ts:453` — and the webhook path
already carries a scar from exactly this: its round-robin was *"its own copy of
the same logic `createLead()` has, and both copies raced the same way"*
(`ingestion.ts:446`). One function resolves the person and records the enquiry.
A fourth caller added later then cannot get the count wrong.

| Path | Number already on file? | What happens |
|---|---|---|
| Desk / phone manual add | no | create person, **route**, enquiry #1 |
| Desk / phone manual add | **yes** | no new person. Enquiry appended, count +1, reopen if terminal, **notify the owner — never reassign** |
| Portal push | no | create person, **route**, enquiry #1 |
| Portal push | yes | enquiry appended, notify owner. *(Today this becomes a note — see §7)* |
| Import row | no | create person, **route**, enquiry #1 |
| Import row | yes — incl. an earlier line of the same file | enquiry appended. **This is the 68 repeated rows, and now they survive** |
| Portal **retry** of a push already processed | — | **nothing.** Not an enquiry |
| `reprocess-inbox` replay | — | **nothing new.** Counts must not move |

### 5.6 Delivery is not the same as fact

D6 says never deduplicate an enquiry. The ingest layer holds an idempotency lock
(`ingest:<integration>:<externalId>`, `ingestion.ts:403`). **These look
contradictory and someone will eventually get it wrong**, so state it plainly:

- **The fact** — a person enquired — is never deduplicated. Two identical sheet
  rows are two enquiries.
- **The delivery** — one HTTP push, one sheet line, one replay of a stored
  payload — is deduplicated, because delivering the same fact twice does not
  make it happen twice.

`dedupe_key` carries the delivery identity, under a partial unique index:

| Channel | `dedupe_key` | Effect |
|---|---|---|
| portal | the existing `ingest:<integration>:<externalId>` | a retry writes nothing |
| import | `<import_batch_id>:<source_row>` | re-running a batch cannot double-write, but **two different rows in one sheet each get their own enquiry** |
| manual / walk-in | `NULL` | never collapsed — a human said it happened |

This is what makes `reprocess-inbox.ts` safe. Without it, replaying the 67 stored
inbox rows would inflate every enquiry count on the record, and the repeat
signal — the whole point of the model — would become noise.

### 5.7 Manual add of a number that already exists

Two things make this harder than it looks.

**RBAC.** Lead visibility is `agent_id = me OR created_by = me`. If agent B
types a number owned by agent A, B *cannot see* A's lead — so a check scoped to
what B can see would happily create a duplicate, which is the bug this whole
spec exists to kill. **The existence check must be tenant-wide.** Disclosure
must not be: B is told *"already on file with Amit Arya — your enquiry will be
added to their record"*, and nothing more. Enough to prevent the duplicate and
route the fact; not a way to read a colleague's book by typing numbers.

**Ownership.** B just did real work on A's person. Per D5 this does **not**
reassign. B's call is logged as an `activity` attributed to B, so the credit is
recorded on the work rather than by moving the lead. Whether the firm wants an
explicit hand-over action on top of that is a separate question, deliberately
not answered here.

---

## 6. Migration — the 517 bhumi rows

Runs in this order. Every step dry-run first, per the two scripts already in
`backend/src/scripts/`.

**Step 0 — repair `deal` BEFORE anything merges.** Import 1 wrote `deal='sale'`
on all 247 rows (the fabrication removed 2026-08-05). Import 2 has a real split,
135 rent / 112 sale. For **112 people the two imports disagree**. The existing
survivor rule is stage → assigned → filled-count → *oldest*, and since budget,
config and locality are byte-identical across the two imports (0 differences
across all 179 people), it falls through to oldest — which is import 1. **99
rent seekers would be frozen as `sale`.** Corroboration: 128 rows in import 1
are `sale` with a budget under ₹2 lakh — ₹24,000, ₹27,999, ₹32,000. Those are
monthly rents. This step must complete before step 2.

**The repair does not have to pick a batch.** Measured 2026-08-06: import 2's
`deal` agrees with `dealFromBudget()` (`parser.ts:206`, `RENT_CEILING` =
₹5,00,000 judged on the top of the range) on **247 of 247 rows — zero
disagreement**. Import 2 *is* that inference. So the repair recomputes with the
function the product already uses, and the result is independently reproducible
rather than resting on which import we believe. **Every imported row has a
budget**, so there is no ambiguous remainder: 135 → `rent`, 112 → `sale`.

**Also in step 0: 18 webhook rows assert `sale` with no budget at all** — 15
MagicBricks, 3 Housing.com. `dealFromBudget` returns `null` for these, and
`null` is the correct stored value. "We don't know" prompts someone to ask; a
confident wrong answer matches rent seekers against sale stock. Same function,
same pass. (Verify one fresh push after the MagicBricks reconfiguration to
confirm the live path no longer does this.)

### D11 — Enquiries are built from RAW, never from a derived lead row

**Locked.** This corrects an earlier draft of this section, which reconstructed
enquiries from the 517 `crm_leads` rows and then re-imported the enriched sheet
on top. That is wrong twice over:

1. **It would double every enquiry.** The enriched sheet describes *the same 247
   events already in the database*. Reconstruct-then-import creates a second set,
   and D6 says never deduplicate an enquiry, so we would faithfully keep both.
   `dedupe_key` does not save us — the reconstructed rows would carry the old
   batch ids and row numbers that were never recorded, and the new import brings
   a fresh batch id, so nothing collides. Naveen would go from 10 enquiries to
   20, silently.
2. **It preserves the lossy copy and discards the original.** The sheet holds
   more than `crm_leads` ever did — the property-interested column, and
   hopefully the date. Rebuilding thin enquiries from derived rows and then
   trying to enrich them is backwards.

`webhook_inbox` already embodies the right rule: keep the raw, derive from it,
replay when the mapping improves. The sheet is simply the import path's raw.

**So the split is:**

- **People** come from the existing rows — they carry stage, agent, remarks,
  timeline and follow-ups, which exist nowhere else.
- **Enquiries** come from raw — the enriched sheet, and `webhook_inbox`.

Nothing is reconstructed from a row that is about to be deleted, because the
doomed rows hold nothing unique: their `req` is byte-identical across the two
imports (0 differences across all 179 people).

**Step 1 — collapse to 202 people.** Survivor by D8; the survivor absorbs
remarks, shortlist, feedback and timeline events exactly as `dedupe-leads.ts`
already does. Each merge stamps `metadata.merged_agent_ids` so the fact that a
person was also on another agent's list is not lost. No enquiries exist yet —
which is fine, because none of the deleted rows was going to be their source.

**Step 2 — enquiries from `webhook_inbox`** for the 23 portal leads. The stored
payloads are *richer than the leads they produced* (this is what `2e680d3`
found: 8 of 11 MagicBricks fields were being discarded). `occurred_at` comes
from the payload's own timestamp via the existing `datetime_in` transform.

**Step 3 — enquiries from the enriched sheet**, once the client sends it. One
enquiry per row: 247 enquiries across 179 people, `dedupe_key =
<batch>:<row>`, `occurred_at` from the date column if they include it.

**Step 4 — the invariant sweep.** Any person left with zero enquiries — someone
in the CRM but absent from the new sheet — gets one `channel='migration'`
enquiry recording what is known, explicitly marked as reconstructed. Expected to
be a small number; **report it, never leave it silent.**

**Step 5 — recompute the derived requirement** on all 202 survivors from their
enquiries: budget span, sets, `req.interest`.

**Step 6 — clean `email`.** 462 of 517 hold the literal string `-` from the
sheet; 36 are real addresses, 19 null. It reads as 96% populated and is actually
7%. Null the placeholders.

**Ordering constraint.** Step 1 must precede step 3. Re-importing while
duplicates are still present matches the incoming row against *one* of the
copies and leaves the others thin — the warning `dedupe-leads.ts` already
carries in its own docstring.

**Rollback.** Steps 2–6 are additive or reversible from the enquiries table; the
one destructive act is the step-1 delete. Snapshot `crm_leads` for the tenant to
a timestamped table first, and keep it until the client has signed off. Gated
through `runOnce()` per `CLAUDE.md §3.6`.

**Blast radius, to be restated with fresh numbers at apply time:** `bhumi`
517 → 202 rows. Agents drop from ~71–75 leads each to ~29. **That is a large,
visible change on a paying client's screens and they must be told before it
happens, not after.** `delpat`, `skyline-realty` and `test-org` are untouched by
this migration.

---

## 7. Convergence — one destination for both paths

Today a portal push creates-or-fills a lead and a sheet row creates-or-merges a
lead, and **each has grown its own dedupe rules**. Under this model both do the
same thing: *record an enquiry, derive the person.* That is the part that makes
the product better rather than only fixing `bhumi`.

The webhook path already *states* this model — *"the same buyer enquiring twice
is one lead with two enquiries, not two leads"* (`ingestion.ts:409`). It has
simply had nowhere to put the second enquiry, so it writes a note and fills
empty fields. That note becomes an enquiry row.

**Two defects found while tracing that path, both live:**

1. **It matches phones by exact cleaned string, not last-ten-digits**
   (`ingestion.ts:410–412`). So a portal sending `9876543210` does not match a
   lead stored as `+919876543210`. The *importer* was fixed to the p10 rule on
   2026-08-05 (`1538925`); **the webhook path was not.** It does not bite
   `bhumi` today — all 23 webhook leads have a p10 distinct from the 179
   imported people — but it is one differently-formatted push away from
   creating exactly the duplicates this spec is cleaning up.
2. **It calls `getLeads()` and scans in memory** to do that match — the
   full-collection read that the 2026-08-02 refactor removed everywhere else,
   against `CLAUDE.md §3.3`.

Person-resolution moving into one function fixes both by construction.

The import merge is currently the sharper problem. `mergeLeads`
(`backend/src/services/store.ts:1892`) carries **notes and timeline events
only**, then deletes the duplicate — it never reads `req`. So re-importing the
enriched sheet today would write "property interested" to a temporary row and
delete it milliseconds later, **for all 179 people already on file.** Only
brand-new rows would keep it. The importer's own side is fine: `LEAD_FIELDS` has
had a `Property interested` field since `1538925`. The merge step is what
discards it, and enquiries are what replace that merge.

### 7.1 The import stops talking about duplicates

Consequence of D11, and the reason the current flow feels wrong: a lead import
is no longer *"create or merge leads"*. It is **"record enquiries; create people
as needed."**

Today the preview would tell the person importing their own customer list that
it found *"179 duplicates to merge"* — which is a strange thing to say about 179
real people who simply enquired before. Under this model it reads:

```
247 enquiries · 179 people · 179 already on file · 0 new
```

`selfDup` — the flag for a row duplicating an earlier line of the same file,
which currently causes the row to be **skipped outright** — is deleted. Those 68
rows are exactly the repeat enquiries this spec exists to keep. The word
"duplicate" leaves the lead import almost entirely, because under this model
there aren't any. It stays in the **owners** import, which is a genuine unique
list of units and has no enquiry concept.

---

## 8. Cascade — what this touches

| Area | Change |
|---|---|
| `backend/src/services/db.ts` | `crm_enquiries` table + indexes; `Re-enquired` into stored stage config |
| `backend/src/services/store.ts` | `createEnquiry`, person resolution by p10, derived-requirement recompute; `mergeLeads` reworked |
| `backend/src/services/ingestion.ts` | webhook push writes an enquiry, not a lead-fill |
| `backend/src/services/parser.ts` | map `occurred_at` from the portal's own timestamp (the `datetime_in` transform already exists) |
| `backend/src/services/notifications.ts` | re-enquiry alert to the owning agent; SLA clock refresh |
| routing | route once per person, never per enquiry |
| `backend/src/routes/leads.ts` | enquiry count in list summaries (`COUNT(*)`), enquiry feed on the record |
| `src/data/leadStatus.js` | `Re-enquired` — vocabulary guard, colour map, pill, filters, counts |
| `src/modules/definitions.jsx` | enquiry count column; record-view enquiry section. **Load every changed screen in a browser** — `CLAUDE.md §3.1`: plain JSX, `vite build` will not catch a missing key |
| `src/lib/importSchema.js` | **enquiry-date field** + synonyms (does not exist today) |
| `src/modules/ImportPage.jsx` | repeated rows become enquiries, not discarded duplicates; **`selfDup` skip deleted**; preview reads "247 enquiries · 179 people" (§7.1) |
| Phone surface | enquiry count + feed on the lead record |
| `docs/specs/ingestion.md`, `contacts-leads.md` | both now describe a superseded merge model |
| `CLAUDE.md` | the store-selection rule; the routing-once rule |
| `docs/specs/data-lifecycle.md` | retention policy for `crm_enquiries` — see §9 |

---

## 9. Retention (E7 gate)

`crm_enquiries` is append-only and grows with every portal push, so it cannot
land without a policy — the roadmap's E7 review-gate. Proposal, to settle before
build: **enquiries are never purged while their person exists**; they are
deleted with the person, and a tenant export includes them. The volume is
small — a busy tenant is thousands of rows a year, not millions — and the raw
payloads they point at (`webhook_inbox`) carry their own retention already.

---

## 10. Open — needed before build

1. **The client's sheet must carry an enquiry-date column.** Without it every
   reconstructed and re-imported enquiry has `occurred_at = NULL`, and "10
   enquiries" is a count with no chronology — ten in a week and ten over eight
   months mean opposite things. **Ask for it in the same message as the sheet.**
   Also ask whether their export is one row per enquiry (the evidence says yes)
   and whether the repeats were intentional.
2. **Does `Re-enquired` need the client's blessing?** It adds a word to the
   eight statuses they agreed. D4 is locked on our side; they should hear it.
3. **Multiple requirements per person** — someone buying *and* renting out — is
   explicitly **out of scope** (D1). The enquiry history shows it and the sets
   carry it. Revisit only if the client hits the limit in practice.
4. Whether the historical enquiry reconstruction should also run on `delpat`
   (94 leads, 0 duplicates measured) or only `bhumi`.

---

## 11. Explicitly not in this spec

- Dissolving `crm_timeline_events` (D10) — its own block.
- Enquiry analytics screens. The table makes them a query; the screens are
  separate scope and must not be built speculatively (`CLAUDE.md §4`, no fake
  features).
- Any change to `activities` or `audit_log`.
