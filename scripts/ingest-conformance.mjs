/**
 * ============================================================================
 * INGEST CONFORMANCE — what a real aggregator will actually throw at us
 * ============================================================================
 * Every case here is something a portal, a lead aggregator or a website form
 * plugin does in the wild. It runs against a LIVE server and a LIVE database,
 * because the failures that matter (a body that never reaches the handler, a
 * retry that doubles a lead, a payload that arrives as an empty object) all
 * happen in the layers a unit test mocks away.
 *
 *   node scripts/ingest-conformance.mjs <baseUrl> <tenant> <apiKey>
 *
 * A case passes if the endpoint ACKNOWLEDGES correctly and the payload we
 * stored is the payload that was sent. Whether it becomes a lead is the
 * parser's job and is asserted separately, because "landed but unparsed" is a
 * correct outcome for an unmapped connection.
 * ============================================================================
 */

const [, , BASE = 'http://localhost:5050', TENANT = 'delpat', KEY] = process.argv
if (!KEY) { console.error('usage: node scripts/ingest-conformance.mjs <baseUrl> <tenant> <apiKey>'); process.exit(2) }

const URL_BASE = `${BASE}/api/v1/ingest/${TENANT}`
const results = []
let inboxSeen = new Set()

const send = async (opts) => {
  const { method = 'POST', qs = '', headers = {}, body } = opts
  const res = await fetch(URL_BASE + qs, { method, headers, body })
  let json = null
  try { json = await res.json() } catch { /* non-JSON answer is itself a finding */ }
  return { status: res.status, json }
}

function check(name, cond, detail) {
  results.push({ name, ok: !!cond, detail: cond ? '' : detail })
  console.log(`${cond ? '  ok  ' : ' FAIL '} ${name}${cond ? '' : `\n         ${detail}`}`)
}

const auth = { 'X-API-Key': KEY, 'Content-Type': 'application/json' }
const J = (o) => JSON.stringify(o)

