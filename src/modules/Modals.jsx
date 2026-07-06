import { useState } from 'react'
import Icon from '../components/Icon.jsx'
import { Button, Field, Input, PhoneInput, Textarea, Segmented, Avatar, Source, StageTag, Money } from '../components/primitives.jsx'
import { theme } from '../data/theme.js'
import { budgetRange, reqLine, initials, thumbTint, fitReasons } from '../lib/format.js'
import { matchesForLead, leadsForProperty } from '../data/seed.js'

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
      {m?.kind === 'assign' && <AssignModal store={store} leadId={m.leadId} />}
      {m?.kind === 'reassign' && <ReassignModal store={store} fromId={m.fromId} />}
      {m?.kind === 'addAgent' && <AddAgentModal store={store} />}
      {m?.kind === 'call' && <CallModal store={store} leadId={m.leadId} />}
      {m?.kind === 'callOwner' && <CallModal store={store} owner={m.owner} />}
      {m?.kind === 'note' && <NoteModal store={store} leadId={m.leadId} />}
      {m?.kind === 'propStatus' && <StatusModal store={store} propId={m.propId} />}
      {m?.kind === 'integration' && <IntegrationModal store={store} card={m.card} />}
      {m?.kind === 'import' && <ImportModal store={store} />}
      {m?.kind === 'visitFeedback' && <VisitFeedbackModal store={store} leadId={m.leadId} propId={m.propId} />}
      {m?.kind === 'pickMatch' && <PickMatchModal store={store} leadId={m.leadId} />}
      {m?.kind === 'pickBuyer' && <PickBuyerModal store={store} propId={m.propId} />}
      {m?.kind === 'attachProp' && <AttachPropModal store={store} leadId={m.leadId} />}
      {m?.kind === 'outreach' && <OutreachModal store={store} leadId={m.leadId} channel={m.channel} />}
    </>
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
    .filter(p => !ql || p.society.toLowerCase().includes(ql) || p.locality.toLowerCase().includes(ql) || p.type.toLowerCase().includes(ql))
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
  const [ch, setCh] = useState(channel)
  const [text, setText] = useState('')
  if (!l) return null
  const first = l.name.split(' ')[0]
  const templates = {
    sms: [
      `Namaste ${first}, this is ${theme.brand.firmName}. Following up on your property search — shall we talk today?`,
      `Hi ${first}, a couple of good options just came up in ${l.req.locality}. Free for a quick call?`,
      `Thanks for your time, ${first}! I'll share matching ${l.req.config} options shortly.`,
    ],
    wa: [
      `Namaste ${first} 🙏 ${theme.brand.firmName} here. Aapki ${l.req.config} requirement ke liye kuch achhe options hain — baat karein?`,
      `Hi ${first}, following up on your ${l.req.locality} search. Weekend mein site visit fix karein?`,
    ],
  }
  const logIt = () => {
    if (ch === 'call') { store.addNote(l.id, 'Call logged with ' + first, 'call') }
    else { store.addNote(l.id, `${ch === 'wa' ? 'WhatsApp' : 'SMS'} sent to ${first}${text ? ': ' + text.slice(0, 40) + (text.length > 40 ? '…' : '') : ''}`, 'msg') }
    store.closeModal()
  }
  return (
    <Modal title={`Reach out to ${first}`} onClose={store.closeModal} width={430}>
      <div className="u-muted" style={{ fontSize: 12.5, marginTop: -6, marginBottom: 12 }}><span className="mono-num">{l.phone}</span> · {l.req.config} · {l.req.locality}</div>
      <Segmented block value={ch} onChange={setCh}
        options={[{ value: 'call', label: 'Call' }, { value: 'sms', label: 'SMS' }, { value: 'wa', label: 'WhatsApp' }]} />

      <div style={{ marginTop: 14 }}>
        {ch === 'call' ? (
          <>
            <button className="btn btn-primary btn-block" style={{ padding: 14 }} onClick={logIt}><Icon name="phone" />Call {first} & log</button>
            <div className="u-muted" style={{ fontSize: 12, textAlign: 'center', marginTop: 9 }}>Calls auto-log to the timeline once your telephony is connected.</div>
          </>
        ) : (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7, marginBottom: 10 }}>
              {(templates[ch] || []).map((t, i) => (
                <button key={i} onClick={() => setText(t)}
                  style={{ textAlign: 'left', background: text === t ? 'var(--accent-wash)' : '#fff', border: '1px solid ' + (text === t ? 'var(--accent-line)' : 'var(--line)'), borderRadius: 9, padding: '9px 11px', fontSize: 12.5, color: 'var(--ink-2)', lineHeight: 1.5, cursor: 'pointer', fontFamily: 'inherit' }}>
                  {t}
                </button>
              ))}
            </div>
            <Textarea value={text} onChange={e => setText(e.target.value)} placeholder={`Type your ${ch === 'wa' ? 'WhatsApp' : 'SMS'} message, or pick a template…`} />
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <Button variant="primary" style={{ flex: 1, justifyContent: 'center' }} icon={ch === 'wa' ? 'wa' : 'sms'} onClick={logIt}>Send {ch === 'wa' ? 'WhatsApp' : 'SMS'}</Button>
              <Button icon="tag" onClick={() => store.openModal({ kind: 'pickMatch', leadId: l.id })}>Attach property</Button>
            </div>
          </>
        )}
        <div style={{ marginTop: 14, background: 'var(--accent-wash)', border: '1px solid var(--accent-line)', borderRadius: 9, padding: '10px 12px', fontSize: 11.5, color: 'var(--accent-ink)', display: 'flex', gap: 9 }}>
          <Icon name="zap" size={15} style={{ flexShrink: 0, marginTop: 1 }} /><span>Connects to your own telephony / WhatsApp account on setup. Nothing sends until you link it.</span>
        </div>
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
      <Button block onClick={() => send(undefined)} icon="wa">Generate without a recipient</Button>
    </Modal>
  )
}

