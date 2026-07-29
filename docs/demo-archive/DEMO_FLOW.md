# Bhumi Propcity CRM — Client Demo Flow

**Product:** Nivaas (white-label platform) · **Their workspace:** Bhumi Propcity

---

## Before they arrive (2 min)

```bash
# Terminal 1 — backend (live Supabase)
npm run dev:backend

# Terminal 2 — frontend
npm run dev            # → http://localhost:5173
```

**Reset to clean demo data** (do this right before they walk in):
- In-app: profile menu (top-right) → **Reset demo data**, or
- `curl -X POST -H "X-Tenant-ID:bhumi-propcity" http://localhost:5000/api/v1/workspace/reset`

Expect: **3 agents · 6 properties · 8 leads**. Log in on the sign-in screen (any number → OTP screen → verify).

**Have ready:** browser at 100% zoom, full screen, no other tabs.

---

## The flow (8 steps, ~10 min)

### 1. Dashboard — "your Tuesday morning"
Land here. Point at the KPI row: **Overdue · Unassigned · New today · Site visits**.
> "This is the job — not vanity revenue charts. Every tile is clickable."

Click **New today** → drills into the filtered lead list. Come back.
Show **Pipeline by stage** + **Agent performance** (who's actually working).

### 2. Leads list — the daily worklist
Point at the header stats (8 Total · Overdue · Unassigned).
Demo the toolbar — this is the standard on every module:
- Type in **Search** → instant filter
- **+ Filter** → pick *Locality* → note the **searchable list with checkboxes**
- **Sort** → clean menu, Ascending/Descending
- **Grid / List** toggle (top-right of toolbar)

### 3. Lead record — "everything about this person, one screen"
Click any lead (e.g. **Rajeshwar Iyer**).
> "Zoho-style record — all the fields, clean, no clutter."

Point out:
- **Overview / Details** — every field, read-only, scannable
- **Next Best Action** card (top-right) — the one thing to do now
- **Quick actions** — Contact · WhatsApp · Add note · Schedule
- **"⋯ More actions"** — everything else lives here
> "That's the design rule: the 4 things you do all day are one click; the rest never clutter the screen. Add a 20th action later — it still looks like this."

### 4. Edit — one way, no confusion
Click **Edit** (header) → full form opens → change something → **Save changes**.
> "One edit button. No hunting for pencils."

### 5. ⭐ The WhatsApp generator — the signature moment
In **Matched & shortlisted inventory**, click **Share Match**.
Watch the compose animation → message appears.
Toggle **Hinglish / English / Marathi** and **Short / Standard**.
> "Your agent sends this in 3 seconds instead of typing it. Templates, not AI — predictable, on-brand, every time."

### 6. Properties — inventory that reflects reality
Go to **Properties**. Show the **card grid** → toggle to **list**.
Open **Godrej Elements**:
- Same record layout as Leads (**one standard, every module**)
- **Other units in this project** — "3 flats, 3 prices, one project — no more WhatsApp-group chaos"
- **Interested buyers** — matched automatically
- **Listing history** — proof of work for the owner

### 7. Team — the attrition answer
Go to **Team**. Point at an agent → **Reassign all leads**.
> "Agent quits Friday. Monday their whole pipeline is with someone else — one click. No lost clients."

### 8. Settings — the white-label close
Go to **Settings**.
- Change **Firm name** → Save
- **Rename a stage** (e.g. "Negotiation" → "Token pending") → *every lead moves with it*
- **Add a lead source** (e.g. Housing.com)
> "This is your CRM, your vocabulary, your data. Not a generic tool you bend to."

---

## The close

> "Everything you just saw is live — real database, real records. Any change survives a refresh."

**Prove it:** make an edit → hard-refresh the browser → it's still there.

---

## Q&A — ready answers

| They ask | You say |
|---|---|
| "Is the WhatsApp AI?" | "No — smart templates. Predictable and on-brand every time. Nothing weird ever goes to your client." |
| "Can we import our Excel?" | "Yes — Import screen. Column mapping is staged for your data; we wire it to your actual sheet at onboarding." |
| "Can we add our own fields/modules?" | "Yes. Every module is config-driven — a field or a whole module is a config change, not a rebuild." |
| "Co-brokerage / party splits?" | "Not in v1 — it's on the roadmap. Let's talk about how you handle it today." |
| "Does it work on phone?" | "Yes — the agent view is built for the field. (Profile menu → Switch to agent app.)" |
| "Who else uses it?" | "You'd be the first on this build — which is why you get to shape it. Roadmap screen shows what's next." |

---

## Don'ts

- Don't open **Roadmap / Integrations** unless asked — they're forward-looking, not live.
- Don't promise co-brokerage, real CSV parsing, or live telephony — those are post-sale.
- If a follow-up date looks off in Calendar, don't dwell — seed data, not a bug.

---

## Safety net

- Something looks wrong? **Reset demo data** (profile menu) → back to clean state in 2 seconds.
- Backend not responding? The app still renders from local data — the demo continues. (Persistence just won't survive a refresh.)
