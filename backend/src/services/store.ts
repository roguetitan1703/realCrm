/**
 * ============================================================================
 * 📦 SUPABASE POSTGRESQL STATE STORE & DEMO SEEDING ENGINE
 * ============================================================================
 * Acts as the single source of truth for the Express backend, backed by live
 * Supabase PostgreSQL tables. All functions are async and execute real SQL.
 * ============================================================================
 */

import { sql, initSchema } from './db.js';
import { agents as seedAgents, properties as seedProps, leads as seedLeads } from '../../../src/data/seed.js';
import { DEFAULT_SETTINGS } from '../../../src/data/theme.js';

export interface TimelineEvent {
  id: string;
  record_id: string;
  type: string;
  title: string;
  description: string;
  author?: string;
  timestamp: string;
  metadata?: any;
}

export interface RoutingRule {
  strategy: 'round_robin' | 'weighted' | 'strict_territory';
  active_agent_ids: string[];
  last_assigned_index: number;
}

export interface ServerState {
  agents: any[];
  properties: any[];
  leads: any[];
  inactiveAgentIds: string[];
  settings: any;
  integrations: Record<string, any>;
  routing_rules: RoutingRule;
  timeline_events: TimelineEvent[];
}

// Helper converters from DB rows to frontend shapes
function rowToAgent(r: any): any {
  return {
    id: r.id,
    name: r.name,
    first: r.first,
    initials: r.initials,
    avatar: r.avatar,
    role: r.role || 'agent',
    dutyStatus: r.duty_status || 'ACTIVE',
    ...(r.metadata || {}),
  };
}

function rowToProperty(r: any): any {
  return {
    id: r.id,
    title: r.title,
    status: r.status || 'Available',
    type: r.type,
    locality: r.locality,
    price: r.price,
    tower: r.tower,
    unit: r.unit,
    ...(r.config || {}),
    tenancy: r.tenancy || undefined,
    timeline: r.timeline || [],
  };
}

function rowToLead(r: any, events: TimelineEvent[] = []): any {
  const createdMs = r.created_at ? new Date(r.created_at).getTime() : Date.now();
  const minsAgo = Math.max(0, Math.floor((Date.now() - createdMs) / 60000));
  
  // Format timeline events for lead object
  const leadEvents = events
    .filter(e => e.record_id === r.id)
    .map(e => ({
      type: e.type === 'stage_change' ? 'stage' : e.type === 'creation' ? 'note' : 'msg',
      label: e.title ? `${e.title}: ${e.description}` : e.description,
      ago: 'just now',
      timestamp: e.timestamp,
    }));

  return {
    id: r.id,
    name: r.name,
    phone: r.phone,
    email: r.email || '',
    stage: r.stage || 'New',
    source: r.source || 'Website',
    agentId: r.agent_id,
    req: r.req || {},
    notes: r.notes || [],
    shortlist: r.shortlist || [],
    feedback: r.feedback || {},
    duplicateOf: r.duplicate_of || undefined,
    minsAgo,
    timeline: leadEvents.length > 0 ? leadEvents : (r.notes || []).map((n: string) => ({ type: 'note', label: n, ago: 'just now' })),
  };
}

/**
 * Seed database with initial demo data if tables are empty or forced reset.
 */
