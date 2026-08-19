// ============================================================================
// 🌐 BHUMI PROPCITY CRM — FRONTEND REST API CLIENT
// ============================================================================
// Lightweight HTTP client replacing client-side localStorage. Communicates
// directly with the live Express backend engine (via Vite proxy or localhost:5000).
// ============================================================================

// Where the backend lives.
//   • dev            → local Express on :5000
//   • deployed       → VITE_API_URL (set in Vercel), e.g. https://api.yourdomain.com
//   • same-origin    → falls back to /api/v1 if no VITE_API_URL is configured
// Accepts VITE_API_URL with or without a trailing /api/v1 so it can't be mis-set.
import { enqueue, flushOutbox } from './outbox.js';

function resolveBaseUrl() {
  const env = import.meta.env || {};
  const configured = (env.VITE_API_URL || '').trim().replace(/\/+$/, '');
  if (configured) {
    return /\/api\/v1$/.test(configured) ? configured : `${configured}/api/v1`;
  }
  return env.DEV ? 'http://localhost:5000/api/v1' : '/api/v1';
}

const BASE_URL = resolveBaseUrl();

// Media is served from /files on the API ORIGIN, not under /api/v1 — a browser
// sends no auth header on <img src>, so that route sits outside the API's auth
// surface. Postgres stores the object KEY, never a URL, so if delivery ever
// moves to a CDN hostname this one function is the only thing that changes.
export function fileUrl(key) {
  if (!key) return '';
  const origin = BASE_URL.replace(/\/api\/v1$/, '');
  return `${origin}/files/${String(key).split('/').map(encodeURIComponent).join('/')}`;
}

// ---------------------------------------------------------------------------
// Connection state
// ---------------------------------------------------------------------------
// "Offline" is the worst thing this app can say. It tells an agent standing
// outside a building that the tool they came with is not working, so it has to
// be TRUE, and it has to stop being true the moment it stops being true.
//
// It was neither. One failed fetch declared it — and a fetch rejects for
// entirely ordinary reasons on a phone: a dropped packet, a DNS hiccup, a
// connection reset while handing over between cells. Nothing then re-checked,
// so the badge sat there until some unrelated request happened to succeed;
// with the pulse backing off to 60s, skipping hidden tabs and skipping while
// writes are pending, that could be a minute after the network came back.
// Instant to appear, lazy to leave. That asymmetry is the whole complaint.
//
// Now: two consecutive confirmed failures to declare it (one blip is weather),
// and an active probe that clears it by itself.
let onlineState = { ok: true, checked: false };
const listeners = new Set();
let consecutiveFailures = 0;
let probeTimer = null;
let probeDelay = 0;

const OFFLINE_AFTER = 2;          // consecutive confirmed failures
const PROBE_MIN = 2_000;
const PROBE_MAX = 30_000;

function setOnline(ok) {
  if (ok) { consecutiveFailures = 0; stopProbing(); }
  if (onlineState.ok === ok && onlineState.checked) return;
  onlineState = { ok, checked: true };
  listeners.forEach(fn => { try { fn(onlineState) } catch (e) {} });
  // The first successful call after an outage is the signal to replay whatever
  // was logged while there was no signal.
  if (ok) setTimeout(() => flushOutbox(request, currentTenant()), 0);
  else startProbing();
}

/**
 * A request could not reach the host. Not the same as being offline: say so
 * only when it happens twice running, because the single most common case on a
 * mobile network is one request dying and the next one being fine.
 */
function noteUnreachable() {
  consecutiveFailures++;
  if (consecutiveFailures >= OFFLINE_AFTER) setOnline(false);
  else startProbing();   // check for ourselves rather than wait for a second victim
}

/**
 * While unreachable, ask. `/health` is unauthenticated and sits outside
 * /api/v1, so it works on the login screen too and cannot be confused with a
 * 401. ANY answer — including an error status — proves the host is reachable,
 * which is the only question being asked.
 *
 * Backs off 2s → 30s so a genuinely dead backend is not hammered by every open
 * tab, and stops the instant anything succeeds.
 */
function startProbing() {
  if (probeTimer || typeof window === 'undefined') return;
  probeDelay = PROBE_MIN;
  const tick = async () => {
    probeTimer = null;
    if (onlineState.ok && consecutiveFailures === 0) return;
    // A hidden tab is not worth waking the radio for; the visibility listener
    // below picks it up the moment someone looks at the screen again.
    if (typeof document !== 'undefined' && document.visibilityState !== 'visible') {
      probeTimer = setTimeout(tick, probeDelay);
      return;
    }
    try {
      const origin = BASE_URL.replace(/\/api\/v1$/, '');
      await fetch(`${origin}/health`, { cache: 'no-store', method: 'GET' });
      setOnline(true);          // it answered; that is the whole test
      return;
    } catch {
      probeDelay = Math.min(probeDelay * 2, PROBE_MAX);
      probeTimer = setTimeout(tick, probeDelay);
    }
  };
  probeTimer = setTimeout(tick, probeDelay);
}

