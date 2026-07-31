// ============================================================================
// 🏷️ CANONICAL PROPERTY VOCABULARY (spec: docs/specs/properties.md C4)
// ============================================================================
// ONE source of truth for every enumerable property field. The add/edit form
// renders its choices from here and the filters build their options from here,
// so an option can never drift from a stored value.
//
// That drift is not hypothetical — it's the live C-fix bug. The Properties
// filter offered `1BHK / 2BHK / 3BHK / Commercial / Plot` while the database
// actually held "3 BHK Apartment", "4 BHK Villa", "Commercial Office". Only
// "2BHK" ever matched. The root cause was structural, not a short list: `type`
// was holding TWO dimensions at once — configuration AND sub-type — so no
// single vocabulary could ever match it. Hence `bhk` and `subtype` below are
// separate fields.
//
// RULES for anything added here:
//   • `value` is the STORED token. Lowercase, stable, never shown to a user.
//     Renaming a label is free; renaming a value is a migration.
//   • `label` is the only thing a person ever sees.
//   • Legacy rows hold free text, so every reader goes through the normalise*
//     helpers at the bottom rather than comparing raw strings.
// ============================================================================

const o = (value, label) => ({ value, label })

// ---- Top level --------------------------------------------------------------
export const CATEGORIES = [o('residential', 'Residential'), o('commercial', 'Commercial')]

// PG/Co-living is deliberately absent — parked for v1 (spec Q17), even though
// the portal forms we modelled this on offer it.
export const DEALS = [o('sale', 'Sell'), o('rent', 'Rent / Lease')]

export const SUBTYPES = {
  residential: [
    o('apartment', 'Apartment'), o('independent_house', 'Independent House'),
    o('duplex', 'Duplex'), o('independent_floor', 'Independent Floor'),
    o('villa', 'Villa'), o('penthouse', 'Penthouse'),
    o('studio', 'Studio'), o('farm_house', 'Farm House'), o('plot', 'Plot / Land'),
  ],
  commercial: [
    o('office', 'Office Space'), o('shop', 'Shop / Retail'),
    o('showroom', 'Showroom'), o('warehouse', 'Warehouse / Godown'),
    o('industrial', 'Industrial Building'), o('coworking', 'Co-working'),
    o('plot', 'Commercial Plot / Land'),
  ],
}

export const TRANSACTION = [o('new', 'New'), o('resale', 'Resale')]
export const POSSESSION = [o('ready', 'Ready to move'), o('under_construction', 'Under construction')]

// India-critical and absent from both portal references we worked from.
export const OWNERSHIP = [
  o('freehold', 'Freehold'), o('leasehold', 'Leasehold'),
  o('power_of_attorney', 'Power of Attorney'), o('cooperative', 'Co-op society'),
]

// ---- Configuration ----------------------------------------------------------
// Three TIERS, not one flat list. ~85% of Indian residential inventory is
// 1/2/3 BHK, so those are the only ones shown at rest; everything else is one
// tap away. A flat list of sixteen chips makes the common case pay the cost of
// the rare one, which is the single biggest reason this form felt long.
export const BHK_COMMON = [o('1', '1 BHK'), o('2', '2 BHK'), o('3', '3 BHK')]
export const BHK_MORE = [
  o('1rk', '1 RK'), o('1.5', '1.5 BHK'), o('2.5', '2.5 BHK'),
  o('3.5', '3.5 BHK'), o('4', '4 BHK'), o('4.5', '4.5 BHK'), o('5', '5 BHK'),
]
// Only revealed from "5 BHK" onward. A 9 BHK is a real thing (a rented
// bungalow, a hostel-style let) but offering it up front is noise.
export const BHK_LARGE = ['6', '7', '8', '9', '10', '11', '12'].map(v => o(v, `${v} BHK`))

// `5plus` is legacy-only: rows written before the tiers existed collapsed
// anything ≥5 into it. Kept so those rows still render and filter, never
// offered as a new choice.
// The union — a LOOKUP table for labelOf()/normalise(), not something any
// picker renders whole. Order is irrelevant here; the tiers above decide it.
export const BHK = [...BHK_COMMON, ...BHK_MORE, ...BHK_LARGE, o('5plus', '5+ BHK')]

/** The short list a FILTER offers — the long tail would swamp the filter bar. */
export const BHK_FILTER = [
  o('1rk', '1 RK'), o('1', '1 BHK'), o('2', '2 BHK'), o('3', '3 BHK'),
  o('4', '4 BHK'), o('5', '5 BHK'), o('5plus', '5+ BHK'),
]