export async function seedDatabase(forceReset = false): Promise<ServerState> {
  await initSchema();

  const [{ count }] = await sql`SELECT count(*)::int as count FROM crm_leads`;
  if (count > 0 && !forceReset) {
    console.log(`[Supabase DB] ℹ️ Database already contains ${count} leads. Skipping seed.`);
    return await getState();
  }

  console.log(`[Supabase DB] 🔄 Bootstrapping initial Bhumi Propcity CRM demo data into PostgreSQL...`);

  // 1. Seed Agents
  for (const a of seedAgents) {
    const meta = { initials: a.initials, avatar: a.avatar };
    await sql`
      INSERT INTO crm_agents (id, name, first, initials, avatar, role, duty_status, metadata)
      VALUES (${a.id}, ${a.name}, ${a.first}, ${a.initials}, ${a.avatar}, 'agent', 'ACTIVE', ${sql.json(meta)})
      ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, first = EXCLUDED.first, metadata = EXCLUDED.metadata;
    `;
  }

  // 2. Seed Properties
  for (const p of seedProps) {
    const config = {
      beds: p.beds, baths: p.baths, area: p.area, sqftLabel: p.sqftLabel,
      priceLabel: p.priceLabel, floor: p.floor, view: p.view, facing: p.facing,
      parking: p.parking, completion: p.completion, builder: p.builder,
      image: p.image, highlights: p.highlights || [],
    };
    await sql`
      INSERT INTO crm_properties (id, title, status, type, locality, price, tower, unit, config, tenancy, timeline)
      VALUES (${p.id}, ${p.title}, ${p.status || 'Available'}, ${p.type}, ${p.locality}, ${p.price || ''}, ${p.tower || 'A'}, ${p.unit || '101'}, ${sql.json(config)}, ${sql.json(p.tenancy || null)}, ${sql.json(p.timeline || [])})
      ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title, status = EXCLUDED.status, config = EXCLUDED.config;
    `;
  }

  // 3. Seed Leads & Timeline
  for (const l of seedLeads) {
    await sql`
      INSERT INTO crm_leads (id, name, phone, email, stage, source, agent_id, req, notes, shortlist, feedback, duplicate_of)
      VALUES (${l.id}, ${l.name}, ${l.phone}, ${l.email || null}, ${l.stage}, ${l.source || 'Website'}, ${l.agentId || 'a1'}, ${sql.json(l.req || {})}, ${sql.json(l.notes || [])}, ${sql.json(l.shortlist || [])}, ${sql.json(l.feedback || {})}, ${l.duplicateOf || null})
      ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, stage = EXCLUDED.stage, agent_id = EXCLUDED.agent_id;
    `;

    // Add creation timeline event
    const ts = new Date(Date.now() - (l.minsAgo || 60) * 60000).toISOString();
    await sql`
      INSERT INTO crm_timeline_events (id, record_id, type, title, description, author, timestamp, metadata)
      VALUES (${`evt_seed_${l.id}`}, ${l.id}, 'creation', 'Inquiry Received', ${`Inquiry captured via ${l.source || 'Direct'} channel for ${l.req?.locality || 'Pune'}.`}, 'System', ${ts}, ${sql.json({})})
      ON CONFLICT (id) DO NOTHING;
    `;
  }

  // 4. Seed Settings
  await sql`
    INSERT INTO crm_settings (key, value) VALUES ('default', ${sql.json(DEFAULT_SETTINGS)})
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
  `;

  // 5. Seed Integrations
  const initialIntegrations = {
    '99acres': { status: 'staged', webhookUrl: 'https://api.bhumipropcity.com/v1/ingest/bhumi-propcity/99acres', secret: 'whsec_99acres_demo_882' },
    'MagicBricks': { status: 'staged', webhookUrl: 'https://api.bhumipropcity.com/v1/ingest/bhumi-propcity/magicbricks', secret: 'whsec_mb_demo_391' },
    'Calling & SMS': { status: 'staged', apiKey: 'exo_key_demo_902', sid: 'exo_sid_demo_112', callerId: '020-71189900' },
    'WhatsApp Business API': { status: 'staged', phoneId: 'waba_phone_881920', accessToken: 'EAAGm00192a000demo', wabaId: 'waba_id_881920' },
    'Website sync': { status: 'staged', webhookUrl: 'https://api.bhumipropcity.com/v1/ingest/bhumi-propcity/website', secret: 'whsec_web_demo_109' },
  };
  for (const [key, val] of Object.entries(initialIntegrations)) {
    await sql`
      INSERT INTO crm_integrations (key, config) VALUES (${key}, ${sql.json(val)})
      ON CONFLICT (key) DO UPDATE SET config = EXCLUDED.config;
    `;
  }

  // 6. Seed Routing Rules
  const activeIds = seedAgents.map(a => a.id);
  await sql`
    INSERT INTO crm_routing_rules (id, strategy, active_agent_ids, last_assigned_index)
    VALUES (1, 'round_robin', ${sql.json(activeIds)}, -1)
    ON CONFLICT (id) DO UPDATE SET active_agent_ids = EXCLUDED.active_agent_ids;
  `;

  console.log(`[Supabase DB] ✅ Seeded initial PostgreSQL data cleanly.`);
  return await getState();
}

