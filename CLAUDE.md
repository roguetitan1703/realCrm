# CLAUDE.md — working agreement for agents on this repo

Read this before touching anything. It is not a description of the product;
`docs/` does that. It is the things that are **not visible from the code** and
that have each cost real money or a client's trust when an agent guessed
instead of checking.

Keep it this length. When you add something, fold it into the rule it belongs
to and delete what it duplicates. A file nobody finishes reading enforces
nothing.

> **Commits carry no assistant attribution.** No `Co-Authored-By`, no tool
> name. The message explains **why the thing was broken** — nothing else.

---

## 1. What this is

**Nivaas** — a white-label real-estate CRM sold by **Delpat** to real firms.
Live production with a paying client, not a demo.

| | |
|---|---|
| Frontend | React 18 + Vite 6, **plain JSX, no TypeScript**, Vercel |
| Backend | Express 5 + Postgres (Supabase) via `postgres.js`, under `tsx`, on AWS |
| Auth | JWT + bcrypt, sliding sessions. OTP is legacy, being retired |
| Multi-tenancy | Real. Every row carries `tenant_id`; every read is scoped |

### Tenants — know which is which before you write anything

| Slug | What it is | Rule |
|---|---|---|
| `bhumi` | **Bhumi PropCity — the paying client** | Read-only unless the user names them. Never write on your own initiative |
| `delpat` | The user's own testing org | Safe. Its leads are webhook fixtures, not people |
| `skyline-realty` | Demo tenant (`DEFAULT_TENANT_ID`) | Safe |
| `test-org` | Scratch | Safe |

Anything that falls back to a *default* tenant is a bug waiting to file a real
firm's data under the demo.

---

## 2. Commands and deploys

```bash
npm run dev            # Vite on :5173, proxies /api and /pwa → localhost:5000
npm run dev:backend    # tsx watch backend/src/index.ts
npm run build          # check:vocab && vite build   ← THE ONLY VALID BUILD CHECK
```

**`npx vite build` is not a build check.** It skips the vocabulary guard, passes
happily, and the Vercel deploy then fails. You verify build errors before
pushing, not the user.

**Never push to `main`.** Vercel deploys on every commit to it, off a capped
plan. Commit locally or on a branch; the user merges and deploys.

**Frontend and backend deploy separately** — Vercel automatic, AWS by hand, so
`main` silently runs ahead of the live API. When a field or route "does not
exist", check the deployed backend's version *before* changing code: an
afternoon went into `"req.maxBudget" is not a lead field a mapping can write`,
which was a four-commit-stale API.

### Scratch scripts

```bash
cd backend
set -a && source <(grep -v '^#' ../.env | sed -E 's/\r$//' | grep DATABASE_URL) && set +a
npx tsx src/_scratch.mjs      # put them in backend/src/, DELETE them after
```

Supabase has a low connection cap — use `postgres(url, { max: 1, ssl: 'require' })`
and stop the dev backend on `too many clients`. Reusable tools go in
`backend/src/scripts/` with a header saying when to run them; one-off files get
deleted the same session. Thirteen abandoned test scripts were swept up later,
one of which POSTed fabricated leads at an ingest endpoint.

---

## 3. The five mistakes this codebase keeps making

Every trap below is an instance of one of these. Learn the shape, not the
incident — the next one will wear different clothes.

### 3.1 Unknown is not a default

Absence is information. Overwrite it and you have invented a fact nobody can
tell from a real one, and no screen will question it.

- `deal = 'sale'` was written by **five** separate places: `createLead`,
  `rowToLead` on the way *out*, the import row builder, `suggestConfig`'s saved
  default, and — the one that undid the other four — an **ungated boot
  migration** re-stamping every null on every restart. See 3.4.
- Reads did it too: `coalesce(deal, 'sale')` in eleven queries, and an intent
  filter using `NOT RENT` for "buy", which returned every lead nobody had asked.
  A row counts as sale only if it *says* sale. **buy + rent need not equal the
  total** — the gap is the work.
