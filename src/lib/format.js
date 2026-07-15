// Formatting + derived-data helpers (ported from legacy app.js).

export function fmtMoney(n) {
  if (!n) return '—'
  if (n >= 10000000) return '₹' + (n / 10000000).toFixed(n >= 100000000 ? 0 : 1).replace(/\.0$/, '') + 'Cr'
  if (n >= 100000) return '₹' + Math.round(n / 100000) + 'L'
  if (n >= 1000) return '₹' + Math.round(n / 1000) + 'k'
  return '₹' + n
}

export function timeAgo(mins) {
  if (mins < 60) return mins + ' min ago'
  if (mins < 1440) return Math.round(mins / 60) + 'h ago'
  return Math.round(mins / 1440) + 'd ago'
}

function parseBudgetNum(v) {
  if (v === null || v === undefined || v === '') return NaN
  if (typeof v === 'number') return v
  const s = String(v).trim()
  if (/cr/i.test(s)) return parseFloat(s) * 10000000
  if (/l/i.test(s)) return parseFloat(s) * 100000
  if (/k/i.test(s)) return parseFloat(s) * 1000
  return Number(s)
}

export function budgetRange(req) {
  if (!req) return '—'
  if (typeof req === 'string') return req
  let min = parseBudgetNum(req.budgetMin), max = parseBudgetNum(req.budgetMax)
  if (isNaN(min) || isNaN(max) || (min === 0 && max === 0)) {
    return req.budget || req.budgetLabel || '₹85L–₹1.2Cr'
  }
  if (req.deal === 'rent') {
    return '₹' + Math.round(min / 1000) + '–' + Math.round(max / 1000) + 'k/mo'
  }
  // Normalize raw rupees (> 10000) to Lakhs
  if (min > 10000) min = min / 100000
  if (max > 10000) max = max / 100000
  if (max >= 100) {
    const minStr = min >= 100 ? `₹${(min / 100).toFixed(1)}Cr` : `₹${Math.round(min)}L`
    return `${minStr}–₹${(max / 100).toFixed(1)}Cr`
  }
  return `₹${Math.round(min)}–₹${Math.round(max)}L`
}

export function reqLine(req) {
  if (!req) return 'General inquiry'
  const parts = [req.config, req.locality, budgetRange(req)].filter(x => x && x !== 'undefined' && x !== 'null')
  return parts.join(' · ') || 'General inquiry'
}

export function reqShort(req) {
  if (!req) return 'Any requirement'
  const parts = [req.config, req.deal, req.locality].filter(x => x && x !== 'undefined' && x !== 'null')
  return parts.join(' · ') || 'General inquiry'
}

export function initials(name) {
  if (!name) return '??';
  return String(name).trim().split(/\s+/).slice(0, 2).map(w => w?.[0] || '').join('').toUpperCase()
}

// Explainable match: ranked reasons + a 0–100 fit score (logic, not AI).
export function fitReasons(p, req) {
  const reasons = []; let score = 0
  if (p.type === req.config) { reasons.push({ ok: true, t: 'Config matches (' + p.type + ')' }); score += 25 }
  if (p.locality === req.locality) { reasons.push({ ok: true, t: 'Same locality · ' + req.locality }); score += 30 }
  else { reasons.push({ ok: false, t: 'Different area (' + p.locality + ')' }); score += 8 }
  const inB = p.price >= req.budgetMin * 0.95 && p.price <= req.budgetMax * 1.08
  if (inB) { reasons.push({ ok: true, t: 'Within budget' }); score += 30 }
  else if (p.price < req.budgetMin) { reasons.push({ ok: true, t: 'Under budget — room to negotiate' }); score += 18 }
  else { reasons.push({ ok: false, t: 'Above budget' }); score += 5 }
  if (p.possession === 'Immediate') { reasons.push({ ok: true, t: 'Ready to move' }); score += 10 }
  if (p.status === 'Available') score += 5
  return { reasons: reasons.slice(0, 4), score: Math.min(99, score) }
}

