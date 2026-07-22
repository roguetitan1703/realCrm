import { useState, useEffect } from 'react'
import Icon from '../components/Icon.jsx'
import { Button, Field, Input, PhoneInput, Textarea, Segmented, Avatar, Source, StageTag, Money } from '../components/primitives.jsx'
import { theme } from '../data/theme.js'
import { budgetRange, reqLine, initials, thumbTint, fitReasons } from '../lib/format.js'
import { matchesForLead, leadsForProperty, ownerUpdateMessage, whatsappLink } from '../lib/matching.js'
import { api } from '../lib/api.js'
import { getNestedValue, setNestedValue } from '../components/ModuleFields.jsx'
import { MODULE_DEFINITIONS } from './definitions.jsx'

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
      {m?.kind === 'addProperty' && <PropertyForm store={store} propId={m.propId} />}
      {m?.kind === 'addUnits' && <AddUnitsModal store={store} projKey={m.projKey} />}
      {m?.kind === 'editRecord' && <ModuleFormModal store={store} moduleId={m.moduleId} recordId={m.recordId} />}
      {m?.kind === 'assign' && <AssignModal store={store} leadId={m.leadId} />}
      {m?.kind === 'reassign' && <ReassignModal store={store} fromId={m.fromId} />}
      {m?.kind === 'addAgent' && <AddAgentModal store={store} />}
      {m?.kind === 'call' && <CallModal store={store} leadId={m.leadId} />}
      {m?.kind === 'callOwner' && <CallModal store={store} owner={m.owner} propId={m.propId} />}
      {m?.kind === 'note' && <NoteModal store={store} leadId={m.leadId} />}
      {m?.kind === 'propStatus' && <StatusModal store={store} propId={m.propId} />}
      {m?.kind === 'integration' && <IntegrationModal store={store} card={m.card} />}
      {m?.kind === 'import' && <ImportModal store={store} />}
      {m?.kind === 'visitFeedback' && <VisitFeedbackModal store={store} leadId={m.leadId} propId={m.propId} />}
      {m?.kind === 'pickMatch' && <PickMatchModal store={store} leadId={m.leadId} />}
      {m?.kind === 'pickBuyer' && <PickBuyerModal store={store} propId={m.propId} />}
      {m?.kind === 'attachProp' && <AttachPropModal store={store} leadId={m.leadId} />}
      {m?.kind === 'scheduleFollowUp' && <ScheduleFollowUpModal store={store} leadId={m.leadId} />}
      {m?.kind === 'outreach' && <OutreachModal store={store} leadId={m.leadId} channel={m.channel} />}
      {m?.kind === 'tenancy' && <TenancyModal store={store} propId={m.propId} />}
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

  const fields = def.schema.fields
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