const countList = (from, to) => {
  const out = []
  for (let i = from; i < to; i++) out.push(o(String(i), String(i)))
  out.push(o(`${to}+`, `${to}+`))
  return out
}

export const COUNT_0_4 = countList(0, 4)
export const COUNT_1_4 = countList(1, 4)
export const COUNT_0_3 = countList(0, 3)

/** How many bedrooms a config implies — the basis for scaling the counts. */
export function bedroomsOf(bhk) {
  if (!bhk || bhk === '1rk') return 1
  if (bhk === '5plus') return 5
  const n = Number(bhk)
  return Number.isFinite(n) ? Math.ceil(n) : 1
}

/**
 * Bathroom and balcony choices SCALE with the configuration. Offering "4+"
 * bathrooms on a 1 RK is clutter; capping a 9 BHK at "4+" loses real
 * information. The default is the honest Indian norm — one bathroom per
 * bedroom up to 3, then one fewer than the bedroom count.
 */
export function countsFor(bhk) {
  const beds = bedroomsOf(bhk)
  const bathTop = Math.min(9, Math.max(4, beds + 1))
  const balcTop = Math.min(9, Math.max(3, beds))
  return {
    bathrooms: countList(1, bathTop),
    balconies: countList(0, balcTop),
    defaultBathrooms: String(Math.min(bathTop, beds <= 3 ? beds : beds - 1)),
  }
}

// A floor is not always a number — Ground/Basement/Stilt are real answers that
// an integer column cannot hold, which is why this is a token.
export const FLOOR_TOKENS = [
  o('basement', 'Basement'), o('lower_ground', 'Lower Ground'),
  o('ground', 'Ground'), o('stilt', 'Stilt'),
]

export const AREA_TYPES = [
  o('carpet', 'Carpet'), o('builtup', 'Built-up'),
  // The one sale price/sq.ft is normally quoted on — omitting it (as both
  // portal refs do) makes a derived price/sq.ft meaningless.
  o('super_builtup', 'Super built-up'), o('plot', 'Plot'),
]
// Two units, not five. Every brokerage in this market quotes sq.ft; sq.m
// exists because RERA filings and builder agreements are written in it. Gaj
// and acre were offered "for completeness" and bought nothing but a wider
// row and a chance to store an area nobody downstream can compare — a plot in
// acres and a flat in sq.ft cannot sort into one list.
export const AREA_UNITS = [o('sqft', 'sq.ft'), o('sqm', 'sq.m')]

export const FACING = [
  o('north', 'North'), o('east', 'East'), o('west', 'West'), o('south', 'South'),
  o('north_east', 'North-East'), o('north_west', 'North-West'),
  o('south_east', 'South-East'), o('south_west', 'South-West'),
]

// Status is the ONE vocabulary whose values are the display strings themselves.
// It's a user-facing lifecycle that the stepper, StatusTag's colour map and the
// record sheet already agree on, so inventing lowercase tokens for it would buy
// nothing and force a rewrite of live values (which is precisely how an
// "Available" listing briefly ended up rendering with the closed styling).
// Filter options equal stored values here by construction — no translation.
export const STATUS = [
  'Available', 'Token Pending', 'Under Offer', 'Sold', 'Leased', 'Blocked', 'Off-Market',
].map(v => o(v, v))

// ---- Furnishing -------------------------------------------------------------
export const FURNISH = [
  o('full', 'Fully Furnished'), o('semi', 'Semi Furnished'), o('none', 'Unfurnished'),
]

// Present or not — a simple toggle.
export const FIXTURES = [
  o('dining_table', 'Dining Table'), o('washing_machine', 'Washing Machine'),
  o('cupboard', 'Cupboard'), o('sofa', 'Sofa'), o('microwave', 'Microwave'),
  o('stove', 'Stove'), o('fridge', 'Fridge'), o('water_purifier', 'Water Purifier'),
  o('gas_pipeline', 'Gas Pipeline'), o('chimney', 'Chimney'),
  o('modular_kitchen', 'Modular Kitchen'),
]

// "How many", not "yes/no" — these render as −/0/+ steppers, because
// "2 ACs" and "5 ACs" are materially different to a tenant.
export const COUNTED_ITEMS = [
  o('fan', 'Fan'), o('light', 'Light'), o('ac', 'AC'), o('wardrobe', 'Wardrobe'),
  o('tv', 'TV'), o('bed', 'Bed'), o('geyser', 'Geyser'),
]

