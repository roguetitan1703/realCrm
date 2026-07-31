#!/usr/bin/env node
// ============================================================================
// 🔒 VOCABULARY GUARD — stops the same bug from landing a sixth time
// ============================================================================
// Block C introduced ONE canonical vocabulary (src/data/propertyFields.js) that
// the add form, the filters, the record sheet, the table and the share message
// all read from. The rule is simple: a property's enumerable values are
// declared there and nowhere else.
//
// It was broken five separate times, and every break looked harmless in review:
//
//   1. the Properties FILTER offered ['1BHK','2BHK','3BHK'] while rows held
//      "3 BHK Apartment"          → almost nothing matched
//   2. the RECORD SHEET offered  ['2 BHK Apartment', 'Semi-furnished']
//                                → its editor wrote values filters can't match
//   3. the TABLE COLUMNS read p.type / p.furnishing / hardcoded ' sqft'
//                                → three columns showed "—" on new listings
//   4. the STATUS MODAL wrote    ['Available','Under offer','Closed']
//                                → 'Under Offer' is the real value and 'Closed'
//                                  does not exist: this one corrupted rows
//   5. headerFacts read p.type   → the identity line came out half empty
//
// Reviewing for this doesn't work — the literals read as perfectly ordinary
// strings. So it's checked mechanically instead.
//
// WHAT IT FLAGS
//   (a) NEAR-MISSES: a string that differs from a real vocabulary label only by
//       case, spacing or punctuation — 'Under offer' for 'Under Offer',
//       'Semi-furnished' for 'Semi Furnished'. These are the dangerous ones
//       because they look right and silently miss every comparison.
//   (b) RE-DECLARED LISTS: an array literal holding two or more strings that
//       are vocabulary labels. That's a second copy of a list by definition.
//
// It deliberately does NOT flag a lone exact label. "Available" appears
// legitimately in prose, empty states and seed data, and a guard that cries
// wolf gets switched off — which would cost more than it saves.
//
// ESCAPE HATCH: put `vocab-ok` in a comment on the line, for the rare place a
// literal is genuinely right (a migration reading historic values, say).
// ============================================================================

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { pathToFileURL } from 'node:url'

const ROOT = process.cwd()
const VOCAB_FILE = join(ROOT, 'src', 'data', 'propertyFields.js')

// The vocabulary is the authority, so it is IMPORTED rather than parsed — the
// check can never drift from the thing it is checking.
const vocab = await import(pathToFileURL(VOCAB_FILE).href)

// Files allowed to hold vocabulary-shaped strings.
const ALLOWED = [
  join('src', 'data', 'propertyFields.js'),   // the source of truth itself
  join('src', 'data', 'defaultDataset.js'),   // demo seed: real records, real display values
  join('src', 'lib', 'importSchema.js'),      // maps FOREIGN spreadsheet text onto ours
]

// NOT a clean bill of health — a KNOWN, dated exclusion.
//
// The mobile module never went through Block C: its filter chips, forms and
// detail screens are still written against the old vocabulary ('2BHK',
// 'Semi-furnished'), which is why its filters miss and its screens show gaps.
// Rebuilding it is E3/E4 (PWA parity) in the roadmap.
//
// It is excluded so the guard can protect the desk today instead of being
// switched off wholesale — but the exclusion is printed on every run, so it
// can't quietly become permanent, and it lapses the moment E3/E4 lands.
const DEFERRED = [join('src', 'modules', 'mobile')]

const norm = (s) => String(s).toLowerCase().replace(/[\s\-_/.]+/g, '')

// Every label a person is meant to see, plus STATUS values (whose values ARE
// their labels). Short and ambiguous ones are dropped: '1', '2', 'None' and
// 'Custom' are ordinary English, not evidence of a copied list.
const labels = new Set()
// Every STORED token, so a token is never mistaken for a drifted label. This
// was the guard's own first false positive: `norm('sqft') === norm('sq.ft')`,
// so writing the correct value `'sqft'` was reported as a misspelling of its
// own display label. The token is the right thing to write in code — it's the
// LABEL that must never be typed by hand.
const values = new Set()
for (const [, val] of Object.entries(vocab)) {
  if (!Array.isArray(val)) continue
  for (const o of val) {
    if (!o || typeof o !== 'object') continue
    if (typeof o.value === 'string') values.add(o.value)
    if (typeof o.label !== 'string') continue
    if (o.label.length < 5) continue
    if (/^(none|custom|yes|no|other)$/i.test(o.label)) continue
    labels.add(o.label)
  }
}
const byNorm = new Map([...labels].map(l => [norm(l), l]))

// ---- walk the source tree --------------------------------------------------
const files = []
;(function walk(dir) {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === 'dist' || entry.startsWith('.')) continue
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) walk(full)
    else if (/\.(js|jsx|ts|tsx)$/.test(entry)) files.push(full)
  }
})(join(ROOT, 'src'))

