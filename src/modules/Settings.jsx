import { useState } from 'react'
import { Panel, SectionHead, StageTag, Button, Input } from '../components/primitives.jsx'
import Icon from '../components/Icon.jsx'
import { theme, PROTECTED_STAGES } from '../data/theme.js'

// The palette is fixed per tenant theme (set once at onboarding) — shown for
// reference, not edited here. Everything else on this screen writes to Postgres.
const SWATCHES = [
  ['Paper', '#F6F5F2'], ['Card', '#FFFFFF'], ['Ink', '#23231F'], ['Chrome', '#22242A'], ['Green', '#1E6F52'],
]

const NAV = [
  { key: 'brand', label: 'Brand', icon: 'layers' },
  { key: 'pipeline', label: 'Pipeline', icon: 'leads' },
  { key: 'sources', label: 'Lead sources', icon: 'tag' },
  { key: 'routing', label: 'Lead routing', icon: 'team' },
  { key: 'followup', label: 'Follow-up SLA', icon: 'clock' },
  { key: 'system', label: 'System & data', icon: 'settings' },
]

export default function Settings({ store, topBar }) {
  const { settings, agents, routing, leads, inactiveAgentIds } = store.state
  const [section, setSection] = useState('brand')

  return (
    <>
      {topBar({ title: 'Settings' })}
      <div className="app-body">
        <div className="pagewrap">
          <div className="set-shell">
            <nav className="set-nav">
              {NAV.map(n => (
                <button key={n.key} className={section === n.key ? 'on' : ''} onClick={() => setSection(n.key)}>
                  <Icon name={n.icon} size={16} className="sn-ic" />{n.label}
                </button>
              ))}
            </nav>
            <div className="set-main">
              {section === 'brand' && <BrandSection store={store} settings={settings} />}
              {section === 'pipeline' && <PipelineSection store={store} settings={settings} />}
              {section === 'sources' && <SourcesSection store={store} settings={settings} />}
              {section === 'routing' && <RoutingSection store={store} agents={agents} routing={routing} leads={leads} inactiveAgentIds={inactiveAgentIds} />}
              {section === 'followup' && <FollowUpSection store={store} settings={settings} />}
              {section === 'system' && <SystemSection store={store} />}
            </div>
          </div>
        </div>
      </div>
    </>
  )
}

function SecHead({ title, sub }) {
  return <div><div className="set-sec-h">{title}</div><div className="set-sec-sub">{sub}</div></div>
}

// ---- Brand ----------------------------------------------------------------
function BrandSection({ store, settings }) {
  const [firm, setFirm] = useState(settings.firmName)
  const dirty = firm.trim() && firm.trim() !== settings.firmName
  return (
    <>
      <SecHead title="Brand" sub="Your desk is white-labelled. This name and mark appear on the login, top bar and every message your team sends." />
      <Panel>
        <div className="brand-row">
          <div className="brand-badge">{theme.brand.initials}</div>
          <div className="brand-field">
            <div className="field-lbl">Firm name</div>
            <Input value={firm} onChange={e => setFirm(e.target.value)} placeholder="Your brokerage name"
              onKeyDown={e => { if (e.key === 'Enter' && dirty) store.setFirmName(firm) }} />
          </div>
          <Button variant={dirty ? 'primary' : 'ghost'} disabled={!dirty} onClick={() => store.setFirmName(firm)}>Save</Button>
        </div>
        <div className="field-lbl">Brand colours · set at onboarding</div>
        <div className="swatch-row">
          {SWATCHES.map(([n, c]) => (
            <div key={n} className="swatch"><i style={{ background: c }} /><span>{n}</span></div>
          ))}
        </div>
      </Panel>
    </>
  )
}

