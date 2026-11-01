import { useEffect, useState } from 'react'
import { api } from '../../lib/api.js'
import { Button } from '../../components/primitives.jsx'
import { CYCLE_LABEL, STATUS_LABEL, billingDate, rupees } from '../../lib/billing.js'

// ============================================================================
// WHAT THIS FIRM PAYS DELPAT (docs/specs/billing.md)
// ============================================================================
// Who reads it: Delpat, setting up a firm's plan and recording its payments.
// Set up / Edit writes the whole subscription; Mark paid records a payment and
// rolls the due date on by one cycle. Both go to the firm's ledger. The server
// is the only judge of status; this page prints what it says.

const todayIso = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const blank = { plan_name: '', amount: '', cycle: 'monthly', due_on: '', paid_through: '', notify_days_before: 0 }

export default function Billing({ firmId }) {
  const [d, setD] = useState(null)
  const [err, setErr] = useState('')
  const [form, setForm] = useState(null)   // the subscription being set up or edited
  const [pay, setPay] = useState(null)     // the payment being recorded
  const [busy, setBusy] = useState(false)

  const load = () => api.adminBilling(firmId).then(r => { setD(r); setErr('') }).catch(e => setErr(e.message || 'Could not read billing'))
  useEffect(() => { setD(null); load() /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [firmId])

  const sub = d?.subscription
  const save = async (e) => {
    e.preventDefault()
    setBusy(true); setErr('')
    try {
      await api.adminSaveBilling(firmId, { ...form, amount: Number(form.amount), notify_days_before: Number(form.notify_days_before || 0), paid_through: form.paid_through || null })
      await load(); setForm(null)
    } catch (e2) { setErr(e2.message || 'Could not save') } finally { setBusy(false) }
  }
  const markPaid = async (e) => {
    e.preventDefault()
    setBusy(true); setErr('')
    try {
      await api.adminRecordPayment(firmId, { due_on: sub.due_on, paid_on: pay.paid_on, amount: Number(pay.amount), note: pay.note })
      await load(); setPay(null)
    } catch (e2) { setErr(e2.message || 'Could not record the payment') } finally { setBusy(false) }
  }
  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }))
  const setP = (k) => (e) => setPay(p => ({ ...p, [k]: e.target.value }))

  if (!d && !err) return <div className="adm-wait tall" aria-busy="true" />

  return (
    <>
      {err && <div className="adm-err">{err}</div>}
      <section className="adm-panel">
        <div className="adm-panel-t">
          <span>Subscription</span>
          <span className="adm-acts">
            {sub && !form && !pay && <button type="button" onClick={() => setPay({ paid_on: todayIso(), amount: String(sub.amount), note: '' })}>Mark paid</button>}
            {!form && !pay && <button type="button" onClick={() => setForm(sub ? { ...blank, ...sub, paid_through: sub.paid_through || '' } : blank)}>{sub ? 'Edit' : 'Set up billing'}</button>}
          </span>
        </div>
        {!sub && !form && <div className="adm-empty">Not set up.</div>}
        {sub && !form && (
          <div className="adm-facts bill-facts">
            <div><b>{sub.plan_name}</b><span>plan</span></div>
            <div><b>{rupees(sub.amount)}</b><span>{CYCLE_LABEL[sub.cycle].toLowerCase()}</span></div>
            <div><b className={sub.status === 'overdue' ? 'adm-warn' : ''}>{billingDate(sub.due_on, { year: true })}</b><span>next due · {STATUS_LABEL[sub.status].toLowerCase()}</span></div>
            <div><b>{sub.paid_through ? billingDate(sub.paid_through, { year: true }) : '—'}</b><span>paid through</span></div>
            <div><b>{sub.notify_days_before || 0}</b><span>days notice</span></div>
          </div>
        )}
        {form && (
          <form className="bill-form" onSubmit={save}>
            <label>Plan<input required value={form.plan_name} onChange={set('plan_name')} /></label>
            <label>Amount (₹)<input required type="number" min="0" step="0.01" value={form.amount} onChange={set('amount')} /></label>
            <label>Billing cycle
              <select value={form.cycle} onChange={set('cycle')}>
                {Object.entries(CYCLE_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select>
            </label>
            <label>Due on<input required type="date" value={form.due_on} onChange={set('due_on')} /></label>
            <label>Paid through<input type="date" value={form.paid_through} onChange={set('paid_through')} /></label>
            <label>Days before due<input type="number" min="0" max="60" step="1" value={form.notify_days_before} onChange={set('notify_days_before')} /></label>
            <div className="bill-form-acts">
              <Button type="button" onClick={() => setForm(null)} disabled={busy}>Cancel</Button>
              <Button variant="primary" type="submit" disabled={busy}>Save</Button>
            </div>
          </form>
        )}
        {pay && (
          <form className="bill-form" onSubmit={markPaid}>
            <label>Paid on<input required type="date" value={pay.paid_on} onChange={setP('paid_on')} /></label>
            <label>Amount (₹)<input required type="number" min="0" step="0.01" value={pay.amount} onChange={setP('amount')} /></label>
            <label className="wide">Note<input value={pay.note} onChange={setP('note')} maxLength={500} /></label>
            <div className="bill-form-acts">
              <span className="adm-dim">For {billingDate(sub.due_on, { year: true })}</span>
              <Button type="button" onClick={() => setPay(null)} disabled={busy}>Cancel</Button>
              <Button variant="primary" type="submit" disabled={busy}>Mark paid</Button>
            </div>
          </form>
        )}
      </section>
      {sub && (
        <section className="adm-panel">
          <div className="adm-panel-t"><span>Payments</span></div>
          {!d.payments.length ? <div className="adm-empty">None recorded.</div> : (
            <table className="adm-tbl">
              <thead><tr><th>Paid on</th><th className="num">Amount</th><th>For</th><th>Note</th></tr></thead>
              <tbody>{d.payments.map(p => (
                <tr key={p.id}>
                  <td>{billingDate(p.paid_on, { year: true })}</td>
                  <td className="num">{rupees(p.amount)}</td>
                  <td>{billingDate(p.period_from)} – {billingDate(p.period_to, { year: true })}</td>
                  <td>{p.note || ''}</td>
                </tr>
              ))}</tbody>
            </table>
          )}
        </section>
      )}
    </>
  )
}
