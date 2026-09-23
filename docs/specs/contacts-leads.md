# Spec: Contacts & leads (Roadmap block B)

**Status:** 🔒 **LOCKED & SEALED** — all questions answered. Items: B1 Remark ·
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
- **Attach: the activity belongs to the LEAD only — never written onto the
  property.** *(Q11 resolved.)* A visit may **reference** the unit it concerned
  (`property_id`), but that's a pointer, not ownership: the property record must
  **not** accumulate activity data. This keeps properties clean.
  - **Property-side views stay derived**, not stored: "interested buyers" and
    "visits to this unit" are computed by querying the leads/activities that
    reference the property (same pattern as today's matching-derived buyers), so
    the relationship can change without ever mutating the property row.

**Activity model:** `activities` — `type` (call · site_visit · meeting ·
follow_up · note), `at`, `agent`, `remark`, `outcome?`, `photo_url?`,
`geo{lat,lng,accuracy}?`, **`lead_id` (owner)**, `property_id?` (reference only).

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
  visit-proof selfies**, carry the firm watermark. **(Q15 confirmed.)**

---

## Build checklist (draft — near-final)
- [ ] `contacts` split into **Clients** and **Owners** records (separate); Contacts
      section with two subnavs + role pills.
- [ ] Timeline `remark` type on leads + properties; author + time; **edit-own, no delete**.
- [ ] Lead pills = pipeline stages (filter view); deal type stays a filter.
- [ ] `activities` table owned by **lead_id**; `property_id` is a reference only (properties never accumulate activities).
- [ ] Property "interested buyers / visits" = **derived** from referencing leads/activities, not stored on the property.
- [ ] **Cloudflare R2** upload pipeline (presigned PUT); store key/URL only.
- [ ] PWA **camera-capture-only** selfie + **mandatory geolocation**; deny → can't log visit.
- [ ] Watermark on ingest for all media (incl. selfies).
- [ ] Distance-to-property computed when property has coords.
- [ ] Call/message **confirm modal** → redirect + log activity; author adds outcome+remark.
- [ ] RBAC: proof photos owner/manager-only; retention policy.
- [ ] Audit: activity added, remark added/edited.

## Remaining confirmations
_None — sealed._

---

# 2026-09-23 — the rethink

Reopened by the user ("it's also the time to rethink the contacts — client /
owners… it needs importance now"). **This revisits Q3 above, which was answered
"no cross-linking, keep them separate" in July.** That answer is quoted here so
the change is a decision and not a drift.

## What Contacts actually is today

| | Where it comes from |
|---|---|
| Contacts → **Clients** | `crm_leads`, one row per lead |
| Contacts → **Owners** | a `GROUP BY owner_name` over `crm_properties` — **text on a listing, not a record** |
| **Calling** (the owner queue) | `crm_owners`, a third table, linked to neither |

So "owner" means two unrelated things: a name typed on a listing, and a row in
the calling list. Nothing joins them, and nothing joins either to the lead who
is the same human being.

### Measured, production, 2026-09-23

| | bhumi | mahalaxmi | delpat (test) |
|---|---|---|---|
| leads | 671 | 28 | 94 |
| calling rows (`crm_owners`) | **0** | **0** | 732 |
| listings carrying an owner name | **2** | **1** | 5,896 (5 distinct names) |
| people who are both a lead and a listing's owner | 0 | 0 | 3 |

**Both paying clients have an Owners tab built on 2 and 1 rows of typed text.**
Mahalaxmi's single one is the "abc" the user reported: adding an owner on a
property writes two text fields on that listing and creates **no owner record at
all**, so it never reaches Calling, has no unit, no stage and no history.

### What the Owners tab invents (store.ts `listContacts`)

- `phone: r.phone || '+91 —'` — a phone number that does not exist
- `minsAgo: 120` — **hardcoded**; every row claims activity two hours ago
- grouped by `owner_name`, so two people with one name merge into one row and
  one person spelled two ways becomes two
- no unit, which is the first thing a caller needs (1.5 / 6.1)

## The model — as the user defined it, 2026-09-23

Three populations, three screens, and **they are not the same people**:

| Screen | Who | How they get there |
|---|---|---|
| **Leads** | buyers and tenants | a portal enquiry, or added by hand |
| **Calling** | people we ring **to win a property to manage** — prospects | imported list, or added to the queue |
| **Contacts** | **owners whose property we manage** | **a property is added**; nothing else creates one |

The user's words: *"the leads for calling owners to acquire their property
correctly sits in the calling sector… properties are not meant to be created
from that, owners are not meant to be created from that. Once a person approves
— okay, please manage my property for me — they add the property as well, and
that is the owners database of the properties they manage. Leads being in
Contacts is a wrong thing."*

So:

- **Contacts has one list and no sub-nav.** The Clients tab (the leads table
  under another name) is gone: it put one person on two screens under two names.
- **A contact is created by adding a property**, never on the Contacts screen.
  The CTA there is Add property.
- **Calling stays a pipeline.** Nothing in it creates a property or a contact.
- **Conversion is by hand today** — the agent adds the property when the owner
  agrees. The user wants a real conversion step later; it is not built now.
- The calling record and the managed owner are **the same row** when they are
  about the same flat (project + tower + unit), so a person who agrees keeps
  their call history. Contacts is "has a listing linked", Calling is the queue.
- **Roles stay derived** from what they have given us: Seller, Landlord, or both.

## Phases

- **A — stop the fiction. SHIPPED 2026-09-23 (`ce1020c`).** Adding an owner on a
  property creates/links a real `crm_owners` row keyed project + tower + unit
  and links it both ways; Contacts → Owners reads those records (unit, stage,
  agent, real last activity, listings by link); `minsAgo: 120` and `'+91 —'` are
  gone; a new "No listing yet" pill covers owners with no listing of ours, which
  for both paying clients is all of them. `npm run link:owners -- --env=… 
  --tenant=… [--apply]` does the same for listings written before this, report
  first. **Not yet run on production** — 2 listings for bhumi, 1 for mahalaxmi.
- **B — the conversion.** "They agreed" as one action from a calling record:
  add the property, carry the person and the history over, leave the queue.
  (This replaces the earlier plan of a `crm_contacts` identity table across
  leads and owners — the user's model says leads are not contacts at all.)
- **C — housekeeping.** Merging two contacts, and what a shared family or office
  number means.

## Open, for the user

1. **The conversion step.** Today: the owner agrees, the agent adds the
   property by hand, and the calling record becomes the contact only if the flat
   matches. A real "they said yes → take the property" action would carry the
   unit, the owner and the call history across in one move. Wanted, not built.
2. **Does a portal lead from someone whose property we manage get flagged?**
   The two are separate records by July's decision, reaffirmed today for the
   directory. Flagging the overlap at arrival is a smaller, different question.
3. **Is a contact a phone number** when the same owner gives us two flats? Today
   that is two rows, one per unit, because a call is about a unit.
