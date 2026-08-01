import { firmName as tenantFirm } from './tenant.js'
import { localLabel } from '../data/vocabLocale.js'
import { DEFAULT_FOLLOWUPS, fillTemplate, PLACEHOLDERS } from '../data/followUpTemplates.js'
import {
  AREA_UNITS, BHK, FACING, FURNISH, POSSESSION, SOCIETY_AMENITIES, SUBTYPES,
  labelOf, normaliseBhk, normaliseSubtype, normaliseTo,
} from '../data/propertyFields.js'

// --- matching ---------------------------------------------------------------
export function matchesForLead(lead, allProps = []) {
  if (!lead?.req || !allProps?.length) return []
  const r = lead.req
  const UNAVAILABLE = ['Sold', 'Leased', 'Off-Market', 'Blocked', 'Closed', 'Let']
  return allProps
    .filter(p => p.deal === r.deal && p.type === r.config && !UNAVAILABLE.includes(p.status))
    .map(p => {
      let score = 0; const fit = []
      if (p.locality === r.locality) { score += 3; fit.push(r.locality) }
      const inBudget = p.price >= r.budgetMin * 0.95 && p.price <= r.budgetMax * 1.08
      if (inBudget) { score += 3; fit.push('in budget') }
      else if (p.price < r.budgetMin) { score += 1; fit.push('under budget') }
      if (p.status === 'Available') score += 1
      // Compared against 'Immediate', which is not a POSSESSION value — so
      // this never fired once and no match ever showed "ready to move".
      if (normaliseTo(POSSESSION, p.possession) === 'ready') fit.push('ready to move')  // vocab-ok: display prose
      return { ...p, _score: score, fitLine: fit.slice(0, 3).join(' · ') }
    })
    .filter(p => p._score >= 3)
    .sort((a, b) => b._score - a._score)
    .slice(0, 4)
}

export function leadsForProperty(property, allLeads = []) {
  if (!property || !allLeads?.length) return []
  return allLeads
    .filter(l => l.req && l.req.deal === property.deal && l.req.config === property.type && !l.stage?.startsWith('Closed'))
    .map(l => {
      let score = 0; const fit = []
      if (l.req.locality === property.locality) { score += 3; fit.push(l.req.locality) }
      const inBudget = property.price >= l.req.budgetMin * 0.95 && property.price <= l.req.budgetMax * 1.08
      if (inBudget) { score += 3; fit.push('budget fits') }
      else if (property.price < l.req.budgetMin) { score += 1; fit.push('under their budget') }
      return { lead: l, _score: score, fitLine: fit.slice(0, 2).join(' · ') }
    })
    .filter(x => x._score >= 3)
    .sort((a, b) => b._score - a._score)
    .slice(0, 4)
}

// --- Owner-update WhatsApp (activity summary for the property's owner) -------
export function ownerUpdateMessage(property, allLeads = [], firmName = tenantFirm()) {
  const p = property
  const buyers = leadsForProperty(p, allLeads)
  const partyWord = p.deal === 'rent' ? 'tenants' : 'buyers'
  const visits = allLeads.filter(l => l.stage === 'Site Visit' &&
    l.req?.deal === p.deal && l.req?.config === p.type && l.req?.locality === p.locality).length
  const L = []
  L.push(`Namaste ${p.owner || 'Sir/Ma\'am'} ji,`)
  L.push('')
  const d = describeProperty(p)
  L.push(`Update on your ${d.headline} at ${[d.society, d.locality].filter(Boolean).join(', ')}:`)
  L.push(`• ${buyers.length} matching ${partyWord} in our pipeline`)
  if (visits) L.push(`• ${visits} site visit${visits > 1 ? 's' : ''} lined up / done`)
  if (d.price) L.push(`• Currently quoted at ${d.price}${p.negotiable ? ' (negotiable)' : ''}`)
  L.push('')
  if (buyers.length === 0) {
    L.push('Response is a bit slow at the current ask. If you can consider a small adjustment, I can push harder. Let me know.')
  } else {
    L.push('Genuine interest hai. Main follow-up kar raha hoon — koi decision aate hi aapko update karunga.')
  }
  if (firmName) L.push('— ' + firmName)
  return L.join('\n')
}

