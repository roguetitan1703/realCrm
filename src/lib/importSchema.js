/**
 * Import: file parsing + the field schema the mapper maps ONTO.
 *
 * Two jobs live here so the wizard stays a wizard:
 *  1. Turn any spreadsheet a broker actually has (CSV, TSV, .xlsx, .xls) into
 *     `{ headers, rows }`.
 *  2. Describe every field a record really supports, with the synonyms a broker's
 *     own column headings use ("Flat No", "Carpet Area", "Owner Mobile"), so the
 *     mapping is guessed correctly and nothing rich has to be re-typed later.
 */

// ---------------------------------------------------------------------------
// Value parsers — Indian formats, because that's what the files contain
// ---------------------------------------------------------------------------

/** "1.85 Cr" | "95 Lakh" | "₹18,50,000" | "45000/mo" | 18500000 → rupees (number) */
export function parseMoney(raw) {
  if (raw === null || raw === undefined || raw === '') return null
  if (typeof raw === 'number') return raw > 0 ? applyBareScale(raw) : null
  const s = String(raw).toLowerCase().replace(/[₹,\s]/g, '').replace(/\/-?(mo|month|pm|p\.m\.)?$/, '')
  const num = parseFloat(s.replace(/[^0-9.]/g, ''))
  if (isNaN(num) || num <= 0) return null
  if (/cr|crore/.test(s)) return Math.round(num * 10000000)
  if (/l(ac|akh|k)?\b|lakh|lac/.test(s)) return Math.round(num * 100000)
  return applyBareScale(num)
}

// A bare number in a price column is almost never "95 rupees". Brokers write
// 95 (lakh) or 1.85 (crore) as often as they write the full figure, so scale
// small bare numbers rather than importing a ₹95 flat.
function applyBareScale(n) {
  if (n < 100) return Math.round(n * 100000)      // 95      → ₹95 Lakh
  if (n < 100000) return Math.round(n)            // 45000   → ₹45,000 (rent)
  return Math.round(n)                            // 18500000 → as written
}

/** "1450 sqft" | "1,450" | 1450 → 1450 */
export function parseNum(raw) {
  if (raw === null || raw === undefined || raw === '') return null
  const n = parseFloat(String(raw).replace(/[^0-9.]/g, ''))
  return isNaN(n) ? null : n
}

/** "9881204471" | "+91 98812 04471" | 9881204471 → "+919881204471" */
export function parsePhone(raw) {
  const digits = String(raw ?? '').replace(/\D/g, '')
  if (digits.length < 10) return null
  const ten = digits.slice(-10)
  return `+91${ten}`
}

export function normPhone(raw) {
  return String(raw ?? '').replace(/\D/g, '').slice(-10)
}

/** "sale" | "resale" | "rent" | "lease" | "rental" → 'sale' | 'rent' */
export function parseDeal(raw) {
  return /rent|lease|let/i.test(String(raw ?? '')) ? 'rent' : 'sale'
}

/** "3bhk" | "3 B.H.K" | "3" → "3 BHK Apartment"; passes through shop/plot/office. */
export function parseConfig(raw) {
  const s = String(raw ?? '').trim()
  if (!s) return null
  if (/shop|retail/i.test(s)) return 'Shop'
  if (/office|commercial/i.test(s)) return 'Office'
  if (/plot|land/i.test(s)) return 'Plot'
  const m = s.match(/(\d+(?:\.\d+)?)\s*b\.?h\.?k/i) || s.match(/^(\d+(?:\.\d+)?)$/)
  return m ? `${m[1]} BHK Apartment` : s
}

/** "A-1201" → { wing:'A', flat:'1201' }; "1201" → { wing:null, flat:'1201' } */
export function splitUnit(raw) {
  const s = String(raw ?? '').trim()
  if (!s) return { wing: null, flat: null }
  const m = s.match(/^([A-Za-z]+)[\s\-/]?(\d.*)$/)
  return m ? { wing: m[1].toUpperCase(), flat: m[2].trim() } : { wing: null, flat: s }
}

export function moneyLabel(rupees) {
  if (!rupees) return null
  if (rupees >= 10000000) return `₹${(rupees / 10000000).toFixed(2).replace(/\.00$/, '')} Cr`
  if (rupees >= 100000) return `₹${Math.round(rupees / 100000)} Lakh`
  return `₹${rupees.toLocaleString('en-IN')}`
}

// ---------------------------------------------------------------------------
// Field schema — what a record really supports, and what a broker calls it
// ---------------------------------------------------------------------------
// group: 'key' fields are always shown; 'detail' and 'owner' collapse behind a
// toggle so the required mapping isn't buried in twenty selects.

