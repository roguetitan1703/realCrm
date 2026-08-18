/**
 * ============================================================================
 * ⚡ UNIVERSAL ACTION-ORIENTED REST API ROUTES
 * ============================================================================
 * Handles domain workflows across ANY module record: Click-to-Call bridges,
 * WhatsApp template dispatches, atomic stage transitions, and record merging.
 * ============================================================================
 */

import { Router, Request, Response } from 'express';
import {
  CallActionSchema,
  WhatsAppActionSchema,
  StageChangeSchema,
  MergeSchema,
} from '../models';
import {
  requireTenantAuth,
  requireModuleEnabled,
  requireQuotaAvailable,
} from '../middleware/auth';
import {
  addTimelineEvent, updateLead, mergeLeads, getLeadById,
  getTimelineEventById, updateTimelineEvent, maybeAutoAdvanceStage,
  addActivity, ACTIVITY_TYPES, ACTIVITY_OUTCOMES, noteOwnerContact, closeFollowUpFor } from '../services/store';
import { isSafeKey, tenantOfKey } from '../services/media';
import { audit } from '../services/audit';

export const actionsRouter = Router();

actionsRouter.use(requireTenantAuth);

/**
 * REMARK — a threaded note on any record (lead or property). B1: many per
 * record, newest-first, author + time, author can edit their own (no delete).
 * POST /api/v1/records/:id/actions/remark
 */
actionsRouter.post('/:id/actions/remark', async (req: Request, res: Response) => {
  try {
    const recordId = req.params.id;
    const text = String(req.body?.text || '').trim();
    if (!text) return res.status(400).json({ error: 'Remark text is required' });
    const authorId = req.user?.id || null;
    const evt = await addTimelineEvent({
      record_id: recordId, type: 'remark', title: 'Remark', description: text,
      author: authorId || undefined,
    });
    audit({
      tenant_id: req.tenantId!, actor_type: 'user', actor_id: authorId,
      actor_label: authorId || 'system', action: 'remark.added',
      target_type: 'record', target_id: recordId, summary: 'Remark added', metadata: {},
    });
    return res.status(201).json({
      success: true,
      timeline_event: { id: evt.id, type: 'remark', label: text, authorId, timestamp: evt.timestamp, metadata: {} },
    });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to add remark', message: err.message });
  }
});

// Event types a person can edit-own. Remark is the pure notes case (B1); call/
// wa/sms are B5's "add an outcome + remark to that action afterward" — same
// author-only rule, same endpoint, just also accepts an `outcome`. System/
// stage-change events are never author-editable — they're records, not notes.
const AUTHOR_EDITABLE_TYPES = new Set(['remark', 'call', 'whatsapp', 'sms']);

/**
 * The call outcomes that mean "we did not get through", which is exactly what
 * the 'Call Not Received' status records.
 *
 * Two defects lived here. It matched /no\s*answer/ alone, so "Busy or switched
 * off" — the same outcome for the desk, a person who has not been spoken to —
 * moved nothing: the rule fired 15 times on bhumi and skipped 4. And it matched
 * on the outcome's LABEL, because the label was what got stored, so this rule
 * was regexing display copy and the wording could not be changed without
 * silently breaking it.
 *
 * Both are gone. `metadata.outcome` holds the key now, so this is a set of two
 * keys from src/data/callOutcomes.js and the labels above them are free to say
 * whatever agents actually say.
 */
const DIDNT_REACH_THEM = new Set(['no_answer', 'unreachable']);

/**
 * Edit a remark (or attach outcome+remark to a logged call/message) —
 * author-only. Not the last-write-wins pattern of stage/status changes: this
 * literally rejects anyone but the person who wrote it.
 * PATCH /api/v1/records/:id/actions/remark/:eventId  body { text, outcome? }
 */
