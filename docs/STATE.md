# State — where the last session left the system

**Overwritten every session, never appended.** `git log` is the history; this is
the handoff. Only what git cannot tell you belongs here: what is *deployed* (as
opposed to committed), what is waiting on the user, and what was checked against
a live database so the next session neither re-derives it nor assumes it.

Open bugs go in `docs/KNOWN-ISSUES.md`, not here. The working list for the
product is `docs/specs/mahalaxmi-batch.md`; the next conversation is the user
bringing blockers and facts, so expect this file to be rewritten then.

**Last session: 2026-10-12** (a long one, 7–12 Oct: link previews, the public
product page, the demo firm, tutorials and snapshots; the motion-graphics work
has moved out of this repo entirely).

---

## Deployed

| | at | how |
|---|---|---|
| Backend — AWS EC2, by hand | **`78458b6` (5 Oct)**, read from `/health` 12 Oct | `scripts/deploy-api.sh` on the box, `main` only |
| Frontend — Vercel | **not read this session**; Branch Tracking is OFF, the user deploys by hand | |
| Dev API (`api.dev.re.delpat.in`) | **502 on 12 Oct 01:25** — down or restarting | |
| `main` | `820514e` (6 Oct) | |
| `development` | 13 commits ahead of `main` — all `marketing/demo` (the product page's video, screens, snapshots, tutorials config) and the gallery-enquiry spec. **No app code.** Pushed? **No** — the last marketing commits are local only |

**Production API is 7 commits behind `main`**, and those commits are the point
of the whole early-October batch:
- photo links preview on every app that fetches previews (`/share/gallery` with
  the broad UA rewrite in `vercel.json`; a human visitor is sent on to `?app=1`
  once) — production still answers `Cannot GET /share`;
- the Binod/Siddhi fix (`1fc8f77`: renamed people kept their old name in
  columns; projects got second spellings; listings hid their media);
- `admin` and `pwa` reserved as workspace slugs.

Deploy order unchanged: API first, then frontend.

---

## Waiting on the user

- **Deploy the API** (`./scripts/deploy-api.sh`), then check a photo link's
  preview from WhatsApp, Slack and Telegram, and that Siddhi's leads show
  Siddhi.
- **Merge or drop `development`** → `main` for the marketing commits (nothing
  deploys from them). Push `development` first; the last five are local.
- **webloom** (`Delpat-Tech/webloom`): the CRM product page is on `main` at
  `0ef5e88` (video, live snippets, walkthrough). The walkthrough counter fix
  (`fc94993`, read "1/0" in the page's HTML before its stages loaded) is on
  `feat/real-estate-crm-page` only. Vercel's build state for `0ef5e88` was
  "pending" with no checks when last looked; confirm delpat.in/real-estate-crm
  is live.
- **delpat-skills** `feat/natural-pace` is unmerged: tutorial-videos' edit
  (waits cut, idle trimmed, holds), promo style, lexicon, `snap`, `extract`
  (live cutouts, parts, radii). The installed skill already runs this branch.
- **Carried from 30 Sep, not re-checked:** `npm run link:owners --
  --env=production` not yet run; Properties 7.6 wants the production shortlist
  count (needs the user's OK to read); dashboard timing on production after the
  deploy.
- **Gallery enquiry** ("I'm interested" on a shared photo link): spec only,
  `docs/specs/gallery-enquiry.md`, parked until the attribution question is
  settled.

---

## Checked this session

- **Production, read only:** `/health` (commit above) and the `/share` route
  (404 "Cannot GET"). Nothing else read; nothing written.
- **Dev database, `demo-showcase` (Amberleaf Realty, invented):** reset from
  `backend/src/scripts/demo-profiles/showcase.json` (`npm run seed:demo -- --write`
  equivalent, ~6 min) several times for recordings; the walkthrough capture
  **saved one call on Alpesh Joshi** ("Interested · scheduling a site visit",
  "Wants to visit on Saturday"), which stays until the next reset. No other
  dev data touched. `bhumi` and `mahalaxmi` untouched.
- **Tutorials** (`marketing/demo/tutorials.config.mjs`): `product-tour` and
  `record-call-walkthrough` pass as tests on dev, 12 Oct.
- **Website** (`localhost:3001/real-estate-crm`): no overflow at desk or phone
  width, no page errors; the walkthrough clicks through to "Start again"; the
  live snippets render with the dev API blocked (images embedded).

---

## Do not repeat

- **The motion-graphics engine is not here.** It is `Delpat-Tech/cutroom`
  (`D:\Work\Delpat\projects\cutroom`, DESIGN.md + HANDOFF.md). This repo keeps
  only `marketing/demo/` (tutorials, snapshot scripts, the demo profile), which
  cutroom will bake from. Do not add film code to `tutorial-videos` or here.
- **Demo recordings and snapshots use `demo-showcase` only**, never a client
  firm; shoot in working hours (Today and Performance count today's activity);
  take the walkthrough straight after a reset (it saves a call). The end
  snapshot once captured "Saving…"; the recorder now waits for the save.
- Dev has demo data on `delpat`: `npm run seed:dev:activity` (three days of
  agent work; `-- --clear` removes it) and `npm run seed:dev:inventory` (19
  flats `p_demo_`, 22 owners `own_demo_`, 4 agreements, 2 leads; `-- --clear`).
  The activity seed does not set `crm_owners.last_call_at`.
- Left on dev because the user converted it: calling row "zeta probe heights"
  (`own_1790258291624_0_7945dd`) and the flat made from it.
- The dev database is shared with the user's own preview testing. Delete only
  your own probe rows, by id.
- Read-only scripts that import `services/store.ts` must set `CRM_NO_BOOT=1`.
- Playwright's WebKit build is not downloaded; phone checks run in Chromium
  with the iPhone 13 descriptor.
- Caddy overwrites `X-Forwarded-Host` on the API box, so `og:url` was removed
  from the share card; do not put it back from the request host.
- Remotion leaves a webpack bundle per render in `%TEMP%`; thirty of them once
  filled `C:`. The installed tutorial-videos deletes them; check `C:` before
  rendering anything.
