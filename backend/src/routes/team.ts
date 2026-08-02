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
import { getContext } from '../services/context';
import { audit } from '../services/audit';
import { adminSetPassword, suggestPassword, revokeUserSessions, passwordIssue } from '../services/auth';

export const teamRouter = Router();
teamRouter.use(requireTenantAuth);

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ── RBAC for user management ────────────────────────────────────────────────
// owner: manages everyone. manager: agents only. agent: no user management.
function canManageRole(targetRole: string): { ok: boolean; msg?: string } {
  const r = getContext()?.role;
  if (r === 'owner' || r === 'superadmin') return { ok: true };
  if (r === 'manager') return targetRole === 'agent'
    ? { ok: true }
    : { ok: false, msg: 'Managers can only manage agents.' };
  return { ok: false, msg: 'You do not have permission to manage users.' };
}

/** A firm must always keep one active owner — block the action that would remove
 *  the last one (suspend / delete / role-change away from owner). */
async function isLastActiveOwner(tenantId: string, userId: string): Promise<boolean> {
  const owners = await sql`
    SELECT id FROM users WHERE tenant_id = ${tenantId} AND role = 'owner'
      AND deleted_at IS NULL AND status ILIKE 'active'
  `;
  return owners.length <= 1 && owners.some((o: any) => o.id === userId);
}

/** Slug an agent's login_id from their name, unique within the tenant. */
async function deriveLoginId(tenantId: string, name: string): Promise<string> {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 16) || 'agent';
  let candidate = base;
  for (let n = 2; (await sql`SELECT 1 FROM users WHERE tenant_id = ${tenantId} AND login_id = ${candidate} LIMIT 1`).length; n++) {
    candidate = `${base}${n}`;
  }
  return candidate;
}

/** Drop a user from the round-robin's active pool (on suspend/delete). */
async function removeFromRouting(tenantId: string, userId: string): Promise<void> {
  const rows = await sql`SELECT active_agent_ids FROM crm_routing_rules WHERE tenant_id = ${tenantId} LIMIT 1`;
  const ids: string[] = rows[0]?.active_agent_ids || [];
  if (!ids.includes(userId)) return;
  await sql`UPDATE crm_routing_rules SET active_agent_ids = ${sql.json(ids.filter(x => x !== userId))} WHERE tenant_id = ${tenantId}`;
}

/**
 * Add a user to the round-robin's active pool — the counterpart removeFromRouting
 * never had. Without this, a person exists to be assigned leads but the pool
 * that decides who's next has never heard of them: every new hire had to be
 * added by hand in Settings before they'd see a single lead, and a tenant that
 * never opened that screen silently routed everything to whoever WAS in the
 * pool (or, if the pool was empty outright, to a single hardcoded fallback —
 * see the fix in createLead). Called on create, on reassign-seat, and on
 * reactivate, so "added to the team" and "in rotation" can't drift apart.
 */
async function addToRouting(tenantId: string, userId: string): Promise<void> {
  const rows = await sql`SELECT active_agent_ids FROM crm_routing_rules WHERE tenant_id = ${tenantId} LIMIT 1`;
  const ids: string[] = rows[0]?.active_agent_ids || [];
  if (ids.includes(userId)) return;
  await sql`
    INSERT INTO crm_routing_rules (strategy, active_agent_ids, last_assigned_index, tenant_id)
    VALUES ('round_robin', ${sql.json([...ids, userId])}, -1, ${tenantId})
    ON CONFLICT (tenant_id) DO UPDATE SET active_agent_ids = ${sql.json([...ids, userId])};
  `;
}

async function loadUser(tenantId: string, id: string): Promise<any | null> {
  const rows = await sql`SELECT * FROM users WHERE id = ${id} AND tenant_id = ${tenantId} AND deleted_at IS NULL LIMIT 1`;
  return rows[0] || null;
}

/** Email must be unique within a tenant — login resolves an account by email, so
 *  two users sharing one would make sign-in ambiguous (one could never log in). */
async function emailTaken(tenantId: string, email: string, exceptId?: string): Promise<boolean> {
  const rows = await sql`
    SELECT id FROM users
    WHERE tenant_id = ${tenantId} AND lower(email) = ${email.toLowerCase()} AND deleted_at IS NULL
      AND id <> ${exceptId || ''}
    LIMIT 1`;
  return rows.length > 0;
}

// ── User management (auth v2) ───────────────────────────────────────────────

