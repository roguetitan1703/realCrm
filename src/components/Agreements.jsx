// ============================================================================
// WHERE A PIPELINE ENDS — the two conversion forms and the agreement card
// ============================================================================
// "Convert to property" (a calling row at its final status) and "Close the
// deal" (a lead at its final stage) are one flow: a form filled in from the
// record, one confirm, and the record then shows what it became instead of
// the button. The server refuses a second one (409) — see
// backend/src/services/agreements.ts — and the form says so rather than
// failing quietly.
//
// An agreement is one record of two kinds, rent and sale. The card is the same
// wherever it appears — on the lead, on the flat, in Contacts — so a rent reads
// the same in all three places.
import { useEffect, useState } from 'react'
import { api, fileUrl } from '../lib/api.js'
import { useServerData } from '../lib/useServerData.js'
import { uploadMedia } from '../lib/media.js'
import { dayLabel, unitLabel } from '../lib/format.js'
import { finalStageOf } from '../data/pipelineRoles.js'
import { Button, Field, Input, Segmented } from './primitives.jsx'
import Icon from './Icon.jsx'

const rupees = (n) => (n == null ? '' : `₹${Math.round(Number(n)).toLocaleString('en-IN')}`)
const today = () => new Date().toISOString().slice(0, 10)
/** The reason the server gave, without the transport around it. */
const reason = (e) => String(e?.message || e).replace(/^API Error: \d+ [^—]*— ?/, '') || 'Could not save.'
const flatName = (p) => [p.project || p.society, unitLabel(p)].filter(Boolean).join(' ') || p.title || 'Flat'

// ── The card ────────────────────────────────────────────────────────────────
export function AgreementCard({ a, store, onChanged, show = {} }) {
  const [busy, setBusy] = useState(false)
  const live = a.status === 'active'
  const soon = live && a.kind === 'rent' && a.daysLeft != null && a.daysLeft <= 30
  const attach = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setBusy(true)
    try {
      const key = await uploadMedia(file, 'agreement')
      await api.updateAgreement(a.id, { fileKey: key, fileName: file.name })
      store.toast('Agreement attached')
      onChanged?.(); store.touched()
    } catch (err) { store.toast(reason(err), 'warn') } finally { setBusy(false) }
  }
  const end = async () => {
    const what = a.kind === 'rent' ? 'this tenancy' : 'this sale record'
    if (!window.confirm(`End ${what}? ${a.kind === 'rent' && a.propertyId ? 'The flat goes back to Available.' : ''}`)) return
    try { await api.endAgreement(a.id); store.toast('Agreement ended'); onChanged?.(); store.touched() } catch (err) { store.toast(reason(err), 'warn') }
  }
  return (
    <div className={'agr' + (live ? '' : ' agr-past')}>
      <div className="agr-top">
        <span className={'agr-kind ' + a.kind}>{a.kind === 'rent' ? 'Rent' : 'Sale'}</span>
        <span className="agr-flat">{show.flat === false ? '' : a.flat}</span>
        {!live && <span className="agr-status">{a.status === 'renewed' ? 'Renewed' : 'Ended'}</span>}
        {soon && <span className="agr-soon">{a.daysLeft === 0 ? 'Ends today' : `Ends in ${a.daysLeft} days`}</span>}
      </div>
      <div className="agr-facts">
        {show.party !== false && a.party?.name && <span><b>{a.party.name}</b>{a.party.phone ? ` · ${a.party.phone}` : ''}</span>}
        {a.amount != null && <span><b>{rupees(a.amount)}</b>{a.kind === 'rent' ? '/month' : ''}</span>}
        {a.deposit != null && <span>Deposit <b>{rupees(a.deposit)}</b></span>}
        <span>{a.kind === 'rent'
          ? <>{dayLabel(a.startDate)} → {a.endDate ? dayLabel(a.endDate) : 'no end date'}</>
          : <>on {dayLabel(a.startDate)}</>}</span>
        {show.owner !== false && a.owner?.name && <span>Owner <b>{a.owner.name}</b></span>}
      </div>
      <div className="agr-acts">
        {a.fileKey
          ? <a className="btn btn-ghost btn-sm" href={fileUrl(a.fileKey)} target="_blank" rel="noreferrer"><Icon name="note" size={13} />{a.fileName || 'Agreement'}</a>
          : live && (
            <label className="btn btn-ghost btn-sm" style={{ cursor: 'pointer' }}>
              <Icon name="upload" size={13} />{busy ? 'Uploading…' : 'Attach agreement'}
              <input type="file" accept="application/pdf,image/*" onChange={attach} style={{ display: 'none' }} disabled={busy} />
            </label>
          )}
        {live && a.kind === 'rent' && (
          <Button size="sm" onClick={() => store.openModal({ kind: 'agreement', mode: 'renew', agreementId: a.id, onDone: onChanged })}>Renew</Button>
        )}
        {live && <Button size="sm" onClick={() => store.openModal({ kind: 'agreement', mode: 'edit', agreementId: a.id, onDone: onChanged })}>Edit</Button>}
        {live && <button type="button" className="agr-end" onClick={end}>End</button>}
      </div>
    </div>
  )
}

