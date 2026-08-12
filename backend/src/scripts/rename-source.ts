/**
 * Rename a lead source everywhere it is written down, in one transaction.
 *
 *   npx tsx src/scripts/rename-source.ts --tenant=bhumi --from="99acres 2" --to="Property Circle"
 *   ...same, plus --apply     to actually write
 *
 * WHY IT IS NOT JUST AN UPDATE ON ONE TABLE
 * -----------------------------------------
 * A source's name lives in four places, and moving one without the others is
 * how a portal ends up counted twice:
 *
 *   integrations.provider                     what the connection is called
 *   integrations.parser_config.defaults.source what FUTURE leads get stamped
 *   crm_leads.source                          what EXISTING leads already carry
 *   crm_settings.value.sources                a curated array some tenants still hold
 *
 * Change only the default and today's leads say one thing and yesterday's say
 * another, with no screen admitting they are the same portal.
 *
 * Deliberately NOT rewritten: notification bodies and timeline entries that say
 * "via <old name>". Those are records of what happened at the time, and a
 * ledger that edits itself to match the present is worth less than one that
 * does not. See docs/specs/lead-sources.md for the in-app version of this.
 */
import postgres from 'postgres';

const arg = (k: string, d?: string) => {
  const hit = process.argv.find(a => a.startsWith(`--${k}=`));
  return hit ? hit.slice(k.length + 3) : d;
};
const has = (k: string) => process.argv.includes(`--${k}`);

const tenant = arg('tenant');
const from = arg('from');
const to = arg('to');
const apply = has('apply');

if (!tenant || !from || !to) {
  console.error(`\nUsage: --tenant=<slug> --from="<old name>" --to="<new name>" [--apply]\n`);
  process.exit(1);
}
if (from === to) { console.error('\nfrom and to are the same.\n'); process.exit(1); }

const sql = postgres(process.env.DATABASE_URL!, { max: 1, ssl: 'require' });

async function main() {
  const [t] = await sql`SELECT id, slug FROM tenants WHERE slug = ${tenant!} OR id = ${tenant!} LIMIT 1`;
  if (!t) throw new Error(`No tenant "${tenant}"`);

  // Blast radius, stated before anything is written and for THIS tenant only.
  const [leads] = await sql`
    SELECT count(*)::int AS n FROM crm_leads WHERE tenant_id = ${t.id} AND source = ${from!}`;
  const conns = await sql`
    SELECT id, provider, parser_config->'defaults'->>'source' AS src FROM integrations
     WHERE tenant_id = ${t.id} AND (provider = ${from!} OR parser_config->'defaults'->>'source' = ${from!})`;
  const [settings] = await sql`
    SELECT value->'sources' AS sources FROM crm_settings WHERE key = 'default' AND tenant_id = ${t.id}`;
  const curated: string[] = Array.isArray(settings?.sources) ? settings.sources : [];
  const inCurated = curated.includes(from!);

  // Renaming ONTO a name already in use merges two sources into one and cannot
  // be undone by running this again — the rows are indistinguishable afterwards.
  const [collision] = await sql`
    SELECT count(*)::int AS n FROM crm_leads WHERE tenant_id = ${t.id} AND source = ${to!}`;

  console.log(`\ntenant            ${t.slug}`);
  console.log(`rename            "${from}"  ->  "${to}"`);
  console.log(`leads to restamp  ${leads.n}`);
  console.log(`connections       ${conns.length}${conns.length ? ':' : ''}`);
  for (const c of conns as any[]) console.log(`                    ${c.id}  provider="${c.provider}"  defaults.source=${JSON.stringify(c.src)}`);
  console.log(`settings.sources  ${inCurated ? 'contains it' : 'does not contain it'}`);
  if (collision.n > 0) {
    console.log(`\n!! "${to}" already has ${collision.n} lead(s) on this tenant.`);
    console.log(`   Continuing MERGES the two sources permanently — afterwards nothing`);
    console.log(`   distinguishes the rows that used to be "${from}".`);
    if (!has('merge')) { console.log(`   Pass --merge if that is what you want.\n`); await sql.end(); process.exit(2); }
  }
  if (!leads.n && !conns.length && !inCurated) {
    console.log(`\nNothing carries that name here. No change.\n`); await sql.end(); process.exit(0);
  }
  if (!apply) {
    console.log(`\nDRY RUN — nothing written. Re-run with --apply.\n`); await sql.end(); process.exit(0);
  }

  // One transaction: a rename half-applied is the split it exists to prevent.
  await sql.begin(async (tx) => {
    await tx`UPDATE crm_leads SET source = ${to!} WHERE tenant_id = ${t.id} AND source = ${from!}`;
    await tx`UPDATE integrations SET provider = ${to!} WHERE tenant_id = ${t.id} AND provider = ${from!}`;
    // to_jsonb(text), NOT JSON.stringify(...)::jsonb. postgres.js already
    // encodes a JS string for the parameter, so stringifying first encodes it
    // twice and stores the value WITH its quotes — {"source":"\"Property
    // Circle\""}, which would then stamp every future lead with a quoted
    // source. Caught on the live tenant and repaired before a push arrived.
    await tx`UPDATE integrations
                SET parser_config = jsonb_set(parser_config, '{defaults,source}', to_jsonb(${to!}::text))
              WHERE tenant_id = ${t.id} AND parser_config->'defaults'->>'source' = ${from!}`;
    if (inCurated) {
      const next = curated.map(s => (s === from ? to! : s)).filter((s, i, a) => a.indexOf(s) === i);
      await tx`UPDATE crm_settings
                  SET value = jsonb_set(value, '{sources}', ${sql.json(next)})
                WHERE key = 'default' AND tenant_id = ${t.id}`;
    }
  });

  // Audited AFTER the transaction and through audit(), never as a raw INSERT:
  // audit_log carries prev_hash/hash, and a row written outside the service
  // breaks the chain the ledger is sold on.
  const { audit } = await import('../services/audit.js');
  await audit({
    tenant_id: t.id, actor_type: 'system', actor_id: null, actor_label: 'rename-source script',
    action: 'source.renamed', target_type: 'tenant', target_id: t.id,
    summary: `Lead source "${from}" renamed to "${to}"`,
    metadata: { from, to, leads: leads.n, connections: conns.length },
  } as any);

  const [after] = await sql`SELECT count(*)::int AS n FROM crm_leads WHERE tenant_id = ${t.id} AND source = ${to!}`;
  const [left] = await sql`SELECT count(*)::int AS n FROM crm_leads WHERE tenant_id = ${t.id} AND source = ${from!}`;
  const now = await sql`SELECT provider, parser_config->'defaults'->>'source' AS src FROM integrations
                         WHERE tenant_id = ${t.id} AND (provider = ${to!} OR parser_config->'defaults'->>'source' = ${to!})`;
  console.log(`\napplied.`);
  console.log(`  leads on "${to}"      ${after.n}`);
  console.log(`  leads left on "${from}"  ${left.n}   (must be 0)`);
  for (const c of now as any[]) console.log(`  connection            provider="${c.provider}"  defaults.source="${c.src}"`);
  console.log(`\nAgents need a refresh to see it — sources are read at bootstrap.\n`);
}

main().then(() => sql.end()).catch(async (e) => { console.error(e); await sql.end(); process.exit(1); });
