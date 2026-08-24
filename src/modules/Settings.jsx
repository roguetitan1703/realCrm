import { useState, useEffect } from 'react'
import { Panel, SectionHead, StageTag, Button, Input, Segmented, Toggle, Avatar } from '../components/primitives.jsx'
import Icon from '../components/Icon.jsx'
import { theme, PROTECTED_STAGES } from '../data/theme.js'
import { api } from '../lib/api.js'
import { useServerData } from '../lib/useServerData.js'
import ThisDevice from '../components/ThisDevice.jsx'
import MessageTemplates from '../components/MessageTemplates.jsx'
import { OWNER_STATUSES, OWNER_TERMINAL_STATUSES } from '../data/ownerStatus.js'
import { isDeskRole } from '../lib/permissions.js'

// `everyone: true` is a section an agent may open. The rest are the desk's.
// An agent reaches this screen for one reason — the intro message they are
// meant to be able to read and copy — plus the two rows about their own phone,
// which are about the device in their hand and nobody else's.
const NAV = [
  { key: 'brand', label: 'Brand', icon: 'layers' },
  { key: 'pipeline', label: 'Pipeline', icon: 'leads' },
  { key: 'routing', label: 'Routing', icon: 'team' },
  // Key kept — it is in the URL of every Settings link anyone has sent.
  { key: 'followup', label: 'Response times', icon: 'clock' },
  { key: 'messages', label: 'Message templates', icon: 'wa', everyone: true },
  // { key: 'audit', label: 'Audit ledger', icon: 'shield' },
  // Alerts used to be a section of its own, one row above the install row in a
  // section called This device. Two headings for two facts about the same
  // phone. `?screen=settings` carries no section, so nothing linked to the old
  // key — it was component state.
  { key: 'system', label: 'This device', icon: 'settings', everyone: true },
]

export default function Settings({ store, topBar }) {
  const { settings, agents, routing, inactiveAgentIds } = store.state
  const nav = isDeskRole(store.state.role) ? NAV : NAV.filter(n => n.everyone)
  // Routing edits are held until Save, and held HERE — moving to another
  // Settings section and back is not an answer about whether to keep them.
  const [routingDraft, setRoutingDraft] = useState({})
  // The first section they can actually open. Defaulting to 'brand' would land
  // an agent on a blank pane beside a nav that does not list it.
  const [section, setSection] = useState(nav[0].key)

  return (
    <>
      {topBar({ title: 'Settings' })}
      <div className="app-body">
        <div className="pagewrap">
          <div className="set-shell">
            <nav className="set-nav">
              {nav.map(n => (
                <button key={n.key} className={section === n.key ? 'on' : ''} onClick={() => setSection(n.key)}>
                  <Icon name={n.icon} size={16} className="sn-ic" />{n.label}
                </button>
              ))}
            </nav>
            <div className="set-main">
              {section === 'brand' && <BrandSection store={store} settings={settings} />}
              {section === 'pipeline' && <PipelineSection store={store} settings={settings} />}
              {section === 'routing' && <RoutingSection store={store} agents={agents} routing={routing} inactiveAgentIds={inactiveAgentIds} draft={routingDraft} setDraft={setRoutingDraft} />}
              {section === 'followup' && <ResponseTimesSection store={store} settings={settings} />}
              {section === 'messages' && <MessagesSection store={store} />}
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
  // Who an agent reaches when alerts are BLOCKED in their browser. Nothing in
  // the app can lift that — the permission is one-shot and there is no API to
  // reset it — so the only route left is a person who can talk them through
  // their own browser settings. Per firm, because each desk is supported by
  // whoever sold it to them.
  const [support, setSupport] = useState(settings.supportWhatsapp || '')

  useEffect(() => {
    setFirm(settings.firmName)
  }, [settings.firmName])
  useEffect(() => {
    setSupport(settings.supportWhatsapp || '')
  }, [settings.supportWhatsapp])
  const supportDirty = support.trim() !== (settings.supportWhatsapp || '')
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
      <SecHead title="Brand" />
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

        <div className="field-lbl" style={{ marginTop: 16 }}>Support WhatsApp</div>
        <div className="brand-row">
          <div className="brand-field">
            <Input value={support} onChange={e => setSupport(e.target.value)} placeholder="919876543210"
              onKeyDown={e => { if (e.key === 'Enter' && supportDirty) store.patchSettings({ supportWhatsapp: support.trim() }, 'Support number saved') }} />
          </div>
          <Button variant={supportDirty ? 'primary' : 'ghost'} disabled={!supportDirty}
            onClick={() => store.patchSettings({ supportWhatsapp: support.trim() }, 'Support number saved')}>Save</Button>
        </div>
      </Panel>
    </>
  )
}

