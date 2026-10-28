# Specs — running build plans

Designs for the bigger pieces in [BACKLOG.md](../BACKLOG.md), written before
building. Once a spec ships it keeps a short as-built note, not the build log.

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
| [enquiries.md](./enquiries.md) | F. Enquiries: a person is not an enquiry | 🧭 planning (decisions locked, 4 opens) |
| [listing-pages.md](./listing-pages.md) | Sending flats to a lead, the buyer's page, the firm's catalogue | 🅿️ parked 13 Oct (model in §0); PLAN proposes steps 1–2 |
| [notifications.md](./notifications.md) | An alert is open work: lifecycle, urgency, working hours | ✅ built, on `development` |
| [performance.md](./performance.md) | What a day answers vs a range | ✅ built, on `development` |
| [follow-ups.md](./follow-ups.md) | What a booked follow-up or callback is, what finishes it, what moves it | 🧭 planning (5 decisions for Om) |
| [desk-rework.md](./desk-rework.md), [lead-sources.md](./lead-sources.md), [demo-tenants.md](./demo-tenants.md) | — | not reviewed in this list |

> Each spec carries: **Decisions** (locked), **Data model**, **Flows/API**,
> **Migration/rollback**, and a **Build checklist** (executed later, once locked).
> When a spec conflicts with older planning/ docs, the spec wins.
