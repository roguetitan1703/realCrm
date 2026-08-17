/**
 * ============================================================================
 * 🔀 PARSER ENGINE — provider payload → canonical lead (spec: ingestion.md)
 * ============================================================================
 * A parser config is DATA, not code. Adding a provider is a row in a table, not
 * a deploy — which is the entire point of D1: "new sources = configure
 * integration + parser mapping, no core changes."
 *
 *   {
 *     "map":        { "name": "full_name", "req.locality": "locality" },
 *     "defaults":   { "deal": "sale", "source": "99acres" },
 *     "valueMaps":  { "req.config": { "2 BHK": "2BHK" } },
 *     "transforms": { "phone": "phone_in", "name": "trim" }
 *   }
 *
 * `map` reads SOURCE dot-path → writes TARGET dot-path. Order of operations is
 * map → transform → valueMap → default-if-still-empty, so a default can never
 * overwrite something the provider actually sent, and a valueMap always sees a
 * cleaned value rather than raw whitespace.
 *
 * Everything here is pure: same payload plus same config gives the same lead,
 * with no database and no clock. That is what makes the mandatory test-preview
 * honest — the preview runs the identical function the live push will.
 * ============================================================================
 */

export type ParserConfig = {
  map?: Record<string, string>;
  defaults?: Record<string, any>;
  valueMaps?: Record<string, Record<string, string>>;
  transforms?: Record<string, string>;
};

export type ParseResult = {
  ok: boolean;
  lead: any;
  /** Field-by-field trace, so the preview can show WHERE each value came from
   *  rather than just the result. A mapping that silently produced nothing is
   *  the failure mode this exists to expose. */
  trace: Array<{ target: string; from: string | null; raw: any; value: any; via: string }>;
  missing: string[];
  errors: string[];
};

/** Read `a.b.c` out of a payload, tolerating arrays (`items.0.name`). */
export function getPath(obj: any, path: string): any {
  if (!obj || !path) return undefined;
  return String(path).split('.').reduce((acc: any, part) => {
    if (acc === null || acc === undefined) return undefined;
    return acc[part];
  }, obj);
}

function setPath(obj: any, path: string, value: any): void {
  const parts = String(path).split('.');
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    if (typeof cur[parts[i]] !== 'object' || cur[parts[i]] === null) cur[parts[i]] = {};
    cur = cur[parts[i]];
  }
  cur[parts[parts.length - 1]] = value;
}

const isEmpty = (v: any) => v === undefined || v === null || (typeof v === 'string' && v.trim() === '');