/** The agreements behind one record — a lead, a flat, an owner. */
export function useAgreementsFor(query, store) {
  const [nonce, setNonce] = useState(0)
  const key = JSON.stringify(query)
  const { data } = useServerData(() => api.listAgreements({ ...query, limit: 50 }), [key, nonce, store.state.dataAsOf], null)
  return { rows: data?.rows || null, refresh: () => setNonce(n => n + 1) }
}

export function AgreementList({ query, store, empty, show }) {
  const { rows, refresh } = useAgreementsFor(query, store)
  if (!rows) return <div className="ad-line ad-wait" aria-busy="true" />
  if (!rows.length) return empty ? <div className="detail-empty">{empty}</div> : null
  return <div className="agr-list">{rows.map(a => <AgreementCard key={a.id} a={a} store={store} onChanged={refresh} show={show} />)}</div>
}

// ── The finish slot on a record's header (ModuleDetail → progression.finish) ─
/**
 * CLOSE THE DEAL, on a lead. The button when the lead is at the final stage and
 * nothing is recorded; what it became once something is.
 */
export function FinishLead({ lead, store, go, canAct }) {
  const final = finalStageOf(store.state.settings, 'leads')
  const { rows } = useAgreementsFor({ leadId: lead.id, status: 'active' }, store)
  if (rows && rows.length) {
    const a = rows[0]
    return (
      <span className="rh-finish-done">
        <Icon name="check" size={14} />{a.kind === 'rent' ? 'Rented' : 'Bought'} {a.flat}
        {a.propertyId && go && <button type="button" onClick={() => go('properties', { propId: a.propertyId, propOpen: true })}>Open flat</button>}
      </span>
    )
  }
  if (!rows || !canAct || lead.stage !== final) return null
  return (
    <button type="button" className="rh-finish" onClick={() => store.openModal({ kind: 'closeDeal', leadId: lead.id })}>
      <Icon name="check" size={14} />Close the deal
    </button>
  )
}

/** CONVERT TO PROPERTY, on a calling row. */
export function FinishOwner({ owner, store, go, canAct }) {
  const final = finalStageOf(store.state.settings, 'calling')
  if (owner.convertedPropertyId) {
    return (
      <span className="rh-finish-done">
        <Icon name="check" size={14} />In Properties
        {go && <button type="button" onClick={() => go('properties', { propId: owner.convertedPropertyId, propOpen: true })}>Open flat</button>}
      </span>
    )
  }
  if (!canAct || (owner.stage || 'New') !== final) return null
  return (
    <button type="button" className="rh-finish" onClick={() => store.openModal({ kind: 'convertOwner', ownerId: owner.id })}>
      <Icon name="building" size={14} />Convert to property
    </button>
  )
}

// ── The forms ───────────────────────────────────────────────────────────────
function Row({ children }) { return <div style={{ display: 'flex', gap: 10 }}>{children}</div> }
function Half({ children }) { return <div style={{ flex: 1, minWidth: 0 }}>{children}</div> }

