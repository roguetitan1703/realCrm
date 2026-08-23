/**
 * ============================================================================
 * 🔄 UNIVERSAL MODULE RECORD CRUD & QUERY API ROUTER
 * ============================================================================
 * Handles querying, creating, updating, and deleting records for ANY module
 * ('leads', 'properties', 'clients', 'deals', or custom tenant modules)
 * backed by the live server store.
 * ============================================================================
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { requireTenantAuth } from '../middleware/auth';
import {
  getLeads, getLeadById, createLead, updateLead, deleteLead,
  getProperties, createProperty, updateProperty, deleteProperty,
  getTimelineEvents
} from '../services/store';
import { canEditListing, canDeleteRecord } from '../lib/permissions';

export const recordsRouter = Router({ mergeParams: true });

recordsRouter.use(requireTenantAuth);

function actorCtx(req: Request) {
  return {
    actorType: 'user' as const,
    actorId: req.user?.id ?? null,
    actorLabel: req.user?.name ?? null,
    ip: req.ip || req.socket?.remoteAddress || null,
    userAgent: (req.headers['user-agent'] as string) || null,
  };
}

/**
 * 1. QUERY RECORDS FOR A MODULE
 * GET /api/v1/modules/:moduleKey/records
 */
recordsRouter.get('/', async (req: Request, res: Response) => {
  const { moduleKey } = req.params;
  const { stage, search, limit = '50', offset = '0' } = req.query;

  try {
    let records: any[] = [];
    if (moduleKey === 'leads') {
      records = await getLeads();
      if (stage && typeof stage === 'string') {
        records = records.filter(l => l.stage === stage);
      }
      if (search && typeof search === 'string') {
        const s = search.toLowerCase();
        records = records.filter(l =>
          (l.name && l.name.toLowerCase().includes(s)) ||
          (l.phone && l.phone.includes(s)) ||
          // String(), because a requirement field can hold several values and
          // calling toLowerCase on an array is a 500, not a missed match.
          (l.req?.locality && String(l.req.locality).toLowerCase().includes(s))
        );
      }
    } else if (moduleKey === 'properties') {
      records = await getProperties();
    } else {
      records = [];
    }

    return res.status(200).json({
      success: true,
      module_key: moduleKey,
      count: records.length,
      limit: Number(limit),
      offset: Number(offset),
      data: records,
    });
  } catch (err: any) {
    return res.status(500).json({ error: 'Query Failed', message: err.message });
  }
});

/**
 * 2. CREATE A RECORD IN A MODULE
 * POST /api/v1/modules/:moduleKey/records
 */
recordsRouter.post('/', async (req: Request, res: Response) => {
  const { moduleKey } = req.params;
  const payload = req.body;

  if (moduleKey === 'properties' && !canEditListing(req.user?.role)) {
    return res.status(403).json({ error: 'Forbidden', message: 'Only an owner or manager can add a listing.', code: 'ROLE_REQUIRED' });
  }

  try {
    let created: any;
    if (moduleKey === 'leads') {
      created = await createLead(payload, actorCtx(req));
    } else if (moduleKey === 'properties') {
      created = await createProperty(payload, actorCtx(req));
    } else {
      created = { id: `rec_${Date.now()}`, ...payload };
    }

    return res.status(201).json({
      success: true,
      message: `Record successfully created in '${moduleKey}' module.`,
      data: created,
    });
  } catch (err: any) {
    return res.status(500).json({ error: 'Record Creation Failed', message: err.message });
  }
});

/**
 * 3. GET SINGLE RECORD & TIMELINE EVENTS
 * GET /api/v1/modules/:moduleKey/records/:id
 */
recordsRouter.get('/:id', async (req: Request, res: Response) => {
  const { moduleKey, id } = req.params;

  try {
    let record: any;
    if (moduleKey === 'leads') {
      record = await getLeadById(id);
    } else if (moduleKey === 'properties') {
      const props = await getProperties();
      record = props.find(p => p.id === id);
    }

    if (!record) {
      return res.status(404).json({ error: 'Not Found', message: `Record ${id} not found in ${moduleKey}.` });
    }

    const timeline = await getTimelineEvents(id);

    return res.status(200).json({
      success: true,
      data: record,
      timeline,
    });
  } catch (err: any) {
    return res.status(500).json({ error: 'Fetch Failed', message: err.message });
  }
});

/**
 * 4. UPDATE A RECORD (PUT / PATCH)
 * PATCH/PUT /api/v1/modules/:moduleKey/records/:id
 */
const updateHandler = async (req: Request, res: Response) => {
  const { moduleKey, id } = req.params;
  const updates = req.body;

  // A listing's facts are desk-owned. Note this guards the RECORD, not the
  // record's history — remarks, call logs and visit logs go through
  // /records/:id/actions/* and stay open to every signed-in user.
  if (moduleKey === 'properties' && !canEditListing(req.user?.role)) {
    return res.status(403).json({ error: 'Forbidden', message: 'Only an owner or manager can change a listing.', code: 'ROLE_REQUIRED' });
  }

  try {
    let updated: any;
    if (moduleKey === 'leads') {
      updated = await updateLead(id, updates, actorCtx(req));
    } else if (moduleKey === 'properties') {
      updated = await updateProperty(id, updates, actorCtx(req));
    }

    if (!updated) {
      return res.status(404).json({ error: 'Not Found', message: `Record ${id} not found.` });
    }

    return res.status(200).json({
      success: true,
      message: 'Record updated successfully.',
      data: updated,
    });
  } catch (err: any) {
    // A refused write is a 403 with the reason, not a 500. The client shows this
    // message verbatim, so it has to say which part of the edit was refused.
    if (err?.status === 403) {
      return res.status(403).json({ success: false, error: 'Forbidden', message: err.message, code: err.code });
    }
    return res.status(500).json({ error: 'Update Failed', message: err.message });
  }
};

recordsRouter.patch('/:id', updateHandler);
recordsRouter.put('/:id', updateHandler);

/**
 * 5. DELETE A RECORD
 * DELETE /api/v1/modules/:moduleKey/records/:id
 */
recordsRouter.delete('/:id', async (req: Request, res: Response) => {
  const { moduleKey, id } = req.params;

  if (!canDeleteRecord(req.user?.role)) {
    return res.status(403).json({ error: 'Forbidden', message: 'Only an owner can delete a record.', code: 'ROLE_REQUIRED' });
  }

  try {
    let deleted = false;
    if (moduleKey === 'leads') {
      deleted = await deleteLead(id, actorCtx(req));
    } else if (moduleKey === 'properties') {
      deleted = await deleteProperty(id, actorCtx(req));
    }

    return res.status(200).json({
      success: true,
      deleted,
      message: `Record ${id} deleted from ${moduleKey}.`,
    });
  } catch (err: any) {
    if (err?.status === 403) {
      return res.status(403).json({ success: false, error: 'Forbidden', message: err.message, code: err.code });
    }
    return res.status(500).json({ error: 'Delete Failed', message: err.message });
  }
});
