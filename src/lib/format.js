// Formatting + derived-data helpers (ported from legacy app.js).
import {
  AREA_UNITS, BHK, DEAL_LEAD, SUBTYPES, isPlot, labelOf, normaliseBhk, normaliseSubtype,
} from '../data/propertyFields.js'

/**
 * "3 BHK Apartment" — the display config, rebuilt from the two canonical
 * fields that replaced the single conflated `type`, falling back to that
 * legacy string for rows that were never migrated.
 *
 * Lives here, once, because five different screens want this sentence and
 * every one of them used to build it by hand off `p.type`.
 */
export function configLabel(p = {}) {
  const cat = p.category || 'residential'
  const bhk = labelOf(BHK, p.bhk ?? normaliseBhk(p.type))
  const sub = labelOf(SUBTYPES[cat] || SUBTYPES.residential, p.subtype ?? normaliseSubtype(p.type, cat))
  return [bhk, sub].filter(Boolean).join(' ') || p.type || 'Property'
}

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

const TIME = { hour: 'numeric', minute: '2-digit' }

/**
 * WHEN SOMETHING HAPPENED. The one function. Every screen uses it.
 *
 * The rule, and the reason for it:
 *
 *   under an hour   "12 min ago"            still unfolding; the clock time
 *                                           would make you do the subtraction
 *   today           "3:42 PM"
 *   yesterday       "Yesterday, 3:42 PM"
 *   this year       "5 Aug, 3:42 PM"
 *   older           "5 Aug 2025, 3:42 PM"
 *
 * Relative time is only honest while the answer is "just now". Past that it
 * destroys the thing people actually need. "48h ago" on a call cannot be lined
 * up against what the client says, cannot be repeated back to them, cannot be
 * compared to the portal's own report, and cannot even be read twice with the
 * same meaning — it changes every time the page renders. An agent looking at a
 * lead's history needs to say "you called him Tuesday evening", and no amount
 * of arithmetic in their head turns "2d ago" into that reliably.
 *
 * The opposite mistake is a full timestamp. Nobody needs seconds, a timezone
 * or the year on something from this morning, and a wall of ISO strings is
 * unreadable in a timeline. So: the smallest form that still pins the moment.
 */
export function whenLabel(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  // floor, not round: at 30 seconds `round` gives 1, so a thing that just
  // happened reads "1 min ago" instead of "just now".
  const mins = Math.floor((Date.now() - d.getTime()) / 60000)
  // Future stamps happen: a portal in another timezone, a clock a few seconds
  // fast. Reading them as "in 3 minutes" is worse than reading the time.
  if (mins >= 0 && mins < 60) return mins < 1 ? 'just now' : `${mins} min ago`

  const now = new Date()
  const time = d.toLocaleTimeString('en-IN', TIME)
  const sameDay = (a, b) => a.toDateString() === b.toDateString()
  if (sameDay(d, now)) return time
  const yesterday = new Date(now); yesterday.setDate(now.getDate() - 1)
  if (sameDay(d, yesterday)) return `Yesterday, ${time}`

  const date = d.toLocaleDateString('en-IN', d.getFullYear() === now.getFullYear()
    ? { day: 'numeric', month: 'short' }
    : { day: 'numeric', month: 'short', year: 'numeric' })
  return `${date}, ${time}`
}


/**
 * When a lead came in. Same rule as everything else — see whenLabel — with an
 * option to drop the clock time where only the day matters (a list column).
 */
export function arrivedOn(iso, { withTime = false } = {}) {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  if (withTime) return whenLabel(iso)
  const now = new Date()
  return d.toLocaleDateString('en-IN', d.getFullYear() === now.getFullYear()
    ? { day: 'numeric', month: 'short' }
    : { day: 'numeric', month: 'short', year: 'numeric' })
}

// Resolve a user/agent id (as stored on a timeline event's author) to a
// display name, from the live roster — not a hardcoded id->name map.
export function agentName(agents, id) {
  if (!id) return 'System'
  const a = (agents || []).find(x => x.id === id)
  return a ? (a.first || a.name || id) : id
}

