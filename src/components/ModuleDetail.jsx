// ============================================================================
// ModuleDetail — the STANDARD detail view for every CRM module.
// Driven by MODULE_DEFINITION + a small set of declarative slots, so Leads,
// Properties, Clients (and any future module) get an identical, polished record
// page with zero bespoke layout. Modules supply only what is genuinely unique.
//
// One page = three standardized zones:
//   1. Header band   — signals (status/stage) + primary/secondary quick actions.
//   2. Record sheet  — the SINGLE place every field is viewed AND edited
//                      (inline pencils + full-form modal). No duplicate panels.
//   3. Related zones — declarative `sections` the module supplies (matched
//                      inventory, other units, timeline, tenancy, …).
// Rail = optional NBA banner + optional module rail slot + definition actions.
//
// Props:
//   def          MODULE_DEFINITION (provides schema + actions)
//   record       the record object
//   store        app store
//   onEdit       () => void  — opens the full-form edit modal (one edit model)
//   signals      node — tags shown in the header (StatusTag / StageTag / …)
//   primary      [{ label, icon, tone, onClick }]  header quick actions
//   nba          node — Next-Best-Action banner (optional)
//   railTop      node — module-specific rail block above actions (optional)
//   sections     [{ id, title, right?, when?, render(record,store) }]  related zones
//   actionCtx    extra ctx passed to definition actions' run() (e.g. onClose)
// ============================================================================

import { useState, useRef, useEffect } from 'react'
import { ModuleRecordSheet } from './ModuleFields.jsx'
import { Panel, SectionHead, Button, Stepper, StageTag } from './primitives.jsx'
import { DetailLayout } from '../layouts/layouts.jsx'
import { ActionRail, RailSection } from './rail.jsx'
import { SelectDropdown } from './collections.jsx'
import Icon from './Icon.jsx'
import { buildActionTiers } from '../modules/definitions.jsx'

// A tidy grid of the most-used ("quick") actions.
function QuickActions({ items }) {
  if (!items.length) return null
  return (
    <div className="qa-row">
      {items.map(a => (
        <button key={a.id} className={'qa-btn' + (a.tone === 'accent' ? ' accent' : '')} onClick={a.onClick} title={a.sub || a.label}>
          <Icon name={a.icon} size={17} /><span>{a.label}</span>
        </button>
      ))}
    </div>
  )
}

