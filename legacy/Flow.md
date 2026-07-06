# Delpat CRM — Broker Flow Checklist (Verify + Demo)

**Two jobs, one list.** Run these _as you build_ to verify each piece works. Run them again _the night before_ to rehearse the demo. Every flow is written from the broker's head, not from screen names, so if all of these pass, the product covers what he actually does and survives him poking at it.

**How to use each flow:**

- _In his head_ — the situation and why he cares. Keep this framing while you test.
- _Do_ — the exact taps.
- _Passes if_ — the functional check. This is your QA.
- _Sells_ — what it proves to him. This is your demo line.

Report bugs back to me by flow number (F3, F11, etc).

---

## A. The core daily flows (must work, must demo)

**F1 — The lead that came in overnight**

- _In his head:_ "A 99acres lead landed at 11pm. On my sheet it would sit unseen. Does this catch it?"
- _Do:_ Open app → dashboard shows new-lead count → Leads inbox → open the lead marked "2 min ago · 99acres".
- _Passes if:_ Lead appears unassigned with source chip, requirement one-liner, and time-ago, all readable at a glance.
- _Sells:_ "Every lead from every portal lands here the second it arrives. Nothing gets lost."

**F2 — Nothing falls through the cracks**

- _In his head:_ "Which of my leads need me today? I forget follow-ups all the time."
- _Do:_ Dashboard → Today's follow-ups list → note the overdue ones flagged.
- _Passes if:_ Today's actions and overdue items are the first thing on the home screen, each with contact, action, time.
- _Sells:_ "The system remembers every follow-up so you and your agents never drop one. This is the leak you're losing money to today."

**F3 — Find stock for a walk-in, instantly**

- _In his head:_ "Client's standing in front of me: 2BHK, Wakad, 75 to 85 lakh. Can I pull matches now or do I dig through my sheet?"
- _Do:_ Open the buyer's lead → Requirement section → tap Matching properties → 3 matches appear.
- _Passes if:_ Matches respect budget, locality, and config, each with a plain fit line ("In budget · Wakad · ready possession").
- _Sells:_ "You answer a live client in five seconds, not five minutes. That speed closes deals."

**F4 — Send property details on WhatsApp**

- _In his head:_ "This is 80% of my day. I type the same property message a hundred times."
- _Do:_ Open a property → tap WhatsApp message → language toggle (Hinglish) → message renders in a WhatsApp-style bubble → Copy.
- _Passes if:_ A clean, natural Hinglish message fills from that property's real data, formatted and copy-ready. (Template fill, no AI, no delay.)
- _Sells:_ "Pick a property, tap once, message ready to forward. Your whole day of typing gone."

**F5 — Move a lead through the pipeline**

- _In his head:_ "Where is this deal? Contacted? Site visit done? I lose track."
- _Do:_ Open lead → tap the stage stepper → advance New → Contacted → Site Visit → Closed Won.
- _Passes if:_ Stage updates, the change logs on the timeline, and the lead's position reflects everywhere (inbox, dashboard).
- _Sells:_ "One glance tells you where every deal stands. No more guessing or asking your agents."

**F6 — Set a site visit so it never slips**

- _In his head:_ "Told the client Saturday 11am. Watch me forget by Friday."
- _Do:_ Open lead → Follow-up → set "Site visit, Sat 11am" → go to Home → confirm it appears in that agent's Today/upcoming.
- _Passes if:_ The follow-up saves and surfaces on the correct agent's home at the right time, and shows overdue if the time passes.
- _Sells:_ "Set it once, the system chases it. Your agents stop forgetting site visits."

**F7 — Add a fresh listing an owner just gave me**

- _In his head:_ "Owner just handed me a flat to sell. How fast can I list it?"
- _Do:_ Properties → Add property → fill type, locality, config, price, owner, status, photo → save → see it in the grid.
- _Passes if:_ Property saves, appears in the grid, links to the owner contact, and immediately shows up in relevant buyer matches.
- _Sells:_ "New stock is live and matchable the moment you add it."

