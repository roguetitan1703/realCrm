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
export const BHK = [
  o('1rk', '1 RK'), o('1', '1 BHK'), o('1.5', '1.5 BHK'), o('2', '2 BHK'),
  o('2.5', '2.5 BHK'), o('3', '3 BHK'), o('3.5', '3.5 BHK'), o('4', '4 BHK'),
  o('4.5', '4.5 BHK'), o('5', '5 BHK'), o('5plus', '5+ BHK'),
]

export const COUNT_0_4 = ['0', '1', '2', '3', '4+'].map(v => o(v, v))
export const COUNT_1_4 = ['1', '2', '3', '4+'].map(v => o(v, v))
export const COUNT_0_3 = ['0', '1', '2', '3', '3+'].map(v => o(v, v))

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
export const AREA_UNITS = [
  o('sqft', 'sq.ft'), o('sqyd', 'sq.yd / gaj'), o('sqm', 'sq.m'), o('acre', 'acre'),
]

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

// ---- Both -------------------------------------------------------------------
// "Brokerage" is called Consulting throughout the product (spec Q4).
export const CONSULTING_OPTIONS = [
  o('none', 'None'), o('15d', '15 days'), o('30d', '30 days'), o('custom', 'Custom'),
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

export function appliesTo({ category = 'residential', deal = 'sale', subtype = 'apartment' } = {}) {
  const plot = isPlot(subtype)
  const residential = category === 'residential'
  return {
    bhk: residential && !plot,
    bathrooms: !plot,
    balconies: residential && !plot,
    furnishing: !plot,
    floors: !plot,
    servantRoom: residential && !plot,
    plotFields: plot,
    rentTerms: deal === 'rent',
    saleTerms: deal === 'sale',
    tenantPreference: deal === 'rent' && residential,
  }
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
  if (Number(n) >= 5) return '5plus'
  return BHK.some(b => b.value === n) ? n : null
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