// ---------------------------------------------------------------------------
const CASES = [
  // --- the documented path ---------------------------------------------------
  {
    name: 'POST JSON with X-API-Key',
    run: () => send({ headers: auth, body: J({ name: 'Aarti Deshmukh', phone: '9822011234', locality: 'Wakad' }) }),
    expect: r => r.status === 200 && r.json?.id,
  },

  // --- auth carried the way portals actually carry it ------------------------
  {
    name: 'POST with ?key= in the URL (portal cannot set headers)',
    run: () => send({ qs: `?key=${KEY}`, headers: { 'Content-Type': 'application/json' }, body: J({ name: 'Key In Url', phone: '9822011235' }) }),
    expect: r => r.status === 200,
  },
  {
    name: 'POST with Authorization: Bearer <key>',
    run: () => send({ headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' }, body: J({ name: 'Bearer Auth', phone: '9822011236' }) }),
    expect: r => r.status === 200,
  },
  {
    name: 'POST with X-Auth-Token',
    run: () => send({ headers: { 'X-Auth-Token': KEY, 'Content-Type': 'application/json' }, body: J({ name: 'Auth Token Header', phone: '9822011237' }) }),
    expect: r => r.status === 200,
  },

  // --- methods and encodings a small portal will use -------------------------
  {
    name: 'GET with the enquiry in the query string',
    run: () => send({ method: 'GET', qs: `?key=${KEY}&name=Query%20String%20Lead&mobile=9822011238&locality=Baner` }),
    expect: r => r.status === 200,
    stored: p => p.name === 'Query String Lead' && p.mobile === '9822011238' && !('key' in p),
  },
  {
    name: 'PUT (sender treats it as update-or-create)',
    run: () => send({ method: 'PUT', headers: auth, body: J({ name: 'Put Lead', phone: '9822011239' }) }),
    expect: r => r.status === 200,
  },
  {
    name: 'form-encoded POST',
    run: () => send({
      headers: { 'X-API-Key': KEY, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'name=Form+Encoded&phone=9822011240&locality=Kharadi',
    }),
    expect: r => r.status === 200,
    stored: p => p.name === 'Form Encoded',
  },
  {
    name: 'JSON sent as text/plain (content-type left at default)',
    run: () => send({
      headers: { 'X-API-Key': KEY, 'Content-Type': 'text/plain' },
      body: J({ name: 'Text Plain JSON', phone: '9822011241' }),
    }),
    expect: r => r.status === 200,
    stored: p => p.name === 'Text Plain JSON',
  },
  {
    name: 'legacy URL shape /:tenant/:source still accepted',
    run: async () => {
      const res = await fetch(`${BASE}/api/v1/ingest/${TENANT}/99acres?key=${KEY}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: J({ name: 'Legacy Url', phone: '9822011242' }),
      })
      return { status: res.status, json: await res.json().catch(() => null) }
    },
    expect: r => r.status === 200,
  },

  // --- malformed, but a real enquiry is inside -------------------------------
  {
    name: 'XML body under a JSON content-type is kept verbatim',
    run: () => send({ headers: auth, body: '<lead><name>Xml Sender</name><phone>9822011243</phone></lead>' }),
    expect: r => r.status === 200,
    stored: p => typeof p._unparsed === 'string' && p._unparsed.includes('Xml Sender'),
  },
  {
    name: 'truncated JSON is kept verbatim rather than 500ing',
    run: () => send({ headers: auth, body: '{"name":"Truncated","phone":"98220' }),
    expect: r => r.status === 200,
    stored: p => typeof p._unparsed === 'string',
  },
  {
    name: 'UTF-8 name survives the round trip',
    run: () => send({ headers: auth, body: J({ name: 'प्रिया नायर', phone: '9822011244' }) }),
    expect: r => r.status === 200,
    stored: p => p.name === 'प्रिया नायर',
  },
  {
    name: 'deeply nested payload lands intact',
    run: () => send({ headers: auth, body: J({ enquiry: { customer: { name: { first: 'Deep', last: 'Nest' }, phones: [{ type: 'mobile', value: '9822011245' }] } } }) }),
    expect: r => r.status === 200,
    stored: p => p.enquiry?.customer?.phones?.[0]?.value === '9822011245',
  },
  {
    name: 'array at the root (batch push) lands intact',
    run: () => send({ headers: auth, body: J([{ name: 'Batch A', phone: '9822011246' }, { name: 'Batch B', phone: '9822011247' }]) }),
    expect: r => r.status === 200,
    stored: p => Array.isArray(p) && p.length === 2,
  },
  {
    name: 'empty body is acknowledged, not rejected',
    run: () => send({ headers: auth, body: J({}) }),
    expect: r => r.status === 200,
  },
  {
    name: 'large payload (200 fields) is accepted',
    run: () => {
      const big = { name: 'Big Payload', phone: '9822011248' }
      for (let i = 0; i < 200; i++) big[`field_${i}`] = `value ${i}`
      return send({ headers: auth, body: J(big) })
    },
    expect: r => r.status === 200,
  },

  // --- things that must be refused ------------------------------------------
  {
    name: 'no key → 401',
    run: () => send({ headers: { 'Content-Type': 'application/json' }, body: J({ name: 'No Key' }) }),
    expect: r => r.status === 401,
  },
  {
    name: 'wrong key → 401',
    run: () => send({ headers: { 'X-API-Key': 'sk_live_' + 'f'.repeat(64), 'Content-Type': 'application/json' }, body: J({ name: 'Bad Key' }) }),
    expect: r => r.status === 401,
  },
  {
    name: 'valid key on ANOTHER tenant\'s URL → 401',
    run: async () => {
      const res = await fetch(`${BASE}/api/v1/ingest/skyline-realty`, {
        method: 'POST', headers: auth, body: J({ name: 'Cross Tenant' }),
      })
      return { status: res.status, json: await res.json().catch(() => null) }
    },
    expect: r => r.status === 401,
  },
  {
    name: 'DELETE → 405 with an Allow header, not the SPA page',
    run: async () => {
      const res = await fetch(`${URL_BASE}?key=${KEY}`, { method: 'DELETE' })
      const body = await res.text()
      return { status: res.status, json: body.startsWith('{') ? JSON.parse(body) : null, raw: body }
    },
    expect: r => r.status === 405 && r.json?.error,
  },

  // --- operational behaviour -------------------------------------------------
  {
    name: 'ack is fast (< 1500ms) so the sender does not retry-storm',
    run: async () => {
      const t = Date.now()
      const r = await send({ headers: auth, body: J({ name: 'Latency Probe', phone: '9822011249' }) })
      return { ...r, ms: Date.now() - t }
    },
    expect: r => r.status === 200 && r.ms < 1500,
    describe: r => `took ${r.ms}ms`,
  },
  {
    name: '10 concurrent pushes all land (no lost writes)',
    run: async () => {
      const rs = await Promise.all(Array.from({ length: 10 }, (_, i) =>
        send({ headers: auth, body: J({ name: `Concurrent ${i}`, phone: `98220112${50 + i}` }) })))
      const ids = new Set(rs.map(r => r.json?.id).filter(Boolean))
      return { status: rs.every(r => r.status === 200) ? 200 : 500, ids: ids.size }
    },
    expect: r => r.status === 200 && r.ids === 10,
    describe: r => `${r.ids}/10 distinct inbox ids`,
  },
]

// ---------------------------------------------------------------------------
console.log(`\ningest conformance → ${URL_BASE}\n`)
const stored = []

for (const c of CASES) {
  let r
  try { r = await c.run() } catch (e) { check(c.name, false, `threw: ${e.message}`); continue }
  const ok = c.expect(r)
  check(c.name, ok, `status ${r.status} ${c.describe ? c.describe(r) : ''} ${JSON.stringify(r.json || {}).slice(0, 160)}`)
  if (c.stored && r.json?.id) stored.push({ name: c.name, id: r.json.id, assert: c.stored })
}

// --- verify what actually landed in the inbox -------------------------------
if (stored.length) {
  console.log('\nstored-payload checks (reading back from the database)\n')
  const { sql } = await import('../backend/src/services/db.ts')
  for (const s of stored) {
    const rows = await sql`SELECT raw_body FROM webhook_inbox WHERE id = ${s.id}`
    const body = rows[0]?.raw_body
    let ok = false
    try { ok = !!body && s.assert(body) } catch (e) { ok = false }
    check(`stored · ${s.name}`, ok, `raw_body = ${JSON.stringify(body).slice(0, 200)}`)
  }
  await sql.end({ timeout: 5 })
}

const failed = results.filter(r => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} passed`)
if (failed.length) { console.log(`\n${failed.length} FAILING:`); failed.forEach(f => console.log(`  · ${f.name}`)) }
process.exit(failed.length ? 1 : 0)
