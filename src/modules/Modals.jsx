import { useState, useEffect, useRef } from 'react'
import Icon from '../components/Icon.jsx'
import { Button, Field, Input, PhoneInput, Textarea, Segmented, Avatar, Source, StageTag, Money } from '../components/primitives.jsx'
import { theme } from '../data/theme.js'
// parseBudgetNum was USED in three places here and imported in none of them —
// every money field's onBlur and the lead form's save were one ReferenceError
// waiting for someone to type a budget. Plain JSX, so the build never said a
// word about it.
import { budgetRange, reqLine, reqShort, hasBudget, initials, latestOf, latestPlus, listText, textList, thumbTint, fitReasons, reqFacets, parseBudgetNum, moneyEcho } from '../lib/format.js'
import { matchesForLead, leadsForProperty, ownerUpdateMessage, whatsappLink, followUpMessage } from '../lib/matching.js'
import { api } from '../lib/api.js'
import { useServerData } from '../lib/useServerData.js'
import { notifMeta, cleanTitle, isAssignment } from '../lib/notificationMeta.js'
import { REJECTION_REASONS, REJECTED_STATUS } from '../data/leadStatus.js'
import { getPosition, geoPermission, processImage, uploadMedia } from '../lib/media.js'
import { COUNTED_ITEMS, FIXTURES, SOCIETY_AMENITIES, STATUS } from '../data/propertyFields.js'
import CameraCapture from '../components/CameraCapture.jsx'
import { getNestedValue, setNestedValue } from '../components/ModuleFields.jsx'
import { MODULE_DEFINITIONS } from './definitions.jsx'
import { localities } from '../lib/suggest.js'
import { CALL_OUTCOMES, WA_OUTCOMES, VISIT_OUTCOMES, labelForOutcome } from '../data/callOutcomes.js'

/**
 * Generic modal frame.
 *
 * A click on the backdrop used to close unconditionally, and the modal body
 * scrolls — so on a long lead form the Save button sat below the fold, people
 * filled the form in, saw nothing to press, and tapped outside believing they
 * were done. The edit went in the bin without a word.
 *
 * Two changes, and the first mostly removes the need for the second: the action
 * row is sticky, so Save is on screen the whole time. And once anything in the
 * form has been touched, a backdrop click no longer closes — it draws the eye
 * to the footer instead. Closing deliberately still works, by the X or Cancel,
 * because the person clicking those has said what they mean.
 *
 * Dirtiness is watched here rather than declared by each of the twenty modals
 * below: any input or change event inside the frame bubbles to this div, which
 * is exactly the thing that means "somebody typed something".
 */
function Modal({ title, onClose, children, width = 440 }) {
  const [dirty, setDirty] = useState(false)
  const [nudge, setNudge] = useState(false)

  const onBackdrop = () => {
    if (!dirty) { onClose(); return }
    setNudge(true)
    setTimeout(() => setNudge(false), 360)
  }

  return (
    <div className="overlay" onClick={onBackdrop}>
      <div
        className={'modal' + (nudge ? ' nudge' : '')}
        style={{ width }}
        onClick={e => e.stopPropagation()}
        onInput={() => { if (!dirty) setDirty(true) }}
        onChange={() => { if (!dirty) setDirty(true) }}
      >
        <div className="m-head"><h3>{title}</h3><button className="btn btn-icon btn-quiet" onClick={onClose}><Icon name="x" /></button></div>
        <div className="m-content">{children}</div>
      </div>
    </div>
  )
}

export default function Modals({ store, go }) {
  const m = store.state.modal
  return (
    <>
      {store.state.searchOpen && <SearchModal store={store} go={go} />}
      {store.state.notifOpen && <NotifModal store={store} go={go} />}
      {m?.kind === 'newLead' && <NewLeadModal store={store} />}
      {/* There is exactly ONE edit screen for a lead, and it is the
          schema-driven ModuleFormModal below ('editRecord'). A second
          'editLead' route pointing at NewLeadModal used to sit here; nothing
          opened it any more, but while it existed a lead had two editors with
          two field lists that drifted — which is how Deal Type and budget came
          to be missing from the one people actually use. NewLeadModal is the
          CREATE form only. If you need a field on both, put it in
          LEAD_MODULE_SCHEMA and add it here too; they are checked against each
          other nowhere, so the only defence is keeping them small. */}
      {m?.kind === 'newOwner' && <NewOwnerModal store={store} />}
      {m?.kind === 'editOwner' && <NewOwnerModal store={store} ownerId={m.ownerId} />}
      {m?.kind === 'ownerCallback' && <OwnerCallbackModal store={store} ownerId={m.ownerId} />}
      {m?.kind === 'editRecord' && <ModuleFormModal store={store} moduleId={m.moduleId} recordId={m.recordId} />}
      {m?.kind === 'assign' && <AssignModal store={store} leadId={m.leadId} />}
      {m?.kind === 'bulkAssign' && <BulkAssignModal store={store} leadIds={m.leadIds} isOwner={m.isOwner} onDone={m.onDone} />}
      {m?.kind === 'reassign' && <ReassignModal store={store} fromId={m.fromId} />}
      {m?.kind === 'addAgent' && <AddAgentModal store={store} />}
      {m?.kind === 'contact' && <ContactConfirmModal store={store} channel={m.channel} name={m.name} phone={m.phone} email={m.email} waText={m.waText} recordType={m.recordType} recordId={m.recordId} />}
      {m?.kind === 'remark' && <RemarkModal store={store} recordType={m.recordType} recordId={m.recordId} />}
      {m?.kind === 'propStatus' && <StatusModal store={store} propId={m.propId} />}
      {m?.kind === 'visitFeedback' && <VisitFeedbackModal store={store} leadId={m.leadId} propId={m.propId} />}
      {m?.kind === 'visitProof' && <VisitProofModal store={store} leadId={m.leadId} propId={m.propId} />}
      {m?.kind === 'rejectLead' && <RejectLeadModal store={store} leadId={m.leadId} />}
      {m?.kind === 'amenities' && <AmenitiesModal store={store} value={m.value} onDone={m.onDone} only={m.only} />}
      {m?.kind === 'pickBuyer' && <PickBuyerModal store={store} propId={m.propId} />}
      {m?.kind === 'attachProp' && <AttachPropModal store={store} leadId={m.leadId} />}
      {m?.kind === 'scheduleFollowUp' && <ScheduleFollowUpModal store={store} leadId={m.leadId} />}
      {m?.kind === 'logCall' && <LogCallModal store={store} leadId={m.leadId} />}
      {m?.kind === 'tenancy' && <TenancyModal store={store} propId={m.propId} />}
      {m?.kind === 'ownerEdit' && <OwnerEditModal store={store} propId={m.propId} />}
      {m?.kind === 'ownerUpdate' && <OwnerUpdateModal store={store} propId={m.propId} />}
    </>
  )
}

// ---- Generic schema-driven edit form: the STANDARD full-form editor for any
// module. Renders every schema field, edits a working copy, saves via the store.
// This is the "full form" half of the one edit model (inline pencils + modal).
function ModuleFormModal({ store, moduleId, recordId }) {
  const def = MODULE_DEFINITIONS[moduleId]
  const record = moduleId === 'properties'
    ? store.lookup('property', recordId)
    : store.lookup('lead', recordId)
  // A field may hold a shape a text box cannot carry — `req.interest` is one or
  // several projects — so the schema declares how it goes in (`toForm`) and how
  // it comes back (`fromForm`). Applied here, once, rather than in each of the
  // two editors.
  const [form, setForm] = useState(() => {
    if (!record) return {}
    let f = JSON.parse(JSON.stringify(record))
    for (const fd of (MODULE_DEFINITIONS[moduleId]?.schema?.fields || [])) {
      if (fd.toForm) f = setNestedValue(f, fd.key, fd.toForm(getNestedValue(f, fd.key)))
    }
    return f
  })
  if (!def || !record) return null

  // Honour the same applicability predicate the record sheet and the add form
  // use — and read it off the WORKING COPY, so flipping Sale→Rent here swaps
  // the fields live. Without this the modal offered a booking amount on a
  // rental and, worse, `save()` wrote every field in the schema, stamping
  // empty sale terms onto a let.
  // `readOnly` fields are facts ABOUT the record rather than fields of it —
  // when a lead arrived, for instance. They belong on the read-only sheet and
  // nowhere near an editor: rendered here they would offer a text box over a
  // timestamp, and `save()` writes every field in this list, so an accidental
  // keystroke would rewrite the arrival date of a real enquiry.
  const fields = def.schema.fields.filter(f => (!f.when || f.when(form)) && !f.readOnly)
  const coreFields = fields.filter(f => f.section === 'core')
  const domainFields = fields.filter(f => f.section !== 'core')
  const setField = (key, val) => setForm(prev => setNestedValue(prev, key, val))
  // `record` (the original, unmutated copy) so a field's options() can offer
  // the current value even when it is no longer a live choice — see
  // agentId's options() in ModuleFields.jsx for why that matters.
  const optionsOf = (f) => (typeof f.options === 'function' ? f.options(store, record) : f.options || [])
    .map(o => (o && typeof o === 'object') ? o : { value: o, label: o })

  const save = () => {
    const patch = {}
    for (const f of fields) {
      const v = f.fromForm ? f.fromForm(getNestedValue(form, f.key)) : getNestedValue(form, f.key)
      // rebuild nested patch (e.g. req.config) into nested shape
      if (f.key.includes('.')) {
        const [head, ...rest] = f.key.split('.')
        const base = patch[head] || JSON.parse(JSON.stringify(getNestedValue(record, head) || {}))
        // setNestedValue returns a NEW object rather than mutating in place —
        // the return value was being discarded here, so `patch[head]` stayed
        // frozen at its very first clone of the original record forever.
        // Every nested field (req.config, req.locality, req.timeline,
        // req.notes — anything with a dot in its key, on ANY module) appeared
        // to save in the form, showed the picked value in the dropdown, and
        // then silently reverted, because the actual PATCH sent to the server
        // never carried it.
        patch[head] = setNestedValue(base, rest.join('.'), v)
      } else {
        patch[f.key] = v
      }
    }
    if (moduleId === 'properties') store.updateProp(record.id, patch)
    else store.updateLead(record.id, patch)
    store.closeModal()
  }

  const renderInput = (f) => {
    const v = getNestedValue(form, f.key) ?? ''
    if (f.type === 'textarea') return <Textarea value={v} onChange={e => setField(f.key, e.target.value)} rows={3} />
    if (f.type === 'select') {
      const opts = optionsOf(f)
      // A <select> with no empty option shows its FIRST option whenever the
      // value is empty, so a lead nobody has asked about buying or renting sat
      // in this form reading "Buy". The record sheet showed the same field as
      // "—" a few pixels away. Saving without touching it was harmless — the
      // stored null survived — but an agent reading the form would have taken
      // it as fact and repeated it to the client.
      //
      // So an unset optional field says it is unset, and picking the blank
      // clears the field rather than being ignored.
      const isEmpty = v === undefined || v === null || v === ''
      return (
        <select className="input" value={isEmpty ? '' : String(v)} onChange={e => {
          const raw = e.target.value
          if (raw === '') { setField(f.key, undefined); return }
          const match = opts.find(o => String(o.value) === raw)
          setField(f.key, match ? match.value : raw)
        }}>
          {!f.required && <option value="">Not stated</option>}
          {opts.map(o => <option key={String(o.value)} value={String(o.value)} disabled={o.disabled}>{o.label}</option>)}
        </select>
      )
    }
    // Money accepts what a broker actually types — "80L", "1.2Cr", "45000" —
    // and normalises to rupees when the field loses focus. Left as plain text
    // it would reach the server as "80L", whose non-digits get stripped, and
    // the lead would be saved with a budget of eighty rupees. The full-form
    // modal has always parsed this way; the record sheet has to agree.
    if (f.type === 'money') {
      // The echo is the whole point. "80L" and "45000" are both valid here and
      // a rent of 4500 renders as ₹4.5k downstream, so the shorthand cannot
      // tell you whether the box read four thousand five hundred or forty-five
      // lakh. It says the number back in full while you type.
      const echo = moneyEcho(v)
      return (
        <>
          <Input
            value={v}
            onChange={e => setField(f.key, e.target.value)}
            onBlur={e => {
              const n = parseBudgetNum(e.target.value)
              setField(f.key, Number.isNaN(n) ? '' : n)
            }}
            placeholder="80L, 1.2Cr or 45000"
          />
          {echo && <span className="money-echo">{echo}</span>}
        </>
      )
    }
    return <Input type={f.type === 'number' ? 'number' : 'text'} value={v} onChange={e => setField(f.key, e.target.value)} />
  }

  return (
    <Modal title={`Edit ${def.singularName || def.name}`} onClose={store.closeModal} width={560}>
      <div className="mfm">
        <div className="mfm-sec">Core</div>
        <div className="mfm-grid">
          {coreFields.map(f => <Field key={f.key} label={f.label}>{renderInput(f)}</Field>)}
        </div>
        {domainFields.length > 0 && <>
          <div className="mfm-sec">Details</div>
          <div className="mfm-grid">
            {domainFields.map(f => (
              <div key={f.key} className={f.type === 'textarea' ? 'mfm-wide' : ''}>
                <Field label={f.label}>{renderInput(f)}</Field>
              </div>
            ))}
          </div>
        </>}
        <div className="mfm-foot">
          <Button variant="quiet" onClick={store.closeModal}>Cancel</Button>
          <Button variant="primary" icon="check" onClick={save}>Save changes</Button>
        </div>
      </div>
    </Modal>
  )
}

