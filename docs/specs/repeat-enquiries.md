# Repeat enquiries — one person, several enquiries

A buyer who comes back is the strongest signal a portal desk gets. Today the
second enquiry is recorded as a sentence and its requirement is thrown away.

**Status: not built.** This is the second draft. The first one counted raw
webhook payloads and was wrong about its own headline example — see §2, which is
the reason this spec exists in this form. Everything below is measured from
bhumi's `webhook_inbox`, not assumed.

---

## 1. The loss, which is real

`findLeadByPhone` merges on the last ten digits. That is correct and must stay:
two rows for one person means two agents ring him. But the merge then writes a
note and **keeps the first enquiry's requirement**, so the newer statement
survives only as prose inside a timeline entry, where no filter, no match and no
report can reach it.

There is also no counter anywhere — not on the row, the card or the record
header. The only evidence that someone has come back three times is a timeline
entry you have to scroll for.

---

## 2. A payload is not an enquiry

This is the correction that reorganised the spec, and it should be read before
anything else is designed.

Of 33 consecutive-payload gaps from a repeating phone on bhumi:

| gap between one payload and the next | n |
|---|---|
| **under 5 minutes** | **8** |
| 5–60 minutes | 2 |
| 1–24 hours | 11 |
| 1–7 days | 11 |
| over 7 days | 1 |

Those sub-five-minute pairs carry **different** `enquiry_id`s, so they are not
the portal retrying. They are one person clicking "contact" on several listings
in one sitting.

The first draft's headline example was exactly this and it was read as a budget
revision:

```
9492917799  ×4   "rent · Mahalunge · ₹29,999 → ₹24,999 → ₹25,000"

18:05:23   ₹24,999   Godrej Green Vistas
18:05:52   ₹25,000   VTP Township Codename Blue Waters
18:08:06   ₹29,999   Godrej Green Vistas
18:10:32   ₹29,999   Godrej Green Vistas
```

Five minutes on the evening of 10 August. Nobody revised anything. Those four
figures are the **asking prices of the four flats he clicked** — the honest read
is "looking around ₹25–30k in Mahalunge", and a rule that takes the newest as
his budget lands on whichever listing he happened to open last.

**So the unit is a session, not a payload.**

| definition | phones that "came back" |
|---|---|
| more than one payload (first draft) | 25 |
| more than one session, 60-minute gap | 20 |
| more than one session, next-day gap | **12** |

Twelve, not twenty-five. Still the warmest twelve people on the desk — but a
counter built on payloads would have said 25 and shown "4 enquiries" against a
man who enquired once.

**Session rule:** payloads from one phone within **6 hours** of each other are
one enquiry session. Long enough to cover a lunchtime and an evening browse,
short enough that yesterday and today are always separate. It is a tenant
setting with that default, not a constant, because the right number is a
guess and guesses belong somewhere they can be changed.

---

## 3. The model

**A person is one lead. A session is an event with its own requirement.**

```
crm_lead_enquiries
  id, tenant_id, lead_id, integration_id
  session_key          -- lead_id + session bucket; UNIQUE with tenant
  first_at, last_at    -- the session's span
  payload_count        -- how many listings they clicked in it
  source               -- the connection's name at the time
  req                  -- the requirement for the session (see §4)
  raw_refs             -- webhook_inbox ids, for provenance
  UNIQUE (tenant_id, session_key)
```

The first enquiry writes a row too, so the table is the whole history rather
than "everything after the first one".

**Idempotency, at two levels.** One bhumi `enquiry_id` was delivered **three
times** by the portal. A payload whose `enquiry_id` is already recorded is
ignored outright; a payload without one falls back to the session key. Without
this the counter inflates on the portal's retries alone, and it inflates
invisibly.

---

## 4. What a session's requirement is

Within a session, the several payloads are a **range being browsed**, not a
sequence of corrections:

- **budget** — keep `min` and `max` across the session's payloads. Four clicks
  at 24,999 / 25,000 / 29,999 / 29,999 is `₹25k–30k`, which is both true and
  useful. Taking the last is neither.
- **locality, project, config** — accumulate. Someone comparing Green Vistas and
  VTP Township is telling you something; picking one discards it.
