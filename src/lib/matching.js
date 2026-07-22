import { FIRM } from '../data/theme.js'

// --- matching ---------------------------------------------------------------
export function matchesForLead(lead, allProps = []) {
  if (!lead?.req || !allProps?.length) return []
  const r = lead.req
  return allProps
    .filter(p => p.deal === r.deal && p.type === r.config && p.status !== 'Closed')
    .map(p => {
      let score = 0; const fit = []
      if (p.locality === r.locality) { score += 3; fit.push(r.locality) }
      const inBudget = p.price >= r.budgetMin * 0.95 && p.price <= r.budgetMax * 1.08
      if (inBudget) { score += 3; fit.push('in budget') }
      else if (p.price < r.budgetMin) { score += 1; fit.push('under budget') }
      if (p.status === 'Available') score += 1
      if (p.possession === 'Immediate') fit.push('ready to move')
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
export function ownerUpdateMessage(property, allLeads = [], firmName = FIRM) {
  const p = property
  const buyers = leadsForProperty(p, allLeads)
  const partyWord = p.deal === 'rent' ? 'tenants' : 'buyers'
  const visits = allLeads.filter(l => l.stage === 'Site Visit' &&
    l.req?.deal === p.deal && l.req?.config === p.type && l.req?.locality === p.locality).length
  const L = []
  L.push(`Namaste ${p.owner || 'Sir/Ma\'am'} ji,`)
  L.push('')
  L.push(`Update on your ${p.type} at ${p.society}, ${p.locality}:`)
  L.push(`• ${buyers.length} matching ${partyWord} in our pipeline`)
  if (visits) L.push(`• ${visits} site visit${visits > 1 ? 's' : ''} lined up / done`)
  L.push(`• Currently quoted at ${p.priceLabel}${p.negotiable ? ' (negotiable)' : ''}`)
  L.push('')
  if (buyers.length === 0) {
    L.push('Response is a bit slow at the current ask. If you can consider a small adjustment, I can push harder. Let me know.')
  } else {
    L.push('Genuine interest hai. Main follow-up kar raha hoon — koi decision aate hi aapko update karunga.')
  }
  L.push('— ' + firmName)
  return L.join('\n')
}

// --- WhatsApp message generation -------------------------------------------
function ord(n) { return n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th' }

// Every line is built from a fact that may be missing on a hand-added listing.
// `bullet` drops any empty part and skips the line entirely if nothing survives,
// so a message can never print "undefined" or a dangling label in front of a client.
function bullet(parts) {
  const kept = parts.filter(x => x !== null && x !== undefined && String(x).trim() !== '')
  return kept.length ? '• ' + kept.join(' · ') : null
}
const push = (L, line) => { if (line) L.push(line) }

function buildSale(p, t, opener, closer, firmName) {
  const L = []
  L.push(`*${p.type} ${t.forSale} — ${p.locality}*`)
  push(L, p.society); L.push('')
  L.push(opener)
  push(L, bullet([
    p.carpet ? `${p.carpet} sqft ${t.carpet}` : null,
    p.floor ? `${p.floor}${t.floorSuffix(p.floor)} ${t.floor}` : null,
    p.facing ? `${p.facing} ${t.facing}` : null,
  ]))
  push(L, bullet([
    p.age ? `${p.age} ${t.yrsOld}` : null,
    p.furnishing ? String(p.furnishing).toLowerCase() : null,
    p.possession ? `${t.possession} ${String(p.possession).toLowerCase()}` : null,
  ]))
  const feats = p.features || p.highlights
  if (feats && feats.length) { L.push(''); L.push(t.highlights); feats.forEach(f => L.push(`✓ ${f}`)) }
  L.push('')
  L.push(`${t.price}: *${p.priceLabel}*${p.negotiable ? ` ${t.negotiable}` : ` — ${t.fixed}`}`)
  L.push(t.ownerDirect)
  L.push(closer); L.push('— ' + firmName)
  return L.join('\n')
}

function buildRent(p, t, opener, closer, firmName) {
  const L = []
  L.push(`*${p.type}${p.furnishing ? ' ' + p.furnishing : ''} — ${t.onRent}*`)
  push(L, [p.society, p.locality].filter(Boolean).join(', '))
  L.push('')
  L.push(opener)
  push(L, bullet([
    p.carpet ? `${p.carpet} sqft` : null,
    p.floor ? `${p.floor}${t.floorSuffix(p.floor)} ${t.floor}` : null,
    p.facing ? `${p.facing} ${t.facing}` : null,
  ]))
  push(L, bullet([
    p.tenants || t.family,
    p.possession ? `${t.possession} ${String(p.possession).toLowerCase()}` : null,
  ]))
  const feats = p.features || p.highlights
  if (feats && feats.length) { L.push(''); L.push(p.furnishing || t.highlights); feats.forEach(f => L.push(`✓ ${f}`)) }
  if (p.billsByOwner) { L.push(''); L.push(t.billsByOwner) }
  L.push('')
  L.push(`${t.rent}: *${p.priceLabel}*` + (p.depositLabel ? ` · ${t.deposit}: *${p.depositLabel}*` : ''))
  L.push(closer); L.push('— ' + firmName)
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
    price: 'Price', rent: 'Rent', deposit: 'Deposit', negotiable: '(thoda negotiable)', fixed: 'fixed',
    ownerDirect: 'Owner direct deal, no chain.', family: 'Family', billsByOwner: 'Owner electricity & gas bill pay karega.',
  },
  English: {
    openers: ['Available in a prime location:', 'Move-in ready, directly from owner:', 'Genuine deal at the best market price:'],
    closers: ['Reply to book a site visit — weekend slots open.', "Interested? Reply and we'll fix a visit today.", 'Message for details or a visit, arranged right away.'],
    forSale: 'for Sale', onRent: 'On Rent', carpet: 'carpet', floor: 'floor', floorSuffix: ord,
    facing: 'facing', yrsOld: 'years old', possession: 'possession', highlights: 'Highlights:',
    price: 'Price', rent: 'Rent', deposit: 'Deposit', negotiable: '(negotiable)', fixed: 'fixed',
    ownerDirect: 'Direct from owner, no chain.', family: 'Family', billsByOwner: 'Electricity & gas bills paid by owner.',
  },
  Marathi: {
    openers: ['अतिशय उत्तम ठिकाणी उपलब्ध:', 'राहायला तयार फ्लॅट, थेट मालकाकडून:', 'प्रामाणिक व्यवहार, बाजारातील सर्वोत्तम किंमत:'],
    closers: ['साइट व्हिजिटसाठी रिप्लाय करा — वीकेंड स्लॉट उपलब्ध.', 'इच्छुक असाल तर रिप्लाय करा, आजच व्हिजिट ठरवू.', 'अधिक माहिती किंवा व्हिजिटसाठी मेसेज करा.'],
    forSale: 'विक्रीसाठी', onRent: 'भाड्याने', carpet: 'कार्पेट', floor: 'मजला', floorSuffix: () => 'वा',
    facing: 'दिशा', yrsOld: 'वर्षे जुने', possession: 'ताबा', highlights: 'ठळक वैशिष्ट्ये:',
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

export function generateMessage(property, opts = {}) {
  if (!property) return ''
  const firmName = opts.firmName || FIRM
  const lang = opts.lang || 'Hinglish', tone = opts.tone || 'Standard', variant = opts.variant || 0
  const pack = PACKS[lang] || PACKS.Hinglish
  const i = ((variant % 3) + 3) % 3
  const opener = pack.openers[i], closer = pack.closers[i]
  let msg = property.deal === 'rent'
    ? buildRent(property, pack, opener, closer, firmName)
    : buildSale(property, pack, opener, closer, firmName)
  if (tone === 'Short') {
    const rows = msg.split('\n')
    const head = rows.slice(0, 3)
    const priceLine = rows.find(x => x.startsWith('Rent:') || x.startsWith('Price:'))
    msg = [...head, '', opener, priceLine, closer, '— ' + firmName].join('\n')
  }
  return msg
}
