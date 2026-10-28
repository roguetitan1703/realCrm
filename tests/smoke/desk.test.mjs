// Owner at a desk (1440x900). Reads only, except the probe lead/remark noted below.
import test, { before, after } from 'node:test'
import assert from 'node:assert/strict'
import { launch, newSession, setup, resetFixtures, go, OWNER, WEB, TENANT, call } from './helpers.mjs'

let browser, page, ownerToken
const writes = []
const NL = String.fromCharCode(10)

before(async () => {
  ownerToken = await setup()
  browser = await launch()
  ;({ page } = await newSession(browser, OWNER, { label: 'owner-desk' }))
  page.on('request', r => { if (r.method() !== 'GET' && r.url().includes('/api/v1/')) writes.push(`${r.method()} ${r.url().split('/api/v1')[1]}`) })
})
after(async () => { await browser?.close() })

const pagerTotal = async () => {
  const t = await page.locator('.pager, [class*=pager]').first().innerText()
  const m = t.match(/of\s+(\d+)/)
  return m ? Number(m[1]) : null
}
const pillCount = async () => Number(await page.locator('.segpill.on .segpill-c').innerText())
const sortCaret = (label) => page.locator('table th', { hasText: label }).first().innerText()

test('Dashboard tiles land on lists whose count matches and a chip shows', async () => {
  for (const [tile, urlPart, chip] of [['Not contacted', 'seg=never_contacted', '.segpill.on'],
                                       ['Follow-up overdue', 'seg=overdue', '.segpill.on'],
                                       ['Callbacks overdue', 'tab=callbacks_overdue', '.segpill.on']]) {
    await go(page, 'screen=dashboard')
    const card = page.locator('a, button, div').filter({ hasText: new RegExp('^' + tile + NL + '?\\s*\\d+$') }).last()
    const n = Number((await card.innerText()).match(/(\d+)\s*$/)[1])
    await card.click()
    await page.waitForTimeout(2500)
    assert.ok(page.url().includes(urlPart), `${tile}: landed on ${page.url()}`)
    assert.ok(await page.locator(chip).first().isVisible(), `${tile}: no active chip`)
    assert.equal(await pagerTotal(), n, `${tile}: tile says ${n}, list says ${await pagerTotal()}`)
    assert.equal(await pillCount(), n, `${tile}: tile says ${n}, its pill says ${await pillCount()}`)
  }
})

// THE CALLING QUEUE ROW AND THE SIDEBAR BADGE. Every callback figure on the
// desk is a segment of the calling catalogue (backend leadSegments.ts) and
// opens the pill of that segment: the figure, the pill and the rows are one
// predicate. "Callbacks due 7" opened the whole Callbacks tab of 15, and
// "Later today 0" opened the same 15. (The queue's "Never called" opens the New
// tab, which counts a status, not a dial; its name waits on the firm.)
test('Calling queue figures and the Calling badge each open their own pill, and the counts agree', async () => {
  for (const [label, key] of [['Callbacks overdue', 'callbacks_overdue'], ['Callbacks later today', 'callbacks_today'], ['Unassigned', 'unassigned']]) {
    await go(page, 'screen=dashboard')
    const fig = page.locator('.qfig-i').filter({ has: page.locator('.qfig-l', { hasText: new RegExp('^' + label + '$') }) })
    assert.equal(await fig.count(), 1, `no "${label}" in the calling queue row`)
    const n = Number(await fig.locator('.qfig-v').innerText())
    await fig.click()
    await page.waitForTimeout(2500)
    assert.ok(page.url().includes('tab=' + key), `${label}: landed on ${page.url()}`)
    const on = page.locator('.segpill.on')
    assert.ok(await on.isVisible(), `${label}: no active pill`)
    assert.ok((await on.innerText()).startsWith(label), `${label}: active pill is "${await on.innerText()}"`)
    assert.equal(await pillCount(), n, `${label}: figure ${n}, pill ${await pillCount()}`)
    const rows = n ? await pagerTotal() : await page.locator('table.tbl tbody tr').count()
    assert.equal(rows, n, `${label}: figure ${n}, list ${rows}`)
  }
  await go(page, 'screen=calling')
  const badge = page.locator('nav').locator('a, button').filter({ hasText: /^Calling/ }).locator('.n-badge')
  const b = (await badge.count()) ? Number(await badge.innerText()) : 0
  const pill = page.locator('.segpill').filter({ hasText: /^Callbacks overdue/ })
  assert.equal(Number(await pill.locator('.segpill-c').innerText()), b, `Calling badge ${b}, Callbacks overdue pill ${await pill.innerText()}`)
})

