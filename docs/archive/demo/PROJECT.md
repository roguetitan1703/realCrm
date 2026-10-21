# Bhumi Propcity CRM — Project Brief

> The single source of truth for **why** this exists, **what** it must do, and **how** we build it. Supersedes the old `Flow.md` and `Delpat_CRM_Demo_Build_Spec_v1.md` (kept only as history). Read this before writing code. For the visual system see `styles.css` + `components.html`; for the exhaustive component/state checklist see `DESIGN_INVENTORY.md`.

---

## 1. Goal

Ship a **working, clickable demo CRM** (frontend only, no backend) that a Pune real-estate broker can pick up on his own phone in the first minute of a meeting and think: **"this is already my system."** Not a slideshow, not a Figma file — his live-feeling system with his kind of data already inside it. Success is when he stops *evaluating* and starts giving *change requests*.

The demo is also the **seed of the real product**: component structure and data shapes are the production ones, so tenant #2 is a config swap, not a rebuild.

---

## 2. Context

**Who we're selling to.** A Pune broker, 30s–50s, non-technical, status-conscious. He runs his business out of **fragmented Excel sheets** and WhatsApp. His secondary users are his **agents** — phone-first, mid-site-visit, one thumb, in sunlight.

**What he actually does all day.** Catches leads from portals (99acres, MagicBricks) + walk-ins + referrals, matches buyers/tenants to his inventory, and **forwards property details on WhatsApp** (≈80% of his day). He also runs a small team of agents and constantly loses track of who's handling what and which follow-up is overdue.

**The two jobs this product sells** (everything else is secondary):
1. **Get his business out of fragmented Excel** — one structured system, his brand, on his phone.
2. **Manage his agents** — fair routing, oversight, no lost clients, a process his juniors actually follow.

**Explicitly out of scope for now** (parked on a Roadmap screen as "integrate, not replace"): commission/finance, marketing/campaigns. Naming these honestly is part of the pitch — we're not pretending to do everything.

---

## 3. Why it matters (the importance behind each flow)

The demo isn't a feature tour; every screen kills a specific pain he feels daily. Frame the build around these, not around screen names:

| Pain he has today | What the product proves |
|---|---|
| A lead lands at 11pm and sits unseen on a sheet | Every lead from every source lands here the second it arrives — nothing lost. |
| He forgets follow-ups; money leaks | The system remembers every follow-up; overdue ones surface first. |
| Client's standing in front of him; he digs through Excel for stock | Matches in five seconds, with a plain fit reason. |
| He types the same WhatsApp property message a hundred times | Pick a property, tap once, broker-voice message ready to forward. |
| He can't tell where a deal stands or who's handling it | One glance shows every deal's stage and its agent. |
| An agent quits and 30 leads go dead | Reassign a whole pipeline in one action — no client lost. |
| Buyers/sellers/tenants/landlords are one big mess | Every relationship in its right place, buy side and sell side. |
| "Is this really *mine* or am I renting branded software?" | His name, colours, system — visibly his firm's technology. |

---

## 4. The flows (what must actually work)

Grouped by priority. The **demo path** (§7) threads the starred ones. Each must work for real in the demo — no dead buttons; anything non-functional gets a *designed* "connects to your account" state, never a blank or a crash.

### A. Core daily flows — must work, must demo
- **F1 ★ New overnight lead** — dashboard shows the count → inbox → open the "2 min ago · 99acres" lead: unassigned, source, requirement one-liner, time-ago, all scannable.
- **F2 ★ Nothing falls through** — Today's follow-ups + overdue flagged are the first thing on home.
- **F3 ★ Instant stock match for a walk-in** — open buyer's lead → Matching properties → 3 matches respecting budget/locality/config, each with a fit line.
- **F4 ★ WhatsApp property message** (the signature) — open a property/match → generate → Hinglish message in a WhatsApp-style bubble → Copy. Template-filled from real data, no API dependency.
- **F5 ★ Move a lead through the pipeline** — stage stepper New→Contacted→Site Visit→Negotiation→Closed Won/Lost; logs to timeline; reflects everywhere.
- **F6 ★ Set a site visit** — follow-up scheduler (action · date · time) → appears on the right agent's Today + goes overdue if it passes.
- **F7 Add a listing** — add property → appears in grid, links to owner, immediately matchable.
- **F8 Mark sold** — status → Closed → drops out of active matching, shows Closed ribbon.
- **F9 Reverse match** — open a property → which buyers want exactly this, with fit reasons.
- **F10 Duplicate merge** — seeded same-number lead flagged "possible duplicate" → merge into one record.

### B. Team & control — the admin story
- **F11 ★ Assign a lead** — pick agent or accept round-robin suggestion; shows in that agent's inbox only.
- **F12 Reassign a departed agent's pipeline** — bulk move in one action; deactivate the agent.
- **F13 Is my team working?** — agent performance (assigned/contacted/visits/closed) + overdue-by-agent.
- **F14 ★ End-of-day business view** — pipeline funnel, leads by source, this-month value.
- **F15 Contact segregation** — Buyers / Sellers / Tenants / Landlords tabs; seller → linked properties.
- **F16 ★ Prove it's his** — branded login + brand throughout + Settings showing logo/colour/stage/source knobs.

### C. Integrations (Block 2 — demo honestly, never fake)
- **F17 Call & SMS from a lead** — designed calling/SMS UI or clean "connect your number" state.
- **F18 Portal auto-pull** — 99acres / MagicBricks connect cards with one-line descriptions.
- **F19 WhatsApp automation & website sync** — WhatsApp Business API card + Website sync (marked custom).

