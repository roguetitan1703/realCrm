import { useState, useEffect, useRef } from 'react'
import Icon from '../components/Icon.jsx'
import { Button, Panel, PageHeader } from '../components/primitives.jsx'
import { ListLayout } from '../layouts/layouts.jsx'
import { api } from '../lib/api.js'
import { useServerData } from '../lib/useServerData.js'
import {
  PROPERTY_FIELDS, LEAD_FIELDS, OWNER_FIELDS, GROUP_LABEL,
  parseSpreadsheet, guessMapping, EXAMPLE_SHEETS, exampleSheetCsv,
} from '../lib/importSchema.js'

// ============================================================================
// 📥 IMPORT — Choose → Upload → Map → Review → Done
// ============================================================================
// THE BROWSER NO LONGER SAVES THE FILE. It used to build a record per row and
// fire one request per row, all at once: a client's 4,108-row owner list put
// 1,380 rows in the database and the report for the rest was a number in a
// toast. The file is now uploaded once and written by a server-side job
// (backend/services/imports.ts) that records an outcome and a reason for every
// row, can be watched while it runs, and can be undone from any device.
//
// So this screen's job is the three things a person actually decides: which
// sheet, which column is which, and whether the counts look right. Every count
// it shows comes from the server, over the whole file — not from a sample the
// browser happened to hold.

const STEPS = ['Choose', 'Upload', 'Map', 'Review', 'Done']

function WizardSteps({ step }) {
  const idx = STEPS.indexOf(step)
  return (
    <div className="jstep imp-steps" role="list">
      {STEPS.map((s, i) => {
        const state = i < idx ? 'done' : i === idx ? 'current' : 'ahead'
        return (
          <div key={s} className={'jstep-node ' + state} role="listitem">
            <span className="jstep-dot">{i < idx ? <Icon name="check" size={12} /> : i + 1}</span>
            <span className="jstep-label">{s}</span>
          </div>
        )
      })}
    </div>
  )
}

const KIND_LABEL = { clients: 'Leads & contacts', owners: 'Owners', properties: 'Properties' }
const FIELDS_FOR = { clients: LEAD_FIELDS, owners: OWNER_FIELDS, properties: PROPERTY_FIELDS }

/** Rows are uploaded in chunks: a 4,000-row sheet is megabytes, and one body
 *  should not have to carry it. */
const UPLOAD_CHUNK = 1000

