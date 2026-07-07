import { chromium } from 'playwright';
import { spawn } from 'child_process';
import http from 'http';

const PORT = 5180; // Use 5180 to avoid port collision
const BASE_URL = `http://localhost:${PORT}`;

let passed = 0;
let failed = 0;
const pageErrors = [];
const consoleErrors = [];

async function test(name, fn) {
  process.stdout.write(`Testing: ${name} ... `);
  const start = Date.now();
  try {
    await fn();
    const duration = Date.now() - start;
    console.log(`✅ PASSED (${duration}ms)`);
    passed++;
  } catch (err) {
    const duration = Date.now() - start;
    console.log(`❌ FAILED (${duration}ms)`);
    console.error(`   Error: ${err.message}`);
    failed++;
  }
}

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
        setTimeout(check, 300);
      }
    };

    check();
  });
}

async function runFrontendTests() {
  console.log('============================================================================');
  console.log('🚀 STARTING MASTER FRONTEND TEST SUITE FOR BHUMI PROPCITY CRM');
  console.log('============================================================================');

  // 1. Start Vite dev server on PORT
  console.log(`[Vite Server] Starting dev server on port ${PORT}...`);
  const viteProcess = spawn('npx', ['vite', '--port', PORT.toString(), '--no-open'], {
    stdio: 'pipe',
    shell: true,
    env: { ...process.env, FORCE_COLOR: '0' }
  });

  viteProcess.stdout.on('data', (data) => {
    // console.log(`[Vite]: ${data.toString().trim()}`);
  });

  viteProcess.stderr.on('data', (data) => {
    // console.error(`[Vite Error]: ${data.toString().trim()}`);
  });

  let browser;
  try {
    await waitForServer(BASE_URL);
    console.log(`[Vite Server] Server ready at ${BASE_URL}`);

    browser = await chromium.launch({ headless: true });

    // ------------------------------------------------------------------------
    // Test 1: Tenant Whitelabeling & Top Branding Verification
    // ------------------------------------------------------------------------
    await test('Desktop: Tenant Whitelabel Branding & Header', async () => {
      const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      const page = await context.newPage();
      
      page.on('pageerror', err => pageErrors.push(`[Test 1] PageError: ${err.message}`));
      
      await page.goto(`${BASE_URL}/?demo&role=admin&screen=dashboard`);
      await page.waitForSelector('.app-desktop', { timeout: 5000 });

      const title = await page.title();
      if (!title.includes('Bhumi Propcity')) {
        throw new Error(`Expected title to contain 'Bhumi Propcity', got '${title}'`);
      }

      const bodyText = await page.locator('body').innerText();
      if (!bodyText.includes('Bhumi Propcity') || !bodyText.includes('Pune')) {
        throw new Error('Top branding (Bhumi Propcity) or office location (Pune) not found in document body');
      }

      await context.close();
    });

    // ------------------------------------------------------------------------
    // Test 2: Desktop Navigation Across All CRM Screens via SPA Clicks
    // ------------------------------------------------------------------------
    await test('Desktop: Navigation Across Dashboard, Leads, Properties, Clients, Calendar, Team, Settings', async () => {
      const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      const page = await context.newPage();
      
      page.on('pageerror', err => pageErrors.push(`[Test 2] PageError: ${err.message}`));

      await page.goto(`${BASE_URL}/?demo&role=admin&screen=dashboard`);
      await page.waitForSelector('.n-list', { timeout: 5000 });

      const labels = ['Leads', 'Properties', 'Clients', 'Calendar', 'Team', 'Settings', 'Dashboard'];
      for (const label of labels) {
        // Click navigation tab in sidebar for instant SPA transition without reload
        await page.locator(`.n-list a`, { hasText: label }).first().click();
        await page.waitForTimeout(200); // Allow React render settling
        
        const bodyText = await page.locator('.app-main').innerText();
        if (!bodyText || bodyText.length < 20) {
          throw new Error(`Screen '${label}' rendered empty or broken content in main area`);
        }
      }

      await context.close();
    });

    // ------------------------------------------------------------------------
    // Test 3: Leads Module Search & FilterBar Interaction
    // ------------------------------------------------------------------------
    await test('Desktop: Leads Search Input & FilterBar UX', async () => {
      const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      const page = await context.newPage();
      
      page.on('pageerror', err => pageErrors.push(`[Test 3] PageError: ${err.message}`));

      await page.goto(`${BASE_URL}/?demo&role=admin&screen=leads`);
      await page.waitForSelector('.fbar', { timeout: 5000 });

      // Test Search Input
      const searchInput = page.locator('.fbar .f-search input');
      await searchInput.fill('Rahul');
      await page.waitForTimeout(300);

      const tableRows = await page.locator('table tbody tr').count();
      if (tableRows === 0) {
        throw new Error('Search filtering for "Rahul" returned 0 rows in Leads table');
      }

      // Clear Search
      await searchInput.fill('');
      await page.waitForTimeout(300);

      await context.close();
    });

    // ------------------------------------------------------------------------
    // Test 4: Properties Module & Tower / Unit Availability Matrix
    // ------------------------------------------------------------------------
    await test('Desktop: Properties Card Inspection & Tower/Unit Availability Matrix', async () => {
      const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      const page = await context.newPage();
      
      page.on('pageerror', err => pageErrors.push(`[Test 4] PageError: ${err.message}`));

      await page.goto(`${BASE_URL}/?demo&role=admin&screen=properties`);
      await page.waitForSelector('.pcard', { timeout: 5000 });

      // Click the first property card to open drawer/modal
      await page.locator('.pcard').first().click();
      await page.waitForTimeout(500);

      const bodyText = await page.locator('body').innerText();
      if (!bodyText.includes('Tower') && !bodyText.includes('BHK')) {
        throw new Error('Property details view did not render Tower or BHK unit information');
      }

      await context.close();
    });

    // ------------------------------------------------------------------------
    // Test 5: Mobile Viewport & Responsive Search/Filter UX
    // ------------------------------------------------------------------------
    await test('Mobile: iPhone 13 Pro Viewport, Bottom Nav & MobileSearchFilter UX', async () => {
      const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
      const page = await context.newPage();
      
      page.on('pageerror', err => pageErrors.push(`[Test 5] PageError: ${err.message}`));

      // Notice: role=agent triggers MobileApp view in App.jsx!
      await page.goto(`${BASE_URL}/?demo&role=agent`);
      await page.waitForSelector('.tabbar', { timeout: 5000 });

      // Click 'Leads' tab in mobile bottom tabbar to switch to mobile leads screen
      await page.locator('.tabbar a').nth(1).click();
      await page.waitForSelector('.m-msearch', { timeout: 5000 });

      // Check Mobile Search Box exists and filter by 'Rahul'
      const mobileSearchInput = page.locator('.m-msearch input');
      await mobileSearchInput.fill('Rahul');
      await page.waitForTimeout(300);

      const cardsCount = await page.locator('.m-card').count();
      if (cardsCount === 0) {
        throw new Error('Mobile search filtering for "Rahul" returned 0 lead cards');
      }

      // Check Mobile Sort Button exists
      const sortBtn = page.locator('.m-sort-btn');
      if (await sortBtn.count() === 0) {
        throw new Error('Mobile sort button (.m-sort-btn) not found in mobile leads view');
      }

      await context.close();
    });

    // ------------------------------------------------------------------------
    // Test 6: Zero Uncaught JavaScript Runtime / Console Errors
    // ------------------------------------------------------------------------
    await test('Global: Zero Uncaught Runtime Exceptions Across All Viewports', async () => {
      if (pageErrors.length > 0) {
        throw new Error(`Encountered ${pageErrors.length} uncaught runtime errors:\n` + pageErrors.join('\n'));
      }
    });

  } finally {
    if (browser) {
      await browser.close();
      console.log('[Playwright] Closed browser.');
    }
    if (viteProcess) {
      viteProcess.kill('SIGTERM');
      console.log('[Vite Server] Stopped dev server.');
    }
  }

  console.log('============================================================================');
  console.log(`📊 FRONTEND TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('============================================================================');

  process.exit(failed > 0 ? 1 : 0);
}

runFrontendTests().catch(err => {
  console.error('Fatal Test Runner Error:', err);
  process.exit(1);
});
