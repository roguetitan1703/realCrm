/**
 * ============================================================================
 * LEAD FLOWS — does a real payload become a CORRECT lead?
 * ============================================================================
 * The conformance suite proves a push lands. This proves what it turns into.
 * Each provider below has a genuinely different schema, and each gets its own
 * mapping — which is the whole premise of the inbox-first design: we do not
 * guess a provider's field names, we read them off their real payload.
 *
 *   node scripts/ingest-lead-flows.mjs <baseUrl> <tenant>
 *
 * Creates its own throwaway connections, asserts against the live database,
 * and deletes only what it created.
 * ============================================================================
 */

const [, , BASE = 'http://localhost:5050', TENANT = 'delpat'] = process.argv
const { sql } = await import('../backend/src/services/db.ts')
const { createIntegration, setParserConfig, deleteIntegration } = await import('../backend/src/services/ingestion.ts')

const results = []
const check = (name, ok, detail = '') => {
  results.push({ name, ok })
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${name}${ok ? '' : `\n         ${detail}`}`)
}

const push = async (key, body, headers = {}) => {
  const res = await fetch(`${BASE}/api/v1/ingest/${TENANT}`, {
    method: 'POST',
    headers: { 'X-API-Key': key, 'Content-Type': 'application/json', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
  return await res.json().catch(() => null)
}

/**
 * The ack is sent BEFORE parsing, on purpose — a provider must not wait on our
 * database. So the test polls for a terminal status instead of sleeping a fixed
 * amount: a fixed sleep passes on a warm connection and fails on a cold one,
 * which is a flaky test pretending to be a bug.
 *
 * `pending` is terminal for an unmapped connection, so it is returned once the
 * window closes rather than treated as a timeout.
 */
const settled = async (id, ms = 12000) => {
  const until = Date.now() + ms
  let row = null
  while (Date.now() < until) {
    row = (await sql`SELECT status, error, lead_id FROM webhook_inbox WHERE id = ${id}`)[0]
    if (row && row.status !== 'pending') return row
    await new Promise(r => setTimeout(r, 250))
  }
  return row
}

const leadFor = async (phoneDigits) => {
  const rows = await sql`
    SELECT id, name, phone, email, req, source, stage FROM crm_leads
    WHERE tenant_id = ${TENANT} AND regexp_replace(phone, '[^0-9]', '', 'g') LIKE ${'%' + phoneDigits}
    ORDER BY created_at DESC LIMIT 1`
  return rows[0] || null
}


const made = []
async function connection(label, parserConfig) {
  const { integration, apiKey } = await createIntegration(TENANT, label, null)
  await setParserConfig(TENANT, integration.id, parserConfig)
  made.push(integration.id)
  return apiKey
}

console.log(`\nlead flows → ${BASE} · tenant ${TENANT}\n`)

// ---------------------------------------------------------------------------
// Schema 1 — nested, the shape a big portal sends
// ---------------------------------------------------------------------------
{
  const key = await connection('TEST 99acres-shaped', {
    map: {
      name: 'lead.name', phone: 'lead.mobile', email: 'lead.email',
      'req.locality': 'project.locality', 'req.config': 'requirement.bhk',
      'req.notes': 'message', external_id: 'enquiry_id',
    },
    transforms: { phone: 'phone_in', name: 'trim', 'req.config': 'bhk' },
    defaults: { 'req.deal': 'sale' },
  })

  const r = await push(key, {
    lead: { name: '  Rohit Malhotra  ', mobile: '+91 98220 61111', email: 'rohit@x.com' },
    project: { locality: 'Wakad' }, requirement: { bhk: '3 BHK' },
    message: 'Wants possession in 6 months', enquiry_id: 'TEST-99A-1',
  })
  const row = await settled(r.id)
  check('nested payload → parsed', row?.status === 'parsed', `status=${row?.status} err=${row?.error}`)

  const l = await leadFor('9822061111')
  check('  name is trimmed', l?.name === 'Rohit Malhotra', `got ${JSON.stringify(l?.name)}`)
  check('  phone normalised from "+91 98220 61111"', /9822061111$/.test(String(l?.phone || '').replace(/\D/g, '')), `got ${l?.phone}`)
  check('  locality read from a nested path', l?.req?.locality === 'Wakad', `got ${l?.req?.locality}`)
  check('  stage is New', l?.stage === 'New', `got ${l?.stage}`)
  check('  source falls back to the provider name', /99acres/i.test(l?.source || ''), `got ${l?.source}`)

  // Retry with the SAME provider reference — the classic double-lead bug.
  const r2 = await push(key, {
    lead: { name: 'Rohit Malhotra', mobile: '+91 98220 61111' },
    project: { locality: 'Wakad' }, requirement: { bhk: '3 BHK' }, enquiry_id: 'TEST-99A-1',
  })
  const row2 = await settled(r2.id)
  check('retry of the same enquiry_id is not a second lead', row2?.status === 'ignored', `status=${row2?.status}`)

  const dupes = await sql`
    SELECT count(*)::int n FROM crm_leads
    WHERE tenant_id = ${TENANT} AND regexp_replace(phone,'[^0-9]','','g') LIKE '%9822061111'`
  check('  exactly one lead exists for that number', dupes[0].n === 1, `found ${dupes[0].n}`)
}

// ---------------------------------------------------------------------------
// Schema 2 — flat, snake_case, money as a string. A website form plugin.
// ---------------------------------------------------------------------------
{
  const key = await connection('TEST website-form-shaped', {
    map: {
      name: 'full_name', phone: 'phone_number', email: 'email_address',
      'req.locality': 'area', 'req.config': 'looking_for',
      'req.budgetMax': 'max_budget', 'req.notes': 'notes',
    },
    transforms: { phone: 'phone_in', 'req.budgetMax': 'money_in', 'req.config': 'bhk' },
    valueMaps: { 'req.locality': { 'hinjewadi ph 2': 'Hinjewadi Phase 2' } },
    defaults: { 'req.deal': 'sale', source: 'Website' },
  })

  const r = await push(key, {
    full_name: 'Amit Deshpande', phone_number: '09028011223', email_address: 'amit@x.in',
    area: 'hinjewadi ph 2', looking_for: '2BHK', max_budget: '75,00,000', notes: 'Corner unit',
  })
  check('flat payload → parsed', (await settled(r.id))?.status === 'parsed')

  const l = await leadFor('9028011223')
  check('  leading 0 stripped from the phone', /^(\+?91)?9028011223$/.test(String(l?.phone || '').replace(/[\s-]/g, '')), `got ${l?.phone}`)
  check('  valueMap rewrote the locality', l?.req?.locality === 'Hinjewadi Phase 2', `got ${l?.req?.locality}`)
  check('  "75,00,000" parsed to a number', Number(l?.req?.budgetMax) === 7500000, `got ${l?.req?.budgetMax}`)
  check('  default source applied', l?.source === 'Website', `got ${l?.source}`)
}

// ---------------------------------------------------------------------------
// Schema 3 — the same buyer enquiring twice through DIFFERENT providers
// ---------------------------------------------------------------------------
{
  const key = await connection('TEST second-portal', {
    map: { name: 'contact_name', phone: 'contact_no' },
    transforms: { phone: 'phone_in' },
    defaults: { 'req.deal': 'sale' },
  })
  const r = await push(key, { contact_name: 'Amit Deshpande', contact_no: '9028011223' })
  const row = await settled(r.id)
  check('same buyer via another provider merges rather than duplicating',
    row?.status === 'parsed' && !!row?.lead_id, `status=${row?.status}`)

  const n = await sql`
    SELECT count(*)::int n FROM crm_leads
    WHERE tenant_id = ${TENANT} AND regexp_replace(phone,'[^0-9]','','g') LIKE '%9028011223'`
  check('  still exactly one lead for that buyer', n[0].n === 1, `found ${n[0].n}`)
}

// ---------------------------------------------------------------------------
// Schema 4 — the mapping is right but the payload is not
// ---------------------------------------------------------------------------
{
  const key = await connection('TEST bad-payloads', {
    map: { name: 'full_name', phone: 'phone_number' },
    transforms: { phone: 'phone_in' },
    defaults: { 'req.deal': 'sale' },
  })

  const before = (await sql`SELECT count(*)::int n FROM crm_leads WHERE tenant_id = ${TENANT}`)[0].n

  const noPhone = await settled((await push(key, { full_name: 'No Phone Person' })).id)
  check('missing phone → failed with a reason, no lead',
    noPhone?.status === 'failed' && /phone/i.test(noPhone?.error || ''), `status=${noPhone?.status} err=${noPhone?.error}`)

  const empty = await settled((await push(key, {})).id)
  check('empty object → failed, no lead', empty?.status === 'failed', `status=${empty?.status}`)

  const nulls = await settled((await push(key, { full_name: null, phone_number: '' })).id)
  check('nulls and empty strings → failed, no lead', nulls?.status === 'failed', `status=${nulls?.status}`)

  const junk = await settled((await push(key, '<xml>not json</xml>')).id)
  check('unparseable body → failed, no lead', junk?.status === 'failed', `status=${junk?.status}`)

  const after = (await sql`SELECT count(*)::int n FROM crm_leads WHERE tenant_id = ${TENANT}`)[0].n
  check('  no lead was created by any of the four', after === before, `${before} → ${after}`)
}

// ---------------------------------------------------------------------------
// Schema 5 — an unmapped connection must NOT invent a lead
// ---------------------------------------------------------------------------
{
  const { integration, apiKey } = await createIntegration(TENANT, 'TEST unmapped', null)
  made.push(integration.id)
  const r = await push(apiKey, { name: 'Should Stay Pending', phone: '9822069999' })
  const row = await settled(r.id)
  check('unmapped connection leaves the push pending', row?.status === 'pending', `status=${row?.status}`)
  check('  and creates no lead', (await leadFor('9822069999')) === null)
}

// ---------------------------------------------------------------------------
for (const id of made) {
  await sql`DELETE FROM webhook_inbox WHERE integration_id = ${id}`
  await deleteIntegration(TENANT, id)
}
await sql`DELETE FROM crm_leads WHERE tenant_id = ${TENANT} AND regexp_replace(phone,'[^0-9]','','g') ~ '(9822061111|9028011223)$'`

const failed = results.filter(r => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} passed`)
if (failed.length) { console.log(`\n${failed.length} FAILING:`); failed.forEach(f => console.log(`  · ${f.name}`)) }
await sql.end({ timeout: 5 })
process.exit(failed.length ? 1 : 0)