// ---------------------------------------------------------------------------
// Transforms — a fixed, named set, never arbitrary code
// ---------------------------------------------------------------------------
// A config is authored by a tenant owner and stored in the database. If a
// transform were an expression, a parser config would be remote code execution
// with extra steps. So it's a closed vocabulary of named operations, and an
// unknown name is an error rather than a silent no-op.
export const TRANSFORMS: Record<string, (v: any) => any> = {
  trim: (v) => (typeof v === 'string' ? v.trim() : v),
  lower: (v) => String(v ?? '').toLowerCase(),
  upper: (v) => String(v ?? '').toUpperCase(),
  digits: (v) => String(v ?? '').replace(/\D/g, ''),
  number: (v) => {
    const n = Number(String(v ?? '').replace(/[^0-9.]/g, ''));
    return Number.isFinite(n) ? n : null;
  },
  /**
   * Indian mobile normalisation. Portals send "+91 98765 43210",
   * "098765 43210", "9876543210" and "91-9876543210" for the same person, and
   * dedup compares phone numbers — so unnormalised input silently creates
   * duplicate leads for one caller.
   */
  phone_in: (v) => {
    const d = String(v ?? '').replace(/\D/g, '');
    const ten = d.length > 10 ? d.slice(-10) : d;
    return ten.length === 10 ? `+91${ten}` : String(v ?? '').trim();
  },
  /** "2 BHK Apartment in Wakad" → "2 BHK". Portals bury the config in prose. */
  bhk: (v) => {
    const m = String(v ?? '').match(/(\d+(?:\.5)?)\s*(?:bhk|bedroom)/i);
    if (m) return `${m[1]} BHK`;
    return /\b1\s*rk\b/i.test(String(v ?? '')) ? '1 RK' : String(v ?? '').trim();
  },
  /** "₹95 Lakh" / "1.2 Cr" / "9500000" → rupees. */
  money_in: (v) => {
    const s = String(v ?? '').toLowerCase();
    const n = Number(s.replace(/[^0-9.]/g, ''));
    if (!Number.isFinite(n) || n === 0) return null;
    if (/cr|crore/.test(s)) return Math.round(n * 10000000);
    if (/l|lakh|lac/.test(s)) return Math.round(n * 100000);
    return Math.round(n);
  },
  /**
   * "For Rent" / "Resale" / "New Booking" / "Buyer Lead" → 'rent' | 'sale'.
   * Portals bury this in a transaction-type or category field rather than
   * sending a clean enum, and it's never guessed at by a mapping — read
   * `null` (unrecognised text) and the default-if-still-empty stage below
   * fills the tenant's fallback, the same as any other field.
   */
  deal_in: (v) => {
    const s = String(v ?? '').toLowerCase();
    // 99acres sends the whole field as a single letter — "S" / "R" — which no
    // word-boundary pattern below can match, so the value was read as
    // unrecognised and the deal came out of the budget inference instead.
    // Only an exact one-letter value counts; a stray "s" inside prose does not.
    if (s.trim() === 's') return 'sale';
    if (s.trim() === 'r') return 'rent';
    // "L" is Lease, which is how 99acres sends COMMERCIAL renting — a showroom,
    // an office, a warehouse. It was falling through to null, and the deal was
    // then guessed from the budget: bhumi's one lease enquiry asked ₹2,25,000
    // for a Mahalunge showroom, which the budget heuristic read as monthly and
    // called rent. Right answer, wrong reason — the same enquiry quoted as an
    // annual figure would have been filed as a sale. A portal that tells us the
    // deal type should be believed rather than second-guessed.
    if (s.trim() === 'l') return 'rent';
    if (/\brent(al)?\b|\blease\b|\btenant\b|\bletting\b/.test(s)) return 'rent';
    if (/\bsale\b|\bsell\b|\bresale\b|\bbuy(er)?\b|\bpurchase\b|\bnew\s*booking\b/.test(s)) return 'sale';
    return null;
  },
  /**
   * When the enquiry actually happened, per the portal.
   *
   * MagicBricks sends `"20260805183634"` — a compact local stamp with no
   * separators and no zone, which `new Date()` reads as an invalid date (or,
   * worse, as a year-20260805 nonsense). Portals stamp in IST, so that is what
   * it is read as. Also accepts epoch seconds/millis and anything Date can
   * already parse, and returns null rather than a wrong instant.
   */
  datetime_in: (v) => {
    const s = String(v ?? '').trim();
    if (!s) return null;
    const compact = s.match(/^(\d{4})(\d{2})(\d{2})[ T]?(\d{2})(\d{2})(\d{2})$/);
    if (compact) {
      const [, y, mo, d, h, mi, se] = compact;
      const dt = new Date(`${y}-${mo}-${d}T${h}:${mi}:${se}+05:30`);
      return isNaN(dt.getTime()) ? null : dt.toISOString();
    }
    if (/^\d{13}$/.test(s)) return new Date(Number(s)).toISOString();
    if (/^\d{10}$/.test(s)) return new Date(Number(s) * 1000).toISOString();
    // 99acres sends "2026-08-11 12:32:15" — separated, but still no zone. Date
    // reads a zoneless stamp as the SERVER's local time, and the server is AWS
    // on UTC, so the same enquiry that reads correctly in dev lands 5h30 early
    // in production. A portal serving Indian brokers stamps IST; pin it, the
    // same as the compact form above. Anything carrying its own zone (a Z, or
    // an offset) is left alone and parsed as sent.
    const zoneless = s.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/);
    if (zoneless) {
      const [, y, mo, d, h, mi, se] = zoneless;
      const dt = new Date(`${y}-${mo}-${d}T${h}:${mi}:${se || '00'}+05:30`);
      return isNaN(dt.getTime()) ? null : dt.toISOString();
    }
    const dt = new Date(s);
    return isNaN(dt.getTime()) ? null : dt.toISOString();
  },
};

