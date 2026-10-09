# Product demo video and screenshots

What delpat.in/real-estate-crm shows (the page itself lives in the
`Delpat-Tech/webloom` repo, `src/app/real-estate-crm`, assets in
`public/real-estate-crm`). Both are made here, from the real app, with the
tutorial recorder (`delpat-skills/tutorial-videos`).

The firm on screen is **Amberleaf Realty** (`demo-showcase` on the development
database). Its firm, projects, builders, people and phone numbers (99555 block)
are all invented — `backend/src/scripts/demo-profiles/showcase.json`. Locality
names are public area names. Never record a paying firm.

## Remake them

Dev API (`npm run dev:api`) and app (`npm run dev`) running, then:

```bash
# the video: resets the firm (~6 min), records, narrates, renders out/product-tour.mp4
tutorial-videos record product-tour --config marketing/demo/tutorials.config.mjs
#   while iterating on the steps: add --no-reset (each take saves one call)

# the page's screenshots, same sign-in, devices and hidden badges as the video
node marketing/demo/screens.mjs            # → out/screens/*.png
```

Check the video before using it: `tutorial-videos probe product-tour …` must show
`yuv420p(tv, bt709)` and an audio stream; look at `still`/`frame` PNGs.

The page uses WebP copies: full-size `dashboard`, `signin`, `phone-today`, and
`leads`, `calling`, `listing`, `performance` cropped to the content (from x=470,
y=150 to 3200×1606 on the 3200×1800 PNG — no sidebar), plus `demo.mp4`,
`demo-poster.jpg` (frame at 9 s) and `og.jpg`.

Shoot during working hours: Today and Performance count today's activity, and
at night they are empty. Which leads are overdue moves with the clock, so the
tour opens the first overdue lead rather than a named one.
