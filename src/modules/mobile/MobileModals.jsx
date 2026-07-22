import { useState } from 'react'
import Icon from '../../components/Icon.jsx'
import { Button, Field, Input, PhoneInput, Textarea, Segmented, Money } from '../../components/primitives.jsx'
import { WaCanvas } from '../../components/chrome.jsx'
import { theme } from '../../data/theme.js'
import { thumbTint, fitReasons } from '../../lib/format.js'
import { matchesForLead, leadsForProperty, whatsappLink } from '../../lib/matching.js'

function Sheet({ title, onClose, children }) {
  return (
    <div className="overlay sheet" onClick={onClose} style={{ zIndex: 70 }}>
      <div className="sheet-card" onClick={e => e.stopPropagation()} style={{ maxHeight: '88vh', display: 'flex', flexDirection: 'column' }}>
        <div className="sheet-grip" />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px', padding: '0 4px', flexShrink: 0 }}>
          <div style={{ fontFamily: 'var(--disp)', fontWeight: 600, fontSize: '17px', color: 'var(--ink)' }}>{title}</div>
          <button onClick={onClose} style={{ border: 'none', background: 'var(--line-2)', width: '28px', height: '28px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--ink-2)' }}>
            <Icon name="x" size={15} />
          </button>
        </div>
        <div style={{ overflowY: 'auto', flex: 1, padding: '2px 4px 16px' }}>
          {children}
        </div>
      </div>
    </div>
  )
}

export default function MobileModals({ store }) {
  const m = store.state.modal
  const wa = store.state.waState

  if (wa) return <MobileWaModal store={store} wa={wa} />
  if (!m) return null

  const close = () => store.closeModal()

  if (m.kind === 'newLead') return <MobileLeadForm store={store} onClose={close} />
  if (m.kind === 'editLead') return <MobileLeadForm store={store} leadId={m.leadId} onClose={close} />
  if (m.kind === 'addProperty') return <MobilePropForm store={store} propId={m.propId} onClose={close} />
  if (m.kind === 'outreach' || m.kind === 'call') return <MobileOutreach store={store} leadId={m.leadId} channel={m.channel || 'call'} onClose={close} />
  if (m.kind === 'note') return <MobileNote store={store} leadId={m.leadId} propId={m.propId} onClose={close} />
  if (m.kind === 'propStatus') return <MobileStatus store={store} propId={m.propId} onClose={close} />
  if (m.kind === 'pickMatch') return <MobilePickMatch store={store} leadId={m.leadId} onClose={close} />
  if (m.kind === 'pickBuyer') return <MobilePickBuyer store={store} propId={m.propId} onClose={close} />
  if (m.kind === 'attachProp') return <MobileAttachProp store={store} leadId={m.leadId} onClose={close} />
  if (m.kind === 'callOwner') return <MobileCallOwner store={store} owner={m.owner} onClose={close} />
  if (m.kind === 'visitFeedback') return <MobileVisitFeedback store={store} leadId={m.leadId} propId={m.propId} onClose={close} />

  // Fallback for admin/desktop modal kinds triggered in mobile mode
  if (m.kind === 'assign' || m.kind === 'reassign' || m.kind === 'addAgent' || m.kind === 'integration') {
    return (
      <Sheet title="Admin Action" onClose={close}>
        <div className="u-muted" style={{ padding: '16px 0', textAlign: 'center', fontSize: '13.5px' }}>
          This team management action is optimized for the desktop Admin dashboard.
        </div>
        <Button variant="primary" block onClick={close}>Close</Button>
      </Sheet>
    )
  }

  return null
}

