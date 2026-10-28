# The real estate CRM by Delpat

A white-label CRM that Delpat sells to real estate firms. Leads arrive from the
property portals and the firm's own forms, are routed to agents, and are worked
by phone: calls, WhatsApp, follow-ups, site visits, through to a closed deal.
Alongside them it keeps the firm's listings, owners, tenants and buyers. Each
firm is a workspace at its own address (`/<firm>`), and every row in the
database belongs to exactly one firm. It is in production with paying firms.

## Who uses it

- **An agent, on a phone, between calls.** They want the next person to ring
  and a way to record what happened with one thumb.
- **The firm's owner or manager, at a desk.** They want to know whether the
  team is working the book and where it is stuck, by agent.

Every screen belongs to one of the two. [CLAUDE.md](./CLAUDE.md) is the working
agreement for anyone changing the code; read it before your first change.

## What you need

- **Node 20 or newer** (`node --version`)
- **Postgres 15 or newer**, running on your machine. Either install it
  (postgresql.org/download) or run it in Docker:

  ```
  docker run -d --name realcrm-pg -e POSTGRES_PASSWORD=postgres -p 5432:5432 postgres:16
  ```

No accounts, keys or files from Delpat are needed.

## Set up

```
git clone <this repository> realcrm
cd realcrm
npm install
npm run setup:local
```

`setup:local` expects the Postgres user `postgres` with password `postgres` on
port 5432. If yours differs, say so once:

```
npm run setup:local -- --db=postgres://USER:PASSWORD@localhost:PORT/realcrm
```

It creates the `realcrm` database, writes `.env` (only if you have none), builds
the schema and seeds a demo firm, `delpat`, with made-up people: leads,
owners, flats and a few days of the team's work. Running it again changes
nothing except bringing the dates up to today.

## Run

In two terminals:

```
npm run dev:api     # the API, http://localhost:5001
npm run dev         # the app, http://localhost:5173
```

Open **http://localhost:5173/delpat** and sign in. The password is `00000000`
for everyone:

| Role    | Login            |
|---------|------------------|
| Owner   | `akashpatel`     |
| Manager | `siddharthvarma` |
| Agent   | `kavish` (also `mohit`, `aniket`, `rupali`) |

The agent's view is the phone one: narrow the window or use the browser's
device toolbar.

The demo data never goes stale. Each time the API starts, and after midnight
while it runs, every date in the demo firm moves forward by the days that have
passed, so there is always work overdue and due today. To do it without the
API: `npm run dev:refresh`.

Email, push notifications and photo upload are off in a local setup; the API
says so in one line when it starts. Everything else works.

## Test

With both `dev:api` and `dev` running:

```
npx playwright install chromium   # once
npm run test:smoke
```

The smoke tests sign in as the owner (desk), the manager and an agent (iPhone
13 size) and walk the main flows. They refuse to run against anything but
localhost.

Before you push: `npm run build` (the only valid frontend check; it needs
`VITE_API_URL`, which `.env` has) and `npm run check:api`.

## Where things are

| Path | What |
|---|---|
| `src/modules/` | One file per screen; `definitions.jsx` drives every module |
| `src/components/` | Shared pieces: lists, records, sheets, toolbars |
| `src/lib/` | API client, store, formatting |
| `backend/src/routes/` | The HTTP API, one router per area |
| `backend/src/services/` | Everything the routes call; `db.ts` holds the schema (`initSchema`) |
| `backend/src/scripts/` | Seeders and maintenance tools, each with a header saying when to run it |
| `tests/smoke/` | The smoke tests |
| `docs/` | `STATE.md` (where things stand), `BACKLOG.md` (the work), `specs/` (designs) |

## Do not

- **Run `npm run dev:api:prod`.** It connects to the production database and
  writes to it.
- **Open or sign in to a client firm's workspace** (`bhumi`, `mahalaxmi`).
  Work in `delpat`, which is made-up data.
- **Push to `main`.** Every commit to it deploys. Work on a branch.
- **Commit `.env`** or put a real person's details in seed data.