export const PROPERTY_FIELDS = [
  { key: 'title', label: 'Unit / listing name', group: 'key', required: true, syn: ['unit', 'flat no', 'flat', 'unit no', 'property', 'listing', 'title', 'name'] },
  { key: 'project', label: 'Project / society', group: 'key', syn: ['project', 'society', 'building', 'tower name', 'scheme', 'complex'] },
  { key: 'wing', label: 'Wing / tower', group: 'key', syn: ['wing', 'tower', 'block'] },
  { key: 'type', label: 'Configuration', group: 'key', parse: parseConfig, syn: ['config', 'bhk', 'type', 'configuration', 'unit type'] },
  { key: 'deal', label: 'Sale or rent', group: 'key', parse: parseDeal, syn: ['deal', 'sale/rent', 'for', 'transaction', 'listing type'] },
  { key: 'price', label: 'Price', group: 'key', parse: parseMoney, syn: ['price', 'cost', 'rate', 'amount', 'expected price', 'asking', 'rent'] },
  { key: 'locality', label: 'Locality', group: 'key', syn: ['locality', 'area', 'location', 'address', 'city', 'sector'] },
  { key: 'status', label: 'Status', group: 'key', syn: ['status', 'availability', 'available'] },

  { key: 'carpet', label: 'Carpet area (sqft)', group: 'detail', parse: parseNum, syn: ['carpet', 'carpet area', 'area', 'sqft', 'saleable', 'built up', 'builtup'] },
  { key: 'floor', label: 'Floor', group: 'detail', syn: ['floor', 'floor no', 'level'] },
  { key: 'totalFloors', label: 'Total floors', group: 'detail', parse: parseNum, syn: ['total floors', 'floors', 'storeys'] },
  { key: 'facing', label: 'Facing', group: 'detail', syn: ['facing', 'direction', 'vastu'] },
  { key: 'furnishing', label: 'Furnishing', group: 'detail', syn: ['furnishing', 'furnished', 'interior'] },
  { key: 'parking', label: 'Parking', group: 'detail', syn: ['parking', 'car park'] },
  { key: 'possession', label: 'Possession', group: 'detail', syn: ['possession', 'ready', 'handover', 'completion'] },
  { key: 'age', label: 'Age (years)', group: 'detail', parse: parseNum, syn: ['age', 'years old', 'property age'] },
  { key: 'builder', label: 'Builder / developer', group: 'detail', syn: ['builder', 'developer', 'promoter'] },
  { key: 'rera', label: 'RERA number', group: 'detail', syn: ['rera', 'rera no', 'rera id', 'registration'] },

  { key: 'owner', label: 'Owner name', group: 'owner', syn: ['owner', 'owner name', 'seller', 'landlord', 'contact person'] },
  { key: 'ownerPhone', label: 'Owner phone', group: 'owner', parse: parsePhone, syn: ['owner phone', 'owner mobile', 'seller phone', 'contact', 'mobile', 'phone'] },
  { key: 'ownerEmail', label: 'Owner email', group: 'owner', syn: ['owner email', 'email', 'mail'] },
  { key: 'notes', label: 'Notes / highlights', group: 'owner', syn: ['notes', 'remarks', 'comment', 'description', 'highlights', 'amenities'] },
]

export const LEAD_FIELDS = [
  { key: 'name', label: 'Name', group: 'key', required: true, syn: ['name', 'client', 'customer', 'buyer', 'lead', 'full name'] },
  { key: 'phone', label: 'Phone', group: 'key', required: true, parse: parsePhone, syn: ['phone', 'mobile', 'contact', 'number', 'cell', 'whatsapp'] },
  { key: 'email', label: 'Email', group: 'key', syn: ['email', 'mail', 'e-mail'] },
  { key: 'source', label: 'Source', group: 'key', syn: ['source', 'portal', 'channel', 'lead source', 'from'] },
  { key: 'stage', label: 'Stage', group: 'key', syn: ['stage', 'status', 'pipeline'] },

  { key: 'deal', label: 'Buy or rent', group: 'detail', parse: parseDeal, syn: ['deal', 'buy/rent', 'requirement type', 'purpose type'] },
  { key: 'config', label: 'Configuration wanted', group: 'detail', parse: parseConfig, syn: ['config', 'bhk', 'requirement', 'type', 'looking for'] },
  { key: 'locality', label: 'Preferred locality', group: 'detail', syn: ['locality', 'area', 'location', 'preferred area', 'city'] },
  { key: 'minBudget', label: 'Budget from', group: 'detail', parse: parseMoney, syn: ['min budget', 'budget from', 'budget min', 'from'] },
  { key: 'maxBudget', label: 'Budget to', group: 'detail', parse: parseMoney, syn: ['max budget', 'budget to', 'budget max', 'budget', 'amount', 'price'] },
  { key: 'purpose', label: 'Purpose', group: 'detail', syn: ['purpose', 'use', 'end use', 'investment'] },
  { key: 'timeline', label: 'Timeline', group: 'detail', syn: ['timeline', 'urgency', 'when', 'possession'] },
  { key: 'notes', label: 'Notes', group: 'detail', syn: ['notes', 'remarks', 'comment', 'description', 'requirement details'] },
]

