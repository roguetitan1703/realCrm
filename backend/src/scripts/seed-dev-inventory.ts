/**
 * ============================================================================
 * FLATS, OWNERS AND AGREEMENTS, FOR THE DEVELOPMENT DATABASE
 * ============================================================================
 * WHEN TO RUN THIS: to try Properties, Contacts (Owners, Tenants, Buyers),
 * Close the deal and Convert to property on dev with something in them.
 *
 *   npm run seed:dev:inventory            clear any earlier run, then write
 *   npm run seed:dev:inventory -- --clear only clear
 *
 * Writes, on the `delpat` tenant only:
 *   • flats that MATCH the fixture leads (Fairhaven, Kingsmead, Northgate,
 *     Sunridge; 1 to 3 BHK; rent and sale), and flats that match none
 *     (other areas, a villa, a shop, a studio);
 *   • an owner for every flat, which is what puts them in Contacts → Owners,
 *     landlords and sellers both;
 *   • three calling rows at Key Received with the flat filled in, ready for
 *     Convert to property;
 *   • agreements: a rent ending within 30 days, a rent with months to run, a
 *     sale, and a rent that ended, two of them linked to a lead, so Tenants,
 *     Buyers, renewals and "Ending in 30 days" all have rows.
 *
 * Every row it writes has an id starting `p_demo_`, `own_demo_`, `agr_demo_`
 * or `l_demo_inv_`, and --clear deletes exactly those (and their timeline).
 * Refuses anything but the development database, like seed-dev-activity.ts.
 * ============================================================================
 */
import postgres from 'postgres';
import { appEnv, databaseUrl, dbRef } from '../services/env.js';

process.env.APP_ENV = process.env.APP_ENV || 'development';
const TENANT = 'delpat';
const clearOnly = process.argv.includes('--clear');

if (appEnv() !== 'development') {
  console.error(`\n✗ APP_ENV is "${appEnv()}", not "development". Refusing.\n`);
  process.exit(1);
}
const url = databaseUrl();
if (!url) { console.error('✗ No database URL resolved.'); process.exit(1); }
if (process.env.DATABASE_URL && dbRef(url) === dbRef(process.env.DATABASE_URL)) {
  console.error(`\n✗ The development URL resolves to the same project as DATABASE_URL (${dbRef(url)}). Refusing.\n`);
  process.exit(1);
}
const sql = postgres(url, { max: 1, ssl: 'require' });

async function clear() {
  const ids = (await sql`
    SELECT id FROM crm_properties WHERE tenant_id = ${TENANT} AND id LIKE 'p\\_demo\\_%'
    UNION ALL SELECT id FROM crm_owners WHERE tenant_id = ${TENANT} AND id LIKE 'own\\_demo\\_%'
    UNION ALL SELECT id FROM crm_leads WHERE tenant_id = ${TENANT} AND id LIKE 'l\\_demo\\_inv\\_%'`).map((r: any) => r.id);
  const a = await sql`DELETE FROM crm_agreements WHERE tenant_id = ${TENANT} AND id LIKE 'agr\\_demo\\_%'`;
  const e = ids.length ? await sql`DELETE FROM crm_timeline_events WHERE tenant_id = ${TENANT} AND record_id IN ${sql(ids)}` : { count: 0 };
  const p = await sql`DELETE FROM crm_properties WHERE tenant_id = ${TENANT} AND id LIKE 'p\\_demo\\_%'`;
  const o = await sql`DELETE FROM crm_owners WHERE tenant_id = ${TENANT} AND id LIKE 'own\\_demo\\_%'`;
  const l = await sql`DELETE FROM crm_leads WHERE tenant_id = ${TENANT} AND id LIKE 'l\\_demo\\_inv\\_%'`;
  console.log(`cleared: ${p.count} flats, ${o.count} owners, ${a.count} agreements, ${l.count} leads, ${e.count} timeline events`);
}

await clear();
if (clearOnly) { await sql.end(); process.exit(0); }

const agents = await sql`SELECT id, name FROM users WHERE tenant_id = ${TENANT} AND role = 'agent' AND deleted_at IS NULL ORDER BY name`;
if (!agents.length) { console.error('✗ No agents on delpat.'); process.exit(1); }
const agent = (i: number) => agents[i % agents.length].id;