// ---- Owner on a property: add or correct, without the stepped form ---------
// The owner is optional and internal. It used to be capturable NOWHERE — the
// add page didn't ask and the record's empty state pointed back at the add
// page, so "add an owner" was a loop with no door. This is the door.
//
// Note this edits the owner ON THE PROPERTY. The Contacts → Owners list is
// derived by grouping properties on this name, so saving here is what makes an
// owner appear there; there is no separate owner record to keep in step (and
// no blank one created for a listing that has no owner yet).
function OwnerEditModal({ store, propId }) {
  const p = store.lookup('property', propId)
  const [owner, setOwner] = useState(p?.owner || '')
  const [phone, setPhone] = useState(p?.ownerPhone || '')
  const [email, setEmail] = useState(p?.ownerEmail || '')
  if (!p) return null

  const save = () => {
    // Empty stays empty. Writing '' rather than a placeholder is what keeps a
    // nameless owner out of the Contacts list.
    store.updateProp(p.id, {
      owner: owner.trim(), ownerPhone: phone.trim(), ownerEmail: email.trim(),
    })
    store.toast(owner.trim() ? `Owner saved · ${owner.trim()}` : 'Owner cleared')
    store.closeModal()
  }

  return (
    <Modal title={p.owner || p.ownerPhone ? 'Edit owner' : 'Add owner'} onClose={store.closeModal} width={440}>
      <div className="own-never" style={{ marginBottom: 12 }}>Never shared with clients</div>
      <Field label="Owner name">
        <Input value={owner} onChange={e => setOwner(e.target.value)} placeholder="Sneha Rane" autoFocus />
      </Field>
      <Field label="Phone">
        <Input value={phone} onChange={e => setPhone(e.target.value)} placeholder="+91 98765 43210" />
      </Field>
      <Field label="Email">
        <Input value={email} onChange={e => setEmail(e.target.value)} placeholder="Optional" />
      </Field>
      <Button variant="primary" block style={{ marginTop: 14 }} onClick={save}>Save owner</Button>
    </Modal>
  )
}

// ---- One-tap owner update: activity summary WhatsApp, logged to the listing ----
function OwnerUpdateModal({ store, propId }) {
  const p = store.lookup('property', propId)
  // The activity summary quotes the buyers this listing was shown to. That used
  // to mean matching it against every lead in the firm, in the browser; the
  // server answers the same question about one listing.
  const { data: buyers } = useServerData(() => api.getPropertyBuyers(propId).then(r => r?.buyers || []), [propId], [])
  const [text, setText] = useState('')
  const [edited, setEdited] = useState(false)
  useEffect(() => {
    // Regenerate as the buyers arrive — but never over something already typed.
    if (!p || edited) return
    setText(ownerUpdateMessage(p, buyers || [], store.state.settings.firmName))
  }, [p?.id, buyers, edited])
  if (!p) return null
  const digits = String(p.ownerPhone || '').replace(/\D/g, '')
  // Used to only call store.logEvent (client-only — the "logged" claim in the
  // helper text below was false; it vanished on refresh) and never actually
  // opened WhatsApp. Now it really sends and really persists (B5 pattern):
  // log a 'wa' event, then attach the composed text as its remark.
  const send = () => {
    if (digits) window.open(whatsappLink(text, digits), '_blank', 'noopener')
    store.logContactAction('property', p.id, 'wa').then(res => {
      if (res?.timeline_event?.id) store.editRemark('property', p.id, res.timeline_event.id, text)
    })
    store.closeModal()
  }
  return (
    <Modal title="Update the owner" onClose={store.closeModal} width={460}>
      <div className="u-muted" style={{ fontSize: 12.5, marginTop: -6, marginBottom: 12 }}>
        To <b style={{ color: 'var(--ink)' }}>{p.owner}</b> · owner of {p.society} ({p.type} · {p.locality})
      </div>
      <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 10, padding: 12, marginBottom: 12 }}>
        <Textarea value={text} onChange={e => { setEdited(true); setText(e.target.value) }} style={{ minHeight: 190, fontSize: 13, lineHeight: 1.55 }} />
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <Button variant="primary" style={{ flex: 1, justifyContent: 'center' }} icon="wa" onClick={send}>Send & log to listing</Button>
        <Button icon="copy" onClick={() => store.toast('Owner update copied')}>Copy</Button>
      </div>
      <div style={{ marginTop: 12, background: 'var(--accent-wash)', border: '1px solid var(--accent-line)', borderRadius: 9, padding: '10px 12px', fontSize: 11.5, color: 'var(--accent-ink)', display: 'flex', gap: 9 }}>
        <Icon name="zap" size={15} style={{ flexShrink: 0, marginTop: 1 }} /><span>Sends from your own WhatsApp on setup. The update is logged to this listing's history either way.</span>
      </div>
    </Modal>
  )
}

// ---- Rental tenancy: tenant, agreement window, deposit held ----
function TenancyModal({ store, propId }) {
  const p = store.lookup('property', propId)
  const t = p?.tenancy
  const [f, setF] = useState({
    tenant: t?.tenant || '', phone: t?.phone || '',
    start: t?.start || '', end: t?.end || '',
    deposit: t?.deposit ? String(t.deposit) : (p ? String(p.deposit || '') : ''),
  })
  if (!p) return null
  const set = (k, v) => setF(s => ({ ...s, [k]: v }))
  const save = () => {
    if (!f.tenant.trim()) { store.toast('Add the tenant name', 'warn'); return }
    const depNum = parseInt(String(f.deposit).replace(/[^0-9]/g, '')) || p.deposit || 0
    const tenancy = {
      tenant: f.tenant.trim(), phone: f.phone.trim(),
      start: f.start || undefined, end: f.end || undefined,
      deposit: depNum, depositLabel: depNum ? '₹' + depNum.toLocaleString('en-IN') : p.depositLabel,
      depositReturned: t?.depositReturned || false, agentId: t?.agentId,
    }
    store.setTenancy(propId, tenancy); store.closeModal()
  }
  const clear = () => { store.setTenancy(propId, null); store.closeModal() }
  return (
    <Modal title={t ? 'Update tenancy' : 'Record tenancy'} onClose={store.closeModal} width={440}>
      <div className="u-muted" style={{ fontSize: 12.5, marginTop: -6, marginBottom: 12 }}>
        <b style={{ color: 'var(--ink)' }}>{p.society}</b> · {p.type} · {p.priceLabel}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <Field label="Tenant name"><Input value={f.tenant} onChange={e => set('tenant', e.target.value)} placeholder="e.g. Rahul Verma" autoFocus /></Field>
        <Field label="Tenant phone"><PhoneInput value={f.phone} onChange={e => set('phone', e.target.value)} placeholder="98xxx xxxxx" /></Field>
        <div style={{ display: 'flex', gap: 12 }}>
          <div style={{ flex: 1 }}><Field label="Agreement start"><input className="input" type="date" value={f.start} onChange={e => set('start', e.target.value)} /></Field></div>
          <div style={{ flex: 1 }}><Field label="Agreement end"><input className="input" type="date" value={f.end} onChange={e => set('end', e.target.value)} /></Field></div>
        </div>
        <Field label="Deposit held (₹)"><Input value={f.deposit} onChange={e => set('deposit', e.target.value)} placeholder="200000" /></Field>
        <div style={{ display: 'flex', gap: 8 }}>
          <Button variant="primary" style={{ flex: 1, justifyContent: 'center' }} onClick={save}>{t ? 'Save tenancy' : 'Record tenancy'}</Button>
          {t && <Button variant="danger" onClick={clear}>Free flat</Button>}
        </div>
      </div>
    </Modal>
  )
}

