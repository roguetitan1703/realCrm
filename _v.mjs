import { chromium } from 'playwright'
import jwt from 'jsonwebtoken'
import { readFileSync } from 'fs'
for (const line of readFileSync('.env','utf8').split('\n')) { const m=line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/); if(m) process.env[m[1]]=m[2].replace(/^["']|["']$/g,'') }
const { sql } = await import('./backend/src/services/db.ts')
const u = (await sql`SELECT id, tenant_id, role FROM users WHERE tenant_id='delpat' AND role='owner' AND deleted_at IS NULL LIMIT 1`)[0]
const lead = (await sql`SELECT id FROM crm_leads WHERE tenant_id='delpat' AND phone IS NOT NULL ORDER BY created_at DESC LIMIT 1`)[0]
const token = jwt.sign({ kind:'user', tenant_id:u.tenant_id, user_id:u.id, role:u.role }, process.env.JWT_SECRET, { expiresIn:'1h' })
const b = await chromium.launch({ headless:true })
const ctx = await b.newContext({ viewport:{width:390,height:844}, isMobile:true, hasTouch:true })
const p = await ctx.newPage()
p.on('pageerror', e=>console.log('PAGEERR:', e.message))
await p.addInitScript(([t,tid])=>{localStorage.setItem('crm_auth_token',t);localStorage.setItem('crm_tenant_id',tid)},[token,u.tenant_id])
await p.goto(`http://localhost:5173/?autologin&ws=delpat&screen=properties&prop=prop_rsale_test_1785580076492_5162`); await p.waitForTimeout(4500)
console.log('rail (.dl-rail) present :', await p.locator('.dl-rail').count(), '(want 0)')
console.log('follow-up card (.fu-card):', await p.locator('.fu-card').count(), '(want 0)')
console.log('action bar              :', await p.locator('.rh-act').allInnerTexts())
console.log('first visible card text :', (await p.locator('.app-body').innerText()).slice(0,80).replace(/\n/g,' | '))

console.log('nba banner (.nba):', await p.locator('.nba, .nba-banner').count(), '(want 0)')
await p.screenshot({ path:'v-prop.png' })
await b.close(); process.exit(0)
