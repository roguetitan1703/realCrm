/**
 * ============================================================================
 * MAKE `delpat` SAFE TO SHOW SOMEBODY
 * ============================================================================
 * WHEN TO RUN THIS: before recording a demo, sharing a preview link, or putting
 * the development desk in front of anyone outside Delpat — and again after every
 * `shape-clone-to-dev.ts`, because that brings the shape back and this is what
 * removes the words.
 *
 *   npx tsx backend/src/scripts/redact-demo-tenant.ts            # dry run
 *   npx tsx backend/src/scripts/redact-demo-tenant.ts --write
 *
 * WHAT shape-clone ALREADY DOES: names, phones and emails on leads are
 * generated. WHAT IT MISSED, and this fixes:
 *
 *   - `source` — the real portals a real firm pays for.
 *   - `locality` — Mahalunge, Hinjawadi, Bhoirwadi: a specific firm's patch,
 *     which names the client as surely as the client's name would.
 *   - `req.notes` / `req.interest` / `req.project` — the raw portal blurb,
 *     carrying builder and project names verbatim.
 *   - timeline remarks holding a six-digit-or-longer run, which is a phone
 *     number or a price somebody typed.
 *
 * WRITES DEVELOPMENT ONLY. It refuses if `DEV_DATABASE_URL` is unset, if it
 * resolves to the same project as `DATABASE_URL`, or if asked for any tenant
 * but `delpat`. It never opens the production connection at all.
 *
 * DETERMINISTIC: the same real value always maps to the same fake one, so a
 * lead's locality still matches its enquiry's locality and the desk still reads
 * like one firm's book rather than noise.
 * ============================================================================
 */
// FOR THE SIDE EFFECT: env.ts reads `.env` (and `.env.<APP_ENV>`) off the
// current working directory at import time. Without it this script sees only
// what the shell exported, so DEV_DATABASE_URL was unset and it refused to run
// — from the repo root, where every other script works.
import '../services/env.js';
import postgres from 'postgres';
import { createHash } from 'crypto';

const WRITE = process.argv.includes('--write');
const TENANT = 'delpat';

const DEV = process.env.DEV_DATABASE_URL || '';
const PROD = process.env.DATABASE_URL || '';
const ref = (u: string) => (u.match(/(?:db\.|postgres\.)([a-z0-9]{16,})/) || [])[1] || u;
if (!DEV) { console.error('DEV_DATABASE_URL must be set.'); process.exit(1); }
if (PROD && ref(PROD) === ref(DEV)) {
  console.error(`Refusing: DEV_DATABASE_URL and DATABASE_URL name the same project (${ref(DEV)}).`);
  process.exit(1);
}

const sql = postgres(DEV, { max: 1, ssl: 'require' });

/** Stable index from a string, so one real value always becomes one fake one. */
const idx = (s: string, n: number) =>
  parseInt(createHash('sha1').update(String(s)).digest('hex').slice(0, 8), 16) % n;

// Invented, and deliberately not near any real Pune suburb — a "close enough"
// fake locality is how a redacted desk still points at the firm it came from.
const LOCALITIES = ['Rosewood East', 'Fairhaven', 'Lakeview North', 'Ashvale',
  'Brookfield', 'Sunridge', 'Northgate', 'Elmcourt', 'Riverbend', 'Kingsmead'];
const PROJECTS = ['Aster Heights', 'Belmont Greens', 'Crestwood Park', 'Dovecote Residences',
  'Elmwood Enclave', 'Fernhill Towers', 'Grangewood', 'Harbour Point'];
const SOURCES: Record<string, string> = {
  'Housing.com': 'Portal One', 'MagicBricks': 'Portal Two', '99acres': 'Portal Three',
  'Property Circle': 'Portal Four', 'Website': 'Website', 'Walk-in': 'Walk-in', 'Referral': 'Referral',
};

// IDEMPOTENT. Run twice and the second run must be a no-op: an already-fake
// value is left exactly as it is. Without this, a second pass mapped Fairhaven
// to Riverbend and Portal One to Portal D -- churning the desk and breaking the
// promise that one real value always becomes one fake one.
const isFakeLocality = (v: string) => LOCALITIES.includes(v);
const isFakeProject = (v: string) => PROJECTS.includes(v);
const isFakeSource = (v: string) => /^Portal /.test(v) || ['Website', 'Walk-in', 'Referral'].includes(v);

