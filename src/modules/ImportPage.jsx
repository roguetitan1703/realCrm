import { useState, useEffect } from 'react'
import Icon from '../components/Icon.jsx'
import { Button, Panel, PageHeader } from '../components/primitives.jsx'
import { ListLayout } from '../layouts/layouts.jsx'
import { api } from '../lib/api.js'
import { useServerData } from '../lib/useServerData.js'
import {
  PROPERTY_FIELDS, LEAD_FIELDS, OWNER_FIELDS, GROUP_LABEL,
  parseSpreadsheet, guessMapping, readField,
  normPhone, splitUnit, moneyLabel, parseMoney,
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
  const [kind, setKind] = useState(sel?.kind || null) // null until chosen | 'clients' | 'properties' | 'owners'
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
    if (sel?.kind === 'clients' || sel?.kind === 'properties' || sel?.kind === 'owners') { setKind(sel.kind); setStep('upload') }
  }, [sel?.kind])

  const chooseKind = (k) => { setKind(k); setStep('upload'); setError(null) }
  const restart = () => { setKind(null); setStep('choose'); setParsedRows([]); setHeaders([]); setFileMeta(null); setError(null); setImportStats(null) }

  const FIELDS = kind === 'clients' ? LEAD_FIELDS : kind === 'owners' ? OWNER_FIELDS : PROPERTY_FIELDS
  const kindLabel = kind === 'clients' ? 'Leads & contacts' : kind === 'owners' ? 'Owners' : 'Properties'

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
  // Duplicate detection for the whole file, in one request. It used to compare
  // each row against the collections the browser held, so it could only ever
  // see part of the book -- and would see none of it once those went away.
  const dupProbe = parsedRows.map(row => {
    const v = {}
    FIELDS.forEach(f => { const got = readField(row, mapping, f); if (got !== null) v[f.key] = got })
    if (kind === 'clients') return { phone: v.phone || null, name: v.name || null }
    if (kind === 'owners') return { phone: v.phone || null }
    let unitRaw = v.title
    if (!unitRaw && headers.length) unitRaw = String(row[headers[0]] || '').trim()
    if (!unitRaw) return {}
    const project = intoProject || v.project || unitRaw
    const parsed = splitUnit(unitRaw)
    const wing = v.wing || parsed.wing || undefined
    const flat = parsed.flat || unitRaw
    return { title: [project, wing && `Wing ${wing}`, flat !== project ? flat : null].filter(Boolean).join(' - ') }
  })
  const dupKey = JSON.stringify(dupProbe)
  const { data: dupes } = useServerData(
    () => parsedRows.length
      ? api.checkDuplicates({
          phones: dupProbe.map(r => r.phone).filter(Boolean),
          names: dupProbe.map(r => r.name).filter(Boolean),
          titles: dupProbe.map(r => r.title).filter(Boolean),
        })
      : Promise.resolve({ leads: {}, properties: {}, owners: {} }),
    [dupKey], { leads: {}, properties: {}, owners: {} })

  // The project names already on the books, for the "import into project" box.
  const { data: summary } = useServerData(() => api.getPropertiesSummary().then(r => r?.summary || null), [], null)
  const projectNames = (summary?.projects || []).map(p => p.name)

  const previewRows = parsedRows.map((row) => {
    const v = {}
    FIELDS.forEach(f => { const got = readField(row, mapping, f); if (got !== null) v[f.key] = got })

    if (kind === 'owners') {
      if (!v.phone) return { status: 'invalid', reason: 'Phone is missing or too short', row, values: v }
      const name = (v.name || 'Owner').trim()
      // Any column nobody mapped still isn't lost — a sheet with a "Binod" /
      // "Vinod" / "Disha" column per past caller is call history, not noise.
      // Folded into the opening note, each tagged with its own header, so
      // the outreach history survives even though there's no per-agent field.
      const mappedCols = new Set(Object.values(mapping).filter(Boolean))
      const extra = headers
        .filter(h => !mappedCols.has(h))
        .map(h => [h, String(row[h] ?? '').trim()])
        .filter(([, val]) => val)
        .map(([h, val]) => `${h}: ${val}`)
      const notes = [v.notes, ...extra].filter(Boolean).join('; ') || undefined
      // The sheet hands over unit number / tower / config / two areas as
      // separate columns, not one pre-built "Unit" field — composed here into
      // the one free-text reference the owner record actually stores.
      const areaPart = v.carpet && v.saleable ? `${v.carpet}/${v.saleable} sqft`
        : v.carpet ? `${v.carpet} sqft carpet`
        : v.saleable ? `${v.saleable} sqft saleable`
        : null
      const unitRef = [v.wing, v.config, v.unitNo, areaPart].filter(Boolean).join(' · ') || undefined
      const record = {
        name, phone: v.phone, email: v.email || undefined,
        project: importProject.trim() || v.project || undefined,
        unitRef,
        locality: v.locality || undefined,
        source: v.source || 'Spreadsheet import',
        notes,
      }
      // An owner already on file, matched by phone — this is what makes
      // re-running an import that stopped partway through safe: rows already
      // saved before the browser closed come back "duplicate" and are
      // skipped, not saved a second time. There's no merge step for owners
      // (unlike leads) — an existing owner has nothing worth combining, it's
      // just already there.
      const dupHit = dupes?.owners?.[v.phone] || null
      return {
        status: dupHit ? 'duplicate' : 'new', dupTarget: dupHit?.name || null, dupId: dupHit?.id || null,
        record, label: name, sub: v.phone, locality: v.locality || '—', values: v,
      }
    }

    if (kind === 'clients') {
      if (!v.name && !v.phone) return { status: 'invalid', reason: 'No name and no phone', row, values: v }
      const name = (v.name || 'Imported lead').replace(/^[*(]+/, '').trim()
      const phone = v.phone
      if (!phone) return { status: 'invalid', reason: 'Phone is missing or too short', row, name, values: v }
      const dupHit = dupes?.leads?.[phone] || dupes?.leads?.[normPhone(phone)] || null
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
      return { status: dupHit ? 'duplicate' : 'new', dupTarget: dupHit?.name || null, dupId: dupHit?.id || null, record, label: name, sub: phone, locality: v.locality || '—', values: v }
    }

    // Properties. A row is a unit; the project can come from a column or from
    // the "import into project" box applied to the whole file.
    let unitRaw = v.title
    if (!unitRaw && headers.length) unitRaw = String(row[headers[0]] || '').trim()
    if (!unitRaw) return { status: 'invalid', reason: 'No unit / listing name', row, values: v }

    const project = intoProject || v.project || unitRaw
    const parsed = splitUnit(unitRaw)
    const wing = v.wing || parsed.wing || undefined
    const flat = parsed.flat || unitRaw
    const title = [project, wing && `Wing ${wing}`, flat !== project ? flat : null].filter(Boolean).join(' - ')

    // Dedup on the thing that is actually unique: a unit inside a project. The
    // comparison runs in the database (one request for the whole file) rather
    // than against whatever listings the browser happened to be holding — which
    // is what it used to do, and why it missed real duplicates.
    const dupHit = dupes?.properties?.[title.toLowerCase()] || null

    const record = {
      title,
      society: project, project,
      wing, tower: wing, flat, unit: flat,
      type: v.type || '2 BHK Apartment',
      deal: v.deal || 'sale',
      locality: v.locality || '',
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
      status: dupHit ? 'duplicate' : 'new',
      dupTarget: dupHit?.name || null,
      dupId: dupHit?.id || null,
      record, label: title, sub: moneyLabel(v.price) || '—', locality: v.locality || '—', values: v,
    }
  })

  // How much of each row actually survived the mapping — the honest answer to
  // "is my data coming across, or just the name?"
  const mappedCount = new Set(Object.values(mapping).filter(Boolean)).size
  const unmappedHeaders = headers.filter(h => !Object.values(mapping).includes(h))
  // The Review table's own columns — every field that was actually mapped to
  // a column, in schema order. Not "core fields", not a fixed guess: whatever
  // you pointed at a column is what you get to check before confirming.
  const reviewCols = FIELDS.filter(f => mapping[f.key])

  const newCount = previewRows.filter(r => r.status === 'new').length
  const dupCount = previewRows.filter(r => r.status === 'duplicate').length
  const invalidCount = previewRows.filter(r => r.status === 'invalid').length
  const filteredRows = previewRows.filter(r => filterStatus === 'all' || r.status === filterStatus)
  // Owners have no merge step — a duplicate is skipped, not sent to the
  // server at all, so it shouldn't be counted as something about to be saved.
  const dupWord = kind === 'owners' ? 'already on file' : 'to merge'
  const dupBadge = kind === 'owners' ? 'Skip' : 'Merge'
  const sendCount = newCount + (kind === 'owners' ? 0 : dupCount)

  // One row at a time, awaited before the next one started, was N sequential
  // round trips for one file — a 200-row township sheet took as long as 200
  // separate saves. Every row's create request now fires together
  // (Promise.allSettled starts them all before waiting on any of them); a
  // duplicate's merge still has to happen after ITS create succeeds (there's
  // nothing to merge into until the row exists), but those also all run
  // together rather than one merge blocking the next row's create.
  const CREATE_BY_KIND = { clients: api.createLead, owners: api.createOwner, properties: api.createProperty }
  const CACHE_KIND = { clients: 'lead', owners: 'owner', properties: 'property' }

  const handleConfirm = async () => {
    if (!parsedRows.length) return
    setImporting(true)
    const batchId = 'imp_' + Date.now()
    // Explicit id per row: the optimistic record and the stored row must share
    // one, or Undo can't find what it created. It also keeps rows created
    // inside the same millisecond from colliding.
    let n = 0
    // Owners have no merge step (unlike leads) — a duplicate owner isn't
    // created at all, just skipped, which is also what makes re-running an
    // import that stopped partway through safe.
    const toCreate = previewRows
      .filter(pr => pr.status !== 'invalid' && !(kind === 'owners' && pr.status === 'duplicate'))
      .map(pr => {
        const recId = `${kind === 'clients' ? 'l' : kind === 'owners' ? 'own' : 'p'}_${batchId}_${n++}`
        const rec = { ...pr.record, id: recId, importBatchId: batchId }
        if (kind === 'clients' && pr.status === 'duplicate' && pr.dupId) rec.duplicateOf = pr.dupId
        return { pr, rec }
      })

    try {
      const creator = CREATE_BY_KIND[kind]
      const results = await Promise.allSettled(toCreate.map(({ rec }) => creator(rec)))

      const created = []
      const toMerge = []
      let added = 0, merged = 0, failed = 0
      const mergedDetails = []
      if (kind === 'owners') {
        previewRows.forEach(pr => {
          if (pr.status !== 'duplicate') return
          merged++
          mergedDetails.push(`${pr.label} already on file — skipped (${pr.dupTarget})`)
        })
      }
      results.forEach((res, i) => {
        const { pr, rec } = toCreate[i]
        const body = res.status === 'fulfilled' ? res.value : null
        const savedRec = body?.data || body?.owner || body?.property || body?.lead || null
        if (!savedRec?.id) { failed++; return }
        created.push(savedRec)
        if (pr.status === 'duplicate') {
          merged++
          mergedDetails.push(`${pr.label} merged into existing record — ${pr.dupTarget}`)
          if (kind === 'clients' && pr.dupId) toMerge.push(savedRec.id)
        } else {
          added++
        }
      })

      if (created.length) store.cacheRecords(CACHE_KIND[kind], created)
      // Each merge needs its row already in cache (store.merge reads
      // duplicateOf off the cached record) — safe now that the create above
      // has resolved and been cached, and these can also all run together.
      if (toMerge.length) await Promise.allSettled(toMerge.map(id => store.merge(id)))

      store.logImportBatch({ batchId, timestamp: Date.now(), fileName: fileMeta?.name || 'import', module: kindLabel, addedCount: added, mergedCount: merged, mergedDetails, reverted: false })
      if (failed) store.toast(`${failed} row${failed === 1 ? '' : 's'} failed to save`, 'warn')
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
                  <button className="imp-choice" onClick={() => chooseKind('owners')}>
                    <span className="imp-choice-ic"><Icon name="home" size={24} /></span>
                    <span className="imp-choice-t">Owners</span>
                    <span className="imp-choice-d">A cold-calling list — property owners to ask about selling or renting. Not linked to a listing, grouped by project.</span>
                  </button>
                </div>
              </Panel>
            )}

            {/* STEP 2 — upload */}
            {step === 'upload' && (
              <Panel>
                <div className="imp-bar">
                  <div className="imp-step-title">Upload your file <span className="imp-target">{kindLabel}</span></div>
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
                {(kind === 'properties' || kind === 'owners') && (
                  <div className="imp-project">
                    <label className="imp-map-label">Import into project <span className="imp-map-hint">optional — groups every row under one township/society{kind === 'owners' ? ' in the Owners project view' : ''}</span></label>
                    <input className="input" value={importProject} onChange={e => setImportProject(e.target.value)}
                      placeholder="e.g. Godrej Riverside — leave blank to import as independent listings" list="imp-proj-list" />
                    <datalist id="imp-proj-list">
                      {(projectNames || []).map(n => <option key={n} value={n} />)}
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
                  <span className="imp-count dup">{dupCount} duplicate{dupCount === 1 ? '' : 's'} {dupWord}</span>
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
                    <Button variant="primary" size="sm" disabled={importing || sendCount === 0} onClick={handleConfirm}>
                      {importing ? 'Importing…' : `Import ${sendCount} record${sendCount === 1 ? '' : 's'}`}
                    </Button>
                  </div>
                </div>
                <div className="imp-review-filters">
                  {[['all', `All ${previewRows.length}`], ['new', `New ${newCount}`], ['duplicate', `${dupBadge} ${dupCount}`], ['invalid', `Skip ${invalidCount}`]].map(([k, label]) => (
                    <button key={k} className={'imp-fchip ' + k + (filterStatus === k ? ' on' : '')} onClick={() => setFilterStatus(k)}>{label}</button>
                  ))}
                </div>
                {/* Every field YOU mapped, not a fixed guess at what matters — a
                    hardcoded Name/Phone/Locality triple hid exactly the fields
                    (project, unit, tower, config…) someone most needed to check
                    before confirming, and any field not in that fixed set never
                    appeared here even though it was mapped and about to be saved. */}
                <div className="tbl-scroll imp-review-tbl">
                  <table className="tbl">
                    <thead>
                      <tr>
                        <th>Status</th>
                        {reviewCols.map(f => <th key={f.key}>{f.label}</th>)}
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredRows.map((pr, i) => (
                        <tr key={i}>
                          <td>
                            {pr.status === 'new' && <span className="imp-badge new">New</span>}
                            {pr.status === 'duplicate' && <span className="imp-badge dup">{dupBadge}</span>}
                            {pr.status === 'invalid' && <span className="imp-badge skip">Skip</span>}
                          </td>
                          {reviewCols.map(f => {
                            const raw = pr.values?.[f.key]
                            // A money field's real value is a bare rupee integer
                            // (parseMoney's job) — shown as-is that reads as a
                            // broken price, not the ₹85L the sheet actually said.
                            const shown = raw == null ? '—' : f.parse === parseMoney ? (moneyLabel(raw) || raw) : raw
                            return <td key={f.key} className={f.key === 'phone' ? 'mono-num' : undefined}>{shown}</td>
                          })}
                          <td className="cell-quiet">
                            {pr.dupTarget
                              ? (kind === 'owners' ? `Already on file — ${pr.dupTarget}` : `Merges into ${pr.dupTarget}`)
                              : pr.status === 'invalid' ? (pr.reason || 'Skipped') : 'Create new'}
                          </td>
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