// ---- Attach a property to a lead's shortlist ----
//
// D4. This was one undifferentiated list of every available listing on the
// deal type, fifty rows deep, ordered by a fit score that was never shown
// unless it cleared 60 — so an agent scrolled an endless column of societies
// with no way to tell which of them had anything to do with the person they
// were looking at. The lead's requirement was already on screen and was not
// being used to narrow anything.
//
// Two lists now, and the split is the point:
//
//   SUGGESTED    the lead's own requirement, asked of the server — same deal,
//                same locality, same config where each is actually known —
//                each row carrying the reason it is here.
//   ALL          every available listing, which is how an agent attaches
//                something the requirement does not describe. That happens
//                constantly and it is not an error: a client says 2 BHK in
//                Baner and takes a 3 BHK in Balewadi.
//
// A lead with no requirement on file gets no Suggested tab at all rather than
// an empty one. Nothing on record means nothing to suggest from, and a tab that
// implies we looked and found nothing is a different claim from "we were never
// told what they want".
function AttachPropModal({ store, leadId }) {
  const l = store.lookup('lead', leadId)
  const [q, setQ] = useState('')
  const [mode, setMode] = useState('suggested')

  const req = l?.req || {}
  // What we actually know. Each of these narrows the server query, and only if
  // it is really there — `locality: undefined` must not become a filter on the
  // string "undefined".
  // Read through the SHARED vocabulary, so a requirement saying "2 BHK" can
  // address a listing stored as "2 BHK Apartment" — see reqFacets. Every one of
  // these is an indexed column on crm_properties, so the narrowing happens in
  // Postgres rather than over fifty rows that happened to come back.
  const facets = reqFacets(req)
  const known = {
    deal: req.deal || undefined,
    // ONE value: this goes into a query parameter, and a list would reach the
    // API as "Mahalunge,Wakad" and narrow the inventory to nothing.
    locality: latestOf(req.locality) || undefined,
    category: facets.category || undefined,
    bhk: facets.bhk || undefined,
    subtype: facets.subtype || undefined,
  }
  // Locality and deal NARROW; config only RANKS.
  //
  // A requirement's config is "1BHK" or "2 BHK", and a listing's type is
  // "1 BHK duplex", "1rk BHK independent house", "3 BHK studio" — free-form
  // composites typed by whoever entered the stock. An exact `type IN (…)`
  // filter against that matches almost nothing: Baner has 3,000 available
  // listings and a 1BHK requirement returned zero of them. Locality and deal
  // are clean enumerations and can be trusted to filter; config is handed to
  // the fit score, which is allowed to be approximate because it only decides
  // the order.
  const canSuggest = Boolean(known.locality || known.bhk || known.category || hasBudget(req))
  // Typing is the escape hatch and it always searches everything. Narrowing a
  // search by the requirement would hide the exact listing the agent is typing
  // the name of.
  const searching = q.trim().length > 0
  const suggesting = canSuggest && mode === 'suggested' && !searching

  const { data: page, loading } = useServerData(
    () => {
      if (!l) return Promise.resolve({ data: [] })
      return api.listProperties({
        status: 'Available', limit: 50,
        deal: known.deal,
        q: q.trim() || undefined,
        // Category is the disqualifier and always narrows; locality and BHK are
        // strong preferences. Subtype is deliberately NOT a filter — "penthouse"
        // versus "apartment" is a preference people trade away, and filtering on
        // it emptied the list. It still ranks, in fitReasons.
        ...(suggesting ? { locality: known.locality, category: known.category, bhk: known.bhk } : {}),
        // A commercial requirement must never be answered with flats, even when
        // the agent is browsing everything.
        ...(!suggesting && known.category ? { category: known.category } : {}),
      })
    },
    [leadId, known.deal, known.locality, known.category, known.bhk, suggesting, q.trim()],
    { data: [] })

  if (!l) return null
  const already = new Set(l.shortlist || [])
  const cands = (page?.data || [])
    .filter(p => !already.has(p.id))
    .map(p => ({ p, ...fitReasons(p, req) }))
    .sort((a, b) => b.score - a.score)
  const attach = (p) => { store.attachProp(leadId, p.id, p.society); store.closeModal() }

  const emptyLine = searching ? 'Nothing matches that search.'
    : suggesting ? 'No available listing fits this requirement — try All inventory.'
      : 'No available inventory to attach.'

  return (
    <Modal title="Attach a property" onClose={store.closeModal} width={480}>
      {/* reqShort handles a requirement that is half empty; the old line read
          the three fields raw and printed "undefined · undefined · undefined"
          on any lead nobody had filled in. */}
      <div className="u-muted" style={{ fontSize: 12.5, marginTop: -6, marginBottom: 12 }}>
        <b style={{ color: 'var(--ink)' }}>{l.name}</b>{reqShort(req) ? ` · ${reqShort(req)}` : ' · no requirement on record'}
      </div>

      {canSuggest && (
        <div style={{ marginBottom: 12 }}>
          <Segmented value={searching ? 'all' : mode} onChange={(v) => { setMode(v); if (v === 'all') setQ('') }}
            options={[{ value: 'suggested', label: 'Suggested' }, { value: 'all', label: 'All inventory' }]} />
        </div>
      )}

      <div className="input-group" style={{ marginBottom: 12 }}>
        <span className="prefix"><Icon name="search" size={15} /></span>
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search society, locality, type…" autoFocus />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: '46vh', overflowY: 'auto' }}>
        {loading && cands.length === 0 && <div className="u-muted" style={{ fontSize: 13, padding: '8px 0' }}>Searching inventory…</div>}
        {!loading && cands.length === 0 && <div className="u-muted" style={{ fontSize: 13, padding: '8px 0' }}>{emptyLine}</div>}
        {cands.map(({ p, reasons }) => {
          // The best true thing about this listing for this person, and NOT the
          // thing we filtered on. Suggested narrows by locality, so "Same
          // locality · Baner" was printed identically on all fifty rows — true,
          // and useless for choosing between them. Config, budget and
          // possession are what separate one from the next; locality is only
          // the answer when nothing else is.
          const ok = (reasons || []).filter(r => r.ok)
          const why = (suggesting ? ok.find(r => !/^(Same locality|Config matches)/.test(r.t)) : null) || ok[0]
          return (
            <button key={p.id} className="ap-row" onClick={() => attach(p)}
              style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '10px 11px', border: '1px solid var(--line)', background: '#fff', borderRadius: 10, cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left' }}>
              <div style={{ width: 40, height: 40, borderRadius: 8, background: thumbTint(p.id), display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--faint)', flexShrink: 0 }}><Icon name="building" size={19} strokeWidth={1.4} /></div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 13.5 }}>{p.society}</div>
                {/* Joined from what EXISTS. Written as `a · b · c` it printed a
                    trailing separator on every one of delpat's imported rows,
                    which carry no price — a dangling "·" reads as a value that
                    failed to load rather than one that was never entered. */}
                <div className="u-muted" style={{ fontSize: 12 }}>{[p.type, p.locality, p.priceLabel].filter(Boolean).join(' · ')}</div>
                {/* Only when there IS a requirement to have matched. Against a
                    blank req every listing scores the same and a badge would be
                    decoration pretending to be a judgement. */}
                {/* The reason, not a percentage. A "78% fit" is a number
                    nobody can inspect or argue with; "Within budget" is a
                    claim an agent can check against the row above it. */}
                {canSuggest && why && <div className="ap-why">{why.t}</div>}
              </div>
              <Icon name="plus" size={17} style={{ color: 'var(--accent)', flexShrink: 0 }} />
            </button>
          )
        })}
      </div>
    </Modal>
  )
}

// ---- Log a call -----------------------------------------------------------
// Deliberately NOT a dialer. On a desk there is no phone to dial: the agent
// calls from the handset in their hand and comes here to record what happened.
// The old modal put Call / WhatsApp / SMS behind one button, so every outreach
// started with a choice nobody needed to make. WhatsApp is its own composer;
// SMS is gone.
function LogCallModal({ store, leadId }) {
  const l = store.lookup('lead', leadId)
  const [outcome, setOutcome] = useState(CALL_OUTCOMES[0].value)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  if (!l) return null

  const save = () => {
    setBusy(true)
    const label = labelForOutcome(outcome)
    // The KEY goes to the server, the label only to the toast. This used to
    // send `label`, so metadata.outcome held "No answer" — display copy doing
    // the work of a key, which meant renaming an option silently orphaned every
    // row already written and changed what the auto-advance rule matched.
    //
    // contact-log, NOT the "telephony bridge". That route fabricated a DID, an
    // API key and a call SID and wrote "Initiated outbound telephony call …
    // via DID 08045678900" to the timeline. No call was placed and no telephony
    // is connected — it was a sentence describing something that did not happen.
    api.logContactAction(l.id, 'call')
      .then(res => {
        const evtId = res?.timeline_event?.id
        return evtId ? api.editRemark(l.id, evtId, text.trim(), outcome) : null
      })
      .catch(err => console.warn('[Call log] error:', err.message))
      .finally(() => { store.reloadServer?.(); store.toast(`Call logged · ${label}`); store.closeModal() })
  }

  return (
    <Modal title={`Log a call with ${l.name.split(' ')[0]}`} onClose={store.closeModal} width={430}>
      <div className="lc-who">
        <span className="mono-num">{l.phone || '—'}</span>
        <StageTag stage={l.stage} />
      </div>
      <Field label="Outcome">
        <select className="input" value={outcome} onChange={e => setOutcome(e.target.value)}>
          {CALL_OUTCOMES.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </Field>
      <Field label="Remark">
        <Textarea value={text} onChange={e => setText(e.target.value)} placeholder="What was said" />
      </Field>
      <div className="lc-foot">
        <Button onClick={store.closeModal}>Cancel</Button>
        <Button variant="primary" style={{ flex: 1, justifyContent: 'center' }} disabled={busy} onClick={save}>
          {busy ? 'Saving…' : 'Log call'}
        </Button>
      </div>
    </Modal>
  )
}

// ---- Pick which matched BUYER to WhatsApp a property to (from the system) ----
function PickBuyerModal({ store, propId }) {
  const p = store.lookup('property', propId)
  // The server narrows to the plausible buyers (deal, locality, budget band);
  // the scorer that produces the fit line then runs over those few rows instead
  // of over every lead in the firm. Same pattern as the lead-side matches.
  const { data: candidates } = useServerData(() => api.getPropertyBuyers(propId).then(r => r?.buyers || []), [propId], [])
  if (!p) return null
  const buyers = leadsForProperty(p, candidates || [])
  const send = (leadId) => { store.closeModal(); store.openWhatsApp(propId, leadId) }
  return (
    <Modal title="Send this listing on WhatsApp" onClose={store.closeModal} width={440}>
      <div className="u-muted" style={{ fontSize: 12.5, marginTop: -6, marginBottom: 12 }}>
        Interested {p.deal === 'rent' ? 'tenants' : 'buyers'} for <b style={{ color: 'var(--ink)' }}>{p.society}</b> — matched by the system. Or send with no recipient.
      </div>
      {buyers.length === 0 && <div className="u-muted" style={{ fontSize: 13, padding: '4px 0 12px' }}>No matching contacts yet — you can still generate the message.</div>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
        {buyers.map((b, i) => (
          <button key={b.lead.id} onClick={() => send(b.lead.id)}
            style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '10px 11px', border: '1px solid var(--line)', background: '#fff', borderRadius: 10, cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left' }}>
            <span className="av av-md" style={{ background: 'var(--chrome)' }}>{initials(b.lead.name)}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: 13.5 }}>{b.lead.name}{i === 0 && <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--accent)', background: 'var(--accent-wash)', borderRadius: 4, padding: '2px 6px', marginLeft: 7 }}>BEST FIT</span>}</div>
              <div className="u-muted" style={{ fontSize: 12 }}>{[latestPlus(b.lead.req.config), latestPlus(b.lead.req.locality), b.fitLine].filter(Boolean).join(' · ')}</div>
            </div>
            <Icon name="wa" size={18} style={{ color: 'var(--accent)', flexShrink: 0 }} />
          </button>
        ))}
      </div>
      <Button block onClick={() => send(undefined)} icon="wa">Continue without a recipient</Button>
    </Modal>
  )
}

// ---- New / edit lead ----
// A THIRD hardcoded list of Pune localities used to live here, disagreeing with
// the two in definitions.jsx. Locality is free text with suggestions drawn from
// this firm's own records — see src/lib/suggest.js.

// Free text, with the firm's existing values offered as you type. A native
// datalist deliberately: it suggests without restricting, which is the whole
// requirement — the next locality is always one nobody has typed yet.
function SuggestInput({ id, value, onChange, options, placeholder }) {
  return (
    <>
      <input className="input" list={id} value={value} placeholder={placeholder}
        onChange={e => onChange(e.target.value)} autoComplete="off" style={{ width: '100%' }} />
      <datalist id={id}>
        {options.map(o => <option key={o} value={o} />)}
      </datalist>
    </>
  )
}

const CONFIG_OPTIONS = [
  '1 BHK Apartment', '2 BHK Apartment', '3 BHK Apartment',
  '4 BHK+ Villa', 'Commercial Office', 'Plot'
];

function NewLeadModal({ store, leadId }) {
  const edit = leadId ? store.lookup('lead', leadId) : null
  const [f, setF] = useState(edit ? {
    name: edit.name || '',
    phone: edit.phone || '',
    email: edit.email || '',
    deal: edit.req?.deal || edit.deal || (edit.req?.purpose === 'Lease' ? 'rent' : 'sale'),
    config: edit.req?.config || edit.requirement || '',
    locality: edit.req?.locality || edit.locality || '',
    minBudget: edit.req?.minBudget ?? edit.req?.budgetMin ?? '',
    maxBudget: edit.req?.maxBudget ?? edit.req?.budgetMax ?? '',
    // A LIST HAS TO SURVIVE BEING EDITED. `interest` accumulates — a buyer who
    // enquired about two projects carries both — and putting the array into a
    // text input rendered "A,B" and saved it back as one value, so opening Edit
    // and pressing Save destroyed the accumulation without anybody typing.
    // Shown as "A, B" and read back through the same separator.
    interest: listText(edit.req?.interest),
    timeline: edit.req?.timeline || 'Immediate',
    source: edit.source || 'Website',
    agentId: edit.agentId || null,
    notes: edit.req?.notes || edit.req?.purpose || ''
  } : {
    name: '',
    phone: '',
    email: '',
    deal: 'sale',
    config: '',
    locality: '',
    minBudget: '',
    maxBudget: '',
    interest: '',
    timeline: 'Within 60 days',
    source: 'Website',
    agentId: store.state.agents[0]?.id || null,
    notes: ''
  })
  const set = (k, v) => setF(s => ({ ...s, [k]: v }))

  const save = () => {
    if (!f.name.trim()) { store.toast('Lead Name is required', 'warn'); return }
    if (!f.phone.trim()) { store.toast('Phone Number is required', 'warn'); return }

    // A BUDGET NOBODY GAVE IS NOT A BUDGET.
    //
    // Leaving both boxes empty used to invent one: ₹25,000–45,000 on a rental,
    // ₹1.1Cr–1.4Cr on a sale. A figure a client never said, written to the
    // record, indistinguishable from one they did — and it drives matching, the
    // budget column, and what an agent repeats back on the phone. One bhumi
    // lead is still carrying the sale pair; which of them is genuine is knowable
    // only from the person who took the enquiry.
    //
    // Empty stays empty. A missing budget is the most common true state of a
    // fresh lead and every reader already handles it.
    const minB = parseBudgetNum(f.minBudget)
    const maxB = parseBudgetNum(f.maxBudget)
    const budgetObj = {
      minBudget: isNaN(minB) ? undefined : minB,
      maxBudget: isNaN(maxB) ? undefined : maxB,
    }

    if (edit) {
      store.updateLead(edit.id, {
        name: f.name.trim(),
        phone: f.phone.trim(),
        email: f.email.trim() || undefined,
        source: f.source,
        agentId: f.agentId || undefined,
        deal: f.deal,
        requirement: f.config,
        locality: f.locality,
        budgetMin: budgetObj.minBudget,
        budgetMax: budgetObj.maxBudget,
        req: {
          ...edit.req,
          deal: f.deal,
          config: f.config,
          locality: f.locality,
          interest: textList(f.interest),
          timeline: f.timeline,
          purpose: f.notes.trim() || (f.deal === 'rent' ? 'Lease' : 'Self Use'),
          notes: f.notes.trim() || undefined,
          ...budgetObj
        }
      })
      store.toast('Lead details updated successfully')
    } else {
      const lead = {
        id: 'l_' + Date.now(),
        name: f.name.trim(),
        phone: f.phone.trim(),
        email: f.email.trim() || undefined,
        source: f.source || 'Website',
        stage: 'New',
        minsAgo: 0,
        agentId: f.agentId || store.state.agents[0]?.id || 'a1',
        deal: f.deal,
        requirement: f.config,
        locality: f.locality,
        budgetMin: budgetObj.minBudget,
        budgetMax: budgetObj.maxBudget,
        req: {
          deal: f.deal,
          config: f.config,
          locality: f.locality,
          interest: textList(f.interest),
          purpose: f.notes.trim() || (f.deal === 'rent' ? 'Lease' : 'Self Use'),
          notes: f.notes.trim() || undefined,
          timeline: f.timeline,
          ...budgetObj
        },
        notes: [],
        shortlist: [],
        feedback: {},
        overdue: false,
        followUp: null,
      }
      store.addLead(lead)
      store.toast('New lead created successfully')
    }
    store.closeModal()
  }

  // `key` on the element itself: these are rendered from a .map, and without it
  // React warns and — worse — reuses DOM nodes by position, so a chip's pressed
  // state can follow the slot rather than the value it stands for.
  const chip = (on, onClick, label) => (
    <button key={label} type="button" className={'qchip' + (on ? ' on' : '')} onClick={onClick}>{label}</button>
  )

  return (
    <Modal title={edit ? `Edit Lead — ${edit.name}` : 'New Lead Record'} onClose={store.closeModal} width={520}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 12 }}>
          <Field label="Full Name *"><Input value={f.name} onChange={e => set('name', e.target.value)} placeholder="Client Name" autoFocus /></Field>
          <Field label="Phone Number *"><Input value={f.phone} onChange={e => set('phone', e.target.value)} placeholder="+91 98xxx xxxxx" /></Field>
        </div>
        <Field label="Email Address (Optional)"><Input value={f.email} onChange={e => set('email', e.target.value)} placeholder="client@domain.com" /></Field>

        <div className="field">
          <label>Deal Type</label>
          <Segmented value={f.deal} onChange={v => set('deal', v)} options={[{ value: 'sale', label: 'Buy / Sale' }, { value: 'rent', label: 'Rent / Lease' }]} />
        </div>

        <div className="field">
          <label>Requirement Configuration</label>
          <Input
            value={f.config}
            onChange={e => set('config', e.target.value)}
            placeholder="e.g. 2 BHK Apartment, 3 BHK, Plot..."
            style={{ marginBottom: 8 }}
          />
          <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
            {['1 BHK', '2 BHK', '3 BHK', '4 BHK+ Villa', 'Commercial Office', 'Plot'] /* vocab-ok */.map(t =>
              chip(f.config === t || f.config?.toLowerCase().startsWith(t.toLowerCase()), () => set('config', t), t)
            )}
          </div>
        </div>

        <div className="field">
          <label>Preferred Locality</label>
          <SuggestInput id="lead-locality" value={f.locality} onChange={v => set('locality', v)}
            options={localities(store)} placeholder="Where are they looking?" />
        </div>

        {/* Free text, matching req.interest on the record sheet and the import.
            A picker would be wrong here for the same reason it is wrong there:
            what they are interested in is often a project we hold no listing
            for, and a picker with nothing to pick loses the answer. */}
        <div className="field">
          <label>Property Interested</label>
          <Input value={f.interest} onChange={e => set('interest', e.target.value)}
            placeholder="Project or unit they asked about" />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          {/* Both echo the figure back in full while it is typed — 4500 and
              45L abbreviate to ₹4.5k and ₹45L downstream, and neither tells the
              person typing which one the box understood. */}
          <Field label={f.deal === 'rent' ? 'Min Budget (₹/mo)' : 'Min Budget (e.g. 80L or 1.2Cr)'}>
            <Input value={f.minBudget} onChange={e => set('minBudget', e.target.value)} placeholder={f.deal === 'rent' ? '25000' : '80L'} />
            {moneyEcho(f.minBudget) && <span className="money-echo">{moneyEcho(f.minBudget)}</span>}
          </Field>
          <Field label={f.deal === 'rent' ? 'Max Budget (₹/mo)' : 'Max Budget (e.g. 1.4Cr)'}>
            <Input value={f.maxBudget} onChange={e => set('maxBudget', e.target.value)} placeholder={f.deal === 'rent' ? '45000' : '1.4Cr'} />
            {moneyEcho(f.maxBudget) && <span className="money-echo">{moneyEcho(f.maxBudget)}</span>}
          </Field>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div className="field">
            <label>Source</label>
            <select className="input" value={f.source} onChange={e => set('source', e.target.value)} style={{ width: '100%' }}>
              {store.state.settings.sources.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div className="field">
            <label>Assign Owner</label>
            <select className="input" value={f.agentId || ''} onChange={e => set('agentId', e.target.value || null)} style={{ width: '100%' }}>
              <option value="">Unassigned</option>
              {store.state.agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
        </div>

        <Field label="Requirement Notes & Purpose"><Textarea value={f.notes} onChange={e => set('notes', e.target.value)} placeholder="Specific buyer preferences, budget flexibility, timeline notes..." rows={3} /></Field>
        <Button variant="primary" block onClick={save} icon="check">{edit ? 'Save Changes' : 'Create Lead Record'}</Button>
      </div>
    </Modal>
  )
}

// New owner — one-at-a-time entry for the cold-calling list, the manual
// counterpart to the import wizard's bulk path. Deliberately thin, same as
// OWNER_MODULE_SCHEMA: no requirement, no budget, this isn't a lead.
function NewOwnerModal({ store, ownerId }) {
  const edit = ownerId ? store.lookup('owner', ownerId) : null
  const [f, setF] = useState(edit ? {
    name: edit.name || '', phone: edit.phone || '', email: edit.email || '',
    project: edit.project || '', unitRef: edit.unitRef || '', locality: edit.locality || '',
    agentId: edit.agentId || null,
  } : {
    name: '', phone: '', email: '', project: '', unitRef: '', locality: '',
    agentId: null,
  })
  const set = (k, v) => setF(s => ({ ...s, [k]: v }))

  const save = () => {
    if (!f.phone.trim()) { store.toast('Phone is required', 'warn'); return }
    if (edit) {
      store.updateOwner(edit.id, {
        name: f.name.trim() || undefined, phone: f.phone.trim(), email: f.email.trim() || undefined,
        project: f.project.trim() || undefined, unitRef: f.unitRef.trim() || undefined,
        locality: f.locality.trim() || undefined, agentId: f.agentId || null,
      })
      store.toast('Owner updated')
    } else {
      store.addOwner({
        name: f.name.trim() || undefined, phone: f.phone.trim(), email: f.email.trim() || undefined,
        project: f.project.trim() || undefined, unitRef: f.unitRef.trim() || undefined,
        locality: f.locality.trim() || undefined, agentId: f.agentId || undefined, source: 'Manual entry',
      })
      store.toast('Owner added')
    }
    store.closeModal()
  }

  return (
    <Modal title={edit ? `Edit Owner — ${edit.name || edit.phone}` : 'New Owner'} onClose={store.closeModal} width={480}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 12 }}>
          <Field label="Owner Name"><Input value={f.name} onChange={e => set('name', e.target.value)} placeholder="Optional" autoFocus /></Field>
          <Field label="Phone *"><Input value={f.phone} onChange={e => set('phone', e.target.value)} placeholder="+91 98xxx xxxxx" /></Field>
        </div>
        <Field label="Email"><Input value={f.email} onChange={e => set('email', e.target.value)} placeholder="Optional" /></Field>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Field label="Project / Society"><Input value={f.project} onChange={e => set('project', e.target.value)} placeholder="e.g. Godrej Green Vistas" /></Field>
          <Field label="Unit reference"><Input value={f.unitRef} onChange={e => set('unitRef', e.target.value)} placeholder="e.g. T1 · 2 BHK · GGVT10402" /></Field>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div className="field">
            <label>Locality</label>
            <SuggestInput id="owner-locality" value={f.locality} onChange={v => set('locality', v)}
              options={localities(store)} placeholder="Where's the unit?" />
          </div>
          <div className="field">
            <label>Assign to</label>
            <select className="input" value={f.agentId || ''} onChange={e => set('agentId', e.target.value || null)} style={{ width: '100%' }}>
              <option value="">Unassigned</option>
              {store.activeAgents().map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
        </div>
        <Button variant="primary" block onClick={save} icon="check">{edit ? 'Save Changes' : 'Add Owner'}</Button>
      </div>
    </Modal>
  )
}

