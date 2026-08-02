// ============================================================================
// App store (React context). Powered by live backend REST API.
// Durable data (agents/properties/leads/settings) is hydrated from server and
// mutated via Express backend endpoints. Transient UI is managed in React state.
// ============================================================================
import { createContext, useContext, useReducer, useCallback, useRef, useEffect } from 'react'
import { DEFAULT_SETTINGS, DEFAULT_BRAND, PROTECTED_STAGES } from '../data/theme.js'
import { initials } from './format.js'
import { generateMessage, followUpMessage } from './matching.js'
import { api as apiClient } from './api.js'
import { applyBrandColor } from './brand.js'
import { setTenantIdentity } from './tenant.js'
import { applyPwaIdentity, slugFromLocation } from './pwa.js'
import { getPref } from './prefs.js'
import { isOpen } from '../data/leadStatus.js'

const StoreCtx = createContext(null)
export const useStore = () => useContext(StoreCtx)

const clone = (x) => JSON.parse(JSON.stringify(x))

// How many records of each kind the cache holds. Enough that paging through a
// list and opening rows from it never refetches, small enough that it can never
// grow back into the whole book.
const CACHE_LIMIT = 500

// ── Cache helpers ───────────────────────────────────────────────────────────
// The record cache replaced two arrays holding every lead and every property in
// the firm. A write goes to the server; these keep the copy on screen in step
// with what was just saved. Patching a record that isn't cached is a no-op by
// design — nothing is showing it, and the next read fetches it fresh.
const withCache = (state, kind, next) => ({ ...state, cache: { ...state.cache, [kind]: next } })

function patchRecord(state, kind, id, fn) {
  const cur = state.cache?.[kind]?.[id]
  if (!cur) return state
  const next = fn(cur)
  if (!next || next === cur) return state
  return withCache(state, kind, { ...state.cache[kind], [id]: next })
}

function cacheOne(state, kind, record) {
  return withCache(state, kind, { ...(state.cache?.[kind] || {}), [record.id]: record })
}

function dropRecords(state, kind, ids) {
  if (!ids?.length) return state
  const next = { ...(state.cache?.[kind] || {}) }
  for (const id of ids) delete next[id]
  return withCache(state, kind, next)
}

/** Prepend a timeline event to a record, in the shape the detail views read. */
const withEvent = (record, type, label) =>
  [{ type, label, timestamp: Date.now(), ago: 'just now' }, ...(record.timeline || [])]

// ── Offline snapshot ────────────────────────────────────────────────────────
// The last server state, cached per tenant so an offline reload still shows the
// firm's real data (the service worker can't cache the cross-origin API in the
// split-origin deploy). Keyed by tenant so switching firms never crosses data.
function stateCacheKey() {
  let t = 'unresolved'
  try { t = window.localStorage?.getItem('crm_tenant_id') || t } catch (e) {}
  return `crm_state_cache_${t}`
}
function writeStateCache(serverState) {
  try {
    window.localStorage?.setItem(stateCacheKey(), JSON.stringify({ state: serverState, at: Date.now() }))
  } catch (e) {
    // Almost always QuotaExceededError: /workspace/state returns every property
    // in the firm, and a real book of inventory serializes past the ~5MB origin
    // budget. This used to fail into an empty catch, so the snapshot silently
    // stopped existing the day a tenant got big and every launch went cold with
    // nobody able to see why. Say it out loud until the read is paginated.
    console.warn('[Store] offline snapshot not saved:', e?.name || e,
      '— the desk will cold-start from the network on every launch.')
  }
}

// The accent, stored on its own so it survives a snapshot that is too big to
// write. index.html reads the same key before first paint.
function lastBrandColor() {
  try {
    const c = window.localStorage?.getItem('crm_brand_color') || ''
    return /^#?[a-f\d]{6}$/i.test(c) ? c : ''
  } catch (e) { return '' }
}
function readStateCache() {
  try {
    let t = window.localStorage?.getItem('crm_tenant_id') || ''
    let raw = t ? window.localStorage?.getItem(`crm_state_cache_${t}`) : null
    if (!raw) {
      for (let i = 0; i < (window.localStorage?.length || 0); i++) {
        const k = window.localStorage.key(i)
        if (k && k.startsWith('crm_state_cache_')) {
          raw = window.localStorage.getItem(k)
          if (raw) break
        }
      }
    }
    if (!raw) return null
    const c = JSON.parse(raw)
    return c && c.state ? c : null
  } catch (e) { return null }
}

function loadAuthSession() {
  if (typeof window === 'undefined' || !window.localStorage) return { loggedIn: false }
  try {
    const raw = window.localStorage.getItem('crm_auth_session')
    const hasToken = Boolean(apiClient.getToken?.())
    if (raw) {
      const p = JSON.parse(raw)
      const urlSlug = slugFromLocation()
      const tokenTenant = window.localStorage.getItem('crm_tenant_id') || p.tenantSlug || ''
      // Strict Tenant URL Isolation: if a specific tenant URL is requested (e.g. /bhumi)
      // and the signed-in session belongs to a different tenant (e.g. delpat),
      // do NOT auto-login to delpat on /bhumi. Present the login screen for /bhumi!
      if (urlSlug && tokenTenant && urlSlug !== tokenTenant && urlSlug !== p.tenantSlug) {
        return { loggedIn: false }
      }
      return {
        loggedIn: Boolean(p.loggedIn) && hasToken,
        role: p.role || 'admin',
        activeAgentId: p.activeAgentId || 'a1',
        tenantName: p.tenantName || '',
        tenantCity: p.tenantCity || '',
      }
    }
  } catch (e) {}
  return { loggedIn: false }
}

function persistAuthSession(patch = {}) {
  if (typeof window === 'undefined' || !window.localStorage) return
  try {
    const existingRaw = window.localStorage.getItem('crm_auth_session')
    const existing = existingRaw ? JSON.parse(existingRaw) : {}
    const updated = { ...existing, ...patch, timestamp: Date.now() }
    window.localStorage.setItem('crm_auth_session', JSON.stringify(updated))
  } catch (e) {}
}

function clearAuthSession() {
  if (typeof window === 'undefined' || !window.localStorage) return
  try {
    window.localStorage.removeItem('crm_auth_session')
  } catch (e) {}
}

function freshState() {
  const session = loadAuthSession()
  // NEVER seed the client with the bundled demo dataset. Showing one firm's
  // sample agents/leads/name for a frame before the server hydrate lands is the
  // "demo data flash / wrong tenant" leak. When signed in, start from this
  // browser's per-tenant offline snapshot (real last-known data) if present,
  // otherwise empty — and let the server hydrate fill it in. The firm name is
  // seeded from the auth session so the sidebar never flashes the demo firm.
  const cached = session.loggedIn ? readStateCache() : null
  const cs = cached?.state || {}
  const settings = cs.settings
    ? { ...clone(DEFAULT_SETTINGS), ...cs.settings }
    : { ...clone(DEFAULT_SETTINGS), firmName: session.tenantName || '', city: session.tenantCity || '' }
  return {
    role: session.role || 'admin',                 // 'admin' (owner desktop) | 'agent' (mobile)
    activeAgentId: session.activeAgentId || 'a1',           // who "I" am in agent view
    loggedIn: session.loggedIn || false,
    agents: Array.isArray(cs.agents) ? cs.agents : [],
    // The firm's own vocabulary, from the boot payload. Not records -- a few
    // dozen strings that filter menus, the locality field and the requirement
    // picker suggest from. These were all derived by mapping the collections,
    // so they went silently EMPTY when the collections went away: no crash, no
    // error, just dropdowns with nothing in them.
    localities: Array.isArray(cs.localities) ? cs.localities : [],
    projects: Array.isArray(cs.projects) ? cs.projects : [],
    configs: Array.isArray(cs.configs) ? cs.configs : [],
    dealMix: cs.dealMix || { sale: 0, rent: 0 },
    tenant: cs.tenant || null,
    importLogs: [],
    inactiveAgentIds: Array.isArray(cs.inactiveAgentIds) ? cs.inactiveAgentIds : [],
    // People who have left. Kept apart from `agents` so they resolve for
    // display but can never be picked — see getBootstrap().
    formerAgents: Array.isArray(cs.formerAgents) ? cs.formerAgents : [],
    settings,                            // editable: firmName, stages, sources, slaHours, reminderDays
    brand: cs.brand
      ? { ...clone(DEFAULT_BRAND), ...cs.brand }
      // No snapshot yet, but the accent is a 7-character key of its own — read
      // it so the store agrees with the color index.html already painted rather
      // than starting from the stock green and repainting the desk mid-boot.
      : { ...clone(DEFAULT_BRAND), ...(lastBrandColor() ? { primaryColor: lastBrandColor() } : {}) },
    routing: cs.routing_rules ? { strategy: 'round_robin', active_agent_ids: [], ...cs.routing_rules } : { strategy: 'round_robin', active_agent_ids: [] },
    toasts: [],
    notifications: [],   // server-backed per-user alert feed
    dataAsOf: cached?.at || null,   // ms timestamp of the currently displayed data snapshot
    dataStale: false,    // true when we're showing a cached snapshot (offline read)
    // Records fetched one at a time, keyed by kind then id. This is what
    // replaces "the store holds every lead and every property": a screen asks
    // for the record it is showing, and a miss is normal rather than a bug.
    cache: { lead: {}, property: {} },
    // modal/overlay state
    modal: null,
    waState: null,
    searchOpen: false,
    notifOpen: false,
  }
}