// ---- One-tap owner update: activity summary WhatsApp, logged to the listing ----
function OwnerUpdateModal({ store, propId }) {
  const p = store.state.properties.find(x => x.id === propId)
  const [text, setText] = useState(() => p ? ownerUpdateMessage(p, store.state.leads) : '')
  if (!p) return null
  const send = () => {
    store.logEvent(p.id, 'wa', `Owner update sent to ${p.owner}`)
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

// ---- Outreach: plain Call / SMS / WhatsApp, no property required ----
// Channel-first. Property attach is optional enrichment, not the whole point.
function OutreachModal({ store, leadId, channel = 'call' }) {
  const l = store.state.leads.find(x => x.id === leadId)
  const [ch, setCh] = useState(channel || 'call')
  const [text, setText] = useState('')
  const [callOutcome, setCallOutcome] = useState('Connected & Discussed Requirements')
  if (!l) return null
  const first = l.name.split(' ')[0]

  const templates = {
    wa: [
      `Namaste ${first}, ${theme.brand.firmName} here. We have shortlisted verified options for your ${l.req?.config || 'property'} requirement in ${l.req?.locality || 'Pune'}. Would you like to review the layout plans?`,
      `Hi ${first}, sharing RERA verified brochure & pricing details for matching properties in ${l.req?.locality || 'Pune'}. Let us know if you are available for a site visit this weekend.`,
      `Hi ${first}, following up on your property inquiry with ${theme.brand.firmName}. Please let me know a convenient time to connect.`,
    ],
    sms: [
      `Namaste ${first}, this is ${theme.brand.firmName}. Following up on your property search in ${l.req?.locality || 'Pune'}. Please let us know when you are free to talk.`,
      `Hi ${first}, new inventory matching your ${l.req?.config || 'search'} is now available. Call us back for pricing details.`,
      `Thanks for your time, ${first}! We will share the complete pricing breakdown shortly.`,
    ],
  }

  // The button must actually do the thing — dial the phone, open WhatsApp,
  // open the SMS composer — and *then* log it. Logging alone was the old
  // behaviour and it read as a dead button.
  const logIt = () => {
    const digits = String(l.phone || '').replace(/\D/g, '')
    if (ch === 'call') {
      if (digits) window.location.href = `tel:+${digits.length > 10 ? digits : '91' + digits}`
      store.addNote(l.id, `Phone call with ${first} — Outcome: ${callOutcome}`, 'call')
      api.callBridge(l.id, store.state.activeAgentId).catch(err => console.warn('[Telephony API Fallback] Backend offline:', err.message))
      store.toast(`Call logged · ${callOutcome}`)
    } else if (ch === 'wa') {
      if (!text.trim()) { store.toast('Pick a template or type a message first', 'warn'); return }
      window.open(whatsappLink(text, digits), '_blank', 'noopener')
      store.addNote(l.id, `WhatsApp sent to ${first}: ${text.slice(0, 60)}${text.length > 60 ? '…' : ''}`, 'msg')
      api.sendWhatsApp(l.id, 'outreach_msg', { text }).catch(err => console.warn('[WABA API Fallback] Backend offline:', err.message))
      store.toast('WhatsApp opened with the message ready')
    } else {
      if (!text.trim()) { store.toast('Pick a template or type a message first', 'warn'); return }
      window.location.href = `sms:${digits ? '+' + (digits.length > 10 ? digits : '91' + digits) : ''}?body=${encodeURIComponent(text)}`
      store.addNote(l.id, `SMS sent to ${first}: ${text.slice(0, 60)}${text.length > 60 ? '…' : ''}`, 'msg')
      store.toast('SMS composer opened')
    }
    store.closeModal()
  }

  return (
    <Modal title={`Reach Out to ${l.name}`} onClose={store.closeModal} width={480}>
      <div style={{ background: 'var(--wash)', border: '1px solid var(--line)', borderRadius: 10, padding: '10px 14px', marginBottom: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>{l.phone}</div>
          <div className="u-muted" style={{ fontSize: 11.5 }}>{l.req?.config} · {l.req?.locality}</div>
        </div>
        <span style={{ fontSize: 11, fontWeight: 600, padding: '4px 9px', borderRadius: 6, background: 'var(--accent-wash)', color: 'var(--accent-ink)' }}>{l.stage}</span>
      </div>

      {/* Accessible Channel Selector */}
      <div role="tablist" aria-label="Outreach Channel" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6, marginBottom: 16 }}>
        {[
          { id: 'call', label: 'Call', icon: 'phone' },
          { id: 'wa', label: 'WhatsApp', icon: 'wa' },
          { id: 'sms', label: 'SMS', icon: 'sms' },
        ].map(item => {
          const isOn = ch === item.id
          return (
            <button key={item.id} role="tab" aria-selected={isOn} onClick={() => setCh(item.id)}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, padding: '10px 12px', borderRadius: 9, border: `1.5px solid ${isOn ? 'var(--accent)' : 'var(--line)'}`, background: isOn ? 'var(--accent-wash)' : '#fff', color: isOn ? 'var(--accent-ink)' : 'var(--ink-2)', fontWeight: isOn ? 600 : 500, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>
              <Icon name={item.icon} size={15} />
              {item.label}
            </button>
          )
        })}
      </div>

      {ch === 'call' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink)', marginBottom: 6 }}>Select Call Outcome to Log</label>
            <select aria-label="Call Outcome" value={callOutcome} onChange={e => setCallOutcome(e.target.value)}
              style={{ width: '100%', padding: '10px 12px', borderRadius: 9, border: '1px solid var(--line)', background: '#fff', fontSize: 13, color: 'var(--ink)', fontFamily: 'inherit' }}>
              <option value="Connected & Discussed Requirements">Connected & Discussed Requirements</option>
              <option value="Interested — Scheduling Site Visit">Interested — Scheduling Site Visit</option>
              <option value="Requested Callback Later">Requested Callback Later</option>
              <option value="No Answer / Ringing">No Answer / Ringing</option>
              <option value="Number Busy / Switched Off">Number Busy / Switched Off</option>
            </select>
          </div>
          <button className="btn btn-primary btn-block" style={{ padding: 14, fontSize: 13.5, fontWeight: 600 }} onClick={logIt}>
            <Icon name="phone" /> Start Call
          </button>
          <div className="u-muted" style={{ fontSize: 11.5, textAlign: 'center' }}>Dials {l.phone} and logs the outcome you picked.</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink)', marginBottom: 6 }}>Pick a Quick Template</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              {(templates[ch] || []).map((t, i) => (
                <button key={i} onClick={() => setText(t)}
                  style={{ textAlign: 'left', background: text === t ? 'var(--accent-wash)' : '#fff', border: `1px solid ${text === t ? 'var(--accent-line)' : 'var(--line)'}`, borderRadius: 8, padding: '9px 11px', fontSize: 12, color: 'var(--ink-2)', lineHeight: 1.45, cursor: 'pointer', fontFamily: 'inherit' }}>
                  {t}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink)', marginBottom: 6 }}>Message Content</label>
            <Textarea aria-label="Message Content" value={text} onChange={e => setText(e.target.value)} placeholder={`Type your ${ch === 'wa' ? 'WhatsApp' : 'SMS'} message…`} />
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <Button variant="primary" style={{ flex: 1, justifyContent: 'center' }} icon={ch === 'wa' ? 'wa' : 'sms'} onClick={logIt}>
              Send {ch === 'wa' ? 'WhatsApp' : 'SMS'}
            </Button>
            <Button icon="tag" onClick={() => store.openModal({ kind: 'pickMatch', leadId: l.id })}>Attach Property</Button>
          </div>
        </div>
      )}

      <div style={{ marginTop: 14, background: 'var(--wash)', border: '1px solid var(--line)', borderRadius: 9, padding: '10px 12px', fontSize: 11.5, color: 'var(--ink-2)', display: 'flex', gap: 9 }}>
        <Icon name="zap" size={15} style={{ flexShrink: 0, marginTop: 1, color: 'var(--accent)' }} />
        <span>{ch === 'call'
          ? 'Dials from this device and logs the outcome to the lead timeline.'
          : `Opens ${ch === 'wa' ? 'WhatsApp' : 'your SMS app'} with the message filled in. The send is logged to the lead timeline.`}</span>
      </div>
    </Modal>
  )
}

