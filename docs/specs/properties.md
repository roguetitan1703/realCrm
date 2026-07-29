# Spec: Properties — fields, media, filters (Roadmap block C)

**Status:** 🧭 planning — **all questions open**. Items: C-fix broken filters ·
C1f field additions · C2m photos/videos · C3w watermark · C4 super-expansions ·
C5 AI video (parked).

---

## C-fix — Broken property filters  [P5]  (diagnosed)

**Root cause (confirmed against the data):** the filter engine is correct (it
calls `def.rowMatch`); the bug is that several filters use **hardcoded option
lists that don't match the stored values**:
- **Config/`type`:** options `1BHK,2BHK,3BHK,Commercial,Plot` vs real
  `"3 BHK Apartment"`, `"2 BHK Apartment"`, `"4 BHK Villa"`, `"Commercial Office"`
  → **no overlap, matches nothing.**
- **Locality:** 7 hardcoded vs real `"Kharadi, Pune"`, `"Marunji / Hinjewadi,
  Pune"`, `"Hinjewadi Phase 3, Pune"` → most don't match.
- **Furnishing** coincidentally matches; **Deal** is exact; **Project** options are
  **derived from live data** → these three work.

**Pattern:** hardcoded options break, data-derived options work.

**Fix:** derive filter options from the live inventory's distinct values (like
`project` already does) with light normalization (trim). Once C4 gives structured
fields with fixed vocabularies, drive **both the add/edit form inputs and the
filter options from one canonical field-definition** so they can never drift
again. → can ship **standalone, now**, ahead of the schema work (Q5).

---

## C1f — Field additions  [P6]

Add to the property record:
- **Floor no., Flat no.** (unit identity — already partly present as wing/flat).
- **Owner name** — the client asked for it explicitly. *Open:* store as a **link
  to an Owner contact** (block B Owners store) so re-availability + owner history
  + multiple units per owner work, or a plain text name? → Q1.
- **Carpet**; **Rent + Deposit** (rent deals); **Facing**; **Society name**.
- **Location** — locality exists; add a **Google Maps location** to share (and to
  power B4 distance-to-property). → Q2.
- **Furnished / Unfurnished** status (+ furniture list in C4).
- **Rename "Brokerage" → "Consulting"** everywhere. → Q4.
- **Tax incl./excl.** tick; **Consulting %** (number, sale and rent). → Q3.
- **Availability date** (possession/available-from). → Q12.
- **Remark** (block B — threaded).

## C2m — Photos & videos  [P2]
Photos and videos on a property, shareable with the listing (WhatsApp share
becomes media-rich — closes C6). Stored in **Cloudflare R2** (block B decision),
URL/key in Postgres. → Q6.

## C3w — Watermark  [P3]
Uploaded/captured media carries the **firm watermark** (server-side on ingest, so
it can't be bypassed; consistent with the R2 pipeline). Applies to property media
**and** B4 selfies (no exception). → Q7.

## C4 — Super-expansions  [P7]
A richer property schema modeled on **MagicBricks / Housing / 99acres** (study
their data-collection flow first):
- **Furniture list** on furnished/semi (checklist + counts). → Q9.
- **Fields that change by sale vs rent** (deposit/tenant-prefs for rent; price/tax/
  consulting for sale). → Q10.
- Richer amenities/specs. Depth for v1 = subset vs portal-parity. → Q8.
- **Design C1f + C4 as ONE schema pass, delivered in stages**, so we don't migrate
  the property table twice. → Q11.

## C5 — AI photo → home-tour video  [P4]  🅿️ parked
Generate a walkthrough video from N photos. Later; not planned now.

---

## OPEN QUESTIONS (all at once)

**Fields / owner / money**
1. **Owner** = a **link to an Owner contact record** (enables re-availability,
   owner history, many units per owner — my rec, with quick-add) or a plain
   **text name**? (Note: the client's own worry — "how do they map the owner
   later & re-availability?" — is exactly what linking solves.)
2. **Location** = store **lat/lng coordinates** (enables a Maps share link *and*
   B4 distance) — capture via a map pin or pasted Maps URL we parse? Or just store
   a pasted Maps link with no coordinates?
3. **Consulting %** — computed on the **deal value**? **Pre-tax or post-tax** (how
   does the Tax incl./excl. tick interact)? And for **rent**, % of *what* — one
   month's rent, annual rent, a flat fee?
4. **"Brokerage → Consulting"** — rename **everywhere** (UI, messages, internal
   labels)? Blanket yes?
12. **Availability date** — one field meaning "available from" (rent) /
   "possession" (sale), or two separate fields?

**C-fix filters**
5. Fix = **derive filter options from live data** + later one canonical vocab from
   C4. Ship C-fix **now as a standalone quick win**, before the big schema work?

**Media & watermark**
6. Per-property media limits: **how many photos**, **max photo size**, **videos in
   v1?** (max length/size). Note: **video watermarking is heavy** (server ffmpeg) —
   OK to do **photos first, video watermark next**, or must videos ship watermarked
   day one?
7. Watermark look: **corner logo** from the firm's uploaded logo; for tenants with
   **no logo**, fall back to a **firm-name text** watermark? Default position/
   opacity OK, or you want to specify?

**Super-expansion**
8. v1 depth: a **pragmatic subset** of portal fields (the ones that matter for
   sharing + matching) vs **full portal-parity**? Which portal is the reference —
   **MagicBricks, Housing, or 99acres**?
9. **Furniture list** = a checklist of standard items (bed, wardrobe, AC, fridge…)
   with counts, shown only when furnished/semi? Your must-have items?
10. Confirm the form **swaps field sets by deal type** (rent vs sale show different
   fields).
11. Agree to design **C1f + C4 as one schema**, delivered basic-first then rich, to
   avoid migrating the property table twice?

---

## Build checklist (draft — firms up after answers)
- [ ] **C-fix:** data-derived filter options (type/locality/status/furnishing); normalize; standalone ship.
- [ ] Property schema pass (C1f + C4 designed together): floor/flat, owner link, carpet, rent+deposit, facing, society, location(lat/lng), furnishing, consulting %, tax flag, availability, amenities, furniture list.
- [ ] Canonical field-definitions driving BOTH form inputs and filter options (no drift).
- [ ] Deal-type-conditional form (sale vs rent field sets).
- [ ] R2 media pipeline (photos + videos) + server-side watermark on ingest.
- [ ] Media-rich WhatsApp share (closes C6).
- [ ] Owner ↔ property linking to Owners store (block B); derived "units by owner".
- [ ] Terminology sweep: Brokerage → Consulting.
