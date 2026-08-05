import { useCallback, useEffect, useRef, useState } from 'react'
import Icon from '../components/Icon.jsx'
import { Button } from '../components/primitives.jsx'
import { api } from '../lib/api.js'
import JsonView from '../components/JsonView.jsx'

// ============================================================================
// 🔌 CONNECTIONS — where leads come from (spec: docs/specs/ingestion.md, D1)
// ============================================================================
// One URL for every provider, one key per provider. That asymmetry is the whole
// shape of this screen: the endpoint is shown once at the top, and each card
// carries only the thing that differs.
//
// Copy rule for this whole file: labels, values and states only. No sentence
// explains why something works the way it does — that belongs here in the
// source, not on the client's screen.
// ============================================================================

const SUGGESTED = ['99acres', 'MagicBricks', 'Housing.com', 'Meta Lead Ads', 'Website form']

const mark = (name) => String(name || '?')
  .replace(/[^a-zA-Z0-9 ]/g, ' ').trim().split(/\s+/)
  .map(w => w[0]).join('').slice(0, 2).toUpperCase()

function relativeTime(iso) {
  if (!iso) return 'never'
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  if (mins < 1440) return `${Math.round(mins / 60)}h ago`
  return `${Math.round(mins / 1440)}d ago`
}

// Four states, each named. "Unmapped" is not a fault, and a firm that can't
// tell it from a fault will report a working feed as broken.
function stateOf(c) {
  if (!c.active) return { key: 'paused', label: 'Paused' }
  if (!c.last_received_at) return { key: 'waiting', label: 'Awaiting first push' }
  if (!c.configured) return { key: 'unmapped', label: 'Unmapped' }
  return { key: 'live', label: 'Live' }
}

function useCopy(store) {
  const [copied, setCopied] = useState('')
  const copy = (text, tag) => {
    navigator.clipboard?.writeText(text)
      .then(() => { setCopied(tag); setTimeout(() => setCopied(''), 1600) })
      .catch(() => store.toast('Could not copy — select it and copy manually', 'warn'))
  }
  return [copied, copy]
}

function Skel({ w, h = 11 }) {
  return <span className="skel skel-line" style={{ width: w, height: h }} />
}

// ---------------------------------------------------------------------------
// The endpoint, once
// ---------------------------------------------------------------------------