// The pre-Block-C add-property modal lived here and has been DELETED.
//
// It was superseded by the stepped page (PropertyWizard) but stayed reachable
// from the mobile speed dial, still writing the old shape: type: '2BHK',
// furnishing: 'Semi-furnished', possession: 'Immediate', status: 'Under offer'.
// Not one of those is a valid value any more, so every property added from a
// phone landed unfilterable, untagged and unmatchable. Dead-looking code that
// is still wired to a button is the worst kind.
//
// Adding a property from the phone now needs the wizard on the mobile shell —
// that's E3/E4 (PWA parity), and until then the phone doesn't offer it rather
// than offering something that corrupts the row.
//
// `UNIT_CONFIGS` went with it: the last remnant of the bulk-add modal retired
// in C9.

// "95" (lakh) or "1.85" (cr) → absolute rupees; rent left as entered.
function parsePrice(raw, deal) {
  let n = parseFloat(String(raw).replace(/[^0-9.]/g, ''))
  if (!n) return deal === 'rent' ? 30000 : 0
  if (deal === 'sale') {
    if (n <= 25) n = Math.round(n * 10000000)      // crores
    else if (n < 100000) n = Math.round(n * 100000) // lakhs
  }
  return n
}

let _unitRowSeq = 0
const emptyRow = (over = {}) => ({ _id: 'r' + (++_unitRowSeq), flat: '', config: '2BHK', floor: '', owner: '', price: '', status: 'Available', ...over })


// ---- Reject a lead, with the reason recorded ----
// This was a window.prompt asking for free text — and the answer was thrown
// away. The lead went to Closed Lost and WHY was lost with it, which is the one
// thing a rejection is worth recording. The reasons are the client's own list.
function RejectLeadModal({ store, leadId }) {
  const l = store.lookup('lead', leadId)
  const [reason, setReason] = useState(REJECTION_REASONS[0])
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)

  const save = async () => {
    setBusy(true)
    const text = note.trim() ? `${reason} — ${note.trim()}` : reason
    await store.updateLead(leadId, { stage: REJECTED_STATUS, rejectionReason: reason })
    await store.addRemark('lead', leadId, `Rejected: ${text}`)
    setBusy(false)
    store.closeModal()
  }

  return (
    <Modal title="Mark as rejected" onClose={store.closeModal} width={420}>
      <div className="u-muted" style={{ fontSize: 12.5, marginTop: -6, marginBottom: 12 }}>
        Why did <b style={{ color: 'var(--ink)' }}>{l?.name || 'this lead'}</b> not go ahead?
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 7, marginBottom: 12 }}>
        {REJECTION_REASONS.map(r => (
          <button key={r} onClick={() => setReason(r)}
            style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 11px', textAlign: 'left',
              border: '1px solid ' + (reason === r ? 'var(--accent)' : 'var(--line)'),
              background: reason === r ? 'var(--accent-wash)' : '#fff', borderRadius: 9, cursor: 'pointer', fontFamily: 'inherit', fontSize: 13.5, fontWeight: 600 }}>
            <span style={{ flex: 1 }}>{r}</span>
            {reason === r && <Icon name="check" style={{ color: 'var(--accent)' }} />}
          </button>
        ))}
      </div>
      <Field label="Anything to add (optional)">
        <Textarea value={note} onChange={e => setNote(e.target.value)} placeholder="Context for whoever picks this up later" />
      </Field>
      <div className="lc-foot">
        <Button onClick={store.closeModal}>Cancel</Button>
        <Button variant="primary" style={{ flex: 1, justifyContent: 'center' }} disabled={busy} onClick={save}>
          {busy ? 'Saving…' : 'Mark as rejected'}
        </Button>
      </div>
    </Modal>
  )
}

// ---- Assign lead ----
function AssignModal({ store, leadId }) {
  const l = store.lookup('lead', leadId)
  // round-robin suggestion = agent with fewest active leads. Counted in SQL:
  // "how many open leads does each agent have" needs no lead rows in the browser.
  const { data: desk } = useServerData(() => api.getDeskSummary(), [], null, '/workspace/desk-summary')
  const counts = desk?.perAgent || {}
  const openFor = (id) => counts[id]?.open ?? 0
  const sugg = desk ? [...store.activeAgents()].sort((a, b) => openFor(a.id) - openFor(b.id))[0] : null
  return (
    <Modal title="Assign lead" onClose={store.closeModal} width={400}>
      <div style={{ fontSize: 13, color: 'var(--ink-2)', marginBottom: 14 }}>Route <b>{l?.name}</b> to an agent:</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {store.state.agents.map(a => (
          <button key={a.id} onClick={() => { store.assign(leadId, a.id); store.closeModal() }}
            style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 11px', border: '1px solid ' + (l?.agentId === a.id ? 'var(--accent)' : 'var(--line)'), background: l?.agentId === a.id ? 'var(--accent-wash)' : '#fff', borderRadius: 9, cursor: 'pointer', fontFamily: 'inherit' }}>
            <Avatar agent={a} size="sm" />
            <span style={{ flex: 1, textAlign: 'left', fontWeight: 600, fontSize: 13.5 }}>{a.first}</span>
            {!l?.agentId && sugg?.id === a.id && <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--accent)', background: 'var(--accent-wash)', borderRadius: 4, padding: '2px 6px' }}>SUGGESTED</span>}
            {l?.agentId === a.id && <Icon name="check" style={{ color: 'var(--accent)' }} />}
          </button>
        ))}
      </div>
    </Modal>
  )
}

