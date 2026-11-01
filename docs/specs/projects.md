# Projects: a description and photos, and one name per project

Status: rename built (§5 Select + Rename on both card grids, §6 preview /
rename / renames / undo, `crm_project_renames`), with D1 no, D3 no, D6 30
days. As built: no `projects_before` column (there is no `crm_projects` yet);
properties match on `PROJECT_KEY`, the same key as the card; Undo from the
card refuses while a later rename changed the same rows. Description, photos
(D2, D4, D5) and Tidy names (D7) are not built.

**Who it is for.**
- **The firm's owner, at a desk.** Writes a project's description and adds its
  photos once, instead of on each of its flats. Picks the four spellings of
  one project and makes them one name, so the cards, the filter and the
  calling list stop splitting one township into several.
- **The agent, on a phone, sending a flat.** The flat's page, its share link
  and the catalogue carry the project's description and photos without the
  agent adding them.

Om's words: "one description + a few project photos that will apply for each
property under that project", "Society projects + description", and for Work
OS #155 a **rename, not a record merge**: pick "Lodha Amara", "Lodha amara",
"Lodha Amara Ph 1", choose one name, and every property and calling-list owner
carrying any of them gets it; the timeline keeps the old name; undoable.

**How this was checked.** Production read on 1 Nov, read-only
(`sql.begin('READ ONLY')`, scratch script deleted the same session), tenants
`bhumi` and `mahalaxmi`. Code read at `1032e1f`. Nothing was driven in a UI.

---

## 1. What a project is today

A project is not stored. It is a grouping over the `project` text:

- `projectNorm()` (`store.ts`): lower-case, letters and digits only. "Sai
  Heights", "sai heights" and "SaiHeights" are one key. The card shows the
  commonest spelling (`mode()`); nothing stored is rewritten.
- Properties group on `PROJECT_KEY` = `project`, else the title before
  " - ". Every property in both firms has `project` set, so the title fallback
  covers 0 rows today.
- The calling list (`crm_owners.project`) groups with the same key
  (`listOwnerProjects`), on its own cards.

So **case, spacing and punctuation variants already show as one card.** What
they still break is the text a person reads: the record, the share link and
the catalogue print "KOHINOOR SPORTSVILLE " on one flat and "kohinoor
sportsville " on the next. **Typos** ("SPROTSVILLE", "Visat", "retrate") are
separate keys and show as separate cards, with the flats and owners split
between them.

**The name is stored in four places on a property**, not one (shape 6):

| Copy | bhumi (86) | mahalaxmi (24) | Read by |
|---|---|---|---|
| `project` column | 86 | 24 | grouping, filters, `publicFlat` |
| `config.society` | 85 | 24 | `rowToProperty().society`, matching copy, the card's name line |
| `config.project` | 25 | 12 | fallback only |
| title before " - " | 84 | 24 | title, `PROJECT_KEY` fallback |

**6 bhumi properties already disagree with themselves**: `project` "Godrej
Green Cove", `config.society` "VTP Aetherius", title "VTP Aetherius - 3005";
`project` "Godrej hill side ", society "Vtp Belair". An edit changed one copy
and left the others. A rename that writes only `project` makes more of these.

---

## 2. Production, measured 1 Nov

| | bhumi | mahalaxmi |
|---|---|---|
| Properties / calling rows | 86 / 808 | 24 / 3,737 |
| Distinct spellings: properties / owners / both tables | 58 / 40 / 69 | 12 / 9 / 19 |
| Cards (normalised keys): properties / owners / both | 35 / 22 / 35 | 11 / 8 / 18 |
| Keys present in both tables | 22 | 1 |
| **Strict variant groups** (one key, several spellings) | 14 | 1 |
| Rows not on their group's commonest spelling | 25 props, 21 owners | 11 props, 6 owners |
| **Fuzzier groups** (typos, phase suffix; several keys) | 6 groups over 20 keys | 2 groups over 4 keys |
| Rows not on the fuzzy group's commonest spelling | 29 props, 24 owners | 11 props, 492 owners |
| Capitalise each word (`capitaliseWords`), spellings / rows | 36 of 58 props → 41 rows; 24 of 40 owners → 25 rows | 7 of 12 → 9 rows; 0 owners |
| Stray spaces (leading, trailing, doubled), rows | 51 props, 26 owners | 11 props, 6 owners |
| Capitalise **and** tidy spaces, rows | **66 of 86 props, 39 of 808 owners** | **20 of 24 props, 6 of 3,737 owners** |
| All-capitals spellings (left alone by `capitaliseWords`) | 3 (10 props) | 5 (15 props, 1,839 owners) |
| Properties with photos | 36 | 7 |
| Properties with their own description | 58 (median 285 chars) | 4 |
| Projects holding exactly 1 property | 21 of 35 | 8 of 11 |
| Desk roles | 1 owner, 8 agents, no manager | 1 owner, 4 agents, no manager |