// ---- Pipeline stages ------------------------------------------------------
function PipelineSection({ store, settings }) {
  const [newStage, setNewStage] = useState('')
  const [editing, setEditing] = useState(null)
  const [draft, setDraft] = useState('')
  const lastClosedFree = settings.stages.filter(s => !s.startsWith('Closed')).length

  const commitRename = () => {
    if (draft.trim() && draft.trim() !== editing) store.renameStage(editing, draft.trim())
    setEditing(null); setDraft('')
  }
  const addStage = () => { if (newStage.trim()) { store.addStage(newStage.trim()); setNewStage('') } }

  return (
    <>
      <SecHead title="Pipeline stages" sub="Rename stages to how your team actually talks. Every lead on a renamed stage moves with it. Closed won / lost are fixed." />
      <Panel>
        <SectionHead title="Stages" right={`${settings.stages.length}`} />
        <div className="chip-list">
          {settings.stages.map((s, i) => {
            const protectedStage = PROTECTED_STAGES.includes(s)
            const closed = s.startsWith('Closed')
            const isEditing = editing === s
            const canUp = i > 0 && !settings.stages[i - 1].startsWith('Closed') && !closed
            const canDown = i < settings.stages.length - 1 && !settings.stages[i + 1].startsWith('Closed') && !closed
            return (
              <div key={s} className="chip-row">
                <div className="chip-reorder">
                  <button className="icon-mini" disabled={!canUp} onClick={() => store.moveStage(s, -1)} title="Move up"><Icon name="chevUp" size={12} /></button>
                  <button className="icon-mini" disabled={!canDown} onClick={() => store.moveStage(s, 1)} title="Move down"><Icon name="chevDown" size={12} /></button>
                </div>
                {isEditing ? (
                  <input className="input chip-in" value={draft} autoFocus
                    onChange={e => setDraft(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') { setEditing(null); setDraft('') } }}
                    onBlur={commitRename} />
                ) : (
                  <span className="chip-grow"><StageTag stage={s} /></span>
                )}
                {!protectedStage && !isEditing && (
                  <>
                    <button className="icon-mini" onClick={() => { setEditing(s); setDraft(s) }} title="Rename"><Icon name="edit" size={13} /></button>
                    <button className="icon-mini danger" disabled={lastClosedFree <= 1} onClick={() => { if (window.confirm(`Remove stage "${s}"? Leads on this stage move to "${settings.stages[0] || 'New'}".`)) store.removeStage(s) }} title="Remove"><Icon name="x" size={13} /></button>
                  </>
                )}
                {protectedStage && <span className="chip-lock">locked</span>}
              </div>
            )
          })}
        </div>
        <div className="add-row">
          <input className="input" value={newStage} placeholder="e.g. Token pending"
            onChange={e => setNewStage(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') addStage() }} />
          <Button variant="ghost" size="sm" icon="plus" onClick={addStage}>Add stage</Button>
        </div>
      </Panel>
    </>
  )
}

// ---- Lead sources ---------------------------------------------------------
function SourcesSection({ store, settings }) {
  const [newSource, setNewSource] = useState('')
  const addSource = () => { if (newSource.trim()) { store.addSource(newSource.trim()); setNewSource('') } }
  return (
    <>
      <SecHead title="Lead sources" sub="Where your enquiries come from. Sources appear on the new-lead form, in filters and in the source breakdown on your dashboard." />
      <Panel>
        <SectionHead title="Sources" right={`${settings.sources.length}`} />
        <div className="source-chips">
          {settings.sources.map(s => (
            <span key={s} className="source-chip">
              {s}
              <button className="icon-mini danger" onClick={() => store.removeSource(s)} title={`Remove ${s}`}><Icon name="x" size={12} /></button>
            </span>
          ))}
        </div>
        <div className="add-row add-row-cap">
          <input className="input" value={newSource} placeholder="e.g. Housing.com"
            onChange={e => setNewSource(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') addSource() }} />
          <Button variant="ghost" size="sm" icon="plus" onClick={addSource}>Add source</Button>
        </div>
      </Panel>
    </>
  )
}

// ---- Lead routing (real: /team/routing round-robin) -----------------------
function RoutingSection({ store, agents, routing, leads, inactiveAgentIds }) {
  const strategy = routing?.strategy || 'round_robin'
  const rota = routing?.active_agent_ids || []
  const rosterAgents = agents.filter(a => a.role !== 'admin' || true) // include all; admins can also take leads

  const openLoad = (id) => leads.filter(l => l.agentId === id && !String(l.stage).startsWith('Closed')).length

  const setStrategy = (s) => store.setRouting({ strategy: s }, s === 'round_robin' ? 'New leads auto-assign, round-robin' : 'New leads land unassigned')
  const toggleAgent = (id) => {
    const next = rota.includes(id) ? rota.filter(x => x !== id) : [...rota, id]
    store.setRouting({ active_agent_ids: next })
  }

  return (
    <>
      <SecHead title="Lead routing" sub="Decide who catches a new enquiry the moment it arrives from a portal, website or walk-in. This runs on the server — every incoming lead is assigned before your team even opens the app." />
      <Panel>
        <SectionHead title="When a new lead arrives" />
        <div className="opt-list">
          <button className={'opt' + (strategy === 'round_robin' ? ' on' : '')} onClick={() => setStrategy('round_robin')}>
            <span className="opt-radio" />
            <span><span className="opt-t">Auto-assign · round-robin</span><span className="opt-s">Distribute evenly across the agents in rotation below. Fair, no lead sits unclaimed.</span></span>
          </button>
          <button className={'opt' + (strategy === 'manual' ? ' on' : '')} onClick={() => setStrategy('manual')}>
            <span className="opt-radio" />
            <span><span className="opt-t">Leave unassigned</span><span className="opt-s">New leads land in a shared pool. A manager picks who takes each one.</span></span>
          </button>
        </div>
      </Panel>

      {strategy === 'round_robin' && (
        <Panel>
          <SectionHead title="Agents in rotation" right={`${rota.length} of ${rosterAgents.length}`} />
          <div className="set-sec-sub">Only agents you tick receive auto-assigned leads. Their current open load is shown so you can balance the desk.</div>
          <div className="rot-list">
            {rosterAgents.map(a => {
              const on = rota.includes(a.id)
              const off = inactiveAgentIds.includes(a.id)
              return (
                <div key={a.id} className={'rot-row' + (on ? ' on' : '')} onClick={() => toggleAgent(a.id)} role="checkbox" aria-checked={on}>
                  <span className="rot-check">{on && <Icon name="check" size={12} />}</span>
                  <span className="rot-name">{a.name}{off && <span className="chip-lock"> · off duty</span>}</span>
                  <span className="rot-load">{openLoad(a.id)} open</span>
                </div>
              )
            })}
          </div>
        </Panel>
      )}
    </>
  )
}

// ---- Follow-up SLA (real: persisted into settings JSON) -------------------
function FollowUpSection({ store, settings }) {
  const sla = Number(settings.slaHours ?? 24)
  const remind = Number(settings.reminderDays ?? 3)
  const setSla = (v) => store.patchSettings({ slaHours: Math.max(1, v) }, 'Follow-up SLA updated')
  const setRemind = (v) => store.patchSettings({ reminderDays: Math.max(1, v) }, 'Reminder cadence updated')
  return (
    <>
      <SecHead title="Follow-up SLA" sub="Set the pace your desk is held to. A lead with no logged activity past these windows is flagged overdue on the dashboard and the agent's Today list." />
      <Panel>
        <SectionHead title="First response" />
        <div className="set-sec-sub">A brand-new lead should hear back within…</div>
        <NumField value={sla} suffix="hours" onChange={setSla} step={1} />
      </Panel>
      <Panel>
        <SectionHead title="Ongoing follow-up" />
        <div className="set-sec-sub">An active lead with no touch for this many days is nudged back to the top.</div>
        <NumField value={remind} suffix="days" onChange={setRemind} step={1} />
      </Panel>
    </>
  )
}

function NumField({ value, suffix, onChange, step = 1 }) {
  return (
    <div className="numfield">
      <div className="numstep">
        <button onClick={() => onChange(value - step)} aria-label="decrease">–</button>
        <span className="numval">{value}</span>
        <button onClick={() => onChange(value + step)} aria-label="increase">+</button>
      </div>
      <span className="numsuffix">{suffix}</span>
    </div>
  )
}

// ---- System & data --------------------------------------------------------
function SystemSection({ store }) {
  return (
    <>
      <SecHead title="System & data" sub="Environment controls for this workspace. Your records live in a live PostgreSQL database — changes here affect real data." />
      <Panel>
        <SectionHead title="Database" />
        <div className="sys-row">
          <div>
            <div className="sys-t">Reset demo data</div>
            <div className="sys-s">Restores the clean baseline — 3 agents, 6 properties, 8 leads. Clears anything added during the demo.</div>
          </div>
          <Button variant="ghost" className="btn-danger" onClick={store.resetDatabase}>Reset data</Button>
        </div>
      </Panel>
    </>
  )
}
