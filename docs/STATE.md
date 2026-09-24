# State — where the last session left the system

**Overwritten every session, never appended.** `git log` is the history; this is
the handoff. Only what git cannot tell you belongs here: what is *deployed* (as
opposed to committed), what is waiting on the user, and what was checked against
a live database so the next session neither re-derives it nor assumes it.

Open bugs go in `docs/KNOWN-ISSUES.md`, not here. Point at them. The working
plan for the Mahalaxmi batch is `docs/specs/mahalaxmi-batch.md`.

**Last session: 2026-09-24.**

---

## Deployed

| | at | how |
|---|---|---|
| Backend — AWS EC2, **by hand** | `f03dcd1` when last read (24 Sep, `/health`) | `scripts/deploy-api.sh` on the box — refuses a dirty tree or a branch other than `main` |
| Frontend — Vercel | not recorded | **Branch Tracking is OFF** — a push to `main` does not deploy; the user deploys by hand |
| `main` | `a3b51c0` | |
| `development` | 3–4 commits ahead of `main`: the Status column at import, the activity report | |

**Deploy order: API first, then frontend.** The frontend reads fields and
routes the old API does not have (Contacts showed "47 clients", empty, on
production for exactly this reason — new frontend, old API).

After the API deploy: `npm run link:owners -- --env=production` (report, then
`--apply`) to join listing owners to calling rows — not yet run on production.

---

## Waiting on the user

- **Merge `development` → `main` and deploy** (API, then frontend). The API
  deploy runs the additive schema (crm_agreements, two columns) and one
  runOnce that writes ONE agreement on the demo firm `urban` from its old
  tenancy; nothing on bhumi or mahalaxmi.
- **Conversion and agreements (D) — review on dev.** Leads' "Deal Closed"
  cannot be renamed yet; see the plan, "D, as built".
- **Activity report — Mahalaxmi's owner to see it.** The words ("calls",
  "answered", "no outcome written", "Now") are the spec's guess at how he
  talks; his answer is the real check. Open: an end-of-day push, and whether
  "today" plus the day stepper is enough.
- **The Status column at import** stays (`d381de2`) unless the user says it
  makes the import too heavy; the back-fill for rows already in was declined —
  PARKED.md.

---

## Checked against production this session (read-only)

- Mahalaxmi: 3,731 owners, all New; 0 person calls on the calling list today
  (24 Sep, 18:00 IST). Agents hold 627–789 each.
- Bhumi activity, 23 Sep, report vs an independent query: Siddhi 34 calls —
  9 answered, 16 not received, 2 busy/off, 7 no outcome; exact match.
- Only 24% of bhumi's calls carry an outcome (114 of 485, 30 days). The report
  shows the rest as "no outcome written" on purpose.

**Incident, no data changed.** A scratch script that imported
`services/store.ts` ran `initSchema()` against production (importing the store
starts the boot). It got through five `CREATE TABLE IF NOT EXISTS` and three
`ADD COLUMN IF NOT EXISTS`, all already present, before the connection closed —
no seed or `runOnce` reached. Read-only scripts now set `CRM_NO_BOOT=1` before
importing the store, which skips the boot.

---

## Do not repeat

- Dev has demo activity on `delpat` (`npm run seed:dev:activity`, 24 Sep):
  three days of calls, notes, status changes and callbacks by its agents, and
  five enquiries this morning. `-- --clear` removes it and puts every moved
  record back.

- Playwright's WebKit build is not downloaded for the installed version
  (1.61.1); phone checks this session ran in Chromium with the iPhone 13
  descriptor. `npx playwright install webkit` if a real WebKit pass is needed.
- The dev database is shared with the user's own preview testing. Delete only
  your own probe rows, by id.
