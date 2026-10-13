# Listing pages — sending flats, and the firm's catalogue

**Status:** 🅿️ **parked 13 Oct**, mid-ideation — nothing built. The latest model is
§0; sections below it are the steps that led there and are partly superseded. Replaces `gallery-enquiry.md`
(8 Oct), whose reasoning is folded in below.

## 0. Where the thinking got to (12 Oct, last) — read this first

The per-send link (§3–5b) was wrong at the root: ten sends gave one buyer ten
links, and nobody knew which was current. Each fix to it (reuse, expiry,
switches) patched that. The user's test case broke it: *I sent a buyer 10 flats,
then the lead flips — what can I do, and where do I see it?*

**One page per buyer.** Each lead has ONE page, "Rahul's homes", and one link.
The flats attached to the lead (the shortlist that already exists) **are** that
page: what is on the lead is exactly what the buyer sees.

```
Rahul's homes                                   [ Send on WhatsApp ]
Link sent 12 Oct · opened yesterday 9:40 pm
  Pride World City · 2 BHK      Interested            [ Book visit ]
  Lakeview · 2 BHK              Not for me · budget
  Green Park · 3 BHK            Taken                 [ Remove ]
  … 6 more                      Not opened yet
  + Add homes          (the matches list already on the lead)
```

| Case | What happens |
|---|---|
| Send 10 flats | Tick them, Send on WhatsApp: one link, ten rows marked *Not opened yet* |
| Buyer acts | Rows read Opened / Interested / Not for me (why); alert only on Interested or Book a visit |
| Requirement flips | Edit the requirement as today; remove what no longer fits, add new; Send again — **same link**, "I've updated your homes" |
| A flat is let | *Taken* on both sides, greyed; remove or leave it |
| Buyer goes quiet | Nothing; last opened is shown |
| Lead closed | Page shows *Talk to us* only; reopening the lead reopens it |
| Lead reassigned | *Talk to us* goes to the **current holder** (changes the earlier "to the sender" rule — unconfirmed) |
| Sent to a wrong number | **Stop sharing** on the lead: the link dies; the next send makes a new one |
| "Send the catalogue" | The page ends with *See all our homes*; enquiries from there still land on this lead |

**Copy** (groups, status) is separate: public flats only, carries the agent,
governed by the flat's Public switch (§5b).

