// ============================================================================
// THE MESSAGE A PROPERTY LINK GOES OUT IN
// ============================================================================
// The firm writes it in Settings → Message templates (stored as
// `sharing.messageTemplate`); the server fills it in when a link is made
// (services/sharing.ts shareText). Read by both, so the tokens the editor offers
// are the tokens the server fills.
//
//   {name}       the buyer's first name
//   {homes}      "Here are 3 homes for you:" and a line per home, five at most
//   {link}       the page with every home on it
//   {agentName}  who sent it
//   {firmName}   the firm
//
// A template without {link} is refused when it is saved: the link is the
// message's whole job.
// ============================================================================

export const DEFAULT_SHARE_TEMPLATE = [
  'Hello {name},',
  '',
  '{homes}',
  '',
  'Photos and details: {link}',
  '',
  'Let me know when you would like to visit.',
  '{agentName}, {firmName}',
].join('\n')

export const SHARE_TOKENS = ['{name}', '{homes}', '{link}', '{agentName}', '{firmName}']

export const shareTemplate = (sharing) => String(sharing?.messageTemplate || '').trim() || DEFAULT_SHARE_TEMPLATE

/**
 * The template with its tokens filled. A token with no value goes with the
 * comma or space that joined it to its neighbour, so a lead with no name reads
 * "Hello," and an unsigned message has no stray comma.
 */
export function fillShareTemplate(tpl, values) {
  let out = String(tpl || '')
  for (const [k, v] of Object.entries(values)) {
    const val = String(v ?? '').trim()
    const re = new RegExp(`(,[ \\t]*|[ \\t]+)?\\{${k}\\}(,[ \\t]*)?`, 'g')
    out = out.replace(re, (m, before, after) => {
      if (val) return (before || '') + val + (after || '')
      if (before && !before.includes(',') && after) return after.trim()
      return ''
    })
  }
  return out.replace(/\n{3,}/g, '\n\n').trim()
}