const fakeLocality = (v: string) => (isFakeLocality(v) ? v : LOCALITIES[idx(v, LOCALITIES.length)]);
const fakeProject = (v: string) => (isFakeProject(v) ? v : PROJECTS[idx(v, PROJECTS.length)]);
const fakeSource = (v: string) => (isFakeSource(v) ? v : (SOURCES[v] ?? `Portal ${String.fromCharCode(65 + idx(v, 6))}`));

/** Any run of six or more digits is a phone number or a price somebody typed. */
// A NON-DIGIT MARKER, so the scrub is idempotent. Replacing a run of digits
// with a run of 9s left the row still matching '[0-9]{6,}', so every later run
// re-selected and rewrote the same 21 rows for ever, and no run could ever
// report "clean".
const scrubDigits = (s: string) => s.replace(/\d{6,}/g, '••••••');

/**
 * THE WORDS A TIMELINE ROW CARRIES.
 *
 * Enquiry events quote the portal blurb verbatim -- "2Bed Apartment for Sale in
 * Godrej Green Vistas, Mahalunge, Pune West" -- and a title says which portal it
 * came through. Scrubbing digits alone left every builder, project, suburb and
 * city intact, which names the firm more precisely than a phone number would.
 *
 * An explicit list, not a pattern: a regex that misses once has leaked, and
 * these are finite and knowable. Add to it if a clone brings new ones -- the
 * script prints anything it could not map.
 */
const REAL_TOKENS = [
  'VTP Township Codename Blue Waters', 'Godrej Green Vistas', 'Godrej Green Cove',
  'VTP Aethereus', 'VTP Belair',
  'Phase 1 Hinjewadi Rajiv Gandhi Infotech Park', 'Hinjewadi Rajiv Gandhi Infotech Park',
  'Blue Ridge Town Pune', 'Shankar Kalat Nagar', 'Bodkewadi Maan', 'Hinjawadi Village',
  'Phase 3 Hinjewadi', 'Waghodia Road', 'Mahalunge', 'Bhoirwadi', 'Hinjawadi', 'Hinjewadi',
  'Pune West', 'Pune', 'Maan',
  'Housing.com', 'MagicBricks', '99acres', 'Property Circle',
];
// Every token is letters, digits, spaces and at most a dot ('Housing.com'), so
// escaping the dot is the whole of the escaping needed.
const esc = (t: string) => t.split('.').join('\\.');
// LONGEST FIRST, so 'Pune West' is replaced before 'Pune' can eat half of it and
// leave ' West' dangling — and 'Blue Ridge Town Pune' before either.
const TOKEN_ALT = REAL_TOKENS.slice().sort((a, b) => b.length - a.length).map(esc).join('|');
const TOKEN_RE = new RegExp(`(${TOKEN_ALT})`, 'gi');

const scrubWords = (s: string) => s.replace(TOKEN_RE, (m) => (
  SOURCES[m] ?? (/^(pune|mahalunge|bhoirwadi|hinj|maan|phase|blue ridge|shankar|bodkewadi|waghodia)/i.test(m)
    ? fakeLocality(m) : fakeProject(m))));

const scrub = (s: string) => scrubWords(scrubDigits(s));

/**
 * ONE `req` REDACTOR, for leads AND enquiry sessions.
 *
 * Both tables carry the same shape and it was only being applied to one of
 * them, which is how 390 of 390 enquiry rows kept their builder and project
 * names while every lead read clean.
 *
 * `notes` is the raw portal blurb -- free prose naming a builder, a project and
 * a price. Nothing in it is worth keeping for a demo, so it goes entirely
 * rather than being pattern-matched: a regex that misses once has leaked.
 */
function redactReq(input: any): any {
  const req = { ...(input || {}) } as any;
  if (req.locality) req.locality = fakeLocality(req.locality);
  if (req.project) req.project = fakeProject(req.project);
  if (typeof req.interest === 'string') req.interest = fakeProject(req.interest);
  else if (Array.isArray(req.interest)) req.interest = req.interest.map((x: any) => fakeProject(String(x)));
  if (req.notes) delete req.notes;
  return req;
}

