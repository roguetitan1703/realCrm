/**
 * ============================================================================
 * REPROCESS INBOX — re-read stored pushes through the CURRENT mapping
 * ============================================================================
 * Every payload a provider ever sent is still in `webhook_inbox`. When a
 * mapping was wrong — or when the provider started sending more and the mapping
 * had not caught up — the lead was built from a fraction of what arrived, and
 * the rest has been sitting in that table the whole time.
 *
 * This re-parses those bodies with whatever mapping the connection carries NOW
 * and fills in what is missing on the lead the push produced.
 *
 * Two rules it will not break:
 *
 *   1. FILL ONLY. It never overwrites a value that is already there. An agent
 *      who spoke to the buyer and corrected their budget outranks a portal
 *      repeating its own form, always.
 *   2. DRY RUN BY DEFAULT. It prints exactly what it would change and writes
 *      nothing unless `--apply` is passed.
 *
 * Usage:
 *   npx tsx src/scripts/reprocess-inbox.ts --tenant=delpat
 *   npx tsx src/scripts/reprocess-inbox.ts --tenant=delpat --apply
 *   npx tsx src/scripts/reprocess-inbox.ts --tenant=bhumi --provider=MagicBricks
 *
 * Run the dry run, read the per-field counts, THEN apply. Re-save the
 * connection's mapping first — reprocessing through a stale mapping recovers
 * nothing, because the mapping is the thing that was wrong.
 * ============================================================================
 */

import { sql } from '../services/db';
import { parsePayload, sanitizeConfig, suggestConfig } from '../services/parser';
import { bestPayload } from '../services/ingestion';
import { runWithContext } from '../services/context';
import { updateLead, getLeadById } from '../services/store';

type Args = { tenant: string; provider?: string; apply: boolean; limit: number; detect: boolean; overwrite: Set<string> };

function parseArgs(): Args {
  const get = (k: string) => {
    const hit = process.argv.find(a => a.startsWith(`--${k}=`));
    return hit ? hit.slice(k.length + 3) : undefined;
  };
  const tenant = get('tenant');
  if (!tenant) {
    console.error('Refusing to run without --tenant. There is no sensible default: a\n' +
      'reprocess that picked one would write to whichever workspace it guessed.');
    process.exit(1);
  }
  const detect = process.argv.includes('--detect');
  const apply = process.argv.includes('--apply');
  // `--detect` answers "how much is sitting in the inbox that a correct mapping
  // would recover" WITHOUT saving that mapping anywhere. Letting it write would
  // mean a mapping nobody reviewed silently became the one the live feed uses,
  // which is exactly the failure this whole exercise is cleaning up after.
  if (detect && apply) {
    console.error('--detect is a measurement, not a migration. Save the mapping in the\n' +
      'mapper (Re-detect → Test → Save), then run --apply against it.');
    process.exit(1);
  }
  // Fill-only cannot repair a value that is present and WRONG — and the whole
  // reason for this exercise is that a blanket default wrote `deal = 'sale'`
  // onto enquiries that plainly said Rent. So conflicts are always reported,
  // and overwriting one is a field named explicitly on the command line. Never
  // a blanket "portal wins": that would undo every correction an agent made.
  const overwrite = new Set((get('overwrite') || '').split(',').map(s => s.trim()).filter(Boolean));
  return { tenant, provider: get('provider'), apply, detect, overwrite, limit: Number(get('limit') || 10000) };
}

/** The req fields a portal can meaningfully contribute, and where they live. */
const REQ_FIELDS = ['deal', 'config', 'locality', 'minBudget', 'maxBudget', 'purpose', 'timeline', 'interest', 'notes'] as const;

const isEmpty = (v: any) => v === undefined || v === null || (typeof v === 'string' && v.trim() === '');

