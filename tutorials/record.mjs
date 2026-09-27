// ============================================================================
// PLAYS A TUTORIAL ON THE REAL DESK, AND EITHER RECORDS IT OR TESTS IT
// ============================================================================
//   node tutorials/record.mjs add-agent-to-lead-pool     record, then render the MP4
//   node tutorials/record.mjs --test                     every tutorial, fast, no video
//   node tutorials/record.mjs <id> --no-render           capture only (then `npm run studio`)
//
// Once: `cd tutorials && npm install` (Remotion lives here, not in the app, so
// the app's build and Vercel never see it; free for a company of up to three).
// Needs the development frontend (:5173) and API (:5001) running. Every run
// first resets the `tutorial` firm (npm run seed:tutorial), so a take always
// starts from the same desk. Development only; that script refuses anything else.
//
// Recording is two halves. This file drives Chrome and writes down what
// happened: a sharp screen capture (CDP screencast at 2x) and a timeline of
// each step with where its target sat on screen. studio/ turns that into the
// video: the zoom, the cursor, the highlight and the captions are drawn there,
// from the timeline, not burned into the page.
//
// A step's target is found by its role and visible label, the same words its
// caption tells the viewer to look for, so a renamed button fails the test
// instead of quietly recording a video of the wrong thing.
// ============================================================================
import { chromium, devices } from 'playwright'
import { execSync } from 'child_process'
import fs from 'fs'
import path from 'path'
import { fileURLToPath, pathToFileURL } from 'url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(HERE, '..')
const APP = process.env.TUTORIAL_APP || 'http://localhost:5173'
const FIRM = 'tutorial'
const LOGINS = { owner: { id: 'neha@harbourline.example', password: 'Tutorial@2026' } }

// A desk tutorial is 1600×900 CSS pixels, captured at 2x so the composer can
// zoom to 1.6x and stay sharp on a 1920×1080 video.
const DEVICES = {
  desk: { viewport: { width: 1600, height: 900 }, deviceScaleFactor: 2 },
  phone: { ...devices['iPhone 13'], deviceScaleFactor: 3 },
}

// Pacing, in ms. The cursor travels during LEAD; DWELL lets the result land.
const LEAD = 1300, DWELL = 1000, TYPE_DELAY = 75

const args = process.argv.slice(2)
const flag = (f) => args.includes(f)
const TEST = flag('--test')
const ids = args.filter(a => !a.startsWith('--'))

async function load(id) {
  const file = path.join(HERE, 'scripts', `${id}.mjs`)
  if (!fs.existsSync(file)) throw new Error(`No tutorial "${id}" in tutorials/scripts/`)
  return (await import(pathToFileURL(file).href)).default
}

function locate(page, t) {
  // The sidebar's items are <a> with no href, so they have no role to find
  // them by; matched by their visible label instead.
  if (t.nav) return page.locator('.n-list a').filter({ hasText: new RegExp(String.raw`^\s*${t.nav}\s*\d*\s*$`) })
  if (t.placeholder) return page.getByPlaceholder(t.placeholder, { exact: true })
  if (t.label) return page.getByLabel(t.label, { exact: t.exact })
  if (t.text) return page.getByText(t.text, { exact: t.exact })
  if (t.css) return page.locator(t.css)
  return page.getByRole(t.role, { name: t.name, exact: t.exact })
}

// The development badge and anything else that is not the product.
const HIDE = '.env-mark{display:none!important}'

async function signIn(browser, who, device) {
  const ctx = await browser.newContext(DEVICES[device])
  const page = await ctx.newPage()
  await page.goto(`${APP}/${FIRM}`, { waitUntil: 'networkidle' })
  await page.getByPlaceholder(/User ID/).fill(LOGINS[who].id)
  await page.getByPlaceholder('Your password').fill(LOGINS[who].password)
  await page.getByRole('button', { name: /Sign in/ }).click()
  await page.waitForURL(/screen=/, { timeout: 20000 })
  const state = await ctx.storageState()
  await ctx.close()
  return state
}