function MobileLeadForm({ store, leadId, onClose }) {
  const edit = !!leadId
  const l = edit ? store.state.leads.find(x => x.id === leadId) : null
  const me = store.me()
  const [f, setF] = useState({
    name: l?.name || '',
    phone: l?.phone || '',
    deal: l?.req.deal || 'sale',
    config: l?.req.config || '2BHK',
    locality: l?.req.locality || 'Wakad',
    source: l?.source || 'Walk-in',
    agentId: l?.agentId || me.id,
    notes: l?.req.notes || ''
  })

  const set = (k, v) => setF(s => ({ ...s, [k]: v }))
  const chip = (on, onClick, label) => (
    <button
      className={'qchip' + (on ? ' on' : '')}
      onClick={onClick}
      type="button"
      style={{ padding: '6px 12px', fontSize: '12.5px' }}
    >
      {label}
    </button>
  )

  const save = () => {
    if (!f.name.trim() || !f.phone.trim()) {
      store.toast('Name and phone are required', 'warn')
      return
    }
    // budget defaults match the desktop LeadForm so matching + ₹ display work
    const budget = f.deal === 'rent' ? { budgetMin: 20000, budgetMax: 35000 } : { budgetMin: 7500000, budgetMax: 9000000 }
    const lead = {
      id: edit ? l.id : 'lnew' + Date.now(),
      name: f.name.trim(),
      phone: f.phone.trim() || '+91 90000 00000',
      source: f.source,
      stage: edit ? l.stage : 'New',
      minsAgo: edit ? l.minsAgo : 0,
      agentId: f.agentId,
      overdue: edit ? l.overdue : false,
      followUp: edit ? l.followUp : null,
      req: {
        deal: f.deal,
        config: f.config,
        locality: f.locality || 'Wakad',
        ...budget,
        timeline: edit ? l.req.timeline : 'Within 30 days',
        notes: f.notes || ''
      },
      shortlist: edit ? l.shortlist : [],
      // canonical timeline shape ({type,label,ago}) so the shared Timeline renders it
      timeline: edit ? l.timeline : [{ type: 'created', label: `Lead created from field (${f.source})`, ago: 'just now' }]
    }
    if (edit) store.toast('Lead updated')
    else store.addLead(lead)
    onClose()
  }

  return (
    <Sheet title={edit ? 'Edit Lead' : 'New Walk-in Lead'} onClose={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        <Field label="Full Name">
          <Input value={f.name} onChange={e => set('name', e.target.value)} placeholder="e.g. Rahul Verma" autoFocus />
        </Field>
        <Field label="Phone Number">
          <PhoneInput value={f.phone} onChange={e => set('phone', e.target.value)} placeholder="98xxx xxxxx" />
        </Field>
        <div className="field">
          <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', display: 'block', marginBottom: '6px' }}>Requirement Type</label>
          <Segmented value={f.deal} onChange={v => set('deal', v)} options={[{ value: 'sale', label: 'Buy' }, { value: 'rent', label: 'Rent' }]} />
        </div>
        <div className="field">
          <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', display: 'block', marginBottom: '6px' }}>Configuration</label>
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            {['1BHK', '2BHK', '3BHK', 'Commercial', 'Plot'].map(t => chip(f.config === t, () => set('config', t), t))}
          </div>
        </div>
        <Field label="Preferred Locality">
          <Input value={f.locality} onChange={e => set('locality', e.target.value)} placeholder="e.g. Wakad, Baner" />
        </Field>
        <div className="field">
          <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', display: 'block', marginBottom: '6px' }}>Lead Source</label>
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            {store.state.settings.sources.map(s => chip(f.source === s, () => set('source', s), s))}
          </div>
        </div>
        <Field label="Requirement Notes">
          <Textarea value={f.notes} onChange={e => set('notes', e.target.value)} placeholder="Specific demands, budget details..." />
        </Field>
        <Button variant="primary" block onClick={save} style={{ marginTop: '8px', padding: '13px' }}>
          {edit ? 'Save Changes' : 'Create Lead'}
        </Button>
      </div>
    </Sheet>
  )
}

function MobilePropForm({ store, propId, onClose }) {
  const [f, setF] = useState({ deal: 'sale', type: '2BHK', society: '', locality: 'Wakad', price: '', owner: '', status: 'Available' })
  const set = (k, v) => setF(s => ({ ...s, [k]: v }))
  const chip = (on, onClick, label) => <button className={'qchip' + (on ? ' on' : '')} onClick={onClick} type="button" style={{ padding: '6px 12px' }}>{label}</button>

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
    onClose()
  }

  return (
    <Sheet title="Add New Listing" onClose={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        <div className="field">
          <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', display: 'block', marginBottom: '6px' }}>Listing Deal</label>
          <Segmented value={f.deal} onChange={v => set('deal', v)} options={[{ value: 'sale', label: 'For Sale' }, { value: 'rent', label: 'For Rent' }]} />
        </div>
        <div className="field">
          <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', display: 'block', marginBottom: '6px' }}>Property Type</label>
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            {['1BHK', '2BHK', '3BHK', 'Commercial', 'Plot'].map(t => chip(f.type === t, () => set('type', t), t))}
          </div>
        </div>
        <Field label="Society / Project Name">
          <Input value={f.society} onChange={e => set('society', e.target.value)} placeholder="e.g. Kolte Patil Life Republic" autoFocus />
        </Field>
        <div style={{ display: 'flex', gap: '12px' }}>
          <div style={{ flex: 1 }}><Field label="Locality"><Input value={f.locality} onChange={e => set('locality', e.target.value)} /></Field></div>
          <div style={{ flex: 1 }}><Field label={f.deal === 'rent' ? 'Rent (₹/mo)' : 'Price (₹ lakh)'}><Input value={f.price} onChange={e => set('price', e.target.value)} placeholder={f.deal === 'rent' ? '32000' : '82'} /></Field></div>
        </div>
        <Field label="Owner Name">
          <Input value={f.owner} onChange={e => set('owner', e.target.value)} placeholder="e.g. Suresh Kulkarni" />
        </Field>
        <div className="field">
          <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', display: 'block', marginBottom: '6px' }}>Status</label>
          <Segmented value={f.status} onChange={v => set('status', v)} options={['Available', 'Under offer']} />
        </div>
        <Button variant="primary" block onClick={save} style={{ marginTop: '8px', padding: '13px' }}>Add Listing</Button>
      </div>
    </Sheet>
  )
}

function MobileOutreach({ store, leadId, channel = 'call', onClose }) {
  const l = store.state.leads.find(x => x.id === leadId)
  const [ch, setCh] = useState(channel)
  const [text, setText] = useState('')
  if (!l) return null
  const first = l.name.split(' ')[0]
  const templates = {
    sms: [
      `Namaste ${first}, this is ${theme.brand.firmName}. Following up on your property search — shall we talk today?`,
      `Hi ${first}, a couple of good options just came up in ${l.req.locality}. Free for a quick call?`,
      `Thanks for your time, ${first}! I'll share matching ${l.req.config} options shortly.`
    ],
    wa: [
      `Namaste ${first} 🙏 ${theme.brand.firmName} here. Aapki ${l.req.config} requirement ke liye kuch achhe options hain — baat karein?`,
      `Hi ${first}, following up on your ${l.req.locality} search. Weekend mein site visit fix karein?`
    ]
  }

  const logIt = () => {
    store.logEvent(leadId, ch === 'call' ? 'call' : ch === 'wa' ? 'wa' : 'sms', ch === 'call' ? `Outgoing call to ${l.phone}` : text || `Sent ${ch.toUpperCase()} follow-up`)
    store.toast(`Logged ${ch.toUpperCase()} to ${first}'s timeline`)
    onClose()
  }

  const title = ch === 'call' ? `Call — ${l.name}` : ch === 'wa' ? `WhatsApp — ${l.name}` : `SMS — ${l.name}`

  return (
    <Sheet title={title} onClose={onClose}>
      <div className="u-muted" style={{ fontSize: '12.5px', marginBottom: '14px', marginTop: '-4px' }}>
        <span className="mono-num" style={{ fontWeight: 600, color: 'var(--ink)' }}>{l.phone}</span> · {l.req.config} · {l.req.locality}
      </div>
      <div>
        {ch === 'call' ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <Button variant="primary" block style={{ padding: '14px', fontSize: '14.5px' }} icon="phone" onClick={logIt}>Call {first} & Log to Timeline</Button>
            <div className="u-muted" style={{ fontSize: '12px', textAlign: 'center' }}>Connecting via your phone's dialer. Timeline is auto-updated.</div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {(templates[ch] || []).map((t, i) => (
                <button
                  key={i}
                  onClick={() => setText(t)}
                  style={{ textAlign: 'left', background: text === t ? 'var(--accent-wash)' : 'var(--card)', border: '1px solid ' + (text === t ? 'var(--accent)' : 'var(--line)'), borderRadius: '10px', padding: '10px', fontSize: '12.5px', color: 'var(--ink)', cursor: 'pointer', fontFamily: 'var(--sans)' }}
                >
                  {t}
                </button>
              ))}
            </div>
            <Textarea value={text} onChange={e => setText(e.target.value)} placeholder={`Type custom ${ch.toUpperCase()} message...`} />
            <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
              <Button variant="primary" style={{ flex: 1, justifyContent: 'center' }} icon={ch === 'wa' ? 'wa' : 'sms'} onClick={logIt}>Send & Log</Button>
              <Button icon="tag" onClick={() => store.openModal({ kind: 'pickMatch', leadId: l.id })}>Share Property</Button>
            </div>
          </div>
        )}
      </div>
    </Sheet>
  )
}

