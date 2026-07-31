import { chromium } from 'playwright';
import { spawn } from 'child_process';
import http from 'http';
import path from 'path';

const PORT = 5180;
const BASE_URL = `http://localhost:${PORT}`;
const ARTIFACT_DIR = 'C:\\Users\\VICTUS\\.gemini\\antigravity\\brain\\ab12c5df-1705-4bde-9768-7f55fc50a11c';

function waitForServer(url, timeoutMs = 25000) {
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

function postJson(url, data, headers = {}) {
  return new Promise((resolve) => {
    const u = new URL(url);
    const req = http.request({
      hostname: u.hostname,
      port: u.port || 5000,
      path: u.pathname + u.search,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers }
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => resolve({ status: res.statusCode, body }));
    });
    req.on('error', (err) => resolve({ status: 500, error: err.message }));
    if (data) req.write(JSON.stringify(data));
    req.end();
  });
}

async function runTestUserFlow() {
  console.log('[TestUser] Starting backend server...');
  const backendProcess = spawn('npx', ['tsx', 'backend/src/index.ts'], {
    stdio: 'pipe',
    shell: true,
    env: { ...process.env, PORT: '5000' }
  });

  console.log('[TestUser] Starting Vite server...');
  const viteProcess = spawn('npx', ['vite', '--port', PORT.toString(), '--no-open'], {
    stdio: 'pipe',
    shell: true,
    env: process.env
  });

  let browser;
  try {
    await waitForServer('http://localhost:5000/health', 25000);
    console.log('[TestUser] Backend ready at http://localhost:5000/health');

    // Create / ensure tenant 'delpat' and user 'akashpatelyo2@gmail.com'
    console.log('[TestUser] Running seed_test_user.ts...');
    const seedProc = spawn('npx', ['tsx', 'scripts/seed_test_user.ts'], { stdio: 'inherit', shell: true });
    await new Promise((res) => seedProc.on('close', res));
    console.log('[TestUser] Seeding step complete.');

    await waitForServer(BASE_URL, 25000);
    console.log(`[TestUser] Vite ready at ${BASE_URL}`);

    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();

    page.on('pageerror', err => console.error('[Browser PageError]:', err.message));

    // Step 1: Open Login Page
    console.log('[TestUser] Step 1: Opening login page');
    await page.goto(BASE_URL);
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(ARTIFACT_DIR, '10_login_workspace.png'), fullPage: true });

    // Step 2: Select Workspace 'delpat'
    console.log('[TestUser] Step 2: Entering workspace slug "delpat"');
    const wsInput = page.locator('input[placeholder="Your firm\'s name"]');
    await wsInput.fill('delpat');
    await page.screenshot({ path: path.join(ARTIFACT_DIR, '11_workspace_filled.png'), fullPage: true });

    const continueBtn = page.locator('button[type="submit"]:has-text("Continue")');
    await continueBtn.click();
    await page.waitForTimeout(1500);
    await page.screenshot({ path: path.join(ARTIFACT_DIR, '12_creds_screen.png'), fullPage: true });

    // Step 3: Fill Credentials
    console.log('[TestUser] Step 3: Filling email akashpatelyo2@gmail.com and password');
    const idInput = page.locator('input[placeholder*="you@firm.com"]');
    await idInput.fill('akashpatelyo2@gmail.com');

    const pwInput = page.locator('input[placeholder="Your password"]');
    await pwInput.fill('delpat-demo-1');

    await page.screenshot({ path: path.join(ARTIFACT_DIR, '13_creds_filled.png'), fullPage: true });

    const signInBtn = page.locator('button[type="submit"]:has-text("Sign in")');
    await signInBtn.click();
    await page.waitForTimeout(3000);

    // Step 4: Verify Dashboard Landing
    console.log('[TestUser] Step 4: Verifying Dashboard after login');
    await page.screenshot({ path: path.join(ARTIFACT_DIR, '14_dashboard_logged_in.png'), fullPage: true });

    // Step 5: Check Leads
    console.log('[TestUser] Step 5: Checking Leads page');
    await page.locator('.n-list a', { hasText: 'Leads' }).click();
    await page.waitForTimeout(1500);
    await page.screenshot({ path: path.join(ARTIFACT_DIR, '15_leads_logged_in.png'), fullPage: true });

    // Step 6: Check Properties
    console.log('[TestUser] Step 6: Checking Properties page');
    await page.locator('.n-list a', { hasText: 'Properties' }).click();
    await page.waitForTimeout(1500);
    await page.screenshot({ path: path.join(ARTIFACT_DIR, '16_properties_logged_in.png'), fullPage: true });

    console.log('[TestUser] All steps completed successfully!');

  } catch (err) {
    console.error('[TestUser] Flow Error:', err);
  } finally {
    if (browser) await browser.close();
    if (viteProcess) viteProcess.kill('SIGTERM');
    if (backendProcess) backendProcess.kill('SIGTERM');
    console.log('[TestUser] Cleaned up processes.');
  }
}

runTestUserFlow().catch(console.error);
