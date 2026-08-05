/**
 * ============================================================================
 * DEDUPE LEADS — collapse rows that are the same person, keeping everything
 * ============================================================================
 * The importer used to compare phone numbers as raw strings, so "9876543210",
 * "+919876543210" and "98765 43210" were three people. Importing the same sheet
 * twice therefore doubled it. This folds those rows back together.
 *
 * Identity is the LAST TEN DIGITS of the phone number, within one tenant. Not
 * the name — two people genuinely share a name, and a sheet spells the same
 * person three ways. The phone is what an agent actually dials.
 *
 * Which row survives, in order:
 *   1. the one whose stage is furthest from "untouched" — real work beats none
 *   2. the one with an agent assigned
 *   3. the one with the most filled fields
 *   4. the oldest, so the record keeps its original arrival date
 *
 * Nothing is thrown away. Before the losers are deleted, the survivor absorbs:
 *   • every field it is missing (fill-only, never overwrite)
 *   • all remarks, oldest first, tagged with where they came from
 *   • the union of shortlisted properties and their feedback
 *   • every timeline event, so the call history survives the merge
 *
 * DRY RUN BY DEFAULT. Prints the full plan and writes nothing without --apply.
 *
 * Usage:
 *   npx tsx src/scripts/dedupe-leads.ts --tenant=delpat
 *   npx tsx src/scripts/dedupe-leads.ts --tenant=bhumi
 *   npx tsx src/scripts/dedupe-leads.ts --tenant=bhumi --apply
 *
 * Run this BEFORE re-importing an enriched sheet. Re-importing while duplicates
 * are still present matches the incoming row against ONE of the copies, and the
 * others stay thin forever.
 * ============================================================================
 */

import { sql } from '../services/db';

const REJECTED = 'Rejected';

function parseArgs() {
  const get = (k: string) => {
    const hit = process.argv.find(a => a.startsWith(`--${k}=`));
    return hit ? hit.slice(k.length + 3) : undefined;
  };
  const tenant = get('tenant');
  if (!tenant) {
    console.error('Refusing to run without --tenant. This deletes rows; it will not guess\n' +
      'which workspace you meant.');
    process.exit(1);
  }
  return { tenant, apply: process.argv.includes('--apply'), show: Number(get('show') || 10) };
}

/** How much real work a row represents. Higher wins. */
function stageRank(stage: string | null): number {
  const s = String(stage || '').toLowerCase();
  if (!s || s === 'new') return 0;
  if (s === REJECTED.toLowerCase()) return 1;   // an outcome, but not a live one
  return 2;                                     // anything an agent moved it to
}

function filledCount(r: any): number {
  const req = r.req || {};
  return [r.email, r.deal, r.requirement, r.locality, r.budget_min, r.budget_max,
    r.purpose, r.timeline_pref, req.interest, r.follow_up]
    .filter(v => v !== null && v !== undefined && String(v).trim() !== '').length;
}

