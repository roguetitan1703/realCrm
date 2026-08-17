# Parked

Things that are **understood and deliberately not built yet** — not a backlog of
ideas. Every entry names what is actually wrong, what it costs today, and what
the fix would take, so picking one up does not mean re-deriving it.

`docs/ROADMAP.md` is what to build next. This is what we looked at, decided
against doing right now, and want to stop rediscovering.

When an item ships, delete it from here. When one turns out to be worse than
recorded, update it in place rather than adding a second entry.

---

## D6 — the project filter squeezes the results count (Properties)

**What happens.** With a project selected, the filter chip in the Properties
toolbar grows to fit the project name. Real names are long — "Godrej Green
Cove", "VTP Leonara C Wing" — so the chip pushes into the row count beside it
and the number gets clipped or wraps.

**Why.** The chip and the count are siblings in a flex row and neither is
constrained: the chip has no `max-width` and the count has no `flex:none`, so
the browser resolves the overflow by shrinking whichever it likes.

**The fix is already written elsewhere.** Owners solved exactly this:
`.proj-chip` in `styles.css` caps at `max-width:220px` and ellipsises its label.
Properties needs the same treatment plus `flex:none` on the count so it can
never be the thing that shrinks.

**Why it is parked.** Cheap, but the cap has to be measured against the real
toolbar at the real breakpoints rather than guessed — the desk collapses at
1120px and the phone toolbar is a different component. Not worth a browser
session while bigger things are open.

---

## Commercial leads have nowhere to say they are commercial

**What happens.** bhumi received a genuine ₹2,25,000/month showroom lease from
99acres on 17 Aug. It arrived as `deal_type: "L"`, `property_type: "0 BHK"`,
message `"225000, Showrooms for Lease Mahalunge, Pune West"`. The lead was
created with `config: "0 BHK"` and **an agent rejected it** — which is a fair
reading of a record that says a buyer wants nought bedrooms.

**What exists already.** The PROPERTY side has full commercial support:
`CATEGORIES` and `SUBTYPES.commercial` (Office / Shop / Showroom / Warehouse)
in `src/data/propertyFields.js`. It is only the LEAD that cannot express it.

**What it needs.**
- A category on the lead requirement (residential / commercial) and a subtype,
  drawn from the same `propertyFields.js` vocabulary — one list, not a second.
- The parser to read the commercial signal it is already being handed: `0 BHK`
  plus a subtype word in the message is unambiguous.
- Matching to respect it, so a commercial requirement stops being scored against
  2 BHK flats.
- The lead form, filters and the record sheet to show it.

**Why it is parked.** It is a model change on a live desk, and it wants doing
once rather than three times. The `deal_type: "L"` half is fixed — that value
now maps to rent explicitly instead of being inferred from the budget.

**Volume, so nobody over- or under-builds it:** 1 commercial enquiry of 40
99acres payloads received so far. Rare, not zero, and buying commercial happens
as well as leasing it.

---

## `perAgentCalls` in `getDeskSummary` is unscoped

Every agent's browser receives every colleague's calling throughput. The lead
counts beside it are correctly scoped; this one query is not. Carried over from
`CLAUDE.md` §7 — recorded here so it is in one place with the rest.

---

## `noanswer_stale` counts leads that WERE retried

The segment reads "no answer, not retried", and it means "stage is Call Not
Received and nothing has changed for 3 days". But agents text the person who did
not pick up: 8 of bhumi's WhatsApp remarks say exactly that ("call not
received", "Not rec texted on whatapp"). Those leads were retried, on another
channel, and the pile is overstated by however many of the 46 they are.

Fixable once the WhatsApp outcome `wa_after_no_answer` has had time to
accumulate — the segment can then exclude leads with a retry message after the
last call, from data rather than from guessing at the remark text.

---

## ~42 call remarks still carry no outcome

"Call not rec" ×16, "Call not received" ×9, "Call not Recived" ×8 and the rest,
all written as free text before the dropdown said what agents say. The leads
they belong to never moved stage, because the auto-advance reads the outcome and
there is none.

A backfill is possible and would move real leads on a live desk. It is inference
from prose, so it needs the user's explicit go-ahead, a stated blast radius per
tenant, and `runOnce`. Some strings are unambiguous ("Call not rec"); others are
not ("Call Not Received but details Will Share").

---

## `req.config` and property `type` are different vocabularies

A requirement's config is `"1BHK"` or `"2 BHK"`. A listing's type is
`"1 BHK duplex"`, `"1rk BHK independent house"`, `"3 BHK studio"` — free-form
composites typed by whoever entered the stock.

So `p.type === req.config` in `fitReasons` is almost never true, and any server
filter on `type IN (…)` returns nothing: Baner holds 2,000 available listings
and a `1BHK` requirement matched zero of them.

**Worked around, not fixed.** The attach-property suggestions narrow on locality
and deal (clean enumerations) and let config influence only the ranking, where
being approximate is acceptable. The scoring itself is still an exact string
compare that essentially never fires.

**The fix** is a BHK comparison that reads the number out of both sides
(`1rk`, `1`, `2`, `4`) and compares that, with the rest of the type string
treated as a sub-type. It touches `fitReasons` and both match scorers, which
decide what every buyer is shown — worth doing deliberately rather than as a
side effect of a modal.
