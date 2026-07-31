# Spec: Ingestion — webhook inbox + parser (Roadmap block D)

**Status:** 🔒 **LOCKED.** Items: D1 provider-agnostic webhook inbox + configurable
parser [P15] · D2 client-forwardable setup pack [P16]. Global data-retention split
out to [data-lifecycle.md](./data-lifecycle.md).
**Evolves** the current `/ingest/:slug/:source?key=` (creates leads immediately)
into: **land raw → configure parser → then load leads.**

---

## The pipeline

```
Provider POST ──▶ /api/v1/ingest/{tenant}          (X-API-Key: sk_live_…, or ?key=)
                     │
             1. resolve integration by API key  → (tenant + provider)
             2. store RAW payload + metadata in  webhook_inbox  (status: pending)
             3. respond 200 fast (ack receipt)
                     │
             4. parser configured for this integration?
                  ├─ no  → stays `pending` (NO lead yet — shown as inbound activity)
                  └─ yes → parse → validate → dedup → round-robin → create lead,
                            link inbox row (status: parsed)
```

---

## UI model (as decided)

- **Integrations screen (tenant, owner/manager):** a **managed connections** view.
  - **Popular providers to enable** (99acres, MagicBricks, Meta, Website…): one
    click → we create the integration + key.
  - **Any other = custom:** just type a **name** → get a **key**. (The endpoint is
    identical regardless of provider — see D2.)
  - Each connection shows its **live webhook activity** underneath it (recent
    pushes, last received, counts, parsed/pending/failed) — so they can *see* data
    arriving even before it becomes leads.
- **Parser configuration lives in the TENANT OWNER's area** (owner-only RBAC), **and
  the Delpat superadmin can also edit any tenant's** (dual access). NOT a
  superadmin-only console — that would make Delpat a bottleneck for every provider
  tweak and doesn't scale.
  - **Default:** Delpat sets it up white-glove at onboarding; the owner can adjust
    later without waiting on us.
  - **Not a raw JSON editor:** the auto-suggest-from-sample turns it into "confirm
    these field matches" — broker-approachable.
  - **Mandatory test-preview before save (guardrail):** the mapping runs against
    the **last real payload** and shows exactly which lead fields fill in. A
    mis-map can't silently ship — the owner sees the parsed result first. This is
    what makes tenant-editing safe despite lead-intake being high-blast-radius.

---

## Data model

**`integrations`** — one row per provider connection (each has its own key)
- `id, tenant_id, provider` (label), `api_key_hash, api_key_last4`
  (shown once on create; hashed; rotatable), `parser_config JSONB` (null until we
  configure it), `active, created_at, created_by`

**`webhook_inbox`** — every raw push (audit / replay / troubleshooting)
- `id, tenant_id, integration_id, received_at, source_ip, headers JSONB,
  raw_body JSONB, status` (pending·parsed·failed·ignored), `lead_id, error, parsed_at`

**Parser config (v1)** — "a JSON opener": dot-path *source → canonical target*
```jsonc
{
  "map":       { "name":"full_name", "phone":"mobile", "email":"email_id",
                 "req.config":"bhk", "req.locality":"locality" },
  "defaults":  { "deal":"sale", "source":"99acres" },
  "valueMaps": { "req.config": { "2 BHK":"2BHK", "3 BHK":"3BHK" } },
  "transforms":{ "phone":"phone_in", "name":"trim" }
}
```

---

## Behaviours (locked answers)
- **1 — Per-integration keys** (key ⇒ tenant+provider), replacing the single
  per-tenant `ingest_secret`; **`?key=` URL fallback kept** for portals with no
  custom headers. ✔
- **2 — Unknown/invalid key → reject (401). Do NOT persist the body** (anti-abuse /
  anti-DDoS). Keep only a **lightweight, rate-limited counter + minimal metadata**
  (ip, key-prefix, timestamp) with a **short 7-day** window to catch a misconfig,
  then auto-purge. No arbitrary bodies stored from unauthenticated callers.
- **4 — Auto-suggest** the field map from the latest sample payload; we confirm/
  edit. ✔