### D. Skeptic's stress tests (a broker pokes to see if it's real)
Empty search → designed empty state. Half-filled lead → degrades gracefully. Long Indian names don't break rows. Back/forth navigation holds state. Zero dead buttons. Role switch actually changes the view. Readable thumb-first on a 360px phone in daylight.

---

## 5. Approach (how we build)

- **Vite + React (plain JS), no backend.** In-memory state, resets on refresh (intentional — repeatable demo). `vite build` → deploys static to Vercel.
- **Modular by architecture, not discipline.** Screens are **composed from components + layout primitives** and hold **zero inline styles**. A design change happens in ONE place — the component or `styles.css` — and propagates everywhere. This is non-negotiable; it's why we moved off the old hand-styled static build.
  - `src/data` — ported domain logic (seed data, matching engine, WhatsApp generation, format/stage/budget helpers).
  - `src/components` — pure components mapping to `styles.css` classes (Button, Input, Field, Seg, Chip, Pill, StageTag, Avatar, Money, CountBadge, Table, ListRow, Card, Toolbar, ActionRail, QuickActions, Scheduler, Toast, EmptyState, KPI, KV, Timeline, Stepper, WABubble, Nav, TopBar, TabBar).
  - `src/layouts` — `AppShell`, `ListLayout`, `DetailLayout`, `CollectionView(list|table|cards)`.
  - `src/modules` — each screen as data + composition through the above.
- **`styles.css` is the design source of truth.** Tokens in `:root`, all component classes defined once. `components.html` is the approved visual reference.
- **White-label discipline.** Every brand value (name, colours, stages, sources) lives in one config/theme object. No hardcoded "Bhumi Propcity" in markup.
- **Honest demo.** Integrations are staged "connect your account" states, never dead buttons. Any OTP works. Nothing claims to be live that isn't.
- **Real content only.** The seed data *is* the design — no "Property 1", no "John Doe", no lorem. All Pune-real: localities (Wakad, Baner, Kalyani Nagar, Kothrud, Hinjewadi, Viman Nagar), ₹L/₹Cr sale + ₹k/mo rent, Marathi + North-Indian names.

---

## 6. The design system — "Register" (locked & approved)

Grounded in the broker's world: an established firm's **ledger/register**, run from a laptop; a fast field tool on the phone. Boring-on-purpose where it counts — **clarity and scan-speed are the feature**, not decoration.

- **Two colours only.** Warm-paper neutrals (`#F6F5F2` bg, `#FFF` card, `#E3E1DB` hairline, `#23231F` ink, `#77756E` muted, `#22242A` charcoal chrome) + **one deep institutional green `#1E6F52`** used ONLY for primary action / active nav / link / focus. No brass, no rainbow, no gradients, no glassmorphism.
- **Signals are contained** to rows and detail, never the chrome: stage = one slate hue on a cold→hot value ramp (lead temperature is real data); overdue = one alert red; source = quiet grey small-caps text.
- **Type:** IBM Plex Sans does all the data/body work; Space Grotesk for page titles + brand only; IBM Plex Sans Devanagari for Marathi *content*. ₹ figures are inline tabular — data, not a hero.
- **Rent is first-class equal to sale** everywhere (₹32k/mo + deposit read as cleanly as ₹82L).
- **KPIs reflect the real job** — Overdue · Unassigned · New today · Site visits (routing & oversight), not vanity money numbers.
- **One filter/sort bar** for every module: segments + a labelled ledger-style Sort control + view switch. No pill-based sorting.
- **The one bold moment** is the WhatsApp generation sequence (compose theatre → green message bubble) — the vernacular he already trusts. Everything else stays quiet so it lands.
- **Craft floor** (do without announcing): responsive to 360px, thumb-reachable primary actions, visible focus, 44px+ touch targets, `prefers-reduced-motion` respected, empty states written as invitations to act.

---

## 7. Focus & scope

**The demo path (rehearse this end-to-end — it's the meeting script):**
1. Branded login → dashboard *(F16, F2)*
2. New overnight lead → open → assign *(F1, F11)*
3. Buyer requirement → matching properties *(F3)*
4. Open a match → WhatsApp message → copy *(F4 — the magic moment)*
5. Set the site-visit follow-up → show on Home *(F6)*
6. Advance the stage *(F5)*
7. Flip to Admin → pipeline, agents, sources *(F13, F14)*
8. Close on Properties grid — "all of this is yours" *(F16)*

**Where the effort goes.** Most polish budget on **F4 (WhatsApp generator)** and the **workhorse Lead screen**. Admin/desktop gets the desktop attention (the owner runs it from a laptop). Mobile is the primary target for the agent screens.

**In scope:** the 10 screens (login, agent dashboard, leads inbox, lead detail, properties grid, property detail/add, matching, WhatsApp generator, contacts, admin dashboard) + Team, Settings, Integrations, Roadmap, and all the states/modals in `DESIGN_INVENTORY.md`.

**Out of scope:** real backend/auth, live portal/telephony/WhatsApp connections, commission/finance, marketing. These are represented honestly as designed "connect" states or parked on the Roadmap.

**Demo-ability gates (all must be green):** loads in ~2s with no spinner-of-death; zero dead buttons and zero broken screens; every non-functional item has a designed state; works thumb-first on 360px; seed data reads as real Pune business; the §7 run completes without explaining around a bug.
