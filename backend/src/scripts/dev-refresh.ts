/**
 * Bring every synthetic development firm's dates up to today.
 *
 *   npm run dev:refresh                    move what is behind; says what moved
 *   npm run dev:refresh -- --adopt=<slug>  mark an existing firm synthetic first
 *                                          (one a seeder did not make, e.g. on a
 *                                          database seeded before this existed)
 *
 * The development API does this itself at boot and at the day's turn
 * (services/devData.ts); this is the same call, for when it is not running.
 * Development only, never a paying firm.
 */
process.env.APP_ENV = process.env.APP_ENV || 'development';
process.env.CRM_NO_BOOT = '1';
const { appEnv, databaseUrl, dbRef } = await import('../services/env.js');
if (appEnv() !== 'development') {
  console.error(`\n✗ APP_ENV is "${appEnv()}", not "development". Refusing.\n`);
  process.exit(1);
}
const url = databaseUrl();
if (process.env.DATABASE_URL && dbRef(url) === dbRef(process.env.DATABASE_URL)) {
  console.error(`\n✗ The development URL names the same database as DATABASE_URL (${dbRef(url)}). Refusing.\n`);
  process.exit(1);
}
const { default: postgres } = await import('postgres');
const { pgOptions } = await import('../services/pgOptions.js');
const { adoptSynthetic, refreshDevData } = await import('../services/devData.js');
const sql = postgres(url, pgOptions(url, { max: 1, onnotice: () => {} }));
console.log(`→ development database ${dbRef(url)}`);
try {
  const adopt = process.argv.find(a => a.startsWith('--adopt='))?.split('=')[1];
  if (adopt) {
    const [t] = await sql`SELECT id FROM tenants WHERE id = ${adopt} OR slug = ${adopt} LIMIT 1`;
    if (!t) throw new Error(`No firm "${adopt}" on this database.`);
    await adoptSynthetic(sql, t.id, 'dev-refresh --adopt');
    console.log(`✓ ${t.id} is marked synthetic`);
  }
  const moved = await refreshDevData(sql);
  const marked = await sql`SELECT tenant_id, seeded_by, to_char(refreshed_on, 'YYYY-MM-DD') AS day FROM dev_synthetic_tenants ORDER BY tenant_id`;
  if (!moved.length) console.log('✓ nothing behind today');
  for (const m of marked) console.log(`  ${m.tenant_id.padEnd(20)} anchored to ${m.day} (seeded by ${m.seeded_by})`);
  if (!marked.length) console.log('  no firm is marked synthetic: run `npm run setup:local`, a dev seeder, or --adopt=<slug>');
} catch (e: any) {
  console.error(`✗ ${e.message}`);
  process.exitCode = 1;
} finally {
  await sql.end();
}
