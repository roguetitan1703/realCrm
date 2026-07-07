/**
 * ============================================================================
 * 🧪 BHUMI PROPCITY CRM — AUTOMATED MASTER TEST SUITE
 * ============================================================================
 * Verifies backend API endpoints, native queue engine, HMAC SHA-256 signing,
 * deduplication logic, composable domain actions, and frontend readiness.
 * ============================================================================
 */

import app from './backend/src/index.ts';
import http from 'http';
import crypto from 'crypto';

const TEST_PORT = 5005;
const BASE_URL = `http://localhost:${TEST_PORT}/api/v1`;

let server;

async function runTests() {
  console.log('============================================================================');
  console.log('🚀 STARTING MASTER TEST SUITE FOR BHUMI PROPCITY CRM');
  console.log('============================================================================');

  // 1. Start Server
  await new Promise((resolve) => {
    server = http.createServer(app);
    server.listen(TEST_PORT, () => {
      console.log(`[Test Server] Started on port ${TEST_PORT}`);
      resolve();
    });
  });

  let passed = 0;
  let failed = 0;

  async function test(name, fn) {
    process.stdout.write(`Testing: ${name} ... `);
    try {
      await fn();
      console.log('✅ PASSED');
      passed++;
    } catch (err) {
      console.log(`❌ FAILED: ${err.message}`);
      failed++;
    }
  }

  try {
    // ------------------------------------------------------------------------
    // Test 1: Health Check Endpoint
    // ------------------------------------------------------------------------
    await test('GET /health endpoint', async () => {
      const res = await fetch(`http://localhost:${TEST_PORT}/health`);
      if (!res.ok) throw new Error(`Status ${res.status}`);
      const data = await res.json();
      if (data.status !== 'OK') throw new Error('Invalid status response');
    });

    // ------------------------------------------------------------------------
    // Test 2: Tenant Workspace Provisioning & Resolution
    // ------------------------------------------------------------------------
    await test('POST /api/v1/workspace/onboard', async () => {
      const res = await fetch(`${BASE_URL}/workspace/onboard`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firmName: 'Bhumi Propcity Demo',
          city: 'Pune',
          slug: 'bhumi-propcity',
          adminName: 'Tenant Owner',
          adminEmail: 'owner@bhumipropcity.com',
          adminPhone: '98220 41556',
          primaryColor: '#3F51B5'
        })
      });
      if (!res.ok) throw new Error(`Status ${res.status}`);
      const data = await res.json();
      if (!data.success || data.tenant.slug !== 'bhumi-propcity') {
        throw new Error('Workspace provisioning failed');
      }
    });

    // ------------------------------------------------------------------------
    // Test 3: Tenant Integrations Management
    // ------------------------------------------------------------------------
    await test('PUT & GET /api/v1/workspace/integrations', async () => {
      const putRes = await fetch(`${BASE_URL}/workspace/integrations/exotel`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'X-Tenant-ID': 'demo' },
        body: JSON.stringify({
          apiKey: 'test_api_key_exotel',
          apiToken: 'test_token',
          subdomain: 'api.exotel.com',
          callerDid: '08047100000',
          status: 'connected'
        })
      });
      if (!putRes.ok) throw new Error(`PUT status ${putRes.status}`);

      const getRes = await fetch(`${BASE_URL}/workspace/integrations`, {
        headers: { 'X-Tenant-ID': 'demo' }
      });
      const data = await getRes.json();
      if (!data.success || !data.integrations.exotel) {
        throw new Error('Integration verification failed');
      }
    });

    // ------------------------------------------------------------------------
    // Test 4: HMAC Signed Portal Webhook Ingestion & Deduplication
    // ------------------------------------------------------------------------
    await test('POST /api/v1/ingest/demo/99acres with HMAC SHA-256 Check', async () => {
      const payload = JSON.stringify({
        external_id: '99acres_inq_101',
        name: 'Rahul Mehta',
        phone: '+919876543210',
        email: 'rahul@example.com',
        custom_attributes: { project_name: 'Megapolis Sunway', config: '3 BHK', budget: '1.2 Cr' }
      });

      // Sign with demo secret 'whsec_demo_secret_123'
      const signature = crypto.createHmac('sha256', 'whsec_demo_secret_123').update(payload).digest('hex');

      const res = await fetch(`${BASE_URL}/ingest/demo/99acres`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-RealCRM-Signature': signature
        },
        body: payload
      });

      if (!res.ok) throw new Error(`Ingest status ${res.status}`);
      const data = await res.json();
      if (!data.success || data.status !== 'ingested') {
        throw new Error(`Expected ingested status, got ${data.status}`);
      }

      // Test deduplication by sending exact same phone number again with a new inquiry ID (e.g. from another portal next day)
      const payload2 = JSON.stringify({
        external_id: '99acres_inq_102',
        name: 'Rahul Mehta (Repeat)',
        phone: '+919876543210',
        email: 'rahul@example.com',
        custom_attributes: { project_name: 'Megapolis Sunway', config: '3 BHK', budget: '1.2 Cr' }
      });
      const signature2 = crypto.createHmac('sha256', 'whsec_demo_secret_123').update(payload2).digest('hex');

      const res2 = await fetch(`${BASE_URL}/ingest/demo/99acres`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-RealCRM-Signature': signature2
        },
        body: payload2
      });
      const data2 = await res2.json();
      if (!data2.success || data2.status !== 'deduplicated_merged') {
        throw new Error(`Expected deduplicated_merged status, got ${data2.status}`);
      }
    });

    // ------------------------------------------------------------------------
    // Test 5: Composable Actions — Stage Change & Webhook Enqueueing
    // ------------------------------------------------------------------------
    await test('POST /api/v1/records/:id/actions/stage-change', async () => {
      const res = await fetch(`${BASE_URL}/records/lead_101/actions/stage-change`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Tenant-ID': 'demo' },
        body: JSON.stringify({
          new_stage_id: 'Site Visit Scheduled',
          note: 'Client verified 3 BHK budget, visit scheduled for Saturday at 11 AM.'
        })
      });
      if (!res.ok) throw new Error(`Status ${res.status}`);
      const data = await res.json();
      if (!data.success || data.new_stage_id !== 'Site Visit Scheduled') {
        throw new Error('Stage change failed');
      }
    });

    // ------------------------------------------------------------------------
    // Test 6: Composable Actions — Telephony Call Bridge
    // ------------------------------------------------------------------------
    await test('POST /api/v1/records/:id/actions/call', async () => {
      const res = await fetch(`${BASE_URL}/records/lead_101/actions/call`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Tenant-ID': 'demo' },
        body: JSON.stringify({ agent_id: 'agent_1' })
      });
      if (!res.ok) throw new Error(`Status ${res.status}`);
      const data = await res.json();
      if (!data.success || !data.call_sid) {
        throw new Error('Telephony bridge initiation failed');
      }
    });

    // ------------------------------------------------------------------------
    // Test 7: Composable Actions — Meta WABA WhatsApp Dispatch
    // ------------------------------------------------------------------------
    await test('POST /api/v1/records/:id/actions/whatsapp', async () => {
      const res = await fetch(`${BASE_URL}/records/lead_101/actions/whatsapp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Tenant-ID': 'demo' },
        body: JSON.stringify({
          template_id: 'site_visit_confirm',
          variables: ['11:00 AM', 'Megapolis Sunway']
        })
      });
      if (!res.ok) throw new Error(`Status ${res.status}`);
      const data = await res.json();
      if (!data.success || !data.waba_message_id) {
        throw new Error('WhatsApp dispatch failed');
      }
    });

    // ------------------------------------------------------------------------
    // Test 8: Composable Actions — Lead Merging
    // ------------------------------------------------------------------------
    await test('POST /api/v1/records/:id/actions/merge', async () => {
      const res = await fetch(`${BASE_URL}/records/lead_101/actions/merge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Tenant-ID': 'demo' },
        body: JSON.stringify({
          duplicate_record_id: 'lead_999',
          merge_strategy: 'keep_primary'
        })
      });
      if (!res.ok) throw new Error(`Status ${res.status}`);
      const data = await res.json();
      if (!data.success || !data.primary_record_id) {
        throw new Error('Lead merge failed');
      }
    });

  } finally {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
      console.log(`[Test Server] Stopped.`);
    }
  }

  console.log('============================================================================');
  console.log(`📊 TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('============================================================================');

  process.exit(failed > 0 ? 1 : 0);
}

runTests();
