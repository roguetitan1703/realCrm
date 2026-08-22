import { useEffect, useState } from 'react'
import { serverEnv } from '../lib/env.js'

// A label, not a warning. Nothing on a development build looks any different from
// production — same brand, same screens, same data shapes — so the only way to
// know which database you are typing a real client's name into is to be told.
//
// It reports what the SERVER said, which is the question that matters: a
// preview build that was never given its own VITE_API_URL is talking to
// production, and this will say so rather than reassure you.
//
// Renders nothing until the API has answered, and nothing in production.
export default function EnvMark() {
  const [env, setEnv] = useState(serverEnv())
  // The first resolve or boot read may land after this mounts; poll briefly
  // rather than thread a subscription through the store for a label.
  // Bounded: if the API never answers, stop asking. An interval that outlives
  // the question it was asked is a leak, and a label is not worth one.
  useEffect(() => {
    if (env) return
    let tries = 0
    const t = setInterval(() => {
      const e = serverEnv()
      if (e) { setEnv(e); clearInterval(t) }
      else if (++tries > 40) clearInterval(t)
    }, 500)
    return () => clearInterval(t)
  }, [env])

  if (!env || env === 'production') return null
  return <div className={`env-mark env-${env}`}>{env === 'development' ? 'DEVELOPMENT' : 'LOCAL'}</div>
}
