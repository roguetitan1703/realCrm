/**
 * ============================================================================
 * PHONE DRY RUN — what the E.164 repair would do, per firm, per table
 * ============================================================================
 * Reads every stored phone and says, using each firm's own country
 * (crm_settings 'default' value.locale.country, India when unset):
 *   - already E.164 (and of those, foreign numbers: kept exactly as they are)
 *   - converts cleanly, by the shape it was stored in (bare national number,
 *     country code without "+", "+cc" with spaces or dashes, leading 0, other)
 *   - "+91" and 10 digits that are not a 6–9 mobile: valid by libphonenumber
 *     (kept and converted) or not (listed)
 *   - cannot be read with confidence (letters, too short such as a 9-digit
 *     UAE mobile that lost +971, invalid): every one listed, never guessed
 *   - collisions: two rows that become the same number. Users have a unique
 *     index, so any there would stop the repair; leads and owners are left.
 * with five sample conversions per table. Rows marked * in a collision are the
 * ones being converted.
 *
 * Tables: users.phone, users.metadata.phone, crm_agents.metadata.phone,
 * crm_leads.phone, crm_owners.phone, crm_properties.owner_phone,
 * crm_agreements.party_phone, crm_settings sharing.replyToPhone.
 *
 * READ-ONLY. One connection, one READ ONLY transaction (the Supabase pooler
 * ignores default_transaction_read_only, so the transaction is what protects).
 * Writes nothing, and imports nothing that would run initSchema.
 *
 * When to run: before the phone repair (docs/specs/phone.md) runs anywhere —
 * on development first, then on production once Om approves a production read.
 * Run it again after the repair: everything left should be listed as
 * unreadable or a lead/owner collision.
 *
 * Usage (from the repo root):
 *   npx tsx --env-file=.env backend/src/scripts/phone-dry-run.ts --env=development
 *   npx tsx --env-file=.env backend/src/scripts/phone-dry-run.ts --env=production [--tenant=bhumi] [--list=all]
 * --list=all prints every unreadable row; by default at most 25 per table.
 */
import postgres from 'postgres';
import { pgOptions } from '../services/pgOptions.js';
import { PHONE_TABLES, firmCountries, verdict, type PhoneRow } from '../services/phoneRepair.js';
import { getCountryCallingCode } from 'libphonenumber-js/max';

const arg = (k: string) => process.argv.find(a => a.startsWith(`--${k}=`))?.split('=')[1];
const env = arg('env');
if (env !== 'development' && env !== 'production') throw new Error('Say which database: --env=development or --env=production.');
const url = env === 'production' ? process.env.DATABASE_URL : process.env.DEV_DATABASE_URL;
if (!url) throw new Error(`${env === 'production' ? 'DATABASE_URL' : 'DEV_DATABASE_URL'} is not set.`);
if (env === 'production' && url === process.env.DEV_DATABASE_URL) throw new Error('DATABASE_URL is the development database.');
const onlyTenant = arg('tenant');
const listAll = arg('list') === 'all';

/** How a number that converts was stored. */
function shape(raw: string, cc: string): string {
  const t = raw.trim();
  const d = t.replace(/\D/g, '');
  if (t.startsWith('+')) return /^\+\d+$/.test(t) ? 'other' : '+cc spaced/dashed';
  if (/^00/.test(d)) return '00 prefix';
  if (/^\d+$/.test(t.replace(/[\s-]/g, '')) && d.startsWith('0')) return 'leading 0';
  if (d.length === 10 && /^\d+$/.test(t)) return 'bare national';
  if (d.length === 10) return 'national with spaces';
  if (d.startsWith(cc)) return 'cc without +';
  return 'other';
}

