# The photo link's "I'm interested" — who answers, and what the page may tell us

**Status:** 🧭 thinking — nothing here is decided or built. Written 2026-10-08
so the reasoning is not lost while the idea waits.

> One sentence: the photo page is the only screen a buyer ever sees, and today
> it is a dead end — a buyer who likes the flat has to go back to the chat and
> work out who sent it.

---

## 1. Who it is for

| Person | Where | What they want |
|---|---|---|
| **The buyer** | Phone, opened from WhatsApp | Say "I want this one" in one tap, to a person |
| **The agent** | Phone, between calls | Hear about it, knowing *which* buyer and *which* flat |
| **The owner / manager** | Desk | Know which listings draw interest, and whose shares turn into conversations |

A tap the agent cannot tie to a buyer and a flat is a message they cannot act
on. That is the whole problem.

---

## 2. What exists today (measured 2026-10-08, production, read-only)

**How a listing leaves the app.** Three ways, all from a signed-in person:

| Exit | Knows the agent | Knows the buyer | Recorded? |
|---|---|---|---|
| WhatsApp composer, from a lead (Share match / shortlist) | yes | **yes** | Timeline note "Sent *X* details on WhatsApp" — text only, no listing id |
| *Copy listing details* on a listing | yes | no | no |
| *Copy photo link* on a listing | yes | no | no |

**The link itself** is one per listing, signed (an HMAC over firm + listing +
version, `services/gallery.ts`), and stores nothing. Every agent who shares a
listing shares the same address.

| | bhumi | mahalaxmi |
|---|---|---|
| Listings | 71 | 24 |
| Listings with a photo link | 31 | 7 |
| Composer sends naming a listing, last 30 days | **53** (to 33 leads, 59 all-time) | 1 |
| All WhatsApp events, last 30 days | 393 | 31 |
| `lead_shortlist` rows | 14 (9 leads) | 1 |
| Agents with a phone number on file | **4 of 7** (owner: 0 of 1) | 4 of 4 (owner: 1 of 1) |

What those numbers say:

- **Lead ↔ listing is many-to-many, and mostly unrecorded.** The shortlist is
  barely used (14 rows). The real relation is "sent to", and it lives only in
  timeline text — 53 sends in 30 days that no query can join on. The 59 is a
  floor: an agent can overwrite the note.
- **How many photo links go out by *Copy* is unknown.** Nothing records it.
- **A button needs a number to send to, and bhumi's owner has none.** Three of
  seven agents have none either.

Related: `activities` already has a `property_id` reference column (owned by
the lead, "the property record must never accumulate activity of its own" —
`db.ts`). `enquiries.md` argues a person is not an enquiry; a tap on this page
*is* an enquiry, so whatever this becomes should land in that model, not beside
it.

---

## 3. The hard part: who should the message go to?

### Options

**A. One reply-to person per firm.** Simplest. Every tap from every link goes
to them. They forward by hand, and the agent who did the work hears late or
never. Needed regardless, as the fallback.

**B. A code per send.** When a link leaves the app, it gets a short suffix —
`/bhumi/photos/pride-world-city-2a6pg7kn3mn6/k3` — saved as a row: listing,
who sent it, to which lead (if known), how (composer / copy), when.

| How the link left | The tap goes to |
|---|---|
| Composer, to a lead | **That lead's current agent** (follows reassignment) |
| Copy photo link / copy details | The agent who copied it, if still active |
| No code (address bar, old links) | Firm reply-to person |

**C. Ask the buyer who they are.** Button → "Your number" → `findLeadByPhone()`
→ that lead's agent; unknown number → a new enquiry, routed normally. The only
option that works for a link with no code and for forwarded links. Costs a form
on a page whose whole point is no friction, and makes us a collector of numbers
from a public page (spam, consent).

### Leaning: B, with A as the fallback, C held back

B answers both of the user's objections:

- *Several agents copy the same listing* → each copy is its own code.
- *Someone does not press Copy* → there is no other way out of the app. The
  address bar of the gallery page is the only leak, and it falls to A.

### The cases B has to get right