/**
 * Reset database to a clean factory seed state.
 */
export async function resetDatabase(): Promise<ServerState> {
  console.log(`[Supabase DB] 🧹 Truncating all CRM tables for workspace reset...`);
  await sql`TRUNCATE TABLE crm_timeline_events, crm_leads, crm_properties, crm_agents, crm_settings, crm_integrations, crm_routing_rules CASCADE;`;
  return await seedDatabase(true);
}

// Ensure seeded on module load
seedDatabase().catch(err => console.error('[Supabase Boot Error]:', err.message));

// ============================================================================
// 📖 ASYNC READ & MUTATION HELPER API
// ============================================================================

export async function getState(): Promise<ServerState> {
  const [agentsRows, propsRows, leadsRows, settingsRows, intRows, routingRows, timelineRows] = await Promise.all([
    sql`SELECT * FROM crm_agents`,
    sql`SELECT * FROM crm_properties ORDER BY created_at DESC`,
    sql`SELECT * FROM crm_leads ORDER BY created_at DESC`,
    sql`SELECT value FROM crm_settings WHERE key = 'default'`,
    sql`SELECT key, config FROM crm_integrations`,
    sql`SELECT * FROM crm_routing_rules WHERE id = 1`,
    sql`SELECT * FROM crm_timeline_events ORDER BY timestamp DESC`,
  ]);

  const timeline_events: TimelineEvent[] = timelineRows.map(r => ({
    id: r.id,
    record_id: r.record_id,
    type: r.type,
    title: r.title,
    description: r.description,
    author: r.author || undefined,
    timestamp: r.timestamp instanceof Date ? r.timestamp.toISOString() : String(r.timestamp),
    metadata: r.metadata || {},
  }));

  const agents = agentsRows.map(rowToAgent);
  const inactiveAgentIds = agentsRows.filter(a => a.duty_status === 'OFF_DUTY').map(a => a.id);
  const properties = propsRows.map(rowToProperty);
  const leads = leadsRows.map(r => rowToLead(r, timeline_events));

  const settings = settingsRows[0]?.value || DEFAULT_SETTINGS;
  const integrations: Record<string, any> = {};
  for (const row of intRows) {
    integrations[row.key] = row.config;
  }

  const rRow = routingRows[0] || { strategy: 'round_robin', active_agent_ids: agents.map(a => a.id), last_assigned_index: -1 };
  const routing_rules: RoutingRule = {
    strategy: rRow.strategy as any,
    active_agent_ids: rRow.active_agent_ids || [],
    last_assigned_index: rRow.last_assigned_index || -1,
  };

  return {
    agents,
    properties,
    leads,
    inactiveAgentIds,
    settings,
    integrations,
    routing_rules,
    timeline_events,
  };
}

// --- LEADS ---
export async function getLeads(): Promise<any[]> {
  const [leadsRows, timelineRows] = await Promise.all([
    sql`SELECT * FROM crm_leads ORDER BY created_at DESC`,
    sql`SELECT * FROM crm_timeline_events ORDER BY timestamp DESC`,
  ]);
  const events = timelineRows.map(r => ({
    id: r.id, record_id: r.record_id, type: r.type, title: r.title,
    description: r.description, timestamp: r.timestamp instanceof Date ? r.timestamp.toISOString() : String(r.timestamp)
  }));
  return leadsRows.map(r => rowToLead(r, events));
}

