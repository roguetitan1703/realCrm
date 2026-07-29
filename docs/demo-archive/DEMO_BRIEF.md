# Bhumi Propcity CRM — Demo Brief

Everything you need in the room: what this is, what to show, what to say, what to admit, and how to answer the hard questions.

> **Pricing lives in your web Claude session** — this brief deliberately leaves it out. Slot your final numbers into the "Pricing" section before the meeting.

---

## 0. The 20-second opener

> "This is a **working prototype** of your CRM — real and clickable, running on your actual workflows, not slides. Every screen, the WhatsApp generator, the matching, the mobile agent app — you can touch all of it today. What it doesn't have *yet* is the backend: right now the data lives in the browser. It's built to prove the product and the fit before we harden it into the live system your team logs into every day."

Say **"prototype"** and **"not the finished version"** early and confidently. It's a strength, not an apology — you got the hard part (the workflow) right before writing a line of backend.

---

## 1. What this IS vs what it is NOT

**IS**
- A real React app running on this machine — actual UI, actual interactions.
- White-labeled as **Bhumi Propcity** (his brand, not a vendor's).
- Built on *his* real workflows: leads, dual-sided inventory (buyer/seller + tenant/landlord), agent assignment, vernacular WhatsApp, mobile field use.
- Data mutates live in the session — assign a lead, advance a stage, add a note, and it updates everywhere.

**IS NOT (yet — this is the production build)**
- **No backend.** Data lives in the browser and **resets on refresh.** Do not refresh mid-demo.
- **No real accounts / login / permissions.** Login screen accepts any code — it's a shell.
- **Integrations are staged.** WhatsApp API, telecalling, portal sync (99acres/MagicBricks), website sync — designed and wired in the UI, but they switch on with *his* accounts at setup. Nothing sends live today.
- **Bulk import is a preview.** The "Import from Excel" flow shows the mapping experience; the real parser is a build task.

**The line that lands:** *"The hard part of a CRM isn't the code — it's getting the workflow right for how brokers actually work. That's what this prototype locks down. Now we build it for real, on top of a design you've already approved."*

---

## 2. The demo path (drive it in this order)

Do it as a story — a lead comes in, gets worked, closes. Add data *live* to show it's real (just don't refresh).

1. **Login** → any phone + any OTP. "This is your branded front door — real auth comes with the backend."
2. **Dashboard** (the hero screen) → point at the 4 KPIs (Overdue / Unassigned / New today / Site visits). **Click a KPI** — it drills into that exact filtered list. Everything on this screen is clickable: pipeline bars → stage, source bars → source, leaderboard row → team, overdue row → the lead.
3. **New lead** → click **New lead** in the toolbar. Fill it. Show it lands in the pipeline. "This is your 99acres/MagicBricks lead — those feeds auto-drop here once connected."
4. **Assign** → open the lead, **Assign owner**. Note the **[SUGGESTED]** agent — round-robin picks whoever has the fewest active leads. Fair distribution, no favoritism.
5. **Matching** → in the lead, "Properties for this lead" shows **system matches with a % fit** + reasons (locality, budget, config). Not AI magic — explainable logic. Attach one to the shortlist.
6. **The signature moment — vernacular WhatsApp** → hit **WhatsApp a property**. Watch it "compose" (the typing theatre), then a real message appears. **Switch language to Marathi / Hinglish** and **tone to Short**. This is the moment that sells — a personal, native pitch in one tap, not robotic spam.
7. **Schedule + advance** → set a follow-up (Today/Tomorrow → time). Advance the stage on the stepper (New → Contacted → Site Visit…). Both update the timeline live.
8. **Site-visit outcome** → on a property row, hit **Visit** → mark **Liked** or **Rejected + reason** (Vaastu / Price / Floor…). Rejected properties dim and drop down; it logs to the timeline. "This is how you stop re-showing flats a client already said no to."
9. **Unit-level inventory** → open a **Kolte Patil Life Republic** listing. Show **Unit B-1402**, and the **"Other units in this project"** table — same society, three flats, three prices, three owners (₹82L / ₹75L / ₹78L). "No more side-WhatsApp-group to track which flat is which price. And the unit number stays internal — it's masked in the client's WhatsApp message."
10. **Admin power — attrition** → **Team** → **Deactivate** an agent → **Reassign leads** to another. In ~5 seconds the whole pipeline transfers, notes and follow-ups intact. "This is the single biggest fear for a firm owner — an agent quits and walks off with the client list. Here, zero leakage."
11. **White-label** → **Settings** → change firm name / stages / sources. "It's *your* software, not a rented seat with someone else's logo."
12. **Mobile agent view** → profile menu → **Switch to agent (phone) view** (or the sidebar switch). Show **Today** (overdue/today/new), one-tap Call/WhatsApp on a lead, the field speed-dial. "This is what your agents use on the road, between site visits, one-handed."
13. **Import (objection pre-empt)** → **Integrations → Import from Excel** → show the drag-drop + column-map preview. "Your existing 340 clients and 65 listings come in on setup — no manual re-entry."

**Best single wow if you only get 2 minutes:** #6 (vernacular WhatsApp) + #10 (attrition reassignment).

---

## 3. Questions he'll ask — and how to answer

