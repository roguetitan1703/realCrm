import { appEnv } from '../lib/env.js'

// A label, not a warning. Nothing on a staging build looks any different from
// production — same brand, same data shapes, same screens — so the only way to
// know which one you are typing a real client's name into is to be told.
// Renders nothing in production.
export default function EnvMark() {
  const env = appEnv()
  if (env === 'production') return null
  return <div className={`env-mark env-${env}`}>{env === 'staging' ? 'STAGING' : 'LOCAL'}</div>
}
