# Spec: Contacts & leads (Roadmap block B)

**Status:** 🧭 planning — **all open questions raised** (answers pending before
lock). Items: B1 Remark · B2 lead segment pills · B3 separate contact stores ·
B4 richer visit-proof follow-up · B5 call-on-contact.

---

## The foundational model (decide first — B2 & B3 depend on it)

Proposed taxonomy so the pieces stop overlapping:

- **Contact** — a *person* record (name, phone, email, …) with one or more
  **roles**: `buyer`, `tenant`, `owner`, `landlord` (maybe `investor`).
- **Lead** — a *demand-side pursuit*: a buyer/tenant **contact** + a
  **requirement** (what they want) + a **pipeline stage**. Leads = the sales
  pipeline. Sellers/landlords are **not** leads — they're supply-side contacts
  tied to properties.
- **Directory split (B3):** the people directory separates into
  - **Clients** — demand people (buyers, tenants)
  - **Owners** — supply people (owners, landlords)
- **Pills (B2)** are a *view* over one axis, not a new entity:
  - on **Leads**: segment by lifecycle (Fresh / Active / Closed …)
  - on **Clients/Owners**: tab-pick by role (the pattern the client already liked)

Everything below assumes this model; Q1–Q3 confirm or reshape it.

---

## B1 — Note → Remark  [P1]
Rename "Note" → **Remark** on **leads and properties**, as running comments.

**Proposed:** a Remark is a **threaded, timestamped entry** (author + time), many
per record, shown newest-first; author can edit/delete **their own**; folded into
the existing timeline as a `remark` event type (not a separate silo).
→ Q4, Q5.

## B2 — Lead segment pills  [P9]
Quick tab-pills across the top of Leads to segment at a glance (the same
tab-pick UX they liked in Contacts).

**Proposed pills (coarse, derived from stage):** All · **Fresh** (new/uncontacted)
· **Active** (contacted→negotiating) · **Site visit** · **Closed** (won/lost).
Plus an optional **Buy / Rent** filter axis.
→ Q6, Q7.

## B3 — Separate contact stores  [P10]
Owners kept apart from buyers/tenants — not one combined page.

**Proposed:** two directory surfaces — **Clients** (buyers/tenants) and **Owners**
(owners/landlords) — each with role tab-pills. One underlying `contacts` table
with roles; the split is a filtered view + separate nav, so a person who is both
still exists once and links across.
→ Q2, Q3, Q8.

## B4 — Richer visit-proof follow-up  [P11]
Follow-up becomes an **activity with proof**, not a button: the agent logs a
visit with a **selfie at the property with the client**, **geo-tagged**, plus a
**Remark** (and an outcome). Proves the visit happened (agent accountability) and
that the client came through the broker (deal security). Folds in the post-audit
"site-visit outcome tags."

**Proposed activity model:** `activities` on a lead (and/or property):
`type` (call · site_visit · meeting · follow_up · note), `at`, `agent`, `remark`,
optional `photo_url`, `geo{lat,lng,accuracy}`, `outcome` (for visits:
interested · not_interested · negotiating · booked · no_show).
- Selfie → **object storage** (not Postgres); GPS captured at capture-time via the
  browser Geolocation API in the PWA.
→ Q9, Q10, Q11, Q12.

## B5 — Call-on-contact at add  [P8]
A **Call** action at the moment you add/see a contact on a property (owner) or a
lead — one tap to `tel:` them, optionally logging the call as an activity.

**Proposed:** a `tel:` button wherever a contact's phone shows at add-time; if
pressed, offer to log a `call` activity (B4) with an outcome + remark.
→ Q13.

---

## OPEN QUESTIONS (all at once)

**Taxonomy**
1. Confirm the split: **Leads = demand (buyers/tenants) only**; sellers/landlords
   are supply-side **Owners**, not leads. Yes / adjust?
2. Directory buckets: **two** — *Clients* (buyers+tenants) and *Owners*
   (owners+landlords)? Or more/other groupings?
3. Can one person hold multiple roles (owner **and** buyer)? If yes, one contact
   record linked across both surfaces (recommended), or duplicate entries?

**B1 Remark**
4. Remark = a **thread of timestamped entries** (recommended) or a single
   editable text field?
5. Edit/delete rules: author edits/deletes **own only**; owner/manager can delete
   any? And do property remarks and lead remarks behave identically?

**B2 Lead pills**
6. Confirm the pill set: **All · Fresh · Active · Site visit · Closed** — or give
   me your exact labels.
7. Do you want a second **Buy / Rent** toggle on Leads, or keep it to one pill row?

**B3 Contacts**
8. Are **Clients** and **Owners** two separate **nav items**, or two tabs inside
   one "Contacts" screen?

**B4 Visit-proof follow-up**
9. Activity types to support: **call · site visit · meeting · follow-up · note** —
   right set? Anything missing (e.g. payment/booking)?
10. Is the **geo-tag mandatory** for a site visit, or best-effort (allow logging
    if the agent denies location)? Should we **verify** the selfie's GPS is near
    the property, or just record it?
11. Do these activities attach to the **lead**, the **property**, or **both**
    (e.g. a visit references both the client and the unit)?
12. Who can see the proof photos — **owner/manager only**, or the agent too? Any
    retention concern (selfies of clients)?

**B5 Call-on-contact**
13. Should pressing **Call** always **log a call activity** (with outcome+remark),
    or just dial and log only if the agent chooses?

**Cross-cutting**
14. **Media storage:** selfies (B4) + property photos/videos (block C) should go
    to **object storage** (Supabase Storage or S3), not Postgres. Decide the
    provider now so B4 and C share one pipeline — **Supabase Storage** (same
    project, simplest) unless you prefer S3?
15. **Watermarking** (block C, #3) will apply to shared property media — should
    **visit-proof selfies be exempt** (internal evidence, not shared)? (I assume
    yes.)

---

## Build checklist (draft — firms up after answers)
- [ ] `contacts` table with roles; migrate current leads' people out; Clients/Owners views.
- [ ] `remarks`/timeline `remark` type on leads + properties; author+time; edit-own.
- [ ] Lead segment pills (view over stage) + optional Buy/Rent axis.
- [ ] `activities` table (type, at, agent, remark, photo_url, geo, outcome); lead/property attach.
- [ ] Object-storage pipeline (upload, store URL) shared by B4 + C.
- [ ] Geolocation capture in PWA; permission-denied fallback.
- [ ] Call-on-contact `tel:` + optional call-activity logging.
- [ ] RBAC: who sees proof; who edits remarks.
- [ ] Audit: activity added, remark added/edited/deleted.