/** Roster of live users with role, status, and last-active (from sessions). */
teamRouter.get('/users', async (req: Request, res: Response) => {
  try {
    const users = await sql`
      SELECT u.id, u.name, u.login_id, u.email, u.phone, u.role, u.status, u.must_change_password, u.metadata,
        (SELECT max(last_seen_at) FROM sessions s WHERE s.user_id = u.id AND s.revoked = FALSE) AS last_active
      FROM users u
      WHERE u.tenant_id = ${req.tenantId} AND u.deleted_at IS NULL
      ORDER BY CASE u.role WHEN 'owner' THEN 0 WHEN 'manager' THEN 1 ELSE 2 END, u.name
    `;
    return res.status(200).json({ success: true, users });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to load users', message: err.message });
  }
});

/** Create a user. Agents log in by login_id, owner/manager by email. Admin sets
 *  an initial password (suggested if none given); returned once to hand over. */
teamRouter.post('/users', async (req: Request, res: Response) => {
  try {
    const { name, role, loginId, email, phone, password } = req.body || {};
    const teamRole = ['owner', 'manager', 'agent'].includes(role) ? role : 'agent';
    const perm = canManageRole(teamRole);
    if (!perm.ok) return res.status(403).json({ error: perm.msg });

    const cleanName = String(name || '').trim();
    if (!cleanName) return res.status(400).json({ error: 'Name is required' });

    const cleanPhone = phone ? String(phone).replace(/\D/g, '') : '';
    const normPhone = cleanPhone ? `+91${cleanPhone.slice(-10)}` : null;
    const normEmail = email ? String(email).trim().toLowerCase() : null;

    let loginIdVal: string | null = String(loginId || '').trim() || await deriveLoginId(req.tenantId!, cleanName);
    if (loginIdVal && loginIdVal.includes('@')) return res.status(400).json({ error: 'A login ID cannot contain "@".' });
    if ((teamRole === 'owner' || teamRole === 'manager') && normEmail && !EMAIL_RE.test(normEmail)) {
      return res.status(400).json({ error: 'An owner or manager needs a valid email.' });
    }
    if (normEmail && await emailTaken(req.tenantId!, normEmail)) {
      return res.status(409).json({ error: 'Someone on this team already uses that email.' });
    }

    const initial = String(password || '').trim() || suggestPassword();
    const issue = passwordIssue(initial);
    if (issue) return res.status(400).json({ error: issue });

    const id = `u_${Date.now().toString(36)}`;
    const initials = cleanName.split(' ').slice(0, 2).map((w: string) => w[0]).join('').toUpperCase();
    const meta = { initials, avatar: '', phone: normPhone, email: normEmail };
    // Admin-vouched email is treated as verified so owner/manager self-reset works.
    const emailVerified = !!normEmail;

    await sql`
      INSERT INTO users (id, tenant_id, name, login_id, phone, email, role, status, email_verified, metadata)
      VALUES (${id}, ${req.tenantId}, ${cleanName}, ${loginIdVal}, ${normPhone}, ${normEmail}, ${teamRole}, 'active', ${emailVerified}, ${sql.json(meta)})
    `;
    await sql`
      INSERT INTO crm_agents (id, name, first, initials, avatar, role, duty_status, metadata, tenant_id)
      VALUES (${id}, ${cleanName}, ${cleanName.split(' ')[0]}, ${initials}, '', ${teamRole}, 'ACTIVE', ${sql.json(meta)}, ${req.tenantId})
    `;
    const mustChange = req.body?.mustChangePassword !== false;
    await adminSetPassword(req.tenantId!, id, initial, mustChange);
    await addToRouting(req.tenantId!, id);

    audit({
      tenant_id: req.tenantId!, actor_type: 'user', actor_id: getContext()?.userId ?? null,
      actor_label: getContext()?.userId ?? 'admin', action: 'user.created',
      target_type: 'user', target_id: id, summary: `Created ${teamRole} ${cleanName}`, metadata: { role: teamRole },
    });
    return res.status(201).json({ success: true, userId: id, loginId: loginIdVal, initialPassword: initial, agents: await getAgents() });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to create user', message: err.message });
  }
});

