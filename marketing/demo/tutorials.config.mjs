// ============================================================================
// The product demo and the product page's screenshots, recorded with the
// tutorial engine (delpat-skills/tutorial-videos; see its SKILL.md).
//
//   tutorial-videos record product-tour --config marketing/demo/tutorials.config.mjs
//   tutorial-videos inspect --as owner --start '?screen=leads' --config marketing/demo/tutorials.config.mjs
//
// Recorded against the DEVELOPMENT app (:5173 + API :5001) on `demo-showcase`,
// Amberleaf Realty: every firm, project, person and phone number in it is
// invented (backend/src/scripts/demo-profiles/showcase.json). The seeder
// refuses production. The look is Delpat's, not the CRM's: this video sits on
// delpat.in.
// ============================================================================
const PASSWORD = 'Demo@1234'
const LOGINS = { owner: 'hitesh', manager: 'nirav', agent: 'krupa' }

export default {
  app: 'http://localhost:5173/demo-showcase',
  root: '../..',
  // Rebuilds the whole firm (~6 min with photos): run once per final take, and
  // pass --no-reset while iterating.
  reset: 'npx tsx backend/src/scripts/seed-demo-tenant.ts --profile=showcase --env=development --write',

  signIn: async ({ page, as, app }) => {
    await page.goto(app, { waitUntil: 'networkidle' })
    await page.getByPlaceholder(/User ID/).fill(LOGINS[as])
    await page.getByPlaceholder('Your password').fill(PASSWORD)
    await page.getByRole('button', { name: /Sign in/ }).click()
    await page.waitForURL(/screen=/, { timeout: 20000 })
  },

  hide: ['.env-mark'],

  targets: {
    nav: (page, label) => page.locator('.n-list a').filter({ hasText: new RegExp(String.raw`^\s*${label}\s*\d*\s*$`) }),
  },

  // delpat.in's light theme: navy ink (titles, the caption bar, menu text all
  // use it, so it must be dark), Delpat green for the ring and step badge.
  brand: {
    label: 'Real Estate CRM by Delpat',
    accent: '#10b981', ink: '#0c2b3e', muted: '#5b6470', paper: '#ffffff', backdrop: '#eef4f8',
    fonts: { display: 'Manrope', body: 'Inter' },
  },

  voice: { name: 'af_heart', speed: 1.05 },

  // A product video, not a click-by-click tutorial: lines over shots, chapter
  // labels, a branded close (see the engine's studio/edit.js and Tutorial.jsx).
  style: 'promo',
  pacing: { lead: 900, dwell: 700 },
  // The CRM's own loading indicators; while one shows, the edit cuts the wait.
  busy: ['.list-spin', '.mp-spin', '.cam-loading'],
  // How the narrator reads what the captions write.
  lexicon: {
    'delpat.in': 'delpat dot in',
    CRM: 'C R M',
    '99acres': 'ninety-nine acres',
    'Housing.com': 'Housing dot com',
    MagicBricks: 'Magic Bricks',
  },
}