**F8 — This flat is sold, take it out**

- _In his head:_ "I hate showing clients a property that's already gone. Embarrassing."
- _Do:_ Open a property → change status to Closed/Sold → run a matching search that used to include it.
- _Passes if:_ Sold stock drops out of active matching and shows a clear Closed ribbon in the grid.
- _Sells:_ "Sold means gone from circulation automatically. You never pitch dead stock again."

**F9 — Who wants this property I just got?**

- _In his head:_ "Got a great 3BHK in Baner. Which of my buyers is hunting for exactly this?"
- _Do:_ Open the property → Interested buyers / reverse match.
- _Passes if:_ Buyers whose requirement fits are surfaced with their fit reason.
- _Sells:_ "New listing, and the system tells you which buyers to call first. That's a deal in a day."

**F10 — A duplicate buyer from two portals**

- _In his head:_ "Same guy enquired on 99acres and MagicBricks. On my sheet he's two rows and two agents call him. Looks unprofessional."
- _Do:_ Open the seeded "possible duplicate" lead → see the flag → merge.
- _Passes if:_ System flags same-number leads and merges into one record with combined history.
- _Sells:_ "One client is one record, no matter how many portals he uses. No two agents calling the same person."

## B. Team and control flows (the admin story)

**F11 — Hand a lead to an agent**

- _In his head:_ "New lead. Who gets it? I want to decide, or let the system spread it fairly."
- _Do:_ Open unassigned lead → Assign → pick agent, or accept the round-robin suggestion.
- _Passes if:_ Lead assigns, shows the agent's avatar, and appears in that agent's inbox only.
- _Sells:_ "Distribute leads fairly and instantly, or hand-pick. Your call."

**F12 — An agent left, move his leads**

- _In his head:_ "Rohan quit. His 30 leads can't just sit there dead."
- _Do:_ Admin → open Rohan's leads → bulk reassign to another agent, or deactivate Rohan and reassign.
- _Passes if:_ Multiple leads reassign in one action and land with the new agent.
- _Sells:_ "An agent leaves and their pipeline is safe in one click. No lost clients, no chaos."

**F13 — Is my team actually working?**

- _In his head:_ "Are my agents following up or sitting idle? I can't see it today."
- _Do:_ Admin dashboard → agent performance table (assigned / contacted / site visits / closed) + overdue-by-agent.
- _Passes if:_ Per-agent numbers render and overdue follow-ups show who's responsible.
- _Sells:_ "You see exactly who's performing and who's letting leads rot. No more flying blind."

**F14 — End of day, how's business?**

- _In his head:_ "Give me the one screen that tells me where my money is."
- _Do:_ Admin dashboard → pipeline funnel, leads by source, this-month closing value.
- _Passes if:_ Funnel, source split, and value figures render from the seeded data and add up.
- _Sells:_ "Your whole business on one screen. Which portal is worth paying for, what's closing, what's stuck."

**F15 — Keep every kind of contact separate**

- _In his head:_ "Buyers, sellers, tenants, landlords. On my sheet it's one big mess."
- _Do:_ Contacts → tab through Buyers / Sellers / Tenants / Landlords → open a seller → see their linked properties.
- _Passes if:_ Each entity type is cleanly separated and a seller/landlord links to their properties.
- _Sells:_ "Every relationship in its right place, buy side and sell side, sale and rental, all separated."

**F16 — Prove it's mine**

- _In his head:_ "Is this actually my firm's system, or am I just renting someone's software with my name stuck on top?"
- _Do:_ Show the branded login → brand across the app → Admin → Settings showing logo/colour/stages knobs.
- _Passes if:_ Branding is consistent everywhere and the settings surface visibly exists (even if not fully wired).
- _Sells:_ "Your name, your colours, your system. Your agents and clients see your firm's technology, not a vendor's."