- A `<select>` with no empty option renders its **first** option when the value
  is empty, so an unanswered field read "Buy" while the record sheet beside it
  said "—". Optional selects carry "Not stated".
- `if (!more)` fires on `-4`; `it.badge != null` renders a badge saying "0".
  Test `> 0`.
- Requirements once defaulted to `{locality:'Wakad', config:'2 BHK'}` and
  budgets to a literal `'₹85L–₹1.2Cr'`, on every row of the table.

### 3.2 One concept, one implementation

Two implementations of one idea do not stay in agreement, and the day they
diverge nobody is looking.

- **A phone number is its last ten digits**, in `findLeadByPhone()`
  (`services/store.ts`) — stored `+919876543210`, on one tenant with spaces, and
  portals send anything. Two paths each grew their own version; the importer was
  fixed and the webhook was not, leaving 315 surplus rows on a live desk.
  Deliberately **not** `leadScope()`-filtered: "does this tenant already know
  this number" must hold regardless of who asks, or an agent who cannot *see* a
  colleague's lead makes a second copy of it.
- **When something happened** is `whenLabel()` (`src/lib/format.js`) — there
  were three copies. Relative time is honest only under an hour; past that it
  cannot be repeated to a client or lined up against a portal's report.
- **A deal type's label** is `DEALS` (a listing: Sell) or `DEAL_LEAD` (a person:
  Buy). One stored value once read "Sell", "Buy" and "Sale" on one record.
- **One renderer per artefact.** A browser canvas and a server renderer both
  made the PWA icon; the browser one could not see the logo and overwrote it.
- A property's enumerable values live in `src/data/propertyFields.js` and
  nowhere else — broken five times, twice corrupting rows, now checked by
  `scripts/check-vocabulary.mjs`. Escape hatch: `// vocab-ok: <reason>`.

### 3.3 A count and the rows it describes come from the same query

- The sidebar badge ran on `tenant_id` alone while the list it labelled ran on
  `leadScope()`, so an agent with nothing new saw a badge promising ten. Third
  site, after the phone worklist and Today.
- Reporting `rows.length` as the total rendered 200 rows under a header claiming
  200 of 1,000, and made a connection with 18 pushes look like it stopped at 8.
- **Two scopes, never conflated:**
  ```js
  visibility (RBAC)   agent_id = me OR created_by = me
  "my worklist"       agent_id = me                    ← mine=1, the phone
  ```
  Reusing the first for the second returned 732 rows instead of 110, because the
  admin had imported everything and so `created_by` matched all of it.
- Different meanings must **look** different: the badge is work waiting and is
  accent; the header is the total and is muted. And they must not share a word —
  a "New" badge (a stage) beside a "New today" pill (an arrival window) reads as
  the app contradicting itself.
- **A cache key must cover everything it validates.** `pwa_config` held one
  signature for three icon sizes, so rendering one marked the other two fresh.

### 3.4 A fix to the generator does not fix what it generated

- `suggestConfig` stopped writing `defaults['req.deal']='sale'` on 2026-08-05.
  It kept firing until 08-07 from three stored `parser_config` rows.
- The boot migration above ran inside `initSchema()` **on every start**, with no
  gate, re-applying a default the code had stopped writing.
- One-time repairs go in the ledger: `schema_migrations` + `runOnce(name, fn)`.
  An ungated repair cannot tell "never migrated" from "someone set it that way
  deliberately", which is how a stage migration kept undoing a firm's Pipeline
  settings.

When you fix a generator, **check what it already produced** — `parser_config`,
`crm_settings`, `crm_routing_rules`, `brand_config`, and the columns any
migration has touched.

### 3.5 Deleting or overwriting leaves references behind

- `revertImportBatch` deletes leads, properties, owners and shortlist rows and
  nothing else. One revert left 3 timeline events pointing at deleted records;
  the next would have left 582 events and 1,444 notification links. `audit_log`
  is the deliberate exception — a ledger referring to deleted rows is correct.
