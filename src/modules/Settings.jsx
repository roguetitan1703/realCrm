import { useState, useEffect } from 'react'
import { Panel, SectionHead, StageTag, Button, Input, Segmented, Toggle } from '../components/primitives.jsx'
import Icon from '../components/Icon.jsx'
import { theme, PROTECTED_STAGES, DEFAULT_WHATSAPP_INTRO } from '../data/theme.js'
import { api } from '../lib/api.js'
import { useServerData } from '../lib/useServerData.js'
import InstallPanel from '../components/InstallPanel.jsx'

const NAV = [
  { key: 'brand', label: 'Brand', icon: 'layers' },
  { key: 'pipeline', label: 'Pipeline', icon: 'leads' },
  { key: 'sources', label: 'Lead sources', icon: 'tag' },
  { key: 'routing', label: 'Routing', icon: 'team' },
  { key: 'followup', label: 'Follow-up SLA', icon: 'clock' },
  { key: 'messages', label: 'Message templates', icon: 'wa' },
  // { key: 'audit', label: 'Audit ledger', icon: 'shield' },
  { key: 'system', label: 'System & data', icon: 'settings' },
]

export default function Settings({ store, topBar }) {
  const { settings, agents, routing, inactiveAgentIds } = store.state
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
              {section === 'routing' && <RoutingSection store={store} agents={agents} routing={routing} inactiveAgentIds={inactiveAgentIds} />}
              {section === 'followup' && <FollowUpSection store={store} settings={settings} />}
              {section === 'messages' && <MessagesSection store={store} settings={settings} />}
              {/* {section === 'audit' && <AuditSection />} */}
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
const COLOR_PRESETS = ['#1E6F52', '#1D4ED8', '#7C3AED', '#B45309', '#B91C1C', '#0F766E', '#0E7490', '#BE185D']

function BrandSection({ store, settings }) {
  const brand = store.state.brand || {}
  const [firm, setFirm] = useState(settings.firmName)

  useEffect(() => {
    setFirm(settings.firmName)
  }, [settings.firmName])
  const dirty = firm.trim() && firm.trim() !== settings.firmName
  const color = brand.primaryColor || '#1E6F52'
  const logoUrl = brand.logoUrl || ''
  const initials = String(settings.firmName || '').trim().split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase()

  const setColor = (c) => store.updateBrand({ primaryColor: c }, 'Brand colour updated')

  const onLogo = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 512 * 1024) { store.toast('Logo must be under 512 KB'); return }
    const reader = new FileReader()
    reader.onload = () => store.updateBrand({ logoUrl: String(reader.result) }, 'Logo updated')
    reader.readAsDataURL(file)
  }

  return (
    <>
      <SecHead title="Brand" sub="Your desk is white-labelled. This name, mark and colour appear on the login, top bar and every message your team sends." />
      <Panel>
        <div className="brand-row">
          <div className="brand-badge" style={{ background: logoUrl ? '#fff' : color, color: '#fff' }}>
            {logoUrl ? <img src={logoUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 'inherit', display: 'block' }} /> : initials}
          </div>
          <div className="brand-field">
            <div className="field-lbl">Firm name</div>
            <Input value={firm} onChange={e => setFirm(e.target.value)} placeholder="Your consultancy name"
              onKeyDown={e => { if (e.key === 'Enter' && dirty) store.setFirmName(firm) }} />
          </div>
          <Button variant={dirty ? 'primary' : 'ghost'} disabled={!dirty} onClick={() => store.setFirmName(firm)}>Save</Button>
        </div>

        <div className="field-lbl">Accent colour</div>
        <div className="swatch-row">
          {COLOR_PRESETS.map(c => (
            <button key={c} type="button" className={'swatch-pick' + (c.toLowerCase() === color.toLowerCase() ? ' on' : '')}
              style={{ background: c }} onClick={() => setColor(c)} title={c} aria-label={`Use ${c}`} />
          ))}
        </div>

        <div className="field-lbl" style={{ marginTop: 16 }}>Logo</div>
        <div className="brand-logo-row">
          <label className="btn btn-secondary btn-sm" style={{ cursor: 'pointer' }}>
            {logoUrl ? 'Replace logo' : 'Upload logo'}
            <input type="file" accept="image/*" onChange={onLogo} style={{ display: 'none' }} />
          </label>
          {logoUrl && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => store.updateBrand({ logoUrl: '' }, 'Logo removed')}>Remove</button>
          )}
          <span className="u-muted" style={{ fontSize: 12 }}>PNG or SVG, under 512&nbsp;KB. Shown on the top bar and login.</span>
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
  const lastClosedFree = settings.stages.filter(s => !PROTECTED_STAGES.includes(s)).length

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
            const closed = PROTECTED_STAGES.includes(s)
            const isEditing = editing === s
            const canUp = i > 0 && !PROTECTED_STAGES.includes(settings.stages[i - 1]) && !closed
            const canDown = i < settings.stages.length - 1 && !PROTECTED_STAGES.includes(settings.stages[i + 1]) && !closed
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
function RoutingSection({ store, agents, routing, inactiveAgentIds }) {
  const strategy = routing?.strategy || 'round_robin'
  const rota = routing?.active_agent_ids || []
  const rosterAgents = agents.filter(a => a.role !== 'admin' || true) // include all; admins can also take leads

  // How many open leads each agent is carrying, counted in SQL. This read the
  // whole lead collection out of the store and filtered it per agent; when the
  // collection went away `leads` was undefined and the section threw on render,
  // taking the entire Settings screen down with it.
  const { data: desk } = useServerData(() => api.getDeskSummary(), [], null, '/workspace/desk-summary')
  const openLoad = (id) => desk?.perAgent?.[id]?.open ?? 0

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

      <SecHead title="Leads already in the pipeline" sub="Separate from the routing above, which only ever looks at the lead that just arrived. These two sweeps periodically check leads already sitting in the desk and act on them." />
      <Panel>
        <div className="set-toggle-row">
          <div>
            <SectionHead title="Pick up unowned leads" />
            <div className="set-sec-sub">A lead with nobody on it — never assigned, or its owner left the firm — is auto-routed after it's been unowned this long.</div>
          </div>
          <Toggle on={!!routing?.sweep_unassigned_enabled} onClick={() => store.setRouting({ sweep_unassigned_enabled: !routing?.sweep_unassigned_enabled }, routing?.sweep_unassigned_enabled ? 'Unowned-lead sweep turned off' : 'Unowned-lead sweep turned on')} />
        </div>
        {!!routing?.sweep_unassigned_enabled && (
          <NumField
            value={Number(routing?.sweep_unassigned_hours ?? 4)} suffix="hours unowned"
            onChange={(v) => store.setRouting({ sweep_unassigned_hours: Math.max(1, v) })}
          />
        )}
      </Panel>
      <Panel>
        <div className="set-toggle-row">
          <div>
            <SectionHead title="Reassign idle leads" />
            <div className="set-sec-sub">A lead with no activity from its assignee for this long — and no upcoming scheduled visit — is handed to the next agent in rotation, and the record shows why.</div>
          </div>
          <Toggle on={!!routing?.reassign_idle_enabled} onClick={() => store.setRouting({ reassign_idle_enabled: !routing?.reassign_idle_enabled }, routing?.reassign_idle_enabled ? 'Idle-lead reassignment turned off' : 'Idle-lead reassignment turned on')} />
        </div>
        {!!routing?.reassign_idle_enabled && (
          <NumField
            value={Number(routing?.reassign_idle_hours ?? 2)} suffix="hours idle"
            onChange={(v) => store.setRouting({ reassign_idle_hours: Math.max(1, v) })}
          />
        )}
      </Panel>

      <OwnerRoutingSection store={store} agents={agents} routing={routing} inactiveAgentIds={inactiveAgentIds} />
    </>
  )
}

