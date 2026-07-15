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
import { Panel, SectionHead, Button } from './primitives.jsx'
import { DetailLayout } from '../layouts/layouts.jsx'
import { ActionRail, RailSection } from './rail.jsx'
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

export function ModuleDetail({
  def, record, store, onEdit,
  signals, primary = [], nba, railTop, beforeSheet, sections = [], actionCtx = {},
}) {
  const { quick, manage } = buildActionTiers(def, store, record, actionCtx)
  const visibleSections = sections.filter(s => !s.when || s.when(record, store))

  return (
    <DetailLayout rail={
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
    }>
      {/* 1. Header band — signals + ONE primary action + Edit */}
      {(signals || primary.length > 0 || onEdit) && (
        <div className="md-head">
          <div className="md-signals">{signals}</div>
          <div className="md-actions">
            {primary.map((a, i) => (
              <Button key={i} variant={i === 0 ? 'primary' : 'secondary'} size="sm" icon={a.icon} onClick={a.onClick}>
                {a.label}
              </Button>
            ))}
            {onEdit && <Button variant="secondary" size="sm" icon="edit" onClick={onEdit}>Edit</Button>}
          </div>
        </div>
      )}

      {/* module-specific content above the record sheet (e.g. pipeline banner) */}
      {beforeSheet}

      {/* 2. Record sheet — read-only Zoho-style view (edit via header button) */}
      <Panel>
        <ModuleRecordSheet schema={def.schema} record={record} store={store} />
      </Panel>

      {/* 3. Related zones — declarative, module-supplied */}
      {visibleSections.map(s => (
        <Panel key={s.id}>
          {s.title && <SectionHead title={typeof s.title === 'function' ? s.title(record, store) : s.title} right={typeof s.right === 'function' ? s.right(record, store) : s.right} />}
          {s.render(record, store)}
        </Panel>
      ))}
    </DetailLayout>
  )
}