function download(name, text, type = 'text/csv;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([text], { type }))
  const a = document.createElement('a')
  a.href = url; a.download = name; a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export default function ImportPage({ store, go, sel, topBar }) {
  const [tab, setTab] = useState('import')          // 'import' | 'history'
  const [kind, setKind] = useState(sel?.kind || null)
  const [step, setStep] = useState('choose')        // choose | upload | map | review | done
  const [file, setFile] = useState(null)            // the File itself, for re-reading another sheet
  const [fileMeta, setFileMeta] = useState(null)
  const [sheetNames, setSheetNames] = useState([])
  const [headers, setHeaders] = useState([])
  const [rowCount, setRowCount] = useState(0)
  const [samples, setSamples] = useState({})        // column → first non-empty value
  const [mapping, setMapping] = useState({})
  // A project typed ONCE for the whole file. Real lists arrive as "the Leonara
  // sheet" with no society column in them, and pasting the same name into four
  // thousand rows is how somebody decides not to import at all.
  const [intoProject, setIntoProject] = useState('')
  const [showAllFields, setShowAllFields] = useState(false)
  const [job, setJob] = useState(null)              // the server's job row
  const [preview, setPreview] = useState(null)      // { counts, reasons, sample }
  const [checking, setChecking] = useState(false)
  const [busy, setBusy] = useState(null)            // 'uploading' | 'running' | null
  const [uploaded, setUploaded] = useState(0)
  const [filterStatus, setFilterStatus] = useState('all')
  const [error, setError] = useState(null)
  const poll = useRef(null)

  useEffect(() => {
    if (sel?.kind === 'clients' || sel?.kind === 'properties' || sel?.kind === 'owners') { setKind(sel.kind); setStep('upload') }
  }, [sel?.kind])

  // Imports run on the server, so the history is the same on every device and
  // survives a reload — the previous list lived in this tab's memory, which is
  // why an undo disappeared the moment anyone refreshed.
  const [historyAt, setHistoryAt] = useState(0)
  const reloadHistory = () => setHistoryAt(n => n + 1)
  const { data: history } = useServerData(() => api.listImports().then(r => r?.imports || []), [historyAt], [])

  useEffect(() => () => clearInterval(poll.current), [])

  const FIELDS = FIELDS_FOR[kind] || PROPERTY_FIELDS
  const kindLabel = KIND_LABEL[kind] || 'Records'

  const chooseKind = (k) => { setKind(k); setStep('upload'); setError(null) }
  const restart = () => {
    clearInterval(poll.current)
    setKind(null); setStep('choose'); setFile(null); setFileMeta(null); setSheetNames([]); setHeaders([])
    setRowCount(0); setSamples({}); setMapping({}); setIntoProject(''); setJob(null); setPreview(null); setError(null); setBusy(null); setUploaded(0)
  }

  // ---- Upload: read the file here, hand the rows to the server ------------
  const readFile = async (f, sheet) => {
    setBusy('uploading'); setError(null); setUploaded(0)
    try {
      const { headers: cols, rows, sheetName, sheetNames: names } = await parseSpreadsheet(f, sheet)
      if (!rows.length) { setError('That sheet has headers but no data rows.'); setBusy(null); return }
      const guess = guessMapping(cols, FIELDS)
      setHeaders(cols); setMapping(guess); setRowCount(rows.length)
      setSheetNames(names || []); setFileMeta({ name: f.name, size: Math.round(f.size / 1024) + ' KB', sheetName })
      // One example value per column, kept so the mapping screen can show what
      // it is about to do without holding four thousand rows in memory.
      const s = {}
      for (const c of cols) { const hit = rows.find(r => String(r[c] ?? '').trim() !== ''); if (hit) s[c] = String(hit[c]).slice(0, 28) }
      setSamples(s)

      const created = await api.createImport({
        kind, headers: cols, fileName: f.name, sheetName, sheetNames: names || [], mapping: guess, rows: [],
      })
      const j = created?.import
      if (!j?.id) throw new Error('The server did not start the import')
      for (let i = 0; i < rows.length; i += UPLOAD_CHUNK) {
        await api.appendImportRows(j.id, rows.slice(i, i + UPLOAD_CHUNK))
        setUploaded(Math.min(i + UPLOAD_CHUNK, rows.length))
      }
      setJob(j); setBusy(null); setShowAllFields(false); setStep('map')
    } catch (err) {
      setError('Could not read this file: ' + (err.message || err)); setBusy(null)
    }
  }

  const handleFile = async (e) => {
    const f = e.target.files?.[0]
    if (!f) return
    setFile(f)
    await readFile(f)
  }

  // Another sheet of the same workbook. The rows already uploaded belong to the
  // sheet they came from, so this starts a new job rather than mixing two.
  const switchSheet = async (name) => { if (file) await readFile(file, name) }

  // ---- Map → Review: the server checks the WHOLE file ---------------------
  const runCheck = async () => {
    if (!job) return
    setChecking(true); setError(null)
    try {
      const out = await api.previewImport(job.id, mapping, intoProject.trim() || null)
      setPreview(out); setFilterStatus('all'); setStep('review')
    } catch (err) {
      setError('Could not check the file: ' + (err.message || err))
    }
    setChecking(false)
  }

  // ---- Run: start it, then watch it --------------------------------------
  const start = async () => {
    if (!job) return
    setBusy('running'); setError(null); setStep('done')
    try {
      // The answer carries the job as RUNNING. Without it the screen kept
      // rendering the job as it was at upload — status "uploaded", 0 of 0 —
      // which reads as "import complete, nothing saved" for the second before
      // the first poll lands.
      const { import: started } = await api.runImport(job.id)
      if (started) setJob(started)
      clearInterval(poll.current)
      poll.current = setInterval(async () => {
        try {
          const { import: j } = await api.getImport(job.id)
          setJob(j)
          if (j.status === 'done' || j.status === 'failed' || j.status === 'reverted') {
            clearInterval(poll.current); setBusy(null); reloadHistory()
            if (j.status === 'done') store.toast(`Imported ${j.added} of ${j.total}`)
          }
        } catch (e) { /* a dropped poll is not a failed import; the next one answers */ }
      }, 1200)
    } catch (err) {
      setError('Could not start the import: ' + (err.message || err)); setBusy(null)
    }
  }

  const undo = async (id, added) => {
    if (!window.confirm(`Undo this import? The ${added} record${added === 1 ? '' : 's'} it created will be removed.`)) return
    try {
      const out = await api.revertImport(id)
      store.toast(`Removed ${out.deleted} record${out.deleted === 1 ? '' : 's'}`)
      if (job?.id === id) setJob(out.import)
      reloadHistory()
    } catch (err) {
      store.toast('Could not undo that import', 'warn')
    }
  }

  /** Every row that did not become a record, with its reason — fix these and
   *  re-import just them. */
  const downloadSkipped = async (id) => {
    try {
      const { rows } = await api.getImportRows(id)
      const bad = (rows || []).filter(r => r.status !== 'added')
      if (!bad.length) { store.toast('Every row was imported'); return }
      const cols = Object.keys(bad[0].raw || {})
      const esc = (v) => { const s = String(v ?? ''); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s }
      const csv = [['Row', 'Why it was not imported', ...cols].join(',')]
      for (const r of bad) csv.push([r.rowNo, esc(r.reason || r.status), ...cols.map(c => esc(r.raw?.[c]))].join(','))
      download(`not-imported-${id}.csv`, csv.join('\r\n'))
    } catch (err) {
      store.toast('Could not build that file', 'warn')
    }
  }

  const getExample = (k) => {
    download(`${k}-example.csv`, exampleSheetCsv(k))
  }

  // ---- Derived for the screens -------------------------------------------
  const mappedCols = Object.values(mapping).filter(Boolean)
  const unmappedHeaders = headers.filter(h => !mappedCols.includes(h))
  const missingRequired = FIELDS.filter(f => f.required && !mapping[f.key])
  const counts = preview?.counts
  const shown = (preview?.sample || []).filter(r => filterStatus === 'all' || r.status === filterStatus)
  const reviewCols = FIELDS.filter(f => mapping[f.key])
  const done = job && (job.status === 'done' || job.status === 'reverted')

  const kpis = [
    { label: 'Imports run', value: (history || []).length },
    { label: 'Not undone', value: (history || []).filter(l => l.status === 'done').length, tone: 'accent' },
  ]

  const toolbar = (
    <div className="imp-tabs">
      <button className={'imp-tab' + (tab === 'import' ? ' on' : '')} onClick={() => setTab('import')}>New import</button>
      <button className={'imp-tab' + (tab === 'history' ? ' on' : '')} onClick={() => setTab('history')}>History{(history || []).length ? ` · ${history.length}` : ''}</button>
    </div>
  )

  const visibleFields = showAllFields ? FIELDS : FIELDS.filter(f => f.group === 'key')
  const groups = visibleFields.reduce((acc, f) => { (acc[f.group] = acc[f.group] || []).push(f); return acc }, {})

  return (
    <>
      {topBar({ title: 'Import' })}
      <PageHeader kpis={kpis} />
      <ListLayout toolbar={toolbar}>
        {tab === 'import' && (
          <div className="imp-wrap">
            <Panel><WizardSteps step={{ choose: 'Choose', upload: 'Upload', map: 'Map', review: 'Review', done: 'Done' }[step]} /></Panel>

            {/* STEP 1 — what are we importing */}
            {step === 'choose' && (
              <Panel>
                <div className="imp-choose-head">What are you importing?</div>
                <div className="imp-choose-sub">Pick the record type. Your columns are matched to fields, and nothing is saved until you confirm.</div>
                <div className="imp-choose-grid">
                  <button className="imp-choice" onClick={() => chooseKind('clients')}>
                    <span className="imp-choice-ic"><Icon name="leads" size={24} /></span>
                    <span className="imp-choice-t">Leads & contacts</span>
                    <span className="imp-choice-d">Buyers and tenants, with budget, locality and requirement. One person per phone number.</span>
                  </button>
                  <button className="imp-choice" onClick={() => chooseKind('properties')}>
                    <span className="imp-choice-ic"><Icon name="building" size={24} /></span>
                    <span className="imp-choice-t">Properties</span>
                    <span className="imp-choice-d">Units and listings, with carpet, floor, price and owner. One listing per flat.</span>
                  </button>
                  <button className="imp-choice" onClick={() => chooseKind('owners')}>
                    <span className="imp-choice-ic"><Icon name="home" size={24} /></span>
                    <span className="imp-choice-t">Owners</span>
                    <span className="imp-choice-d">A calling list of flat owners, grouped by project. One row per flat, so an owner of three flats is three calls.</span>
                  </button>
                </div>
              </Panel>
            )}

            {/* STEP 2 — the file */}
            {step === 'upload' && (
              <Panel>
                <div className="imp-bar">
                  <div className="imp-step-title">Upload your file <span className="imp-target">{kindLabel}</span></div>
                  <div className="imp-bar-actions">
                    <button className="btn btn-quiet btn-sm" onClick={() => getExample(kind)}><Icon name="share" size={13} />Example sheet</button>
                    <button className="btn btn-quiet btn-sm" onClick={restart}>Change type</button>
                  </div>
                </div>
                {error && <div className="imp-error">{error}</div>}
                {/* The columns we ask for, said plainly, so the example sheet is
                    a choice rather than a download nobody opens. */}
                {EXAMPLE_SHEETS[kind] && (
                  <div className="imp-unmapped">
                    Needs: {EXAMPLE_SHEETS[kind].required.join(', ')}. Any other column in the example is optional.
                  </div>
                )}
                <label className="imp-drop">
                  <input type="file" accept=".csv,.tsv,.txt,.xlsx,.xlsm,.xls,.ods" onChange={handleFile} className="imp-file" disabled={busy === 'uploading'} />
                  <span className="imp-drop-ic"><Icon name="layers" size={26} /></span>
                  <span className="imp-drop-t">{busy === 'uploading' ? `Reading your file… ${uploaded || ''}` : 'Drop your Excel or CSV here, or click to browse'}</span>
                  <span className="imp-drop-d">.xlsx, .xls, .csv or tab-separated. Your file is uploaded once and checked before anything is saved.</span>
                </label>
              </Panel>
            )}

            {/* STEP 3 — columns */}
            {step === 'map' && (
              <Panel>
                <div className="imp-bar">
                  <div className="imp-step-title">Match your columns <span className="imp-target">
                    {rowCount} rows · {headers.length} columns · {fileMeta?.name}
                    {fileMeta?.sheetName ? ` · sheet "${fileMeta.sheetName}"` : ''}
                  </span></div>
                  <div className="imp-bar-actions">
                    <Button variant="secondary" size="sm" onClick={() => setStep('upload')}>Back</Button>
                    <Button variant="primary" size="sm" disabled={checking || missingRequired.length > 0} onClick={runCheck}>
                      {checking ? 'Checking…' : 'Check the file'}
                    </Button>
                  </div>
                </div>

                {/* THE PROJECT, ONCE, for a sheet that does not carry one — and
                    as the fallback for rows inside a sheet that does, where the
                    cell is blank. A row with its own project keeps it. */}
                {(kind === 'owners' || kind === 'properties') && (
                  <div className="imp-project">
                    <label className="imp-map-label">
                      Import into project
                      <span className="imp-map-hint">
                        {mapping.project
                          ? ' — used only where the column is empty'
                          : ' — this sheet has no project column, so every row lands here'}
                      </span>
                    </label>
                    <input className="input" value={intoProject} onChange={e => setIntoProject(e.target.value)}
                      placeholder="e.g. VTP Leonara" />
                  </div>
                )}

                {/* A workbook with several sheets used to import the first one
                    without saying which. */}
                {sheetNames.length > 1 && (
                  <div className="imp-project">
                    <label className="imp-map-label">Sheet <span className="imp-map-hint">this workbook has {sheetNames.length}</span></label>
                    <select className="input" value={fileMeta?.sheetName || ''} onChange={e => switchSheet(e.target.value)} disabled={busy === 'uploading'}>
                      {sheetNames.map(n => <option key={n} value={n}>{n}</option>)}
                    </select>
                  </div>
                )}

                <div className="imp-map-groups">
                  {Object.keys(groups).map(g => (
                    <div key={g}>
                      {showAllFields && <div className="imp-map-group">{GROUP_LABEL[g]}</div>}
                      <div className="imp-map-grid">
                        {groups[g].map(f => (
                          <div key={f.key} className="imp-map-field">
                            <label className="imp-map-label">
                              {f.label} <span className="imp-map-hint">{f.required ? '— required' : '— optional'}</span>
                            </label>
                            <select className="input" value={mapping[f.key] || ''} onChange={e => setMapping({ ...mapping, [f.key]: e.target.value })}>
                              <option value="">— Not mapped —</option>
                              {headers.map(h => <option key={h} value={h}>{h}</option>)}
                            </select>
                            <span className="imp-map-sample">{mapping[f.key] ? (samples[mapping[f.key]] ? `e.g. ${samples[mapping[f.key]]}` : 'Column is empty') : 'No column matched'}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>

                <button className="btn btn-quiet btn-sm imp-more-fields" onClick={() => setShowAllFields(v => !v)}>
                  <Icon name={showAllFields ? 'chevUp' : 'chevDown'} size={13} />
                  {showAllFields
                    ? 'Show core fields only'
                    : `Map ${FIELDS.length - FIELDS.filter(f => f.group === 'key').length} more fields — carpet area, floor, facing, owner…`}
                </button>

                {missingRequired.length > 0 && (
                  <div className="imp-error">Still to match: {missingRequired.map(f => f.label).join(', ')}.</div>
                )}
                {/* NOT KEPT, not "kept quietly somewhere". An unmapped column
                    used to be folded into the record's notes, and mapped
                    columns nobody had chosen were glued into the unit field. */}
                {unmappedHeaders.length > 0 && (
                  <div className="imp-unmapped">
                    Not imported: {unmappedHeaders.join(', ')}. Map them above if they matter.
                  </div>
                )}
                {error && <div className="imp-error">{error}</div>}
              </Panel>
            )}

            {/* STEP 4 — what will happen, counted over the whole file */}
            {step === 'review' && counts && (
              <Panel>
                <div className="imp-bar">
                  <div className="imp-step-title">Review & confirm <span className="imp-target">{counts.total} rows checked</span></div>
                  <div className="imp-bar-actions">
                    <Button variant="secondary" size="sm" onClick={() => setStep('map')}>Back</Button>
                    <Button variant="primary" size="sm" disabled={counts.new === 0} onClick={start}>
                      Import {counts.new} record{counts.new === 1 ? '' : 's'}
                    </Button>
                  </div>
                </div>
                <div className="imp-counts">
                  <span className="imp-count new">{counts.new} new</span>
                  <span className="imp-count dup">{counts.alreadyOnFile} already on file</span>
                  <span className="imp-count dup">{counts.repeatedInFile} repeated in this file</span>
                  <span className="imp-count skip">{counts.unusable} cannot be imported</span>
                  <span className="imp-count" style={{ marginLeft: 'auto' }}>{mappedCols.length} of {headers.length} columns mapped</span>
                </div>
                {/* WHY, not just how many. "19 rows have no phone number" is
                    something a person can go and fix. */}
                {preview.reasons && Object.keys(preview.reasons).length > 0 && (
                  <div className="imp-unmapped">
                    {Object.entries(preview.reasons).map(([why, n]) => `${n} × ${why}`).join(' · ')}
                  </div>
                )}
                <div className="imp-review-filters">
                  {/* The counts are the WHOLE file; the table below is a sample
                      of each group (see previewImport). Saying so on the chip is
                      what stops "20 cannot import" reading as a lie when four
                      are listed. */}
                  {[['all', 'All'], ['new', `New ${counts.new}`], ['alreadyOnFile', `Already on file ${counts.alreadyOnFile}`], ['repeatedInFile', `Repeated ${counts.repeatedInFile}`], ['unusable', `Cannot import ${counts.unusable}`]].map(([k, label]) => (
                    <button key={k} className={'imp-fchip ' + k + (filterStatus === k ? ' on' : '')} onClick={() => setFilterStatus(k)}>{label}</button>
                  ))}
                </div>
                <div className="tbl-scroll imp-review-tbl">
                  <table className="tbl">
                    <thead>
                      <tr>
                        <th>Row</th><th>Status</th>
                        {reviewCols.map(f => <th key={f.key}>{f.label}</th>)}
                        <th>What happens</th>
                      </tr>
                    </thead>
                    <tbody>
                      {shown.map(r => (
                        <tr key={r.rowNo}>
                          <td className="cell-quiet mono-num">{r.rowNo}</td>
                          <td>
                            {r.status === 'new' && <span className="imp-badge new">New</span>}
                            {r.status === 'alreadyOnFile' && <span className="imp-badge dup">On file</span>}
                            {r.status === 'repeatedInFile' && <span className="imp-badge dup">Repeat</span>}
                            {r.status === 'unusable' && <span className="imp-badge skip">Skip</span>}
                          </td>
                          {reviewCols.map(f => <td key={f.key} className={f.key === 'phone' ? 'mono-num' : undefined}>{String(r.raw?.[mapping[f.key]] ?? '—') || '—'}</td>)}
                          <td className="cell-quiet">{r.status === 'new' ? 'Create new' : (r.reason || 'Skipped')}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {/* What this table is: a sample, and of what. */}
                <div className="imp-unmapped">
                  {(() => {
                    const inGroup = filterStatus === 'all' ? counts.total
                      : filterStatus === 'new' ? counts.new
                      : filterStatus === 'alreadyOnFile' ? counts.alreadyOnFile
                      : filterStatus === 'repeatedInFile' ? counts.repeatedInFile : counts.unusable
                    return shown.length < inGroup
                      ? `Showing ${shown.length} of ${inGroup}. Every row is checked — the counts above cover the whole file, and after the import you can download every row that did not land.`
                      : `Showing all ${inGroup}.`
                  })()}
                </div>
              </Panel>
            )}

            {/* STEP 5 — the run, and what it did */}
            {step === 'done' && job && (
              <Panel>
                <div className="imp-done">
                  <span className="imp-done-ic">
                    {done ? <Icon name="check" size={26} /> : <Icon name="refresh" size={26} />}
                  </span>
                  <div className="imp-done-t">
                    {job.status === 'done' ? 'Import complete'
                      : job.status === 'failed' ? 'The import stopped'
                        : job.status === 'reverted' ? 'Import undone'
                          : 'Importing…'}
                  </div>
                  <div className="imp-done-d">
                    <b>{job.added}</b> of {job.total} saved
                    {job.skipped ? <> · <b>{job.skipped}</b> skipped</> : null}
                    {job.failed ? <> · <b>{job.failed}</b> failed</> : null}
                  </div>
                  {job.status === 'running' && (
                    <div className="imp-counts"><span className="imp-count new">You can close this page — it keeps going</span></div>
                  )}
                  {job.error && <div className="imp-error">{job.error}</div>}
                  <div className="imp-done-actions">
                    {(job.skipped > 0 || job.failed > 0) && (
                      <Button variant="secondary" size="sm" onClick={() => downloadSkipped(job.id)}>Download the rows that did not import</Button>
                    )}
                    {job.status === 'done' && (
                      <Button variant="secondary" size="sm" onClick={() => undo(job.id, job.added)}>Undo this import</Button>
                    )}
                    <Button variant="secondary" size="sm" onClick={restart}>Import another file</Button>
                    <Button variant="primary" size="sm" onClick={() => { reloadHistory(); setTab('history') }}>View history</Button>
                  </div>
                </div>
              </Panel>
            )}
          </div>
        )}

        {/* HISTORY — from the server, so it is the same on every device */}
        {tab === 'history' && (
          <div className="imp-wrap">
            {(history || []).length === 0 ? (
              <div className="empty">
                <div className="e-t">No imports yet</div>
                <div className="e-s">Run an import to see what it did, and to undo it.</div>
                <Button variant="primary" size="sm" onClick={() => { restart(); setTab('import') }}>Start an import</Button>
              </div>
            ) : history.map(log => (
              <Panel key={log.id}>
                <div className="imp-log-head">
                  <div>
                    <div className="imp-log-title">{log.fileName || 'Spreadsheet'} <span className="imp-log-mod">{KIND_LABEL[log.kind] || log.kind}</span></div>
                    <div className="imp-log-meta">
                      {new Date(log.createdAt).toLocaleString()}
                      {log.sheetName ? ` · sheet "${log.sheetName}"` : ''}
                    </div>
                  </div>
                  {log.status === 'done' ? (
                    <button className="btn btn-ghost btn-sm imp-revert" onClick={() => undo(log.id, log.added)}><Icon name="refresh" size={13} />Undo import</button>
                  ) : log.status === 'reverted' ? <span className="imp-reverted">Undone</span>
                    : <span className="imp-reverted">{log.status}</span>}
                </div>
                <div className="imp-log-stats">
                  <span className="imp-count new">+{log.added} created</span>
                  {log.skipped > 0 && <span className="imp-count dup">{log.skipped} skipped</span>}
                  {log.failed > 0 && <span className="imp-count skip">{log.failed} failed</span>}
                  {(log.skipped > 0 || log.failed > 0) && (
                    <button className="btn btn-quiet btn-sm" onClick={() => downloadSkipped(log.id)}>Download those rows</button>
                  )}
                </div>
                {log.error && <div className="imp-error">{log.error}</div>}
              </Panel>
            ))}
          </div>
        )}
      </ListLayout>
    </>
  )
}