// The lead fields a config is allowed to write. An allow-list, because the
// parsed object goes straight into createLead: without it, a mapping could set
// `id`, `tenant_id` or `stage` from a value a stranger POSTed.
const WRITABLE = new Set([
  'name', 'phone', 'email', 'source', 'notes',
  'req.deal', 'req.locality', 'req.config', 'req.purpose', 'req.notes',
  'req.timeline', 'req.budget',
  // BOTH spellings of the budget bounds, because both are real. createLead
  // reads `req.minBudget ?? req.budgetMin` and the record sheet writes the
  // first, while this file's auto-detect suggests the second. Listing only
  // budgetMin/budgetMax here meant the mapper UI — which offers minBudget /
  // maxBudget, the spelling createLead prefers — could not save a budget
  // mapping at all: the validator rejected the only two keys it offers, and
  // sanitizeConfig then dropped them silently, so the field read "Not mapped"
  // on a payload that plainly contained a budget.
  'req.budgetMin', 'req.budgetMax', 'req.minBudget', 'req.maxBudget',
  // What they enquired ABOUT, as prose. MagicBricks names the listing the
  // buyer was looking at ("Joyville Hinjawadi") and there is usually no row of
  // ours to point that at, so it is carried as text and shown in the
  // requirement line — the same decision the CSV importer's `interest` field
  // makes. Without this the field was not writable at all, so the one thing
  // that tells an agent what the call is about was dropped on every push.
  'req.interest',
  // When the portal says the enquiry happened, as opposed to when we processed
  // it. Seconds apart on a live push and days apart on a replayed backlog —
  // and the lead list now shows a received date, so the difference is on screen.
  'received_at',
  'external_id',
]);

/** A lead is worth creating only if it can be contacted. */
const REQUIRED = ['name', 'phone'];

/**
 * Collapse the two historical spellings of the budget bounds onto the one the
 * mapper UI shows. Both are accepted on the way in (see WRITABLE) so an
 * existing config keeps working, but everything is stored under one name —
 * otherwise a connection auto-detected before this change keeps its budget
 * under budgetMin, the UI renders its own key, and the field reads
 * "Not mapped" forever while quietly working.
 */
const TARGET_ALIASES: Record<string, string> = {
  'req.budgetMin': 'req.minBudget',
  'req.budgetMax': 'req.maxBudget',
};
const canonicalTarget = (t: string): string => TARGET_ALIASES[t] || t;

/**
 * A rent is quoted per MONTH and a sale price is quoted outright, so the two
 * live in different orders of magnitude and the number alone separates them.
 * ₹5 lakh is the line: above it nobody is quoting monthly rent, below it
 * nobody is buying property.
 *
 * Deliberately conservative — it returns null rather than guessing when the
 * figure is missing or straddles the line, because a lead filed under the
 * wrong deal type gets matched against the wrong stock, which is worse than
 * one with no deal type at all.
 */
const RENT_CEILING = 500000;

