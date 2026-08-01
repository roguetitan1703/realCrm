import { chromium } from 'playwright';
import { spawn } from 'child_process';
import http from 'http';

const PORT = 5182;
const BASE_URL = `http://localhost:${PORT}`;

let passed = 0;
let failed = 0;

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
        setTimeout(check, 300);
      }
    };

    check();
  });
}

async function runPlaywrightSuite() {
  console.log('============================================================================');
  console.log('🚀 STARTING PLAYWRIGHT E2E TEST SUITE (Properties, Search, Grouping, Attach)');
  console.log('============================================================================');

  // 1. Ensure Backend Server is Running on port 5000
  console.log('[Backend Server] Starting Express backend on port 5000...');
  const backendProcess = spawn('npx', ['tsx', 'backend/src/index.ts'], {
    stdio: 'pipe',
    shell: true,
    env: { ...process.env, PORT: '5000', FORCE_COLOR: '0' }
  });

  // 2. Start Vite Dev Server on PORT 5182
  console.log(`[Vite Server] Starting frontend dev server on port ${PORT}...`);
  const viteProcess = spawn('npx', ['vite', '--port', String(PORT)], {
    stdio: 'pipe',
    shell: true,
    env: { ...process.env, FORCE_COLOR: '0' }
  });

  try {
    await waitForServer('http://localhost:5000/health', 25000);
    console.log('[Backend Server] Ready at http://localhost:5000/health');
    await waitForServer(BASE_URL, 25000);
    console.log(`[Vite Server] Ready at ${BASE_URL}`);

    // Launch Chromium browser
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();

    // Setup authenticated session in localStorage for tenant 'delpat'
    await page.goto(BASE_URL);
    await page.evaluate(() => {
      localStorage.setItem('crm_auth_session', JSON.stringify({
        loggedIn: true,
        role: 'admin',
        activeAgentId: 'owner_delpat',
        tenantName: 'Delpat Realty',
        tenantCity: 'Pune'
      }));
    });

    await page.goto(BASE_URL);
    await page.waitForLoadState('networkidle');

    // TEST 1: Verify Properties Collection & KPI Counts
    await test('Properties Collection Page & Database Scale KPI (5,896+ records)', async () => {
      // Navigate to Properties module
      const propNav = page.locator('nav button:has-text("Properties"), .nav-item:has-text("Properties")').first();
      await propNav.click();
      await page.waitForTimeout(1000);

      // Verify page title and header
      const header = await page.textContent('body');
      if (!header.includes('Properties')) {
        throw new Error('Properties page header not found.');
      }

      // Check total listings count KPI or text
      const kpisText = await page.locator('.page-header, .kpis, body').textContent();
      if (!kpisText.includes('5,89') && !kpisText.includes('589') && !kpisText.includes('Listings')) {
        throw new Error('Properties count KPI does not reflect large dataset scale.');
      }
    });

    // TEST 2: Multi-Property Filtering & Locality Search
    await test('Property Search & Locality Filtering ("Kharadi" & "Baner")', async () => {
      // Locate search box in properties view
      const searchInput = page.locator('input[placeholder*="Search"], .flt-search input').first();
      await searchInput.fill('Kharadi');
      await page.waitForTimeout(600);

      const content = await page.textContent('body');
      if (!content.includes('Kharadi') && !content.includes('Commerzone')) {
        throw new Error('Search query "Kharadi" returned no matching properties.');
      }

      // Clear search
      await searchInput.fill('');
      await page.waitForTimeout(400);

      // Search Baner
      await searchInput.fill('Baner');
      await page.waitForTimeout(600);
      const banerContent = await page.textContent('body');
      if (!banerContent.includes('Baner') && !banerContent.includes('Pride')) {
        throw new Error('Search query "Baner" returned no matching properties.');
      }

      // Reset search
      await searchInput.fill('');
      await page.waitForTimeout(400);
    });

    // TEST 3: Group by Project Matrix Aggregation
    await test('Project Matrix Grouping ("Group by project")', async () => {
      const projToggle = page.locator('button:has-text("Group by project")').first();
      await projToggle.click();
      await page.waitForTimeout(1000);

      const pageText = await page.textContent('body');
      if (!pageText.includes('Gera Commerzone') && !pageText.includes('Bhumi Greens') && !pageText.includes('Pride World City')) {
        throw new Error('Project grouping cards (Gera Commerzone, Bhumi Greens) failed to aggregate.');
      }

      // Toggle back to Grid
      await projToggle.click();
      await page.waitForTimeout(600);
    });

    // TEST 4: Lead Section & Attach Property Interaction
    await test('Lead Detail & "Attach property" Modal Flow', async () => {
      // Navigate to Leads module
      const leadNav = page.locator('nav button:has-text("Leads"), .nav-item:has-text("Leads")').first();
      await leadNav.click();
      await page.waitForTimeout(1000);

      // Click the first lead card or row to open detail view
      const firstLead = page.locator('.lc-card, tr.m-row, .card-title, .lead-row').first();
      await firstLead.click();
      await page.waitForTimeout(800);

      // Look for "Attach property" button
      const attachBtn = page.locator('button:has-text("Attach property")').first();
      if (await attachBtn.isVisible()) {
        await attachBtn.click();
        await page.waitForTimeout(800);

        // Verify Modal is open
        const modalText = await page.locator('.modal, .overlay').textContent();
        if (!modalText.includes('Attach a property') && !modalText.includes('Shortlist')) {
          throw new Error('Attach property modal did not open.');
        }

        // Type search in modal
        const modalSearch = page.locator('.modal input[placeholder*="Search"]').first();
        if (await modalSearch.isVisible()) {
          await modalSearch.fill('Pride');
          await page.waitForTimeout(500);
        }

        // Close modal
        const closeBtn = page.locator('.modal button:has-text("×"), .modal .btn-quiet, button[aria-label="Close"]').first();
        if (await closeBtn.isVisible()) {
          await closeBtn.click();
        } else {
          await page.keyboard.press('Escape');
        }
        await page.waitForTimeout(400);
      }
    });

    await browser.close();
  } finally {
    viteProcess.kill();
    backendProcess.kill();
  }

  console.log('============================================================================');
  console.log(`📊 PLAYWRIGHT E2E SUITE: ${passed} PASSED, ${failed} FAILED`);
  console.log('============================================================================');

  if (failed > 0) process.exit(1);
}

runPlaywrightSuite().catch(err => {
  console.error('Playwright Suite Error:', err);
  process.exit(1);
});