function stopProbing() {
  if (probeTimer) { clearTimeout(probeTimer); probeTimer = null; }
  probeDelay = 0;
}

if (typeof document !== 'undefined') {
  // Coming back to the tab is the likeliest moment for the answer to have
  // changed — the phone was in a pocket, in a lift, or on a different network.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && !onlineState.ok) {
      stopProbing();
      startProbing();
    }
  });
}

export function subscribeConnection(fn) {
  listeners.add(fn);
  fn(onlineState);
  return () => listeners.delete(fn);
}
export function getConnection() { return onlineState; }

// Auth tokens live in localStorage. Two separate identities:
//   • crm_auth_token  — the signed-in tenant user (owner/agent), sent on every
//     tenant API call as `Authorization: Bearer`.
//   • crm_admin_token — a Delpat superadmin, used only by the /admin console.
// They are kept apart so signing into one never leaks into the other.
const TOKEN_KEY = 'crm_auth_token';
const ADMIN_TOKEN_KEY = 'crm_admin_token';
function lsGet(k) { try { return (typeof window !== 'undefined' && window.localStorage?.getItem(k)) || ''; } catch { return ''; } }
function lsSet(k, v) { try { if (typeof window === 'undefined' || !window.localStorage) return; if (v) window.localStorage.setItem(k, v); else window.localStorage.removeItem(k); } catch { /* storage blocked */ } }

/**
 * WHICH FIRM A TOKEN BELONGS TO, read off the token itself.
 *
 * The server is token-authoritative: middleware/auth.ts sets the request's
 * tenant from `claims.tenant_id` and IGNORES the X-Tenant-ID header for a
 * signed-in user. That is the correct thing for it to do — nobody can read
 * another firm by editing a header — but it means a client that sends the
 * wrong token gets the wrong firm's desk rendered under the right firm's URL.
 *
 * Read here, not from a second key kept alongside the token, because a stored
 * copy is one more thing that can drift out of step with what it describes.
 * Unsigned and unverified on purpose: this decides only which credential to
 * PRESENT. The server still verifies it.
 */
function tokenTenant(token) {
  try {
    const body = String(token || '').split('.')[1];
    if (!body) return '';
    const pad = body.replace(/-/g, '+').replace(/_/g, '/');
    const json = atob(pad + '='.repeat((4 - (pad.length % 4)) % 4));
    return JSON.parse(json)?.tenant_id || '';
  } catch { return ''; }
}

/**
 * WHICH WORKSPACE THIS TAB IS, decided in ONE place.
 *
 * It was derived in four, each with its own fallback: getHeaders, api.getToken,
 * pwa.slugFromLocation, and the store's session loader — and three of them fell
 * back to `crm_tenant_id`, a single global key that any workspace overwrites
 * just by being VISITED. Open /delpat, get its sign-in screen, never sign in,
 * and bhumi's tab now believes it is delpat.
 *
 * THE URL IS THE AUTHORITY, AND THERE IS NO EXCEPTION.
 *
 * An earlier version of this carved one out for an installed PWA, on the
 * grounds that its start_url might carry no slug — and read `crm_tenant_id`
 * there. That was wrong on the facts: routes/pwa.ts builds the manifest with
 * `start_url: '/<slug>'` AND `scope: '/<slug>'`, precisely because scope is a
 * path prefix and only a path can fence an installed app to one firm. An
 * installed PWA therefore always has its slug in the path, and cannot navigate
 * outside it. The exception protected nothing and left the last route by which
 * a single global key could decide which firm a tab belongs to.
 *
 * No slug means no workspace — the picker — which is the honest answer for a
 * URL that names no firm.
 */
export function currentTenant() {
  return pathSlug();
}

/** The workspace slug in the path, or '' on the picker and /admin. */
function pathSlug() {
  if (typeof window === 'undefined') return '';
  const s = window.location.pathname.replace(/^\/+|\/+$/g, '').split('/')[0] || '';
  if (s && s !== 'admin') return s;
  // `?ws=<slug>` is the alternate entry the login screen has always accepted.
  // pwa.slugFromLocation() honours it, and if this did not, the two resolvers
  // would disagree on exactly the URLs someone is most likely to be sent.
  try { return new URLSearchParams(window.location.search).get('ws') || ''; } catch { return ''; }
}