// "Missed" is not "overdue": a follow-up is missed once its DAY has ended
// (services/activityReport.ts); one due at 11 am today is overdue at noon but
// not missed until tomorrow. So the rows add up to the overdue leads whose day
// is over, read from the same overdue list the tile opens. Comparing with the
// tile itself only held while nothing was due earlier today.
test('Team today rows add up to the overdue follow-ups from before today', async () => {
  await go(page, 'screen=dashboard')
  const overdue = Number((await page.locator('a, button, div').filter({ hasText: new RegExp('^Follow-up overdue' + NL + '?\\s*\\d+$') }).last().innerText()).match(/(\d+)\s*$/)[1])
  const list = await call('GET', '/leads/page?segment=overdue&limit=200', ownerToken)
  assert.equal(list.json.total, overdue, `overdue tile ${overdue}, overdue list ${list.json.total}`)
  const day = (d) => new Date(d).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
  const missed = list.json.data.filter(l => l.followUp?.at && day(l.followUp.at) < day(Date.now())).length
  const body = await page.locator('body').innerText()
  const sum = [...body.matchAll(/(\d+) missed follow-ups?/g)].reduce((a, m) => a + Number(m[1]), 0)
  assert.equal(sum, missed, `Team today rows sum ${sum}, overdue from before today ${missed}`)
})

test('Performance loads', async () => {
  await go(page, 'screen=performance')
  assert.ok((await page.locator('body').innerText()).length > 200)
  assert.equal(await page.locator('.error, [class*=err]:visible').count(), 0)
})

test('Import is visible to the owner', async () => {
  await go(page, 'screen=leads')
  assert.ok(await page.getByRole('button', { name: 'Import' }).first().isVisible())
  assert.ok(await page.locator('nav').getByText('Import', { exact: true }).isVisible())
})

for (const [name, query, hasTable] of [['Leads', 'screen=leads', true], ['Calling', 'screen=calling', false], ['Contacts', 'screen=clients', true]]) {
  test(`header sort flips both ways on ${name}`, async () => {
    await go(page, query)
    if (!hasTable) { await page.getByRole('button', { name: /Group by project/ }).click(); await page.waitForTimeout(1500) }
    const th = page.locator('table th:not([style*="cursor: default"])').filter({ hasText: /\w/ }).first()
    const label = (await th.innerText()).replace(/[▲▼]/g, '').trim()
    await th.click(); await page.waitForTimeout(1200)
    const a = await sortCaret(label)
    await th.click(); await page.waitForTimeout(1200)
    const b = await sortCaret(label)
    await th.click(); await page.waitForTimeout(1200)
    const c = await sortCaret(label)
    assert.ok(/[▲▼]/.test(a) && /[▲▼]/.test(b), `${name}: no caret (${a} / ${b})`)
    assert.notEqual(a.match(/[▲▼]/)[0], b.match(/[▲▼]/)[0], `${name}: second click did not flip`)
    assert.equal(a.match(/[▲▼]/)[0], c.match(/[▲▼]/)[0], `${name}: third click did not flip back`)
  })
}

test('Leads: toolbar direction and header caret are one state', async () => {
  await go(page, 'screen=leads&sortKey=name&sortDir=asc')
  const th = page.locator('table th', { hasText: 'Name' }).first()
  await th.click(); await page.waitForTimeout(1200)
  assert.ok(page.url().includes('sortDir=desc'), `url after header click: ${page.url()}`)
  assert.ok((await th.innerText()).includes('▼'))
})

test('a row menu closes when its button scrolls out of view', async () => {
  await go(page, 'screen=leads&seg=all')
  // A row near the top: a page of 20 rows scrolls only ~400px, so row 10,
  // scrolled into view first, could not travel far enough to leave the screen.
  const btn = page.locator('table.tbl tbody tr:nth-child(3) .stg-btn').first()
  await btn.scrollIntoViewIfNeeded()
  await btn.click()
  await page.waitForTimeout(500)
  assert.equal(await page.locator('.pop-anchored').count(), 1, 'menu did not open')
  // Wheel over the list, never over the open menu: a wheel on the menu scrolls
  // the menu, and where the menu sits depends on how wide the columns came out.
  const pop = await page.locator('.pop-anchored').boundingBox()
  await page.mouse.move(pop.x > 600 ? pop.x - 250 : pop.x + pop.width + 250, 500)
  await page.mouse.wheel(0, 1800)
  await page.waitForTimeout(700)
  assert.equal(await page.locator('.pop-anchored').count(), 0, 'menu stayed open after its button scrolled away')
})

