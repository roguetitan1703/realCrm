import { chromium } from 'playwright'
import jwt from 'jsonwebtoken'
import { readFileSync } from 'fs'
process.chdir('d:/Work/Delpat/projects/realCrm')
for (const line of readFileSync('.env','utf8').split('\n')) { const m=line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/); if(m) process.env[m[1]]=m[2].replace(/^["']|["']$/g,'') }
const { sql } = await import('file:///d:/Work/Delpat/projects/realCrm/backend/src/services/db.ts')
const WS = process.argv[2] || 'delpat'
const u = (await sql`SELECT id, tenant_id, role FROM users WHERE tenant_id=${WS} AND role='owner' AND deleted_at IS NULL LIMIT 1`)[0]
const token = jwt.sign({ kind:'user', tenant_id:u.tenant_id, user_id:u.id, role:u.role }, process.env.JWT_SECRET, { expiresIn:'1h' })
const b = await chromium.launch({ headless:true })
const ctx = await b.newContext({ viewport:{width:390,height:844}, isMobile:true, hasTouch:true, deviceScaleFactor:2 })
const p = await ctx.newPage()
p.on('pageerror', e=>console.log('PAGEERR:', e.message))
await p.addInitScript(([t,tid])=>{localStorage.setItem('crm_auth_token',t);localStorage.setItem('crm_tenant_id',tid)},[token,u.tenant_id])
await p.goto(`http://localhost:5173/?autologin&ws=${WS}`); await p.waitForTimeout(3500)

console.log('=== TODAY ===')
console.log('install card    :', await p.locator('.install-card').count(), '| dismiss X gone:', await p.locator('.install-card-x').count()===0)
console.log('groups          :', (await p.locator('.q-head').allInnerTexts()).map(s=>s.replace(/\n/g,' ')).join(' | '))
await p.screenshot({ path:'shot-today.png' })

// --- a property record ---
await p.locator('.tabbar a, .tabbar button').filter({ hasText:/Props/i }).first().click(); await p.waitForTimeout(1500)
await p.locator('.tbl tbody tr, .rcard, .pcard').first().click(); await p.waitForTimeout(1800)
console.log('\n=== PROPERTY ===')
const panels = await p.locator('.app-body .panel .sh .t, .app-body .panel .sh-toggle .t').allInnerTexts()
console.log('section order   :', panels.join(' → '))
const idxPhotos = panels.findIndex(t=>/photo/i.test(t))
console.log('photos first?   :', idxPhotos === 0 || idxPhotos === -1 ? (idxPhotos===-1?'(no photos on this record)':'YES') : 'NO at '+idxPhotos)
const sib = p.locator('.sh-toggle').filter({ hasText:/Other units/i })
if (await sib.count()) {
  console.log('other-units     : collapsible, open=', await sib.first().evaluate(el=>el.classList.contains('open')))
  console.log('  rows shown    :', await p.locator('.tbl-scroll .tbl tbody tr').count())
  await sib.first().click(); await p.waitForTimeout(400)
  console.log('  after tap rows:', await p.locator('.tbl-scroll .tbl tbody tr').count())
} else console.log('other-units     : (record has no siblings)')
// record sheet density: how many rs-rows share a grid row (same offsetTop)
const dens = await p.locator('.rs-grid').first().evaluate(g => {
  const rows = [...g.querySelectorAll('.rs-row')]
  const tops = new Set(rows.map(r => r.offsetTop))
  return { fields: rows.length, gridRows: tops.size }
})
console.log('sheet density   :', dens.fields, 'fields in', dens.gridRows, 'rows →', (dens.fields/Math.max(1,dens.gridRows)).toFixed(2), 'per row')
console.log('h-scroll?       :', await p.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth))
await p.screenshot({ path:'shot-prop.png', fullPage:false })

// --- WhatsApp composer ---
console.log('\n=== WA COMPOSER ===')
const waBtn = p.locator('.rh-act').filter({ hasText:/WhatsApp/i })
if (await waBtn.count()) {
  await waBtn.first().click(); await p.waitForTimeout(900)
  // pickBuyer modal may come first
  const pick = p.locator('.modal .relrow-main, .modal .p-item, .modal button').first()
  if (await p.locator('.wa-sheet').count() === 0 && await pick.count()) { await pick.click(); await p.waitForTimeout(900) }
}
if (await p.locator('.wa-sheet').count() === 0) {
  // open from a lead instead
  await p.keyboard.press('Escape')
  await p.locator('.tabbar a, .tabbar button').filter({ hasText:/Leads/i }).first().click(); await p.waitForTimeout(1500)
  await p.locator('.tbl tbody tr, .rcard').first().click(); await p.waitForTimeout(1800)
  const w = p.locator('.rh-act').filter({ hasText:/WhatsApp/i })
  if (await w.count()) { await w.first().click(); await p.waitForTimeout(900) }
  const send = p.locator('.modal button').filter({ hasText:/whatsapp|send|compose/i })
  if (await p.locator('.wa-sheet').count()===0 && await send.count()) { await send.first().click(); await p.waitForTimeout(1000) }
}
if (await p.locator('.wa-sheet').count()) {
  const box = await p.locator('.wa-sheet').boundingBox()
  console.log('sheet box       :', JSON.stringify(box))
  console.log('full width?     :', Math.round(box.width) === 390)
  console.log('bottom-anchored?:', Math.round(box.y + box.height) === 844)
  console.log('grab handle     :', await p.locator('.wa-grab').isVisible())
  const foot = await p.locator('.wa-foot .btn').all()
  for (const f of foot) { const bb = await f.boundingBox(); console.log('  foot btn      :', (await f.innerText()).replace(/\n/g,' '), Math.round(bb.width)+'x'+Math.round(bb.height)) }
  await p.screenshot({ path:'shot-wa.png' })
} else console.log('could not open the composer from this record')

await b.close(); process.exit(0)