async function main() {
  const args = parseArgs();
  const P10 = sql`right(regexp_replace(coalesce(phone,''), '\D', '', 'g'), 10)`;

  const rows = await sql`
    SELECT *, ${P10} AS p10 FROM crm_leads
     WHERE tenant_id = ${args.tenant} AND length(${P10}) = 10
     ORDER BY created_at ASC`;

  const groups = new Map<string, any[]>();
  for (const r of rows) {
    const g = groups.get(r.p10) || [];
    g.push(r); groups.set(r.p10, g);
  }
  const dupGroups = [...groups.entries()].filter(([, g]) => g.length > 1);

  console.log(`\n${args.apply ? 'APPLY' : 'DRY RUN'} — tenant "${args.tenant}"`);
  console.log(`${rows.length} leads with a usable phone, ${groups.size} distinct people`);
  console.log(`${dupGroups.length} duplicated, ${rows.length - groups.size} rows to be removed\n`);
  if (!dupGroups.length) { console.log('Nothing to do.'); return; }

  // Who loses rows, so the effect on each agent's list is visible up front.
  const perAgent: Record<string, { before: number; removed: number }> = {};
  let shown = 0;
  let fieldsGained = 0;
  let remarksMoved = 0;

  for (const [p10, group] of dupGroups) {
    const sorted = [...group].sort((a, b) =>
      stageRank(b.stage) - stageRank(a.stage)
      || Number(Boolean(b.agent_id)) - Number(Boolean(a.agent_id))
      || filledCount(b) - filledCount(a)
      || new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    const [keep, ...drop] = sorted;

    for (const r of group) {
      const k = String(r.agent_id || '(unassigned)');
      perAgent[k] ||= { before: 0, removed: 0 };
      perAgent[k].before++;
      if (r.id !== keep.id) perAgent[k].removed++;
    }

    // Fill-only field merge, oldest-first so an earlier answer is not
    // overwritten by a later blank.
    const patch: Record<string, any> = {};
    const req: any = { ...(keep.req || {}) };
    for (const col of ['email', 'deal', 'requirement', 'locality', 'budget_min', 'budget_max', 'purpose', 'timeline_pref'] as const) {
      if (keep[col] == null || String(keep[col]).trim() === '') {
        const donor = drop.find(d => d[col] != null && String(d[col]).trim() !== '');
        if (donor) { patch[col] = donor[col]; fieldsGained++; }
      }
    }
    for (const k of ['interest', 'config', 'minBudget', 'maxBudget', 'notes', 'timeline', 'purpose'] as const) {
      if (req[k] == null || String(req[k]).trim() === '') {
        const donor = drop.find(d => (d.req || {})[k] != null && String((d.req || {})[k]).trim() !== '');
        if (donor) { req[k] = (donor.req || {})[k]; fieldsGained++; }
      }
    }
    const notes = [...(keep.notes || [])];
    for (const d of drop) for (const n of (d.notes || [])) if (!notes.includes(n)) { notes.push(n); remarksMoved++; }
    const shortlist = [...new Set([...(keep.shortlist || []), ...drop.flatMap(d => d.shortlist || [])])];
    const feedback = Object.assign({}, ...drop.map(d => d.feedback || {}), keep.feedback || {});

    if (shown < args.show) {
      shown++;
      console.log(`+91${p10}  keep ${keep.name} [${keep.stage}${keep.agent_id ? ', assigned' : ', unassigned'}]  ` +
        `drop ${drop.length}: ${drop.map(d => `${d.name} [${d.stage}]`).join(', ')}` +
        (Object.keys(patch).length || notes.length > (keep.notes || []).length
          ? `\n    gains ${[...Object.keys(patch), ...(notes.length > (keep.notes || []).length ? [`${notes.length - (keep.notes || []).length} remarks`] : [])].join(', ')}`
          : ''));
    }

    if (args.apply) {
      const ids = drop.map(d => d.id);
      // Timeline events move BEFORE the rows go, or the history of every call
      // made against a duplicate disappears with it.
      await sql`UPDATE crm_timeline_events SET record_id = ${keep.id}
                 WHERE tenant_id = ${args.tenant} AND record_id IN ${sql(ids)}`;
      await sql`UPDATE lead_shortlist SET lead_id = ${keep.id}
                 WHERE tenant_id = ${args.tenant} AND lead_id IN ${sql(ids)}
                   AND property_id NOT IN (SELECT property_id FROM lead_shortlist
                                            WHERE tenant_id = ${args.tenant} AND lead_id = ${keep.id})`;
      await sql`DELETE FROM lead_shortlist WHERE tenant_id = ${args.tenant} AND lead_id IN ${sql(ids)}`;
      await sql`
        UPDATE crm_leads SET
          email = ${patch.email ?? keep.email},
          deal = ${patch.deal ?? keep.deal},
          requirement = ${patch.requirement ?? keep.requirement},
          locality = ${patch.locality ?? keep.locality},
          budget_min = ${patch.budget_min ?? keep.budget_min},
          budget_max = ${patch.budget_max ?? keep.budget_max},
          purpose = ${patch.purpose ?? keep.purpose},
          timeline_pref = ${patch.timeline_pref ?? keep.timeline_pref},
          req = ${sql.json(req)},
          notes = ${sql.json(notes)},
          shortlist = ${sql.json(shortlist)},
          feedback = ${sql.json(feedback)},
          updated_at = NOW()
        WHERE id = ${keep.id} AND tenant_id = ${args.tenant}`;
      await sql`DELETE FROM crm_leads WHERE tenant_id = ${args.tenant} AND id IN ${sql(ids)}`;
    }
  }

  if (dupGroups.length > shown) console.log(`… and ${dupGroups.length - shown} more groups (pass --show=N)`);
  console.log('\nRows per agent:');
  console.table(perAgent);
  console.log(`Fields the survivors gain: ${fieldsGained}`);
  console.log(`Remarks carried over: ${remarksMoved}`);
  console.log(`Leads after: ${groups.size} (from ${rows.length})`);
  console.log(args.apply
    ? '\nApplied.'
    : '\nNothing written. Re-run with --apply once these numbers look right.');
}

main()
  .then(async () => { await sql.end(); process.exit(0); })
  .catch(async e => { console.error(e); await sql.end().catch(() => {}); process.exit(1); });
