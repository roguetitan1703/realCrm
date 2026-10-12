# Bhumi Propcity — Demo Script

Seven beats, tap by tap. Order matters: **wow first, fear in the middle, "he understands my mess" at the end.**
Total run time ~8 minutes. Every beat below has been walked end-to-end against the live database.

---

## Before you walk in (5 minutes)

```bash
# 1. API is alive
curl https://<your-api-domain>/health

# 2. Reset to the exact demo state (3 agents / 8 properties / 12 leads)
curl -X POST -H "X-Tenant-ID: bhumi-propcity" https://<your-api-domain>/api/v1/workspace/reset
```

Then open the app and confirm **three things on screen**:

| Check | Where | Expected |
|---|---|---|
| No red badge in the top bar | Anywhere | If you see **"Offline — not saving"**, stop and fix the API. Nothing will persist. |
| Amit Deshpande is the top lead | Leads | "2 min ago", 99acres, **Unassigned** |
| Rohan Kulkarni shows **5 open** | Team | The reassign beat needs this number |

Log in as **Rakesh Sethi (Owner/Admin)**. Reset again between run-throughs.

> **Say "your workspace", never "prototype" or "demo data."** It's a live Postgres database on your own domain. If he asks — yes, it saves; prove it with the refresh in Beat 3.

---

## BEAT 1 — The WhatsApp moment *(the wow — lead with this)*

**Why it lands:** this is his single biggest daily grind — typing property details into WhatsApp a hundred times.

1. **Properties** (left nav)
2. Click the **Kolte Patil Life Republic** card showing **₹76 Lakh**
3. Click **WhatsApp** (green, top right of the record header)
4. The recipient picker opens — click **Farhan Shaikh** (tagged `BEST FIT`)
5. The message appears **instantly**, fully written, in Hinglish
6. Tap **Marathi** in the Language switch → the whole message re-writes in Marathi
7. Tap **Open in WhatsApp** → **real WhatsApp opens with the message already typed**

**What to say:**
> "Pick the flat. It writes the message from the flat's own details — price, carpet, floor, everything. Your client speaks Marathi? One tap. And it goes straight into WhatsApp, ready to send."

**Do NOT say "AI".** It fills a template from his data — that's the honest claim, and it's the one that survives scrutiny. The line under the preview says so on screen.

**Point at this:** the message never contains the unit number. That's deliberate — sets up Beat 7.

---

## BEAT 2 — A lead arrives *(the daily flow begins)*

1. **Leads** (left nav)
2. Top row: **Amit Deshpande — 2 min ago — 99acres — Unassigned**
3. Click it

**What to say:**
> "This came in from 99acres two minutes ago while we were talking. Nobody has touched it yet."

---

## BEAT 3 — Assign, match, prove it's real

1. On Amit's record, the rail already reads **"Share a match — Kolte Patil Life Republic"**
2. Scroll to **Matched & shortlisted inventory** — two units auto-matched at **75%**:
   `R10-1204 · ₹1.12 Cr` and `R10-803 · ₹98 Lakh`
3. Click **Edit** → set **Assigned Owner** → Save (or use **⋯ More actions → Reassign owner**)
4. **Hard-refresh the browser (Ctrl+R).** The assignment is still there.

**What to say:**
> "It already knows which of your flats fit his budget and area — I didn't tell it anything. And that refresh? This is a real database. Close your laptop, open it tomorrow, it's all here."

**The refresh is the trust beat.** Don't skip it — it separates you from every slideshow he's been shown.

---

## BEAT 4 — An unmissable follow-up

1. Still on the lead → rail → **Schedule appointment**
2. Pick a time → Save
3. Go to **Dashboard** → the **Overdue follow-ups** tile is clickable → click it
4. It drills straight into the filtered list

**What to say:**
> "Nothing falls through. Anything past its time turns red — on his phone too, first thing in the morning."

---

## BEAT 5 — Move the deal forward

1. Open any lead in **Negotiation** (e.g. **Prasad Kelkar**)
2. Click a stage node in the journey stepper (New → Contacted → Visit → Nego → Won)
3. The stage advances and the timeline logs it

