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
  one **Copy**: the text, ending in the link.
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

## 5b. Keeping links under control

**The worry (user, 12 Oct):** every send and copy makes a link; links pile up in
chats and groups carrying the firm's data, with no way to take them back.

**The answer is not a screen of links.** Nobody non-technical manages a list of
codes. Control sits on the things people already think in — a flat, a buyer,
the whole firm — and the links follow.

1. **Fewer links in the first place.** The same agent copying the same flat gets
   the **same link** every time; the same agent sending the same flats to the
   same lead gets the same link. A link is (agent, flats, lead), not one per
   press.
2. **A link holds nothing.** It is a key to a row; the page reads the flat as it
   is *now*. Photos, area, BHK — never price (until decided), flat number,
   owner, or the buyer's name. So a link "out there" exposes only what the
   firm would show anyway, and changes the moment the listing does.
3. **A link ends by itself.** 30 days after it was last sent or copied (sending
   again restarts it). An expired link shows the firm's name and *Talk to us*,
   no flats. The firm's own catalogue address never expires.
4. **The flat closes its links.** Let, sold, removed, or **Stop sharing** on the
   listing: every link that carries it shows "This home is no longer
   available" for that flat. Stop sharing replaces today's *Turn off photo
   link*, in the same place, with what it affects: *Shared 12 times · 9 links
   open*.
5. **The buyer closes theirs.** A lead marked Rejected or Deal Closed: links sent
   to them show *Talk to us* only.
6. **A person leaving does not orphan anything.** A suspended or removed agent's
   links keep working; *Talk to us* goes to the lead's holder, else the firm's
   contact person.
7. **The owner has one switch for everything.** Settings → Sharing: *142 links
   open · Close all shared links* — for a leak, or the day the firm stops.
   Owner only, confirmed, recorded in the ledger. Links made afterwards work.

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
- **Link life:** 30 days from the last send, or longer for sale listings?
- **The firm's working hours** for *Book a visit* do not exist as a setting yet;
  one is needed (default 10:00–19:00).

Decided 12 Oct: no flat name in a link (`/bhumi/k7m2qx` only); visits only in
the firm's working hours.
