# Delpat CRM — Demo Build Spec v1

**Purpose of this document:** the complete brief for building the clickable demo of the broker CRM. It is written to be handed directly to a design/build session. It defines what to build, what data lives inside it, how it behaves, and the design direction — including explicit anti-patterns to avoid. Branding assets (logo, final colours) arrive later; build against the placeholder identity defined below so swapping brand is a token change, not a redesign.

---

## 1. What this demo is

A working, clickable, mobile-first web app (PWA-style responsive) demonstrating Block 1 of the Delpat CRM to a non-technical Pune real estate broker. It is not a slideshow and not a Figma file — it must feel like his live system with his kind of data already inside it. He should be able to tap through it on his own phone within the first minute of the meeting.

The demo's job in one line: make him say "this is already my system" and start giving change requests instead of evaluating.

**Demo, not production:** all data is seeded/local (in-memory or local JSON store). No auth backend needed — a fake login screen that accepts anything is fine, because the login screen itself sells the branding. No real WhatsApp/portal/telephony connections; those are Block 2 and are represented in the UI as clearly-designed "connects to your account" states, never as broken buttons.

**But architected like production:** component structure, design tokens, and data shapes should be the real ones, because this demo is the seed of the multi-tenant v1. Every brand-specific value (name, logo, colours, domain) lives in one theme/config object — tenant #2 must be a config swap.

---

## 2. The demo storyline (build the screens to serve this exact walkthrough)

This is the 5-minute path the broker will be walked through. Every screen below exists to make one beat of this story land.

1. **Open the app on his phone** → his-brand login → straight into a dashboard that already shows a live-feeling business.
2. **A new lead has arrived** (seeded as "2 min ago", source: 99acres) → open it → full lead card → assign it to an agent in two taps.
3. **Open the lead's buyer requirement** → tap "Matching properties" → 3 real-looking matches appear instantly.
4. **Open a matching property** → tap **"WhatsApp message"** → the AI generator composes a clean Hinglish property message in ~2 seconds → copy → done. *(This is the magic moment. It gets the most design and polish budget of the entire demo.)*
5. **Set a follow-up** ("Site visit Sat 11am") → show it appearing in the agent's Today list.
6. **Flip to the Admin view** → pipeline overview, leads by source, agent leaderboard, overdue follow-ups glowing.
7. Close on the **Properties** grid — his inventory, statuses, photos — "and all of this is yours, your brand, your data."

## 3. Screens to build

Ten screens. Mobile layouts are the primary design target; desktop is a responsive widening (admin screens get the most desktop attention since the broker will run those from a laptop).

### 3.1 Login
Brand-forward: logo lockup, one-line tagline slot, phone + OTP fields (fake — any input passes). This screen exists to prove "his own system," so it must look like a firm's product, not a template.

### 3.2 Dashboard (Agent home)
Top: greeting with agent first name + today's date in compact form. Then, in priority order: **Today's follow-ups** (list, each row = contact name, action, time, overdue state), **New leads assigned to me** (badge count + list), quick stats strip (my active leads, site visits this week, deals closing). Bottom tab bar: Home / Leads / Properties / Contacts / More.

### 3.3 Leads inbox
Segmented control: All / New / Mine. Each lead row: name, requirement one-liner (auto-composed: "2BHK · Wakad · ₹75-85L"), source chip (99acres / MagicBricks / Walk-in / Referral / Website), time-ago, stage indicator, assigned-agent avatar or "Unassigned" state. Filter by stage and source. Sticky "+ New lead" action.

### 3.4 Lead detail (the workhorse screen)
Header: name, phone (tap-to-call UI), WhatsApp icon, source chip, stage stepper (New → Contacted → Site Visit → Negotiation → Closed Won / Closed Lost) — stage advances by tapping the stepper. Sections: **Requirement** (budget, locality, config, buy/rent, timeline — editable), **Matching properties** (button → 3.7), **Follow-up** (set next action with date/time), **Timeline** (seeded history: stage changes, notes, "message sent" entries), **Assign** (agent picker with round-robin suggestion highlighted). Duplicate-merge is demonstrated with one seeded lead flagged "Possible duplicate — same number" with a merge affordance.

