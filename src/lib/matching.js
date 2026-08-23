import { isOpen } from '../data/leadStatus.js'
import { askedFor, budgetOf, facetFit, latestOf, localityFit } from './format.js'
import { firmName as tenantFirm } from './tenant.js'
import { localLabel } from '../data/vocabLocale.js'
import {
  AREA_UNITS, BHK, COUNTED_ITEMS, FACING, FIXTURES, FURNISH, OWNERSHIP,
  POSSESSION, SOCIETY_AMENITIES, SUBTYPES, TRANSACTION,
  labelOf, normaliseBhk, normaliseSubtype, normaliseTo,
} from '../data/propertyFields.js'

// --- matching ---------------------------------------------------------------
export function matchesForLead(lead, allProps = []) {
  if (!lead?.req || !allProps?.length) return []
  // EVERYTHING THEY HAVE ASKED FOR, not the latest point — 2–3 BHK and
  // ₹68L–₹95L, where the record shows two enquiries at either end. askedFor()
  // widens the lead's own requirement by its enquiry history, and it is the
  // same span the server narrows the book on.
  const r = askedFor(lead)
  const UNAVAILABLE = ['Sold', 'Leased', 'Off-Market', 'Blocked', 'Closed', 'Let']
  return allProps
    // `p.type === r.config` was a HARD FILTER here: "2 BHK Apartment" against
    // "2 BHK", which is never equal, so this list was almost always empty and
    // the buyer suggestions on a lead have effectively never worked. Config is
    // now compared through the shared vocabulary and — crucially — is a SCORE,
    // not a gate. Showing a 3 BHK to someone who asked for 2 is a conversation
    // an agent has every day; refusing to show it is not a feature.
    // The one true disqualifier stays a filter: a shop is not a home.
    .filter(p => p.deal === r.deal && !UNAVAILABLE.includes(p.status) && !facetFit(p, r).hard)
    .map(p => {
      let score = 0; const fit = []
      const f = facetFit(p, r)
      if (f.bhkMatch) { score += 3; fit.push(labelOf(BHK, f.want.bhk)) }
      else if (f.subtypeMatch) { score += 2 }
      if (localityFit(p, r)) { score += 3; fit.push(p.locality) }
      // budgetOf() reads whichever spelling the record carries — see its note.
      // This compared against r.budgetMin, which no lead has, so `inBudget` was
      // false for every property and the +3 it is worth was never awarded. With
      // the threshold at >= 3, that alone decided which matches appeared.
      const { min: bMin, max: bMax } = budgetOf(r)
      const inBudget = p.price >= bMin * 0.95 && p.price <= bMax * 1.08
      if (inBudget) { score += 3; fit.push('in budget') }
      else if (p.price < bMin) { score += 1; fit.push('under budget') }
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
    // Same defect, mirrored: the buyers shown ON a listing were filtered by the
    // same never-true string compare.
    .filter(l => l.req && l.req.deal === property.deal && isOpen(l.stage) && !facetFit(property, l.req).hard)
    .map(l => {
      let score = 0; const fit = []
      const f = facetFit(property, l.req)
      if (f.bhkMatch) { score += 3; fit.push(labelOf(BHK, f.want.bhk)) }
      else if (f.subtypeMatch) { score += 2 }
      // Through the same comparison as the other direction — a requirement
      // that names two areas answers a listing in either.
      if (localityFit(property, l.req)) { score += 3; fit.push(property.locality) }
      const { min: bMin, max: bMax } = budgetOf(l.req)
      const inBudget = property.price >= bMin * 0.95 && property.price <= bMax * 1.08
      if (inBudget) { score += 3; fit.push('budget fits') }
      else if (property.price < bMin) { score += 1; fit.push('under their budget') }
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
  // Third copy of the same never-true compare — this one decided a number sent
  // to the OWNER in a WhatsApp message, so it reported 0 visits forever.
  // Through localityFit like the other two — this was the last raw compare of
  // the three, and it decides a number sent to the OWNER in a WhatsApp message.
  const visits = allLeads.filter(l => l.stage === 'Site Visit' &&
    l.req?.deal === p.deal && localityFit(p, l.req) && !facetFit(p, l.req).hard).length
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
function bullet(parts, marker = '•') {
  const kept = parts.filter(x => x !== null && x !== undefined && String(x).trim() !== '')
  return kept.length ? marker + ' ' + kept.join(' · ') : null
}
const push = (L, line) => { if (line) L.push(line) }

// Emoji here are LINE MARKERS, one per line, each meaning the thing beside it —
// a price line starts with a price emoji, a location line with a pin. That is
// how brokers on WhatsApp already write, and it makes a message scannable on a
// phone without reading it. Decorative emoji, or two on one line, is the tell
// that a machine wrote it, so there are none.
const E = {
  home: '🏡', pin: '📍', area: '📐', floor: '🏢', bath: '🛁', car: '🚗',
  key: '🔑', star: '✨', money: '💰', call: '📞', info: 'ℹ️',
  doc: '📄', sofa: '🛋️',
}

// The listing's own description, appended only when the sender asks for it.
//
// This is the one part of a message we could never write: the client typed a
// real paragraph about the township, its clubhouse and its green cover, and no
// template can invent that. It is opt-in rather than automatic because it is
// long — pasting 1,500 characters into a chat reads as a forwarded brochure,
// not as a broker talking to someone — so the sender decides per message.
function descriptionBlock(p, t) {
  const text = String(p.description || '').trim()
  if (!text) return null
  return ['', `${E.info} *${t.about}*`, text]
}

function buildSale(p, t, opener, closer, firmName, lang, opts) {
  const d = describeProperty(p, lang)
  const L = []
  // Headline carries what it IS and where. The society used to sit on its own
  // line under it, which cost a line to say one word.
  L.push(`${E.home} *${d.headline} — ${t.forSale}*`)
  push(L, d.society ? `*${d.society}*` : null)
  push(L, d.locality ? `${E.pin} ${d.locality}` : null)
  L.push('')
  // The openers were three canned sentences that asserted nothing checkable
  // ("prime location", "best price in the market") and pushed the actual facts
  // a line further down. A buyer scanning ten forwards reads the specs.
  push(L, facts(L, d, p, t))
  push(L, bullet([
    d.bathrooms ? `${d.bathrooms} ${t.bath}` : null,
    d.balconies ? `${d.balconies} ${t.balcony}` : null,
    d.parking || null,
  ], E.bath))
  push(L, bullet([
    d.possession || null,
    d.furnish || null,
    d.age ? `${d.age} ${t.yrsOld}` : null,
  ], E.key))
  push(L, paperwork(p, t, lang))
  push(L, bullet(contents(p, lang), E.sofa))
  // Amenities on ONE line, separated. Six ✓ lines for "Lift, Power Backup"
  // spent a third of the message on the least distinguishing facts in it.
  const feats = (p.features || p.highlights || d.amenities)
  if (feats && feats.length) { L.push(''); L.push(`${E.star} ${feats.slice(0, 8).join(' · ')}`) }
  L.push('')
  // Only print a price line when there IS a price. "Price: **" reads as a
  // mistake to whoever receives it. `— fixed` is gone: stating a negotiating
  // position the sender did not choose is not this template's call. Negotiable
  // still prints, because that one is a fact someone ticked.
  if (d.price) L.push(`${E.money} *${d.price}*${p.negotiable ? ` ${t.negotiable}` : ''}`)
  if (opts?.includeDescription) push2(L, descriptionBlock(p, t))
  L.push('')
  L.push(`${E.call} ${closer}`)
  if (firmName) L.push(`— ${firmName}`)
  return L.join('\n')
}

function buildRent(p, t, opener, closer, firmName, lang, opts) {
  const d = describeProperty(p, lang)
  const L = []
  L.push(`${E.home} *${d.headline}${d.furnish ? ' ' + d.furnish : ''} — ${t.onRent}*`)
  push(L, d.society ? `*${d.society}*` : null)
  push(L, d.locality ? `${E.pin} ${d.locality}` : null)
  L.push('')
  push(L, facts(L, d, p, t))
  push(L, bullet([
    d.bathrooms ? `${d.bathrooms} ${t.bath}` : null,
    d.parking || null,
  ], E.bath))
  push(L, bullet([
    p.tenants || t.family,
    d.possession || null,
  ], E.key))
  push(L, bullet(contents(p, lang), E.sofa))
  const feats = (p.features || p.highlights || d.amenities)
  if (feats && feats.length) { L.push(''); L.push(`${E.star} ${feats.slice(0, 8).join(' · ')}`) }
  if (p.billsByOwner) { L.push(''); L.push(t.billsByOwner) }
  L.push('')
  if (d.price) L.push(`${E.money} *${d.price}*` + (d.deposit ? ` · ${t.deposit} *${d.deposit}*` : ''))
  if (opts?.includeDescription) push2(L, descriptionBlock(p, t))
  L.push('')
  L.push(`${E.call} ${closer}`)
  if (firmName) L.push(`— ${firmName}`)
  return L.join('\n')
}

// Size and position — the first thing anyone checks. Carpet was the only area
// printed, so a listing that recorded all three showed the smallest of them
// and nothing else; an Indian buyer asks for super built-up by name.
function facts(L, d, p, t) {
  // All three areas when the listing records all three. Only carpet used to
  // print, so a record that captured built-up and super built-up showed the
  // smallest of the three and nothing else — and super built-up is the one an
  // Indian buyer asks for by name.
  const areas = [
    d.area ? `${d.area} ${t.carpet}` : null,
    p.builtup ? `${fmtArea(p.builtup, p.areaUnit)} ${t.builtUp}` : null,
    p.superBuiltup ? `${fmtArea(p.superBuiltup, p.areaUnit)} ${t.superBuiltUp}` : null,
  ].filter(Boolean)
  push(L, bullet(areas, E.area))
  // Tower and floor, not the flat number — the tower is enough for a client to
  // picture where in the project it sits, and the door number is what lets
  // them knock and deal direct (see OWNER_IDENTITY_FIELDS).
  return bullet([
    p.tower || null,
    d.floor ? `${d.floor}${t.floorSuffix(d.floor)} ${t.floor}${p.totalFloors ? ` ${t.of} ${p.totalFloors}` : ''}` : null,
    d.facing ? `${d.facing} ${t.facing}` : null,
  ], E.floor)
}

// What's inside the flat, when it is furnished enough for there to be anything
// to list. `countedItems` is stored as {token: n}, `fixtures` as tokens — both
// were recorded on the form and neither ever reached a client.
function contents(p, lang) {
  const counted = Object.entries(p.countedItems || {})
    .filter(([, n]) => Number(n) > 0)
    .map(([k, n]) => `${n} ${localLabel(lang, 'counted', k, labelOf(COUNTED_ITEMS, k)) || k}`)
  const fixtures = (p.fixtures || [])
    .map(f => localLabel(lang, 'fixture', f, labelOf(FIXTURES, f))).filter(Boolean)
  return [...counted, ...fixtures]
}

// Paper facts a buyer asks before a visit, both already on the form and
// neither ever sent. Freehold-vs-leasehold and new-vs-resale decide whether
// someone is interested at all.
function paperwork(p, t, lang) {
  return bullet([
    p.ownership ? localLabel(lang, 'ownership', p.ownership, labelOf(OWNERSHIP, p.ownership)) : null,
    p.transactionType ? localLabel(lang, 'transaction', p.transactionType, labelOf(TRANSACTION, p.transactionType)) : null,
  ], E.doc)
}
const fmtArea = (v, unit) => `${v} ${unit === 'sqm' ? 'sq.m' : 'sq.ft'}`
const push2 = (L, lines) => { if (lines) lines.forEach(x => L.push(x)) }

// Each pack carries BOTH the sentence variants and the structural labels, so
// switching language changes the whole message — not just the first and last line.
const PACKS = {
  Hinglish: {
    openers: ['Bahut hi prime location mein available:', 'Shifting-ready flat, seedha owner se:', 'Genuine deal, market se best price:'],
    closers: ['Site visit ke liye reply karein — weekend slots open hain.', 'Interested ho toh reply karein, aaj hi visit fix kar dete hain.', 'Details ya visit ke liye message karein, turant arrange ho jayega.'],
    forSale: 'For Sale', onRent: 'On Rent', carpet: 'carpet', floor: 'floor', floorSuffix: ord,
    facing: 'facing', yrsOld: 'yrs old', possession: 'possession', highlights: 'Highlights:',
    bath: 'bath', balcony: 'balcony',
    price: 'Price', rent: 'Rent', deposit: 'Deposit', negotiable: '(thoda negotiable)', fixed: 'fixed',
    family: 'Family', billsByOwner: 'Owner electricity & gas bill pay karega.',
    superBuiltUp: 'super built-up', of: 'of', about: 'Project ke baare mein', builtUp: 'built-up',  // vocab-ok: display prose
  },
  English: {
    openers: ['Available in a prime location:', 'Move-in ready, directly from owner:', 'Genuine deal at the best market price:'],
    closers: ['Reply to book a site visit — weekend slots open.', "Interested? Reply and we'll fix a visit today.", 'Message for details or a visit, arranged right away.'],
    forSale: 'For Sale', onRent: 'On Rent', carpet: 'carpet', floor: 'floor', floorSuffix: ord,
    facing: 'facing', yrsOld: 'years old', possession: 'possession', highlights: 'Highlights:',
    bath: 'bath', balcony: 'balcony',
    price: 'Price', rent: 'Rent', deposit: 'Deposit', negotiable: '(negotiable)', fixed: 'fixed',
    family: 'Family', billsByOwner: 'Electricity & gas bills paid by owner.',
    superBuiltUp: 'super built-up', of: 'of', about: 'About the project', builtUp: 'built-up',  // vocab-ok: display prose
  },
  Marathi: {
    openers: ['अतिशय उत्तम ठिकाणी उपलब्ध:', 'राहायला तयार फ्लॅट, थेट मालकाकडून:', 'प्रामाणिक व्यवहार, बाजारातील सर्वोत्तम किंमत:'],
    closers: ['साइट व्हिजिटसाठी रिप्लाय करा — वीकेंड स्लॉट उपलब्ध.', 'इच्छुक असाल तर रिप्लाय करा, आजच व्हिजिट ठरवू.', 'अधिक माहिती किंवा व्हिजिटसाठी मेसेज करा.'],
    forSale: 'विक्रीसाठी', onRent: 'भाड्याने', carpet: 'कार्पेट', floor: 'मजला', floorSuffix: () => 'वा',
    facing: 'दिशा', yrsOld: 'वर्षे जुने', possession: 'ताबा', highlights: 'ठळक वैशिष्ट्ये:',
    bath: 'बाथरूम', balcony: 'बाल्कनी',
    price: 'किंमत', rent: 'भाडे', deposit: 'डिपॉझिट', negotiable: '(वाटाघाटीस वाव)', fixed: 'निश्चित',
    family: 'कुटुंब', billsByOwner: 'वीज व गॅस बिल मालक भरेल.',
    superBuiltUp: 'सुपर बिल्ट-अप', of: 'पैकी', about: 'प्रकल्पाविषयी', builtUp: 'बिल्ट-अप',
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
    ? buildRent(property, pack, opener, closer, firmName, lang, opts)
    : buildSale(property, pack, opener, closer, firmName, lang, opts)
  if (tone === 'Short') {
    // Identity, price, one call to action. The price line is found by its
    // marker rather than by an English prefix — the old version looked for
    // 'Price:' / 'Rent:', so a Marathi message came out with no price in it.
    const rows = msg.split('\n')
    const head = rows.slice(0, 3).filter(Boolean)
    const priceLine = rows.find(x => x.startsWith(E.money))
    msg = [...head, '', priceLine, `${E.call} ${closer}`, firmName && '— ' + firmName]
      .filter(Boolean).join('\n')
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
  const tpl = opts.whatsappIntroTemplate
    || opts.introTemplate
    || 'Hello {name}, I received your inquiry for a {requirement} in {locality} via {source}. I am reaching out from {firmName}. We have several excellent options matching your preferences. When would be a convenient time to connect over a quick call?'

  const firstName = String(lead.name || 'there').trim().split(' ')[0]
  // ONE VALUE EACH, because this is a sentence sent to the buyer. An
  // accumulating field rendered straight would say "a 2 BHK,3 BHK in
  // Mahalunge,Wakad" to a client, and a "+1" is desk shorthand that means
  // nothing to them — so the message names the current ask and no more.
  const config = latestOf(lead.req?.config) || ''
  const configLabel = labelOf(BHK, config) || config
  const dealLabel = lead.req?.deal ? (lead.req.deal === 'rent' ? 'Rent' : 'Sale') : ''
  const reqStr = [configLabel, dealLabel].filter(Boolean).join(' ') || 'property'
  const locStr = latestOf(lead.req?.locality) || 'your preferred location'
  const sourceStr = lead.source || 'our portal'
  const firm = firmName || 'our team'

  let text = tpl
    .replace(/\{name\}/gi, firstName)
    .replace(/\{firmName\}/gi, firm)
    .replace(/\{firm\}/gi, firm)
    .replace(/\{requirement\}/gi, reqStr)
    .replace(/\{locality\}/gi, locStr)
    .replace(/\{source\}/gi, sourceStr)

  return text.trim()
}
