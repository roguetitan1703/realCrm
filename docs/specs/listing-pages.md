# Listing pages — sending flats, and the firm's catalogue

**Status:** reopened 19 Oct by Om with a new model (§A). Nothing built. §A is
the design; §0–§8 below are the 12–13 Oct thinking, kept for its reasoning and
superseded wherever §A says otherwise (notably: one page per buyer is replaced
by a link per send with an expiry).

## A. The model (Om, 19 Oct)

**Two catalogues.**

- **Public catalogue.** Every flat with **Show in catalogue** on (ticked one by
  one, or as a bulk action on the Properties list) and status Available. One
  page per firm, which can also be **embedded** in the firm's own website. It
  never expires. Each flat has a call to action; a form (name, number) makes a
  lead, source **Catalogue**, routed like a portal lead.
- **Shared links.** A link is **a custom view plus, optionally, a buyer.** An
  agent picks flats in one of these ways:
  - from a lead's shortlist: one, some or all of them;
  - from the full Properties page: filter or tick the flats, then **Send**.

  The agent then either picks the recipient, or presses **Continue without a
  recipient**.
  - **To a buyer (Rahul):** the link is bound to Rahul's lead. A tap on
    Interested shows on Rahul's lead and in the agent's notifications: "Rahul is
    interested in Pride World City 2 BHK · from the link sent 14 Oct".
  - **Without a recipient:** the link carries only its creator. Taps go to that
    agent.
  - A shared link may include flats that are not in the public catalogue, when
    it goes to a named buyer. That is the agent's call.

**No link management.** Sending again makes a new link. Every link expires
after the firm's setting — **7, 15 or 30 days**, no "never" — fixed at
creation. Each person can see the links they created, and turn one off (turning
off and deleting are the same thing). That list is nested (under Me), never in
the main navigation.

