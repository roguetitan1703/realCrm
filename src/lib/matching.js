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

function buildSale(p, opener, closer, firmName) {
  const L = []
  L.push(`*${p.type} for Sale — ${p.locality}*`)
  L.push(p.society || ''); L.push('')
  L.push(opener)
  L.push(`• ${p.carpet} sqft carpet · ${p.floor}${ord(p.floor)} floor · ${p.facing} facing`)
  L.push(`• ${p.age} yrs old · ${(p.furnishing || '').toLowerCase()} · possession ${(p.possession || '').toLowerCase()}`)
  L.push(''); L.push('Highlights:')
  if (p.features || p.highlights) (p.features || p.highlights).forEach(f => L.push(`✓ ${f}`))
  L.push('')
  L.push(`Price: *${p.priceLabel}*${p.negotiable ? ' (thoda negotiable)' : ' — fixed'}`)
  L.push('Owner direct deal, no chain.')
  L.push(closer); L.push('— ' + firmName)
  return L.join('\n')
}

function buildRent(p, opener, closer, firmName) {
  const L = []
  L.push(`*${p.type} ${p.furnishing || ''} — On Rent*`)
  L.push(`${p.society || ''}, ${p.locality}`); L.push('')
  L.push(opener)
  L.push(`• ${p.carpet} sqft · ${p.floor}${ord(p.floor)} floor · ${p.facing} facing`)
  L.push(`• ${p.tenants || 'Family'} · possession ${p.possession || ''}`)
  L.push(''); L.push(`${p.furnishing || 'Features'}:`)
  if (p.features || p.highlights) (p.features || p.highlights).forEach(f => L.push(`✓ ${f}`))
  if (p.billsByOwner) { L.push(''); L.push('Owner electricity & gas bill pay karega.') }
  L.push('')
  L.push(`Rent: *${p.priceLabel}* · Deposit: *${p.depositLabel || 'N/A'}*`)
  L.push(closer); L.push('— ' + firmName)
  return L.join('\n')
}

const PACKS = {
  Hinglish: {
    openers: ['Bahut hi prime location mein available:', 'Shifting-ready flat, seedha owner se:', 'Genuine deal, market se best price:'],
    closers: ['Site visit ke liye reply karein — weekend slots open hain.', 'Interested ho toh reply karein, aaj hi visit fix kar dete hain.', 'Details ya visit ke liye message karein, turant arrange ho jayega.'],
  },
  English: {
    openers: ['Available in a prime location:', 'Move-in ready, directly from owner:', 'Genuine deal at the best market price:'],
    closers: ['Reply to book a site visit — weekend slots open.', "Interested? Reply and we'll fix a visit today.", 'Message for details or a visit, arranged right away.'],
  },
  Marathi: {
    openers: ['अतिशय उत्तम ठिकाणी उपलब्ध:', 'राहायला तयार फ्लॅट, थेट मालकाकडून:', 'प्रामाणिक व्यवहार, बाजारातील सर्वोत्तम किंमत:'],
    closers: ['साइट व्हिजिटसाठी रिप्लाय करा — वीकेंड स्लॉट उपलब्ध.', 'इच्छुक असाल तर रिप्लाय करा, आजच व्हिजिट ठरवू.', 'अधिक माहिती किंवा व्हिजिटसाठी मेसेज करा.'],
  },
}

export function generateMessage(property, opts = {}) {
  if (!property) return ''
  const firmName = opts.firmName || FIRM
  const lang = opts.lang || 'Hinglish', tone = opts.tone || 'Standard', variant = opts.variant || 0
  const pack = PACKS[lang] || PACKS.Hinglish
  const i = ((variant % 3) + 3) % 3
  const opener = pack.openers[i], closer = pack.closers[i]
  let msg = property.deal === 'rent' ? buildRent(property, opener, closer, firmName) : buildSale(property, opener, closer, firmName)
  if (tone === 'Short') {
    const rows = msg.split('\n')
    const head = rows.slice(0, 3)
    const priceLine = rows.find(x => x.startsWith('Rent:') || x.startsWith('Price:'))
    msg = [...head, '', opener, priceLine, closer, '— ' + firmName].join('\n')
  }
  return msg
}