// ---- Owner (cold-calling) routing — same three controls as lead routing
// above, entirely separate settings: a firm may staff leads and owner
// outreach with different people, or run one and not the other. Off by
// default (owner_strategy is 'manual', both sweeps false) — owners usually
// arrive by the hundred via import, and auto-assigning all of them the
// moment a sheet lands is not a default a firm should get without choosing it.
function OwnerRoutingSection({ store, agents, routing, inactiveAgentIds }) {
  const strategy = routing?.owner_strategy || 'manual'
  const rota = routing?.owner_active_agent_ids || []
  const rosterAgents = agents

  const setStrategy = (s) => store.setRouting({ owner_strategy: s }, s === 'round_robin' ? 'New owners auto-assign, round-robin' : 'New owners land unassigned')
  const toggleAgent = (id) => {
    const next = rota.includes(id) ? rota.filter(x => x !== id) : [...rota, id]
    store.setRouting({ owner_active_agent_ids: next })
  }

  return (
    <>
      <SecHead title="Owner (cold-calling) routing" sub="The same three controls as lead routing, for the owner outreach list instead — who catches a newly imported owner, and the two sweeps that check the list already on the desk." />
      <Panel>
        <SectionHead title="When a new owner is imported" />
        <div className="opt-list">
          <button className={'opt' + (strategy === 'round_robin' ? ' on' : '')} onClick={() => setStrategy('round_robin')}>
            <span className="opt-radio" />
            <span><span className="opt-t">Auto-assign · round-robin</span><span className="opt-s">Distribute evenly across the agents in rotation below as each row imports.</span></span>
          </button>
          <button className={'opt' + (strategy === 'manual' ? ' on' : '')} onClick={() => setStrategy('manual')}>
            <span className="opt-radio" />
            <span><span className="opt-t">Leave unassigned</span><span className="opt-s">Imported owners land in a shared pool. A manager picks who calls each one.</span></span>
          </button>
        </div>
      </Panel>

      {strategy === 'round_robin' && (
        <Panel>
          <SectionHead title="Agents in rotation" right={`${rota.length} of ${rosterAgents.length}`} />
          <div className="set-sec-sub">Only agents you tick receive auto-assigned owners.</div>
          <div className="rot-list">
            {rosterAgents.map(a => {
              const on = rota.includes(a.id)
              const off = inactiveAgentIds.includes(a.id)
              return (
                <div key={a.id} className={'rot-row' + (on ? ' on' : '')} onClick={() => toggleAgent(a.id)} role="checkbox" aria-checked={on}>
                  <span className="rot-check">{on && <Icon name="check" size={12} />}</span>
                  <span className="rot-name">{a.name}{off && <span className="chip-lock"> · off duty</span>}</span>
                </div>
              )
            })}
          </div>
        </Panel>
      )}

      <SecHead title="Owners already on the desk" sub="Separate from the routing above, which only ever looks at the owner row that just imported. These two sweeps periodically check the owner list already on the desk and act on it." />
      <Panel>
        <div className="set-toggle-row">
          <div>
            <SectionHead title="Pick up unowned rows" />
            <div className="set-sec-sub">An owner with nobody on it — never assigned, or its owner left the firm — is auto-routed after it's been unowned this long.</div>
          </div>
          <Toggle on={!!routing?.owner_sweep_unassigned_enabled} onClick={() => store.setRouting({ owner_sweep_unassigned_enabled: !routing?.owner_sweep_unassigned_enabled }, routing?.owner_sweep_unassigned_enabled ? 'Unowned-owner sweep turned off' : 'Unowned-owner sweep turned on')} />
        </div>
        {!!routing?.owner_sweep_unassigned_enabled && (
          <NumField
            value={Number(routing?.owner_sweep_unassigned_hours ?? 4)} suffix="hours unowned"
            onChange={(v) => store.setRouting({ owner_sweep_unassigned_hours: Math.max(1, v) })}
          />
        )}
      </Panel>
      <Panel>
        <div className="set-toggle-row">
          <div>
            <SectionHead title="Reassign idle rows" />
            <div className="set-sec-sub">An owner with no activity from its assignee for this long is handed to the next agent in rotation, and the record shows why.</div>
          </div>
          <Toggle on={!!routing?.owner_reassign_idle_enabled} onClick={() => store.setRouting({ owner_reassign_idle_enabled: !routing?.owner_reassign_idle_enabled }, routing?.owner_reassign_idle_enabled ? 'Idle-owner reassignment turned off' : 'Idle-owner reassignment turned on')} />
        </div>
        {!!routing?.owner_reassign_idle_enabled && (
          <NumField
            value={Number(routing?.owner_reassign_idle_hours ?? 2)} suffix="hours idle"
            onChange={(v) => store.setRouting({ owner_reassign_idle_hours: Math.max(1, v) })}
          />
        )}
      </Panel>
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

// ---- Single WhatsApp Intro Message ---------------------------------------
function MessagesSection({ store, settings }) {
  const tpl = settings.whatsappIntroTemplate || DEFAULT_WHATSAPP_INTRO
  const [draft, setDraft] = useState(tpl)

  useEffect(() => {
    setDraft(settings.whatsappIntroTemplate || DEFAULT_WHATSAPP_INTRO)
  }, [settings.whatsappIntroTemplate])

  const dirty = draft !== tpl
  const save = () => store.patchSettings({ whatsappIntroTemplate: draft.trim() }, 'WhatsApp intro message saved')
  const reset = () => {
    setDraft(DEFAULT_WHATSAPP_INTRO)
    store.patchSettings({ whatsappIntroTemplate: DEFAULT_WHATSAPP_INTRO }, 'Intro message reset to default')
  }

  return (
    <>
      <SecHead title="WhatsApp Intro Message" sub="The single introductory message sent to leads on WhatsApp. Customize the template below using placeholders." />
      <Panel>
        <SectionHead title="Intro Template" />
        <div className="set-sec-sub" style={{ marginBottom: 8 }}>Available Placeholders:</div>
        <div className="msgt-ph" style={{ marginBottom: 12 }}>
          <code>{"{name}"}</code> <code>{"{firmName}"}</code> <code>{"{requirement}"}</code> <code>{"{locality}"}</code> <code>{"{source}"}</code>
        </div>
        <textarea
          className="textarea msgt-t"
          rows={3}
          value={draft}
          onChange={e => setDraft(e.target.value)}
          placeholder="Enter introductory message template..."
        />
        <div className="msgt-foot" style={{ marginTop: 14, display: 'flex', gap: 10 }}>
          <Button variant="primary" disabled={!dirty} onClick={save}>Save Message</Button>
          <Button variant="ghost" onClick={reset}>Reset to default</Button>
        </div>
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
// ---- Audit ledger ---------------------------------------------------------
const AUDIT_LABELS = {
  'auth.login': 'Signed in', 'auth.login_failed': 'Failed sign-in',
  'lead.create': 'Lead created', 'lead.update': 'Lead updated', 'lead.delete': 'Lead deleted',
  'property.create': 'Property added', 'property.update': 'Property updated', 'property.delete': 'Property deleted',
}
function auditAgo(ts) {
  if (!ts) return ''
  const mins = Math.max(0, Math.floor((Date.now() - new Date(ts).getTime()) / 60000))
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return new Date(ts).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
}

function AuditSection() {
  const [st, setSt] = useState({ loading: true, entries: [], chain: null, error: '' })
  useEffect(() => {
    let alive = true
    api.getAuditLog()
      .then(res => { if (alive) setSt({ loading: false, entries: res.entries || [], chain: res.chain || null, error: '' }) })
      .catch(() => { if (alive) setSt({ loading: false, entries: [], chain: null, error: 'Could not load the audit ledger.' }) })
    return () => { alive = false }
  }, [])

  const chainOk = st.chain?.ok

  return (
    <>
      <SecHead title="Audit ledger" sub="Every sign-in and record change, in an append-only, tamper-evident log. Read-only — entries can never be edited or deleted, and a broken chain is detected automatically." />
      <Panel>
        {st.chain && (
          <div className={`audit-chain ${chainOk ? 'ok' : 'bad'}`}>
            <Icon name={chainOk ? 'check' : 'x'} size={15} />
            <span>{chainOk ? 'Chain verified — no entry has been altered or removed.' : `Chain broken at entry #${st.chain.brokenAtSeq}.`}</span>
          </div>
        )}
        {st.loading ? (
          <div className="sys-s" style={{ padding: '12px 0' }}>Loading ledger…</div>
        ) : st.error ? (
          <div className="sys-s" style={{ padding: '12px 0', color: 'var(--alert)' }}>{st.error}</div>
        ) : st.entries.length === 0 ? (
          <div className="sys-s" style={{ padding: '12px 0' }}>No activity recorded yet.</div>
        ) : (
          <div className="audit-list">
            {st.entries.map(e => (
              <div key={e.seq} className="audit-row">
                <span className="mono-num audit-seq">#{e.seq}</span>
                <div className="audit-main">
                  <div className="audit-action">{AUDIT_LABELS[e.action] || e.action}</div>
                  <div className="audit-summary">{e.summary || e.actor_label || ''}</div>
                </div>
                <div className="audit-meta">
                  <span className="audit-actor">{e.actor_label || e.actor_type}</span>
                  <span className="audit-time">{auditAgo(e.created_at)}{e.ip ? ` · ${e.ip}` : ''}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </Panel>
    </>
  )
}

function SystemSection({ store }) {
  return (
    <>
      <SecHead title="System & data" sub="Environment controls for this workspace. Your records live in a live PostgreSQL database — changes here affect real data." />
      {/* The desk had no install route at all: the prompt card only ever
          rendered on the phone's Today tab, so a browser on a laptop was never
          offered it. Renders nothing when already installed. */}
      <InstallPanel />
      {/* <Panel>
        <SectionHead title="Database" />
        <div className="sys-row">
          <div>
            <div className="sys-t">Reset demo data</div>
            <div className="sys-s">Restores the clean baseline — 3 agents, 6 properties, 8 leads. Clears anything added during the demo.</div>
          </div>
          <Button variant="ghost" className="btn-danger" onClick={store.resetDatabase}>Reset data</Button>
        </div>
      </Panel> */}
    </>
  )
}
