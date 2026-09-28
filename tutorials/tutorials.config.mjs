// ============================================================================
// Nivaas tutorial videos. Engine: delpat-skills/tutorial-videos
// (`tutorial-videos record <id>`, `tutorial-videos test`). See its SKILL.md.
//
// Recorded against the DEVELOPMENT app (:5173 + API :5001) on the `tutorial`
// firm, Harbourline Realty: invented people, reset by seed:tutorial before
// every take. The seed refuses to run against production.
// ============================================================================
const PASSWORD = 'Tutorial@2026'
const LOGINS = { owner: 'neha@harbourline.example', agent: 'rohan' }

export default {
  app: 'http://localhost:5173/tutorial',
  root: '..',
  reset: 'npm run -s seed:tutorial',

  signIn: async ({ page, as, app }) => {
    await page.goto(app, { waitUntil: 'networkidle' })
    await page.getByPlaceholder(/User ID/).fill(LOGINS[as])
    await page.getByPlaceholder('Your password').fill(PASSWORD)
    await page.getByRole('button', { name: /Sign in/ }).click()
    await page.waitForURL(/screen=/, { timeout: 20000 })
  },

  // The DEVELOPMENT badge is not the product.
  hide: ['.env-mark'],

  targets: {
    // The sidebar's items are <a> with no href, so they have no role to find
    // them by; matched by their visible label (and an optional count badge).
    nav: (page, label) => page.locator('.n-list a').filter({ hasText: new RegExp(String.raw`^\s*${label}\s*\d*\s*$`) }),
  },

  // Nivaas's own charcoal, linen and ochre, in its own type.
  brand: {
    accent: '#B7791F', ink: '#23231F', muted: '#77756E', paper: '#F6F5F2', backdrop: '#ECE8DF',
    fonts: { display: 'Space Grotesk', body: 'IBM Plex Sans' },
  },

  voice: { name: 'af_heart' },
}
