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

---

## The audit ledger is hidden ON PURPOSE

`AuditSection` in `src/modules/Settings.jsx` is written and working; its nav
entry and its render are both commented out. **That is deliberate — the client
is not to have it yet.** Do not "fix" the dead code or restore the nav item.

---

## Assignments tab: the count and the list disagree

The tab counts by type (`isAssignment`, 6 types); the list it opens filters on
the word "assign" appearing in the title or body. Measured 2026-08-20: bhumi's
tab reads **276** and opens onto **290** rows — the 14 extras are all
`lead_untouched` ("… · assigned to you"). delpat: 137 vs 139, the extras being
one `lead_untouched` and one `lead_unrouted` ("Lead arrived **un**assigned").

Fix is one line — filter by `isAssignment` — and it is parked only because the
user asked for other work first.

---

## ~~`reminderDays` is a control that changes nothing~~ — DONE

Was: Settings → Follow-up SLA → "Ongoing follow-up" wrote `settings.reminderDays`
and nothing read it. Wired in step 1 of the desk rework — it is the number of
days behind **Going cold** — and renamed in step 5: Settings → Response times,
"Treat a lead as gone cold after [3] days". The stored key is unchanged, so no
desk's number moved. No tenant has ever set one, so every desk runs at the
3-day default.

---

## Nothing pages a lead that has gone cold

`lead_retry_due` — "No answer for N days" — was retired on 24 Aug with the No
reply pile it belonged to. Going cold is the pile that replaced it, and no
notification reads that predicate.

**By design so far, not by omission.** The decision document gives the two
Response-times controls different jobs, in its own words: the hours one "alerts
the assignee, then escalates to a manager", the days one "shows on the dashboard
under Going cold, and in the Leads filters". One pages, one paints.

If it should page, the number that matters is not the pile. **It is how many
cross the line in a day**: 19 on the dev clone at 3 days, 7 at 7 days — against
a standing pile of 183 and 132. So a cold alert is buildable and small, PROVIDED
it carries the same two guards the SLA sweep already has: a once-per-lead flag,
and a lookback so switching it on does not page the whole back catalogue on the
first tick. Without the lookback the first run is 183 pushes, which is how a
desk mutes the app for good.

Still to decide before building it: who hears it — the assignee, or a manager
once a day — and whether a lead that goes cold twice should say so twice.

Numbers measured on the dev clone of the live desk, 25 Aug 2026.


---

## Not reviewed — coverage gaps, not decisions (26 Aug)

A sweep on 26 Aug found a live owner password in the public JS bundle and stopped
there. These areas were **never opened**. Nothing here has been measured, so
nothing here is safe or unsafe — it is unknown, which is worse than either.

Recorded so a later session does not mistake "not in KNOWN-ISSUES" for "checked".

- **Ingestion** — `services/ingestion.ts`, `parser.ts`, the webhook path and
  `/api/v1/ingest`. Known separately: no rate limit, and bhumi's Housing mapping
  stamps every enquiry `deal='sale'`.
- **The audit chain** — `verifyAuditChain()` fails at seq 227 and has not been
  diagnosed. The ledger is sold to clients as tamper-evident.
- **The notification matrix** — which types actually send, to whom, and whether
  the recipient list is ever empty. `docs/specs/notification-delivery.md`
  describes the intent; nobody has compared it to what production sent.
- **Permissions beyond the password path** — RBAC on routes, what a manager can
  reach that an agent cannot, and whether any route trusts a client-supplied
  role or tenant.
- **Sessions** — sliding expiry, the 8-device cap, revocation on password change.
- **The import and revert path** — `revertImportBatch` is known to leave timeline
  events and notification links behind; the rest of the flow is unread.


---

## Agreed, deferred — Settings review, 26 Aug

Each of these was found, agreed as real, and deliberately deferred. They are not
open questions; they are decided work with no slot yet.

### Settings → Alerts (the missing gate)

**Measured, bhumi, 14 days:** 606 notifications for 216 arriving leads — 2.8 per
lead. The owner got 233 (16.6/day). **Four of seven agents have read zero of
theirs** (Mohit 0/72, Mukesh 0/64, Vinod 0/57, Ravish 0/43).

`notifications.ts` reads exactly ONE setting in the whole file: `slaHours`.
**13 of the 21 alert types are ungated** — the firm cannot turn them down, off,
or even see that they exist. That was 471 of the 606.

The section should render `NOTIFICATIONS` from
`backend/src/services/notificationCatalogue.ts` (built 26 Aug), which already
carries the label, audience, trigger, push and gate for every type — so the
screen lists what is really sent rather than a second hand-written list that
drifts. Per firm first; per person later if asked.

Two reductions that do not need the section and should land with it:

- **`lead_new` and `lead_assigned` are one event.** 216 and 216 over the SAME
  216 links: every arriving lead sends two alerts, one to the owner, one to the
  agent. The owner's copy should be a daily digest.
- **`lead_untouched`, `lead_untouched_escalated`, `lead_stale_sla` are three
  types for one idea.** Fold to one. The 2× escalation window is hardcoded and
  nobody sets it.

### Pipeline section — draft-until-Save, and a real dialog

Renaming a stage **moves every lead on it**, and the rename **commits on blur**.
Click away by accident and the book migrates. Same fault CLAUDE.md records for
the message templates, on a control with far worse consequences. Delete also
uses `window.confirm` — a native browser dialog in a product with its own modal
system — and a duplicate name fails silently with no feedback.

Fix: the Routing section's draft-until-Save pattern, which already exists and
works, plus the app's own confirm modal.

### Brand section — one save pattern

Four controls, two behaviours. Accent colour and logo POST on click; firm name
and support number wait for a Save button. Also: the caption *"PNG or SVG, under
512 KB…"* is explanatory copy and disagrees with its own input, which accepts
`image/*`; and Support WhatsApp takes any string unvalidated, while being the
number an agent contacts when alerts are blocked — a typo is a dead end nobody
discovers.

