# 🚀 Bhumi Propcity CRM — Backend & Database Architecture (Pure Composable Engine)

This directory contains the production-grade database schema migrations, TypeScript domain models, authentication middleware, and action-oriented REST API endpoints for our Multi-Tenant Real Estate CRM.

---

## 📁 Directory Structure

```
backend/
├── migrations/
│   ├── 001_tenants.sql                 # Workspace branding, subscription limits & integration secrets
│   ├── 002_users.sql                   # Team members, branch locations & reporting hierarchy
│   ├── 003_modules_and_fields.sql      # Composable Module Registry & Universal Record Store (module_records)
│   ├── 004_routing_rules.sql           # Automated Round-Robin & location routing across any module
│   ├── 006_timeline_and_activities.sql # Universal timeline events & TRAI/Meta message templates
│   ├── 007_import_jobs.sql             # Async 10,000-row spreadsheet upload trackers
│   ├── 008_rls_policies.sql            # PostgreSQL Row-Level Security isolation policies
│   └── 009_seed_default_modules.sql    # Seeding script for Leads & Properties modules, Indian RE stages & fields
├── src/
│   ├── models/                         # Clean modular domain definitions & Zod validation schemas
│   │   ├── tenant.ts, user.ts, module.ts, timeline.ts, importJob.ts, index.ts
│   ├── middleware/
│   │   └── auth.ts                     # Multi-tenant JWT auth, module gating & quota verification
│   └── routes/
│       ├── modules.ts                  # GET /config for dynamic UI rendering & POST to create modules/fields
│       ├── records.ts                  # Universal CRUD & query engine (/api/v1/modules/:moduleKey/records)
│       ├── actions.ts                  # Universal action endpoints (/call, /whatsapp, /stage-change, /merge)
│       └── ingest.ts                   # Portal webhook ingestion (/v1/ingest/:tenantSlug/:sourceKey)
└── README.md                           # Setup & Testing Guide
```

---

## 🛠️ How Our API Handles Modules & Custom Actions

### 1. Dynamic UI Rendering via Module Config (`GET /api/v1/modules/:moduleKey/config`)
When the React frontend opens a module tab (e.g. Leads, Properties, or a custom "Loan Applications" module), it calls `/config`. The backend returns the module metadata, all Kanban pipeline stages, and all custom field definitions. The UI renders dynamic Kanban columns and form fields without hardcoded frontend components!

### 2. Universal Record CRUD with Runtime Zod Validation (`/api/v1/modules/:moduleKey/records`)
When creating or updating a record (`POST /records`), the API builds a Zod runtime validation schema on the fly from the tenant's `custom_field_definitions` stored in PostgreSQL. If a required field is missing or data types mismatch, the API rejects with HTTP 400 before writing to the database!

### 3. Composable Actions Across Any Record (`/api/v1/records/:id/actions/...`)
Our action endpoints work on any record in `module_records`:
* `POST /records/:id/actions/call`: Initiates Exotel 2-leg telephony bridge using `primary_phone`.
* `POST /records/:id/actions/whatsapp`: Sends approved Meta WABA templates.
* `POST /records/:id/actions/stage-change`: Updates Kanban stage and enforces mandatory audit notes.
* `POST /records/:id/actions/merge`: Merges duplicate records and reassigns historical audio/notes.

---

## 🛡️ Zero-Backlog Continuous Testing Strategy

1. **Contract-Driven Schema Safety (`src/models/`):** Import the shared Zod schemas directly into the React app. Any payload mismatch fails at build time.
2. **API-First Route Integration Tests:** Write 1 integration test per route using **Testcontainers (PostgreSQL Docker)** and **Supertest** to assert HTTP 200 and real database row changes.
3. **End-to-End User Journeys:** Use **Playwright** to test 3 core automated user flows (99acres webhook Kanban drag, Click-to-Call telephony, and adding custom fields in Settings) on every git commit.
