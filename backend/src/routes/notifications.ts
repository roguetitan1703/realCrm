/**
 * ============================================================================
 * 🔔 NOTIFICATIONS ROUTES
 * ============================================================================
 *   GET  /api/v1/notifications            → current user's feed + unread count
 *   POST /api/v1/notifications/:id/read   → mark one read
 *   POST /api/v1/notifications/read-all    → mark all read
 *   GET  /api/v1/notifications/deliveries  → what reached devices (owner/manager)
 *   POST /api/v1/notifications/ack         → service worker: this was shown/opened (public)
 *   POST /api/v1/notifications/resubscribe → service worker: my endpoint rotated (public)
 * The "current user" is the token's user (req.user.id, set by
 * withRequestContext); the store scopes everything to the request tenant.
 * ============================================================================
 */

import { Router, Request, Response } from 'express';
import { requireTenantAuth } from '../middleware/auth';
import { listNotifications, unreadCount, markRead, markAllRead } from '../services/notifications';
import { pushEnabled, vapidPublicKey, saveSubscription, removeSubscription, listDeliveries, deliveryReadiness, recordAck, rebindSubscription } from '../services/push';

export const notificationsRouter = Router();

// ── Public, and deliberately so ─────────────────────────────────────────────
// DEFINED BEFORE requireTenantAuth, which is what keeps them unauthenticated.
// Both are called by the SERVICE WORKER, which runs with no page, no session
// and no access to the token in localStorage — there is nothing for it to
// authenticate with. Each is instead authorised by possessing a secret it could
// only have got by being the device: an ack token that existed solely inside a
// payload encrypted to one subscription, or the subscription endpoint itself.
// Neither reads anything back out, so a wrong guess learns nothing.
notificationsRouter.post('/ack', async (req: Request, res: Response) => {
  try {
    // 204 either way. An unknown token is an expired or pruned delivery, not an
    // error worth a retry loop on someone's handset.
    await recordAck(String(req.body?.token || ''), String(req.body?.event || 'displayed'));
    return res.status(204).end();
  } catch (err: any) {
    return res.status(204).end();
  }
});

notificationsRouter.post('/resubscribe', async (req: Request, res: Response) => {
  try {
    const ok = await rebindSubscription(String(req.body?.oldEndpoint || ''), req.body?.subscription);
    return res.status(ok ? 200 : 404).json({ success: ok });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to rebind subscription' });
  }
});

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
    // THE BELL IS A NUMBER. The drawer is the pile.
    //
    // Every page load fetched up to 100 rows — titles, bodies, links — 23.5 kB
    // on a live desk, more than every other request on the dashboard combined,
    // to render a badge that shows one integer. `?count=1` is what boot and the
    // pulse poll ask for; the rows are fetched when the drawer opens.
    if (req.query.count) {
      return res.status(200).json({ success: true, notifications: null, unread: await unreadCount(userId) });
    }
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
