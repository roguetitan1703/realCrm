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

## Commercial leads — what is left

**Built.** The requirement now carries `category` and `subtype` in the same
vocabulary a listing uses (`src/data/propertyFields.js`). The parser derives
both from what the portal already sends — a subtype word in the message, or
`0 BHK`, which no portal uses to describe a flat — and clears the bogus
`config: "0 BHK"` rather than leaving a bedroom count on a showroom. Both
matchers refuse to cross the category line, and the record sheet can say it.

**Left to do.**
- The leads LIST has no category/subtype filter, so "show me the commercial
  enquiries" is still a search rather than a facet.
- `crm_leads` has no indexed `category` column; the requirement lives in JSONB,
  which is fine at this volume and will not be at ten times it.

**Not needed:** a backfill. `reqFacets` reads the old rows through the same
normalisers, so the ~10 leads already holding "Commercial Office", "Retail
Shop" or "0 BHK" behave correctly without their stored value being rewritten.

---

## Three queries in `getDeskSummary` are unscoped

`perAgentCalls` (crm_owners), `perAgentLeadCalls` (timeline call events) and
`perAgentVisits` (site-visit activities). Every lead query beside them carries
`leadScope()`; these three carry only `tenant_id`.

Nothing is rendered to an agent — the dashboard filters the roster to their own
row and an agent navigating to Team is redirected away — so this is a payload
leak, not a visible one. Every colleague's 30-day call count, site visits and
owner-calling stats are in the JSON each agent's browser downloads.

Same firm, not cross-tenant. Fix is the guard the lead queries already use.

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

## Push reachability list — superadmin, not the firm's admin

Who on a desk can actually be reached by a push (devices opted in, live
sessions, last successful reach) is answerable today from
`backend/src/scripts/push-delivery-report.ts` and
`GET /api/v1/notifications/deliveries`.

It is **not** going on a firm admin's screen. It is a platform-operations view —
the person who reads it is the one who then rings the agent and talks them
through turning alerts on — so it belongs to superadmin, alongside the rest of
the cross-tenant tooling, whenever that surface is built.

Until then the script is the interface, and it is read-only and safe on `bhumi`.
