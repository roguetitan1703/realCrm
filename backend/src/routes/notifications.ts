/**
 * ============================================================================
 * 🔔 NOTIFICATIONS ROUTES
 * ============================================================================
 *   GET  /api/v1/notifications            → current user's feed + unread count
 *   POST /api/v1/notifications/:id/read   → mark one read
 *   POST /api/v1/notifications/read-all    → mark all read
 * The "current user" is the token's user (req.user.id, set by
 * withRequestContext); the store scopes everything to the request tenant.
 * ============================================================================
 */

import { Router, Request, Response } from 'express';
import { requireTenantAuth } from '../middleware/auth';
import { listNotifications, unreadCount, markRead, markAllRead } from '../services/notifications';
import { pushEnabled, vapidPublicKey, saveSubscription, removeSubscription } from '../services/push';

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
    await saveSubscription(req.tenantId!, userId, req.body?.subscription);
    return res.status(200).json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to subscribe', message: err.message });
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