// ---- Pipeline stages ------------------------------------------------------
// Both pipelines are configured here, on one switch, for the same reason
// routing is: they are the same edit — rename, reorder, add, remove — against
// two different lists. The calling queue's statuses used to be a constant in
// the source, so a firm that says "Warm" instead of "Interested" had no way to
// say so.
function PipelineSection({ store, settings }) {
  const [side, setSide] = useState('leads')
  const isLeads = side === 'leads'
  const stages = isLeads
    ? (settings.stages || [])
    : (settings.ownerStages || OWNER_STATUSES)
  // A lead's Closed won / lost are fixed because reporting keys off them; a
  // caller's terminal two are fixed because the sweeps and every "open" count
  // do. Same rule, two lists.
  const locked = isLeads ? PROTECTED_STAGES : OWNER_TERMINAL_STATUSES

  const [newStage, setNewStage] = useState('')
  const [editing, setEditing] = useState(null)
  const [draft, setDraft] = useState('')
  useEffect(() => { setEditing(null); setDraft(''); setNewStage('') }, [side])

  const freeCount = stages.filter(s => !locked.includes(s)).length

  // Lead stages have their own three store methods (they also move the leads
  // on a renamed stage). Calling statuses go through one generic writer.
  const writeOwner = (next, note, rename) => store.setOwnerStages(next, note, rename)

  const commitRename = () => {
    const to = draft.trim()
    if (to && to !== editing && !stages.includes(to)) {
      if (isLeads) store.renameStage(editing, to)
      else writeOwner(stages.map(s => (s === editing ? to : s)), 'Status renamed — owners moved', { from: editing, to })
    }
    setEditing(null); setDraft('')
  }
  const add = () => {
    const name = newStage.trim()
    if (!name || stages.includes(name)) return
    if (isLeads) store.addStage(name)
    else writeOwner([...stages, name], 'Status added')
    setNewStage('')
  }
  const remove = (s) => {
    const noun = isLeads ? 'Leads' : 'Owners'
    if (!window.confirm(`Remove "${s}"? ${noun} on it move to "${stages[0]}".`)) return
    if (isLeads) store.removeStage(s)
    else writeOwner(stages.filter(x => x !== s), 'Status removed')
  }
  const move = (s, dir) => {
    if (isLeads) return store.moveStage(s, dir)
    const arr = [...stages]
    const i = arr.indexOf(s)
    if (i === -1 || i + dir < 0 || i + dir >= arr.length) return
    const [got] = arr.splice(i, 1)
    arr.splice(i + dir, 0, got)
    writeOwner(arr, 'Order updated')
  }

  return (
    <>
      <SecHead title="Pipeline stages" />

      <div className="rt-switch" role="tablist">
        {[{ k: 'leads', l: 'Leads' }, { k: 'owners', l: 'Calling' }].map(t => (
          <button key={t.k} role="tab" aria-selected={side === t.k}
            className={'rt-tab' + (side === t.k ? ' on' : '')} onClick={() => setSide(t.k)}>
            {t.l}
          </button>
        ))}
      </div>

      <Panel>
        <SectionHead title={isLeads ? 'Lead stages' : 'Calling statuses'} right={`${stages.length}`} />
        <div className="chip-list">
          {stages.map((s, i) => {
            const isLocked = locked.includes(s)
            const isEditing = editing === s
            const canUp = i > 0 && !locked.includes(stages[i - 1]) && !isLocked
            const canDown = i < stages.length - 1 && !locked.includes(stages[i + 1]) && !isLocked
            return (
              <div key={s} className="chip-row">
                <div className="chip-reorder">
                  <button className="icon-mini" disabled={!canUp} onClick={() => move(s, -1)} title="Move up"><Icon name="chevUp" size={12} /></button>
                  <button className="icon-mini" disabled={!canDown} onClick={() => move(s, 1)} title="Move down"><Icon name="chevDown" size={12} /></button>
                </div>
                {isEditing ? (
                  <input className="input chip-in" value={draft} autoFocus
                    onChange={e => setDraft(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') { setEditing(null); setDraft('') } }}
                    onBlur={commitRename} />
                ) : (
                  <span className="chip-grow"><StageTag stage={s} /></span>
                )}
                {!isLocked && !isEditing && (
                  <>
                    <button className="icon-mini" onClick={() => { setEditing(s); setDraft(s) }} title="Rename"><Icon name="edit" size={13} /></button>
                    <button className="icon-mini danger" disabled={freeCount <= 1} onClick={() => remove(s)} title="Remove"><Icon name="x" size={13} /></button>
                  </>
                )}
                {isLocked && <span className="chip-lock">locked</span>}
              </div>
            )
          })}
        </div>
        <div className="add-row">
          <input className="input" value={newStage} placeholder={isLeads ? 'e.g. Token pending' : 'e.g. Wants valuation'}
            onChange={e => setNewStage(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') add() }} />
          <Button variant="ghost" size="sm" icon="plus" onClick={add}>Add</Button>
        </div>
      </Panel>
    </>
  )
}

// ---- Routing ---------------------------------------------------------------
// Leads and the calling queue route independently — a firm may want everyone
// catching enquiries but only two people cold-calling, or one running and the
// other off. That is a real difference in settings, not a real difference in
// controls: both are "who catches a new one", "who is in the rotation", and
// two sweeps over what is already on the desk.
//
// So there is ONE section with a switch at the top, not two stacked ones. The
// previous version rendered ten panels down a single column — the same four
// controls twice, a screen apart, with no way to compare them. Everything
// below reads the pair of field names for whichever side is selected.
const ROUTING_SIDES = {
  leads: {
    key: 'leads', label: 'Leads', noun: 'lead', article: 'a', arrival: 'When a new enquiry arrives',
    f: {
      strategy: 'strategy', rota: 'active_agent_ids',
      sweepOn: 'sweep_unassigned_enabled',
      idleOn: 'reassign_idle_enabled', idleDays: 'reassign_idle_days',
      loopCount: 'reassign_alert_count',
    },
    autoSub: 'Distribute evenly across the agents in rotation. Fair, and no lead sits unclaimed.',
    manualSub: 'New leads land in a shared pool. A manager picks who takes each one.',
    idleSub: 'Nobody has recorded anything on it for this long — and no visit is booked — so it goes to the next agent in rotation, and the record shows why.',
  },
  owners: {
    key: 'owners', label: 'Calling', noun: 'owner', article: 'an', arrival: 'When a new owner is imported',
    f: {
      strategy: 'owner_strategy', rota: 'owner_active_agent_ids',
      sweepOn: 'owner_sweep_unassigned_enabled',
      idleOn: 'owner_reassign_idle_enabled', idleDays: 'owner_reassign_idle_days',
      loopCount: 'owner_reassign_alert_count',
    },
    autoSub: 'Distribute evenly across the callers in rotation as each row imports.',
    manualSub: 'Imported owners land in a shared pool. A manager picks who calls each one.',
    idleSub: 'Nobody has recorded anything on it for this long, so it goes to the next caller in rotation, and the record shows why. Rows marked Not interested or Do not call are never swept.',
  },
}

function RoutingSection({ store, agents, routing, inactiveAgentIds, draft, setDraft }) {
  const [sideKey, setSideKey] = useState('leads')
  const side = ROUTING_SIDES[sideKey]
  const f = side.f

  // NOTHING HERE WRITES UNTIL SAVE IS PRESSED.
  //
  // Every control on this screen used to POST on the click — a toggle, a name
  // in the rota, a step on a number. Turning auto-assign on and then picking
  // who is in the rotation is one decision, and it went to the server as five,
  // each with its own toast, each of them live on a real desk the moment it
  // landed. Changing your mind halfway meant a sweep had already run on the
  // half-built rule.
  //
  // `draft` holds only the keys that differ, and it lives in the parent so
  // moving between Settings sections does not silently drop it. The effective
  // value of any field is the draft's if it has one, else the server's.
  // HAS THE SERVER ANSWERED YET. `routing` starts as a shape with a strategy
  // and an empty rota, so every sweep read as OFF with a default number for the
  // moment before the workspace payload landed — a rule that is ON, shown as
  // off, with a switch you could act on. Absence is not "off": until the row
  // arrives the controls are inert.
  const loaded = !!routing && 'sweep_unassigned_enabled' in routing
  const val = (key, fallback) => (key in draft ? draft[key] : (routing?.[key] ?? fallback))
  const set = (patch) => setDraft(d => {
    const next = { ...d, ...patch }
    // A value edited back to what the server holds is not a change. Without
    // this, stepping a number up and down again leaves Save armed with nothing
    // to write.
    for (const k of Object.keys(next)) {
      if (JSON.stringify(next[k]) === JSON.stringify(routing?.[k])) delete next[k]
    }
    return next
  })
  const dirty = Object.keys(draft).length
  const save = () => { store.setRouting(draft, 'Routing saved'); setDraft({}) }

  const strategy = val(f.strategy, sideKey === 'leads' ? 'round_robin' : 'manual')
  const rota = val(f.rota, [])

  // How many open records each agent is carrying, counted in SQL. This read the
  // whole lead collection out of the store and filtered it per agent; when the
  // collection went away `leads` was undefined and the section threw on render,
  // taking the entire Settings screen down with it.
  const { data: desk } = useServerData(() => api.getDeskSummary(), [], null, '/workspace/desk-summary')
  const openLoad = (id) => desk?.perAgent?.[id]?.open ?? 0

  const setStrategy = (v) => set({ [f.strategy]: v })
  const setRota = (next) => set({ [f.rota]: next })
  const toggleAgent = (id) => setRota(rota.includes(id) ? rota.filter(x => x !== id) : [...rota, id])
  const allOn = agents.length > 0 && rota.length === agents.length

  return (
    <>
      <SecHead title="Routing" />

      {/* The one place this screen writes from. It says how much is waiting so
          that leaving with something unsaved is a visible fact, not a silence. */}
      <div className="rt-save">
        <span className="rt-save-n">{dirty ? `${dirty} unsaved change${dirty === 1 ? '' : 's'}` : 'No changes'}</span>
        <Button variant="ghost" disabled={!dirty} onClick={() => setDraft({})}>Discard</Button>
        <Button variant="primary" disabled={!dirty || !loaded} onClick={save}>Save changes</Button>
      </div>

      <div className="rt-switch" role="tablist">
        {Object.values(ROUTING_SIDES).map(s => (
          <button key={s.key} role="tab" aria-selected={sideKey === s.key}
            className={'rt-tab' + (sideKey === s.key ? ' on' : '')}
            onClick={() => setSideKey(s.key)}>
            {s.label}
            {/* The dot follows the DRAFT, like everything else here — a tab that
                still showed the saved state while the panel under it showed the
                edit would be two answers to one question. */}
            <span className={'rt-dot' + ((s.key in draft || s.f.strategy in draft
              ? draft[s.f.strategy] ?? routing?.[s.f.strategy]
              : routing?.[s.f.strategy]) === 'round_robin' ? ' on' : '')} />
          </button>
        ))}
      </div>

      <Panel>
        <SectionHead title={side.arrival} />
        <div className="opt-list">
          <button className={'opt' + (strategy === 'round_robin' ? ' on' : '')} onClick={() => setStrategy('round_robin')}>
            <span className="opt-radio" />
            <span><span className="opt-t">Auto-assign · round-robin</span><span className="opt-s">{side.autoSub}</span></span>
          </button>
          <button className={'opt' + (strategy === 'manual' ? ' on' : '')} onClick={() => setStrategy('manual')}>
            <span className="opt-radio" />
            <span><span className="opt-t">Leave unassigned</span><span className="opt-s">{side.manualSub}</span></span>
          </button>
        </div>
      </Panel>

      {strategy === 'round_robin' && (
        <Panel>
          <SectionHead
            title="In rotation"
            right={
              // Ticking eleven names one at a time to say "everyone" is the
              // common case, and it was the slowest thing on this screen.
              <button className="rt-all" onClick={() => setRota(allOn ? [] : agents.map(a => a.id))}>
                {allOn ? 'Clear all' : 'Select all'}
              </button>
            }
          />
          <div className="set-sec-sub">{rota.length} of {agents.length} receive auto-assigned {side.noun}s</div>
          {/* A grid of chips, not a vertical checklist. Eleven agents was
              eleven full-width rows and half a screen of scrolling to answer
              "who is on". */}
          <div className="rot-grid">
            {agents.map(a => {
              const on = rota.includes(a.id)
              const off = inactiveAgentIds.includes(a.id)
              return (
                <button key={a.id} className={'rot-chip' + (on ? ' on' : '') + (off ? ' off' : '')}
                  role="checkbox" aria-checked={on} onClick={() => toggleAgent(a.id)}>
                  <span className="rot-check">{on && <Icon name="check" size={11} />}</span>
                  <Avatar agent={a} size="sm" />
                  <span className="rot-name">{a.first || a.name}</span>
                  <span className="rot-load">{openLoad(a.id)}</span>
                </button>
              )
            })}
          </div>
          {!agents.length && <div className="detail-empty">No team members yet.</div>}
        </Panel>
      )}

      {/* Both sweeps in one panel. They are the same kind of rule — a periodic
          check over records already on the desk — and splitting them across two
          panels made the page read as a list of unrelated settings. */}
      <Panel>
        <SectionHead title={`${side.label === 'Calling' ? 'Owners' : 'Leads'} already on the desk`} />

        <div className="rt-rule">
          <div className="rt-rule-h">
            <div>
              <div className="rt-rule-t">Assign {side.noun}s that have no agent</div>
              <div className="rt-rule-s">Nobody on it — never assigned, or its owner left the firm.</div>
            </div>
            {/* No hours field. Nothing ever sets agent_id back to NULL, so a
                record is unowned only at arrival — the number was asking how
                long a live enquiry should sit with nobody on it. */}
            <Toggle on={!!val(f.sweepOn, false)} disabled={!loaded} onClick={() => set({ [f.sweepOn]: !val(f.sweepOn, false) })} />
          </div>
        </div>

        <div className="rt-rule">
          <div className="rt-rule-h">
            <div>
              <div className="rt-rule-t">Reassign {side.article} {side.noun} if no activity on it</div>
              <div className="rt-rule-s">{side.idleSub}</div>
            </div>
            {/* THE NUMBER STAYS ON SCREEN WHEN THE RULE IS OFF, greyed. It is
                what the rule WOULD do, and hiding it made the row jump and left
                somebody deciding whether to switch a rule on with the one fact
                they needed hidden behind the switch. */}
            <NumField value={Number(val(f.idleDays, 3))} suffix="days" disabled={!loaded || !val(f.idleOn, false)}
              onChange={(v) => set({ [f.idleDays]: Math.max(1, v) })} />
            <Toggle on={!!val(f.idleOn, false)} disabled={!loaded} onClick={() => set({ [f.idleOn]: !val(f.idleOn, false) })} />
          </div>
        </div>

        {/* Both sides. An owner in the calling queue is passed around by the
            same sweep and it is the same problem — the threshold is the one
            thing that differs, so each side carries its own. Counted from the
            record's own assignment history, so a manual hand-off counts too. */}
        <div className="rt-rule">
          <div className="rt-rule-h">
            <div>
              <div className="rt-rule-t">Tell a manager if {side.article} {side.noun} is reassigned too often</div>
              <div className="rt-rule-s">It keeps being reassigned. The manager is told each time after that.</div>
            </div>
            <NumField value={Number(val(f.loopCount, 3))} suffix="times" disabled={!loaded}
              onChange={(v) => set({ [f.loopCount]: Math.max(1, v) })} />
          </div>
        </div>
      </Panel>
    </>
  )
}

// ---- Response times -------------------------------------------------------
// Was "Follow-up SLA". "SLA" is not a word this desk speaks, and the second
// control was called "Ongoing follow-up" while what it actually sets is the
// Going cold line — the pile on the dashboard and the pill on the Leads list.
// A control has to be named after what it does, or nobody connects the two.
//
// `reminderDays` stays the stored key: it is what every tenant's settings JSON
// already holds, and renaming it would silently reset the number to 3 on any
// desk that had set one. The label is the part the desk reads.
function ResponseTimesSection({ store, settings }) {
  const sla = Number(settings.slaHours ?? 24)
  const cold = Number(settings.reminderDays ?? 3)
  const setSla = (v) => store.patchSettings({ slaHours: Math.max(1, v) }, 'First response time updated')
  const setCold = (v) => store.patchSettings({ reminderDays: Math.max(1, v) }, 'Going cold updated')
  // The piles' names come from the served catalogue, not a copy of them here,
  // so this sentence cannot end up naming something the Leads screen no longer
  // calls that. See backend/src/services/leadSegments.ts.
  const segLabel = (key, fallback) =>
    (store.state.leadSegments || []).find(s => s.key === key)?.label || fallback
  const coldLabel = segLabel('going_cold', 'Going cold')
  return (
    <>
      <SecHead title="Response times" />
      <Panel>
        <SectionHead title="A new lead should hear back within" />
        <div className="set-sec-sub">Alerts the assignee, then escalates to a manager.</div>
        <NumField value={sla} suffix="hours" onChange={setSla} step={1} />
      </Panel>
      <Panel>
        <SectionHead title="Treat a lead as gone cold after" />
        <div className="set-sec-sub">Sets {coldLabel}, on the dashboard and in the Leads filters.</div>
        <NumField value={cold} suffix="days" onChange={setCold} step={1} />
      </Panel>
    </>
  )
}

// ---- Message templates ----------------------------------------------------
// The editors themselves are components/MessageTemplates.jsx, which the phone's
// Me screen renders too. This screen contributes the heading and nothing else —
// the moment it contributes a second textarea there are two editors again.
function MessagesSection({ store }) {
  return (
    <>
      <SecHead title="Message templates" />
      <MessageTemplates store={store} />
    </>
  )
}

function NumField({ value, suffix, onChange, step = 1, disabled = false }) {
  return (
    <div className={'numfield' + (disabled ? ' off' : '')}>
      <div className="numstep">
        <button disabled={disabled} onClick={() => onChange(value - step)} aria-label="decrease">–</button>
        <span className="numval">{value}</span>
        <button disabled={disabled} onClick={() => onChange(value + step)} aria-label="increase">+</button>
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
      <SecHead title="Audit ledger" />
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

// Alerts had no home on the web at all — the only control anywhere was a row
// in the notification drawer's footer, which is not where anyone looks for a
// setting. Same component as the phone, so "am I reachable" has one answer.
function SystemSection({ store }) {
  return (
    <>
      <SecHead title="This device" />
      {/* Alerts and install, the same two rows the phone's Me screen shows —
          components/ThisDevice.jsx. The desk had no install route at all: the
          prompt card only ever rendered on the phone's Today tab, so a browser
          on a laptop was never offered it. */}
      <ThisDevice store={store} />
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