// Rate per sqft (sale only) — a reference figure brokers cite. Data, not a hero.
export function ratePsf(p) {
  if (p.deal !== 'sale' || !p.carpet || !p.price) return null
  return '₹' + Math.round(p.price / p.carpet).toLocaleString('en-IN') + '/sqft'
}

// Unit identity (agent-facing only — masked in client shares). e.g. "B-1402".
export function unitLabel(p) {
  if (!p) return null
  if (p.wing && p.flat) return `${p.wing}-${p.flat}`
  if (p.flat) return `Flat ${p.flat}`
  return null
}

// Deal-aware fact grid for a property. The record's backbone is its STABLE,
// identifying facts (config, area, floor, furnishing, possession) — NOT price.
// Money is a single quiet attribute, shown small and last, never the headline.
export function propFacts(p) {
  const unit = unitLabel(p)
  const common = [
    ...(unit ? [{ k: 'Unit', v: `${p.wing ? 'Wing ' + p.wing + ' · ' : ''}Flat ${p.flat}` }] : []),
    { k: 'Config', v: p.type },
    { k: 'Carpet', v: p.carpet ? p.carpet + ' sqft' : '—' },
    p.type === 'Plot'
      ? { k: 'Facing', v: p.facing }
      : { k: 'Floor', v: p.totalFloors ? `${p.floor} / ${p.totalFloors}` : '—' },
    ...(p.parking ? [{ k: 'Parking', v: p.parking, mut: true }] : []),
  ]
  if (p.deal === 'rent') {
    return [
      ...common,
      { k: 'Furnishing', v: p.furnishing, mut: true },
      { k: 'Tenants', v: p.tenants || 'Any', mut: true },
      { k: 'Available', v: p.possession, mut: true },
    ]
  }
  return [
    ...common,
    { k: 'Age', v: p.age ? p.age + ' yrs' : 'New', mut: true },
    { k: 'Furnishing', v: p.furnishing, mut: true },
    { k: 'Possession', v: p.possession, mut: true },
  ]
}

// The quiet, indicative money line — deal-labelled, explicitly soft. Money is
// one small attribute here, not a headline. Returns { label, figure, note }.
export function quotedLine(p) {
  const figure = p.priceLabel || (p.price ? fmtMoney(p.price) : '—')
  if (p.deal === 'rent') {
    return { label: 'Rent', figure, note: p.depositLabel ? 'deposit ' + p.depositLabel : (p.negotiable ? 'negotiable' : null) }
  }
  return { label: 'Asking', figure, note: p.negotiable ? 'indicative, negotiable' : 'fixed' }
}

// ---- Rental tenancy helpers ------------------------------------------------
// tenancy = { tenant, phone?, start, end, deposit, depositReturned, agent? }
// dates are 'YYYY-MM-DD'. All derived, no library.
export function fmtDate(iso) {
  if (!iso) return '—'
  const d = new Date(iso + 'T00:00:00')
  if (isNaN(d)) return iso
  const M = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  return `${d.getDate()} ${M[d.getMonth()]} ${d.getFullYear()}`
}

export function daysUntil(iso, from = new Date()) {
  if (!iso) return null
  const d = new Date(iso + 'T00:00:00')
  if (isNaN(d)) return null
  const base = new Date(from.getFullYear(), from.getMonth(), from.getDate())
  return Math.round((d - base) / 86400000)
}

// Renewal signal for an occupied rental: null | {tone,label,days}
export function renewalSignal(tenancy, from = new Date()) {
  if (!tenancy || !tenancy.end) return null
  const days = daysUntil(tenancy.end, from)
  if (days == null) return null
  if (days < 0) return { tone: 'overdue', label: `Agreement expired ${Math.abs(days)}d ago`, days }
  if (days <= 60) return { tone: 'due', label: days === 0 ? 'Expires today' : `Renewal due in ${days}d`, days }
  return { tone: 'ok', label: `Renews ${fmtDate(tenancy.end)}`, days }
}

// avatar palette cycling for thumbs
export function thumbTint(id) {
  const arr = ['#EEF1F6', '#E9EEF5', '#F6EEDD', '#EDECE9', '#E8F1EC']
  const i = (id ? id.charCodeAt(1) : 0) % arr.length
  return arr[i]
}