export async function getLeadById(id: string): Promise<any | undefined> {
  const rows = await sql`SELECT * FROM crm_leads WHERE id = ${id}`;
  if (rows.length === 0) return undefined;
  const timelineRows = await sql`SELECT * FROM crm_timeline_events WHERE record_id = ${id} ORDER BY timestamp DESC`;
  const events = timelineRows.map(r => ({
    id: r.id, record_id: r.record_id, type: r.type, title: r.title,
    description: r.description, timestamp: r.timestamp instanceof Date ? r.timestamp.toISOString() : String(r.timestamp)
  }));
  return rowToLead(rows[0], events);
}

export async function createLead(leadData: any): Promise<any> {
  const newId = leadData.id || `l_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
  
  // Apply round-robin assignment if agentId not provided
  let agentId = leadData.agentId || leadData.agent_id;
  if (!agentId) {
    const rules = await getRoutingRules();
    if (rules.active_agent_ids && rules.active_agent_ids.length > 0) {
      const nextIdx = (rules.last_assigned_index + 1) % rules.active_agent_ids.length;
      agentId = rules.active_agent_ids[nextIdx];
      await sql`UPDATE crm_routing_rules SET last_assigned_index = ${nextIdx} WHERE id = 1`;
    } else {
      agentId = 'a1';
    }
  }

  const name = leadData.name || 'New Inquiry';
  const phone = leadData.phone || '+910000000000';
  const email = leadData.email || null;
  const stage = leadData.stage || 'New';
  const source = leadData.source || 'Website';
  const req = leadData.req || { locality: 'Wakad', config: '2 BHK', budgetLabel: '₹80L' };
  const notes = leadData.notes || [];
  const shortlist = leadData.shortlist || [];
  const feedback = leadData.feedback || {};

  const rows = await sql`
    INSERT INTO crm_leads (id, name, phone, email, stage, source, agent_id, req, notes, shortlist, feedback)
    VALUES (${newId}, ${name}, ${phone}, ${email}, ${stage}, ${source}, ${agentId}, ${sql.json(req)}, ${sql.json(notes)}, ${sql.json(shortlist)}, ${sql.json(feedback)})
    RETURNING *;
  `;

  await addTimelineEvent({
    record_id: newId,
    type: 'creation',
    title: 'New Lead Created',
    description: `Lead created via API (Source: ${source}). Assigned to agent ${agentId}.`,
  });

  return await getLeadById(newId);
}

export async function updateLead(id: string, patch: any): Promise<any | null> {
  const oldLead = await getLeadById(id);
  if (!oldLead) return null;

  const name = patch.name !== undefined ? patch.name : oldLead.name;
  const phone = patch.phone !== undefined ? patch.phone : oldLead.phone;
  const email = patch.email !== undefined ? patch.email : oldLead.email;
  const stage = patch.stage !== undefined ? patch.stage : oldLead.stage;
  const source = patch.source !== undefined ? patch.source : oldLead.source;
  const agentId = patch.agentId !== undefined ? patch.agentId : (patch.agent_id !== undefined ? patch.agent_id : oldLead.agentId);
  const req = patch.req !== undefined ? patch.req : oldLead.req;
  const notes = patch.notes !== undefined ? patch.notes : oldLead.notes;
  const shortlist = patch.shortlist !== undefined ? patch.shortlist : oldLead.shortlist;
  const feedback = patch.feedback !== undefined ? patch.feedback : oldLead.feedback;

  await sql`
    UPDATE crm_leads SET
      name = ${name},
      phone = ${phone},
      email = ${email || null},
      stage = ${stage},
      source = ${source},
      agent_id = ${agentId},
      req = ${sql.json(req || {})},
      notes = ${sql.json(notes || [])},
      shortlist = ${sql.json(shortlist || [])},
      feedback = ${sql.json(feedback || {})}
    WHERE id = ${id};
  `;

  if (patch.stage && patch.stage !== oldLead.stage) {
    await addTimelineEvent({
      record_id: id,
      type: 'stage_change',
      title: 'Pipeline Stage Updated',
      description: `Stage moved from "${oldLead.stage}" to "${patch.stage}".`,
    });
  }

  return await getLeadById(id);
}

export async function deleteLead(id: string): Promise<boolean> {
  const res = await sql`DELETE FROM crm_leads WHERE id = ${id}`;
  return res.count > 0;
}

export async function mergeLeads(primaryId: string, duplicateId: string): Promise<any | null> {
  const primary = await getLeadById(primaryId);
  const duplicate = await getLeadById(duplicateId);
  if (!primary || !duplicate) return null;

  const combinedNotes = [
    `[MERGED INQUIRY] Merged duplicate record ${duplicate.name} (${duplicate.phone}) into this record.`,
    ...(primary.notes || []),
    ...(duplicate.notes || []),
  ];

  await sql`UPDATE crm_leads SET notes = ${sql.json(combinedNotes)} WHERE id = ${primaryId}`;
  await sql`UPDATE crm_timeline_events SET record_id = ${primaryId} WHERE record_id = ${duplicateId}`;

  await addTimelineEvent({
    record_id: primaryId,
    type: 'merge',
    title: 'Duplicate Record Merged',
    description: `Merged inquiry from ${duplicate.name} (${duplicate.phone}, Source: ${duplicate.source}).`,
  });

  await deleteLead(duplicateId);
  return await getLeadById(primaryId);
}

// --- PROPERTIES ---
export async function getProperties(): Promise<any[]> {
  const rows = await sql`SELECT * FROM crm_properties ORDER BY created_at DESC`;
  return rows.map(rowToProperty);
}

export async function createProperty(propData: any): Promise<any> {
  const newId = propData.id || `p_${Date.now()}`;
  const title = propData.title || `${propData.type || '2 BHK'} · ${propData.locality || 'Pune'}`;
  const status = propData.status || 'Available';
  const type = propData.type || '2 BHK';
  const locality = propData.locality || 'Pune';
  const price = propData.price || '';
  const tower = propData.tower || 'A';
  const unit = propData.unit || '101';
  const config = propData.config || { beds: 2, baths: 2, area: 1000, priceLabel: price };
  const tenancy = propData.tenancy || null;
  const timeline = propData.timeline || [];

  const rows = await sql`
    INSERT INTO crm_properties (id, title, status, type, locality, price, tower, unit, config, tenancy, timeline)
    VALUES (${newId}, ${title}, ${status}, ${type}, ${locality}, ${price}, ${tower}, ${unit}, ${sql.json(config)}, ${sql.json(tenancy)}, ${sql.json(timeline)})
    RETURNING *;
  `;
  return rowToProperty(rows[0]);
}

export async function updateProperty(id: string, patch: any): Promise<any | null> {
  const old = await sql`SELECT * FROM crm_properties WHERE id = ${id}`;
  if (old.length === 0) return null;
  const oldProp = rowToProperty(old[0]);

  const title = patch.title !== undefined ? patch.title : oldProp.title;
  const status = patch.status !== undefined ? patch.status : oldProp.status;
  const type = patch.type !== undefined ? patch.type : oldProp.type;
  const locality = patch.locality !== undefined ? patch.locality : oldProp.locality;
  const price = patch.price !== undefined ? patch.price : oldProp.price;
  const tower = patch.tower !== undefined ? patch.tower : oldProp.tower;
  const unit = patch.unit !== undefined ? patch.unit : oldProp.unit;
  const config = patch.config !== undefined ? { ...oldProp, ...patch.config } : oldProp;
  const tenancy = patch.tenancy !== undefined ? patch.tenancy : oldProp.tenancy;
  const timeline = patch.timeline !== undefined ? patch.timeline : oldProp.timeline;

  const rows = await sql`
    UPDATE crm_properties SET
      title = ${title}, status = ${status}, type = ${type}, locality = ${locality},
      price = ${price}, tower = ${tower}, unit = ${unit}, config = ${sql.json(config || {})},
      tenancy = ${sql.json(tenancy || null)}, timeline = ${sql.json(timeline || [])}
    WHERE id = ${id} RETURNING *;
  `;
  return rowToProperty(rows[0]);
}

// --- TEAM & ROUTING ---
export async function getAgents(): Promise<any[]> {
  const rows = await sql`SELECT * FROM crm_agents`;
  return rows.map(rowToAgent);
}

export async function getRoutingRules(): Promise<RoutingRule> {
  const rows = await sql`SELECT * FROM crm_routing_rules WHERE id = 1`;
  if (rows.length === 0) {
    return { strategy: 'round_robin', active_agent_ids: ['a1', 'a2', 'a3', 'a4'], last_assigned_index: -1 };
  }
  return {
    strategy: rows[0].strategy as any,
    active_agent_ids: rows[0].active_agent_ids || [],
    last_assigned_index: rows[0].last_assigned_index || -1,
  };
}

export async function updateRoutingRules(patch: Partial<RoutingRule>): Promise<RoutingRule> {
  const current = await getRoutingRules();
  const next = { ...current, ...patch };
  await sql`
    INSERT INTO crm_routing_rules (id, strategy, active_agent_ids, last_assigned_index)
    VALUES (1, ${next.strategy}, ${sql.json(next.active_agent_ids)}, ${next.last_assigned_index})
    ON CONFLICT (id) DO UPDATE SET
      strategy = EXCLUDED.strategy,
      active_agent_ids = EXCLUDED.active_agent_ids,
      last_assigned_index = EXCLUDED.last_assigned_index;
  `;
  return next;
}

// --- SETTINGS & INTEGRATIONS ---
export async function getSettings(): Promise<any> {
  const rows = await sql`SELECT value FROM crm_settings WHERE key = 'default'`;
  return rows[0]?.value || DEFAULT_SETTINGS;
}

export async function updateSettings(patch: any): Promise<any> {
  const current = await getSettings();
  const next = { ...current, ...patch };
  await sql`
    INSERT INTO crm_settings (key, value) VALUES ('default', ${sql.json(next)})
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
  `;
  return next;
}

export async function getIntegrations(): Promise<Record<string, any>> {
  const rows = await sql`SELECT key, config FROM crm_integrations`;
  const result: Record<string, any> = {};
  for (const r of rows) {
    result[r.key] = r.config;
  }
  return result;
}

export async function updateIntegration(key: string, patch: any): Promise<any | null> {
  const all = await getIntegrations();
  const current = all[key] || {};
  const next = { ...current, ...patch };
  await sql`
    INSERT INTO crm_integrations (key, config) VALUES (${key}, ${sql.json(next)})
    ON CONFLICT (key) DO UPDATE SET config = EXCLUDED.config;
  `;
  return next;
}

// --- TIMELINE ---
export async function getTimelineEvents(recordId?: string): Promise<TimelineEvent[]> {
  const rows = recordId
    ? await sql`SELECT * FROM crm_timeline_events WHERE record_id = ${recordId} ORDER BY timestamp DESC`
    : await sql`SELECT * FROM crm_timeline_events ORDER BY timestamp DESC`;
  
  return rows.map(r => ({
    id: r.id,
    record_id: r.record_id,
    type: r.type,
    title: r.title,
    description: r.description,
    author: r.author || undefined,
    timestamp: r.timestamp instanceof Date ? r.timestamp.toISOString() : String(r.timestamp),
    metadata: r.metadata || {},
  }));
}

export async function addTimelineEvent(evt: Omit<TimelineEvent, 'id' | 'timestamp'> & { timestamp?: string }): Promise<TimelineEvent> {
  const id = `evt_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
  const ts = evt.timestamp || new Date().toISOString();
  await sql`
    INSERT INTO crm_timeline_events (id, record_id, type, title, description, author, timestamp, metadata)
    VALUES (${id}, ${evt.record_id}, ${evt.type}, ${evt.title}, ${evt.description}, ${evt.author || 'System'}, ${ts}, ${sql.json(evt.metadata || {})})
    ON CONFLICT (id) DO NOTHING;
  `;
  return {
    id,
    timestamp: ts,
    ...evt,
  };
}
