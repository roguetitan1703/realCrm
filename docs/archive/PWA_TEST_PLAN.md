# PWA test plan — install, actions, notifications

What to exercise to call the PWA green. Written to be worked top to bottom on a
real device, not a simulator.

---

## 0. Before anything: where push actually works

Push is not uniformly available, and a failure on the wrong platform looks like
a bug when it is the platform behaving normally.

| Platform | Push works? | Condition |
|---|---|---|
| Chrome / Edge — desktop | Yes | Browser tab is enough. No install needed. |
| Chrome — Android | Yes | Tab is enough; installed also fine. |
| Firefox — desktop | Yes | Tab is enough. |
| **Safari — iOS / iPadOS** | **Only if installed** | iOS 16.4+, **and** added to Home Screen. A Safari *tab* never receives push — no prompt, no delivery. Not a bug. |
| Safari — macOS | Yes | macOS 13+. |

Also true everywhere: permission is **one-shot**. Once a person taps Block, the
app cannot ask again — it has to be cleared in browser site settings. Test the
denial path on a throwaway profile, not your main one.

The app subscribes automatically on the first tap/keypress after sign-in
(`autoEnablePush`), because iOS only grants permission from a user gesture.
There is no toggle in the UI by design.

---

## 1. Notification triggers — the complete list

Two tiers, deliberately:

- **PUSH** — buzzes the device. Reserved for "someone has to act on this now".
- **FEED** — appears in the in-app bell only. No interruption.

The bar for PUSH is high on purpose: a product that buzzes for things that can
wait gets its notifications switched off wholesale, after which the alerts that
matter never arrive either.

### Rule that affects every test below

**You never get notified about your own action.** If you assign a lead to
yourself, close your own deal, or set your own follow-up, nothing is sent —
that is intentional (`notify()` drops it when the actor is the recipient).

So testing needs either **two accounts**, or the **ingest webhook**, which runs
as `system` and therefore always notifies the receiving agent. The webhook is
the fastest path to a real push.

### The triggers

| # | Event | Who receives | Tier | How to fire it |
|---|---|---|---|---|
| 1 | `lead_assigned` — new lead routed to an agent | the assigned agent | **PUSH** | POST to the ingest webhook (below). Sign in as the agent who gets routed the lead. |
| 2 | `lead_unrouted` — lead arrived, nobody to take it | owners + managers | **PUSH** | Settings → Routing, untick everyone, then fire the webhook. |
| 3 | `lead_reassigned` — lead handed to another agent | the new agent | **PUSH** | As owner, open a lead → reassign to another user. Watch that user's device. |
| 4 | `lead_new` — new lead captured | owners + managers | FEED | Same webhook call as #1. |
| 5 | `followup_set` — follow-up scheduled on your lead by someone else | the owning agent | FEED | As owner/manager, schedule a follow-up on an agent's lead. |
| 6 | `lead_won` / `lead_lost` | owners + managers | FEED | Move a lead to Closed Won / Closed Lost as an agent. |

### Firing the webhook

```
POST http://<host>/api/v1/ingest/<tenantSlug>/<source>
X-API-Key: <the connection's key>
Content-Type: application/json

{ "name": "Test Buyer", "phone": "9876543210", "locality": "Baner",
  "deal_type": "For Rent" }
```

GET with query params also works (some portals only support that).

Expect: a push on the routed agent's device within seconds, the lead in the
list without a reload (see §4), and `deal_type` landing as **rent**, not sale —
provided the connection's mapper has `req.deal` mapped.

### Deliberately NOT notified

Teammate added, property status changed, a remark being written, a stage moving
mid-pipeline. These are visible on screen where they happen and do not need to
interrupt anyone. If one of these turns out to matter in real use, it should be
added as FEED first and only promoted to PUSH with a reason.

### Known gap — the one that is missing

**"Your follow-up is due now"** does not exist, and for an agent it would
probably be the second most valuable alert after a new lead. It is not built
because a follow-up currently stores `{ action, date: "Today", time: "4:30 pm" }`
— display strings, not a timestamp. Nothing can reliably fire off that. It needs
a real `due_at` on the follow-up first; that is a separate piece of work, not a
missing wire.

---

## 2. Install

- [ ] `/pwa/<slug>/manifest.webmanifest` loads (200, `application/manifest+json`).
- [ ] All four advertised icons return 200: `icon-192.png`, `icon-512.png` (used
      for both `any` and `maskable`), `icon.svg`.
- [ ] DevTools → Application → Manifest shows **no** errors and "Installable".
- [ ] Install prompt appears (Chrome desktop: address-bar icon; Android: menu →
      Add to Home screen).
- [ ] Installed launcher shows the **firm's** name and icon, not "Delpat" —
      the workspace must be selected first, since `pwa.js` repoints the manifest
      on workspace choice.
- [ ] The home-screen caption is a real name, not a cut-off phrase. Android
      allows ~12–14 chars; `short_name` is trimmed on a word boundary with
      trailing connectors dropped, so "Real Estate by Delpat" installs as
      **"Real Estate"**, never "Real Estate by".
- [ ] Launching from the icon opens **standalone** — no URL bar.
- [ ] `start_url` carries the workspace (`/?ws=<slug>`) so a cold launch lands
      in the right tenant.
- [ ] Status bar picks up `theme_color`.
- [ ] iOS: added to Home Screen, the icon is the firm's (apple-touch-icon), and
      the app opens fullscreen.

## 3. Offline

- [ ] Service worker registered and activated (Application → Service Workers).
- [ ] Load the app, go offline, reload → the shell still renders (network-first
      with cache fallback).
- [ ] The stale banner reads "as of &lt;time&gt;" rather than showing an empty desk.
- [ ] A queueable write made offline replays on reconnect (see `outbox.js` —
      edits deliberately do not queue; only the writes that opted in).
- [ ] Coming back online refreshes the desk immediately (`online` event).

## 4. Live refresh (no manual reload)

- [ ] Two windows signed in as different people. A change in one shows up in the
      other within ~15s, no reload.
- [ ] Network tab: a **hidden/backgrounded** tab issues no polls at all.
- [ ] Switching back to a backgrounded tab refreshes it immediately.
- [ ] While idle, polling drops from 15s to 60s after ~8 quiet checks.
- [ ] The poll is `/workspace/pulse` (~40 bytes). The heavy `/workspace/state`
      call only follows when the token actually changed — confirm you do not see
      a state fetch every cycle.
- [ ] Edit a record and keep typing: the list must never flicker or revert
      mid-edit (refresh defers while a write is in flight).
- [ ] Killing the backend does **not** flip the app into the stale banner on a
      routine poll; only a real failed read does that.

## 5. Actions on device

- [ ] Call and WhatsApp buttons open the dialer / WhatsApp with the right number.
- [ ] Camera capture works from the installed app, and the photo carries the
      watermark before upload.
- [ ] Photo upload survives a backgrounded app.
- [ ] Tapping a push notification focuses the existing window (does not open a
      second one) and deep-links to the right record.
- [ ] Bottom tab bar and top bar stay fixed while the body scrolls — nothing
      scrolls off on a short viewport.
- [ ] Safe-area insets respected on a notched device.

---

## Notes

- `/workspace/state` and `/workspace/pulse` currently answer **unauthenticated**,
  falling back to the default tenant. Pre-existing on the whole workspace router
  — `/state` returns the entire dataset this way. Worth closing before anything
  faces the public internet.