// ---- Bulk assign: the same route AssignModal uses (bulkAssignLeads), just
// with more than one id. One code path for one row and for a whole selection,
// rather than a loop of single-lead assigns from the client. ----
function BulkAssignModal({ store, leadIds = [], isOwner, onDone }) {
  const [busy, setBusy] = useState(false)
  const n = leadIds.length
  const noun = isOwner ? 'owner' : 'lead'
  const assign = (agentId) => {
    setBusy(true)
    const call = isOwner ? api.bulkAssignOwners : api.bulkAssignLeads
    call(leadIds, agentId)
      .then(res => {
        if (res?.success) {
          store.toast(agentId ? `${res.assigned ?? n} ${noun}${n === 1 ? '' : 's'} assigned` : `${res.assigned ?? n} ${noun}${n === 1 ? '' : 's'} unassigned`)
          store.reloadServer?.()
          onDone?.()
          store.closeModal()
        } else {
          store.toast(res?.message || 'Could not assign', 'warn')
          setBusy(false)
        }
      })
      .catch(err => { store.toast(err.message || 'Could not assign', 'warn'); setBusy(false) })
  }
  // Who is already carrying what. Handing twenty owners to whoever is at the
  // top of the roster is the mistake this modal exists to prevent, and the
  // number that prevents it was one query away and not being shown.
  const { data: desk } = useServerData(() => api.getDeskSummary(), [], null, '/workspace/desk-summary')
  const agents = store.activeAgents()

  return (
    <Modal title={`Assign ${n} ${noun}${n === 1 ? '' : 's'}`} onClose={store.closeModal} width={400}>
      <div className="pick-list">
        {agents.map(a => {
          const open = desk?.perAgent?.[a.id]?.open ?? 0
          return (
            <button key={a.id} className="pick-row" disabled={busy} onClick={() => assign(a.id)}>
              <Avatar agent={a} size="sm" />
              <span className="pick-name">{a.name || a.first}</span>
              <span className="pick-load">{open} open</span>
              <Icon name="chevRight" size={15} className="ic pick-go" />
            </button>
          )
        })}
        {!agents.length && <div className="detail-empty">No active team members to assign to.</div>}
      </div>
      {/* Taking work off the desk is a different intent from handing it to
          someone, so it does not sit in the same list as the people. */}
      <button className="pick-unassign" disabled={busy} onClick={() => assign(null)}>
        Leave unassigned
      </button>
    </Modal>
  )
}

// ---- Reassign all of an agent's leads ----
function ReassignModal({ store, fromId }) {
  const from = store.agentById(fromId)
  const others = store.activeAgents().filter(a => a.id !== fromId)
  const [to, setTo] = useState(others[0]?.id)
  const [done, setDone] = useState(false)
  const { data: desk } = useServerData(() => api.getDeskSummary(), [], null, '/workspace/desk-summary')
  const count = desk?.perAgent?.[fromId]?.open ?? 0
  const doIt = () => { store.reassignAll(fromId, to); setDone(true) }
  const toName = store.agentById(to)?.first
  return (
    <Modal title="Reassign leads" onClose={store.closeModal} width={420}>
      {done ? (
        <div style={{ textAlign: 'center' }}>
          <div style={{ width: 52, height: 52, margin: '0 auto 12px', borderRadius: '50%', background: 'var(--accent-wash)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="check" size={26} style={{ color: 'var(--accent)' }} /></div>
          <div style={{ fontFamily: 'var(--disp)', fontWeight: 600, fontSize: 16 }}>Moved {count} leads to {toName}</div>
          <div className="u-muted" style={{ fontSize: 12.5, marginTop: 5, marginBottom: 14 }}>Their pipeline is safe — no clients lost.</div>
          <Button variant="primary" block onClick={store.closeModal}>Done</Button>
        </div>
      ) : (
        <>
          <div style={{ fontSize: 13, color: 'var(--ink-2)', marginBottom: 14 }}>Move <b>{from?.first}</b>'s <b>{count}</b> active leads to:</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
            {others.map(a => (
              <button key={a.id} onClick={() => setTo(a.id)}
                style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 11px', border: '1px solid ' + (to === a.id ? 'var(--accent)' : 'var(--line)'), background: to === a.id ? 'var(--accent-wash)' : '#fff', borderRadius: 9, cursor: 'pointer', fontFamily: 'inherit' }}>
                <Avatar agent={a} size="sm" /><span style={{ flex: 1, textAlign: 'left', fontWeight: 600, fontSize: 13.5 }}>{a.first}</span>
                {to === a.id && <Icon name="check" style={{ color: 'var(--accent)' }} />}
              </button>
            ))}
          </div>
          <Button variant="primary" block onClick={doIt}>Reassign {count} leads</Button>
        </>
      )}
    </Modal>
  )
}

function AddAgentModal({ store }) {
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [loginId, setLoginId] = useState('')
  const [role, setRole] = useState('agent')
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState(null)   // { handle, byId, initialPassword } after creation
  const [copied, setCopied] = useState(false)
  const [left, setLeft] = useState(3)      // reveal stays locked open so it can't be dismissed by accident

  useEffect(() => {
    if (!done || left <= 0) return
    const t = setTimeout(() => setLeft(n => n - 1), 1000)
    return () => clearTimeout(t)
  }, [done, left])

  // What the agent's sign-in ID will actually be — shown live so it's never a
  // surprise. Mirrors the backend: typed ID wins, else slug of the name.
  const derivedId = (loginId.trim() || name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 16))

  const submit = () => {
    if (!name.trim()) { store.toast('Add a name first', 'warn'); return }
    // Managers log in by email; agents by an assigned ID (email optional).
    if (role === 'manager' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      store.toast('A manager needs a valid email to sign in.', 'warn'); return
    }
    setSaving(true)
    Promise.resolve(store.addAgent({ name: name.trim(), phone: phone.trim(), email: email.trim(), loginId: loginId.trim(), role }))
      .then(res => {
        if (res && res.success) {
          setDone({ handle: role === 'manager' ? email.trim() : (res.loginId || loginId.trim()), byId: role !== 'manager', initialPassword: res.initialPassword })
        } else { setSaving(false) }
      })
  }

  if (done) {
    const idLabel = done.byId ? 'User ID' : 'Email'
    const locked = left > 0
    const guardedClose = () => { if (!locked) store.closeModal() }
    const copyCreds = () => {
      const text = `${store.state.settings.firmName || 'Workspace'} sign-in\n${idLabel}: ${done.handle}\nTemporary password: ${done.initialPassword}`
      navigator.clipboard?.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500) }).catch(() => {})
    }
    return (
      <Modal title="Teammate added" onClose={guardedClose} width={400}>
        <div className="u-muted" style={{ fontSize: 13, marginBottom: 14 }}>Give these to {name.trim() || 'them'}. The password <b style={{ color: 'var(--ink)' }}>won't be shown again</b> — copy it now. They set their own on first sign-in.</div>
        <div style={{ background: 'var(--card-2)', border: '1px solid var(--line)', borderRadius: 10, padding: '12px 14px', marginBottom: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 13, padding: '4px 0' }}><span className="u-muted">{idLabel}</span><span className="mono-num" style={{ fontWeight: 600, wordBreak: 'break-all' }}>{done.handle}</span></div>
        </div>
        <div style={{ marginBottom: 14 }}>
          <div className="u-muted" style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 6 }}>Temporary password</div>
          <div className="mono-num" style={{ fontSize: 20, fontWeight: 700, letterSpacing: '.02em', background: 'var(--accent-wash)', color: 'var(--accent-ink)', border: '1px solid var(--accent-line)', borderRadius: 10, padding: '12px 14px', textAlign: 'center', wordBreak: 'break-all' }}>{done.initialPassword}</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Button variant="secondary" onClick={copyCreds}><Icon name={copied ? 'check' : 'copy'} size={14} />{copied ? 'Copied' : 'Copy'}</Button>
          <Button variant="primary" block onClick={guardedClose} disabled={locked}>{locked ? `Keep open (${left})` : 'Done'}</Button>
        </div>
      </Modal>
    )
  }

  return (
    <Modal title="Add teammate" onClose={store.closeModal} width={400}>
      <Field label="Full name"><Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Kiran Patil" autoFocus /></Field>
      <Field label="Access">
        <Segmented value={role} onChange={setRole} options={[{ value: 'agent', label: 'Sales agent' }, { value: 'manager', label: 'Manager' }]} />
      </Field>
      {role === 'agent' ? (
        <>
          <Field label="Login ID (optional — auto-created from the name)"><Input value={loginId} onChange={e => setLoginId(e.target.value.replace(/@/g, ''))} placeholder="e.g. kiran" /></Field>
          <div className="u-muted" style={{ fontSize: 12, marginTop: -6, marginBottom: 4 }}>
            Signs in as <b className="mono-num" style={{ color: 'var(--ink)' }}>{derivedId || '—'}</b>
          </div>
          <Field label="Email (optional)"><Input value={email} onChange={e => setEmail(e.target.value)} placeholder="kiran@firm.com" type="email" /></Field>
        </>
      ) : (
        <Field label="Email"><Input value={email} onChange={e => setEmail(e.target.value)} placeholder="kiran@firm.com" type="email" /></Field>
      )}
      <Field label="Mobile number (optional)"><PhoneInput value={phone} onChange={e => setPhone(e.target.value)} placeholder="98xxx xxxxx" /></Field>
      <div className="u-muted" style={{ fontSize: 12, margin: '2px 0 4px' }}>
        {role === 'manager'
          ? 'A manager signs in with their email + password and can self-reset by email. Managers see the whole desk.'
          : "A sales executive signs in with their ID + password. We'll create a starter password to hand over; the admin resets it if forgotten. Sales executives see only their own leads."}
      </div>
      <Button variant="primary" block disabled={saving} style={{ marginTop: 12 }} onClick={submit}>{saving ? 'Adding…' : 'Add to team'}</Button>
    </Modal>
  )
}

// ---- Call & SMS ----
// ---- Call / WhatsApp on a contact (B5): confirm, then redirect + log ----
// The universal "tap a phone icon anywhere" flow. Yes -> opens tel:/wa.me AND
// logs an author-attributed activity; No -> nothing recorded. If the caller
// can resolve a real backing record (recordType/recordId), the initiator can
// immediately attach an outcome + remark to what was just logged — otherwise
// (no resolvable record yet, e.g. a not-yet-split Owner contact) it still
// redirects, it just can't log anywhere real yet.
// The three ways out of this screen and into something that actually reaches
// the client. Kept as one table so the title, the verb and the destination
// can't drift apart.
const CHANNELS = {
  call: { title: 'Call', noun: 'call', dest: 'dialer' },
  wa: { title: 'WhatsApp', noun: 'WhatsApp message', dest: 'WhatsApp' },
  email: { title: 'Email', noun: 'email', dest: 'mail app' },
}
// Which outcome list a channel is asked from. Email has none — nothing sends
// one from here yet, and an empty dropdown teaches people to skip the control.
const outcomesFor = (channel) =>
  (channel === 'call' ? CALL_OUTCOMES : channel === 'wa' ? WA_OUTCOMES : null)

