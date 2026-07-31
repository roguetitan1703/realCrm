import { useState, useEffect } from 'react'
import Icon from '../components/Icon.jsx'
import { Button, Field, Input, PhoneInput, Textarea, Segmented, Avatar, Source, StageTag, Money } from '../components/primitives.jsx'
import { theme } from '../data/theme.js'
import { budgetRange, reqLine, initials, thumbTint, fitReasons } from '../lib/format.js'
import { matchesForLead, leadsForProperty, ownerUpdateMessage, whatsappLink } from '../lib/matching.js'
import { api } from '../lib/api.js'
import { getPosition, processImage, uploadMedia } from '../lib/media.js'
import { COUNTED_ITEMS, FIXTURES, SOCIETY_AMENITIES, STATUS } from '../data/propertyFields.js'
import CameraCapture from '../components/CameraCapture.jsx'
import { pushSupported, isPushSubscribed, enablePush, disablePush } from '../lib/push.js'
import { getNestedValue, setNestedValue } from '../components/ModuleFields.jsx'
import { MODULE_DEFINITIONS } from './definitions.jsx'
import { localities } from '../lib/suggest.js'
import { CALL_OUTCOMES, labelForOutcome } from '../data/callOutcomes.js'

// Generic modal frame
function Modal({ title, onClose, children, width = 440 }) {
  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" style={{ width }} onClick={e => e.stopPropagation()}>
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
      {m?.kind === 'newLead' && <LeadForm store={store} />}
      {m?.kind === 'editLead' && <LeadForm store={store} leadId={m.leadId} />}
      {m?.kind === 'editRecord' && <ModuleFormModal store={store} moduleId={m.moduleId} recordId={m.recordId} />}
      {m?.kind === 'assign' && <AssignModal store={store} leadId={m.leadId} />}
      {m?.kind === 'reassign' && <ReassignModal store={store} fromId={m.fromId} />}
      {m?.kind === 'addAgent' && <AddAgentModal store={store} />}
      {m?.kind === 'contact' && <ContactConfirmModal store={store} channel={m.channel} name={m.name} phone={m.phone} waText={m.waText} recordType={m.recordType} recordId={m.recordId} />}
      {m?.kind === 'remark' && <RemarkModal store={store} recordType={m.recordType} recordId={m.recordId} />}
      {m?.kind === 'propStatus' && <StatusModal store={store} propId={m.propId} />}
      {m?.kind === 'import' && <ImportModal store={store} />}
      {m?.kind === 'visitFeedback' && <VisitFeedbackModal store={store} leadId={m.leadId} propId={m.propId} />}
      {m?.kind === 'visitProof' && <VisitProofModal store={store} leadId={m.leadId} propId={m.propId} />}
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
    ? store.state.properties.find(p => p.id === recordId)
    : store.state.leads.find(l => l.id === recordId)
  const [form, setForm] = useState(() => record ? JSON.parse(JSON.stringify(record)) : {})
  if (!def || !record) return null

  // Honour the same applicability predicate the record sheet and the add form
  // use — and read it off the WORKING COPY, so flipping Sale→Rent here swaps
  // the fields live. Without this the modal offered a booking amount on a
  // rental and, worse, `save()` wrote every field in the schema, stamping
  // empty sale terms onto a let.
  const fields = def.schema.fields.filter(f => !f.when || f.when(form))
  const coreFields = fields.filter(f => f.section === 'core')
  const domainFields = fields.filter(f => f.section !== 'core')
  const setField = (key, val) => setForm(prev => setNestedValue(prev, key, val))
  const optionsOf = (f) => (typeof f.options === 'function' ? f.options(store) : f.options || [])
    .map(o => (o && typeof o === 'object') ? o : { value: o, label: o })

  const save = () => {
    const patch = {}
    for (const f of fields) {
      const v = getNestedValue(form, f.key)
      // rebuild nested patch (e.g. req.config) into nested shape
      if (f.key.includes('.')) {
        const [head, ...rest] = f.key.split('.')
        patch[head] = patch[head] || JSON.parse(JSON.stringify(getNestedValue(record, head) || {}))
        setNestedValue(patch[head], rest.join('.'), v)
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
      return (
        <select className="input" value={String(v)} onChange={e => {
          const raw = e.target.value
          const match = opts.find(o => String(o.value) === raw)
          setField(f.key, match ? match.value : raw)
        }}>
          {opts.map(o => <option key={String(o.value)} value={String(o.value)}>{o.label}</option>)}
        </select>
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
  const p = store.state.properties.find(x => x.id === propId)
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
  const p = store.state.properties.find(x => x.id === propId)
  const [text, setText] = useState(() => p ? ownerUpdateMessage(p, store.state.leads, store.state.settings.firmName) : '')
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
        <Textarea value={text} onChange={e => setText(e.target.value)} style={{ minHeight: 190, fontSize: 13, lineHeight: 1.55 }} />
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
  const p = store.state.properties.find(x => x.id === propId)
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
function AttachPropModal({ store, leadId }) {
  const l = store.state.leads.find(x => x.id === leadId)
  const [q, setQ] = useState('')
  if (!l) return null
  const already = new Set(l.shortlist || [])
  const ql = q.trim().toLowerCase()
  // rank: same deal first, then matches, then everything; exclude already-attached
  const cands = store.state.properties
    .filter(p => !already.has(p.id) && p.deal === l.req.deal)
    .filter(p => !ql || (p.society || p.title || '').toLowerCase().includes(ql) || (p.locality || '').toLowerCase().includes(ql) || (p.type || '').toLowerCase().includes(ql))
    .map(p => ({ p, fit: fitReasons(p, l.req).score }))
    .sort((a, b) => b.fit - a.fit)
  const attach = (p) => { store.attachProp(leadId, p.id, p.society); store.closeModal() }
  return (
    <Modal title="Attach a property" onClose={store.closeModal} width={480}>
      <div className="u-muted" style={{ fontSize: 12.5, marginTop: -6, marginBottom: 12 }}>Shortlist inventory for <b style={{ color: 'var(--ink)' }}>{l.name}</b> ({l.req.config} · {l.req.deal} · {l.req.locality}).</div>
      <div className="input-group" style={{ marginBottom: 12 }}>
        <span className="prefix"><Icon name="search" size={15} /></span>
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search society, locality, type…" autoFocus />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: '46vh', overflowY: 'auto' }}>
        {cands.length === 0 && <div className="u-muted" style={{ fontSize: 13, padding: '8px 0' }}>No matching inventory to attach.</div>}
        {cands.map(({ p, fit }) => (
          <button key={p.id} onClick={() => attach(p)}
            style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '10px 11px', border: '1px solid var(--line)', background: '#fff', borderRadius: 10, cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left' }}>
            <div style={{ width: 40, height: 40, borderRadius: 8, background: thumbTint(p.id), display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--faint)', flexShrink: 0 }}><Icon name="building" size={19} strokeWidth={1.4} /></div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: 13.5 }}>{p.society}</div>
              <div className="u-muted" style={{ fontSize: 12 }}>{p.type} · {p.locality} · {p.priceLabel}{fit >= 60 ? ` · ${fit}% fit` : ''}</div>
            </div>
            <Icon name="plus" size={17} style={{ color: 'var(--accent)', flexShrink: 0 }} />
          </button>
        ))}
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
  const l = store.state.leads.find(x => x.id === leadId)
  const [outcome, setOutcome] = useState(CALL_OUTCOMES[0].value)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  if (!l) return null

  const save = () => {
    setBusy(true)
    const label = labelForOutcome(outcome)
    // contact-log, NOT the "telephony bridge". That route fabricated a DID, an
    // API key and a call SID and wrote "Initiated outbound telephony call …
    // via DID 08045678900" to the timeline. No call was placed and no telephony
    // is connected — it was a sentence describing something that did not happen.
    api.logContactAction(l.id, 'call')
      .then(res => {
        const evtId = res?.timeline_event?.id
        return evtId ? api.editRemark(l.id, evtId, text.trim(), label) : null
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
  const p = store.state.properties.find(x => x.id === propId)
  if (!p) return null
  const buyers = leadsForProperty(p, store.state.leads)
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
              <div className="u-muted" style={{ fontSize: 12 }}>{b.lead.req.config} · {b.lead.req.locality} · {b.fitLine}</div>
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

function LeadForm({ store, leadId }) {
  const edit = leadId ? store.state.leads.find(l => l.id === leadId) : null
  const [f, setF] = useState(edit ? {
    name: edit.name || '',
    phone: edit.phone || '',
    email: edit.email || '',
    deal: edit.req?.deal || (edit.req?.purpose === 'Lease' ? 'rent' : 'sale'),
    config: edit.req?.config || '',
    locality: edit.req?.locality || '',
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
    timeline: 'Within 60 days',
    source: 'Website',
    agentId: store.state.agents[0]?.id || null,
    notes: ''
  })
  const set = (k, v) => setF(s => ({ ...s, [k]: v }))

  const save = () => {
    if (!f.name.trim()) { store.toast('Lead Name is required', 'warn'); return }
    if (!f.phone.trim()) { store.toast('Phone Number is required', 'warn'); return }

    if (edit) {
      store.updateLead(edit.id, {
        name: f.name.trim(),
        phone: f.phone.trim(),
        email: f.email.trim() || undefined,
        source: f.source,
        agentId: f.agentId,
        req: {
          ...edit.req,
          deal: f.deal,
          config: f.config,
          locality: f.locality,
          timeline: f.timeline,
          purpose: f.notes.trim() || (f.deal === 'rent' ? 'Lease' : 'Self Use'),
          notes: f.notes.trim() || undefined
        }
      })
      store.toast('Lead details updated successfully')
    } else {
      const budget = f.deal === 'rent'
        ? { budget: '₹25,000 - ₹45,000/mo', minBudget: 25000, maxBudget: 45000 }
        : { budget: '₹1.10 - ₹1.40 Cr', minBudget: 11000000, maxBudget: 14000000 }
      const lead = {
        id: 'l_' + Date.now(),
        name: f.name.trim(),
        phone: f.phone.trim(),
        email: f.email.trim() || undefined,
        source: f.source || 'Website',
        stage: 'New',
        minsAgo: 0,
        agentId: f.agentId || store.state.agents[0]?.id || 'a1',
        req: {
          deal: f.deal,
          config: f.config,
          locality: f.locality,
          purpose: f.notes.trim() || (f.deal === 'rent' ? 'Lease' : 'Self Use'),
          notes: f.notes.trim() || undefined,
          timeline: f.timeline,
          ...budget
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

  const chip = (on, onClick, label) => (
    <button type="button" className={'qchip' + (on ? ' on' : '')} onClick={onClick}>{label}</button>
  )

  return (
    <Modal title={edit ? `Edit Lead Schema — ${edit.name}` : 'New Lead Record Schema'} onClose={store.closeModal} width={520}>
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
          <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
            {CONFIG_OPTIONS.map(t => chip(f.config === t, () => set('config', t), t))}
          </div>
        </div>

        <div className="field">
          <label>Preferred locality</label>
          <SuggestInput id="lead-locality" value={f.locality} onChange={v => set('locality', v)}
            options={localities(store)} placeholder="Where are they looking?" />
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
        <Button variant="primary" block onClick={save} icon="check">{edit ? 'Save Schema Changes' : 'Create Lead Record'}</Button>
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


// ---- Assign lead ----
function AssignModal({ store, leadId }) {
  const l = store.state.leads.find(x => x.id === leadId)
  // round-robin suggestion = agent with fewest active leads
  const counts = {}; store.activeAgents().forEach(a => { counts[a.id] = store.state.leads.filter(x => x.agentId === a.id && !x.stage.startsWith('Closed')).length })
  const sugg = store.activeAgents().sort((a, b) => counts[a.id] - counts[b.id])[0]
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

// ---- Reassign all of an agent's leads ----
function ReassignModal({ store, fromId }) {
  const from = store.agentById(fromId)
  const others = store.activeAgents().filter(a => a.id !== fromId)
  const [to, setTo] = useState(others[0]?.id)
  const [done, setDone] = useState(false)
  const count = store.state.leads.filter(l => l.agentId === fromId && !l.stage.startsWith('Closed')).length
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
          : "An agent signs in with their ID + password. We'll create a starter password to hand over; the admin resets it if forgotten. Agents see only their own leads."}
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
function ContactConfirmModal({ store, channel, name, phone, waText, recordType, recordId }) {
  const [step, setStep] = useState('confirm')   // 'confirm' | 'outcome'
  const [loggedId, setLoggedId] = useState(null)
  const [text, setText] = useState('')
  const [outcome, setOutcome] = useState('')
  const first = (name || 'them').split(' ')[0]
  const digits = String(phone || '').replace(/\D/g, '')
  const label = channel === 'wa' ? 'WhatsApp' : 'call'

  const proceed = () => {
    if (digits) {
      if (channel === 'wa') window.open(whatsappLink(waText || '', digits), '_blank', 'noopener')
      else window.location.href = `tel:+${digits.length > 10 ? digits : '91' + digits}`
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
    store.closeModal()
  }

  if (step === 'outcome') {
    return (
      <Modal title={`${label === 'call' ? 'Call' : 'WhatsApp'} logged`} onClose={store.closeModal} width={400}>
        <div className="u-muted" style={{ fontSize: 12.5, marginBottom: 14 }}>Optional — how did it go with {first}?</div>
        {channel === 'call' && (
          <select className="input" value={outcome} onChange={e => setOutcome(e.target.value)} style={{ width: '100%', marginBottom: 10 }}>
            <option value="">No outcome yet</option>
            {CALL_OUTCOMES.map(o => <option key={o.value} value={o.label}>{o.label}</option>)}
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
    <Modal title={channel === 'wa' ? 'Message on WhatsApp' : 'Call'} onClose={store.closeModal} width={400}>
      <div className="u-muted" style={{ fontSize: 12.5, marginTop: -6, marginBottom: 14 }}>{name} · <span className="mono-num">{phone || '—'}</span></div>
      <div style={{ fontSize: 13.5, lineHeight: 1.5, marginBottom: 16 }}>
        This records an action and will redirect you to your {label === 'call' ? 'dialer' : 'WhatsApp'}. Continue?
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <Button onClick={store.closeModal}>No</Button>
        <Button variant="primary" style={{ flex: 1, justifyContent: 'center' }} icon={channel === 'wa' ? 'wa' : 'phone'} onClick={proceed}>Yes, continue</Button>
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
const VISIT_OUTCOMES = [
  { key: 'interested', label: 'Interested' },
  { key: 'negotiating', label: 'Negotiating' },
  { key: 'booked', label: 'Booked' },
  { key: 'not_interested', label: 'Not interested' },
  { key: 'no_show', label: 'No show' },
]

function VisitProofModal({ store, leadId, propId }) {
  const l = store.state.leads.find(x => x.id === leadId)
  const [step, setStep] = useState('geo')          // geo → shoot → confirm
  const [geo, setGeo] = useState(null)
  const [geoErr, setGeoErr] = useState('')
  const [shot, setShot] = useState(null)           // { blob, url }
  const [outcome, setOutcome] = useState('')
  const [remark, setRemark] = useState('')
  const [busy, setBusy] = useState(false)
  const [property, setProperty] = useState(propId || '')

  // Ask for location the moment the modal opens. Failing fast is the whole
  // point: a denied permission ends the flow here, not after a photo.
  useEffect(() => {
    let alive = true
    getPosition()
      .then(p => { if (alive) { setGeo(p); setStep('shoot') } })
      .catch(e => { if (alive) setGeoErr(e.message) })
    return () => { alive = false }
  }, [])

  // The captured frame is held as an object URL for preview; release it when
  // it's replaced or the modal closes, or we leak the whole bitmap.
  useEffect(() => () => { if (shot?.url) URL.revokeObjectURL(shot.url) }, [shot])

  const retryGeo = () => {
    setGeoErr('')
    getPosition().then(p => { setGeo(p); setStep('shoot') }).catch(e => setGeoErr(e.message))
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
        store.setFollowUp(leadId, null)
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
              <Button variant="primary" block onClick={retryGeo}>Try again</Button>
            </>
          ) : (
            <>
              <Icon name="mapPin" size={26} />
              <p className="vp-gate-t">Getting your location…</p>
              <p className="vp-gate-s">A site visit is logged with where it happened.</p>
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
                  key={o.key}
                  type="button"
                  className={'qchip' + (outcome === o.key ? ' on' : '')}
                  onClick={() => setOutcome(o.key)}
                >{o.label}</button>
              ))}
            </div>
          </Field>

          {/* A visit REFERENCES a unit; it never gets written onto it. The
              list is the lead's shortlist because that's what they'd be
              shown — not the whole inventory. */}
          {(l.shortlist || []).length > 0 && (
            <Field label="Which unit? (optional)">
              <select className="input" value={property} onChange={e => setProperty(e.target.value)}>
                <option value="">Not tied to one unit</option>
                {(l.shortlist || []).map(pid => {
                  const p = store.state.properties.find(x => x.id === pid)
                  return p ? <option key={pid} value={pid}>{p.society} · {p.type}</option> : null
                })}
              </select>
            </Field>
          )}

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
  const p = store.state.properties.find(x => x.id === propId)
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
  const l = store.state.leads.find(x => x.id === leadId)
  const p = store.state.properties.find(x => x.id === propId)
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

// ---- Staged bulk import (CSV parser, live preview, deduplication & revert) ----
// ---- Staged bulk import (CSV parser, live preview, deduplication & revert logs) ----
function ImportModal({ store }) {
  const [tab, setTab] = useState('import') // 'import' | 'history'
  const [kind, setKind] = useState('clients')
  const [step, setStep] = useState('upload') // 'upload' | 'preview' | 'done'
  const [fileMeta, setFileMeta] = useState(null)
  const [parsedRows, setParsedRows] = useState([])
  const [headers, setHeaders] = useState([])
  const [mapping, setMapping] = useState({ name: '', phone: '', locality: '', config: '', budget: '', title: '', price: '', type: '' })
  const [error, setError] = useState(null)
  const [importing, setImporting] = useState(false)
  const [lastBatchId, setLastBatchId] = useState(null)
  const [importStats, setImportStats] = useState(null)

  const handleFile = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setFileMeta({ name: file.name, size: Math.round(file.size / 1024) + ' KB' })
    const reader = new FileReader()
    reader.onload = (evt) => {
      try {
        const text = evt.target.result
        const lines = text.split(/\r?\n/).filter(line => line.trim())
        if (lines.length < 2) {
          setError('File must contain a header row and at least one data row.')
          return
        }
        const parseCSVLine = (str) => {
          const res = []
          let cur = ''
          let inQuotes = false
          for (let i = 0; i < str.length; i++) {
            const ch = str[i]
            if (ch === '"') inQuotes = !inQuotes
            else if (ch === ',' && !inQuotes) {
              res.push(cur.trim().replace(/^"|"$/g, ''))
              cur = ''
            } else {
              cur += ch
            }
          }
          res.push(cur.trim().replace(/^"|"$/g, ''))
          return res
        }
        const cols = parseCSVLine(lines[0])
        const rows = lines.slice(1).map(line => {
          const vals = parseCSVLine(line)
          const obj = {}
          cols.forEach((h, idx) => { obj[h] = vals[idx] || '' })
          return obj
        })
        setHeaders(cols)
        const guess = { name: '', phone: '', locality: '', config: '', budget: '', title: '', price: '', type: '' }
        cols.forEach(c => {
          const cl = c.toLowerCase()
          if (/name|client|buyer/i.test(cl) && !guess.name) guess.name = c
          if (/phone|mobile|contact|tel/i.test(cl) && !guess.phone) guess.phone = c
          if (/area|locality|city|location/i.test(cl) && !guess.locality) guess.locality = c
          if (/bhk|config|req|type/i.test(cl) && !guess.config) guess.config = c
          if (/budget|amount/i.test(cl) && !guess.budget) guess.budget = c
          if (/project|society|title|building/i.test(cl) && !guess.title) guess.title = c
          if (/price|cost|rate/i.test(cl) && !guess.price) guess.price = c
          if (/type|bhk/i.test(cl) && !guess.type) guess.type = c
        })
        setMapping(guess)
        setParsedRows(rows)
        setError(null)
        setStep('preview')
      } catch (err) {
        setError('Failed to parse file: ' + err.message)
      }
    }
    reader.readAsText(file)
  }

  const previewRows = parsedRows.map((row) => {
    if (kind === 'clients') {
      const nameRaw = mapping.name ? row[mapping.name] : ''
      const phoneRaw = mapping.phone ? row[mapping.phone] : ''
      if (!nameRaw && !phoneRaw) return { status: 'invalid', reason: 'Missing Name/Phone', row }
      const name = nameRaw ? nameRaw.replace(/^[*(]+/g, '').trim() : 'Imported Lead'
      const phone = (phoneRaw && /^[+0-9\s-]{7,15}$/.test(phoneRaw.trim())) ? phoneRaw.trim() : '+919800000000'
      const dup = store.state.leads.find(l => l.phone === phone || (l.name.toLowerCase() === name.toLowerCase() && name.length > 3))
      return {
        status: dup ? 'duplicate' : 'new',
        dupTarget: dup ? dup.name : null,
        name, phone,
        locality: mapping.locality ? (row[mapping.locality] || '') : '',
        config: mapping.config ? (row[mapping.config] || '2 BHK') : '2 BHK',
        budget: mapping.budget ? (row[mapping.budget] || '1.2 Cr') : '1.2 Cr',
      }
    } else {
      const titleRaw = mapping.title ? row[mapping.title] : ''
      if (!titleRaw) return { status: 'invalid', reason: 'Missing Project Title', row }
      const title = titleRaw.replace(/^[*(]+/g, '').trim()
      const dup = store.state.properties.find(p => p.society.toLowerCase() === title.toLowerCase() || p.title.toLowerCase() === title.toLowerCase())
      const priceRaw = mapping.price ? row[mapping.price] : ''
      const priceNum = parseFloat(priceRaw)
      return {
        status: dup ? 'duplicate' : 'new',
        dupTarget: dup ? dup.society : null,
        title,
        locality: mapping.locality ? (row[mapping.locality] || '') : '',
        type: mapping.type ? (row[mapping.type] || '2 BHK') : '2 BHK',
        price: (!isNaN(priceNum) && priceNum > 0) ? priceNum : 95,
      }
    }
  })

  const newCount = previewRows.filter(r => r.status === 'new').length
  const dupCount = previewRows.filter(r => r.status === 'duplicate').length
  const invalidCount = previewRows.filter(r => r.status === 'invalid').length

  const handleConfirm = async () => {
    if (!parsedRows.length) return
    setImporting(true)
    const batchId = 'imp_' + Date.now()
    let added = 0, merged = 0
    const mergedDetails = []
    try {
      for (const pr of previewRows) {
        if (pr.status === 'invalid') continue
        if (kind === 'clients') {
          await store.addLead({
            name: pr.name, phone: pr.phone, source: 'CSV Import',
            req: { locality: pr.locality, config: pr.config, budget: pr.budget },
            budget: pr.budget, stage: 'New', importBatchId: batchId
          })
          if (pr.status === 'duplicate') {
            merged++
            mergedDetails.push(`${pr.name} (${pr.phone}) merged into existing lead [${pr.dupTarget}]`)
          } else added++
        } else {
          await store.addProperty({
            title: pr.title, locality: pr.locality, type: pr.type,
            price: pr.price, status: 'Available', importBatchId: batchId
          })
          if (pr.status === 'duplicate') {
            merged++
            mergedDetails.push(`Project "${pr.title}" updated existing inventory [${pr.dupTarget}]`)
          } else added++
        }
      }
      store.logImportBatch({
        batchId,
        timestamp: Date.now(),
        fileName: fileMeta?.name || 'bulk_import.csv',
        module: kind === 'clients' ? 'Leads & Clients' : 'Properties',
        addedCount: added,
        mergedCount: merged,
        mergedDetails,
        reverted: false,
      })
      setLastBatchId(batchId)
      setImportStats({ added, merged, invalid: invalidCount, mergedDetails })
      setStep('done')
      setImporting(false)
    } catch (err) {
      setError('Import failed during saving: ' + err.message)
      setImporting(false)
    }
  }

  const handleRevert = (batchIdToRevert) => {
    if (batchIdToRevert) {
      store.revertImportBatch(batchIdToRevert)
    }
  }

  const importLogs = store.state.importLogs || []

  return (
    <Modal title="Import & Data Hygiene Suite" onClose={store.closeModal} width={700}>
      <div style={{ marginBottom: 16 }}>
        <Segmented block value={tab} onChange={setTab}
          options={[
            { value: 'import', label: 'New Bulk Import' },
            { value: 'history', label: `Import Logs & Revert (${importLogs.length})` }
          ]} />
      </div>

      {tab === 'history' && (
        <div style={{ maxHeight: 420, overflowY: 'auto' }}>
          {importLogs.length === 0 ? (
            <div className="u-muted" style={{ padding: 40, textAlign: 'center', fontSize: 13 }}>
              No import batches recorded yet. Run a bulk import to view logs and revert options.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {importLogs.map((log) => (
                <div key={log.batchId} style={{ background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 10, padding: 14 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 14 }}>{log.fileName}</div>
                      <div className="u-muted" style={{ fontSize: 11.5 }}>
                        {new Date(log.timestamp).toLocaleString()} · Target: {log.module}
                      </div>
                    </div>
                    <div>
                      {!log.reverted ? (
                        <Button variant="secondary" size="sm"
                          style={{ color: 'var(--danger, #dc2626)', borderColor: 'var(--danger-border, #fca5a5)' }}
                          onClick={() => handleRevert(log.batchId)}>
                          Revert Entire Import
                        </Button>
                      ) : (
                        <span style={{ fontSize: 11, fontWeight: 700, background: 'var(--chrome)', color: 'var(--muted)', padding: '4px 10px', borderRadius: 99 }}>
                          Reverted (Records Removed)
                        </span>
                      )}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 10, fontSize: 12, marginBottom: log.mergedDetails?.length ? 8 : 0 }}>
                    <span style={{ color: 'var(--green, #166534)', fontWeight: 600 }}>+{log.addedCount} Created</span>
                    <span style={{ color: 'var(--blue, #1e40af)', fontWeight: 600 }}>🔗 {log.mergedCount} Deduplicated / Merged</span>
                  </div>
                  {log.mergedDetails && log.mergedDetails.length > 0 && (
                    <div style={{ background: 'var(--chrome)', padding: '8px 10px', borderRadius: 6, fontSize: 11.5, marginTop: 6 }}>
                      <div style={{ fontWeight: 700, color: 'var(--muted)', marginBottom: 4 }}>Merged Items Details:</div>
                      {log.mergedDetails.map((m, idx) => (
                        <div key={idx} style={{ color: 'var(--ink)', marginBottom: 2 }}>• {m}</div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'import' && step === 'upload' && (
        <>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 6 }}>1. Select Target CRM Module</div>
          <Segmented block value={kind} onChange={v => { setKind(v); setError(null) }}
            options={[{ value: 'clients', label: 'Leads & Clients' }, { value: 'properties', label: 'Properties / Inventory' }]} />

          <label style={{ width: '100%', marginTop: 14, border: '1.5px dashed var(--accent-line)', background: 'var(--accent-wash)', borderRadius: 12, padding: '32px 20px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, cursor: 'pointer', fontFamily: 'inherit' }}>
            <input type="file" accept=".csv,.txt" onChange={handleFile} style={{ display: 'none' }} />
            <div style={{ width: 48, height: 48, borderRadius: 12, background: 'var(--card)', border: '1px solid var(--accent-line)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent-ink)' }}><Icon name="layers" size={24} /></div>
            <div style={{ fontWeight: 600, fontSize: 14 }}>Drop your .csv file here or click to browse</div>
            <div className="u-muted" style={{ fontSize: 12.5 }}>Preview table, mapping & deduplication check runs automatically</div>
          </label>
        </>
      )}

      {tab === 'import' && step === 'preview' && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 14 }}>Step 2: Column Mapping & Live Preview</div>
              <div className="u-muted" style={{ fontSize: 12 }}>{fileMeta?.name} ({fileMeta?.size})</div>
            </div>
            <button className="btn btn-quiet btn-sm" onClick={() => setStep('upload')}>Change file</button>
          </div>

          <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
            <span style={{ fontSize: 12, fontWeight: 600, background: 'var(--green-wash, #dcfce7)', color: 'var(--green, #166534)', padding: '4px 10px', borderRadius: 99 }}>✨ {newCount} New</span>
            <span style={{ fontSize: 12, fontWeight: 600, background: 'var(--blue-wash, #dbeafe)', color: 'var(--blue, #1e40af)', padding: '4px 10px', borderRadius: 99 }}>🔗 {dupCount} Duplicates (Merge)</span>
            <span style={{ fontSize: 12, fontWeight: 600, background: 'var(--chrome)', color: 'var(--muted)', padding: '4px 10px', borderRadius: 99 }}>⚠️ {invalidCount} Skipped</span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, background: 'var(--card)', padding: 12, borderRadius: 10, border: '1px solid var(--line)', marginBottom: 14 }}>
            {kind === 'clients' ? (
              <>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 600, display: 'block', marginBottom: 3 }}>Name Column</label>
                  <select className="input" value={mapping.name} onChange={e => setMapping({ ...mapping, name: e.target.value })} style={{ width: '100%' }}>
                    <option value="">-- None --</option>
                    {headers.map(h => <option key={h} value={h}>{h}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 600, display: 'block', marginBottom: 3 }}>Phone Column</label>
                  <select className="input" value={mapping.phone} onChange={e => setMapping({ ...mapping, phone: e.target.value })} style={{ width: '100%' }}>
                    <option value="">-- None --</option>
                    {headers.map(h => <option key={h} value={h}>{h}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 600, display: 'block', marginBottom: 3 }}>Locality Column</label>
                  <select className="input" value={mapping.locality} onChange={e => setMapping({ ...mapping, locality: e.target.value })} style={{ width: '100%' }}>
                    <option value="">Not mapped</option>
                    {headers.map(h => <option key={h} value={h}>{h}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 600, display: 'block', marginBottom: 3 }}>Budget Column</label>
                  <select className="input" value={mapping.budget} onChange={e => setMapping({ ...mapping, budget: e.target.value })} style={{ width: '100%' }}>
                    <option value="">-- Default 1.2 Cr --</option>
                    {headers.map(h => <option key={h} value={h}>{h}</option>)}
                  </select>
                </div>
              </>
            ) : (
              <>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 600, display: 'block', marginBottom: 3 }}>Society / Title</label>
                  <select className="input" value={mapping.title} onChange={e => setMapping({ ...mapping, title: e.target.value })} style={{ width: '100%' }}>
                    <option value="">-- Select --</option>
                    {headers.map(h => <option key={h} value={h}>{h}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 600, display: 'block', marginBottom: 3 }}>Price Column</label>
                  <select className="input" value={mapping.price} onChange={e => setMapping({ ...mapping, price: e.target.value })} style={{ width: '100%' }}>
                    <option value="">-- Default 95 L --</option>
                    {headers.map(h => <option key={h} value={h}>{h}</option>)}
                  </select>
                </div>
              </>
            )}
          </div>

          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 6 }}>Live Preview (First 5 Rows)</div>
          <div style={{ border: '1px solid var(--line)', borderRadius: 8, overflow: 'hidden', maxHeight: 180, overflowY: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: 'var(--chrome)', borderBottom: '1px solid var(--line)', textAlign: 'left' }}>
                  <th style={{ padding: '6px 10px' }}>Status</th>
                  <th style={{ padding: '6px 10px' }}>{kind === 'clients' ? 'Lead Name' : 'Society'}</th>
                  <th style={{ padding: '6px 10px' }}>{kind === 'clients' ? 'Phone' : 'Price'}</th>
                  <th style={{ padding: '6px 10px' }}>Locality</th>
                </tr>
              </thead>
              <tbody>
                {previewRows.slice(0, 5).map((pr, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid var(--line)' }}>
                    <td style={{ padding: '6px 10px' }}>
                      {pr.status === 'new' && <span style={{ color: 'var(--green, #166534)', fontWeight: 600 }}>✨ New</span>}
                      {pr.status === 'duplicate' && <span style={{ color: 'var(--blue, #1e40af)', fontWeight: 600 }}>🔗 Merge ({pr.dupTarget})</span>}
                      {pr.status === 'invalid' && <span style={{ color: 'var(--muted)' }}>⚠️ Skip</span>}
                    </td>
                    <td style={{ padding: '6px 10px', fontWeight: 600 }}>{pr.name || pr.title || '—'}</td>
                    <td style={{ padding: '6px 10px' }}>{pr.phone || pr.price || '—'}</td>
                    <td style={{ padding: '6px 10px' }}>{pr.locality || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 16 }}>
            <Button variant="secondary" onClick={() => setStep('upload')}>Back</Button>
            <Button variant="primary" disabled={importing || (newCount + dupCount === 0)} onClick={handleConfirm}>
              {importing ? 'Importing...' : `Run Import (${newCount + dupCount} records)`}
            </Button>
          </div>
        </>
      )}

      {tab === 'import' && step === 'done' && (
        <div style={{ textAlign: 'center', padding: '16px 8px' }}>
          <div style={{ width: 48, height: 48, borderRadius: '50%', background: 'var(--green-wash, #dcfce7)', color: 'var(--green, #166534)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}>
            <Icon name="check" size={24} />
          </div>
          <div style={{ fontFamily: 'var(--disp)', fontWeight: 700, fontSize: 18, marginBottom: 6 }}>Import Successfully Executed</div>
          <div className="u-muted" style={{ fontSize: 13, marginBottom: 14 }}>
            Saved {importStats?.added || 0} new records and deduplicated/merged {importStats?.merged || 0} items.
          </div>
          {importStats?.mergedDetails?.length > 0 && (
            <div style={{ background: 'var(--chrome)', padding: 10, borderRadius: 8, fontSize: 12, textAlign: 'left', maxHeight: 110, overflowY: 'auto', marginBottom: 16 }}>
              <div style={{ fontWeight: 700, color: 'var(--muted)', marginBottom: 4 }}>Merged Records:</div>
              {importStats.mergedDetails.map((m, idx) => (
                <div key={idx} style={{ color: 'var(--ink)' }}>• {m}</div>
              ))}
            </div>
          )}
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
            <Button variant="secondary" style={{ color: 'var(--danger, #dc2626)', borderColor: 'var(--danger-border, #fca5a5)' }} onClick={() => handleRevert(lastBatchId)}>
              Revert / Undo This Import
            </Button>
            <Button variant="primary" onClick={() => setTab('history')}>
              View Import Logs & History
            </Button>
          </div>
        </div>
      )}
    </Modal>
  )
}

// ---- Global search ----
function SearchModal({ store, go }) {
  const [q, setQ] = useState('')
  const ql = q.trim().toLowerCase()
  const leads = ql ? store.state.leads.filter(l => (l.name || '').toLowerCase().includes(ql) || (l.req?.locality || '').toLowerCase().includes(ql) || (l.phone || '').includes(ql)).slice(0, 5) : []
  const props = ql ? store.state.properties.filter(p => (p.society || p.title || '').toLowerCase().includes(ql) || (p.locality || '').toLowerCase().includes(ql)).slice(0, 5) : []
  const close = () => store.setSearch(false)
  const goTo = (fn) => { fn(); close() }
  return (
    <div className="overlay top" onClick={close}>
      <div style={{ width: 520, maxWidth: '100%', background: 'var(--bg)', borderRadius: 14, boxShadow: 'var(--shadow-pop)', overflow: 'hidden' }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px', borderBottom: '1px solid var(--line)' }}>
          <Icon name="search" style={{ color: 'var(--muted)' }} />
          <input value={q} onChange={e => setQ(e.target.value)} autoFocus placeholder="Search leads, properties, people…" style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', fontFamily: 'var(--sans)', fontSize: 15, color: 'var(--ink)' }} />
          <button className="btn btn-icon btn-quiet" onClick={close}><Icon name="x" /></button>
        </div>
        <div style={{ maxHeight: '60vh', overflowY: 'auto', padding: '6px 8px 10px' }}>
          {!ql && <div className="u-muted" style={{ padding: 22, textAlign: 'center', fontSize: 13 }}>Type a name, society, locality, or number.</div>}
          {ql && !leads.length && !props.length && <div className="u-muted" style={{ padding: 22, textAlign: 'center', fontSize: 13 }}>No matches for “{q}”.</div>}
          {leads.length > 0 && <div style={{ fontSize: 10, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--muted)', fontWeight: 700, padding: '10px 10px 5px' }}>Leads</div>}
          {leads.map(l => (
            <button key={l.id} type="button" onClick={() => goTo(() => go('leads', { leadId: l.id, leadOpen: true }))} style={{ textAlign: 'left', width: '100%', background: 'transparent', border: 'none', borderRadius: 8, padding: '9px 10px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 9, fontFamily: 'inherit' }}>
              <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontWeight: 600 }}>{l.name}</div><div className="u-muted" style={{ fontSize: 12 }}>{reqLine(l.req)}</div></div>
              <StageTag stage={l.stage} />
            </button>
          ))}
          {props.length > 0 && <div style={{ fontSize: 10, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--muted)', fontWeight: 700, padding: '10px 10px 5px' }}>Properties</div>}
          {props.map(p => (
            <button key={p.id} type="button" onClick={() => goTo(() => go('properties', { propId: p.id, propOpen: true }))} style={{ textAlign: 'left', width: '100%', background: 'transparent', border: 'none', borderRadius: 8, padding: '9px 10px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 9, fontFamily: 'inherit' }}>
              <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontWeight: 600 }}>{p.society}</div><div className="u-muted" style={{ fontSize: 12 }}>{p.title}</div></div>
              <Money>{p.priceLabel}</Money>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

// ---- Right-Side Slide-In Notifications Drawer ----
function NotifModal({ store, go }) {
  const [filter, setFilter] = useState('all')
  const close = () => store.setNotif(false)

  // Phone alerts (Web Push): reflect whether this device is already subscribed.
  const [pushState, setPushState] = useState('unknown') // unknown | off | on | unsupported | busy
  useEffect(() => {
    if (!pushSupported()) { setPushState('unsupported'); return }
    isPushSubscribed().then(on => setPushState(on ? 'on' : 'off'))
  }, [])
  const togglePush = async () => {
    if (pushState === 'busy' || pushState === 'unsupported') return
    setPushState('busy')
    if (pushState === 'on') {
      await disablePush()
      setPushState('off')
      store.toast('Phone alerts turned off for this device')
      return
    }
    const r = await enablePush()
    if (r.ok) { setPushState('on'); store.toast('Phone alerts on — you\'ll get notified even when the app is closed') }
    else {
      setPushState('off')
      const msg = r.reason === 'denied' ? 'Notifications are blocked in your browser settings'
        : r.reason === 'disabled' ? 'Push isn\'t configured on the server yet'
        : r.reason === 'unsupported' ? 'This browser doesn\'t support phone alerts'
        : 'Could not turn on alerts — try again'
      store.toast(msg)
    }
  }

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const items = []
  store.state.leads.forEach(l => {
    if (l.overdue) {
      items.push({
        id: l.id + '-overdue',
        leadId: l.id,
        kind: 'overdue',
        tag: 'Overdue Follow-up',
        icon: 'clock',
        title: l.name,
        sub: l.followUp?.action || 'Overdue interaction required',
      })
    }
    if (!l.agentId) {
      items.push({
        id: l.id + '-unassigned',
        leadId: l.id,
        kind: 'unassigned',
        tag: 'Unassigned Inquiry',
        icon: 'person',
        title: l.name,
        sub: reqLine(l.req) || 'Needs agent assignment',
      })
    }
    if (l.stage === 'New inquiry' && l.agentId && !l.overdue) {
      items.push({
        id: l.id + '-inquiry',
        leadId: l.id,
        kind: 'inquiry',
        tag: 'New Inquiry',
        icon: 'sparkle',
        title: l.name,
        sub: reqLine(l.req) || 'Pending initial outreach',
      })
    }
  })

  const overdueCount = items.filter(x => x.kind === 'overdue').length
  const unassignedCount = items.filter(x => x.kind === 'unassigned').length
  const inquiryCount = items.filter(x => x.kind === 'inquiry').length

  const filteredItems = items.filter(x => {
    if (filter === 'overdue') return x.kind === 'overdue'
    if (filter === 'unassigned') return x.kind === 'unassigned'
    if (filter === 'inquiry') return x.kind === 'inquiry'
    return true
  })

  // Server-backed alert feed (real notifications persisted per user), distinct
  // from the derived action queue below.
  const notifs = store.state.notifications || []
  const unreadNotifs = notifs.filter(n => !n.read).length
  const openNotif = (n) => {
    const m = (n.link || '').match(/lead=([^&]+)/)
    if (m) { close(); go('leads', { leadId: m[1], leadOpen: true }) }
  }
  const notifAgo = (ts) => {
    if (!ts) return ''
    const mins = Math.max(0, Math.floor((Date.now() - new Date(ts).getTime()) / 60000))
    if (mins < 1) return 'just now'
    if (mins < 60) return `${mins}m ago`
    const hrs = Math.floor(mins / 60)
    return hrs < 24 ? `${hrs}h ago` : `${Math.floor(hrs / 24)}d ago`
  }

  return (
    <div className="notif-drawer-overlay" onClick={close}>
      <div className="notif-drawer" onClick={e => e.stopPropagation()}>
        <div className="notif-drawer-head">
          <div className="nd-title">
            <Icon name="bell" size={18} />
            <span>Activity & Action Queue</span>
            {items.length > 0 && <span className="nd-badge">{items.length} active</span>}
          </div>
          <button className="btn btn-icon btn-quiet" onClick={close} title="Close drawer (Esc)">
            <Icon name="x" size={16} />
          </button>
        </div>

        <div className="notif-drawer-tabs">
          <button
            className={`notif-drawer-tab ${filter === 'all' ? 'active' : ''}`}
            onClick={() => setFilter('all')}
          >
            All ({items.length})
          </button>
          <button
            className={`notif-drawer-tab ${filter === 'overdue' ? 'active' : ''}`}
            onClick={() => setFilter('overdue')}
          >
            Overdue ({overdueCount})
          </button>
          <button
            className={`notif-drawer-tab ${filter === 'unassigned' ? 'active' : ''}`}
            onClick={() => setFilter('unassigned')}
          >
            Unassigned ({unassignedCount})
          </button>
          <button
            className={`notif-drawer-tab ${filter === 'inquiry' ? 'active' : ''}`}
            onClick={() => setFilter('inquiry')}
          >
            New ({inquiryCount})
          </button>
        </div>

        <div className="notif-drawer-body">
          {notifs.length > 0 && (
            <div className="notif-alerts">
              <div className="notif-alerts-head">
                <span>Notifications{unreadNotifs > 0 ? ` · ${unreadNotifs} new` : ''}</span>
                {unreadNotifs > 0 && (
                  <button type="button" className="btn-quiet" style={{ fontSize: 12, padding: 0, color: 'var(--accent)', fontWeight: 600 }} onClick={() => store.markAllNotifsRead()}>
                    Mark all read
                  </button>
                )}
              </div>
              {notifs.slice(0, 8).map(n => (
                <button key={n.id} className={`notif-alert-row${n.read ? '' : ' is-unread'}`} onClick={() => openNotif(n)}>
                  <span className="notif-alert-dot" aria-hidden />
                  <div className="notif-alert-content">
                    <div className="notif-alert-title">{n.title}</div>
                    {n.body && <div className="notif-alert-body">{n.body}</div>}
                  </div>
                  <span className="notif-alert-ago">{notifAgo(n.created_at)}</span>
                </button>
              ))}
              <div className="notif-alerts-label">Action queue</div>
            </div>
          )}
          {!filteredItems.length ? (
            <div className="empty" style={{ margin: 'auto 0', padding: '48px 20px' }}>
              <div style={{ width: 44, height: 44, borderRadius: 12, background: 'var(--card-2)', border: '1px solid var(--line)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px', color: 'var(--muted)' }}>
                <Icon name="check" size={20} />
              </div>
              <div className="e-t">All clear</div>
              <div className="e-s">No action items found in this queue.</div>
            </div>
          ) : (
            filteredItems.map(n => (
              <button
                key={n.id}
                className={`notif-item-card is-${n.kind}`}
                onClick={() => {
                  close()
                  go('leads', { leadId: n.leadId, leadOpen: true })
                }}
              >
                <span className="notif-item-icon">
                  <Icon name={n.icon} size={16} />
                </span>
                <div className="notif-item-content">
                  <span className="notif-item-tag">{n.tag}</span>
                  <div className="notif-item-title">{n.title}</div>
                  <div className="notif-item-sub">{n.sub}</div>
                </div>
                <span className="notif-item-arrow">
                  <Icon name="chevRight" size={16} />
                </span>
              </button>
            ))
          )}
        </div>

        <div className="notif-drawer-footer">
          {pushState !== 'unsupported' && (
            <button
              type="button"
              className="btn btn-quiet"
              style={{ fontSize: 12, fontWeight: 600, color: pushState === 'on' ? 'var(--muted)' : 'var(--accent)', display: 'inline-flex', alignItems: 'center', gap: 6 }}
              onClick={togglePush}
              disabled={pushState === 'busy'}
              title="Get notified on this device even when the app is closed"
            >
              <Icon name="bell" size={14} />
              {pushState === 'on' ? 'Phone alerts on' : pushState === 'busy' ? 'Working…' : 'Turn on phone alerts'}
            </button>
          )}
          <Button variant="secondary" size="sm" onClick={() => { close(); go('leads') }}>
            Open Leads Workspace
          </Button>
        </div>
      </div>
    </div>
  )
}

function ScheduleFollowUpModal({ store, leadId }) {
  const l = store.state.leads.find(x => x.id === leadId)
  const [action, setAction] = useState('Site Visit')
  const [day, setDay] = useState('Tomorrow')
  const [customDate, setCustomDate] = useState('2026-07-10')
  const [useCustomDate, setUseCustomDate] = useState(false)
  const [time, setTime] = useState('11:00 am')
  const [customTime, setCustomTime] = useState('11:00')
  const [useCustomTime, setUseCustomTime] = useState(false)
  const [assignedAgentId, setAssignedAgentId] = useState(l?.agentId || store.state.agents[0]?.id || '')
  const [note, setNote] = useState('')

  if (!l) return null

  const saveAppointment = () => {
    const finalDate = useCustomDate ? customDate : day
    const finalTime = useCustomTime ? customTime : time
    const fullAction = `${action} — ${l.name}`
    store.setFollowUp(l.id, {
      action: fullAction,
      date: finalDate,
      time: finalTime,
      note: note.trim() || undefined,
      agentId: assignedAgentId,
    })
    store.addNote(l.id, `Scheduled ${action} on ${finalDate} at ${finalTime}${note.trim() ? ` — Agenda: ${note.trim()}` : ''}`, 'visit')
    store.toast(`Appointment scheduled: ${action} on ${finalDate} at ${finalTime}`)
    store.closeModal()
  }

  const pill = (on, onClick, label) => (
    <button key={label} type="button" className={'qchip' + (on ? ' on' : '')} onClick={onClick}>{label}</button>
  )

  return (
    <Modal title={`Schedule Appointment — ${l.name}`} onClose={store.closeModal} width={480}>
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
              {['Today', 'Tomorrow', 'This Saturday', 'This Sunday', '2026-07-15'].map(d =>
                pill(day === d, () => { setDay(d); setUseCustomDate(false) }, d)
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

        <div className="field">
          <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink)' }}>Assigned Agent</label>
          <select value={assignedAgentId} onChange={e => setAssignedAgentId(e.target.value)}
            style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid var(--line)', marginTop: 5, fontSize: 13, fontFamily: 'inherit' }}>
            {store.state.agents.map(a => (
              <option key={a.id} value={a.id}>{a.name}{a.role ? ` (${a.role})` : ''}</option>
            ))}
          </select>
        </div>

        <Field label="Appointment Agenda / Location Note (Optional)">
          <Input value={note} onChange={e => setNote(e.target.value)} placeholder="e.g. Meet at Hinjewadi Phase 3 sales lounge" />
        </Field>

        <Button variant="primary" block onClick={saveAppointment} icon="calendar" style={{ padding: 12, fontWeight: 600 }}>
          Confirm Appointment
        </Button>
      </div>
    </Modal>
  )
}
