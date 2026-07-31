import { chromium } from 'playwright';
import { spawn } from 'child_process';
import http from 'http';
import fs from 'fs';
import path from 'path';

const PORT = 5180;
const BASE_URL = `http://localhost:${PORT}`;
const ARTIFACT_DIR = 'C:\\Users\\VICTUS\\.gemini\\antigravity\\brain\\ab12c5df-1705-4bde-9768-7f55fc50a11c';

function waitForServer(url, timeoutMs = 15000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const check = () => {
      http.get(url, (res) => {
        if (res.statusCode === 200) {
          resolve();
        } else {
          retry();
        }
      }).on('error', retry);
    };

    const retry = () => {
      if (Date.now() - start > timeoutMs) {
        reject(new Error(`Server at ${url} did not respond within ${timeoutMs}ms`));
      } else {
        setTimeout(check, 500);
      }
    };

    check();
  });
}

async function runJourney() {
  console.log('[Journey] Starting backend server...');
  const backendProcess = spawn('npx', ['tsx', 'backend/src/index.ts'], {
    stdio: 'ignore',
    shell: true,
    env: { ...process.env, PORT: '5000' }
  });

  try {
    await waitForServer('http://localhost:5000/health', 25000);
    console.log('[Journey] Backend ready. Seeding data...');
    const postJson = (url, data) => new Promise((resolve) => {
      const u = new URL(url);
      const req = http.request({
        hostname: u.hostname,
        port: u.port || 5000,
        path: u.pathname,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Tenant-ID': 'bhumi-propcity' }
      }, (res) => {
        res.on('data', () => {});
        res.on('end', resolve);
      });
      req.on('error', resolve);
      if (data) req.write(JSON.stringify(data));
      req.end();
    });

    await postJson('http://localhost:5000/api/v1/workspace/reset');
    await postJson('http://localhost:5000/api/v1/leads', { name: 'Rahul Kolte', phone: '+91 98220 63914', agentId: 'a1', stage: 'New', req: { config: '2BHK', locality: 'Wakad', budget: 8500000, deal: 'sale' }, source: 'Referral' });
    await postJson('http://localhost:5000/api/v1/properties', { title: 'Tower A 2BHK Premium Unit', society: 'Megapolis Sunway', locality: 'Wakad', price: '85L', type: '2BHK', config: '2BHK', deal: 'sale', status: 'Available', tower: 'A', unit: '101', highlights: ['Corner unit'] });
  } catch (e) {
    console.warn('[Journey] Backend setup warning:', e.message);
  }

  console.log('[Journey] Starting Vite server...');
  const viteProcess = spawn('npx', ['vite', '--port', PORT.toString(), '--no-open'], {
    stdio: 'ignore',
    shell: true,
    env: process.env
  });

  let browser;
  try {
    await waitForServer(BASE_URL, 20000);
    console.log(`[Journey] App ready at ${BASE_URL}`);

    browser = await chromium.launch({ headless: true });
    
    // --- DESKTOP JOURNEY ---
    console.log('[Journey] Starting Desktop Flow');
    const desktopContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const desktopPage = await desktopContext.newPage();
    
    await desktopPage.goto(`${BASE_URL}/?demo&role=admin`);
    await desktopPage.waitForTimeout(2000);
    await desktopPage.screenshot({ path: path.join(ARTIFACT_DIR, '01_desktop_dashboard.png'), fullPage: true });

    console.log('[Journey] Navigating to Leads');
    await desktopPage.locator('.n-list a', { hasText: 'Leads' }).click();
    await desktopPage.waitForTimeout(1000);
    await desktopPage.screenshot({ path: path.join(ARTIFACT_DIR, '02_desktop_leads.png'), fullPage: true });

    console.log('[Journey] Navigating to Properties and testing filters');
    await desktopPage.locator('.n-list a', { hasText: 'Properties' }).click();
    await desktopPage.waitForTimeout(1000);
    await desktopPage.screenshot({ path: path.join(ARTIFACT_DIR, '03_desktop_properties.png'), fullPage: true });

    // Test a filter (e.g., trying to click a filter pill or using search)
    try {
       // Look for anything that looks like a filter pill
       await desktopPage.getByRole('button', { name: /Sale|Rent/i }).first().click({ timeout: 2000 });
       await desktopPage.waitForTimeout(500);
       await desktopPage.screenshot({ path: path.join(ARTIFACT_DIR, '04_desktop_properties_filtered.png'), fullPage: true });
    } catch(e) {
       console.log('[Journey] Could not interact with filter button:', e.message);
    }
    
    console.log('[Journey] Opening a property card');
    await desktopPage.locator('.pcard').first().click();
    await desktopPage.waitForTimeout(1000);
    await desktopPage.screenshot({ path: path.join(ARTIFACT_DIR, '05_desktop_property_detail.png'), fullPage: true });

    await desktopContext.close();

    // --- MOBILE JOURNEY ---
    console.log('[Journey] Starting Mobile Flow');
    const mobileContext = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const mobilePage = await mobileContext.newPage();

    await mobilePage.goto(`${BASE_URL}/?demo&role=agent`);
    await mobilePage.waitForTimeout(2000);
    await mobilePage.screenshot({ path: path.join(ARTIFACT_DIR, '06_mobile_dashboard.png'), fullPage: true });

    console.log('[Journey] Navigating to Mobile Leads');
    await mobilePage.locator('.tabbar a').nth(1).click();
    await mobilePage.waitForTimeout(1000);
    await mobilePage.screenshot({ path: path.join(ARTIFACT_DIR, '07_mobile_leads.png'), fullPage: true });

    console.log('[Journey] Navigating to Mobile Properties');
    await mobilePage.locator('.tabbar a').nth(2).click();
    await mobilePage.waitForTimeout(1000);
    await mobilePage.screenshot({ path: path.join(ARTIFACT_DIR, '08_mobile_properties.png'), fullPage: true });

    await mobileContext.close();

  } finally {
    if (browser) await browser.close();
    if (viteProcess) viteProcess.kill('SIGTERM');
    if (backendProcess) backendProcess.kill('SIGTERM');
    console.log('[Journey] Finished. Screenshots saved to artifact dir.');
  }
}

runJourney().catch(console.error);
