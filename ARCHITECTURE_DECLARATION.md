# 🏗️ Bhumi Propcity CRM — Full-Stack Architecture & Core Flow Declaration

> **Purpose:** Establish definitive engineering contracts, system boundaries, and event lifecycles across Frontend, Backend, Integrations, and Super Admin governance. This declaration serves as the immutable source of truth to prevent QA regressions, race conditions, and integration debt.

---

## 🏛️ 1. System-Wide Architectural Blueprint

The system is designed as a **Metadata-Driven Multi-Tenant SaaS** with strict data isolation, composable frontend rendering, and asynchronous event-driven communications.

```mermaid
graph TD
    subgraph Client Layer [Unified Client Layer]
        Desktop[Desktop Admin Workspace<br>React 19 / Vite]
        Mobile[Mobile Field Agent App<br>React 19 / Vite / PWA]
    end

    subgraph Edge & Gateway [API Gateway & Edge Security]
        CDN[Cloudflare / Vercel Edge CDN]
        Gateway[API Gateway / Auth & Rate Limiter<br>JWT + tenant_id Validation]
    end

    subgraph Core Services [Core Backend Micro-Services]
        AuthSvc[Auth & Tenant Service]
        CRMSvc[Core CRM Service<br>Leads, Props, Team, Timeline]
        RoutingSvc[Lead Routing Engine<br>Round-Robin & Location Rules]
    end

    subgraph Data Layer [Isolated Data & State Layer]
        PG[(PostgreSQL<br>Row-Level Security RLS per tenant)]
        Redis[(Redis Cache & Pub/Sub<br>Session, WebSocket, Live Sync)]
        SQS[(Async Event Queue<br>BullMQ / SQS / Kafka)]
    end

    subgraph Integration Gateways [Communication & Webhook Gateways]
        Ingest[Webhook Ingestion Receiver<br>Idempotent & Schema-Validated]
        WABA[WhatsApp Cloud API Gateway]
        Telephony[Cloud Telephony Gateway<br>Exotel / Knowlarity / Airtel IQ]
    end

    Desktop & Mobile --> CDN --> Gateway
    Gateway --> AuthSvc & CRMSvc & RoutingSvc
    CRMSvc --> PG & Redis
    CRMSvc --> SQS
    SQS --> WABA & Telephony
    Ingest --> SQS --> RoutingSvc --> CRMSvc
```

---

## 📜 2. The Core Data Contract & Multi-Tenant Isolation

To prevent QA cycle hell caused by schema mismatches or cross-tenant data leaks, every component must adhere to the **Tenant Schema Declaration**.

### A. Row-Level Security (RLS) Mandate
Every database table (`users`, `leads`, `properties`, `timeline_events`, `message_templates`, `webhooks`) MUST contain an indexed `tenant_id` UUID column.
* **Backend Contract:** No database query is permitted without an explicit `WHERE tenant_id = $1` clause enforced at the database driver / ORM middleware layer.
* **Super Admin Contract:** Super Admins bypass RLS only via short-lived, audited impersonation tokens with explicit logging (`super_admin_audit_log`).

### B. The Tenant Config Payload (The Frontend Driver)
Upon authentication, the client receives the **Tenant Config Payload**. The frontend is stateless regarding rules and renders purely based on this declaration:

```json
{
  "tenant_id": "org_bhumi_109",
  "brand": {
    "firmName": "Bhumi Propcity",
    "city": "Pune",
    "theme": { "primary": "#1E6F52", "surface": "#F6F5F2" }
  },
  "features": { "dialer": true, "whatsapp_api": true, "inventory_matching": true },
  "pipeline_stages": [
    { "id": "stg_1", "key": "new", "label": "New Inquiry", "color": "#2563EB", "order": 1 },
    { "id": "stg_2", "key": "contacted", "label": "Contacted", "color": "#D97706", "order": 2 },
    { "id": "stg_3", "key": "visit", "label": "Site Visit Done", "color": "#059669", "order": 3 }
  ],
  "lead_sources": ["99acres", "MagicBricks", "Housing.com", "Walk-in", "Meta Ads"],
  "rules": { "require_note_on_stage_change": true, "mask_phone_after_days": 30 }
}
```

