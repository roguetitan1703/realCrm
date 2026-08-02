import { chromium } from 'playwright';
import jwt from 'jsonwebtoken'; import fs from 'fs';
const S = fs.readFileSync('.env','utf8').match(/JWT_SECRET=(.*)/)[1].trim();
const T = jwt.sign({kind:'user',tenant_id:'delpat',user_id:'owner_delpat',role:'owner'},S,{expiresIn:'2h'});

async function probe(label, viewport) {
  const b = await chromium.launch();
  const c = await b.newContext({ viewport });
  await c.addInitScript(([t])=>{localStorage.setItem('crm_auth_token',t);localStorage.setItem('crm_tenant_id','delpat');localStorage.setItem('crm_auth_session',JSON.stringify({loggedIn:true,role:'admin',activeAgentId:'owner_delpat',tenantName:'Delpat'}))},[T]);
  const p = await c.newPage();
  const errs=[]; p.on('pageerror',e=>errs.push('PAGEERROR: '+e.message.split('\n')[0]));
  p.on('console',m=>{if(m.type()==='error')errs.push('console: '+m.text().slice(0,160))});
  console.log(`\n=== ${label}`);
  await p.goto('http://localhost:5173/delpat?screen=leads&autologin',{waitUntil:'networkidle',timeout:30000});
  await p.waitForTimeout(2200);
  await p.locator('table tbody tr, .grid-cards > *, .lrow, [class*="row"]').first().click().catch(()=>{});
  await p.waitForTimeout(2200);

  // assign
  const more = p.getByText(/^More/i).first();
  if (await more.count()) { await more.click(); await p.waitForTimeout(500); }
  const assign = p.getByText(/Reassign owner|Assign owner/i).first();
  if (await assign.count()) {
    await assign.click(); await p.waitForTimeout(1600);
    const t = await p.locator('body').innerText();
    const i = t.indexOf('to an agent');
    console.log('  assign modal:', i>=0 ? t.slice(i, i+220).replace(/\n+/g,' | ') : 'NOT SHOWN');
    await p.keyboard.press('Escape'); await p.waitForTimeout(500);
  } else console.log('  assign entry: NOT FOUND');

  // attach property
  const att = p.getByText(/Attach property/i).first();
  if (await att.count()) {
    await att.click(); await p.waitForTimeout(2200);
    const t = await p.locator('body').innerText();
    const i = t.indexOf('Attach a property');
    console.log('  attach modal:', i>=0 ? t.slice(i, i+300).replace(/\n+/g,' | ') : 'NOT SHOWN');
  } else console.log('  attach entry: NOT FOUND');

  console.log(errs.length? '  '+[...new Set(errs)].slice(0,4).join('\n  ') : '  no errors');
  await b.close();
}
await probe('desk 1440x900', {width:1440,height:900});
await probe('phone 390x844', {width:390,height:844});
