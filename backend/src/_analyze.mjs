import postgres from 'postgres'
const sql = postgres(process.env.DATABASE_URL, { max: 1, ssl: 'require' })
const rows = await sql`SELECT g.tenant_id, g.provider, w.raw_body FROM webhook_inbox w JOIN integrations g ON g.id=w.integration_id
  WHERE w.raw_body IS NOT NULL`
const shapes = new Map()
for (const r of rows) {
  const k = `${r.tenant_id} | ${r.provider} | ${Object.keys(r.raw_body||{}).sort().join(',')}`
  shapes.set(k, (shapes.get(k)||0)+1)
}
for (const [k,n] of [...shapes.entries()].sort()) console.log(`${String(n).padStart(3)}x  ${k}`)
await sql.end()