**What to say:**
> "Your whole pipeline, one line per client. You always know who's where."

---

## BEAT 6 — The gut-punch *(the fear)*

**This is the beat that sells the product.** Slow down here.

1. **Team** (left nav)
2. Point at **Rohan Kulkarni — 5 open**
3. Ask him: *"What happens today if Rohan quits on Monday morning?"* — let him answer
4. Click **Reassign** on Rohan's row
5. Pick another agent → confirm
6. Rohan's load drops to **0**; the other agent absorbs all five. Nothing lost.
7. Click the duty toggle to take Rohan **off duty** — he stops receiving new leads immediately

**What to say:**
> "Five clients. One tap. They're already with someone else, with the full history — every call, every visit, every note. He walks out with nothing."

---

## BEAT 7 — Unit-level inventory *(the close — "he understands my mess")*

1. **Properties** → click **Group by project**
2. **Kolte Patil Life Republic** shows as one project — **3 units**
3. Open it → three flats in **Wing R10**, side by side:

| Unit | Config | Price | Owner |
|---|---|---|---|
| R10-402 | 2 BHK | ₹76 Lakh | Sneha Rane |
| R10-803 | 3 BHK | ₹98 Lakh | Sanjay Patwardhan |
| R10-1204 | 3 BHK | ₹1.12 Cr | Milind Joshi |

4. Remind him: **the client message from Beat 1 never showed the unit number.**

**What to say:**
> "Same society, three flats, three different owners, three different prices. You know which is which. Your client only sees the society and the price — the flat number stays with you."

**Then stop talking.** This is the closing line.

---

## If he asks

| He asks | Answer |
|---|---|
| "Does it write the message itself / is it AI?" | "It fills your message from the flat's details. Same format every time, in three languages. No guessing, nothing invented." |
| "Can I add my own stages?" | Yes — Settings → Pipeline. Rename one live and show every lead move with it. |
| "Does it work on my phone?" | Open it on his phone. Today screen shows overdue in red with a call button under the thumb. |
| "Can I bulk-load my inventory?" | Properties → **Add units** (a whole tower at once) or **Import** (CSV, with dedupe and undo). |
| "What about WhatsApp Business API?" | On the roadmap under **What's next** — needs Meta approval per account. Don't promise it as live. |
| "Who can see what?" | Agents see only their own pipeline. Owner sees everything. Switch role from the profile menu to show it. |

---

## Don'ts

- **Don't say "AI"** anywhere near the WhatsApp feature.
- **Don't demo Integrations or Roadmap** unless he asks — they describe what's next, not what's live today.
- **Don't refresh mid-beat** except the deliberate one in Beat 3.
- **Don't add a property live** unless you've rehearsed it — stick to the seeded inventory.
- **Don't apologise for anything being "just a demo."** It's his workspace.

---

## Pre-seeded state each beat depends on

| Beat | Requires | Seeded as |
|---|---|---|
| 1 | A unit with a full detail set + a matched buyer | `p8` R10-402 ₹76 L + lead **Farhan Shaikh** (best fit) |
| 2 | A brand-new unassigned portal lead | `l0` **Amit Deshpande**, 2 min, 99acres, `agentId: null` |
| 3 | That lead must match real inventory | His req (3 BHK, Marunji/Hinjewadi, ₹95 L–1.15 Cr) matches `p4` + `p7` |
| 4 | An overdue + a today follow-up on the demo user | `l3` Siddharth Mehta (overdue, 11:00 am), `l1` Vikramaditya (Today 4:30 pm) |
| 5 | A lead mid-pipeline | `l9` **Prasad Kelkar** — Negotiation |
| 6 | An agent with a pipeline worth saving | `a3` **Rohan Kulkarni** — 5 open leads |
| 7 | One society, several units, several owners | `p4` / `p7` / `p8` — Kolte Patil R10, ₹76 L / ₹98 L / ₹1.12 Cr |

Changing the seed can break a beat. If you edit `src/data/defaultDataset.js`, re-check this table.
