# Real Estate CRM — the product page

Lives at **https://realestate.delpat.in/crm**, served by this repo's Vercel
deployment: the page is the static file `public/crm/index.html` (Vite copies
`public/` into the build untouched), and `vercel.json` rewrites `/crm` to it
ahead of the app's catch-all. No build step, no JavaScript. The delpat.in
site's source was not on this machine, so it lives here; link to it from
delpat.in when that site is to hand.

`crm` is a reserved firm address (`RESERVED_SLUGS` in `provisionTenant`), so no
firm can ever be given `/crm`. This README is kept out of `public/` because it
names the demo firm's sign-in.

The CSS tokens follow delpat.in (Manrope headings, Inter body, primary
`#125e8a`, secondary `#197bbd`, accent `#10b981`, light `#fff9fb` / dark
`#050002`). Dark mode follows `prefers-color-scheme` and an `html.dark` class.

## Files

| File | What it is |
|---|---|
| `public/crm/index.html` | The page: hero, problem, features, lead sources, white-label, screens, who it's for, closing CTA, footer |
| `public/crm/images/*.webp` | Screenshots of the real app (≈ 300 KB total) |
| `public/crm/images/og.jpg` | 1200×630 link-preview image |

## Before it goes live

- **Book a demo** is `mailto:om@delpat.in?subject=Real%20estate%20CRM%20demo` in
  three places (top bar, hero, closing band). Swap for the contact page if one exists.
- `og:image`, `twitter:image`, `og:url` and `canonical` are absolute URLs on
  `https://realestate.delpat.in/crm`. Change them if the page moves.
- **Sign in** in the top bar goes to `/`, the firm picker.

## The screenshots are a demo firm, not a client

Taken from **Amberleaf Realty** (`/demo-showcase` on the development database).
Every name in it is invented: the firm, its projects and builders, its team and
its leads. Phone numbers are in the `99555` fiction block. Locality names
(Alkapuri, Gotri, Makarpura GIDC…) are public area names. No client data, name
or logo appears anywhere on the page.

To rebuild the firm or retake screens (development only; the dev API and
`npm run dev` must be running for the listing photos):

```bash
npx tsx backend/src/scripts/seed-demo-tenant.ts --profile=showcase --env=development --write
npx tsx backend/src/scripts/seed-demo-tenant.ts --profile=showcase --env=development --refresh   # bring dates to today
```

Sign in at `/demo-showcase` as `hitesh` (owner) or `krupa` (agent), password
`Demo@1234`. Hide the DEVELOPMENT badge with `.env-mark{display:none}` before
capturing. Capture during working hours: at night "today" shows no calls.

## What the page claims, and what it deliberately does not

Every feature on the page was checked against the code on 9 Oct 2026. Left out
on purpose:

| Not claimed | Why |
|---|---|
| Your own domain | Custom domains are parked (`docs/specs/branding.md`); every firm is at `realestate.delpat.in/<firm>` |
| Facebook / Meta lead ads, Google Ads | No native integration. A website or tool that can POST a webhook is covered by "Your website" |
| WhatsApp API, auto-sent messages, call recording | Messages open in the agent's own WhatsApp; calls use the phone's dialler |
| Outbound webhooks / Zapier | The sender exists in code but nothing triggers it |
| Weighted or territory routing | Only round-robin is implemented |
| Hindi, Gujarati | Message templates are English and Marathi only; the app itself is in English |
| Audit log | Exists, but is not something a firm's owner can open |
| Customer counts, testimonials, uptime | None stated, by instruction |
