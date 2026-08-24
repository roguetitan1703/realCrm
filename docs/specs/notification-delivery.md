# Notifications — what fires, who gets it, and where it lands

Companion to `notifications.md`, which is about how an alert READS. This one is
about whether it arrives.

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
| `lead_reassign_loop` | a lead is handed on more than `reassign_alert_count` times (default 3), and every time after ([store.ts:2771](../../backend/src/services/store.ts#L2771)) | owners + managers | ✓ | ✓ |
| ~~`lead_retry_due`~~ | **retired 24 Aug** with the No reply pile. Nothing sends it; delivered rows still render | — | — | — |
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
| `lead_repeat_rejected` | a lead that was Rejected or Deal Closed reopens because the person enquired again | owner + managers | ✓ | — |

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

`status` is one of: `sent` · `displayed` · `expired` (410/404, endpoint pruned) ·
`failed` · `no_subscription` · `not_signed_in` · `push_disabled` (no VAPID keys).

**`sent` and `displayed` are different facts.** `sent` means a push service
accepted the message — the last thing the server can observe on its own. Only
the device's service worker runs at the moment a notification actually appears,
so it reports back: an opaque token travels inside the encrypted payload, and
the worker POSTs it to `/notifications/ack` after `showNotification()` resolves,
and again on tap (`clicked_at`). The token is the authentication — it existed
only inside a payload encrypted to one subscription's keys, which matters
because a service worker cannot reach the signed-in session. This is the pattern
every push vendor ships; OneSignal sell it as "confirmed delivery". RFC 8030
does define real receipts from the push service itself, but neither FCM nor
Apple implements them for web push.

Requires `PUBLIC_API_URL`. Without it the payload carries no token, no device
can report anything, and the log honestly stops at `sent`.

**TTL is 6 hours.** Without one, FCM holds an undelivered message for four
weeks; every alert we push is about something to do today, and one surfacing
eleven days late is worse than one that never arrives, because the agent acts
on it.

**Rotation.** `pushsubscriptionchange` is the spec's own event for "your
endpoint just changed", and the worker now handles it: it re-subscribes with the
same application server key and POSTs to `/notifications/resubscribe`, which
rebinds the row by the OLD endpoint. Possessing that endpoint is the proof —
it is a high-entropy secret URL and there is no session to prove anything else
with. If the worker cannot recover (no cached API origin, no old subscription),
the next signed-in load re-registers from `autoEnablePush`.

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

## Getting a device subscribed

The browser permission prompt is one-shot: dismissed twice and Chrome blocks the
origin permanently, with no API anywhere to undo it. So the app primes first —
`PushRow` (`src/components/PushRow.jsx`), one component on the phone's Today
screen, the phone settings screen and the notification drawer, which calls the
browser only from a tap.

Three states, and the third is why a firm needs a support number:

| State | What is shown | Action |
|---|---|---|
| subscribed on this workspace | "Alerts on for this device" (settings only) | — |
| permission not yet granted, or granted with no subscription | "Alerts off on this device" | **Turn on** |
| permission `denied` | "Alerts blocked on this device" | **Get help** → the firm's `supportWhatsapp` |

Nothing in the product can lift a block, and the people on a field desk are not
going to find Chrome's site settings from written instructions — so that row
routes to a human who can do it with them. The number is per firm
(Settings → Brand → Support WhatsApp).

The prompt is dismissible for 7 days, keyed **per workspace**
(`crm_push_prompt_dismissed_<tenant>`), because one browser holds several firms
and dismissing it on one is not an answer for the others.

Rows are pruned at 90 days by the same sweep that fires the alerts.