/**
 * The token to present for `tenantId`, or '' when we hold none for it.
 *
 * TWO RULES, AND THE SECOND IS THE ONE THAT WAS MISSING.
 *
 * 1. On a workspace path, only that workspace's own key counts. This read
 *    `crm_auth_token_<slug> || crm_auth_token`, and that global fallback is
 *    what made signing into one firm sign you into every other: open /bhumi,
 *    then /skyline-realty, and the demo workspace had no key of its own so it
 *    fell back to bhumi's — X-Tenant-ID said skyline, the bearer said bhumi,
 *    and the server rightly believed the bearer. The paying client's desk
 *    rendered under the demo tenant's URL, and the demo could not be opened at
 *    all while anyone was signed in elsewhere.
 *
 * 2. A token is only presented to the firm it was ISSUED for. The picker and
 *    local dev have no slug in the path, so rule 1 cannot help them — they
 *    resolve the workspace from `crm_tenant_id`, which is a single global key
 *    that a previous session may have set. Matching the token's own claim
 *    closes that door too.
 */
function tokenFor(tenantId) {
  // NO WORKSPACE, NO CREDENTIAL. With neither a slug in the path nor a stored
  // workspace there is nothing for a token to be scoped TO, so presenting one
  // means presenting whichever firm was signed into last. That is how the bare
  // root opened a desk instead of the workspace picker even after the picker
  // itself stopped auto-entering: the app asks `getToken()` whether to boot,
  // and a leftover global key kept answering yes.
  if (!tenantId) return '';
  // That workspace's own key, and only it — so two firms signed in on one
  // browser both keep working rather than the last one in evicting the other.
  // No fallback to the global key: that fallback IS the bug this function
  // exists to close.
  const token = lsGet(`crm_auth_token_${tenantId}`);
  if (!token) return '';
  const owner = tokenTenant(token);
  // A token whose claim we cannot read is presented as before rather than
  // dropped — an unparseable payload is a shape change, not an intrusion, and
  // silently signing everybody out would be the worse failure.
  if (tenantId && owner && owner !== tenantId) return '';
  return token;
}

function getHeaders(customHeaders = {}) {
  const slug = typeof window !== 'undefined' ? (window.location.pathname.replace(/^\/+|\/+$/g, '').split('/')[0] || '') : '';
  // THE URL DECIDES THE WORKSPACE — see currentTenant(). Selecting one from the
  // picker pushes /<slug> before anything is sent, so this resolves there too.
  const tenantId = currentTenant();
  const base = {
    'X-Tenant-ID': tenantId,
    'Content-Type': 'application/json',
  };
  const token = typeof window !== 'undefined' ? tokenFor(tenantId) : '';
  if (token) base.Authorization = `Bearer ${token}`;
  // customHeaders wins — lets the admin console override with its own token.
  return { ...base, ...customHeaders };
}

// How many writes are in the air right now.
//
// Mutations update local state immediately and send to the server in the
// background. If a live-refresh response lands in that window it carries the
// row as it was BEFORE the write — so applying it visibly reverts what the
// person just did, and then un-reverts a few seconds later. Counting writes in
// the one place every call passes through means the refresh loop can simply
// wait, rather than every mutation having to remember to announce itself.
let inFlightWrites = 0;
export function hasPendingWrites() { return inFlightWrites > 0; }

// ── Read cache ──────────────────────────────────────────────────────────────
// Screens read what they show, which is right — but it meant leaving a screen
// and coming back re-fetched everything and flashed an empty list, and that
// several components asking the same question at the same moment each asked the
// server separately (the dashboard alone fired /workspace/desk-summary four
// times on one mount).
//
// So: one cache, at the single place every request already passes through, keyed
// by the URL that identifies the read. Two behaviours, and no third:
//
//   • In-flight dedupe — identical GETs issued together share one response.
//   • Short TTL — a repeat GET within FRESH_MS is served from memory.
//
// Any write clears it, entirely. A mutation can change a count, a page, a
// summary and a record at once; working out which is a guessing game that
// silently goes stale the next time an endpoint is added. Clearing everything
// is one line, always correct, and costs a refetch of the screen in front of
// you — which is exactly what you want after a write anyway.
const FRESH_MS = 30_000;
const RETRY_MS = 600;       // one silent re-try for a read that could not reach the host
const reads = new Map();    // url -> { at, data }
const inflight = new Map(); // url -> Promise

export function invalidateReads() { reads.clear(); }
/** The cached value for a GET, or undefined. Lets a screen render on the first frame. */
export function peekRead(endpoint) {
  const hit = reads.get(`${currentTenant()}|${endpoint}`);
  return hit && Date.now() - hit.at < FRESH_MS ? hit.data : undefined;
}