function ContactConfirmModal({ store, channel, name, phone, email, waText, recordType, recordId }) {
  const [step, setStep] = useState('confirm')   // 'confirm' | 'outcome'
  const [loggedId, setLoggedId] = useState(null)
  const [text, setText] = useState('')
  const [outcome, setOutcome] = useState('')
  const first = (name || 'them').split(' ')[0]
  const digits = String(phone || '').replace(/\D/g, '')
  const ch = CHANNELS[channel] || CHANNELS.call
  const label = ch.noun

  const proceed = () => {
    if (channel === 'email') {
      if (email) window.location.href = `mailto:${email}`
    } else if (digits) {
      if (channel === 'wa') {
        let msg = waText || ''
        if (!msg && recordType === 'lead' && recordId) {
          const lead = store.lookup('lead', recordId)
          if (lead) {
            msg = followUpMessage(lead, store.state.settings.firmName, {
              whatsappIntroTemplate: store.state.settings.whatsappIntroTemplate,
            })
          }
        }
        window.open(whatsappLink(msg, digits), '_blank', 'noopener')
      } else {
        window.location.href = `tel:+${digits.length > 10 ? digits : '91' + digits}`
      }
    }
    if (recordType && recordId) {
      store.logContactAction(recordType, recordId, channel).then(res => {
        if (res?.timeline_event?.id) { setLoggedId(res.timeline_event.id); setStep('outcome') }
        else store.closeModal()
      })
    } else {
      store.closeModal()
    }
  }

  const saveOutcome = () => {
    if (!text.trim() && !outcome) { store.closeModal(); return }
    store.editRemark(recordType, recordId, loggedId, text.trim(), outcome || undefined)
    // An outcome can move the lead's status on the server — "Call not received"
    // does, and that is the whole point of capturing it. Only the timeline entry
    // was being patched into local state, so the status pill kept showing the
    // old stage until something else happened to reload: the automation worked
    // and looked as though it had not, which is the fastest way to teach a desk
    // to stop trusting it. The call-log modal already reloads; this one didn't.
    store.reloadServer?.()
    store.closeModal()
  }

  if (step === 'outcome') {
    return (
      <Modal title={`${ch.title} logged`} onClose={store.closeModal} width={400}>
        <div className="u-muted" style={{ fontSize: 12.5, marginBottom: 14 }}>Optional — how did it go with {first}?</div>
        {/* The dropdown was gated to `call`, so a WhatsApp landed here with a
            free-text box and nothing else — which is why bhumi has 219 WhatsApp
            events and not one of them carries an outcome, against 186 calls that
            mostly do. The difference was never the channel; it was that one of
            them was asked and the other was not.
            A message ends differently from a call, so it gets its own list
            rather than being handed "No answer", which means nothing about a
            message that has been delivered and not yet opened. */}
        {outcomesFor(channel) && (
          <select className="input" value={outcome} onChange={e => setOutcome(e.target.value)} style={{ width: '100%', marginBottom: 10 }}>
            <option value="">No outcome yet</option>
            {outcomesFor(channel).map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        )}
        <Textarea value={text} onChange={e => setText(e.target.value)} placeholder="Add a remark…" />
        <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
          <Button onClick={store.closeModal}>Skip</Button>
          <Button variant="primary" style={{ flex: 1, justifyContent: 'center' }} onClick={saveOutcome}>Save</Button>
        </div>
      </Modal>
    )
  }

  return (
    <Modal title={ch.title} onClose={store.closeModal} width={400}>
      <div className="u-muted" style={{ fontSize: 12.5, marginTop: -6, marginBottom: 14 }}>
        {name} · {channel === 'email' ? (email || '—') : <span className="mono-num">{phone || '—'}</span>}
      </div>
      <div style={{ fontSize: 13.5, lineHeight: 1.5, marginBottom: 16 }}>
        This records an action and will redirect you to your {ch.dest}. Continue?
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <Button onClick={store.closeModal}>No</Button>
        <Button variant="primary" style={{ flex: 1, justifyContent: 'center' }} icon={channel === 'wa' ? 'wa' : 'phone'} onClick={proceed}>Yes, continue</Button>
      </div>
    </Modal>
  )
}

// ---- Schedule a callback on an owner ----------------------------------------
// A cold call ends one of two ways: a decision, or "call me back". The second
// one is most of them, and until this existed there was nowhere to put the
// when — the Callback status was a label with no time behind it.
//
// The quick options are what a caller actually says out loud. They round to a
// sensible working hour rather than "now + 2h" landing at 9:40pm; the exact
// picker below is there for when the owner names a time.
const CALLBACK_PRESETS = [
  { key: '2h', label: 'In 2 hours', at: () => new Date(Date.now() + 2 * 3600e3) },
  { key: 'eod', label: 'Later today', at: () => atHour(new Date(), 17) },
  { key: 'tmr', label: 'Tomorrow morning', at: () => atHour(addDays(new Date(), 1), 11) },
  { key: '3d', label: 'In 3 days', at: () => atHour(addDays(new Date(), 3), 11) },
  { key: 'week', label: 'Next week', at: () => atHour(addDays(new Date(), 7), 11) },
]
const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n)
const atHour = (d, h) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), h, 0, 0, 0)
// <input type="datetime-local"> wants local wall-clock with no zone, and
// toISOString() would hand it UTC — an hour picked at 11am would come back 5:30.
const toLocalInput = (d) => {
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}

function OwnerCallbackModal({ store, ownerId }) {
  // The cache holds whatever list the record was opened from, but this modal
  // also opens from Today and from the action button, where it may never have
  // been. Fetch is the fallback, not the path — an already-cached owner never
  // waits on the network to see its own existing callback.
  const cached = store.lookup('owner', ownerId)
  const { data: fetched } = useServerData(
    () => (cached ? Promise.resolve(null) : api.getOwner(ownerId).then(r => r?.owner || null)),
    [ownerId, !!cached], null)
  const owner = cached || fetched
  const [when, setWhen] = useState(() => toLocalInput(CALLBACK_PRESETS[2].at()))
  const [note, setNote] = useState('')
  // Only seeds from an existing callback, and only once it is known — typing
  // into the note and having a late fetch wipe it is the bug this guards.
  const seeded = useRef(false)
  useEffect(() => {
    if (seeded.current || !owner) return
    seeded.current = true
    if (owner.callbackAt) setWhen(toLocalInput(new Date(owner.callbackAt)))
    if (owner.callbackNote) setNote(owner.callbackNote)
  }, [owner])

  const save = () => {
    const d = new Date(when)
    if (isNaN(d)) { store.toast('Pick a date and time', 'warn'); return }
    store.setOwnerCallback(ownerId, d.toISOString(), note.trim() || null)
    store.closeModal()
  }
  const clear = () => { store.setOwnerCallback(ownerId, null); store.closeModal() }

  return (
    <Modal title={owner?.callbackAt ? 'Reschedule callback' : 'Schedule callback'} onClose={store.closeModal} width={420}>
      <div className="cb-presets">
        {CALLBACK_PRESETS.map(p => {
          const v = toLocalInput(p.at())
          return (
            <button key={p.key} className={'cb-preset' + (v === when ? ' on' : '')} onClick={() => setWhen(v)}>
              {p.label}
            </button>
          )
        })}
      </div>
      <Field label="Call back at">
        <Input type="datetime-local" value={when} onChange={e => setWhen(e.target.value)} />
      </Field>
      <Field label="What to say (optional)">
        <Textarea value={note} onChange={e => setNote(e.target.value)} placeholder="Wants a valuation before deciding…" />
      </Field>
      <div className="m-actions">
        {owner?.callbackAt && <Button variant="quiet" onClick={clear}>Clear callback</Button>}
        <Button variant="primary" onClick={save}>{owner?.callbackAt ? 'Reschedule' : 'Schedule'}</Button>
      </div>
    </Modal>
  )
}

// ---- Add remark (B1): a threaded, timestamped note on a lead or property ----
function RemarkModal({ store, recordType, recordId }) {
  const [text, setText] = useState('')
  const submit = () => {
    if (!text.trim()) { store.toast('Type a remark first', 'warn'); return }
    store.addRemark(recordType, recordId, text.trim())
    store.closeModal()
  }
  return (
    <Modal title="Add remark" onClose={store.closeModal} width={400}>
      <Textarea value={text} onChange={e => setText(e.target.value)} placeholder="Add a remark to this record…" autoFocus />
      <Button variant="primary" block style={{ marginTop: 14 }} onClick={submit}>Add remark</Button>
    </Modal>
  )
}

// ============================================================================
// 📍 VisitProofModal (B4) — a site visit you can't log from the sofa
// ============================================================================
// Three gates, in order, none skippable:
//   1. Location — asked for FIRST, before the camera even opens. If it's
//      denied there is no visit to log, so there's no point letting someone
//      shoot a photo and only then telling them it was wasted.
//   2. A live photo — camera stream only, no gallery (see CameraCapture).
//   3. An outcome — what actually came of the visit.
// The remark is the one optional field: sometimes the outcome says it all.
//
// Every one of these is re-checked server-side. The UI ordering is a courtesy
// to the agent, not the enforcement.
// ============================================================================
// VISIT_OUTCOMES now lives in src/data/callOutcomes.js beside the call and
// message vocabularies — it was a second copy keyed on `key` while the timeline
// kept a third as a label map.

function VisitProofModal({ store, leadId, propId }) {
  const l = store.lookup('lead', leadId)
  const [step, setStep] = useState('geo')          // geo → shoot → confirm
  const [geo, setGeo] = useState(null)
  const [geoErr, setGeoErr] = useState('')
  const [geoBusy, setGeoBusy] = useState(false)
  const [geoPerm, setGeoPerm] = useState('unknown') // granted | prompt | denied | unknown
  const [shot, setShot] = useState(null)           // { blob, url }
  const [outcome, setOutcome] = useState('')
  const [remark, setRemark] = useState('')
  const [busy, setBusy] = useState(false)
  // Whichever unit the modal was opened from, if any. Not a control.
  const property = propId || ''

  // ASK ONLY WHEN THE BROWSER WILL ACTUALLY ASK.
  //
  // This fired getPosition() straight from the mount effect. On an installed
  // Android PWA that request carries no user gesture, so a site Chrome has
  // auto-blocked (what dismissing the prompt a couple of times does) is denied
  // instantly and silently — no prompt, ever, and the modal said "turn it on in
  // your browser settings" for a permission the agent had never been offered.
  //
  // So: read the permission first. Already granted, take the fix now. Still
  // askable, put a button on screen and make the request inside that tap, which
  // is the only reliable way to raise the prompt. Blocked, say so honestly —
  // nothing this modal does can lift it.
  useEffect(() => {
    let alive = true
    geoPermission().then(st => {
      if (!alive) return
      setGeoPerm(st)
      if (st === 'granted' || st === 'unknown') fetchGeo()
    })
    return () => { alive = false }
  }, [])

  // The captured frame is held as an object URL for preview; release it when
  // it's replaced or the modal closes, or we leak the whole bitmap.
  useEffect(() => () => { if (shot?.url) URL.revokeObjectURL(shot.url) }, [shot])

  const fetchGeo = () => {
    setGeoErr('')
    setGeoBusy(true)
    getPosition()
      .then(p => { setGeo(p); setStep('shoot') })
      .catch(e => setGeoErr(e.message))
      .finally(async () => { setGeoBusy(false); setGeoPerm(await geoPermission()) })
  }

  const onCapture = (blob) => {
    if (shot?.url) URL.revokeObjectURL(shot.url)
    setShot({ blob, url: URL.createObjectURL(blob) })
    setStep('confirm')
  }

  const submit = async () => {
    if (!outcome) { store.toast('Pick what came of the visit', 'warn'); return }
    if (!geo || !shot) { store.toast('A location and a live photo are both required', 'warn'); return }
    setBusy(true)
    try {
      // Watermark carries its own provenance — firm, time, coordinates — so
      // the proof still means something if the file is ever viewed outside
      // the CRM. Stamped before upload; the stored bytes are the marked ones.
      const stamped = await processImage(shot.blob, [
        store.state.settings.firmName || 'Site visit',
        new Date().toLocaleString(),
        `${geo.lat.toFixed(5)}, ${geo.lng.toFixed(5)} · ±${Math.round(geo.accuracy || 0)}m`,
      ])
      const photoKey = await uploadMedia(stamped, 'visit-proof')
      const res = await store.logActivity(leadId, {
        type: 'site_visit',
        propertyId: property || undefined,
        remark: remark.trim() || undefined,
        outcome,
        photoKey,
        geo,
      })
      if (res) {
        // Completing the visit also clears the appointment — that's what the
        // agent came here to do; making them press Done again would be silly.
        // The SERVER does it now, inside the same write that records the visit
        // (addActivity → closeSiteVisitAppointment). It was a second request
        // from here, and the record re-read the lead in the gap between the
        // two: the appointment card vanished, came back, and vanished again.
        store.toast('Site visit logged with proof')
        store.closeModal()
      }
    } catch (e) {
      store.toast(e.message || 'Could not save the visit', 'warn')
    } finally {
      setBusy(false)
    }
  }

  if (!l) return null

  return (
    <Modal title={`Log site visit — ${l.name}`} onClose={busy ? () => {} : store.closeModal} width={460}>
      {step === 'geo' && (
        <div className="vp-gate">
          {geoErr ? (
            <>
              <Icon name="alert" size={26} />
              <p className="vp-gate-t">Location needed</p>
              <p className="vp-gate-s">{geoErr}</p>
              {geoPerm !== 'denied' && (
                <Button variant="primary" block disabled={geoBusy} onClick={fetchGeo}>
                  {geoBusy ? 'Getting location…' : 'Try again'}
                </Button>
              )}
            </>
          ) : geoBusy ? (
            <>
              <Icon name="mapPin" size={26} />
              <p className="vp-gate-t">Getting your location…</p>
            </>
          ) : (
            <>
              <Icon name="mapPin" size={26} />
              <p className="vp-gate-t">Location needed</p>
              <Button variant="primary" block onClick={fetchGeo}>Turn on location</Button>
            </>
          )}
        </div>
      )}

      {step === 'shoot' && (
        <>
          <div className="vp-geo-ok">
            <Icon name="check" size={13} />
            Location captured · ±{Math.round(geo?.accuracy || 0)}m
          </div>
          <CameraCapture onCapture={onCapture} />
        </>
      )}

      {step === 'confirm' && (
        <div className="vp-confirm">
          <img src={shot.url} alt="Visit photo" className="vp-shot" />
          <button type="button" className="vp-retake" onClick={() => setStep('shoot')}>
            <Icon name="refresh" size={13} /> Retake
          </button>

          <Field label="What came of it?">
            <div className="vp-outcomes">
              {VISIT_OUTCOMES.map(o => (
                <button
                  key={o.value}
                  type="button"
                  className={'qchip' + (outcome === o.value ? ' on' : '')}
                  onClick={() => setOutcome(o.value)}
                >{o.label}</button>
              ))}
            </div>
          </Field>

          {/* NO UNIT PICKER. A visit is logged standing outside a building with
              a client waiting, and this asked a third question — optional, and
              answered "Not tied to one unit" on 8 of the 9 visits ever logged.
              A visit still REFERENCES a unit when the modal is opened from one
              (`propId`); it is no longer a question put to the agent.

              The cost, stated: `metadata.distanceM` — "180m from the listing" on
              the timeline — needs a property to measure against, so a visit
              logged from the lead screen now shows its coordinates instead of a
              distance. Both are a link to the same map pin. */}

          <Field label="Remark (optional)">
            <Textarea value={remark} onChange={e => setRemark(e.target.value)} placeholder="What happened on the visit?" />
          </Field>

          <Button variant="primary" block disabled={busy} onClick={submit}>
            {busy ? 'Saving…' : 'Log visit'}
          </Button>
        </div>
      )}
    </Modal>
  )
}