// ---- Pick which matched PROPERTY to WhatsApp for a lead (from the system) ----
function PickMatchModal({ store, leadId }) {
  const l = store.state.leads.find(x => x.id === leadId)
  if (!l) return null
  const matches = matchesForLead(l, store.state.properties)
  const send = (propId) => { store.closeModal(); store.openWhatsApp(propId, leadId) }
  return (
    <Modal title="Share a property on WhatsApp" onClose={store.closeModal} width={460}>
      <div className="u-muted" style={{ fontSize: 12.5, marginTop: -6, marginBottom: 12 }}>
        Best fits for <b style={{ color: 'var(--ink)' }}>{l.name}</b> — {l.req.config} · {l.req.deal} · {l.req.locality}. Ranked by the system.
      </div>
      {matches.length === 0 && <div className="u-muted" style={{ fontSize: 13, padding: '10px 0' }}>No inventory matches this requirement yet.</div>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {matches.map((m, i) => {
          const fit = fitReasons(m, l.req)
          return (
            <button key={m.id} onClick={() => send(m.id)}
              style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 11px', border: '1px solid var(--line)', background: '#fff', borderRadius: 10, cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left' }}>
              <div style={{ width: 44, height: 44, borderRadius: 8, background: thumbTint(m.id), display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--faint)', flexShrink: 0 }}><Icon name="building" size={21} strokeWidth={1.4} /></div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 13.5 }}>{m.society}{i === 0 && <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--accent)', background: 'var(--accent-wash)', borderRadius: 4, padding: '2px 6px', marginLeft: 7 }}>BEST FIT</span>}</div>
                <div className="u-muted" style={{ fontSize: 12 }}>{m.fitLine} · {fit.score}% fit</div>
              </div>
              <Money>{m.priceLabel}</Money>
              <Icon name="wa" size={18} style={{ color: 'var(--accent)', flexShrink: 0 }} />
            </button>
          )
        })}
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
const PUNE_LOCALITIES = [
  'Hinjewadi Phase 1', 'Hinjewadi Phase 3', 'Marunji / Hinjewadi',
  'Gahunje / Expressway', 'Kharadi', 'Kalyani Nagar',
  'Baner', 'Wakad', 'Viman Nagar', 'Kothrud'
];

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
    config: edit.req?.config || '2 BHK Apartment',
    locality: edit.req?.locality || 'Hinjewadi Phase 1',
    timeline: edit.req?.timeline || 'Immediate',
    source: edit.source || 'Website',
    agentId: edit.agentId || null,
    notes: edit.req?.notes || edit.req?.purpose || ''
  } : {
    name: '',
    phone: '',
    email: '',
    deal: 'sale',
    config: '2 BHK Apartment',
    locality: 'Hinjewadi Phase 1',
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
          <label>Preferred Pune Locality</label>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {PUNE_LOCALITIES.map(l => chip(f.locality === l, () => set('locality', l), l))}
          </div>
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

// ---- Add property ----
function PropertyForm({ store, propId }) {
  const [f, setF] = useState({ deal: 'sale', type: '2BHK', society: '', wing: '', flat: '', parking: '', locality: 'Wakad', price: '', owner: '', status: 'Available' })
  const set = (k, v) => setF(s => ({ ...s, [k]: v }))
  const save = () => {
    if (!f.society.trim()) { store.toast('Add a society name first', 'warn'); return }
    let rawNum = parseFloat(String(f.price).replace(/[^0-9.]/g, ''))
    let price = rawNum || (f.deal === 'rent' ? 30000 : 8000000)
    if (f.deal === 'sale') {
      if (price <= 25) price = Math.round(price * 10000000) // e.g. 1.5 -> 1.5 Cr (1,50,00,000)
      else if (price < 100000) price = Math.round(price * 100000) // e.g. 85 -> 85 L (85,00,000)
    }
    const label = f.deal === 'rent' ? '₹' + price.toLocaleString('en-IN') + '/mo' : (price >= 10000000 ? '₹' + (price / 10000000).toFixed(2).replace(/\.?0+$/, '') + 'Cr' : '₹' + Math.round(price / 100000) + 'L')
    store.addProperty({
      id: 'pnew' + Date.now(), title: `${f.type} · ${f.locality}`, type: f.type, deal: f.deal, locality: f.locality, society: f.society,
      project: f.society, wing: f.wing || undefined, flat: f.flat || undefined, parking: f.parking || undefined,
      carpet: 950, floor: 3, totalFloors: 12, facing: 'East', age: 3, price, priceLabel: label, negotiable: true, status: f.status,
      owner: f.owner || 'New owner', furnishing: 'Semi-furnished', possession: 'Immediate', isNew: true,
      features: ['Fresh listing, just added', 'Owner direct deal', 'Prime ' + f.locality + ' location', 'Ready to move'],
      depositLabel: f.deal === 'rent' ? '₹' + (price * 3).toLocaleString('en-IN') : undefined,
    })
    store.closeModal()
  }
  const chip = (on, onClick, label) => <button className={'qchip' + (on ? ' on' : '')} onClick={onClick}>{label}</button>
  return (
    <Modal title="Add property" onClose={store.closeModal} width={460}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div className="field"><label>Deal</label><Segmented value={f.deal} onChange={v => set('deal', v)} options={[{ value: 'sale', label: 'For sale' }, { value: 'rent', label: 'For rent' }]} /></div>
        <div className="field"><label>Type</label><div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>{['1BHK', '2BHK', '3BHK', 'Commercial', 'Plot'].map(t => chip(f.type === t, () => set('type', t), t))}</div></div>
        <Field label="Society / project"><Input value={f.society} onChange={e => set('society', e.target.value)} placeholder="e.g. Kolte Patil Life Republic" autoFocus /></Field>
        <div style={{ display: 'flex', gap: 12 }}>
          <div style={{ flex: 1 }}><Field label="Wing / tower"><Input value={f.wing} onChange={e => set('wing', e.target.value)} placeholder="B" /></Field></div>
          <div style={{ flex: 1 }}><Field label="Flat / unit no."><Input value={f.flat} onChange={e => set('flat', e.target.value)} placeholder="1402" /></Field></div>
          <div style={{ flex: 1 }}><Field label="Parking"><Input value={f.parking} onChange={e => set('parking', e.target.value)} placeholder="2 covered" /></Field></div>
        </div>
        <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: -4, display: 'flex', gap: 6, alignItems: 'center' }}><Icon name="check" size={13} style={{ color: 'var(--accent)' }} />Unit no. stays internal — hidden from client WhatsApp shares.</div>
        <div style={{ display: 'flex', gap: 12 }}>
          <div style={{ flex: 1 }}><Field label="Locality"><Input value={f.locality} onChange={e => set('locality', e.target.value)} /></Field></div>
          <div style={{ flex: 1 }}><Field label={f.deal === 'rent' ? 'Rent (₹/mo)' : 'Price (₹ lakh)'}><Input value={f.price} onChange={e => set('price', e.target.value)} placeholder={f.deal === 'rent' ? '32000' : '82'} /></Field></div>
        </div>
        <Field label="Owner"><Input value={f.owner} onChange={e => set('owner', e.target.value)} placeholder="Owner name" /></Field>
        <div className="field"><label>Status</label><Segmented value={f.status} onChange={v => set('status', v)} options={['Available', 'Under offer']} /></div>
        <Button variant="primary" block onClick={save}>Save property</Button>
      </div>
    </Modal>
  )
}