### 3.5 Properties grid
Card grid (2-up mobile, 4-up desktop): photo, title ("2BHK · Kalyani Nagar"), price, area, status ribbon (Available / Under offer / Closed), owner name. Filters: type, locality, budget band, status. "+ Add property" opens 3.6.

### 3.6 Property detail / add-edit
Photo carousel, full spec sheet (type, config, carpet area, floor, facing, age, price, expected/negotiable, owner → links to contact), status control, notes. Primary action, visually dominant: **"Generate WhatsApp message"** → 3.8. Secondary: "Interested buyers" (reverse match list).

### 3.7 Matching results
Given the buyer's requirement, show ranked property cards each carrying a plain-language fit line ("In budget · Wakad · possession matches Dec"). Fit lines are template-composed from data for the demo — they preview the future AI matching without claiming it.

### 3.8 WhatsApp AI generator — THE signature screen
Flow: property context header → language toggle (Hinglish default / English / Marathi) → tone toggle (Standard / Short) → a composing state (~1.5–2s, with a purposeful generation animation — this pause is theatre, keep it) → the finished message rendered **inside a WhatsApp-style message bubble** so he instantly reads it as "ready to send" → actions: Copy, Regenerate, Edit. Message content comes from 3–4 handwritten Hinglish templates per property, parameter-filled from the property record and rotated on Regenerate, so output quality is guaranteed live with no API dependency. (Wire a real LLM call behind a flag if trivial, but the demo must never depend on it.)
The seeded message quality bar — natural Hinglish, broker-voice, e.g.:
"*Prime 2BHK in Wakad!* 🏡\nSpacious 950 sqft, 4th floor, full east facing — morning sunlight guaranteed. Society mein pool + gym, Hinjewadi IT park sirf 15 min. Owner direct deal, price ₹82L (thoda negotiable). Site visit ke liye reply karein — weekend slots available!"

### 3.9 Contacts
Tabs: Buyers / Sellers / Tenants / Landlords. Rows show the person + their one-line context (requirement for buyers/tenants, property count for sellers/landlords). Tapping a seller shows their linked properties.

### 3.10 Admin dashboard (desktop-priority)
Pipeline funnel by stage, leads-by-source breakdown, agent performance table (assigned / contacted / site visits / closed), overdue follow-ups list with assignee, this-month closed value. Plus a **Team** management surface (agent list, add/deactivate, role) and a **Settings** surface showing brandable knobs (logo, colours, stages, sources) — settings don't need to fully function, they need to *visibly exist*, because they prove the white-label story.

**Block 2 presence:** one "Integrations" panel (inside Admin) listing 99acres, MagicBricks, Calling & SMS, WhatsApp Business API, Website sync — each as a designed card with status "Connects to your account" and a short plain line of what it does. This lets the walkthrough say "and these switch on with your accounts" while pointing at real UI.

## 4. Seed data (build this in — the demo lives or dies on data feeling real)

