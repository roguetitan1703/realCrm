// The product page's screenshots, taken with the tutorial recorder's own
// config: the same demo firm, sign-in, devices (desk 1600x900 @2x, phone
// 390x844 @3x) and hidden dev badges as the demo video, so the page and the
// video show one product.
//
//   node marketing/demo/screens.mjs [outDir]     (dev app and API running)
//
// Writes PNGs; the page uses WebP copies of them.
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const here = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1'))
const out = path.resolve(process.argv[2] || path.join(here, 'out', 'screens'))
fs.mkdirSync(out, { recursive: true })

// The recorder's engine owns Playwright and the device presets.
const engine = path.dirname(fs.realpathSync(path.join(process.env.APPDATA || '', 'npm', 'node_modules', '@delpat', 'tutorial-videos', 'package.json')))
const req = createRequire(path.join(engine, 'package.json'))
const { chromium } = req('playwright')
const { loadConfig } = await import(pathToFileURL(path.join(engine, 'src', 'config.mjs')).href)
const cfg = await loadConfig(path.join(here, 'tutorials.config.mjs'))

const browser = await chromium.launch()
async function session(device, as) {
  const ctx = await browser.newContext(cfg.devices[device])
  const page = await ctx.newPage()
  if (as) await cfg.signIn({ page, as, app: cfg.app, device })
  return page
}
const hide = page => page.addStyleTag({ content: `${cfg.hide.join(',')}{display:none!important}` })
async function shot(page, name, settle = 2500) {
  await page.waitForLoadState('networkidle').catch(() => {})
  await page.waitForTimeout(settle)
  await hide(page)
  await page.screenshot({ path: path.join(out, `${name}.png`) })
  console.log('✓', name)
}
const go = (page, q) => page.goto(`${cfg.app}/${q}`, { waitUntil: 'networkidle' })

// The firm's own sign-in page, before anyone signs in.
{
  const page = await session('desk')
  await page.goto(cfg.app, { waitUntil: 'networkidle' })
  await shot(page, 'signin')
}

const desk = await session('desk', 'owner')
await go(desk, '?screen=dashboard'); await shot(desk, 'dashboard')
await go(desk, '?screen=leads'); await shot(desk, 'leads')
await go(desk, '?screen=calling'); await shot(desk, 'calling')
await go(desk, '?screen=properties'); await desk.waitForTimeout(2000)
await desk.getByText('Palm Grove Residency', { exact: true }).first().click()
await desk.waitForTimeout(2500)
await desk.getByText('D-304', { exact: true }).first().click()
await shot(desk, 'listing')
await go(desk, '?screen=performance'); await shot(desk, 'performance')

const phone = await session('phone', 'agent')
await shot(phone, 'phone-today')

await browser.close()
