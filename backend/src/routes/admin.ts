/**
 * ============================================================================
 * 🛰️ SUPERADMIN CONSOLE (Delpat-only)
 * ============================================================================
 * The platform surface that sits ABOVE all tenants. Guarded by a superadmin
 * JWT (email+password login), never by the tenant OTP token. Minimal for now:
 * a roster of tenants with headline counts and the health of the audit ledger.
 * Fuller provisioning lands in a later slice.
 * ============================================================================
 */

import { Router, Request, Response, NextFunction } from 'express';
import { verifyToken } from '../services/auth.js';
import { verifyAuditChain } from '../services/audit.js';
import { sql } from '../services/db.js';

export const adminRouter = Router();

function requireSuperadmin(req: Request, res: Response, next: NextFunction) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  const claims = token ? verifyToken(token) : null;
  if (!claims || claims.kind !== 'superadmin') {
    return res.status(401).json({ error: 'Superadmin authentication required' });
  }
  (req as any).superadmin = claims;
  next();
}

adminRouter.use(requireSuperadmin);

adminRouter.get('/overview', async (_req: Request, res: Response) => {
  try {
    const tenants = await sql`
      SELECT
        t.id, t.name, t.slug, t.subscription_plan, t.subscription_status, t.created_at,
        (SELECT COUNT(*)::int FROM users u WHERE u.tenant_id = t.id)             AS users,
        (SELECT COUNT(*)::int FROM crm_leads l WHERE l.tenant_id = t.id)         AS leads,
        (SELECT COUNT(*)::int FROM crm_properties p WHERE p.tenant_id = t.id)    AS properties
      FROM tenants t
      ORDER BY t.created_at ASC NULLS FIRST
    `;
    const chain = await verifyAuditChain();
    const countRow = await sql`SELECT COUNT(*)::int AS n FROM audit_log`;
    const recent = await sql`
      SELECT seq, tenant_id, actor_type, actor_label, action, summary, created_at
      FROM audit_log ORDER BY seq DESC LIMIT 12
    `;
    return res.json({
      success: true,
      tenants,
      audit: {
        ok: chain.ok,
        brokenAtSeq: chain.brokenAtSeq ?? null,
        count: countRow[0].n,
        recent,
      },
    });
  } catch (err: any) {
    return res.status(500).json({ error: 'Overview failed', message: err.message });
  }
});