async function main() {
  const [t] = await sql`SELECT id FROM tenants WHERE slug = ${TENANT}`;
  if (!t) { console.error(`No '${TENANT}' tenant in this database.`); process.exit(1); }
  const T = t.id;
  console.log(`${WRITE ? 'WRITING' : 'DRY RUN'} · db ${ref(DEV)} · tenant ${TENANT}
`);

  const leads = await sql`SELECT id, source, locality, req FROM crm_leads WHERE tenant_id = ${T}`;
  let changed = 0;
  const seenSrc = new Map<string, string>(), seenLoc = new Map<string, string>();
  for (const l of leads) {
    const src = l.source ? fakeSource(l.source) : l.source;
    const loc = l.locality ? fakeLocality(l.locality) : l.locality;
    if (l.source && src !== l.source) seenSrc.set(l.source, src);
    if (l.locality && loc !== l.locality) seenLoc.set(l.locality, loc);

    const req = redactReq(l.req);

    if (src !== l.source || loc !== l.locality || JSON.stringify(req) !== JSON.stringify(l.req || {})) {
      changed++;
      if (WRITE) {
        await sql`UPDATE crm_leads SET source = ${src}, locality = ${loc}, req = ${sql.json(req)}
                   WHERE id = ${l.id} AND tenant_id = ${T}`;
      }
    }
  }
  console.log(`leads              ${changed} of ${leads.length} rewritten`);
  if (seenSrc.size) console.log(`  sources          ${[...seenSrc].map(([a, b]) => `${a} → ${b}`).join(', ')}`);
  if (seenLoc.size) console.log(`  localities       ${[...seenLoc].slice(0, 6).map(([a, b]) => `${a} → ${b}`).join(', ')}${seenLoc.size > 6 ? ` … ${seenLoc.size} in all` : ''}`);
  if (!changed) console.log('  (already redacted — nothing to do)');

  // Digits OR any of the real words -- an "Enquired again via MagicBricks"
  // title carries no digits at all and was skipped entirely the first time.
  const events = await sql`SELECT id, title, description FROM crm_timeline_events
                            WHERE tenant_id = ${T}
                              AND (coalesce(title, '') || ' ' || coalesce(description, ''))
                                  ~* ${'([0-9]{6,}|' + TOKEN_ALT + ')'}`;
  for (const e of events) {
    if (!WRITE) continue;
    await sql`UPDATE crm_timeline_events
                 SET title = ${scrub(String(e.title ?? ''))},
                     description = ${scrub(String(e.description ?? ''))}
               WHERE id = ${e.id} AND tenant_id = ${T}`;
  }
  console.log(`timeline events    ${events.length} carrying a real name, place or portal scrubbed`);

  // ── crm_lead_enquiries ────────────────────────────────────────────────────
  // 390 of 390 rows were leaking, and this is the table the RECORD SCREEN
  // renders as enquiry history -- the thing a demo actually opens on camera.
  // It carries its own `source` and its own `req`, neither of which the leads
  // pass touches. Two copies of one idea, and only one of them was redacted.
  const enq = await sql`SELECT id, source, req FROM crm_lead_enquiries WHERE tenant_id = ${T}`;
  let enqChanged = 0;
  for (const e of enq as any[]) {
    const src = e.source ? fakeSource(e.source) : e.source;
    const req = redactReq(e.req);
    if (src === e.source && JSON.stringify(req) === JSON.stringify(e.req || {})) continue;
    enqChanged++;
    if (WRITE) {
      await sql`UPDATE crm_lead_enquiries SET source = ${src}, req = ${sql.json(req)}
                 WHERE id = ${e.id} AND tenant_id = ${T}`;
    }
  }
  console.log(`enquiry sessions   ${enqChanged} of ${enq.length} rewritten`);

  // ── JSON COLUMNS NOBODY THOUGHT TO NAME ───────────────────────────────────
  //
  // Three columns held the whole leak after every other pass reported clean:
  //
  //   crm_lead_enquiries.payloads  the RAW portal payload, kept per arrival --
  //                                "looking for 2 BHK ... in Mahalunge, Pune"
  //   crm_leads.follow_up          the appointment, whose `action` is prose
  //   integrations.parser_config   the mapping rules, named in the working
  //                                agreement as the exact thing a generator fix
  //                                leaves behind, and missed anyway
  //
  // Walked as a tree rather than pattern-matched per key, because the shape of
  // a stored payload is whatever the portal sent -- there is no schema to read.
  // Every string gets the same scrub the timeline gets, and any value under a
  // `source` key additionally goes through the portal map.
  const deepScrub = (v: any, key?: string): any => {
    if (typeof v === 'string') return key === 'source' ? fakeSource(v) : scrub(v);
    if (Array.isArray(v)) return v.map(x => deepScrub(x));
    if (v && typeof v === 'object') {
      return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, deepScrub(x, k)]));
    }
    return v;
  };
  const JSON_COLUMNS: Array<[string, string]> = [
    ['crm_lead_enquiries', 'payloads'],
    ['crm_leads', 'follow_up'],
    ['integrations', 'parser_config'],
  ];
  for (const [table, col] of JSON_COLUMNS) {
    const rows = await sql`SELECT id, ${sql(col)} AS v FROM ${sql(table)}
                            WHERE tenant_id = ${T} AND ${sql(col)} IS NOT NULL`;
    let n = 0;
    for (const r of rows as any[]) {
      const next = deepScrub(r.v);
      if (JSON.stringify(next) === JSON.stringify(r.v)) continue;
      n++;
      if (WRITE) {
        await sql`UPDATE ${sql(table)} SET ${sql(col)} = ${sql.json(next)}
                   WHERE id = ${r.id} AND tenant_id = ${T}`;
      }
    }
    console.log(`${(table + '.' + col).padEnd(30)} ${n} of ${rows.length} rewritten`);
  }

  // AN ID IS NOT REDACTABLE, so the row goes. `int_99acres_test` names a real
  // portal in its primary key; rewriting a key breaks whatever points at it,
  // and this is a test fixture nothing should be pointing at.
  const named = await sql`SELECT id FROM integrations
                           WHERE tenant_id = ${T} AND id ~* ${TOKEN_ALT}`;
  for (const r of named as any[]) {
    const [used] = await sql`SELECT count(*)::int n FROM crm_lead_enquiries
                              WHERE tenant_id = ${T} AND integration_id = ${r.id}`;
    if (used.n) { console.log(`⚠ ${r.id} names a portal but ${used.n} enquiries reference it — left alone`); continue; }
    if (WRITE) await sql`DELETE FROM integrations WHERE id = ${r.id} AND tenant_id = ${T}`;
    console.log(`integrations       ${r.id} deleted (portal name in its id, unreferenced)`);
  }

  // ── crm_settings ──────────────────────────────────────────────────────────
  // THE ATTRIBUTION SOURCE LIST. This is the one the user actually saw: every
  // lead read "Portal One" while Settings still offered "99acres, MagicBricks"
  // in the dropdown that defines them. Redacting the rows and not the vocabulary
  // that generates them is exactly the trap the working agreement names.
  const [cfg] = await sql`SELECT value FROM crm_settings WHERE tenant_id = ${T} AND key = 'default'`;
  if (cfg) {
    const v = { ...(cfg.value || {}) } as any;
    if (Array.isArray(v.sources)) v.sources = [...new Set(v.sources.map((x: any) => fakeSource(String(x))))];
    if (v.city) v.city = 'Fairhaven';
    const dirty = JSON.stringify(v) !== JSON.stringify(cfg.value);
    console.log(`settings           ${dirty ? 'sources + city rewritten' : 'already clean'}`);
    if (dirty && WRITE) {
      await sql`UPDATE crm_settings SET value = ${sql.json(v)} WHERE tenant_id = ${T} AND key = 'default'`;
    }
  }

  // ── integrations ──────────────────────────────────────────────────────────
  // `provider` names the real portal the firm pays for, and it is rendered in
  // Settings beside each connection.
  const ints = await sql`SELECT id, provider FROM integrations WHERE tenant_id = ${T}`;
  let intChanged = 0;
  for (const i of ints as any[]) {
    const prov = i.provider ? fakeSource(i.provider) : i.provider;
    if (prov === i.provider) continue;
    intChanged++;
    if (WRITE) await sql`UPDATE integrations SET provider = ${prov} WHERE id = ${i.id} AND tenant_id = ${T}`;
  }
  console.log(`integrations       ${intChanged} of ${ints.length} rewritten`);

  // ── audit_log, webhook_inbox ──────────────────────────────────────────────
  // Operational logs: raw inbound portal payloads and an audit trail of who did
  // what during testing. 1,584 audit rows and 35 inbox rows were carrying real
  // portal names and real enquiry text. Nothing in a demo reads either, so they
  // are emptied rather than rewritten -- there is no version of these worth
  // keeping, and a scrub that misses one line has leaked.
  if (WRITE) {
    // RETURNING 1, not RETURNING id: audit_log has no `id` column.
    const a = await sql`DELETE FROM audit_log WHERE tenant_id = ${T} RETURNING 1`;
    const w = await sql`DELETE FROM webhook_inbox WHERE tenant_id = ${T} RETURNING 1`;
    console.log(`audit_log          ${a.length} deleted`);
    console.log(`webhook_inbox      ${w.length} deleted`);
  } else {
    const a = await sql`SELECT count(*)::int n FROM audit_log WHERE tenant_id = ${T}`;
    const w = await sql`SELECT count(*)::int n FROM webhook_inbox WHERE tenant_id = ${T}`;
    console.log(`audit_log          ${a[0].n} would be deleted`);
    console.log(`webhook_inbox      ${w[0].n} would be deleted`);
  }

  // OWNERS AND PROPERTIES ARE NOT REDACTED, THEY ARE REMOVED.
  //
  // Both arrived on this tenant as straight imports from the live desk: 732
  // owners with real names and real mobile numbers, and 6,643 listings from a
  // broken import that wrote the owner's name into title, unit, unit_no,
  // project AND config.society -- one real person, five times, on 706 rows.
  //
  // Redacting them was the wrong instinct. Neither module is being demonstrated,
  // so the safest version of both is empty: nothing to leak, nothing to scrub
  // incorrectly, and no need to re-check them after the next clone. Deleted on
  // 2026-08-26 (732 owners, 6,643 properties); this only reports if they return.
  const stray = await sql`
    SELECT (SELECT count(*)::int FROM crm_owners WHERE tenant_id = ${T}) AS owners,
           (SELECT count(*)::int FROM crm_properties WHERE tenant_id = ${T}) AS properties`;
  if (stray[0].owners || stray[0].properties) {
    console.log(`
⚠ ${stray[0].owners} owners and ${stray[0].properties} properties on this tenant.`);
    console.log('  Both were removed on 2026-08-26 because they were straight imports');
    console.log('  from the live desk. If they are back, a clone or an import brought');
    console.log('  them — check what is in them before showing this desk to anyone.');
  } else {
    console.log('owners / properties  0 / 0 — nothing to leak');
  }

  // ── THE CHECK THAT SHOULD HAVE EXISTED FROM THE START ─────────────────────
  //
  // This script reported "clean" twice while SIX tables were leaking, because
  // the check only looked at the two tables the script happened to rewrite. A
  // verification that can only see what you already thought of confirms your
  // assumptions instead of testing them.
  //
  // So: enumerate EVERY table carrying a tenant_id, serialise each whole row to
  // text, and match the real tokens against all of it. A new table, a new
  // column or a new JSON key is covered without anyone remembering to add it.
  const scoped = await sql`SELECT table_name FROM information_schema.columns
                            WHERE column_name = 'tenant_id' AND table_schema = 'public'
                            ORDER BY table_name`;
  const leaks: string[] = [];
  for (const { table_name: t } of scoped as any[]) {
    try {
      const [r] = await sql`SELECT count(*)::int n FROM ${sql(t)}
                             WHERE tenant_id = ${T} AND to_jsonb(${sql(t)})::text ~* ${TOKEN_ALT}`;
      if (r.n) leaks.push(`${t} (${r.n} rows)`);
    } catch { /* a table with no straightforward row type is not a leak */ }
  }
  console.log(`
LEAK CHECK · ${(scoped as any[]).length} tenant-scoped tables scanned whole`);
  if (leaks.length) {
    console.log(`✗ STILL LEAKING: ${leaks.join(', ')}`);
    console.log('  Add the token to REAL_TOKENS, or teach the script that table.');
    process.exitCode = 1;
  } else {
    console.log('✓ no real portal, place or project name anywhere on this tenant');
  }

  if (!WRITE) console.log('\nNothing written. Re-run with --write.');
  await sql.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