async function request(endpoint, options = {}) {
  const { queueable, ...fetchOptions } = options;
  const isWrite = !!fetchOptions.method && fetchOptions.method.toUpperCase() !== 'GET';
  // KEYED BY WORKSPACE AS WELL AS URL. The tenant travels in a header, not the
  // path, so `/leads?page=1` names a different set of rows per firm and the two
  // shared one cache slot. Nothing reaches it today — every workspace change is
  // either a page load (which discards the map) or a sign-out (which clears
  // it) — but "no caller can currently do the wrong thing" is a property of the
  // callers, not of this cache, and restoreSession() has already added one
  // workspace change that does not reload. Cheap to make it structural.
  const key = `${currentTenant()}|${endpoint}`;

  if (!isWrite) {
    const fresh = reads.get(key);
    if (fresh && Date.now() - fresh.at < FRESH_MS) return fresh.data;
    const pending = inflight.get(key);
    if (pending) return pending;
  }

  if (isWrite) inFlightWrites++;
  const run = (async () => {
  try {
    let res;
    // One silent retry, for READS only.
    //
    // Most flaky-network failures die here and the agent never learns there
    // was one — which is the point. A screen that blanks and recovers on its
    // own is a screen that never told anybody the app was broken.
    //
    // A WRITE is never retried. It is not idempotent: a POST that reached the
    // server and lost only its RESPONSE would create a second lead on the
    // replay. Failed writes have their own honest path — the outbox holds the
    // ones that opted in and shows "N waiting to save".
    for (let attempt = 0; ; attempt++) {
      try {
        res = await fetch(`${BASE_URL}${endpoint}`, {
          cache: 'no-store',
          ...fetchOptions,
          headers: getHeaders(fetchOptions.headers || {}),
        });
        break;
      } catch (err) {
        if (!(err instanceof TypeError) || isWrite || attempt >= 1) throw err;
        await new Promise(r => setTimeout(r, RETRY_MS));
      }
    }
    // A 4xx/5xx means the server answered — it is reachable. Only a failed
    // fetch means offline. Conflating the two made one rejected request paint
    // the whole app "Offline — not saving" while saves were working fine.
    setOnline(true);
    if (!res.ok) {
      // Routes are inconsistent about which field carries the human reason —
      // most (team.ts entirely) only ever set `error`, a shorter set set both
      // `error` (category) and `message` (detail). Reading only `.message`
      // meant every validation error from team.ts — "Reassign this user's 3
      // open leads first", "last active owner", duplicate email, all of it —
      // silently dropped its reason and showed a bare "400 Bad Request".
      let detail = '';
      try { const body = await res.clone().json(); detail = body?.message || body?.error || ''; } catch { /* not json */ }
      throw new Error(`API Error: ${res.status} ${res.statusText}${detail ? ` — ${detail}` : ''}`);
    }
    const data = await res.json();
    if (isWrite) invalidateReads();
    else reads.set(key, { at: Date.now(), data });
    return data;
  } catch (err) {
    if (err instanceof TypeError) {
      // Could not reach the host — after a retry, for a read. Not the same as
      // being offline: noteUnreachable() wants to see it happen twice running
      // before it says so out loud, and probes in the meantime.
      noteUnreachable();
      // Work done in the field is held and replayed. Only the writes that opt
      // in — see outbox.js for why edits deliberately do not.
      if (queueable) {
        // Stamped with the workspace it was written in — see outbox.js.
        enqueue({ endpoint, options: fetchOptions }, currentTenant());
        return { queued: true };
      }
    }
    console.warn(`[API Client Warning] Request to ${endpoint} failed:`, err.message);
    throw err;
  } finally {
    if (isWrite) inFlightWrites--;
  }
  })();

  // A failed read must not be remembered as an answer, so the in-flight entry is
  // cleared either way and only a success is stored above.
  if (!isWrite) {
    inflight.set(key, run);
    run.catch(() => {}).finally(() => { if (inflight.get(key) === run) inflight.delete(key); });
  }
  return run;
}

// Drain the queue whenever the device comes back. `request` is passed in so the
// outbox never has to know how a call is authenticated.
export function flushPending() { return flushOutbox(request, currentTenant()); }
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => { flushPending(); });
}