function Endpoint({ endpoint, docsUrl: serverDocsUrl, headerName, store }) {
  const [copied, copy] = useCopy(store)
  const [help, setHelp] = useState(false)
  if (!endpoint) return <div className="cx-url"><Skel w="60%" h={13} /></div>

  const docsUrl = serverDocsUrl || (endpoint.replace(/\/api\/v1\/ingest\/.*/, '') + '/docs/' + (endpoint.split('/').pop() || 'tenant'))

  return (
    <div className="cx-url" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div className="cx-url-row">
        <span className="cx-url-tag">POST</span>
        <code className="cx-url-v">{endpoint}</code>
        <button className="btn btn-ghost btn-sm" onClick={() => copy(endpoint, 'url')}>
          <Icon name={copied === 'url' ? 'check' : 'copy'} size={14} />{copied === 'url' ? 'Copied' : 'Copy API URL'}
        </button>
      </div>
      <div className="cx-url-row">
        <span className="cx-url-tag">DOCS</span>
        <code className="cx-url-v">{docsUrl}</code>
        <button className="btn btn-ghost btn-sm" onClick={() => copy(docsUrl, 'docs')}>
          <Icon name={copied === 'docs' ? 'check' : 'copy'} size={14} />{copied === 'docs' ? 'Copied' : 'Copy Docs Link'}
        </button>
      </div>
      {help && (
        <dl className="cx-url-help">
          <dt>Method</dt><dd>POST · application/json</dd>
          <dt>Auth</dt><dd><code>{headerName}: &lt;the source's key&gt;</code></dd>
          <dt>Body</dt><dd>Any JSON. Fields are mapped per source.</dd>
          <dt>Success</dt><dd>200</dd>
        </dl>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// The key, on the card
// ---------------------------------------------------------------------------

// Rotating lives in one place: the card's ⋯ menu. A second "New key" link
// here, next to the just-minted key, was the same action offered twice in the
// same view.
function KeyRow({ connection, store, fresh }) {
  const [key, setKey] = useState(fresh || null)
  const [shown, setShown] = useState(!!fresh)
  const [busy, setBusy] = useState(false)
  const [copied, copy] = useCopy(store)

  useEffect(() => { if (fresh) { setKey(fresh); setShown(true) } }, [fresh])

  const need = (then) => {
    if (key) { then(key); return }
    setBusy(true)
    api.revealConnectionKey(connection.id)
      .then(r => {
        if (r?.success) { setKey(r.apiKey); then(r.apiKey) }
        else store.toast(r?.message || 'Could not read the key', 'warn')
      })
      .catch(e => store.toast(e.message || 'Could not read the key', 'warn'))
      .finally(() => setBusy(false))
  }

  return (
    <div className={'cx-keyrow' + (shown ? ' open' : '')}>
      <span className="cx-keyrow-l">Key</span>
      <code className="cx-keyrow-v">
        {busy ? <Skel w={260} h={12} />
          : shown && key ? key
            : `sk_live_${'•'.repeat(24)}${connection.api_key_last4 || ''}`}
      </code>
      <button className="cx-icb" title={shown ? 'Hide' : 'Show'}
        onClick={() => (shown ? setShown(false) : need(() => setShown(true)))}>
        <Icon name={shown ? 'eyeOff' : 'eye'} size={15} />
      </button>
      <button className="cx-icb" title="Copy" onClick={() => need(k => copy(k, 'key'))}>
        <Icon name={copied === 'key' ? 'check' : 'copy'} size={15} />
      </button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Activity
// ---------------------------------------------------------------------------

const STATUS_TEXT = {
  parsed: 'Lead created',
  pending: 'Waiting for mapping',
  ignored: 'Duplicate',
}

// One received push, opened. This is the whole reason the inbox exists: when a
// provider changes their schema, the only way to find out is to read what they
// actually sent — not what we hoped they sent.
function Push({ push, store }) {
  const [copied, copy] = useCopy(store)
  const body = push.raw_body
  const text = body === null || body === undefined ? '' : JSON.stringify(body, null, 2)
  return (
    <div className="cx-push">
      <div className="cx-push-m">
        <span>{new Date(push.received_at).toLocaleString('en-IN')}</span>
        {push.source_ip && <span>{push.source_ip}</span>}
        {push.headers?.['content-type'] && <span>{push.headers['content-type']}</span>}
        {push.lead_id && <span>{push.lead_id}</span>}
        <button className="cx-icb" title="Copy payload" onClick={() => copy(text, push.id)}>
          <Icon name={copied === push.id ? 'check' : 'copy'} size={14} />
        </button>
      </div>
      {push.error && <div className="cx-push-e">{push.error}</div>}
      {push.body_purged_at
        ? <div className="cx-act-empty">Payload purged {relativeTime(push.body_purged_at)}</div>
        : body && typeof body === 'object'
          ? <div className="cx-push-b jv-surface"><JsonView data={body} /></div>
          : <pre className="cx-push-b">{text || '(empty body)'}</pre>}
    </div>
  )
}

// How many pushes a page holds. The feed used to ask for exactly this many and
// show nothing else, so a connection that had received 18 looked like it
// stopped after 8 — the history was there, the screen just never asked for it.
const PAGE = 8

function Activity({ connectionId, refreshKey, store }) {
  const [rows, setRows] = useState(null)
  const [total, setTotal] = useState(0)
  const [loadingMore, setLoadingMore] = useState(false)
  const [openId, setOpenId] = useState(null)
  useEffect(() => {
    let alive = true
    setRows(null)
    api.getConnectionInbox(connectionId, PAGE, 0)
      .then(r => { if (alive && r?.success) { setRows(r.pushes); setTotal(r.total ?? r.pushes.length) } })
      .catch(() => { if (alive) { setRows([]); setTotal(0) } })
    return () => { alive = false }
  }, [connectionId, refreshKey])

  // Appends the next page. Offset comes from what is already on screen rather
  // than a page counter, so a push that arrives mid-read cannot make the next
  // page skip a row.
  const loadMore = () => {
    setLoadingMore(true)
    api.getConnectionInbox(connectionId, PAGE, rows.length)
      .then(r => { if (r?.success) { setRows(cur => [...cur, ...r.pushes]); setTotal(r.total ?? total) } })
      .catch(() => {})
      .finally(() => setLoadingMore(false))
  }

  if (rows === null) {
    return (
      <ul className="cx-act">
        {[0, 1, 2].map(i => (
          <li key={i}><span className="skel skel-av sm" style={{ width: 9, height: 9, borderRadius: '50%' }} />
            <Skel w={58} h={9} /><Skel w={120} h={9} /></li>
        ))}
      </ul>
    )
  }
  if (!rows.length) return <div className="cx-act-empty">Nothing received yet</div>
  return (
    <ul className="cx-act">
      {rows.map(p => {
        const on = openId === p.id
        return (
          <li key={p.id} className={on ? 'on' : ''}>
            <button className="cx-act-r" onClick={() => setOpenId(on ? null : p.id)}>
              <span className={'cx-dot cx-' + p.status} />
              <span className="cx-act-t">{relativeTime(p.received_at)}</span>
              <span className="cx-act-s">
                {p.status === 'parsed' ? (p.lead_id ? STATUS_TEXT.parsed : 'Processed')
                  : STATUS_TEXT[p.status] || p.error || 'Failed'}
              </span>
              <Icon name={on ? 'chevUp' : 'chevDown'} size={13} />
            </button>
            {on && <Push push={p} store={store} />}
          </li>
        )
      })}
      {rows.length < total && (
        <li className="cx-act-more">
          <button className="cx-more-btn" onClick={loadMore} disabled={loadingMore}>
            {loadingMore ? 'Loading…' : `Show ${Math.min(PAGE, total - rows.length)} more`}
            <span className="cx-more-of">{rows.length} of {total}</span>
          </button>
        </li>
      )}
    </ul>
  )
}

// ---------------------------------------------------------------------------
// Field mapping
// ---------------------------------------------------------------------------

const TARGETS = [
  { key: 'name', label: 'Name', required: true },
  { key: 'phone', label: 'Phone', required: true },
  { key: 'email', label: 'Email' },
  // Unmapped, this silently defaults to Sale for every enquiry — map it
  // whenever the source distinguishes rent from sale, so a rent-seeker
  // doesn't land in the sale bucket and get matched against sale-only stock.
  { key: 'req.deal', label: 'Deal type (sale or rent)' },
  { key: 'req.locality', label: 'Locality' },
  { key: 'req.config', label: 'Configuration' },
  // minBudget/maxBudget is the canonical spelling — createLead reads it first,
  // and the parser now auto-detects and stores it under the same name. The
  // older budgetMin/budgetMax is still accepted on the way in and folded onto
  // these on save, so a connection mapped before that change keeps working.
  { key: 'req.minBudget', label: 'Budget from' },
  { key: 'req.maxBudget', label: 'Budget to' },
  { key: 'req.notes', label: 'Message' },
  // Prose, not a link. Portals name the listing the buyer was looking at and
  // we rarely hold that row, so it is carried as text into the requirement
  // line where an agent reads it before calling.
  { key: 'req.interest', label: 'Property interested' },
  // The portal's own enquiry time. Unmapped, the lead is stamped when we
  // processed it — identical on a live push, days out on a replayed backlog.
  { key: 'received_at', label: 'Enquiry time' },
  { key: 'external_id', label: 'Their reference' },
]

function Mapper({ connection, store, onClose, onSaved }) {
  const [data, setData] = useState(null)
  const [config, setConfig] = useState(null)
  const [preview, setPreview] = useState(null)
  const [busy, setBusy] = useState(false)
  // The field currently "listening" for a click in the payload tree. Arms on
  // the first unmapped required field once the sample loads, and advances to
  // the next unmapped target after each pick — so mapping a normal 9-field
  // provider is nine clicks in the payload, not nine trips through a dropdown.
  const [armed, setArmed] = useState(null)

  useEffect(() => {
    api.getConnectionSample(connection.id)
      .then(r => {
        if (!r?.success) return
        setData(r)
        const cfg = r.config || r.suggestion || { map: {}, defaults: {}, transforms: {}, valueMaps: {} }
        setConfig(cfg)
        setArmed(TARGETS.find(t => !cfg.map?.[t.key])?.key || TARGETS[0].key)
      })
      .catch(() => store.toast('Could not load the sample', 'warn'))
  }, [connection.id, store])

  // Any edit clears the preview, or you could preview one mapping and save
  // another.
  const edit = (target, source) => {
    setPreview(null)
    setConfig(c => {
      const map = { ...(c.map || {}) }
      if (source) map[target] = source; else delete map[target]
      return { ...c, map }
    })
  }
  // A click in the payload tree assigns to whichever row is armed, then arms
  // the next unmapped target — the whole reason this is faster than a dropdown
  // is that mapping nine fields never leaves the payload.
  const pick = (path) => {
    if (!armed) return
    const justMapped = armed
    edit(armed, path)
    setArmed(TARGETS.find(t => t.key !== justMapped && !config?.map?.[t.key])?.key || null)
  }
  const editTransform = (target, name) => {
    setPreview(null)
    setConfig(c => {
      const transforms = { ...(c.transforms || {}) }
      if (name) transforms[target] = name; else delete transforms[target]
      return { ...c, transforms }
    })
  }

  // Re-run auto-detect against the latest push.
  //
  // The mapper loads the SAVED config when there is one, which is right until
  // the portal changes its payload — and then it is exactly wrong. MagicBricks
  // went from three fields to eleven, and the only way to pick the new ones up
  // was to click twelve rows and set five transforms by hand, so the saved
  // three-field mapping stayed put and eight fields per enquiry were dropped.
  // Auto-detect already runs on every sample fetch; this just lets you take it.
  const redetect = () => {
    if (!data?.suggestion) return
    setPreview(null)
    setConfig(data.suggestion)
    setArmed(TARGETS.find(t => !data.suggestion.map?.[t.key])?.key || null)
    store.toast(`${Object.keys(data.suggestion.map || {}).length} fields detected — test before saving`)
  }

  const runPreview = () => {
    setBusy(true)
    api.previewParser(connection.id, config)
      .then(r => { if (r?.success) setPreview(r); else store.toast(r?.message || 'Could not test', 'warn') })
      .catch(e => store.toast(e.message || 'Could not test', 'warn'))
      .finally(() => setBusy(false))
  }

  const save = () => {
    setBusy(true)
    api.saveParser(connection.id, config)
      .then(r => {
        if (r?.success) { store.toast('Mapping saved'); onSaved?.() }
        else store.toast(r?.message || 'Mapping rejected', 'warn')
      })
      .catch(e => store.toast(e.message || 'Mapping rejected', 'warn'))
      .finally(() => setBusy(false))
  }

  if (!data) {
    return (
      <div className="cx-map">
        <div className="cx-map-grid">
          {[0, 1, 2, 3, 4].map(i => (
            <div className="cx-map-row" key={i}>
              <Skel w={80} /><Skel w="100%" h={30} /><Skel w="100%" h={30} /><Skel w="70%" />
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (!data.payload) {
    return (
      <div className="cx-map">
        <div className="cx-nosample">
          <Icon name="alert" size={16} />
          <div>
            <strong>No enquiry received yet</strong>
            <p>Send {connection.provider} the setup pack and ask for one test push.</p>
          </div>
        </div>
        <Button variant="secondary" onClick={onClose}>Close</Button>
      </div>
    )
  }

  const armedField = TARGETS.find(t => t.key === armed)
  const mappedPaths = new Set(Object.values(config?.map || {}))
  const payloadKeys = data.payload && typeof data.payload === 'object' ? Object.keys(data.payload) : []

  return (
    <div className="cx-map cx-map-split">
      <div className="cx-map-fields">
        {data.droppedFields?.length > 0 && (
          <div className="cx-map-note">
            This connection's saved mapping referenced {data.droppedFields.length === 1 ? 'a field' : 'fields'} ({data.droppedFields.join(', ')}) that {data.droppedFields.length === 1 ? "isn't" : "aren't"} valid anymore and {data.droppedFields.length === 1 ? 'has' : 'have'} been removed. Map the fields below and save to replace it.
          </div>
        )}
        <div className="cx-map-hint">
          {payloadKeys.length === 0
            ? 'The last push had no fields in it. Send a real enquiry, then reopen this to map it.'
            : armedField
              ? <>Click the field in <b>{connection.provider}'s payload</b> that holds <b>{armedField.label}</b>{armedField.required ? <i className="req">*</i> : null}.</>
              : 'All fields mapped — pick a row to remap it.'}
        </div>
        <div className="cx-map-grid">
          {TARGETS.map(t => {
            const source = config?.map?.[t.key] || ''
            const sample = source ? data.paths[source] : undefined
            return (
              <div key={t.key} className={'cx-mrow' + (armed === t.key ? ' armed' : '') + (source ? ' filled' : '')}>
                <button type="button" className="cx-mrow-main" onClick={() => setArmed(t.key)}>
                  <span className="cx-mrow-l">{t.label}{t.required && <i className="req">*</i>}</span>
                  {source
                    ? <span className="cx-mrow-path"><Icon name="check" size={12} />{source}<span className="cx-mrow-sample">{sample === undefined ? '' : String(sample).slice(0, 30)}</span></span>
                    : <span className="cx-mrow-empty">{armed === t.key ? 'Waiting for a click…' : 'Not mapped'}</span>}
                </button>
                {source && (
                  <>
                    <select className="cx-mrow-tf" value={config?.transforms?.[t.key] || ''}
                      onChange={e => editTransform(t.key, e.target.value)} title="Transform">
                      <option value="">as-is</option>
                      {(data.transforms || []).map(tr => <option key={tr} value={tr}>{tr}</option>)}
                    </select>
                    <button type="button" className="cx-icb" title="Unmap" onClick={() => edit(t.key, null)}>
                      <Icon name="x" size={13} />
                    </button>
                  </>
                )}
              </div>
            )
          })}
        </div>
      </div>

      <div className="cx-map-payload">
        <div className="cx-map-payload-h">{connection.provider} sent this</div>
        <div className="cx-map-payload-b jv-surface">
          {payloadKeys.length === 0
            ? <div className="jv-empty">Empty body — nothing to click here.</div>
            : <JsonView data={data.payload} onPick={pick} picked={armed ? config?.map?.[armed] : null} />}
        </div>
        {mappedPaths.size > 0 && (
          <div className="cx-map-payload-f">{mappedPaths.size} field{mappedPaths.size > 1 ? 's' : ''} mapped</div>
        )}
      </div>

      <div className="cx-map-foot">
        {data.suggestion && <Button variant="secondary" icon="refresh" onClick={redetect} disabled={busy}>Re-detect</Button>}
        <Button variant="secondary" onClick={runPreview} disabled={busy}>{busy ? 'Testing…' : 'Test'}</Button>
        <Button variant="primary" onClick={save} disabled={!preview?.ok || busy}>Save mapping</Button>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
      </div>

      {preview && (
        <div className={'cx-preview' + (preview.ok ? ' ok' : ' bad')}>
          <div className="cx-preview-h">
            <Icon name={preview.ok ? 'check' : 'alert'} size={14} />
            {preview.ok ? 'Resulting lead' : (preview.errors?.length ? preview.errors.join(' ') : `Missing ${preview.missing.join(' and ')}`)}
          </div>
          {preview.ok && (
            <div className="cx-preview-grid">
              {preview.trace.filter(t => t.value !== null).map(t => (
                <div key={t.target} className="cx-preview-row">
                  <span className="cx-pv-k">{TARGETS.find(x => x.key === t.target)?.label || t.target}</span>
                  <span className="cx-pv-v">{String(t.value)}</span>
                  <span className="cx-pv-from">{t.from || 'default'}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Add a source
// ---------------------------------------------------------------------------

function AddSource({ onCreate, onCancel, busy }) {
  const [name, setName] = useState('')
  const ref = useRef(null)
  useEffect(() => { ref.current?.focus() }, [])
  const submit = (e) => { e.preventDefault(); if (name.trim()) onCreate(name.trim()) }

  return (
    <form className="cx-add" onSubmit={submit}>
      <div className="cx-add-r">
        <input ref={ref} className="input cx-add-i" value={name} maxLength={60}
          onChange={e => setName(e.target.value)} placeholder="Name the source" />
        <Button type="submit" variant="primary" disabled={!name.trim() || busy}>
          {busy ? 'Creating…' : 'Create'}
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button>
      </div>
      <div className="cx-add-pop">
        {SUGGESTED.map(p => (
          <button key={p} type="button" className={'cx-chip' + (name === p ? ' on' : '')}
            onClick={() => setName(p)}>{p}</button>
        ))}
      </div>
    </form>
  )
}

// ---------------------------------------------------------------------------

function CardSkeleton() {
  return (
    <div className="cx-card">
      <div className="cx-card-h">
        <span className="skel cx-mark" />
        <div className="cx-card-id"><Skel w={130} h={13} /><div style={{ marginTop: 6 }}><Skel w={90} h={9} /></div></div>
        <Skel w={150} h={28} />
      </div>
      <div className="cx-keyrow"><Skel w={30} h={9} /><Skel w="55%" h={12} /></div>
      <div className="cx-card-f"><Skel w={110} h={20} /></div>
    </div>
  )
}

export default function Connections({ store }) {
  const [rows, setRows] = useState(null)
  const [meta, setMeta] = useState({ endpoint: '', headerName: 'X-API-Key' })
  const [adding, setAdding] = useState(false)
  const [creating, setCreating] = useState(false)
  const [fresh, setFresh] = useState({})       // id → key just minted, shown expanded
  const [mapping, setMapping] = useState(null)
  const [pack, setPack] = useState(null)
  const [open, setOpen] = useState(null)
  const [menu, setMenu] = useState(null)
  const [tick, setTick] = useState(0)
  const [copiedPack, copyPack] = useCopy(store)

  const role = store.state.role
  const canManage = role === 'admin' || role === 'owner' || role === 'manager'

  const load = useCallback(() => {
    api.getConnections()
      .then(r => {
        if (!r?.success) { setRows([]); return }
        setRows(r.connections)
        setMeta({ endpoint: r.endpoint, headerName: r.headerName || 'X-API-Key' })
      })
      .catch(() => setRows([]))
  }, [])
  useEffect(() => { load() }, [load, tick])

  // A click anywhere else closes the row menu. Registered on the NEXT frame:
  // React's synthetic handler runs at the root, so `stopPropagation` there does
  // not stop the native event reaching window — the click that opened the menu
  // would otherwise close it again before it painted.
  useEffect(() => {
    if (!menu) return
    const close = () => setMenu(null)
    const id = requestAnimationFrame(() => window.addEventListener('click', close))
    return () => { cancelAnimationFrame(id); window.removeEventListener('click', close) }
  }, [menu])

  const create = (provider) => {
    setCreating(true)
    api.createConnection(provider)
      .then(r => {
        if (!r?.success) { store.toast(r?.message || r?.error || 'Could not create', 'warn'); return }
        setFresh(f => ({ ...f, [r.connection.id]: r.apiKey }))
        setAdding(false); setTick(t => t + 1)
      })
      .catch(e => store.toast(e.message || 'Could not create', 'warn'))
      .finally(() => setCreating(false))
  }

  const rotate = (c) => {
    if (!window.confirm(`Rotate the key for ${c.provider}?\n\nTheir current key stops working immediately.`)) return
    api.rotateConnectionKey(c.id)
      .then(r => { if (r?.success) { setFresh(f => ({ ...f, [c.id]: r.apiKey })); setTick(t => t + 1) } })
      .catch(e => store.toast(e.message || 'Could not rotate', 'warn'))
  }

  const togglePause = (c) => {
    api.setConnectionActive(c.id, !c.active)
      .then(() => { store.toast(c.active ? `${c.provider} paused` : `${c.provider} resumed`); setTick(t => t + 1) })
      .catch(e => store.toast(e.message || 'Could not change', 'warn'))
  }

  const remove = (c) => {
    if (!window.confirm(`Delete ${c.provider}?\n\nIts key stops working. Received history is kept.`)) return
    api.deleteConnection(c.id)
      .then(() => { store.toast(`${c.provider} deleted`); setTick(t => t + 1) })
      .catch(e => store.toast(e.message || 'Could not delete', 'warn'))
  }

  const replay = (c) => {
    api.replayConnection(c.id)
      .then(r => {
        if (!r?.success) { store.toast('Could not process', 'warn'); return }
        store.toast(r.processed ? `${r.ingested} new · ${r.merged} merged · ${r.failed} failed` : 'Nothing waiting')
        setTick(t => t + 1)
        store.hydrate?.()
      })
      .catch(e => store.toast(e.message || 'Could not process', 'warn'))
  }

  const showPack = (c) => {
    api.getSetupPack(c.id)
      .then(r => { if (r?.success) setPack({ ...r, connection: c }) })
      .catch(() => store.toast('Could not build the pack', 'warn'))
  }

  if (!canManage) return <div className="cx-locked">Owner or manager only.</div>

  return (
    <div className="cx">
      <div className="itg-sec cx-sec">
        Lead sources
        {!adding && (
          <button className="btn btn-secondary btn-sm" onClick={() => setAdding(true)}>
            <Icon name="plus" size={14} />Add source
          </button>
        )}
      </div>

      <Endpoint endpoint={meta.endpoint} docsUrl={meta.docsUrl} headerName={meta.headerName} store={store} />

      {adding && <AddSource onCreate={create} onCancel={() => setAdding(false)} busy={creating} />}

      {rows === null && <><CardSkeleton /><CardSkeleton /></>}
      {rows?.length === 0 && !adding && (
        <div className="cx-empty"><strong>No lead sources yet</strong></div>
      )}

      {rows?.map(c => {
        // 'failed' is included: the mapper can drop a bad key and re-save,
        // and those pushes deserve another try against the corrected mapping
        // rather than showing the same stale error forever. See replayPending.
        const pending = ((c.counts || {}).pending || 0) + ((c.counts || {}).failed || 0)
        const st = stateOf(c)
        const total = Object.values(c.counts || {}).reduce((a, b) => a + b, 0)
        return (
          <div key={c.id} className={'cx-card' + (c.active ? '' : ' paused')}>
            <div className="cx-card-h">
              <span className="cx-mark">{mark(c.provider)}</span>
              <div className="cx-card-id">
                <div className="cx-card-n">{c.provider}</div>
                <div className="cx-card-s">
                  {c.last_received_at ? `Last push ${relativeTime(c.last_received_at)}` : 'No pushes yet'}
                </div>
              </div>
              <div className="cx-card-a">
                <button className="btn btn-secondary btn-sm" onClick={() => setMapping(c)}>
                  {c.configured ? 'Fields' : 'Map fields'}
                </button>
                <button className="btn btn-ghost btn-sm" onClick={() => showPack(c)}>Setup</button>
              </div>
            </div>

            <KeyRow connection={c} store={store} fresh={fresh[c.id]} />

            {pending > 0 && c.configured && (
              <div className="cx-replay">
                <span>{pending} waiting or failed</span>
                <Button size="sm" variant="secondary" onClick={() => replay(c)}>Process</Button>
              </div>
            )}

            {open === c.id && (
              <div className="cx-card-b"><Activity connectionId={c.id} refreshKey={tick} store={store} /></div>
            )}

            <div className="cx-card-f">
              <span className={'cx-pill cx-' + st.key}><span className="cx-dot" />{st.label}</span>
              {total > 0 && <span className="cx-count">{total} received</span>}
              <button className="lnk cx-toggle" onClick={() => setOpen(open === c.id ? null : c.id)}>
                Activity<Icon name={open === c.id ? 'chevUp' : 'chevDown'} size={13} />
              </button>
              <div className="cx-menu-w" onClick={e => e.stopPropagation()}>
                <button className="cx-icb" aria-label="More" onClick={() => setMenu(menu === c.id ? null : c.id)}>
                  <Icon name="dots" size={16} />
                </button>
                {menu === c.id && (
                  <div className="cx-menu" role="menu">
                    <button onClick={() => { setMenu(null); rotate(c) }}><Icon name="refresh" size={14} />Rotate key</button>
                    <button onClick={() => { setMenu(null); togglePause(c) }}>
                      <Icon name={c.active ? 'clock' : 'play'} size={14} />{c.active ? 'Pause' : 'Resume'}
                    </button>
                    <button className="danger" onClick={() => { setMenu(null); remove(c) }}><Icon name="trash" size={14} />Delete</button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )
      })}

      {mapping && (
        <div className="cx-sheet" role="dialog" aria-label="Field mapping">
          <div className="cx-sheet-in">
            <div className="cx-sheet-h">
              <span>{mapping.provider} · field mapping</span>
              <button className="cx-x" onClick={() => setMapping(null)} aria-label="Close"><Icon name="x" size={16} /></button>
            </div>
            <Mapper connection={mapping} store={store}
              onClose={() => setMapping(null)}
              onSaved={() => { setMapping(null); setTick(t => t + 1) }} />
          </div>
        </div>
      )}

      {pack && (
        <div className="cx-sheet" role="dialog" aria-label="Setup pack">
          <div className="cx-sheet-in">
            <div className="cx-sheet-h">
              <span>{pack.connection.provider} · setup pack</span>
              <button className="cx-x" onClick={() => setPack(null)} aria-label="Close"><Icon name="x" size={16} /></button>
            </div>
            <div className="cx-pack">
              <textarea className="textarea cx-pack-t" readOnly rows={9} value={pack.email} />
              <div className="cx-pack-docs">
                <div>
                  <div className="cx-pack-docs-l">Documentation page</div>
                  <div className="cx-pack-docs-u">{pack.docsUrl}</div>
                </div>
                <Button variant="secondary" size="sm" icon={copiedPack === 'docs' ? 'check' : 'copy'}
                  onClick={() => copyPack(pack.docsUrl, 'docs')}>
                  {copiedPack === 'docs' ? 'Copied' : 'Copy link'}
                </Button>
              </div>
              <div className="cx-map-foot">
                <Button variant="secondary" icon={copiedPack === 'pack' ? 'check' : 'copy'}
                  onClick={() => copyPack(pack.email, 'pack')}>
                  {copiedPack === 'pack' ? 'Copied' : 'Copy email'}
                </Button>
                <Button variant="ghost" onClick={() => setPack(null)}>Close</Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
