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
- **Parser configuration = Delpat's job, in the admin console.** Once real data is
  in, **we configure the parser** for them (map the fields), and it's **editable in
  the `/admin` (superadmin) console**. The tenant manages connections + keys + sees
  activity; the **field-mapping lives with Delpat** (editable), not the tenant.
  *(Interpretation of "editable in the admin" = the Delpat superadmin console;
  flag if you meant the tenant's owner.)*

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
  = superadmin.** Fast **200 ack** on valid key (parse async) so providers don't
  retry-storm.

## D2 — client-forwardable setup pack (generic)
Per integration, generate a pack the tenant forwards to their 3rd party: the
**endpoint URL**, the **API key** (once/rotatable), and a short **generic how-to**
("POST JSON here with this key"). Copyable email **+** hosted instructions page.
Same for every provider — the endpoint doesn't care who's calling.

---

## Build checklist
- [ ] `integrations` + `webhook_inbox` tables; migrate `ingest_secret` → an integration.
- [ ] `/api/v1/ingest/{tenant}` (X-API-Key + ?key=): resolve integration, store raw, fast 200, parse-if-configured.
- [ ] Unknown-key: 401, no body stored, rate-limited counter + 7-day minimal log.
- [ ] Parser engine (map + defaults + valueMaps + transforms) → canonical lead.
- [ ] Deferred load + "Replay pending"; auto-parse on new push once configured.
- [ ] Integrations UI (tenant): enable-popular + add-custom (name→key); per-connection activity feed.
- [ ] Parser mapper UI in **/admin** (superadmin): auto-suggest from sample, editable; save-as-template (learned preset).
- [ ] Key management: create/rotate (show once), last4, RBAC owner/manager.
- [ ] D2: generic setup-pack generator (email + page).
- [ ] Retention purge job (see data-lifecycle.md); audit: integration/key/parser/replay events.
