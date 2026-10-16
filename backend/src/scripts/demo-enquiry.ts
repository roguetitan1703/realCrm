/**
 * ============================================================================
 * SEND ONE LIVE ENQUIRY TO A DEMO FIRM, THE WAY A WEBSITE FORM DOES
 * ============================================================================
 * WHEN TO RUN THIS: on camera, or just before a pitch, to show a lead landing
 * by itself and reaching an agent. It goes through the firm's real ingest key
 * and the real parser and routing — nothing is written around them.
 *
 *   npx tsx backend/src/scripts/demo-enquiry.ts --firm=demo-film \
 *       [--api=http://localhost:5001] [--name="Neha Kapoor"] [--want="2 BHK on rent near Alkapuri"]
 *
 * Signs in as the demo firm's owner (the generator's shared demo password),
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

const OWNER = arg('owner') || 'hitesh';
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

  // A phone in the generator's fiction block, different every run.
  const phone = `+9199555${String(Date.now()).slice(-5)}`;
  const name = arg('name') || 'Neha Kapoor';
  const message = arg('want') || 'Looking for a 2 BHK on rent near Alkapuri, family of 3';
  const r = await fetch(`${API}/ingest/${FIRM}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-API-Key': apiKey },
    body: JSON.stringify({ name, phone, message, source: 'Website' }),
  });
  console.log(`${r.status} ${await r.text()}`);
  console.log(`Sent: ${name}, ${phone}. It appears on Leads within ~15 s (the app's refresh).`);
}
main().catch(e => { console.error('✗', e?.message || e); process.exit(1); });
