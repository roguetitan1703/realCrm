# Spec: Ingestion — webhook inbox + parser (Roadmap block D)

**Status:** 🧭 planning — all questions open. Items: D1 provider-agnostic webhook
inbox + configurable parser [P15] · D2 client-forwardable setup pack [P16].
**Evolves** the current `/ingest/:slug/:source?key=` (which creates leads
immediately) into: **land raw → configure parser → then load leads.**

---

## The pipeline (your architecture, made concrete)

```
Provider POST ──▶ /api/v1/ingest/{tenant}          (X-API-Key: sk_live_…)
                     │
             1. resolve integration by API key  → (tenant + provider)
             2. store RAW payload + metadata in  webhook_inbox  (status: pending)
             3. respond 200 fast (ack receipt)   ← providers need a quick 2xx
                     │
             4. parser configured for this integration?
                  ├─ no  → stays `pending` (NO lead created yet)
                  └─ yes → parse → validate → dedup → round-robin assign
                            → create lead, link inbox row (status: parsed)
```

Admin later: **sees the pushes** for a provider (raw samples) → **configures the
parser** (field map) → **replays** the pending backlog. New sources need only a
new integration + parser mapping — **no core code change.**

---

## Data model

**`integrations`** — one row per provider connection (each has its own key)
- `id, tenant_id, provider` (label: 99acres / MagicBricks / Meta / Website / custom)
- `api_key_hash, api_key_last4` (key shown once on create; hashed at rest; rotatable)
- `parser_config JSONB` (null until configured)
- `active, created_at, created_by`

**`webhook_inbox`** — every raw push, kept for audit / replay / troubleshooting
- `id, tenant_id, integration_id (nullable), received_at, source_ip, headers JSONB`
- `raw_body JSONB, status` (pending · parsed · failed · ignored · unauthorized)
- `lead_id (nullable), error, parsed_at`

**Parser config (v1 shape)** — "a JSON opener": dot-path *source → canonical target*
```jsonc
{
  "map":       { "name":"full_name", "phone":"mobile", "email":"email_id",
                 "req.config":"bhk", "req.locality":"locality" },
  "defaults":  { "deal":"sale", "source":"99acres" },
  "valueMaps": { "req.config": { "2 BHK":"2BHK", "3 BHK":"3BHK" } },
  "transforms":{ "phone":"phone_in", "name":"trim" }        // small, fixed set
}
```
Canonical target = the CRM lead schema (name, phone, email, req.{config,locality,
budget…}, deal, source). Extensible later; starts as key-map + a few transforms.

---

## D1 — behaviours
- **Deferred load:** nothing becomes a lead until the integration's parser exists.
  Once it does, **new pushes auto-parse**, and a **"Replay pending"** action runs
  the backlog collected before configuration.
- **Config UX:** open an integration → see its **recent raw payloads** → the
  mapper **auto-suggests** target←source from the latest sample's keys → admin
  confirms/overrides → save → replay.
- **Presets:** ship built-in parser presets for the big providers (99acres,
  MagicBricks, Meta Lead Ads) so they work near-zero-config; manual for the rest.
- **Validate/dedup/route:** parsed lead needs **phone or email** (existing rule);
  dedup + round-robin as today; inbox row links the created lead.
- **Fast ack:** always 200 quickly on a valid key (parse async), so providers
  don't retry-storm.

## Security
- **Per-integration API keys** (`sk_live_…`), key **identifies tenant + provider**.
  This replaces the single per-tenant `ingest_secret`. Header `X-API-Key`, **plus a
  `?key=` URL fallback** because many portals only let you set a URL, no headers.
- **Invalid/unknown key → 401**, log minimal metadata (ip, truncated body,
  status=unauthorized), rate-limited — enough to debug a misconfig without
  storing spam.
- **RBAC:** owner/manager configure integrations, view inbox, rotate keys. Agents no.
- **Retention:** raw bodies kept N days (default 90) for replay/audit, then purge
  body, keep metadata + lead link. Cap payload size.

## D2 — client-forwardable setup pack  [P16]
Per integration, generate a pack the tenant forwards to their 3rd party:
- the **endpoint URL**, the **API key** (shown once / rotatable), and
  **provider-specific how-to** (where to paste the webhook in 99acres / MagicBricks
  / Meta / a generic webhook).
- Delivered as a **copyable email template** + optionally a **hosted instructions
  page** link. → Q9.

---

## OPEN QUESTIONS

**Endpoint & keys**
1. **Per-integration API keys** (each provider its own key; key ⇒ tenant+provider)
   replacing the single per-tenant `ingest_secret` — confirm? And keep the
   **`?key=` URL fallback** for portals that can't send headers?
2. Unknown-key pushes → **401 + minimal log** (not full body), rate-limited —
   agree, or store the raw body too for debugging?

**Parser**
3. v1 parser richness: **key-map + small transforms** (trim, phone-normalize,
   value-maps, split-name) — or pure key-map only to start?
4. Mapping UX: **auto-suggest from the latest sample payload** (confirm/override) —
   good?
5. Ship **parser presets** for 99acres / MagicBricks / Meta so they're near-zero-
   config? Which providers matter most first?

**Deferred load / behaviour change**
6. Confirm: pushes land **pending**, **no lead until parser configured**, then
   **auto-parse + "Replay pending"** for the backlog?
7. This **changes today's behaviour** (current endpoint auto-creates leads). OK to
   switch to **inbox-first** globally (presets cover common cases; the live
   tenant's parser configured at onboarding)?

**D2 setup pack**
8. Pack format: **copyable email template + hosted instructions page**? Provider
   how-tos to write first (99acres, MagicBricks, Meta, generic webhook)?

**Retention**
9. Raw payload retention — **90 days then purge body** (keep metadata + lead), or
   keep everything?

---

## Build checklist (draft — firms up after answers)
- [ ] `integrations` + `webhook_inbox` tables; migrate `ingest_secret` → an integration.
- [ ] `/api/v1/ingest/{tenant}` (X-API-Key + ?key= fallback): resolve integration, store raw, fast 200, parse-if-configured.
- [ ] Parser engine (map + defaults + valueMaps + transforms) → canonical lead.
- [ ] Deferred load + "Replay pending"; auto-parse on new push once configured.
- [ ] Provider presets (99acres/MagicBricks/Meta).
- [ ] Inbox UI: per-integration payload list, statuses, errors, re-parse.
- [ ] Parser mapper UI: auto-suggest from sample, confirm/override.
- [ ] Key management: create/rotate (show once), last4, RBAC owner/manager.
- [ ] D2: setup-pack generator (email template + instructions page).
- [ ] Retention purge job; unknown-key rate-limit + minimal log.
- [ ] Audit: integration created, key rotated, parser configured, replay run.