export const GROUP_LABEL = {
  key: 'Core fields',
  detail: 'Property details',
  owner: 'Owner & notes',
}

/**
 * Auto-map columns to fields by header synonyms. Exact match wins over a
 * contains-match, and a column is only claimed once, so "Owner Phone" doesn't
 * get stolen by the generic "phone" synonym.
 */
export function guessMapping(headers, fields) {
  const map = {}
  const taken = new Set()
  const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
  const normHeaders = headers.map(h => ({ raw: h, n: norm(h) }))

  for (const pass of ['exact', 'contains']) {
    for (const f of fields) {
      if (map[f.key]) continue
      for (const syn of f.syn || []) {
        const sn = norm(syn)
        const hit = normHeaders.find(h => !taken.has(h.raw) && (pass === 'exact' ? h.n === sn : h.n.includes(sn)))
        if (hit) { map[f.key] = hit.raw; taken.add(hit.raw); break }
      }
    }
  }
  return map
}

/** Pull a field's value out of a row, applying that field's parser. */
export function readField(row, mapping, field) {
  const col = mapping[field.key]
  if (!col) return null
  const raw = row[col]
  if (raw === null || raw === undefined || String(raw).trim() === '') return null
  return field.parse ? field.parse(raw) : String(raw).trim()
}

// ---------------------------------------------------------------------------
// File parsing
// ---------------------------------------------------------------------------

function sniffDelimiter(headerLine) {
  const counts = [[',', 0], [';', 0], ['\t', 0], ['|', 0]].map(([d]) => [d, headerLine.split(d).length])
  counts.sort((a, b) => b[1] - a[1])
  return counts[0][1] > 1 ? counts[0][0] : ','
}

function splitLine(str, delim) {
  const out = []
  let cur = ''
  let q = false
  for (let i = 0; i < str.length; i++) {
    const ch = str[i]
    if (ch === '"') {
      if (q && str[i + 1] === '"') { cur += '"'; i++ } else q = !q
    } else if (ch === delim && !q) { out.push(cur.trim()); cur = '' }
    else cur += ch
  }
  out.push(cur.trim())
  return out.map(v => v.replace(/^"|"$/g, ''))
}

function parseDelimited(text) {
  const lines = text.split(/\r?\n/).filter(l => l.trim())
  if (lines.length < 2) throw new Error('This file needs a header row and at least one data row.')
  const delim = sniffDelimiter(lines[0])
  const headers = splitLine(lines[0], delim).map((h, i) => h || `Column ${i + 1}`)
  const rows = lines.slice(1).map(line => {
    const vals = splitLine(line, delim)
    const obj = {}
    headers.forEach((h, i) => { obj[h] = vals[i] ?? '' })
    return obj
  })
  return { headers, rows }
}

/**
 * Parse any spreadsheet into `{ headers, rows }`. Excel is loaded on demand so
 * the parser only costs bandwidth for the people who actually drop an .xlsx.
 */
export async function parseSpreadsheet(file) {
  const isExcel = /\.(xlsx|xlsm|xlsb|xls|ods)$/i.test(file.name)
  if (!isExcel) {
    const text = await file.text()
    return parseDelimited(text)
  }
  const XLSX = await import('xlsx')
  const buf = await file.arrayBuffer()
  const wb = XLSX.read(buf, { type: 'array', cellDates: true })
  const sheetName = wb.SheetNames[0]
  const sheet = wb.Sheets[sheetName]
  if (!sheet) throw new Error('That workbook has no readable sheet.')
  // header:1 gives raw arrays, so blank/duplicate headings can be repaired
  // before they become object keys and silently collapse columns.
  const grid = XLSX.utils.sheet_to_json(sheet, { header: 1, blankrows: false, defval: '' })
  if (grid.length < 2) throw new Error('That sheet needs a header row and at least one data row.')
  const seen = new Map()
  const headers = grid[0].map((h, i) => {
    let name = String(h ?? '').trim() || `Column ${i + 1}`
    if (seen.has(name)) { const n = seen.get(name) + 1; seen.set(name, n); name = `${name} (${n})` } else seen.set(name, 1)
    return name
  })
  const rows = grid.slice(1)
    .filter(r => r.some(v => String(v ?? '').trim() !== ''))
    .map(r => {
      const obj = {}
      headers.forEach((h, i) => { obj[h] = r[i] ?? '' })
      return obj
    })
  return { headers, rows, sheetName, sheetCount: wb.SheetNames.length }
}
