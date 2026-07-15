/**
 * ============================================================================
 * 🛡️ CODED DOMAIN ROUTER: TEAM MEMBERS, BRANCH ROSTERS & PERFORMANCE
 * ============================================================================
 * Handles duty roster gating, sales velocity performance aggregation, and bulk
 * lead reassignments backed by server store.
 * ============================================================================
 */

import { Router, Request, Response } from 'express';
import { requireTenantAuth } from '../middleware/auth';
import { getAgents, getRoutingRules, updateRoutingRules, getAgentPerformance } from '../services/store';
import { sql } from '../services/db';

export const teamRouter = Router();
teamRouter.use(requireTenantAuth);

/**
 * GET /api/v1/team/roster
 * Retrieve sales agent team members
 */
teamRouter.get('/roster', async (req: Request, res: Response) => {
  return res.status(200).json({
    success: true,
    agents: await getAgents(),
  });
});

/**
 * POST /api/v1/team/roster
 * Add a new sales agent team member
 */
teamRouter.post('/roster', async (req: Request, res: Response) => {
  try {
    const { name, role } = req.body;
    const id = `a_${Date.now().toString(36)}`;
    const initials = (name || 'New Agent').split(' ').slice(0, 2).map((w: string) => w[0]).join('').toUpperCase();
    const meta = { initials, avatar: '' };
    await sql`
      INSERT INTO crm_agents (id, name, first, initials, avatar, role, duty_status, metadata)
      VALUES (${id}, ${name || 'New Agent'}, ${name ? name.split(' ')[0] : 'New'}, ${initials}, '', ${role || 'agent'}, 'ACTIVE', ${sql.json(meta)})
    `;
    const agents = await getAgents();
    return res.status(201).json({ success: true, agents, newAgentId: id });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to add agent', message: err.message });
  }
});

/**
 * GET /api/v1/team/routing
 * Retrieve round-robin lead routing rules
 */
teamRouter.get('/routing', async (req: Request, res: Response) => {
  return res.status(200).json({
    success: true,
    rules: await getRoutingRules(),
  });
});

/**
 * PUT /api/v1/team/routing
 * Update round-robin lead routing rules
 */
teamRouter.put('/routing', async (req: Request, res: Response) => {
  const patch = req.body;
  const updated = await updateRoutingRules(patch);
  return res.status(200).json({
    success: true,
    rules: updated,
  });
});

/**
 * 1. TOGGLE AGENT DUTY STATUS ACTION
 * PATCH /api/v1/team/users/:id/duty-status
 */
teamRouter.patch('/users/:id/duty-status', async (req: Request, res: Response) => {
  try {
    const userId = req.params.id;
    const { status } = req.body; // 'ACTIVE' vs 'OFF_DUTY' vs 'ON_LEAVE'

    await sql`UPDATE crm_agents SET duty_status = ${status} WHERE id = ${userId}`;
    console.log(`[Team Router - Duty Status] Updated Agent ${userId} -> ${status} in PostgreSQL`);

    return res.status(200).json({
      success: true,
      message: `Agent status updated to ${status}. Round-robin duty roster updated automatically.`,
      user_id: userId,
      status,
    });
  } catch (err: any) {
    return res.status(500).json({ error: 'Duty Status Update Failed', message: err.message });
  }
});

/**
 * 2. GET AGENT SALES VELOCITY PERFORMANCE METRICS
 * GET /api/v1/team/users/:id/performance
 */
teamRouter.get('/users/:id/performance', async (req: Request, res: Response) => {
  try {
    const userId = req.params.id;
    const metrics = await getAgentPerformance(userId);

    return res.status(200).json({
      success: true,
      metrics,
    });
  } catch (err: any) {
    return res.status(500).json({ error: 'Performance Calculation Failed', message: err.message });
  }
});

/**
 * 3. BULK REASSIGN OPEN LEADS ACTION
 * POST /api/v1/team/users/:id/reassign-leads
 */
teamRouter.post('/users/:id/reassign-leads', async (req: Request, res: Response) => {
  try {
    const fromUserId = req.params.id;
    const { to_user_id } = req.body;

    const resSql = await sql`UPDATE crm_leads SET assigned_agent_id = ${to_user_id} WHERE assigned_agent_id = ${fromUserId} RETURNING id`;
    const count = resSql.length;

    return res.status(200).json({
      success: true,
      message: 'Successfully reassigned open leads to new sales agent.',
      from_user_id: fromUserId,
      to_user_id,
      reassigned_count: count,
    });
  } catch (err: any) {
    return res.status(500).json({ error: 'Bulk Reassignment Failed', message: err.message });
  }
});
