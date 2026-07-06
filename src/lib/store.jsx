// ============================================================================
// App store (React context). No backend — persisted to localStorage so state
// survives refresh. Durable data (agents/properties/leads/settings) is saved;
// transient UI (toasts/modals/WhatsApp compose) is never persisted.
// Holds all state + actions the demo needs to actually work (F1–F19).
// ============================================================================
import { createContext, useContext, useReducer, useCallback, useRef, useEffect } from 'react'
import { agents as seedAgents, properties as seedProps, leads as seedLeads, generateMessage } from '../data/seed.js'
import { DEFAULT_SETTINGS, PROTECTED_STAGES } from '../data/theme.js'
import { initials, demoPhone } from './format.js'

const StoreCtx = createContext(null)
export const useStore = () => useContext(StoreCtx)

const clone = (x) => JSON.parse(JSON.stringify(x))

// Bump this when the seed shape changes so stale saved state is discarded.
const STORE_KEY = 'bhumi-crm-state-v4'
// Only these fields persist. Transient UI is deliberately excluded.
const DURABLE = ['role', 'activeAgentId', 'loggedIn', 'agents', 'properties', 'leads', 'inactiveAgentIds', 'settings']

function freshState() {
  return {
    role: 'admin',                 // 'admin' (owner desktop) | 'agent' (mobile)
    activeAgentId: 'a1',           // who "I" am in agent view
    loggedIn: false,
    agents: clone(seedAgents),
    properties: clone(seedProps),
    leads: clone(seedLeads),
    inactiveAgentIds: [],
    settings: clone(DEFAULT_SETTINGS),   // editable: firmName, stages, sources
    toasts: [],
    // modal/overlay state (never persisted)
    modal: null,                   // {kind, ...}
    waState: null,                 // {propId, leadId, lang, tone, variant, composing, message}
    searchOpen: false,
    notifOpen: false,
  }
}

function loadState() {
  const base = freshState()
  try {
    const raw = localStorage.getItem(STORE_KEY)
    if (!raw) return base
    const saved = JSON.parse(raw)
    // merge only durable fields over a fresh base (transient stays clean)
    const merged = { ...base }
    for (const k of DURABLE) if (k in saved) merged[k] = saved[k]
    return merged
  } catch { return base }
}

function persist(state) {
  try {
    const out = {}
    for (const k of DURABLE) out[k] = state[k]
    localStorage.setItem(STORE_KEY, JSON.stringify(out))
  } catch { /* storage full / unavailable — demo still works in-memory */ }
}

const initial = freshState()

let _toastSeq = 0