// ============================================================================
// 🛋️ AmenitiesModal (spec C4 furnishing block)
// ============================================================================
// Behind a button rather than inline, because ~30 checkboxes in the middle of
// the add flow buries the fields that actually make a listing matchable.
//
// Two genuinely different kinds of thing here, which is why they render
// differently: a Sofa either exists or it doesn't, but "2 ACs" and "5 ACs" are
// materially different to whoever is renting the place — so those get a
// counter, not a checkbox.
// `only:'society'` drops the furnishing halves. An unfurnished flat still sits
// in a society with a lift and a gym — those are the building's, not the
// flat's — but offering "Sofa / Fridge / How many ACs?" on a place with no
// furniture is asking a question whose answer is already on the screen.
function AmenitiesModal({ store, value = {}, onDone, only = 'all' }) {
  const showFurnishing = only !== 'society'
  const [fixtures, setFixtures] = useState(value.fixtures || [])
  const [counted, setCounted] = useState(value.countedItems || {})
  const [amenities, setAmenities] = useState(value.societyAmenities || [])

  const toggle = (list, setList, v) => {
    const s = new Set(list)
    s.has(v) ? s.delete(v) : s.add(v)
    setList([...s])
  }
  const bump = (k, n) => setCounted(c => {
    const next = { ...c }
    // Drop zeroes rather than storing them — "0 fans" is not a fact worth
    // keeping, and it would otherwise count toward "selected".
    if (n <= 0) delete next[k]; else next[k] = n
    return next
  })

  const total = fixtures.length + amenities.length + Object.keys(counted).length

  const done = () => {
    onDone?.({ fixtures, countedItems: counted, societyAmenities: amenities })
    store.closeModal()
  }

  return (
    <Modal title={showFurnishing ? 'Furnishings & amenities' : 'Society amenities'} onClose={store.closeModal} width={620}>
      <div className="am">
        {showFurnishing && (
          <div className="am-sec">
            <div className="am-head"><h4>Flat furnishings</h4><span>{fixtures.length} selected</span></div>
            <div className="am-grid">
              {FIXTURES.map(f => (
                <button key={f.value} type="button"
                  className={'am-cell' + (fixtures.includes(f.value) ? ' on' : '')}
                  onClick={() => toggle(fixtures, setFixtures, f.value)}>{f.label}</button>
              ))}
            </div>
          </div>
        )}

        {showFurnishing && (
          <div className="am-sec">
            <div className="am-head"><h4>How many?</h4><span>{Object.keys(counted).length} set</span></div>
            <div className="am-counts">
              {COUNTED_ITEMS.map(c => (
                <div key={c.value} className="pw-counter">
                  <span className="pw-counter-l">{c.label}</span>
                  <div className="pw-counter-c">
                    <button type="button" onClick={() => bump(c.value, (counted[c.value] || 0) - 1)} aria-label={`Fewer ${c.label}`}>-</button>
                    <span>{counted[c.value] || 0}</span>
                    <button type="button" onClick={() => bump(c.value, (counted[c.value] || 0) + 1)} aria-label={`More ${c.label}`}>+</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="am-sec">
          <div className="am-head"><h4>Society amenities</h4><span>{amenities.length} selected</span></div>
          <div className="am-grid">
            {SOCIETY_AMENITIES.map(a => (
              <button key={a.value} type="button"
                className={'am-cell' + (amenities.includes(a.value) ? ' on' : '')}
                onClick={() => toggle(amenities, setAmenities, a.value)}>{a.label}</button>
            ))}
          </div>
        </div>
      </div>
      <Button variant="primary" block style={{ marginTop: 14 }} onClick={done}>
        {total ? `Done · ${total} selected` : 'Done'}
      </Button>
    </Modal>
  )
}

// Statuses come from the canonical vocabulary, not a list typed here.
//
// This modal WROTE 'Under offer' and 'Closed' — neither of which exists in
// STATUS ('Under Offer', and there is no 'Closed'). So setting a status here
// put a value in the database that the filter couldn't match, the status tag
// had no colour for, and the lifecycle stepper didn't recognise. A read-side
// drift shows the wrong thing; a write-side one corrupts the row.
function StatusModal({ store, propId }) {
  const p = store.lookup('property', propId)
  // A sale doesn't get Leased and a let doesn't get Sold — offering both is
  // how a listing ends up marked with the other deal's ending.
  const options = STATUS
    .map(s => s.value)
    .filter(s => (s === 'Sold' ? p?.deal !== 'rent' : s === 'Leased' ? p?.deal === 'rent' : true))
  return (
    <Modal title="Status" onClose={store.closeModal} width={360}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {options.map(s => (
          <button key={s} onClick={() => { store.setPropStatus(propId, s); store.closeModal() }}
            style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 12px', border: '1px solid ' + (p?.status === s ? 'var(--accent)' : 'var(--line)'), background: p?.status === s ? 'var(--accent-wash)' : '#fff', borderRadius: 9, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600 }}>
            <span style={{ flex: 1, textAlign: 'left' }}>{s}</span>
            {p?.status === s && <Icon name="check" style={{ color: 'var(--accent)' }} />}
          </button>
        ))}
      </div>
    </Modal>
  )
}


// ---- Structured site-visit outcome (Liked / Rejected + reason) ----
const REJECT_REASONS = ['Price / budget', 'Vaastu / facing', 'Floor', 'Location', 'Noise', 'Size / layout', 'Furnishing', 'Parking']
function VisitFeedbackModal({ store, leadId, propId }) {
  const l = store.lookup('lead', leadId)
  // The property comes from the lead's shortlist first. Reading only the
  // browser cache returned null on any desk with paged inventory, and the
  // guard below then rendered NOTHING — the button opened a modal that was
  // not there, with no error and no toast.
  const p = (l?.shortlistProps || []).find(x => x.id === propId) || store.lookup('property', propId)
  const [verdict, setVerdict] = useState('liked')
  const [reason, setReason] = useState(REJECT_REASONS[0])
  if (!l || !p) return null
  const save = () => { store.visitFeedback(leadId, propId, verdict, verdict === 'rejected' ? reason : null, p.society); store.closeModal() }
  return (
    <Modal title="Log site-visit outcome" onClose={store.closeModal} width={420}>
      <div className="u-muted" style={{ fontSize: 12.5, marginTop: -6, marginBottom: 14 }}><b style={{ color: 'var(--ink)' }}>{l.name}</b> visited <b style={{ color: 'var(--ink)' }}>{p.society}</b> ({p.type} · {p.locality})</div>
      <Segmented block value={verdict} onChange={setVerdict}
        options={[{ value: 'liked', label: '👍 Liked' }, { value: 'rejected', label: '👎 Rejected' }]} />
      {verdict === 'rejected' && (
        <>
          <div style={{ fontSize: 11, letterSpacing: '.05em', textTransform: 'uppercase', color: 'var(--muted)', fontWeight: 600, margin: '16px 0 8px' }}>Reason — refines future matches</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
            {REJECT_REASONS.map(r => <button key={r} className={'qchip' + (reason === r ? ' on' : '')} onClick={() => setReason(r)}>{r}</button>)}
          </div>
        </>
      )}
      <Button variant="primary" block style={{ marginTop: 18 }} onClick={save}>Save outcome</Button>
    </Modal>
  )
}

// Every term the person typed must match somewhere in the record — an AND
// across words, not one big substring. Typing "rahul baner" narrows to leads
// that mention BOTH "rahul" and "baner" (anywhere across their searchable
// fields), the way a second word is expected to narrow, not widen, a search.
function matchesAllTerms(haystacks, terms) {
  const text = haystacks.filter(Boolean).join(' ').toLowerCase()
  return terms.every(t => text.includes(t))
}

// ---- Global search ----
function SearchModal({ store, go }) {
  const [q, setQ] = useState('')
  const term = q.trim()
  // Searched in Postgres. Filtering two downloaded arrays was the last feature
  // that genuinely required the whole book to be in the browser.
  const { data: hits, loading: searching } = useServerData(
    () => term.length >= 2 ? api.search(term, 5) : Promise.resolve({ leads: [], properties: [] }),
    [term], { leads: [], properties: [] })
  const leads = hits?.leads || []
  const props = hits?.properties || []
  const close = () => store.setSearch(false)
  const goTo = (fn) => { fn(); close() }

  const panelRef = useRef(null)
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') close() }
    // mousedown (not click) so the outside-click that OPENED search — still
    // bubbling as a click when this listener attaches — can't immediately
    // close it again; and this fires even if a result button's own onClick
    // does something async that a plain overlay-backdrop click could race.
    const onDown = (e) => { if (panelRef.current && !panelRef.current.contains(e.target)) close() }
    window.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onDown)
    return () => { window.removeEventListener('keydown', onKey); document.removeEventListener('mousedown', onDown) }
  }, [])

  return (
    <div className="overlay top">
      <div ref={panelRef} style={{ width: 520, maxWidth: '100%', background: 'var(--bg)', borderRadius: 14, boxShadow: 'var(--shadow-pop)', overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px', borderBottom: '1px solid var(--line)' }}>
          <Icon name="search" style={{ color: 'var(--muted)' }} />
          <input value={q} onChange={e => setQ(e.target.value)} autoFocus placeholder="Search leads, properties, people…" style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', fontFamily: 'var(--sans)', fontSize: 15, color: 'var(--ink)' }} />
          <button className="btn btn-icon btn-quiet" onClick={close}><Icon name="x" /></button>
        </div>
        <div style={{ maxHeight: '60vh', overflowY: 'auto', padding: '6px 8px 10px' }}>
          {term.length < 2 && <div className="u-muted" style={{ padding: 22, textAlign: 'center', fontSize: 13 }}>Type a name, society, locality, or number.</div>}
          {term.length >= 2 && searching && !leads.length && !props.length && <div className="u-muted" style={{ padding: 22, textAlign: 'center', fontSize: 13 }}>Searching…</div>}
          {term.length >= 2 && !searching && !leads.length && !props.length && <div className="u-muted" style={{ padding: 22, textAlign: 'center', fontSize: 13 }}>No matches for “{q}”.</div>}
          {leads.length > 0 && <div style={{ fontSize: 10, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--muted)', fontWeight: 700, padding: '10px 10px 5px' }}>Leads</div>}
          {leads.map(l => (
            <button key={l.id} type="button" onClick={() => goTo(() => go('leads', { leadId: l.id, leadOpen: true }))} style={{ textAlign: 'left', width: '100%', background: 'transparent', border: 'none', borderRadius: 8, padding: '9px 10px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 9, fontFamily: 'inherit' }}>
              <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontWeight: 600 }}>{l.name}</div><div className="u-muted" style={{ fontSize: 12 }}>{[l.phone, l.locality].filter(Boolean).join(' · ')}</div></div>
              <StageTag stage={l.stage} />
            </button>
          ))}
          {props.length > 0 && <div style={{ fontSize: 10, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--muted)', fontWeight: 700, padding: '10px 10px 5px' }}>Properties</div>}
          {props.map(p => (
            <button key={p.id} type="button" onClick={() => goTo(() => go('properties', { propId: p.id, propOpen: true }))} style={{ textAlign: 'left', width: '100%', background: 'transparent', border: 'none', borderRadius: 8, padding: '9px 10px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 9, fontFamily: 'inherit' }}>
              <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontWeight: 600 }}>{p.project || p.title}</div><div className="u-muted" style={{ fontSize: 12 }}>{[p.title, p.locality].filter(Boolean).join(' · ')}</div></div>
              <Money>{p.price}</Money>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

// ---- Right-Side Slide-In Notifications Drawer ----
export function NotifModal({ store, go }) {
  const close = () => store.setNotif(false)
  const notifs = store.state.notifications || []
  // The drawer's "N new" is the server's total unread, not how many of the 30
  // fetched rows happen to be unread — those are different numbers the moment
  // someone has more than a page of them.
  const unreadNotifs = store.state.notifUnread || 0
  const [filter, setFilter] = useState('all') // 'all' | 'unread' | 'assigned'
  // Back is handled centrally in useNav now, for every overlay at once — this
  // drawer was the only one that had ever grown its own handler, which is why
  // back closed the alerts but left a half-typed lead form sitting there.
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') close() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const openNotif = (n) => {
    if (!n.read) store.markAllNotifsRead()
    const m = (n.link || '').match(/lead=([^&]+)/)
    close()
    if (m) go('leads', { leadId: m[1], leadOpen: true })
    else go('leads')
  }

  const notifAgo = (ts) => {
    if (!ts) return ''
    const mins = Math.max(0, Math.floor((Date.now() - new Date(ts).getTime()) / 60000))
    if (mins < 1) return 'just now'
    if (mins < 60) return `${mins}m ago`
    const hrs = Math.floor(mins / 60)
    return hrs < 24 ? `${hrs}h ago` : `${Math.floor(hrs / 24)}d ago`
  }

  const filteredNotifs = notifs.filter(n => {
    if (filter === 'unread') return !n.read
    if (filter === 'assigned') return (n.title || '').toLowerCase().includes('assign') || (n.body || '').toLowerCase().includes('assign')
    return true
  })

  return (
    <div className="notif-drawer-overlay" onClick={close}>
      <div className="notif-drawer" onClick={e => e.stopPropagation()}>
        <div className="notif-drawer-head" style={{ borderBottom: '1px solid var(--line)', padding: '16px 20px' }}>
          <div className="nd-title" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Icon name="bell" size={18} />
            <span style={{ fontSize: 16, fontWeight: 700 }}>Notifications</span>
            {unreadNotifs > 0 && (
              <span className="nd-badge" style={{ background: 'var(--accent)', color: '#fff', padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 700 }}>
                {unreadNotifs} new
              </span>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {unreadNotifs > 0 && (
              <button
                type="button"
                className="btn-quiet"
                style={{ fontSize: 12, color: 'var(--accent)', fontWeight: 600, border: 'none', background: 'transparent', cursor: 'pointer' }}
                onClick={() => store.markAllNotifsRead()}
              >
                Mark all read
              </button>
            )}
            <button className="btn btn-icon btn-quiet" onClick={close} title="Close drawer (Esc)">
              <Icon name="x" size={16} />
            </button>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 6, padding: '10px 16px', borderBottom: '1px solid var(--line)', background: 'var(--card-2)' }}>
          <button
            className={`qchip ${filter === 'all' ? 'on' : ''}`}
            onClick={() => setFilter('all')}
          >
            All ({notifs.length})
          </button>
          <button
            className={`qchip ${filter === 'unread' ? 'on' : ''}`}
            onClick={() => setFilter('unread')}
          >
            {/* Counts the rows this tab will actually show, not the server's
                total — those are different numbers once someone has more than
                a page of alerts, and a tab promising 55 that opens onto 30 is
                the same lie the bell used to tell. The true total is the
                "N new" in the header above, which is a different question. */}
            Unread ({notifs.filter(n => !n.read).length})
          </button>
          <button
            className={`qchip ${filter === 'assigned' ? 'on' : ''}`}
            onClick={() => setFilter('assigned')}
          >
            {/* By TYPE. It matched on the title text, so it emptied itself
                the moment any assignment copy changed. */}
            Assignments ({notifs.filter(isAssignment).length})
          </button>
        </div>

        <div className="notif-drawer-body" style={{ padding: 12, flex: 1, overflowY: 'auto' }}>
          {!store.state.notifLoaded ? (
            <div className="empty" style={{ margin: 'auto 0', padding: '60px 20px', textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>Loading…</div>
          ) : filteredNotifs.length === 0 ? (
            <div className="empty" style={{ margin: 'auto 0', padding: '60px 20px', textAlign: 'center' }}>
              <div style={{ width: 44, height: 44, borderRadius: 12, background: 'var(--card-2)', border: '1px solid var(--line)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px', color: 'var(--muted)' }}>
                <Icon name="check" size={20} />
              </div>
              <div className="e-t" style={{ fontWeight: 600, fontSize: 15 }}>No notifications found</div>
              <div className="e-s" style={{ color: 'var(--muted)', fontSize: 13, marginTop: 4 }}>No items match your current filter.</div>
            </div>
          ) : (
            filteredNotifs.map(n => (
              <button
                key={n.id}
                className={`notif-alert-row${n.read ? '' : ' is-unread'}`}
                style={{
                  display: 'flex', alignItems: 'flex-start', gap: 12, width: '100%', padding: '14px',
                  background: n.read ? 'transparent' : 'var(--accent-wash)', border: '1px solid var(--line)',
                  borderRadius: 12, marginBottom: 8, textAlign: 'left', cursor: 'pointer'
                }}
                onClick={() => openNotif(n)}
              >
                {/* The icon comes from the type, not from a character someone
                    typed at the front of the title. See notificationMeta.js. */}
                <span className={'notif-ico t-' + notifMeta(n.type).tone}>
                  <Icon name={notifMeta(n.type).icon} size={15} />
                </span>
                <div className="notif-alert-content" style={{ flex: 1, minWidth: 0 }}>
                  <div className="notif-alert-title" style={{ fontWeight: 600, fontSize: 13.5, color: 'var(--ink)' }}>{cleanTitle(n.title)}</div>
                  {n.body && <div className="notif-alert-body" style={{ fontSize: 12.5, color: 'var(--ink-2)', marginTop: 2 }}>{n.body}</div>}
                </div>
                <span className="notif-alert-ago" style={{ fontSize: 11, color: 'var(--muted)', flexShrink: 0 }}>{notifAgo(n.created_at)}</span>
              </button>
            ))
          )}
        </div>

      </div>
    </div>
  )
}

// A day chip is a real date wearing a friendly label. It used to be the label
// alone: the modal stored the literal string "This Sunday", and one of the
// options was the hardcoded date 2026-07-15, a month in the past by the time a
// live desk was using it. Nothing downstream could sort, query or fire on any
// of it — which is why an appointment booked on a live desk never reached the
// calendar and no reminder has ever gone out.
const ymdOf = (d) => {
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}
// Next occurrence of a weekday, never today — "this Saturday" said on a
// Saturday means the coming one, not the one you are standing in.
const nextDow = (dow) => {
  const now = new Date()
  return addDays(now, ((dow - now.getDay() + 7) % 7) || 7)
}
const dayChips = () => {
  const now = new Date()
  const short = (d) => d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
  return [
    { ymd: ymdOf(now), label: 'Today' },
    { ymd: ymdOf(addDays(now, 1)), label: 'Tomorrow' },
    { ymd: ymdOf(nextDow(6)), label: `Sat ${short(nextDow(6))}` },
    { ymd: ymdOf(nextDow(0)), label: `Sun ${short(nextDow(0))}` },
  ]
}
// "10:30 am" from a chip, "14:30" from the exact picker. Both end up as an
// hour and a minute on the chosen day, in the user's own zone.
const parseTimeOfDay = (s) => {
  const m12 = String(s || '').match(/^(\d{1,2}):(\d{2})\s*(am|pm)$/i)
  if (m12) return { h: (Number(m12[1]) % 12) + (/pm/i.test(m12[3]) ? 12 : 0), m: Number(m12[2]) }
  const m24 = String(s || '').match(/^(\d{1,2}):(\d{2})$/)
  return m24 ? { h: Number(m24[1]), m: Number(m24[2]) } : { h: 11, m: 0 }
}
const instantOf = (ymd, timeStr) => {
  const [y, mo, d] = String(ymd).split('-').map(Number)
  const { h, m } = parseTimeOfDay(timeStr)
  const dt = new Date(y, (mo || 1) - 1, d || 1, h, m, 0, 0)
  return isNaN(dt.getTime()) ? null : dt.toISOString()
}

function ScheduleFollowUpModal({ store, leadId }) {
  const l = store.lookup('lead', leadId)
  const [action, setAction] = useState('Site Visit')
  const chips = dayChips()
  const [day, setDay] = useState(chips[1].ymd)
  const [customDate, setCustomDate] = useState(chips[1].ymd)
  const [useCustomDate, setUseCustomDate] = useState(false)
  const [time, setTime] = useState('11:00 am')
  const [customTime, setCustomTime] = useState('11:00')
  const [useCustomTime, setUseCustomTime] = useState(false)
  const [note, setNote] = useState('')

  if (!l) return null

  const saveAppointment = () => {
    const finalDate = useCustomDate ? customDate : day
    const finalTime = useCustomTime ? customTime : time
    const fullAction = `${action} — ${l.name}`
    store.setFollowUp(l.id, {
      action: fullAction,
      // `at` is the appointment. date/time are kept only so the three rows
      // written before this fix keep rendering; everything new reads `at`.
      at: instantOf(finalDate, finalTime),
      date: finalDate,
      time: finalTime,
      note: note.trim() || undefined,
    })
    // NO addNote HERE. This wrote the booking into the timeline as a plain
    // remark — editable, pencil and all — so the record of an appointment being
    // made could be rewritten into any sentence at all. updateLead writes it
    // server-side now, as its own type. See the follow_up block in store.ts.
    store.toast(`Follow-up scheduled: ${action} on ${finalDate} at ${finalTime}`)
    store.closeModal()
  }

  const pill = (on, onClick, label) => (
    <button key={label} type="button" className={'qchip' + (on ? ' on' : '')} onClick={onClick}>{label}</button>
  )

  return (
    <Modal title={`Schedule follow-up — ${l.name}`} onClose={store.closeModal} width={480}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div className="field">
          <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink)' }}>Activity Type</label>
          <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginTop: 5 }}>
            {['Site Visit', 'Client Meeting', 'Follow-up Call', 'Online Demo'].map(t =>
              pill(action === t, () => setAction(t), t)
            )}
          </div>
        </div>

        <div className="field">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink)' }}>Date</label>
            <button type="button" onClick={() => setUseCustomDate(!useCustomDate)}
              style={{ fontSize: 11.5, color: 'var(--primary)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}>
              {useCustomDate ? 'Pick Quick Day' : 'Pick Custom Calendar Date'}
            </button>
          </div>
          {useCustomDate ? (
            <input type="date" value={customDate} onChange={e => setCustomDate(e.target.value)}
              style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid var(--line)', marginTop: 5, fontSize: 13, fontFamily: 'inherit' }} />
          ) : (
            <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginTop: 5 }}>
              {chips.map(c =>
                pill(day === c.ymd, () => { setDay(c.ymd); setUseCustomDate(false) }, c.label)
              )}
            </div>
          )}
        </div>

        <div className="field">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink)' }}>Time Slot</label>
            <button type="button" onClick={() => setUseCustomTime(!useCustomTime)}
              style={{ fontSize: 11.5, color: 'var(--primary)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}>
              {useCustomTime ? 'Pick Quick Time' : 'Enter Exact Time'}
            </button>
          </div>
          {useCustomTime ? (
            <input type="time" value={customTime} onChange={e => setCustomTime(e.target.value)}
              style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid var(--line)', marginTop: 5, fontSize: 13, fontFamily: 'inherit' }} />
          ) : (
            <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginTop: 5 }}>
              {['10:30 am', '11:30 am', '2:30 pm', '4:30 pm', '6:00 pm'].map(t =>
                pill(time === t, () => { setTime(t); setUseCustomTime(false) }, t)
              )}
            </div>
          )}
        </div>

        {/* "Assigned Sales Executive" was here: a dropdown of the whole team
            that wrote followUp.agentId, a field NOTHING in this codebase reads.
            It looked like it handed the visit to a colleague and it did not
            move the lead, did not notify them, and did not appear on their
            Today. A control that appears to delegate work and silently drops it
            is worse than no control — the appointment belongs to whoever the
            lead is assigned to, and reassigning is done on the lead itself. */}

        <Field label="Agenda or location (optional)">
          <Input value={note} onChange={e => setNote(e.target.value)} placeholder="e.g. Meet at Hinjewadi Phase 3 sales lounge" />
        </Field>

        <Button variant="primary" block onClick={saveAppointment} icon="calendar" style={{ padding: 12, fontWeight: 600 }}>
          Confirm Appointment
        </Button>
      </div>
    </Modal>
  )
}
