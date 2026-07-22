// ============================================================================
// App store (React context). Powered by live backend REST API.
// Durable data (agents/properties/leads/settings) is hydrated from server and
// mutated via Express backend endpoints. Transient UI is managed in React state.
// ============================================================================
import { createContext, useContext, useReducer, useCallback, useRef, useEffect } from 'react'
import { DEFAULT_SETTINGS, PROTECTED_STAGES } from '../data/theme.js'
import { initials } from './format.js'
import { generateMessage } from './matching.js'
import { api as apiClient } from './api.js'
import { defaultAgents, defaultProperties, defaultLeads } from '../data/defaultDataset.js'

const StoreCtx = createContext(null)
export const useStore = () => useContext(StoreCtx)

const clone = (x) => JSON.parse(JSON.stringify(x))

function loadAuthSession() {
  if (typeof window === 'undefined' || !window.localStorage) return { loggedIn: false }
  try {
    const raw = window.localStorage.getItem('crm_auth_session')
    if (raw) {
      const p = JSON.parse(raw)
      return {
        loggedIn: Boolean(p.loggedIn),
        role: p.role || 'admin',
        activeAgentId: p.activeAgentId || 'a1',
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
  return {
    role: session.role || 'admin',                 // 'admin' (owner desktop) | 'agent' (mobile)
    activeAgentId: session.activeAgentId || 'a1',           // who "I" am in agent view
    loggedIn: session.loggedIn || false,
    agents: clone(defaultAgents),
    properties: clone(defaultProperties),
    leads: clone(defaultLeads),
    importLogs: [],
    inactiveAgentIds: [],
    settings: clone(DEFAULT_SETTINGS),   // editable: firmName, stages, sources, slaHours, reminderDays
    routing: { strategy: 'round_robin', active_agent_ids: ['a1', 'a2', 'a3'] },
    integrations: {
      '99acres': { status: 'unconfigured', webhookUrl: 'https://api.bhumipropcity.com/v1/ingest/bhumi-propcity/99acres', secret: '' },
      'MagicBricks': { status: 'unconfigured', webhookUrl: 'https://api.bhumipropcity.com/v1/ingest/bhumi-propcity/magicbricks', secret: '' },
      'Calling & SMS': { status: 'unconfigured', apiKey: '', sid: '', callerId: '' },
      'WhatsApp Business API': { status: 'unconfigured', phoneId: '', accessToken: '', wabaId: '' },
      'Website sync': { status: 'unconfigured', webhookUrl: 'https://api.bhumipropcity.com/v1/ingest/bhumi-propcity/website', secret: '' },
    },
    toasts: [],
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
      return {
        ...state,
        agents: s.agents && s.agents.length > 0 ? s.agents : state.agents,
        properties: s.properties && s.properties.length > 0 ? s.properties : state.properties,
        leads: s.leads && s.leads.length > 0 ? s.leads : state.leads,
        settings: s.settings ? { ...state.settings, ...s.settings } : state.settings,
        routing: s.routing_rules ? { ...state.routing, ...s.routing_rules } : state.routing,
        integrations: s.integrations ? { ...state.integrations, ...s.integrations } : state.integrations,
      }
    }

    case 'PATCH_SETTINGS': return { ...state, settings: { ...state.settings, ...action.patch } }
    case 'SET_ROUTING': return { ...state, routing: { ...state.routing, ...action.patch } }

    case 'SET': return { ...state, ...action.patch }

    case 'LOGIN': {
      persistAuthSession({ loggedIn: true, role: state.role, activeAgentId: state.activeAgentId })
      return { ...state, loggedIn: true }
    }

    case 'LOGOUT': {
      clearAuthSession()
      return { ...state, loggedIn: false }
    }

    case 'ONBOARD_TENANT': {
      const { firmName, city } = action.config || {}
      persistAuthSession({ loggedIn: true, role: state.role, activeAgentId: state.activeAgentId })
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
      // fu === null means "marked done" — clearing the appointment, not setting one.
      const fu = action.followUp
      const label = fu ? `Follow-up set · ${fu.action}` : 'Appointment completed'
      return {
        ...state,
        leads: state.leads.map(l => l.id === action.leadId
          ? { ...l, followUp: fu, overdue: false, timeline: [{ type: 'follow', label, ago: 'just now' }, ...(l.timeline || [])] }
          : l),
      }
    }

    case 'UPDATE_LEAD': {
      return {
        ...state,
        leads: state.leads.map(l => l.id === action.leadId ? { ...l, ...action.patch, timeline: [{ type: 'note', label: 'Updated details inline', ago: 'just now' }, ...l.timeline] } : l),
      }
    }

    case 'UPDATE_PROP': {
      return {
        ...state,
        properties: state.properties.map(p => p.id === action.propId ? { ...p, ...action.patch } : p),
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

    case 'ADD_PROPERTIES': {
      return { ...state, properties: [...action.properties, ...state.properties] }
    }

    case 'DELETE_LEADS': {
      const ids = Array.isArray(action.ids) ? action.ids : [action.ids]
      return { ...state, leads: state.leads.filter(l => !ids.includes(l.id)) }
    }

    case 'DELETE_PROPERTIES': {
      const ids = Array.isArray(action.ids) ? action.ids : [action.ids]
      return { ...state, properties: state.properties.filter(p => !ids.includes(p.id)) }
    }

    case 'LOG_IMPORT_BATCH': {
      const logs = state.importLogs || []
      return { ...state, importLogs: [action.logEntry, ...logs] }
    }

    case 'REVERT_IMPORT_BATCH': {
      const { batchId } = action
      return {
        ...state,
        leads: state.leads.filter(l => l.importBatchId !== batchId),
        properties: state.properties.filter(p => p.importBatchId !== batchId),
        importLogs: (state.importLogs || []).map(log => log.batchId === batchId ? { ...log, reverted: true } : log),
      }
    }

    case 'PROP_STATUS': {
      return {
        ...state,
        properties: state.properties.map(p => p.id === action.propId ? { ...p, status: action.status } : p),
      }
    }

    case 'SET_TENANCY': {
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

    case 'SET_FIRM_NAME': {
      const firmName = action.name.trim() || state.settings.firmName
      return { ...state, settings: { ...state.settings, firmName } }
    }
    case 'ADD_STAGE': {
      const name = action.name.trim()
      if (!name || state.settings.stages.includes(name)) return state
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
      const leads = state.leads.map(l => l.stage === from ? { ...l, stage: name } : l)
      return { ...state, settings: { ...state.settings, stages }, leads }
    }
    case 'REMOVE_STAGE': {
      const { name } = action
      if (PROTECTED_STAGES.includes(name)) return state
      const stages = state.settings.stages.filter(s => s !== name)
      const fallback = stages[0] || 'New'
      const leads = state.leads.map(l => l.stage === name ? { ...l, stage: fallback } : l)
      return { ...state, settings: { ...state.settings, stages }, leads }
    }
    case 'MOVE_STAGE': {
      const { name, dir } = action
      const stages = state.settings.stages.slice()
      const i = stages.indexOf(name)
      const j = i + dir
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

    case 'SAVE_INTEGRATION': {
      const current = state.integrations || {}
      const next = { ...current, [action.key]: { ...current[action.key], ...action.config, status: 'active' } }
      return { ...state, integrations: next }
    }

    case 'RESET':
      return { ...freshState(), loggedIn: true }

    default: return state
  }
}

export function StoreProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, initial)
  const timers = useRef({})

  // Hydrate state from backend REST API on mount
  useEffect(() => {
    apiClient.getState()
      .then(res => {
        if (res && res.success && res.state) {
          dispatch({ type: 'HYDRATE_SERVER', state: res.state })
        }
      })
      .catch(err => console.error('[Store Hydration] Failed to connect to PostgreSQL backend:', err.message))
  }, [])

  const toast = useCallback((text, tone) => {
    dispatch({ type: 'TOAST', text, tone })
  }, [])

  const lastToast = state.toasts[state.toasts.length - 1]
  if (lastToast && !timers.current[lastToast.id]) {
    timers.current[lastToast.id] = setTimeout(() => dispatch({ type: 'UNTOAST', id: lastToast.id }), 2600)
  }

  // The message is a TEMPLATE FILLED FROM PROPERTY DATA — not generated text.
  // It resolves synchronously; there is deliberately no artificial delay or
  // "composing" animation, which would imply AI authorship we don't do.
  const composeFor = useCallback((wa) => {
    const prop = state.properties.find(p => p.id === wa.propId)
    return prop ? generateMessage(prop, { lang: wa.lang, tone: wa.tone, variant: wa.variant }) : ''
  }, [state.properties])

  const openWhatsApp = useCallback((propId, leadId) => {
    const wa = { propId, leadId, lang: 'Hinglish', tone: 'Standard', variant: 0 }
    dispatch({ type: 'WA_OPEN', wa })
    dispatch({ type: 'WA_SET', patch: { composing: false, message: composeFor(wa) } })
  }, [composeFor])

  const recompose = useCallback((patch) => {
    const wa = { ...state.waState, ...patch }
    dispatch({ type: 'WA_SET', patch: { ...patch, composing: false, message: composeFor(wa) } })
  }, [state.waState, composeFor])

  const api = {
    state, dispatch, toast,
    agentById: (id) => state.agents.find(a => a.id === id) || { id: id || 'a1', name: 'Rakesh Sethi', first: 'Rakesh', role: 'admin', phone: '+91 98220 41556', initials: 'RS', avatar: '' },
    me: () => state.agents.find(a => a.id === state.activeAgentId) || state.agents[0] || { id: 'a1', name: 'Rakesh Sethi', first: 'Rakesh', role: 'admin', phone: '+91 98220 41556', initials: 'RS', avatar: '' },
    activeAgents: () => state.agents.filter(a => !state.inactiveAgentIds.includes(a.id)),
    
    assign: (leadId, agentId) => {
      dispatch({ type: 'ASSIGN', leadId, agentId })
      const a = state.agents.find(x => x.id === agentId)
      toast('Lead assigned to ' + (a ? a.first : ''))
      apiClient.updateLead(leadId, { agentId }).catch(err => console.warn('[Assign API] Backend error:', err.message))
    },
    updateLead: (leadId, patch) => {
      dispatch({ type: 'UPDATE_LEAD', leadId, patch })
      toast('Lead details updated')
      apiClient.updateLead(leadId, patch).catch(err => console.warn('[UpdateLead API] Backend error:', err.message))
    },
    updateProp: (propId, patch) => {
      dispatch({ type: 'UPDATE_PROP', propId, patch })
      toast('Property details updated')
      apiClient.updateProperty(propId, patch).catch(err => console.warn('[UpdateProp API] Backend error:', err.message))
    },
    setStage: (leadId, stage) => {
      dispatch({ type: 'STAGE', leadId, stage })
      toast('Stage → ' + stage)
      apiClient.changeStage(leadId, stage, 'Stage updated via CRM view').catch(err => console.warn('[Stage API] Backend error:', err.message))
    },
    setFollowUp: (leadId, followUp) => {
      dispatch({ type: 'FOLLOWUP', leadId, followUp })
      toast('Follow-up set — added to calendar')
      apiClient.updateLead(leadId, { followUp }).catch(err => console.warn('[FollowUp API] Backend error:', err.message))
    },
    addNote: (leadId, text, kind) => {
      dispatch({ type: 'NOTE', leadId, text, kind })
      toast(kind === 'call' ? 'Call logged' : 'Note added')
    },
    logEvent: (id, kind, text) => {
      dispatch({ type: 'LOG_EVENT', id, kind, text })
      toast(kind === 'call' ? 'Call logged' : kind === 'wa' ? 'WhatsApp logged' : kind === 'sms' ? 'SMS logged' : 'Note added')
    },
    merge: (leadId) => {
      dispatch({ type: 'MERGE', leadId })
      toast('Merged into one record')
      apiClient.mergeRecords(leadId, leadId, 'combine_timeline').catch(err => console.warn('[Merge API] Backend error:', err.message))
    },
    attachProp: (leadId, propId, label) => {
      dispatch({ type: 'ATTACH_PROP', leadId, propId, label })
      toast('Property shortlisted for this lead')
      apiClient.updateLead(leadId, { shortlist: [propId] }).catch(err => console.warn('[Attach API] Backend error:', err.message))
    },
    visitFeedback: (leadId, propId, verdict, reason, society) => {
      dispatch({ type: 'VISIT_FEEDBACK', leadId, propId, verdict, reason, society })
      toast(verdict === 'liked' ? 'Marked as liked' : 'Rejection logged — refines matches')
    },
    detachProp: (leadId, propId) => dispatch({ type: 'DETACH_PROP', leadId, propId }),
    addLead: (lead) => {
      dispatch({ type: 'ADD_LEAD', lead })
      toast('Lead saved — routed')
      apiClient.createLead(lead).catch(err => console.warn('[AddLead API] Backend error:', err.message))
    },
    addProperty: (property) => {
      dispatch({ type: 'ADD_PROPERTY', property })
      toast('Property added — now matchable')
      apiClient.createProperty(property).catch(err => console.warn('[AddProp API] Backend error:', err.message))
    },
    // Bulk-add many units at once — one revertable batch, logged to Import history.
    addProperties: (properties) => {
      if (!properties?.length) return
      dispatch({ type: 'ADD_PROPERTIES', properties })
      toast(`${properties.length} unit${properties.length > 1 ? 's' : ''} added`)
      const batchId = properties[0]?.importBatchId
      if (batchId) {
        const project = properties[0].project || properties[0].society || 'Project'
        dispatch({ type: 'LOG_IMPORT_BATCH', logEntry: {
          batchId, timestamp: Date.now(), fileName: `Added ${properties.length} unit(s) to ${project}`,
          module: 'Properties', addedCount: properties.length, mergedCount: 0, mergedDetails: [], reverted: false,
        } })
      }
      properties.forEach(p => apiClient.createProperty(p).catch(err => console.warn('[AddUnits API] Backend error:', err.message)))
    },
    deleteLead: (ids) => {
      const list = Array.isArray(ids) ? ids : [ids]
      dispatch({ type: 'DELETE_LEADS', ids })
      toast('Lead/Client record(s) deleted')
      list.forEach(id => apiClient.deleteLead(id).catch(err => console.warn('[DeleteLead API] error:', err.message)))
    },
    deleteProperty: (ids) => {
      const list = Array.isArray(ids) ? ids : [ids]
      dispatch({ type: 'DELETE_PROPERTIES', ids })
      toast('Property record(s) deleted')
      list.forEach(id => apiClient.deleteProperty(id).catch(err => console.warn('[DeleteProp API] error:', err.message)))
    },
    revertImportBatch: (batchId) => {
      // Collect the batch's record ids BEFORE the local state removes them, so we
      // can also delete them on the backend — otherwise they reload on refresh.
      const propIds = state.properties.filter(p => p.importBatchId === batchId).map(p => p.id)
      const leadIds = state.leads.filter(l => l.importBatchId === batchId).map(l => l.id)
      dispatch({ type: 'REVERT_IMPORT_BATCH', batchId })
      toast('Import batch reverted — imported records removed', 'ok')
      propIds.forEach(id => apiClient.deleteProperty(id).catch(err => console.warn('[Revert/Prop API] error:', err.message)))
      leadIds.forEach(id => apiClient.deleteLead(id).catch(err => console.warn('[Revert/Lead API] error:', err.message)))
    },
    logImportBatch: (logEntry) => {
      dispatch({ type: 'LOG_IMPORT_BATCH', logEntry })
    },
    setPropStatus: (propId, status) => {
      dispatch({ type: 'PROP_STATUS', propId, status })
      toast('Status → ' + status)
      apiClient.updateProperty(propId, { status }).catch(err => console.warn('[PropStatus API] Backend error:', err.message))
    },
    setTenancy: (propId, tenancy) => {
      dispatch({ type: 'SET_TENANCY', propId, tenancy })
      toast(tenancy ? 'Tenancy saved' : 'Flat freed')
      apiClient.updateProperty(propId, { tenancy, status: tenancy ? 'Under offer' : 'Available' }).catch(err => console.warn('[Tenancy API] Backend error:', err.message))
    },
    returnDeposit: (propId) => {
      dispatch({ type: 'RETURN_DEPOSIT', propId })
      toast('Deposit marked returned')
      apiClient.updateProperty(propId, { depositReturned: true }).catch(err => console.warn('[ReturnDeposit API] Backend error:', err.message))
    },
    toggleAgent: (agentId) => {
      dispatch({ type: 'TOGGLE_AGENT', agentId })
      const isOff = !state.inactiveAgentIds.includes(agentId)
      apiClient.updateAgentStatus(agentId, isOff ? 'OFF_DUTY' : 'ACTIVE').catch(err => console.warn('[DutyStatus API] Backend error:', err.message))
    },
    reassignAll: (fromId, toId) => {
      dispatch({ type: 'REASSIGN_ALL', fromId, toId })
      apiClient.reassignLeads(fromId, toId).catch(err => console.warn('[Reassign API] Backend error:', err.message))
    },
    addAgent: (name) => {
      dispatch({ type: 'ADD_AGENT', name })
      toast('Agent added to team')
      apiClient.addAgent({ name, role: 'agent' }).catch(err => console.warn('[Add Agent API] error:', err.message))
    },
    setFirmName: (name) => {
      dispatch({ type: 'SET_FIRM_NAME', name })
      toast('Firm name updated')
      apiClient.updateSettings({ firmName: name }).catch(err => console.warn('[Settings API] error:', err.message))
    },
    addStage: (name) => {
      dispatch({ type: 'ADD_STAGE', name })
      toast('Stage added')
      apiClient.updateSettings({ stages: [...state.settings.stages, name] }).catch(err => console.warn('[Settings API] error:', err.message))
    },
    renameStage: (from, to) => {
      dispatch({ type: 'RENAME_STAGE', from, to })
      toast('Stage renamed — leads moved')
      apiClient.updateSettings({ stages: state.settings.stages.map(s => s === from ? to : s) }).catch(err => console.warn('[Settings API] error:', err.message))
    },
    removeStage: (name) => {
      dispatch({ type: 'REMOVE_STAGE', name })
      toast('Stage removed')
      apiClient.updateSettings({ stages: state.settings.stages.filter(s => s !== name) }).catch(err => console.warn('[Settings API] error:', err.message))
    },
    moveStage: (name, dir) => {
      dispatch({ type: 'MOVE_STAGE', name, dir })
      const arr = [...state.settings.stages]
      const idx = arr.indexOf(name)
      if (idx !== -1 && idx + dir >= 0 && idx + dir < arr.length) {
        const [removed] = arr.splice(idx, 1)
        arr.splice(idx + dir, 0, removed)
        apiClient.updateSettings({ stages: arr }).catch(err => console.warn('[Settings API] error:', err.message))
      }
    },
    addSource: (name) => {
      dispatch({ type: 'ADD_SOURCE', name })
      toast('Source added')
      apiClient.updateSettings({ sources: [...state.settings.sources, name] }).catch(err => console.warn('[Settings API] error:', err.message))
    },
    removeSource: (name) => {
      dispatch({ type: 'REMOVE_SOURCE', name })
      toast('Source removed')
      apiClient.updateSettings({ sources: state.settings.sources.filter(s => s !== name) }).catch(err => console.warn('[Settings API] error:', err.message))
    },
    // Generic settings patch — persists any key (slaHours, reminderDays, currency, …).
    patchSettings: (patch, note) => {
      dispatch({ type: 'PATCH_SETTINGS', patch })
      if (note) toast(note)
      apiClient.updateSettings(patch).catch(err => console.warn('[Settings API] error:', err.message))
    },
    // Lead routing — backend round-robins new leads across active_agent_ids.
    setRouting: (patch, note) => {
      dispatch({ type: 'SET_ROUTING', patch })
      if (note) toast(note)
      apiClient.updateRouting(patch).catch(err => console.warn('[Routing API] error:', err.message))
    },
    openModal: (modal) => dispatch({ type: 'SET', patch: { modal } }),
    closeModal: () => dispatch({ type: 'SET', patch: { modal: null } }),
    openWhatsApp, recompose,
    closeWhatsApp: () => dispatch({ type: 'WA_CLOSE' }),
    setSearch: (v) => dispatch({ type: 'SET', patch: { searchOpen: v } }),
    setNotif: (v) => dispatch({ type: 'SET', patch: { notifOpen: v } }),
    setRole: (role) => dispatch({ type: 'ROLE', role }),
    login: () => dispatch({ type: 'LOGIN' }),
    logout: () => {
      if (typeof window !== 'undefined') {
        try {
          window.localStorage?.removeItem('crm_auth_session')
          if (window.location.search) {
            window.history.replaceState({}, document.title, window.location.pathname)
          }
        } catch (e) {}
      }
      dispatch({ type: 'LOGOUT' })
      toast('Signed out successfully')
    },
    onboardTenant: (config) => {
      if (config.slug) apiClient.setTenantId(config.slug)
      dispatch({ type: 'ONBOARD_TENANT', config })
      toast(`Workspace provisioned & initialized for ${config.firmName || 'new tenant'}`)
      apiClient.onboardTenant(config).catch(err => console.warn('[Onboard API] Backend error:', err.message))
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
    saveIntegration: (key, config) => {
      dispatch({ type: 'SAVE_INTEGRATION', key, config })
      toast(`Connected ${key} successfully! Channel active.`)
      apiClient.saveIntegration(key, config).catch(err => console.error('[Integrations API] Backend error:', err.message))
    },
  }

  return <StoreCtx.Provider value={api}>{children}</StoreCtx.Provider>
}
