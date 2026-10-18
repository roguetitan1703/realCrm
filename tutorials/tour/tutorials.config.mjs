// ============================================================================
// Feature tours of the real estate CRM by Delpat, for prospects: one long
// walkthrough per screen size (owner's desk, agent's phone), promo style with
// chapters. Engine: delpat-skills/tutorial-videos, run with
// `--config tutorials/tour/tutorials.config.mjs`.
//
// Recorded on the DEVELOPMENT app (:5173 + API :5001) against the demo-film
// firm, Limestone & Laurel Realty (Austin): a lived-in week of invented data,
// built by seed-demo-tenant (see cutroom films/demos/real-estate-crm/RUN.md).
// No reset here: that rebuild takes 7 minutes and is shared with the demo film,
// so rebuild by hand before a final take.
// ============================================================================
const PASSWORD = 'Demo@1234'
const LOGINS = { owner: 'rachel', agent: 'lauren' }

// The browser lives in Austin, or every time on screen reads 10.5 hours ahead.
const austin = {
  locale: 'en-US',
  timezoneId: 'America/Chicago',
  geolocation: { latitude: 30.2983, longitude: -97.7048 },
  permissions: ['geolocation', 'camera'],
}

export default {
  app: 'http://localhost:5173/demo-film',
  root: '../..',

  signIn: async ({ page, as, app }) => {
    // A desktop browser has no dialer: tel: would freeze the page.
    await page.addInitScript(() => {
      navigation.addEventListener('navigate', e => {
        if (String(e.destination.url).startsWith('tel:')) e.preventDefault()
      })
    })
    await page.goto(app, { waitUntil: 'networkidle' })
    await page.getByPlaceholder(/User ID/).fill(LOGINS[as])
    await page.getByPlaceholder('Your password').fill(PASSWORD)
    await page.getByRole('button', { name: /Sign in/ }).click()
    await page.waitForURL(/screen=/, { timeout: 20000 })
  },

  devices: {
    desk: { viewport: { width: 1600, height: 900 }, deviceScaleFactor: 2, ...austin },
    phone: {
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Mobile/15E148 Safari/604.1',
      viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, ...austin,
    },
  },

  // The DEVELOPMENT badge is not the product.
  hide: ['.env-mark'],

  targets: {
    nav: (page, label) => page.locator('.n-list a').filter({ hasText: new RegExp(String.raw`^\s*${label}\s*\d*\s*$`) }),
  },

  style: 'promo',

  brand: {
    label: 'Real Estate CRM',
    accent: '#1E6F52', ink: '#23231F', muted: '#77756E', paper: '#F6F5F2', backdrop: '#ECE8DF',
    fonts: { display: 'Space Grotesk', body: 'IBM Plex Sans' },
  },

  // Normal pace with a quick click flash (Om found 'fast' too quick, 18 Oct).
  tempo: 'steady',

  // ElevenLabs "Matilda" (Om's pick, 18 Oct). Paid per line; every line is
  // cached by the engine. The key comes from ELEVENLABS_API_KEY or cutroom's
  // .env, never from this repo.
  voice: { provider: 'elevenlabs', id: 'XrExE9yKIg1WjnnlVkGX', speed: 1, envFile: '../../../cutroom/.env' },
  lexicon: { CRM: 'C R M' },

  // Mixkit #282, calm warm hip-hop, 76 bpm (Om's pick, 18 Oct; Stock Music
  // Free License: commercial use, no attribution), from cutroom's library.
  music: { file: 'assets/mixkit-282.mp3', beatGrid: 'assets/mixkit-282.grid.json', volume: 0.16, duckUnderVoice: 0.35 },
}
