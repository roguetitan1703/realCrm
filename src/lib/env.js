// ============================================================================
// 🧭 Which deployment am I writing to
// ============================================================================
// THE SERVER SAYS, AND NOTHING HERE GUESSES.
//
// An earlier version of this file matched the browser's hostname against a
// production domain written into the source — a URL baked into the repo, which
// is the thing that has to be configuration. Worse, it answered the wrong
// question. "Which frontend build is this" does not matter; "which database am
// I about to write a real client's name into" does, and the only thing that
// knows is the API holding the connection.
//
// That also makes the Vercel trap visible instead of silent: a preview build
// that was never given its own VITE_API_URL is talking to production, and this
// will say PRODUCTION, because it is.

let current = null

/** Record what the API told us. Called wherever a resolve response lands. */
export function setServerEnv(env) {
  if (env === 'production' || env === 'development' || env === 'local') current = env
}

/** 'production' | 'development' | 'local' | null — null until the API has answered. */
export function serverEnv() { return current }
