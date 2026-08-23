// Formatting + derived-data helpers (ported from legacy app.js).
import { isTerminal } from '../data/leadStatus.js'
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

/**
 * A rupee amount, split into the number to show and its unit.
 *
 * THE UNIT ESCALATES, at every magnitude. The rent path used to divide by 1000
 * and stop there, so a ₹45,00,000 lease read "₹4500k/mo" on the list while the
 * record sheet beside it said "₹45L".
 *
 * TWO DECIMALS, trailing zeros dropped by String(). Rounding to whole units put
 * "₹2L" over a stored ₹2,25,000 — hiding ₹25,000, which is 11% of the figure and
 * enough to change who gets shown what. ₹4.5k, ₹25k, ₹2.25L, ₹93L, ₹1.23Cr.
 *
 * NO SCALE GUESSING. There is no "a small number must already be in Lakhs" rule
 * here. That heuristic made a stored 123 render "₹1.2Cr" in the list and "₹123"
 * on the sheet — one number, two readings, neither of them checkable. A value in
 * the database is rupees. If that is wrong the input is wrong, and the fix is at
 * the input, not in six formatters each guessing differently.
 */
function moneyParts(v) {
  const [unit, div] = v >= 10000000 ? ['Cr', 10000000]
    : v >= 100000 ? ['L', 100000]
      : v >= 1000 ? ['k', 1000] : ['', 1]
  return { shown: Math.round((v / div) * 100) / 100, unit }
}

/** One figure. `perMonth` is the ONLY deal-awareness money needs — rent is a
 *  rate, a sale price is not, and leaving it off made the record sheet claim a
 *  ₹25,000 rental lead wanted to spend ₹25,000 outright. */
export function money(n, { perMonth = false } = {}) {
  const v = Number(n)
  if (!isFinite(v) || v <= 0) return ''
  const { shown, unit } = moneyParts(v)
  return '₹' + shown + unit + (perMonth ? '/mo' : '')
}

/** Kept for callers that have an amount and no deal (a listing's price, a
 *  project's band). Same core, so it can no longer disagree with budgetRange. */