function MobileNote({ store, leadId, propId, onClose }) {
  const [t, setT] = useState('')
  const l = leadId ? store.state.leads.find(x => x.id === leadId) : null
  const p = propId ? store.state.properties.find(x => x.id === propId) : null

  const title = l ? `Add Note — ${l.name}` : p ? `Add Note — ${p.society}` : 'Log Instant Field Note'

  const save = () => {
    if (!t.trim()) { onClose(); return }
    if (l) {
      store.logEvent(leadId, 'note', t.trim())
      store.toast(`Note logged for ${l.name}`)
    } else if (p) {
      store.logEvent(propId, 'note', t.trim())
      store.toast(`Note logged for ${p.society}`)
    } else {
      store.toast('General field note logged')
    }
    onClose()
  }

  return (
    <Sheet title={title} onClose={onClose}>
      <Textarea value={t} onChange={e => setT(e.target.value)} placeholder="Key takeaways, budget update, site visit feedback..." autoFocus style={{ minHeight: '110px' }} />
      <Button variant="primary" block style={{ marginTop: '12px', padding: '13px' }} onClick={save}>Save Note</Button>
    </Sheet>
  )
}

function MobileStatus({ store, propId, onClose }) {
  const p = store.state.properties.find(x => x.id === propId)
  if (!p) return null
  return (
    <Sheet title="Change Property Status" onClose={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {['Available', 'Under offer', 'Closed / Sold'].map(s => (
          <button
            key={s}
            onClick={() => { store.setPropStatus(propId, s); onClose() }}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px', borderRadius: '12px', border: '1px solid var(--line)', background: p.status === s ? 'var(--accent-wash)' : 'var(--card)', color: p.status === s ? 'var(--accent-ink)' : 'var(--ink)', fontWeight: 600, fontSize: '14px', cursor: 'pointer', fontFamily: 'var(--sans)' }}
          >
            <span>{s}</span>
            {p.status === s && <Icon name="check" size={16} />}
          </button>
        ))}
      </div>
    </Sheet>
  )
}

function MobilePickMatch({ store, leadId, onClose }) {
  const l = store.state.leads.find(x => x.id === leadId)
  if (!l) return null
  const matches = matchesForLead(l, store.state.properties)
  return (
    <Sheet title="Share Inventory via WhatsApp" onClose={onClose}>
      <div className="u-muted" style={{ fontSize: '12.5px', marginBottom: '12px' }}>
        Matching inventory for <b style={{ color: 'var(--ink)' }}>{l.name}</b> ({l.req.config} · {l.req.locality})
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '56vh', overflowY: 'auto' }}>
        {matches.map((m, i) => {
          const fit = fitReasons(m, l.req)
          return (
            <button
              key={m.id}
              onClick={() => { onClose(); store.openWhatsApp(m.id, leadId) }}
              style={{ display: 'flex', alignItems: 'center', gap: '11px', padding: '12px', border: '1px solid var(--line)', background: 'var(--card)', borderRadius: '14px', cursor: 'pointer', fontFamily: 'var(--sans)', textAlign: 'left' }}
            >
              <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: thumbTint(m.id), display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--faint)', flexShrink: 0 }}><Icon name="building" size={20} /></div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: '14px', color: 'var(--ink)' }}>{m.society}</div>
                <div className="u-muted" style={{ fontSize: '12px' }}>{m.type} · {m.locality} · {m.priceLabel}</div>
              </div>
              <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--accent)', background: 'var(--accent-wash)', padding: '4px 8px', borderRadius: '8px' }}>{fit.score}% fit</span>
            </button>
          )
        })}
      </div>
    </Sheet>
  )
}

