# Specs — running build plans

These are the **detailed, buildable plans** behind [ROADMAP.md](../ROADMAP.md).
One spec per roadmap block. We **plan every point here first** (revising as we
work through the roadmap), and **develop once** the plans are settled — rather
than design-and-build one point at a time.

**Status per spec:** 🧭 planning · 🔒 locked (ready to build) · 🏗️ building · ✅ built

| Spec | Roadmap block | Status |
|------|---------------|--------|
| [auth.md](./auth.md) | A. Auth, sessions & users (A1–A3) | 🔒 locked (ready to build) |
| [contacts-leads.md](./contacts-leads.md) | B. Contacts & leads (B1–B5) | 🔒 locked & sealed |
| [properties.md](./properties.md) | C. Properties: fields, media, filters, add-flow | 🔒 locked (form UI ref at build-time) |
| [ingestion.md](./ingestion.md) | D. Ingestion: webhook inbox + parser | 🔒 locked |
| [data-lifecycle.md](./data-lifecycle.md) | Cross-cutting: retention & storage | 🔒 principle locked |
| [branding.md](./branding.md) | E5 + platform identity, themes, URL, landing/login | 🔒 locked (landing parked) |
| [pwa.md](./pwa.md) | E3/E4 PWA & app-shell audit | 🔒 locked (one big overhaul) |

> Each spec carries: **Decisions** (locked), **Data model**, **Flows/API**,
> **Migration/rollback**, and a **Build checklist** (executed later, once locked).
> When a spec conflicts with older planning/ docs, the spec wins.