// [key, project, tower, unit, locality, deal, bhk, subtype, price, status, owner, owner phone]
type Flat = [string, string, string, string, string, 'rent' | 'sale', string, string, number, string, string, string];
const FLATS: Flat[] = [
  // Match the fixture leads.
  ['f1', 'Oakridge Towers', 'A', '302', 'Fairhaven', 'rent', '2', 'apartment', 28000, 'Available', 'Sunil Joshi', '9822100001'],
  ['f2', 'Oakridge Towers', 'A', '504', 'Fairhaven', 'rent', '2', 'apartment', 30000, 'Available', 'Kavita Menon', '9822100002'],
  ['f3', 'Oakridge Towers', 'B', '101', 'Fairhaven', 'rent', '1', 'apartment', 16000, 'Available', 'Harish Patil', '9822100003'],
  ['f4', 'Oakridge Towers', 'B', '702', 'Fairhaven', 'sale', '3', 'apartment', 12500000, 'Available', 'Nandini Rao', '9822100004'],
  ['f5', 'Maple Court', 'C', '201', 'Fairhaven', 'sale', '2', 'apartment', 8200000, 'Available', 'Prakash Shah', '9822100005'],
  ['f6', 'Maple Court', 'C', '903', 'Fairhaven', 'sale', '1', 'apartment', 5200000, 'Available', 'Leena Dsouza', '9822100006'],
  ['f7', 'Lakeview Residency', '1', '204', 'Kingsmead', 'rent', '2', 'apartment', 26000, 'Available', 'Ganesh Pawar', '9822100007'],
  ['f8', 'Lakeview Residency', '1', '608', 'Kingsmead', 'sale', '2', 'apartment', 7800000, 'Available', 'Ritu Agarwal', '9822100008'],
  ['f9', 'Palm Grove', '', '402', 'Northgate', 'rent', '2', 'apartment', 24000, 'Available', 'Imran Shaikh', '9822100009'],
  ['f10', 'Sunridge Heights', 'D', '1102', 'Sunridge', 'sale', '2', 'apartment', 8800000, 'Available', 'Vandana Kulkarni', '9822100010'],
  ['f11', 'Sunridge Heights', 'D', '305', 'Sunridge', 'rent', '2', 'apartment', 25000, 'Available', 'Ashok Bhide', '9822100011'],
  // Match nobody: an area no lead asks for, or a kind of place none wants.
  ['n1', 'Hillcrest Villas', '', '7', 'Hillcrest', 'sale', '4', 'villa', 32000000, 'Available', 'Rajeev Malhotra', '9822100012'],
  ['n2', 'Westbrook Plaza', '', 'G-12', 'Westbrook', 'rent', '', 'shop', 45000, 'Available', 'Farida Khan', '9822100013'],
  ['n3', 'Westbrook Studios', '', '1504', 'Westbrook', 'rent', '1rk', 'studio', 12000, 'Available', 'Tony Fernandes', '9822100014'],
  ['n4', 'Elmcourt Sky', '', 'PH-2', 'Elmcourt', 'sale', '5plus', 'penthouse', 48000000, 'Available', 'Meenal Sethi', '9822100015'],
  // Let or sold through us: the agreements below.
  ['a1', 'Oakridge Towers', 'A', '801', 'Fairhaven', 'rent', '2', 'apartment', 29000, 'Leased', 'Dilip Karnik', '9822100016'],
  ['a2', 'Lakeview Residency', '2', '110', 'Kingsmead', 'rent', '1', 'apartment', 17000, 'Leased', 'Shobha Iyer', '9822100017'],
  ['a3', 'Palm Grove', '', '108', 'Northgate', 'sale', '2', 'apartment', 7400000, 'Sold', 'Mahesh Gokhale', '9822100018'],
  ['a4', 'Sunridge Heights', 'D', '704', 'Sunridge', 'rent', '2', 'apartment', 23000, 'Available', 'Aarti Deshmukh', '9822100019'],
];
const SUB = (s: string) => s.split('_').map(w => w[0].toUpperCase() + w.slice(1)).join(' ');
const bhkLabel = (b: string) => (b === '1rk' ? '1 RK' : b === '5plus' ? '5+ BHK' : b ? `${b} BHK` : '');

let i = 0;
for (const [key, project, tower, unit, locality, deal, bhk, subtype, price, status, owner, phone] of FLATS) {
  const pid = `p_demo_${key}`, oid = `own_demo_${key}`;
  const type = [bhkLabel(bhk), SUB(subtype)].filter(Boolean).join(' ');
  const category = subtype === 'shop' ? 'commercial' : 'residential';
  const unitLabel = [tower, unit].filter(Boolean).join('-');
  await sql`INSERT INTO crm_owners (id, tenant_id, name, phone, project, tower, unit_no, config, locality, stage, source, agent_id, converted_property_id, created_at, updated_at)
    VALUES (${oid}, ${TENANT}, ${owner}, ${phone}, ${project}, ${tower || null}, ${unit}, ${type}, ${locality}, 'Key Received', 'Demo', ${agent(i)}, ${pid}, now() - interval '20 days', now())`;
  const config = { deal, society: project, bhk, subtype, category, wing: tower, flat: unit, owner, ownerPhone: phone };
  await sql`INSERT INTO crm_properties (id, tenant_id, title, status, type, locality, price, tower, unit, config, project, wing, unit_no, deal,
      category, subtype, bhk, carpet_sqft, floor, owner_name, owner_phone, owner_contact_id, key_access, created_at, completeness)
    VALUES (${pid}, ${TENANT}, ${[project, unitLabel].filter(Boolean).join(' - ')}, ${status}, ${type}, ${locality}, ${String(price)},
      ${tower || ''}, ${unit}, ${sql.json(config)}, ${project}, ${tower || null}, ${unit}, ${deal},
      ${category}, ${subtype}, ${bhk || null}, ${bhk === '1' ? 520 : bhk === '2' ? 780 : bhk === '3' ? 1150 : 2400},
      ${String((i % 12) + 1)}, ${owner}, ${phone}, ${oid}, ${'Key with us'}, now() - interval '20 days', 60)`;
  i++;
}