export const api = {
  // Workspace & State Hydration
  /**
   * Kept as a no-op on purpose. It wrote `crm_tenant_id`, a single global that
   * five different places then read as "which firm is this" — the token
   * resolver, the session loader, the PWA identity, the pre-paint branding and
   * the manifest link. Every one of them answered with whichever workspace was
   * opened last, and the key was written the moment a workspace was RESOLVED,
   * before anyone signed in. That is the whole family of cross-workspace bugs
   * in this file. The URL is the authority now (currentTenant()), nothing reads
   * this key, and it is not written so nothing can start reading it again.
   */
  setTenantId: () => {},

  // ── Auth ──────────────────────────────────────────────────────────────────
  // Tenant users sign in by phone OTP; the returned JWT is stored and attached
  // to every subsequent request by getHeaders().
  // identifier is a phone or an email; the backend delivers the code accordingly.
  requestOtp: (identifier) => request('/auth/otp/request', { method: 'POST', body: JSON.stringify({ identifier }) }),
  verifyOtp: async (identifier, code) => {
    const res = await request('/auth/otp/verify', { method: 'POST', body: JSON.stringify({ identifier, code }) });
    // Through setToken so OTP lands in the same per-workspace key password
    // sign-in uses. It wrote only the global one, which nothing reads now —
    // OTP is legacy and being retired, and it would have retired itself.
    if (res?.token) api.setToken(res.token);
    return res;
  },
  me: () => request('/auth/me'),
  // Same resolution the request headers use, so "are we signed in?" and "what
  // do we send?" can never answer differently. App.jsx boots the desk on this,
  // and with the old global fallback it answered yes on every workspace the
  // moment anyone signed into any one of them.
  getToken: (slug) => tokenFor(slug && slug !== 'admin' ? slug : currentTenant()),
  setToken: (t, slug) => {
    const s = slug || (typeof window !== 'undefined' ? (window.location.pathname.replace(/^\/+|\/+$/g, '').split('/')[0] || '') : '');
    if (s && s !== 'admin') {
      lsSet(`crm_auth_token_${s}`, t);
    }
  },
  clearToken: (slug) => {
    const s = slug || (typeof window !== 'undefined' ? (window.location.pathname.replace(/^\/+|\/+$/g, '').split('/')[0] || '') : '');
    if (s && s !== 'admin') {
      lsSet(`crm_auth_token_${s}`, '');
    }
    lsSet(TOKEN_KEY, '');
  },

  // ── Password auth (auth v2) ────────────────────────────────────────────────
  // Handle is an email (owner/manager) or an assigned login_id (agent).
  login: async (handle, password, tenantSlug) => {
    // Drop whatever token is lying around BEFORE asking for a new one.
    //
    // getHeaders() attaches the stored bearer to every call, this one included,
    // and a token left over from a timed-out session names a session the server
    // has already deleted. The backend used to reject the whole request on that
    // basis from middleware that runs before any route — so the sign-in never
    // reached the handler, the password was never checked, and the answer read
    // as an auth failure that retyping could not fix. The server no longer does
    // that, but there is no reason to present a dead credential while asking
    // for a live one, and this half reaches production first: the frontend
    // deploys on push, the API by hand.
    api.clearToken(tenantSlug);
    const res = await request('/auth/login', { method: 'POST', body: JSON.stringify({ handle, password }) });
    if (res?.token) {
      const slug = tenantSlug || (typeof window !== 'undefined' ? (window.location.pathname.replace(/^\/+|\/+$/g, '').split('/')[0] || '') : '');
      if (slug && slug !== 'admin') lsSet(`crm_auth_token_${slug}`, res.token);
    }
    return res;
  },
  logout: () => request('/auth/logout', { method: 'POST' }).catch(() => {}),
  changePassword: (current, next) => request('/auth/password/change', { method: 'POST', body: JSON.stringify({ current, next }) }),
  // Sends BOTH keys: `handle` is what the reset now accepts (an id or an
  // email), `email` is what the deployed API may still be reading. The
  // frontend ships on push and the API by hand, so they run apart for a while.
  forgotPassword: (handle) => request('/auth/password/forgot', { method: 'POST', body: JSON.stringify({ handle, email: handle }) }),
  resetPassword: (token, next) => request('/auth/password/reset', { method: 'POST', body: JSON.stringify({ token, next }) }),
  getSessions: () => request('/auth/sessions'),
  revokeSession: (id) => request(`/auth/sessions/${encodeURIComponent(id)}/revoke`, { method: 'POST' }),

  // ── User management ────────────────────────────────────────────────────────
  getUsers: () => request('/team/users'),
  createUser: (body) => request('/team/users', { method: 'POST', body: JSON.stringify(body) }),
  updateUser: (id, patch) => request(`/team/users/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(patch) }),
  setUserStatus: (id, status) => request(`/team/users/${encodeURIComponent(id)}/status`, { method: 'POST', body: JSON.stringify({ status }) }),
  reassignSeat: (id, body) => request(`/team/users/${encodeURIComponent(id)}/reassign-seat`, { method: 'POST', body: JSON.stringify(body) }),
  adminResetPassword: (id, password, mustChangePassword) => request(`/team/users/${encodeURIComponent(id)}/reset-password`, { method: 'POST', body: JSON.stringify({ password, mustChangePassword }) }),
  forceLogout: (id) => request(`/team/users/${encodeURIComponent(id)}/force-logout`, { method: 'POST' }),
  deleteUser: (id) => request(`/team/users/${encodeURIComponent(id)}`, { method: 'DELETE' }),

  // Superadmin (Delpat staff) — email + password, kept on its own token so the
  // /admin console is fully separate from the tenant session.
  superadminLogin: async (email, password) => {
    const res = await request('/auth/superadmin/login', { method: 'POST', body: JSON.stringify({ email, password }) });
    if (res?.token) lsSet(ADMIN_TOKEN_KEY, res.token);
    return res;
  },
  adminLogin: async (email, password) => {
    const res = await request('/auth/superadmin/login', { method: 'POST', body: JSON.stringify({ email, password }) });
    if (res?.token) lsSet(ADMIN_TOKEN_KEY, res.token);
    return res;
  },
  adminLogout: () => lsSet(ADMIN_TOKEN_KEY, ''),
  adminOverview: () => request('/admin/overview', { headers: { Authorization: `Bearer ${lsGet(ADMIN_TOKEN_KEY)}` } }),
  // Provision a workspace — SUPERADMIN only, sent with the admin token.
  adminOnboard: (config) => request('/admin/onboard', { method: 'POST', body: JSON.stringify(config), headers: { Authorization: `Bearer ${lsGet(ADMIN_TOKEN_KEY)}` } }),
  getAdminToken: () => lsGet(ADMIN_TOKEN_KEY),
  clearAdminToken: () => lsSet(ADMIN_TOKEN_KEY, ''),
  // Session + firm identity, no record collections. What the phone boots on.
  getBootstrap: () => request('/workspace/bootstrap'),
  // Tiny change-token used by the live-refresh loop; see getPulse() on the server.
  getPulse: () => request('/workspace/pulse'),
  // Global search across leads and properties, run in SQL. The desk used to
  // answer this by filtering two in-memory arrays, which is the single reason
  // the arrays had to exist at all.
  search: (q, limit = 8) => request(`/workspace/search?q=${encodeURIComponent(q)}&limit=${limit}`),
  // The contacts directory: leads as clients, listing owners as owners. Both
  // are derived views, paged and counted in SQL.
  listContacts: (params = {}) => {
    const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v != null && v !== '')).toString()
    return request(`/workspace/contacts${qs ? `?${qs}` : ''}`)
  },
  // Desk counters (open leads, overdue, per-agent load) computed server-side.
  getDeskSummary: () => request('/workspace/desk-summary'),
  // One request for a whole file's worth of duplicate checks.
  checkDuplicates: (body) => request('/workspace/dedupe-check', { method: 'POST', body: JSON.stringify(body) }),
  // Every record created by one import, deleted where it lives.
  revertImportBatch: (batchId) => request(`/workspace/import-batches/${encodeURIComponent(batchId)}`, { method: 'DELETE' }),
  hasPendingWrites,
  resetDatabase: () => request('/workspace/reset', { method: 'POST' }),

  // Lead ingest (the per-tenant URL the client pastes into 99acres/MagicBricks)
  baseUrl: () => BASE_URL,
  // The per-tenant ingest key is gone; each connection carries its own.

  // D1 — provider connections: the inbox, the keys, and the field mapping.
  // Distinct from `/workspace/integrations` below, which is the older
  // per-provider credential store (Exotel, WABA) and is NOT tenant-scoped.
  getConnections: () => request('/connections'),
  createConnection: (provider) => request('/connections', { method: 'POST', body: JSON.stringify({ provider }) }),
  revealConnectionKey: (id) => request(`/connections/${id}/key`),
  rotateConnectionKey: (id) => request(`/connections/${id}/rotate`, { method: 'POST' }),
  setConnectionActive: (id, active) => request(`/connections/${id}`, { method: 'PATCH', body: JSON.stringify({ active }) }),
  deleteConnection: (id) => request(`/connections/${id}`, { method: 'DELETE' }),
  getConnectionInbox: (id, limit = 25, offset = 0) =>
    request(`/connections/inbox?connection=${encodeURIComponent(id)}&limit=${limit}&offset=${offset}`),
  getConnectionSample: (id) => request(`/connections/${id}/sample`),
  previewParser: (id, config, payload) => request(`/connections/${id}/preview`, { method: 'POST', body: JSON.stringify({ config, payload }) }),
  saveParser: (id, config) => request(`/connections/${id}/parser`, { method: 'PUT', body: JSON.stringify({ config }) }),
  replayConnection: (id) => request(`/connections/${id}/replay`, { method: 'POST' }),
  getSetupPack: (id) => request(`/connections/${id}/setup-pack`),

  // Integrations
  // /workspace/integrations is gone with the KV table behind it.

  // Leads CRUD — CRUD routes live under /modules/:moduleKey/records (recordsRouter);
  // /records/:id/actions/* below are the separate actionsRouter endpoints.
  getLeads: () => request('/leads'),
  getLead: (id) => request(`/leads/${encodeURIComponent(id)}`),
  listLeads: (params = {}) => {
    const qs = new URLSearchParams()
    for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '') qs.set(k, String(v))
    const s = qs.toString()
    return request(`/leads/page${s ? `?${s}` : ''}`)
  },
  getLeadsSummary: () => request('/leads/summary'),
  // One request for the whole selection — see bulkAssignLeads() for why this is
  // not a loop of updateLead on the client.
  bulkAssignLeads: (ids, agentId) => request('/leads/bulk-assign', { method: 'POST', body: JSON.stringify({ ids, agentId }) }),
  bulkDeleteLeads: (ids) => request('/leads/bulk-delete', { method: 'POST', body: JSON.stringify({ ids }) }),
  // Candidate listings for a lead's requirement. Scored client-side by
  // matching.js — this only narrows what it runs against.
  getLeadMatches: (id) => request(`/leads/${encodeURIComponent(id)}/matches`),
  // `mine` is the phone asking for the signed-in person's own day. An agent
  // is scoped to themselves server-side regardless; this is what lets a
  // manager's phone show their eleven jobs instead of the firm's seven hundred.
  getToday: (mine) => request('/workspace/today' + (mine ? '?mine=1' : '')),
  createLead: (lead) => request('/leads', { method: 'POST', body: JSON.stringify(lead) }),
  updateLead: (id, patch) => request(`/modules/leads/records/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
  deleteLead: (id) => request(`/modules/leads/records/${id}`, { method: 'DELETE' }),
  deleteProperty: (id) => request(`/modules/properties/records/${id}`, { method: 'DELETE' }),

  // Owners — the cold-calling list (supply-side outreach, not a lead).
  listOwners: (params = {}) => {
    const qs = new URLSearchParams()
    for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '') qs.set(k, String(v))
    const s = qs.toString()
    return request(`/owners${s ? `?${s}` : ''}`)
  },
  getOwnersSummary: (mine) => request('/owners/summary' + (mine ? '?mine=1' : '')),
  listOwnerProjects: () => request('/owners/projects'),
  getOwner: (id) => request(`/owners/${encodeURIComponent(id)}`),
  createOwner: (owner) => request('/owners', { method: 'POST', body: JSON.stringify(owner) }),
  updateOwner: (id, patch) => request(`/owners/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(patch) }),
  deleteOwner: (id) => request(`/owners/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  bulkAssignOwners: (ids, agentId) => request('/owners/bulk-assign', { method: 'POST', body: JSON.stringify({ ids, agentId }) }),

  // Properties CRUD
  getProperties: () => request('/properties'),

  // Paged reads. The desk used to hold every listing in memory and slice it in
  // the browser; these let a screen ask for the page it is showing and nothing
  // else. `params` maps 1:1 onto the query string the route accepts:
  // page, limit, q, status, deal, type, locality, project, excludeId.
  listProperties: (params = {}) => {
    const qs = new URLSearchParams()
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null && v !== '') qs.set(k, String(v))
    }
    const s = qs.toString()
    return request(`/properties${s ? `?${s}` : ''}`)
  },
  getProperty: (id) => request(`/properties/${encodeURIComponent(id)}`),
  getPropertiesSummary: () => request('/properties/summary'),
  // The buyers already matched to one property. Replaces running the matcher
  // over every lead in the browser to answer a question about a single flat.
  getPropertyBuyers: (id) => request(`/properties/${encodeURIComponent(id)}/buyers`),
  // Township inventory: projects are a grouping over units, derived in SQL so
  // the browser doesn't need the units to see the groups.
  listProjects: (params = {}) => {
    const q = new URLSearchParams(params).toString()
    return request(`/properties/projects${q ? `?${q}` : ''}`)
  },
  getProject: (key) => request(`/properties/projects/${encodeURIComponent(key)}`),
  createProperty: (prop) => request('/properties', { method: 'POST', body: JSON.stringify(prop) }),

  // Real 30-day sales metrics for one agent (calls / site visits / win rate)
  getAgentPerformance: (id) => request(`/team/users/${encodeURIComponent(id)}/performance`),
  updateProperty: (id, patch) => request(`/modules/properties/records/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),

  // Team & Routing
  getRoster: () => request('/team/roster'),
  addAgent: (agent) => request('/team/roster', { method: 'POST', body: JSON.stringify(agent) }),
  getRouting: () => request('/team/routing'),
  updateRouting: (config) => request('/team/routing', { method: 'PUT', body: JSON.stringify(config) }),
  updateAgentStatus: (id, status) => request(`/team/users/${id}/duty-status`, { method: 'PATCH', body: JSON.stringify({ status }) }),
  reassignLeads: (fromId, toId) => request(`/team/users/${fromId}/reassign-leads`, { method: 'POST', body: JSON.stringify({ to_user_id: toId }) }),

  // Settings & Branding
  updateSettings: (patch) => request('/workspace/settings', { method: 'POST', body: JSON.stringify(patch) }),

  // Tenant brand identity (accent colour, logo) — writes tenants.brand_config,
  // the single source the desk UI and the installed-app icon both read.
  updateBrand: (patch) => request('/workspace/brand', { method: 'POST', body: JSON.stringify(patch) }),
  // `cache: 'default'` rather than the blanket no-store every other read uses.
  // This one is 77kB of tenant branding that changes about never, it is fetched
  // before sign-in on every single launch, and the server sends an ETag it will
  // answer with a 304. no-store told the browser not to keep the response at
  // all, so it re-downloaded the logo every time. Correctness is unaffected —
  // `public, no-cache` on the response means it still revalidates on every hit.
  resolveWorkspace: (slug) => request(`/workspace/resolve?slug=${encodeURIComponent(slug || '')}`, { cache: 'default' }),

  // Audit ledger (owner/manager only)
  getAuditLog: () => request('/workspace/audit'),

  // PWA home-screen icons (generated client-side, stored on the tenant)

  // Notifications (per-user alert feed)
  getNotifications: () => request('/notifications'),
  getNotifUnread: () => request('/notifications?count=1'),
  markNotificationRead: (id) => request(`/notifications/${encodeURIComponent(id)}/read`, { method: 'POST' }),
  markAllNotificationsRead: () => request('/notifications/read-all', { method: 'POST' }),

  // Web Push (phone alerts even when the app is closed)
  getVapid: () => request('/notifications/vapid'),
  subscribePush: (subscription) => request('/notifications/subscribe', { method: 'POST', body: JSON.stringify({ subscription }) }),
  unsubscribePush: (endpoint) => request('/notifications/unsubscribe', { method: 'POST', body: JSON.stringify({ endpoint }) }),

  // Composable Actions
  // callBridge() is gone with the route it called. It reported success for a
  // call nobody placed. Use logContactAction(id, 'call').
  // Remark thread on a lead OR property (B1) — a real persisted timeline entry,
  // author-attributed, edit-own. `outcome` (B5) is optional — set when
  // attaching an outcome to a logged call/message.
  // `queueable` on the three field writes: an agent logs these standing in a
  // basement or a lift, and the work is already done — losing it because the
  // signal dropped loses the firm the record of a real visit.
  addRemark: (recordId, text) => request(`/records/${recordId}/actions/remark`, { method: 'POST', queueable: true, body: JSON.stringify({ text }) }),
  editRemark: (recordId, eventId, text, outcome) => request(`/records/${recordId}/actions/remark/${encodeURIComponent(eventId)}`, { method: 'PATCH', body: JSON.stringify({ text, outcome }) }),
  // B5 — log a plain call/WhatsApp/SMS action on any record (confirm-then-log).
  logContactAction: (recordId, channel) => request(`/records/${recordId}/actions/contact-log`, { method: 'POST', queueable: true, body: JSON.stringify({ channel }) }),
  // sendWhatsApp() is gone with the fabricated WABA route it called.
  // B4 — a structured activity on a LEAD (site visit with proof, meeting, …).
  // `propertyId` is a reference to the unit it concerned, never ownership.
  logActivity: (leadId, payload) => request(`/records/${leadId}/actions/activity`, { method: 'POST', queueable: true, body: JSON.stringify(payload) }),
  // B4 media — asks the server to mint a presigned PUT. The bytes then go
  // browser→R2 directly (see uploadMedia in lib/media.js), never through here.
  mediaUploadUrl: (contentType, kind) => request('/media/upload-url', { method: 'POST', body: JSON.stringify({ contentType, kind }) }),
  changeStage: (recordId, newStage, note) => request(`/records/${recordId}/actions/stage-change`, { method: 'POST', body: JSON.stringify({ new_stage_id: newStage, note }) }),
  mergeRecords: (primaryId, dupId, strategy = 'combine_timeline') => request(`/records/${primaryId}/actions/merge`, { method: 'POST', body: JSON.stringify({ duplicate_record_id: dupId, merge_strategy: strategy }) }),
};
