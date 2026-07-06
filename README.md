# Bhumi Propcity — CRM demo

A clickable, white-label real-estate CRM demo for a Pune brokerage. Pure static
front-end (HTML/CSS/JS, no build step, no backend). All data is in-memory and
resets on refresh — perfect for a repeatable live walkthrough.

## Run locally
Just open `index.html` in a browser. That's it.

Any phone number + any OTP logs you in. Narrow the window (or use a phone /
device toolbar) for the mobile field-tool; a wide window shows the desktop
back-office.

## Deploy (pick one — both work, it's a static site)

### Vercel (fastest, best mobile link)
- **Web:** vercel.com → New Project → import this folder / repo → deploy. No
  settings needed (`vercel.json` is included).
- **CLI:** `npm i -g vercel` then run `vercel` in this folder and follow the prompts.

### GitHub Pages
1. Push this folder to a GitHub repo.
2. Repo → Settings → Pages → Source: `main` branch, `/root`.
3. Your link is `https://<user>.github.io/<repo>/`.

All asset paths are relative, so it works from any subpath.

## White-label / rebrand
Everything brand-specific lives in **`theme.js`** (`brand` object) — firm name,
monogram, city line. Change it there and it updates everywhere, including the
WhatsApp message sign-offs. The next brokerage is a config swap, not a rebuild.

## Files
- `index.html` — shell (fonts, animations, script loads)
- `theme.js` — brand + design tokens
- `data.js` — seed data + matching + WhatsApp message generation
- `app.js` — state container + all view-models + CRUD
- `render.js` — the Actions rail component
- `screens.js` — mobile screens
- `desktop.js` — desktop back-office
- `main.js` — modals, search, toasts, render loop
