/**
 * ============================================================================
 * LISTING OWNERS → REAL OWNER RECORDS (one-off, per tenant)
 * ============================================================================
 * Until 2026-09-23 an owner entered on a property was two text fields on that
 * listing and nothing else: no record, no unit, no stage, no history, and no
 * place in Calling. Contacts → Owners faked a directory by grouping that text.
 *
 * New listings now create the owner record as they are saved
 * (store.ts linkListingOwner). This walks the ones written BEFORE that and does
 * the same thing for them: match an existing owner record on project + tower +
 * unit, else on the phone number, else create one — and write the link back
 * onto the listing.
 *
 * It never overwrites a calling record's stage, callback, agent or notes; it
 * only fills fields that are empty. A listing with no owner PHONE is skipped:
 * a name with no number is not someone anyone can ring, and inventing a record
 * for it is what filled Contacts with rows nobody could use.
 *
 * Usage:
 *   npm run link:owners -- --env=production --tenant=bhumi          report only
 *   npm run link:owners -- --env=production --tenant=bhumi --apply  do it
 * ============================================================================
 */
const arg = (k: string) => process.argv.find(a => a.startsWith(`--${k}=`))?.split('=')[1];
const env = String(arg('env') || '').toLowerCase();
if (env !== 'production' && env !== 'development') {
  console.error('\nRefusing to run without --env=production or --env=development.\n');
  process.exit(1);
}
process.env.APP_ENV = env;
const tenant = arg('tenant');
if (!tenant) {
  console.error('\nRefusing to run without --tenant=<slug>. This writes records for a firm;\nwhich firm is not something to infer.\n');
  process.exit(1);
}
const apply = process.argv.includes('--apply');

const { dbRef, databaseUrl } = await import('../services/env');
const { sql } = await import('../services/db');
const { runWithContext } = await import('../services/context');
const { linkListingOwner } = await import('../services/store');

console.log(`\n  ${env.toUpperCase()} · db ${dbRef(databaseUrl())} · tenant ${tenant}${apply ? '' : ' · report only'}\n`);

const rows = await sql`
  SELECT id, title, project, wing, unit_no, type, owner_name, owner_phone, owner_email, owner_contact_id
    FROM crm_properties
   WHERE tenant_id = ${tenant} AND owner_contact_id IS NULL AND coalesce(owner_phone, '') <> ''
   ORDER BY created_at`;
const noPhone = await sql`
  SELECT count(*)::int AS n FROM crm_properties
   WHERE tenant_id = ${tenant} AND owner_contact_id IS NULL AND coalesce(owner_phone, '') = '' AND coalesce(owner_name, '') <> ''`;

console.log(`  ${rows.length} listing(s) to link · ${noPhone[0].n} with a name but no phone (left alone)`);
if (!apply) {
  for (const r of rows.slice(0, 10) as any[]) {
    console.log(`    ${String(r.title).padEnd(28)} ${String(r.owner_name || '—').padEnd(22)} ${[r.project, r.wing, r.unit_no].filter(Boolean).join(' / ')}`);
  }
  if (rows.length > 10) console.log(`    … and ${rows.length - 10} more`);
  console.log('\n  Run again with --apply to create and link them.\n');
  await sql.end();
  process.exit(0);
}

// The store reads the tenant from the request context, never from a parameter —
// so the whole run happens inside one, exactly like a request would.
let linked = 0, made = 0, failed = 0;
await runWithContext({ tenantId: tenant, userId: null, role: null, actorType: 'system', actorLabel: 'link-listing-owners', ip: null, userAgent: null } as any, async () => {
  for (const r of rows as any[]) {
    try {
      const before = await sql`SELECT count(*)::int AS n FROM crm_owners WHERE tenant_id = ${tenant}`;
      const ownerId = await linkListingOwner(r.id, {
        ownerName: r.owner_name, ownerPhone: r.owner_phone, ownerEmail: r.owner_email,
        project: r.project, tower: r.wing, unitNo: r.unit_no, config: r.type,
      }, { actorType: 'system', actorId: null, actorLabel: 'link-listing-owners' } as any);
      if (!ownerId) { failed++; continue; }
      await sql`UPDATE crm_properties SET owner_contact_id = ${ownerId} WHERE id = ${r.id} AND tenant_id = ${tenant}`;
      const after = await sql`SELECT count(*)::int AS n FROM crm_owners WHERE tenant_id = ${tenant}`;
      if (after[0].n > before[0].n) made++; else linked++;
    } catch (e: any) {
      failed++;
      console.error(`  ✗ ${r.title}: ${e?.message}`);
    }
  }
});

const [{ n: owners }] = await sql`SELECT count(*)::int AS n FROM crm_owners WHERE tenant_id = ${tenant}`;
const [{ n: unlinked }] = await sql`SELECT count(*)::int AS n FROM crm_properties WHERE tenant_id = ${tenant} AND owner_contact_id IS NULL AND coalesce(owner_phone, '') <> ''`;
console.log(`\n  Created ${made}, linked to an existing record ${linked}, failed ${failed}.`);
console.log(`  ${owners} owner record(s) for ${tenant}; ${unlinked} listing(s) still unlinked.\n`);
await sql.end();
process.exit(failed ? 2 : 0);
