/**
 * ============================================================================
 * 🧵 REQUEST CONTEXT — per-request tenant + actor, carried implicitly
 * ============================================================================
 * The store layer must scope every query to ONE tenant, but threading a
 * tenantId argument through ~50 functions (and every route that calls them) is
 * churn and easy to get wrong. Instead we stash the resolved context in an
 * AsyncLocalStorage set once by middleware; the store reads it with
 * getContext(). Nothing outside a request (seed/boot/backfill) has a context,
 * so those fall back to the default tenant deliberately.
 *
 * The tenant here is AUTHORITATIVE: when a valid user token is present it comes
 * from the token, never the client-supplied X-Tenant-ID header — so an
 * authenticated user of tenant A cannot read tenant B by spoofing the header.
 * ============================================================================
 */

import { AsyncLocalStorage } from 'async_hooks';

export interface RequestContext {
  tenantId: string;
  userId: string | null;
  role: string | null;                        // owner | manager | agent | superadmin | null (tokenless)
  actorType: 'user' | 'superadmin' | 'system';
  actorLabel?: string | null;
  ip?: string | null;
  userAgent?: string | null;
}

const als = new AsyncLocalStorage<RequestContext>();

export function runWithContext<T>(ctx: RequestContext, fn: () => T): T {
  return als.run(ctx, fn);
}

export function getContext(): RequestContext | undefined {
  return als.getStore();
}