**Open when this is picked up:** what the user meant by "flips" (taken as:
requirement changes, goes cold, drops out, reassigned); the reassignment rule;
price (the owner's call); catalogue order (proposed: by area, newest first);
firm working hours as a setting (for Book a visit).

---

**Who it is for.**
- **The agent, on a phone, from a lead:** send this buyer the flats that fit, in
  one message, and hear back which one they want.
- **The buyer, on a phone, from WhatsApp:** look, and say "this one" or "not
  for me" in one tap, to the person who sent it.
- **The owner, at a desk:** one link for the firm's status, Instagram and
  Google that brings enquiries the firm does not pay a portal for; and which
  agents' sends turn into conversations.

---

## 1. What the user has decided (12 Oct)

1. **Every share knows who sent it, and to whom when there is a whom.** A
   description copied for a group has no lead, and that is allowed; it still
   carries the agent.
2. **Four agents sending one flat to four leads is four sends**, each its own,
   each answering to its own agent. Nothing collides, nothing is reassigned.
3. **A tap goes to the agent who sent it.** An agent can only send to their own
   leads, so the sender is the holder at the time. If the sender has left: the
   lead's current holder; if none, the firm's reply-to person.
4. **Agents are not technical.** No "manage your shared links" screen. A link
   is a side effect of sending, and lives on the lead.
5. **Fewer options.** "One flat, three flats, the whole catalogue, nobody's
   link…" is too many choices. Merge.
6. **Existing photo links are redirected, not kept alive** as a second system.
7. **No agent name on the page.** A sticky "Talk to us" (phone) / side panel
   (desk) routes to the sender without naming them.
8. **A listing is in the public catalogue only when marked:** "Show in
   catalogue" / "Remove from catalogue" per listing.
9. **Catalogue enquiries become real leads.**
10. **Price:** waiting on the owner. Off the page until they answer.

## 2. What exists (code, 12 Oct; production read-only, last 30 days)

Every client-facing share today is **one listing per message**. There is no
multi-listing send anywhere — attaching several flats to a lead is agent-side
bookkeeping, and the Properties list's multi-select only duplicates.

| # | Entry point | Lead known | What is recorded |
|---|---|---|---|
| 1 | Lead → WhatsApp (one flat chosen inside the composer) | yes | a `whatsapp` event whose text names the flat; no listing id |
| 2 | Lead → "Shortlisted and matching flats" → **Share** per row | yes | same |
| 3 | Property → "Interested buyers" → **Share** per buyer | yes | same |
| 4 | Property → **Share** → pick a buyer, or **Continue without a recipient** | only if picked | nothing without one |
| 5 | Property → **Copy photo link** | no | nothing |
| 6 | Property → More → **Copy listing details** | no | nothing |

The photo link (`/<firm>/photos/<project>-<12-char HMAC>`) is one per listing,
shared by everyone, stores nothing, and counts nothing.

| | bhumi | mahalaxmi |
|---|---|---|
| Available listings | 72 (36 sale, 36 rent) | 21 (all rent) |
| …with photos | **32** | **5** |
| Added in 30 days | 69 | 24 |
| Listings sent to leads from the composer | **59 to 29 leads** | 1 |
| `lead_shortlist` rows, all time | 17 | 2 |
| New leads, 30 days | 283, all portals | 372, portals (1 from its website) |

Lead ↔ listing already has one table, `lead_shortlist` (lead, property, verdict
`liked`/`rejected`, reason) — written by Attach and by visit feedback. It has no
notion of *sent*.

## 3. The proposal

### No new words: the buttons they already press, tracked underneath

The people using this are not technical (user, 12 Oct). They know two things:
**WhatsApp** a lead, and **Copy** a listing to paste somewhere. They will not
learn "send", "post", "share links" or "codes". So nothing new appears to press;
what changes is that both buttons now carry a link that knows who used it.

| They press | Where | What changes | Tap on the page goes to |
|---|---|---|---|
| **WhatsApp** | a lead | can tick **several flats** for one message (rows on the lead are already listed: shortlisted, then matches) | the agent, about **this lead** |
| **Share → a buyer** | a listing | as today; the buyer list stays; "Continue without a recipient" becomes **Copy** | the agent, about that lead |
| **Copy** | a listing | the description, as today, **with the agent's own link at the end** | the agent; no lead |

- **Copy stays** — it is how a listing reaches a broker group, a WhatsApp
  status, Instagram, an SMS. Copy photo link and Copy listing details become
  one **Copy**: the text, ending in the link when the flat is Public (§5b).
- **No lead is invented for a Copy.** A stranger who taps *I'm interested* on a
  copied link is put into WhatsApp with that agent, the flat named; the agent
  adds them as they do today. *Book a visit* asks a name and number, and that
  does make a lead, for that agent, source **Shared listing**.
- **Every link carries the agent**, so nothing is "nobody's" except the firm's
  own catalogue address, which the owner uses as the firm.

### The buyer's page — one page for one flat, several, or the catalogue

- One flat: the photo viewer, as today.
- Several: "Homes for you" — a card per flat, each opens the viewer.
- Catalogue: the same cards, with Sale/Rent, BHK and area filters.

On every flat: **I'm interested** (WhatsApp to the sender, flat named),
**Book a visit** (a day and a slot → a *requested* visit on the lead for the
agent to confirm), **Not for me** (one-tap reason → the lead's
`lead_shortlist` verdict — the same field visit feedback writes).

A **sticky "Talk to us"** at the bottom of the phone, a side panel on the desk:
WhatsApp and Call, to the sender, unnamed. Never price (until decided), flat
number, owner — the composer's `NEVER_SHARED_FIELDS` rule.

### What the agent and the owner see

- **On the lead:** each sent flat with its state — *sent · opened · interested
  · not for me (reason) · visit requested*. No separate links screen.
- **One alert**, "Rahul is interested in Pride World City" / "…asked for a
  visit", `now` urgency, closes when the agent contacts him
  (`specs/notifications.md`). Opens never alert.
- **On the listing:** "Sent to 6 · 2 interested · 1 visit".
- **On Performance:** flats sent and buyers who answered, per agent, over any
  range — the same activity report.
- **The owner:** catalogue leads against portal leads, and what became visits.

## 4. Tracking — what is counted, and what is not

- **A send is the unit.** Opens, taps and verdicts are counted per send, so
  they belong to one buyer and one agent.
- **An open by someone from the firm does not count** — the browser holds that
  firm's session (`crm_auth_session_<tenant>`).
- **Opens are shown, never alerted:** "opened 3 times" on the lead.
- **Not doing:** time on page, which photos, pixels, read receipts.

## 5. Addresses

**The firm, then at most one word, then one code. The code is the only key**:
six characters, lowercase letters and digits without look-alikes, pointing at
one send or post row. Nothing about the agent, the lead or the listings is
readable or editable in the address.

```
realestate.delpat.in/bhumi/k7m2qx                   a send or a post — everything an agent shares
realestate.delpat.in/bhumi/homes                    the firm's catalogue (the owner's link)
realestate.delpat.in/bhumi/homes/pride-world-city   one public listing (the owner's link)
```

- Each send gets its own WhatsApp preview: the flat's photo, or "3 homes for
  you".
- Codes are drawn so they can never equal a word the app routes on (`homes`,
  `photos`, `admin`, `pwa`, …); new route words must never be six characters.
- Lookups are rate-limited; codes are random, never sequential.
- The path after the firm does not depend on Delpat's domain, so a firm's own
  domain later changes nothing.
- **Old photo links redirect.** At deploy, each listing's current photo link
  gets one send row with no lead and no sender; `/bhumi/photos/…` answers with a
  redirect to `/bhumi/<code>`, whose buttons go to the firm's reply-to person.
  No second code path is kept.
- **A link whose flat is no longer available** (let, sold, removed from the
  catalogue) shows "This home is no longer available" and the firm's catalogue.
  Nobody has to manage it.

## 5b. What a link is, and what it shows when anything changes

The first answer here (12 Oct) was patches — reuse links, expire them after 30
days, add switches. The user took it apart: a link that is reused and whose
timer resets on every copy never expires, so the expiry did nothing, and it said
nothing about a flat that changes, a flat that is let, or a firm that no longer
wants its flats shown. Modelled instead:

### A link has no life of its own

A link is a **pointer to a promise**: *this agent showed these flats to this
buyer* (or, for a Copy, *to whoever reads this*). It stores who, to whom, which
flats, when, and **what the flats looked like when sent** (for the lead's
history). It never stores a page. Every time it is opened, the page is worked
out **from the state of four things at that moment**, and from nothing else:

| Thing | Its states that matter |
|---|---|
| **Each flat** | available · not available (let, sold, held, withdrawn, deleted) · public or not · its details |
| **The buyer** (a send) | open · closed (rejected, deal closed) · merged · deleted |
| **The sender** | active · gone (suspended, removed) |
| **The firm** | active · sharing stopped |

So there is nothing to expire and nothing to clean up. A link is exactly as
alive as the things it points at, and the firm controls those already.

### Every case

| What happens | What anyone opening the link sees |
|---|---|
| A flat's details or photos change | The flat as it is now. A wrong photo fixed once is fixed in every chat it was ever sent to. The lead keeps a record of what was sent. |
| One of three sent flats is let | The two still available, and "1 home from this list has been taken". |
| All of them are let | "These homes have been taken", *Talk to us*, and the catalogue if the firm has one. |
| A flat is deleted, or merged into another | Treated as taken. |
| The buyer's lead is closed | *Talk to us* only. A closed buyer's chat should not keep selling. |
| The buyer's lead is merged | The send moves to the surviving lead. |
| The sender leaves | The page is unchanged; *Talk to us* goes to the lead's holder, else the firm's contact person. |
| A Copy of a flat that is not public | **There is no link in it** — see below. |
| A public flat is made private | Every Copy link of it shows "This home is no longer available". Sends to named buyers are unaffected. |
| The firm stops sharing | Every link shows the firm's name and *Talk to us*, nothing else. |
| The same agent copies the same flat again | The same link. There is never a reason for two. |

### The rule that removes the "links everywhere" problem

**Who can see a flat is a property of the flat, not of the link.**

- **Sending to a named buyer** (WhatsApp from a lead) is the agent's judgement,
  as it is today: any available flat.
- **A Copy goes to people nobody can name** — a group, a status. That is
  *public*. So a Copy carries a link **only if the flat is marked Public**; for
  any other flat, Copy gives the description text alone, as it does today.
- **Public** is the same mark as "in the catalogue". One question per flat —
  *may people outside the firm see this?* — answered once, by the firm.

The text an agent pastes can never be recalled; that is true today and stays
true. The **link** is the firm's window, and the firm decides what is in it.

### Where control lives — on things people already understand

| Who | Where | What they can do |
|---|---|---|
| Anyone who edits a flat | The flat | **Public** on/off. Its status (Available / Let / …), as today. "Sent to 6 buyers · copied 4 times", opening the buyers it went to and how each answered. |
| The lead's agent | The lead | The flats sent, each with what the buyer did. **Stop showing** on a send made by mistake (rare, in the row's menu). |
| The owner | Settings | **Stop all sharing** — for a leak, or the day the firm leaves. Confirmed, owner only, in the ledger. |

