/**
 * ============================================================================
 * 🛡️ TENANT AUTHENTICATION & SUBSCRIPTION GATING MIDDLEWARE
 * ============================================================================
 * Intercepts requests to enforce multi-tenant isolation, JWT token validation,
 * module feature gating, and usage limit quota checks before hitting actions.
 * ============================================================================
 */

import { Request, Response, NextFunction } from 'express';
import { Tenant, User } from '../models';
import { getSettings, getAgents } from '../services/store';
import { verifyToken, touchSession } from '../services/auth';
import { runWithContext, RequestContext } from '../services/context';
import { DEFAULT_TENANT_ID } from '../services/db';

// Extend Express Request type with authenticated session context
declare global {
  namespace Express {
    interface Request {
      tenant?: Tenant;
      user?: User;
      tenantId?: string;
    }
  }
}

/**
 * Database lookup helper for tenant context
 * Queries live PostgreSQL settings and limits
 */
async function getTenantContext(tenantId: string): Promise<Tenant | null> {
  const settings = await getSettings();
  return {
    id: tenantId || 'org_default',
    name: settings.firmName || 'Real Estate CRM',
    slug: (settings.firmName || 'crm').toLowerCase().replace(/[^a-z0-9]+/g, '-'),
    brand_config: settings.brand || { primaryColor: '#1E6F52', surfaceColor: '#F6F5F2', city: settings.city || 'Pune' },
    enabled_modules: settings.enabled_modules || ['leads', 'properties', 'team', 'dialer', 'import', 'whatsapp', 'tasks', 'visits', 'bookings', 'ingest', 'automation', 'reports', 'settings'],
    subscription_plan: 'ENTERPRISE_PRIVATE_CLOUD',
    subscription_status: 'ACTIVE',
    usage_limits: {
      max_agents: 100,
      whatsapp_credits_limit: 50000,
      whatsapp_credits_used: 1240,
      call_minutes_limit: 20000,
      call_minutes_used: 840,
    },
    created_at: new Date(),
    updated_at: new Date(),
  };
}

/**
 * Global Request Context Resolver — runs BEFORE every router.
 *
 * Resolves the authoritative tenant + actor for the request and runs the rest
 * of the request inside an AsyncLocalStorage so the store layer scopes every
 * query without a threaded argument. Tenant precedence:
 *   • valid user token      → tenant from the TOKEN (header ignored — no spoofing)
 *   • valid superadmin token → tenant from X-Tenant-ID (Delpat acting on a tenant)
 *   • no / invalid token     → tenant from X-Tenant-ID (pre-login workspace scope)
 * Never rejects here; enforcement (subscription/module gating) stays in
 * requireTenantAuth. This only establishes "who + which tenant".
 */
export async function withRequestContext(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  const claims = token ? verifyToken(token) : null;
  const headerTenant = (req.headers['x-tenant-id'] as string) || DEFAULT_TENANT_ID;

  let ctx: RequestContext;
  if (claims && claims.kind === 'user') {
    // Auth v2: a token carrying a session id (jti) is only valid while that
    // session is live — this is what makes revoke / force-logout / expiry real.
    // Legacy tokens (no jti, from the dormant OTP flow) still pass. A transient DB
    // hiccup fails OPEN (don't log everyone out); only a definitively gone session
    // is rejected.
    if (claims.jti) {
      try {
        const session = await touchSession(claims.jti);
        if (!session) return res.status(401).json({ error: 'Session expired', code: 'SESSION_INVALID' });
      } catch (e: any) {
        console.warn('[Auth] session check errored (allowing):', e?.message);
      }
    }
    ctx = {
      tenantId: claims.tenant_id, userId: claims.user_id, role: claims.role, actorType: 'user',
      actorLabel: null, ip: req.ip || req.socket?.remoteAddress || null,
      userAgent: (req.headers['user-agent'] as string) || null,
    };
    req.user = { id: claims.user_id, tenant_id: claims.tenant_id, role: claims.role as any } as any;
  } else if (claims && claims.kind === 'superadmin') {
    ctx = {
      tenantId: headerTenant, userId: claims.superadmin_id, role: 'superadmin', actorType: 'superadmin',
      actorLabel: claims.email, ip: req.ip || req.socket?.remoteAddress || null,
      userAgent: (req.headers['user-agent'] as string) || null,
    };
    // Superadmin is an authenticated actor too — requireTenantAuth gates on
    // req.user, and Delpat acting on a tenant must not be treated as anonymous.
    req.user = { id: claims.superadmin_id, tenant_id: headerTenant, role: 'superadmin' } as any;
  } else {
    // Tokenless: the login screen has selected a workspace; scope to it. This is
    // the pre-authentication hydrate path only.
    ctx = {
      tenantId: headerTenant, userId: null, role: null, actorType: 'system',
      actorLabel: null, ip: req.ip || req.socket?.remoteAddress || null,
      userAgent: (req.headers['user-agent'] as string) || null,
    };
  }
  req.tenantId = ctx.tenantId;
  runWithContext(ctx, () => next());
}