function reducer(state, action) {
  switch (action.type) {
    case 'SET': return { ...state, ...action.patch }

    case 'LOGIN': return { ...state, loggedIn: true }

    case 'ONBOARD_TENANT': {
      const { firmName, city } = action.config || {}
      return {
        ...state,
        loggedIn: true,
        settings: {
          ...state.settings,
          firmName: firmName || state.settings.firmName,
          city: city || 'Pune',
        },
      }
    }

    case 'ROLE': return { ...state, role: action.role }

    case 'TOAST': {
      const t = { id: ++_toastSeq, text: action.text, tone: action.tone || 'ok' }
      return { ...state, toasts: [...state.toasts, t] }
    }
    case 'UNTOAST':
      return { ...state, toasts: state.toasts.filter(t => t.id !== action.id) }

    case 'ASSIGN': {
      const a = state.agents.find(x => x.id === action.agentId)
      return {
        ...state,
        leads: state.leads.map(l => l.id === action.leadId
          ? { ...l, agentId: action.agentId, timeline: [{ type: 'assign', label: 'Assigned to ' + (a ? a.first : ''), ago: 'just now' }, ...l.timeline] }
          : l),
      }
    }

    case 'STAGE': {
      return {
        ...state,
        leads: state.leads.map(l => l.id === action.leadId
          ? { ...l, stage: action.stage, timeline: [{ type: 'stage', label: 'Stage → ' + action.stage, ago: 'just now' }, ...l.timeline] }
          : l),
      }
    }

    case 'FOLLOWUP': {
      const fu = action.followUp
      return {
        ...state,
        leads: state.leads.map(l => l.id === action.leadId
          ? { ...l, followUp: fu, overdue: false, timeline: [{ type: 'follow', label: 'Follow-up set · ' + fu.action, ago: 'just now' }, ...l.timeline] }
          : l),
      }
    }

    case 'NOTE': {
      return {
        ...state,
        leads: state.leads.map(l => l.id === action.leadId
          ? { ...l, timeline: [{ type: action.kind === 'call' ? 'msg' : 'note', label: action.text, ago: 'just now' }, ...l.timeline] }
          : l),
      }
    }

    case 'LOG_EVENT': {
      // Unified activity log — works for a lead OR a property (owner-side timeline).
      const { id, kind, text } = action
      const tlType = kind === 'call' ? 'msg' : kind === 'wa' ? 'msg' : kind === 'sms' ? 'msg' : 'note'
      const entry = { type: tlType, label: text, ago: 'just now' }
      const inLeads = state.leads.some(l => l.id === id)
      if (inLeads) {
        return { ...state, leads: state.leads.map(l => l.id === id ? { ...l, timeline: [entry, ...l.timeline] } : l) }
      }
      return {
        ...state,
        properties: state.properties.map(p => p.id === id ? { ...p, timeline: [entry, ...(p.timeline || [])] } : p),
      }
    }

    case 'MERGE': {
      // drop the duplicate, keep the primary
      const dup = state.leads.find(l => l.id === action.leadId)
      if (!dup || !dup.duplicateOf) return state
      return {
        ...state,
        leads: state.leads
          .filter(l => l.id !== action.leadId)
          .map(l => l.id === dup.duplicateOf
            ? { ...l, timeline: [{ type: 'note', label: 'Merged duplicate from ' + dup.source, ago: 'just now' }, ...l.timeline] }
            : l),
      }
    }

    case 'ATTACH_PROP': {
      return {
        ...state,
        leads: state.leads.map(l => {
          if (l.id !== action.leadId) return l
          const shortlist = l.shortlist || []
          if (shortlist.includes(action.propId)) return l
          return { ...l, shortlist: [action.propId, ...shortlist], timeline: [{ type: 'note', label: 'Shortlisted ' + (action.label || 'a property'), ago: 'just now' }, ...l.timeline] }
        }),
      }
    }
    case 'DETACH_PROP': {
      return {
        ...state,
        leads: state.leads.map(l => l.id === action.leadId ? { ...l, shortlist: (l.shortlist || []).filter(id => id !== action.propId) } : l),
      }
    }

    case 'VISIT_FEEDBACK': {
      const { leadId, propId, verdict, reason, society } = action
      const label = verdict === 'liked'
        ? `Liked ${society} on site visit`
        : `Rejected ${society} — ${reason}`
      return {
        ...state,
        leads: state.leads.map(l => {
          if (l.id !== leadId) return l
          const feedback = { ...(l.feedback || {}), [propId]: { verdict, reason } }
          return { ...l, feedback, timeline: [{ type: verdict === 'liked' ? 'note' : 'note', label, ago: 'just now' }, ...l.timeline] }
        }),
      }
    }

    case 'ADD_LEAD': {
      return { ...state, leads: [action.lead, ...state.leads] }
    }

    case 'ADD_PROPERTY': {
      return { ...state, properties: [action.property, ...state.properties] }
    }

    case 'PROP_STATUS': {
      return {
        ...state,
        properties: state.properties.map(p => p.id === action.propId ? { ...p, status: action.status } : p),
      }
    }

    case 'SET_TENANCY': {
      // Record / update a rental tenancy (tenant, agreement window, deposit).
      // Setting a tenancy marks the flat 'Under offer' (occupied); clearing frees it.
      const { propId, tenancy } = action
      return {
        ...state,
        properties: state.properties.map(p => {
          if (p.id !== propId) return p
          const label = tenancy
            ? `Tenancy set · ${tenancy.tenant} · ${p.priceLabel} · deposit ${tenancy.depositLabel || '—'} held`
            : 'Tenancy cleared — flat available again'
          return {
            ...p,
            tenancy: tenancy || undefined,
            status: tenancy ? 'Under offer' : 'Available',
            timeline: [{ type: 'note', label, ago: 'just now' }, ...(p.timeline || [])],
          }
        }),
      }
    }

    case 'RETURN_DEPOSIT': {
      const { propId } = action
      return {
        ...state,
        properties: state.properties.map(p => {
          if (p.id !== propId || !p.tenancy) return p
          return {
            ...p,
            tenancy: { ...p.tenancy, depositReturned: true },
            timeline: [{ type: 'note', label: `Deposit ${p.tenancy.depositLabel || ''} returned to ${p.tenancy.tenant}`, ago: 'just now' }, ...(p.timeline || [])],
          }
        }),
      }
    }

    case 'TOGGLE_AGENT': {
      const on = state.inactiveAgentIds.includes(action.agentId)
      return {
        ...state,
        inactiveAgentIds: on ? state.inactiveAgentIds.filter(x => x !== action.agentId) : [...state.inactiveAgentIds, action.agentId],
      }
    }

    case 'REASSIGN_ALL': {
      const a = state.agents.find(x => x.id === action.toId)
      return {
        ...state,
        leads: state.leads.map(l => (l.agentId === action.fromId && !l.stage.startsWith('Closed'))
          ? { ...l, agentId: action.toId, timeline: [{ type: 'assign', label: 'Reassigned to ' + (a ? a.first : ''), ago: 'just now' }, ...l.timeline] }
          : l),
      }
    }

    case 'ADD_AGENT': {
      const name = action.name.trim()
      const av = ['av-a1', 'av-a2', 'av-a3', 'av-a4'][state.agents.length % 4]
      const agent = { id: 'anew' + Date.now(), name, first: name.split(' ')[0], initials: initials(name), avatar: av }
      return { ...state, agents: [...state.agents, agent] }
    }

    // ---- Settings (white-label config, now live) ----
    case 'SET_FIRM_NAME': {
      const firmName = action.name.trim() || state.settings.firmName
      return { ...state, settings: { ...state.settings, firmName } }
    }
    case 'ADD_STAGE': {
      const name = action.name.trim()
      if (!name || state.settings.stages.includes(name)) return state
      // insert before the terminal Closed stages so the pipeline stays ordered
      const stages = state.settings.stages.slice()
      const firstClosed = stages.findIndex(s => s.startsWith('Closed'))
      const at = firstClosed === -1 ? stages.length : firstClosed
      stages.splice(at, 0, name)
      return { ...state, settings: { ...state.settings, stages } }
    }
    case 'RENAME_STAGE': {
      const { from, to } = action
      const name = to.trim()
      if (!name || from === name || PROTECTED_STAGES.includes(from)) return state
      if (state.settings.stages.includes(name)) return state
      const stages = state.settings.stages.map(s => s === from ? name : s)
      // migrate every lead sitting on the old label
      const leads = state.leads.map(l => l.stage === from ? { ...l, stage: name } : l)
      return { ...state, settings: { ...state.settings, stages }, leads }
    }
    case 'REMOVE_STAGE': {
      const { name } = action
      if (PROTECTED_STAGES.includes(name)) return state
      const stages = state.settings.stages.filter(s => s !== name)
      // leads on the removed stage fall back to the first stage ("New")
      const fallback = stages[0] || 'New'
      const leads = state.leads.map(l => l.stage === name ? { ...l, stage: fallback } : l)
      return { ...state, settings: { ...state.settings, stages }, leads }
    }
    case 'MOVE_STAGE': {
      const { name, dir } = action   // dir: -1 up, +1 down
      const stages = state.settings.stages.slice()
      const i = stages.indexOf(name)
      const j = i + dir
      // can't move a stage past the terminal Closed block, or off the ends
      if (i < 0 || j < 0 || j >= stages.length) return state
      if (stages[j] && stages[j].startsWith('Closed')) return state
      if (name.startsWith('Closed')) return state
      ;[stages[i], stages[j]] = [stages[j], stages[i]]
      return { ...state, settings: { ...state.settings, stages } }
    }
    case 'ADD_SOURCE': {
      const name = action.name.trim()
      if (!name || state.settings.sources.includes(name)) return state
      return { ...state, settings: { ...state.settings, sources: [...state.settings.sources, name] } }
    }
    case 'REMOVE_SOURCE': {
      return { ...state, settings: { ...state.settings, sources: state.settings.sources.filter(s => s !== action.name) } }
    }

    case 'WA_OPEN':
      return { ...state, waState: { ...action.wa, composing: true, message: null } }
    case 'WA_SET':
      return { ...state, waState: state.waState ? { ...state.waState, ...action.patch } : null }
    case 'WA_CLOSE':
      return { ...state, waState: null }

    case 'RESET':
      return { ...freshState(), loggedIn: true }  // wipe to clean seed, stay logged in

    default: return state
  }
}