const initial = freshState()

let _toastSeq = 0

function reducer(state, action) {
  switch (action.type) {
    case 'HYDRATE_SERVER': {
      const s = action.state || {}
      // Trust the server's arrays verbatim — including EMPTY ones. A freshly
      // onboarded tenant legitimately has no leads/properties; falling back to
      // the bundled demo dataset here was leaking Skyline's demo records (and
      // owner) into every empty workspace. Only keep local state when the server
      // omitted the key entirely (malformed/partial response).
      return {
        ...state,
        agents: Array.isArray(s.agents) ? s.agents : state.agents,
        // This was missing entirely — freshState() (the FIRST paint, from the
        // localStorage snapshot) reads formerAgents/inactiveAgentIds, but the
        // actual live boot response lands here, and this reducer never copied
        // either one across. So a departed agent resolved correctly for one
        // frame on load and then reverted to unresolved the instant the real
        // network response arrived — every lead of theirs read "Former owner"
        // (the safe fallback for an unresolvable id) instead of their name,
        // and duty-off agents reappeared in every picker.
        formerAgents: Array.isArray(s.formerAgents) ? s.formerAgents : state.formerAgents,
        inactiveAgentIds: Array.isArray(s.inactiveAgentIds) ? s.inactiveAgentIds : state.inactiveAgentIds,
        localities: Array.isArray(s.localities) ? s.localities : state.localities,
        projects: Array.isArray(s.projects) ? s.projects : state.projects,
        configs: Array.isArray(s.configs) ? s.configs : state.configs,
        dealMix: s.dealMix || state.dealMix,
        tenant: s.tenant || state.tenant,
        settings: s.settings ? { ...state.settings, ...s.settings } : state.settings,
        routing: s.routing_rules ? { ...state.routing, ...s.routing_rules } : state.routing,
        brand: s.brand ? { ...state.brand, ...s.brand } : state.brand,
        dataAsOf: action.at || Date.now(),
        dataStale: false,   // fresh from the server
      }
    }

    // Offline read: rehydrate from the last cached snapshot when the server is
    // unreachable, and flag the data as stale so the UI can say "as of <time>".
    case 'HYDRATE_CACHE': {
      const s = action.state || {}
      return {
        ...state,
        agents: Array.isArray(s.agents) ? s.agents : state.agents,
        formerAgents: Array.isArray(s.formerAgents) ? s.formerAgents : state.formerAgents,
        inactiveAgentIds: Array.isArray(s.inactiveAgentIds) ? s.inactiveAgentIds : state.inactiveAgentIds,
        localities: Array.isArray(s.localities) ? s.localities : state.localities,
        projects: Array.isArray(s.projects) ? s.projects : state.projects,
        configs: Array.isArray(s.configs) ? s.configs : state.configs,
        dealMix: s.dealMix || state.dealMix,
        tenant: s.tenant || state.tenant,
        settings: s.settings ? { ...state.settings, ...s.settings } : state.settings,
        routing: s.routing_rules ? { ...state.routing, ...s.routing_rules } : state.routing,
        brand: s.brand ? { ...state.brand, ...s.brand } : state.brand,
        dataAsOf: action.at || null,
        dataStale: true,
      }
    }

    // One record, fetched on its own. `records` lets a list page seed the cache
    // for free — the rows it just drew are the records the user is about to open.
    // Every row the server hands back lands here, so a screen can look up a
    // record it has already shown without asking for it again. Bounded, because
    // an unbounded one is just the in-memory collection rebuilt a page at a
    // time — the exact thing this replaces. Oldest insertions go first; a record
    // evicted from the cache is refetched by id, which is a normal outcome.
    case 'CACHE_RECORDS': {
      const kind = action.kind
      const next = { ...(state.cache?.[kind] || {}) }
      for (const r of action.records || []) if (r?.id) { delete next[r.id]; next[r.id] = r }
      const keys = Object.keys(next)
      if (keys.length > CACHE_LIMIT) for (const k of keys.slice(0, keys.length - CACHE_LIMIT)) delete next[k]
      return { ...state, cache: { ...state.cache, [kind]: next } }
    }

    case 'SET_BRAND': return { ...state, brand: { ...state.brand, ...action.patch } }

    case 'SET_NOTIFICATIONS': return { ...state, notifications: action.notifications || [] }
    case 'MARK_NOTIFS_READ': return { ...state, notifications: (state.notifications || []).map(n => ({ ...n, read: true })) }

    case 'PATCH_SETTINGS': return { ...state, settings: { ...state.settings, ...action.patch } }
    case 'SET_ROUTING': return { ...state, routing: { ...state.routing, ...action.patch } }

    case 'SET': return { ...state, ...action.patch }

    // Real, server-persisted remark events (B1) — kind picks the array so the
    // same actions serve leads and properties.
    case 'ADD_TIMELINE_EVENT':
      return patchRecord(state, action.kind, action.id, r => ({
        ...r, timeline: [action.event, ...(r.timeline || [])],
      }))
    case 'EDIT_TIMELINE_EVENT':
      return patchRecord(state, action.kind, action.id, r => ({
        ...r,
        timeline: (r.timeline || []).map(e => e.id === action.eventId
          ? { ...e, label: action.text, metadata: { ...(e.metadata || {}), edited: true, ...(action.outcome ? { outcome: action.outcome } : {}) } }
          : e),
      }))

    case 'LOGIN': {
      // The verified user drives role + identity. Backend roles are
      // owner/manager/agent; the desk UI is admin/agent — anything that isn't a
      // plain agent gets the full (admin) desk.
      const user = action.payload?.user
      const role = user ? (user.role === 'agent' ? 'agent' : 'admin') : state.role
      const activeAgentId = user?.id || state.activeAgentId
      // The workspace name/city are known at sign-in — persist them so the next
      // boot paints the real firm in the sidebar/tab instead of flashing the
      // demo firm for the moment before the server state hydrates.
      const tenant = action.payload?.tenant || {}
      persistAuthSession({ loggedIn: true, role, activeAgentId, tenantName: tenant.firmName || '', tenantCity: tenant.city || '' })
      const settings = tenant.firmName
        ? { ...state.settings, firmName: tenant.firmName, city: tenant.city || state.settings.city }
        : state.settings
      return { ...state, loggedIn: true, role, activeAgentId, settings }
    }

    case 'LOGOUT': {
      clearAuthSession()
      return { ...freshState(), loggedIn: false }
    }

    case 'ONBOARD_TENANT': {
      const { firmName, city, primaryColor, logoUrl } = action.config || {}
      persistAuthSession({ loggedIn: true, role: 'admin', activeAgentId: state.activeAgentId })
      return {
        ...state,
        loggedIn: true,
        role: 'admin',                    // the owner runs the full desk
        // A brand-new firm starts EMPTY — clear the demo collections so nothing
        // from the previous tenant bleeds through (hydrate then fills the owner).
        leads: [],
        properties: [],
        importLogs: [],
        notifications: [],
        settings: {
          ...state.settings,
          firmName: firmName || state.settings.firmName,
          city: city || '',
        },
        // In-session theming; the server also persisted this to brand_config.
        brand: {
          ...state.brand,
          primaryColor: primaryColor || state.brand.primaryColor,
          logoUrl: logoUrl || state.brand.logoUrl,
        },
      }
    }

    case 'ROLE': {
      persistAuthSession({ role: action.role })
      return { ...state, role: action.role }
    }

    case 'TOAST': {
      const t = { id: ++_toastSeq, text: action.text, tone: action.tone || 'ok' }
      return { ...state, toasts: [...state.toasts, t] }
    }
    case 'UNTOAST':
      return { ...state, toasts: state.toasts.filter(t => t.id !== action.id) }

    // ── Record patches ──────────────────────────────────────────────
    // These used to rewrite an entire collection with .map(). There is no
    // collection now: the write goes to the server, and these patch the cached
    // copy so the screen the person is looking at reflects what they just did.
    // A record that is not cached is simply not patched — the next read fetches
    // it fresh, which is the correct outcome rather than a missed update.
    case 'ASSIGN': {
      const a = state.agents.find(x => x.id === action.agentId)
      return patchRecord(state, 'lead', action.leadId, l => ({
        ...l, agentId: action.agentId,
        timeline: withEvent(l, 'assign', 'Assigned to ' + (a ? a.first : '')),
      }))
    }

    case 'STAGE':
      return patchRecord(state, 'lead', action.leadId, l => ({
        ...l, stage: action.stage,
        timeline: withEvent(l, 'stage', 'Stage → ' + action.stage),
      }))

    case 'FOLLOWUP': {
      // fu === null means "marked done" — clearing the appointment, not setting one.
      const fu = action.followUp
      return patchRecord(state, 'lead', action.leadId, l => ({
        ...l, followUp: fu, overdue: false,
        timeline: withEvent(l, 'follow', fu ? 'Follow-up set · ' + fu.action : 'Appointment completed'),
      }))
    }

    case 'UPDATE_LEAD':
      return patchRecord(state, 'lead', action.leadId, l => ({
        ...l, ...action.patch,
        timeline: withEvent(l, 'note', 'Updated details inline'),
      }))

    case 'UPDATE_PROP':
      return patchRecord(state, 'property', action.propId, p => ({ ...p, ...action.patch }))

    case 'MERGE': {
      // The duplicate is gone; the primary absorbs its shortlist and follow-up.
      const dup = state.cache?.lead?.[action.leadId]
      const primaryId = dup?.duplicateOf || action.primaryId
      if (!primaryId) return state
      const merged = patchRecord(state, 'lead', primaryId, l => ({
        ...l,
        shortlist: Array.from(new Set([...(l.shortlist || []), ...(dup?.shortlist || [])])),
        followUp: l.followUp || dup?.followUp || null,
        notes: ['[MERGED INQUIRY] duplicate record ' + (dup?.name || action.leadId) + ' merged in', ...(l.notes || [])],
        timeline: withEvent(l, 'note', 'Merged duplicate enquiry (' + (dup?.name || 'Lead') + ')'),
      }))
      return dropRecords(merged, 'lead', [action.leadId])
    }

    case 'ATTACH_PROP':
      return patchRecord(state, 'lead', action.leadId, l => {
        const shortlist = l.shortlist || []
        if (shortlist.includes(action.propId)) return l
        return {
          ...l, shortlist: [action.propId, ...shortlist],
          timeline: withEvent(l, 'note', 'Shortlisted ' + (action.label || 'a property')),
        }
      })

    case 'DETACH_PROP':
      return patchRecord(state, 'lead', action.leadId, l => ({
        ...l, shortlist: (l.shortlist || []).filter(id => id !== action.propId),
      }))

    case 'VISIT_FEEDBACK': {
      const { leadId, propId, verdict, reason, society } = action
      const label = verdict === 'liked'
        ? 'Liked ' + society + ' on site visit'
        : 'Rejected ' + society + ' — ' + reason
      return patchRecord(state, 'lead', leadId, l => ({
        ...l,
        feedback: { ...(l.feedback || {}), [propId]: { verdict, reason } },
        timeline: withEvent(l, 'note', label),
      }))
    }

    // A newly created record is cached so the screen that created it can open it
    // immediately; the list it belongs to refetches on the next data token.
    case 'ADD_LEAD':
      return action.lead?.id ? cacheOne(state, 'lead', action.lead) : state

    case 'ADD_PROPERTY':
      return action.property?.id ? cacheOne(state, 'property', action.property) : state

    case 'ADD_PROPERTIES':
      return (action.properties || []).reduce((acc, p) => (p?.id ? cacheOne(acc, 'property', p) : acc), state)

    case 'ADD_OWNER':
      return action.owner?.id ? cacheOne(state, 'owner', action.owner) : state

    case 'SET_OWNER_STAGE':
      return patchRecord(state, 'owner', action.id, o => ({ ...o, stage: action.stage }))

    case 'UPDATE_OWNER':
      return patchRecord(state, 'owner', action.id, o => ({ ...o, ...action.patch }))

    case 'DELETE_OWNERS':
      return dropRecords(state, 'owner', Array.isArray(action.ids) ? action.ids : [action.ids])

    case 'DELETE_LEADS': {
      const ids = Array.isArray(action.ids) ? action.ids : [action.ids]
      return {
        ...dropRecords(state, 'lead', ids),
        notifications: (state.notifications || []).filter(n => !ids.includes(n.leadId)),
      }
    }

    case 'DELETE_PROPERTIES':
      return dropRecords(state, 'property', Array.isArray(action.ids) ? action.ids : [action.ids])

    case 'LOG_IMPORT_BATCH': {
      const logs = state.importLogs || []
      return { ...state, importLogs: [action.logEntry, ...logs] }
    }

    case 'REVERT_IMPORT_BATCH': {
      // The server deleted the rows. Drop whatever copies the cache holds so a
      // stale one can't be opened from a screen still on the page.
      const { batchId } = action
      const gone = (kind) => Object.values(state.cache?.[kind] || {})
        .filter(r => r.importBatchId === batchId).map(r => r.id)
      return {
        ...dropRecords(dropRecords(dropRecords(state, 'lead', gone('lead')), 'property', gone('property')), 'owner', gone('owner')),
        importLogs: (state.importLogs || []).map(log => log.batchId === batchId ? { ...log, reverted: true } : log),
      }
    }

    case 'PROP_STATUS':
      return patchRecord(state, 'property', action.propId, p => ({ ...p, status: action.status }))

    case 'SET_TENANCY': {
      const { propId, tenancy } = action
      return patchRecord(state, 'property', propId, p => ({
        ...p,
        tenancy: tenancy || undefined,
        // A let flat is Leased. This wrote 'Under offer' — not a real status
        // (the value is 'Under Offer'), so the row landed with a status nothing
        // matches — and the wrong idea besides: the flat isn't under offer,
        // it's tenanted.
        status: tenancy ? 'Leased' : 'Available',
        timeline: withEvent(p, 'note', tenancy
          ? 'Tenancy set · ' + tenancy.tenant + ' · ' + p.priceLabel + ' · deposit ' + (tenancy.depositLabel || '—') + ' held'
          : 'Tenancy cleared — flat available again'),
      }))
    }

    case 'RETURN_DEPOSIT':
      return patchRecord(state, 'property', action.propId, p => (p.tenancy ? {
        ...p,
        tenancy: { ...p.tenancy, depositReturned: true },
        timeline: withEvent(p, 'note', 'Deposit ' + (p.tenancy.depositLabel || '') + ' returned to ' + p.tenancy.tenant),
      } : p))

    case 'TOGGLE_AGENT': {
      const on = state.inactiveAgentIds.includes(action.agentId)
      return {
        ...state,
        inactiveAgentIds: on ? state.inactiveAgentIds.filter(x => x !== action.agentId) : [...state.inactiveAgentIds, action.agentId],
      }
    }

    case 'REASSIGN_ALL': {
      // The server moved every open lead. Only the cached copies need patching.
      const a = state.agents.find(x => x.id === action.toId)
      return Object.values(state.cache?.lead || {})
        .filter(l => l.agentId === action.fromId && isOpen(l.stage))
        .reduce((acc, l) => patchRecord(acc, 'lead', l.id, r => ({
          ...r, agentId: action.toId,
          timeline: withEvent(r, 'assign', 'Reassigned to ' + (a ? a.first : '')),
        })), state)
    }

    case 'ADD_AGENT': {
      const name = action.name.trim()
      const av = ['av-a1', 'av-a2', 'av-a3', 'av-a4'][state.agents.length % 4]
      const agent = { id: 'anew' + Date.now(), name, first: name.split(' ')[0], initials: initials(name), avatar: av }
      return { ...state, agents: [...state.agents, agent] }
    }

    case 'SET_FIRM_NAME': {
      const firmName = action.name.trim() || state.settings.firmName
      return { ...state, settings: { ...state.settings, firmName }, brand: { ...state.brand, name: firmName, firmName } }
    }
    case 'ADD_STAGE': {
      const name = action.name.trim()
      if (!name || state.settings.stages.includes(name)) return state
      // Statuses have no order, so a new one simply goes on the end. This used
      // to insert "before the first Closed stage" to keep a funnel intact —
      // there is no funnel.
      const stages = [...state.settings.stages, name]
      return { ...state, settings: { ...state.settings, stages } }
    }
    case 'RENAME_STAGE': {
      const { from, to } = action
      const name = to.trim()
      if (!name || from === name || PROTECTED_STAGES.includes(from)) return state
      if (state.settings.stages.includes(name)) return state
      const stages = state.settings.stages.map(s => s === from ? name : s)
      const next = Object.values(state.cache?.lead || {}).filter(l => l.stage === from)
        .reduce((acc, l) => patchRecord(acc, 'lead', l.id, r => ({ ...r, stage: name })), state)
      return { ...next, settings: { ...next.settings, stages } }
    }
    case 'REMOVE_STAGE': {
      const { name } = action
      if (PROTECTED_STAGES.includes(name)) return state
      const stages = state.settings.stages.filter(s => s !== name)
      const fallback = stages[0] || 'New'
      const next = Object.values(state.cache?.lead || {}).filter(l => l.stage === name)
        .reduce((acc, l) => patchRecord(acc, 'lead', l.id, r => ({ ...r, stage: fallback })), state)
      return { ...next, settings: { ...next.settings, stages } }
    }
    case 'MOVE_STAGE': {
      const { name, dir } = action
      const stages = state.settings.stages.slice()
      const i = stages.indexOf(name)
      const j = i + dir
      if (i < 0 || j < 0 || j >= stages.length) return state
      if (PROTECTED_STAGES.includes(name)) return state
      ;[stages[i], stages[j]] = [stages[j], stages[i]]
      return { ...state, settings: { ...state.settings, stages } }
    }

    case 'WA_OPEN':
      return { ...state, waState: { ...action.wa, composing: true, message: null } }
    case 'WA_SET':
      return { ...state, waState: state.waState ? { ...state.waState, ...action.patch } : null }
    case 'WA_CLOSE':
      return { ...state, waState: null }

    case 'RESET':
      return { ...freshState(), loggedIn: true }

    default: return state
  }
}

