/**
 * ============================================================================
 * 📤 OUTBOUND SIGNED WEBHOOK DISPATCHER SERVICE
 * ============================================================================
 * Dispatches domain event notifications (LEAD_CREATED, STAGE_CHANGED, etc.)
 * to external endpoints (Zapier, client ERPs, WhatsApp bridges). Enforces
 * HMAC SHA-256 signature headers and automatic retry via native queue engine.
 * ============================================================================
 */

import crypto from 'crypto';
import { OutboundWebhookPayload, QueueJobPayload } from '../models';
import { queueManager } from './queue';

/**
 * Compute HMAC SHA-256 hex signature for outgoing payload
 */
export function signWebhookPayload(payloadStr: string, secret: string): string {
  if (!secret) return '';
  return crypto.createHmac('sha256', secret).update(payloadStr).digest('hex');
}

/**
 * Dispatch an outbound webhook event immediately, enqueueing for retry if it fails
 */
export async function dispatchOutboundWebhook(
  tenantSlug: string,
  eventType: OutboundWebhookPayload['event_type'],
  data: Record<string, any>,
  webhookUrl?: string,
  webhookSecret?: string
): Promise<boolean> {
  if (!webhookUrl) {
    // No webhook configured for tenant, skip silently
    return false;
  }

  const payload: OutboundWebhookPayload = {
    event_id: crypto.randomUUID(),
    event_type: eventType,
    tenant_slug: tenantSlug,
    timestamp: new Date().toISOString(),
    data,
  };

  const payloadStr = JSON.stringify(payload);
  const signature = signWebhookPayload(payloadStr, webhookSecret || 'default_secret');

  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-RealCRM-Signature': signature,
        'User-Agent': 'RealCRM-Enterprise-Webhook/2.4',
      },
      body: payloadStr,
    });

    if (response.ok || response.status === 202) {
      console.log(`[Webhook Sender] Successfully dispatched ${eventType} (${payload.event_id}) to ${webhookUrl}`);
      return true;
    }

    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  } catch (err: any) {
    console.warn(`[Webhook Sender] Delivery failed for ${eventType} (${payload.event_id}) to ${webhookUrl}: ${err.message}. Enqueueing for backoff retry.`);
    await queueManager.enqueue('outgoing-webhooks', {
      url: webhookUrl,
      secret: webhookSecret || 'default_secret',
      payloadStr,
      eventType,
      eventId: payload.event_id,
    });
    return false;
  }
}

// Register retry worker with queueManager
queueManager.registerWorker('outgoing-webhooks', async (job: QueueJobPayload) => {
  const { url, secret, payloadStr, eventType, eventId } = job.payload;
  const signature = signWebhookPayload(payloadStr, secret);

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-RealCRM-Signature': signature,
      'User-Agent': 'RealCRM-Enterprise-Webhook/2.4',
    },
    body: payloadStr,
  });

  if (!response.ok && response.status !== 202) {
    throw new Error(`Retry delivery failed with HTTP ${response.status}`);
  }
  console.log(`[Webhook Retry Worker] Successfully delivered retry for ${eventType} (${eventId})`);
}, 5);