// ---- New / edit lead ----
function LeadForm({ store, leadId }) {
  const edit = leadId ? store.state.leads.find(l => l.id === leadId) : null
  const [f, setF] = useState(edit ? { name: edit.name, phone: edit.phone, deal: edit.req.deal, config: edit.req.config, locality: edit.req.locality, timeline: edit.req.timeline, source: edit.source, agentId: edit.agentId, notes: edit.req.notes } : { name: '', phone: '', deal: 'sale', config: '2BHK', locality: '', timeline: '', source: '99acres', agentId: null, notes: '' })
  const set = (k, v) => setF(s => ({ ...s, [k]: v }))
  const save = () => {
    if (!f.name.trim()) { store.toast('Add a name first', 'warn'); return }
    const budget = f.deal === 'rent' ? { budgetMin: 20000, budgetMax: 35000 } : { budgetMin: 7500000, budgetMax: 9000000 }
    const lead = {
      id: 'lnew' + Date.now(), name: f.name, phone: f.phone || '+91 90000 00000', source: f.source, stage: 'New', minsAgo: 0, agentId: f.agentId,
      req: { config: f.config, deal: f.deal, locality: f.locality || 'Wakad', ...budget, timeline: f.timeline || 'Flexible', notes: f.notes || '' },
      overdue: false, followUp: null, timeline: [{ type: 'created', label: 'Lead created manually', ago: 'just now' }],
    }
    if (edit) store.toast('Lead updated'); else store.addLead(lead)
    store.closeModal()
  }
  const chip = (on, onClick, label) => <button className={'qchip' + (on ? ' on' : '')} onClick={onClick}>{label}</button>
  return (
    <Modal title={edit ? 'Edit lead' : 'New lead'} onClose={store.closeModal} width={460}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <Field label="Name"><Input value={f.name} onChange={e => set('name', e.target.value)} placeholder="e.g. Rohit Sharma" autoFocus /></Field>
        <Field label="Phone"><PhoneInput value={f.phone} onChange={e => set('phone', e.target.value)} placeholder="98xxx xxxxx" /></Field>
        <div className="field"><label>Deal</label><Segmented value={f.deal} onChange={v => set('deal', v)} options={[{ value: 'sale', label: 'Buy' }, { value: 'rent', label: 'Rent' }]} /></div>
        <div className="field"><label>Config</label><div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>{['1BHK', '2BHK', '3BHK', 'Commercial', 'Plot'].map(t => chip(f.config === t, () => set('config', t), t))}</div></div>
        <Field label="Locality"><Input value={f.locality} onChange={e => set('locality', e.target.value)} placeholder="Wakad" /></Field>
        <div className="field"><label>Source</label><div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>{theme.sources.map(s => chip(f.source === s, () => set('source', s), s))}</div></div>
        <div className="field"><label>Assign to</label><div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>{store.state.agents.map(a => chip(f.agentId === a.id, () => set('agentId', a.id), a.first))}</div></div>
        <Field label="Notes"><Textarea value={f.notes} onChange={e => set('notes', e.target.value)} placeholder="Notes (optional)" /></Field>
        <Button variant="primary" block onClick={save}>{edit ? 'Save changes' : 'Save lead'}</Button>
      </div>
    </Modal>
  )
}

