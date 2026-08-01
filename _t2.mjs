import { chromium } from 'playwright'
import jwt from 'jsonwebtoken'
import { readFileSync } from 'fs'
for (const line of readFileSync('.env','utf8').split('\n')) { const m=line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/); if(m) process.env[m[1]]=m[2].replace(/^["']|["']$/g,'') }
const { sql } = await import('./backend/src/services/db.ts')
const u = (await sql`SELECT id, tenant_id, role FROM users WHERE tenant_id='skyline-realty' AND role='owner' AND deleted_at IS NULL LIMIT 1`)[0]
const token = jwt.sign({ kind:'user', tenant_id:u.tenant_id, user_id:u.id, role:u.role }, process.env.JWT_SECRET, { expiresIn:'1h' })
const b = await chromium.launch({ headless:true })
const ctx = await b.newContext({ viewport:{width:390,height:844}, isMobile:true, hasTouch:true })
const p = await ctx.newPage()
p.on('pageerror', e=>console.log('PAGEERR:', e.message))
await p.addInitScript(([t,tid])=>{localStorage.setItem('crm_auth_token',t);localStorage.setItem('crm_tenant_id',tid)},[token,u.tenant_id])
await p.goto('http://localhost:5173/?autologin&ws=skyline-realty&screen=today'); await p.waitForTimeout(4000)
console.log('groups:', await p.locator('.q-head').allInnerTexts())
await p.screenshot({ path:'t2.png' })
await b.close(); process.exit(0)
