# Spec: Auth, sessions & user management (Roadmap block A)

**Status:** 🔒 **A-block LOCKED** — A1 login, A1a seats, A2 sessions, A3 user
management all planned and ready to build (develop-once).
**Supersedes:** the OTP login shipped earlier. Email *sending* infra is kept
(repurposed from login codes to password-reset links).

---

## A1 — Login credentials  🔒 LOCKED

### Decisions
- **One secret per user: a password.** No PIN. (PIN parked — revisit only if
  field agents complain; long sessions (A2) remove the "re-type every time"
  pain that motivated PIN.)
- **Login handle depends on role:**
  - **Owner & Manager → email + password.** They are named account holders; email
    is their identity *and* their self-serve reset channel.
  - **Agent (worker) → assigned ID + password.** An impersonal **seat** the admin
    manages; no email required.
- **One login form for everyone:** a single field labelled **"ID or email"** +
  password. Backend resolves whichever was typed (within the tenant). No mode
  toggle.
- **Initial passwords are set by an admin — no invite links.**
  - Agent/manager initial password: **set by the firm's owner/admin**, with a
    **suggested memorable password** offered (e.g. `arjun-pune-48`) to hand over.
  - Owner initial password: **set by the Delpat superadmin at onboarding** (the
    superadmin is the admin one level up) and shown in the provisioning hand-off
    next to the owner email.
  - Optional **`must_change_password`** flag → forces a change on first login.
- **Password reset:**
  - Owner & Manager (have email): **self-serve "forgot password"** via emailed
    reset link (reuses SES/nodemailer).
  - Agent: **admin resets** it (sets a new/suggested password); no email needed.

### A1a — IDs are seats, decoupled from the person  🔒 LOCKED
A login is a **seat** that outlives whoever holds it. Agent leaves → keep the
seat (ID + all its leads/history), overwrite the person fields, force a password
reset. The row's identity = the `login_id`; the human = swappable profile fields.

---

## Data model (proposed)

Extend `users` (already tenant-scoped) so the **credential/seat** and the
**person** are distinct concerns on one row:

**Seat / credential**
- `login_id TEXT` — agent handle, unique per tenant (`UNIQUE(tenant_id, login_id)`), nullable for email-login users
- `password_hash TEXT` — bcrypt (dep already present)
- `must_change_password BOOLEAN DEFAULT false`
- `role TEXT` — `owner | manager | agent`
- `status TEXT` — `active | suspended | deactivated` (detail in A3)

**Person (swappable on seat reassignment)**
- `name`, `phone`, `email`, `metadata(initials, avatar)` (already present)
- `email_verified BOOLEAN DEFAULT false` — gates self-serve reset eligibility

**Login resolution within a tenant**
- typed handle contains `@` → match `lower(email)`
- else → match `login_id`

**New table: `password_resets`**
- `id, tenant_id, user_id, token_hash, expires_at, consumed BOOLEAN`
- token emailed as a link (`/reset?token=…`), single-use, short TTL (e.g. 30 min)

**New table: `sessions`** (server-side session records — required for the
active-sessions view and revoke/force-logout; a stateless JWT alone can't be
listed or revoked)
- `id (jti), tenant_id, user_id, created_at, last_seen_at, expires_at, ip, user_agent, revoked BOOLEAN`

**Retire:** `auth_otp` table + OTP code path (drop or leave dormant; see rollback).

---

## Flows / API (proposed)

**Login** — `POST /auth/login { handle, password }`
- Resolve user in the request's tenant by email or `login_id`.
- `bcrypt.compare`; on success sign the existing JWT (`kind:'user'`, tenant_id,
  user_id, role). Audit `auth.login`.
- Response carries `must_change_password` → client routes to a change-password
  screen before the desk.
- Anti-enumeration: generic "invalid credentials" on any failure.

**Change password (authed)** — `POST /auth/password/change { current, new }`

