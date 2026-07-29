# Bhumi Propcity — Complete Design Inventory

**Purpose.** The full, literal list of everything the redesign must cover — every page, every module-specific action, every shared component, every state/toast/modal — derived by reading the actual code (`app.js`, `screens.js`, `desktop.js`, `main.js`, `render.js`, `data.js`). We design **one coherent system** against this list. Nothing gets a bespoke per-screen layout; a module only gets a distinct treatment where it earns a **prime CTA** (noted below).

Two real modes: **Mobile** = field agent (one thumb, sunlight, mid-visit). **Desktop** = owner/admin back-office. Both must be designed.

---

## 0. The two jobs the product sells (keep front of mind)
1. **Get out of fragmented Excel** — one structured system, his brand, on his phone.
2. **Manage his agents** — routing, oversight, no lost clients, process juniors follow.
Everything else (commission, finance, marketing) is explicitly out of scope → parked on the Roadmap as "integrate, not replace." **No generic-SaaS drift, no kanban-for-kanban's-sake.**

---

## 1. Shared chrome (design ONCE, used everywhere)

| Component | Mobile | Desktop | Notes |
|---|---|---|---|
| **Brand mark / nameplate** | top nameplate bar (BP monogram + firm + desk line) | sidebar header (monogram + firm + office line) | white-label: all via `theme.brand`. The brass-keylined stamped monogram is the signature. |
| **Primary nav** | bottom tab bar: Home · Leads · Stock · People · More (animated active "page-tab") | left sidebar, labelled sections (Workspace / Manage / What's next) + owner footer w/ "switch to agent app" | active state must read physical/inset. |
| **Top bar (desktop)** | — | contextual: **title + live count** · working **search** · **quick-add** (module's primary object) · **notifications** · view state | operational, not decorative. |
| **Search** (command palette) | overlay | overlay | sections: Leads / Properties / People; empty + no-match states. |
| **Notification center** | bell + unread badge → panel | same | items: overdue · today · unassigned · re-approach. Empty state. |
| **Global filter/sort bar** | segment row + horizontal source chips | ONE bar: segments + filter chips + **sort menu** + **view switch** | **must be one component**, same grammar everywhere. Move away from third-class pill-sort. |
| **Action model** | bottom **actions bar** (prime CTA + "Actions" → sheet) | right **slide rail** (collapses to a single "Actions" tab on narrow, opens on hover; full column when wide) | ONE rail, internally sectioned. Prime CTA differs per module (see §3). |
| **Toasts** | bottom-center | bottom-center | success (charcoal + ochre ✓) and warn (oxblood + ⚠). |
| **IP watermark** | tiled agent-name + firm overlay on every agent screen | owner view = no watermark | honest anti-leak: deterrence + traceability. |
| **Empty states** | every list/collection | same | written as invitations to act, not mood. |

---

## 2. Pages / screens (every one in the demo)

### Auth
- **Login — phone step** (country code + number, "any OTP works" demo note).
- **Login — OTP step** (4 boxes prefilled, "Demo — any code works").

### Agent (mobile) — the field tool
- **Home** — greeting + date, 3 stat tiles (Active / Site visits / Closing soon), **Today's follow-ups** list (+ "All visits" → calendar), **New leads for you** list. Empty states for both.
- **Leads (inbox)** — segments (All / New / Mine w/ counts), source filter chips, overdue count, lead rows (name, req line, source pill, stage, agent avatar / "Unassigned", dup flag, time-ago w/ overdue red), FAB "New lead". Empty state.
- **Lead detail** — header (name, source, phone, assigned-to) · **stage stepper** (tap to advance) · **requirement** card (+edit) · **matching** (reveal → explainable match rows w/ % fit + ranked reasons + WhatsApp) · **follow-up** card · **handover checklist** (Closed Won only) · **timeline** + note/log-call adder · bottom actions bar. Duplicate-merge banner state.
- **Properties (Stock)** — type chips + status chips, 2-col card grid (thumb, status badge, NEW badge, ₹, area, owner), FAB "Add property".
- **Property detail** — hero thumb, society + ₹ + status + owner, spec sheet grid, **interested buyers** (reverse match w/ fit), bottom actions bar.
- **People (Contacts)** — tabs Buyers/Sellers/Tenants/Landlords (counts), rows (avatar, name, context, stage OR listing-count, expand), inline expand → listings, "New" button.
- **Person detail** — avatar + role + phone, 3 stats (Listings / Available / Portfolio value), listings from this owner, bottom actions bar.
- **Calendar / site-visit agenda** — day-grouped cards (overdue day flagged), each item: time, dot, name, action, "Site visit" tag, agent avatar. Empty state. (Clickable → reopens scheduler.)
- **Soon placeholder** — for nav items not in the demo walk (honest "part of full build").

### Owner (desktop) — the back-office
- **Dashboard** — 4 KPI tiles (Closed this month ₹ · Active pipeline · New 24h · Overdue, red-flagged), **Pipeline by stage** bars, **Leads by source** bars, **Agent leaderboard** table (assigned/contacted/visits/closed/value + TOP), **Overdue follow-ups** list.
- **Leads** — dense sortable **table** (Name/phone · Requirement · Budget ₹ · Stage · Source · Agent · Next follow-up) via the one filter/sort bar (segments + sort + view switch). Row → **full-page lead record**.
- **Lead record (full page)** — breadcrumb, header (phone/source/stage/agent + Edit / Merge / WhatsApp), NBA banner, requirement, top matches (fit + Share), timeline + note adder, right rail (quick actions / scheduler / stage track).
- **Properties** — status segments + type chips + **cards/list** view switch. Cards grid or table. Row/card → property detail.
- **Property detail (full page)** — hero, spec sheet, interested buyers, right rail.
- **People** — the 4 books as segments, list, inline expand.
- **Person detail (full page)** — stats + listings, right rail.
- **Calendar** — same agenda body, desktop width.
- **Team** — agent cards (avatar, active/closed/overdue counts, Reassign / Deactivate), "Add agent". Inactive = dimmed.
- **Settings** — white-label banner, Brand (monogram, firm name, colour swatches), Pipeline stages, Lead sources (+ add source). "This is your brand, your data."
- **Integrations** — cards (99acres, MagicBricks, Calling & SMS, WhatsApp Business API, Website sync) w/ "connects to your account" / "custom add-on" badges → detail modal.
- **Roadmap** — Live today / Next (Block 2) / Later, each a list w/ check/pending icons. The positioning screen.

---

## 3. Module-specific PRIME actions (a module earns its own CTA — allowed & wanted)

The action rail/bar is ONE component, but its **primary** action and quick set change by object:

| Object | Prime CTA | Quick actions | Notes |
|---|---|---|---|
| **Lead** | **Call now** / next-best-action (e.g. "Send top match on WhatsApp", or overdue "Call back") | Log call · SMS · **Schedule follow-up** · Change stage · Assign/Reassign · Add note · WhatsApp | NBA is computed (overdue → chase; else top match). Call & SMS panel. |
| **Property** | **Share on WhatsApp** (to top interested buyer, or generic) | Set status (Available/Under offer/Closed) · Call owner · Edit listing | The WhatsApp **generator** is the signature moment — lives here + on lead match rows. |
| **Person (owner)** | **Call owner** | Add a listing for them · Edit contact | |
| **Person (buyer/tenant)** | opens the underlying lead | — | routes to lead detail. |

**WhatsApp generator (SIGNATURE — most polish):** fake "AI composing" theatre (pen-sweep, pulsing dots, shimmer skeleton) → WhatsApp-green bubble w/ broker-circular message, in **Hinglish / English / Marathi × Standard / Short**, editable / copyable / regenerable. Mobile = full screen; desktop = modal. Chat-canvas aesthetic.

**Follow-up scheduler (§5e — the big UX fix):** ONE scheduler, two entry points (action rail + calendar). action type (Call / Site visit / Meeting, segmented) → quick date chips (Today / Tomorrow / This weekend / Pick date…) → native `<input date>` + `<input time>` → Save → lands on lead timeline **and** calendar. Calendar entries clickable → reopen to reschedule.

---

## 4. Shared component library (one definition each — `ui.js`)

- **Buttons**: primary (charcoal) · **metal** (ochre — money/won/prime only) · ghost · danger · icon.
- **Money**: ₹ figures = first-class serif tabular objects in ochre (₹82L / ₹1.65Cr / ₹32k/mo). Indian formatting.
- **Pills / chips**: stage (functional colour — data signal, keep) · source (outline) · property status · filter-toggle · count-badge. **Not** the primary sort mechanism.
- **Cards**: ONE frame w/ slots → property / lead / person / KPI all the same frame.
- **List rows / table**: dense sortable table (desktop) + comfortable row (mobile).
- **Inputs**: text · phone (+91 prefix) · segmented control · quick-chip group · native date + time · textarea · select.
- **Avatar**: agent initials chip (agent colour).
- **Section header**: uppercase micro-label + optional right slot.
- **Stage track**: single-line connected progress stepper (done/current/todo; "lost" pulled out as a quiet link). NOT a wrapping chip row.
- **Next-best-action banner**: charcoal, ochre glyph, one CTA.
- **Scheduler** (above).
- **Toasts / empty states / dividers**.

---

## 5. States to draw explicitly (all of them — the "everything" you asked for)

- **Loading / composing**: WhatsApp "AI composing" (pen sweep, dots, shimmer skeleton).
- **Empty**: leads (filtered vs none), matches (none yet), buyers (none), calendar (nothing scheduled), search (idle + no-match), notifications (all clear), follow-ups (none today).
- **Success**: toast (lead saved/routed, property added, status updated, follow-up added to Today, handover complete, reassign done w/ count), inline "Added to X's Today list", checklist 100% done.
- **Warning/error**: toast (add a name first, type a note first), duplicate-lead banner (+ merge).
- **Overdue**: red day header, red time-ago, red KPI tile, glowing overdue dot, NBA "overdue" variant.
- **Assigned vs Unassigned** lead (avatar vs dashed "Unassigned").
- **Active vs Inactive** agent (dimmed card).
- **Integration status**: staged ("connects to your account") vs custom add-on vs "not live in this demo" note.
- **Post-won**: handover checklist (progress bar, tick items, add custom step, re-approach reminder set/unset).
- **NEW** property badge (just added → matchable).
- **Login**: phone step vs OTP step.

---

## 6. Modals / overlays (all)
New-lead sheet (mobile) · Actions sheet (mobile) · Call & SMS panel · Integration detail · Reassign (form + done) · Add agent · Add property · WhatsApp (desktop modal) · Lead form (new/edit) · Contact form (new/edit) · Global search · Notification center.

---

## 7. Hard guardrails
- **Static only** (HTML + vanilla JS, no build/backend). Deployable by opening `index.html`.
- **White-label**: brand values only in `theme.js`. No hardcoded "Bhumi Propcity" in markup.
- **One accent** = ochre = money/won/prime metal. Stage/source keep functional colours (data, not brand). Charcoal + linen base.
- **Type**: Fraunces (display + ₹) · IBM Plex Sans (body/data) · IBM Plex Sans Devanagari (Marathi content only).
- **Chrome stays clean English**; Hinglish/Marathi only in generated content/messages.
- **No AI-design tells**: no warm-cream+serif+terracotta, no near-black+acid accent, no purple→blue gradient, no glassmorphism, no emoji-as-icons, no everything-centered, no rounded-lg-everywhere, **no pill-based sort**, **no kanban unless it serves a real need** (it doesn't here — owner scans, doesn't drag).
- **Craft floor**: responsive to 360px, thumb-reach primary actions, visible focus, 44px touch targets, `prefers-reduced-motion`, empty states as invitations.

---

## 8. Next step (agreed process)
1. Use the **frontend-design skill** to envision ONE correct, polished visual system from these clues — before any code.
2. Produce **one design page** that shows ALL of the above — every screen, state, toast, modal — side by side, in that one system, mobile + desktop, real seed data.
3. Only after that page is approved: build it as a real template layer (screens = data/config, not bespoke layout).
