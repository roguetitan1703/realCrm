// ============================================================================
// 🧭 Which deployment is this
// ============================================================================
// Read from the HOSTNAME, not from a build variable, and that is deliberate.
// `VITE_*` values are baked in at build time, so a preview deployment that was
// never given its own override builds with production's — which is exactly the
// mistake worth catching, and a marker that depends on the same variable being
// right would go quiet at precisely the wrong moment.
//
// The production host is one string. Everything else is not production, which
// fails safe: a new preview URL nobody configured still says so.

const PRODUCTION_HOSTS = ['realestate.delpat.in']

export function appEnv() {
  if (typeof window === 'undefined') return 'production'
  const h = window.location.hostname
  if (PRODUCTION_HOSTS.includes(h)) return 'production'
  if (h.endsWith('.vercel.app')) return 'staging'
  return 'local'
}

export const isProduction = () => appEnv() === 'production'