/** Edit a user's details / role. */
teamRouter.patch('/users/:id', async (req: Request, res: Response) => {
  try {
    const u = await loadUser(req.tenantId!, req.params.id);
    if (!u) return res.status(404).json({ error: 'User not found' });
    let perm = canManageRole(u.role);
    if (!perm.ok) return res.status(403).json({ error: perm.msg });

    const { name, phone, email, role } = req.body || {};
    const newRole = role && ['owner', 'manager', 'agent'].includes(role) ? role : u.role;
    if (newRole !== u.role) {
      perm = canManageRole(newRole);
      if (!perm.ok) return res.status(403).json({ error: perm.msg });
      if (u.role === 'owner' && await isLastActiveOwner(req.tenantId!, u.id)) {
        return res.status(400).json({ error: 'This is the last active owner — assign another owner first.' });
      }
    }
    const cleanName = name != null ? String(name).trim() : u.name;
    const normPhone = phone != null ? (String(phone).replace(/\D/g, '') ? `+91${String(phone).replace(/\D/g, '').slice(-10)}` : null) : u.phone;
    const normEmail = email != null ? (String(email).trim().toLowerCase() || null) : u.email;
    if (newRole !== 'agent' && (!normEmail || !EMAIL_RE.test(normEmail))) {
      return res.status(400).json({ error: 'An owner or manager needs a valid email.' });
    }
    if (normEmail && await emailTaken(req.tenantId!, normEmail, u.id)) {
      return res.status(409).json({ error: 'Someone on this team already uses that email.' });
    }
    const meta = { ...(u.metadata || {}), phone: normPhone, email: normEmail };
    await sql`
      UPDATE users SET name = ${cleanName}, phone = ${normPhone}, email = ${normEmail}, role = ${newRole},
        email_verified = ${!!normEmail}, metadata = ${sql.json(meta)}
      WHERE id = ${u.id} AND tenant_id = ${req.tenantId}
    `;
    await sql`UPDATE crm_agents SET name = ${cleanName}, role = ${newRole}, metadata = ${sql.json(meta)} WHERE id = ${u.id} AND tenant_id = ${req.tenantId}`;
    audit({
      tenant_id: req.tenantId!, actor_type: 'user', actor_id: getContext()?.userId ?? null,
      actor_label: getContext()?.userId ?? 'admin', action: 'user.updated',
      target_type: 'user', target_id: u.id, summary: `Updated ${cleanName}`, metadata: { role: newRole },
    });
    return res.status(200).json({ success: true, agents: await getAgents() });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to update user', message: err.message });
  }
});

/** Suspend (reversible) / reactivate. Suspend revokes sessions + pauses routing. */
teamRouter.post('/users/:id/status', async (req: Request, res: Response) => {
  try {
    const u = await loadUser(req.tenantId!, req.params.id);
    if (!u) return res.status(404).json({ error: 'User not found' });
    const perm = canManageRole(u.role);
    if (!perm.ok) return res.status(403).json({ error: perm.msg });

    const status = req.body?.status === 'suspended' ? 'suspended' : 'active';
    if (status === 'suspended' && u.role === 'owner' && await isLastActiveOwner(req.tenantId!, u.id)) {
      return res.status(400).json({ error: 'Cannot suspend the last active owner.' });
    }
    await sql`UPDATE users SET status = ${status} WHERE id = ${u.id} AND tenant_id = ${req.tenantId}`;
    if (status === 'suspended') {
      await revokeUserSessions(u.id);
      await removeFromRouting(req.tenantId!, u.id);
    } else {
      await addToRouting(req.tenantId!, u.id);
    }
    audit({
      tenant_id: req.tenantId!, actor_type: 'user', actor_id: getContext()?.userId ?? null,
      actor_label: getContext()?.userId ?? 'admin', action: 'user.status_changed',
      target_type: 'user', target_id: u.id, summary: `${u.name} → ${status}`, metadata: { status },
    });
    return res.status(200).json({ success: true, agents: await getAgents() });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to change status', message: err.message });
  }
});

/** Reassign the seat to a new person: keep login_id + all leads, swap identity,
 *  force a password change, kick old sessions. (A1a) */