---

## ⚡ 3. Declaration of Core Flows (Who, What, Where, When, How)

### Flow 1: Automated Lead Ingestion & Round-Robin Routing
* **The Problem It Solves:** 99acres, MagicBricks, and Meta Ads send sudden webhook bursts or retry payloads that cause duplicate leads and system freezes.
* **When It Triggers:** A prospective buyer submits an inquiry on a property portal or ad form.

```mermaid
sequenceDiagram
    autonumber
    participant Portal as 99acres / Meta Ads
    participant Ingest as Webhook Receiver (API Gateway)
    participant Queue as Redis / BullMQ Queue
    participant Worker as Ingestion Worker & Router
    participant DB as PostgreSQL (RLS)
    participant WS as WebSocket Pub/Sub
    participant Agent as Agent Mobile App

    Portal->>Ingest: POST /v1/webhooks/ingest/{tenant_id}/{source}
    Ingest->>Ingest: Validate HMAC Signature & Idempotency Key
    Ingest->>Queue: Push Raw Payload (Return 200 Accepted instantly)
    Queue->>Worker: Dequeue Job
    Worker->>Worker: Normalize Data against Tenant Schema
    Worker->>DB: Check Deduplication (phone + project within 30 days)
    alt Is Duplicate?
        Worker->>DB: Append note to existing Lead Timeline
    else Is New Lead?
        Worker->>DB: Fetch Active Agents & Execute Round-Robin Rule
        Worker->>DB: INSERT Lead (assigned_to = Agent X)
        Worker->>WS: Broadcast Lead Created Event (tenant_id, lead_id)
        WS->>Agent: Push Notification & Live UI Update (No page refresh!)
    end
```

---

### Flow 2: Outbound & Inbound WhatsApp Business (WABA) Communication
* **The Problem It Solves:** Agents copying phone numbers into personal WhatsApp, losing message history, and failing to track read receipts.
* **When It Triggers:** Agent taps **[`WhatsApp`]** or **[`Share Inventory`]** on Mobile or Desktop.

```mermaid
sequenceDiagram
    autonumber
    participant UI as Client App (Mobile / Desktop)
    participant API as Backend API Layer
    participant WABA as Meta Cloud API Gateway
    participant DB as PostgreSQL Timeline
    participant Buyer as Buyer Phone (WhatsApp)

    UI->>API: POST /api/v1/messages/dispatch { tenant_id, lead_id, template: "brochure_v1" }
    API->>DB: Fetch Lead & Tenant Encrypted WABA Token
    API->>WABA: POST https://graph.facebook.com/v19.0/{phone_id}/messages
    WABA-->>API: 200 OK (waba_message_id)
    API->>DB: INSERT timeline_event (type: 'wa_sent', status: 'sent')
    API-->>UI: Optimistic UI Success Toast
    
    Note over WABA,Buyer: Asynchronous Delivery & Read Lifecycle
    WABA->>API: Webhook: status = 'delivered' / 'read'
    API->>DB: UPDATE timeline_event SET status = 'read'
    API->>UI: WebSocket Push -> Update double checkmark icon in UI
    
    Buyer->>WABA: Sends Reply ("When can we visit?")
    WABA->>API: Webhook: Inbound Message
    API->>DB: INSERT timeline_event (type: 'wa_inbound', content: "...")
    API->>UI: Push Alert to Assigned Agent -> Badge counter increments
```

---

### Flow 3: Cloud Telephony Click-to-Call & Audio Recording Sync
* **The Problem It Solves:** Unverified agent call activity and lack of proof regarding buyer negotiations.
* **When It Triggers:** Agent taps **[`Call`]** button on Lead or Property detail page.

