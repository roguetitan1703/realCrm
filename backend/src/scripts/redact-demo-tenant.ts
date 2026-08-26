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

async function main() {
  const [t] = await sql`SELECT id FROM tenants WHERE slug = ${TENANT}`;
  if (!t) { console.error(`No '${TENANT}' tenant in this database.`); process.exit(1); }
  const T = t.id;
  console.log(`${WRITE ? 'WRITING' : 'DRY RUN'} · db ${ref(DEV)} · tenant ${TENANT}\n`);

  const leads = await sql`SELECT id, source, locality, req FROM crm_leads WHERE tenant_id = ${T}`;
  let changed = 0;
  const seenSrc = new Map<string, string>(), seenLoc = new Map<string, string>();
  for (const l of leads) {
    const src = l.source ? fakeSource(l.source) : l.source;
    const loc = l.locality ? fakeLocality(l.locality) : l.locality;
    if (l.source && src !== l.source) seenSrc.set(l.source, src);
    if (l.locality && loc !== l.locality) seenLoc.set(l.locality, loc);

    const req = { ...(l.req || {}) } as any;
    if (req.locality) req.locality = fakeLocality(req.locality);
    if (req.project) req.project = fakeProject(req.project);
    if (typeof req.interest === 'string') req.interest = fakeProject(req.interest);
    else if (Array.isArray(req.interest)) req.interest = req.interest.map((x: any) => fakeProject(String(x)));
    // The portal blurb is free prose naming a builder, a project and a price.
    // There is nothing in it worth keeping for a demo, so it goes entirely
    // rather than being pattern-matched — a regex that misses once has leaked.
    if (req.notes) delete req.notes;

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

  const owners = await sql`SELECT count(*)::int n FROM crm_owners WHERE tenant_id = ${T}`;
  if (owners[0].n) console.log(`\n⚠ ${owners[0].n} owners on this tenant — imported from a real desk. Remove before sharing.`);

  if (!WRITE) console.log('\nNothing written. Re-run with --write.');
  await sql.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
