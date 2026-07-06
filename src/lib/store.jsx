// ============================================================================
// In-memory app store (React context). No backend — resets on refresh.
// Holds all state + actions the demo needs to actually work (F1–F19).
// ============================================================================
import { createContext, useContext, useReducer, useCallback, useRef } from 'react'
import { agents as seedAgents, properties as seedProps, leads as seedLeads, generateMessage } from '../data/seed.js'
import { initials, demoPhone } from './format.js'

const StoreCtx = createContext(null)
export const useStore = () => useContext(StoreCtx)

const clone = (x) => JSON.parse(JSON.stringify(x))

const initial = {
  role: 'admin',                 // 'admin' (owner desktop) | 'agent' (mobile)
  activeAgentId: 'a1',           // who "I" am in agent view
  loggedIn: false,
  agents: clone(seedAgents),
  properties: clone(seedProps),
  leads: clone(seedLeads),
  inactiveAgentIds: [],
  toasts: [],
  // modal/overlay state
  modal: null,                   // {kind, ...}
  waState: null,                 // {propId, leadId, lang, tone, variant, composing, message}
  searchOpen: false,
  notifOpen: false,
}

let _toastSeq = 0

function reducer(state, action) {
  switch (action.type) {
    case 'SET': return { ...state, ...action.patch }

    case 'LOGIN': return { ...state, loggedIn: true }

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

    case 'WA_OPEN':
      return { ...state, waState: { ...action.wa, composing: true, message: null } }
    case 'WA_SET':
      return { ...state, waState: state.waState ? { ...state.waState, ...action.patch } : null }
    case 'WA_CLOSE':
      return { ...state, waState: null }

    default: return state
  }
}

export function StoreProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, initial)
  const timers = useRef({})

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
    merge: (leadId) => { dispatch({ type: 'MERGE', leadId }); toast('Merged into one record') },
    attachProp: (leadId, propId, label) => { dispatch({ type: 'ATTACH_PROP', leadId, propId, label }); toast('Property shortlisted for this lead') },
    detachProp: (leadId, propId) => dispatch({ type: 'DETACH_PROP', leadId, propId }),
    addLead: (lead) => { dispatch({ type: 'ADD_LEAD', lead }); toast('Lead saved — routed') },
    addProperty: (property) => { dispatch({ type: 'ADD_PROPERTY', property }); toast('Property added — now matchable') },
    setPropStatus: (propId, status) => { dispatch({ type: 'PROP_STATUS', propId, status }); toast('Status → ' + status) },
    toggleAgent: (agentId) => dispatch({ type: 'TOGGLE_AGENT', agentId }),
    reassignAll: (fromId, toId) => { dispatch({ type: 'REASSIGN_ALL', fromId, toId }) },
    addAgent: (name) => { dispatch({ type: 'ADD_AGENT', name }); toast('Agent added to team') },
    openModal: (modal) => dispatch({ type: 'SET', patch: { modal } }),
    closeModal: () => dispatch({ type: 'SET', patch: { modal: null } }),
    openWhatsApp, recompose,
    closeWhatsApp: () => dispatch({ type: 'WA_CLOSE' }),
    setSearch: (v) => dispatch({ type: 'SET', patch: { searchOpen: v } }),
    setNotif: (v) => dispatch({ type: 'SET', patch: { notifOpen: v } }),
    setRole: (role) => dispatch({ type: 'ROLE', role }),
    login: () => dispatch({ type: 'LOGIN' }),
    demoPhone,
  }

  return <StoreCtx.Provider value={api}>{children}</StoreCtx.Provider>
}