test('Esc: New lead closes when empty and holds when typed', async () => {
  await go(page, 'screen=leads')
  await page.getByRole('button', { name: 'New lead' }).click()
  await page.getByPlaceholder('Client Name').waitFor()
  await page.keyboard.press('Escape'); await page.waitForTimeout(500)
  assert.equal(await page.getByPlaceholder('Client Name').count(), 0, 'empty New lead did not close on Esc')
  await page.getByRole('button', { name: 'New lead' }).click()
  await page.getByPlaceholder('Client Name').fill('typed text')
  await page.keyboard.press('Escape'); await page.waitForTimeout(500)
  assert.equal(await page.getByPlaceholder('Client Name').count(), 1, 'typed New lead closed on Esc (work lost)')
  await page.getByPlaceholder('Client Name').press('Escape')
  await page.locator('.m-head button, .modal button').first().click().catch(() => {})
})

test('Esc: Schedule follow-up and the search panel close', async () => {
  await go(page, 'screen=leads&seg=all')
  // The name cell: the middle of a row can be its status control, which opens a menu instead.
  await page.locator('table.tbl tbody tr').nth(2).locator('td').nth(1).click()
  await page.getByRole('button', { name: /Schedule follow-up/ }).first().click()
  await page.getByText('Activity Type').waitFor()
  await page.keyboard.press('Escape'); await page.waitForTimeout(500)
  assert.equal(await page.getByText('Activity Type').count(), 0, 'Schedule follow-up did not close on Esc')
  await go(page, 'screen=dashboard')
  await page.getByText(/Search leads, properties, clients/).first().click()
  await page.getByPlaceholder(/Search leads, properties, people/).waitFor()
  await page.keyboard.press('Escape'); await page.waitForTimeout(500)
  assert.equal(await page.getByPlaceholder(/Search leads, properties, people/).count(), 0, 'search panel did not close on Esc')
})

test('sidebar collapses, survives reload, and keeps Contacts sub-items in both states', async () => {
  await go(page, 'screen=clients')
  const subs = async () => page.evaluate(() => ['Owners', 'Tenants', 'Buyers'].map(l =>
    !!([...document.querySelectorAll('nav a, nav button')].find(e => e.innerText.trim() === l || (e.title || '').startsWith(l) || e.getAttribute('aria-label') === l))))
  assert.deepEqual(await subs(), [true, true, true], 'expanded: sub-items missing')
  await page.getByRole('button', { name: 'Collapse sidebar' }).click()
  await page.waitForTimeout(400)
  assert.ok(await page.locator('nav.collapsed').count() === 1)
  assert.deepEqual(await subs(), [true, true, true], 'collapsed: sub-items missing')
  await page.reload(); await page.waitForTimeout(2500)
  assert.equal(await page.locator('nav.collapsed').count(), 1, 'collapse did not survive reload')
  await page.getByRole('button', { name: 'Expand sidebar' }).click()
  await page.waitForTimeout(400)
  assert.equal(await page.locator('nav.collapsed').count(), 0)
  await page.reload(); await page.waitForTimeout(2500)
  assert.equal(await page.locator('nav.collapsed').count(), 0, 'expand did not survive reload')
  for (const sub of ['Owners', 'Tenants', 'Buyers']) {
    await page.locator('nav').getByText(sub, { exact: true }).click(); await page.waitForTimeout(1500)
    assert.ok(/screen=clients/.test(page.url()), `${sub}: ${page.url()}`)
  }
})

test('back keeps the filter: list -> lead -> property -> back -> back', async () => {
  await go(page, 'screen=leads&seg=all')
  await page.locator('input[placeholder^="Search leads"]').fill('Aarav Gupta'); await page.waitForTimeout(2000)
  const listUrl = page.url()
  assert.equal(await page.locator('table.tbl tbody tr').count(), 1, 'search did not narrow the list to one row')
  await page.locator('table.tbl tbody tr').first().locator('td').nth(1).click(); await page.waitForTimeout(1500)
  const prop = page.locator('button:has-text("Shortlisted"), button:has-text("Open flat"), a:has-text("Open flat")').first()
  assert.ok(await prop.count(), 'the lead has no openable property (dev data changed?)')
  await prop.click(); await page.waitForTimeout(1500)
  assert.ok(/screen=properties/.test(page.url()), `property did not open: ${page.url()}`)
  await page.goBack(); await page.waitForTimeout(1500)
  assert.ok(/lead=/.test(page.url()) && /q=Aarav/.test(page.url()), `first back lost the lead or the filter: ${page.url()}`)
  await page.goBack(); await page.waitForTimeout(2000)
  assert.equal(page.url(), listUrl, 'second back did not return to the filtered list')
  assert.equal(await page.locator('input[placeholder^="Search leads"]').inputValue(), 'Aarav Gupta')
})