- **5 — No blind presets.** A provider mapping can only be built **from their real
  data** once it arrives. After we've mapped a provider once, that mapping can be
  **saved as a reusable template** for the next tenant using the same provider
  (a *learned* preset) — but nothing is pre-shipped. ✔
- **6 — Deferred load:** pushes land **pending**; **no lead until the parser is
  configured**; then **auto-parse new pushes** + **"Replay pending"** for the
  backlog. ✔
- **7 — Inbox-first globally.** Everything lands in the inbox; once a parser is set
  it flows through to leads. ✔
- **8 — Generic setup pack (not per-portal).** The endpoint + key are identical
  whether it's a custom source or a big portal, so D2 is **one generic pack**
  (endpoint URL, API key, a short generic how-to), not per-provider instruction
  pages. A copyable email + hosted page. ✔
- **9 — Retention:** raw bodies kept **30 days** (enough to replay/debug), then the
  **body is purged, metadata + lead link kept**. Governed by the global policy
  below. ✔
- **RBAC:** owner/manager manage connections/keys + see activity; **parser mapping
  = tenant OWNER (+ superadmin), with a mandatory test-preview before save.** Fast
  **200 ack** on valid key (parse async) so providers don't retry-storm.

## D2 — client-forwardable setup pack (generic)
Per integration, generate a pack the tenant forwards to their 3rd party: the
**endpoint URL**, the **API key** (once/rotatable), and a short **generic how-to**
("POST JSON here with this key"). Copyable email **+** hosted instructions page.
Same for every provider — the endpoint doesn't care who's calling.

---

## Build checklist
- [x] `integrations` + `webhook_inbox` tables. **`ingest_secret` NOT migrated** — see gap G1.
- [x] `/api/v1/ingest/{tenant}`: resolve integration, store raw, fast 200, parse-if-configured.
- [x] Unknown-key: 401, no body stored, counter collapsed per (ip, key-prefix, day). **7-day purge NOT built** — see gap G2.
- [x] Parser engine (map + defaults + valueMaps + transforms) → canonical lead.
- [x] Deferred load + "Replay pending"; auto-parse on new push once configured.
- [x] Integrations UI (tenant): add-connection (name→key); per-connection activity feed with the raw payload readable per push.
- [x] Parser mapper UI, owner-only, auto-suggest from sample, **mandatory test-preview before save — enforced on the SERVER, not only in the UI**. **save-as-template NOT built** — see gap G3.
- [x] Key management: create/rotate, last4, RBAC owner/manager. **Changed from spec:** the key is readable, not show-once — see decision D-1.
- [x] D2: generic setup-pack generator (copyable email, key filled in). **Hosted page NOT built** — see gap G4.
- [x] Audit: integration create/rotate/reveal/pause/delete/parser_set/replay events.
- [ ] Retention purge job (30-day body purge) — see gap G2.

---

## Status as built (2026-08-01)

**D1 and D2 are functionally complete and tested against a live server + live
database.** What is *not* done is listed as gaps below; none of them block a
provider from sending real leads today.

### Verified, not assumed
Two suites, both run against a running server and the real Postgres — the
failures that matter here (a body that never reaches the handler, a retry that
doubles a lead, a payload stored as `{}`) all live in the layers a unit test
mocks away.

- `scripts/ingest-conformance.mjs` — **30/30.** Transport: X-API-Key,
  `?key=`, `Authorization: Bearer`, `X-Auth-Token`; POST/GET/PUT; form-encoded;
  JSON under `text/plain`; XML and truncated JSON kept verbatim; UTF-8
  (Devanagari) round trip; deep nesting; root-level array; empty body; 200-field
  payload; legacy `/:tenant/:source` URL; 401 on no key / wrong key / **valid key
  on another tenant's URL**; 405 with an `Allow` header instead of the SPA page;
  ack under 1500ms; 10 concurrent pushes → 10 distinct inbox rows.