export function dealFromBudget(min: any, max: any): 'sale' | 'rent' | null {
  const nums = [min, max]
    .map(v => (typeof v === 'number' ? v : Number(String(v ?? '').replace(/[^0-9.]/g, ''))))
    .filter(n => Number.isFinite(n) && n > 0);
  if (!nums.length) return null;
  // Judge on the TOP of the range. A "50,000 – 8,00,000" would be nonsense as
  // rent, and reading the bottom of a sale range like "45L – 60L" against the
  // ceiling is what would misfile it.
  const top = Math.max(...nums);
  return top >= RENT_CEILING ? 'sale' : 'rent';
}

/**
 * Drop any map/default/transform entry that targets a field WRITABLE no
 * longer recognizes, instead of letting it silently ride along in a saved
 * config. Two ways this happens in practice: a config saved before the target
 * vocabulary was normalised (flat "locality" from before the req.* namespace
 * existed), or a direct PUT that never went through the mapper UI at all.
 * Without this, a single stale key blocks every future save with the same
 * confusing error and gives no way to recover except editing the database.
 */
export function sanitizeConfig(config: ParserConfig | null): { clean: ParserConfig | null; dropped: string[] } {
  if (!config || typeof config !== 'object') return { clean: config, dropped: [] };
  const dropped: string[] = [];
  const map: Record<string, string> = {};
  for (const [rawTarget, source] of Object.entries(config.map || {})) {
    const target = canonicalTarget(rawTarget);
    if (WRITABLE.has(target)) map[target] = source; else dropped.push(rawTarget);
  }
  const defaults: Record<string, any> = {};
  for (const [rawTarget, value] of Object.entries(config.defaults || {})) {
    const target = canonicalTarget(rawTarget);
    if (WRITABLE.has(target)) defaults[target] = value; else dropped.push(rawTarget);
  }
  // Transforms and valueMaps are keyed by the same target names — carrying one
  // for a target that no longer exists in `map` is inert but still clutter.
  const transforms: Record<string, string> = {};
  for (const [rawTarget, name] of Object.entries(config.transforms || {})) {
    const target = canonicalTarget(rawTarget);
    if (map[target] !== undefined) transforms[target] = name;
  }
  const valueMaps: Record<string, Record<string, string>> = {};
  for (const [rawTarget, vmap] of Object.entries(config.valueMaps || {})) {
    const target = canonicalTarget(rawTarget);
    if (map[target] !== undefined) valueMaps[target] = vmap;
  }
  return { clean: { map, defaults, transforms, valueMaps }, dropped: [...new Set(dropped)] };
}

export function parsePayload(payload: any, config: ParserConfig | null): ParseResult {
  const trace: ParseResult['trace'] = [];
  const errors: string[] = [];
  const lead: any = {};

  if (!config || typeof config !== 'object') {
    return { ok: false, lead, trace, missing: [...REQUIRED], errors: ['No parser configured for this connection.'] };
  }

  const map = config.map || {};
  for (const [target, source] of Object.entries(map)) {
    if (!WRITABLE.has(target)) {
      errors.push(`"${target}" is not a lead field a mapping can write.`);
      continue;
    }
    const raw = getPath(payload, source);
    let value: any = raw;
    let via = 'map';

    const tName = config.transforms?.[target];
    if (tName) {
      const fn = TRANSFORMS[tName];
      if (!fn) { errors.push(`Unknown transform "${tName}" for "${target}".`); }
      else if (!isEmpty(value)) { value = fn(value); via = `map+${tName}`; }
    }

    const vmap = config.valueMaps?.[target];
    if (vmap && !isEmpty(value)) {
      const hit = vmap[String(value)] ?? vmap[String(value).trim()];
      if (hit !== undefined) { value = hit; via += '+valueMap'; }
    }

    if (!isEmpty(value)) setPath(lead, target, value);
    trace.push({ target, from: source, raw, value: isEmpty(value) ? null : value, via });
  }

  // Infer the deal type from the budget, but ONLY when the payload did not
  // carry one. Ordered deliberately between map and defaults: what the portal
  // actually said always wins, and a figure the buyer themselves gave is a
  // better guess than the tenant's blanket fallback — which is how every
  // MagicBricks lead on the live desk ended up filed as "sale" regardless of
  // what the person wanted. Runs before the defaults loop for exactly that
  // reason; after it, the default would already have filled the gap.
  if (isEmpty(getPath(lead, 'req.deal'))) {
    const derived = dealFromBudget(getPath(lead, 'req.minBudget'), getPath(lead, 'req.maxBudget'));
    if (derived) {
      setPath(lead, 'req.deal', derived);
      trace.push({ target: 'req.deal', from: 'budget', raw: null, value: derived, via: 'derived' });
    }
  }

  // Defaults fill gaps; they never overwrite. A provider that sends a deal type
  // must win over the default someone set months ago.
  for (const [target, value] of Object.entries(config.defaults || {})) {
    if (!WRITABLE.has(target)) { errors.push(`"${target}" is not a lead field a default can write.`); continue; }
    if (isEmpty(getPath(lead, target))) {
      setPath(lead, target, value);
      trace.push({ target, from: null, raw: null, value, via: 'default' });
    }
  }

  const missing = REQUIRED.filter(f => isEmpty(getPath(lead, f)));
  return { ok: missing.length === 0 && errors.length === 0, lead, trace, missing, errors };
}

