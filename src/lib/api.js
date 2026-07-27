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
  const tenantId = typeof window !== 'undefined' ? (window.localStorage?.getItem('crm_tenant_id') || 'bhumi-propcity') : 'bhumi-propcity';
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
  requestOtp: (phone) => request('/auth/otp/request', { method: 'POST', body: JSON.stringify({ phone }) }),
  verifyOtp: async (phone, code) => {
    const res = await request('/auth/otp/verify', { method: 'POST', body: JSON.stringify({ phone, code }) });
    if (res?.token) lsSet(TOKEN_KEY, res.token);
    return res;
  },
  me: () => request('/auth/me'),
  getToken: () => lsGet(TOKEN_KEY),
  setToken: (t) => lsSet(TOKEN_KEY, t),
  clearToken: () => lsSet(TOKEN_KEY, ''),

  // Superadmin (Delpat staff) — email + password, kept on its own token so the
  // /admin console is fully separate from the tenant session.
  superadminLogin: async (email, password) => {
    const res = await request('/auth/superadmin/login', { method: 'POST', body: JSON.stringify({ email, password }) });
    if (res?.token) lsSet(ADMIN_TOKEN_KEY, res.token);
    return res;
  },
  adminOverview: () => request('/admin/overview', { headers: { Authorization: `Bearer ${lsGet(ADMIN_TOKEN_KEY)}` } }),
  getAdminToken: () => lsGet(ADMIN_TOKEN_KEY),
  clearAdminToken: () => lsSet(ADMIN_TOKEN_KEY, ''),
  getState: () => request('/workspace/state'),
  resetDatabase: () => request('/workspace/reset', { method: 'POST' }),
  onboardTenant: (config) => request('/workspace/onboard', { method: 'POST', body: JSON.stringify(config) }),

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

  // Composable Actions
  callBridge: (recordId, agentId) => request(`/records/${recordId}/actions/call`, { method: 'POST', body: JSON.stringify({ agent_id: agentId }) }),
  sendWhatsApp: (recordId, templateId, vars) => request(`/records/${recordId}/actions/whatsapp`, { method: 'POST', body: JSON.stringify({ template_id: templateId, variables: vars }) }),
  changeStage: (recordId, newStage, note) => request(`/records/${recordId}/actions/stage-change`, { method: 'POST', body: JSON.stringify({ new_stage_id: newStage, note }) }),
  mergeRecords: (primaryId, dupId, strategy = 'combine_timeline') => request(`/records/${primaryId}/actions/merge`, { method: 'POST', body: JSON.stringify({ duplicate_record_id: dupId, merge_strategy: strategy }) }),
};