actionsRouter.patch('/:id/actions/remark/:eventId', async (req: Request, res: Response) => {
  try {
    const { eventId } = req.params;
    const text = String(req.body?.text || '').trim();
    const outcome = req.body?.outcome ? String(req.body.outcome).trim() : undefined;
    if (!text && !outcome) return res.status(400).json({ error: 'Add a remark or an outcome' });
    const existing = await getTimelineEventById(eventId, req.tenantId!);
    if (!existing) return res.status(404).json({ error: 'Not found' });
    if (!AUTHOR_EDITABLE_TYPES.has(existing.type)) return res.status(400).json({ error: 'This entry cannot be edited' });
    const authorId = req.user?.id || null;
    if (!authorId || existing.author !== authorId) {
      return res.status(403).json({ error: 'You can only edit your own entry' });
    }
    const finalText = text || existing.description;
    const updated = await updateTimelineEvent(eventId, req.tenantId!, finalText, outcome);
    if (!updated) return res.status(404).json({ error: 'Not found' });
    // A call that rang out is something the system observed directly, not a
    // judgment call — so it moves the lead's status on its own, same as a
    // proven site visit. Everything else logged here ("Interested", "Not
    // interested"…) stays a human decision.
    if (existing.type === 'call' && outcome && DIDNT_REACH_THEM.has(outcome)) {
      await maybeAutoAdvanceStage(existing.record_id, 'Call Not Received', 'Nobody answered the call');
    }
    audit({
      tenant_id: req.tenantId!, actor_type: 'user', actor_id: authorId,
      actor_label: authorId, action: existing.type === 'remark' ? 'remark.updated' : 'contact_action.updated',
      target_type: 'record', target_id: existing.record_id, summary: 'Entry edited', metadata: { outcome },
    });
    // DB type -> client-facing channel vocabulary (whatsapp -> wa), same
    // translation the contact-log route and mapEventForClient use.
    const clientType = existing.type === 'whatsapp' ? 'wa' : existing.type;
    return res.status(200).json({
      success: true,
      timeline_event: { id: updated.id, type: clientType, label: finalText, authorId, timestamp: updated.timestamp, metadata: updated.metadata },
    });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to save', message: err.message });
  }
});

/**
 * B5 — log a plain contact action (call / WhatsApp / SMS) on ANY record: lead,
 * property, or a contact resolved to one. This is deliberately lightweight —
 * no module gating, no quota, no telephony-bridge simulation (that's the
 * Leads-specific /actions/call above) — it exists purely to record "the user
 * confirmed and was redirected to their dialer/WhatsApp", author-attributed,
 * so it can be edited afterward with an outcome + remark via the route above.
 * POST /api/v1/records/:id/actions/contact-log   body { channel: 'call'|'wa'|'sms'|'email' }
 */
actionsRouter.post('/:id/actions/contact-log', async (req: Request, res: Response) => {
  try {
    const recordId = req.params.id;
    // Frontend-facing channel name stays 'wa' (matches the rest of the app);
    // the DB type is 'whatsapp' to match the existing WABA dispatch route's
    // convention — one spelling for "this was a WhatsApp event", not two.
    const channel = ['call', 'wa', 'sms', 'email'].includes(req.body?.channel) ? req.body.channel : 'call';
    const dbType = channel === 'wa' ? 'whatsapp' : channel;
    const authorId = req.user?.id || null;
    const TITLES: Record<string, string> = { call: 'Call', wa: 'WhatsApp', sms: 'SMS', email: 'Email' };
    const title = TITLES[channel] || 'Call';
    const evt = await addTimelineEvent({
      record_id: recordId, type: dbType, title, description: `${title} initiated`,
      author: authorId || undefined,
    });
    // The call that was booked has now been made, so the booking is over —
    // and it is over because the work happened, not because anyone ticked a
    // box. No-ops when the lead has no follow-up, or one of another kind.
    await closeFollowUpFor(recordId, channel === 'call' ? 'call' : '').catch(() => {});
    // No-ops unless the record is an owner: stamps the attempt and moves
    // New → Contacted, so a cold-calling queue can tell "not dialled yet" from
    // "dialled, no answer" without reading every record's timeline.
    await noteOwnerContact(recordId, channel);
    audit({
      tenant_id: req.tenantId!, actor_type: 'user', actor_id: authorId,
      actor_label: authorId || 'system', action: 'contact_action.logged',
      target_type: 'record', target_id: recordId, summary: `${title} logged`, metadata: { channel },
    });
    return res.status(201).json({
      success: true,
      timeline_event: { id: evt.id, type: channel, label: evt.description, authorId, timestamp: evt.timestamp, metadata: {} },
    });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to log the action', message: err.message });
  }
});