// Ready to convert: at the final status, flat filled in, nothing made yet.
const TO_CONVERT = [
  ['c1', 'Pradeep Sawant', '9822100031', 'Maple Court', 'C', '604', '2 BHK', 'Fairhaven'],
  ['c2', 'Yamini Joshi', '9822100032', 'Lakeview Residency', '1', '902', '3 BHK', 'Kingsmead'],
  ['c3', 'Kiran Bhosale', '9822100033', 'Palm Grove', '', '210', '1 BHK', 'Northgate'],
];
for (const [key, name, phone, project, tower, unit, config, locality] of TO_CONVERT) {
  await sql`INSERT INTO crm_owners (id, tenant_id, name, phone, project, tower, unit_no, config, locality, stage, source, agent_id, created_at, updated_at)
    VALUES (${`own_demo_${key}`}, ${TENANT}, ${name}, ${phone}, ${project}, ${tower || null}, ${unit}, ${config}, ${locality}, 'Key Received', 'Demo', ${agent(i++)}, now() - interval '6 days', now())`;
}

// Two leads who closed with us, so a tenant and a buyer each have one behind them.
const LEADS = [
  ['1', 'Rohit Kale', '+919822100041', 'rent', 'Fairhaven'],
  ['2', 'Anand Rao', '+919822100042', 'sale', 'Northgate'],
];
for (const [key, name, phone, deal, loc] of LEADS) {
  await sql`INSERT INTO crm_leads (id, tenant_id, name, phone, stage, source, agent_id, deal, req, created_at)
    VALUES (${`l_demo_inv_${key}`}, ${TENANT}, ${name}, ${phone}, 'Deal Closed', 'Demo', ${agent(Number(key))}, ${deal},
      ${sql.json({ locality: loc, config: '2 BHK', deal })}, now() - interval '40 days')`;
}

// [key, kind, status, flat, lead, party, phone, amount, deposit, start (days from today), end (days from today)]
const AGREEMENTS: [string, 'rent' | 'sale', string, string, string | null, string, string, number, number | null, number, number | null][] = [
  ['1', 'rent', 'active', 'a1', 'l_demo_inv_1', 'Rohit Kale', '+919822100041', 29000, 90000, -315, 20],
  ['2', 'rent', 'active', 'a2', null, 'Meera Pillai', '9822100043', 17000, 50000, -120, 215],
  ['3', 'sale', 'active', 'a3', 'l_demo_inv_2', 'Anand Rao', '+919822100042', 7400000, null, -25, null],
  ['4', 'rent', 'ended', 'a4', null, 'Sanjay Kamble', '9822100044', 22000, 60000, -400, -65],
];
for (const [key, kind, status, flat, lead, party, phone, amount, deposit, start, end] of AGREEMENTS) {
  await sql`INSERT INTO crm_agreements (id, tenant_id, kind, status, property_id, owner_id, lead_id, party_name, party_phone, agent_id,
      amount, deposit, start_date, end_date, created_by, created_at)
    VALUES (${`agr_demo_${key}`}, ${TENANT}, ${kind}, ${status}, ${`p_demo_${flat}`}, ${`own_demo_${flat}`}, ${lead}, ${party}, ${phone},
      ${agent(Number(key))}, ${amount}, ${deposit}, (now()::date + ${start}::int), ${end == null ? null : sql`(now()::date + ${end}::int)`},
      ${agent(Number(key))}, now() + (${start}::int * interval '1 day'))`;
}

const [c] = await sql`SELECT
  (SELECT count(*)::int FROM crm_properties WHERE tenant_id = ${TENANT} AND id LIKE 'p\\_demo\\_%') AS flats,
  (SELECT count(*)::int FROM crm_owners WHERE tenant_id = ${TENANT} AND id LIKE 'own\\_demo\\_%') AS owners,
  (SELECT count(*)::int FROM crm_agreements WHERE tenant_id = ${TENANT} AND id LIKE 'agr\\_demo\\_%') AS agreements`;
console.log(`wrote: ${c.flats} flats (11 that match leads, 4 that match none, 4 let or sold), ${c.owners} owners (3 ready to convert), ${c.agreements} agreements, 2 leads`);
await sql.end();