// ---- Add units to a project (row-by-row list) ----
// A unit IS a full standalone property. This adds several at once under ONE
// project: a shared header for the common facts, then one editable row per unit
// (each a complete property — flat no. optional). No forced floor range.
const UNIT_CONFIGS = ['1BHK', '2BHK', '3BHK', '4BHK', 'Shop', 'Office', 'Plot']

function priceLabelFor(deal, price) {
  return deal === 'rent'
    ? '₹' + price.toLocaleString('en-IN') + '/mo'
    : (price >= 10000000 ? '₹' + (price / 10000000).toFixed(2).replace(/\.?0+$/, '') + 'Cr' : '₹' + Math.round(price / 100000) + 'L')
}
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

function AddUnitsModal({ store, projKey }) {
  const sample = store.state.properties.find(p => (p.project || p.society) === projKey)
  // Shared header — the facts every unit shares. The BUILDER is common; each
  // unit's OWNER is a separate person, so owner lives on the per-unit row.
  const [hdr, setHdr] = useState({
    project: projKey && projKey !== 'Independent / Direct' ? projKey : '',
    wing: '', locality: sample?.locality || 'Pune', deal: sample?.deal || 'sale',
    builder: sample?.builder || '', totalFloors: sample?.totalFloors || '',
  })
  const setH = (k, v) => setHdr(s => ({ ...s, [k]: v }))
  // One row per unit; each can override config/floor/carpet/price/status.
  const [rows, setRows] = useState([emptyRow(), emptyRow(), emptyRow()])
  const setRow = (id, k, v) => setRows(rs => rs.map(r => r._id === id ? { ...r, [k]: v } : r))
  const addRow = () => setRows(rs => { const last = rs[rs.length - 1]; return [...rs, emptyRow({ config: last?.config || '2BHK', price: last?.price || '' })] })
  const dupRow = (id) => setRows(rs => { const r = rs.find(x => x._id === id); const i = rs.findIndex(x => x._id === id); const copy = emptyRow({ ...r, _id: undefined, flat: '' }); return [...rs.slice(0, i + 1), copy, ...rs.slice(i + 1)] })
  const rmRow = (id) => setRows(rs => rs.length > 1 ? rs.filter(r => r._id !== id) : rs)

  // Every real unit has an identifier (flat / shop / plot no.), so it's required.
  // A row with a flat no. is a unit; a row with other content but no id is invalid.
  const hasContent = (r) => r.flat.trim() || r.floor !== '' || r.owner.trim() || r.price !== ''
  const count = rows.filter(r => r.flat.trim()).length
  const missingId = rows.some(r => !r.flat.trim() && hasContent(r))

  const save = () => {
    if (!hdr.project.trim()) { store.toast('Name the project first', 'warn'); return }
    if (missingId) { store.toast('Every unit needs a unit / plot no.', 'warn'); return }
    const toCreate = rows.filter(r => r.flat.trim())
    if (!toCreate.length) { store.toast('Add at least one unit', 'warn'); return }
    const batchId = 'batch-units-' + Date.now()
    const units = toCreate.map((r, i) => {
      const price = parsePrice(r.price, hdr.deal)
      return {
        id: `pnew${Date.now()}-${i}`,
        title: `${r.config} · ${hdr.project}`, type: r.config, deal: hdr.deal,
        locality: hdr.locality, society: hdr.project, project: hdr.project,
        wing: hdr.wing || undefined, flat: r.flat.trim(),
        floor: r.floor !== '' ? Number(r.floor) : undefined,
        totalFloors: hdr.totalFloors ? Number(hdr.totalFloors) : undefined,
        price, priceLabel: price ? priceLabelFor(hdr.deal, price) : undefined, negotiable: true,
        status: r.status,
        owner: r.owner.trim() || 'Owner — to confirm',   // per-unit owner
        builder: hdr.builder || undefined,
        isNew: true, importBatchId: batchId,
      }
    })
    store.addProperties(units)
    store.closeModal()
  }

  return (
    <Modal title="Add units to a project" onClose={store.closeModal} width={860}>
      <div className="au-wrap">
        {/* Shared facts */}
        <div className="au-hdr">
          <div className="au-hdr-grid">
            <Field label="Project / township"><Input value={hdr.project} onChange={e => setH('project', e.target.value)} placeholder="e.g. Godrej Riverside" autoFocus={!hdr.project} /></Field>
            <Field label="Wing / tower"><Input value={hdr.wing} onChange={e => setH('wing', e.target.value)} placeholder="optional — e.g. B" /></Field>
            <Field label="Locality"><Input value={hdr.locality} onChange={e => setH('locality', e.target.value)} /></Field>
            <Field label="Builder / developer"><Input value={hdr.builder} onChange={e => setH('builder', e.target.value)} placeholder="optional — shared by the project" /></Field>
          </div>
          <div className="field au-deal"><label>Deal</label><Segmented value={hdr.deal} onChange={v => setH('deal', v)} options={[{ value: 'sale', label: 'For sale' }, { value: 'rent', label: 'For rent' }]} /></div>
        </div>

        {/* Per-unit rows — each unit is a full property with its OWN owner. */}
        <div className="au-list">
          <div className="au-scroll">
            <div className="au-row au-row-head">
              <span>Unit / plot no. *</span><span>Config</span><span>Floor</span><span>Owner (per unit)</span><span>{hdr.deal === 'rent' ? 'Rent ₹/mo' : 'Price'}</span><span>Status</span><span></span>
            </div>
            {rows.map(r => (
              <div key={r._id} className="au-row">
                <input className={'input' + (!r.flat.trim() && hasContent(r) ? ' err' : '')} value={r.flat} onChange={e => setRow(r._id, 'flat', e.target.value)} placeholder="e.g. B-1204" />
                <select className="input" value={r.config} onChange={e => setRow(r._id, 'config', e.target.value)}>{UNIT_CONFIGS.map(c => <option key={c} value={c}>{c}</option>)}</select>
                <input className="input" value={r.floor} onChange={e => setRow(r._id, 'floor', e.target.value)} placeholder="—" />
                <input className="input" value={r.owner} onChange={e => setRow(r._id, 'owner', e.target.value)} placeholder="Owner name" />
                <input className="input" value={r.price} onChange={e => setRow(r._id, 'price', e.target.value)} placeholder={hdr.deal === 'rent' ? '32000' : '95 L'} />
                <select className="input" value={r.status} onChange={e => setRow(r._id, 'status', e.target.value)}><option>Available</option><option>Under Offer</option><option>Sold</option></select>
                <div className="au-rowbtns">
                  <button className="icon-mini" title="Duplicate row" onClick={() => dupRow(r._id)}><Icon name="copy" size={13} /></button>
                  <button className="icon-mini danger" title="Remove" onClick={() => rmRow(r._id)}><Icon name="x" size={13} /></button>
                </div>
              </div>
            ))}
          </div>
          <button className="au-addrow" onClick={addRow}><Icon name="plus" size={14} />Add another unit</button>
        </div>

        <div className="au-foot">
          <span className={'au-count' + (missingId ? ' warn' : '')}>
            {missingId ? 'Give every unit a unit / plot no.' : `${count} unit${count !== 1 ? 's' : ''} ready · revertable from Import history`}
          </span>
          <Button variant="primary" onClick={save} icon="plus" disabled={count === 0 || missingId}>Add {count} unit{count !== 1 ? 's' : ''}</Button>
        </div>
      </div>
    </Modal>
  )
}

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
  return (
    <Modal title="Add agent" onClose={store.closeModal} width={380}>
      <Field label="Agent name"><Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Kiran Patil" autoFocus /></Field>
      <Button variant="primary" block style={{ marginTop: 16 }} onClick={() => { if (name.trim()) { store.addAgent(name); store.closeModal() } else store.toast('Add a name first', 'warn') }}>Add to team</Button>
    </Modal>
  )
}

