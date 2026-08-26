# CLAUDE.md — working agreement

Read this before touching anything. Keep it under ~150 lines. When you add
something, fold it into the rule it belongs to and delete what it duplicates.
A file nobody finishes reading enforces nothing.

> **Commits carry no assistant attribution.** No `Co-Authored-By`, no tool name.
> The message explains **why the thing was broken** — nothing else.

---

## 1. Who this is for

**Nivaas** — a white-label real-estate CRM sold by **Delpat** to real firms.
Live production with a paying client, not a demo.

Two people use it, and every screen belongs to one of them:

- **An agent, on a phone, between calls.** They want the next person to ring and
  a way to record what happened in one thumb. They do not browse.
- **The firm's owner or manager, at a desk.** They want to know whether the team
  is working the book and where it is stuck — *by agent*. They do not want
  inventory breakdowns; they want to know who to talk to today.

**Before you change a screen, say in one line who it is for and what they are
trying to get done.** Reading what the code does is a different answer. If you
cannot say, ask. Skipping this is how eight correct changes add up to a desk
nobody can read.

A number on a screen must be something a person can act on today. A count that
only ever grows is wallpaper — nobody works it, and it teaches people to ignore
the screen it sits on. A notification that does not name something doable today
is noise, and noise costs more than silence.

### Tenants — know which is which before you write anything

| Slug | What it is | Rule |
|---|---|---|
| `bhumi` | **Bhumi PropCity — the paying client** | Read-only unless the user names them. Never write on your own initiative |
| `delpat` | The user's own testing org | Safe. Its leads are webhook fixtures, not people |
| `skyline-realty` | Demo tenant (`DEFAULT_TENANT_ID`) | Safe |
| `test-org` | Scratch | Safe |

Multi-tenancy is real: every row carries `tenant_id`, every read is scoped.
Anything that falls back to a *default* tenant files a real firm's data under the
demo.

---

## 2. Commands and deploys

```bash
npm run dev            # Vite on :5173
npm run dev:api        # backend → DEVELOPMENT db on :5001 (watch)
npm run dev:api:prod   # backend → PRODUCTION db on :5000 — this WRITES to prod
npm run build          # check:vocab && vite build   ← the only valid frontend check
npm run seed:dev       # synthetic leads into the development db
```

- **`npx vite build` is not a build check.** It skips the vocabulary guard and the
  Vercel deploy then fails.
- **`npm run build` does not compile the backend.** Parse it separately:
  `npx esbuild <changed backend files> --outdir=/tmp/ck`.
- **Never push to `main`.** Vercel deploys on every commit to it, off a capped
  plan. Work on `development`; the user merges and deploys.
- **`dev:api:prod` is a production writer.** A watcher restart runs `initSchema()`
  against production — adding a `runOnce` gate on this machine is a production
  write. Do not leave one running.
- **Two databases, and the process refuses to guess.** `APP_ENV=development`
  selects `DEV_DATABASE_URL` and will not fall back. Boot refuses if both URLs
  name the same project or `JWT_SECRET` is missing. `vite build` refuses without
  `VITE_API_URL`. `.env*` are not committed; only `.env.example` may be edited.
- **Frontend and backend deploy separately** — Vercel automatic, AWS by hand — so
  `main` silently runs ahead of the live API. When a field or route "does not
  exist", check the **deployed** backend's version before changing code.

**Scratch scripts** go in `backend/src/` and are **deleted the same session**.
Reusable tools go in `backend/src/scripts/` with a header saying when to run them.
Supabase has a low connection cap: `postgres(url, { max: 1, ssl: 'require' })`,
and stop the dev backend on `too many clients`.

---

## 3. The six mistakes this codebase keeps making

Every trap is an instance of one of these. Learn the shape, not the incident —
the next one wears different clothes. What each one cost is in `docs/incidents.md`.

1. **Unknown is not a default.** Absence is information. Overwrite it and you have
   invented a fact nobody can tell from a real one. A row counts as *sale* only if
   it says sale; optional selects carry "Not stated"; test `> 0`, not truthiness.
2. **One concept, one implementation.** Two implementations of one idea do not
   stay in agreement, and the day they diverge nobody is looking. A phone number
   is `findLeadByPhone()`. "When it happened" is `whenLabel()`. "Last activity" is
   `lastPersonActivity()`. Property vocabulary is `src/data/propertyFields.js`.
   **A catalogue file per concept, and the screen reads it**: the piles are
   `services/leadSegments.ts`, the alerts are `services/notificationCatalogue.ts`
   (what fires it, who gets it, whether it pushes, what the firm can change).
   A rule written at its call site is a rule nobody can find.
   **The third report in one area is not a third bug — stop patching and model it.**
3. **A count and the rows it describes come from the same query.** Same scope,
   same expression, one request. Two meanings must look different and must not
   share a word. Never conflate RBAC visibility with "my worklist".
4. **A fix to the generator does not fix what it generated.** Check
   `parser_config`, `crm_settings`, `crm_routing_rules`, `brand_config` and any
   column a migration touched. One-time repairs go through
   `schema_migrations` + `runOnce(name, fn)` — an ungated repair cannot tell
   "never migrated" from "set that way deliberately". **`initSchema()` is the only
   migration runner; `migrations/*.sql` is documentation.**
5. **One global key cannot answer a per-workspace question.** The URL is the only
   authority on which workspace a tab is — `currentTenant()`, nothing else. Key
   storage by tenant (`crm_auth_session_<tenant>`), never store-one-and-compare. A
   written-but-unread key is a trap. Verify with two accounts in two workspaces
   signed in at once in one browser.