const problems = []
let deferred = 0
const STRING = /'([^'\\\n]{3,60})'|"([^"\\\n]{3,60})"/g
const ARRAY = /\[\s*(?:(?:'[^'\\\n]*'|"[^"\\\n]*")\s*,\s*){1,}(?:'[^'\\\n]*'|"[^"\\\n]*")\s*,?\s*\]/g

for (const file of files) {
  const rel = relative(ROOT, file)
  if (ALLOWED.some(a => rel === a || rel.split('/').join(sep) === a)) continue
  if (DEFERRED.some(d => rel.startsWith(d))) { deferred++; continue }
  const lines = readFileSync(file, 'utf8').split('\n')

  let inBlock = false
  lines.forEach((rawLine, i) => {
    // Comments are prose about the code, not code. Every historical example in
    // this file's own header would otherwise report itself.
    const trimmed = rawLine.trim()
    if (inBlock) { if (trimmed.includes('*/')) inBlock = false; return }
    if (trimmed.startsWith('/*')) { if (!trimmed.includes('*/')) inBlock = true; return }
    if (trimmed.startsWith('//') || trimmed.startsWith('*')) return
    const line = rawLine.split('//')[0]
    if (rawLine.includes('vocab-ok')) return
    const at = `${rel}:${i + 1}`

    // (a) near-miss: looks like a label but isn't one
    for (const m of line.matchAll(STRING)) {
      const raw = m[1] ?? m[2]
      if (values.has(raw)) continue          // a stored token, written correctly
      // 'superBuiltup' is a field KEY. It only resembles 'Super built-up'
      // because the normaliser strips the space — camelCase identifiers are
      // code, and code is allowed to name its own fields.
      if (/^[a-z][A-Za-z0-9]*$/.test(raw) && /[A-Z]/.test(raw)) continue
      const hit = byNorm.get(norm(raw))
      if (hit && hit !== raw) {
        problems.push(`${at}\n    '${raw}' is not a value — the vocabulary says '${hit}'.\n` +
          `    Differing only in case or spacing means every comparison against it fails silently.`)
      }
    }

    // (b) a re-declared list
    for (const m of line.matchAll(ARRAY)) {
      const members = [...m[0].matchAll(STRING)].map(x => x[1] ?? x[2])
      const known = members.filter(s => !values.has(s) && byNorm.has(norm(s)))
      if (known.length >= 2) {
        problems.push(`${at}\n    array re-declares vocabulary values: ${known.map(s => `'${s}'`).join(', ')}\n` +
          `    Import the list from src/data/propertyFields.js instead of typing it again.`)
      }
    }
  })
}

// ---------------------------------------------------------------------------
// Tenant identity must never be a literal
// ---------------------------------------------------------------------------
// A firm name, a city or a person's contact details typed into the source is
// not a default — it is another tenant's data rendered on this tenant's screen,
// and it has shipped that way more than once ("Skyline Realty" in a WhatsApp
// message, a fallback agent with a real phone number, 'Pune' as the locality of
// every property whose locality was blank).
//
// These come from the signed-in tenant at runtime: src/lib/tenant.js for text,
// state.settings for the UI. Anything genuinely fixed can say `vocab-ok`.
const BANNED = [
  [/\bSkyline Realty\b/, 'a demo firm name — read it from the tenant (src/lib/tenant.js)'],
  [/\bBhumi Propcity\b/, 'a firm name — read it from the tenant (src/lib/tenant.js)'],
  [/\|\|\s*'Pune( HQ)?'/, 'a hardcoded city fallback — leave it empty and drop the segment'],
  [/\bRakesh Sethi\b/, 'a seeded demo person — resolve the agent or render nothing'],
  [/\+91 98220 41556/, 'a hardcoded phone number'],
]

for (const file of files) {
  if (DEFERRED.some(d => file.includes(d))) continue
  if (file.includes('defaultDataset') || file.includes('data/theme.js')) continue
  const src = readFileSync(file, 'utf8')
  let inBlock = false
  src.split('\n').forEach((line, i) => {
    // Same rule as above: comments are prose ABOUT the problem. Every warning
    // written here explaining why a demo firm name is dangerous would otherwise
    // report itself as a demo firm name.
    const t = line.trim()
    if (inBlock) { if (t.includes('*/')) inBlock = false; return }
    if (t.startsWith('/*')) { if (!t.includes('*/')) inBlock = true; return }
    if (t.startsWith('//') || t.startsWith('*')) return
    if (line.includes('vocab-ok')) return
    for (const [re, why] of BANNED) {
      if (re.test(line)) {
        problems.push(`${relative(ROOT, file)}:${i + 1}\n    ${line.trim().slice(0, 110)}\n    ${why}.`)
      }
    }
  })
}

if (problems.length) {
  console.error(`\n✗ vocabulary guard: ${problems.length} problem${problems.length > 1 ? 's' : ''}\n`)
  problems.forEach(p => console.error('  ' + p + '\n'))
  console.error('  The property vocabulary lives in src/data/propertyFields.js.')
  console.error('  Import it, or add `vocab-ok` to the line if the literal is genuinely right.\n')
  process.exit(1)
}

console.log(`✓ vocabulary guard: ${files.length - deferred} files, no re-declared or drifted values`)
if (deferred) {
  console.log(`  (${deferred} mobile files not yet checked — pre-Block-C, see E3/E4)`)
}