export function StoreProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, initial)
  const timers = useRef({})

  // Pull the authoritative, tenant-scoped state from the backend. Called on
  // mount AND right after login — the token/tenant changes at login, so the
  // desk must re-fetch under the new identity or it keeps showing whatever
  // loaded for the default tenant at startup.
  // `background` marks a refresh nobody asked for. A failed one must stay
  // silent: the first load falls back to the cached snapshot and paints the
  // "as of <time>" stale banner, which is right when there is nothing else to
  // show — but doing that on a routine poll means one dropped packet flips a
  // working desk into looking offline, then back, every few seconds.
  const loadServerState = useCallback((background = false) => {
    // One boot read, for both chromes. Every screen reads what it shows — a
    // page of leads, a page of listings, the Today feed, one record at a time —
    // so this carries identity, the roster, the firm's settings and brand, and
    // nothing else. It used to be ~10MB on a real book; it is about 2KB.
    return apiClient.getBootstrap()
      .then(res => {
        if (res && res.success && res.state) {
          dispatch({ type: 'HYDRATE_SERVER', state: res.state })
          writeStateCache(res.state)   // keep a snapshot for the next offline load
        }
      })
      .catch(err => {
        if (background) return
        console.error('[Store Hydration] Backend unreachable:', err.message)
        // Offline: fall back to the last cached snapshot so the desk is still
        // readable, flagged stale so the UI can show "as of <time>".
        const cached = readStateCache()
        if (cached) dispatch({ type: 'HYDRATE_CACHE', state: cached.state, at: cached.at })
      })
  }, [])

  // Hydrate state from backend REST API on mount.
  // Only with a token: the API now rejects unauthenticated reads outright (the
  // tokenless fallback actor is gone), so firing this on the login screen would
  // 401 and make a signed-out app look like a backend outage.
  useEffect(() => {
    if (apiClient.getToken?.()) loadServerState()

    // Validate a stored token against the backend. Only drop session if the server
    // explicitly rejects it with a 401/403 — network errors, page reload aborts,
    // or temporary 5xx errors must NEVER log out the user.
    if (apiClient.getToken?.()) {
      apiClient.me()
        .then(res => { if (!res?.success) throw new Error('invalid') })
        .catch(err => {
          if (err?.message && (err.message.includes('401') || err.message.includes('403'))) {
            apiClient.clearToken?.();
            dispatch({ type: 'LOGOUT' });
          }
        })
      loadNotifications()
    }
  }, [])

  // Paint the desk in the tenant's accent whenever it changes (hydrate, edit,
  // onboarding). Sourced from tenants.brand_config; falls back to the default.
  useEffect(() => {
    applyBrandColor(state.brand?.primaryColor)
    if (state.brand?.primaryColor) {
      try { window.localStorage?.setItem('crm_brand_color', state.brand.primaryColor) } catch (e) {}
    }
  }, [state.brand?.primaryColor])

  // Publish the firm's identity to the plain modules that compose outbound
  // text. Without this they fall back to a bundled brand and sign a client's
  // message with the wrong firm's name.
  useEffect(() => {
    setTenantIdentity({ firmName: state.settings.firmName, city: state.settings.city })
    // Keep the session's copy of the firm's name current. It is what seeds the
    // sidebar before the server answers, and it was written once at login and
    // never again — so renaming a firm left every launch opening under the old
    // name until the hydrate landed.
    if (state.settings.firmName) {
      persistAuthSession({
        tenantName: state.settings.firmName,
        tenantCity: state.settings.city || '',
        tenantSlug: state.tenant?.slug || state.tenant?.id || '',
      })
    }

    // slugFromLocation, not raw localStorage: a device opening the firm's app
    // for the first time has nothing stored yet, so this effect was pointing the
    // manifest back at _platform right after index.html had correctly pointed it
    // at the tenant — and _platform is the wrong name, the wrong icon and the
    // green theme colour that an install would then capture forever. Once the
    // session is known it is authoritative, because the PWA identity captured at
    // install must be the firm whose data the app will show.
    const sessionSlug = state.tenant?.slug || state.tenant?.id || ''
    const tid = sessionSlug || slugFromLocation()
    // Icons are the server's job alone — /pwa/<slug>/icon-N.png renders the
    // firm's real logo. The browser used to generate and upload them too, which
    // is how every tenant with a logo ended up with an initials icon; see the
    // note in lib/pwa.js.
    applyPwaIdentity(tid, state.settings.firmName)
  }, [state.settings.firmName, state.settings.city, state.brand?.primaryColor, state.brand?.logoUrl, state.tenant?.slug, state.tenant?.id])

  // Pull the current user's alert feed. No-op without a token (the feed is
  // per-user, so it needs an authenticated identity).
  const loadNotifications = useCallback(() => {
    if (!apiClient.getToken?.()) return
    apiClient.getNotifications()
      .then(res => { if (res?.success) dispatch({ type: 'SET_NOTIFICATIONS', notifications: res.notifications }) })
      .catch(err => console.warn('[Notifications] load failed:', err.message))
  }, [])

  // ── Live refresh ──────────────────────────────────────────────────────────
  // The desk used to load once and then quietly go stale: a lead routed in by a
  // portal, or reassigned by a manager, only appeared if you reloaded the page.
  //
  // The obvious fix — re-fetch /workspace/state every few seconds — is worse
  // than the problem. That call is eight unbounded queries, so a room of ten
  // open tabs would re-download every lead, property and timeline event in the
  // firm every few seconds, forever, and the cost grows with the customer's
  // data. Instead:
  //
  //   • poll a ~40-byte change token, and pay for the full state ONLY when it
  //     actually moves;
  //   • never poll a hidden tab — a backgrounded phone should not be working;
  //   • refresh the instant the tab is looked at again, or the network returns,
  //     which is when staleness is actually noticed;
  //   • back off from 15s to 60s once the desk has been quiet for a while, so
  //     an idle tab left open overnight is not a heartbeat all night;
  //   • never apply a response while a write is in the air (see
  //     hasPendingWrites) or it would briefly undo what was just done.
  //
  // Push arriving on the device is the better trigger and would replace the
  // timer entirely; this is the version that works today on every browser,
  // including the ones that never grant notification permission.
  const pulseRef = useRef(null)
  useEffect(() => {
    if (!apiClient.getToken?.()) return

    let stopped = false
    let timer = null
    let quiet = 0            // consecutive polls that found nothing new
    let checking = false     // one poll at a time, however long the network takes

    const FAST = 15000, SLOW = 60000, QUIET_AFTER = 8

    const check = async () => {
      if (stopped || checking) return
      if (document.visibilityState !== 'visible') return
      // A poll landing mid-write would paint the pre-write row back on screen.
      if (apiClient.hasPendingWrites?.()) return
      checking = true
      try {
        const res = await apiClient.getPulse()
        const token = res?.token
        if (!token || stopped) return
        if (pulseRef.current === null) { pulseRef.current = token; return }
        if (token !== pulseRef.current) {
          pulseRef.current = token
          quiet = 0
          await loadServerState(true)
          loadNotifications()
        } else {
          quiet++
        }
      } catch {
        // Offline or a blip. The banner is driven by real writes failing, not
        // by a poll we chose to make.
      } finally {
        checking = false
      }
    }

    const arm = () => {
      clearTimeout(timer)
      if (stopped) return
      timer = setTimeout(async () => { await check(); arm() }, quiet >= QUIET_AFTER ? SLOW : FAST)
    }

    // Coming back to the tab is the moment staleness is noticed, so it gets an
    // immediate check rather than waiting out the interval.
    const wake = () => {
      if (document.visibilityState !== 'visible') return
      quiet = 0
      check().then(arm)
    }
    document.addEventListener('visibilitychange', wake)
    window.addEventListener('online', wake)
    arm()

    return () => {
      stopped = true
      clearTimeout(timer)
      document.removeEventListener('visibilitychange', wake)
      window.removeEventListener('online', wake)
    }
  }, [loadServerState, loadNotifications])


  const toast = useCallback((text, tone) => {
    dispatch({ type: 'TOAST', text, tone })
  }, [])

  // Every toast gets its own timer, in an effect rather than during render.
  // Stacked toasts are staggered: three arriving together at a flat 2.6s meant
  // the last one was on screen for the time it took to read the first.
  useEffect(() => {
    state.toasts.forEach((t, i) => {
      if (timers.current[t.id]) return
      timers.current[t.id] = setTimeout(
        () => dispatch({ type: 'UNTOAST', id: t.id }),
        2000,
      )
    })
  }, [state.toasts])

  // The message is a TEMPLATE FILLED FROM PROPERTY DATA — not generated text.
  // It resolves synchronously; there is deliberately no artificial delay or
  // "composing" animation, which would imply AI authorship we don't do.
  const composeFor = useCallback((wa) => {
    const prop = state.cache?.property?.[wa.propId] || null
    const lead = state.cache?.lead?.[wa.leadId] || null
    // The firm name MUST come from the signed-in tenant. Leaving it out fell
    // back to the bundled demo brand, so a client received another firm's
    // name at the bottom of the message.
    if (prop) {
      return generateMessage(prop, {
        lang: wa.lang, tone: wa.tone, variant: wa.variant,
        firmName: state.settings.firmName,
        // Off unless the sender asks. The description is the client's own copy
        // and can run to a page — see descriptionBlock() in matching.js.
        includeDescription: !!wa.withDescription,
      })
    }
    // No property attached is a normal case — a plain follow-up. Returning ''
    // here left the composer blank with a dead Send button.
    // Language, tone and wording-variant belong to the WhatsApp feature, not to
    // the property branch of it — a follow-up with no listing attached is still
    // being sent in Marathi if that is what the agent chose.
    return lead ? followUpMessage(lead, state.settings.firmName, {
      whatsappIntroTemplate: state.settings.whatsappIntroTemplate,
    }) : ''
  }, [state.cache, state.settings.firmName, state.settings.whatsappIntroTemplate])

  const openWhatsApp = useCallback((propId, leadId) => {
    // The composer opens in the language this person writes in, not a fixed one.
    // An agent who works in Marathi shouldn't re-pick it on every message.
    const wa = {
      propId, leadId, variant: 0,
      lang: getPref('msgLang', 'Hinglish'),
      tone: getPref('msgTone', 'Standard'),
    }
    dispatch({ type: 'WA_OPEN', wa })
    dispatch({ type: 'WA_SET', patch: { composing: false, message: composeFor(wa) } })
  }, [composeFor])

  const recompose = useCallback((patch) => {
    const wa = { ...state.waState, ...patch }
    dispatch({ type: 'WA_SET', patch: { ...patch, composing: false, message: composeFor(wa) } })
  }, [state.waState, composeFor])

  // ── Writes ──────────────────────────────────────────────────────────────
  // A write is not finished until the server says it is. Every mutation below
  // used to dispatch, toast success, and hand the API rejection to
  // `console.warn` — so a request the server refused looked identical to one it
  // accepted, and the change quietly disappeared on the next reload. That is
  // the worst failure mode a CRM can have: it tells someone their work is saved
  // when it is not.
  //
  // There are exactly two shapes now, and no third:
  //
  //   write(...)      — server first. Nothing moves on screen until it confirms.
  //   optimistic(...) — paint first, undo on failure. Reserved for the two
  //                     interactions where the round trip is actually felt:
  //                     dragging a lead between stages and ticking a follow-up.
  // The api client throws Error("API Error: 403 Forbidden — <server message>").
  // A 403 on updateLead carries the one sentence that matters — why a sales
  // executive can't rewrite this field — and wrapping it in "API Error: 403
  // Forbidden —" is exactly the wrapper that hid it. Same fix Team.jsx already
  // applies to its own errors; this is the store-wide equivalent, so every
  // write (not just user management) shows the server's own words verbatim.
  const cleanErrMsg = (err) => {
    const m = String(err?.message || '')
    const i = m.indexOf('—')
    return i >= 0 ? m.slice(i + 1).trim() : (m.replace(/^API Error:\s*/, '') || '')
  }
  const failed = useCallback((err, what) => {
    console.warn(`[${what}]`, err?.message || err)
    toast(cleanErrMsg(err) || `Could not save — ${what} failed`, 'warn')
  }, [toast])

  // A 200 carrying `success: false` is still a refusal. Treat it as one.
  const rejected = (res) => res && res.success === false

  const write = useCallback((what, call, apply, okMsg) => call()
    .then(res => {
      if (rejected(res)) throw new Error(res.error || 'rejected')
      if (apply) apply(res)
      if (okMsg) toast(okMsg)
      return res
    })
    .catch(err => { failed(err, what); return null }), [failed, toast])

  const optimistic = useCallback((what, apply, revert, call, okMsg) => {
    apply()
    if (okMsg) toast(okMsg)
    return call()
      .then(res => {
        if (rejected(res)) throw new Error(res.error || 'rejected')
        return res
      })
      .catch(err => { revert(); failed(err, what); return null })
  }, [failed, toast])

  const api = {
    state, dispatch, toast,
    // No invented fallback agent. A hardcoded name and phone number here is a
    // real person's contact details shown for an id we could not resolve.
    // Resolves people who have LEFT as well, flagged `departed`. Without that
    // fallback a lead belonging to someone who quit rendered as "Unassigned" —
    // which is a different fact, and the one that made the Unassigned pill
    // disagree with the rows underneath it.
    agentById: (id) => (id && (state.agents.find(a => a.id === id)
      || state.formerAgents.find(a => a.id === id))) || null,
    me: () => state.agents.find(a => a.id === state.activeAgentId) || state.agents[0] || null,
    activeAgents: () => state.agents.filter(a => !state.inactiveAgentIds.includes(a.id)),
    
    // ── Records ───────────────────────────────────────────────────────────
    // Look a record up. The cache holds what the app has already shown — every
    // row the server hands to a list lands there — so this answers without a
    // request in the overwhelmingly common case. A miss is a normal outcome,
    // not an error: useRecord() fetches that one record by id.
    lookup: (kind, id) => (id && state.cache?.[kind]?.[id]) || null,
    cacheRecords: (kind, records) => dispatch({ type: 'CACHE_RECORDS', kind, records }),

    assign: (leadId, agentId) => {
      const a = state.agents.find(x => x.id === agentId)
      return write('Assign',
        () => apiClient.updateLead(leadId, { agentId }),
        () => dispatch({ type: 'ASSIGN', leadId, agentId }),
        'Lead assigned to ' + (a ? a.first : ''))
    },
    updateLead: (leadId, patch) => write('Update lead',
      () => apiClient.updateLead(leadId, patch),
      () => dispatch({ type: 'UPDATE_LEAD', leadId, patch }),
      'Lead details updated'),
    updateProp: (propId, patch) => write('Update property',
      () => apiClient.updateProperty(propId, patch),
      () => dispatch({ type: 'UPDATE_PROP', propId, patch }),
      'Property details updated'),
    // Optimistic: a stage change is a drag, and a card that hangs mid-air until
    // the server answers reads as a broken drag. It snaps back if the write is
    // refused — to the stage it actually had, read before the dispatch.
    setStage: (leadId, stage) => {
      const prev = api.lookup('lead', leadId)?.stage
      return optimistic('Stage change',
        () => dispatch({ type: 'STAGE', leadId, stage }),
        () => { if (prev) dispatch({ type: 'STAGE', leadId, stage: prev }) },
        () => apiClient.changeStage(leadId, stage, 'Stage updated via CRM view'),
        'Stage → ' + stage)
    },
    // Optimistic for the same reason: this is a tick on a row the agent is
    // working through, and the tick has to land under the finger.
    setFollowUp: (leadId, followUp) => {
      const prev = api.lookup('lead', leadId)?.followUp ?? null
      return optimistic('Follow-up',
        () => dispatch({ type: 'FOLLOWUP', leadId, followUp }),
        () => dispatch({ type: 'FOLLOWUP', leadId, followUp: prev }),
        () => apiClient.updateLead(leadId, { followUp }),
        'Follow-up set — added to calendar')
    },
    // `addNote` and `logEvent` used to dispatch a timeline entry into local
    // React state and toast "Call logged" — with no request behind either. The
    // entry was gone on the next reload and no teammate ever saw it. Both now
    // go through the same persisted remark thread everything else uses.
    addNote: (leadId, text) => api.addRemark('lead', leadId, text),
    logEvent: (id, kind, text) => api.addRemark(kind === 'property' ? 'property' : 'lead', id, text),
    merge: (leadId) => {
      const primaryId = api.lookup('lead', leadId)?.duplicateOf
      if (!primaryId) { toast('No duplicate recorded for this lead', 'warn'); return Promise.resolve(null) }
      return write('Merge',
        () => apiClient.mergeRecords(primaryId, leadId, 'combine_timeline'),
        () => dispatch({ type: 'MERGE', leadId, primaryId }),
        'Merged into one record')
    },
    // Remark thread (B1) — real persistence, not the old client-only note echo.
    // kind = 'lead' | 'property' | 'owner'.
    addRemark: (kind, id, text) => {
      apiClient.addRemark(id, text)
        .then(res => {
          if (res?.success && res.timeline_event) { dispatch({ type: 'ADD_TIMELINE_EVENT', kind, id, event: res.timeline_event }); toast('Remark added') }
          else toast('Could not save the remark', 'warn')
        })
        .catch(err => { console.warn('[Remark API] error:', err.message); toast('Could not save the remark — try again', 'warn') })
    },
    editRemark: (kind, id, eventId, text, outcome) => {
      apiClient.editRemark(id, eventId, text, outcome)
        .then(res => {
          if (res?.success) { dispatch({ type: 'EDIT_TIMELINE_EVENT', kind, id, eventId, text: res.timeline_event.label, outcome }); toast('Saved') }
          else toast('Could not save the edit', 'warn')
        })
        .catch(err => { console.warn('[Remark edit API] error:', err.message); toast('Could not save the edit — try again', 'warn') })
    },
    // B5 — confirm-then-log a call/message on any record. Returns the created
    // event so the caller can immediately offer "add outcome & remark" (via
    // editRemark above) without a second round trip to find its id.
    logContactAction: (kind, id, channel) => new Promise((resolve) => {
      apiClient.logContactAction(id, channel)
        .then(res => {
          if (res?.success && res.timeline_event) dispatch({ type: 'ADD_TIMELINE_EVENT', kind, id, event: res.timeline_event })
          resolve(res)
        })
        .catch(err => { console.warn('[Contact log API] error:', err.message); resolve(null) })
    }),
    // B4 — log a structured activity (site visit with proof, meeting, …) on a
    // LEAD. Unlike the optimistic patterns above this reloads from the server
    // rather than patching local state: the row the client can build is not
    // the row the server returns (photo visibility is role-gated and
    // distance-to-property is computed server-side), so echoing a guess would
    // show the author something no one else can see.
    logActivity: (leadId, payload) => new Promise((resolve) => {
      apiClient.logActivity(leadId, payload)
        .then(res => {
          if (res?.success) { loadServerState(); resolve(res) }
          else { toast('Could not log the visit', 'warn'); resolve(null) }
        })
        .catch(err => {
          console.warn('[Activity API] error:', err.message)
          toast(err.message || 'Could not log the visit — try again', 'warn')
          resolve(null)
        })
    }),
    // `shortlist` is REPLACED by the server, not appended to (store.ts syncs the
    // lead_shortlist table to exactly what it receives). The old call sent
    // `{ shortlist: [propId] }`, so shortlisting a second property deleted the
    // first one server-side while local state showed both — the divergence only
    // became visible after a reload, which is why nobody caught it. Send the
    // whole list, every time.
    attachProp: (leadId, propId, label) => {
      const cur = api.lookup('lead', leadId)?.shortlist || []
      if (cur.includes(propId)) { toast('Already on this lead’s shortlist'); return Promise.resolve(null) }
      return write('Shortlist',
        () => apiClient.updateLead(leadId, { shortlist: [...cur, propId] }),
        () => dispatch({ type: 'ATTACH_PROP', leadId, propId, label }),
        'Property shortlisted for this lead')
    },
    detachProp: (leadId, propId) => {
      const cur = api.lookup('lead', leadId)?.shortlist || []
      return write('Remove from shortlist',
        () => apiClient.updateLead(leadId, { shortlist: cur.filter(x => x !== propId) }),
        () => dispatch({ type: 'DETACH_PROP', leadId, propId }))
    },
    // Visit feedback was purely local — the verdict that is supposed to refine
    // this lead's matches never reached the server, so it was forgotten on
    // reload and no teammate ever saw why a flat was rejected.
    visitFeedback: (leadId, propId, verdict, reason, society) => {
      const lead = api.lookup('lead', leadId)
      const feedback = { ...(lead?.feedback || {}), [propId]: { verdict, reason: reason || null } }
      const cur = lead?.shortlist || []
      return write('Visit feedback',
        () => apiClient.updateLead(leadId, { feedback, shortlist: cur.includes(propId) ? cur : [...cur, propId] }),
        () => dispatch({ type: 'VISIT_FEEDBACK', leadId, propId, verdict, reason, society }),
        verdict === 'liked' ? 'Marked as liked' : 'Rejection logged — refines matches')
    },
    // Same reason `addProperty` below resolves the server's row: the form data
    // carries no id (the server mints it), so an optimistic prepend produced an
    // unclickable card that then duplicated against the real row on hydrate.
    addLead: (lead) => write('Add lead',
      () => apiClient.createLead(lead),
      (res) => {
        const created = res?.data || res?.lead || res?.record || null
        dispatch({ type: 'ADD_LEAD', lead: created?.id ? created : lead })
      },
      'Lead saved — routed'),
    // Resolves the SERVER's record, not the payload we sent. The old version
    // optimistically prepended the raw form data, which carries no id — the
    // server mints it — so the card was unclickable (open(undefined)) and
    // duplicated against the real row on the next hydrate. It also toasted
    // success and let the caller close on a failed request, losing the entry.
    addProperty: (property) => new Promise((resolve) => {
      apiClient.createProperty(property)
        .then(res => {
          const created = res?.data || res?.property || null
          if (created?.id) {
            dispatch({ type: 'ADD_PROPERTY', property: created })
            toast('Property added — now matching against your leads')
            resolve(created)
          } else {
            toast('Could not save the property', 'warn')
            resolve(null)
          }
        })
        .catch(err => {
          console.warn('[AddProp API] Backend error:', err.message)
          toast(err.message || 'Could not save the property — try again', 'warn')
          resolve(null)
        })
    }),
    // Bulk-add many units at once — one revertable batch, logged to Import history.
    // Bulk-add many units at once. Only the rows the server actually accepted
    // are added to the batch, so the Import-history entry says how many units
    // exist rather than how many were attempted — and a partial failure is
    // stated instead of hidden behind a "24 units added" toast.
    addProperties: (properties) => {
      if (!properties?.length) return Promise.resolve([])
      return Promise.allSettled(properties.map(p => apiClient.createProperty(p).then(res => {
        const created = res?.data || res?.property || null
        if (!created?.id) throw new Error(res?.error || 'rejected')
        return created
      })))
        .then(results => {
          const made = results.filter(r => r.status === 'fulfilled').map(r => r.value)
          const lost = results.length - made.length
          if (made.length) dispatch({ type: 'ADD_PROPERTIES', properties: made })
          const batchId = properties[0]?.importBatchId
          if (batchId && made.length) {
            const project = properties[0].project || properties[0].society || 'Project'
            dispatch({ type: 'LOG_IMPORT_BATCH', logEntry: {
              batchId, timestamp: Date.now(), fileName: `Added ${made.length} unit(s) to ${project}`,
              module: 'Properties', addedCount: made.length, mergedCount: 0, mergedDetails: [], reverted: false,
            } })
          }
          if (lost) toast(`${made.length} of ${results.length} units added — ${lost} failed`, 'warn')
          else toast(`${made.length} unit${made.length > 1 ? 's' : ''} added`)
          return made
        })
    },
    // Owner cold-calling list. `addOwner` mirrors addLead; import uses this
    // one row at a time (owners import at seed scale, not township scale).
    addOwner: (owner) => write('Add owner',
      () => apiClient.createOwner(owner),
      (res) => {
        const created = res?.owner || null
        dispatch({ type: 'ADD_OWNER', owner: created?.id ? created : owner })
      },
      null),
    setOwnerStage: (id, stage) => write('Status change',
      () => apiClient.updateOwner(id, { stage }),
      () => dispatch({ type: 'SET_OWNER_STAGE', id, stage }),
      'Status → ' + stage),
    updateOwner: (id, patch) => write('Update owner',
      () => apiClient.updateOwner(id, patch),
      () => dispatch({ type: 'UPDATE_OWNER', id, patch }),
      'Owner details updated'),
    // A callback is one moment, so it travels as one ISO timestamp — not the
    // lead follow-up's {date,time,action}, where 'Today' is a display string
    // the server has to guess a date from. Setting the status to Callback is
    // part of scheduling one: the two disagreeing is what made "Callback" mean
    // nothing. Passing `at: null` clears both.
    setOwnerCallback: (id, at, note) => {
      const patch = at
        ? { callbackAt: at, callbackNote: note || null, stage: 'Callback' }
        : { callbackAt: null, callbackNote: null }
      return write('Schedule callback',
        () => apiClient.updateOwner(id, patch),
        () => dispatch({ type: 'UPDATE_OWNER', id, patch }),
        at ? 'Callback scheduled' : 'Callback cleared')
    },
    deleteOwner: (ids) => api.deleteMany('owner', ids),
    // A partial delete is the outcome that has to be reported honestly: five of
    // six rows gone is neither "deleted" nor "failed", and the old version
    // toasted success unconditionally while dropping every rejection.
    deleteLead: (ids) => api.deleteMany('lead', ids),
    deleteProperty: (ids) => api.deleteMany('property', ids),
    deleteMany: (kind, ids) => {
      const list = Array.isArray(ids) ? ids : [ids]
      const call = kind === 'lead' ? apiClient.deleteLead : kind === 'owner' ? apiClient.deleteOwner : apiClient.deleteProperty
      const noun = kind === 'lead' ? 'Lead' : kind === 'owner' ? 'Owner' : 'Property'
      const actionType = kind === 'lead' ? 'DELETE_LEADS' : kind === 'owner' ? 'DELETE_OWNERS' : 'DELETE_PROPERTIES'
      return Promise.allSettled(list.map(id => call(id).then(res => {
        if (rejected(res)) throw new Error(res.error || 'rejected')
        return id
      })))
        .then(results => {
          const gone = results.filter(r => r.status === 'fulfilled').map(r => r.value)
          const lost = results.length - gone.length
          if (gone.length) dispatch({ type: actionType, ids: gone })
          if (lost) toast(`${lost} of ${results.length} could not be deleted`, 'warn')
          else toast(`${noun} record${gone.length > 1 ? 's' : ''} deleted`)
          return gone
        })
    },
    // The batch is deleted where it lives. The old version scanned the
    // in-memory collections for matching ids and fired a delete per row — which
    // meant it could only ever revert what the browser happened to be holding,
    // and reverted nothing at all once those arrays went away.
    revertImportBatch: (batchId) => write('Revert import',
      () => apiClient.revertImportBatch(batchId),
      () => dispatch({ type: 'REVERT_IMPORT_BATCH', batchId }),
      'Import batch reverted — imported records removed'),
    logImportBatch: (logEntry) => {
      dispatch({ type: 'LOG_IMPORT_BATCH', logEntry })
    },
    setPropStatus: (propId, status) => write('Status change',
      () => apiClient.updateProperty(propId, { status }),
      () => dispatch({ type: 'PROP_STATUS', propId, status }),
      'Status → ' + status),
    setTenancy: (propId, tenancy) => write('Tenancy',
      () => apiClient.updateProperty(propId, { tenancy, status: tenancy ? 'Leased' : 'Available' }),
      () => dispatch({ type: 'SET_TENANCY', propId, tenancy }),
      tenancy ? 'Tenancy saved' : 'Flat freed'),
    returnDeposit: (propId) => write('Deposit',
      () => apiClient.updateProperty(propId, { depositReturned: true }),
      () => dispatch({ type: 'RETURN_DEPOSIT', propId }),
      'Deposit marked returned'),
    toggleAgent: (agentId) => {
      const isOff = !state.inactiveAgentIds.includes(agentId)
      return write('Duty status',
        () => apiClient.updateAgentStatus(agentId, isOff ? 'OFF_DUTY' : 'ACTIVE'),
        () => dispatch({ type: 'TOGGLE_AGENT', agentId }))
    },
    reassignAll: (fromId, toId) => write('Reassign',
      () => apiClient.reassignLeads(fromId, toId),
      () => dispatch({ type: 'REASSIGN_ALL', fromId, toId })),
    // Real teammate creation — the server makes a login-capable user, so we take
    // the server's roster as truth rather than an optimistic local guess.
    // Create a login-capable teammate (password auth). Resolves to the API
    // response (carrying loginId + initialPassword to hand over), or false.
    addAgent: (details) => {
      const payload = typeof details === 'string' ? { name: details, role: 'agent' } : details
      return apiClient.createUser(payload)
        .then(res => {
          if (res?.success) {
            if (res.agents) dispatch({ type: 'SET', patch: { agents: res.agents } })
            toast(`${payload.name?.split(' ')[0] || 'Teammate'} added`)
            return res
          }
          throw new Error(res?.error || 'unexpected response')
        })
        .catch(err => { console.warn('[Add Agent API] error:', err.message); toast(err.message || 'Could not add teammate', 'warn'); return false })
    },
    setFirmName: (name) => write('Firm name',
      () => apiClient.updateSettings({ firmName: name }),
      () => dispatch({ type: 'SET_FIRM_NAME', name }),
      'Firm name updated'),
    addStage: (name) => write('Add stage',
      () => apiClient.updateSettings({ stages: [...state.settings.stages, name] }),
      () => dispatch({ type: 'ADD_STAGE', name }),
      'Stage added'),
    renameStage: (from, to) => write('Rename stage',
      () => apiClient.updateSettings({ stages: state.settings.stages.map(s => s === from ? to : s), renameStage: { from, to } }),
      () => dispatch({ type: 'RENAME_STAGE', from, to }),
      'Stage renamed — leads moved'),
    removeStage: (name) => write('Remove stage',
      () => apiClient.updateSettings({ stages: state.settings.stages.filter(s => s !== name) }),
      () => dispatch({ type: 'REMOVE_STAGE', name }),
      'Stage removed'),
    moveStage: (name, dir) => {
      const arr = [...state.settings.stages]
      const idx = arr.indexOf(name)
      if (idx === -1 || idx + dir < 0 || idx + dir >= arr.length) return Promise.resolve(null)
      const [removed] = arr.splice(idx, 1)
      arr.splice(idx + dir, 0, removed)
      return write('Reorder stages',
        () => apiClient.updateSettings({ stages: arr }),
        () => dispatch({ type: 'MOVE_STAGE', name, dir }))
    },
    // Calling statuses. Same three edits as lead stages, against
    // settings.ownerStages — one generic writer instead of three near-copies,
    // because the two terminal statuses are locked and everything else is just
    // an array of strings the queue reads. `renameOwnerStage` moves the rows on
    // the old status with it, exactly as renaming a lead stage does.
    setOwnerStages: (next, note, rename) => write('Calling statuses',
      () => apiClient.updateSettings({ ownerStages: next, ...(rename ? { renameOwnerStage: rename } : {}) }),
      () => dispatch({ type: 'PATCH_SETTINGS', patch: { ownerStages: next } }),
      note),
    // Generic settings patch — persists any key (slaHours, reminderDays, currency, …).
    patchSettings: (patch, note) => write('Settings',
      () => apiClient.updateSettings(patch),
      () => dispatch({ type: 'PATCH_SETTINGS', patch }),
      note),
    // Tenant brand (accent, logo) — the single source shared with the PWA icons.
    updateBrand: (patch, note) => write('Brand',
      () => apiClient.updateBrand(patch),
      () => dispatch({ type: 'SET_BRAND', patch }),
      note),
    // Lead routing — backend round-robins new leads across active_agent_ids.
    setRouting: (patch, note) => write('Routing',
      () => apiClient.updateRouting(patch),
      () => dispatch({ type: 'SET_ROUTING', patch }),
      note),
    openModal: (modal) => dispatch({ type: 'SET', patch: { modal } }),
    closeModal: () => dispatch({ type: 'SET', patch: { modal: null } }),
    // Re-pull the whole desk from the server (used after user-management edits so
    // the roster reflects a suspend / delete / seat-swap immediately).
    reloadServer: loadServerState,
    openWhatsApp, recompose,
    closeWhatsApp: () => dispatch({ type: 'WA_CLOSE' }),
    setSearch: (v) => dispatch({ type: 'SET', patch: { searchOpen: v } }),
    setNotif: (v) => {
      dispatch({ type: 'SET', patch: { notifOpen: v } })
      if (v) loadNotifications() // refresh the feed whenever the drawer opens
    },
    loadNotifications,
    markAllNotifsRead: () => {
      dispatch({ type: 'MARK_NOTIFS_READ' })
      apiClient.markAllNotificationsRead().catch(err => console.warn('[Notifications] mark-all failed:', err.message))
    },
    setRole: (role) => dispatch({ type: 'ROLE', role }),
    login: (payload) => {
      dispatch({ type: 'LOGIN', payload })
      // Re-fetch under the just-authenticated tenant so the desk shows THIS
      // firm's data (empty for a new tenant), not whatever loaded for the
      // default tenant before login.
      loadServerState()
      setTimeout(loadNotifications, 0)
    },
    logout: () => {
      apiClient.logout?.()          // revoke the server session (best-effort)
      apiClient.clearToken?.()
      if (typeof window !== 'undefined') {
        try {
          window.localStorage?.removeItem('crm_auth_session')
          const currentSlug = slugFromLocation() || window.localStorage?.getItem('crm_tenant_id')
          if (currentSlug) {
            window.history.replaceState({}, document.title, `/${currentSlug}`)
          }
        } catch (e) {}
      }
      dispatch({ type: 'LOGOUT' })
      toast('Signed out successfully')
    },
    // Called AFTER the backend has provisioned the tenant (Onboarding.jsx made
    // the real call + stored the owner token). Point at the new tenant, enter an
    // authenticated session, and hydrate its (empty) state — no demo data bleed.
    onboardTenant: (config) => {
      if (config.tenantId) apiClient.setTenantId(config.tenantId)
      dispatch({ type: 'ONBOARD_TENANT', config })
      toast(`${config.firmName || 'Workspace'} is ready`)
      apiClient.getBootstrap()
        .then(res => { if (res?.success && res.state) dispatch({ type: 'HYDRATE_SERVER', state: res.state }) })
        .catch(err => console.warn('[Onboard hydrate] error:', err.message))
    },
    resetDatabase: () => {
      dispatch({ type: 'RESET' })
      toast('Database reset to clean default dataset')
      apiClient.resetDatabase()
        .then(res => {
          if (res && res.success && res.state) {
            dispatch({ type: 'HYDRATE_SERVER', state: res.state })
          }
        })
        .catch(err => console.error('[Reset API] Backend error:', err.message))
    },
  }

  return <StoreCtx.Provider value={api}>{children}</StoreCtx.Provider>
}
