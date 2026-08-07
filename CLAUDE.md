# CLAUDE.md — working agreement for agents on this repo

Read this before touching anything. It is not a description of the product;
`docs/` does that. It is the set of things that are **not visible from the code**
and that have each cost real money or a client's trust when an agent guessed
instead of checking.

> ## Commits: no `Co-Authored-By`
>
> Do not add a `Co-Authored-By:` trailer, or any other attribution to an
> assistant, to commit messages on this repo. The commit message explains **why
> the thing was broken** — nothing else belongs in it.

---

## 1. What this is

**Nivaas** — a white-label real-estate CRM sold by **Delpat** (the agency).
It is a **live production SaaS with a paying client**, not a demo.

| | |
|---|---|
| Frontend | React 18 + Vite 6, **plain JSX, no TypeScript**, deployed on Vercel |
| Backend | Express 5 + Postgres (Supabase) via `postgres.js`, run under `tsx`, on AWS |
| Auth | JWT + bcrypt passwords, sliding sessions. OTP is legacy, being retired |
| Multi-tenancy | Real. Every row carries `tenant_id`; every read is scoped |

### Live tenants — know which is which before you write anything

| Slug | What it is | Rule |
|---|---|---|
| `bhumi` | **Bhumi PropCity — the paying client** | Do not modify their data. Ever. Read-only unless the user explicitly names them |
| `delpat` | Delpat's own workspace — **the user's testing org** | Safe to experiment on. Its "leads" are webhook test fixtures, not people |
| `skyline-realty` | The demo tenant (`DEFAULT_TENANT_ID`) | Safe to experiment on |
| `test-org` | Scratch | Safe |

`DEFAULT_TENANT_ID = 'skyline-realty'`. Anything that falls back to a default
tenant is a bug waiting to file a real firm's data under the demo.

---

## 2. Commands

```bash
npm run dev            # Vite on :5173, proxies /api and /pwa → localhost:5000
npm run dev:backend    # tsx watch backend/src/index.ts
npm run build          # check:vocab && vite build   ← THE ONLY VALID BUILD CHECK
```

### `npx vite build` is not a build check

`npm run build` runs the **vocabulary guard** first. `npx vite build` skips it,
passes happily, and the Vercel deploy then fails. This has already broken a
production deploy once.

**You verify build-time errors before pushing, not the user.** Always
`npm run build`.

### Never push to `main`

Vercel deploys on **every commit to `main`**. A session that pushes six commits
spends six production deployments off a capped plan. Commit on a branch; the
user merges and deploys.

### The frontend and the backend deploy separately

Vercel (frontend) is automatic. AWS (backend) the user deploys by hand. So
`main` is routinely **ahead of the running API**, and the two drift apart
silently. This has already cost a debugging session: the mapper offered fields
the deployed `WRITABLE` had never heard of, and the errors read like a code bug
("`req.maxBudget` is not a lead field a mapping can write") when the code was
right and the API was four commits stale.

When a field, route or config "does not exist", check the deployed backend's
version before you change any code.

### Running the backend for a scratch script

```bash
cd backend
set -a && source <(grep -v '^#' ../.env | sed -E 's/\r$//' | grep DATABASE_URL) && set +a
npx tsx src/_scratch.mjs      # put scratch files in backend/src/, DELETE them after
```

Supabase has a low connection cap. A scratch script contending with a running
dev backend produces `too many clients already`. Use
`postgres(url, { max: 1, ssl: 'require' })` for ad-hoc queries, and stop the dev
backend first if you hit the cap.

---

## 3. Architecture invariants

These are not style preferences. Breaking one produces a bug that ships.

### 3.1 `MODULE_DEFINITION` drives every module

`src/modules/definitions.jsx` holds one definition per module. It drives columns,
filters, sort, actions, `card`, `phoneCard`, `phoneActions`, `progression`.

- **Never hand-roll a screen.** Add a field/filter/sort/action by editing config.
- The shared renderer reads some keys **unconditionally**. Omitting one crashes
  at runtime — and because this is plain JSX, **`vite build` will not catch it**.
  If you add a module or change a definition, load the screen in a browser.

### 3.2 The vocabulary guard

A property's enumerable values are declared in `src/data/propertyFields.js` and
**nowhere else**. This rule was broken five separate times, twice corrupting
rows. It is now checked mechanically by `scripts/check-vocabulary.mjs`.

Escape hatch when a literal is genuinely right:

```js
'super built-up',  // vocab-ok: display prose
```

### 3.3 Server-side everything

Pagination, filtering, sorting and **counting** happen in SQL. Use
`useServerList` / `useServerData`. Never `.filter()` a full collection in the
browser — the client desk has 700+ owners and imports arrive in the thousands.

A group's **count** and its **rows** are two different queries. Reporting
`rows.length` as the count is how Today once rendered 200 rows under a header
claiming 200 out of 1,000.

### 3.4 Two different scopes — do not conflate them

```js
visibility (RBAC)   agent_id = me OR created_by = me
"my worklist"       agent_id = me                    ← mine=1, the phone
```

