// ============================================================================
// SEED DATA — SINGLE SOURCE OF TRUTH
// ============================================================================
// This file used to be a hand-maintained COPY of src/data/defaultDataset.js.
// The two drifted (this copy went stale), which meant the deployed app hydrated
// old inventory from Postgres while the frontend fallback showed new data.
// Re-exporting the frontend dataset makes that drift structurally impossible.
//
// NOTE: this reaches outside backend/ into src/. That is already the established
// pattern here — services/store.ts imports DEFAULT_SETTINGS from src/data/theme.js
// — so the whole repo must be present when running the API (it is; the server is
// started from the repo root).
// ============================================================================

export {
  defaultAgents as agents,
  defaultProperties as properties,
  defaultLeads as leads,
} from '../../../src/data/defaultDataset.js';