function MobilePickBuyer({ store, propId, onClose }) {
  const p = store.state.properties.find(x => x.id === propId)
  if (!p) return null
  const buyers = leadsForProperty(p, store.state.leads)
  return (
    <Sheet title="Share Property to Buyer" onClose={onClose}>
      <div className="u-muted" style={{ fontSize: '12.5px', marginBottom: '12px' }}>
        Interested leads for <b style={{ color: 'var(--ink)' }}>{p.society}</b>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '56vh', overflowY: 'auto' }}>
        {buyers.map(b => (
          <button
            key={b.lead.id}
            onClick={() => { onClose(); store.openWhatsApp(propId, b.lead.id) }}
            style={{ display: 'flex', alignItems: 'center', gap: '11px', padding: '12px', border: '1px solid var(--line)', background: 'var(--card)', borderRadius: '14px', cursor: 'pointer', fontFamily: 'var(--sans)', textAlign: 'left' }}
          >
            <span className="av av-md" style={{ background: 'var(--chrome)', flexShrink: 0 }}>{b.lead.name.slice(0, 2).toUpperCase()}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: '14px', color: 'var(--ink)' }}>{b.lead.name}</div>
              <div className="u-muted" style={{ fontSize: '12px' }}>{b.lead.req.config} · {b.lead.req.locality}</div>
            </div>
            <Icon name="wa" size={20} style={{ color: '#25D366', flexShrink: 0 }} />
          </button>
        ))}
      </div>
    </Sheet>
  )
}