/**
 * There was a CLICK-TO-CALL TELEPHONY BRIDGE here. It invented a DID, an API
 * key and a call SID, logged "Initiated outbound telephony call to <number>
 * via DID 08045678900 (SID: call_exo_…)" to the record, and answered
 * "Leg 1 will ring in 2 seconds" — while never contacting Exotel or anyone
 * else. Nothing rang. The timeline entry was a fabricated record of a call
 * that did not happen, which is worse than having no calling at all.
 *
 * Calls are placed on the agent's own handset and recorded through
 * /actions/contact-log below, which claims only what actually occurred.
 * When real telephony is wired up it goes back here, and only then.
 */

/**
 * The OUTBOUND WABA DISPATCH route was here. Same fiction as the telephony
 * bridge: it read a phone id out of the old integrations table, defaulted it to
 * 'waba_phone_default', logged "Dispatched WABA template … via Meta Cloud API
 * (Message ID: waba_msg_…)" and contacted Meta at no point.
 *
 * We send WhatsApp by wa.me deep link from the composer — the agent's own
 * WhatsApp, no Business API — and that send is recorded through
 * /actions/contact-log. Nothing here was ever called by the app.
 */

/**
 * 3. ATOMIC STAGE CHANGE & MANDATORY NOTE LOGGING
 * POST /api/v1/records/:id/actions/stage-change
 */
actionsRouter.post(
  '/:id/actions/stage-change',
  async (req: Request, res: Response) => {
    try {
      const recordId = req.params.id;
      const parseResult = StageChangeSchema.safeParse(req.body);

      if (!parseResult.success) {
        return res.status(400).json({ error: 'Validation Error', details: parseResult.error.format() });
      }

      const { new_stage_id, note } = parseResult.data;

      console.log(`[Stage Change] Record ${recordId} -> Stage ${new_stage_id} | Note: "${note ?? ''}"`);

      // ONE event, written inside updateLead, which logs the transition for
      // every caller (the record form, this route, a future bulk edit). This
      // route also wrote its own, so a single status change produced two
      // timeline rows in the same second saying the same thing differently.
      // The note rides along instead of being the reason for a second row.
      // The note only when there IS one — see assertLeadWrite: an always-present
      // key reads as an attempt to write that field even when it carries nothing.
      await updateLead(recordId, { stage: new_stage_id, ...(note ? { stageNote: note } : {}) });

      // No outbound webhook here. There is no outbound-webhook feature: no
      // tenant configures a URL, nothing stores one, and this call site hard-
      // coded the DEMO tenant's domain — so every stage change on the paying
      // client POSTed that client's record id, stage, note and user id at
      // api.skylinerealty.in, which is NXDOMAIN. It failed at DNS, retried five
      // times with backoff and dead-lettered, on every stage change, forever.
      // The domain being unregistered is the whole reason nothing leaked;
      // anyone who registers it starts receiving a real firm's desk activity.
      // If outbound webhooks are ever wanted they need a per-tenant configured
      // URL and a secret, not a literal.

      return res.status(200).json({
        success: true,
        message: 'Record stage updated and audit note recorded atomically.',
        record_id: recordId,
        new_stage_id: new_stage_id,
        audit_note: note ?? null,
      });
    } catch (err: any) {
      if (err?.status === 403) {
        return res.status(403).json({ success: false, error: 'Forbidden', message: err.message, code: err.code });
      }
      return res.status(500).json({ error: 'Stage Change Failed', message: err.message });
    }
  }
);

/**
 * 4. UNIVERSAL RECORD DEDUPLICATION MERGE ENGINE
 * POST /api/v1/records/:id/actions/merge
 */