test('back keeps page and scroll: page 2, scrolled -> lead -> back', async () => {
  await go(page, 'screen=leads&seg=all')
  await page.locator('.pager-num', { hasText: '2' }).first().click(); await page.waitForTimeout(1500)
  const pager = async () => (await page.locator('.pager').first().innerText()).replace(/\s+/g, ' ')
  const before = await pager()
  assert.match(before, /21.40 of/)
  const scrollTop = () => page.evaluate(() => document.querySelector('.app-body').scrollTop)
  await page.evaluate(() => { document.querySelector('.app-body').scrollTop = 700 }); await page.waitForTimeout(600)
  const y = await scrollTop()
  // click a row that is already in view so the click itself does not move the scroll
  const box = await page.evaluate(() => {
    const r = [...document.querySelectorAll('table.tbl tbody tr')].map(e => e.getBoundingClientRect()).find(b => b.top > 150 && b.bottom < 850)
    return r ? { x: r.left + 400, y: r.top + r.height / 2 } : null
  })
  assert.ok(box, 'no row in view')
  await page.mouse.click(box.x, box.y); await page.waitForTimeout(1500)
  assert.ok(/lead=/.test(page.url()), `row click did not open a lead: ${page.url()}`)
  await page.goBack(); await page.waitForTimeout(2200)
  assert.match(await pager(), /21.40 of/, 'page 2 was not kept')
  const y2 = await scrollTop()
  assert.ok(Math.abs(y2 - y) < 80, `scroll was ${y}, came back at ${y2}`)
})

test('Calling: select all -> Bulk assign -> take back -> Cancel moves nothing', async () => {
  await go(page, 'screen=calling')
  await page.getByRole('button', { name: /Group by project/ }).click(); await page.waitForTimeout(1500)
  await page.locator('table thead input[type=checkbox]').check()
  await page.getByRole('button', { name: /^Select all \d+/ }).click()
  await page.waitForTimeout(500)
  await page.getByRole('button', { name: 'Bulk assign' }).click()
  await page.locator('.pick-unassign').click()
  await page.getByRole('button', { name: 'Cancel' }).first().waitFor()
  writes.length = 0
  await page.getByRole('button', { name: 'Cancel' }).first().click()
  await page.waitForTimeout(800)
  assert.equal(writes.filter(w => /owners\/bulk-assign/.test(w)).length, 0, `cancel still wrote: ${writes}`)
})

test('New lead form saves on desk (probe removed)', async () => {
  await go(page, 'screen=leads')
  await page.getByRole('button', { name: 'New lead' }).click()
  const stamp = `Smoke ${Date.now() % 100000}`
  await page.getByPlaceholder('Client Name').fill(stamp)
  await page.getByPlaceholder('98765 43210').fill(`98${String(Date.now()).slice(-8)}`)
  await page.getByRole('button', { name: /Create Lead Record/ }).click()
  await page.waitForTimeout(2500)
  const r = await call('GET', `/leads/page?limit=5&q=${encodeURIComponent(stamp)}`, ownerToken)
  const row = (r.json?.data || []).find(l => l.name === stamp)
  assert.ok(row, 'created lead not found')
  await call('POST', '/leads/bulk-delete', ownerToken, { ids: [row.id] })
})

test('Calendar renders on desk', async () => {
  await go(page, 'screen=calendar')
  assert.match(await page.locator('body').innerText(), /(January|February|March|April|May|June|July|August|September|October|November|December)/)
})

test('credential copy carries the workspace link', async () => {
  await go(page, 'screen=team')
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write'])
  await page.locator('.rowmenu-btn').nth(1).click()
  await page.getByText('Reset password').click()
  await page.getByRole('button', { name: 'Set New Password' }).click()
  await page.waitForTimeout(3500)
  await page.locator('.modal button', { hasText: 'Copy' }).first().click()
  await page.waitForTimeout(400)
  const text = await page.evaluate(() => navigator.clipboard.readText())
  assert.ok(text.includes(`${WEB}/${TENANT}`), 'copied text has no workspace URL')
  await resetFixtures()   // the reset above changed a dev user's password; give the fixtures theirs back
})
