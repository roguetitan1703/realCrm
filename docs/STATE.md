# State

Where the system actually is, right now. **Overwritten every session, never
appended** — the moment this grows a history it becomes a third document nobody
finishes, and `git log` is already the history.

What belongs here is only what git cannot tell you: what is *deployed* (as
opposed to committed), what is waiting on the user, and what was checked
against the live database so the next session neither re-derives it nor assumes
it.

---

## Deployed

| | at | when |
|---|---|---|
| Frontend — Vercel, automatic on every push to `main` | `1aed7e2` | 2026-08-19 |
| Backend — AWS, **by hand** | `1aed7e2` | 2026-08-19 |

Working tree clean, `origin/main` == local `main`, nothing unpushed.

**The two deploy separately and that is the trap.** A field or route that "does
not exist" is usually a stale backend, not a bug — check the deployed API's
version before changing code. And a frontend fix for a server-side problem
(permissions, SQL, timeline events) changes nothing until AWS is updated.

---

## What shipped 2026-08-18 → 19

Twenty-five commits, three areas. `git log` carries the detail; these are the
shapes, so a new session knows what was recently disturbed.

- **Workspace isolation** — every remaining browser-global key that named a
  workspace; the service worker moved from the origin root to `/<slug>/`, which
  is what gives each installed app its own push subscription; a record id no
  longer survives a change of workspace.
- **The permission bug that blocked the live client** — `stageNote` was not in
  `ASSIGNEE_WRITABLE` and `Object.keys` counts undefined-valued keys, so for
  ~24 hours no bhumi agent could set any status except Rejected.
- **Follow-ups, end to end.** This was not a run of bugs; it was one feature
  that had never been designed. Four names for one concept, a completion tick
  that stored nothing, an outcome dropdown that had never sent anything on any
  record, a display reading a boolean column nothing writes, and a booking
  written as an editable remark. Now: one word (*follow-up*), the work closes
  it (log the call or the visit, or record an outcome), the booking is a system
  event whose sentence cannot be overwritten, and a closed lead owes nothing.

---

## Watch after this deploy

- **Push subscriptions rebuild once per device.** The old root-scoped worker is
  retired on next load and each app re-subscribes under its own scope. One page
  load with no push per device, then normal. If a device stays silent, it did
  not re-subscribe.
- **Two PWAs on one phone has never been tested for real** — service workers
  are production-only, so none of the scoping work could be verified locally.
  Install delpat and urban side by side and confirm each gets its own alerts
  and each notification opens its own app.

---

## Waiting on a decision

- **5 of bhumi's 10 booked site visits carry no `follow_up.at`** — only a typed
  string ("This Sunday"). Nothing can judge whether they have passed, on any
  screen. The fix is an agent re-picking the date; writing one in would be
  inventing a fact.
- **The Past SLA tile has no matching pill.** Every other dashboard tile now
  lands on a selected segment; `untouched_sla` is not one of the Leads segments,
  so that tile still opens with nothing shown. Either add the pill or point the
  tile at Never called and accept it is broader.

---

## Verified against the live database this session

Stated so it is not re-derived, and not trusted past its date.

- `lead.overdue` is `false` on **all 237 bhumi and all 94 delpat leads** —
  nothing has ever written that column. Every reader goes through
  `followUpOverdue()` / `nextStepOf()` now.
- **11 bhumi** timeline rows are still editable free-text "Scheduled …"
  remarks, written before bookings became system events. New ones are locked;
  these are not, and rewriting a live desk's history would be worse.
- The free-text `follow_up.action` sentences are **all `skyline-realty`** seed
  data. bhumi's are only ever site visits.
- Closed leads holding a follow-up: 1 bhumi, 1 delpat, 1 urban. Only urban's is
  past due, so no live count moved when the rule changed.
- **`getDeskSummary` has three unscoped queries, not one** — `perAgentCalls`,
  `perAgentLeadCalls` and `perAgentVisits`. Every lead query beside them carries
  `leadScope()`. Nothing is rendered to an agent (the dashboard filters the
  roster to their own row and Team redirects them away), but the numbers are in
  the JSON every agent's browser downloads.
- A lead's **`Callback` status stores no time** while Owners has stored a real
  callback instant for months. Two halves of one desk disagreeing about what
  the word means.
