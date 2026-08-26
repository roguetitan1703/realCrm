# Incidents — the evidence behind the six shapes

`CLAUDE.md` names six mistakes this codebase keeps making. This file holds what
each one actually cost, so the rule in `CLAUDE.md` can stay one line.

You do not need to read this to work. Read the entry when you are about to do
the thing it describes, or when you want to know whether a rule is real.

---

## 1 · Unknown is not a default

- `deal = 'sale'` was written by **five** places: `createLead`, `rowToLead` on the
  way *out*, the import row builder, `suggestConfig`'s saved default, and an
  **ungated boot migration** re-stamping every null on every restart.
- Reads did it too: `coalesce(deal, 'sale')` in eleven queries, and an intent
  filter using `NOT RENT` for "buy", which returned every lead nobody had asked.
  **buy + rent need not equal the total** — the gap is the work.
- A `<select>` with no empty option renders its **first** option when the value
  is empty, so an unanswered field read "Buy" while the record sheet said "—".
- `if (!more)` fires on `-4`; `it.badge != null` renders a badge saying "0".
- Requirements once defaulted to `{locality:'Wakad', config:'2 BHK'}` and budgets
  to a literal `'₹85L–₹1.2Cr'`, on every row of the table.

## 2 · One concept, one implementation

- **A phone number is its last ten digits** — `findLeadByPhone()`. Two paths each
  grew their own version; the importer was fixed and the webhook was not, leaving
  315 surplus rows on a live desk. Deliberately **not** `leadScope()`-filtered:
  "does this tenant already know this number" must hold regardless of who asks,
  or an agent who cannot *see* a colleague's lead makes a second copy of it.
- **When something happened** is `whenLabel()` — there were three copies.
- **"Last activity" meant four things** (25 Aug): the going-cold pile read the
  last person-authored event, the panel row label read `updated_at`, the sort
  menu item *called* "Last activity" ordered by `created_at` and was the leads
  list's default, and `minsAgo` on the card was also arrival. A lead called an
  hour ago sorted below one nobody had opened. Now `lastPersonActivity()`.
- **A deal type's label** is `DEALS` (a listing: Sell) or `DEAL_LEAD` (a person:
  Buy). One stored value once read "Sell", "Buy" and "Sale" on one record.
- **One renderer per artefact.** A browser canvas and a server renderer both made
  the PWA icon; the browser one could not see the logo and overwrote it.
- Property vocabulary broke five times, twice corrupting rows, before
  `scripts/check-vocabulary.mjs`.

**The third report in one area is not a third bug.** Follow-ups produced ten in a
row — four names for one concept, a completion tick that stored nothing, an
outcome dropdown that had never sent anything on any record, a display reading a
dead column. Each fix broke the next, because the feature had no model.

## 3 · A count and the rows it describes come from the same query

- The sidebar badge ran on `tenant_id` alone while the list it labelled ran on
  `leadScope()`, so an agent with nothing new saw a badge promising ten.
- Reporting `rows.length` as the total rendered 200 rows under a header claiming
  200 of 1,000, and made a connection with 18 pushes look like it stopped at 8.
- **Two scopes, never conflated:** visibility (RBAC) is
  `agent_id = me OR created_by = me`; "my worklist" (`mine=1`, the phone) is
  `agent_id = me`. Reusing the first for the second returned 732 rows instead of
  110, because the admin had imported everything.
- **A cache key must cover everything it validates.** `pwa_config` held one
  signature for three icon sizes, so rendering one marked the other two fresh.

## 4 · A fix to the generator does not fix what it generated

- `suggestConfig` stopped writing `defaults['req.deal']='sale'` on 2026-08-05. It
  kept firing until 08-07 from three stored `parser_config` rows.
- A boot migration ran inside `initSchema()` **on every start**, ungated,
  re-applying a default the code had stopped writing. An ungated repair cannot
  tell "never migrated" from "someone set it that way deliberately", which is how
  a stage migration kept undoing a firm's Pipeline settings.
- `crm_leads.updated_at` lived only in `migrations/010` and was applied to
  production **by hand**, so production had it and every fresh database did not —
  while the idle sweep, the retry sweep and the going-cold segments all read it. A
  new deployment would have shipped three silently broken features.

## 5 · One global key cannot answer a per-workspace question

Eight isolation bugs in two days, all this shape: the auth token, the session,
the workspace, the offline outbox, the pre-paint accent, the installed-app
caption, the manifest link, and the read cache.

- **The URL is the only authority on which workspace a tab is.** It was derived in
  FIVE places with five fallbacks to `crm_tenant_id`, which any workspace
  overwrites merely by being *visited* (the picker writes it before a password is
  typed). Fixing the derivation in front of the bug report left the other four
  answering; three "isolation is fixed" claims were wrong that way.
- **A written-but-unread key is a trap.** The next reader picks it up.
- **Changing a storage key needs a migration**, or every signed-in device meets a
  login screen on deploy — see `adoptLegacySession()`.

## 6 · Deleting or overwriting leaves references behind

- `revertImportBatch` deletes leads, properties, owners and shortlist rows and
  nothing else. One revert left 3 timeline events pointing at deleted records; the
  next would have left 582 events and 1,444 notification links. `audit_log` is the
  deliberate exception — a ledger referring to deleted rows is correct.
- An `agents → users` sync without a tenant filter overwrote real client emails
  with invented demo ones.
- `readStateCache()` failed over to **scanning localStorage and loading the first
  snapshot it found** — any firm's. One firm's desk booted with another's records.
- `updateLead` resolved columns as `req?.x ?? oldLead.req?.x`, which cannot tell
  "not mentioned" from "cleared". **A sent `req` is the whole requirement.**

---

## Operational incidents

- **A backend started with `npm run dev:api:prod` runs `tsx watch` against the
  production database.** On 2026-08-23 an edit to `store.ts` restarted it and
  applied a migration to production at 01:00 UTC. A `runOnce` gate added on this
  machine reaches production the moment a watcher restarts, months before the code
  is deployed. `runOnce` is also not concurrency-safe across two processes.
- **`npm run build` does not compile the backend.** A brace error in
  `notifications.ts` passed the build and took the API down.
- **The reassignment loop** (2026-08-24): 480 reassignments across 140 leads in
  nine minutes, 297 notifications. Two faults — a System-authored reassignment was
  not "activity" so the lead was eligible again the moment it landed, and the
  sweep's `setInterval` sat outside the `listen` callback so a port-clash process
  still swept. Fixed by `notHandedOnSince()` and a `server.on('error')` exit.
- **Re-cloning the development database wipes `metadata.retry_notified`**, so the
  whole notification backlog re-fires — 66 pushes to a real phone.
- Thirteen abandoned scratch scripts were swept up later, one of which POSTed
  fabricated leads at an ingest endpoint.
- `passwordLogin` once took `00000000` / `delpat-demo-1` / `Delpat@2026` for any
  account on any tenant.
- Onboarding writes `'ACTIVE'`, the team screen `'active'`; every real tenant uses
  the second, so `notifyRoles` matched zero users and every desk-wide alert was
  dropped for months. Compare status with `ILIKE`, and assert the recipient count.
- An afternoon went into `"req.maxBudget" is not a lead field a mapping can
  write`, which was a four-commit-stale deployed API.
