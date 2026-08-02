import { chromium } from 'playwright';
import jwt from 'jsonwebtoken'; import fs from 'fs';
const S = fs.readFileSync('.env','utf8').match(/JWT_SECRET=(.*)/)[1].trim();
const T = jwt.sign({kind:'user',tenant_id:'delpat',user_id:'owner_delpat',role:'owner'},S,{expiresIn:'2h'});
const b = await chromium.launch(); const c = await b.newContext({viewport:{width:1440,height:900}});
await c.addInitScript(([t])=>{localStorage.setItem('crm_auth_token',t);localStorage.setItem('crm_tenant_id','delpat');localStorage.setItem('crm_auth_session',JSON.stringify({loggedIn:true,role:'admin',activeAgentId:'owner_delpat',tenantName:'Delpat'}))},[T]);
const p = await c.newPage();
const errs=[]; p.on('pageerror',e=>errs.push(e.message.split('\n')[0]));
p.on('console',m=>{if(m.type()==='error')errs.push('console: '+m.text().slice(0,140))});

await p.goto('http://localhost:5173/delpat?screen=leads&autologin',{waitUntil:'networkidle',timeout:30000});
await p.waitForTimeout(2000);
await p.locator('table tbody tr, .grid-cards > *').first().click();
await p.waitForTimeout(2000);
console.log('agents in store:', await p.evaluate(()=>document.querySelectorAll('.av').length));

// find an Assign affordance
for (const label of ['Assign','Reassign','Route']) {
  const el = p.getByText(label, { exact: false }).first();
  if (await el.count()) {
    console.log('clicking:', label);
    await el.click(); await p.waitForTimeout(1500);
    const t = await p.locator('body').innerText();
    const m = t.match(/Assign lead[\s\S]{0,400}/);
    console.log('MODAL:', m ? m[0].replace(/\n+/g,' | ') : '(no assign modal text)');
    break;
  }
}
console.log(errs.length?'ERRORS: '+[...new Set(errs)].slice(0,4).join(' | '):'no errors');
await b.close();