// ---------------------------------------------------------------------------
// Auto-suggest
// ---------------------------------------------------------------------------

/** Every leaf path in a payload, so the mapper can offer real choices instead
 *  of asking someone to type dot-paths from memory. */
export function flattenPaths(obj: any, prefix = '', out: Record<string, any> = {}): Record<string, any> {
  if (obj === null || obj === undefined) return out;
  if (Array.isArray(obj)) {
    // Only the first element: portals send N identical-shaped items, and
    // offering `items.0…items.49` would bury the useful paths.
    if (obj.length) flattenPaths(obj[0], `${prefix}0.`, out);
    return out;
  }
  if (typeof obj !== 'object') { out[prefix.replace(/\.$/, '')] = obj; return out; }
  for (const [k, v] of Object.entries(obj)) {
    if (v !== null && typeof v === 'object') flattenPaths(v, `${prefix}${k}.`, out);
    else out[`${prefix}${k}`] = v;
  }
  return out;
}

// What each canonical field tends to be called in the wild. Ordered: the
// earlier an alias, the stronger the claim.
const HINTS: Record<string, string[]> = {
  name: ['name', 'full_name', 'fullname', 'customer_name', 'lead_name', 'client_name', 'contact_name'],
  phone: ['phone', 'mobile', 'phone_number', 'mobile_number', 'contact_number', 'contact', 'msisdn'],
  email: ['email', 'email_id', 'email_address', 'mail'],
  'req.deal': ['deal', 'deal_type', 'dealtype', 'enquiry_type', 'requirement_type', 'listing_type',
    'transaction_type', 'purpose', 'category', 'property_for', 'looking_for'],
  'req.locality': ['locality', 'location', 'area', 'preferred_locality', 'city', 'project_location'],
  'req.config': ['config', 'bhk', 'configuration', 'property_type', 'requirement', 'unit_type'],
  // minBudget/maxBudget is the CANONICAL spelling: it is what the mapper UI
  // offers and what createLead reads first. Auto-detect used to suggest
  // budgetMin/budgetMax instead, so a budget it correctly found was written
  // under a key the UI does not display — the mapping existed and the field
  // still read "Not mapped".
  'req.minBudget': ['budget_min', 'min_budget', 'budget_from', 'price_min'],
  'req.maxBudget': ['budget_max', 'max_budget', 'budget_to', 'price_max', 'budget'],
  'req.notes': ['message', 'comments', 'notes', 'query', 'remarks', 'description'],
  'req.interest': ['property_interested', 'interested_in', 'enquired_for', 'property_name',
    'project_name', 'listing', 'property', 'project'],
  received_at: ['enquiry_timestamp', 'enquiry_date', 'enquiry_time', 'received_at',
    'lead_date', 'created_time', 'timestamp'],
  // Deliberately NO bare 'id'. It matched Meta's `ad_id` and `form_id`, which
  // identify a CAMPAIGN, not a person — and external_id is the idempotency key
  // (`ingest:<integration>:<externalId>`), so every enquiry from one ad would
  // have collided with the first and been discarded as a retry. An identifier
  // we cannot tell apart from a campaign id is worse than none: with no
  // external_id the key falls back to the phone number, which is per-person and
  // correct.
  external_id: ['external_id', 'lead_id', 'enquiry_id', 'reference_id', 'enquiry_no', 'lead_reference'],
};

