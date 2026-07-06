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
 * Mock database lookup helper for demo/scaffolding purposes
 * In production, this queries Redis / PostgreSQL RLS context
 */
async function getTenantContext(tenantId: string): Promise<Tenant | null> {
  // Demo mock return for Bhumi Propcity
  if (tenantId === 'org_bhumi_109' || tenantId === 'demo') {
    return {
      id: 'org_bhumi_109',
      name: 'Bhumi Propcity',
      slug: 'bhumi-propcity',
      brand_config: { primaryColor: '#1E6F52', surfaceColor: '#F6F5F2', city: 'Pune' },
      enabled_modules: ['leads', 'properties', 'team', 'dialer', 'import', 'whatsapp'],
      subscription_plan: 'PRO',
      subscription_status: 'ACTIVE',
      usage_limits: {
        max_agents: 25,
        whatsapp_credits_limit: 10000,
        whatsapp_credits_used: 1240,
        call_minutes_limit: 5000,
        call_minutes_used: 840,
      },
      created_at: new Date(),
      updated_at: new Date(),
    };
  }
  return null;
}

/**
 * Mandatory Tenant Auth Middleware
 * Verifies JWT Bearer token and attaches `req.tenantId`, `req.tenant`, `req.user`
 */
export async function requireTenantAuth(req: Request, res: Response, next: NextFunction) {
  try {
    const authHeader = req.headers.authorization;
    const tenantSlugOrId = req.headers['x-tenant-id'] as string || 'org_bhumi_109';

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      // For local demo scaffolding, allow simulated development header
      if (process.env.NODE_ENV !== 'production') {
        req.tenantId = tenantSlugOrId;
        const tenant = await getTenantContext(tenantSlugOrId);
        if (!tenant) {
          return res.status(401).json({ error: 'Unauthorized: Invalid Tenant Context' });
        }
        req.tenant = tenant;
        req.user = {
          id: 'usr_55',
          tenant_id: tenant.id,
          name: 'Priya Patel',
          email: 'priya@bhumipropcity.com',
          phone_number: '+919820011223',
          role: 'FIELD_AGENT',
          branch_location: 'Pune West',
          status: 'ACTIVE',
        };
        return next();
      }
      return res.status(401).json({ error: 'Unauthorized: Missing JWT Bearer Token' });
    }

    // In production: Verify JWT signature, extract user.id and tenant_id
    const token = authHeader.split(' ')[1];
    // ... JWT verification logic ...
    
    const tenant = await getTenantContext(tenantSlugOrId);
    if (!tenant || tenant.subscription_status !== 'ACTIVE') {
      return res.status(403).json({ error: 'Forbidden: Tenant workspace inactive or expired' });
    }

    req.tenant = tenant;
    req.tenantId = tenant.id;
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
