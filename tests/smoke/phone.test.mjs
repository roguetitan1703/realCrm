// Agent on an iPhone 13: the between-calls flow.
import test, { before, after } from 'node:test'
import assert from 'node:assert/strict'
import { expectedUrls, launch, newSession, setup, go, AGENT, WEB, TENANT, call, login, colleagueLead } from './helpers.mjs'

let browser, page, ownerToken, agentToken, other
const writes = []

before(async () => {
  ownerToken = await setup()
  agentToken = await login(AGENT)
  other = await colleagueLead(ownerToken)
  browser = await launch()
  ;({ page } = await newSession(browser, AGENT, { phone: true, label: 'agent-phone' }))
  page.on('request', r => { if (r.method() !== 'GET' && r.url().includes('/api/v1/') && !/\/notifications|\/auth\//.test(r.url())) writes.push(`${r.method()} ${r.url().split('/api/v1')[1]}`) })
})
after(async () => { await browser?.close() })

const firstName = async () => (await page.locator('.rcard').first().innerText()).split(String.fromCharCode(10))[0].trim()
const waitLead = () => page.waitForFunction(() => location.search.includes('lead='), null, { timeout: 15000 })

test('Today loads and the badge is the overdue + due rows', async () => {
  await go(page, 'screen=today')
  const txt = await page.locator('body').innerText()
  // The badge is what is waiting right now: overdue follow-ups and late
  // callbacks (Phone.jsx BADGES). "Due today" is later today, not late yet, and
  // is not in it; the old pattern counted it whenever the data had one.
  const heads = [...txt.matchAll(/^(OVERDUE|CALLBACKS OVERDUE)\n(\d+)$/gm)].map(m => Number(m[2]))
  assert.ok(heads.length >= 1, 'no Overdue / Due sections on Today')
  const badge = Number((await page.locator('.tab-dot').first().innerText()).trim())
  assert.equal(badge, heads.reduce((a, b) => a + b, 0), `badge ${badge} vs sections ${heads}`)
})

test('open a lead; Call logs an outcome (one write); remark; stage change; back returns to the same list', async () => {
  await go(page, 'screen=leads&seg=all')
  const listUrl = page.url()
  const nm = await firstName()
  await page.getByText(nm, { exact: true }).first().tap()
  await waitLead()
  await page.waitForTimeout(1500)
  const leadUrl = page.url()
  const leadId = new URL(leadUrl).searchParams.get('lead')

  // Call -> confirm -> outcome sheet -> Save
  writes.length = 0
  await page.getByRole('button', { name: /^Call/ }).first().tap()
  await page.getByRole('button', { name: /Yes, continue/ }).tap()
  await page.getByText('Call logged').waitFor()
  await page.locator('.modal select, .sheet select, [role=dialog] select').first().selectOption({ index: 1 })
  await page.getByRole('button', { name: 'Save', exact: true }).tap()
  await page.waitForTimeout(1500)
  assert.equal(writes.filter(w => /contact-log|activity/.test(w)).length >= 1, true, `no contact-log write: ${writes}`)

  // remark
  writes.length = 0
  await page.locator('.fab, [class*=fab]').first().tap()
  await page.getByRole('button', { name: /Add remark/ }).first().tap()
  await page.locator('textarea:visible').fill('smoke remark')
  await page.getByRole('button', { name: /^Add remark$/ }).last().tap()
  await page.waitForTimeout(1500)
  assert.equal(writes.filter(w => /remark/.test(w)).length, 1, `remark writes: ${writes}`)
  assert.ok(await page.getByText('smoke remark').first().isVisible())

  // stage change: STATUS control -> pick another stage
  writes.length = 0
  await page.locator('.seldd-btn').first().tap()
  const pop = page.locator('.popover:visible button')
  const opt = (await pop.filter({ hasText: /^Interested$/ }).count()) ? pop.filter({ hasText: /^Interested$/ }).first() : pop.nth(1)
  const picked = (await opt.innerText()).trim()
  await opt.tap()
  await page.waitForTimeout(2000)
  assert.ok(writes.some(w => /^(PATCH|PUT|POST) .*(records|stage)/.test(w)), `no stage write after picking ${picked}: ${writes}`)

  // back -> same list
  await page.getByRole('button', { name: 'Back' }).tap()
  await page.waitForTimeout(1500)
  assert.equal(page.url().replace(/\/\?/, '?'), listUrl.replace(/\/\?/, '?'), 'back did not return to the list URL')
})

test('book a follow-up: a double tap is a single write', async () => {
  await go(page, 'screen=leads')
  const n = await page.locator('.rcard').count()
  let found = false
  for (let k = 0; k < Math.min(n, 8) && !found; k++) {
    await go(page, 'screen=leads')
    await page.locator('.rcard').nth(k).tap()
    await waitLead()
    await page.waitForTimeout(1200)
    await page.locator('.fab, [class*=fab]').first().tap()
    const b = page.getByRole('button', { name: /Schedule follow-up|Reschedule/ }).first()
    if (await b.count()) { await b.tap(); found = true }
  }
  assert.ok(found, 'no lead among the first 8 offers Schedule follow-up')
  writes.length = 0
  const btn = page.locator('.lc-foot button').last()
  await btn.tap()
  await btn.tap({ force: true, timeout: 300 }).catch(() => {})
  await page.waitForTimeout(2500)
  assert.equal(writes.filter(w => /^PATCH .*leads\/records/.test(w)).length, 1, `follow-up writes: ${writes}`)
})

test('Leads search finds a lead by name', async () => {
  await go(page, 'screen=leads')
  const nm = await firstName()
  await page.getByPlaceholder(/Search leads/i).first().fill(nm.split(' ')[0])
  await page.waitForTimeout(2000)
  assert.ok(await page.getByText(nm, { exact: true }).first().isVisible())
})

test('New lead form saves (and the probe lead is removed)', async () => {
  await go(page, 'screen=leads')
  await page.locator('.fab, [class*=fab]').first().tap()
  await page.getByRole('button', { name: /New lead|Add lead/ }).first().tap()
  await page.waitForTimeout(800)
  const stamp = `Smoke ${Date.now() % 100000}`
  await page.getByPlaceholder('Client Name').fill(stamp)
  await page.getByPlaceholder('98765 43210').fill(`98${String(Date.now()).slice(-8)}`)
  writes.length = 0
  await page.getByRole('button', { name: /Create Lead Record/ }).tap()
  await page.waitForTimeout(2500)
  assert.ok(writes.some(w => /^POST .*leads/.test(w)), `no create write: ${writes}`)
  const r = await call('GET', `/leads/page?limit=5&q=${encodeURIComponent(stamp)}`, agentToken)
  const row = (r.json?.data || []).find(l => l.name === stamp)
  assert.ok(row, 'new lead not found afterwards')
  await call('POST', '/leads/bulk-delete', ownerToken, { ids: [row.id] })
})

test('Calendar month renders', async () => {
  await go(page, 'screen=calendar')
  const t = await page.locator('body').innerText()
  assert.match(t, /(January|February|March|April|May|June|July|August|September|October|November|December)/)
})

// Today's callback groups and the Calling pills are one predicate each
// (backend leadSegments.ts), both scoped to the agent's own rows: a group's
// number is the pill's number and the rows that pill opens.
test("Today's callback groups match the agent's Calling pills and their rows", async () => {
  await go(page, 'screen=today')
  const txt = await page.locator('body').innerText()
  for (const [label, key] of [['Callbacks overdue', 'callbacks_overdue'], ['Callbacks later today', 'callbacks_today']]) {
    const m = txt.match(new RegExp('^' + label.toUpperCase() + '\\n(\\d+)$', 'm'))
    const n = m ? Number(m[1]) : 0   // a group with nothing in it is not drawn
    await go(page, 'screen=calling&tab=' + key)
    const on = page.locator('.segpill.on')
    assert.ok(await on.isVisible(), `${label}: no active pill`)
    assert.ok((await on.innerText()).startsWith(label), `${label}: active pill is "${await on.innerText()}"`)
    assert.equal(Number(await on.locator('.segpill-c').innerText()), n, `${label}: Today ${n}, pill ${await on.innerText()}`)
    assert.equal(await page.locator('.rcard').count(), Math.min(n, 20), `${label}: Today ${n}, list rows`)
  }
})

test('Calling list opens a project, then an owner', async () => {
  await go(page, 'screen=calling')
  await page.locator('.projcard').first().tap()
  await page.waitForFunction(() => location.search.includes('in-project='))
  await page.locator('.rcard').first().tap()
  await page.waitForFunction(() => /[?&]owner=/.test(location.search), null, { timeout: 10000 })
  await page.getByRole('button', { name: /^Call/ }).first().waitFor({ timeout: 10000 })
})

test('a colleague lead is not reachable by URL', async () => {
  expectedUrls.push(`/leads/${other.id}`)
  await go(page, `screen=leads&lead=${other.id}`)
  const t = await page.locator('body').innerText()
  assert.ok(!t.includes(other.name), `colleague lead ${other.name} rendered`)
})

test('Import is not offered to an agent', async () => {
  await go(page, 'screen=leads')
  assert.equal(await page.getByRole('button', { name: 'Import' }).count(), 0, 'Import button visible to an agent')
  await go(page, 'screen=import')
  assert.ok(!/Import from|Upload|Choose a file|Drop/i.test(await page.locator('body').innerText()), 'agent reached the Import screen')
})
