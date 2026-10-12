# Sprint — real foundation + the features the client asked for

Scope for the next couple of days. Not a roadmap, not an SRS — the concrete set
of things we ship this sprint, and the data model they run on.

## Goal

Turn the demo into a properly-built multi-tenant CRM: real auth, real tenant
isolation, real RBAC, on a **properly designed schema** — then the client's
asks (notifications, portal leads, tenant branding) sit cleanly on top.

## The schema (designed once, migrated once)

Real columns for the signals we query and the client values; foreign keys and
constraints; JSONB only for genuinely open-ended overflow. `tenant_id` on every
tenant-owned row, always indexed. This replaces the thin-blob + patch-columns
approach.

```
tenants        id (pk, = slug) · name · brand_config(jsonb) · plan · status · timestamps
superadmins    id (pk) · email (uniq) · password_hash · name · created_at
users          id (pk) · tenant_id (fk tenants) · name · phone · email · role
               · status · avatar · created_at        UNIQUE(tenant_id, phone)
auth_otp       id (pk) · tenant_id · phone · code · expires_at · consumed

properties     id (pk) · tenant_id (fk) · title
               · project · wing · unit_no · type · deal · status
               · price(bigint) · carpet_sqft · floor · total_floors
               · facing · furnishing · parking · possession · age_years
               · builder · rera_no · locality
               · owner_name · owner_phone · owner_email
               · extra(jsonb)  · created_at · updated_at
               INDEX(tenant_id, project) · INDEX(tenant_id, status)

leads          id (pk) · tenant_id (fk) · name · phone · email
               · stage · source · agent_id (fk users)
               · deal · config · locality · budget_min · budget_max
               · purpose · timeline · overdue · follow_up(jsonb) · created_at
               INDEX(tenant_id, stage) · INDEX(tenant_id, agent_id)

lead_shortlist id (pk) · tenant_id · lead_id (fk) · property_id (fk)
               · verdict · reason · created_at     UNIQUE(lead_id, property_id)
               -- normalizes leads.shortlist + leads.feedback JSONB out into rows

activities     id (pk) · tenant_id · record_type · record_id · type
               · title · description · author_id · metadata(jsonb) · created_at
               INDEX(tenant_id, record_type, record_id)
               -- BUSINESS timeline: user-facing, per record (the lead timeline)

notifications  id (pk) · tenant_id · user_id (fk) · type · title · body
               · link · read · created_at          INDEX(tenant_id, user_id, read)
               -- ALERTS: to a user's inbox / push. Ephemeral, dismissible.

audit_log      seq (bigserial pk, monotonic) · tenant_id (nullable = platform)
               · actor_type ('user'|'superadmin'|'system') · actor_id
               · actor_label (name/email captured at write — survives deletion)
               · action (e.g. 'lead.delete', 'auth.login_failed', 'export.run')
               · target_type · target_id · summary · metadata(jsonb)
               · ip · user_agent
               · prev_hash · hash          -- SHA-256 chain: tamper-evident
               · created_at
               INDEX(tenant_id, created_at) · INDEX(action)
               -- SECURITY ledger: append-only, who/what/when/where. NOT the
               -- business timeline. Never updated, never deleted, survives a
               -- workspace reset (a ledger you can wipe isn't a ledger).

integrations   id (pk) · tenant_id · key · config(jsonb) · status
               UNIQUE(tenant_id, key)
routing_rules  tenant_id (pk) · strategy · active_agent_ids(jsonb) · last_index
```

Why these are columns, not JSONB: project/wing/unit, price, carpet, facing,
owner, stage, budget are exactly what the client filters and searches on
(feedback #8). Columns are indexable and queryable; a JSONB blob is neither.

### Three ledgers, kept separate

Easy to conflate; each has a different job and lifecycle:

| Table | Job | Audience | Lifecycle |
|---|---|---|---|
| `activities` | business timeline (call logged, stage moved) | tenant users | editable context, wiped on reset |
| `notifications` | alerts to act on | one user | ephemeral, dismissible |
| `audit_log` | who did what, when, from where | owner + Delpat | **append-only, immutable, survives reset** |

**The audit ledger** is what makes this platform-grade and directly answers the
client's fear of an agent leaving with the client list. It records, at minimum:
- **Auth:** login success/failure, OTP issue, superadmin login.
- **Access to sensitive data:** lead/contact view and **export** (the walk-out
  risk), property owner-contact reveals.
- **Mutations:** create/update/**delete** of leads and properties, with a
  before→after diff in `metadata`.
- **Authority:** RBAC denials, role changes, user deactivation.
- **Platform:** superadmin tenant provisioning and any cross-tenant action
  (`tenant_id` = the affected tenant; actor = the superadmin).

It's **tamper-evident**: each row stores `prev_hash` and a `hash` over its
canonical content + the previous row's hash. Altering or deleting any past row
breaks the chain, which a verify pass detects. Appends are serialized through one
`audit(...)` helper (low volume; fine at this scale — per-tenant chains later if
it ever isn't). It is deliberately **excluded from workspace reset**, alongside
`superadmins`.

Migration is one clean step: create the new tables, copy the current rows in
(flattening today's `req`/`config` JSONB into the new columns), verify counts,
swap. Backups exist; the demo data round-trips.

## What ships this sprint

1. **Proper schema + migration** — the above, one migration, persistence layer
   (store.ts mappers, seed) rewritten to match. Day 1.
2. **Real auth wired to the frontend** — phone OTP for brokers/agents (done
   server-side; wire Login), JWT in requests, superadmin email+password at
   `/admin/login`. Kills the fake localStorage session.
3. **Tenant isolation enforced** — `tenant_id` from the token threaded through
   every query; a second-tenant leak test that must pass.
4. **RBAC enforced server-side** — owner/manager see all; agent sees only their
   own leads; settings/team gated. Not just hidden in the UI.
5. **Superadmin portal** — `/admin`: provision a tenant, invite its owner, list
   tenants. How Delpat onboards a client by hand.
6. **Notifications** — new-lead / overdue / flagged alerts to an in-app inbox
   per user, with the delivery hook that push (next sprint) plugs into.
7. **Audit ledger** — the `audit(...)` helper wired into auth, RBAC denials, and
   every lead/property mutation + export from day one, plus a verify-chain
   check. An owner-visible "Activity & access" view can be minimal this sprint;
   the point is that the ledger is *capturing* correctly from the start.

## Next sprint (named so we don't scope-creep this one)

PWA install + Web Push; portal lead ingestion (99acres/MagicBricks/website);
tenant theming end to end (logo upload, colours); property search polish;
WhatsApp compose enrichment. All already sketched in BUILD_PLAN.md.

## Conventions

- **Commits:** Conventional Commits — `feat(scope): …`, `fix(scope): …`,
  `refactor:`, `docs:`, `chore:`. Tight subject; body only when it adds signal.
- **Migrations:** one designed change, not per-stage column patches.
