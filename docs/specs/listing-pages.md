# Listing pages — sending flats, and the firm's catalogue

**Status:** 🧭 ideation, 12 Oct — nothing built. Replaces `gallery-enquiry.md`
(8 Oct), whose reasoning is folded in below.

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

1. **Every share knows who it went to.** A link with no recipient is the
   problem, not a variant. A listing is not "shared"; it is *sent to a lead*.
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

### Two verbs, everywhere

| | **Send** | **Post** |
|---|---|---|
| For | one buyer | anyone (status, groups, Instagram) |
| Always knows | the agent **and the lead** | the agent |
| Carries | one or several flats | one public flat, or the whole catalogue |
| A tap goes to | the sender, about this lead | the sender; the enquiry becomes a new lead for them |

There is no third kind. "Nobody's link" is gone: the firm's own catalogue
address (`/bhumi/homes`, §5) is the only link without a sender, and it is the
owner's, used where the firm speaks as itself.

### Send: from the lead, with several flats

The lead's **flats section** (shortlisted first, then matches) gets a tick per
row and one button: **Send 3 on WhatsApp**. The composer opens with those flats
and one link. A single row's **Share** is the same thing with one tick.

- **From a property** (entry points 3–4): **Send** → pick the buyer. "Continue
  without a recipient" becomes **"To a number"**: type it, it finds the person
  (`findLeadByPhone`) or creates them. Every send has a lead.
- **Copy photo link / Copy listing details** (5–6) go. Their real use — posting
  to a status or a brokers' group — is **Post**.
- **What it records:** one *send* row — lead, agent, flats, code, when — and
  each flat lands in the lead's `lead_shortlist` as **sent** (attached, if it
  was not already). The timeline line says "Sent 3 flats" from data, not text.

### Post: from a public listing, or the catalogue

On a listing marked public, and on the catalogue: **Post** copies (or opens the
phone's share sheet with) the agent's own link. Enquiries from it create a lead
for that agent, source **Catalogue**, with the flat attached.

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
- **The one word before a code** (`/bhumi/pride-world-city/k7m2qx`) for a
  one-flat send: readable in a chat, ignored on lookup. Keep or drop.
- **"Book a visit" slots:** any day/time the buyer picks, or the firm's hours?
- **Catalogue order:** newest first, or by area?