/** CLOSE THE DEAL — which flat, rent or sale, how much, from when. */
export function CloseDealModal({ store, leadId, Modal }) {
  const l = store.lookup('lead', leadId)
  const [kind, setKind] = useState(l?.deal === 'sale' ? 'sale' : 'rent')
  const [flat, setFlat] = useState(null)          // a property object, or null
  const [outside, setOutside] = useState(false)
  const [label, setLabel] = useState('')
  const [q, setQ] = useState('')
  const [found, setFound] = useState([])
  const [f, setF] = useState({ amount: '', deposit: '', startDate: today(), endDate: '' })
  const [busy, setBusy] = useState(false)
  const set = (k, v) => setF(x => ({ ...x, [k]: v }))
  const shortlist = l?.shortlistProps || []

  useEffect(() => {
    if (outside || q.trim().length < 2) { setFound([]); return }
    let live = true
    const t = setTimeout(() => {
      api.listProperties({ q: q.trim(), limit: 8 })
        .then(r => { if (live) setFound(r?.data || r?.rows || []) }).catch(() => {})
    }, 250)
    return () => { live = false; clearTimeout(t) }
  }, [q, outside])

  const pick = (p) => {
    setFlat(p); setQ('')
    // The flat's own asking price is the likeliest number; the form still shows it.
    if (!f.amount && p.price) set('amount', String(p.price).replace(/[^0-9]/g, ''))
  }
  const save = async () => {
    setBusy(true)
    try {
      await api.createAgreement({
        leadId, kind, propertyId: outside ? null : flat?.id, propertyLabel: outside ? label : null,
        amount: f.amount, deposit: f.deposit, startDate: f.startDate, endDate: kind === 'rent' ? f.endDate : null,
      })
      store.toast(kind === 'rent' ? 'Deal closed — tenancy recorded' : 'Deal closed — sale recorded')
      store.touched()
      store.closeModal()
    } catch (e) { store.toast(reason(e), 'warn') } finally { setBusy(false) }
  }

  return (
    <Modal title="Close the deal" onClose={store.closeModal} width={480}>
      <Field label="What happened">
        <Segmented block options={[{ value: 'rent', label: 'Rented' }, { value: 'sale', label: 'Bought' }]} value={kind} onChange={setKind} />
      </Field>
      <Field label="Which flat" required>
        {flat ? (
          <div className="cd-picked"><span><b>{flatName(flat)}</b> · {flat.locality}</span><button type="button" onClick={() => setFlat(null)}>Change</button></div>
        ) : outside ? (
          <Input value={label} onChange={e => setLabel(e.target.value)} placeholder="Flat, building, area" autoFocus />
        ) : (
          <>
            {shortlist.length > 0 && (
              <div className="cd-opts">
                {shortlist.map(p => <button type="button" key={p.id} onClick={() => pick(p)}><b>{flatName(p)}</b><span>{p.locality}</span></button>)}
              </div>
            )}
            <Input value={q} onChange={e => setQ(e.target.value)} placeholder="Search our flats — project, unit, locality" />
            {found.length > 0 && (
              <div className="cd-opts">
                {found.map(p => <button type="button" key={p.id} onClick={() => pick(p)}><b>{flatName(p)}</b><span>{p.locality}</span></button>)}
              </div>
            )}
          </>
        )}
        {!flat && (
          <button type="button" className="cd-switch" onClick={() => { setOutside(o => !o); setLabel('') }}>
            {outside ? 'Pick one of our flats' : 'Not one of our flats'}
          </button>
        )}
      </Field>
      <Row>
        <Half><Field label={kind === 'rent' ? 'Rent per month (₹)' : 'Sale price (₹)'} required>
          <Input inputMode="numeric" value={f.amount} onChange={e => set('amount', e.target.value)} placeholder={kind === 'rent' ? '30000' : '8500000'} />
        </Field></Half>
        {kind === 'rent' && <Half><Field label="Deposit (₹)">
          <Input inputMode="numeric" value={f.deposit} onChange={e => set('deposit', e.target.value)} placeholder="100000" />
        </Field></Half>}
      </Row>
      <Row>
        <Half><Field label={kind === 'rent' ? 'Starts' : 'Date of sale'} required>
          <input className="input" type="date" value={f.startDate} onChange={e => set('startDate', e.target.value)} />
        </Field></Half>
        {kind === 'rent' && <Half><Field label="Ends" hint="11 months if left empty">
          <input className="input" type="date" value={f.endDate} onChange={e => set('endDate', e.target.value)} />
        </Field></Half>}
      </Row>
      <div className="lc-foot">
        <Button onClick={store.closeModal}>Cancel</Button>
        <Button variant="primary" style={{ flex: 1, justifyContent: 'center' }} disabled={busy} onClick={save}>
          {busy ? 'Saving…' : 'Close the deal'}
        </Button>
      </div>
    </Modal>
  )
}

