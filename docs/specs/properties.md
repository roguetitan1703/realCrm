# Spec: Properties — fields, media, filters, add-flow (Roadmap block C)

**Status:** 🧭 planning — most decisions locked; **add-flow** open for one round.
Items: C-fix filters · C1f fields · C2m photos/videos · C3w watermark · C4
super-expansion (portal-grade schema) · **C-add** (stepped add page) · C5 AI video
(parked).

---

## Locked decisions (from review)

- **C-fix filters — do NOT fix standalone now.** Fold into the C4 schema pass:
  once fields have a **canonical vocabulary**, both the form inputs and the filter
  options draw from it, so options always match values. (Root cause was hardcoded
  option lists not matching stored values — see prior diagnosis.) **(Q6)**
- **Owner is internal, never in the listing.** The client does **not** want the
  owner name on the (shared) listing. So the property **links to an Owner contact**
  (block B Owners store) that is **internal-only / masked in shares** — that link
  is exactly *how they connect back to the owner later* and handle re-availability.
  The shared listing carries no owner. **(Q1 resolved.)**
- **Location = Google Maps, simple.** Free map search → pin → confirm → we record
  the location. No URL→coord conversion needed here. **(Q2)**
- **Tax = a flag, not math.** The Tax incl./excl. tick is just a label; if
  "excluding", the client computes tax and enters the final number themselves —
  **we do no tax calculation.** Consulting % is a plain entered number. **(Q3)**
- **"Brokerage" → "Consulting" everywhere.** **(Q4)**
- **Availability = one field, deal-relative label** (Possession for sale /
  Available-from for rent). **(Q5)**
- **Media: photos AND videos**, both **watermarked** and **optimised**
  (compress/transcode — specifics TBD, "we'll figure it out"). Stored in
  **Cloudflare R2**. **(Q7)**
- **Watermark = corner logo + a light translucent overlay** (tiled/diagonal) so it
  **can't just be cropped off**; translucent; **default, no customisation**. For a
  tenant with no logo, fall back to a firm-name text mark. **(Q8)**

---

## C4 — Portal-grade schema (from the 99acres + MagicBricks forms you gave)

Canonical field taxonomy. Drives the add form **and** the filters (single source).

**Top-level**
- **Category:** Residential · Commercial
- **Looking to (deal):** Sell · Rent/Lease · PG/Co-living
- **Property sub-type:** Apartment · Independent House · Duplex · Independent Floor
  · Villa · Penthouse · Studio · Farm House · (Plot/Land) · (Commercial variants)
- **Transaction:** New · Resale · **Possession:** Under-construction · Ready-to-move
  · **Age of property/construction**

**Location:** City · Locality · Society/Building name · **Google Maps location** ·
Address · Facing (N/E/W/S/NE/NW/SE/SW)

**Configuration**
- **BHK:** 1RK · 1 · 1.5 · 2 · 2.5 · 3 · 3.5 · 4 · 4.5 · 5 · 5+
- **Bathrooms** (1–4+), **Balconies** (0–4+)
- **Areas:** Built-up · Carpet · Plot area (all sq.ft.)
- **Floor no. · Total floors**
- **Parking:** Covered (0–3+) · Open (0–3+)
- **Servant room** (Y/N) · **RERA ID**

**Furnishing** (conditional on furnished/semi)
- **Furnish type:** Fully · Semi · Unfurnished
- **Fixtures — multi-select:** Dining Table, Washing Machine, Cupboard, Sofa,
  Microwave, Stove, Fridge, Water Purifier, Gas Pipeline, Chimney, Modular Kitchen
- **Counted items (0/-/+):** Fan, Light, AC, Wardrobe, TV, Bed, Geyser
- **Society amenities — multi:** Power Backup, Lift, Gym, Swimming Pool, Intercom,
  Garden, Sports, Kids Area, CCTV, Gated Community, Club House, Community Hall,
  Regular Water Supply, Attached Balcony

**Rent-only:** Preferred tenant (Family/Bachelors/Company) · Pet-friendly ·
Available from · **Monthly rent** · Maintenance (in-rent/separate) · **Security
deposit** (None/1mo/2mo/Custom) · **Lock-in** (None/1mo/6mo/Custom) · Parking
charges · Painting charges

**Sale-only:** **Expected price** · Price/sq.ft (derived) · Price includes (PLC /
Car Parking / Club Membership) · Other charges · Stamp-duty note · Booking/Token
amount · Maintenance

**Plot-only:** Floors allowed · No. of open sides · Road width facing · Corner plot

**Both:** **Consulting** (was brokerage: None/15-day/30-day/Custom) · **Tax
incl./excl.** flag · **Consulting %** · **Remark** (threaded, block B) ·
Description (≤1500) · **Photos & videos**

> Residential ships first; Commercial/Plot are field-set variants of the same
> engine.

---

## C-add — How you add properties (the flow)  🧭 DISCUSS

**Problem:** the schema above is portal-grade — a cramped **modal can't hold it**,
and losing half-entered data is unacceptable. And the current **"+ bulk add
(not import)" tabular modal feels wrong** (your instinct — agreed).

**Proposed model — two natural paths, retire the third:**

1. **Single add = a stepped PAGE (wizard), not a modal.** Steps roughly:
   ① Category & deal → ② Location (+map pin) → ③ Configuration → ④ Furnishing &
   amenities → ⑤ Pricing & terms → ⑥ Photos/videos → ⑦ Owner (internal link) &
   review. **Progress is saved as a draft** so nothing is lost; fields **enrich**
   step by step; deal/category **swap the field sets** (rent vs sale vs plot).

2. **A few units in a project = "Add another in this project".** After saving a
   unit, one tap starts the next unit **pre-filled with the shared context**
   (project/society, tower, location, amenities, builder, possession) — you only
   change the unit-specifics (flat no., floor, BHK, area, price, owner). This is
   how a broker naturally enters "6 flats in Tower B" by hand — enter the building
   once, rattle off the units.

3. **True bulk = Excel import into a project** (the staged importer we already
   have). For a builder's inventory sheet / large lists.

**Retire** the tabular bulk-add-units modal — its job is split cleanly between
(2) "add another in project" for manual handfuls and (3) Excel for bulk. → Q13–Q15.

---

## C5 — AI photo → video  🅿️ parked.

---

## OPEN QUESTIONS
13. Confirm: **single add = stepped page** (draft-saved), **retire the tabular
    bulk-add modal**, keep **Excel import** for true bulk. Agree?
14. **"Add another in this project"** (clone shared context, change unit-specifics)
    as the natural manual multi-unit flow — is that how you'd add a few units, or
    do you picture it differently?
15. Step order/grouping above — good, or regroup? Any field that must appear
    earlier (e.g. price on step 1)?

---

## Build checklist (draft — firms up after add-flow answer)
- [ ] Canonical field-definitions (C4 taxonomy) → drives form + filters (fixes C-fix by construction).
- [ ] Property schema migration (one pass): all C4 fields; deal/category-conditional sets.
- [ ] **Add-property stepped page** with draft persistence; retire bulk-add modal.
- [ ] "Add another in this project" (inherit shared context).
- [ ] Excel import into project (extend existing importer to the new schema).
- [ ] Owner link to Owners store; **owner masked/absent in shared listing**.
- [ ] Google Maps location capture (free search + pin).
- [ ] R2 media pipeline: photo + video upload, **optimise/transcode**, **watermark**
      (corner logo + translucent anti-crop overlay) on ingest.
- [ ] Media-rich WhatsApp share (closes C6); owner never included.
- [ ] Terminology sweep Brokerage → Consulting.