export function parseBudgetNum(v) {
  if (v === null || v === undefined || v === '') return NaN
  if (typeof v === 'number') return v
  const s = String(v).trim()
  if (/cr/i.test(s)) return parseFloat(s) * 10000000
  if (/l/i.test(s)) return parseFloat(s) * 100000
  if (/k/i.test(s)) return parseFloat(s) * 1000
  return Number(s)
}

/**
 * A requirement's budget, whichever way it is spelled.
 *
 * There are two spellings in this codebase and only one of them is real. The
 * dataset, the import schema, the lead form and the server (rowToLead) all
 * write `minBudget` / `maxBudget`. The code that READS a budget — the range
 * label, the fit reasons, both match scorers — asked for `budgetMin` /
 * `budgetMax`, which nothing has ever set.
 *
 * So every budget comparison in the product was against `undefined`: NaN, false,
 * "above budget", every time. One accessor, tolerant of both, so the two
 * spellings can never disagree again.
 */
export function budgetOf(req) {
  if (!req) return { min: NaN, max: NaN }
  return {
    min: parseBudgetNum(req.minBudget ?? req.budgetMin),
    max: parseBudgetNum(req.maxBudget ?? req.budgetMax),
  }
}

export function budgetRange(req) {
  if (!req) return '—'
  if (typeof req === 'string') return req
  let { min, max } = budgetOf(req)
  if (isNaN(min) || isNaN(max) || (min === 0 && max === 0)) {
    // A lead with no budget shows no budget. This used to end in the literal
    // '₹85L–₹1.2Cr' — an invented figure, rendered as fact, on every row of the
    // table at once. Money is the last thing that should ever be guessed.
    return req.budget || req.budgetLabel || '—'
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

/**
 * What this person wants, as ONE readable line — not a grid of label:value.
 *
 * An agent about to dial should be able to read the whole enquiry in a glance:
 * buy or rent, what size, where, how much, and whatever they told us they were
 * interested in. This used to print `config · deal · locality` with `deal` as
 * the raw stored 'sale', dropping the budget entirely and having nowhere at all
 * to put the property they asked about — so the one thing that makes a call
 * warm rather than cold was not on the screen the call is made from.
 *
 * `interest` is deliberately free text. A spreadsheet's "property interested"
 * column holds "Godrej Riverside 2BHK, saw the show flat" — prose a human
 * wrote. Forcing that into a link to a property record loses it whenever the
 * listing is not on file, which for an imported sheet is most of the time.
 * Linking a real property is what the shortlist does, separately and later.
 */
export function reqShort(req) {
  if (!req) return 'Any requirement'
  const deal = labelOf(DEAL_LEAD, req.deal) || null
  const budget = budgetRange(req)
  const parts = [
    req.config,
    deal,
    req.locality,
    budget && budget !== '—' ? budget : null,
    req.interest,
  ].filter(x => x && x !== 'undefined' && x !== 'null')
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
  const { min: bMin, max: bMax } = budgetOf(req)
  const inB = p.price >= bMin * 0.95 && p.price <= bMax * 1.08
  if (inB) { reasons.push({ ok: true, t: 'Within budget' }); score += 30 }
  else if (p.price < bMin) { reasons.push({ ok: true, t: 'Under budget — room to negotiate' }); score += 18 }
  // No budget on record is not the same as over budget, and saying so put
  // "Above budget" on every match the product has ever shown.
  else if (isNaN(bMin) || isNaN(bMax)) { score += 12 }
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

// The inventory data carries three parallel names for the same concepts across
// the seed (tower/totalFloors), the add-property form (wing/flat) and the card
// (tower/unit). These tolerant accessors read whichever exists so grouping and
// labelling stay consistent everywhere. Nothing rewrites the stored data.
export const wingOf = (p) => (p && (p.wing || p.tower)) || null
export const flatOf = (p) => (p && (p.flat || p.unit)) || null

// The project (grouping) a unit belongs to. Units with no project fall into the
// implicit "Independent / Direct" bucket — a scattered flat/shop/plot broker
// never has to think about projects; township units group automatically.
export const INDEPENDENT_PROJECT = 'Independent / Direct'
export const projectOf = (p) => (p && (p.project || p.society)) || INDEPENDENT_PROJECT

// Developer/builder is a third parallel name — the seed + every form write
// `builder`, but some records carry `developer`. Read whichever exists so the
// project header always shows the developer when one is known.
export const developerOf = (p) => (p && (p.developer || p.builder)) || null

// Unit identity (agent-facing only — masked in client shares). e.g. "B-1402".
export function unitLabel(p) {
  if (!p) return null
  const wing = wingOf(p), flat = flatOf(p)
  if (wing && flat) return `${wing}-${flat}`
  if (flat) return `Flat ${flat}`
  if (wing) return `Wing ${wing}`
  return null
}

// Deal-aware fact grid for a property. The record's backbone is its STABLE,
// identifying facts (config, area, floor, furnishing, possession) — NOT price.
// Money is a single quiet attribute, shown small and last, never the headline.
export function propFacts(p) {
  const unit = unitLabel(p)
  const common = [
    ...(unit ? [{ k: 'Unit', v: `${wingOf(p) ? 'Wing ' + wingOf(p) + ' · ' : ''}${flatOf(p) ? 'Flat ' + flatOf(p) : ''}`.replace(/ · $/, '') }] : []),
    { k: 'Config', v: configLabel(p) },
    { k: 'Carpet', v: p.carpet ? `${p.carpet} ${labelOf(AREA_UNITS, p.areaUnit || 'sqft')}` : '—' },
    isPlot(p.subtype ?? normaliseSubtype(p.type, p.category))
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

// A scheduled callback, read the way a caller reads it: how late, or how soon.
// Takes an ISO timestamp (the server sends one), returns null | {tone,label}.
// `tone` is 'overdue' | 'due' | 'ok' — the same three the renewal signal uses,
// so the queue rows and the tenancy rows can share one set of styles.
export function callbackSignal(iso, from = new Date()) {
  if (!iso) return null
  const d = new Date(iso)
  if (isNaN(d)) return null
  const mins = Math.round((d - from) / 60000)
  const T = d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' }).toLowerCase()
  if (mins < 0) {
    const late = Math.abs(mins)
    if (late < 60) return { tone: 'overdue', label: `${late}m late`, mins }
    if (late < 1440) return { tone: 'overdue', label: `${Math.round(late / 60)}h late`, mins }
    return { tone: 'overdue', label: `${Math.round(late / 1440)}d late`, mins }
  }
  const sameDay = d.toDateString() === from.toDateString()
  if (sameDay) return { tone: 'due', label: T, mins }
  const days = Math.ceil(mins / 1440)
  if (days === 1) return { tone: 'ok', label: `Tomorrow ${T}`, mins }
  return { tone: 'ok', label: `${fmtDate(d.toISOString().slice(0, 10))} ${T}`, mins }
}

// avatar palette cycling for thumbs
export function thumbTint(id) {
  const arr = ['#EEF1F6', '#E9EEF5', '#F6EEDD', '#EDECE9', '#E8F1EC']
  const i = (id ? id.charCodeAt(1) : 0) % arr.length
  return arr[i]
}

// An owner isn't a stored record — it's derived by grouping properties on the
// owner name (B3). This is that grouping key, shared by the Contacts→Owners
// list and the sidebar's Owners count so the two can never disagree about how
// many owners exist.
// No owner recorded means NO owner — not an owner called "Unnamed Owner".
// Every ownerless listing used to collapse into one phantom contact that
// couldn't be opened, edited or called, because there was nobody behind it.
export const ownerKeyOf = (p) => (p && p.owner) || null
