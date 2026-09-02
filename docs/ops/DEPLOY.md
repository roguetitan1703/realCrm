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

Runs under **PM2** as `re-api`, from `ecosystem.config.cjs` in the repo root.
That file is the authority on the start command — read it rather than typing a
`pm2 start` from memory, which is how production ended up running `tsx watch`
for months (see `docs/STATE.md`, 2026-08-22).

Routine deploy — this is what `deploy.sh` on the box does:

```bash
cd ~/realestate
git pull origin main
npm install
pm2 restart re-api
```

**Confirm the boot banner every time.** It names the environment and the
database, and is the only thing that shows the process is what you think it is:

```
🟢 PRODUCTION · port 5000 · db zxdid…
```

If it says `local`, `APP_ENV` is not reaching the process and the
wrong-database check is disarmed — stop and fix that before anything else.

If the PM2 entry is ever lost or has to be rebuilt:

```bash
pm2 delete re-api
pm2 start ecosystem.config.cjs
pm2 save          # without this it does not survive a reboot
```

Never run the API through `npm run`, `tsx watch`, or `run-api.ts` in
production. Each of those puts a process between PM2 and the server that
outlives a crash, so PM2 reports `online` while the API is dead.

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

---

## Media / visit-proof (B4) — ONE-TIME bucket setup

Photos live in Cloudflare R2 (`re-delpat`). The bucket stays **private**: no
public access, no custom domain. Node holds the S3 credentials and is the only
thing that talks to R2.

- **Download** — `GET /files/:key` on the API streams from R2 with
  `Cache-Control: immutable, max-age=1y` plus ETag/304, backed by a local disk
  cache (2 days for images, 7 for video). Objects are never overwritten — a
  replaced photo is a NEW key — so nothing can go stale and there is no cache
  invalidation anywhere.
- **Upload** — a presigned PUT from the browser straight to R2, so multi-MB
  phone photos never pass through Express.

### Required: CORS on the bucket

Uploads are browser→R2 directly, so **without this rule every upload fails with
a CORS error** while everything else keeps working. This cannot be scripted with
the object-scoped R2 token (`PutBucketCors` needs bucket-admin), so set it by
hand once:

Cloudflare dashboard → **R2** → `re-delpat` → **Settings** → **CORS Policy** →
Edit, and paste:

```json
[
  {
    "AllowedOrigins": [
      "https://realestate.delpat.in",
      "https://api.re.delpat.in",
      "http://localhost:5173",
      "http://localhost:5000"
    ],
    "AllowedMethods": ["PUT"],
    "AllowedHeaders": ["content-type"],
    "ExposeHeaders": ["etag"],
    "MaxAgeSeconds": 3600
  }
]
```

Only `PUT` is needed: downloads go through our own API, never to R2 from the
browser. `content-type` must be allowed because the presigned signature pins it.
Add any new frontend origin here or uploads from it will fail.

### Env
Set `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`,
`R2_BUCKET_NAME`, `R2_ENDPOINT` (see `.env.example`). Leave
`R2_PUBLIC_BASE_URL` unset — it exists only if the bucket is ever made public.

Postgres stores the object **key**, never a URL, so moving delivery to a CDN
hostname later is a one-line frontend change with no data migration.

### Verify
1. On a phone, open a lead with a **Site Visit** appointment → **Log visit**.
2. It asks for location first; deny it and the flow stops there (by design).
3. Allow, take the photo, pick an outcome, save.
4. The lead timeline shows a **Site visit** entry with the watermarked photo.
5. Sign in as another agent → the entry is visible but the photo is not
   ("Proof on file"). Owners and managers see every photo.

---

## The development backend, on the same EC2 box

Production and development run side by side: two checkouts, two PM2 apps, two
ports, two hostnames. Nothing is stopped to look at the other, and neither can
be mistaken for the other because each names its environment in its own banner.

| | production | development |
|---|---|---|
| checkout | `~/realestate` (`main`) | `~/realestate-dev` (`development`) |
| PM2 app | `re-api` | `re-api-dev` |
| port | 5000 | 5001 |
| config | `ecosystem.config.cjs` | `ecosystem.development.config.cjs` |
| database | `DATABASE_URL` | `DEV_DATABASE_URL` |
| hostname | `api.re.delpat.in` | `api.dev.re.delpat.in` |

**Why a second checkout and not a branch switch.** `git checkout development` in
`~/realestate` would swing the LIVE API onto unreleased code the moment PM2
restarted it. The two must be able to disagree.

### One-time setup

```bash
# 1. Second checkout. A worktree shares .git, so one fetch updates both.
cd ~/realestate
git worktree add ~/realestate-dev development
cd ~/realestate-dev
npm install

# 2. Config. .env* are NOT in git — copy them across, then point the
#    development one at the development database.
cp ~/realestate/.env ~/realestate-dev/.env
# .env already carries DEV_DATABASE_URL; nothing else differs.

# 3. Start it.
pm2 start ecosystem.development.config.cjs
pm2 save
pm2 logs re-api-dev --lines 30     # must read: 🟡 DEVELOPMENT · port 5001 · db <dev ref>
```

### DNS + Caddy

Add an A record for `api.dev.re.delpat.in` pointing at the same Elastic IP, then
add this block to the Caddyfile — it is the production block with two numbers
changed:

```caddy
api.dev.re.delpat.in {
	reverse_proxy localhost:5001
}
```

```bash
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl reload caddy
curl -s https://api.dev.re.delpat.in/health
```

Caddy provisions the certificate on first request, so give it a few seconds.

### Then, and only then, the Vercel preview

`VITE_API_URL` is baked in at **build time**, and an HTTPS page cannot call an
HTTP API, so a preview built against `http://localhost:5001` cannot work from
Vercel — it is not a configuration you can fix after deploying.

```bash
# locally, in .env.development:
VITE_API_URL=https://api.dev.re.delpat.in

npm run deploy:dev        # vercel builds it remotely, from the Preview env
```

`--prebuilt` is deliberately NOT used: it deploys `.vercel/output`, which only
`vercel build` produces, and this repo's build writes `dist`. The build happens
on Vercel instead, so `VITE_API_URL` comes from the project's **Preview**
environment variable rather than from a local file — one place, and a laptop
with a stale `.env.development` cannot ship a preview pointed at production.

Branch Tracking stays OFF; previews are deployed from the CLI on purpose, so a
push never costs a build. Confirm the deployed preview's environment marker
reads DEVELOPMENT before typing anything into it — the marker is read from the
API, which is the only thing that knows which database it holds.

### Updating development later

```bash
cd ~/realestate-dev && git pull && npm install && pm2 restart re-api-dev
```