export function StoreProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, initial, loadState)
  const timers = useRef({})

  // persist durable state on every change (debounced via microtask coalescing)
  useEffect(() => { persist(state) }, [
    state.role, state.activeAgentId, state.loggedIn,
    state.agents, state.properties, state.leads, state.inactiveAgentIds, state.settings,
  ])

  const toast = useCallback((text, tone) => {
    dispatch({ type: 'TOAST', text, tone })
  }, [])
  // auto-dismiss toasts
  const lastToast = state.toasts[state.toasts.length - 1]
  if (lastToast && !timers.current[lastToast.id]) {
    timers.current[lastToast.id] = setTimeout(() => dispatch({ type: 'UNTOAST', id: lastToast.id }), 2600)
  }

  // ---- WhatsApp generation flow (the signature) ----
  const runCompose = useCallback((wa) => {
    clearTimeout(timers.current.wa)
    const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches
    timers.current.wa = setTimeout(() => {
      const prop = state.properties.find(p => p.id === wa.propId)
      const message = prop ? generateMessage(prop, { lang: wa.lang, tone: wa.tone, variant: wa.variant }) : ''
      dispatch({ type: 'WA_SET', patch: { composing: false, message } })
    }, reduce ? 300 : 1800)
  }, [state.properties])

  const openWhatsApp = useCallback((propId, leadId) => {
    const wa = { propId, leadId, lang: 'Hinglish', tone: 'Standard', variant: 0 }
    dispatch({ type: 'WA_OPEN', wa })
    runCompose(wa)
  }, [runCompose])

  const recompose = useCallback((patch) => {
    dispatch({ type: 'WA_SET', patch: { ...patch, composing: true, message: null } })
    const wa = { ...state.waState, ...patch }
    runCompose(wa)
  }, [state.waState, runCompose])

  const api = {
    state, dispatch, toast,
    // helpers to read
    agentById: (id) => state.agents.find(a => a.id === id),
    me: () => state.agents.find(a => a.id === state.activeAgentId) || state.agents[0],
    activeAgents: () => state.agents.filter(a => !state.inactiveAgentIds.includes(a.id)),
    // actions
    assign: (leadId, agentId) => { dispatch({ type: 'ASSIGN', leadId, agentId }); const a = state.agents.find(x => x.id === agentId); toast('Lead assigned to ' + (a ? a.first : '')) },
    setStage: (leadId, stage) => { dispatch({ type: 'STAGE', leadId, stage }); toast('Stage → ' + stage) },
    setFollowUp: (leadId, followUp) => { dispatch({ type: 'FOLLOWUP', leadId, followUp }); toast('Follow-up set — added to calendar') },
    addNote: (leadId, text, kind) => { dispatch({ type: 'NOTE', leadId, text, kind }); toast(kind === 'call' ? 'Call logged' : 'Note added') },
    logEvent: (id, kind, text) => { dispatch({ type: 'LOG_EVENT', id, kind, text }); toast(kind === 'call' ? 'Call logged' : kind === 'wa' ? 'WhatsApp logged' : kind === 'sms' ? 'SMS logged' : 'Note added') },
    merge: (leadId) => { dispatch({ type: 'MERGE', leadId }); toast('Merged into one record') },
    attachProp: (leadId, propId, label) => { dispatch({ type: 'ATTACH_PROP', leadId, propId, label }); toast('Property shortlisted for this lead') },
    visitFeedback: (leadId, propId, verdict, reason, society) => { dispatch({ type: 'VISIT_FEEDBACK', leadId, propId, verdict, reason, society }); toast(verdict === 'liked' ? 'Marked as liked' : 'Rejection logged — refines matches') },
    detachProp: (leadId, propId) => dispatch({ type: 'DETACH_PROP', leadId, propId }),
    addLead: (lead) => { dispatch({ type: 'ADD_LEAD', lead }); toast('Lead saved — routed') },
    addProperty: (property) => { dispatch({ type: 'ADD_PROPERTY', property }); toast('Property added — now matchable') },
    setPropStatus: (propId, status) => { dispatch({ type: 'PROP_STATUS', propId, status }); toast('Status → ' + status) },
    setTenancy: (propId, tenancy) => { dispatch({ type: 'SET_TENANCY', propId, tenancy }); toast(tenancy ? 'Tenancy saved' : 'Flat freed') },
    returnDeposit: (propId) => { dispatch({ type: 'RETURN_DEPOSIT', propId }); toast('Deposit marked returned') },
    toggleAgent: (agentId) => dispatch({ type: 'TOGGLE_AGENT', agentId }),
    reassignAll: (fromId, toId) => { dispatch({ type: 'REASSIGN_ALL', fromId, toId }) },
    addAgent: (name) => { dispatch({ type: 'ADD_AGENT', name }); toast('Agent added to team') },
    // settings (white-label config)
    setFirmName: (name) => { dispatch({ type: 'SET_FIRM_NAME', name }); toast('Firm name updated') },
    addStage: (name) => { dispatch({ type: 'ADD_STAGE', name }); toast('Stage added') },
    renameStage: (from, to) => { dispatch({ type: 'RENAME_STAGE', from, to }); toast('Stage renamed — leads moved') },
    removeStage: (name) => { dispatch({ type: 'REMOVE_STAGE', name }); toast('Stage removed') },
    moveStage: (name, dir) => dispatch({ type: 'MOVE_STAGE', name, dir }),
    addSource: (name) => { dispatch({ type: 'ADD_SOURCE', name }); toast('Source added') },
    removeSource: (name) => { dispatch({ type: 'REMOVE_SOURCE', name }); toast('Source removed') },
    openModal: (modal) => dispatch({ type: 'SET', patch: { modal } }),
    closeModal: () => dispatch({ type: 'SET', patch: { modal: null } }),
    openWhatsApp, recompose,
    closeWhatsApp: () => dispatch({ type: 'WA_CLOSE' }),
    setSearch: (v) => dispatch({ type: 'SET', patch: { searchOpen: v } }),
    setNotif: (v) => dispatch({ type: 'SET', patch: { notifOpen: v } }),
    setRole: (role) => dispatch({ type: 'ROLE', role }),
    login: () => dispatch({ type: 'LOGIN' }),
    onboardTenant: (config) => {
      dispatch({ type: 'ONBOARD_TENANT', config })
      toast(`Workspace provisioned & initialized for ${config.firmName || 'new tenant'}`)
    },
    resetDemo: () => { dispatch({ type: 'RESET' }); toast('Demo reset to a clean slate') },
    demoPhone,
  }

  return <StoreCtx.Provider value={api}>{children}</StoreCtx.Provider>
}