// Everything else lives behind one "⋯ More" menu — rich options, zero clutter.
function MoreMenu({ items }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  useEffect(() => {
    if (!open) return
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [open])
  if (!items.length) return null
  return (
    <div className="moremenu" ref={ref}>
      <button className={'more-btn' + (open ? ' open' : '')} onClick={() => setOpen(o => !o)}>
        <Icon name="dots" size={16} /><span>More actions</span>
      </button>
      {open && (
        <div className="popover more-pop">
          {items.map(a => (
            <button key={a.id} className={'p-item more-item' + (a.tone === 'danger' ? ' danger' : '')} onClick={() => { setOpen(false); a.onClick() }}>
              <span className="p-ic"><Icon name={a.icon} size={16} /></span>
              <span className="more-lbl">{a.label}{a.sub && <span className="more-sub">{a.sub}</span>}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// A related zone. Most are always open; one that carries a long table (the 80
// other units in a township) declares `collapsed` and starts shut, so opening a
// listing on a phone doesn't mean scrolling past someone else's inventory to
// reach the owner or the timeline.
function DetailSection({ s, record, store }) {
  const [open, setOpen] = useState(!s.collapsed)
  const title = typeof s.title === 'function' ? s.title(record, store) : s.title
  const right = typeof s.right === 'function' ? s.right(record, store) : s.right
  if (!s.collapsed) {
    return (
      <Panel>
        {s.title && <SectionHead title={title} right={right} />}
        {s.render(record, store)}
      </Panel>
    )
  }
  return (
    <Panel>
      <button type="button" className={'sh sh-toggle' + (open ? ' open' : '')} onClick={() => setOpen(o => !o)}>
        <span className="t">{title}</span>
        <span className="r">{right}<Icon name="chevDown" size={15} /></span>
      </button>
      {open && s.render(record, store)}
    </Panel>
  )
}

export function ModuleDetail({
  def, record, store, onEdit, title, avatar,
  signals, primary = [], nba, railTop, beforeSheet, sections = [], actionCtx = {},
  phone,
}) {
  const { quick, manage } = buildActionTiers(def, store, record, actionCtx)
  const visibleSections = sections.filter(s => !s.when || s.when(record, store))

  // Module-generic header data, all from the definition.
  const facts = def.headerFacts ? def.headerFacts(record, store).filter(Boolean) : []
  const prog = def.progression
  const progStages = prog ? prog.stages(store) : null
  const progCurrent = prog ? prog.current(record) : null
  const progOnPath = progStages ? progStages.includes(progCurrent) : false
  // A `flat` progression (leads) has no sequence — "New", "Callback", "Site
  // Visit" don't happen in order, so drawing them as a walkable journey implied
  // a funnel that doesn't exist. It renders as a plain "update status" dropdown
  // instead, gated by `canSet` (a lead an agent doesn't own is view-only here,
  // same as everywhere else on the record).
  const canSetProg = prog ? (prog.canSet ? prog.canSet(store, record) : true) : false

  return (
    // The whole rail is desk furniture and is not drawn on a phone, where it
    // stacks ABOVE the record: the first thing on a lead was a follow-up card
    // and on a listing a "Share listing" banner, both standing in front of the
    // identity of the thing you just opened and offering what the action bar
    // already offers a few pixels below. Its actions live in the definition, so
    // the action button still carries every one of them. Rendering an empty
    // ActionRail would leave its "Actions" strip behind, so it is skipped whole.
    <DetailLayout rail={phone ? null : (
      <ActionRail>
        {nba && <RailSection>{nba}</RailSection>}
        {railTop && <RailSection>{railTop}</RailSection>}
        {(quick.length > 0 || manage.length > 0) && (
          <RailSection title="Quick actions">
            <QuickActions items={quick} />
            <MoreMenu items={manage} />
          </RailSection>
        )}
      </ActionRail>
    )}>
      {/* 1. Record header — identity band: icon + title + facts + actions, with
          the progression stepper beneath. Same for every module. */}
      <div className="rechead">
        <div className="rh-top">
          <div className="rh-id">
            {avatar || <span className="rh-icon"><Icon name={def.icon || 'building'} size={20} /></span>}
            <div className="rh-idtext">
              <div className="rh-title">{title || record.name || record.society || def.singularName}</div>
              {facts.length > 0 && <div className="rh-facts">{facts.map((f, i) => <span key={i}>{f}</span>)}</div>}
            </div>
          </div>
          {/* On a phone these move out of the identity row entirely — see the
              action bar below. Left here they were desktop's small buttons
              wrapping under a long title, each too narrow to hit and none of
              them reading as the main thing to do. */}
          <div className="rh-actions">
            {signals && <div className="rh-signals">{signals}</div>}
            {!phone && primary.map((a, i) => (
              <Button key={i} variant={i === 0 ? 'primary' : 'secondary'} size="sm" icon={a.icon} onClick={a.onClick}>{a.label}</Button>
            ))}
            {!phone && onEdit && <Button variant="secondary" size="sm" icon="edit" onClick={onEdit}>Edit</Button>}
          </div>
        </div>

        {/* The record's main actions, on the page, full width, thumb-sized.
            The action button still carries the full list; these are the one or
            two you reach for every single time, and hiding those behind a menu
            makes the common case cost two taps. */}
        {phone && (primary.length > 0 || onEdit) && (
          <div className="rh-actbar">
            {primary.map((a, i) => (
              <button key={i} className={'rh-act' + (i === 0 ? ' primary' : '') + (a.tone ? ' ' + a.tone : '')} onClick={a.onClick}>
                <Icon name={a.icon} size={17} />{a.label}
              </button>
            ))}
            {onEdit && <button className="rh-act" onClick={onEdit}><Icon name="edit" size={17} />Edit</button>}
          </div>
        )}
        {prog && (
          <div className="rh-prog">
            {prog.flat ? (
              canSetProg ? (
                <SelectDropdown
                  label="Status"
                  value={progOnPath ? progCurrent : progStages[0]}
                  onChange={(v) => prog.set(store, record, v)}
                  options={progStages.map(s => ({ value: s, label: s }))}
                />
              ) : (
                <StageTag stage={progCurrent} />
              )
            ) : (
              <Stepper
                stages={progStages}
                current={progOnPath ? progCurrent : progStages[0]}
                onPick={(s) => prog.set(store, record, s)}
              />
            )}
            {prog.exit && (!prog.exit.when || prog.exit.when(record, store)) && (
              // A real button, in the danger tone. This was muted grey text
              // that only turned red on hover, sitting beside a dropdown — so
              // the one irreversible action on the record read as a caption and
              // people hunted for it.
              <button className="rh-exit" onClick={() => prog.exit.run(store, record)}>
                <Icon name="x" size={14} />{prog.exit.label}
              </button>
            )}
          </div>
        )}
      </div>

      {/* module-specific content above the record sheet */}
      {beforeSheet}

      {/* 2. Record sheet — read-only Zoho-style view (edit via header button) */}
      <Panel>
        <ModuleRecordSheet schema={def.schema} record={record} store={store} phone={phone} />
      </Panel>

      {/* 3. Related zones — declarative, module-supplied */}
      {visibleSections.map(s => (
        <DetailSection key={s.id} s={s} record={record} store={store} />
      ))}
    </DetailLayout>
  )
}