6. **Deleting or overwriting leaves references behind.** Scope every write. Read a
   row before you overwrite it. A sent `req` is the whole requirement — `??` cannot
   tell "not mentioned" from "cleared".

---

## 4. Invariants

- **`MODULE_DEFINITION` drives every module** (`src/modules/definitions.jsx`).
  Never hand-roll a screen. Plain JSX, so `vite build` catches nothing — load it.
- **Server-side everything.** Pagination, filtering, sorting, counting: in SQL via
  `useServerList` / `useServerData`. Never `.filter()` a full collection.
- **Request context** (`services/context.ts`) propagates through `await` and
  `setTimeout` but not into a scheduler that never wrapped itself. If a function
  takes a `tenantId`, pass it.
- **Compare status with `ILIKE`**, and **assert the recipient count** — delivering
  to an empty list is not an error, so it fails silently for ever.
- **Never add a universal credential**, gated or not. **Throttle background work.**
- **Overlays are dismissed centrally in `useNav`.**
- **A filter lives in the URL, not in a screen's state.** `sel.leadFilters` is one
  bag; nav.js mirrors it into the query string. Opening a record keeps the filters
  under it; a tab or sidebar item is a fresh arrival and clears them. Filter
  changes REPLACE the history entry.
- **Every entry point must land on a control you can see.** A tile that filters by
  something with no pill and no chip is as broken as one that filters nothing.
- **Assignment is history.** Any path that changes `agent_id` writes an
  `assignment` timeline event through `recordAssignment()`.

---

## 5. Product rules the user holds you to

- **No fake features.** Nothing renders unless it works. A number on screen came
  from the database.
- **No explanatory UI copy.** Never caption or justify a design on screen. Labels
  and values only.
- **One module standard.** Every module inherits the same list/detail/data-view/
  quick-actions machinery. No bespoke screens. **Reuse the existing component** —
  asked for a new state, change the existing toolbar; do not add a second one.
- **Money is never a hero.** Data-dense, tiny-thumb-friendly cards.
  Charcoal/linen, ochre accent, table + full-page record.
- **Do not lose someone's work.** A modal's action row is sticky; a backdrop click
  stops closing once anything has been typed.

---

## 6. Verification discipline

The user's standing complaint is agents asserting what they have not checked.

1. **Query the database before claiming behaviour.** Code tells you what it
   intends; the database tells you what happened. Several "working" features had
   delivered zero rows in production for months.
2. **Do not report a number a tool gave you until you have read what is in it.**
3. **Measure the blast radius before anything that writes or notifies** — rows
   affected, per tenant, stated, and `bhumi` confirmed unaffected.
4. **Run `npm run build`, and parse the backend separately.** Every time.
5. **Drive the real UI for UI changes** when the user has not asked you to stop.
   Playwright is installed; phone viewport is `devices['iPhone 13']`. Measure
   geometry rather than eyeballing it. Verify where the person uses it: "the
   server received the flag" is not "the filter is visible".
6. **Say what the thing is FOR before you change it** — see §1.
7. **Clean up.** Probe rows, scratch scripts, screenshots. Say that you did.
8. **Correct yourself in place**, in the code and to the user, the moment you find
   your own explanation was wrong. Never ship a comment asserting a bug that never
   existed.

---

## 7. The documents, and what each one is for

Read `docs/STATE.md` first — it is the only place that says where each half of
the system is deployed. Then the one that matches what you are doing.

| File | Its job | Written when |
|---|---|---|
| `CLAUDE.md` | How to work here. Rules only, no incidents, no backlog | Rarely. Fold, don't append |
| `docs/STATE.md` | **Where the last session left the system.** Deployed vs committed, what is waiting on the user, what was checked against the live database | **Overwritten every session** |
| `docs/ROADMAP.md` | What to build next. Source of truth for priority | When priority changes |
| `docs/KNOWN-ISSUES.md` | Broken or misleading, nobody building it. Every entry carries a measured number | When something is found or fixed |
| `docs/PARKED.md` | Decided *against*, with the numbers, so it is not rediscovered or "fixed" | When something is declined |
| `docs/incidents.md` | What the six shapes actually cost | When a rule needs its evidence |
| `docs/specs/` | Buildable plans: `auth`, `contacts-leads`, `properties`, `ingestion`, `enquiries`, `pwa`, `branding`, `data-lifecycle`, `notifications` (how an alert reads), `notification-delivery` (whether it arrives) | Before building |
| `docs/architecture/`, `docs/ops/DEPLOY.md`, `backend/API_SPECIFICATION.md` | Reference | As needed |

`docs/planning/` and `docs/demo-archive/` are historical. When they conflict with
`ROADMAP.md`, ROADMAP wins.

**Do not put a finding in more than one of these.** A bug goes in KNOWN-ISSUES
*or* ROADMAP, never both; STATE points at it rather than restating it. Duplicated
across two files, it will be fixed in one and stay open in the other.

---

## 8. Working style the user expects

- **Ship the whole task.** If part is blocked, finish the rest and say exactly
  what you left out.
- **Lead with what you found, not what you did.** Numbers, not adjectives:
  "731 of 732 owners assigned, 0 notifications sent".
- **Say plainly when you were wrong**, once, and move on.
- **Use the user's word for a thing.** They named the quick action FAB; calling it
  "the sheet" later cost an exchange.
- **No padding.** No recaps of your reasoning, no restating the task back, no
  cinematic framing of an ordinary fix.
- Do not re-litigate a settled decision or ask permission for ordinary work.