- An `agents → users` sync without a tenant filter overwrote real client emails
  with invented demo ones. Scope every write.
- `readStateCache()` looked up `crm_state_cache_<tenant>` and, failing that,
  **scanned localStorage and loaded the first snapshot it found** — any firm's.
  On a machine that has opened two workspaces, one firm's desk booted with
  another's records. No tenant now means no snapshot.
- `updateLead` resolved columns as `req?.x ?? oldLead.req?.x`, which cannot tell
  "not mentioned" from "cleared". The form sends the whole `req`, so clearing a
  field emptied the JSONB, left the column set, and the value reappeared on
  reload. **A sent `req` is the whole requirement.**

---

## 4. Other invariants

- **`MODULE_DEFINITION` drives every module** (`src/modules/definitions.jsx`):
  columns, filters, sort, actions, `card`, `phoneCard`, `progression`. Never
  hand-roll a screen. The shared renderer reads some keys unconditionally and
  this is plain JSX, so **`vite build` will not catch a missing one** — load the
  screen in a browser.
- **Server-side everything.** Pagination, filtering, sorting, counting: in SQL,
  via `useServerList` / `useServerData`. Never `.filter()` a full collection in
  the browser — one desk has 700+ owners and imports arrive in thousands.
- **Request context** (`services/context.ts`: `runWithContext`, `getContext()`,
  `tid()`) propagates through `await` and into `setTimeout`, but does not exist
  in a scheduler that never wrapped itself — `runRoutingSweeps` wraps each
  tenant explicitly. If a function takes a `tenantId`, pass it.
- **Compare status with `ILIKE`.** Onboarding writes `'ACTIVE'`, the team screen
  `'active'`; every real tenant uses the second, so `notifyRoles` matched zero
  users and every desk-wide alert was dropped for months.
- **Assert the recipient count** — delivering to an empty list is not an error,
  so it fails silently forever.
- **Never add a universal credential**, gated or not. `passwordLogin` once took
  `00000000` / `delpat-demo-1` / `Delpat@2026` for any account on any tenant.
- **Throttle background work** — a multi-tenant scan ran on `/pulse` from every
  open tab.
- **Overlays are dismissed centrally in `useNav`**, or back and tab-switch
  navigate out from under an open form.

---

## 5. Product rules the user holds you to

Non-negotiable, and they come from the user directly.

- **No fake features.** Nothing renders unless it works. No placeholder tiles,
  hardcoded statuses, invented firm names or fabricated KPIs. A number on screen
  came from the database.
- **No explanatory UI copy.** Never caption or justify a design on screen.
  Labels and values only — the buttons are the message.
- **One module standard.** Every module inherits the same list/detail/
  data-view/quick-actions machinery. No bespoke screens.
- **Reuse the existing component.** Asked for a new state (multi-select, say),
  change the *existing* toolbar; do not render a second one beside it.
- **Money is never a hero.** Data-dense, tiny-thumb-friendly cards.
- Design: charcoal/linen, ochre accent, table + full-page record.
- **Do not lose someone's work.** A modal's action row is sticky and a backdrop
  click stops closing once anything has been typed.

---

## 6. Verification discipline

The user's standing complaint is agents asserting what they have not checked.
This is the part that matters most.

1. **Query the database before claiming behaviour.** Code tells you what it
   intends; the database tells you what happened. Several "working" features had
   delivered exactly zero rows in production for months.
2. **Do not report a number a tool gave you until you have read what is in it.**
   A scope-checking script reported "65 unscoped reads"; every one was correctly
   scoped through a variable its regex could not follow. It was presented as a
   finding before one entry had been opened.
3. **Measure the blast radius before anything that writes or notifies.** Rows
   affected, per tenant, stated. Confirm `bhumi` is unaffected, explicitly.
