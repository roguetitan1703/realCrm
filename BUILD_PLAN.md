# Build plan — from demo to real product

Client #1 (Bhumi Propcity) has seen the demo and wants in. This plan turns the
demo-hardened CRM into a correctly-built multi-tenant SaaS, starting with this
tenant. It maps every piece of client feedback to a phase, and is honest about
what is real today versus theatre.

---

## Decisions locked

- **Isolation model:** shared tables + `tenant_id` column, enforced in every
  query. One database, one backup, one migration path. Correct for
  dozens–hundreds of brokerages; revisit schema-per-tenant only if a future
  enterprise/compliance client demands physical isolation.
- **WhatsApp:** `wa.me` deep links, no WABA/Cloud API. Confirmed by the client
  (feedback #7). We enrich the compose experience, we do not add an API.
- **Calling:** `tel:` to the device dialer. No third-party telephony.
- **Property export:** parked as an explicit future feature (feedback #8).
- **Payments/billing:** out of scope. Tenants are provisioned by Delpat via a
  **superadmin portal** (decided) — a platform-level `/admin` area above all
  tenants, not self-serve signup.
- **Backup:** no-cost `pg_dump` scripts (decided — already built, see
  `scripts/`), not a paid Supabase tier. Per-tenant backup config becomes
  something a tenant sets at onboarding (see Phase 2).
- **Demo OTP:** the auto-returned login code stays behind an env flag so live
  demos never lock out (decided).

---

## The honest starting state

What looks built but isn't:

- **Multi-tenancy is faked.** No table carries a `tenant_id`; no query filters by
  tenant; `requireTenantAuth` ignores the `X-Tenant-ID` header and returns one
  global workspace (`backend/src/middleware/auth.ts`). Every "tenant" would
  share the same leads and properties. A `tenants` table exists but is not wired
  to data isolation.
- **Authentication is theatre.** The login OTP autofills and verifies nothing;
  the frontend session is `{ loggedIn, role, activeAgentId }` in `localStorage`
  with `activeAgentId` defaulting to `'a1'` (`src/lib/store.jsx`). There is no
  users-with-credentials table and no token.
- **RBAC is cosmetic.** An admin/agent toggle hides nav client-side; the server
  enforces nothing. Any request can read/write anything.

What is genuinely done (this session): `tel:` calling, `wa.me` WhatsApp with a
property-filled message, the Project→Unit inventory model, CSV/Excel rich
import, and the platform-side brand split (Real Estate by Delpat vs. tenant).

**Query surface to migrate:** 9 domain tables, ~53 `sql` call sites in
`store.ts`, 9 route files.

---

## Phase 0 — Auth + tenant identity (the real foundation)

Nothing downstream is correct without real users and real tenants. Everything
else (per-user notifications, team activity, per-tenant leads, theming) assumes
this.

**Data model**
- `tenants` (exists) becomes the real anchor: `id`, `slug`, `name`,
  `brand_config`, `status`. Seed the Bhumi row.
- New `users` table: `id`, `tenant_id`, `name`, `phone`, `role`
  (`owner` | `manager` | `agent`), `status`, `created_at`. Migrate `crm_agents`
  into it (agents are users with role `agent`).
- Add `tenant_id TEXT NOT NULL` to every domain table: `crm_properties`,
  `crm_units`, `crm_leads`, `crm_settings`, `crm_integrations`,
  `crm_routing_rules`, `crm_timeline_events`, plus `users`. Backfill existing
  rows to the Bhumi tenant. Add composite indexes `(tenant_id, id)` and
  `(tenant_id, created_at)`.

**Auth**
- Real OTP: issue a code server-side, store a short-lived challenge, verify it,
  return a signed **JWT** carrying `{ tenant_id, user_id, role }`. Demo mode
  auto-returns the code (gated by `DEMO_OTP=true`) so a live demo never locks
  out — decided.
- Frontend stores the token; `api.js` sends `Authorization: Bearer`. The
  `X-Tenant-ID` header stops being trusted input — tenant comes from the token.
- New **`superadmin`** platform role, scoped above tenants (Delpat staff only).

**Superadmin auth (decided — NOT phone OTP)**
- Phone OTP is for brokers and agents. Superadmins are Delpat staff, so they use
  **email + password** (hashed, e.g. argon2/bcrypt) in a separate platform-level
  `superadmins` table with **no `tenant_id`**. Their token carries a
  `superadmin` claim, distinct from a tenant user's `{ tenant_id, user_id, role }`.
- Login is a separate screen at `/admin/login`, unrelated to the tenant phone
  flow. First superadmin is seeded from env (`SUPERADMIN_EMAIL` /
  `SUPERADMIN_PASSWORD`) so there's no chicken-and-egg.

**Superadmin portal (decided — how tenants get created)**
- A platform-level `/admin` area (a route in the same app, gated by the
  superadmin token), that: provisions a tenant (name, slug, brand), invites its
  first owner, and lists tenants with basic health (users, leads, last backup).
  This is the "by hand, through a portal" the client asked for — not self-serve.

**Deliverable:** a superadmin can create the Bhumi tenant and its owner; that
owner logs in as a real user of a real tenant, with a token every later phase
reads.

---

## Phase 1 — Enforce multi-tenancy + RBAC

**Multi-tenancy**
- A single `withTenant(req)` helper resolves `tenant_id` from the token.
- Thread `tenant_id` into all ~53 query sites: every `SELECT`/`UPDATE`/`DELETE`
  gets `WHERE tenant_id = $t`; every `INSERT` sets it. This is mechanical but
  must be complete — one missed site is a cross-tenant leak. A test seeds two
  tenants and asserts neither can see the other's rows.

**RBAC (server-enforced, feedback #3)**
- `owner`/`manager`: full tenant visibility.
- `agent`: reads/writes only leads where `agent_id = self`; can see shared
  property inventory; cannot see team management or settings.
- Enforced in middleware + query scoping, not just hidden in the UI. The
  existing client-side nav gating stays as UX, but the server is now the
  authority.

**Team activity (feedback #3)**
- The Team leaderboard already computes from state; wire the real per-user
  `/team/users/:id/performance` endpoint (calls, site visits, win-rate over 30
  days) that exists but is unused. Add an activity feed per user.

**Deliverable:** two tenants coexist with zero leakage; an agent genuinely
cannot see another agent's pipeline or the owner's settings.

---

## Phase 2 — Tenant branding (feedback #9)

The platform side is done ("Real Estate by Delpat", `realestate.delpat.in`). This
finishes the tenant side so each firm experiences *their own* software.

- `tenants.brand_config` drives: firm name, initials, **accent colour + theme**,
  city, login URL, and the browser tab. Today these are hardcoded in
  `src/data/theme.js`; they become per-tenant, loaded after login from the token's
  tenant.
- Onboarding writes a real `brand_config`; the workspace resolver returns it.
- **Logo as a tenant asset (client request):** onboarding collects the tenant's
  own logo (upload), stored in `brand_config` and editable later in Settings.
  Until a tenant uploads one, their initials tile stands in (as now). The
  **platform** logo (Real Estate by Delpat) is already generated —
  `public/brand-mark.svg`, wired into the login, onboarding, and favicon.
- Result: Bhumi sees Bhumi's name, logo and colours end to end; the next tenant
  sees theirs, with no code change.

---

## Phase 3 — The app: PWA + push (feedback #2, #4)

Their market is mid-range Android; PWA + Web Push covers it well (iOS 16.4+ also
supports push for an installed PWA).

- **PWA:** `manifest.webmanifest` (name/icons/theme from the tenant brand),
  service worker for install + offline shell, "Add to home screen" prompt. The
  app already switches to a mobile layout under 1024px, so the shell exists.
- **Push:** Web Push with VAPID keys. New `push_subscriptions` table keyed by
  `(tenant_id, user_id)`. Service worker receives and displays notifications;
  tapping deep-links into the record (the `?screen=&lead=` boot path already
  exists).
- **Delivery:** a notification service that fans an event out to (a) the in-app
  bell (the `NotifModal` exists) and (b) Web Push to that user's devices.

**Deliverable:** installable app on the owner's and agents' phones that buzzes
on the alerts defined in Phase 4.

---

## Phase 4 — Lead connectivity + alerts (feedback #1, #2)

**Portal ingestion (#1)** — the `/ingest/:tenant/:source` webhook is scaffolded
(HMAC verify, dedup, round-robin) but doesn't create leads yet.
- Finish it: parse 99acres / MagicBricks / Meta Lead Ads / website form payloads
  into a lead, dedup by phone within the tenant, assign via routing rules.
- A **Connections** screen: per-source webhook URL + secret to paste into each
  portal, with a live "last received" indicator so the owner can see it working.

**Alerts (#2)** — the events that trigger Phase 3 notifications:
- New lead assigned to you; lead gone overdue; a flagged alert (e.g. duplicate,
  SLA breach). Owner gets tenant-wide alerts; agents get their own.
- A per-user notification preference (which events, in-app vs push).

---

## Phase 5 — Signal clarity (feedback #6, #8)

Polish on the things they already value.

- **Property searchability (#8):** they check availability project-wide (owner by
  owner, floor by floor). Strengthen search/filter over the known signals —
  project, wing, floor, config, status, price band, facing, owner — and the
  project → wing → floor drill-down. (Export stays parked.)
- **WhatsApp enrichment (#6):** richer property-filled compose — cleaner
  multi-line layout, language/tone already scaffolded, optional multi-property
  share. Still a template filled from data, no AI, no API.

---

## Cross-cutting — Database backup (feedback #10) — DONE for the platform

No-cost, no paid tier. Built and verified against the live DB:

- `scripts/db-backup.sh` — gzipped `pg_dump` of the `public` schema to
  `backups/` (interactive, or `--cron` for a nightly job). Supabase internals
  (`auth`/`storage`/`realtime`) are excluded so the dump is portable.
- `scripts/db-restore.sh` — restores a chosen dump into any target; typing
  `RESTORE` is required to overwrite the `.env` database.
- `scripts/README.md` — usage, the cron one-liner, and the Supabase caveats
  (direct port 5432, SSL, pg_dump version). `backups/` is gitignored.
- **Verified:** a full backup → restore into a throwaway Supabase database
  round-tripped 12 leads / 8 properties / 1 tenant / 18 timeline events, with
  zero risk to prod.

Once data is tenant-tagged (Phase 0/1), a per-tenant export (a tenant's own rows,
`WHERE tenant_id`) can reuse this exact tooling if we choose to offer it later.

---

## Feedback → phase traceability

| # | Feedback | Phase | Status |
|---|----------|-------|--------|
| 1 | Portal lead connectivity | 4 | Scaffolded, finish |
| 2 | Notifications to phone | 3 (delivery) + 4 (triggers) | New |
| 3 | Team activity + RBAC | 1 | RBAC new; team partly built |
| 4 | Mobile app / PWA + push | 3 | New |
| 5 | `tel:` calling | — | **Done** |
| 6 | WhatsApp send experience | 5 | Done; enrich |
| 7 | No WhatsApp API | — | **Confirmed** |
| 8 | Property visibility/search (export later) | 5 | Model done; polish |
| 9 | Branding: platform + tenant | 2 | Platform done; tenant new |
| 10 | Database backup | Cross-cutting | **Done** (platform); per-tenant in Ph2 |
| 11 | True RBAC + multi-tenant | 0 + 1 | New (foundation) |

---

## Open decisions

Resolved: provisioning = **superadmin portal**; demo OTP = **env flag, yes**;
backup = **no-cost scripts, done** (no paid tier); brand assets = **tenant
uploads its logo at onboarding; Delpat platform logo generated now**
(`public/brand-mark.svg`).

Resolved (this turn): superadmin auth = **email + password**, separate
`/admin/login`, seeded from env — NOT phone OTP; `/admin` is a route in the same
app gated by the superadmin token.

Still open:

1. **First superadmin credentials:** which email(s) become Delpat superadmins,
   set via `SUPERADMIN_EMAIL`/`SUPERADMIN_PASSWORD` at deploy. (Just need the
   email when we build Phase 0.)
2. ⚠️ **Rotate the DB password:** the hardcoded fallback in `db.ts` is removed
   (env now required — done), but the old Supabase password is still in git
   history. Rotate it in the Supabase dashboard. Delpat-side action.
3. **PWA icon sizes:** the SVG mark covers the tab/login; Phase 3 needs raster
   192/512 PNGs (+ maskable) derived from it. Fine to generate from the SVG.

## Sequencing notes / risks

- **Phase 0→1 is the load-bearing wall.** Build it before any feature phase, or
  those features get rebuilt. This is exactly what feedback #11 asks for.
- The tenant-id threading is mechanical but unforgiving — the two-tenant leak
  test is non-negotiable before we call Phase 1 done.
- Phases 3, 4, 5 are largely independent once the foundation lands and can be
  reordered by what the client most wants to see next.
