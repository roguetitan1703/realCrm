/**
 * The activity report — what people did on a day. services/activityReport.ts
 * says what counts and why.
 *
 *   GET /activity?side=leads|calling&date=YYYY-MM-DD[&person=id]
 *       one row per person, every count; an agent only ever gets their own
 *   GET /activity/records?side=&date=&person=&measure=&detail=
 *       the people behind one of those numbers, from the same query
 */
import { Router, Request, Response } from 'express';
import { requireTenantAuth } from '../middleware/auth';
import { activityDay, activityRecords, type Side } from '../services/activityReport';

export const activityRouter = Router();
activityRouter.use(requireTenantAuth);

const sideOf = (v: any): Side => (v === 'calling' ? 'calling' : 'leads');
const str = (v: any) => (typeof v === 'string' && v ? v : null);

activityRouter.get('/', async (req: Request, res: Response) => {
  try {
    res.json(await activityDay({ side: sideOf(req.query.side), date: str(req.query.date), person: str(req.query.person) }));
  } catch (err: any) {
    res.status(500).json({ error: 'Could not read the day', message: err.message });
  }
});

activityRouter.get('/records', async (req: Request, res: Response) => {
  const measure = str(req.query.measure);
  if (!measure) return res.status(400).json({ error: 'measure is required' });
  try {
    res.json({ records: await activityRecords({
      side: sideOf(req.query.side), date: str(req.query.date), person: str(req.query.person),
      measure, detail: str(req.query.detail),
    }) });
  } catch (err: any) {
    res.status(500).json({ error: 'Could not read the records', message: err.message });
  }
});
