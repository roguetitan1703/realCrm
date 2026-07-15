import { useState, useEffect } from 'react'
import Icon from '../components/Icon.jsx'
import { Button, Segmented, Panel, SectionHead } from '../components/primitives.jsx'
import { ListLayout } from '../layouts/layouts.jsx'

export default function ImportPage({ store, go, sel, topBar }) {
  const [tab, setTab] = useState('import') // 'import' | 'history'
  const [kind, setKind] = useState(sel?.kind || 'clients') // 'clients' | 'properties'
  const [step, setStep] = useState('upload') // 'upload' | 'preview' | 'done'
  const [fileMeta, setFileMeta] = useState(null)
  const [parsedRows, setParsedRows] = useState([])
  const [headers, setHeaders] = useState([])
  const [mapping, setMapping] = useState({ name: '', phone: '', locality: '', config: '', budget: '', title: '', price: '', type: '' })
  const [filterStatus, setFilterStatus] = useState('all') // 'all' | 'new' | 'duplicate' | 'invalid'
  const [error, setError] = useState(null)
  const [importing, setImporting] = useState(false)
  const [lastBatchId, setLastBatchId] = useState(null)
  const [importStats, setImportStats] = useState(null)

  useEffect(() => {
    if (sel?.kind && (sel.kind === 'clients' || sel.kind === 'properties')) {
      setKind(sel.kind)
    }
  }, [sel?.kind])

  const handleFile = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setFileMeta({ name: file.name, size: Math.round(file.size / 1024) + ' KB' })
    const reader = new FileReader()
    reader.onload = (evt) => {
      try {
        const text = evt.target.result
        const lines = text.split(/\r?\n/).filter(line => line.trim())
        if (lines.length < 2) {
          setError('File must contain a header row and at least one data row.')
          return
        }
        const parseCSVLine = (str) => {
          const res = []
          let cur = ''
          let inQuotes = false
          for (let i = 0; i < str.length; i++) {
            const ch = str[i]
            if (ch === '"') inQuotes = !inQuotes
            else if (ch === ',' && !inQuotes) {
              res.push(cur.trim().replace(/^"|"$/g, ''))
              cur = ''
            } else {
              cur += ch
            }
          }
          res.push(cur.trim().replace(/^"|"$/g, ''))
          return res
        }
        const cols = parseCSVLine(lines[0])
        const rows = lines.slice(1).map(line => {
          const vals = parseCSVLine(line)
          const obj = {}
          cols.forEach((h, idx) => { obj[h] = vals[idx] || '' })
          return obj
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
        setMapping(guess)
        setParsedRows(rows)
        setError(null)
        setStep('preview')
      } catch (err) {
        setError('Failed to parse file: ' + err.message)
      }
    }
    reader.readAsText(file)
  }

  const previewRows = parsedRows.map((row) => {
    if (kind === 'clients') {
      const nameRaw = mapping.name ? row[mapping.name] : ''
      const phoneRaw = mapping.phone ? row[mapping.phone] : ''
      if (!nameRaw && !phoneRaw) return { status: 'invalid', reason: 'Missing Name/Phone', row }
      const name = nameRaw ? nameRaw.replace(/^[*(]+/g, '').trim() : 'Imported Lead'
      const phone = (phoneRaw && /^[+0-9\s-]{7,15}$/.test(phoneRaw.trim())) ? phoneRaw.trim() : '+919800000000'
      const dup = store.state.leads.find(l => l.phone === phone || (l.name && l.name.toLowerCase() === name.toLowerCase() && name.length > 3))
      return {
        status: dup ? 'duplicate' : 'new',
        dupTarget: dup ? dup.name : null,
        name, phone,
        locality: mapping.locality ? (row[mapping.locality] || 'Pune HQ') : 'Pune HQ',
        config: mapping.config ? (row[mapping.config] || '2 BHK') : '2 BHK',
        budget: mapping.budget ? (row[mapping.budget] || '1.2 Cr') : '1.2 Cr',
      }
    } else {
      const titleRaw = mapping.title ? row[mapping.title] : ''
      if (!titleRaw) return { status: 'invalid', reason: 'Missing Project Title', row }
      const title = titleRaw.replace(/^[*(]+/g, '').trim()
      const dup = store.state.properties.find(p => (p.society && p.society.toLowerCase() === title.toLowerCase()) || (p.title && p.title.toLowerCase() === title.toLowerCase()))
      const priceRaw = mapping.price ? row[mapping.price] : ''
      const priceNum = parseFloat(priceRaw)
      return {
        status: dup ? 'duplicate' : 'new',
        dupTarget: dup ? (dup.society || dup.title) : null,
        title,
        locality: mapping.locality ? (row[mapping.locality] || 'Pune HQ') : 'Pune HQ',
        type: mapping.type ? (row[mapping.type] || '2 BHK') : '2 BHK',
        price: (!isNaN(priceNum) && priceNum > 0) ? priceNum : 95,
      }
    }
  })

  const newCount = previewRows.filter(r => r.status === 'new').length
  const dupCount = previewRows.filter(r => r.status === 'duplicate').length
  const invalidCount = previewRows.filter(r => r.status === 'invalid').length

  const filteredPreviewRows = previewRows.filter(r => {
    if (filterStatus === 'all') return true
    return r.status === filterStatus
  })

  const handleConfirm = async () => {
    if (!parsedRows.length) return
    setImporting(true)
    const batchId = 'imp_' + Date.now()
    let added = 0, merged = 0
    const mergedDetails = []
    try {
      for (const pr of previewRows) {
        if (pr.status === 'invalid') continue
        if (kind === 'clients') {
          await store.addLead({
            name: pr.name, phone: pr.phone, source: 'CSV Import',
            req: { locality: pr.locality, config: pr.config, budget: pr.budget },
            budget: pr.budget, stage: 'New', importBatchId: batchId
          })
          if (pr.status === 'duplicate') {
            merged++
            mergedDetails.push(`${pr.name} (${pr.phone}) merged into existing lead [${pr.dupTarget}]`)
          } else added++
        } else {
          await store.addProperty({
            title: pr.title, locality: pr.locality, type: pr.type,
            price: pr.price, status: 'Available', importBatchId: batchId
          })
          if (pr.status === 'duplicate') {
            merged++
            mergedDetails.push(`Project "${pr.title}" updated existing inventory [${pr.dupTarget}]`)
          } else added++
        }
      }
      store.logImportBatch({
        batchId,
        timestamp: Date.now(),
        fileName: fileMeta?.name || 'bulk_import.csv',
        module: kind === 'clients' ? 'Leads & Clients' : 'Properties',
        addedCount: added,
        mergedCount: merged,
        mergedDetails,
        reverted: false,
      })
      setLastBatchId(batchId)
      setImportStats({ added, merged, invalid: invalidCount, mergedDetails })
      setStep('done')
      setImporting(false)
    } catch (err) {
      setError('Import failed during saving: ' + err.message)
      setImporting(false)
    }
  }

  const handleRevert = (batchIdToRevert) => {
    if (batchIdToRevert) {
      store.revertImportBatch(batchIdToRevert)
    }
  }

  const importLogs = store.state.importLogs || []

  const toolbar = (
    <div className="fb" style={{ justifyContent: 'space-between' }}>
      <Segmented
        value={tab}
        onChange={setTab}
        options={[
          { value: 'import', label: 'New Bulk Import' },
          { value: 'history', label: `Import Logs & Reverts (${importLogs.length})` },
        ]}
      />
      {tab === 'import' && (
        <Segmented
          value={kind}
          onChange={v => { setKind(v); setError(null) }}
          options={[
            { value: 'clients', label: 'Leads & Clients' },
            { value: 'properties', label: 'Properties' },
          ]}
        />
      )}
    </div>
  )

  return (
    <>
      {topBar({
        title: 'Import & Hygiene',
        count: tab === 'import' ? 'CSV ingestion & deduplication' : `${importLogs.length} historical batches`,
      })}

      <ListLayout toolbar={toolbar}>
        {tab === 'history' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {importLogs.length === 0 ? (
              <div className="empty">
                <div className="e-t">No import batches recorded</div>
                <div className="e-s">Run a bulk CSV import to view logs and revert options.</div>
                <Button variant="primary" size="sm" onClick={() => { setStep('upload'); setTab('import') }}>
                  Run New Import
                </Button>
              </div>
            ) : (
              importLogs.map((log) => (
                <Panel key={log.batchId}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 14 }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                        <span style={{ fontWeight: 700, fontSize: 15 }}>{log.fileName}</span>
                        <span style={{ fontSize: 11, fontWeight: 700, background: 'var(--chrome)', padding: '2px 8px', borderRadius: 6 }}>
                          {log.module}
                        </span>
                      </div>
                      <div className="u-muted" style={{ fontSize: 12.5 }}>
                        Imported on {new Date(log.timestamp).toLocaleString()} · Batch ID: <code>{log.batchId}</code>
                      </div>
                    </div>
                    <div>
                      {!log.reverted ? (
                        <Button
                          variant="secondary"
                          size="sm"
                          style={{ color: 'var(--danger, #dc2626)', borderColor: 'var(--danger-border, #fca5a5)' }}
                          onClick={() => {
                            if (window.confirm(`Revert and delete all ${log.addedCount} newly added records from "${log.fileName}"?`)) {
                              handleRevert(log.batchId)
                            }
                          }}
                        >
                          Revert Entire Import Batch
                        </Button>
                      ) : (
                        <span style={{ fontSize: 12, fontWeight: 700, background: 'var(--chrome)', color: 'var(--muted)', padding: '4px 12px', borderRadius: 99 }}>
                          Reverted (Records Removed)
                        </span>
                      )}
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: 14, fontSize: 13, marginTop: 12 }}>
                    <span style={{ color: 'var(--green, #166534)', fontWeight: 600 }}>✨ +{log.addedCount} Created</span>
                    <span style={{ color: 'var(--blue, #1e40af)', fontWeight: 600 }}>🔗 {log.mergedCount} Deduplicated / Merged</span>
                  </div>

                  {log.mergedDetails && log.mergedDetails.length > 0 && (
                    <div style={{ background: 'var(--chrome)', border: '1px solid var(--line)', padding: 12, borderRadius: 8, fontSize: 12.5, marginTop: 12 }}>
                      <div style={{ fontWeight: 700, color: 'var(--muted)', marginBottom: 6 }}>Merge Audit Trail ({log.mergedDetails.length} items):</div>
                      <div style={{ maxHeight: 180, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {log.mergedDetails.map((m, idx) => (
                          <div key={idx} style={{ color: 'var(--ink)' }}>
                            • {m}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </Panel>
              ))
            )}
          </div>
        )}

        {tab === 'import' && step === 'upload' && (
          <Panel>
            <SectionHead title="Upload CSV File" right={<span className="u-muted" style={{ fontSize: 12 }}>Target: {kind === 'clients' ? 'Leads & Clients' : 'Properties'}</span>} />
            {error && (
              <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', color: '#dc2626', padding: '10px 14px', borderRadius: 8, fontSize: 13, margin: '12px 0' }}>
                {error}
              </div>
            )}
            <label
              style={{
                width: '100%',
                minHeight: 220,
                border: '2px dashed var(--accent-line)',
                background: 'var(--accent-wash)',
                borderRadius: 12,
                padding: '36px 20px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 10,
                cursor: 'pointer',
                fontFamily: 'inherit',
                marginTop: 14,
              }}
            >
              <input type="file" accept=".csv,.txt" onChange={handleFile} style={{ display: 'none' }} />
              <div style={{ width: 52, height: 52, borderRadius: 14, background: 'var(--card)', border: '1px solid var(--accent-line)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent-ink)' }}>
                <Icon name="layers" size={26} />
              </div>
              <div style={{ fontWeight: 700, fontSize: 15 }}>Drop your .csv file here or click to browse</div>
              <div className="u-muted" style={{ fontSize: 12.5 }}>
                Automatic deduplication by phone number or project title
              </div>
            </label>
          </Panel>
        )}

        {tab === 'import' && step === 'preview' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <Panel>
              <SectionHead
                title={`Step 2: Map Columns & Verify (${previewRows.length} rows)`}
                right={
                  <div style={{ display: 'flex', gap: 8 }}>
                    <Button variant="secondary" size="sm" onClick={() => setStep('upload')}>Change file</Button>
                    <Button variant="primary" size="sm" disabled={importing || (newCount + dupCount === 0)} onClick={handleConfirm}>
                      {importing ? 'Ingesting...' : `Confirm & Import (${newCount + dupCount} rows)`}
                    </Button>
                  </div>
                }
              />
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10, marginTop: 14 }}>
                <div onClick={() => setFilterStatus('all')} style={{ background: filterStatus === 'all' ? 'var(--card)' : 'var(--chrome)', border: filterStatus === 'all' ? '2px solid var(--ink)' : '1px solid var(--line)', padding: 12, borderRadius: 8, cursor: 'pointer' }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)' }}>TOTAL ROWS</div>
                  <div style={{ fontSize: 20, fontWeight: 700, marginTop: 2 }}>{previewRows.length}</div>
                </div>
                <div onClick={() => setFilterStatus('new')} style={{ background: filterStatus === 'new' ? '#f0fdf4' : 'var(--chrome)', border: filterStatus === 'new' ? '2px solid #166534' : '1px solid var(--line)', padding: 12, borderRadius: 8, cursor: 'pointer' }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#166534' }}>✨ NEW</div>
                  <div style={{ fontSize: 20, fontWeight: 700, color: '#166534', marginTop: 2 }}>{newCount}</div>
                </div>
                <div onClick={() => setFilterStatus('duplicate')} style={{ background: filterStatus === 'duplicate' ? '#eff6ff' : 'var(--chrome)', border: filterStatus === 'duplicate' ? '2px solid #1e40af' : '1px solid var(--line)', padding: 12, borderRadius: 8, cursor: 'pointer' }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#1e40af' }}>🔗 DUPLICATES (MERGE)</div>
                  <div style={{ fontSize: 20, fontWeight: 700, color: '#1e40af', marginTop: 2 }}>{dupCount}</div>
                </div>
                <div onClick={() => setFilterStatus('invalid')} style={{ background: filterStatus === 'invalid' ? '#fef2f2' : 'var(--chrome)', border: filterStatus === 'invalid' ? '2px solid #dc2626' : '1px solid var(--line)', padding: 12, borderRadius: 8, cursor: 'pointer' }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#dc2626' }}>⚠️ SKIPPED</div>
                  <div style={{ fontSize: 20, fontWeight: 700, color: '#dc2626', marginTop: 2 }}>{invalidCount}</div>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginTop: 14 }}>
                {kind === 'clients' ? (
                  <>
                    <div>
                      <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>NAME COLUMN</label>
                      <select className="input" value={mapping.name} onChange={e => setMapping({ ...mapping, name: e.target.value })} style={{ width: '100%' }}>
                        <option value="">-- None --</option>
                        {headers.map(h => <option key={h} value={h}>{h}</option>)}
                      </select>
                    </div>
                    <div>
                      <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>PHONE COLUMN</label>
                      <select className="input" value={mapping.phone} onChange={e => setMapping({ ...mapping, phone: e.target.value })} style={{ width: '100%' }}>
                        <option value="">-- None --</option>
                        {headers.map(h => <option key={h} value={h}>{h}</option>)}
                      </select>
                    </div>
                    <div>
                      <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>LOCALITY COLUMN</label>
                      <select className="input" value={mapping.locality} onChange={e => setMapping({ ...mapping, locality: e.target.value })} style={{ width: '100%' }}>
                        <option value="">-- Default Pune HQ --</option>
                        {headers.map(h => <option key={h} value={h}>{h}</option>)}
                      </select>
                    </div>
                    <div>
                      <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>BUDGET COLUMN</label>
                      <select className="input" value={mapping.budget} onChange={e => setMapping({ ...mapping, budget: e.target.value })} style={{ width: '100%' }}>
                        <option value="">-- Default 1.2 Cr --</option>
                        {headers.map(h => <option key={h} value={h}>{h}</option>)}
                      </select>
                    </div>
                  </>
                ) : (
                  <>
                    <div>
                      <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>PROJECT TITLE</label>
                      <select className="input" value={mapping.title} onChange={e => setMapping({ ...mapping, title: e.target.value })} style={{ width: '100%' }}>
                        <option value="">-- Select --</option>
                        {headers.map(h => <option key={h} value={h}>{h}</option>)}
                      </select>
                    </div>
                    <div>
                      <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>PRICE COLUMN</label>
                      <select className="input" value={mapping.price} onChange={e => setMapping({ ...mapping, price: e.target.value })} style={{ width: '100%' }}>
                        <option value="">-- Default 95 L --</option>
                        {headers.map(h => <option key={h} value={h}>{h}</option>)}
                      </select>
                    </div>
                  </>
                )}
              </div>
            </Panel>

            <Panel>
              <div style={{ border: '1px solid var(--line)', borderRadius: 8, overflow: 'hidden', maxHeight: 420, overflowY: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: 'var(--chrome)', borderBottom: '1px solid var(--line)', textAlign: 'left' }}>
                      <th style={{ padding: '10px 14px' }}>Status</th>
                      <th style={{ padding: '10px 14px' }}>{kind === 'clients' ? 'Lead Name' : 'Society / Project'}</th>
                      <th style={{ padding: '10px 14px' }}>{kind === 'clients' ? 'Phone Number' : 'Price / Value'}</th>
                      <th style={{ padding: '10px 14px' }}>Locality</th>
                      <th style={{ padding: '10px 14px' }}>Match Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredPreviewRows.map((pr, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid var(--line)' }}>
                        <td style={{ padding: '10px 14px' }}>
                          {pr.status === 'new' && <span style={{ color: '#166534', fontWeight: 600, background: '#dcfce7', padding: '2px 8px', borderRadius: 99 }}>✨ New</span>}
                          {pr.status === 'duplicate' && <span style={{ color: '#1e40af', fontWeight: 600, background: '#dbeafe', padding: '2px 8px', borderRadius: 99 }}>🔗 Merge</span>}
                          {pr.status === 'invalid' && <span style={{ color: 'var(--muted)', background: 'var(--chrome)', padding: '2px 8px', borderRadius: 99 }}>⚠️ Skip</span>}
                        </td>
                        <td style={{ padding: '10px 14px', fontWeight: 600 }}>{pr.name || pr.title || '—'}</td>
                        <td style={{ padding: '10px 14px', fontFamily: 'monospace' }}>{pr.phone || pr.price || '—'}</td>
                        <td style={{ padding: '10px 14px' }}>{pr.locality || '—'}</td>
                        <td style={{ padding: '10px 14px', color: pr.dupTarget ? '#1e40af' : 'var(--muted)' }}>
                          {pr.dupTarget ? `Merges into: ${pr.dupTarget}` : 'Create new'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Panel>
          </div>
        )}

        {tab === 'import' && step === 'done' && (
          <Panel>
            <div style={{ textAlign: 'center', padding: '28px 16px', maxWidth: 560, margin: '0 auto' }}>
              <div style={{ width: 52, height: 52, borderRadius: '50%', background: '#dcfce7', color: '#166534', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}>
                <Icon name="check" size={26} />
              </div>
              <h3 style={{ fontSize: 20, fontWeight: 700, margin: '0 0 6px 0' }}>Import Completed Successfully</h3>
              <div className="u-muted" style={{ fontSize: 13.5, marginBottom: 18 }}>
                Created <b>{importStats?.added || 0}</b> new records and merged <b>{importStats?.merged || 0}</b> records.
              </div>

              {importStats?.mergedDetails?.length > 0 && (
                <div style={{ background: 'var(--chrome)', border: '1px solid var(--line)', padding: 14, borderRadius: 8, fontSize: 12.5, textAlign: 'left', maxHeight: 160, overflowY: 'auto', marginBottom: 18 }}>
                  <div style={{ fontWeight: 700, color: 'var(--muted)', marginBottom: 6 }}>Merged Records:</div>
                  {importStats.mergedDetails.map((m, idx) => (
                    <div key={idx} style={{ color: 'var(--ink)', marginBottom: 4 }}>• {m}</div>
                  ))}
                </div>
              )}

              <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
                <Button variant="secondary" size="sm" style={{ color: '#dc2626', borderColor: '#fca5a5' }} onClick={() => handleRevert(lastBatchId)}>
                  Revert This Batch
                </Button>
                <Button variant="primary" size="sm" onClick={() => setTab('history')}>
                  View Import Logs
                </Button>
              </div>
            </div>
          </Panel>
        )}
      </ListLayout>
    </>
  )
}
