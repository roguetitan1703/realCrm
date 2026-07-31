import { useCallback, useEffect, useState } from 'react'
import Icon from '../components/Icon.jsx'
import { Button, Field, Input } from '../components/primitives.jsx'
import { api } from '../lib/api.js'

// ============================================================================
// 🔌 CONNECTIONS — where leads come from (spec: docs/specs/ingestion.md, D1)
// ============================================================================
// One card per provider, each showing its live activity underneath it. That
// pairing is the point: a firm can SEE data arriving before it becomes leads,
// which is the difference between "the integration is broken" and "it's
// arriving, we just haven't told it how to read it yet".
//
// Three states a connection can be in, and the UI names all three rather than
// showing a generic "connected" tick:
//   • no key used yet      — nothing has ever arrived
//   • receiving, unmapped  — data is landing and waiting (NOT an error)
//   • live                 — mapped, leads are being created
// ============================================================================

// Offered as one-click names only. They create an ordinary connection — there
// is no per-portal code anywhere, and the endpoint is identical for all of
// them, so this list is a convenience and never a capability.
const POPULAR = ['99acres', 'MagicBricks', 'Housing.com', 'Meta Lead Ads', 'Website form']

function relativeTime(iso) {
  if (!iso) return 'never'
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  if (mins < 1440) return `${Math.round(mins / 60)}h ago`
  return `${Math.round(mins / 1440)}d ago`
}

/** The key, shown once and never again. */
function KeyReveal({ apiKey, onDone, store }) {
  const [copied, setCopied] = useState(false)
  const copy = () => {
    navigator.clipboard?.writeText(apiKey)
      .then(() => { setCopied(true); setTimeout(() => setCopied(false), 1600) })
      .catch(() => store.toast('Could not copy — select the key and copy it manually', 'warn'))
  }
  return (
    <div className="cx-reveal">
      <div className="cx-reveal-h"><Icon name="shield" size={15} />This key is shown once</div>
      <p>We store only a fingerprint of it, so we cannot show it again. Copy it now — if it's lost, rotate the key and send the new one.</p>
      <code className="cx-key">{apiKey}</code>
      <div className="cx-reveal-a">
        <Button variant="secondary" size="sm" icon={copied ? 'check' : 'copy'} onClick={copy}>{copied ? 'Copied' : 'Copy key'}</Button>
        <Button variant="primary" size="sm" onClick={onDone}>I've saved it</Button>
      </div>
    </div>
  )
}

/** Recent pushes for one connection — the "you can see it arriving" view. */
function Activity({ connectionId, refreshKey }) {
  const [rows, setRows] = useState(null)
  useEffect(() => {
    let alive = true
    api.getConnectionInbox(connectionId, 8)
      .then(r => { if (alive && r?.success) setRows(r.pushes) })
      .catch(() => { if (alive) setRows([]) })
    return () => { alive = false }
  }, [connectionId, refreshKey])

  if (rows === null) return <div className="cx-act-empty">Loading activity…</div>
  if (!rows.length) {
    return (
      <div className="cx-act-empty">
        Nothing received yet. Send one test enquiry from the provider and it will appear here within seconds.
      </div>
    )
  }
  return (
    <ul className="cx-act">
      {rows.map(p => (
        <li key={p.id}>
          <span className={'cx-dot cx-' + p.status} />
          <span className="cx-act-t">{relativeTime(p.received_at)}</span>
          <span className="cx-act-s">
            {p.status === 'parsed' ? (p.lead_id ? 'became a lead' : 'processed')
              : p.status === 'pending' ? 'waiting for a field mapping'
                : p.status === 'ignored' ? 'duplicate, ignored'
                  : (p.error || 'failed')}
          </span>
        </li>
      ))}
    </ul>
  )
}

/**
 * The field mapper. Deliberately not a JSON editor: it lists the lead fields we
 * want and, for each, a dropdown of the paths that actually exist in a real
 * payload. That turns the job from "write a config" into "confirm these
 * matches" — the difference between something a broker can do and something
 * they have to phone us about.
 *
 * Save is blocked until a preview has been run, and the server refuses an
 * unusable mapping regardless, so the guardrail survives anyone calling the
 * API directly.
 */