4. **Run `npm run build`.** Every time.
5. **Drive the real UI for UI changes.** Playwright is installed; log in, click,
   assert. Phone viewport is `devices['iPhone 13']`. Measure geometry rather than
   eyeballing it — a nav bar assumed to be 63px is 72.
6. **Clean up.** Probe rows, scratch scripts, screenshots. Say that you did.
7. **Correct yourself in place**, in the code and to the user, the moment you
   find your own explanation was wrong. Never ship a comment asserting a bug
   that never existed.

---

## 7. Known open items

- **52 leads stamped `deal='sale'` are not repaired** (17 `bhumi`, 35 `delpat`),
  from before the fabrication was removed. Which were genuinely sales is knowable
  only from the stored payload:
  `backend/src/scripts/reprocess-inbox.ts --overwrite=deal`.
- **`perAgentCalls` in `getDeskSummary` is unscoped** — every agent's browser
  gets colleagues' calling throughput. The lead counts beside it are scoped.
- **`bhumi` Housing.com carries `defaults:{req.deal:'sale'}`** on a three-field
  mapping, so every Housing enquiry is stamped a sale. Awaiting richer fields
  from them. `99acres` ×2 are unmapped — nothing has arrived yet, but the first
  push will fail to parse, and two connections for one provider smells like a
  leftover.
- **9 accounts hold default passwords** as real hashes (5 `delpat`, 4
  `skyline-realty`; `bhumi` clean). Fix is `must_change_password = TRUE`.
- **`followup_due` notifications are inert on purpose** — the query reads
  `follow_up->>'due_at'` and nothing writes it; the model stores
  `{date,time,action}` with `date` as a display string. Firing it means changing
  the model, not the query.
- **`/api/v1/ingest` has no rate limit.** Write-only key, but a leaked one fills
  a desk with junk faster than agents can reject it.
- **`verifyAuditChain()` returns `ok:false` at seq 227** (a `delpat`
  `property.create`, 1 of 2,661). The ledger is sold as tamper-evident. Not
  diagnosed.
- **Import history is browser-only** — `logImportBatch` writes to React state,
  surviving only in `crm_state_cache_*`, which can silently fail to persist.
  Losing it loses the ability to revert, though rows keep `import_batch_id`.
- **Do not drop `archive_bhumi_*_20260806`** without asking — 517 archived
  leads, two of them `Deal Closed`.
- `scripts/ingest-conformance.mjs` and `ingest-lead-flows.mjs` (`test:ingest`,
  `test:leadflows`) hit a real endpoint and have not been audited for which
  tenant.
- The user sets production env vars and runs deploys. Only `.env.example` may be
  edited.

---

## 8. Where the docs are

This file deliberately does not duplicate them.

- `docs/ROADMAP.md` — **the backlog. Source of truth for what to build next.**
- `docs/specs/` — buildable plans: `auth.md`, `contacts-leads.md`,
  `properties.md`, `ingestion.md`, `enquiries.md`, `pwa.md`, `branding.md`,
  `data-lifecycle.md`
- `docs/architecture/` — architecture declaration, schema plan
- `docs/ops/DEPLOY.md` — deploy runbook
- `backend/API_SPECIFICATION.md` — API surface
- `docs/planning/`, `docs/demo-archive/` — historical. When they conflict with
  `ROADMAP.md`, ROADMAP wins.

---

## 9. Working style the user expects

- **Ship the whole task.** If part is blocked, finish the rest and say exactly
  what you left out.
- **Lead with what you found, not what you did.** State numbers, not adjectives:
  "731 of 732 owners assigned, 0 notifications sent".
- **Say plainly when you were wrong**, once, and move on.
- **No padding.** No recaps of your reasoning, no restating the task back, no
  cinematic framing of an ordinary fix. The user has said this explicitly.
- Do not re-litigate a settled decision or ask permission for ordinary work.
- Commit messages explain **why it was broken**, not what the diff shows.
