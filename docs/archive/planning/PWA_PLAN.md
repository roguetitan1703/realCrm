# PWA + Web Push — plan (backlog theme A)

Post-sprint. Delivers client feedback #2 ("notifications reach their phone") and
#4 ("mobile access, PWA, push — basically an APP"). Builds on slice 5
notifications: the "who should hear about this" logic already exists in
`notify()`; push is a second delivery channel on the same call.

## Product decisions (locked with the user)
- **Per-tenant app identity** — the installed home-screen app shows the *firm's*
  name + icon (Bhumi Propcity, not "Real Estate by Delpat").
- **Offline = read last-loaded data** (not just a shell). Writes stay online-only.
- **No Firebase.** Standard Web Push + a self-generated VAPID keypair. No account,
  no cost. (Chrome's push endpoint is FCM-hosted, but we never touch a Firebase
  project or key.)

## Manifest & icons — generated ONCE at onboarding, served static
The manifest does **not** need to be computed per request. When a workspace is
provisioned we generate its manifest + icons a single time and store them:

- **Icons**: rendered **client-side on a `<canvas>`** during onboarding (initials
  on the brand color → `toDataURL('image/png')` at 192 / 512 / maskable). No
  server-side image library / native deps. Swap to the uploaded logo once
  **theming (theme C)** lands.
- **Storage**: in the tenant record (`tenants.pwa_config` JSONB: `{ manifest,
  icon192, icon512 }`, icons as base64) — NOT files on disk (Render/AWS don't
  persist local files across deploys).
- **Serving**: `GET /pwa/:slug/manifest.webmanifest` and `/pwa/:slug/icon-*.png`
  read the stored bytes and return them (precomputed, long-cacheable). "Static"
  in the sense that matters: no recompute per request.
- **start_url**: `/?ws=<slug>` so the installed app reopens straight into that
  workspace (the app already reads a workspace from the URL).
- **Link swap**: `index.html` ships a default *platform* manifest; when a user
  selects their workspace, JS points `<link rel="manifest">` at
  `/pwa/<slug>/manifest.webmanifest`. Install then captures the tenant identity.
- **Backfill**: existing tenant (Bhumi) never ran this onboarding step → a
  one-time generate on first load / small script.

### Honest caveat — one firm per device (until subdomains)
Browsers identify an installed PWA by **scope**, not query string. On our single
origin that means a device can cleanly install *one* firm's app; installing a
second firm on the same device would collide. Fine in practice (an agent installs
their own firm once). The "any tenant, any device" clean story needs per-tenant
**subdomains** (`app.bhumipropcity.com`) — build so that slots in later without a
rewrite.

## Offline (read last-loaded data)
- **Service worker** precaches the app shell (built JS/CSS/HTML).
- API GETs (`/workspace/state`, `/leads`, `/properties`) use **network-first →
  fall back to cache**; offline shows last-loaded data with an **"as of <time>"**
  banner (wired to the connection state `api.js` already tracks).
- **Caches keyed by tenant** so a shared device never bleeds one firm's cached
  data into another's.
- **Writes blocked offline** (existing "not saving" badge). Offline *write*
  queuing = conflict resolution = out of scope this round.

## Push (Web Push + VAPID, no Firebase)
- **VAPID** keypair in env: `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`,
  `VAPID_SUBJECT` (mailto). Deps: `web-push`.
- **`push_subscriptions`** table: `id, tenant_id, user_id, endpoint, p256dh,
  auth, created_at` — one row per device (owner on phone + laptop = two).
- **Subscribe**: after login, a soft "Turn on alerts" prompt (never on cold load
  — that gets denied) + a Settings toggle. Browser subscription → POST to backend.
- **Send**: `notify()` gains a step — look up the user's subscriptions, send via
  `web-push`. Reuses slice-5 recipients (assigned agent, owners/managers). Dead
  subscriptions (410/404) are pruned.
- **Service worker**: `push` event → show notification; `notificationclick` →
  focus/open the app at the lead link.
- **iOS reality (constraint, not a choice)**: Web Push on iPhone only works if the
  PWA is **installed to the home screen** (16.4+). iPhone flow: install → open →
  enable alerts. A one-time "Add to Home Screen" card handles the no-prompt gap.

## Build order (each shippable)
1. **Install** — per-tenant manifest (generate-at-onboard + store + serve), icons
   (client canvas), service worker + registration, install button (Android
   `beforeinstallprompt`) / iOS "Add to Home Screen" card. Backfill Bhumi.
2. **Offline read** — shell precache + tenant-scoped network-first API cache +
   staleness banner.
3. **Push** — VAPID + `push_subscriptions` + subscribe-after-login + Settings
   toggle + `notify()`→web-push + SW push/click handlers.

## Non-goals this round
- Offline write queuing / conflict resolution.
- Multi-tenant install on one device (needs subdomains).
- Native app / FCM SDK.

## Verify
- Install: Chrome DevTools → Application → Manifest shows Bhumi name/icon;
  installs; opens standalone into the workspace.
- Offline: DevTools offline → app opens, shows last data + "as of" banner.
- Push: subscribe → trigger a lead assignment → push arrives with app closed;
  tap opens the lead. Prune a dead subscription.
