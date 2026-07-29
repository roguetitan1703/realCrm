# Docs

Documentation for **RealEstate by Delpat** — the white-label real-estate CRM
platform. Now in **production** (first paying tenant onboarding).

## Start here

- **[ROADMAP.md](./ROADMAP.md)** — the single working backlog. Clubs the original
  client feedback, the post-audit gaps, and the production list into one themed,
  sequenced plan. **This is the current source of truth for what we build next.**
- **[specs/](./specs/)** — the detailed, buildable plans behind the roadmap. We
  plan every point here first, then develop once. Start: [specs/auth.md](./specs/auth.md).

## Reference

- **architecture/**
  - [ARCHITECTURE_DECLARATION.md](./architecture/ARCHITECTURE_DECLARATION.md) — system/data-integration architecture.
  - [BACKEND_SCHEMA_PLAN.md](./architecture/BACKEND_SCHEMA_PLAN.md) — database schema plan.
  - (API surface: `backend/API_SPECIFICATION.md`)
- **ops/**
  - [DEPLOY.md](./ops/DEPLOY.md) — deploy runbook (Vercel frontend, AWS backend, PWA/push, env).

## History (superseded, kept for context)

- **planning/** — the demo→product build plans, now largely delivered.
  - [BUILD_PLAN.md](./planning/BUILD_PLAN.md), [SPRINT.md](./planning/SPRINT.md), [PWA_PLAN.md](./planning/PWA_PLAN.md)
- **demo-archive/** — demo-era briefs and specs (the demo that won the client).
  - [PROJECT.md](./demo-archive/PROJECT.md), [DEMO_BRIEF.md](./demo-archive/DEMO_BRIEF.md), [DEMO_FLOW.md](./demo-archive/DEMO_FLOW.md), [DEMO_SCRIPT.md](./demo-archive/DEMO_SCRIPT.md), [DESIGN_INVENTORY.md](./demo-archive/DESIGN_INVENTORY.md)

> The planning/ and demo-archive/ docs predate production and may name the demo
> tenant ("Bhumi Propcity") or describe theatre that has since been made real.
> When they conflict with ROADMAP.md, ROADMAP.md wins.