No list of links exists anywhere, because nothing about a link is decided
separately from the flat, the buyer, the sender or the firm.

## 6. What it needs that does not exist

- A **send** table (code, kind send/post, tenant, agent, lead or null, listing
  ids, created) and a **response** table (send, listing, kind: open / interested
  / visit request / not for me, reason, at).
- `lead_shortlist` learns **sent** (first sent at, by whom).
- A **reply-to person** per firm (Settings), and phone numbers for agents —
  bhumi has 3 of 7 agents and its owner with none on file (8 Oct).
- **Public** flag and a readable slug per listing.
- The composer carrying **several** flats and one link.

## 7. Order

1. **Send records + multi-flat send from the lead.** The composer takes ticks;
   every send is a row; old photo links redirect. Run two weeks: how many sends,
   how many flats per send, how many from a property vs a lead.
2. **The buyer's buttons** and the sticky "Talk to us"; responses on the lead;
   the one alert.
3. **Public flag, Post, and the catalogue** at `/bhumi/homes`.
4. **The owner's numbers:** catalogue vs portal leads; per-agent sends and
   answers on Performance.

## 8. Open

- **Price** — the owner's call (§1.10).
- **Catalogue order** — proposal: grouped by area, areas with most homes
  first, newest first inside each. Not nearest-first: it needs the buyer's
  location, and people browse the area they want, not the one they stand in.
- **Copy of a private flat gives text without a link** (§5b): agents who post
  non-catalogue flats in broker groups lose the photo link there. Accept, or
  allow a link on any flat and rely on Stop showing? Recommended: accept.
- **The firm's working hours** for *Book a visit* do not exist as a setting yet;
  one is needed (default 10:00–19:00).

Decided 12 Oct: no flat name in a link (`/bhumi/k7m2qx` only); visits only in
the firm's working hours.