function MobileAttachProp({ store, leadId, onClose }) {
  const l = store.state.leads.find(x => x.id === leadId)
  const [q, setQ] = useState('')
  if (!l) return null
  const already = new Set(l.shortlist || [])
  const ql = q.trim().toLowerCase()
  const cands = store.state.properties
    .filter(p => !already.has(p.id) && p.deal === l.req.deal)
    .filter(p => !ql || (p.society || p.title || '').toLowerCase().includes(ql) || (p.locality || '').toLowerCase().includes(ql) || (p.type || '').toLowerCase().includes(ql))
  return (
    <Sheet title="Attach Property to Lead" onClose={onClose}>
      <div className="m-msearch" style={{ marginBottom: '12px', height: '40px', background: 'var(--card)', borderRadius: '20px', border: '1px solid var(--line)', padding: '0 14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
        <Icon name="search" size={16} />
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search society, locality..." style={{ border: 'none', outline: 'none', background: 'transparent', flex: 1, fontFamily: 'var(--sans)', fontSize: '13.5px' }} />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '50vh', overflowY: 'auto' }}>
        {cands.map(p => (
          <button
            key={p.id}
            onClick={() => { store.attachProp(leadId, p.id, p.society); onClose() }}
            style={{ display: 'flex', alignItems: 'center', gap: '11px', padding: '12px', border: '1px solid var(--line)', background: 'var(--card)', borderRadius: '14px', cursor: 'pointer', fontFamily: 'var(--sans)', textAlign: 'left' }}
          >
            <div style={{ width: '38px', height: '38px', borderRadius: '10px', background: thumbTint(p.id), display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--faint)', flexShrink: 0 }}><Icon name="building" size={18} /></div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: '13.5px', color: 'var(--ink)' }}>{p.society}</div>
              <div className="u-muted" style={{ fontSize: '12px' }}>{p.type} · {p.locality} · {p.priceLabel}</div>
            </div>
            <Icon name="plus" size={18} style={{ color: 'var(--accent)' }} />
          </button>
        ))}
      </div>
    </Sheet>
  )
}

const REJECT_REASONS = ['Price / budget', 'Vaastu / facing', 'Floor', 'Location', 'Noise', 'Size / layout', 'Furnishing', 'Parking']
function MobileVisitFeedback({ store, leadId, propId, onClose }) {
  const l = store.state.leads.find(x => x.id === leadId)
  const p = store.state.properties.find(x => x.id === propId)
  const [verdict, setVerdict] = useState('liked')
  const [reason, setReason] = useState(REJECT_REASONS[0])
  if (!l || !p) return null
  const save = () => { store.visitFeedback(leadId, propId, verdict, verdict === 'rejected' ? reason : null, p.society); onClose() }
  return (
    <Sheet title="Site-visit outcome" onClose={onClose}>
      <div className="u-muted" style={{ fontSize: '12.5px', marginBottom: '14px', marginTop: '-4px' }}>
        <b style={{ color: 'var(--ink)' }}>{l.name}</b> visited <b style={{ color: 'var(--ink)' }}>{p.society}</b>
      </div>
      <Segmented block value={verdict} onChange={setVerdict} options={[{ value: 'liked', label: '👍 Liked' }, { value: 'rejected', label: '👎 Rejected' }]} />
      {verdict === 'rejected' && (
        <>
          <div style={{ fontSize: '11px', letterSpacing: '.05em', textTransform: 'uppercase', color: 'var(--muted)', fontWeight: 600, margin: '16px 0 8px' }}>Reason — refines future matches</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '7px' }}>
            {REJECT_REASONS.map(r => <button key={r} className={'qchip' + (reason === r ? ' on' : '')} onClick={() => setReason(r)} style={{ padding: '6px 12px' }}>{r}</button>)}
          </div>
        </>
      )}
      <Button variant="primary" block style={{ marginTop: '18px', padding: '13px' }} onClick={save}>Save outcome</Button>
    </Sheet>
  )
}

function MobileCallOwner({ store, owner, onClose }) {
  return (
    <Sheet title={`Call Owner — ${owner}`} onClose={onClose}>
      <div style={{ textAlign: 'center', padding: '16px 0' }}>
        <div style={{ width: '56px', height: '56px', borderRadius: '50%', background: 'var(--accent-wash)', color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}>
          <Icon name="phone" size={26} />
        </div>
        <div style={{ fontWeight: 600, fontSize: '16px', color: 'var(--ink)', marginBottom: '4px' }}>{owner}</div>
        <div className="u-muted" style={{ fontSize: '13px', marginBottom: '20px' }}>Direct Owner Contact · Confidential</div>
        <Button variant="primary" block style={{ padding: '14px' }} icon="phone" onClick={() => { store.toast(`Calling owner ${owner}`); onClose() }}>Start Voice Call</Button>
      </div>
    </Sheet>
  )
}

function MobileWaModal({ store, wa }) {
  const p = store.state.properties.find(x => x.id === wa.propId)
  const l = store.state.leads.find(x => x.id === wa.leadId)
  if (!p) return null

  const copy = () => { try { navigator.clipboard.writeText(wa.message || '') } catch {} store.toast('Message copied') }

  // Hands off to the real WhatsApp app with the message pre-filled. We log that
  // the details were shared — we never claim delivery, because sending happens
  // in WhatsApp, not here.
  const send = () => {
    if (l) store.logEvent(l.id, 'wa', `Shared ${p.society} (${p.priceLabel}) details on WhatsApp`)
    window.open(whatsappLink(wa.message, l?.phone), '_blank', 'noopener')
    store.closeWhatsApp()
  }

  return (
    <Sheet title="Share property details" onClose={() => store.closeWhatsApp()}>
      {l && (
        <div className="u-muted" style={{ fontSize: '12.5px', marginBottom: '12px' }}>
          To: <b style={{ color: 'var(--ink)' }}>{l.name}</b> ({l.phone})
        </div>
      )}
      <div style={{ background: 'var(--card-2)', border: '1px solid var(--line)', borderRadius: '12px', padding: '10px 12px', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '10px' }}>
        <div style={{ width: '36px', height: '36px', borderRadius: '8px', background: thumbTint(p.id), display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: 'var(--faint)' }}><Icon name="building" size={18} /></div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: '13.5px', color: 'var(--ink)' }}>{p.society}</div>
          <div className="u-muted" style={{ fontSize: '11.5px' }}>{p.type} · {p.locality}</div>
        </div>
        <span className="mono-num" style={{ fontWeight: 700, fontSize: '14px', color: 'var(--accent)' }}>{p.priceLabel}</span>
      </div>

      <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: '10px', letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: '4px', fontWeight: 700 }}>Language</div>
          <Segmented value={wa.lang} onChange={v => store.recompose({ lang: v })} options={['Hinglish', 'English', 'Marathi']} />
        </div>
        <div style={{ flex: 0.8 }}>
          <div style={{ fontSize: '10px', letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: '4px', fontWeight: 700 }}>Tone</div>
          <Segmented value={wa.tone} onChange={v => store.recompose({ tone: v })} options={['Standard', 'Short']} />
        </div>
      </div>

      <WaCanvas
        message={wa.message}
        deva={wa.lang === 'Marathi'}
        style={{ borderRadius: '14px', minHeight: '180px', marginBottom: '10px', background: '#0B3D2E', color: '#fff' }}
      />

      <div className="wa-source-lite">
        <Icon name="check" size={12} />
        Filled from this property's details. Unit number is never included.
      </div>

      {wa.message && (
        <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
          <Button variant="secondary" style={{ flex: 1, justifyContent: 'center', fontSize: '12.5px' }} onClick={copy} icon="copy">Copy</Button>
          <Button variant="secondary" style={{ flex: 1, justifyContent: 'center', fontSize: '12.5px' }} onClick={() => store.recompose({ variant: wa.variant + 1 })} icon="refresh">Other wording</Button>
        </div>
      )}

      <div style={{ display: 'flex', gap: '10px' }}>
        <Button variant="secondary" style={{ flex: 1, justifyContent: 'center' }} onClick={() => store.closeWhatsApp()}>Cancel</Button>
        <Button variant="primary" style={{ flex: 2, justifyContent: 'center', background: '#25D366', borderColor: '#25D366', color: '#fff' }} icon="wa" onClick={send}>Open in WhatsApp</Button>
      </div>
    </Sheet>
  )
}