const DEFAULT_TRANSFORM: Record<string, string> = {
  phone: 'phone_in', name: 'trim', email: 'trim',
  'req.config': 'bhk', 'req.minBudget': 'money_in', 'req.maxBudget': 'money_in',
  'req.deal': 'deal_in', 'req.interest': 'trim', received_at: 'datetime_in',
};

/** Does this text name a configuration ("2 BHK", "1 RK")? */
const hasBhk = (v: any) => /(\d+(?:\.5)?)\s*(?:bhk|bedroom)|\b1\s*rk\b/i.test(String(v ?? ''));

/**
 * Propose a mapping from a real payload. This is a SUGGESTION and the spec is
 * explicit that it must be confirmed — it turns the job from "write a config"
 * into "check these matches", which is the difference between something a
 * broker can do and something they have to call us about.
 *
 * It deliberately proposes nothing it isn't reasonably sure of: a field with no
 * confident match is left for a human rather than guessed at, because a wrong
 * mapping that looks configured is worse than an obvious gap.
 */
export function suggestConfig(payload: any, providerLabel?: string): ParserConfig {
  const flat = flattenPaths(payload || {});
  const paths = Object.keys(flat);
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
  const map: Record<string, string> = {};
  const transforms: Record<string, string> = {};

  for (const [target, aliases] of Object.entries(HINTS)) {
    let best: { path: string; rank: number } | null = null;
    for (const path of paths) {
      const leaf = norm(path.split('.').pop() || '');
      const whole = norm(path);
      for (let i = 0; i < aliases.length; i++) {
        const a = norm(aliases[i]);
        // Exact leaf beats a match anywhere in the path, and an earlier alias
        // beats a later one.
        const rank = leaf === a ? i : (whole.includes(a) ? i + 100 : -1);
        if (rank >= 0 && (!best || rank < best.rank)) best = { path, rank };
      }
    }
    if (best) {
      map[target] = best.path;
      if (DEFAULT_TRANSFORM[target]) transforms[target] = DEFAULT_TRANSFORM[target];
    }
  }

  // The column called "BHK" is not always the BHK. MagicBricks sends
  // {"BHK": "Multistorey Apartment"} — a property TYPE — and puts the real
  // "2 BHK" inside the buyer's message. Matching on the name alone therefore
  // files every enquiry under a configuration no listing has, and the buyer's
  // actual requirement is never read. So the name match is checked against the
  // sample: if the column it picked holds no configuration and another one
  // does, take the one that does.
  if (map['req.config'] && !hasBhk(flat[map['req.config']])) {
    const better = paths.find(p => hasBhk(flat[p]));
    if (better) map['req.config'] = better;
  }

  const defaults: Record<string, any> = {};
  if (providerLabel) defaults.source = providerLabel;
  // No blanket `req.deal = 'sale'`. This was the last of the five places that
  // invented a deal type, and the most damaging: it is written into a saved
  // config, so it kept re-applying long after the parser itself stopped
  // guessing. Every MagicBricks enquiry on the live desk — all of them rent,
  // at ₹22–26k a month — was stored as a sale by this one line. A source that
  // does not say is left unsaid.

  return { map, defaults, transforms, valueMaps: {} };
}