export function fmtMoney(n) {
  return money(n) || '—'
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
 * WHAT THE FOLLOW-UP IS — the type, without the person it is with.
 *
 * The schedule modal saves `action` as "<type> — <lead name>", so every surface
 * that printed the field raw said the person's own name back to them on their
 * own record: a button reading "Mark follow-up done / Site Visit — Pooja
 * Sharma", above a header already reading "Pooja Sharma". The name was never
 * information here; the record is the name.
 *
 * Read through this, never `fu.action`, so the trailing name is stripped in one
 * place rather than in each of the four that show it.
 */
export function followUpAction(fu) {
  const raw = (fu?.action || '').trim()
  if (!raw) return ''
  // An em dash with spaces is what the modal writes, and nothing else uses one.
  const cut = raw.split(/\s+—\s+/)[0].trim()
  return cut || raw
}

/**
 * WHEN A FOLLOW-UP IS DUE. The one function, for the same reason whenLabel is.
 *
 * `at` is the appointment — a real instant, written by the schedule modal.
 * Rows saved before that existed carry only a `date` string a human typed
 * ("This Sunday"), which cannot be parsed into a day and is therefore shown
 * exactly as stored rather than guessed at. An agent re-picking the date is how
 * one of those becomes real; inventing a Sunday for them is not.
 */
export function followUpLabel(fu) {
  if (!fu) return ''
  if (fu.at) {
    const d = new Date(fu.at)
    if (!isNaN(d.getTime())) {
      const now = new Date()
      const time = d.toLocaleTimeString('en-IN', TIME)
      const sameDay = (a, b) => a.toDateString() === b.toDateString()
      if (sameDay(d, now)) return `Today, ${time}`
      const tomorrow = new Date(now); tomorrow.setDate(now.getDate() + 1)
      if (sameDay(d, tomorrow)) return `Tomorrow, ${time}`
      const date = d.toLocaleDateString('en-IN', d.getFullYear() === now.getFullYear()
        ? { weekday: 'short', day: 'numeric', month: 'short' }
        : { day: 'numeric', month: 'short', year: 'numeric' })
      return `${date}, ${time}`
    }
  }
  return [fu.date, fu.time].filter(Boolean).join(' · ')
}

/** A follow-up whose moment has passed. Unknowable for the legacy string rows,
 *  and false is the honest answer there — not a guess that marks work overdue. */
export function followUpOverdue(fu) {
  if (!fu?.at) return false
  const d = new Date(fu.at)
  return !isNaN(d.getTime()) && d.getTime() < Date.now()
}

/**
 * A CLOSED LEAD HAS NO NEXT STEP.
 *
 * Rejecting a lead does not clear the appointment that was booked before
 * anyone knew — the row keeps it — so the desk went on nagging about a site
 * visit for someone who had said no, in the list, on the record and in the
 * overdue count. "Overdue" means work still owed, and no work is owed on a
 * lead that is finished.
 *
 * Everything that draws a follow-up asks THIS, not `lead.followUp`, so the
 * badge, the column, the record card and the phone's next line cannot disagree
 * about whether a lead still has one. The server's `overdue` segment carries
 * the same guard, so the count and the rows stay one query apart.
 */
export function nextStepOf(lead) {
  if (!lead?.followUp) return null
  return isTerminal(lead.stage) ? null : lead.followUp
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
 * What a typed money value actually is, in full, in rupees.
 *
 * The abbreviation is exactly the thing that is ambiguous: a rent of 4500 shows
 * as ₹4.5k and a budget of 45 lakh shows as ₹45L, and neither tells the person
 * typing whether the box understood them. Two zeroes either way is the
 * difference between a flat and a car, and nobody finds out until a client is
 * quoted the wrong number.
 *
 * So the field echoes the whole figure back, grouped the Indian way —
 * "45,00,000", not "4,500,000" — while they type. Returns '' for anything that
 * is not a usable number, so an empty field stays quiet rather than reading ₹0.
 */
export function moneyEcho(v) {
  const n = parseBudgetNum(v)
  if (!isFinite(n) || n <= 0) return ''
  return '₹' + n.toLocaleString('en-IN', { maximumFractionDigits: 0 })
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
 *
 * THREE, as it turns out. A plain `req.budget` is the third, and it is the one
 * that matches how a budget is actually said: one number, not a range. 20
 * delpat leads carry only that key, and every budget comparison on them —
 * "within budget", the fit score, the budget column — was silently NaN. (bhumi
 * has none, so the live desk was not affected.)
 *
 * A single figure is a CEILING: "budget 28867" means up to that, not from it.
 * So it fills `max` and leaves `min` unknown, which is what it is.
 */
export function budgetOf(req) {
  if (!req) return { min: NaN, max: NaN }
  return {
    min: parseBudgetNum(req.minBudget ?? req.budgetMin),
    max: parseBudgetNum(req.maxBudget ?? req.budgetMax ?? req.budget),
  }
}

export function budgetRange(req) {
  if (!req) return '—'
  if (typeof req === 'string') return req
  const { min, max } = budgetOf(req)
  const perMonth = req.deal === 'rent'
  const hasMin = !isNaN(min) && min > 0
  const hasMax = !isNaN(max) && max > 0

  // A PORTAL SENDS ONE NUMBER, NOT A RANGE. This required both and fell through
  // to the dash whenever either was missing — so 83 of bhumi's leads carried a
  // real budget and rendered "—" on the record, the list and the phone card, in
  // the same slot a lead with genuinely no budget uses. A single figure is a
  // fact; refusing to show it because its partner is absent is 3.1 (absence
  // treated as a defect rather than as information).
  if (hasMin && hasMax) {
    const a = moneyParts(min), b = moneyParts(max)
    const tail = (perMonth ? '/mo' : '')
    // Share the unit when both ends land in it — "₹50–90L", not "₹50L–₹90L".
    return a.unit === b.unit
      ? `₹${a.shown}–${b.shown}${b.unit}${tail}`
      : `₹${a.shown}${a.unit}–₹${b.shown}${b.unit}${tail}`
  }
  // "Up to" and "from" rather than a bare figure: which end of the budget we
  // were given changes what it means to an agent about to negotiate.
  if (hasMax) return 'Up to ' + money(max, { perMonth })
  if (hasMin) return money(min, { perMonth }) + '+'

  // Still no budget shows no budget. This used to end in the literal
  // '₹85L–₹1.2Cr' — an invented figure, rendered as fact, on every row of the
  // table at once. Money is the last thing that should ever be guessed.
  return req.budget || req.budgetLabel || '—'
}

/** Whether budgetRange() would render anything real. The dash is a placeholder,
 *  not a fact, and a facts strip that filters on truthiness keeps it — which is
 *  why a record header read "3 BHK · Mahalunge · Buy · — · Via 99acres". */
export const hasBudget = (req) => budgetRange(req) !== '—'

/**
 * WHAT THEY WANT, in one phrase — the string every row, card and header prints.
 *
 * `req.config` was read raw, and for a commercial requirement there is nothing
 * in it: the parser clears "0 BHK" precisely because a showroom has no bedroom
 * count. Left as it was, bhumi's 2.25 lakh a month showroom would have read
 * "Rent · Mahalunge · 2.25L/mo" with nothing at all saying it was a showroom —
 * strictly worse than the nonsense it replaced, because at least "0 BHK" made
 * somebody ask.
 *
 * Residential keeps whatever config it holds. Commercial says its sub-type,
 * which is the equivalent fact: "Showroom" is to a commercial enquiry what
 * "2 BHK" is to a home.
 */
export function reqConfigLabel(req) {
  if (!req) return null
  const f = reqFacets(req)
  if (f.category === 'commercial') {
    return labelOf(SUBTYPES.commercial, f.subtype) || 'Commercial'
  }
  // The current one, plainly. A requirement that has accumulated several is
  // shown in full on the record sheet, never crammed into a line that has to
  // stay one line.
  return latestOf(req.config) || (f.bhk ? labelOf(BHK, f.bhk) : null)
}

export function reqLine(req) {
  if (!req) return 'General inquiry'
  const parts = [reqConfigLabel(req), latestPlus(req.locality), budgetRange(req)].filter(x => x && x !== 'undefined' && x !== 'null')
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
export function reqShort(req, { budget = true } = {}) {
  if (!req) return 'Any requirement'
  const deal = labelOf(DEAL_LEAD, req.deal) || null
  // `budget: false` for a caller that shows the figure in its own slot — the
  // phone list row puts it on the meta line beside the agent and the date. It
  // would otherwise print twice on one card, and this line is single-line
  // ellipsis-clipped, so the duplicate costs `interest` (last in the join) the
  // room to render at all.
  const money = budget ? budgetRange(req) : null
  // LATEST, AND HOW MANY MORE — this is a card and a list row, both of them one
  // clipped line, and an accumulating field rendered straight joins its values
  // with a comma into something that reads as one project nobody can find. The
  // full set is on the record sheet.
  const parts = [
    reqConfigLabel(req),
    deal,
    latestPlus(req.locality),
    money && money !== '—' ? money : null,
    latestPlus(req.interest),
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
  // Config, through the shared vocabulary rather than `p.type === req.config`
  // — which compared "2 BHK Apartment" against "2 BHK" and was therefore never
  // true, so the config was worth 25 points to nobody.
  const f = facetFit(p, req)
  if (f.hard) {
    // A shop against someone who wants a flat. Nothing else about the listing
    // can make this a match, and letting locality and budget carry it to a
    // respectable score is how a showroom ends up suggested to a family.
    reasons.push({ ok: false, t: f.want.category === 'commercial' ? 'Residential — they want commercial' : 'Commercial — they want residential' })
    return { reasons, score: 0 }
  }
  if (f.bhkMatch) { reasons.push({ ok: true, t: 'Config matches (' + configLabel(p) + ')' }); score += 25 }
  else if (f.subtypeMatch) { reasons.push({ ok: true, t: labelOf(SUBTYPES[propFacets(p).category] || SUBTYPES.residential, propFacets(p).subtype) + ' as asked' }); score += 15 }
  else if (f.categoryMatch && f.want.category === 'commercial') { score += 15 }
  if (localityFit(p, req)) { reasons.push({ ok: true, t: 'Same locality · ' + p.locality }); score += 30 }
  else { reasons.push({ ok: false, t: 'Different area (' + p.locality + ')' }); score += 8 }
  // A BUDGET IS USUALLY ONE NUMBER. This tested `price >= min && price <= max`,
  // so a requirement with only a ceiling — which is how a budget is actually
  // stated, and now the commonest shape on file — fell through both branches to
  // "we cannot say", and the listing that fitted perfectly got no more credit
  // than the one at triple the money. Each end is judged on its own, and an end
  // nobody gave is simply not judged.
  const { min: bMin, max: bMax } = budgetOf(req)
  const hasMin = !isNaN(bMin), hasMax = !isNaN(bMax)
  const priced = p.price > 0
  const underMax = hasMax && p.price <= bMax * 1.08
  const overMin = hasMin && p.price >= bMin * 0.95
  if (!priced || (!hasMin && !hasMax)) {
    // No budget on record is not the same as over budget, and saying so put
    // "Above budget" on every match the product has ever shown. A listing with
    // no price on it cannot be judged either.
    score += 12
  } else if ((hasMin ? overMin : true) && (hasMax ? underMax : true)) {
    reasons.push({ ok: true, t: 'Within budget' }); score += 30
  } else if (hasMin && p.price < bMin) {
    reasons.push({ ok: true, t: 'Under budget — room to negotiate' }); score += 18
  } else {
    reasons.push({ ok: false, t: 'Above budget' }); score += 5
  }
  if (p.possession === 'Immediate') { reasons.push({ ok: true, t: 'Ready to move' }); score += 10 }
  if (p.status === 'Available') score += 5
  return { reasons: reasons.slice(0, 4), score: Math.min(99, score) }
}

// ============================================================================
// WHAT SOMEONE WANTS, AND WHAT A LISTING IS — read through ONE vocabulary
// ============================================================================
// A property was fixed long ago: `type` was split into canonical `category`,
// `bhk` and `subtype`, with normalisers that read the legacy free text so old
// and new rows behave identically. The LEAD requirement was never given the
// same treatment, and everything that compares the two did it by string:
//
//     p.type === req.config        matching.js, three times, as a HARD FILTER
//     p.type === req.config        fitReasons, as the config score
//
// 77 leads say "2 BHK". 750 listings say "2 BHK Apartment". That comparison has
// never once been true, so `matchesForLead` and `leadsForProperty` — the buyer
// suggestions on a listing and the listing suggestions on a buyer — returned
// almost nothing, on every desk, since they were written.
//
// These read a requirement into the same three facets a listing already has,
// using the same normalisers, so the two sides can finally be compared.
const COMMERCIAL_WORDS = /\b(commercial|office|shop|showroom|warehouse|godown|industrial|coworking|co-working|retail)\b/i

// ============================================================================
// A FIELD THAT ACCUMULATES — one value or several, read the same way
// ============================================================================
// Someone who enquires twice about two projects has said two things, and the
// requirement carries both. Every reader of those fields goes through these,
// so a list cannot reach a screen as "Green VistasGreen Cove" — which is what
// JSX does with an array, and what the record header was doing.

/** Whatever a field holds, as a list of distinct values, IN STORED ORDER —
 *  which is oldest first: `mergeRepeatReq` appends each new value as it
 *  arrives, so the last entry is the current one. Blanks dropped, nested lists
 *  flattened — a caller assembling "the lead's own value
 *  plus its history" hands us a list inside a list, and String() on that joins
 *  it with a comma into one value nobody asked for. Deduplicated here, once, so
 *  no caller has to remember that its two sources overlap: they always do, the
 *  lead's current requirement having come from one of the enquiries. */
export function asList(v) {
  if (v == null || v === '') return []
  const out = []
  const walk = (x) => {
    if (x == null || x === '') return
    if (Array.isArray(x)) { x.forEach(walk); return }
    const s = String(x).trim()
    if (s && !out.includes(s)) out.push(s)
  }
  walk(v)
  return out
}

/** THE CURRENT VALUE of an accumulating field — the last one recorded, because
 *  the list is written in arrival order. Every "which one is it now" reader
 *  goes through this, so the header, the card, the list and a client-facing
 *  message cannot each pick a different end of the same array. */
export function latestOf(v) {
  const l = asList(v)
  return l.length ? l[l.length - 1] : null
}

/** The current answer and how many others there have been: "Green Cove +2".
 *  For a card, a row or the record header — anywhere the line has to stay one
 *  line. The full set, in the order it was asked, is on the record sheet. */
export function latestPlus(v) {
  const l = asList(v)
  if (!l.length) return null
  return l.length === 1 ? l[0] : `${l[l.length - 1]} +${l.length - 1}`
}

/** Every value, for the sheet — the one place that shows all of them. */
export function allOf(v) {
  return asList(v).join(', ') || ''
}

/**
 * AN ACCUMULATING FIELD IN AND OUT OF A TEXT BOX — one pair, because a form
 * that reads a list one way and writes it back another destroys it.
 *
 * Putting the array straight into an input renders "A,B,C" and saves that back
 * as a single value, so opening Edit and pressing Save flattened a buyer's
 * whole enquiry history without anybody typing a character. Shown as "A, B, C"
 * and read back through the same separator, so the field survives a round trip
 * untouched and typing ", VTP Belair" adds a fourth rather than a sentence.
 */
export const listText = (v) => asList(v).join(', ')
export function textList(s) {
  const list = asList(String(s ?? '').split(','))
  if (!list.length) return undefined
  return list.length === 1 ? list[0] : list
}

/**
 * EVERYTHING THIS PERSON HAS ASKED FOR — the lead's own requirement widened by
 * their enquiry history, which the server rolls up in one place
 * (`enquiryRollup`). Matching runs on this: a buyer who enquired at ₹68L and
 * again at ₹95L is looking across that range, and scoring only the latest point
 * hides every flat between.
 *
 * The lead's own value leads each list — it is the current ask, and where an
 * agent has typed one it beats what a portal sent.
 */
export function askedFor(lead) {
  const req = lead?.req || {}
  const roll = lead?.enquiryRollup?.req
  if (!roll) return req
  const both = (a, b) => [...new Set([...asList(a), ...asList(b)])]
  const nums = (...v) => v.map(x => parseBudgetNum(x)).filter(n => !isNaN(n) && n > 0)
  const lo = nums(req.minBudget ?? req.budgetMin, roll.minBudget)
  const hi = nums(req.maxBudget ?? req.budgetMax ?? req.budget, roll.maxBudget)
  return {
    ...req,
    config: both(req.config, roll.config),
    locality: both(req.locality, roll.locality),
    interest: both(req.interest, roll.interest),
    minBudget: lo.length ? Math.min(...lo) : undefined,
    maxBudget: hi.length ? Math.max(...hi) : undefined,
  }
}

/** Does the listing sit in an area this person has asked about — one area or
 *  several. `p.locality === req.locality` is false against a list, which is how
 *  a widened requirement would have scored worse than a narrow one. */
export function localityFit(p, req) {
  const want = asList(req?.locality).map(s => s.toLowerCase())
  if (!want.length || !p?.locality) return false
  return want.includes(String(p.locality).toLowerCase())
}

/** A requirement's category / bhk / subtype, from whatever it actually holds. */
export function reqFacets(req) {
  if (!req) return { category: null, bhk: null, subtype: null, bhks: [] }
  // Everything the person told us, in one string — the config field is where a
  // portal puts "Commercial Office", but the useful word is as often in the
  // free-text interest or notes. Each of the three may be a list.
  const text = [...asList(req.config), ...asList(req.interest), ...asList(req.notes)].join(' ')
  const category = req.category
    // "0 BHK" is how 99acres describes a showroom: nought bedrooms is not a
    // small flat, it is a building with no bedrooms in it.
    || (COMMERCIAL_WORDS.test(text) || /\b0\s*bhk\b/i.test(text) ? 'commercial' : null)
    || (normaliseBhk(text) ? 'residential' : null)
  // EVERY CONFIG ASKED FOR, not just one. Somebody who enquired about a 2 BHK
  // and then a 3 BHK wants either, and reading only the first scores the other
  // as a miss. `bhk` stays the current one, for the places that name a single
  // config on a line; `bhks` is what a comparison uses.
  const bhks = category === 'commercial' ? []
    : [...new Set(asList(req.config).map(c => normaliseBhk(c)).filter(Boolean))]
  return {
    category,
    // A commercial requirement has no BHK, and reading "0" as one would file a
    // showroom next to studio flats.
    bhk: category === 'commercial' ? null : (bhks[0] || normaliseBhk(text)),
    bhks: bhks.length ? bhks : (category === 'commercial' ? [] : [normaliseBhk(text)].filter(Boolean)),
    subtype: req.subtype || normaliseSubtype(text, category || 'residential'),
  }
}

/** The same three facets for a listing, tolerant of rows written before the
 *  columns existed — the property half of the comparison above. */
export function propFacets(p) {
  if (!p) return { category: null, bhk: null, subtype: null }
  const category = p.category || (COMMERCIAL_WORDS.test(p.type || '') ? 'commercial' : 'residential')
  return {
    category,
    bhk: p.bhk || (category === 'commercial' ? null : normaliseBhk(p.type)),
    subtype: p.subtype || normaliseSubtype(p.type, category),
  }
}

/**
 * Does this listing answer this requirement?
 *
 * `hard` is the disqualifier — a commercial requirement against a 2 BHK flat,
 * which no amount of matching on locality or budget should rescue. Everything
 * else is a degree, because "3 BHK when they asked for 2" is a conversation an
 * agent legitimately has and a filter that forbids it is wrong.
 */
export function facetFit(p, req) {
  const a = propFacets(p), b = reqFacets(req)
  const hard = Boolean(a.category && b.category && a.category !== b.category)
  return {
    hard,
    categoryMatch: Boolean(a.category && b.category && a.category === b.category),
    // ANY config they have asked for, not only the latest one.
    bhkMatch: Boolean(a.bhk && (b.bhks || []).includes(a.bhk)),
    subtypeMatch: Boolean(a.subtype && b.subtype && a.subtype === b.subtype),
    want: b,
  }
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
