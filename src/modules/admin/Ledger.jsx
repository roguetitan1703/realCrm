import { useEffect, useState } from 'react'
import { api } from '../../lib/api.js'
import Icon from '../../components/Icon.jsx'

// ============================================================================
// A LEDGER, READ BY DELPAT — a firm's, or Delpat's own (firmId null)
// ============================================================================
// Who did what and when, newest first, narrowed by what happened, by whom, or
// by day, a page at a time. Above it, whether the chain still holds: every
// entry checked against the one before it (services/audit.ts). A firm's own
// Settings keeps this view hidden on purpose (docs/PARKED.md); this is where
// it is read.

export const fmtWhen = (at) => (at ? new Date(at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : '')

function CheckLine({ check }) {
  if (!check) return null
  const own = check.own || check
  const legacy = check.legacy
  if (check.ok) {
    const n = (own?.checked || 0) + (legacy?.checked || 0)
    return <div className="adm-check ok"><Icon name="check" size={15} />All {n.toLocaleString('en-IN')} entries check out.</div>
  }
  const at = own?.brokenAtSeq || legacy?.brokenAtSeq
  return (
    <div className="adm-check bad">
      <Icon name="alert" size={15} />
      Entry #{at} does not match the one before it: it was changed, or an entry before it was removed.
      {!own?.brokenAtSeq && legacy?.brokenAtSeq ? ' (In the entries from before each firm had its own chain.)' : ''}
    </div>
  )
}

export default function Ledger({ firmId }) {
  const [filters, setFilters] = useState({ action: '', actor: '', from: '', to: '' })
  const [page, setPage] = useState({ rows: [], more: false, actions: [], check: null, loading: true, error: '' })

  const load = (before) => {
    setPage(p => ({ ...p, loading: true, error: '' }))
    api.adminLedger(firmId, { ...filters, before })
      .then(r => setPage(p => ({
        rows: before ? [...p.rows, ...(r.rows || [])] : (r.rows || []),
        more: !!r.more, actions: r.actions || p.actions, check: r.check || p.check, loading: false, error: '',
      })))
      .catch(e => setPage(p => ({ ...p, loading: false, error: e.message || 'Could not read the ledger' })))
  }
  useEffect(() => { load(null) /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [firmId, filters.action, filters.from, filters.to])

  const set = (k, v) => setFilters(f => ({ ...f, [k]: v }))
  const last = page.rows[page.rows.length - 1]

  return (
    <div className="adm-ledger">
      <CheckLine check={page.check} />
      <div className="adm-filters">
        <select value={filters.action} onChange={e => set('action', e.target.value)}>
          <option value="">Everything</option>
          {page.actions.map(a => <option key={a.action} value={a.action}>{a.action} ({a.n})</option>)}
        </select>
        <input placeholder="Person" value={filters.actor} onChange={e => set('actor', e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') load(null) }} onBlur={() => load(null)} />
        <label>From <input type="date" value={filters.from} onChange={e => set('from', e.target.value)} /></label>
        <label>To <input type="date" value={filters.to} onChange={e => set('to', e.target.value)} /></label>
      </div>
      {page.error && <div className="adm-err">{page.error}</div>}
      <div className="adm-rows">
        {page.rows.map(r => (
          <div key={r.seq} className="adm-row">
            <span className="adm-when">{fmtWhen(r.created_at)}</span>
            <span className="adm-who">{r.actor_label || (r.actor_type === 'system' ? 'System' : r.actor_id) || 'Unknown'}</span>
            <span className="adm-what">{r.summary || r.action}<em>{r.action}{r.ip ? ` · ${r.ip}` : ''}</em></span>
            <span className="adm-seq">#{r.seq}</span>
          </div>
        ))}
        {!page.loading && !page.rows.length && <div className="adm-empty">Nothing recorded.</div>}
      </div>
      {page.loading && <div className="adm-wait" aria-busy="true" />}
      {page.more && !page.loading && (
        <button type="button" className="btn btn-secondary btn-sm adm-more" onClick={() => load(last?.seq)}>Show older</button>
      )}
    </div>
  )
}