All Pune, all plausible, all internally consistent (every property has an owner in Contacts; every lead's requirement matches at least 2 properties so matching always demos well).

- **1 brokerage:** placeholder name "Deshmukh Properties" (swapped later), Pune.
- **4 agents:** e.g. Rohan, Sneha, Amit, Priya — with initials avatars.
- **~18 leads** across all stages and all sources, timestamps spread over the last 3 weeks, 2–3 marked overdue, one seeded "possible duplicate" pair, and one seeded "2 minutes ago, unassigned, source 99acres" as the walkthrough's opening beat.
- **~14 properties** across Wakad, Baner, Kalyani Nagar, Kothrud, Hinjewadi, Viman Nagar: mix of 1/2/3BHK resale, 2 rental flats, 1 commercial office, 1 NA plot; realistic Pune prices (₹55L–₹2.1Cr resale, ₹18–45k/mo rentals); statuses mixed. Photos: neutral real-estate placeholder images, consistent aspect ratio.
- **~24 contacts** split across the four entity tabs, names that read Pune-real (Marathi + North Indian mix).
- **Timelines** pre-populated on 5–6 leads so opened records feel lived-in, not fresh.

## 5. Behaviour that must actually work in the demo

Assign/reassign a lead, advance a stage, set a follow-up and see it appear on Home, add a property and see it in the grid, run matching, generate/copy/regenerate the WhatsApp message, switch Agent ↔ Admin views (a simple role switcher is fine), and all filters/tabs. Everything else may be visual, but must never look broken — no dead buttons; anything non-functional gets a designed state instead.

---

## 6. Design brief (for the design session — read fully before any pixels)

### Who this must impress
A Pune real estate broker in his 30s–50s, non-technical, status-conscious, evaluating whether this feels like *his firm's own serious platform*. Secondary audience: his agents, phone-first, using it mid–site-visit in sunlight with one thumb. It must read as confident Indian business software — trustworthy like a bank app, energetic like a sales floor — not as a Silicon Valley SaaS template and not as a government portal.

### The one job of the design
Make ownership feel real. Every screen should feel like it belongs to a specific brokerage with money on the line — dense with real information, fast to scan, zero decoration that doesn't inform.

### Hard anti-patterns (the "AI-generated" tells to avoid — non-negotiable)
- No warm-cream + serif-display + terracotta/clay accent combo. No near-black + single acid-green/vermilion accent. No hairline-rule broadsheet pastiche. These are the three current AI-default looks; using any of them fails the brief.
- No purple-to-blue gradients, no glassmorphism cards, no floating 3D blobs, no emoji as UI icons, no oversized hero numbers with tiny grey labels as the default stat treatment.
- No default Tailwind grey-50/indigo-600 palette straight off the shelf. No Inter-for-everything with nothing else considered (a well-set system stack is acceptable; an unconsidered one is not).
- No lorem ipsum, no John Doe, no "Property 1" — the seed data above is part of the design.
- Don't over-animate. One orchestrated moment (the WhatsApp generation sequence) plus quiet micro-interactions beats motion sprinkled everywhere.

### Direction to explore (a starting stance, not a straitjacket — improve on it, don't default past it)
Ground the identity in the subject's real world: Pune property dealing — sale boards, stamp paper, brass nameplates, site-visit mornings, the WhatsApp forward as the industry's true document format. Two credible directions; pick one and commit, or propose better:
1. **"Nameplate":** the confidence of an established firm's brass-and-ink stationery translated to product UI — deep ink or bottle-green base identity, warm paper-white surfaces, one metallic-leaning accent used only for money and success states, a display face with real character reserved for the brand and big figures, a hardworking body face built for dense data.
2. **"Sale board":** the graphic energy of Indian property signage — bold, high-contrast, unapologetically informational; strong colour blocking for stages and statuses, chunky numerals for prices, near-zero ornament.
Whichever direction: status and stage colours must form a real system (a lead's temperature and a property's availability should be readable at arm's length), prices are typographic first-class citizens (₹ figures in Indian formatting — ₹82L, ₹1.2Cr — set to be scannable), and the WhatsApp-bubble rendering in 3.8 should be the one borrowed-vernacular moment, because it's the vernacular the user already trusts.

### The signature element
Spend the boldness budget on **screen 3.8's generation moment** — the compose animation into the WhatsApp-style bubble. It should feel like the system is *working for him*, and it's the screen he will remember and describe to other brokers. Everything else stays disciplined so this lands.

### Craft floor (do without announcing)
Responsive to 360px width, thumb-reachable primary actions on mobile, visible focus states, honest touch targets (44px+), reduced-motion respected, empty states written as invitations to act ("No follow-ups today — add one from any lead"), error/edge states designed not defaulted. Copy in-product follows the seed-data voice: plain, active, sentence case; buttons say what they do ("Assign to Rohan", "Copy message"), and Hinglish appears in *content* (messages, seeded notes) while *chrome* (labels, buttons) stays clean English.

### Process expectation for the design session
Before coding: produce a compact token plan (4–6 named hex colours, type roles, layout concept, the signature) and self-check it against the anti-pattern list — if any part of the plan would look the same for a generic "CRM dashboard" prompt, revise it. Then build to the plan exactly.

---

## 7. Build order (so it's demoable fast even if unfinished)

1. Theme/token system + app shell + tab bar + seeded data store.
2. Screens 3.8 → 3.4 → 3.3 (magic moment first, then the workhorse, then the inbox that leads into it).
3. 3.5/3.6 properties, 3.7 matching.
4. 3.2 home, 3.9 contacts.
5. 3.10 admin + integrations panel.
6. 3.1 login last (it's one screen, but polish it — it's the first thing he sees).

If time runs out, a demo of steps 1–3 alone still delivers the storyline's core beats (2 through 4).
