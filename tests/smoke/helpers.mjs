// Shared pieces for the smoke tests. DEVELOPMENT backend only: it refuses to run
// against anything but localhost, and the workspace is always `delpat`.
//
//   tsx backend/src/scripts/run-api.ts --env=development --port=5191
//   VITE_API_URL=http://localhost:5191 DEV_API_URL=http://localhost:5191 npx vite --port 5190
//   npm run test:smoke
import { chromium, devices } from 'playwright'

export const WEB = process.env.SMOKE_WEB || 'http://localhost:5190'
export const API = process.env.SMOKE_API || 'http://localhost:5191/api/v1'
export const TENANT = 'delpat'
const LOCAL = /^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/
if (!LOCAL.test(API) || !LOCAL.test(WEB)) {
  throw new Error('smoke tests run against a local development stack only')
}

export const OWNER = { handle: 'akashpatel', password: '00000000' }
// The seeded synthetic agent and manager. setup() gives them a known password
// through the owner's reset-password route (development data only).
export const PW = 'Smoke#Pass12'
export const AGENT = { id: 'u_team_1785582498593_1', handle: 'kavish', password: PW }
export const MANAGER = { id: 'u_team_1785582499967_2', handle: 'siddharthvarma', password: PW }

export async function call(method, path, token, body) {
  const r = await fetch(API + path, {
    method,
    headers: { 'Content-Type': 'application/json', 'X-Tenant-ID': TENANT, ...(token ? { Authorization: 'Bearer ' + token } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  let json = null
  try { json = await r.json() } catch { /* empty body */ }
  return { status: r.status, json }
}

export async function login(user) {
  const r = await call('POST', '/auth/login', null, { handle: user.handle, password: user.password })
  if (r.status !== 200) throw new Error(`login ${user.handle}: ${r.status}`)
  return r.json.token
}

export async function resetFixtures() {
  const t = await login(OWNER)
  for (const u of [AGENT, MANAGER]) {
    const r = await call('POST', `/team/users/${u.id}/reset-password`, t, { password: PW, mustChangePassword: false })
    if (r.status !== 200) throw new Error(`reset ${u.handle}: ${r.status}`)
  }
  return t
}
let prepared
export function setup() { return (prepared ||= resetFixtures()) }

/** A lead that is not the agent's, from the owner's full list. */
export async function colleagueLead(ownerToken) {
  const r = await call('GET', '/leads/page?limit=200', ownerToken)
  const row = (r.json?.data || []).find(l => l.agentId && l.agentId !== AGENT.id)
  if (!row) throw new Error('no colleague lead in the development data')
  return row
}

export const issues = []   // console errors and failed requests, across every page
const EXPECTED = [/\/auth\/login/, /favicon/, /manifest/]
export const expectedUrls = []   // a test that provokes a refusal on purpose lists the path here

export function watch(page, label) {
  page.on('console', m => { if (m.type() === 'error') issues.push(`[${label}] console: ${m.text().slice(0, 200)}`) })
  page.on('pageerror', e => issues.push(`[${label}] pageerror: ${String(e).slice(0, 200)}`))
  page.on('response', r => {
    const s = r.status(), u = r.url()
    if (s >= 400 && !EXPECTED.some(x => x.test(u)) && !expectedUrls.some(x => u.includes(x))) issues.push(`[${label}] ${s} ${r.request().method()} ${u.replace(WEB, '').replace(API, '').slice(0, 120)}`)
  })
  page.on('requestfailed', r => { if (!/ERR_ABORTED/.test(r.failure()?.errorText || '')) issues.push(`[${label}] failed ${r.method()} ${r.url().slice(0, 100)}`) })
}

export const launch = () => chromium.launch()

export async function newSession(browser, user, { phone = false, label = user.handle } = {}) {
  const ctx = await browser.newContext(phone ? { ...devices['iPhone 13'] } : { viewport: { width: 1440, height: 900 } })
  const page = await ctx.newPage()
  watch(page, label)
  await page.goto(`${WEB}/${TENANT}`)
  await page.locator('input[type=text]:visible').first().fill(user.handle)
  await page.locator('input[type=password]:visible').fill(user.password)
  await page.keyboard.press('Enter')
  await page.waitForFunction(() => !document.querySelector('input[type=password]'), null, { timeout: 15000 })
  await page.waitForTimeout(2500)
  return { ctx, page }
}

export const go = async (page, query) => { await page.goto(`${WEB}/${TENANT}?${query}`); await page.waitForTimeout(2500) }

process.on('exit', () => {
  if (!issues.length) return
  console.log(`\n# smoke: ${issues.length} console/network issue(s)`)
  for (const i of [...new Set(issues)]) console.log('#  ' + i)
})
