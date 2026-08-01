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

async function runMultiIngestTest() {
  console.log('[MultiIngestTest] Registering 99acres connection with extended mapping...');
  const keyHash = hashKey(API_KEY);
  const parserConfig = {
    map: {
      name: 'name',
      phone: 'phone',
      'req.locality': 'locality',
      email: 'email',
    },
    defaults: {
      source: '99acres',
      stage: 'New',
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

  console.log('[MultiIngestTest] Starting backend + UI...');
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

  try {
    await waitForServer('http://localhost:5000/health', 25000);
    console.log('[MultiIngestTest] Backend ready.');

    const testPayloads = [
      { name: 'Alice Smith', phone: '9876543210', locality: 'Kothrud', email: 'alice@example.com' },
      { name: 'Bob Kumar', phone: '+91 98765 43211', locality: 'Baner' },
      { name: 'Carlos', phone: '9876543212', locality: 'Hadapsar', email: 'carlos@domain.org' },
      // Missing locality – should still create lead with no req.locality
      { name: 'Dana Lee', phone: '9876543213', email: 'dana@xyz.com' },
      // Empty payload – will be rejected
      {} as any,
    ];

    for (const payload of testPayloads) {
      console.log('[MultiIngestTest] Sending payload:', JSON.stringify(payload));
      const res = await postIngest(payload);
      console.log('  → HTTP', res.status, 'Response:', JSON.stringify(res.data));
    }

    // Give parser background a moment
    await new Promise(r => setTimeout(r, 2000));

    // Verify leads created
    const leads = await sql`
      SELECT id, name, phone, email, source, req, stage, created_at
      FROM crm_leads
      WHERE tenant_id = ${TENANT_ID}
        AND name = ANY(ARRAY['Alice Smith','Bob Kumar','Carlos','Dana Lee'])
      ORDER BY created_at DESC`;
    console.log('[MultiIngestTest] Leads found:', JSON.stringify(leads, null, 2));

    // UI screenshots – dashboard & leads view for visual confirmation
    await waitForServer(BASE_URL, 20000);
    const browser = await chromium.launch({ headless: true });
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    await page.goto(BASE_URL);
    await page.waitForTimeout(1000);
    await page.locator('input[placeholder="Your firm\'s name"]').fill('delpat');
    await page.locator('button[type="submit"]:has-text("Continue")').click();
    await page.waitForTimeout(1500);
    await page.locator('input[placeholder*="you@firm.com"]').fill('akashpatelyo2@gmail.com');
    await page.locator('input[placeholder="Your password"]').fill('delpat-demo-1');
    await page.locator('button[type="submit"]:has-text("Sign in")').click();
    await page.waitForTimeout(2500);
    // Dashboard
    await page.screenshot({ path: path.join(ARTIFACT_DIR, '20_multi_dashboard.png'), fullPage: true });
    // Leads page
    await page.locator('.n-list a', { hasText: 'Leads' }).click();
    await page.waitForTimeout(1500);
    await page.screenshot({ path: path.join(ARTIFACT_DIR, '21_multi_leads.png'), fullPage: true });
    await browser.close();

  } catch (err) {
    console.error('[MultiIngestTest] Error:', err);
  } finally {
    viteProc.kill('SIGTERM');
    backendProc.kill('SIGTERM');
    await sql.end();
  }
}

runMultiIngestTest().catch(console.error);
