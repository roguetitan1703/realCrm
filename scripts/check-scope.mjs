#!/usr/bin/env node
// ============================================================================
// 🔒 SCOPE GUARD — a read either applies the tenant's access rule, or says why
// ============================================================================
// Multi-tenancy and RBAC in this product are two separate filters, and both are
// applied by hand in every query:
//
//   tenant_id = ${t}     WHICH FIRM'S data this is. Missing it is a breach.
//   leadScope()          WHICH ROWS THIS USER may see. Missing it is a leak,
//   ownerScope()         or a count that describes a different population from
//                        the list it labels.
//
// Applying a rule by hand in 38 places means it is applied in 9. That is not a
// discipline problem, it is a missing mechanism — the same conclusion the
// vocabulary guard reached after the same bug landed five times.
//
// It has now landed three times as a dropped RBAC scope:
//
//   1. the phone worklist reused the RBAC scope for "my queue" and returned
//      732 rows instead of 110
//   2. Today counted one population and listed another
//   3. getDeskSummary counted the whole firm behind a sidebar badge that
//      labelled one agent's list, so an agent with no new leads was shown a
//      badge promising ten — and the same response carried every colleague's
//      win counts to a browser that had no business holding them
//
// Each was found by a person noticing a number looked odd. That is not a
// control. This is.
//
// THE RULE
//   Any query reading a tenant-owned table must carry BOTH filters, or carry an
//   explicit escape hatch saying which one it is deliberately skipping and why:
//
//     // scope-ok: <reason>
//
//   on the line above, or at the end of, the line naming the table.
//
// Deliberate exemptions are normal and several are load-bearing — dedup must
// see rows the caller cannot (CLAUDE.md 3.7), and a background sweep has no
// user to scope to. The point is never that they are wrong. The point is that
// they are STATED, so the next reader can tell a decision from an omission.
// ============================================================================

import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = process.cwd();
const SRC = join(ROOT, 'backend', 'src');

// Tables that carry per-user visibility, and the scope helper each one expects.
const GUARDED = {
  crm_leads: ['leadScope', 'scopeUserId'],
  crm_owners: ['ownerScope', 'leadScope', 'scopeUserId'],
};

const files = [];
(function walk(dir) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) { if (e !== 'node_modules') walk(p); }
    else if (/\.ts$/.test(p) && !/\.d\.ts$/.test(p)) files.push(p);
  }
})(SRC);

// A query is the SQL template literal a table name appears in. Rather than
// parse TypeScript, take the backtick-delimited chunk around each hit — the
// scope helper is interpolated into that same template when it is applied.
function templateAround(text, idx) {
  const open = text.lastIndexOf('`', idx);
  if (open === -1) return null;
  let i = open + 1;
  while (i < text.length) {
    if (text[i] === '\\') { i += 2; continue; }
    if (text[i] === '`') break;
    i++;
  }
  return text.slice(open, i + 1);
}

const problems = [];

for (const file of files) {
  const text = readFileSync(file, 'utf8');
  const rel = relative(ROOT, file).replace(/\\/g, '/');
  // The guard's own definitions live in store.ts; skip the helper declarations
  // themselves so `function leadScope()` isn't read as a query.
  for (const [table, helpers] of Object.entries(GUARDED)) {
    const re = new RegExp(`\\b(FROM|JOIN|UPDATE|INTO)\\s+${table}\\b`, 'gi');
    let m;
    while ((m = re.exec(text))) {
      const line = text.slice(0, m.index).split('\n').length;
      const lines = text.split('\n');
      const here = lines[line - 1] || '';
      const above = lines[line - 2] || '';
      if (/scope-ok:/.test(here) || /scope-ok:/.test(above)) continue;

      const tpl = templateAround(text, m.index);
      if (!tpl) continue;
      const hasTenant = /tenant_id\s*=\s*\$\{/.test(tpl);
      const hasScope = helpers.some(h => tpl.includes(h));
      // A write is scoped by its id + tenant; the RBAC check for writes lives
      // in assertLeadWrite, not in the WHERE clause. Only reads are checked.
      const isRead = /^(FROM|JOIN)$/i.test(m[1]);

      const missing = [];
      if (!hasTenant) missing.push('tenant_id');
      if (isRead && !hasScope) missing.push(helpers[0] + '()');
      if (missing.length) {
        // A stable fingerprint of the query itself, so the baseline survives
        // the file being reordered but not the query being changed.
        const sig = tpl.replace(/\s+/g, ' ').trim().slice(0, 120);
        problems.push({ rel, line, table, missing, sig });
      }
    }
  }
}

// ---------------------------------------------------------------------------
// The ratchet
// ---------------------------------------------------------------------------
// 65 reads were already unscoped the day this guard was written. Failing the
// build on all 65 would mean the guard gets deleted by lunchtime, and silently
// annotating them would be worse — it would claim 65 decisions nobody made.
//
// So the debt is written down instead. The build fails only on a read that is
// NOT in the baseline: new code cannot add to the pile, and the pile can only
// shrink. Each entry retired is one query someone actually thought about.
//
// Identity is file + table + the query's own text rather than a line number, so
// moving code does not fail spuriously and editing a query does not silently
// inherit its exemption.
const BASELINE = join(ROOT, 'scripts', 'scope-baseline.json');
const keyOf = (p) => `${p.rel} ${p.table} ${p.sig}`;
const current = problems.map(keyOf).sort();

if (process.argv.includes('--write-baseline')) {
  writeFileSync(BASELINE, JSON.stringify(current, null, 2) + '\n');
  console.log(`scope guard: baseline written — ${current.length} known unscoped reads.`);
  process.exit(0);
}

const known = existsSync(BASELINE) ? new Set(JSON.parse(readFileSync(BASELINE, 'utf8'))) : new Set();
const added = problems.filter(p => !known.has(keyOf(p)));
const fixed = [...known].filter(k => !current.includes(k));

if (fixed.length) {
  console.log(`scope guard: ${fixed.length} read${fixed.length === 1 ? '' : 's'} retired since the baseline —`);
  console.log('  run `npm run check:scope -- --write-baseline` to lock the improvement in.');
}

if (!added.length) {
  console.log(`✅ scope guard: no new unscoped reads (${known.size} known, in scripts/scope-baseline.json).`);
  process.exit(0);
}

console.error('\n❌ SCOPE GUARD — new unscoped read\n');
console.error('A read on a tenant-owned table must carry the tenant filter AND the');
console.error('user access rule, or state which it skips and why:\n');
console.error('    // scope-ok: <reason>\n');
for (const p of added) {
  console.error(`  ${p.rel}:${p.line}  ${p.table} — missing ${p.missing.join(' + ')}`);
}
console.error('');
process.exit(1);