**Forgot password** — `POST /auth/password/forgot { email }`
- Only for users with a **verified email** (owner/manager). Create a
  `password_resets` row, email the link. Always respond 200 (no enumeration).

**Reset password** — `POST /auth/password/reset { token, new }`
- Validate unconsumed, unexpired token → set `password_hash`, consume, audit.

**Admin: reset an agent's password** — `POST /team/users/:id/reset-password`
- Owner/manager only. Sets a new (or suggested) password + `must_change_password`.
  Returns the plaintext once for the admin to hand over. Audit.

**Suggested-password helper** — small generator (memorable word + place + number)
used by both the create-teammate and admin-reset flows.

**Onboarding hand-off change** (superadmin console): show the owner's **initial
password** alongside the email in the provisioned-workspace details.

**Login form change:** single "ID or email" + password; remove the OTP request/
verify steps and the workspace→phone→otp progression's OTP leg.

---

## Migration / rollback
- Additive columns on `users`; new `password_resets`. Backfill existing users:
  owner/manager keep email as handle; set a temporary password + `must_change`.
- OTP path removed from the client; `auth_otp` left dormant first (drop later)
  so rollback is a client revert, not a data loss.
- `email.ts`: `sendOtpEmail` → add `sendPasswordResetEmail` (same transporter);
  keep both briefly during transition.

---

## Build checklist (execute after the whole A-block is locked — it now is)

**Schema**
- [ ] `users`: `login_id`, `password_hash`, `must_change_password`, `email_verified`, `status`; `UNIQUE(tenant_id, login_id)`.
- [ ] New tables: `password_resets`, `sessions`.
- [ ] Retire/dormant `auth_otp`.

**Backend — auth (A1/A2)**
- [ ] `auth.ts`: password login (resolve by email|login_id), change, forgot, reset; retire OTP issue/verify.
- [ ] Session lifecycle: create on login (ip/ua, +30d), `jti` in JWT, middleware load/validate/slide, throttled `last_seen` bump.
- [ ] Routes: `/auth/login`, `/auth/password/{change,forgot,reset}`, `/auth/sessions`, `/auth/sessions/:id/revoke`, logout revokes session.
- [ ] Suggested-password helper; `SESSION_TTL_DAYS` (default 30).
- [ ] `email.ts`: add `sendPasswordResetEmail` (keep transporter).
- [ ] IP → coarse location for the sessions view (or defer to display-time).

**Backend — user management (A3)**
- [ ] `/team/users` CRUD; `/status`, `/reassign-seat`, `/reset-password`, `/force-logout`; guarded `DELETE`.
- [ ] RBAC matrix (owner/manager/agent) enforced server-side.

**Onboarding**
- [ ] `provisionTenant`: generate owner initial password, return it; show in `/admin` hand-off.

**Frontend**
- [ ] Login: single "ID or email" + password; first-login change-password screen; forgot-password + reset screens.
- [ ] Settings/Team: user-management UI (create, edit, status lifecycle, reassign seat, reset pw, force-logout).
- [ ] "Active sessions" panel (own sessions; owner/manager team view).

**Audit**
- [ ] Events: login (ip/ua), password change/reset, admin reset, status change, seat reassignment, force-logout, hard delete.

---

## A2 — Sessions  🔒 LOCKED

### Decisions
- **Conventional session length: 30 days, sliding.** A "remember-me" month — the
  standard for a daily-use business app. The session **renews on activity** (each
  authenticated request pushes `expires_at` to now + 30d); a session unused for 30
  days expires. One knob (`SESSION_TTL_DAYS`, default 30) if we ever tune it.
- **Server-tracked sessions.** The JWT stays the transport but carries a **`jti`**
  (session id); the real session lives in the `sessions` table. This is what makes
  "active sessions" listable and individually revocable — a bare stateless JWT
  can be neither.