**"Is this the finished product?"**
> No — it's a working prototype that proves the product on your workflows. What's left is the backend: permanent data, real logins, your team live. I built the hard part first so we're building on an approved design, not guessing.

**"Where does my data live? Is it safe?"**
> Right now, in the browser for the demo — it resets on refresh. In production it's on a proper backend, your data, your tenant, access-controlled. Nothing is shared with other firms.

**"Can I move my existing Excel / client list in?"**
> Yes — bulk import from Excel or Google Sheets. You saw the mapping preview. It runs for real on setup; you're not re-typing 400 records.

**"Does the WhatsApp actually send?"**
> The message generation is real and it's the differentiator. Sending connects to *your* WhatsApp Business account at setup — so it goes from your number, not a shared one. Today it generates + copies; live sending switches on when we connect your account.

**"What about calling / telecalling?"**
> Click-to-call and auto-logging are built into the flow. They run on a cloud telephony account (yours). That's a usage cost billed to you at actuals — I don't mark it up.

**"Can it handle rent, not just sale?"**
> Rent is first-class everywhere — tenants, landlords, deposits, monthly rent, furnishing. The whole thing is dual-sided: buyer/seller and tenant/landlord.

**"What if an agent quits?"**
> [Show it live — Team → Deactivate → Reassign.] Their whole pipeline moves in seconds, notes and follow-ups intact. Zero client loss.

**"Can I track specific flats, not just the society?"**
> Yes — [show Kolte Patil units]. Each unit is its own listing with wing, flat number, floor, parking, its own owner and price. And the flat number stays internal — masked in the client's WhatsApp.

**"How many agents can use it?"**
> Whole firm, flat — not per-seat. Growing your team doesn't cost you more. [Details → Pricing section.]

**"When is it live?"**  ← **DECIDE THIS NUMBER BEFORE THE MEETING.**
> Realistic build timeline: **[fill in]**. Don't hesitate here — a good demo always ends with this question, and hesitation undercuts the confidence.

**"Why you and not Zoho / Sell.Do / a spreadsheet?"**
> Spreadsheets and WhatsApp win today because they're fast and mobile — but they leak leads and lose data when agents quit. Big CRMs are desktop-first, slow, and carry *their* brand. This is as fast as WhatsApp, mobile-first for your agents, white-labeled to you, with the vernacular WhatsApp moment they don't even have.

---

## 4. Things that will break / what NOT to do live

- **Do NOT refresh the browser** — the demo state resets (you lose anything you added live).
- **Login accepts any code** — don't imply real auth is done.
- **Integrations don't actually send/sync** — describe them as "switches on with your account," never claim a live send.
- **Import doesn't parse a real file** — it's a mapping preview; don't drag a real spreadsheet and expect rows.
- If something glitches, refreshing fixes rendering **but wipes your live edits** — so demo the "add data" parts last, or accept the reset.

---

## 5. The strongest selling points (lead with these)

1. **Vernacular WhatsApp engine** — one-tap personal pitch in Hinglish / Marathi / English, tone-switchable. Buyers reply because it feels human. Competitors don't lead with this.
2. **Anti-attrition reassignment** — an agent quits, you reassign their whole book in 5 seconds, nothing lost. Solves the owner's #1 fear.
3. **White-label brand ownership** — it's Bhumi Propcity's software, elevating his pitch to developers and landlords.
4. **Mobile-first field speed** — built for how agents actually work: on the road, one hand, between visits.
5. **Unified Clients directory** — buyers, tenants, sellers, landlords in one place. Today's landlord is tomorrow's buyer.
6. **Explainable matching** — % fit with reasons, not a black box.

---

## 6. Pricing — FILL FROM YOUR WEB CLAUDE SESSION

> Paste your final structure here before the meeting. Skeleton to fill:

- **Base:** flat per-firm monthly (not per-seat). Whole brokerage, all agents. → `₹____ / month`
- **Annual:** `₹____ / year` — with founding-client rate `₹____` locked because he's first.
- **Standard rate** (for firms he refers): `₹____+ / month` — so you don't anchor your own product too low.
- **Included:** the software + a fair-use allowance for WhatsApp & calling.
- **Billed at actuals, pass-through, no markup:** WhatsApp Business API, cloud telephony, portal sync, hosting-linked usage. (Put the "heavy volume billed as used" line in writing.)
- **Referral / launch-partner terms:** referrals who sign *and pay* waive part of his *renewal* (not year one — take this year's cash). Framed as launch partner, not discount case.

**One-liner that lands:** *"A 5-agent Sell.Do setup is ₹7,500–15,000/month and carries their brand. You're at or under that, white-labeled as yours, with the WhatsApp moment they don't have."*

---

## 7. After the room

- Send a **one-page recap**: what he saw, what's included, the founding rate, next steps + timeline.
- Confirm the **go-live date** you committed to.
- If he's in, the first real task is **data import** (his Excel) + **connecting his WhatsApp/telephony accounts**.

---

*Prototype state as of build: no backend (in-memory, resets on refresh), staged integrations, mobile + desktop both working, all core flows demoable. Run `npm run dev` → localhost:5173. Agent phone view: append `?role=agent&demo=1`.*
