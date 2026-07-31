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

// Connection state — surfaced in the UI so a backend outage can never silently
// masquerade as a working app (writes would be lost on refresh).
let onlineState = { ok: true, checked: false };
const listeners = new Set();
function setOnline(ok) {
  if (onlineState.ok === ok && onlineState.checked) return;
  onlineState = { ok, checked: true };
  listeners.forEach(fn => { try { fn(onlineState) } catch (e) {} });
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

function getHeaders(customHeaders = {}) {
  const tenantId = typeof window !== 'undefined' ? (window.localStorage?.getItem('crm_tenant_id') || 'skyline-realty') : 'skyline-realty';
  const base = {
    'X-Tenant-ID': tenantId,
    'Content-Type': 'application/json',
  };
  const token = lsGet(TOKEN_KEY);
  if (token) base.Authorization = `Bearer ${token}`;
  // customHeaders wins — lets the admin console override with its own token.
  return { ...base, ...customHeaders };
}

async function request(endpoint, options = {}) {
  try {
    const res = await fetch(`${BASE_URL}${endpoint}`, {
      ...options,
      headers: getHeaders(options.headers || {}),
    });
    // A 4xx/5xx means the server answered — it is reachable. Only a failed
    // fetch means offline. Conflating the two made one rejected request paint
    // the whole app "Offline — not saving" while saves were working fine.
    setOnline(true);
    if (!res.ok) {
      let detail = '';
      try { detail = (await res.clone().json())?.message || ''; } catch { /* not json */ }
      throw new Error(`API Error: ${res.status} ${res.statusText}${detail ? ` — ${detail}` : ''}`);
    }
    return await res.json();
  } catch (err) {
    if (err instanceof TypeError) setOnline(false); // fetch could not reach the host
    console.warn(`[API Client Warning] Request to ${endpoint} failed:`, err.message);
    throw err;
  }
}

export const api = {
  // Workspace & State Hydration
  setTenantId: (id) => {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem('crm_tenant_id', id);
    }
  },

  // ── Auth ──────────────────────────────────────────────────────────────────
  // Tenant users sign in by phone OTP; the returned JWT is stored and attached
  // to every subsequent request by getHeaders().
  // identifier is a phone or an email; the backend delivers the code accordingly.
  requestOtp: (identifier) => request('/auth/otp/request', { method: 'POST', body: JSON.stringify({ identifier }) }),
  verifyOtp: async (identifier, code) => {
    const res = await request('/auth/otp/verify', { method: 'POST', body: JSON.stringify({ identifier, code }) });
    if (res?.token) lsSet(TOKEN_KEY, res.token);
    return res;
  },
  me: () => request('/auth/me'),
  getToken: () => lsGet(TOKEN_KEY),
  setToken: (t) => lsSet(TOKEN_KEY, t),
  clearToken: () => lsSet(TOKEN_KEY, ''),

  // ── Password auth (auth v2) ────────────────────────────────────────────────
  // Handle is an email (owner/manager) or an assigned login_id (agent).
  login: async (handle, password) => {
    const res = await request('/auth/login', { method: 'POST', body: JSON.stringify({ handle, password }) });
    if (res?.token) lsSet(TOKEN_KEY, res.token);
    return res;
  },
  logout: () => request('/auth/logout', { method: 'POST' }).catch(() => {}),
  changePassword: (current, next) => request('/auth/password/change', { method: 'POST', body: JSON.stringify({ current, next }) }),
  forgotPassword: (email) => request('/auth/password/forgot', { method: 'POST', body: JSON.stringify({ email }) }),
  resetPassword: (token, next) => request('/auth/password/reset', { method: 'POST', body: JSON.stringify({ token, next }) }),
  getSessions: () => request('/auth/sessions'),
  revokeSession: (id) => request(`/auth/sessions/${encodeURIComponent(id)}/revoke`, { method: 'POST' }),

  // ── User management ────────────────────────────────────────────────────────
  getUsers: () => request('/team/users'),
  createUser: (body) => request('/team/users', { method: 'POST', body: JSON.stringify(body) }),
  updateUser: (id, patch) => request(`/team/users/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(patch) }),
  setUserStatus: (id, status) => request(`/team/users/${encodeURIComponent(id)}/status`, { method: 'POST', body: JSON.stringify({ status }) }),
  reassignSeat: (id, body) => request(`/team/users/${encodeURIComponent(id)}/reassign-seat`, { method: 'POST', body: JSON.stringify(body) }),
  adminResetPassword: (id, password) => request(`/team/users/${encodeURIComponent(id)}/reset-password`, { method: 'POST', body: JSON.stringify({ password }) }),
  forceLogout: (id) => request(`/team/users/${encodeURIComponent(id)}/force-logout`, { method: 'POST' }),
  deleteUser: (id) => request(`/team/users/${encodeURIComponent(id)}`, { method: 'DELETE' }),

  // Superadmin (Delpat staff) — email + password, kept on its own token so the
  // /admin console is fully separate from the tenant session.
  superadminLogin: async (email, password) => {
    const res = await request('/auth/superadmin/login', { method: 'POST', body: JSON.stringify({ email, password }) });
    if (res?.token) lsSet(ADMIN_TOKEN_KEY, res.token);
    return res;
  },
  adminOverview: () => request('/admin/overview', { headers: { Authorization: `Bearer ${lsGet(ADMIN_TOKEN_KEY)}` } }),
  // Provision a workspace — SUPERADMIN only, sent with the admin token.
  adminOnboard: (config) => request('/admin/onboard', { method: 'POST', body: JSON.stringify(config), headers: { Authorization: `Bearer ${lsGet(ADMIN_TOKEN_KEY)}` } }),
  getAdminToken: () => lsGet(ADMIN_TOKEN_KEY),
  clearAdminToken: () => lsSet(ADMIN_TOKEN_KEY, ''),
  getState: () => request('/workspace/state'),
  resetDatabase: () => request('/workspace/reset', { method: 'POST' }),

  // Lead ingest (the per-tenant URL the client pastes into 99acres/MagicBricks)
  baseUrl: () => BASE_URL,
  getIngestConfig: () => request('/workspace/ingest'),
  regenerateIngestKey: () => request('/workspace/ingest/regenerate', { method: 'POST' }),

  // D1 — provider connections: the inbox, the keys, and the field mapping.
  // Distinct from `/workspace/integrations` below, which is the older
  // per-provider credential store (Exotel, WABA) and is NOT tenant-scoped.
  getConnections: () => request('/connections'),
  createConnection: (provider) => request('/connections', { method: 'POST', body: JSON.stringify({ provider }) }),
  rotateConnectionKey: (id) => request(`/connections/${id}/rotate`, { method: 'POST' }),
  setConnectionActive: (id, active) => request(`/connections/${id}`, { method: 'PATCH', body: JSON.stringify({ active }) }),
  deleteConnection: (id) => request(`/connections/${id}`, { method: 'DELETE' }),
  getConnectionInbox: (id, limit = 25) => request(`/connections/inbox?connection=${encodeURIComponent(id)}&limit=${limit}`),
  getConnectionSample: (id) => request(`/connections/${id}/sample`),
  previewParser: (id, config, payload) => request(`/connections/${id}/preview`, { method: 'POST', body: JSON.stringify({ config, payload }) }),
  saveParser: (id, config) => request(`/connections/${id}/parser`, { method: 'PUT', body: JSON.stringify({ config }) }),
  replayConnection: (id) => request(`/connections/${id}/replay`, { method: 'POST' }),
  getSetupPack: (id, key) => request(`/connections/${id}/setup-pack${key ? `?key=${encodeURIComponent(key)}` : ''}`),

  // Integrations
  getIntegrations: () => request('/workspace/integrations'),
  saveIntegration: (key, config) => request(`/workspace/integrations/${encodeURIComponent(key)}`, {
    method: 'PUT',
    body: JSON.stringify(config),
  }),

  // Leads CRUD — CRUD routes live under /modules/:moduleKey/records (recordsRouter);
  // /records/:id/actions/* below are the separate actionsRouter endpoints.
  getLeads: () => request('/leads'),
  createLead: (lead) => request('/leads', { method: 'POST', body: JSON.stringify(lead) }),
  updateLead: (id, patch) => request(`/modules/leads/records/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
  deleteLead: (id) => request(`/modules/leads/records/${id}`, { method: 'DELETE' }),
  deleteProperty: (id) => request(`/modules/properties/records/${id}`, { method: 'DELETE' }),

  // Properties CRUD
  getProperties: () => request('/properties'),
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
  resolveWorkspace: (slug) => request(`/workspace/resolve?slug=${encodeURIComponent(slug || '')}`),

  // Audit ledger (owner/manager only)
  getAuditLog: () => request('/workspace/audit'),

  // PWA home-screen icons (generated client-side, stored on the tenant)
  uploadPwaIcons: (body) => request('/workspace/pwa-icons', { method: 'POST', body: JSON.stringify(body) }),

  // Notifications (per-user alert feed)
  getNotifications: () => request('/notifications'),
  markNotificationRead: (id) => request(`/notifications/${encodeURIComponent(id)}/read`, { method: 'POST' }),
  markAllNotificationsRead: () => request('/notifications/read-all', { method: 'POST' }),

  // Web Push (phone alerts even when the app is closed)
  getVapid: () => request('/notifications/vapid'),
  subscribePush: (subscription) => request('/notifications/subscribe', { method: 'POST', body: JSON.stringify({ subscription }) }),
  unsubscribePush: (endpoint) => request('/notifications/unsubscribe', { method: 'POST', body: JSON.stringify({ endpoint }) }),

  // Composable Actions
  callBridge: (recordId, agentId) => request(`/records/${recordId}/actions/call`, { method: 'POST', body: JSON.stringify({ agent_id: agentId }) }),
  // Remark thread on a lead OR property (B1) — a real persisted timeline entry,
  // author-attributed, edit-own. `outcome` (B5) is optional — set when
  // attaching an outcome to a logged call/message.
  addRemark: (recordId, text) => request(`/records/${recordId}/actions/remark`, { method: 'POST', body: JSON.stringify({ text }) }),
  editRemark: (recordId, eventId, text, outcome) => request(`/records/${recordId}/actions/remark/${encodeURIComponent(eventId)}`, { method: 'PATCH', body: JSON.stringify({ text, outcome }) }),
  // B5 — log a plain call/WhatsApp/SMS action on any record (confirm-then-log).
  logContactAction: (recordId, channel) => request(`/records/${recordId}/actions/contact-log`, { method: 'POST', body: JSON.stringify({ channel }) }),
  sendWhatsApp: (recordId, templateId, vars) => request(`/records/${recordId}/actions/whatsapp`, { method: 'POST', body: JSON.stringify({ template_id: templateId, variables: vars }) }),
  // B4 — a structured activity on a LEAD (site visit with proof, meeting, …).
  // `propertyId` is a reference to the unit it concerned, never ownership.
  logActivity: (leadId, payload) => request(`/records/${leadId}/actions/activity`, { method: 'POST', body: JSON.stringify(payload) }),
  // B4 media — asks the server to mint a presigned PUT. The bytes then go
  // browser→R2 directly (see uploadMedia in lib/media.js), never through here.
  mediaUploadUrl: (contentType, kind) => request('/media/upload-url', { method: 'POST', body: JSON.stringify({ contentType, kind }) }),
  changeStage: (recordId, newStage, note) => request(`/records/${recordId}/actions/stage-change`, { method: 'POST', body: JSON.stringify({ new_stage_id: newStage, note }) }),
  mergeRecords: (primaryId, dupId, strategy = 'combine_timeline') => request(`/records/${primaryId}/actions/merge`, { method: 'POST', body: JSON.stringify({ duplicate_record_id: dupId, merge_strategy: strategy }) }),
};