const sql = postgres(url, pgOptions(url, { max: 1 }));
try {
  await sql.begin('READ ONLY', async (q: any) => {
    // The same tables, country and verdict the repair uses (services/phoneRepair.ts).
    const countryOf = await firmCountries(q);
    const tenants = (await q`SELECT id FROM tenants ORDER BY id`).map((t: any) => t.id).filter((t: string) => !onlyTenant || t === onlyTenant);
    console.log(`PHONE DRY RUN · ${env} · ${new Date().toISOString()} · read-only\n`);
    for (const tenant of tenants) {
      const country = countryOf.get(tenant) || 'IN';
      const cc = String(getCountryCallingCode(country as any));
      console.log(`══ ${tenant} (country ${country}, +${cc})`);
      for (const t of PHONE_TABLES) {
        const rows = ((await t.read(q)) as PhoneRow[]).filter(r => r.tenant_id === tenant);
        const c = { rows: rows.length, empty: 0, already: 0, alreadyForeign: 0, converts: 0, convertsForeign: 0, unreadable: 0 };
        const shapes = new Map<string, number>();
        const notMobile = { valid: 0, invalid: 0 };
        const samples: string[] = [];
        const bad: string[] = [];
        const byNumber = new Map<string, { id: string; converted: boolean }[]>();
        for (const r of rows) {
          const raw = String(r.raw ?? '').trim();
          if (!raw) { c.empty++; continue; }
          const d = raw.replace(/\D/g, '');
          const ccNotMobile = cc === '91' && d.length === 12 && d.startsWith('91') && !/^[6-9]/.test(d.slice(2));
          const v = verdict(raw, country);
          if (ccNotMobile) v.kind === 'unreadable' ? notMobile.invalid++ : notMobile.valid++;
          if (v.kind === 'empty') { c.empty++; continue; }
          if (v.kind === 'unreadable') {
            c.unreadable++;
            const why = v.reason === 'invalid' ? (d.length < 10 ? `invalid, ${d.length} digits` : 'invalid') : v.reason;
            bad.push(`${r.id}  ${JSON.stringify(raw)}  ${why}${r.extra ? `  (${r.extra})` : ''}`);
            continue;
          }
          const p = v; const foreign = v.foreign;
          if (v.kind === 'same') { c.already++; if (foreign) c.alreadyForeign++; }
          else {
            c.converts++; if (foreign) c.convertsForeign++;
            const s = shape(raw, cc); shapes.set(s, (shapes.get(s) || 0) + 1);
            if (samples.length < 5) samples.push(`${JSON.stringify(raw)} → ${p.e164}`);
          }
          byNumber.set(p.e164, [...(byNumber.get(p.e164) || []), { id: r.id, converted: raw !== p.e164 }]);
        }
        // A collision the repair would CAUSE: two rows on one number where at
        // least one of them is being converted. Rows already equal before the
        // repair are existing duplicates, counted but not the repair's doing.
        const groups = [...byNumber.entries()].filter(([, g]) => g.length > 1);
        const collisions = groups.filter(([, g]) => g.some(x => x.converted));
        const existing = groups.length - collisions.length;
        if (!rows.length) continue;
        const reasons = new Map<string, number>();
        for (const b of bad) { const k = b.split('  ')[2].split(',')[0]; reasons.set(k, (reasons.get(k) || 0) + 1); }
        console.log(`  ${t.name}: ${c.rows} rows · empty ${c.empty} · already E.164 ${c.already} (foreign ${c.alreadyForeign}) · converts ${c.converts}${c.convertsForeign ? ` (foreign ${c.convertsForeign})` : ''} · unreadable ${c.unreadable}`);
        if (shapes.size) console.log(`    converts by shape: ${[...shapes.entries()].map(([k, v]) => `${k} ${v}`).join(', ')}`);
        if (notMobile.valid || notMobile.invalid) console.log(`    +${cc} and 10 digits, not a 6-9 mobile: valid ${notMobile.valid} (kept), invalid ${notMobile.invalid} (listed)`);
        for (const s of samples) console.log(`    sample  ${s}`);
        if (reasons.size) console.log(`    unreadable by reason: ${[...reasons.entries()].map(([k, v]) => `${k} ${v}`).join(', ')}`);
        for (const b of (listAll ? bad : bad.slice(0, 25))) console.log(`    unreadable  ${b}`);
        if (!listAll && bad.length > 25) console.log(`    … ${bad.length - 25} more (--list=all)`);
        // Collisions that exist only because of the conversion are what the repair causes.
        for (const [num, g] of collisions) {
          console.log(`    ${t.unique ? 'COLLISION (stops the repair)' : 'collision after conversion (left as is)'}  ${num}  ${g.map(x => `${x.id}${x.converted ? '*' : ''}`).join(', ')}`);
        }
        if (existing) console.log(`    already duplicates before the repair: ${existing} number(s) on more than one row`);
      }
      console.log('');
    }
  });
} finally {
  await sql.end();
}
