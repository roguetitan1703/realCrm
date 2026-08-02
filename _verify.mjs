import { chromium } from 'playwright';
import jwt from 'jsonwebtoken';
import fs from 'fs';

const SECRET = fs.readFileSync('.env', 'utf8').match(/JWT_SECRET=(.*)/)[1].trim();
const TOKEN = jwt.sign({ kind: 'user', tenant_id: 'delpat', user_id: 'owner_delpat', role: 'owner' }, SECRET, { expiresIn: '2h' });
const BASE = 'http://localhost:5173/delpat';

const DESK = [
  ['dashboard', '?screen=dashboard', /Overdue follow-ups/],
  ['leads', '?screen=leads', /Stage|Pipeline|New/],
  ['properties', '?screen=properties', /Listings|Available/],
  ['contacts/clients', '?screen=clients&tab=clients', /Clients|Buyers/],
  ['contacts/owners', '?screen=clients&tab=owners', /Owners|Sellers|Landlords/],
  ['calendar', '?screen=calendar', /Mon|Sun|January|February|March|April|May|June|July|August|September|October|November|December/],
  ['team', '?screen=team', /On the desk|Open leads/i],
  ['import', '?screen=import', /Import|Upload|spreadsheet/i],
];

async function run(label, viewport, routes) {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport });
  await ctx.addInitScript(([t]) => {
    localStorage.setItem('crm_auth_token', t);
    localStorage.setItem('crm_tenant_id', 'delpat');
    localStorage.setItem('crm_auth_session', JSON.stringify({ loggedIn: true, role: 'admin', activeAgentId: 'owner_delpat', tenantName: 'Delpat' }));
  }, [TOKEN]);
  const page = await ctx.newPage();

  const errors = [];
  page.on('pageerror', e => errors.push(`${label} pageerror: ${e.message.split('\n')[0]}`));
  page.on('console', m => { if (m.type() === 'error') errors.push(`${label} console: ${m.text().slice(0, 160)}`); });

  let bytes = 0, calls = 0;
  page.on('response', async r => {
    if (!r.url().includes('/api/v1/')) return;
    calls++;
    try { bytes += (await r.body()).length; } catch {}
  });

  console.log(`\n--- ${label} ---`);
  for (const [name, q, expect] of routes) {
    await page.goto(BASE + q + '&autologin', { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(1800);
    const text = await page.locator('body').innerText();
    const ok = expect.test(text);
    console.log(`  ${ok ? 'ok    ' : 'FAIL  '} ${name.padEnd(18)} ${String(text.trim().length).padStart(5)} chars`);
    if (!ok) console.log('        got: ' + text.replace(/\s+/g, ' ').slice(0, 220));
  }
  console.log(`  ${calls} API calls, ${bytes.toLocaleString()} bytes for the whole ${label} session`);

  // In-app navigation (no reload) is what the "it reloads every time" report is about.
  console.log('  -- in-app nav, second visit to each screen --');
  const before = calls;
  for (const key of ['dashboard', 'leads', 'properties', 'dashboard', 'leads']) {
    await page.getByRole('button', { name: new RegExp('^' + key, 'i') }).first().click().catch(() => {});
    await page.waitForTimeout(900);
  }
  console.log(`  ${calls - before} API calls across 5 screen switches`);

  await browser.close();
  return errors;
}

const e1 = await run('desk', { width: 1440, height: 900 }, DESK);
const e2 = await run('phone', { width: 390, height: 844 }, [
  ['today', '?screen=today', /Overdue|Due today|caught up|Today/i],
  ['leads', '?screen=leads', /New|Stage|lead/i],
  ['properties', '?screen=properties', /Available|Listings|sqft/i],
]);

const all = [...new Set([...e1, ...e2])];
console.log(all.length ? `\nERRORS (${all.length}):` : '\nNo page or console errors.');
for (const e of all.slice(0, 20)) console.log('  - ' + e);
