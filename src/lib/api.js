// ============================================================================
// 🌐 BHUMI PROPCITY CRM — FRONTEND REST API CLIENT
// ============================================================================
// Lightweight HTTP client replacing client-side localStorage. Communicates
// directly with the live Express backend engine (via Vite proxy or localhost:5000).
// ============================================================================

const BASE_URL = import.meta.env?.DEV ? 'http://localhost:5000/api/v1' : '/api/v1';

function getHeaders(customHeaders = {}) {
  const tenantId = typeof window !== 'undefined' ? (window.localStorage?.getItem('crm_tenant_id') || 'bhumi-propcity') : 'bhumi-propcity';
  return {
    'X-Tenant-ID': tenantId,
    'Content-Type': 'application/json',
    ...customHeaders,
  };
}

async function request(endpoint, options = {}) {
  try {
    const res = await fetch(`${BASE_URL}${endpoint}`, {
      ...options,
      headers: getHeaders(options.headers || {}),
    });
    if (!res.ok) {
      throw new Error(`API Error: ${res.status} ${res.statusText}`);
    }
    return await res.json();
  } catch (err) {
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