// ---- Call & SMS ----
function CallModal({ store, leadId, owner, propId }) {
  const l = leadId ? store.state.leads.find(x => x.id === leadId) : null
  const p = propId ? store.state.properties.find(x => x.id === propId) : null
  const name = l ? l.name : owner
  const phone = l ? l.phone : (p?.phone || p?.ownerPhone || '+91 98220 00000')
  const [tab, setTab] = useState('call')
  const first = (name || '').split(' ')[0]
  // owner call (no lead) logs to the property's own timeline
  const logCall = () => {
    if (l) store.addNote(l.id, 'Call logged with ' + first, 'call')
    else if (propId) store.logEvent(propId, 'call', `Called owner ${owner}`)
    store.closeModal()
  }
  return (
    <Modal title="Call & SMS" onClose={store.closeModal} width={400}>
      <div className="u-muted" style={{ fontSize: 12.5, marginTop: -6, marginBottom: 12 }}>{name} · <span className="mono-num">{phone}</span></div>
      <Segmented block value={tab} onChange={setTab} options={['call', 'sms'].map(v => ({ value: v, label: v === 'call' ? 'Call' : 'SMS' }))} />
      <div style={{ marginTop: 14 }}>
        {tab === 'call' ? (
          <>
            <button className="btn btn-primary btn-block" onClick={logCall} style={{ padding: 14 }}><Icon name="phone" />Call {first}</button>
            <div className="u-muted" style={{ fontSize: 12, textAlign: 'center', marginTop: 9 }}>Calls auto-log to the timeline. Connects with your telephony account.</div>
          </>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[`Namaste ${first}, site visit confirmed. Address & time on WhatsApp. — ${theme.brand.firmName}`, `Hi ${first}, following up on the properties we discussed. Book a visit this weekend?`, `Thank you for visiting today! Sharing 2 more matching options shortly.`].map((t, i) => (
              <div key={i} style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 9, padding: '11px 12px', fontSize: 12.5, color: 'var(--ink-2)', lineHeight: 1.5, display: 'flex', gap: 10 }}>
                <Icon name="sms" size={16} style={{ color: 'var(--muted)', flexShrink: 0, marginTop: 1 }} /><span>{t}</span>
              </div>
            ))}
          </div>
        )}
        <div style={{ marginTop: 14, background: 'var(--accent-wash)', border: '1px solid var(--accent-line)', borderRadius: 9, padding: '11px 13px', fontSize: 12, color: 'var(--accent-ink)', display: 'flex', gap: 10 }}>
          <Icon name="zap" size={16} style={{ flexShrink: 0, marginTop: 1 }} /><span><b>Connects to your telephony account.</b> Click-to-call & SMS switch on when you add your number.</span>
        </div>
      </div>
    </Modal>
  )
}