## C. Integration flows (Block 2 — demo honestly, don't fake)

These are promised but staged. In the demo they must look designed and intentional, never broken. Verify each shows a clean "connects to your account" state.

**F17 — Calling and SMS from a lead**

- _In his head:_ "He said I can call and SMS from inside. Show me."
- _Do:_ Open lead → tap the call / SMS affordance.
- _Passes if:_ A designed calling/SMS UI or a clear "connect your number" state appears. No dead button, no crash.
- _Sells:_ "Click to call, auto-logged. SMS templates for confirmations. Switches on with your telephony account."

**F18 — Portal auto-pull**

- _In his head:_ "You said 99acres and MagicBricks feed in automatically. Where?"
- _Do:_ Admin → Integrations panel → 99acres / MagicBricks cards.
- _Passes if:_ Each portal shows a designed connect card with a one-line description of what it does.
- _Sells:_ "Leads flow in the moment your portal accounts are connected. Fully automatic from there."

**F19 — WhatsApp automation and website sync**

- _In his head:_ "Automated WhatsApp and my website updating, that's what I really want."
- _Do:_ Integrations panel → WhatsApp Business API card + Website sync card.
- _Passes if:_ Both present as designed, honest connect/scope states. Website sync clearly marked as the custom piece.
- _Sells:_ "Automated WhatsApp switches on with approval. Website sync is your custom add-on, scoped once I see your site."

## D. The skeptic's stress tests (what he'll try to break)

Test these yourself before the meeting. A broker pokes to see if it's real.

- **Empty search:** search a locality with no stock. Passes if a designed empty state shows ("No matches in Kothrud yet"), not a blank or crash.
- **Half-filled lead:** open a lead with a missing requirement field. Passes if it degrades gracefully, no broken layout.
- **Long Indian names:** a "Dnyaneshwar Kulkarni-Deshpande" doesn't break rows or truncate ugly.
- **Back and forth:** navigate deep, hit back repeatedly, switch tabs. Passes if state holds and nothing resets weirdly.
- **Random tapping:** tap everything on each screen. Passes if there are zero dead buttons anywhere.
- **Role switch:** flip Agent ↔ Admin. Passes if the view genuinely changes what's visible.
- **His actual phone:** open on a real mid-range Android in daylight. Passes if it's readable, thumb-reachable, fast.

## E. The full demo run (one unbroken pass)

Rehearse this exact sequence end to end. It's the 5-minute walkthrough and your meeting script. If it runs start to finish without a stumble, you're ready.

1. Branded login → dashboard (F16, F2)
2. New overnight lead → open → assign (F1, F11)
3. Buyer requirement → matching properties (F3)
4. Open a match → WhatsApp message → copy (F4)
5. Set the site visit follow-up → show on Home (F6)
6. Advance the stage (F5)
7. Flip to Admin → pipeline, agents, sources (F13, F14)
8. Close on Properties grid → "all of this is yours" (F16)

## F. Demo-ability gates (cross-cutting, all must be green)

- Loads in under ~2 seconds, no visible spinner-of-death.
- Zero dead buttons and zero broken screens anywhere in the app.
- Every non-functional item has a designed state, never a blank.
- Works thumb-first on a 360px phone screen.
- The seeded data reads as real Pune business (localities, names, ₹L/₹Cr prices), no "Property 1" or "John Doe".
- The full run in Section E completes without you having to explain around a bug.

---

**Coverage check against his stated asks:** portal pull (F18), calling + SMS (F17), WhatsApp messaging (F4) and automation (F19), buyer/seller/tenant/landlord segregation (F15), assignment (F11) and admin panel (F12, F13, F14), website update (F19, as custom), plus the traditional CRM baseline (F1, F5, F6, F7, F8, F9, F10). If every flow passes, you're covering what he asked for and what he didn't think to ask for but expects.
