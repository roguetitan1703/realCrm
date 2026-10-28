// A manager at a desk: same screens as the owner, scoped by role.
import test, { before, after } from 'node:test'
import assert from 'node:assert/strict'
import { launch, newSession, setup, go, MANAGER, call, login } from './helpers.mjs'

let browser, page, mgrToken
before(async () => {
  await setup()
  mgrToken = await login(MANAGER)
  browser = await launch()
  ;({ page } = await newSession(browser, MANAGER, { label: 'manager-desk' }))
})
after(async () => { await browser?.close() })

test('manager: Dashboard, Leads, Calling, Team and Performance load', async () => {
  for (const q of ['screen=dashboard', 'screen=leads', 'screen=calling', 'screen=team', 'screen=performance']) {
    await go(page, q)
    assert.ok((await page.locator('body').innerText()).length > 200, `${q} rendered nothing`)
    assert.equal(await page.locator('input[type=password]').count(), 0, `${q} bounced to sign-in`)
  }
})

test('manager: Import is offered (desk role) and the import list is readable', async () => {
  await go(page, 'screen=leads')
  assert.ok(await page.getByRole('button', { name: 'Import' }).first().isVisible())
  assert.equal((await call('GET', '/imports', mgrToken)).status, 200)
})

test('manager: sees the whole roster, not just themselves', async () => {
  const u = await call('GET', '/team/users', mgrToken)
  assert.equal(u.status, 200)
  assert.ok((u.json.users || []).length > 1)
})

test('manager: Team today rows are present on the Dashboard', async () => {
  await go(page, 'screen=dashboard')
  assert.match(await page.locator('body').innerText(), /TEAM TODAY/i)
})