| Case | What happens | Open? |
|---|---|---|
| Buyer forwards to family | Same code, same agent. Right: same enquiry | |
| Lead reassigned after the send | Goes to the **current** agent, not the sender | Decide: current, or sender? |
| Sender left the firm (copy, no lead) | Reply-to person | |
| Agent has no phone number | Reply-to person; Settings shows who has none | 3 of 7 at bhumi |
| Lead merged / deleted | Follow the merge; deleted → reply-to | |
| Link turned off or replaced | Dead, as today. The code does not resurrect it | |
| One buyer, three listings sent | Three codes — the message names the listing | |
| Agent opens their own link to check it | Must not count as interest (see §4) | |

**Side effect worth having:** a per-send address means every send gets a fresh
WhatsApp preview — today a link previewed once (even blank) is cached for good.
The card itself is per listing, so this costs nothing.

**Cost of B:** one table, one write per send, and every exit in §2 must ask for
a code before it composes. The composer already round-trips (`logContactAction`),
so it can carry the code back. *Copy* would need a request before the clipboard
write — and iOS refuses a clipboard write that is not inside the tap, so the
code may need to be pre-fetched when the listing opens.

---

## 4. What the page could tell us — and which of it is worth showing

The rule (`CLAUDE.md §1`): a number on a screen is something a person can act
on today. "This listing was opened 40 times" is wallpaper. "Rahul opened the
Pride World City photos three times since yesterday" is a call to make.

| Signal | Honest? | Worth showing? |
|---|---|---|
| Tapped **I'm interested** | We know the tap, **not** whether they pressed send in WhatsApp | Yes, on the lead, worded as a tap |
| Opened the page | Only for coded links. Preview fetches are not opens — they already go to the API route, not the page | On the lead's timeline, collapsed ("opened 3 times") |
| Watched the video / looked at every photo | Measurable, but reads as surveillance and nobody acts on it | Probably not |
| Anything on a link with no code | No person behind it | Only as a per-listing count for the desk, if ever |

**The agent's own opens.** The gallery has no sign-in, but the browser that
opens it may hold a session for that firm (`crm_auth_session_<tenant>`). If it
does, it is someone from the firm — don't count it.

**Notification:** only for *I'm interested* from a known lead, to that lead's
agent. Opens never notify — that is noise (`notificationCatalogue.ts` is where
it would be declared).

---

## 5. Making "sent to" a real relation (the piece under everything)

Whatever happens to the button, §2 shows the missing model: *which listings
went to which leads*. The send code in option B **is** that record. Once it
exists:

- A lead shows "Sent: Pride World City, Lakeview…" from data, not by reading
  the timeline.
- A listing shows "Sent to 6 leads, 2 tapped interested".
- The matcher can stop suggesting a flat the lead already received.

This is worth building even if the button is never built, and it should be
built first: it can be checked against the 53 sends a month that already happen.

---

## 6. Open questions

1. **Reply-to person:** chosen in Settings, or the workspace owner by default?
   (bhumi's owner has no phone on file.)
2. **Reassigned lead:** the tap goes to the current agent or to the one who sent
   the link?
3. **One button or two:** *I'm interested* (WhatsApp) alone, or with *Call*?
4. **Show the agent's name on the page** ("Talk to Siddhi")? Personal, and it
   tells the buyer who to ask for; it also puts staff names on a public page.
5. **Does a tap create anything in the CRM** — a timeline line only, or an
   enquiry in the `enquiries.md` sense?
6. **Option C ever?** Only if uncoded links turn out to be common, and we can
   only know that after B is counting.

## 7. If it is built — order

1. **Record sends** (§5): the code table, written by the composer and both
   Copy actions. Nothing visible changes. Run it for two weeks and read the
   numbers: how many sends, how many by Copy, how many to a lead.
2. **Reply-to person** in Settings + the button, routed A-only. Old and new
   links both work.
3. **Route by code** (B). The buyer's message names the listing.
4. **Page signals on the lead** (§4), and the one notification.

## 8. Not doing

- **Tracking pixels, read receipts, time-on-page.** Surveillance with no action
  attached.
- **A chat widget on the page.** The firm's conversation is on WhatsApp; a
  second inbox nobody watches is worse than none.
- **Price, flat number or owner on the page or in the message.** Same rule as
  the gallery (26 Sep).
