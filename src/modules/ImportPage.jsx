import { useState, useEffect } from 'react'
import Icon from '../components/Icon.jsx'
import { Button, Panel, PageHeader } from '../components/primitives.jsx'
import { ListLayout } from '../layouts/layouts.jsx'

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
  const [mapping, setMapping] = useState({ name: '', phone: '', locality: '', config: '', budget: '', title: '', price: '', type: '' })
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

  const handleFile = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setFileMeta({ name: file.name, size: Math.round(file.size / 1024) + ' KB' })
    const reader = new FileReader()
    reader.onload = (evt) => {
      try {
        const text = evt.target.result
        const lines = text.split(/\r?\n/).filter(line => line.trim())
        if (lines.length < 2) { setError('This file needs a header row and at least one data row.'); return }
        const parseCSVLine = (str) => {
          const res = []; let cur = ''; let q = false
          for (let i = 0; i < str.length; i++) {
            const ch = str[i]
            if (ch === '"') q = !q
            else if (ch === ',' && !q) { res.push(cur.trim().replace(/^"|"$/g, '')); cur = '' }
            else cur += ch
          }
          res.push(cur.trim().replace(/^"|"$/g, '')); return res
        }
        const cols = parseCSVLine(lines[0])
        const rows = lines.slice(1).map(line => {
          const vals = parseCSVLine(line); const obj = {}
          cols.forEach((h, idx) => { obj[h] = vals[idx] || '' }); return obj
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
        setMapping(guess); setParsedRows(rows); setError(null); setStep('map')
      } catch (err) { setError('Could not read this file: ' + err.message) }
    }
    reader.readAsText(file)
  }

  const intoProject = importProject.trim()
  const previewRows = parsedRows.map((row) => {
    if (kind === 'clients') {
      const nameRaw = mapping.name ? row[mapping.name] : ''
      const phoneRaw = mapping.phone ? row[mapping.phone] : ''
      if (!nameRaw && !phoneRaw) return { status: 'invalid', reason: 'Missing name & phone', row }
      const name = nameRaw ? nameRaw.replace(/^[*(]+/g, '').trim() : 'Imported lead'
      const phone = (phoneRaw && /^[+0-9\s-]{7,15}$/.test(phoneRaw.trim())) ? phoneRaw.trim() : '+919800000000'
      const dup = store.state.leads.find(l => l.phone === phone || (l.name && l.name.toLowerCase() === name.toLowerCase() && name.length > 3))
      return {
        status: dup ? 'duplicate' : 'new', dupTarget: dup ? dup.name : null, name, phone,
        locality: mapping.locality ? (row[mapping.locality] || 'Pune') : 'Pune',
        config: mapping.config ? (row[mapping.config] || '2 BHK') : '2 BHK',
        budget: mapping.budget ? (row[mapping.budget] || '1.2 Cr') : '1.2 Cr',
      }
    } else {
      // When importing INTO a project, the row is a unit — its label can come from
      // the mapped title OR simply the first column (a column of unit numbers).
      let titleRaw = mapping.title ? row[mapping.title] : ''
      if (!titleRaw && intoProject && headers.length) titleRaw = row[headers[0]] || ''
      if (!titleRaw) return { status: 'invalid', reason: intoProject ? 'Missing unit label' : 'Missing project title', row }
      const title = String(titleRaw).replace(/^[*(]+/g, '').trim()
      const dup = store.state.properties.find(p => (p.society && p.society.toLowerCase() === title.toLowerCase()) || (p.title && p.title.toLowerCase() === title.toLowerCase()))
      const priceNum = parseFloat(mapping.price ? row[mapping.price] : '')
      return {
        status: dup ? 'duplicate' : 'new', dupTarget: dup ? (dup.society || dup.title) : null, title,
        locality: mapping.locality ? (row[mapping.locality] || 'Pune') : 'Pune',
        type: mapping.type ? (row[mapping.type] || '2 BHK') : '2 BHK',
        price: (!isNaN(priceNum) && priceNum > 0) ? priceNum : 95,
      }
    }
  })

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
        if (kind === 'clients') {
          await store.addLead({ name: pr.name, phone: pr.phone, source: 'CSV Import', req: { locality: pr.locality, config: pr.config, budget: pr.budget }, budget: pr.budget, stage: 'New', importBatchId: batchId })
          if (pr.status === 'duplicate') { merged++; mergedDetails.push(`${pr.name} (${pr.phone}) merged into existing lead — ${pr.dupTarget}`) } else added++
        } else {
          const proj = importProject.trim()
          // When importing into a named project, each row is a unit — parse its label
          // (e.g. "A-1201" → wing A, flat 1201) so it slots under the right wing.
          const rec = { title: pr.title, locality: pr.locality, type: pr.type, price: pr.price, status: 'Available', importBatchId: batchId }
          if (proj) {
            const m = String(pr.title).match(/^([A-Za-z]+)[\s-]?(\d.*)$/)
            rec.society = proj; rec.project = proj
            rec.wing = m ? m[1].toUpperCase() : undefined
            rec.flat = m ? m[2] : pr.title
          } else {
            rec.society = pr.title; rec.project = pr.title
          }
          await store.addProperty(rec)
          if (pr.status === 'duplicate') { merged++; mergedDetails.push(`"${pr.title}" updated existing listing — ${pr.dupTarget}`) } else added++
        }
      }
      store.logImportBatch({ batchId, timestamp: Date.now(), fileName: fileMeta?.name || 'import.csv', module: kind === 'clients' ? 'Leads & Contacts' : 'Properties', addedCount: added, mergedCount: merged, mergedDetails, reverted: false })
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

  const clientFields = [
    { key: 'name', label: 'Name', hint: '— required' },
    { key: 'phone', label: 'Phone', hint: '— required' },
    { key: 'locality', label: 'Locality', hint: '— optional' },
    { key: 'budget', label: 'Budget', hint: '— optional' },
  ]
  const propFields = [
    intoProject
      ? { key: 'title', label: 'Unit label / no.', hint: '— defaults to the first column' }
      : { key: 'title', label: 'Project / society', hint: '— required' },
    { key: 'price', label: 'Price', hint: '— optional' },
    { key: 'locality', label: 'Locality', hint: '— optional' },
    { key: 'type', label: 'Configuration', hint: '— optional' },
  ]
  const mapFields = kind === 'clients' ? clientFields : propFields

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
                    <span className="imp-choice-d">Buyers, tenants and enquiries. Deduplicated by phone.</span>
                  </button>
                  <button className="imp-choice" onClick={() => chooseKind('properties')}>
                    <span className="imp-choice-ic"><Icon name="building" size={24} /></span>
                    <span className="imp-choice-t">Properties</span>
                    <span className="imp-choice-d">Listings and inventory. Deduplicated by project name.</span>
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
                  <input type="file" accept=".csv,.txt" onChange={handleFile} className="imp-file" />
                  <span className="imp-drop-ic"><Icon name="layers" size={26} /></span>
                  <span className="imp-drop-t">Drop your .csv here, or click to browse</span>
                  <span className="imp-drop-d">Duplicates are detected automatically — you'll review everything before it's saved.</span>
                </label>
              </Panel>
            )}

            {/* STEP 3 — map columns */}
            {step === 'map' && (
              <Panel>
                <div className="imp-bar">
                  <div className="imp-step-title">Match your columns <span className="imp-target">{parsedRows.length} rows · {fileMeta?.name}</span></div>
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
                <div className="imp-map-grid">
                  {mapFields.map(f => (
                    <div key={f.key} className="imp-map-field">
                      <label className="imp-map-label">{f.label} <span className="imp-map-hint">{f.hint}</span></label>
                      <select className="input" value={mapping[f.key]} onChange={e => setMapping({ ...mapping, [f.key]: e.target.value })}>
                        <option value="">— Not mapped —</option>
                        {headers.map(h => <option key={h} value={h}>{h}</option>)}
                      </select>
                    </div>
                  ))}
                </div>
                <div className="imp-counts">
                  <span className="imp-count new">{newCount} new</span>
                  <span className="imp-count dup">{dupCount} duplicate{dupCount === 1 ? '' : 's'} to merge</span>
                  <span className="imp-count skip">{invalidCount} will be skipped</span>
                </div>
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
                        <th>{kind === 'clients' ? 'Name' : 'Society / project'}</th>
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
                          <td className="name">{pr.name || pr.title || '—'}</td>
                          <td className="mono-num">{pr.phone || pr.price || '—'}</td>
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