async function main() {
  const args = parseArgs();
  const rows = await sql`
    SELECT w.id AS inbox_id, w.lead_id, w.raw_body, w.received_at,
           g.provider, g.parser_config
      FROM webhook_inbox w
      JOIN integrations g ON g.id = w.integration_id
     WHERE w.tenant_id = ${args.tenant}
       AND w.raw_body IS NOT NULL
       AND w.lead_id IS NOT NULL
       ${args.provider ? sql`AND g.provider = ${args.provider}` : sql``}
     ORDER BY w.received_at ASC
     LIMIT ${args.limit}
  `;

  const mode = args.apply ? 'APPLY' : args.detect ? 'CEILING (freshly detected mappings, never saved)' : 'DRY RUN';
  console.log(`\n${mode} — tenant "${args.tenant}"${args.provider ? `, provider "${args.provider}"` : ''}`);
  console.log(`${rows.length} stored pushes that produced a lead\n`);
  if (!rows.length) return;

  // Under --detect, each connection is read with a mapping auto-detected from
  // its own richest stored push rather than the one it has saved.
  const detected = new Map<string, any>();
  if (args.detect) {
    const conns = await sql`
      SELECT g.id, g.provider FROM integrations g WHERE g.tenant_id = ${args.tenant}
       ${args.provider ? sql`AND g.provider = ${args.provider}` : sql``}`;
    for (const c of conns) {
      const { payload } = await bestPayload(args.tenant, c.id as string);
      if (payload) detected.set(c.provider as string, suggestConfig(payload, c.provider as string));
    }
  }

  const fieldWins: Record<string, number> = {};
  const conflicts: Record<string, { n: number; samples: string[] }> = {};
  const perProvider: Record<string, { rows: number; touched: number; fields: number }> = {};
  const samples: string[] = [];
  let touched = 0;
  let missingLead = 0;
  let unparseable = 0;

  await runWithContext(
    { tenantId: args.tenant, userId: null, role: 'system', actorType: 'system', actorLabel: 'reprocess-inbox' } as any,
    async () => {
      for (const r of rows) {
        const prov = r.provider as string;
        perProvider[prov] ||= { rows: 0, touched: 0, fields: 0 };
        perProvider[prov].rows++;

        const { clean } = sanitizeConfig(args.detect ? detected.get(prov) : (r.parser_config as any));
        const parsed = parsePayload(r.raw_body, clean);
        if (!parsed.ok) { unparseable++; continue; }

        const lead = await getLeadById(r.lead_id as string);
        if (!lead) { missingLead++; continue; }

        // Fill-only diff. `lead.req` already merges the real columns over the
        // JSONB (see rowToLead), so this compares against what the desk shows,
        // not against a half-populated blob.
        const cur = lead.req || {};
        const incoming = parsed.lead.req || {};
        const merged: any = { ...cur };
        const filled: string[] = [];
        for (const k of REQ_FIELDS) {
          const have = (cur as any)[k];
          const want = (incoming as any)[k];
          if (isEmpty(want)) continue;
          if (isEmpty(have)) {
            merged[k] = want;
            filled.push(k);
          } else if (String(have) !== String(want)) {
            // The lead holds something the payload disagrees with.
            conflicts[k] ||= { n: 0, samples: [] };
            conflicts[k].n++;
            if (conflicts[k].samples.length < 4) {
              conflicts[k].samples.push(`${lead.name}: has ${JSON.stringify(have)}, payload says ${JSON.stringify(want)}`);
            }
            if (args.overwrite.has(k)) { merged[k] = want; filled.push(`${k}(overwritten)`); }
          }
        }
        const patch: any = {};
        if (isEmpty(lead.email) && !isEmpty(parsed.lead.email)) { patch.email = parsed.lead.email; filled.push('email'); }
        if (!filled.length) continue;

        touched++;
        perProvider[prov].touched++;
        perProvider[prov].fields += filled.length;
        for (const f of filled) fieldWins[f] = (fieldWins[f] || 0) + 1;
        if (samples.length < 8) {
          samples.push(`  ${lead.name} (${prov}) ← ${filled.map(f => `${f}=${JSON.stringify(f === 'email' ? patch.email : merged[f])}`).join(', ')}`);
        }

        if (args.apply) await updateLead(r.lead_id as string, { ...patch, req: merged });
      }
    },
  );

  console.log('Leads that would gain something:', touched, 'of', rows.length);
  if (missingLead) console.log('Pushes whose lead no longer exists:', missingLead, '(deleted or merged away — skipped)');
  if (unparseable) console.log('Pushes the current mapping cannot parse:', unparseable);

  console.log('\nBy provider:');
  console.table(perProvider);
  console.log('Fields recovered:');
  console.table(fieldWins);

  const conflicted = Object.keys(conflicts);
  if (conflicted.length) {
    console.log('\nFields where the lead and the payload DISAGREE:');
    for (const k of conflicted) {
      const tag = args.overwrite.has(k) ? 'OVERWRITTEN' : 'left alone';
      console.log(`  ${k} — ${conflicts[k].n} lead(s), ${tag}`);
      for (const s of conflicts[k].samples) console.log(`      ${s}`);
    }
    const untouched = conflicted.filter(k => !args.overwrite.has(k));
    if (untouched.length) {
      console.log(`
  To take the payload's answer for these, re-run with --overwrite=${untouched.join(',')}`);
      console.log('  Only do that where the stored value was never a human decision.');
    }
  }
  if (samples.length) console.log('\nExamples:\n' + samples.join('\n'));

  console.log(args.apply
    ? '\nApplied. Nothing that already had a value was overwritten.'
    : '\nNothing written. Re-run with --apply once these numbers look right.');
}

// Explicit exit: importing the services pulls in the queue's timers, so the
// event loop never drains on its own and the script would appear to hang after
// printing its results.
main()
  .then(async () => { await sql.end(); process.exit(0); })
  .catch(async e => { console.error(e); await sql.end().catch(() => {}); process.exit(1); });
