# RealEstate by Delpat — Product Roadmap

> **Status: production.** The demo succeeded; we are onboarding our **first real
> paying tenant**. This is the single working backlog. It clubs the original
> client feedback (11 points), the post-audit gaps, and the new production list
> (17 points) into one themed, sequenced plan.
>
> **Working agreement:** we go **point by point** — design first, then build.
> Items here are not "minimal checkpoints"; each carries open questions to
> resolve before code.

**Legend:** ✅ shipped · 🔶 partial / needs rework · ⬜ pending · 🅿️ parked

---

## 0. Already shipped (prior scope, condensed)

From the original 11 client-feedback points and the sprint work:

| # | Item | Status | Note |
|---|------|--------|------|
| C1 | Lead ingestion from portals (per-tenant `/ingest/:slug/:source?key=`) | 🔶 | Works; #15 is the richer inbox+parser evolution. |
| C2 | Phone notifications (Web Push, VAPID, no Firebase) | ✅ | Needs live phone verification post-deploy. |
| C3 | Team activity / RBAC | 🔶 | Server RBAC enforced; user-mgmt is thin → #14. |
| C4 | Mobile PWA + install + push | ✅ | Per-tenant icon/manifest. |
| C5 | `tel:` click-to-call | ✅ | Now framed as built-in (not an "integration"). |
| C6 | `wa.me` WhatsApp richness (trilingual, structured) | ✅ | |
| C7 | No WhatsApp Business API | ✅ | Deep links only, by design. |
| C8 | Property visibility / search / export | 🔶 | Search exists; filters buggy → #5; export parked. |
| C9 | Branding: tenant + Delpat platform split | ✅ | Single source `tenants.brand_config`; presets-only. |
| C10 | DB backup | ✅ | `scripts/db-backup.sh` + restore, verified. |
| C11 | True multi-tenant + RBAC (real, not theatre) | ✅ | tenant_id everywhere, token-authoritative, leak-tested. |

Post-audit gaps:

| Item | Status | Note |
|------|--------|------|
| Full Project→Unit model | ✅ | Derived grouping lens; bulk add-units; import-into-project. |
| Site-visit outcome tags | 🔶 | Folded into #11 (richer follow-up/visit proof). |
| Staged CSV import | ✅ | Map → dedup → revertable batch. |

Foundation made real (2026-07-29): lead ingest, team creation, onboarding — all
rewritten from theatre to real; onboarding gated to the superadmin console.
Tenant isolation bleed fixed on the frontend. Per-workspace URLs (`/orgname`)
with Vercel SPA fallback.

---

## Production backlog (the working list)

Grouped by theme. Bracketed tags are the source item numbers
(`P#` = new production list, `C#` = original client list).

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

- **E1 [P17]** ✅ Per-workspace URL Vercel 404 — fixed (SPA catch-all rewrite).
- **E2** ⬜ Rotate the secrets exposed during dev before go-live (DB password,
  SES, VAPID, superadmin) — manual, user-side.
- **E3** ⬜ Confirm live push on a real installed PWA post-deploy.

---

## Suggested sequence

1. **A (auth/users)** — keystone; login changes, everything else sits on it.
2. **C-fix [P5]** filters — quick correctness win, can run in parallel.
3. **B1 [P1]** Remark + **B2/B3** lead/contact structure.
4. **C fields [P6]** + **C media/watermark [P2/P3]**.
5. **D ingestion [P15/P16]**.
6. **B4 [P11]** visit-proof, **C4 [P7]** super-expansions.
7. Parked: **C5 [P4]** AI video.

Sequence is a proposal — we confirm per point as we go.