async function play(browser, tut, { record }) {
  const storageState = await signIn(browser, tut.as, tut.device)
  const ctx = await browser.newContext({ ...DEVICES[tut.device], storageState })
  const page = await ctx.newPage()
  await page.addInitScript((css) => {
    addEventListener('DOMContentLoaded', () => { const s = document.createElement('style'); s.textContent = css; document.head.appendChild(s) })
  }, HIDE)
  const errors = []
  page.on('pageerror', e => errors.push(e.message))
  await page.goto(`${APP}/${FIRM}/${tut.start || ''}`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(record ? 1500 : 300)

  const out = path.join(HERE, 'public', 'rec', tut.id)
  const frames = []
  let cdp, t0 = Date.now()
  if (record) {
    fs.rmSync(out, { recursive: true, force: true })
    fs.mkdirSync(out, { recursive: true })
    cdp = await ctx.newCDPSession(page)
    const vp = DEVICES[tut.device].viewport, dsf = DEVICES[tut.device].deviceScaleFactor
    cdp.on('Page.screencastFrame', async ({ data, sessionId, metadata }) => {
      const file = `f${String(frames.length).padStart(5, '0')}.jpg`
      fs.writeFileSync(path.join(out, file), Buffer.from(data, 'base64'))
      frames.push({ t: Math.round(metadata.timestamp * 1000) - t0, file })
      try { await cdp.send('Page.screencastFrameAck', { sessionId }) } catch { /* closing */ }
    })
    t0 = Date.now()
    await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 92, maxWidth: vp.width * dsf, maxHeight: vp.height * dsf, everyNthFrame: 1 })
    await page.waitForTimeout(1200)
  }
  const now = () => Date.now() - t0
  const pause = (ms) => (record ? page.waitForTimeout(ms) : Promise.resolve())

  const shown = tut.steps.filter(s => s.say)
  const timeline = []
  for (const step of tut.steps) {
    if (step.expect) {
      const e = step.expect
      const loc = e.text && !e.role ? page.getByText(e.text, { exact: e.exact }) : locate(page, e)
      await loc.first().waitFor({ state: 'visible', timeout: 8000 })
      if ('checked' in e) {
        // The screen settles after the save answers, so wait for it, briefly.
        let got
        for (let i = 0; i < 40 && (got = await loc.first().getAttribute('aria-checked')) !== String(e.checked); i++) await page.waitForTimeout(200)
        if (String(e.checked) !== got) throw new Error(`Expected ${String(e.name || e.text)} to be checked=${e.checked}, it is ${got}`)
      }
      continue
    }
    const target = step.click || step.type || step.point
    const kind = step.click ? 'click' : step.type ? 'type' : 'point'
    const loc = locate(page, target).first()
    try {
      await loc.waitFor({ state: 'visible', timeout: 8000 })
    } catch {
      throw new Error(`Step "${step.say}": nothing on screen matches ${JSON.stringify(target)}`)
    }
    if (step.waitEnabled) await page.waitForFunction(el => !el.disabled, await loc.elementHandle(), { timeout: 10000 })
    await loc.scrollIntoViewIfNeeded()
    const box = await loc.boundingBox()
    const tStart = now()
    await pause(LEAD)
    const tAct = now()
    if (kind === 'click') await loc.click()
    else if (kind === 'type') {
      await loc.click()
      if (record) await loc.pressSequentially(step.text, { delay: TYPE_DELAY })
      else await loc.fill(step.text)
    }
    await pause(DWELL + (step.after || 0) + (kind === 'type' ? 200 : 0))
    timeline.push({
      n: shown.indexOf(step) + 1, say: step.say, kind, zoom: step.zoom || 1, spotlight: step.spotlight !== false,
      box: box && { x: box.x, y: box.y, w: box.width, h: box.height }, tStart, tAct, tEnd: now(),
    })
  }

  if (record) {
    await page.waitForTimeout(800)
    await cdp.send('Page.stopScreencast')
    await page.waitForTimeout(300)
    const vp = DEVICES[tut.device].viewport
    const tl = {
      id: tut.id, title: tut.title, summary: tut.summary, outro: tut.outro, device: tut.device,
      viewport: vp, frames, steps: timeline, total: shown.length, duration: now(),
    }
    fs.writeFileSync(path.join(out, 'timeline.json'), JSON.stringify(tl, null, 1))
  }
  await ctx.close()
  if (errors.length) throw new Error(`The page threw while playing: ${errors.join(' | ')}`)
  return { frames: frames.length }
}

async function main() {
  const all = fs.readdirSync(path.join(HERE, 'scripts')).filter(f => f.endsWith('.mjs')).map(f => f.replace(/\.mjs$/, ''))
  const run = ids.length ? ids : TEST ? all : []
  if (!run.length) { console.log(`Which tutorial? ${all.join(', ')}`); process.exit(1) }

  let failed = 0
  for (const id of run) {
    const tut = await load(id)
    // Headless Chrome's screencast ignores the page's pixel density and sends
    // CSS-sized frames unless the whole browser is told the scale.
    const browser = await chromium.launch({ args: [`--force-device-scale-factor=${DEVICES[tut.device].deviceScaleFactor}`] })
    if (!flag('--no-seed')) execSync('npm run -s seed:tutorial', { cwd: ROOT, stdio: 'ignore' })
    try {
      const r = await play(browser, tut, { record: !TEST }).finally(() => browser.close())
      console.log(TEST ? `✓ ${id}` : `✓ ${id}: ${r.frames} frames captured`)
      if (!TEST && !flag('--no-render')) {
        fs.mkdirSync(path.join(HERE, 'out'), { recursive: true })
        execSync(`npx remotion render studio/index.jsx Tutorial out/${id}.mp4 --props="{\\"id\\":\\"${id}\\"}" --concurrency=4 --log=error`, { cwd: HERE, stdio: 'inherit' })
        console.log(`✓ tutorials/out/${id}.mp4`)
      }
    } catch (e) {
      failed++
      console.error(`✗ ${id}: ${e.message.split('\n')[0]}`)
    }
  }
  process.exit(failed ? 1 : 0)
}
main()
