# Spec: Auth, sessions & user management (Roadmap block A)

**Status:** 🧭 planning — **A1 login LOCKED**; A1a seats locked; A2 sessions and
A3 user management still to plan.
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

## Build checklist (execute after the whole A-block is locked)
- [ ] Schema: `users` columns + `password_resets` table + login uniqueness.
- [ ] `auth.ts`: password login, change, forgot, reset; retire OTP issue/verify.
- [ ] Routes: `/auth/login`, `/auth/password/{change,forgot,reset}`, `/team/users/:id/reset-password`.
- [ ] Suggested-password helper.
- [ ] Onboarding (`provisionTenant`): generate owner initial password, return it; show in `/admin` hand-off.
- [ ] Frontend Login: "ID or email" + password; first-login change screen; forgot-password screen.
- [ ] Seat reassignment action (A1a) in user management (A3).
- [ ] Audit events: login, password change/reset, admin reset, seat reassignment.

---

## A2 — Sessions  🧭 TO PLAN
Long sessions (weeks) so no daily re-login; **active sessions** view (when/where
each login happened) feeding the audit log. *(Plan next.)*

## A3 — User management  🧭 TO PLAN
Edit details, change password, **suspend** (reversible) vs **deactivate** vs
**hard delete**, invite/create users, seat reassignment (A1a), force-logout.
*(Plan after A2.)*
