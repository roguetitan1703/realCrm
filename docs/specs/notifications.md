# Notifications — the pattern

A plan, not a change. Nothing here deletes a notification: every row already in
the table keeps existing and keeps rendering. The point is that they stop
looking like eleven people wrote them.

---

## 1. What is actually there

Every distinct title in the system today:

```
lead_assigned        1   👤 New Lead Assigned to You
lead_assigned      217   New lead assigned to you
lead_reassigned     18   A lead was assigned to you
lead_reassigned     17   1 lead assigned to you
lead_reassigned      1   3 leads assigned to you
lead_stale_sla     138   ⚠️ SLA Warning: Untouched Lead
lead_stale_sla     174   🚨 SLA Escalation: Untouched Lead
calendar_task…       8   📅 New Site Visit assigned to you
remark_added         2   💬 New Note Added to Lead
lead_retry_due      13   📞 No answer — try again
```

Five faults, and they are all the same fault — **the text is written at the
call site**, so every call site invented its own:

1. **One type, several titles.** `lead_assigned` has two. `lead_reassigned` has
   three. Nothing keeps them in agreement because nothing holds them together.
2. **Six emoji, no rule.** The drawer already draws its own dot and layout; an
   emoji inside the title is a second icon competing with the first.
3. **Title Case and sentence case, side by side.**
4. **Internal jargon on a salesperson's screen.** Nobody thinks "SLA Warning".
   They think "I haven't called this person."
5. **One type carrying two meanings.** `lead_stale_sla` is both the agent's
   warning and the manager's escalation, distinguishable only by reading the
   string.

---

## 2. The rule

**A notification is a typed event with data. It is not a formatted string.**

Call sites pass a type and the facts. One catalogue turns that into words. The
renderer turns the type into an icon. Nobody writes prose at a call site again.

---

## 3. Voice

- **Sentence case.** No Title Case, no trailing full stop.
- **No emoji, ever.** The icon is the icon.
- **Title says what happened or what is needed. Body says which record.** The
  body never repeats the title.
- **The number goes in the title when the number is the point** — "No answer for
  4 days" — and the name goes in the body.
- **No system vocabulary.** No "SLA", no "stale", no "escalation", no type names.
- **Plurals resolved in one place**, not with `n === 1 ? '' : 's'` at nine sites.
- **Written for the person receiving it**, not about the record. An agent gets
  "Not contacted for 2 days"; a manager gets the same fact with the agent named.

---

## 4. The catalogue

One entry per type. `{}` are facts the call site supplies.

| type | icon | tone | title | body |
|---|---|---|---|---|
| `lead_assigned` | `userPlus` | info | Lead assigned to you | {name} · {locality} · via {source} |
| `lead_assigned_bulk` | `userPlus` | info | {n} leads assigned to you | — |
| `lead_new` | `leads` | info | New lead captured | {name} → {agent} |
| `lead_unrouted` | `alert` | urgent | Lead arrived unassigned | {name} · nobody is set to receive {source} |
| `lead_moved_away` | `switch` | info | {n} leads moved to another agent | — |
| `lead_untouched` | `clock` | attention | Not contacted for {hours}h | {name} · assigned to you |
| `lead_untouched_escalated` | `alert` | urgent | Not contacted for {hours}h | {name} · with {agent} |
| `lead_retry_due` | `phone` | attention | No answer for {days} days | {name} · last tried {when} |
| `followup_set` | `calendar` | info | Follow-up scheduled | {name} · {when} |
| `followup_due` | `clock` | attention | Follow-up due now | {name} · {action} |
| `site_visit_reminder` | `mapPin` | attention | Site visit due now | {name} · {when} |
| `calendar_task_assigned` | `calendar` | info | Site visit assigned to you | {name} · {when} |
| `remark_added` | `note` | info | Note added | {name} · by {author} |
| `owner_assigned` | `userPlus` | info | {n} owners assigned to you | — |
| `owner_reassigned` | `switch` | info | Owner assigned to you | {name} |

**Tone drives colour, nothing else** — `info` muted, `attention` accent,
`urgent` alert. It does not change the icon and it does not add a word.

`lead_stale_sla` splits into `lead_untouched` and `lead_untouched_escalated`.
Two audiences, two urgencies; one type could never be styled correctly for both.

---

## 5. The back catalogue, without touching data

312 existing rows have emoji baked into `title`. They are not rewritten and not
deleted. The renderer strips leading decoration at display time:

```js
const cleanTitle = (t) => String(t || '').replace(/^[\p{Extended_Pictographic}️‍\s]+/u, '')
```

An emoji at the front of a title is decoration, not content, so removing it at
render loses nothing — and every historic row immediately matches the new ones.
Old titles keep their old wording; that is honest, because that is what was sent.

**This is the whole visual win, and it needs no migration, no deploy of the
backend, and no notification removed.**

---

## 6. Files

| File | Change |
|---|---|
| `src/lib/notificationMeta.js` *(new)* | `type → { icon, tone }`, and `cleanTitle()`. The row already carries `type`, so the client needs nothing new from the server. |
| `src/modules/Modals.jsx` | Draw the icon from type. Strip legacy decoration. **Fix the Assignments tab** — see below. |
| `backend/src/services/notificationCopy.ts` *(new)* | The catalogue. Title/body built here and nowhere else. Push and in-app get one string. |
| `backend/src/services/notifications.ts` | `notify()` takes `{ type, data }` and renders through the catalogue; `title`/`body` stay accepted for anything not yet migrated. Sweep call sites move over. |
| `backend/src/services/store.ts` | ~10 call sites pass facts instead of prose. |

### The dependency that will bite

```js
Assignments ({notifs.filter(n => (n.title || '').toLowerCase().includes('assign')).length})
```

That tab matches on the **title text**. Change the copy and it silently empties.
It must key off type — `lead_assigned`, `lead_assigned_bulk`,
`calendar_task_assigned`, `owner_assigned`, `owner_reassigned` — before any
string moves.

---

## 7. Order

1. **Client only** — icon by type, strip legacy decoration, tab by type.
   Every existing notification looks right. No deploy, no data change.
2. **Catalogue** — add the module, route `notify()` through it, migrate the
   sweep's four call sites. New notifications gain the new voice.
3. **Remaining call sites** in `store.ts`.
4. **Split `lead_stale_sla`** into the two types. Existing rows keep the old
   type and keep rendering through a legacy entry in the meta map.

Each step stands alone and each is reversible.

---

## 8. Not doing

- **No rewriting history.** Old rows keep their stored text.
- **No new notification types.** The gaps are ROADMAP-2 E5; this is about how
  the ones we have look and read.
- **No emoji anywhere**, including in the new catalogue.
- **No storing type + params instead of rendered text.** Push needs the string
  server-side, and two representations of one message would drift — which is
  the fault this whole document exists to remove.