- **deal** — never observed to differ within a session, and 0 of 25 phones
  changed it at all. If it ever does, it is a correction: take the latest and
  say so on the timeline.

Across sessions weeks apart, a budget move **is** a revision and the newer
session leads. But it is shown as a change, never silently applied:

> **3 enquiries** · budget ₹73L → ₹85L · VTP Belair

---

## 5. What must not be overwritten

**A human's requirement beats a portal's.** Three of the 25 repeating leads
carry a long, hand-typed call remark — "Looking 3 bhk in vtp Leonara buy in c
wing all inc -1.10cr", "Looking near highway 1bhk 2 bechulers". An agent spoke
to that person. A payload arriving afterwards must not overwrite what was
learned on the phone; it is recorded as a new session and surfaced as a
difference for the agent to resolve. This is CLAUDE.md §3.5's `updateLead`
lesson: a field that was set deliberately is not the same as one nobody filled.

**A portal must never downgrade a name.** Nine of the 25 repeating phones carry
a *different* name across payloads, and the later one is usually worse:

```
nilay nawghare → mbuser          (a MagicBricks placeholder)
revati sonawane → reva
akshay kamble → akshay
janhavi → j
```

Latest-wins on name replaces a real person with "mbuser". Rule: a new name is
taken only when the record has none, or when the new one is strictly longer and
contains the old one. Anything else is recorded on the enquiry and left off the
lead. Nine of twenty-five is too high a rate to leave to chance.

**Nobody is split on requirement drift.** Zero of 25 changed deal type;
splitting would recreate the duplicate-row problem the phone rule exists to
prevent.

**The lead's requirement is derived by one function** from the enquiry rows, or
the columns and the history diverge (CLAUDE.md §3.2).

---

## 6. Where a repeat actually lands

The stage of the lead each repeating phone merges into, on bhumi today:

| stage | n | what a repeat means there |
|---|---|---|
| Call Not Received | **8** | the best news on this list — someone who never picked up has come back on their own. Belongs at the top of the calling queue. |
| Follow-Up | 6 | new information for a conversation already running |
| Interested | 5 | do **not** touch the stage; add the session and notify |
| Rejected | **4** | see below |
| Site Visit | 1 | do not touch the stage |
| New | 1 | nothing to decide |

**Nothing here changes a stage automatically.** Not one of these piles is
improved by being reset to New, and two of them would be actively damaged: a
lead mid-negotiation or with a visit booked is work in progress, and moving it
backwards throws away where the agent had got to.

**Rejected is a human decision, every time.** One of bhumi's rejections reads
"She said not interested don't call". Auto-reopening that because a portal fired
again would put an agent back on the phone to someone who asked not to be rung —
which is the one outcome this feature must never produce. A repeat on a Rejected
lead raises a notification saying so and offers the agent a reopen. It does not
take it.

**Not a problem today: the assigned agent having left.** All 8 bhumi users are
active and 0 repeats land on an inactive one. Do not build routing for it.

---

## 7. What the desk sees

- **Row and card:** a count, only above one. `2 enquiries`. Never a badge reading
  `1` — that is every lead, and a badge on everything is a badge on nothing.
- **Record header:** the count and the drift, as in §4.
- **Timeline:** each session as its own entry carrying its requirement, replacing
  today's prose note. `3 listings · Mahalunge · ₹25k–30k`.
- **Filter:** "Enquired more than once" in the Needs-attention set — 12 leads on
  bhumi today, and they are the warmest on the desk.
- **Notification:** a repeat from a known buyer must not read like a new lead.
  One per session, never one per payload: the man above would have buzzed four
  phones in five minutes.

---

## 8. Rollout, because this is a live desk

**Phase 1 — observe, change nothing.** Write `crm_lead_enquiries` on ingest and
backfill from history. Do not touch a single lead's requirement, name, or stage.
Show the counter and the timeline entries; those are additive and cannot be
wrong in a way that costs anything.

**Phase 2 — DONE, 2026-08-18.** 18 leads have enquired more than once across
317 sessions. Comparing each one's latest session against its stored
requirement:

