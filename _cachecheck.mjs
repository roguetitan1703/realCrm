import { chromium } from 'playwright'
import jwt from 'jsonwebtoken'
import { readFileSync } from 'fs'
for (const line of readFileSync('.env','utf8').split('\n')) { const m=line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/); if(m) process.env[m[1]]=m[2].replace(/^["']|["']$/g,'') }
const { sql } = await import('./backend/src/services/db.ts')
const u = (await sql`SELECT id, tenant_id, role FROM users WHERE tenant_id='delpat' AND role='owner' AND deleted_at IS NULL LIMIT 1`)[0]
const token = jwt.sign({ kind:'user', tenant_id:u.tenant_id, user_id:u.id, role:u.role }, process.env.JWT_SECRET, { expiresIn:'1h' })

const b = await chromium.launch({ headless:true })
const ctx = await b.newContext({ viewport:{ width:1440, height:900 } })
const p = await ctx.newPage()
const errs = []
p.on('pageerror', e => errs.push('PAGEERR: ' + e.message.split('\n')[0]))
p.on('console', m => { if (m.type()==='error') errs.push('console: ' + m.text().slice(0,140)) })
let calls = 0; const urls = []
p.on('request', r => { const x = r.url(); if (x.includes('/api/v1/')) { calls++; urls.push(x.replace(/.*\/api\/v1/,'')) } })

await p.addInitScript(([t,tid])=>{localStorage.setItem('crm_auth_token',t);localStorage.setItem('crm_tenant_id',tid)},[token,u.tenant_id])
await p.goto('http://localhost:5173/?autologin&ws=delpat&screen=dashboard')
await p.waitForTimeout(3000)
console.log('initial load:', calls, 'API calls')

for (const key of ['Leads','Properties','Dashboard','Leads','Properties','Dashboard']) {
  const before = calls
  await p.getByText(key, { exact:true }).first().click({ timeout:3000 }).catch(()=>{})
  await p.waitForTimeout(1200)
  console.log(`  -> ${key.padEnd(11)} ${String(calls-before).padStart(2)} calls   ${urls.slice(before).join('  ')}`)
}

// The teammate roster the user reports as empty.
await p.getByText('Leads', { exact:true }).first().click({ timeout:3000 }).catch(()=>{})
await p.waitForTimeout(1500)
await p.locator('table tbody tr, .grid-cards > *').first().click({ timeout:3000 }).catch(()=>{})
await p.waitForTimeout(1800)
const more = p.getByText(/^More/i).first()
if (await more.count()) { await more.click().catch(()=>{}); await p.waitForTimeout(500) }
const assign = p.getByText(/Reassign owner|Assign owner/i).first()
if (await assign.count()) {
  await assign.click().catch(()=>{}); await p.waitForTimeout(1500)
  const t = await p.locator('body').innerText()
  const i = t.indexOf('to an agent')
  console.log('assign roster:', i>=0 ? t.slice(i, i+200).replace(/\n+/g,' | ') : 'EMPTY / NOT SHOWN')
} else console.log('assign entry: NOT FOUND')

console.log(errs.length ? 'ERRORS: ' + [...new Set(errs)].slice(0,4).join(' | ') : 'no errors')
await b.close(); process.exit(0)
