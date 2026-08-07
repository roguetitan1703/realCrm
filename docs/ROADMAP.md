# RealEstate by Delpat — Product Roadmap

> ## ⚠️ Status correction — 2026-08-07
>
> **The backlog below is out of date and misled a session into planning work
> that had already shipped.** It was written 2026-07-29; blocks **A, B, C and D
> were built in the week that followed** and still read ⬜ here. Trust
> `git log` over this file until the table is rewritten.
>
> What actually happened since:
>
> | | |
> |---|---|
> | **A** auth/users | shipped — password login, seats, sessions, user management |
> | **B** contacts & leads | shipped — Remark, status pills, Clients/Owners split, visit-proof, call-confirm-then-log |
> | **C** properties | shipped — canonical vocabulary enforced by the build, portal-grade schema, stepped add page, photos + watermark |
> | **D** ingestion | shipped — webhook inbox, click-to-map parser, replay, setup pack |
> | *(unplanned)* | the in-memory collections were **deleted**; every list, count and phone screen now reads paged SQL |
> | *(unplanned)* | Owners/Calling promoted to a top-level module |
> | **F** enquiries | **new — [specs/enquiries.md](./specs/enquiries.md)**, planning, decisions locked |
>
> **2026-08-07, `bhumi`:** the client asked for both spreadsheet imports to be
> reverted — 494 leads removed (archived first) — and to work only from the
> integration feed. Every lead now arrives by webhook. That makes person
> resolution (`CLAUDE.md §3.7`) the only deduplication left in the product, and
> it is why **F** matters more than it did when it was written.
>
> Still genuinely open from below: **A0** (isolation — one live vector fixed
> 08-07, see `readStateCache`), **E2** secrets, **E3/E4** PWA on a real device,
> **E5** branding audit, **E6** backup restore, **E7** retention.

> **Status: production.** The demo succeeded; we are onboarding our **first real
> paying tenant**. This is the single working backlog. It clubs the original
> client feedback (11 points), the post-audit gaps, and the new production list
> (17 points) into one themed, sequenced plan.
>
> **Working agreement:** we **plan every point into a running spec first**
> ([docs/specs/](./specs/)), revising as we work through the roadmap, and
> **develop once** the plans are settled — not design-and-build one point at a
> time. Items here are not "minimal checkpoints"; each carries open questions to
> resolve before code.
>
> **Detailed plans:** [specs/](./specs/) — e.g. [specs/auth.md](./specs/auth.md)
> (block A). The roadmap is the map; specs are what we build against.

**Legend:** ✅ shipped · 🔶 partial / needs rework · ⬜ pending · 🅿️ parked

---

## 0. Already shipped (prior scope, condensed)

From the original 11 client-feedback points and the sprint work:

> **Honesty note (2026-07-29):** several items previously marked ✅ were code-
> complete but **not verified in production** — downgraded below. "Code exists"
> is not "done" for a paying tenant. Nothing here is signed off until it's
> deployed and checked on a real device/tenant.