/** CONVERT TO PROPERTY — the flat, filled in from the calling row. */
export function ConvertOwnerModal({ store, ownerId, Modal }) {
  const o = store.lookup('owner', ownerId)
  const [f, setF] = useState({
    deal: '', type: o?.config || '', locality: o?.locality || '', price: '', furnishing: '', availableFrom: '',
    project: o?.project || '', tower: o?.tower || '', unitNo: o?.unitNo || '',
  })
  const [busy, setBusy] = useState(false)
  const set = (k, v) => setF(x => ({ ...x, [k]: v }))
  const save = async () => {
    setBusy(true)
    try {
      const r = await api.convertOwner(ownerId, f)
      store.toast(r?.attached ? 'Linked to the flat already in Properties' : 'Added to Properties')
      store.touched()
      // Stays on the calling record, which now says "In Properties · Open
      // flat" — the caller decides whether to go there.
      store.closeModal()
    } catch (e) { store.toast(reason(e), 'warn') } finally { setBusy(false) }
  }
  return (
    <Modal title="Convert to property" onClose={store.closeModal} width={480}>
      <div className="cd-owner"><b>{o?.name || 'Owner'}</b>{o?.phone ? ` · ${o.phone}` : ''}</div>
      <Field label="The owner wants to" required>
        <Segmented block options={[{ value: 'rent', label: 'Rent it out' }, { value: 'sale', label: 'Sell it' }]} value={f.deal} onChange={v => set('deal', v)} />
      </Field>
      <Row>
        <Half><Field label="Project"><Input value={f.project} onChange={e => set('project', e.target.value)} /></Field></Half>
        <Half><Field label="Tower / wing"><Input value={f.tower} onChange={e => set('tower', e.target.value)} /></Field></Half>
        <Half><Field label="Unit"><Input value={f.unitNo} onChange={e => set('unitNo', e.target.value)} /></Field></Half>
      </Row>
      <Row>
        <Half><Field label="Configuration" required><Input value={f.type} onChange={e => set('type', e.target.value)} placeholder="2 BHK" /></Field></Half>
        <Half><Field label="Locality" required><Input value={f.locality} onChange={e => set('locality', e.target.value)} placeholder="Baner" /></Field></Half>
      </Row>
      <Row>
        <Half><Field label={f.deal === 'sale' ? 'Asking price (₹)' : 'Expected rent (₹/month)'}>
          <Input inputMode="numeric" value={f.price} onChange={e => set('price', e.target.value)} />
        </Field></Half>
        <Half><Field label="Available from"><input className="input" type="date" value={f.availableFrom} onChange={e => set('availableFrom', e.target.value)} /></Field></Half>
      </Row>
      <div className="lc-foot">
        <Button onClick={store.closeModal}>Cancel</Button>
        <Button variant="primary" style={{ flex: 1, justifyContent: 'center' }} disabled={busy || !f.deal} onClick={save}>
          {busy ? 'Saving…' : 'Add to Properties'}
        </Button>
      </div>
    </Modal>
  )
}

