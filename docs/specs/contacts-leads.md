# Spec: Contacts & leads (Roadmap block B)

**Status:** 🔒 **LOCKED** (2 small confirmations noted inline). Items: B1 Remark ·
B2 lead stage pills · B3 Clients/Owners subnavs · B4 visit-proof follow-up ·
B5 call/message-on-contact.

---

## The foundational model  🔒

- **Lead** — a *demand* pursuit: a buyer/tenant + a requirement + a pipeline
  stage. Sellers/landlords are **not** leads. **(Q1: yes.)**
- **Contact record belongs to exactly one store — no shared multi-role record.**
  A person who is both an owner and a buyer is **two separate records**, because
  their view and actions differ. **(Q3: no cross-linking — keep them separate.)**
- **Two contact stores**, both under a **Contacts** section as subnavs:
  - **Clients** — demand people (buyers, tenants)
  - **Owners** — supply people (owners, landlords), tied to properties
  **(Q2: two buckets, with role pills inside.)**

---

## B1 — Remark (was Note)  🔒  [P1]
- A **thread of timestamped entries**, exactly like the current note timeline —
  **not** a single editable field. Many per record, newest-first, with author +
  time.
- On **both leads and properties**.
- **Author can edit their own** entry. **No delete for now** (add later only if
  asked). Owner/manager delete is *not* built yet either.
- Implemented as a `remark` entry type folded into the existing timeline, not a
  separate silo.

## B2 — Lead pills = the pipeline stages  🔒  [P9]
- The pills across the top of Leads are simply **the pipeline stages**
  (New / Contacted / Site Visit / Negotiation / Closed Won / Closed Lost — the
  tenant's configured stages). Tap a stage → filter to it; "All" clears.
- No separate coarse segmentation and no second Buy/Rent pill row — deal type
  stays a normal filter. **(Q6: stages. Q7: no extra axis.)**

## B3 — Clients & Owners as two subnavs under Contacts  🔒  [P10]

**Decision:** one **Contacts** section with **two subnavs — Clients and Owners** —
each with role tab-pills, backed by separate records (per the model above).

**Stress test (Q8) — why this holds, and where it could break:**
- *For:* both are "people directories"; keeps top-level nav lean (Dashboard,
  Leads, Properties, Contacts, Calendar); mirrors the demand/supply split we
  already have (Leads vs Properties); subnav pills work well on mobile.
- *Against / risks considered:*
  - **Owners are coupled to Properties**, not to the leads pipeline — burying them
    under "Contacts" adds a hop. **Mitigation:** an owner is always reachable
    *contextually* from their property (the property links its owner), so the
    Contacts→Owners list is the "browse all owners / call round a project" view,
    not the only path. The subnav is a bonus surface, not a tollgate.
  - **Frequency:** Clients/leads are hit constantly, Owners less — a subnav is the
    right weight for the less-frequent one.
  - **Duplicate-person confusion:** since a person can be both (two records), we
    must not imply they're the same. Fine — the two subnavs are visibly separate
    lists; no dedup promised.
- *Verdict:* subnavs under Contacts is correct. The only alternative worth a
  glance — promoting **Clients** to top-level and leaving **Owners** under
  Properties — loses the clean "Contacts = all people" mental model, so we keep
  both under Contacts.

## B4 — Visit-proof follow-up  🔒  [P11]
The follow-up is an **activity with hard proof**:
- **Selfie is captured live in the PWA camera — no gallery upload** (can't submit
  an old/borrowed photo). Camera only.
- **Geo-tag is mandatory** — the agent **must** grant location for a site-visit
  selfie; no location, no logged visit. (GPS lat/lng/accuracy captured at capture
  time.)
- Plus a **Remark** and an **outcome** (interested · not_interested · negotiating ·
  booked · no_show).
- **Media → Cloudflare R2** (see storage below).
- **Visibility:** proof photos are **owner/manager only** (agents log them, don't
  browse each other's). **(Q12.)**
- **Retention (proposed default, confirm):** kept for the life of the lead/deal
  **+ 1 year**, owner/manager-only, never shared externally, purgeable on request.
- **Distance-to-property:** if the property has coordinates, show how far the
  selfie's GPS was from it (soft signal of a genuine on-site visit; not a block).
- **Attach:** a site-visit activity links **both the lead (client) and the
  property/unit visited**. *(Q11 — assumed "both"; confirm.)*

**Activity model:** `activities` — `type` (call · site_visit · meeting ·
follow_up · note), `at`, `agent`, `remark`, `outcome?`, `photo_url?`,
`geo{lat,lng,accuracy}?`, `lead_id?`, `property_id?`.

## B5 — Call / message on contact, with a confirm + logged action  🔒  [P8]
- Tapping **Call** or **Message (WhatsApp)** on a contact opens a **confirm modal**:
  *"This records an action and will redirect you to your dialer / WhatsApp.
  Continue?"*
- On **Yes** → redirect (`tel:` / `wa.me`) **and log the activity**. On No →
  nothing recorded.
- The **initiator is the author** and can add an **outcome + remark** to that
  action afterward — a multi-field entry, an extension of the Remark/notes idea.
- Applies wherever a contact's phone shows, including at property/contact add.

---

## Cross-cutting decisions  🔒
- **Media storage = Cloudflare R2** (S3-compatible; user is provisioning it).
  One pipeline shared by B4 selfies and Block-C property photos/videos. Store the
  object in R2, keep only the URL/key in Postgres.
- **Watermarking: no exception** — all uploaded/captured media, **including
  visit-proof selfies**, carry the firm watermark. *(Q15 — I read "no exception"
  as "don't exempt selfies"; the brand mark is a corner overlay, so it doesn't
  obscure the proof. Flag if you meant the opposite.)*

---

## Build checklist (draft — near-final)
- [ ] `contacts` split into **Clients** and **Owners** records (separate); Contacts
      section with two subnavs + role pills.
- [ ] Timeline `remark` type on leads + properties; author + time; **edit-own, no delete**.
- [ ] Lead pills = pipeline stages (filter view); deal type stays a filter.
- [ ] `activities` table (type, at, agent, remark, outcome, photo_url, geo, lead_id, property_id).
- [ ] **Cloudflare R2** upload pipeline (presigned PUT); store key/URL only.
- [ ] PWA **camera-capture-only** selfie + **mandatory geolocation**; deny → can't log visit.
- [ ] Watermark on ingest for all media (incl. selfies).
- [ ] Distance-to-property computed when property has coords.
- [ ] Call/message **confirm modal** → redirect + log activity; author adds outcome+remark.
- [ ] RBAC: proof photos owner/manager-only; retention policy.
- [ ] Audit: activity added, remark added/edited.

## Remaining confirmations
1. **Q11** — site-visit activity attaches to **both** lead + property (assumed).
2. **Q15** — watermark selfies too (my reading of "no exception").
