/**
 * ============================================================================
 * SEND ONE LIVE ENQUIRY TO A DEMO FIRM, THE WAY A WEBSITE FORM DOES
 * ============================================================================
 * WHEN TO RUN THIS: on camera, or just before a pitch, to show a lead landing
 * by itself and reaching an agent. It goes through the firm's real ingest key
 * and the real parser and routing — nothing is written around them.
 *
 *   npx tsx backend/src/scripts/demo-enquiry.ts --firm=demo-film \
 *       [--owner=rachel] [--api=http://localhost:5001] [--name="…"] [--want="…"]
 *
 * Signs in as the demo firm's owner (--owner, the sign-in handle the generator
 * printed; the shared demo password), reads the firm's market from its settings,
 * reveals the Website connection's key the way Settings → Connections does,
 * and POSTs one enquiry to /api/v1/ingest/<firm>. Prints the lead it made.
 *
 * Refuses any firm that does not start `demo-`, and the production API.
 * ============================================================================
 */
const arg = (k: string) => process.argv.find(a => a.startsWith(`--${k}=`))?.slice(k.length + 3);
const FIRM = arg('firm') || '';
const API = (arg('api') || 'http://localhost:5001').replace(/\/+$/, '') + '/api/v1';
if (!/^demo-/.test(FIRM)) { console.error('✗ --firm must be a demo firm (demo-…).'); process.exit(1); }
if (/api\.re\.delpat\.in/.test(API) && !/api\.dev\./.test(API)) { console.error('✗ That is the production API. Refusing.'); process.exit(1); }

const OWNER = arg('owner') || '';
if (!OWNER) { console.error('✗ --owner=<the owner sign-in, as the generator printed it> is required.'); process.exit(1); }
const PASSWORD = arg('password') || 'Demo@1234';
const H = { 'Content-Type': 'application/json', 'X-Tenant-ID': FIRM };

async function main() {
  const login: any = await (await fetch(`${API}/auth/login`, { method: 'POST', headers: H, body: JSON.stringify({ handle: OWNER, password: PASSWORD }) })).json();
  if (!login.token) throw new Error(`could not sign in as ${OWNER}: ${JSON.stringify(login)}`);
  const A = { ...H, Authorization: `Bearer ${login.token}` };
  const list: any = await (await fetch(`${API}/connections`, { headers: A })).json();
  const rows: any[] = list.connections || list.data || list || [];
  const site = rows.find((c: any) => /website/i.test(c.provider || c.name || ''));
  if (!site) throw new Error('this firm has no Website connection');
  const { apiKey }: any = await (await fetch(`${API}/connections/${site.id}/key`, { headers: A })).json();
  if (!apiKey) throw new Error('the key could not be revealed');

  // The firm's market decides the phone and the words, so a US firm gets a US
  // enquiry. The number is one no lead of the firm already has: the fiction
  // blocks are small (a US area code has 100), and a number already on file is
  // filed as that person enquiring again, not as a new lead.
  const boot: any = await (await fetch(`${API}/workspace/bootstrap`, { headers: A })).json();
  const us = boot?.state?.settings?.locale?.phoneCountry === '1';
  const all: any = await (await fetch(`${API}/leads?limit=5000`, { headers: A })).json();
  const taken = new Set((all.leads || all.data || []).map((l: any) => String(l.phone || '').replace(/\D/g, '').slice(-10)));
  const pool = us
    ? ['512', '737'].flatMap(ac => Array.from({ length: 100 }, (_, i) => `+1${ac}55501${String(i).padStart(2, '0')}`))
    : Array.from({ length: 2000 }, () => `+9199555${String(Math.floor(Math.random() * 1e5)).padStart(5, '0')}`);
  const free = pool.filter(p => !taken.has(p.replace(/\D/g, '').slice(-10)));
  if (!free.length) throw new Error('every fiction number is already on a lead; delete a test lead first');
  const phone = free[Math.floor(Math.random() * free.length)];
  const name = arg('name') || (us ? 'Megan Brooks' : 'Neha Kapoor');
  const fields = us
    ? { message: 'Pre-approved, would like to tour this week', area: 'Mueller', bedrooms: '3 bed', budget: 650000, looking_to: 'sale' }
    : { message: 'Family of 3, needs it from next month', area: 'Alkapuri', bedrooms: '2 BHK', budget: 25000, looking_to: 'rent' };
  if (arg('want')) fields.message = arg('want')!;
  const r = await fetch(`${API}/ingest/${FIRM}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-API-Key': apiKey },
    body: JSON.stringify({ name, phone, ...fields, source: 'Website' }),
  });
  console.log(`${r.status} ${await r.text()}`);
  console.log(`Sent: ${name}, ${phone}. It appears on Leads within ~15 s (the app's refresh).`);
}
main().catch(e => { console.error('✗', e?.message || e); process.exit(1); });