/** EDIT an agreement, RENEW a rent, or RECORD one for a flat directly. */
export function AgreementModal({ store, mode, agreementId, propertyId, onDone, Modal }) {
  const [a, setA] = useState(null)
  const [f, setF] = useState(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (mode === 'new') { setF({ kind: 'rent', partyName: '', partyPhone: '', amount: '', deposit: '', startDate: today(), endDate: '' }); return }
    api.getAgreement(agreementId).then(r => {
      const x = r?.agreement
      setA(x)
      setF(mode === 'renew'
        ? { amount: String(x.amount ?? ''), deposit: String(x.deposit ?? ''), startDate: x.endDate || today(), endDate: '' }
        : { amount: String(x.amount ?? ''), deposit: String(x.deposit ?? ''), startDate: x.startDate || '', endDate: x.endDate || '', notes: x.notes || '' })
    }).catch(e => store.toast(reason(e), 'warn'))
  }, [mode, agreementId])
  const set = (k, v) => setF(x => ({ ...x, [k]: v }))
  const save = async () => {
    setBusy(true)
    try {
      if (mode === 'renew') await api.renewAgreement(agreementId, f)
      else if (mode === 'edit') await api.updateAgreement(agreementId, f)
      else await api.createAgreement({ ...f, propertyId })
      store.toast(mode === 'renew' ? 'Renewed — the new term is recorded' : 'Saved')
      onDone?.(); store.touched()
      store.closeModal()
    } catch (e) { store.toast(reason(e), 'warn') } finally { setBusy(false) }
  }
  const kind = a?.kind || f?.kind || 'rent'
  const title = mode === 'renew' ? 'Renew' : mode === 'edit' ? 'Edit agreement' : 'Record an agreement'
  return (
    <Modal title={title} onClose={store.closeModal} width={460}>
      {!f ? <div className="ad-line ad-wait" aria-busy="true" /> : (
        <>
          {a && <div className="cd-owner"><b>{a.flat}</b>{a.party?.name ? ` · ${a.party.name}` : ''}</div>}
          {mode === 'new' && (
            <>
              <Field label="Kind"><Segmented block options={[{ value: 'rent', label: 'Rent' }, { value: 'sale', label: 'Sale' }]} value={f.kind} onChange={v => set('kind', v)} /></Field>
              <Row>
                <Half><Field label={f.kind === 'rent' ? 'Tenant' : 'Buyer'} required><Input value={f.partyName} onChange={e => set('partyName', e.target.value)} /></Field></Half>
                <Half><Field label="Phone"><Input value={f.partyPhone} onChange={e => set('partyPhone', e.target.value)} /></Field></Half>
              </Row>
            </>
          )}
          <Row>
            <Half><Field label={kind === 'rent' ? 'Rent per month (₹)' : 'Sale price (₹)'} required>
              <Input inputMode="numeric" value={f.amount} onChange={e => set('amount', e.target.value)} />
            </Field></Half>
            {kind === 'rent' && <Half><Field label="Deposit (₹)"><Input inputMode="numeric" value={f.deposit} onChange={e => set('deposit', e.target.value)} /></Field></Half>}
          </Row>
          <Row>
            <Half><Field label={kind === 'rent' ? 'Starts' : 'Date of sale'} required>
              <input className="input" type="date" value={f.startDate} onChange={e => set('startDate', e.target.value)} />
            </Field></Half>
            {kind === 'rent' && <Half><Field label="Ends" hint={mode === 'edit' ? undefined : '11 months if left empty'}>
              <input className="input" type="date" value={f.endDate} onChange={e => set('endDate', e.target.value)} />
            </Field></Half>}
          </Row>
          <div className="lc-foot">
            <Button onClick={store.closeModal}>Cancel</Button>
            <Button variant="primary" style={{ flex: 1, justifyContent: 'center' }} disabled={busy} onClick={save}>
              {busy ? 'Saving…' : mode === 'renew' ? 'Renew' : 'Save'}
            </Button>
          </div>
        </>
      )}
    </Modal>
  )
}