const TARGETS = [
  { key: 'name', label: 'Name', required: true },
  { key: 'phone', label: 'Phone', required: true },
  { key: 'email', label: 'Email' },
  { key: 'req.locality', label: 'Locality' },
  { key: 'req.config', label: 'Configuration' },
  { key: 'req.budgetMin', label: 'Budget from' },
  { key: 'req.budgetMax', label: 'Budget to' },
  { key: 'req.notes', label: 'Their message' },
  { key: 'external_id', label: "Provider's own id" },
]

function Mapper({ connection, store, onClose, onSaved }) {
  const [data, setData] = useState(null)
  const [config, setConfig] = useState(null)
  const [preview, setPreview] = useState(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    api.getConnectionSample(connection.id)
      .then(r => {
        if (!r?.success) return
        setData(r)
        setConfig(r.config || r.suggestion || { map: {}, defaults: {}, transforms: {}, valueMaps: {} })
      })
      .catch(() => store.toast('Could not load the sample payload', 'warn'))
  }, [connection.id, store])

  // Any edit invalidates the preview — otherwise you could preview one mapping
  // and save a different one.
  const edit = (target, source) => {
    setPreview(null)
    setConfig(c => {
      const map = { ...(c.map || {}) }
      if (source) map[target] = source; else delete map[target]
      return { ...c, map }
    })
  }
  const editTransform = (target, name) => {
    setPreview(null)
    setConfig(c => {
      const transforms = { ...(c.transforms || {}) }
      if (name) transforms[target] = name; else delete transforms[target]
      return { ...c, transforms }
    })
  }

  const runPreview = () => {
    setBusy(true)
    api.previewParser(connection.id, config)
      .then(r => { if (r?.success) setPreview(r); else store.toast(r?.message || 'Could not run the test', 'warn') })
      .catch(e => store.toast(e.message || 'Could not run the test', 'warn'))
      .finally(() => setBusy(false))
  }

  const save = () => {
    setBusy(true)
    api.saveParser(connection.id, config)
      .then(r => {
        if (r?.success) { store.toast('Mapping saved — new enquiries will become leads'); onSaved?.() }
        else store.toast(r?.message || 'That mapping was rejected', 'warn')
      })
      .catch(e => store.toast(e.message || 'That mapping was rejected', 'warn'))
      .finally(() => setBusy(false))
  }

  if (!data) return <div className="cx-map"><div className="cx-act-empty">Loading…</div></div>

  if (!data.payload) {
    return (
      <div className="cx-map">
        <div className="cx-nosample">
          <Icon name="alert" size={17} />
          <div>
            <strong>Nothing to map yet</strong>
            <p>
              A mapping is built from what this provider actually sends, not from a guess —
              so we need one real enquiry first. Send them the setup pack and ask for a single test push.
            </p>
          </div>
        </div>
        <Button variant="secondary" onClick={onClose}>Close</Button>
      </div>
    )
  }

  const paths = Object.keys(data.paths || {})
  const okToSave = preview?.ok

  return (
    <div className="cx-map">
      <p className="cx-map-lead">
        Match each of our fields to whatever <strong>{connection.provider}</strong> calls it.
        The values shown come from the last enquiry they actually sent.
      </p>

      <div className="cx-map-grid">
        {TARGETS.map(t => {
          const source = config?.map?.[t.key] || ''
          const sample = source ? data.paths[source] : undefined
          return (
            <div className="cx-map-row" key={t.key}>
              <div className="cx-map-l">
                {t.label}{t.required && <i className="req">*</i>}
              </div>
              <select className="input" value={source} onChange={e => edit(t.key, e.target.value)}>
                <option value="">— not sent —</option>
                {paths.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
              <select className="input cx-map-tr" value={config?.transforms?.[t.key] || ''}
                onChange={e => editTransform(t.key, e.target.value)}>
                <option value="">as-is</option>
                {(data.transforms || []).map(tr => <option key={tr} value={tr}>{tr}</option>)}
              </select>
              <div className="cx-map-sample">{sample === undefined ? '' : String(sample).slice(0, 40)}</div>
            </div>
          )
        })}
      </div>

      <div className="cx-map-foot">
        <Button variant="secondary" onClick={runPreview} disabled={busy}>
          {busy ? 'Testing…' : 'Test against the last enquiry'}
        </Button>
        <Button variant="primary" onClick={save} disabled={!okToSave || busy}>Save mapping</Button>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
      </div>

      {/* The mandatory preview. Showing the RESULT rather than a tick is what
          makes a mis-map visible before it can affect a single lead. */}
      {preview && (
        <div className={'cx-preview' + (preview.ok ? ' ok' : ' bad')}>
          <div className="cx-preview-h">
            <Icon name={preview.ok ? 'check' : 'alert'} size={15} />
            {preview.ok ? 'This is the lead we would create' : 'This mapping would not produce a usable lead'}
          </div>
          {!preview.ok && (
            <p className="cx-preview-err">
              {preview.errors?.length ? preview.errors.join(' ') : `Missing ${preview.missing.join(' and ')}.`}
            </p>
          )}
          <div className="cx-preview-grid">
            {preview.trace.filter(t => t.value !== null).map(t => (
              <div key={t.target} className="cx-preview-row">
                <span className="cx-pv-k">{TARGETS.find(x => x.key === t.target)?.label || t.target}</span>
                <span className="cx-pv-v">{String(t.value)}</span>
                <span className="cx-pv-from">{t.from ? `from ${t.from}` : 'default'}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export default function Connections({ store }) {
  const [rows, setRows] = useState(null)
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const [revealed, setRevealed] = useState(null)   // { id, apiKey }
  const [mapping, setMapping] = useState(null)
  const [pack, setPack] = useState(null)
  const [open, setOpen] = useState(null)
  const [tick, setTick] = useState(0)

  // Owner/manager only — the whole screen is a credential surface.
  const role = store.state.role
  const canManage = role === 'admin' || role === 'owner' || role === 'manager'

  const load = useCallback(() => {
    api.getConnections()
      .then(r => setRows(r?.success ? r.connections : []))
      .catch(() => setRows([]))
  }, [])
  useEffect(() => { load() }, [load, tick])

  const create = (provider) => {
    const label = String(provider || '').trim()
    if (!label) { store.toast('Give the connection a name first', 'warn'); return }
    api.createConnection(label)
      .then(r => {
        if (!r?.success) { store.toast(r?.message || 'Could not create the connection', 'warn'); return }
        setRevealed({ id: r.connection.id, apiKey: r.apiKey })
        setAdding(false); setName(''); setTick(t => t + 1)
      })
      .catch(e => store.toast(e.message || 'Could not create the connection', 'warn'))
  }

  const rotate = (c) => {
    if (!window.confirm(`Rotate the key for ${c.provider}?\n\nIts current key stops working immediately, and ${c.provider} will not be able to send anything until you give them the new one.`)) return
    api.rotateConnectionKey(c.id)
      .then(r => { if (r?.success) { setRevealed({ id: c.id, apiKey: r.apiKey }); setTick(t => t + 1) } })
      .catch(e => store.toast(e.message || 'Could not rotate the key', 'warn'))
  }

  const togglePause = (c) => {
    api.setConnectionActive(c.id, !c.active)
      .then(() => { store.toast(c.active ? `${c.provider} paused — pushes will be rejected` : `${c.provider} resumed`); setTick(t => t + 1) })
      .catch(e => store.toast(e.message || 'Could not change that', 'warn'))
  }

  const replay = (c) => {
    api.replayConnection(c.id)
      .then(r => {
        if (!r?.success) { store.toast('Could not replay', 'warn'); return }
        store.toast(r.processed
          ? `Replayed ${r.processed}: ${r.ingested} new, ${r.merged} merged, ${r.failed} failed`
          : 'Nothing was waiting')
        setTick(t => t + 1)
        store.hydrate?.()
      })
      .catch(e => store.toast(e.message || 'Could not replay', 'warn'))
  }

  const showPack = (c) => {
    api.getSetupPack(c.id)
      .then(r => { if (r?.success) setPack({ ...r, connection: c }) })
      .catch(() => store.toast('Could not build the setup pack', 'warn'))
  }

  if (!canManage) {
    return <div className="cx-locked">Only an owner or manager can manage where leads come from.</div>
  }

  return (
    <div className="cx">
      <div className="cx-head">
        <div>
          <div className="cx-title">Where leads come from</div>
          <div className="cx-sub">
            Each connection gets its own endpoint key. Data lands here the moment a provider
            sends it — then you tell us how to read their fields.
          </div>
        </div>
        {!adding && <Button variant="primary" icon="plus" onClick={() => setAdding(true)}>Add a connection</Button>}
      </div>

      {adding && (
        <div className="cx-add">
          <div className="cx-add-h">Add a connection</div>
          <div className="cx-add-pop">
            {POPULAR.map(p => (
              <button key={p} type="button" className="pwc" onClick={() => create(p)}>{p}</button>
            ))}
          </div>
          <div className="cx-add-any">
            <Field label="Or anything else — just name it">
              <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Sunrise Builders referral feed"
                onKeyDown={e => e.key === 'Enter' && create(name)} autoFocus />
            </Field>
            <Button variant="secondary" onClick={() => create(name)}>Create</Button>
            <Button variant="ghost" onClick={() => { setAdding(false); setName('') }}>Cancel</Button>
          </div>
          <p className="cx-add-note">
            The endpoint is the same whoever is calling it, so there's nothing provider-specific to pick.
          </p>
        </div>
      )}

      {revealed && (
        <KeyReveal apiKey={revealed.apiKey} store={store} onDone={() => setRevealed(null)} />
      )}

      {rows === null && <div className="cx-act-empty">Loading connections…</div>}
      {rows?.length === 0 && !adding && (
        <div className="cx-empty">
          <strong>No connections yet</strong>
          <p>Add one for each portal, website form or partner that sends you enquiries.</p>
        </div>
      )}

      {rows?.map(c => {
        const counts = c.counts || {}
        const pending = counts.pending || 0
        const state = !c.last_received_at ? 'waiting'
          : c.configured ? 'live' : 'unmapped'
        return (
          <div key={c.id} className={'cx-card' + (c.active ? '' : ' paused')}>
            <div className="cx-card-h">
              <div className="cx-card-id">
                <span className={'cx-dot cx-' + state} />
                <div>
                  <div className="cx-card-n">{c.provider}</div>
                  <div className="cx-card-s">
                    {!c.active ? 'Paused — pushes are rejected'
                      : state === 'waiting' ? 'Key issued · nothing received yet'
                        : state === 'unmapped' ? `Receiving · ${pending} waiting for a field mapping`
                          : `Live · last received ${relativeTime(c.last_received_at)}`}
                  </div>
                </div>
              </div>
              <div className="cx-card-a">
                <button className="btn btn-ghost btn-sm" onClick={() => setOpen(open === c.id ? null : c.id)}>
                  <Icon name={open === c.id ? 'chevUp' : 'chevDown'} size={13} />Activity
                </button>
                <button className="btn btn-secondary btn-sm" onClick={() => showPack(c)}>Setup pack</button>
                <button className="btn btn-secondary btn-sm" onClick={() => setMapping(c)}>
                  {c.configured ? 'Edit fields' : 'Map fields'}
                </button>
              </div>
            </div>

            {/* The one action that turns a backlog into leads. Only offered
                when there IS a backlog and a mapping to run it through. */}
            {pending > 0 && c.configured && (
              <div className="cx-replay">
                <span>{pending} enquir{pending === 1 ? 'y' : 'ies'} arrived before the mapping existed.</span>
                <Button size="sm" variant="secondary" onClick={() => replay(c)}>Process them now</Button>
              </div>
            )}

            {open === c.id && (
              <div className="cx-card-b">
                <Activity connectionId={c.id} refreshKey={tick} />
                <div className="cx-card-foot">
                  <span className="cx-key-h">Key ends ····{c.api_key_last4 || '????'}</span>
                  <button className="lnk" onClick={() => rotate(c)}>Rotate key</button>
                  <button className="lnk" onClick={() => togglePause(c)}>{c.active ? 'Pause' : 'Resume'}</button>
                </div>
              </div>
            )}
          </div>
        )
      })}

      {mapping && (
        <div className="cx-sheet" role="dialog" aria-label="Field mapping">
          <div className="cx-sheet-in">
            <div className="cx-sheet-h">
              <span>How we read {mapping.provider}</span>
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
              <span>Send this to {pack.connection.provider}</span>
              <button className="cx-x" onClick={() => setPack(null)} aria-label="Close"><Icon name="x" size={16} /></button>
            </div>
            <div className="cx-pack">
              <p className="cx-map-lead">
                Forward this to whoever handles their technical setup. Replace <code>YOUR_API_KEY</code> with
                the key you saved — we can't fill it in, because we only keep a fingerprint of it.
              </p>
              <textarea className="textarea cx-pack-t" readOnly rows={16} value={pack.email} />
              <div className="cx-map-foot">
                <Button variant="secondary" icon="copy" onClick={() => {
                  navigator.clipboard?.writeText(pack.email)
                    .then(() => store.toast('Setup pack copied'))
                    .catch(() => store.toast('Could not copy', 'warn'))
                }}>Copy</Button>
                <Button variant="ghost" onClick={() => setPack(null)}>Close</Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
