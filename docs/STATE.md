# State — where the last session left the system

**Overwritten every session, never appended.** `git log` is the history; this is
the handoff. Only what git cannot tell you belongs here: what is *deployed* (as
opposed to committed), what is waiting on the user, and what was checked against
a live database so the next session neither re-derives it nor assumes it.

Open bugs go in `docs/KNOWN-ISSUES.md`, not here. Point at them. The working
plan for the Mahalaxmi batch is `docs/specs/mahalaxmi-batch.md` (latest: part E).

**Last session: 2026-09-25.**

---

## Deployed

| | at | how |
|---|---|---|
| Backend — AWS EC2, **by hand** | `f03dcd1` when last read (24 Sep, `/health`) | `scripts/deploy-api.sh` on the box — refuses a dirty tree or a branch other than `main` |
| Frontend — Vercel | not recorded | **Branch Tracking is OFF** — a push to `main` does not deploy; the user deploys by hand |
| `main` | `a3b51c0` | |
| `development` | about 16 commits ahead of `main` | agreements and conversion (D), the activity report, contacts tabs, the copy sweep, Today / My work / Performance |

**Deploy order: API first, then frontend.** The new frontend calls
`/activity/range`, `/agreements` and fields the old API does not have.

What the API deploy runs on production, once:
- additive schema: `crm_agreements` and its columns, and the index
  `idx_crm_timeline_day (tenant_id, timestamp)`;
- `runOnce 2026_09_25_agreement_party_copy`: fills an agreement's own tenant or
  buyer name and phone from its lead where empty. Production had one agreement
  (urban, a demo firm) with the name already set; nothing on bhumi or mahalaxmi.

After the API deploy: `npm run link:owners -- --env=production` (report, then
`--apply`) to join listing owners to calling rows — not yet run on production.

---

## Waiting on the user

- **Review on dev, merge `development` → `main`, deploy** (API, then frontend).
- **Superadmin work** is planned, not built: mahalaxmi-batch.md part E. Support
  access decided read-only and always allowed.
- **Properties Part 7** (verification visit, gallery link and the rest): set
  aside by the user.
- **Production timing of the dashboard** after the deploy: the only number is
  from before (Bhumi's leads report 2 s). A read-only check was blocked by the
  permission tool; ask before retrying.

---

## Checked this session

- **Dev only.** Today / My work / Performance driven in Chromium, desk 1440 and
  iPhone 13: agent desk lands on Today, no horizontal scroll on the phone, Back
  from a teammate returns to the Team tab, a dashboard row opens that person,
  picking a bar reads that day. No page errors.
- `/activity/range` on dev: 0.7–1.1 s warm for 7, 14 and 30 days.
- The copy sweep: 98 on-screen strings; what still has an em dash is server
  logs, the API client's internal error separator, and SQL reading old titles.

---

## Do not repeat

- Dev has demo data on `delpat`:
  - `npm run seed:dev:activity` (rerun 25 Sep): three days of agent work.
    `-- --clear` removes it and restores what it moved.
  - `npm run seed:dev:inventory`: 19 flats (`p_demo_`), 22 owners (`own_demo_`),
    4 agreements, 2 leads. `-- --clear` removes them.
- The dev activity seed writes call events but not `crm_owners.last_call_at`,
  so on dev the dashboard's "People called today" reads 0 beside Team today's
  calls. A real logged call sets both.
- Left in place on dev because the user converted it: the calling row "zeta
  probe heights" (`own_1790258291624_0_7945dd`) and the flat made from it.
- Playwright's WebKit build is not downloaded; phone checks ran in Chromium with
  the iPhone 13 descriptor.
- The dev database is shared with the user's own preview testing. Delete only
  your own probe rows, by id.
- Read-only scripts that import `services/store.ts` must set `CRM_NO_BOOT=1`,
  or importing the store runs `initSchema()` against whatever database it names.