export const SOCIETY_AMENITIES = [
  o('power_backup', 'Power Backup'), o('lift', 'Lift'), o('gym', 'Gym'),
  o('swimming_pool', 'Swimming Pool'), o('intercom', 'Intercom'), o('garden', 'Garden'),
  o('sports', 'Sports'), o('kids_area', 'Kids Area'), o('cctv', 'CCTV'),
  o('gated_community', 'Gated Community'), o('club_house', 'Club House'),
  o('community_hall', 'Community Hall'), o('water_supply', 'Regular Water Supply'),
  o('attached_balcony', 'Attached Balcony'),
]

// ---- Rent-only --------------------------------------------------------------
export const TENANT_TYPES = [
  o('family', 'Family'), o('bachelors', 'Bachelors'), o('company', 'Company'),
]
// Only asked once "Bachelors" is actually chosen — a follow-up question, not a
// field. Owners in this market are specific about it and a broker who sends a
// men-only flat to a women's group has burned the lead and the owner at once.
export const BACHELOR_PREF = [
  o('both', 'Open for both'), o('men', 'Men only'), o('women', 'Women only'),
]
export const MAINTENANCE_MODE = [o('included', 'Include in rent'), o('separate', 'Separate')]
export const DEPOSIT_OPTIONS = [
  o('none', 'None'), o('1mo', '1 month'), o('2mo', '2 months'), o('custom', 'Custom'),
]
export const LOCKIN_OPTIONS = [
  o('none', 'None'), o('1mo', '1 month'), o('6mo', '6 months'), o('custom', 'Custom'),
]
export const PAINTING_CHARGES = [
  o('none', 'None'), o('as_per_cost', 'As per cost'), o('1mo', '1 month'), o('custom', 'Custom'),
]

// ---- Sale-only --------------------------------------------------------------
export const PRICE_INCLUDES = [
  o('plc', 'PLC'), o('car_parking', 'Car Parking'), o('club_membership', 'Club Membership'),
]

// ---- Plot-only --------------------------------------------------------------
export const OPEN_SIDES = ['1', '2', '3', '4'].map(v => o(v, v))

// ---- Consulting fee ---------------------------------------------------------
// "Brokerage" is called Consulting throughout the product (spec Q4).
//
// The fee is charged in two structurally different ways, and asking for both
// at once was the bug: on a LET it is a number of days' rent, on a SALE it is
// a percentage of the consideration. A percent box on a rental listing is not
// just noise — filled in by mistake it produces a fee nobody agreed to.
export const CONSULTING_DAYS = [
  o('none', 'None'), o('15d', '15 days'), o('30d', '30 days'), o('custom', 'Custom'),
]
export const CONSULTING_PERCENT = [
  o('none', 'None'), o('1', '1%'), o('2', '2%'), o('custom', 'Custom'),
]

// ============================================================================
// Which fields apply
// ============================================================================
// The form swaps field sets on category/deal/subtype, and the same predicate
// decides what the filters and the completeness score consider relevant — so a
// plot is never marked "incomplete" for lacking a bathroom count.

export function isPlot(subtype) {
  return subtype === 'plot'
}

// A whole building has no super built-up area and a warehouse has no
// furnishing. Sets, not booleans, where the answer is "which of these".
const LANDED = new Set(['independent_house', 'villa', 'farm_house'])
const NO_FURNISHING = new Set(['warehouse', 'industrial'])
const BIG_HOMES = new Set(['villa', 'penthouse', 'farm_house', 'independent_house', 'duplex'])

