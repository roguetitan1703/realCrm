# 🚀 Bhumi Propcity CRM — Backend & Database Architecture

This directory contains the production-grade database schema migrations, TypeScript domain contracts, authentication middleware, and action-oriented REST API endpoints for our Multi-Tenant Real Estate CRM.

---

## 📁 Directory Structure

```
backend/
├── migrations/
│   └── 001_initial_schema.sql  # Complete PostgreSQL relational schema with RLS & JSONB GIN indexes
├── src/
│   ├── types/
│   │   └── schema.ts           # Shared TypeScript interfaces & Zod runtime validation schemas
│   ├── middleware/
│   │   └── auth.ts             # Multi-tenant JWT auth, module gating & usage quota verification
│   └── routes/
│       ├── actions.ts          # Action API endpoints (/call, /whatsapp, /stage-change, /merge)
│       └── ingest.ts           # Portal webhook ingestion (/v1/ingest/:tenantSlug/:sourceKey)
└── README.md                   # Setup & Testing Guide
```

---

## 🛠️ Setup & Deployment Instructions

### 1. Database Initialization (PostgreSQL)
Ensure you have PostgreSQL 15+ running. Run the migration script to initialize all tables, Row-Level Security (RLS) policies, and GIN indexes:

```bash
psql -U postgres -d propcity_crm -f migrations/001_initial_schema.sql
```

### 2. Zero-Backlog Continuous Testing Strategy
To ensure the backend, database, and frontend remain 100% testable without creating a backlog of tedious unit tests, adhere to our 3-Pillar Continuous Testing Model:

1. **Contract-Driven Schema Safety (`src/types/schema.ts`):**
   * Never duplicate interface definitions in frontend and backend.
   * Import the shared Zod action schemas directly into the React app. Any payload mismatch will fail at TypeScript build time before runtime execution.
2. **API-First Route Integration Tests (Vitest + Supertest):**
   * Do not write isolated unit tests that mock out the database.
   * Write 1 functional integration test per API endpoint using **Testcontainers (PostgreSQL Docker)** and **Supertest**. Verifying HTTP `200 OK` and checking actual SQL database row changes guarantees real Row-Level Security validation.
3. **End-to-End User Journeys (Playwright):**
   * Do not write component unit tests for standard UI buttons.
   * Write 3 core Playwright E2E automation flows:
     * *Flow A:* Ingest 99acres lead via `/v1/ingest` $\rightarrow$ verify card appears in Kanban $\rightarrow$ drag to "Contacted".
     * *Flow B:* Tap Click-to-Call $\rightarrow$ verify Exotel bridge API response $\rightarrow$ log call outcome.
     * *Flow C:* Add custom field in Settings -> verify dynamic JSONB rendering in Lead detail modal.
