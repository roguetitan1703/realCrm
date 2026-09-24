/**
 * PAGES ANYONE MAY OPEN, WITHOUT SIGNING IN.
 *
 *   GET /api/v1/public/gallery/:ref   a listing's photos, for its photo link
 *                                     (services/gallery.ts decides what is shown)
 *
 * A link that is wrong, turned off or replaced answers 404 with the same body,
 * so the page cannot be used to learn which listings exist.
 */
import { Router, Request, Response } from 'express';
import { publicGallery } from '../services/gallery';

export const publicRouter = Router();

publicRouter.get('/gallery/:ref', async (req: Request, res: Response) => {
  try {
    const g = await publicGallery(req.params.ref);
    if (!g) return res.status(404).json({ error: 'This link does not work any more.' });
    res.set('Cache-Control', 'private, max-age=60');
    return res.json({ success: true, ...g });
  } catch (err: any) {
    return res.status(500).json({ error: 'Could not open the photos' });
  }
});