BACKLOG said "42 of bhumi's 58, 12 of mahalaxmi's 12" need capitalising. With
the rule new input actually uses (`capitaliseWords`: first letter after a space
upper-cased, rest as typed) it is 36 of 58 and 7 of 12; the larger figure
counted all-capitals names, which that rule leaves alone.

**Largest projects.** bhumi by properties: KOHINOOR SPORTSVILLE 13 (8 owners),
Godrej Green Cove 9, VTP Aetherius 6, VTP Leonara 6, VTP Belair 5, Vtp Bellier
5. bhumi's calling list is one project: Godrej Hill Retreat, 754 owners, and its
1 property is filed under the typo "godrej Hill retrate". mahalaxmi by
properties: VTP SIERRA 12 (506 owners); calling list: Mahindra Happinest
Tathawade 940, Godrej Hill Retreat 724, VTP VERVE PHA 670, VTP SIERRA 506 plus
VTP SIERRA PHA 353, K-SHIRE 310.

**Real bhumi groups** (p = properties, o = calling rows):

1. **KOHINOOR SPORTSVILLE** — one card already holds 7 spellings ("KOHINOOR
   SPORTSVILLE " p8/o6, "Kohinoor Sports Ville" p1, "kohinoor sportsville " p1 …),
   and two typo cards sit beside it: "KOHINOOR SPROTSVILLE" p1/o1, and "Kohinoor
   Sports vile " p1 with "Kohinoor Sportsvile" o1.
2. **Godrej Green Vista(s)** — 10 spellings on 4 cards: "godrej green Vista" p1
   and 3 more (p3), "Godrej Green Vistas" and 3 more (p1/o4), "Godrej Green
   Visat" p2, "Godreh green vista" p1. Leads enquire about "Godrej Green
   Vistas" (39).
3. **VTP Aetherius** — 3 cards: "VTP Aetherius" p4/o3 (+2 spaced spellings),
   "VTP Aethereus" p1/o1, "vtp aethrius" p1/o1.
4. **Godrej Hill Retreat** — "Godrej Hill Retreat" p1/o754 and "godrej Hill
   retrate" p1: the 754-owner calling list and its only flat on two cards.
5. **Godrej Hill Side** — 11 spellings across "Godrej hill side", "Godrej hill
   side 2", "Godrej Hill side-2", "Godrej hillside 1", "Godrej Hill side 32",
   "Godrej hill Sisde", plus "Hill side 2" p2 which no pass catches. Phase 1 and
   phase 2 may be two projects. **This is why a fuzzy match can suggest but
   never decide**; mahalaxmi's "VTP SIERRA" vs "VTP SIERRA PHA" (353 owners) and
   "Godrej Hill Retreat" vs "…Retreat 2" (133) are the same question.

Leads carry project names too, in `req.interest` (bhumi 734 leads, mahalaxmi
580), with their own spellings ("VTP Aethereus" 14, "Shree Bhagwati Rudraksh" /
"Rudraksha" / "Rudraksham PH 1"). That is what the enquiry said. §9 D3.

---

## 3. Where a project's own fields live

**A side table keyed by tenant and normalised name**, not a project id on
every row:

```sql
CREATE TABLE IF NOT EXISTS crm_projects (
  tenant_id   TEXT NOT NULL,
  norm        TEXT NOT NULL,        -- projectNorm(name), the grouping key
  description TEXT,
  media       JSONB NOT NULL DEFAULT '[]'::jsonb,  -- same item shape as crm_properties.media
  updated_by  TEXT,
  updated_at  TIMESTAMPTZ DEFAULT NOW(),
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (tenant_id, norm)
);
```

Why this and not `project_id` on properties and owners:

- **The text stays the one source.** A `project_id` beside the `project` text
  is two implementations of one fact (shape 2), and every writer — the form,
  the importer, the webhook parser, owner→property creation, the calling-list
  import — would need to resolve or create an id. The day one forgets, the id
  and the text disagree and nothing notices.
- **No migration of existing rows.** 110 properties and 4,545 calling rows stay
  as they are. A row exists only once someone writes a description or adds a
  photo.
- **The key is the grouping key**, `projectNorm`, the same expression the cards
  and filters use. A flat is "in" the project exactly when it is on that card.
  Retyping one flat's project to a different name moves it off the card and
  away from the description, both at once, which is correct.
- **No stored name.** The name shown is still the commonest spelling of the
  rows. A `crm_projects` row whose key no row carries any more is invisible and
  harmless; a rename moves it (below).

**When a rename merges two keys that both have a row:** the chosen name's own
key keeps its description if it has one; otherwise the description of the key
with the most properties. Photos are combined, the target's first, duplicates
by key dropped, capped at the photo limit. The rows dropped or overwritten are
saved in the rename record, so Undo puts them back. The rename dialog names
which description is kept before you confirm. §9 D4.

---

## 4. Who can edit

- **Rename and tidy names: owner, admin, manager (`isDeskRole`).** One action
  rewrites other people's calling rows and every flat's name on the share
  links. Same rule as assigning a project and changing the catalogue.
- **Project description and photos:** recommended desk-only too (§9 D2). In
  both paying firms that means the owner alone today.

Server-side checks (`ForbiddenError`), not hidden buttons.

---

## 5. Screens — no new screen

Every piece goes into a screen that exists (CLAUDE.md §4, §5).

**Properties → Group by project (`ProjectGrid`), and a project's list.**
- The project band (`proj-band`, shown when one project is open) gets the
  description (two lines, then More) and a row of photo thumbnails. Desk roles
  see **Edit project** in the band. It opens the existing form modal with two
  fields: Description (textarea) and Photos (`MediaEditor`, the component the
  property form uses). Sticky action row; backdrop click stops closing once
  something is typed.
- A project card shows its first project photo as the cover when it has one.
- **Select** on the cards (desk only), through the list's existing selection
  bar, with one action: **Rename**.

**Calling list → project cards (`OwnerProjectGrid`).** The same Select and
Rename. mahalaxmi has 17 of its 18 keys in only one table, so the calling list
needs its own entry point.

**The rename dialog** (existing modal):
- The picked cards, each with its spellings and counts: "Godrej Green Visat —
  2 properties".
- **New name**: one of the spellings shown, or typed. Typed names go through
  `capitaliseWords`, like new input.
- If two picked cards have a description or photos: which description is kept.
- The confirm button carries the count: **Rename 6 properties and 4 calling
  rows**.
- After: a toast, "Renamed to Godrej Green Vistas · Undo".

**Tidy names** (desk only, Properties toolbar overflow): capitalises each word
and removes stray spaces in every project name, for both tables. Confirm shows
the count — for bhumi today "Tidy 66 properties and 39 calling rows". One undo
record.

**Property record (`PROPERTIES_DEF` in `definitions.jsx`).** A **Project**
section, read-only, under the flat's own fields: the project's description and
photos. Omitted when the project has neither. Desk roles get Edit project, the
same modal.

**Public pages.** The share link (`openCode`) and the catalogue
(`catalogueList`/`catalogueFlat`) get `project: { description, photos }`
through `publicFlat`, **only when the project name itself is shown** — not when
the firm hides the project on its catalogue (`catalogueShowsProject = false`),
because the photos and the description name the project. The flat's own
photos come first, the project's after. The photo link (`gallery.ts`) adds the
project's photos after the flat's. §9 D5.

**Timeline.** Every renamed property and calling row gets one event:
`project_renamed`, "Project renamed", `Was "godrej Hill retrate"`. Undo writes
"Project rename undone".

---

## 6. API

All under the existing `propertiesRouter`, declared before `/:id`.

| Method, path | Body → reply | Who |
|---|---|---|
| `GET /properties/projects` | as now, plus `cover` (first photo key) and `hasDescription` per card | all |
| `GET /properties/projects/:key` | as now, plus `description`, `media`, `updatedAt` | all |
| `PUT /properties/projects/:key` | `{ description, media }` → the project. Upsert on `(tenant, projectNorm(key))`. A sent body is the whole state: `description: ''` clears | desk |
| `POST /properties/projects/rename/preview` | `{ keys[], to }` → per key: spellings, properties, owners; total rows per table; description/photo conflict | desk |
| `POST /properties/projects/rename` | `{ keys[], to, keepDescriptionFrom?, expect: { properties, owners } }` → `{ renameId, properties, owners }`. 409 with new counts if `expect` no longer matches | desk |
| `POST /properties/projects/tidy/preview`, `/tidy` | `{ expect }` → same shape, every key | desk |
| `POST /properties/projects/renames/:id/undo` | → `{ restored, kept }` | desk |

GET `/properties/:id` gains `projectInfo: { name, description, media }`, joined
on the key in the same query, so a record does not ask twice.

**What a rename writes**, in one transaction, scoped to the tenant:
- `crm_properties` where `projectNorm(project)` is in the picked keys **or**
  equals `projectNorm(to)`: `project = to`; `config.society` and
  `config.project` set to `to` **only where their own key is in that set**; the
  title's part before " - " replaced when its key is in that set. The 6 rows
  whose society names another project are not rewritten by a rename of either
  (they are §8 step 1's job).
- `crm_owners`, same match: `project = to`.
- `crm_projects`: rows for the picked keys merged into `projectNorm(to)` (§3).
- The timeline events in one INSERT (as the bulk path at `store.ts` ~3388
  does), an `audit()` row `project.renamed`, and the rename record:

```sql
CREATE TABLE IF NOT EXISTS crm_project_renames (
  id          TEXT PRIMARY KEY,
  tenant_id   TEXT NOT NULL,
  kind        TEXT NOT NULL,          -- 'rename' | 'tidy'
  to_name     TEXT,
  from_keys   TEXT[] NOT NULL,
  rows        JSONB NOT NULL,         -- [{t:'p'|'o', id, before:{project,society,cfgProject,title}, after:{…}}]
  projects_before JSONB NOT NULL DEFAULT '[]'::jsonb,  -- crm_projects rows as they were
  actor_id    TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  undone_at   TIMESTAMPTZ
);
```

**Undo** puts back each row's `before` **only where the row still holds what
the rename wrote**; a row someone has changed since is kept and counted, as
`revertImport` reports deleted/kept. Then `projects_before` is restored.
Undo is available from the toast and, for 30 days, from the project card's
menu while it is the latest rename touching that card (§9 D6).

Not touched: leads (`req.interest`, §9 D3), share-link history, catalogue
slugs (they are codes, not names).

---

## 7. Photos: the existing pipeline

- Upload: `uploadMedia(blob, 'project')` from `MediaEditor`, so photos are
  resized to 1920 px and watermarked in the browser by `processListingImage`
  with the firm's mark — the same as a property photo, no exception.
- Key: `buildMediaKey(tenant, 'project', ext)` → `<tenant>/project/yyyy/mm/…`.
- **`isPublicMediaKey` must match `project/` as well as `property/`**
  (`media.ts`), or the photos fail on the share link and the catalogue where no
  ticket is sent. One regex.
- Stored as `crm_projects.media`, same item shape as a property's (`key`,
  `kind`, `w`, `h`, `at`), so `publicFlat`'s media mapping and the gallery
  read it unchanged.
- Photos only, at most 8 (§9 D5). Video stays per flat.
- Storage usage by prefix (`prefixUsage`) counts `project/` with the rest;
  removing a photo follows the property-media rule.

---

## 8. Migration and build order

**Migration.** `initSchema()` creates `crm_projects` and `crm_project_renames`
with `CREATE TABLE IF NOT EXISTS`. Both are new and empty, so no `runOnce` and
no backfill. **No existing name is rewritten by a migration**: the tidy and
every rename are actions a desk user presses, with a preview and Undo, and on
`bhumi` and `mahalaxmi` only when the firm (or Om, by name) does it.

**Build order** (builder B; the rename is a bulk write across two tables, so a
review subagent before merge):

1. **One copy of the name.** `rowToProperty().society` reads `project`; the
   property write path keeps `config.society`/`config.project` equal to
   `project` or stops writing them. Lists the 6 contradicting bhumi rows for
   the firm to fix; does not guess which copy is right.
2. **Tables and the side-car read**: `crm_projects`, GET extensions,
   `projectInfo` on the record. Read-only screens: band, card cover, record
   section.
3. **Edit project**: PUT, the modal, `project/` photos public.
4. **Public pages**: `publicFlat`, catalogue, share link, photo link, each
   behind `showProject`.
5. **Rename**: preview, write, timeline, rename record, Undo; Select on both
   card grids.
6. **Tidy names**: the same write over every key.
7. Smoke on `development` with `delpat` fixtures, both firms' shapes
   reproduced (a 7-spelling card, a typo card, a 754-row calling project).

---

## 9. Decisions for Om

**D1. Does a rename cover typos only by hand, or does the app suggest groups?**
Example: on bhumi's Projects, "Godrej Hill Retreat" (754 owners) and "godrej
Hill retrate" (1 flat) would be offered together; so would "Godrej hillside 1"
and "Godrej hill side 2". *Yes:* a "Possible duplicates" pile on the cards, the
owner ticks or unticks. *No:* the owner picks cards himself; bhumi has 35.
**Recommend no for now**: 35 cards is a minute's reading, and every fuzzy pass
we ran also groups real phases; add it if a firm with hundreds of projects
arrives.

**D2. Can agents edit a project's description and photos?**
Example: an agent at VTP Aetherius photographs the clubhouse and wants it on
all 6 flats. *Yes:* anyone who can edit a listing can, with who-changed-what
recorded, as listings are today. *No:* the owner or a manager only; the agent
adds the photo to one flat. **Recommend no**: one edit reaches every flat's
share link and the catalogue, and catalogue changes are already desk-only.

**D3. Do leads' enquired projects get renamed too?**
Example: 14 bhumi leads say "VTP Aethereus". *Yes:* a rename also rewrites
`req.interest`. *No:* leads keep what the enquiry said; only properties and
calling rows change. **Recommend no**: it is what the portal sent, and lead
matching reads the requirement, not that text. Revisit if the lead filter by
project ever ships.

**D4. When two merged projects both have a description, which wins?**
Example: "Godrej Green Vista" and "Godrej Green Vistas" each have one.
*Automatic:* the chosen name's own, else the bigger project's, shown in the
dialog before confirming, back on Undo. *Ask each time:* the dialog makes you
pick. **Recommend automatic**, shown in the dialog; it is rare (no project has a
description yet) and Undo covers it.

**D5. Do the project's description and photos go on the share link and the
catalogue?**
Example: a buyer opens a link for a 2 BHK in KOHINOOR SPORTSVILLE and sees the
flat's 5 photos, then 4 of the township and its description. *Yes:* shown
whenever the project name is shown. *No:* inside the CRM only. A flat's own
description is kept off public pages because agents type flat numbers and
owners' names into it; a project description is written once by the owner for
this purpose. **Recommend yes**, with D2 as no.

**D6. How long can a rename be undone?**
*Toast only:* a few seconds, then it stands. *30 days from the card:* while no
later rename has touched those rows. **Recommend 30 days.** Rows changed since
are kept and counted.

**D7. Tidy names: capitalise only, or also all-capitals?**
Example: "KOHINOOR SPORTSVILLE " (8 flats) — first-letter rule leaves it in
capitals; full Title Case makes it "Kohinoor Sportsville" but also turns "VTP"
into "Vtp" and "DLF" into "Dlf". *First letter only* (as new input does): bhumi
66 properties and 39 calling rows, mahalaxmi 20 and 6. *Full Title Case:* also
bhumi 10 properties, mahalaxmi 15 properties and 1,839 calling rows, and
breaks acronyms. **Recommend first letter only**; fix all-capitals names by
renaming the card.
