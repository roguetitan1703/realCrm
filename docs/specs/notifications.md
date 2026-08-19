# Notifications — what fires, who gets it, and where it lands

Two different deliveries wear one word. **Feed** is a row in `notifications`,
read in the bell drawer when someone next opens the app. **Push** is a Web Push
to every device that user has opted in on — phone or desktop, the mechanism is
identical and nothing in the code distinguishes them.

Every alert lands in the feed. Push is opt-in per call site, `push: true`, and
the default is deliberately off: a desk taking 60 leads a day cannot have 60
phone buzzes, and a product that interrupts for things that can wait gets its
notifications switched off entirely — after which the two that mattered never
arrive either.

## The matrix

Derived from the `notify()` / `notifyRoles()` call sites. Those are the truth;
if this table and the code disagree, the code is right and this file is stale.

| Type | Fires when | Recipient | Feed | Push |
|---|---|---|---|---|
| `lead_assigned` | a lead arrives and routes to an agent ([store.ts:1858](../../backend/src/services/store.ts#L1858)); also the auto-assign sweep ([:3941](../../backend/src/services/store.ts#L3941)) | that agent | ✓ | ✓ |
| `lead_assigned_bulk` | a batch lands on one agent ([store.ts:2645](../../backend/src/services/store.ts#L2645)) | that agent | ✓ | ✓ |
| `lead_unrouted` | a lead arrives with nobody to take it ([store.ts:1875](../../backend/src/services/store.ts#L1875)) | owners + managers | ✓ | ✓ |
| `lead_reassigned` | a lead is handed to a different agent ([store.ts:2060](../../backend/src/services/store.ts#L2060)); also the idle sweep ([:3979](../../backend/src/services/store.ts#L3979)) | the new agent | ✓ | ✓ |
| `lead_untouched` | still on the arrival stage after `slaHours` (default 24) ([notifications.ts:272](../../backend/src/services/notifications.ts#L272)) | the assigned agent | ✓ | ✓ |
| `lead_untouched_escalated` | still there after `2 × slaHours` (default 48) ([notifications.ts:289](../../backend/src/services/notifications.ts#L289)) | owners + managers | ✓ | ✓ |
| `lead_retry_due` | rung, not answered, nobody back since ([notifications.ts:341](../../backend/src/services/notifications.ts#L341)) | the assigned agent | ✓ | ✓ |
| `followup_due` | a follow-up's `due_at` has passed ([notifications.ts:209](../../backend/src/services/notifications.ts#L209)) | the assigned agent | ✓ | ✓ |
| `site_visit_reminder` | same, when the follow-up is a visit | the assigned agent | ✓ | ✓ |
| `calendar_task_assigned` | someone else sets a follow-up on your lead ([store.ts:2074](../../backend/src/services/store.ts#L2074)) | the assigned agent | ✓ | ✓ |
| `remark_added` | someone else writes a remark on your lead ([store.ts:2091](../../backend/src/services/store.ts#L2091)) | the assigned agent | ✓ | ✓ |
| `owner_assigned` | a property owner lands in your calling queue ([store.ts:2733](../../backend/src/services/store.ts#L2733)) | that agent | ✓ | ✓ |
| `owner_reassigned` | an owner moves to you ([store.ts:2967](../../backend/src/services/store.ts#L2967)) | the new agent | ✓ | ✓ |
| `lead_new` | any lead arrives ([store.ts:1870](../../backend/src/services/store.ts#L1870)) | owners + managers | ✓ | — |
| `followup_set` | you set a follow-up on your own lead ([store.ts:2082](../../backend/src/services/store.ts#L2082)) | yourself | ✓ | — |
| `lead_moved_away` | the idle rule took a lead off you ([store.ts:3988](../../backend/src/services/store.ts#L3988)) | the previous agent | ✓ | — |
| `lead_repeat` | a portal re-sends a lead already on the desk ([ingestion.ts:571](../../backend/src/services/ingestion.ts#L571)) | the lead's agent | ✓ | — |
| `lead_repeat_rejected` | the same, with conflicting fields dropped ([ingestion.ts:564](../../backend/src/services/ingestion.ts#L564)) | the lead's agent | ✓ | — |

Two rules apply to every row. `toSelf` is off by default, so an alert about
something you did yourself is dropped — telling someone what they just did is
the fastest way to train them to ignore the bell. And a push is withheld from a
user with no live session: a subscription outlives the sign-out that should have
ended it, and a handset that has been sold does not get the firm's contact list.

## Why an alert does not arrive

In order, because each one hides the one below it:

1. **The recipient has no subscription.** Nothing is wrong with the alert; there
   is no device to send it to. On the live desk this was 4 of 7 agents.
2. **No live session.** Signed out everywhere — withheld on purpose.
3. **The endpoint is dead.** Push services rotate endpoints; the row is pruned
   on the `410` and the device is silent until the app is opened again.
4. **The type is feed-only.** See the matrix. Not a fault.

## The delivery log

`push_deliveries` records one row per attempt **including the attempts that
never left the building** — the first two cases above produce no error, no log
line and no trace anywhere, which is exactly how a day's alerts go nowhere
without anyone noticing.

`status` is one of: `sent` · `expired` (410/404, endpoint pruned) · `failed` ·
`no_subscription` · `not_signed_in` · `push_disabled` (no VAPID keys).

Read it two ways:

```bash
# operator, read-only, one tenant, safe on bhumi
cd backend && npx tsx src/scripts/push-delivery-report.ts --tenant=bhumi --since=2026-08-19
```

```
GET /api/v1/notifications/deliveries      owners and managers only
    ?user=<id>&since=<iso>&limit=<n>
    → { pushEnabled, deliveries[], readiness[] }
```

`readiness` is the section that finds the problem: devices opted in, live
sessions and last successful reach, per person.

Rows are pruned at 90 days by the same sweep that fires the alerts.