actionsRouter.post(
  '/:id/actions/merge',
  async (req: Request, res: Response) => {
    try {
      const primaryRecordId = req.params.id;
      const parseResult = MergeSchema.safeParse(req.body);

      if (!parseResult.success) {
        return res.status(400).json({ error: 'Validation Error', details: parseResult.error.format() });
      }

      const { duplicate_record_id, merge_strategy } = parseResult.data;

      console.log(`[Merge Engine] Merging duplicate ${duplicate_record_id} into primary ${primaryRecordId} using strategy '${merge_strategy}'`);

      const merged = await mergeLeads(primaryRecordId, duplicate_record_id);

      return res.status(200).json({
        success: true,
        message: `Successfully merged all timeline notes and call recordings from record ${duplicate_record_id} into primary record ${primaryRecordId}.`,
        primary_record_id: primaryRecordId,
        archived_duplicate_id: duplicate_record_id,
        data: merged,
      });
    } catch (err: any) {
      return res.status(500).json({ error: 'Merge Engine Failed', message: err.message });
    }
  }
);

/**
 * B4 — log an ACTIVITY on a lead, with proof.
 * POST /api/v1/records/:id/actions/activity
 * body { type, propertyId?, remark?, outcome?, photoKey?, geo{lat,lng,accuracy} }
 *
 * :id is the LEAD id — activities are owned by the lead, always. `propertyId`
 * is a reference to the unit a visit concerned; nothing is ever written onto
 * the property row (spec B4: "the property record must not accumulate
 * activity data").
 *
 * A site_visit is held to a higher bar than other activity types, because the
 * whole point of it is that it can't be faked from the sofa:
 *   • geo is MANDATORY — no location, no logged visit
 *   • a proof photo is MANDATORY, and must be a key we minted
 * Other types (call/meeting/follow_up/note) are ordinary log entries.
 */
actionsRouter.post('/:id/actions/activity', async (req: Request, res: Response) => {
  try {
    const leadId = String(req.params.id);
    const type = String(req.body?.type || '').trim();
    if (!ACTIVITY_TYPES.has(type)) {
      return res.status(400).json({ error: `Unknown activity type '${type}'` });
    }

    const outcome = req.body?.outcome ? String(req.body.outcome).trim() : null;
    if (outcome && !ACTIVITY_OUTCOMES.has(outcome)) {
      return res.status(400).json({ error: `Unknown outcome '${outcome}'` });
    }

    const remark = req.body?.remark ? String(req.body.remark).trim() : null;
    const propertyId = req.body?.propertyId ? String(req.body.propertyId) : null;
    const photoKey = req.body?.photoKey ? String(req.body.photoKey) : null;

    const rawGeo = req.body?.geo;
    const lat = Number(rawGeo?.lat);
    const lng = Number(rawGeo?.lng);
    const hasGeo = Number.isFinite(lat) && Number.isFinite(lng)
      && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;

    if (type === 'site_visit') {
      // Enforced server-side, not just in the UI: a client that skips the
      // camera or denies location cannot post a visit by calling the API.
      if (!hasGeo) {
        return res.status(400).json({ error: 'Location is required to log a site visit.' });
      }
      if (!photoKey) {
        return res.status(400).json({ error: 'A visit selfie is required to log a site visit.' });
      }
    }

    // Only keys this server minted, under THIS tenant's prefix, are accepted —
    // otherwise a caller could attach another workspace's photo to their own
    // record, or point the key at something we never stored.
    if (photoKey) {
      if (!isSafeKey(photoKey) || tenantOfKey(photoKey) !== req.tenantId) {
        return res.status(400).json({ error: 'That photo does not belong to this workspace.' });
      }
    }

    const lead = await getLeadById(leadId);
    if (!lead) return res.status(404).json({ error: 'Lead not found' });

    const agentId = req.user?.id || null;
    const row = await addActivity({
      lead_id: leadId,
      property_id: propertyId,
      type,
      agent_id: agentId,
      remark,
      outcome,
      photo_key: photoKey,
      geo: hasGeo
        ? { lat, lng, accuracy: Number.isFinite(Number(rawGeo?.accuracy)) ? Number(rawGeo.accuracy) : undefined }
        : null,
    });

    audit({
      tenant_id: req.tenantId!, actor_type: 'user', actor_id: agentId,
      actor_label: agentId || 'system', action: 'activity.added',
      target_type: 'lead', target_id: leadId,
      summary: `${type} logged`,
      metadata: { type, outcome, propertyId, hasPhoto: Boolean(photoKey), hasGeo },
    });

    return res.status(201).json({ success: true, activity_id: row.id });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to log activity', message: err.message });
  }
});