// ---- Add property ----
function PropertyForm({ store, propId }) {
  const [f, setF] = useState({ deal: 'sale', type: '2BHK', society: '', locality: 'Wakad', price: '', owner: '', status: 'Available' })
  const set = (k, v) => setF(s => ({ ...s, [k]: v }))
  const save = () => {
    if (!f.society.trim()) { store.toast('Add a society name first', 'warn'); return }
    let price = parseInt(String(f.price).replace(/[^0-9]/g, '')) || (f.deal === 'rent' ? 30000 : 8000000)
    if (f.deal === 'sale' && price < 100000) price *= 100000
    const label = f.deal === 'rent' ? '₹' + price.toLocaleString('en-IN') + '/mo' : (price >= 10000000 ? '₹' + (price / 10000000).toFixed(2).replace(/\.?0+$/, '') + 'Cr' : '₹' + Math.round(price / 100000) + 'L')
    store.addProperty({
      id: 'pnew' + Date.now(), title: `${f.type} · ${f.locality}`, type: f.type, deal: f.deal, locality: f.locality, society: f.society,
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
function CallModal({ store, leadId, owner }) {
  const l = leadId ? store.state.leads.find(x => x.id === leadId) : null
  const name = l ? l.name : owner
  const phone = l ? l.phone : store.demoPhone(owner || 'Owner')
  const [tab, setTab] = useState('call')
  const first = (name || '').split(' ')[0]
  return (
    <Modal title="Call & SMS" onClose={store.closeModal} width={400}>
      <div className="u-muted" style={{ fontSize: 12.5, marginTop: -6, marginBottom: 12 }}>{name} · <span className="mono-num">{phone}</span></div>
      <Segmented block value={tab} onChange={setTab} options={['call', 'sms'].map(v => ({ value: v, label: v === 'call' ? 'Call' : 'SMS' }))} />
      <div style={{ marginTop: 14 }}>
        {tab === 'call' ? (
          <>
            <button className="btn btn-primary btn-block" onClick={() => { if (l) store.addNote(l.id, 'Call logged with ' + first, 'call'); store.closeModal() }} style={{ padding: 14 }}><Icon name="phone" />Call {first}</button>
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
  return (
    <Modal title={card.key} onClose={store.closeModal} width={440}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
        <div style={{ width: 44, height: 44, borderRadius: 10, background: 'var(--card-2)', border: '1px solid var(--line)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--disp)', fontWeight: 700, fontSize: 16 }}>{card.mark}</div>
        <div className="u-muted" style={{ fontSize: 13 }}>{card.desc}</div>
      </div>
      <div style={{ background: card.staged ? 'var(--accent-wash)' : 'var(--line-2)', border: '1px solid ' + (card.staged ? 'var(--accent-line)' : 'var(--line)'), borderRadius: 9, padding: '11px 13px', fontSize: 12, color: card.staged ? 'var(--accent-ink)' : 'var(--ink-2)', lineHeight: 1.5, marginBottom: 16 }}>
        <b>{card.staged ? 'Not live in this demo.' : 'Custom add-on.'}</b> {card.staged ? "You'll authorise with your own account on setup — no data leaves your system until you connect it." : 'Scoped once we see your current site — priced separately from the core platform.'}
      </div>
      <Button variant="primary" block onClick={store.closeModal}>{card.staged ? 'Connect ' + card.key : 'Request scoping'}</Button>
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

// ---- Staged bulk import (Excel / Google Sheets) — mockup, not a real parser ----
const IMPORT_MAP = {
  clients: { file: 'Peshwa_client_list_2025.xlsx', rows: 340, cols: [
    ['Name', 'Client name', true], ['Mobile', 'Phone', true], ['Looking for', 'Requirement', true],
    ['Budget', 'Budget range', true], ['Area', 'Locality', true], ['Source', 'Lead source', true], ['Remarks', 'Notes', false] ] },
  properties: { file: 'Inventory_master.xlsx', rows: 65, cols: [
    ['Project', 'Society / project', true], ['Type', 'Configuration', true], ['Wing/Flat', 'Wing · Unit no.', true],
    ['Carpet', 'Carpet area', true], ['Owner', 'Owner name', true], ['Owner No.', 'Owner phone', true], ['Ask', 'Quoted price', false] ] },
}
function ImportModal({ store }) {
  const [kind, setKind] = useState('clients')
  const [staged, setStaged] = useState(false)
  const map = IMPORT_MAP[kind]
  return (
    <Modal title="Import from Excel / Google Sheets" onClose={store.closeModal} width={520}>
      <Segmented block value={kind} onChange={v => { setKind(v); setStaged(false) }}
        options={[{ value: 'clients', label: 'Clients' }, { value: 'properties', label: 'Properties' }]} />

      {!staged ? (
        <button onClick={() => setStaged(true)}
          style={{ width: '100%', marginTop: 14, border: '1.5px dashed var(--accent-line)', background: 'var(--accent-wash)', borderRadius: 12, padding: '30px 20px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, cursor: 'pointer', fontFamily: 'inherit' }}>
          <div style={{ width: 48, height: 48, borderRadius: 12, background: 'var(--card)', border: '1px solid var(--accent-line)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent-ink)' }}><Icon name="layers" size={24} /></div>
          <div style={{ fontWeight: 600, fontSize: 14 }}>Drop your .xlsx / .csv here</div>
          <div className="u-muted" style={{ fontSize: 12.5 }}>or click to browse — Excel, CSV or a Google Sheets link</div>
        </button>
      ) : (
        <>
          <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 11, background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 10, padding: '11px 13px' }}>
            <div style={{ width: 34, height: 34, borderRadius: 8, background: 'var(--accent-wash)', color: 'var(--accent-ink)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Icon name="check" size={17} /></div>
            <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontWeight: 600, fontSize: 13.5 }}>{map.file}</div><div className="u-muted" style={{ fontSize: 12 }}>{map.rows} rows detected · {map.cols.length} columns</div></div>
            <button className="btn btn-quiet btn-sm" onClick={() => setStaged(false)}>Change</button>
          </div>

          <div style={{ fontSize: 10.5, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--muted)', fontWeight: 700, margin: '16px 0 8px' }}>Column mapping — we detected these</div>
          <div style={{ border: '1px solid var(--line)', borderRadius: 10, overflow: 'hidden' }}>
            {map.cols.map(([theirs, ours, matched], i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderTop: i ? '1px solid var(--line-2)' : 'none', fontSize: 13 }}>
                <span style={{ flex: 1, fontWeight: 500, color: 'var(--ink-2)' }}>“{theirs}”</span>
                <Icon name="arrowRight" size={14} style={{ color: 'var(--faint)' }} />
                <span style={{ flex: 1, fontWeight: 600 }}>{ours}</span>
                <span className="fit ok" style={{ padding: '1px 7px' }}><Icon name="check" size={11} />{matched ? 'auto' : 'review'}</span>
              </div>
            ))}
          </div>

          <div style={{ marginTop: 14, background: 'var(--accent-wash)', border: '1px solid var(--accent-line)', borderRadius: 9, padding: '11px 13px', fontSize: 12, color: 'var(--accent-ink)', display: 'flex', gap: 10 }}>
            <Icon name="zap" size={16} style={{ flexShrink: 0, marginTop: 1 }} /><span><b>Runs on setup with your real file.</b> In this demo the mapping is previewed but not imported — your live sheet lands in seconds once we connect.</span>
          </div>
          <Button variant="primary" block style={{ marginTop: 14 }} onClick={() => { store.toast(`${map.rows} ${kind} mapped — imports on setup`); store.closeModal() }}>
            Import {map.rows} {kind}
          </Button>
        </>
      )}
    </Modal>
  )
}

// ---- Global search ----
function SearchModal({ store, go }) {
  const [q, setQ] = useState('')
  const ql = q.trim().toLowerCase()
  const leads = ql ? store.state.leads.filter(l => l.name.toLowerCase().includes(ql) || l.req.locality.toLowerCase().includes(ql) || l.phone.includes(ql)).slice(0, 5) : []
  const props = ql ? store.state.properties.filter(p => p.society.toLowerCase().includes(ql) || p.locality.toLowerCase().includes(ql)).slice(0, 5) : []
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
            <button key={l.id} onClick={() => goTo(() => go('leads', { leadId: l.id, leadOpen: true }))} style={{ textAlign: 'left', width: '100%', background: 'transparent', border: 'none', borderRadius: 8, padding: '9px 10px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 9, fontFamily: 'inherit' }}>
              <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontWeight: 600 }}>{l.name}</div><div className="u-muted" style={{ fontSize: 12 }}>{reqLine(l.req)}</div></div>
              <StageTag stage={l.stage} />
            </button>
          ))}
          {props.length > 0 && <div style={{ fontSize: 10, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--muted)', fontWeight: 700, padding: '10px 10px 5px' }}>Properties</div>}
          {props.map(p => (
            <button key={p.id} onClick={() => goTo(() => go('properties', { propId: p.id, propOpen: true }))} style={{ textAlign: 'left', width: '100%', background: 'transparent', border: 'none', borderRadius: 8, padding: '9px 10px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 9, fontFamily: 'inherit' }}>
              <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontWeight: 600 }}>{p.society}</div><div className="u-muted" style={{ fontSize: 12 }}>{p.title}</div></div>
              <Money>{p.priceLabel}</Money>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

// ---- Notifications ----
function NotifModal({ store, go }) {
  const items = []
  store.state.leads.forEach(l => {
    if (l.overdue) items.push({ leadId: l.id, icon: 'clock', title: 'Overdue: ' + l.name, sub: l.followUp?.action })
  })
  store.state.leads.filter(l => !l.agentId).forEach(l => items.push({ leadId: l.id, icon: 'person', title: 'Unassigned: ' + l.name, sub: reqLine(l.req) }))
  const close = () => store.setNotif(false)
  return (
    <div className="overlay end" onClick={close}>
      <div style={{ width: 420, maxWidth: '100%', background: 'var(--bg)', borderRadius: 14, boxShadow: 'var(--shadow-pop)', overflow: 'hidden' }} onClick={e => e.stopPropagation()}>
        <div style={{ padding: '15px 16px', display: 'flex', alignItems: 'center', gap: 9, borderBottom: '1px solid var(--line)' }}>
          <Icon name="bell" /><div style={{ flex: 1, fontFamily: 'var(--disp)', fontWeight: 600, fontSize: 15 }}>Notifications</div>
          <button className="btn btn-icon btn-quiet" onClick={close}><Icon name="x" /></button>
        </div>
        <div style={{ maxHeight: '64vh', overflowY: 'auto', padding: '6px 8px 12px' }}>
          {!items.length && <div className="u-muted" style={{ padding: 28, textAlign: 'center', fontSize: 13 }}>All clear — nothing needs you.</div>}
          {items.map((n, i) => (
            <button key={i} onClick={() => { close(); go('leads', { leadId: n.leadId, leadOpen: true }) }} style={{ textAlign: 'left', width: '100%', background: 'transparent', border: 'none', borderRadius: 9, padding: '11px 10px', cursor: 'pointer', display: 'flex', gap: 11, alignItems: 'flex-start', fontFamily: 'inherit' }}>
              <span style={{ width: 32, height: 32, borderRadius: 8, flexShrink: 0, background: 'var(--card-2)', border: '1px solid var(--line)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--muted)' }}><Icon name={n.icon} size={16} /></span>
              <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontWeight: 600, fontSize: 13.5 }}>{n.title}</div><div className="u-muted" style={{ fontSize: 12, marginTop: 1 }}>{n.sub}</div></div>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