teamRouter.post('/users/:id/reassign-seat', async (req: Request, res: Response) => {
  try {
    const u = await loadUser(req.tenantId!, req.params.id);
    if (!u) return res.status(404).json({ error: 'User not found' });
    const perm = canManageRole(u.role);
    if (!perm.ok) return res.status(403).json({ error: perm.msg });

    const { name, phone, email, password } = req.body || {};
    const cleanName = String(name || '').trim();
    if (!cleanName) return res.status(400).json({ error: 'New person name is required' });
    const cleanPhone = phone ? String(phone).replace(/\D/g, '') : '';
    const normPhone = cleanPhone ? `+91${cleanPhone.slice(-10)}` : null;
    const normEmail = email ? String(email).trim().toLowerCase() : null;
    if (u.role !== 'agent' && (!normEmail || !EMAIL_RE.test(normEmail))) {
      return res.status(400).json({ error: 'An owner/manager seat needs a valid email.' });
    }
    if (normEmail && await emailTaken(req.tenantId!, normEmail, u.id)) {
      return res.status(409).json({ error: 'Someone on this team already uses that email.' });
    }
    const initials = cleanName.split(' ').slice(0, 2).map((w: string) => w[0]).join('').toUpperCase();
    const meta = { initials, avatar: '', phone: normPhone, email: normEmail };
    const initial = String(password || '').trim() || suggestPassword();
    const issue = passwordIssue(initial);
    if (issue) return res.status(400).json({ error: issue });

    await sql`
      UPDATE users SET name = ${cleanName}, phone = ${normPhone}, email = ${normEmail},
        email_verified = ${!!normEmail}, status = 'active', metadata = ${sql.json(meta)}
      WHERE id = ${u.id} AND tenant_id = ${req.tenantId}
    `;
    await sql`UPDATE crm_agents SET name = ${cleanName}, first = ${cleanName.split(' ')[0]}, initials = ${initials}, metadata = ${sql.json(meta)} WHERE id = ${u.id} AND tenant_id = ${req.tenantId}`;
    const mustChangeSeat = req.body?.mustChangePassword !== false;
    await adminSetPassword(req.tenantId!, u.id, initial, mustChangeSeat);   // revokes sessions
    // The status update above always sets 'active' — a seat handed to someone
    // new is a working seat again, even if the previous holder was suspended
    // (and so removed from routing) at the time.
    await addToRouting(req.tenantId!, u.id);
    audit({
      tenant_id: req.tenantId!, actor_type: 'user', actor_id: getContext()?.userId ?? null,
      actor_label: getContext()?.userId ?? 'admin', action: 'user.seat_reassigned',
      target_type: 'user', target_id: u.id, summary: `Seat ${u.login_id || u.id} reassigned to ${cleanName}`, metadata: {},
    });
    return res.status(200).json({ success: true, loginId: u.login_id, initialPassword: initial, agents: await getAgents() });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to reassign seat', message: err.message });
  }
});

/** Admin resets a user's password → returns the new one once to hand over. */
teamRouter.post('/users/:id/reset-password', async (req: Request, res: Response) => {
  try {
    const u = await loadUser(req.tenantId!, req.params.id);
    if (!u) return res.status(404).json({ error: 'User not found' });
    const perm = canManageRole(u.role);
    if (!perm.ok) return res.status(403).json({ error: perm.msg });
    const newPw = String(req.body?.password || '').trim() || suggestPassword();
    const issue = passwordIssue(newPw);
    if (issue) return res.status(400).json({ error: issue });
    const mustChange = req.body?.mustChangePassword !== false;
    await adminSetPassword(req.tenantId!, u.id, newPw, mustChange);
    audit({
      tenant_id: req.tenantId!, actor_type: 'user', actor_id: getContext()?.userId ?? null,
      actor_label: getContext()?.userId ?? 'admin', action: 'user.password_reset_by_admin',
      target_type: 'user', target_id: u.id, summary: `Reset password for ${u.name}`, metadata: {},
    });
    return res.status(200).json({ success: true, initialPassword: newPw });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to reset password', message: err.message });
  }
});

/** Force-logout: revoke all of a user's sessions. */
teamRouter.post('/users/:id/force-logout', async (req: Request, res: Response) => {
  try {
    const u = await loadUser(req.tenantId!, req.params.id);
    if (!u) return res.status(404).json({ error: 'User not found' });
    const perm = canManageRole(u.role);
    if (!perm.ok) return res.status(403).json({ error: perm.msg });
    await revokeUserSessions(u.id);
    audit({
      tenant_id: req.tenantId!, actor_type: 'user', actor_id: getContext()?.userId ?? null,
      actor_label: getContext()?.userId ?? 'admin', action: 'user.force_logout',
      target_type: 'user', target_id: u.id, summary: `Forced logout of ${u.name}`, metadata: {},
    });
    return res.status(200).json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to force logout', message: err.message });
  }
});

/** Soft delete — record-safe. Requires their OPEN leads reassigned first; keeps
 *  the row (deleted_at) so historical attribution survives. Owner-only. */
