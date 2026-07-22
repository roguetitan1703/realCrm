import { useState, useEffect } from 'react'
import Icon from '../components/Icon.jsx'
import { Button, Panel, PageHeader } from '../components/primitives.jsx'
import { ListLayout } from '../layouts/layouts.jsx'
import {
  PROPERTY_FIELDS, LEAD_FIELDS, GROUP_LABEL,
  parseSpreadsheet, guessMapping, readField,
  normPhone, splitUnit, moneyLabel,
} from '../lib/importSchema.js'

// Guided import wizard: Choose → Upload → Map → Review → Done. The parsing,
// dedup and revert logic is unchanged; the flow is a proper stepped experience.
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

export default function ImportPage({ store, go, sel, topBar }) {
  const [tab, setTab] = useState('import') // 'import' | 'history'
  const [kind, setKind] = useState(sel?.kind || null) // null until chosen | 'clients' | 'properties'
  const [step, setStep] = useState('choose') // choose | upload | map | review | done
  const [fileMeta, setFileMeta] = useState(null)
  const [parsedRows, setParsedRows] = useState([])
  const [headers, setHeaders] = useState([])
  const [mapping, setMapping] = useState({})
  const [showAllFields, setShowAllFields] = useState(false)
  const [filterStatus, setFilterStatus] = useState('all')
  const [importProject, setImportProject] = useState('') // properties: land the whole file under one project
  const [error, setError] = useState(null)
  const [importing, setImporting] = useState(false)
  const [lastBatchId, setLastBatchId] = useState(null)
  const [importStats, setImportStats] = useState(null)

  useEffect(() => {
    if (sel?.kind === 'clients' || sel?.kind === 'properties') { setKind(sel.kind); setStep('upload') }
  }, [sel?.kind])

  const chooseKind = (k) => { setKind(k); setStep('upload'); setError(null) }
  const restart = () => { setKind(null); setStep('choose'); setParsedRows([]); setHeaders([]); setFileMeta(null); setError(null); setImportStats(null) }

  const FIELDS = kind === 'clients' ? LEAD_FIELDS : PROPERTY_FIELDS

  const handleFile = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setFileMeta({ name: file.name, size: Math.round(file.size / 1024) + ' KB' })
    setError(null)
    try {
      const { headers: cols, rows, sheetName, sheetCount } = await parseSpreadsheet(file)
      if (!rows.length) { setError('That file has headers but no data rows.'); return }
      setHeaders(cols)
      setMapping(guessMapping(cols, FIELDS))
      setParsedRows(rows)
      setShowAllFields(false)
      if (sheetName) setFileMeta(f => ({ ...f, sheetName, sheetCount }))
      setStep('map')
    } catch (err) {
      setError('Could not read this file: ' + err.message)
    }
  }

  const intoProject = importProject.trim()

  // Read every mapped field, then shape it into the record the app really
  // stores — so a rich sheet lands rich, instead of collapsing to four columns.
  const previewRows = parsedRows.map((row) => {
    const v = {}
    FIELDS.forEach(f => { const got = readField(row, mapping, f); if (got !== null) v[f.key] = got })

    if (kind === 'clients') {
      if (!v.name && !v.phone) return { status: 'invalid', reason: 'No name and no phone', row }
      const name = (v.name || 'Imported lead').replace(/^[*(]+/, '').trim()
      const phone = v.phone
      if (!phone) return { status: 'invalid', reason: 'Phone is missing or too short', row, name }
      const key = normPhone(phone)
      const dup = store.state.leads.find(l => normPhone(l.phone) === key)
      const record = {
        name, phone, email: v.email || undefined,
        source: v.source || 'Spreadsheet import',
        stage: v.stage || 'New',
        req: {
          deal: v.deal || 'sale',
          locality: v.locality || '',
          config: v.config || '',
          minBudget: v.minBudget || undefined,
          maxBudget: v.maxBudget || undefined,
          budget: [moneyLabel(v.minBudget), moneyLabel(v.maxBudget)].filter(Boolean).join(' - ') || '',
          purpose: v.purpose || undefined,
          timeline: v.timeline || undefined,
          notes: v.notes || undefined,
        },
      }
      return { status: dup ? 'duplicate' : 'new', dupTarget: dup?.name || null, record, label: name, sub: phone, locality: v.locality || '—' }
    }

    // Properties. A row is a unit; the project can come from a column or from
    // the "import into project" box applied to the whole file.
    let unitRaw = v.title
    if (!unitRaw && headers.length) unitRaw = String(row[headers[0]] || '').trim()
    if (!unitRaw) return { status: 'invalid', reason: 'No unit / listing name', row }

    const project = intoProject || v.project || unitRaw
    const parsed = splitUnit(unitRaw)
    const wing = v.wing || parsed.wing || undefined
    const flat = parsed.flat || unitRaw
    const title = [project, wing && `Wing ${wing}`, flat !== project ? flat : null].filter(Boolean).join(' - ')

    // Dedup on the thing that is actually unique: a unit inside a project.
    const dupKey = `${project}|${wing || ''}|${flat}`.toLowerCase()
    const dup = store.state.properties.find(p =>
      `${p.project || p.society || ''}|${p.wing || p.tower || ''}|${p.flat || p.unit || ''}`.toLowerCase() === dupKey)

    const record = {
      title,
      society: project, project,
      wing, tower: wing, flat, unit: flat,
      type: v.type || '2 BHK Apartment',
      deal: v.deal || 'sale',
      locality: v.locality || 'Pune',
      price: v.price || undefined,
      priceLabel: moneyLabel(v.price) || undefined,
      status: v.status || 'Available',
      carpet: v.carpet || undefined,
      area: v.carpet || undefined,
      sqftLabel: v.carpet ? `${Number(v.carpet).toLocaleString('en-IN')} sqft carpet` : undefined,
      floor: v.floor || undefined,
      totalFloors: v.totalFloors || undefined,
      facing: v.facing || undefined,
      furnishing: v.furnishing || undefined,
      parking: v.parking || undefined,
      possession: v.possession || undefined,
      age: v.age !== undefined ? v.age : undefined,
      builder: v.builder || undefined,
      rera: v.rera || undefined,
      owner: v.owner || undefined,
      ownerPhone: v.ownerPhone || undefined,
      ownerEmail: v.ownerEmail || undefined,
      highlights: v.notes ? [v.notes] : undefined,
    }
    return {
      status: dup ? 'duplicate' : 'new',
      dupTarget: dup ? (dup.title || dup.society) : null,
      record, label: title, sub: moneyLabel(v.price) || '—', locality: v.locality || '—',
    }
  })

  // How much of each row actually survived the mapping — the honest answer to
  // "is my data coming across, or just the name?"
  const mappedCount = new Set(Object.values(mapping).filter(Boolean)).size
  const unmappedHeaders = headers.filter(h => !Object.values(mapping).includes(h))

  const newCount = previewRows.filter(r => r.status === 'new').length
  const dupCount = previewRows.filter(r => r.status === 'duplicate').length
  const invalidCount = previewRows.filter(r => r.status === 'invalid').length
  const filteredRows = previewRows.filter(r => filterStatus === 'all' || r.status === filterStatus)

  const handleConfirm = async () => {
    if (!parsedRows.length) return
    setImporting(true)
    const batchId = 'imp_' + Date.now()
    let added = 0, merged = 0; const mergedDetails = []
    try {
      for (const pr of previewRows) {
        if (pr.status === 'invalid') continue
        const rec = { ...pr.record, importBatchId: batchId }
        if (kind === 'clients') await store.addLead(rec)
        else await store.addProperty(rec)
        if (pr.status === 'duplicate') { merged++; mergedDetails.push(`${pr.label} merged into existing record — ${pr.dupTarget}`) } else added++
      }
      store.logImportBatch({ batchId, timestamp: Date.now(), fileName: fileMeta?.name || 'import', module: kind === 'clients' ? 'Leads & Contacts' : 'Properties', addedCount: added, mergedCount: merged, mergedDetails, reverted: false })
      setLastBatchId(batchId); setImportStats({ added, merged, invalid: invalidCount, mergedDetails }); setStep('done'); setImporting(false)
    } catch (err) { setError('Import failed while saving: ' + err.message); setImporting(false) }
  }

  const handleRevert = (id) => { if (id) store.revertImportBatch(id) }
  const importLogs = store.state.importLogs || []

  const kpis = [
    { label: 'Imports run', value: importLogs.length },
    { label: 'Active batches', value: importLogs.filter(l => !l.reverted).length, tone: 'accent' },
  ]

  const toolbar = (
    <div className="imp-tabs">
      <button className={'imp-tab' + (tab === 'import' ? ' on' : '')} onClick={() => setTab('import')}>New import</button>
      <button className={'imp-tab' + (tab === 'history' ? ' on' : '')} onClick={() => setTab('history')}>History{importLogs.length ? ` · ${importLogs.length}` : ''}</button>
    </div>
  )

  // Core fields always show; the rest collapse so the required mapping isn't
  // buried under twenty selects — but they're one click away, not absent.
  const visibleFields = showAllFields ? FIELDS : FIELDS.filter(f => f.group === 'key')
  const groups = visibleFields.reduce((acc, f) => {
    (acc[f.group] = acc[f.group] || []).push(f)
    return acc
  }, {})
  const sampleOf = (col) => {
    if (!col) return null
    const hit = parsedRows.find(r => String(r[col] ?? '').trim() !== '')
    return hit ? String(hit[col]).slice(0, 28) : null
  }

  return (
    <>
      {topBar({ title: 'Import' })}
      <PageHeader kpis={kpis} />
      <ListLayout toolbar={toolbar}>
        {tab === 'import' && (
          <div className="imp-wrap">
            <Panel><WizardSteps step={{ choose: 'Choose', upload: 'Upload', map: 'Map', review: 'Review', done: 'Done' }[step]} /></Panel>

            {/* STEP 1 — choose what to import */}
            {step === 'choose' && (
              <Panel>
                <div className="imp-choose-head">What are you importing?</div>
                <div className="imp-choose-sub">Pick the record type. We'll match your columns and flag duplicates before anything is saved.</div>
                <div className="imp-choose-grid">
                  <button className="imp-choice" onClick={() => chooseKind('clients')}>
                    <span className="imp-choice-ic"><Icon name="leads" size={24} /></span>
                    <span className="imp-choice-t">Leads & contacts</span>
                    <span className="imp-choice-d">Buyers, tenants and enquiries — with budget, locality and requirement. Deduplicated by phone.</span>
                  </button>
                  <button className="imp-choice" onClick={() => chooseKind('properties')}>
                    <span className="imp-choice-ic"><Icon name="building" size={24} /></span>
                    <span className="imp-choice-t">Properties</span>
                    <span className="imp-choice-d">Units and listings — carpet, floor, facing, owner, price. Deduplicated per unit inside a project.</span>
                  </button>
                </div>
              </Panel>
            )}

            {/* STEP 2 — upload */}
            {step === 'upload' && (
              <Panel>
                <div className="imp-bar">
                  <div className="imp-step-title">Upload your file <span className="imp-target">{kind === 'clients' ? 'Leads & contacts' : 'Properties'}</span></div>
                  <button className="btn btn-quiet btn-sm" onClick={restart}>Change type</button>
                </div>
                {error && <div className="imp-error">{error}</div>}
                <label className="imp-drop">
                  <input type="file" accept=".csv,.tsv,.txt,.xlsx,.xlsm,.xls,.ods" onChange={handleFile} className="imp-file" />
                  <span className="imp-drop-ic"><Icon name="layers" size={26} /></span>
                  <span className="imp-drop-t">Drop your Excel or CSV here, or click to browse</span>
                  <span className="imp-drop-d">.xlsx, .xls, .csv or tab-separated. Columns are matched for you, duplicates are flagged, and nothing saves until you confirm.</span>
                </label>
              </Panel>
            )}

            {/* STEP 3 — map columns */}
            {step === 'map' && (
              <Panel>
                <div className="imp-bar">
                  <div className="imp-step-title">Match your columns <span className="imp-target">
                    {parsedRows.length} rows · {headers.length} columns · {fileMeta?.name}
                    {fileMeta?.sheetName ? ` · sheet "${fileMeta.sheetName}"` : ''}
                  </span></div>
                  <div className="imp-bar-actions">
                    <Button variant="secondary" size="sm" onClick={() => setStep('upload')}>Back</Button>
                    <Button variant="primary" size="sm" disabled={newCount + dupCount === 0} onClick={() => setStep('review')}>Continue to review</Button>
                  </div>
                </div>
                {kind === 'properties' && (
                  <div className="imp-project">
                    <label className="imp-map-label">Import into project <span className="imp-map-hint">optional — groups every row as a unit of one township/society</span></label>
                    <input className="input" value={importProject} onChange={e => setImportProject(e.target.value)}
                      placeholder="e.g. Godrej Riverside — leave blank to import as independent listings" list="imp-proj-list" />
                    <datalist id="imp-proj-list">
                      {[...new Set(store.state.properties.map(p => p.project || p.society).filter(Boolean))].map(n => <option key={n} value={n} />)}
                    </datalist>
                  </div>
                )}
                <div className="imp-map-groups">
                {Object.keys(groups).map(g => (
                  <div key={g}>
                    {showAllFields && <div className="imp-map-group">{GROUP_LABEL[g]}</div>}
                    <div className="imp-map-grid">
                      {groups[g].map(f => {
                        const sample = sampleOf(mapping[f.key])
                        return (
                          <div key={f.key} className="imp-map-field">
                            <label className="imp-map-label">
                              {f.label} <span className="imp-map-hint">{f.required ? '— required' : '— optional'}</span>
                            </label>
                            <select className="input" value={mapping[f.key] || ''} onChange={e => setMapping({ ...mapping, [f.key]: e.target.value })}>
                              <option value="">— Not mapped —</option>
                              {headers.map(h => <option key={h} value={h}>{h}</option>)}
                            </select>
                            <span className="imp-map-sample">{sample ? `e.g. ${sample}` : 'No column matched'}</span>
                          </div>
                        )
                      })}
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

                <div className="imp-counts">
                  <span className="imp-count new">{newCount} new</span>
                  <span className="imp-count dup">{dupCount} duplicate{dupCount === 1 ? '' : 's'} to merge</span>
                  <span className="imp-count skip">{invalidCount} will be skipped</span>
                  <span className="imp-count" style={{ marginLeft: 'auto' }}>{mappedCount} of {headers.length} columns mapped</span>
                </div>
                {unmappedHeaders.length > 0 && (
                  <div className="imp-unmapped">
                    Not imported: {unmappedHeaders.join(', ')}. Map them above if they matter.
                  </div>
                )}
              </Panel>
            )}

            {/* STEP 4 — review */}
            {step === 'review' && (
              <Panel>
                <div className="imp-bar">
                  <div className="imp-step-title">Review & confirm</div>
                  <div className="imp-bar-actions">
                    <Button variant="secondary" size="sm" onClick={() => setStep('map')}>Back</Button>
                    <Button variant="primary" size="sm" disabled={importing || (newCount + dupCount === 0)} onClick={handleConfirm}>
                      {importing ? 'Importing…' : `Import ${newCount + dupCount} record${newCount + dupCount === 1 ? '' : 's'}`}
                    </Button>
                  </div>
                </div>
                <div className="imp-review-filters">
                  {[['all', `All ${previewRows.length}`], ['new', `New ${newCount}`], ['duplicate', `Merge ${dupCount}`], ['invalid', `Skip ${invalidCount}`]].map(([k, label]) => (
                    <button key={k} className={'imp-fchip ' + k + (filterStatus === k ? ' on' : '')} onClick={() => setFilterStatus(k)}>{label}</button>
                  ))}
                </div>
                <div className="tbl-scroll imp-review-tbl">
                  <table className="tbl">
                    <thead>
                      <tr>
                        <th>Status</th>
                        <th>{kind === 'clients' ? 'Name' : 'Unit'}</th>
                        <th>{kind === 'clients' ? 'Phone' : 'Price'}</th>
                        <th>Locality</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredRows.map((pr, i) => (
                        <tr key={i}>
                          <td>
                            {pr.status === 'new' && <span className="imp-badge new">New</span>}
                            {pr.status === 'duplicate' && <span className="imp-badge dup">Merge</span>}
                            {pr.status === 'invalid' && <span className="imp-badge skip">Skip</span>}
                          </td>
                          <td className="name">{pr.label || '—'}</td>
                          <td className="mono-num">{pr.sub || '—'}</td>
                          <td>{pr.locality || '—'}</td>
                          <td className="cell-quiet">{pr.dupTarget ? `Merges into ${pr.dupTarget}` : pr.status === 'invalid' ? (pr.reason || 'Skipped') : 'Create new'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Panel>
            )}

            {/* STEP 5 — done */}
            {step === 'done' && (
              <Panel>
                <div className="imp-done">
                  <span className="imp-done-ic"><Icon name="check" size={26} /></span>
                  <div className="imp-done-t">Import complete</div>
                  <div className="imp-done-d">Created <b>{importStats?.added || 0}</b> new record{importStats?.added === 1 ? '' : 's'} and merged <b>{importStats?.merged || 0}</b>.</div>
                  {importStats?.mergedDetails?.length > 0 && (
                    <div className="imp-merge-log">
                      <div className="imp-merge-h">Merged records</div>
                      {importStats.mergedDetails.map((m, i) => <div key={i} className="imp-merge-row">{m}</div>)}
                    </div>
                  )}
                  <div className="imp-done-actions">
                    <Button variant="secondary" size="sm" onClick={() => handleRevert(lastBatchId)}>Undo this import</Button>
                    <Button variant="secondary" size="sm" onClick={restart}>Import another file</Button>
                    <Button variant="primary" size="sm" onClick={() => setTab('history')}>View history</Button>
                  </div>
                </div>
              </Panel>
            )}
          </div>
        )}

        {/* HISTORY tab */}
        {tab === 'history' && (
          <div className="imp-wrap">
            {importLogs.length === 0 ? (
              <div className="empty">
                <div className="e-t">No imports yet</div>
                <div className="e-s">Run an import to see the log and revert options here.</div>
                <Button variant="primary" size="sm" onClick={() => { restart(); setTab('import') }}>Start an import</Button>
              </div>
            ) : importLogs.map(log => (
              <Panel key={log.batchId}>
                <div className="imp-log-head">
                  <div>
                    <div className="imp-log-title">{log.fileName} <span className="imp-log-mod">{log.module}</span></div>
                    <div className="imp-log-meta">Imported {new Date(log.timestamp).toLocaleString()}</div>
                  </div>
                  {!log.reverted ? (
                    <button className="btn btn-ghost btn-sm imp-revert" onClick={() => { if (window.confirm(`Undo this import? All ${log.addedCount} records added from "${log.fileName}" will be removed.`)) handleRevert(log.batchId) }}><Icon name="refresh" size={13} />Undo import</button>
                  ) : <span className="imp-reverted">Undone</span>}
                </div>
                <div className="imp-log-stats">
                  <span className="imp-count new">+{log.addedCount} created</span>
                  <span className="imp-count dup">{log.mergedCount} merged</span>
                </div>
                {log.mergedDetails?.length > 0 && (
                  <div className="imp-merge-log">
                    <div className="imp-merge-h">Merge audit — {log.mergedDetails.length} record{log.mergedDetails.length === 1 ? '' : 's'}</div>
                    {log.mergedDetails.map((m, i) => <div key={i} className="imp-merge-row">{m}</div>)}
                  </div>
                )}
              </Panel>
            ))}
          </div>
        )}
      </ListLayout>
    </>
  )
}