Reusing the RBAC scope for the phone's queue returned 732 rows instead of 110,
because the admin had imported every row and so `created_by` matched everything.

### 3.5 Request context

`backend/src/services/context.ts` — `AsyncLocalStorage`, `runWithContext`,
`getContext()`, `tid()`. It **does** propagate through `await` and into
`setTimeout`. It does **not** exist in a scheduler that never wrapped itself, so
`runRoutingSweeps` wraps each tenant explicitly. When a function already takes a
`tenantId` argument, pass it explicitly rather than relying on ambient state.

### 3.6 One-time repairs go in the ledger

`schema_migrations` + `runOnce(name, fn)`. A repair left ungated re-runs on every
boot against live rows, and cannot tell "never migrated" from "someone set it
that way deliberately" — which is how a stage migration kept silently undoing a
firm's Pipeline settings.

### 3.7 A phone number is its LAST TEN DIGITS, in one function

`findLeadByPhone()` in `services/store.ts`. Numbers are stored `+919876543210`,
and on one tenant `+91 98765 43210` with spaces; portals and spreadsheets send
whatever they please. Comparing cleaned strings calls those different people —
it left 315 surplus rows on a live client desk, one number twelve times over.

Two independent code paths each grew their own version of this, and the
importer was fixed while the webhook was not. **Resolve a person in that one
function.** It is deliberately not `leadScope()`-filtered: "does this tenant
already know this number" must be true regardless of who is asking, or an agent
who cannot *see* a colleague's lead will cheerfully create a second copy of it.

### 3.8 A saved config outlives the code that wrote it

Removing a bad default from the code does **not** remove it from configs already
stored. `suggestConfig` stopped writing `defaults['req.deal'] = 'sale'` on
2026-08-05; it kept firing until 2026-08-07 out of three saved
`integrations.parser_config` rows, inventing a deal type on every push. The one
provider that was clean was clean only because someone happened to re-run
auto-detect on it.

When you fix a generator, **check what it already generated.** The same applies
to `crm_settings`, `crm_routing_rules` and `brand_config`.

---

## 4. Product rules the user holds you to

These come from the user directly and are non-negotiable.

- **No fake features.** Nothing renders unless it works. No placeholder tiles,
  no hardcoded statuses, no invented firm names, no fabricated KPIs. If a number
  is on screen it came from the database.
- **No explanatory UI copy.** Never caption or justify a design on screen.
  Labels and values only.
- **One module standard.** Every module inherits the same list/detail/data-view/
  quick-actions machinery. No bespoke screens.
- **Reuse existing components.** When asked for a new state (e.g. multi-select),
  change the *existing* toolbar — do not render a second one beside it.
- **Money is never a hero.** Data-dense, tiny-thumb-friendly cards.
- Design: charcoal/linen with an ochre accent, table + full-page record.

---

## 5. Verification discipline

The user's standing complaint is agents asserting things they have not checked.
This is the part of the file that matters most.

1. **Check the database before claiming behaviour.** Reading the code tells you
   what it intends. Querying tells you what happened. Several "working" features
   here had delivered exactly zero rows in production for months.
2. **Measure the blast radius before shipping anything that notifies or writes.**
   Count the affected rows per tenant and state the numbers. Confirm `bhumi` is
   unaffected, explicitly.
3. **Run `npm run build`.** Every time.
4. **Drive the real UI for UI changes.** Playwright is installed. Log in, click
   the thing, assert. A phone viewport is `devices['iPhone 13']`.
5. **Clean up.** Delete scratch scripts, probe rows and screenshots. Say so.
6. **Correct yourself in place.** If mid-task you find your own explanation was
   wrong, fix the comment and say so plainly — do not ship a code comment that
   asserts a bug that never existed.

---

## 6. Traps that have already bitten

Each of these shipped and had to be fixed. They are here so they are not
rediscovered a second time.

