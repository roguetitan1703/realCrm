import { chromium } from 'playwright';
import jwt from 'jsonwebtoken'; import fs from 'fs';
const S = fs.readFileSync('.env','utf8').match(/JWT_SECRET=(.*)/)[1].trim();
const T = jwt.sign({kind:'user',tenant_id:'delpat',user_id:'owner_delpat',role:'owner'},S,{expiresIn:'2h'});
const b = await chromium.launch(); const c = await b.newContext({viewport:{width:1440,height:900}});
await c.addInitScript(([t])=>{localStorage.setItem('crm_auth_token',t);localStorage.setItem('crm_tenant_id','delpat');localStorage.setItem('crm_auth_session',JSON.stringify({loggedIn:true,role:'admin',activeAgentId:'owner_delpat',tenantName:'Delpat'}))},[T]);
const p = await c.newPage();
const errs=[]; p.on('pageerror',e=>errs.push('PAGEERROR: '+e.message.split('\n')[0]));
p.on('console',m=>{if(m.type()==='error')errs.push('console: '+m.text().slice(0,160))});
await p.goto('http://localhost:5173/delpat?screen=leads&autologin',{waitUntil:'networkidle',timeout:30000});
await p.waitForTimeout(2000);
await p.locator('table tbody tr, .grid-cards > *').first().click();
await p.waitForTimeout(2000);
const more = p.getByText(/^More/i).first();
if (await more.count()) { await more.click(); await p.waitForTimeout(600); }
const assign = p.getByText(/Reassign owner|Assign owner/i).first();
console.log('assign entry found:', await assign.count());
if (await assign.count()) { await assign.click(); await p.waitForTimeout(1800); }
const t = await p.locator('body').innerText();
const i = t.indexOf('Route');
console.log('MODAL TEXT:', i>=0 ? t.slice(i, i+400).replace(/\n+/g,' | ') : 'NO MODAL. tail: '+t.replace(/\s+/g,' ').slice(-300));
console.log(errs.length?[...new Set(errs)].slice(0,5).join('\n'):'no errors');
await b.close();
