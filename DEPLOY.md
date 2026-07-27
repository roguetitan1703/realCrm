# Deploy

| Piece | Where | URL |
|---|---|---|
| Frontend | Vercel | https://realestate.delpat.in |
| API | AWS | https://api.re.delpat.in |

The two are on **different origins**, so the frontend has to be told where the API
lives. That's already committed in `.env.production` (`VITE_API_URL`), so a plain
`git pull` + deploy is correctly wired with nothing to configure by hand.

CORS on the API is **open to all origins** — nothing to set.

---

## Deploy steps

### Frontend (Vercel)
Push to the deploy branch. Vite reads `.env.production` at build time and points
the bundle at `https://api.re.delpat.in`.

> Vite inlines env vars **at build time**. If you ever change the API domain, you
> must **rebuild/redeploy** — editing the variable alone does nothing to a built bundle.

### API (AWS)
```bash
git pull
npm install
START_SERVER=true npx tsx backend/src/index.ts
```

Required env on the box (see `.env.example`):

| Variable | Value |
|---|---|
| `DATABASE_URL` | Supabase connection string |
| `PORT` | `5000` |
| `START_SERVER` | `true` |

Serve over **HTTPS**. An https Vercel page calling an http API is blocked by the
browser as mixed content — the most common "works locally, not deployed" cause.

---

## After deploying the API — RESET ONCE (required)

This release adds two columns (`follow_up`, `overdue`) and a corrected seed.
The schema upgrade is automatic and idempotent on boot, but the **data** only
refreshes on reset:

```bash
curl -X POST -H "X-Tenant-ID: bhumi-propcity" https://api.re.delpat.in/api/v1/workspace/reset
```

Skip this and follow-ups stay empty — which breaks the follow-up beat and leaves
the mobile Today screen blank.

---

## Verify before the demo (60 seconds)

```bash
# 1. API healthy
curl https://api.re.delpat.in/health

# 2. Correct demo state: 3 agents / 8 properties / 12 leads,
#    and crucially followUp + overdue must be present
curl -s -H "X-Tenant-ID: bhumi-propcity" \
  https://api.re.delpat.in/api/v1/workspace/state \
  | python -c "import sys,json;d=json.load(sys.stdin)['state'];print(len(d['agents']),'agents',len(d['properties']),'props',len(d['leads']),'leads');print('followUps:',sum(1 for l in d['leads'] if l.get('followUp')),'| overdue:',sum(1 for l in d['leads'] if l.get('overdue')))"
```

Expected: `3 agents 8 props 12 leads` and `followUps: 11 | overdue: 3`.
**If followUps is 0, the API is running old code — redeploy and reset.**

Finally, in the browser at https://realestate.delpat.in: change something,
hard-refresh, confirm it survived. That proves the whole chain.

## Safety net

If the API is unreachable, a red **"Offline — not saving"** badge appears in the top
bar. It is invisible when healthy. If it ever shows during a demo, stop — anything
changed while it's up will be lost on refresh.

---

## PWA + Web Push (this release)

The installable app + phone notifications span both deploys.

### Backend (AWS) — extra steps for this release
- `npm install` pulls the new `web-push` and `@resvg/resvg-js` deps.
- **Fonts:** `@resvg/resvg-js` rasterizes the home-screen icons with system
  fonts. On a bare box install a base font set (`fontconfig` + `fonts-dejavu`)
  or icon PNGs render blank.
- **VAPID env** (see `.env.example`): set `VAPID_PUBLIC_KEY`,
  `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`. Generate once with
  `npx web-push generate-vapid-keys`. Without them push is silently disabled and
  the in-app feed still works.
- On boot the log should read `[Push] Web Push enabled (VAPID configured).`
- Smoke-test: `curl -H "X-Tenant-ID: bhumi-propcity" https://api.re.delpat.in/api/v1/notifications/vapid`
  → `{ "enabled": true, "publicKey": "..." }`.

### Frontend (Vercel)
- `vercel.json` rewrites same-origin `/pwa/*` → the backend, so the manifest and
  icons load from the app's own origin (required for a real install + the firm's
  icon, not a generic shortcut). The destination is `https://api.re.delpat.in`
  — keep it in sync if the API domain ever changes.
- The service worker registers **only in production builds**, so test install +
  push on the deploy, never on `vite dev`.

### Verify on a phone (Chrome/Android)
1. Open the deploy, pick the workspace → the manifest wears that tenant's name.
2. Chrome menu shows **Install** (not "Add shortcut"); installed icon = the
   firm's initials on its brand color.
3. App → notification drawer → **Turn on phone alerts** → allow.
4. With the app closed, assign a lead to yourself → the push lands on the lock
   screen; tapping it deep-links to the lead.

One firm per device until per-tenant subdomains exist. Brave adds a bookmark
shortcut rather than a true install — use Chrome for the icon/install demo.
