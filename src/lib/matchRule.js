// ============================================================================
// DOES THIS LISTING ANSWER THIS REQUIREMENT — the one definition
// ============================================================================
// A flat's card said "144 buyers" and its record said "4 matched". The card
// was counted by a SQL join that let a lead through when its deal, locality or
// budget was simply unknown; the record was scored in the browser by a second
// rule over the newest 50 of those, then cut to four. Two rules for one
// question, and the agent saw both on the same flat.
//
// This is the rule. The server runs it for the number on a card and for the
// rows on the record (services/store.ts buyersFor), and the browser runs it
// for a lead's matching flats (matching.js matchesForLead), so no two screens
// can answer it differently.
//
// UNKNOWN IS NOT A MATCH. Deal must be stated on both sides and agree. A
// locality or budget that is unknown earns nothing; one that is known and
// disagrees disqualifies. A lead is matched only on something it actually said
// that fits: the flat's bedrooms, its area, or its price.
import { areasOf, budgetOf, facetFit, localityFit, propFacets } from './format.js'

/** A listing's price as a number — the numeric column, else the digits of the
 *  text one ("1,25,000"). NaN when there is none. */
export function priceOf(p) {
  const raw = p?.priceAmount ?? p?.price
  if (raw == null || raw === '') return NaN
  const n = typeof raw === 'number' ? raw : Number(String(raw).replace(/[^0-9.]/g, ''))
  return n > 0 ? n : NaN
}

// A budget is said as a round number: 25% either side of it is still worth a
// conversation, beyond that it is a different buyer. Inside 5% under / 8% over
// it is a fit.
const STRETCH_LOW = 0.75, STRETCH_HIGH = 1.25
const FIT_LOW = 0.95, FIT_HIGH = 1.08

/**
 * Null when the listing does not answer the requirement; otherwise the score
 * and what fitted. `loc` is the firm's locale (the server passes it).
 *
 *   bhk     their bedrooms (any they have asked for)   3   — else subtype 2
 *   area    one of the areas they named                3
 *   budget  'fits' inside the band                     3   — 'under' 1
 *
 * Matched at 3: at least one real thing fits.
 */
export function pairFit(p, req, loc) {
  if (!p || !req) return null
  if (!p.deal || !req.deal || p.deal !== req.deal) return null
  const f = facetFit(p, req, loc)
  if (f.hard) return null
  const area = localityFit(p, req)
  if (!area && areasOf(p.locality).length && areasOf(req.locality).length) return null

  const price = priceOf(p)
  const { min, max } = budgetOf(req)
  const hasMin = min > 0, hasMax = max > 0
  let budget = null
  if (price > 0 && (hasMin || hasMax)) {
    if ((hasMin && price < min * STRETCH_LOW) || (hasMax && price > max * STRETCH_HIGH)) return null
    if ((!hasMin || price >= min * FIT_LOW) && (!hasMax || price <= max * FIT_HIGH)) budget = 'fits'
    else if (hasMin && price < min) budget = 'under'
  }

  const score = (f.bhkMatch ? 3 : f.subtypeMatch ? 2 : 0) + (area ? 3 : 0)
    + (budget === 'fits' ? 3 : budget === 'under' ? 1 : 0)
  if (score < 3) return null
  return { score, bhk: f.bhkMatch ? propFacets(p, loc).bhk : null, area, budget }
}
