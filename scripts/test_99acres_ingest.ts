import { sql } from '../backend/src/services/db.js';
import crypto from 'crypto';
import http from 'http';
import { spawn } from 'child_process';
import { chromium } from 'playwright';
import path from 'path';

const API_KEY = process.env.INGEST_API_KEY || 'sk_test_placeholder';
const TENANT_ID = 'delpat';
const PORT = 5180;
const BASE_URL = `http://localhost:${PORT}`;
const ARTIFACT_DIR = 'C:\\Users\\VICTUS\\.gemini\\antigravity\\brain\\ab12c5df-1705-4bde-9768-7f55fc50a11c';

function hashKey(key: string): string {
  return crypto.createHash('sha256').update(key.trim()).digest('hex');
}

function waitForServer(url: string, timeoutMs = 25000) {
  const start = Date.now();
  return new Promise<void>((resolve, reject) => {
    const check = () => {
      http.get(url, (res) => {
        if (res.statusCode === 200) resolve();
        else retry();
      }).on('error', retry);
    };
    const retry = () => {
      if (Date.now() - start > timeoutMs) reject(new Error('Server timeout'));
      else setTimeout(check, 500);
    };
    check();
  });
}

function postIngest(payload: any) {
  return new Promise<{ status: number; data: any }>((resolve, reject) => {
    const dataStr = JSON.stringify(payload);
    const req = http.request({
      hostname: 'localhost',
      port: 5000,
      path: `/api/v1/ingest/${TENANT_ID}`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': API_KEY,
        'Content-Length': Buffer.byteLength(dataStr),
      },
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(body) });
        } catch {
          resolve({ status: res.statusCode, data: body });
        }
      });
    });
    req.on('error', reject);
    req.write(dataStr);
    req.end();
  });
}

async function runIngestTest() {
  console.log('[IngestTest] 1. Registering 99acres connection with provided API key...');
  
  const keyHash = hashKey(API_KEY);
  const parserConfig = {
    map: {
      name: 'name',
      phone: 'phone',
      'req.locality': 'locality',
    },
    defaults: {
      source: '99acres',
    },
    transforms: {
      phone: 'phone_in',
    },
  };

  await sql`DELETE FROM integrations WHERE api_key_hash = ${keyHash};`;

  await sql`
    INSERT INTO integrations (id, tenant_id, provider, api_key_hash, api_key_last4, active, parser_config, created_at)
    VALUES ('int_99acres_test', ${TENANT_ID}, '99acres', ${keyHash}, ${API_KEY.slice(-4)}, TRUE, ${sql.json(parserConfig)}, NOW())
    ON CONFLICT (id) DO UPDATE SET
      tenant_id = EXCLUDED.tenant_id,
      api_key_hash = EXCLUDED.api_key_hash,
      parser_config = EXCLUDED.parser_config,
      active = TRUE;
  `;

  console.log('[IngestTest] 99acres integration registered successfully in DB.');

  console.log('[IngestTest] 2. Starting backend (port 5000) and frontend (port 5180)...');
  const backendProc = spawn('npx', ['tsx', 'backend/src/index.ts'], {
    stdio: 'inherit',
    shell: true,
    env: { ...process.env, PORT: '5000' }
  });

  const viteProc = spawn('npx', ['vite', '--port', PORT.toString(), '--no-open'], {
    stdio: 'ignore',
    shell: true,
    env: process.env
  });

  let browser;
  try {
    await waitForServer('http://localhost:5000/health', 25000);
    console.log('[IngestTest] Backend ready.');

    // Step 3: Send Test Enquiry from 99acres
    console.log('[IngestTest] 3. Sending test enquiry payload from 99acres...');
    const testPayload = {
      name: 'Test Enquiry',
      phone: '9876543210',
      locality: 'Wakad'
    };

    const res = await postIngest(testPayload);
    console.log('[IngestTest] HTTP Response Status:', res.status);
    console.log('[IngestTest] HTTP Response Body:', JSON.stringify(res.data, null, 2));

    // Wait 1.5 seconds for background parser processing & lead creation
    await new Promise(r => setTimeout(r, 1500));

    // Step 4: Verify database lead creation
    const leadRows = await sql`
      SELECT id, name, phone, stage, source, req, created_at
      FROM crm_leads
      WHERE tenant_id = ${TENANT_ID} AND name = 'Test Enquiry'
      ORDER BY created_at DESC LIMIT 1
    `;

    if (leadRows.length > 0) {
      console.log('[IngestTest] 🎉 Lead verified in Postgres database!');
      console.log('  Lead ID:', leadRows[0].id);
      console.log('  Name:', leadRows[0].name);
      console.log('  Phone:', leadRows[0].phone);
      console.log('  Source:', leadRows[0].source);
      console.log('  Stage:', leadRows[0].stage);
      console.log('  Requirement:', JSON.stringify(leadRows[0].req));
    } else {
      console.warn('[IngestTest] ⚠️ Checking webhook_inbox for error trace...');
      const inboxRows = await sql`SELECT * FROM webhook_inbox WHERE tenant_id = ${TENANT_ID} ORDER BY received_at DESC LIMIT 1`;
      console.log('  Inbox row:', JSON.stringify(inboxRows, null, 2));
    }

    // Step 5: Capture UI Screenshot of the Lead in RealCRM
    await waitForServer(BASE_URL, 20000);
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();

    console.log('[IngestTest] Logging into RealCRM UI to verify live feed landing...');
    await page.goto(BASE_URL);
    await page.waitForTimeout(1000);
    await page.locator('input[placeholder="Your firm\'s name"]').fill('delpat');
    await page.locator('button[type="submit"]:has-text("Continue")').click();
    await page.waitForTimeout(1500);

    await page.locator('input[placeholder*="you@firm.com"]').fill('akashpatelyo2@gmail.com');
    await page.locator('input[placeholder="Your password"]').fill('delpat-demo-1');
    await page.locator('button[type="submit"]:has-text("Sign in")').click();
    await page.waitForTimeout(2500);

    // Dashboard Screenshot
    await page.screenshot({ path: path.join(ARTIFACT_DIR, '18_dashboard_ingested_lead.png'), fullPage: true });

    // Leads View Screenshot
    await page.locator('.n-list a', { hasText: 'Leads' }).click();
    await page.waitForTimeout(1500);
    await page.screenshot({ path: path.join(ARTIFACT_DIR, '19_leads_ingested_99acres.png'), fullPage: true });

    console.log('[IngestTest] UI Verification completed! Screenshots saved.');

  } catch (err) {
    console.error('[IngestTest Error]:', err);
  } finally {
    if (browser) await browser.close();
    viteProc.kill('SIGTERM');
    backendProc.kill('SIGTERM');
    await sql.end();
  }
}

runIngestTest().catch(console.error);