- `scripts/ingest-lead-flows.mjs` — **22/22.** Three genuinely different
  provider schemas each with their own mapping; name trimmed; `+91 98220 61111`
  normalised; nested locality read; `75,00,000` → `7500000`; valueMap rewrite;
  default source; **retry with the same `enquiry_id` → ignored, one lead**;
  **same buyer via a second provider → merged, one lead**; missing phone / `{}` /
  nulls / unparseable body → `failed` with a reason and **no lead created**;
  unmapped connection → stays `pending`, no lead.

### Decisions that differ from the locked spec
- **D-1 · The API key is readable, not show-once.** Spec said hashed and shown
  once. Hash-only is right for a password and wrong here: the key lives in a
  portal's webhook config, so "we can't tell you what we gave you" makes a
  rotation the only recovery — a real outage, re-briefing the portal, for a
  property that bought nothing. The key is now stored **twice**: SHA-256 for the
  inbound lookup (unchanged, one indexed hop) and **AES-256-GCM encrypted** for
  reading back through an authenticated, audited endpoint. A stolen dump is
  still useless without the server secret.
- **D-2 · The endpoint accepts GET/PUT/PATCH, not only POST.** A real share of
  small portal panels only let you paste a URL and fire a GET with the enquiry
  in the query string. Refusing them means telling a broker their aggregator
  "isn't supported". The key is stripped from the payload before storage.
- **D-3 · A malformed body is landed, not rejected.** Broken JSON (XML under a
  JSON content-type, a truncated body) used to 500 with nothing recorded — the
  one push you most need to read. It now lands as `{_unparsed, _error}` and the
  parser refuses it on its own terms.

### Gaps — carried, not lost
- **G1 · `ingest_secret` was never migrated.** The old per-tenant secret still
  exists beside the new per-integration keys. Any portal still configured with
  the old key gets a 401. Needs a one-time migration that mints an integration
  per tenant from the existing secret.
- **G2 · No retention job at all.** `body_purged_at` exists as a column and
  nothing ever sets it: raw bodies are kept forever, and the reject log has no
  7-day purge. This is the whole of [data-lifecycle.md](./data-lifecycle.md) for
  this table and it grows unbounded with every push.
- **G3 · No save-as-template (learned preset).** Every tenant maps 99acres from
  scratch. The spec's answer to "no blind presets" was a mapping learned from
  the first tenant and offered to the next; only the from-scratch half exists.
- **G4 · No hosted setup page.** D2 produces the copyable email only.
- **G5 · `crm_integrations` (the old KV table, no `tenant_id`) still sits beside
  the new `integrations`.** Two near-identically-named tables; the old one holds
  Exotel/WABA settings and its route hardcodes a tenant slug. Needs a deliberate
  fold-in.

### Bigger problems found while building D — separate focus, not D's job
- **P1 · Auth is open.** `requireTenantAuth` has a "tokenless demo path": with no
  token it falls back to `DEFAULT_TENANT_ID` and **invents a user**. Verified —
  an unauthenticated `POST /api/v1/records/x/actions/contact-log` returns 201 and
  writes a timeline event. Every "authenticated" route is currently reachable
  without a token. `/ingest` itself is NOT affected: it authenticates on the API
  key alone and rejects cross-tenant keys. Parked deliberately (nothing is live
  yet); it is the auth/RBAC phase of BUILD_PLAN, not a D item.
- **P2 · Fabricated telephony, now deleted.** Two routes invented a DID, an API
  key and a call SID and wrote "Initiated outbound telephony call … via DID
  08045678900" to the timeline while contacting nobody. Removed; a call is
  recorded through `contact-log`, which claims only what happened. Real
  click-to-call remains unbuilt and should be scoped on its own.
- **P3 · The lead form is not schema-driven.** Properties went through the
  vocabulary + wizard rework; leads did not. Locality was three disagreeing
  hardcoded Pune lists (now free text with suggestions derived from the firm's
  own records, `src/lib/suggest.js`), but the form still drifts from the record
  sheet the way property fields used to. Needs the same treatment as block C.
- **P4 · Mobile is pre-Block-C.** 10 files deferred by the vocabulary guard.
