/**
 * ============================================================================
 * 🔔 NOTIFICATIONS ROUTES
 * ============================================================================
 *   GET  /api/v1/notifications            → current user's feed + unread count
 *   POST /api/v1/notifications/:id/read   → mark one read
 *   POST /api/v1/notifications/read-all    → mark all read
 *   GET  /api/v1/notifications/deliveries  → what reached devices (owner/manager)
 * The "current user" is the token's user (req.user.id, set by
 * withRequestContext); the store scopes everything to the request tenant.
 * ============================================================================
 */

import { Router, Request, Response } from 'express';
import { requireTenantAuth } from '../middleware/auth';
import { listNotifications, unreadCount, markRead, markAllRead } from '../services/notifications';
import { pushEnabled, vapidPublicKey, saveSubscription, removeSubscription, listDeliveries, deliveryReadiness } from '../services/push';

export const notificationsRouter = Router();
notificationsRouter.use(requireTenantAuth);

// ── Web Push ────────────────────────────────────────────────────────────────
// The client needs the VAPID public key to subscribe; the browser then hands us
// a PushSubscription we store per-device against the signed-in user.
notificationsRouter.get('/vapid', (_req: Request, res: Response) => {
  return res.status(200).json({ enabled: pushEnabled(), publicKey: vapidPublicKey() });
});

notificationsRouter.post('/subscribe', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Not signed in' });
    await saveSubscription(req.tenantId!, userId, req.body?.subscription, req.get('user-agent') || undefined);
    return res.status(200).json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to subscribe', message: err.message });
  }
});

// ── Delivery log ────────────────────────────────────────────────────────────
// Owners and managers only: it names every recipient on the desk and when they
// were last reachable, which is not an agent's business.
notificationsRouter.get('/deliveries', async (req: Request, res: Response) => {
  const role = String(req.user?.role || '').toLowerCase();
  if (role !== 'owner' && role !== 'admin' && role !== 'manager') {
    return res.status(403).json({ error: 'Not permitted' });
  }
  try {
    const [deliveries, readiness] = await Promise.all([
      listDeliveries(req.tenantId!, {
        userId: req.query.user ? String(req.query.user) : undefined,
        since: req.query.since ? String(req.query.since) : undefined,
        limit: Number(req.query.limit) || 200,
      }),
      deliveryReadiness(req.tenantId!),
    ]);
    return res.status(200).json({ pushEnabled: pushEnabled(), deliveries, readiness });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to read delivery log', message: err.message });
  }
});

notificationsRouter.post('/unsubscribe', async (req: Request, res: Response) => {
  try {
    if (req.body?.endpoint) await removeSubscription(req.body.endpoint);
    return res.status(200).json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to unsubscribe', message: err.message });
  }
});

notificationsRouter.get('/', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(200).json({ success: true, notifications: [], unread: 0 });
    const [notifications, unread] = await Promise.all([
      listNotifications(userId),
      unreadCount(userId),
    ]);
    return res.status(200).json({ success: true, notifications, unread });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to load notifications', message: err.message });
  }
});

notificationsRouter.post('/:id/read', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (userId) await markRead(req.params.id, userId);
    return res.status(200).json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to mark read', message: err.message });
  }
});

notificationsRouter.post('/read-all', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (userId) await markAllRead(userId);
    return res.status(200).json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to mark all read', message: err.message });
  }
});