| Trap | What happened |
|---|---|
| `status = 'ACTIVE'` | Onboarding writes `'ACTIVE'`, the team screen writes `'active'`. Every real tenant uses the second, so `notifyRoles` matched **zero users** and every desk-wide alert was silently dropped. Compare with `ILIKE`. |
| Fanning out to nobody | Delivering to an empty user list is not an error. It fails silently forever. Assert the recipient count. |
| Two renderers for one picture | A browser canvas and a server renderer both produced the PWA icon; the browser one couldn't see the logo and overwrote the good one. One renderer per artefact. |
| Cache key vs cached items | `pwa_config` held one signature but three icon sizes, so refreshing one marked the other two fresh. A cache key must cover everything it validates. |
| Negative truthiness | `if (!more) return null` renders when `more` is `-4`. Test `> 0`. |
| Nav that ignores overlays | Screen state and modal state lived in different places, so back and tab-switch navigated out from under an open form. Overlays are now dismissed centrally in `useNav`. |
| Unscoped mirror writes | An `agents → users` sync without a tenant filter overwrote real client emails with invented demo ones. Scope every write. |
| Hardcoded passwords | `passwordLogin` and `superadminLogin` accepted `00000000` / `delpat-demo-1` / `Delpat@2026` for any account on any tenant. Removed. Never add a universal credential, gated or not. |
| Scanners on `/pulse` | A multi-tenant scan ran on every poll from every open tab. Throttle background work. |
| A cache that falls back to *any* tenant | `readStateCache()` looked up `crm_state_cache_<tenant>` and, failing that, **scanned localStorage for any key with that prefix and loaded the first one** — three lines under a comment promising the opposite. It fires whenever the tenant key is absent: cold boot before identity resolves, a cleared key, or a snapshot that lost its own write to `QuotaExceededError`. On a machine that has opened two workspaces, one firm's desk boots with another firm's records. No tenant now means no snapshot. |
| A count and a size that look identical | The sidebar badge is **work waiting** (`byStage['New']`); the page header is the **total**. Both rendered as the same grey chip, so 19 beside 31 read as the app contradicting itself. Different meanings must look different — the badge is accent, the size is muted. |
| `!= null` on a number | The mirror of the negative-truthiness trap. Both badge callers default to `0`, so `it.badge != null` rendered a badge saying "0" on every quiet desk. Test `> 0`. |
| Deleting rows and leaving their references | `revertImportBatch` deletes leads, properties, owners and shortlist rows — and nothing else. A revert on 2026-08-03 left 3 timeline events pointing at records that no longer exist; the 2026-08-06 revert would have left 582 events and 1,444 notification links. `audit_log` is the deliberate exception: a ledger referring to deleted rows is correct. |

---

## 7. Known open items

- **9 accounts still hold default passwords** as stored hashes (5 on `delpat`
  including the owner at `00000000`, 4 on `skyline-realty`). `bhumi` is clean.
  Left from the one-time `backfillPasswordAuth` cutover, which was unscoped by
  tenant. Fix is `must_change_password = TRUE` on those rows — not yet done.
- **`followup_due` notifications are inert on purpose.** The query reads
  `follow_up->>'due_at'`; nothing writes that key, because the follow-up model
  stores `{date, time, action}` where `date` is a display string like `'Today'`.
  Making it fire is a change to the follow-up model, not to the query.
- **Two fabricated `@skylinerealty.in` emails** remain on `delpat` users. The
  user has seen them and chosen to leave them.
- The user sets production env vars and runs deploys themselves. Only
  `.env.example` may be edited.

### Open as of 2026-08-07

- **`/api/v1/ingest` has no rate limit.** The key is write-only — it cannot read
  a record — but a leaked one can fill a client's desk with junk enquiries
  faster than agents can reject them. Keys are per-provider, so a leak is
  rotated in isolation.
- **`verifyAuditChain()` returns `ok: false` at seq 227** — a `delpat`
  `property.create` from 2026-08-01, out of 2,661 rows. Predates the 08-07
  session. The ledger is sold as tamper-evident and the owner-facing view reads
  from it, so this is either a real break or another false positive like
  `2af3c32`. Not yet diagnosed.
- **Import history is browser-only.** `logImportBatch` dispatches to React state
  and nothing else — there is no server table. It survives in
  `crm_state_cache_*`, which `writeStateCache` warns can silently fail to
  persist. The Revert button reads the batch id from that log, so losing the log
  **loses the ability to revert** even though the rows still carry
  `import_batch_id`.
- **`bhumi` imports were reverted on 2026-08-07** at the client's request — 494
  leads, 582 timeline events, 1,444 notifications. Archived first to
  `archive_bhumi_leads_20260806` (517 rows, each tagged `archived_reason`),
  `archive_bhumi_timeline_20260806`, `archive_bhumi_notifications_20260806`.
  **Two `Deal Closed` records are in there** (Manan, Nitin Dhawan) — recoverable,
  and the client was told. Do not drop those tables without asking.
- Every bhumi lead now arrives by integration. That makes §3.7 the *only*
  deduplication in the product.

---

## 8. Where the docs are

`CLAUDE.md` deliberately does not duplicate them.

- `docs/ROADMAP.md` — **the backlog. Source of truth for what to build next.**
- `docs/specs/` — buildable plans: `auth.md`, `contacts-leads.md`,
  `properties.md`, `ingestion.md`, `pwa.md`, `branding.md`, `data-lifecycle.md`
- `docs/architecture/` — architecture declaration, schema plan
- `docs/ops/DEPLOY.md` — deploy runbook
- `backend/API_SPECIFICATION.md` — API surface
- `docs/planning/`, `docs/demo-archive/` — historical. When they conflict with
  `ROADMAP.md`, ROADMAP wins.

---

## 9. Working style the user expects

- Ship the whole task. If part is blocked, finish everything else and say
  exactly what you left out.
- Lead with what you found, not with what you did. The user reads results.
- State numbers, not adjectives. "731 of 732 owners assigned, 0 notifications
  sent" beats "notifications were not working well".
- Do not re-litigate a decision already made. Do not ask permission for
  ordinary work.
- Commit messages explain **why it was broken**, not what the diff shows.