| field | agrees | disagrees | session silent |
|---|---|---|---|
| `deal` | 10 | **0** | 8 |
| `config` | 9 | 1 | 8 |
| `locality` | 13 | 5 | 0 |
| `interest` | 5 | 4 | 9 |
| `maxBudget` | 4 | **6** | 8 |

The first pass at this read the wrong thing: `backfillEnquiries` picked values
out of the stored payloads with 99acres' field names, so 84 MagicBricks pushes
recorded as a bare locality while the payload beside them carried BHK, budget,
deal type and project. Fixed — it replays through each connection's own
mapping — and the table above is from the rebuilt data. **Do not trust a
comparison run against a shape one reader guessed at.**

What the disagreements turned out to be:

- **`maxBudget` is a price tag, not a statement.** Every figure these portals
  send is the asking price of the listing that was opened. Five of the six
  disagreements moved by under 8% — ₹25,000 → ₹25,999, ₹25,000 → ₹24,999.
  That is browsing. Taking the newest would have narrowed one buyer from
  ₹40,000 to ₹32,000 and hidden every flat between from her.
- **`interest` accumulates.** All four disagreements are a *different project*,
  and one session already held two at once. Somebody comparing Green Cove and
  Blue Waters is telling you something.
- **Four of the five `locality` disagreements arrived on a Housing.com push
  carrying nothing but a locality** — no BHK, no budget, no project. Housing
  sends four distinct localities across 110 pushes, which is the list of areas
  this firm advertises in, not a buyer's preference.
- **`deal` never conflicted.** Somebody renting stays renting.

**Phase 3 — DONE, 2026-08-18**, and shaped by the above rather than by "latest
wins", which the data says would make 6 of 10 leads worse:

- `maxBudget` **widens** to the highest figure seen and never contracts.
  `minBudget` is written only by a field that says minimum — an earlier draft
  synthesised a floor from the single figure a portal sends, which both invents
  a fact ("won't look below ₹32,000") and narrowed the very range it exists to
  widen.
- `interest` accumulates into a list. Safe because `interest` is displayed,
  never matched on.
- `locality`, `config`, `deal`, `category`, `subtype` — **filled when empty,
  never overwritten.** A contradiction from a push that stated a requirement is
  written into the note and the timeline as "Says 3 BHK now (had 2 BHK)" and
  left for a person. Matching compares locality and config with `===`, so a
  wrong one does not loosen a lead's results, it empties them.

Dry-run over the 18 real repeat leads: 3 budgets widen, 3 are protected from
narrowing, 4 interest lists grow, 2 conflicts get reported. **Existing leads
are not retro-fixed** — this applies to enquiries arriving from now on.

**Backfill.** `webhook_inbox.raw_body` still holds bhumi's original payloads, so
the enquiry table can be built from history rather than starting empty. It gets
cheaper the sooner it happens: `data-lifecycle.md` purges bodies at 30 days and
what is gone is gone. Through `runOnce`, with the per-tenant row count stated
before it runs.

---

## 8b. The three rules around the requirement

**The owner does not change.** Somebody has been working this person; the call
they made yesterday is why this enquiry exists. Handing the lead to whoever is
next in the round-robin because a form was submitted again takes a live
conversation away from the person having it. The one exception is when there is
nobody to take it from — unassigned, or owned by someone who has left or been
deactivated — in which case it routes like a new arrival. Every bhumi agent is
currently active, so this is a case prepared for rather than one observed.

**A better name, never a worse one.** Portals send placeholders; bhumi holds six
leads called "USER" and one "MbUser". A real name replaces a placeholder and
nothing replaces a real name. The placeholder list is explicit, not a rule about
length — "Om", "M" and "Wr" are all real names on this desk.

**A rejected lead is never reopened automatically.** One of bhumi's carries the
remark "She said not interested don't call". The desk is told; the stage does
not move.

**One notification per session, never per payload.** The buyer who opened four
listings between 18:05 and 18:10 gets one alert. Four would have taught the desk
to ignore the fifth.

---

## 9. Not in scope

Commercial enquiries — `deal_type: "L"`, `property_type: "0 BHK"`. Properties
has a full commercial vocabulary and the lead requirement model has none, so a
showroom can only land as `0 BHK`. See `docs/PARKED.md`; its own job.