teamRouter.delete('/users/:id', async (req: Request, res: Response) => {
  try {
    const u = await loadUser(req.tenantId!, req.params.id);
    if (!u) return res.status(404).json({ error: 'User not found' });
    if (getContext()?.role !== 'owner' && getContext()?.role !== 'superadmin') {
      return res.status(403).json({ error: 'Only an owner can delete a user.' });
    }
    if (u.role === 'owner' && await isLastActiveOwner(req.tenantId!, u.id)) {
      return res.status(400).json({ error: 'Cannot delete the last active owner.' });
    }
    const openLeads = await sql`
      SELECT COUNT(*)::int AS n FROM crm_leads
      WHERE tenant_id = ${req.tenantId} AND agent_id = ${u.id}
        AND COALESCE(stage, '') NOT IN ('Deal Closed', 'Rejected')
    `;
    if (openLeads[0].n > 0) {
      return res.status(400).json({ error: `Reassign this user's ${openLeads[0].n} open lead(s) before deleting.`, openLeads: openLeads[0].n });
    }
    await sql`UPDATE users SET deleted_at = NOW(), status = 'suspended' WHERE id = ${u.id} AND tenant_id = ${req.tenantId}`;
    await revokeUserSessions(u.id);
    await removeFromRouting(req.tenantId!, u.id);
    audit({
      tenant_id: req.tenantId!, actor_type: 'user', actor_id: getContext()?.userId ?? null,
      actor_label: getContext()?.userId ?? 'admin', action: 'user.deleted',
      target_type: 'user', target_id: u.id, summary: `Deleted ${u.name}`, metadata: {},
    });
    return res.status(200).json({ success: true, agents: await getAgents() });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to delete user', message: err.message });
  }
});

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
    const { name, phone, email, role } = req.body;
    const cleanName = (name || '').trim();
    if (!cleanName) return res.status(400).json({ error: 'Name is required' });
    // A teammate signs in by OTP, and OTP is delivered ONLY by email today (there
    // is no SMS channel). So email is required — without it the person could be
    // created but never actually log in. Phone stays optional (used for tel:/wa).
    const cleanPhone = phone ? String(phone).replace(/\D/g, '') : '';
    const normPhone = cleanPhone ? `+91${cleanPhone.slice(-10)}` : null;
    const normEmail = email ? String(email).trim().toLowerCase() : null;
    if (!normEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normEmail)) {
      return res.status(400).json({ error: 'A valid email is required — sign-in codes are sent by email.' });
    }
    const teamRole = role === 'manager' ? 'manager' : 'agent';
    const id = `u_${Date.now().toString(36)}`;
    const initials = cleanName.split(' ').slice(0, 2).map((w: string) => w[0]).join('').toUpperCase();
    const meta = { initials, avatar: '', phone: normPhone, email: normEmail };

    // Roster row (drives team/lead-assignment reads) + a real users row so the
    // person can actually sign in by OTP. Both share the same id + tenant.
    await sql`
      INSERT INTO crm_agents (id, name, first, initials, avatar, role, duty_status, metadata, tenant_id)
      VALUES (${id}, ${cleanName}, ${cleanName.split(' ')[0]}, ${initials}, '', ${teamRole}, 'ACTIVE', ${sql.json(meta)}, ${req.tenantId})
    `;
    await sql`
      INSERT INTO users (id, tenant_id, name, phone, email, role, status, metadata)
      VALUES (${id}, ${req.tenantId}, ${cleanName}, ${normPhone}, ${normEmail}, ${teamRole}, 'ACTIVE', ${sql.json(meta)})
      ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, phone = EXCLUDED.phone, email = EXCLUDED.email, role = EXCLUDED.role
    `;
    const agents = await getAgents();
    return res.status(201).json({ success: true, agents, newAgentId: id });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to add agent', message: err.message });
  }
});

/**
 * PATCH /api/v1/team/users/:id/role  { role: 'agent' | 'manager' }
 * Change a teammate's access tier (kept in step across roster + users).
 */
teamRouter.patch('/users/:id/role', async (req: Request, res: Response) => {
  try {
    const role = req.body?.role === 'manager' ? 'manager' : 'agent';
    const id = req.params.id;
    await sql`UPDATE crm_agents SET role = ${role} WHERE id = ${id} AND tenant_id = ${req.tenantId}`;
    await sql`UPDATE users SET role = ${role} WHERE id = ${id} AND tenant_id = ${req.tenantId}`;
    return res.status(200).json({ success: true, agents: await getAgents() });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to change role', message: err.message });
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

    await sql`UPDATE crm_agents SET duty_status = ${status} WHERE id = ${userId} AND tenant_id = ${req.tenantId}`;
    if (status === 'OFF_DUTY' || status === 'ON_LEAVE') {
      await removeFromRouting(req.tenantId, userId);
    } else if (status === 'ACTIVE') {
      await addToRouting(req.tenantId, userId);
    }
    console.log(`[Team Router - Duty Status] Updated Agent ${userId} -> ${status} in PostgreSQL & synced routing pool`);

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

    const resSql = await sql`UPDATE crm_leads SET agent_id = ${to_user_id} WHERE agent_id = ${fromUserId} AND tenant_id = ${req.tenantId} RETURNING id`;
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
