/**
 * ============================================================================
 * REMAP CONNECTIONS — save a freshly auto-detected mapping per connection
 * ============================================================================
 * The same auto-detect the mapper's "Re-detect" button runs, from the command
 * line, against every connection on a tenant at once. Built against each
 * connection's RICHEST recent push (see bestPayload), so a provider that sends
 * more than one shape is mapped from the full one.
 *
 * Prints the proposed mapping field by field and writes nothing without
 * `--apply`.
 *
 * When to use which:
 *   • one connection, a real client  → the mapper UI. It shows the payload, the
 *     resulting lead and a field-by-field trace, and a human confirms it.
 *   • a whole test tenant at once    → this.
 *
 * Usage:
 *   npx tsx src/scripts/remap-connections.ts --tenant=delpat
 *   npx tsx src/scripts/remap-connections.ts --tenant=delpat --apply
 * ============================================================================
 */

import { sql } from '../services/db';
import { suggestConfig, parsePayload, sanitizeConfig } from '../services/parser';
import { bestPayload } from '../services/ingestion';

function parseArgs() {
  const get = (k: string) => {
    const hit = process.argv.find(a => a.startsWith(`--${k}=`));
    return hit ? hit.slice(k.length + 3) : undefined;
  };
  const tenant = get('tenant');
  if (!tenant) {
    console.error('Refusing to run without --tenant. A mapping decides how every future\n' +
      'lead on a workspace is read; it will not guess which workspace you meant.');
    process.exit(1);
  }
  return { tenant, provider: get('provider'), apply: process.argv.includes('--apply') };
}

async function main() {
  const args = parseArgs();
  const conns = await sql`
    SELECT id, provider, parser_config FROM integrations
     WHERE tenant_id = ${args.tenant}
       ${args.provider ? sql`AND provider = ${args.provider}` : sql``}
     ORDER BY provider`;

  console.log(`\n${args.apply ? 'APPLY' : 'DRY RUN'} — tenant "${args.tenant}", ${conns.length} connection(s)`);

  for (const c of conns) {
    const { payload, shapes, consideredCount } = await bestPayload(args.tenant, c.id as string);
    console.log(`\n── ${c.provider}`);
    if (!payload) {
      // Not a failure: a connection that has never received anything cannot be
      // mapped, and guessing a mapping for it is exactly what "no blind presets"
      // rules out.
      console.log('   no payload received yet — nothing to map against');
      continue;
    }
    console.log(`   ${consideredCount} recent push(es), ${shapes} distinct shape(s); mapping against the richest`);

    const before = sanitizeConfig(c.parser_config as any).clean;
    const next = suggestConfig(payload, c.provider as string);
    const beforeMap = before?.map || {};
    const check = parsePayload(payload, next);

    for (const [target, source] of Object.entries(next.map)) {
      const was = beforeMap[target];
      const mark = was === source ? ' ' : was ? '~' : '+';
      console.log(`   ${mark} ${target.padEnd(15)} ← ${source}${was && was !== source ? `   (was ${was})` : ''}`);
    }
    for (const target of Object.keys(beforeMap)) {
      if (!(target in next.map)) console.log(`   - ${target.padEnd(15)} ← ${beforeMap[target]}   (dropped: not in this payload)`);
    }
    const oldDeal = (before?.defaults as any)?.['req.deal'];
    if (oldDeal) console.log(`   - default req.deal=${oldDeal}   (removed: a deal type is never invented)`);

    if (!check.ok) {
      console.log(`   REFUSED — ${check.errors.join(' ') || `missing ${check.missing.join(' and ')}`}`);
      continue;
    }
    console.log(`   → ${JSON.stringify(check.lead)}`);
    if (args.apply) {
      await sql`UPDATE integrations SET parser_config = ${sql.json(next as any)}
                 WHERE id = ${c.id} AND tenant_id = ${args.tenant}`;
      console.log('   saved');
    }
  }

  console.log(args.apply
    ? '\nSaved. Run reprocess-inbox next to apply these mappings to leads already created.'
    : '\nNothing written. Re-run with --apply once these mappings look right.');
}

main()
  .then(async () => { await sql.end(); process.exit(0); })
  .catch(async e => { console.error(e); await sql.end().catch(() => {}); process.exit(1); });
