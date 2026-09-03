// ============================================================================
// 💬 FOLLOW-UP TEMPLATES — the message when no property is attached
// ============================================================================
// There was one hardcoded sentence for this, in English, regardless of the
// language the agent had picked. Sending a message without a listing is the
// commonest outreach there is, so it got the least thought and the most use.
//
// Three per language, so the same buyer chased three times does not receive
// the identical paragraph. Editable per firm in Settings — a broker's own
// wording beats ours, and this is the text their client actually reads.
//
// Placeholders are filled from the lead; any that has no value is dropped
// along with the clause around it (see fillTemplate), so a lead with no
// locality on file gets a shorter message rather than "looking in ."
// ============================================================================

export const PLACEHOLDERS = [
  { token: '{name}', label: 'First name' },
  { token: '{config}', label: 'Configuration' },
  { token: '{locality}', label: 'Locality' },
  { token: '{firm}', label: 'Firm name' },
]

export const DEFAULT_FOLLOWUPS = {
  English: [
    'Hello {name}, a few options have come up for your {config} requirement in {locality}. Shall I send them across?',
    'Hi {name}, some new listings in {locality} are close to your budget. Would you like to see them?',
    'Hello {name}, following up on your property search. Would this weekend suit you for a visit?',
  ],
  Marathi: [
    'नमस्कार {name}, {locality} मध्ये तुमच्या {config} गरजेसाठी काही चांगले पर्याय आले आहेत. पाठवू का?',
    'नमस्कार {name}, {locality} मध्ये तुमच्या बजेटजवळची नवीन प्रॉपर्टी आली आहे. बघायला आवडेल का?',
    'नमस्कार {name}, तुमच्या प्रॉपर्टी शोधाबाबत विचारपूस करत आहे. या शनिवार-रविवारी भेट ठरवूया का?',
  ],
}

/**
 * Fill a template. A clause containing a placeholder with no value is dropped
 * whole — "for your requirement in" with nothing after it reads as a bug to
 * the person receiving it, and they cannot tell it was our data that was
 * missing rather than our competence.
 */
export function fillTemplate(text, values) {
  const out = String(text || '')
    // Split on the separators a sentence actually uses, so only the broken
    // fragment is removed rather than the whole line.
    .split(/(?<=[.!?])\s+/)
    .map(sentence => {
      const missing = PLACEHOLDERS.some(p =>
        sentence.includes(p.token) && !String(values[p.token.slice(1, -1)] ?? '').trim())
      if (!missing) return sentence
      // Try trimming just the trailing clause before giving up on the sentence.
      const clauses = sentence.split(/,\s*/)
      const kept = clauses.filter(c => !PLACEHOLDERS.some(p =>
        c.includes(p.token) && !String(values[p.token.slice(1, -1)] ?? '').trim()))
      return kept.length ? kept.join(', ') + (/[.!?]$/.test(sentence) ? '' : '') : ''
    })
    .filter(Boolean)
    .join(' ')

  return PLACEHOLDERS
    .reduce((acc, p) => acc.split(p.token).join(String(values[p.token.slice(1, -1)] ?? '')), out)
    .replace(/\s{2,}/g, ' ')
    .trim()
}
