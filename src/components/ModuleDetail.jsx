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
import { Panel, SectionHead, Button, Stepper, StageTag, TYPE_TAG, outcomeLabel } from './primitives.jsx'
import { DetailLayout } from '../layouts/layouts.jsx'
import { ActionRail, RailSection } from './rail.jsx'
import { SelectDropdown } from './collections.jsx'
import Icon from './Icon.jsx'
import { whenLabel, agentName } from '../lib/format.js'
import { buildActionTiers } from '../modules/definitions.jsx'

/**
 * The last thing an agent actually wrote down, at the top of the record.
 *
 * An agent assigned a lead they did not create may change its status and add
 * remarks, and nothing else (ASSIGNEE_WRITABLE, backend/src/lib/permissions.ts).
 * So a remark is where everything they learn ends up — the property the buyer
 * actually asked about, the budget they actually have, the fact that they only
 * answer after seven. All of which reached the record and then sat in a
 * chronological feed, below requirement fields a portal form supplied.
 *
 * "Remark" is not one action. Logging a call or a WhatsApp ends in the same
 * outcome-and-remark step (ContactConfirmModal), so the note an agent types
 * after a call is a remark that happens to be attached to a call — which is
 * usually the most valuable one on the record. Hence every author-written type,
 * not just the standalone one.
 *
 * Newest-first is what the server already returns, so this is a find, not a
 * sort. Entries carrying neither text nor an outcome are skipped: a call logged
 * with nothing added says only "someone dialled", and letting that outrank a
 * real note would make the block worse than useless.
 */
const NOTE_TYPES = new Set(['remark', 'call', 'wa', 'sms', 'visit'])

/**
 * Text the SERVER wrote when a button was pressed — "WhatsApp initiated",
 * "Call initiated" (routes/actions.ts logs `${title} initiated`). It records
 * that a thing happened; nobody chose those words.
 */
const AUTO_TEXT = /^(call|whatsapp|sms|email)\s+initiated\.?$/i

function LatestRemark({ record, store }) {
  // Two passes, because recency alone is the wrong rank here. Tapping WhatsApp
  // writes "WhatsApp initiated", which is newer than the remark an agent typed
  // after a call — so a lead whose history read "Looking For September" showed
  // "WhatsApp initiated" the moment anyone opened WhatsApp, and the one fact
  // worth reading before dialling was pushed off the record by a side effect of
  // pressing a button.
  //
  // So: the newest thing a HUMAN wrote wins, however old. Only when nobody has
  // written anything does the newest logged action stand in — a lead where
  // someone only tapped WhatsApp should still say so rather than go blank. An
  // outcome typed onto that WhatsApp event later is human text, and takes over.
  const notes = (record.timeline || []).filter(e =>
    NOTE_TYPES.has(e.type) && ((e.label || '').trim() || e.metadata?.outcome))
  const written = (e) => !!e.metadata?.outcome || !AUTO_TEXT.test((e.label || '').trim())
  const latest = notes.find(written) || notes[0]
  const textRef = useRef(null)
  const [expanded, setExpanded] = useState(false)
  const [clipped, setClipped] = useState(false)

  // Whether the note is ACTUALLY cut off, measured rather than guessed from a
  // character count — the same sentence fits on a desk and overflows on a
  // phone, and a "tap to read the rest" that reveals nothing is worse than no
  // affordance at all. Re-measured when the note changes, and collapsed again
  // so opening the next record doesn't inherit the last one's expanded state.
  const key = latest ? `${latest.id}:${latest.label}` : null
  useEffect(() => {
    setExpanded(false)
    const el = textRef.current
    if (!el) { setClipped(false); return }
    const measure = () => setClipped(el.scrollHeight > el.clientHeight + 1)
    measure()
    // Rotating a phone or dragging a desk window across the breakpoint changes
    // the answer, and nothing else would tell us.
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null
    ro?.observe(el)
    return () => ro?.disconnect()
  }, [key])

  if (!latest) return null
  const who = latest.authorId ? agentName(store.state.agents, latest.authorId) : null
  const outcome = outcomeLabel(latest.metadata?.outcome)

  // Two rows: what it is and when, then the note. No leading icon — a note
  // glyph beside text reads as an edit button, and this one does nothing. The
  // tag says what kind of entry it is; the real pencil is on the timeline entry
  // below.
  return (
    <div className={'rh-remark' + (expanded ? ' open' : '')}>
      <div className="rh-remark-head">
        <span className="rh-remark-tag">{TYPE_TAG[latest.type] || 'Remark'}</span>
        <span className="rh-remark-meta">
          {who && <b>{who}</b>}
          {latest.timestamp && whenLabel(latest.timestamp)}
        </span>
        {clipped && (
          <button type="button" className="rh-remark-toggle" aria-expanded={expanded}
            onClick={() => setExpanded(v => !v)}>
            {expanded ? 'Less' : 'More'}<Icon name="chevDown" size={13} />
          </button>
        )}
      </div>
      {/* The text is the tap target too, so a thumb does not have to find the
          word "More" on a phone. Inert when nothing is cut off. */}
      <div ref={textRef} className="rh-remark-text"
        onClick={clipped ? () => setExpanded(v => !v) : undefined}>
        {outcome && <b className="rh-remark-outcome">{outcome}</b>}
        {latest.label}
      </div>
    </div>
  )
}

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

        {/* Above the action bar on purpose: on a phone this is read in the
            second before the Call button is pressed, which is the moment it is
            worth anything. */}
        <LatestRemark record={record} store={store} />

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
                  // The record's REAL status, always. This showed
                  // `progStages[0]` whenever the current one was not in the
                  // list — and the list deliberately excludes Rejected, so a
                  // rejected lead's detail page announced "New" while the row
                  // in the list next to it said Rejected. The dropdown now
                  // carries the off-path status as its own option, the same
                  // way the owner dropdown carries an agent who has left, so
                  // the control can state the truth and still offer a way out
                  // of it: picking any live stage reopens the lead.
                  value={progCurrent || progStages[0]}
                  onChange={(v) => prog.set(store, record, v)}
                  options={(progOnPath || !progCurrent ? progStages : [progCurrent, ...progStages])
                    .map(s => ({ value: s, label: s }))}
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
            {/* Why it ended, beside what it ended as. The reason is collected
                by the reject modal and was then only readable by scrolling the
                remark timeline — so the status said Rejected and the page
                could not say what for. */}
            {prog.note && prog.note(record, store) && (
              <span className="rh-prog-note">{prog.note(record, store)}</span>
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