- **Active sessions view.** Each user can see their own sessions: **when** (created
  + last seen), **where** (IP + coarse city/region from an IP lookup) and **which
  device** (parsed from user-agent), with the current session flagged. Owners/
  managers can additionally view sessions across the team (A3 force-logout).
- **Every login is audited** with IP + user-agent (feeds the audit ledger).

### Flow / API
- **On login:** insert a `sessions` row (ip, user_agent, expires_at = +30d); the
  JWT embeds its `jti`. Audit `auth.login` with ip/ua.
- **Auth middleware (per request):** verify JWT signature → load `sessions[jti]`
  → reject if missing/`revoked`/past `expires_at` → bump `last_seen_at` and slide
  `expires_at`. (Bump is cheap; throttle the write to ~once/5 min to avoid a
  write per request.)
- **List** — `GET /auth/sessions` → the caller's sessions (current flagged).
- **Revoke one** — `POST /auth/sessions/:id/revoke` (own sessions; "log out that
  device").
- **Logout** — revokes the current session (not just a client token drop).
- **Coarse location:** derive city/region from IP at display time (or store at
  login). Start with IP + device string if the lookup is deferred; location is
  additive.

---

## A3 — User management  🔒 LOCKED

### Decisions — the status lifecycle (this is the core the client asked for)
A single `status` on the user with three states + a separate destructive action:

- **Active** — normal.
- **Suspended** — *reversible pause.* Blocks login immediately (**revoke all their
  sessions**), **keeps all data + lead assignments untouched**, stays in reports.
  For leave, disputes, "not right now." Un-suspend restores everything.
- **Deactivated** — *retired seat.* Blocks login + revokes sessions, **removes from
  round-robin and active rosters**, keeps historical attribution on their leads.
  This is "they've left." Reversible (reactivate) **or** hand the seat to a new
  hire via **seat reassignment** (A1a).
- **Hard delete** — *separate, destructive, guarded.* Removes the user row. **Must
  reassign their open leads first** (block otherwise). Owner-only, explicit
  confirm, audited. Rare — suspend/deactivate cover almost every real case.

So the plain "deactivate button with no enforcement" is replaced by: **Suspend /
Reactivate**, **Deactivate**, **Reassign seat**, and a distinct guarded **Delete**.

### Decisions — the rest
- **Create user = "invite" without links.** Admin fills details (name, role,
  phone/email, and for agents a `login_id`), the system offers a **suggested
  password**, admin hands it over. (Per A1: no email invite links.)
- **Edit details:** name, phone, email, role. Changing role re-scopes RBAC live.
- **Change password:** self-serve (any user) or **admin reset** for agents (returns
  the new password once to hand over) — from A1.
- **Seat reassignment (A1a):** on a deactivated/leaving agent, "Assign seat to a
  new person" → keep `login_id` + all leads/history, overwrite person fields
  (name/phone/email/avatar), force `must_change_password`, revoke old sessions.
  Audited as `user.seat_reassigned`.
- **Force-logout:** owner/manager can revoke all of a user's sessions (uses A2).

### RBAC for user management
- **Owner:** full — manage everyone, delete, reassign seats, force-logout.
- **Manager:** manage **agents** only (create/edit/suspend/deactivate/reset/
  force-logout agents); cannot touch owners or other managers; cannot hard-delete.
- **Agent:** no user management; may edit their own profile + change own password.

### API
- `GET /team/users` — roster with role, status, last-active (from sessions).
- `POST /team/users` — create (name, role, login_id|email, initial password).
- `PATCH /team/users/:id` — edit details / role.
- `POST /team/users/:id/status` — `{ status: active|suspended|deactivated }`
  (revokes sessions on suspend/deactivate).
- `POST /team/users/:id/reassign-seat` — A1a (person swap + force reset).
- `POST /team/users/:id/reset-password` — admin reset (from A1).
- `POST /team/users/:id/force-logout` — revoke all sessions.
- `DELETE /team/users/:id` — guarded hard delete (requires leads reassigned).
- All gated by the RBAC matrix above; all audited.