```mermaid
sequenceDiagram
    autonumber
    participant UI as Client App (Mobile / Desktop)
    participant API as Backend API Layer
    participant Telco as Exotel / Knowlarity Cloud
    participant Agent as Agent Physical Phone
    participant Buyer as Buyer Physical Phone
    participant DB as PostgreSQL Timeline

    UI->>API: POST /api/v1/telephony/bridge { tenant_id, lead_id, agent_id }
    API->>DB: Lookup agent_phone and buyer_phone (Check privacy rules)
    API->>Telco: POST /v1/calls/connect { from: agent_phone, to: buyer_phone, caller_id: virtual_number }
    Telco-->>API: 200 OK (call_sid)
    API-->>UI: Display "Connecting Call..." Bottom Sheet
    
    Telco->>Agent: Rings Agent Phone -> Agent Answers
    Telco->>Buyer: Rings Buyer Phone -> Buyer Answers
    Note over Agent,Buyer: Live Call in Progress (Audio recorded by Telco)
    
    Agent->>Telco: Hangs up call
    Telco->>API: POST /webhooks/telephony/status { call_sid, duration: 184s, status: 'completed', recording_url }
    API->>DB: INSERT timeline_event (type: 'call', duration: 184, audio_url: recording_url)
    API->>UI: WebSocket Push -> Call log & MP3 player appears on Lead Timeline
```

---

### Flow 4: Super Admin Governance & Tenant Onboarding Lifecycle
* **The Problem It Solves:** Manual database hacking to onboard new clients, leading to broken configurations.
* **When It Triggers:** Super Admin creates a new brokerage tenant in the Control Plane.

1. **Provisioning (`POST /api/super/tenants`):**
   * Creates tenant workspace record (`tenant_id`).
   * Seeds default pipeline stages, sources, and system roles.
   * Generates unique ingress webhook keys for 99acres and MagicBricks.
2. **Credential Vaulting:**
   * Super Admin or Tenant Admin inputs Meta WABA keys and Exotel API credentials.
   * Keys are encrypted using **AES-256-GCM** with a tenant-specific salt before storage.
3. **Feature Flagging:**
   * Super Admin toggles modules (e.g., `enable_ai_matching: true`, `enable_export: false`).
   * Next time tenant agents log in, their JWT token reflects the updated feature scope, instantly enabling/disabling UI rails without frontend deployment.

---

## 🛡️ 4. QA Guardrails & Regression Prevention Contract

To permanently avoid "QA Cycle Hell," all future development must adhere to these 4 absolute engineering guardrails:

| Guardrail Pillar | Mandatory Engineering Rule | QA Verification Method |
| :--- | :--- | :--- |
| **1. Strict Schema Contract** | All frontend API requests and webhook payloads must be validated at the API runtime boundary using **Zod / TypeBox** schemas. | Any payload missing required fields (e.g., `tenant_id`) must reject with HTTP `400 Bad Request` before reaching business logic. |
| **2. Webhook Idempotency** | Every portal ingest and telephony webhook must enforce an **Idempotency Key** (e.g., `source + external_lead_id` stored in Redis with 7-day TTL). | Re-sending the exact same 99acres webhook 5 times must result in exactly **1 database insertion** and 4 `200 OK (Ignored)` responses. |
| **3. Offline-First Mobile Resilience** | Mobile field agents operate in basements and construction sites. All stage drags and note logs must save to local IndexedDB/localStorage first, then sync via an **Exponential Backoff Queue**. | Disconnect laptop/phone Wi-Fi, log 3 notes and change a lead stage, reconnect Wi-Fi $\rightarrow$ verify all 4 actions sync cleanly without data loss. |
| **4. State Optimism vs. Server Truth** | UI actions (like moving a lead card) must update optimistically for instant responsiveness, but must roll back cleanly if the backend returns an error or permission denial. | Simulate a `500 Server Error` on stage change $\rightarrow$ verify the UI card snaps back to its original stage with a descriptive error toast. |
