# Spec: Data lifecycle, retention & storage (cross-cutting)

**Status:** 🔒 principle locked; per-store knobs implemented alongside each block.

**Why this exists (user directive):** *"I don't want to miss any data things that
we store and it keeps increasing and suddenly I have a storage problem — growing
audit logs, webhooks, payloads, API logs, etc."* So this is a **global rule**, not
a per-feature afterthought.

---

## The global rules
1. **No unbounded store ships without a retention policy.** Every append-only or
   ever-growing table/bucket **must** declare, at creation, how it's capped
   (purge, archive, or "keep — justified"). Reviewer checklist item.
2. **Hot data in Postgres, bulk blobs in R2.** Large payloads and all media never
   live in Postgres (row bloat + backup cost). Postgres keeps rows + references.
3. **One scheduled purge job** runs all retention rules nightly; each rule is a
   **config knob** (`*_RETENTION_DAYS`), not hardcoded.
4. **Monitor before the wall.** Track Postgres size (Supabase Pro ≈ 8 GB included)
   and R2 usage; surface a storage figure in the superadmin console; alert at a
   threshold (e.g. 70%).
5. **Backups inherit retention** — don't let dump history grow forever either
   (rotate `backups/`).

---

## The register — every growing store + its policy

| Store | Grows with | Policy |
|-------|-----------|--------|
| `webhook_inbox` raw bodies | every inbound push | **30 d** then purge **body**; keep metadata + `lead_id` (tiny) forever. |
| unknown-key ingest log | abuse/misconfig attempts | **7 d**, minimal metadata only (no body); rate-limited. |
| `audit_log` | every audited action | **Append-only + hash-chained — do NOT delete** (breaks verification). Keep (rows are small text). If it ever gets large: **archive** a verified segment to cold storage + re-genesis, never silent delete. |
| `notifications` | every alert | purge **read** notifications > **60 d**; unread kept. |
| `sessions` | every login (A2) | purge **expired/revoked** > **30 d** past expiry. |
| `password_resets` | every reset request (A1) | purge **consumed/expired** > **7 d**. |
| `activities` proof photos (B4) | every visit | photos in **R2**; retain **life of deal + 1 y**, then purge object (metadata kept). |
| property media (C2m) | photos/videos per listing | in **R2**; lifecycle tied to the property — purge objects on hard delete; orphan-sweep. |
| timeline / remarks | record history | **keep** (it's the record's history; small text). Justified. |
| soft-deleted rows (`deleted_at`) | departed users/records | keep for attribution; optional purge after a long window (e.g. 2 y) if truly unreferenced. |
| request/API logs | traffic | **don't persist verbose logs in Postgres** — use the platform's log stream; if any DB log, rotate **14 d**. |
| `backups/` dumps | each backup run | rotate — keep last **N** (e.g. 14 daily), drop older. |

---

## Build checklist
- [ ] Add a `retention_days` knob per store (env or config table).
- [ ] One nightly purge job applying every rule above (idempotent, audited count).
- [ ] `audit_log` archival path (verified export + re-genesis) — design only until needed.
- [ ] R2 orphan-sweep (objects with no referencing row).
- [ ] Superadmin console: DB size + R2 usage figure + threshold alert.
- [ ] Backup rotation in the dump scripts.
- [ ] **Review gate:** any new growing store must land with its policy row added here.