function NoteModal({ store, leadId }) {
  const [text, setText] = useState('')
  return (
    <Modal title="Add note" onClose={store.closeModal} width={400}>
      <Textarea value={text} onChange={e => setText(e.target.value)} placeholder="Note or call summary…" autoFocus />
      <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
        <Button variant="primary" style={{ flex: 1, justifyContent: 'center' }} onClick={() => { if (text.trim()) { store.addNote(leadId, text, 'note'); store.closeModal() } else store.toast('Type a note first', 'warn') }}>Add note</Button>
        <Button onClick={() => { if (text.trim()) { store.addNote(leadId, text, 'call'); store.closeModal() } else store.toast('Type a note first', 'warn') }}>Log as call</Button>
      </div>
    </Modal>
  )
}

function StatusModal({ store, propId }) {
  const p = store.state.properties.find(x => x.id === propId)
  return (
    <Modal title="Listing status" onClose={store.closeModal} width={360}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {['Available', 'Under offer', 'Closed'].map(s => (
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

function IntegrationModal({ store, card }) {
  const current = store.state.integrations?.[card.key] || {}
  const [apiKey, setApiKey] = useState(current.apiKey || current.phoneId || '')
  const [sid, setSid] = useState(current.sid || current.accessToken || '')
  const isWebhook = card.key === '99acres' || card.key === 'MagicBricks' || card.key === 'Website sync'
  const isActive = current.status === 'active'

  const handleSave = () => {
    store.saveIntegration(card.key, isWebhook ? { status: 'active' } : { apiKey, sid, status: 'active' })
    store.closeModal()
  }

  return (
    <Modal title={`Configure ${card.key}`} onClose={store.closeModal} width={480}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <div style={{ width: 44, height: 44, borderRadius: 10, background: 'var(--card-2)', border: '1px solid var(--line)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--disp)', fontWeight: 700, fontSize: 16 }}>{card.mark}</div>
        <div>
          <div style={{ fontWeight: 600, fontSize: 14.5 }}>{card.key} Integration</div>
          <div className="u-muted" style={{ fontSize: 12.5 }}>{card.desc}</div>
        </div>
      </div>

      {isWebhook ? (
        <div style={{ background: 'var(--card-2)', border: '1px solid var(--line)', borderRadius: 10, padding: 14, marginBottom: 18 }}>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--muted)', marginBottom: 6 }}>Your Live Webhook URL</div>
          <div style={{ fontFamily: 'monospace', fontSize: 12, background: 'var(--card)', padding: '8px 10px', borderRadius: 6, border: '1px solid var(--line)', wordBreak: 'break-all', marginBottom: 10, color: 'var(--ink)' }}>
            {current.webhookUrl || `https://api.bhumipropcity.com/v1/ingest/bhumi-propcity/${card.key.toLowerCase().replace(/\s+/g, '')}`}
          </div>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--muted)', marginBottom: 6 }}>HMAC SHA-256 Secret</div>
          <div style={{ fontFamily: 'monospace', fontSize: 12, background: 'var(--card)', padding: '8px 10px', borderRadius: 6, border: '1px solid var(--line)', color: 'var(--accent-ink)' }}>
            {current.secret || 'whsec_live_default_secret_991'}
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 18 }}>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink-2)', display: 'block', marginBottom: 4 }}>
              {card.key === 'Calling & SMS' ? 'Exotel API Key / SID' : 'Meta WABA Phone Number ID'}
            </label>
            <input className="input" value={apiKey} onChange={e => setApiKey(e.target.value)} placeholder={card.key === 'Calling & SMS' ? 'exo_live_key_...' : '109283746582910'} style={{ width: '100%' }} />
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink-2)', display: 'block', marginBottom: 4 }}>
              {card.key === 'Calling & SMS' ? 'Virtual Landline DID / Caller ID' : 'System User Access Token'}
            </label>
            <input className="input" value={sid} onChange={e => setSid(e.target.value)} placeholder={card.key === 'Calling & SMS' ? '080-45678900' : 'EAAGm0PX4ZCpsBA...'} type={card.key === 'Calling & SMS' ? 'text' : 'password'} style={{ width: '100%' }} />
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
        <Button variant="ghost" onClick={store.closeModal}>Cancel</Button>
        <Button variant="primary" onClick={handleSave}>
          {isActive ? 'Update & Save Credentials' : 'Connect & Activate Channel'}
        </Button>
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
        locality: mapping.locality ? (row[mapping.locality] || 'Pune HQ') : 'Pune HQ',
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
        locality: mapping.locality ? (row[mapping.locality] || 'Pune HQ') : 'Pune HQ',
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
                    <option value="">-- Default Pune HQ --</option>
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
          <div className="u-muted" style={{ fontSize: 12 }}>
            Click any card to open full inquiry record
          </div>
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