**Call to action on every flat.** **I'm interested** opens WhatsApp to the
right number, prefilled with the flat ("Hi, I'm interested in the 2 BHK at Pride
World City · ref k7m2qx"). The tap is recorded before WhatsApp opens. When the
WhatsApp integration exists, the same button reaches the firm's WhatsApp number
or bot instead; nothing else changes.

**Prices.** Public catalogue: a firm setting, **Show prices on catalogue**.
Shared link: a tick when creating it, defaulting to the firm setting. Still to
do: look at how other public catalogues handle price (the first search,
19 Oct, found nothing usable).

**Never on any page:** flat number, the owner's name or number, internal notes,
key details (`NEVER_SHARED_FIELDS`).

### A.1 Cases, from each side

| Who | What happens | Proposed answer |
|---|---|---|
| Buyer | Rahul forwards his link to his brother, who taps Interested | Recorded as from Rahul's link ("someone on Rahul's link"); the WhatsApp message arrives from the brother's own number, so the agent sees who it really is |
| Buyer | Opens the link after it expired | Not a dead end: the firm's name, **Talk to us** (WhatsApp to the agent), and the public catalogue |
| Buyer | A flat in the link was let after sending | Shown greyed as **Taken**; the rest still work |
| Buyer | Taps Interested five times | One notification per flat per link per day |
| Agent | Rahul's lead moves to Priya | Taps and the WhatsApp button go to the lead's **current holder**, worked out when the link is opened |
| Agent | Sender suspended or left; link had no recipient | Goes to the firm's **reply-to number** (a new setting) |
| Agent | Has no phone number on file | Same fallback. bhumi has 4 of 8 agents with no phone; fix that data before launch |
| Agent | Wants to keep a hot buyer's link alive | Sends a new link. Nothing to extend |
| Agent | A link without a recipient, containing private flats | Not allowed: a link with no buyer shows public flats only, because it can reach anyone |
| Lead | Rahul's lead is rejected, then he taps Interested | Works until expiry; the alert says he was rejected. A rejected buyer coming back is worth knowing |
| Lead | Merged into another lead | The link follows the surviving lead |
| Lead | Deleted | The link turns off |
| Owner | Changes expiry from 30 to 7 days | New links only. Existing links keep the expiry they were made with |
| Owner | A link leaks to a competitor | Owner can turn off every link at once (Settings), owner only, recorded |
| Owner | A ticked flat is let, then comes back | Leaves the catalogue while not Available; returns by itself, the tick stays |
| Owner | Bulk-ticks 40 flats, 25 with no photos | Proposed: the bulk action says "25 have no photos" and ticks them anyway; the catalogue shows them last |
| Owner | Does not want the building named publicly (buyers going direct to the society) | Open: a firm setting to show locality only instead of the project name |
| Public | The same person fills the catalogue form twice, or is already a lead | Existing rule: matched by phone, becomes a repeat enquiry on the existing lead |
| Public | Bots fill the form | Rate limit and a hidden field; phone number required |
| Delpat | Someone guesses link codes | Random codes, rate-limited lookups (§5) |
| Delpat | WhatsApp's preview fetch counts as an open | Preview fetchers are not counted; the firm's own staff opening a link are not counted |
| Delpat | Today's photo links already sent to buyers | Open: redirect each to the flat's public page if it is in the catalogue, else "no longer available" plus the catalogue. Private flats' old links stop showing photos |

**An expired link is a signal, not a dead end** (Om, 19 Oct). Talk to us on an
expired link tells the lead's current holder ("Rahul opened an expired link")
with one tap to **Send a fresh link**: the same flats, minus any taken.

### A.1b What every page records (Om, 19 Oct; proposals marked)

Applies to all of them: the public catalogue, shared links, and a one-flat
share (which is a shared link with one flat).

| Record | How | Notes |
|---|---|---|
| **Views** | Each open of a link or the catalogue, with the flat(s) opened | Firm staff and WhatsApp's preview fetch are not counted (§4) |
| **Device** | A first-party ID kept in the visitor's browser for this firm's pages. No fingerprinting | Recognises the same browser coming back. A different phone, another browser or cleared data is a new device. Whether a link opened from WhatsApp keeps the same browser storage on Android and iPhone must be tested before relying on it |
| **Contact** | Name and number (email optional), from a form, from a bound link's lead, or (once the WhatsApp integration exists) from the incoming message carrying the link's ref | When a device gives a number once, its earlier and later visits attach to that person |

**Who is known, and how**

- **A link sent to Rahul is Rahul.** No device ID is needed; the views go
  straight onto his lead.
- **The same link opened on a second device** probably means it was forwarded.
  Proposed: shown on the lead as "opened on another device", no alert.
- **A no-recipient link or the catalogue** is anonymous until a number arrives.
  Its views are counted per device, and attach to the person once a number
  comes from that device.

**Message first; a form only where it gives the visitor something back.**
On shared links, I'm interested always opens WhatsApp (the public catalogue uses its form, §A.1c). Proposed form cases on shared links, each asking a number:
- **Call me back**: for a visitor with no WhatsApp on that device (a desktop
  visitor to the embedded catalogue).
- **Book a visit**: a day and a slot within the firm's working hours.
- **Tell me about new homes like these**: the visitor is alerted when a matching
  flat is added. Of all the forms, this one gives the most in return for a number.

**A lead needs a number** (proposed). Views alone never create a lead: an
anonymous visitor who looked five times is still unknown, and a lead with no
way to reach them is an invented fact (CLAUDE.md §3.1). A lead is created when a
number arrives from a form, from WhatsApp (once integrated), or from the agent.
For someone already a lead, activity raises an alert under these proposed rules:
- they tap Interested;
- they open an expired link;
- they come back to their link on a new day (at most one alert a day).

No visitor accounts or sign-up. Once the WhatsApp integration exists, the
message itself is the sign-in.

**Consent.** A number and a device ID are personal data under India's DPDP Act
2023. Every page links to /privacy, and each form states what is done with the
number. Proposed: view logs are kept 180 days (`specs/data-lifecycle.md`).

### A.1c Case by case (Om, 19 Oct: "think about it in cases")

The public catalogue's call to action is **the enquiry form**: the form is how
it asks for contact, nothing else on the page does (Om). I'm interested →
WhatsApp is for shared links. A link sent to someone is that someone's.

| Case | Who sees it | How they are known | What to record | Already have | To add |
|---|---|---|---|---|---|
| **P. Public catalogue** (own page or embedded in the firm's site) | Anyone | Nobody, until the form | Views per flat; form sent | Website lead intake, duplicate-by-phone, routing, source labels | Show in catalogue + bulk; the page; embed code; form → lead (source Catalogue); price setting |
| **I1. Sent to one buyer** (one flat or several) | The buyer | The lead it was sent to | Opens, flats opened, Interested per flat, expired-link Talk to us | The lead, its shortlist (`lead_shortlist`), alert lifecycle, WhatsApp logging | Link and tap tables; send from shortlist/Properties; alerts (Interested, expired, back on a new day) |
| **I1f. …and the buyer forwards it** (family, a friend) | Several people on one link | Still the lead; the other people are unknown | Opens per device; "opened on another device" | — | Device ID (to tell devices apart) |
| **I2. Sent to a group** (broker group, society group, WhatsApp status, Instagram story) | Many, unknown | Nobody | Opens, unique devices, Interested taps per flat | — | Device ID for unique counts; the link on "My links" with its numbers |
| **I2r. …someone from the group writes on WhatsApp** | One of them | Their WhatsApp number, seen by the agent | The lead it became, credited to the link | Add lead | On Add lead, "came from" lists the agent's recent links, so the source is the link; later, automatic via the message's ref once WhatsApp is integrated |
| **I3. Sent to one person not yet a lead** (a walk-in, a contact's number) | One person | The agent knows them; the CRM does not | As I2 | — | **Attach to a lead** on the link later, which moves its history onto the lead |
| **I4. Sent to another broker** (co-broking) | The broker, then their client | Unknown | As I2 | Source "Broker" exists in lead sources | Nothing new; the agent marks the lead's source |
| **I5. Sent by a manager for an agent's lead** | The buyer | The lead | As I1 | — | Taps go to the lead's holder, not the creator (already the rule) |
| **X. Staff open their own link; WhatsApp builds a preview** | Not a buyer | — | Nothing | Per-firm session in the browser | Skip both when counting |

What this shows: device IDs matter only for **I1f, I2, I3** (telling viewers
apart). I1 needs none, and P needs none before the form. The one new idea it
surfaced is **Attach to a lead** (I3), which also gives I2r its answer.

### A.1d Getting people into leads without the WhatsApp integration (proposed, 19 Oct)

Without the integration the CRM never sees a WhatsApp message, so the number
always comes through the agent. Both flows keep that to one paste or one pick.

**A WhatsApp reply from a link becomes a lead.**
1. The buyer taps I'm interested. The CRM records the tap (link, flat, device)
   and opens WhatsApp to the agent with "…Pride World City 2 BHK · ref k7m2qx".
2. The agent gets the alert "Someone on your link is interested in Pride World
   City 2 BHK". Tapping it opens **Add as lead** with the link and the flat
   already attached.
3. The only thing the agent provides is the number: **Paste** (copied from the
   WhatsApp chat), or **Pick from contacts** on Android (Contact Picker; iPhone
   has none, so paste there).
4. The number is matched like every lead. If it is already the agent's lead,
   the tap goes onto it as "came back". If it is someone else's lead, it is not
   duplicated: that agent is told.
5. With no alert to start from (the buyer deleted the prefilled text), Add lead
   offers "Came from" with the agent's recent links.

Once the integration exists, step 3 disappears: the message arrives with its
ref and number, and attaches by itself.

**Sending to someone who is not a lead creates the lead.**
In Send, the recipient box searches leads and also takes **a new person**: name
and number, typed or picked from contacts. Sending creates the lead assigned to
the agent, binds the link to it, puts the sent flats on its shortlist, and opens
WhatsApp straight to that number (as WhatsApp from a lead does today). The
requirement is left empty, not guessed from the flats (CLAUDE.md §3.1); the
shortlist already drives matching. A number that is already a lead is matched,
as above.

### A.2 Needs that do not exist yet

- A link table (code, creator, lead or none, flat ids, show price, created,
  expires, turned off) and a tap table (link, flat, kind, at).
- **Show in catalogue** per flat, with the bulk action; **Send** as a bulk
  action on Properties (today the selection can only duplicate).
- Firm settings: link expiry (7/15/30), show prices on catalogue, reply-to
  number, and possibly project name on catalogue.
- An embed snippet for the firm's website, and the standalone page
  `/<firm>/homes`.
- Agents' phone numbers on file.

### A.3 Order

1. Shared links from a lead and from Properties, with I'm interested landing on
   the lead and in notifications; "My links" under Me; expiry setting.
2. Show in catalogue with bulk action, the public page, the form, the embed
   code, the price setting.

## 0. Where the thinking got to (12 Oct, last) — superseded by §A

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