export function appliesTo(form = {}) {
  const {
    category = 'residential', deal = 'sale', subtype = 'apartment',
    possession, transactionType, bhk, preferredTenants = [],
  } = form
  const plot = isPlot(subtype)
  const residential = category === 'residential'
  const sale = deal === 'sale'
  const landed = LANDED.has(subtype)
  // Under construction has no age, no keys and nothing to photograph inside.
  const underConstruction = possession === 'under_construction'

  return {
    bhk: residential && !plot,
    bathrooms: !plot,
    balconies: residential && !plot,
    furnishing: !plot && !NO_FURNISHING.has(subtype),
    floors: !plot,
    // Only asked where a servant room is plausibly present. On a 1 BHK it is
    // a question with one possible answer, which is not a question.
    servantRoom: residential && !plot && (bedroomsOf(bhk) >= 3 || BIG_HOMES.has(subtype)),
    plotFields: plot,

    // Super built-up is a loading applied to apartment carpet area. A villa or
    // an independent house is sold on plot + built-up, and quoting one a
    // super built-up figure is meaningless.
    superBuiltup: !plot && !landed,
    // A landed property has a plot under it even though it isn't "a plot".
    landPlotArea: landed,

    // TITLE is a sale concern. A tenant never takes title, so freehold vs
    // leasehold vs power-of-attorney has no bearing on a let.
    ownership: sale && !underConstruction,
    transaction: sale,
    // "Ready / under construction" is a sale question; a let advertises a date
    // it's free, which is the "Available from" field on the terms step.
    possession: sale,
    // Only a new or under-construction project HAS a RERA number.
    rera: transactionType === 'new' || underConstruction,
    // Nothing under construction has an age yet.
    age: !underConstruction,

    rentTerms: deal === 'rent',
    saleTerms: sale,
    tenantPreference: deal === 'rent' && residential,
    bachelorPreference: deal === 'rent' && residential && preferredTenants.includes('bachelors'),
  }
}

/** The area boxes that make sense for this property — never all four. */
export function areaFieldsFor(form = {}) {
  const a = appliesTo(form)
  if (a.plotFields) return ['plotArea']
  const out = ['carpet', 'builtup']
  if (a.superBuiltup) out.push('superBuiltup')
  if (a.landPlotArea) out.push('plotArea')
  return out
}

// ============================================================================
// Legacy tolerance
// ============================================================================
// Rows written before this vocabulary existed hold free text ("Semi-furnished",
// "4 BHK Villa", "North-East"). Rather than a risky rewrite of live data, every
// read goes through these so old and new rows filter identically. They are also
// what the migration uses to backfill.

const slug = (s) => String(s || '').toLowerCase().trim().replace(/[\s\-/]+/g, '_')

/** Match a raw stored value against a vocabulary, by value or by label. */
export function normaliseTo(list, raw) {
  if (raw == null || raw === '') return null
  const s = slug(raw)
  const hit = list.find(x => slug(x.value) === s || slug(x.label) === s)
  return hit ? hit.value : null
}

/** "3 BHK Apartment" / "2BHK" / "1 RK" → a BHK token. Reads the NUMBER out of a
 *  string that may also name the sub-type, which is exactly what broke the old
 *  single `type` field. */
export function normaliseBhk(raw) {
  if (!raw) return null
  const s = String(raw).toLowerCase()
  if (/\b1\s*rk\b/.test(s)) return '1rk'
  const m = s.match(/(\d+(?:\.5)?)\s*bhk/)
  if (!m) return null
  const n = m[1]
  if (BHK.some(b => b.value === n)) return n
  // Beyond the tiers there is nothing precise to store, so it collapses into
  // the legacy bucket rather than being dropped.
  return Number(n) >= 5 ? '5plus' : null
}

/** "4 BHK Villa" → villa. The sub-type hiding inside the same legacy string. */
export function normaliseSubtype(raw, category = 'residential') {
  if (!raw) return null
  const s = String(raw).toLowerCase()
  const list = SUBTYPES[category] || SUBTYPES.residential
  const hit = list.find(x => s.includes(x.label.toLowerCase()) || s.includes(x.value.replace(/_/g, ' ')))
  if (hit) return hit.value
  if (/\bcommercial\b|\boffice\b/.test(s)) return 'office'
  if (/\bplot\b|\bland\b/.test(s)) return 'plot'
  return null
}

/**
 * Floor may be a number, a known token, or something a broker just typed —
 * the live data contains "G+2", which is neither. Anything unrecognised is
 * PASSED THROUGH rather than nulled: floor is a free token by design, and
 * silently discarding a value the user entered is worse than storing one we
 * can't categorise.
 */
export function normaliseFloor(raw) {
  if (raw == null || raw === '') return null
  const tok = normaliseTo(FLOOR_TOKENS, raw)
  if (tok) return tok
  const n = Number(raw)
  if (Number.isFinite(n)) return String(n)
  return String(raw).trim() || null
}

/** Display text for a stored token, tolerant of legacy free text. */
export function labelOf(list, value) {
  if (value == null || value === '') return ''
  const hit = list.find(x => x.value === value) || list.find(x => slug(x.value) === slug(value))
  return hit ? hit.label : String(value)
}

/** Filter options built from the vocabulary — never a second hardcoded list. */
export function optionsOf(list) {
  return list.map(x => ({ value: x.value, label: x.label }))
}