| # | Item | Status | Note |
|---|------|--------|------|
| C1 | Lead ingestion from portals (per-tenant `/ingest/:slug/:source?key=`) | 🔶 | Works; #15 is the richer inbox+parser evolution. |
| C2 | Phone notifications (Web Push, VAPID, no Firebase) | ⬜ | **UNVERIFIED.** Code wired end-to-end but no real-device delivery ever confirmed. Treat as unproven until a push lands on a phone. |
| C3 | Team activity / RBAC | 🔶 | Server RBAC enforced; user-mgmt is thin → #14 (A-block). |
| C4 | Mobile PWA + install + push | 🔶 | **Weak.** Tenant-themed app not actually installed/verified; PWA is not robust. Needs an install + offline + push pass on a real device. |
| C5 | `tel:` click-to-call | ✅ | Built-in (not an "integration"). |
| C6 | `wa.me` WhatsApp richness | 🔶 | Text is trilingual/structured, but **media sharing is missing** — richness incomplete until photos/videos (C2m/#3) are in the share. |
| C7 | No WhatsApp Business API | ✅ | Deep links only, by design. |
| C8 | Property visibility / search / export | 🔶 | Search exists; **filters buggy → #5**; export parked. |
| C9 | Branding: tenant + Delpat platform split | 🔶 | **Not complete.** Single-source `brand_config` exists, but branding needs a real richness + consistency **audit** across login/desk/mobile/PWA/email/share — many surfaces unproven. |
| C10 | DB backup | 🔶 | `db-backup.sh` dumps public schema, but **per-tenant restore/use is undefined**, and Supabase storage limits not sized. Open questions below. |
| C11 | True multi-tenant + RBAC (real, not theatre) | 🔶 | **Still not trustworthy.** tenant_id + token-auth landed and passed a scripted leak test, but **demo-data leakage is still observed**, multi-tenancy is flaky, and the superadmin is weak. Needs a full isolation audit → new item **A0** below. |

Post-audit gaps:

| Item | Status | Note |
|------|--------|------|
| Full Project→Unit model | ✅ | Derived grouping lens; bulk add-units; import-into-project. |
| Site-visit outcome tags | 🔶 | Folded into #11 (richer follow-up/visit proof). |
| Staged CSV import | ✅ | Map → dedup → revertable batch. |

Foundation work (2026-07-29): lead ingest, team creation, onboarding rewritten
from theatre toward real; onboarding gated to the superadmin console. A frontend
isolation bleed was fixed — **but demo-data leakage is still being seen**, so
isolation is NOT closed (see **A0**). Per-workspace URLs (`/orgname`) with a
Vercel SPA fallback (fix committed, not yet on `origin`).

---

## Production backlog (the working list)

Grouped by theme. Bracketed tags are the source item numbers
(`P#` = new production list, `C#` = original client list).

### A0. Isolation & superadmin audit — **production blocker, do before onboarding a paying tenant** [reopened C11]

- ⬜ **Demo-data leakage still observed** — hunt every source: bundled default
  dataset in the frontend store, cached snapshots (`crm_state_cache_*`), any
  query missing `WHERE tenant_id`, hydrate paths, and stale localStorage across
  tenant switches. The scripted leak test passed but real usage still leaks —
  reproduce it, then fix the actual vector, then re-audit.
- ⬜ **Multi-tenancy is flaky** — audit tenant resolution end-to-end (token vs
  header vs URL slug), switching tenants, and every raw-SQL route.
- ⬜ **Superadmin is weak** — harden `/admin`: session/expiry, no tenant-token
  crossover, audit of superadmin actions, and a real overview (not thin).
- *This gates go-live: a paying tenant seeing another tenant's / demo data is
  the one unacceptable failure.*

### A. Auth, sessions & user management — **the keystone; design as one unit**

Moving off OTP entirely. This reshapes `users`, login, sessions, and RBAC, and
**reverses the email-OTP work** — accepted, because OTP-every-login is wrong for
a daily-use CRM.

- **A1 [P12]** ⬜ **ID/username + password login**, with phone + **PIN** as an
  alternate. Collect real user details at creation. Not OTP.
  - *Open:* password + optional PIN (short, device-convenient) — PIN is a
    secondary factor/fast-unlock, not the only credential. Hashing (bcrypt,
    already in). Lockout/rate-limit policy.
- **A1a [P12a]** ⬜ **IDs decoupled from the person.** A login ID is a seat that
  can be reassigned when an agent leaves and a replacement is hired — the CRM
  history stays on the seat, the human behind it changes.
  - *Open:* model as `user` (the seat/credential) vs `person` (name/contact),
    or a "reassign seat" action that swaps identity while keeping id + leads.
    Decide before schema.
- **A2 [P13]** ⬜ **Long sessions** (weeks, not daily re-login). Plus **active
  sessions** view: when/where each login happened, feeding the **audit log**.
- **A3 [P14]** ⬜ **Real user management:** edit details, **change password**,
  **suspend** (reversible, blocks login, keeps data) vs **deactivate** vs
  **hard delete** (distinct), **invite users**. (What else? role change, resend
  invite, force-logout a session.)
- Absorbs **C3/C11** RBAC into a real admin surface.

### B. Contacts & leads structure

- **B1 [P1]** ⬜ Rename **Note → Remark** on leads *and* properties (comments).
- **B2 [P9]** ⬜ **Lead sub-segments via tab pills** (Fresh / Interested /
  Sellers / Landlords …) — the same instant tab-pick pattern already in
  Contacts, agreed with the client.
- **B3 [P10]** ⬜ **Separate contact stores** — owners kept apart from
  buyers/tenants, not one combined page.
- **B4 [P11]** ⬜ **Richer follow-up flow** — not a button but an **activity**:
  agents add a follow-up with **proof** — a selfie at the property with the
  client, **geo-tagged**, plus a **Remark**. Proves the visit happened (agent
  accountability) and that the client came through the broker (deal security).
  Folds in the post-audit "site-visit outcome tags".
- **B5 [P8]** ⬜ **Call on contact** at the moment of property/contact add.

### C. Properties — fields, media, filters

- **C-fix [P5]** ⬜ **Filters are broken** in Properties — diagnose which
  filters don't apply and why (likely field-name mismatch vs the new columns).
  *First / cheapest win — do early.*
- **C1f [P6]** ⬜ **Field additions:**
  - Floor no. / Flat no. / **Owner name** — *client wants owner name; open
    question: how do we map the owner later & handle re-availability without it?
    Resolve before building.*
  - Carpet; **Rent + Deposit** (rent deals); **Facing**; **Society name**;
    **Location** (locality exists — add a **Google Maps location** to share).
  - **Furnished / Unfurnished.**
  - Rename **"Brokerage" → "Consulting"** everywhere.
  - **Tax incl./excl.** tick; **Consulting %** (a number, for sale and rent);
    **Availability date**; **Remark**.
- **C2m [P2]** ⬜ **Photos & videos** on properties, shareable with the listing.
- **C3w [P3]** ⬜ **Watermark** uploaded photos/videos with the firm's branding
  (ties to B1 brand mark) so shared media carries the owner-firm watermark.
- **C4x [P7]** ⬜ **Super-expansions:** furniture list on furnished/unfurnished
  (crucial for sales); fields that **change by sale vs rent**; a richer schema —
  **model the flow from MagicBricks / Housing / 99acres** first (study their
  data collection), then map ours.
- **C5ai [P4]** 🅿️ **AI photo → home-tour video** generator (from N photos).
  Later, not now.

### D. Ingestion platform (provider-agnostic)

- **D1 [P15]** ⬜ **Webhook inbox + configurable parser.** Provider-agnostic
  pipeline: partners POST to `…/v1/ingest/{tenant}` with `X-API-Key`. System:
  authenticates → **stores raw payload + request metadata in a Webhook Inbox** →
  identifies (tenant + provider) → applies the **configured parser** to map the
  provider payload into the canonical lead schema → validates + imports, keeping
  the raw payload for **audit / replay / troubleshooting**. **Leads are NOT
  loaded until a parser is configured.** New sources = configure integration +
  parser mapping, no core changes. (Parser can start as a simple JSON key mapper.)
  - *Relation to today:* evolves the existing `/ingest/:slug/:source?key=` — add
    the inbox, deferred parsing, and per-provider config.
- **D2 [P16]** ⬜ **Client-forwardable setup pack** — generate an email /
  instructions the tenant can forward to their 3rd party, containing the
  endpoint URL, API key, and how-to.

### E. Cross-cutting / ops

- **E1 [P17]** 🔶 Per-workspace URL Vercel 404 — fix committed (`aab3f79`), **not
  yet pushed/deployed**. Verify on the live domain after deploy.
- **E2** ⬜ Rotate the secrets exposed during dev before go-live (DB password,
  SES, VAPID, superadmin) — manual, user-side.
- **E3 [reopened C2/C4]** ⬜ **PWA install identity + push, on a real device** —
  installed tenant app shows **tenant name + icon** (not "RE"), sticky top/bottom
  bars (scroll bug), and a real push lands on a phone. Plan: [specs/pwa.md](./specs/pwa.md).
- **E4 [reopened C4]** ⬜ **PWA = one app (the website installed), not a second
  app** + flow/screen audit vs the latest web app. [specs/pwa.md](./specs/pwa.md).
- **E5 [reopened C9]** ⬜ **Branding & platform identity** — the white-label crux:
  two-identity rule (Delpat vs tenant), **curated multi-colour themes** (no random
  hex), fix the **colour-bleed-on-logout** bug, real **`/{tenant}` URL model**
  (kill fake `app.{tenant}.com`), **landing page** (contact-for-onboarding) +
  org-select login, quiet "Powered by Delpat". Plan: [specs/branding.md](./specs/branding.md).
- **E7 [global]** ⬜ **Data lifecycle & retention** — no store grows unbounded.
  Every append-only/growing table or bucket ships with a retention policy; one
  nightly purge job; storage monitoring in the superadmin console. Full register
  in [specs/data-lifecycle.md](./specs/data-lifecycle.md). **Review-gate:** a new
  growing store can't land without its policy.
- **E6 [reopened C10]** ⬜ **Backup restore story** — define how a Supabase
  Postgres dump is *restored*, and specifically **per-tenant** restore/export
  (`WHERE tenant_id`). Size the Supabase plan's **storage limit** vs expected
  tenant data + media (photos/videos from C2m will dominate — likely object
  storage, not Postgres). Open question to resolve, see below.

---

## Suggested sequence

0. **A0 isolation & superadmin audit** — **blocks go-live.** No paying tenant
   until demo-data leakage is gone and multi-tenancy is trustworthy.
1. **A (auth/users)** — keystone; login changes, everything else sits on it.
2. **C-fix [P5]** filters — quick correctness win, can run in parallel.
3. **B1 [P1]** Remark + **B2/B3** lead/contact structure.
4. **C fields [P6]** + **C media/watermark [P2/P3]**.
5. **D ingestion [P15/P16]**.
6. **B4 [P11]** visit-proof, **C4 [P7]** super-expansions.
7. Verification passes: **E3/E4** PWA+push on device, **E5** branding audit.
8. Parked: **C5 [P4]** AI video.

Sequence is a proposal — we confirm per point as we go.