// --- WhatsApp message generation -------------------------------------------
function ord(n) { return n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th' }

// ---------------------------------------------------------------------------
// Reading a property FOR A HUMAN
// ---------------------------------------------------------------------------
// The message templates were written against the old shape — `type`,
// `furnishing`, `carpet` in hardcoded sqft. A listing added through the current
// form stores `bhk` + `subtype`, `furnishType: 'semi'` and an `areaUnit`, so
// those lines came out blank or, worse, printed a raw token like "semi" to a
// client. This resolves both shapes into finished words ONCE, and every
// template reads from here.
//
// Anything it can't resolve comes back empty, and `bullet()` drops empties —
// so a half-filled listing produces a shorter message, never a broken one.
const money = (n) => {
  const v = Number(n)
  if (!Number.isFinite(v) || v <= 0) return ''
  if (v >= 10000000) return `₹${(v / 10000000).toFixed(2).replace(/\.00$/, '')} Cr`
  if (v >= 100000) return `₹${(v / 100000).toFixed(2).replace(/\.00$/, '')} L`
  return `₹${v.toLocaleString('en-IN')}`
}

export function describeProperty(p = {}, lang = 'English') {
  const category = p.category || 'residential'
  const bhk = p.bhk || normaliseBhk(p.type)
  const subtype = p.subtype || normaliseSubtype(p.type, category)
  const subtypeLabel = localLabel(lang, 'subtype', subtype,
    labelOf(SUBTYPES[category] || SUBTYPES.residential, subtype))
  const bhkLabel = labelOf(BHK, bhk)

  // "3 BHK Apartment" — rebuilt from the two fields that replaced it, falling
  // back to the legacy string for rows that were never migrated.
  const headline = [bhkLabel, subtypeLabel].filter(Boolean).join(' ') || p.type || 'Property'

  const unit = labelOf(AREA_UNITS, p.areaUnit || 'sqft')
  const areaVal = p.carpet || p.builtup || p.superBuiltup || p.plotArea
  const area = areaVal ? `${areaVal} ${unit}` : ''

  const furnish = localLabel(lang, 'furnish', p.furnishType, labelOf(FURNISH, p.furnishType)) || p.furnishing || ''
  const facingTok = normaliseTo(FACING, p.facing)
  const facing = localLabel(lang, 'facing', facingTok, labelOf(FACING, facingTok)) || p.facing || ''
  const possTok = normaliseTo(POSSESSION, p.possession)
  const possession = localLabel(lang, 'possession', possTok, labelOf(POSSESSION, possTok)) || p.possession || ''

  // Amenities are stored as tokens; a client should read "Gym, Lift, Power
  // Backup", not "gym, lift, power_backup".
  const amenities = (p.societyAmenities || [])
    .map(a => localLabel(lang, 'amenity', a, labelOf(SOCIETY_AMENITIES, a))).filter(Boolean)

  // priceLabel is what a broker typed; price is the number. Prefer the typed
  // one, format the number when there isn't one, and never print an empty
  // "Price: **" line.
  const price = p.priceLabel || money(p.price)
  const deposit = p.depositLabel ||
    (p.depositOption === 'custom' ? money(p.depositAmount)
      : p.depositOption === '1mo' ? money(p.price)
        : p.depositOption === '2mo' ? money(Number(p.price) * 2) : '')

  return {
    headline, area, furnish, facing, possession, amenities, price, deposit,
    locality: p.locality || '', society: p.society || p.project || '',
    floor: p.floor || '', age: p.age || '',
    bathrooms: p.bathrooms || '', balconies: p.balconies || '',
    parking: [p.coveredParking ? `${p.coveredParking} covered` : '',
      p.openParking ? `${p.openParking} open` : ''].filter(Boolean).join(' + ') || p.parking || '',
  }
}

// Every line is built from a fact that may be missing on a hand-added listing.
// `bullet` drops any empty part and skips the line entirely if nothing survives,
// so a message can never print "undefined" or a dangling label in front of a client.
function bullet(parts) {
  const kept = parts.filter(x => x !== null && x !== undefined && String(x).trim() !== '')
  return kept.length ? '• ' + kept.join(' · ') : null
}
const push = (L, line) => { if (line) L.push(line) }

function buildSale(p, t, opener, closer, firmName, lang) {
  const d = describeProperty(p, lang)
  const L = []
  L.push(`*${d.headline} ${t.forSale}${d.locality ? ' — ' + d.locality : ''}*`)
  push(L, d.society); L.push('')
  L.push(opener)
  push(L, bullet([
    d.area ? `${d.area} ${t.carpet}` : null,
    d.floor ? `${d.floor}${t.floorSuffix(d.floor)} ${t.floor}` : null,
    d.facing ? `${d.facing} ${t.facing}` : null,
  ]))
  push(L, bullet([
    d.bathrooms ? `${d.bathrooms} ${t.bath}` : null,
    d.balconies ? `${d.balconies} ${t.balcony}` : null,
    d.parking || null,
  ]))
  push(L, bullet([
    d.age ? `${d.age} ${t.yrsOld}` : null,
    d.furnish || null,
    d.possession ? `${t.possession} ${d.possession.toLowerCase()}` : null,
  ]))
  // Highlights come from the listing's own amenities now, not a field nobody
  // fills in — so this section stops being permanently absent.
  const feats = (p.features || p.highlights || d.amenities)
  if (feats && feats.length) { L.push(''); L.push(t.highlights); feats.slice(0, 6).forEach(f => L.push(`✓ ${f}`)) }
  L.push('')
  // Only print a price line when there IS a price. "Price: **" reads as a
  // mistake to whoever receives it.
  if (d.price) L.push(`${t.price}: *${d.price}*${p.negotiable ? ` ${t.negotiable}` : ` — ${t.fixed}`}`)
  L.push(t.ownerDirect)
  L.push(closer); if (firmName) L.push('— ' + firmName)
  return L.join('\n')
}

function buildRent(p, t, opener, closer, firmName, lang) {
  const d = describeProperty(p, lang)
  const L = []
  L.push(`*${d.headline}${d.furnish ? ' ' + d.furnish : ''} — ${t.onRent}*`)
  push(L, [d.society, d.locality].filter(Boolean).join(', '))
  L.push('')
  L.push(opener)
  push(L, bullet([
    d.area || null,
    d.floor ? `${d.floor}${t.floorSuffix(d.floor)} ${t.floor}` : null,
    d.facing ? `${d.facing} ${t.facing}` : null,
  ]))
  push(L, bullet([
    d.bathrooms ? `${d.bathrooms} ${t.bath}` : null,
    d.parking || null,
  ]))
  push(L, bullet([
    p.tenants || t.family,
    d.possession ? `${t.possession} ${d.possession.toLowerCase()}` : null,
  ]))
  const feats = (p.features || p.highlights || d.amenities)
  if (feats && feats.length) { L.push(''); L.push(d.furnish || t.highlights); feats.slice(0, 6).forEach(f => L.push(`✓ ${f}`)) }
  if (p.billsByOwner) { L.push(''); L.push(t.billsByOwner) }
  L.push('')
  if (d.price) L.push(`${t.rent}: *${d.price}*` + (d.deposit ? ` · ${t.deposit}: *${d.deposit}*` : ''))
  L.push(closer); if (firmName) L.push('— ' + firmName)
  return L.join('\n')
}

// Each pack carries BOTH the sentence variants and the structural labels, so
// switching language changes the whole message — not just the first and last line.
const PACKS = {
  Hinglish: {
    openers: ['Bahut hi prime location mein available:', 'Shifting-ready flat, seedha owner se:', 'Genuine deal, market se best price:'],
    closers: ['Site visit ke liye reply karein — weekend slots open hain.', 'Interested ho toh reply karein, aaj hi visit fix kar dete hain.', 'Details ya visit ke liye message karein, turant arrange ho jayega.'],
    forSale: 'for Sale', onRent: 'On Rent', carpet: 'carpet', floor: 'floor', floorSuffix: ord,
    facing: 'facing', yrsOld: 'yrs old', possession: 'possession', highlights: 'Highlights:',
    bath: 'bath', balcony: 'balcony',
    price: 'Price', rent: 'Rent', deposit: 'Deposit', negotiable: '(thoda negotiable)', fixed: 'fixed',
    ownerDirect: 'Owner direct deal, no chain.', family: 'Family', billsByOwner: 'Owner electricity & gas bill pay karega.',
  },
  English: {
    openers: ['Available in a prime location:', 'Move-in ready, directly from owner:', 'Genuine deal at the best market price:'],
    closers: ['Reply to book a site visit — weekend slots open.', "Interested? Reply and we'll fix a visit today.", 'Message for details or a visit, arranged right away.'],
    forSale: 'for Sale', onRent: 'On Rent', carpet: 'carpet', floor: 'floor', floorSuffix: ord,
    facing: 'facing', yrsOld: 'years old', possession: 'possession', highlights: 'Highlights:',
    bath: 'bath', balcony: 'balcony',
    price: 'Price', rent: 'Rent', deposit: 'Deposit', negotiable: '(negotiable)', fixed: 'fixed',
    ownerDirect: 'Direct from owner, no chain.', family: 'Family', billsByOwner: 'Electricity & gas bills paid by owner.',
  },
  Marathi: {
    openers: ['अतिशय उत्तम ठिकाणी उपलब्ध:', 'राहायला तयार फ्लॅट, थेट मालकाकडून:', 'प्रामाणिक व्यवहार, बाजारातील सर्वोत्तम किंमत:'],
    closers: ['साइट व्हिजिटसाठी रिप्लाय करा — वीकेंड स्लॉट उपलब्ध.', 'इच्छुक असाल तर रिप्लाय करा, आजच व्हिजिट ठरवू.', 'अधिक माहिती किंवा व्हिजिटसाठी मेसेज करा.'],
    forSale: 'विक्रीसाठी', onRent: 'भाड्याने', carpet: 'कार्पेट', floor: 'मजला', floorSuffix: () => 'वा',
    facing: 'दिशा', yrsOld: 'वर्षे जुने', possession: 'ताबा', highlights: 'ठळक वैशिष्ट्ये:',
    bath: 'बाथरूम', balcony: 'बाल्कनी',
    price: 'किंमत', rent: 'भाडे', deposit: 'डिपॉझिट', negotiable: '(वाटाघाटीस वाव)', fixed: 'निश्चित',
    ownerDirect: 'थेट मालकाकडून, मध्यस्थ नाही.', family: 'कुटुंब', billsByOwner: 'वीज व गॅस बिल मालक भरेल.',
  },
}

// Hand off to the real WhatsApp app with the message pre-filled.
// On Android/iOS this opens the WhatsApp app; on desktop, WhatsApp Web.
// If we know the recipient's number the chat opens directly on them; otherwise
// WhatsApp asks the user to pick a contact — both are valid, real hand-offs.
export function whatsappLink(message, phone) {
  const digits = String(phone || '').replace(/\D/g, '')
  const text = encodeURIComponent(message || '')
  return digits ? `https://wa.me/${digits}?text=${text}` : `https://wa.me/?text=${text}`
}

// Fields that identify the owner. The shared listing must never carry them
// (spec C: "owner is internal, never in the listing") — the property links to
// an internal Owner contact, and that link is how the firm gets back to them.
const OWNER_IDENTITY_FIELDS = [
  'owner', 'ownerPhone', 'ownerEmail',
  'owner_name', 'owner_phone', 'owner_email', 'ownerContactId',
  // The flat number identifies the exact door as surely as the owner's phone
  // number does. A shared listing that carries it lets a buyer knock and deal
  // direct — the tower and floor are enough for a client to picture the place.
  'unit', 'flat',
]

/**
 * Strip owner identity before a property is turned into anything a client
 * sees. Enforced by REMOVING the fields rather than by trusting every message
 * template not to interpolate them — a template edited a year from now cannot
 * leak what isn't in the object it was handed.
 */
export function shareSafeProperty(property) {
  if (!property) return property
  const clean = { ...property }
  for (const f of OWNER_IDENTITY_FIELDS) delete clean[f]
  return clean
}

export function generateMessage(rawProperty, opts = {}) {
  const property = shareSafeProperty(rawProperty)
  if (!property) return ''
  const firmName = opts.firmName || tenantFirm()
  const lang = opts.lang || 'Hinglish', tone = opts.tone || 'Standard', variant = opts.variant || 0
  const pack = PACKS[lang] || PACKS.Hinglish
  const i = ((variant % 3) + 3) % 3
  const opener = pack.openers[i], closer = pack.closers[i]
  let msg = property.deal === 'rent'
    ? buildRent(property, pack, opener, closer, firmName, lang)
    : buildSale(property, pack, opener, closer, firmName, lang)
  if (tone === 'Short') {
    const rows = msg.split('\n')
    const head = rows.slice(0, 3)
    const priceLine = rows.find(x => x.startsWith('Rent:') || x.startsWith('Price:'))
    msg = [...head, '', opener, priceLine, closer, firmName && '— ' + firmName]
      .filter(x => x !== undefined && x !== false).join('\n')
  }
  return msg
}

// --- Plain follow-up (no property attached) ---------------------------------
// Sending a message without a listing is a normal thing to do, and it used to
// have no template at all — the composer opened blank, then had exactly one
// English sentence regardless of the language chosen. It now uses the same
// language the rest of the composer does, cycles three wordings, and honours
// whatever the firm wrote in Settings.
export function followUpMessage(lead, firmName = tenantFirm(), opts = {}) {
  if (!lead) return ''
  const lang = opts.lang || 'Hinglish'
  const set = (opts.templates && opts.templates[lang]?.length)
    ? opts.templates[lang]
    : (DEFAULT_FOLLOWUPS[lang] || DEFAULT_FOLLOWUPS.English)
  const values = {
    name: String(lead.name || '').split(' ')[0],
    config: labelOf(BHK, lead.req?.config) || lead.req?.config || '',
    locality: lead.req?.locality || '',
    firm: firmName || '',
  }

  // Pick a template this lead can actually fill, starting from the requested
  // variant. Gutting a sentence that referenced a missing locality produced
  // "Hello Amit Shall I send them across?" — the third wording in every set
  // needs only a name, so there is always something that fits.
  const start = ((Number(opts.variant) || 0) % set.length + set.length) % set.length
  const fits = (t) => !PLACEHOLDERS.some(ph =>
    t.includes(ph.token) && !String(values[ph.token.slice(1, -1)] ?? '').trim())
  let chosen = set[start]
  for (let k = 0; k < set.length; k++) {
    const cand = set[(start + k) % set.length]
    if (fits(cand)) { chosen = cand; break }
  }

  const body = fillTemplate(chosen, values)
  const L = [body]
  if (firmName && !body.includes(firmName)) { L.push(''); L.push('— ' + firmName) }
  return L.join('\n')
}
