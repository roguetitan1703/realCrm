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
import { getAgents, getRoutingRules, updateRoutingRules, getAgentPerformance, distributeWork, heldWork, unownedBacklog, assignUnowned, agentLoads } from '../services/store';
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
  if (r === 'owner') return { ok: true };
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

    const { name, phone, email, role, loginId } = req.body || {};
    const newRole = role && ['owner', 'manager', 'agent'].includes(role) ? role : u.role;
    if (newRole !== u.role) {
      perm = canManageRole(newRole);
      if (!perm.ok) return res.status(403).json({ error: perm.msg });
      if (u.role === 'owner' && await isLastActiveOwner(req.tenantId!, u.id)) {
        return res.status(400).json({ error: 'This is the last active owner. Make someone else an owner first.' });
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
    // THE LOGIN ID IS EDITABLE, and it is only a login.
    //
    // It was derived from the name when the account was made and then fixed
    // forever, so when a seat changed hands the new person signed in as the
    // person before them — bhumi's `binod` belongs to someone called Siddhi.
    // Nothing else moves when it changes: every record points at the internal
    // user id, which does not change, so history stays with whoever did the
    // work. Their live sessions are dropped, because the handle they signed in
    // with no longer exists.
    let nextLogin = u.login_id;
    if (loginId !== undefined && u.login_id) {
      const wanted = String(loginId || '').trim().toLowerCase().replace(/[^a-z0-9._-]/g, '');
      if (!wanted) return res.status(400).json({ error: 'A user ID cannot be empty.' });
      if (wanted.length < 3) return res.status(400).json({ error: 'A user ID needs at least 3 characters.' });
      if (wanted !== u.login_id) {
        const taken = await sql`SELECT 1 FROM users WHERE tenant_id = ${req.tenantId} AND login_id = ${wanted} AND id <> ${u.id} LIMIT 1`;
        if (taken.length) return res.status(409).json({ error: 'Someone on this team already signs in with that ID.' });
        nextLogin = wanted;
      }
    }
    const meta = { ...(u.metadata || {}), phone: normPhone, email: normEmail };
    await sql`
      UPDATE users SET name = ${cleanName}, phone = ${normPhone}, email = ${normEmail}, role = ${newRole},
        login_id = ${nextLogin}, email_verified = ${!!normEmail}, metadata = ${sql.json(meta)}
      WHERE id = ${u.id} AND tenant_id = ${req.tenantId}
    `;
    if (nextLogin !== u.login_id) {
      await revokeUserSessions(u.id);
      audit({
        tenant_id: req.tenantId!, actor_type: 'user', actor_id: getContext()?.userId ?? null,
        actor_label: null, action: 'user.login_id_changed', target_type: 'user', target_id: u.id,
        summary: `User ID ${u.login_id} → ${nextLogin}`, metadata: { from: u.login_id, to: nextLogin },
      });
    }
    await sql`UPDATE crm_agents SET name = ${cleanName}, role = ${newRole}, metadata = ${sql.json(meta)} WHERE id = ${u.id} AND tenant_id = ${req.tenantId}`;
    audit({
      tenant_id: req.tenantId!, actor_type: 'user', actor_id: getContext()?.userId ?? null,
      actor_label: null, action: 'user.updated',
      target_type: 'user', target_id: u.id, summary: `Updated ${cleanName}`, metadata: { role: newRole },
    });
    return res.status(200).json({ success: true, loginId: nextLogin, agents: await getAgents() });
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

/**
 * ============================================================================
 * REASSIGN SEAT — this desk now belongs to somebody else
 * ============================================================================
 * ONE ACCOUNT, EDITED. The seat keeps its row: the new person's name, contact
 * details and — new — their own USER ID go onto it, the leads and calling
 * records stay exactly where they are, the password is replaced and the old
 * sessions are killed. No account is deleted, none is created, and nothing has
 * to be handed over afterwards, because nothing moved.
 *
 * WHAT USED TO BREAK, and what now stops it. An event stores WHO as a user id
 * and the screen resolves that against today's roster — so the moment the row
 * became a new person, every call and remark the previous holder had logged
 * read as the new person's work. Before the details are overwritten, the
 * leaver's name is STAMPED onto their own events (crm_timeline_events
 * .author_name). Their history keeps their name; the seat carries on.
 *
 * The user ID is theirs to choose here: the old one was slugged from the
 * previous person's name and could not be changed, so bhumi signs a woman
 * called Siddhi in as "binod".
 * ============================================================================
 */
teamRouter.post('/users/:id/reassign-seat', async (req: Request, res: Response) => {
  try {
    const u = await loadUser(req.tenantId!, req.params.id);
    if (!u) return res.status(404).json({ error: 'User not found' });
    const perm = canManageRole(u.role);
    if (!perm.ok) return res.status(403).json({ error: perm.msg });

    const { name, phone, email, password, loginId } = req.body || {};
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

    // The new person's user ID. Defaults to one made from their name, because
    // leaving the previous holder's is the complaint this fixes.
    let nextLogin = u.login_id;
    if (u.login_id) {
      const wanted = String(loginId || '').trim().toLowerCase().replace(/[^a-z0-9._-]/g, '');
      if (wanted && wanted.length < 3) return res.status(400).json({ error: 'A user ID needs at least 3 characters.' });
      if (wanted && wanted !== u.login_id) {
        const taken = await sql`SELECT 1 FROM users WHERE tenant_id = ${req.tenantId} AND login_id = ${wanted} AND id <> ${u.id} LIMIT 1`;
        if (taken.length) return res.status(409).json({ error: 'Someone on this team already signs in with that ID.' });
      }
      nextLogin = wanted || await deriveLoginId(req.tenantId!, cleanName);
    }

    const initial = String(password || '').trim() || suggestPassword();
    const issue = passwordIssue(initial);
    if (issue) return res.status(400).json({ error: issue });

    // FIRST, while the row still says who they were: keep the leaver's name on
    // the work they did. Only their own events, only where nothing is stamped
    // yet, so re-running this never rewrites somebody else's history.
    const stamped = await sql`
      UPDATE crm_timeline_events SET author_name = ${u.name}
       WHERE tenant_id = ${req.tenantId} AND author = ${u.id} AND author_name IS NULL
       RETURNING id`;

    const initials = cleanName.split(' ').slice(0, 2).map((w: string) => w[0]).join('').toUpperCase();
    const meta = { initials, avatar: '', phone: normPhone, email: normEmail };
    await sql`
      UPDATE users SET name = ${cleanName}, phone = ${normPhone}, email = ${normEmail},
        login_id = ${nextLogin}, email_verified = ${!!normEmail}, status = 'active', metadata = ${sql.json(meta)}
      WHERE id = ${u.id} AND tenant_id = ${req.tenantId}
    `;
    await sql`UPDATE crm_agents SET name = ${cleanName}, first = ${cleanName.split(' ')[0]}, initials = ${initials}, metadata = ${sql.json(meta)} WHERE id = ${u.id} AND tenant_id = ${req.tenantId}`;
    const mustChangeSeat = req.body?.mustChangePassword !== false;
    await adminSetPassword(req.tenantId!, u.id, initial, mustChangeSeat);   // revokes sessions
    // A seat handed to someone new is a working seat again, even if the
    // previous holder was suspended (and so out of the rotation) at the time.
    await addToRouting(req.tenantId!, u.id);

    const held = await heldWork(u.id);
    audit({
      tenant_id: req.tenantId!, actor_type: 'user', actor_id: getContext()?.userId ?? null,
      actor_label: null, action: 'user.seat_reassigned',
      target_type: 'user', target_id: u.id,
      summary: `Seat ${u.login_id || u.id} reassigned from ${u.name} to ${cleanName}${nextLogin !== u.login_id ? ` (now ${nextLogin})` : ''}`,
      metadata: { previousName: u.name, previousLoginId: u.login_id, loginId: nextLogin, stampedEvents: stamped.length, held },
    });
    return res.status(200).json({
      success: true, loginId: nextLogin, initialPassword: initial,
      // What they inherit, stated — it stays on the seat, so the person taking
      // it over should know what is waiting.
      keptLeads: held.leads, keptOwners: held.owners, agents: await getAgents(),
    });
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
    if (getContext()?.role !== 'owner') {
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
      return res.status(400).json({ error: 'A valid email is needed. Sign-in codes are sent by email.' });
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
 * HOW MUCH EACH PERSON IS CARRYING, on the side you are looking at.
 * GET /api/v1/team/loads?side=leads|owners → { [userId]: openCount }
 */
teamRouter.get('/loads', async (req: Request, res: Response) => {
  try {
    const side = req.query.side === 'owners' ? 'owners' : 'leads';
    return res.status(200).json({ success: true, side, loads: await agentLoads(side) });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to read workloads', message: err.message });
  }
});

/**
 * WHAT IS STILL SITTING WITH NOBODY ON IT
 * GET /api/v1/team/routing/backlog → { leads, owners }
 * Round-robin looks forward — it decides who gets a record as it ARRIVES — so
 * switching it on leaves everything imported before it untouched. The screen
 * says so, and offers the one press below.
 */
teamRouter.get('/routing/backlog', async (_req: Request, res: Response) => {
  try {
    return res.status(200).json({ success: true, ...(await unownedBacklog()) });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to count unowned records', message: err.message });
  }
});

/** POST /api/v1/team/routing/assign-unowned { side: 'leads' | 'owners' } */
teamRouter.post('/routing/assign-unowned', async (req: Request, res: Response) => {
  try {
    const perm = canManageRole('agent');
    if (!perm.ok) return res.status(403).json({ error: perm.msg });
    const side = req.body?.side === 'owners' ? 'owners' : 'leads';
    const out = await assignUnowned(side, {
      actorType: 'user', actorId: req.user?.id ?? null, actorLabel: null,
      ip: req.ip, userAgent: req.get('user-agent') ?? undefined,
    } as any);
    return res.status(200).json({ success: true, ...out });
  } catch (err: any) {
    const code = err?.name === 'ForbiddenError' ? 403 : 500;
    return res.status(code).json({ error: 'Could not hand them out', message: err.message });
  }
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
 * WHAT ONE PERSON IS STILL HOLDING
 * GET /api/v1/team/users/:id/workload
 * Asked before suspending or handing a seat over, so the screen can say "63
 * open leads and 12 calling records" instead of moving work nobody counted.
 */
teamRouter.get('/users/:id/workload', async (req: Request, res: Response) => {
  try {
    const perm = canManageRole('agent');
    if (!perm.ok) return res.status(403).json({ error: perm.msg });
    return res.status(200).json({ success: true, ...(await heldWork(req.params.id)) });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to read their workload', message: err.message });
  }
});

/**
 * HAND ONE PERSON'S OPEN WORK TO SEVERAL PEOPLE
 * POST /api/v1/team/users/:id/distribute  { targets: string[], kinds?: ['leads','owners'] }
 *
 * Replaces POST /users/:id/reassign-leads, which had no permission check, moved
 * closed leads too, wrote no history and took a single target. See
 * distributeWork() for the rules; the numbers come back from the server so the
 * screen states what happened rather than what it hoped.
 */
teamRouter.post('/users/:id/distribute', async (req: Request, res: Response) => {
  try {
    const perm = canManageRole('agent');
    if (!perm.ok) return res.status(403).json({ error: perm.msg });
    const targets: string[] = Array.isArray(req.body?.targets) ? req.body.targets.map(String) : [];
    if (!targets.length) return res.status(400).json({ error: 'Pick at least one person to hand the work to.' });
    if (targets.includes(req.params.id)) return res.status(400).json({ error: 'That is the person the work is coming from.' });
    const kinds = Array.isArray(req.body?.kinds)
      ? req.body.kinds.filter((k: string) => k === 'leads' || k === 'owners')
      : undefined;
    if (kinds && !kinds.length) return res.status(400).json({ error: 'Choose leads, the calling list, or both.' });
    const out = await distributeWork({ fromUserId: req.params.id, targets, kinds }, {
      actorType: 'user', actorId: req.user?.id ?? null, actorLabel: null,
      ip: req.ip, userAgent: req.get('user-agent') ?? undefined,
    } as any);
    return res.status(200).json({ success: true, ...out, agents: await getAgents() });
  } catch (err: any) {
    const code = err?.name === 'ForbiddenError' ? 403 : 500;
    return res.status(code).json({ error: 'Failed to hand the work over', message: err.message });
  }
});
