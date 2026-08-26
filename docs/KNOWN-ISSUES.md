# Known issues

Things that are **broken or misleading and that nobody is currently building**.

- Not `ROADMAP.md` — that is what to build next.
- Not `PARKED.md` — that is what was decided against, with the numbers.
- Not `STATE.md` — that is where this session left the system.

An entry leaves this file when it is fixed, or when it moves to ROADMAP because
somebody decided to do it. Every entry carries a number, measured, with the date
it was measured, or it does not belong here.

> Numbers marked **(prod, 25 Aug)** were read from the production database,
> tenant `bhumi`, read-only.

---

## Data that was fabricated before the rule existed

- **52 leads stamped `deal='sale'`** (17 `bhumi`, 35 `delpat`), from before the
  fabrication was removed. Which were genuinely sales is knowable only from the
  stored payload: `backend/src/scripts/reprocess-inbox.ts --overwrite=deal`.
- **`bhumi` Housing.com carries `defaults:{req.deal:'sale'}`** on a three-field
  mapping, so every Housing enquiry is stamped a sale. Housing is bhumi's largest
  source — **150 of 338 leads (prod, 25 Aug)**. Awaiting richer fields from them.
- **`99acres` ×2 are unmapped.** Nothing has arrived through them yet, but the
  first push will fail to parse, and two connections for one provider smells like
  a leftover.

## Counts and clocks that do not say what they mean

- **A lead's `Callback` status stores no time.** Owners has stored a real callback
  instant for months. **11 bhumi leads sit at Callback, 0 of them with a parseable
  `follow_up.at` (prod, 25 Aug)** — so nothing can tell whether a callback has
  passed, and any "late callbacks" count over leads is structurally zero.
- **5 of bhumi's 10 booked site visits have no `follow_up.at`** — a typed string
  only. 11 bhumi timeline rows are still editable free-text "Scheduled …" remarks
  from before bookings became system events.
- **The Assignments tab count disagrees with its own list.** Numbers in
  `PARKED.md`.
- **Going cold is 177 of 246 open leads — 72% of the book (prod, 25 Aug)**, while
  only **6 leads crossed the 3-day line in the last 24 hours** and the desk logged
  **37–162 person-authored events a day over the last 14 days**. The pile is not
  measuring neglect; it is measuring the long tail. See the dashboard audit.

## Notifications

- **`lead_retry_due` and `lead_stale_sla` are still firing in production — 96 in
  the last 14 days (prod, 26 Aug).** Both were deleted from this source tree; the
  backend carrying that removal is not deployed.
- **2 of bhumi's 7 agents have no push subscription** — 13 subscriptions across 5
  users (prod, 25 Aug), so alerts addressed to the other two are undeliverable
  before they are sent. `push_deliveries` records this once the backend is deployed
  (`scripts/push-delivery-report.ts`).
- **Nothing pages a going-cold lead.** Removing the retry push left the pile with
  no alert at all. The agreed design is one clubbed daily push per agent — "N leads
  going cold" — not one per lead. Not built.
- **The alert volume was 606 in 14 days for 216 leads (prod, 26 Aug)**, and
  **four of seven agents had read none of theirs** (Mohit 0/72, Mukesh 0/64,
  Vinod 0/57, Ravish 0/43). Seven types were deleted on 26 Aug; the expected
  volume over the same fortnight is ~250. **Unverified until the backend is
  deployed** — re-run the count then, and check whether the four start reading.
- **9 of 14 remaining types are ungated** by any setting the firm can see. The
  Settings → Alerts section is parked in `PARKED.md` and would render
  `notificationCatalogue.ts` directly.

## Security and integrity

- **10 live accounts hold a known default password (prod, 26 Aug, verified by
  bcrypt-comparing every one of the 30 users).** `bhumi` is **NOT** clean, which
  this file previously claimed:

  | tenant | accounts | password |
  |---|---|---|
  | `bhumi` | **`bhumipropcity` — the owner** | `Bhumi@2026`, no must-change flag |
  | `delpat` | `akashpatel` (owner), `kavish`, `mohit` | `00000000` |
  | `delpat` | `siddharthvarma` (manager), `rupali` | `delpat-demo-1` |
  | `skyline-realty` | all 4, incl. the owner | `delpat-demo-1` |

  Both sources are now closed — `Admin.jsx` no longer pre-fills `Bhumi@2026`
  into the onboarding form (it was in the public bundle), and
  `backfillPasswordAuth()` no longer hashes one shared constant across every
  tenant with `must_change_password = FALSE`. **Neither fix changes an existing
  password.** The ten above are still live until someone resets them, and the
  bhumi owner is the urgent one.
- **`/api/v1/ingest` has no rate limit.** Write-only key, but a leaked one fills a
  desk with junk faster than agents can reject it.
- **`verifyAuditChain()` returns `ok:false` at seq 227** (a `delpat`
  `property.create`, 1 of 2,661). The ledger is sold as tamper-evident. Not
  diagnosed.
- **Three queries in `getDeskSummary` are unscoped** — `perAgentCalls`,
  `perAgentLeadCalls`, `perAgentVisits`. Not rendered to an agent, but present in
  the JSON their browser receives. Detail in `PARKED.md`.

## Fixed 26 Aug, still broken on the live desk until deployed

- **A notification click opened a browser tab instead of the installed app,
  whenever the app was closed.** The manifest sets `scope: "/<slug>/"` and the
  worker registers at `/<slug>/`; the push URL was built as `/<slug>?screen=…`,
  with no trailing slash, so it fell outside that scope. With the app open the
  click handler focuses the existing window, so it worked; from a cold start
  `clients.openWindow()` matched no installed manifest and fell back to a tab.
  Fixed in `notifications.ts` (the sender, needs the **backend** deployed) and
  normalised in `public/sw.js` (needs the **frontend** deployed, and also
  rescues every push already sitting in a phone's tray).

## Environment drift

- **Production has no `agents` table; it has `crm_agents` (prod, 25 Aug)**, which
  is what the code writes. Any script written against `agents` will fail on
  production and may succeed on a differently-shaped database — check the table
  list before trusting a scratch query.
- **bhumi has zero owners (prod, 25 Aug)**, so the entire Owners / calling-queue
  surface is empty for the paying client. `hasCalling` correctly hides its tiles;
  every number about owners is a `delpat`/dev-only number.
- **`crm_settings` has no `desk` row for bhumi (prod, 25 Aug)** — the firm has
  never set "gone cold after N days", so the 3-day default is ours, not theirs.
- **bhumi's routing sweeps are both disabled** (`sweep_unassigned_enabled:false`,
  `reassign_idle_enabled:false`) (prod, 25 Aug).
- **Import history is browser-only** — `logImportBatch` writes to React state,
  surviving only in `crm_state_cache_*`, which can silently fail to persist.
  Losing it loses the ability to revert, though rows keep `import_batch_id`.

## Fixed here, still true on the live desk

- **A firm with no localities of its own was offered four Pune neighbourhoods**
  as filter options — `Hinjewadi Phase 3`, `Wakad`, `Baner`, `Kothrud` — each
  matching zero rows. `suggest.js` deleted exactly these lists; this copy in
  `definitions.jsx` survived.

## Deliberate, do not "fix"

- **The audit ledger UI is hidden on purpose** — leave the commented-out nav entry.
- **Do not drop `archive_bhumi_*_20260806`** without asking — 517 archived leads,
  two of them `Deal Closed`.
- `scripts/ingest-conformance.mjs` and `ingest-lead-flows.mjs` (`test:ingest`,
  `test:leadflows`) hit a real endpoint and have not been audited for which tenant.