/**
 * Mandatory Tenant Auth Middleware — a real gate.
 *
 * This used to have a "tokenless demo path": with no token it fell back to a
 * default tenant and INVENTED a user from the roster (or a hardcoded
 * 'Workspace Admin' with a made-up phone number) so the pre-login demo could
 * still write. The effect was that every route behind this middleware was
 * reachable without authenticating, and every action taken that way was
 * attributed to a real agent who did not perform it.
 *
 * The demo it existed for is gone. A request without a valid user or superadmin
 * token is now rejected, and nothing writes under a fabricated actor.
 *
 * `/ingest` is deliberately NOT behind this: it authenticates on its own API
 * key, which resolves the tenant by itself (see routes/ingest.ts).
 */
export async function requireTenantAuth(req: Request, res: Response, next: NextFunction) {
  try {
    // withRequestContext has already established identity from the token. No
    // user here means no valid token was presented.
    if (!req.user) {
      return res.status(401).json({
        error: 'Not authenticated',
        message: 'Sign in to continue.',
        code: 'AUTH_REQUIRED',
      });
    }

    const tenantSlugOrId = req.tenantId || (req.headers['x-tenant-id'] as string) || DEFAULT_TENANT_ID;
    const tenant = await getTenantContext(tenantSlugOrId);
    if (!tenant) {
      return res.status(401).json({ error: 'Unauthorized: Invalid Tenant Context' });
    }
    if (tenant.subscription_status !== 'ACTIVE') {
      return res.status(403).json({ error: 'Forbidden: Tenant workspace inactive or expired' });
    }
    req.tenant = tenant;
    req.tenantId = tenantSlugOrId;
    next();
  } catch (err: any) {
    return res.status(500).json({ error: 'Authentication Error', details: err.message });
  }
}

/**
 * Module Feature Gating Middleware Factory
 * Ensures the tenant's subscription plan enables the requested module (e.g., 'dialer', 'whatsapp')
 */
export function requireModuleEnabled(moduleKey: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    const tenant = req.tenant;
    if (!tenant) {
      return res.status(401).json({ error: 'Unauthorized: No tenant context found' });
    }

    if (!tenant.enabled_modules.includes(moduleKey)) {
      return res.status(403).json({
        error: 'Upgrade Required',
        message: `The '${moduleKey}' module is not enabled on your current (${tenant.subscription_plan}) plan.`,
        upgrade_url: '/settings/subscription',
      });
    }

    next();
  };
}

/**
 * Quota Check Middleware Factory
 * Prevents actions if usage limit is reached (e.g., WhatsApp credits or Call minutes)
 */
export function requireQuotaAvailable(quotaKey: 'whatsapp_credits' | 'call_minutes') {
  return (req: Request, res: Response, next: NextFunction) => {
    const tenant = req.tenant;
    if (!tenant) return res.status(401).json({ error: 'Unauthorized' });

    if (quotaKey === 'whatsapp_credits') {
      if (tenant.usage_limits.whatsapp_credits_used >= tenant.usage_limits.whatsapp_credits_limit) {
        return res.status(429).json({
          error: 'Quota Exceeded',
          message: 'WhatsApp messaging credit quota reached for this billing cycle.',
        });
      }
    } else if (quotaKey === 'call_minutes') {
      if (tenant.usage_limits.call_minutes_used >= tenant.usage_limits.call_minutes_limit) {
        return res.status(429).json({
          error: 'Quota Exceeded',
          message: 'Cloud telephony call minutes quota reached for this billing cycle.',
        });
      }
    }

    next();
  };
}
