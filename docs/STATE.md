# State — where the last session left the system

**Overwritten every session, never appended.** `git log` is the history; this is
the handoff. Only what git cannot tell you belongs here: what is *deployed* (as
opposed to committed), what is waiting on the user, and what was checked against
a live database so the next session neither re-derives it nor assumes it.

Open bugs go in `docs/KNOWN-ISSUES.md`, not here. Point at them. The working
plan for the Mahalaxmi batch is `docs/specs/mahalaxmi-batch.md` (latest: part E).

**Last session: 2026-09-28.**

---

## Deployed

| | at | how |
|---|---|---|
| Backend — AWS EC2, **by hand** | `f03dcd1` when last read (24 Sep, `/health`) | `scripts/deploy-api.sh` on the box — refuses a dirty tree or a branch other than `main` |
| Frontend — Vercel | not recorded | **Branch Tracking is OFF** — a push to `main` does not deploy; the user deploys by hand |
| `main` | `a3b51c0` | |
| `development` | 41 commits ahead of `main` | agreements and conversion (D), the activity report, contacts tabs, the copy sweep, Today / My work / Performance, Properties Part 7, the superadmin console, the per-firm ledger, the build's name check, tutorials, and (28 Sep) calling tabs, property tabs + project list + duplicate, the photo editor, the import switch, listings added |

**Deploy order: API first, then frontend.** The new frontend calls
`/agreements`, `/public/gallery`, the `contact` counts and fields the old API
does not have.

What the API deploy runs on production, once:
- additive schema: `crm_agreements` and its columns, the index
  `idx_crm_timeline_day (tenant_id, timestamp)`, four property columns
  (`verified_at`, `verified_by`, `gallery_off`, `gallery_version`),
  `sessions.support_by`, `superadmins.failed_logins / locked_until`,
  `audit_log.chain` with its index, the `audit_checks` table and its `reason`
  column;
- `runOnce 2026_09_25_intro_message_no_dashes`: a firm's saved intro message
  loses its em dash (the old default becomes the new one); logs which firms
  (user's OK for all firms, 25 Sep);
- `runOnce 2026_09_25_agreement_party_copy`: fills an agreement's own tenant or
  buyer name and phone from its lead where empty. Production had one agreement
  (urban, a demo firm) with the name already set; nothing on bhumi or mahalaxmi.

After the API deploy:
- the superadmin console signs out once (its old 30-day token has no session);
- the first ledger check reads the whole legacy chain once (about 8,000 rows,
  paged); after that only new rows;
- `npm run link:owners -- --env=production` (report, then `--apply`) to join
  listing owners to calling rows — not yet run on production.

---

## Waiting on the user

- **Review on dev, merge `development` → `main`, deploy** (API, then frontend).
- **How many production listings are an invented flat A-101.** Until 166eba6,
  createProperty wrote tower `A` and unit `101` for any listing saved without
  them (a calling row converted before its flat was known, a copy). Dev: 3 of
  delpat's 25 read A-101, 1 of urban's reads unit 101. A real A-101 and an
  invented one look the same; on production (bhumi, mahalaxmi) the count needs
  the user's OK to read, and any repair needs the user's decision per firm.
- **Superadmin console built** (mahalaxmi-batch.md, "Superadmin — as built"):
  console session, support view, firm page, per-firm ledger, setup email.
  Worth a look on dev at `/admin` before deploying.
- **Properties Part 7** built (mahalaxmi-batch.md Part 7). 7.6 still wants the
  production count of shortlist use; reading it needs the user's OK.
- **Photo links on production** are `https://<app>/<firm>/photos/<project>-<code>`; the Vercel rewrite
  already sends every path to the app. The page reads `/api/v1/public/gallery`,
  so it needs the API deployed first like everything else.
- **Production timing of the dashboard** after the deploy: the only number is
  from before (Bhumi's leads report 2 s). A read-only check was blocked by the
  permission tool; ask before retrying.

---

## Checked this session

- **Dev only, `delpat`, desk 1440 and iPhone 13, no page errors.**
- Calling: every tab's count equals its list total, firm-wide and inside
  Godrej Green Vistas (All 726 · Callbacks 7 · New 709 · Interested 4 · Key
  Received 4 · Closed 9); a reload and a record round trip keep the tab; × goes
  to the 13 project cards with the URL cleared. The phone shows the signed-in
  person's own list; with the owner signed in (holds none) every tab read 0 and
  matched. Not checked: an agent who holds rows, on the phone (no agent password).
- Properties: tab counts equal list totals firm-wide (23) and in Oakridge
  Towers; project band, Add unit, filter menu (Tower, Flat no.; no Project or
  Status); bulk duplicate → confirm → copies with "No flat no. yet", found by
  Flat no. → Not added yet; single duplicate → form → "Save without a flat
  number?" on desk and phone; old `?project=` links land on the filtered list.
  Every probe listing deleted by id (listings back to 23).
- Photos, on `p_1790420338574_60jw` (6 items): Make cover moves in 35 ms desk /
  105 ms phone and saves; drag reorders; remove + Undo leaves 6 on screen and
  on the server; a refused save puts the tiles back. Order restored; the 19
  "Photos" history lines the runs wrote were deleted.
- Listings added: a probe listing by akashpatel showed in Performance (Listings
  1), his day, and Team today; deleted.

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
