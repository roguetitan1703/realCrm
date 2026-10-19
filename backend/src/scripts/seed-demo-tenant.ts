/**
 * ============================================================================
 * A DEMO FIRM A LOCAL BROKER RECOGNISES, BUILT FROM ONE PROFILE
 * ============================================================================
 * WHEN TO RUN THIS: to make (or remake) the firm we pitch a city's brokers on,
 * and on the morning of the pitch to bring its dates up to today. The design,
 * and why the Gemini-era generator is not used, is docs/specs/demo-tenants.md.
 *
 *   npx tsx backend/src/scripts/seed-demo-tenant.ts --profile=vadodara --env=development
 *       plan only: what it would write, and where. Writes nothing.
 *   ... --write                       build it (remakes it if this script made it)
 *   ... --refresh                     move every date forward to now
 *   ... --delete                      remove it, rows and photos
 *   ... --channel=msedge             stamp photos in an installed browser (no Playwright download)
 *   --env=production needs --confirm=<slug> as well, every time.
 *   ... --offline --sample=10         plan without a database, with sample leads and listings
 *   ... --market=us                   build the profile on another market preset
 *   ... --now=<iso> --dump=<file>     the whole plan as JSON, at a fixed moment (to diff two versions)
 *
 * MARKETS. A profile sits on a preset in demo-profiles/markets/ (us, india,
 * gujarat): currency, phone numbering, names, sources, sizes, notes language,
 * hours. The preset's `locale` and the timezone are written to the firm's
 * settings, so the app shows the market. Every number in a preset or profile
 * names its source in `_sources`, or says it is an estimate.
 *
 * WHAT IT WRITES, AND HOW. The firm is made by provisionTenant(), the console's
 * own path, so it can never take a slug that exists. Leads, owners, listings
 * and agreements go through the app's services, so their history, ledger and
 * agreements are real. The past (calls, WhatsApps, remarks, status changes,
 * follow-ups, visits) is written directly, in exactly the shapes the services
 * write, because a service stamps now(). Audit entries stay at the time they
 * were really written: the ledger says the generator made this, which is true.
 *
 * SAFETY. Only a slug starting `demo-`, never a paying or fixture firm, and a
 * firm is only remade or deleted when its brand_config carries this script's
 * marker. Plan mode is the default so a mistyped command writes nothing.
 *
 * PHOTOS go through the app's own processListingImage() (the firm's name in
 * the frame, as every upload gets), run in a headless browser against the Vite
 * dev server. Without it running, pass --no-photos.
 * ============================================================================
 */
import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const GEN = 'seed-demo-tenant';
const PROTECTED = new Set(['bhumi', 'mahalaxmi', 'delpat', 'skyline-realty', 'test-org', 'tutorial', 'urban', 'raipur']);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const DAY = 86400_000;

const args: Record<string, string | true> = Object.fromEntries(process.argv.slice(2).map(a => {
  const [k, ...v] = a.replace(/^--/, '').split('=');
  return [k, v.length ? v.join('=') : true];
}));
const die = (m: string): never => { console.error(`\n✗ ${m}\n`); process.exit(1); };

const ENV = args.env === 'production' || args.env === 'development' ? args.env : die('Say which database: --env=development or --env=production.');
process.env.APP_ENV = ENV as string;
// A SCRIPT DOES NOT MIGRATE. Importing the store starts the server's boot
// (initSchema and every one-time repair) unless this is set, and from a
// development checkout that would apply unreleased migrations to production
// before its API is deployed.
process.env.CRM_NO_BOOT = '1';
// The newest one-time step this code depends on. A database without it is
// running an older API than this checkout, and its tables are not the ones the
// services below write.
const NEEDS_MIGRATION = '2026_09_24_tenancy_to_agreements_v2';
const MODE = args.write ? 'write' : args.refresh ? 'refresh' : args.delete ? 'delete' : 'plan';

const profileName = typeof args.profile === 'string' ? args.profile : die('Name a profile: --profile=vadodara');
const profilePath = path.join(HERE, 'demo-profiles', `${profileName}.json`);
if (!fs.existsSync(profilePath)) die(`No profile at ${profilePath}`);

// ── The market: a preset the profile sits on ────────────────────────────────
// demo-profiles/markets/<name>.json holds what is true of a whole market
// (currency, phone numbering, names, listing sources, sizes, price bands, the
// way agents write, hours). The profile names its market in `market.preset`
// (or --market=) and overrides any field of it: objects merge key by key,
// arrays and values replace. `_sources` from both are kept.
const merge = (base: any, over: any, key = ''): any => {
  if (key === '_sources' && Array.isArray(base) && Array.isArray(over)) return [...base, ...over];
  if (over === null || typeof over !== 'object' || Array.isArray(over)) return over;
  if (base === null || typeof base !== 'object' || Array.isArray(base)) return over;
  const out: any = { ...base };
  for (const k of Object.keys(over)) out[k] = merge(base[k], over[k], k);
  return out;
};
function loadMarket(name: string): any {
  const f = path.join(HERE, 'demo-profiles', 'markets', `${name}.json`);
  if (!fs.existsSync(f)) die(`No market preset at ${f}`);
  const m = JSON.parse(fs.readFileSync(f, 'utf8'));
  return m.extends ? merge(loadMarket(m.extends), m) : m;
}
const RAW: any = JSON.parse(fs.readFileSync(profilePath, 'utf8'));
const MARKET: string = typeof args.market === 'string' ? args.market : RAW.market?.preset || 'india';
const P: any = merge(loadMarket(MARKET), RAW);
const SLUG: string = P.slug;
if (!/^demo-[a-z0-9-]+$/.test(SLUG || '')) die(`The profile's slug must start "demo-" (got "${SLUG}").`);
if (PROTECTED.has(SLUG)) die(`"${SLUG}" is a real or fixture firm.`);
if (ENV === 'production' && MODE !== 'plan' && args.confirm !== SLUG) die(`Production: add --confirm=${SLUG} to ${MODE} it.`);
const PASSWORD = String(P.password || 'Demo@1234');

// ── Deterministic randomness: same profile and seed, same firm ──────────────
let seedState = Number(P.seed) || 1;
const rnd = () => { seedState = (seedState + 0x6D2B79F5) | 0; let t = seedState; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const int = (a: number, b: number) => a + Math.floor(rnd() * (b - a + 1));
const pick = <T,>(a: T[]): T => a[Math.floor(rnd() * a.length)];
const chance = (p: number) => rnd() < p;
const roundTo = (n: number, step: number) => Math.round(n / step) * step;
const shuffle = <T,>(a: T[]) => { const b = [...a]; for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; };

// ── Time: everything is relative to the moment it is built (the anchor) ─────
const NOW = typeof args.now === 'string' ? Date.parse(args.now) : Date.now();
// The market's clock. The offset is the zone's at the moment of the build:
// a firm's history is 45 days long, and a daylight-saving change inside it
// moves a few calls by an hour, which nobody reading a desk can see.
const TZ: string = P.timezone || 'Asia/Kolkata';
const ZONE = (() => {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: TZ, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' })
    .formatToParts(new Date(NOW)).map(x => [x.type, x.value]));
  const asUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
  return Math.round((asUtc - Math.floor(NOW / 1000) * 1000) / 60_000) * 60_000;
})();
// Office hours: when the desk opens and stops (19.5 is 7:30 pm).
const H0: number = P.hours?.start ?? 10;
const H1: number = P.hours?.end ?? 19.5;
// Days of the week nobody works (0 is Sunday). Empty for a market that works all week.
const WEEK_OFF = new Set<number>(P.weekOff || []);
const weekOff = (t: Date) => WEEK_OFF.size > 0 && WEEK_OFF.has(new Date(t.getTime() + ZONE).getUTCDay());
const localMidnight = (daysAgo: number) => Math.floor((NOW + ZONE) / DAY) * DAY - ZONE - daysAgo * DAY;
/** A moment on the local day `daysAgo`, between two hours, never in the future. */
function at(daysAgo: number, fromH = H0, toH = H1 - 0.5): Date | null {
  const t = localMidnight(daysAgo) + (fromH + rnd() * (toH - fromH)) * 3600_000;
  return t < NOW - 120_000 ? new Date(t) : null;
}
const later = (d: Date, minMin: number, maxMin: number) => new Date(Math.min(d.getTime() + int(minMin, maxMin) * 60_000, NOW - 60_000));
const dayOf = (d: Date) => Math.floor((NOW + ZONE) / DAY) - Math.floor((d.getTime() + ZONE) / DAY);
const midnightOf = (ms: number) => Math.floor((ms + ZONE) / DAY) * DAY - ZONE;
/**
 * OFFICE HOURS. A call logged at 5:43 am reads as made up to anyone who has
 * run a desk. Night and early morning fold into the first half hour of the
 * next working morning, in order, so a story keeps its sequence. Null when the
 * moment that gives is still to come.
 */
function working(t: Date | null): Date | null {
  if (!t) return null;
  const ms = t.getTime(), h = ((ms + ZONE) % DAY) / 3600_000, m0 = midnightOf(ms);
  // Last night first (opening to +15 min), then this morning (+15 to +30).
  const out = h < H0 ? m0 + (H0 + 0.25 + (h / H0) * 0.25) * 3600_000
    : h > H1 ? m0 + DAY + (H0 + ((h - H1) / (24 - H1)) * 0.25) * 3600_000
    : ms;
  return out < NOW - 60_000 ? new Date(out) : null;
}
/** A working moment that has already passed, within the last day or so. */
const pastSlot = () => working(new Date(NOW - int(2, 26) * 3600_000)) ?? at(1)!;
/** A working moment still to come today, or null when the day is over. */
function todaySlot(): Date | null {
  const from = Math.max(NOW + 45 * 60_000, midnightOf(NOW) + H0 * 3600_000), to = midnightOf(NOW) + (H1 - 0.5) * 3600_000;
  return from < to ? new Date(from + rnd() * (to - from)) : null;
}
const soonSlot = () => new Date(midnightOf(NOW) + int(1, 3) * DAY + (H0 + pick([1, 2, 5, 6, 7, 8])) * 3600_000);

// ── People and numbers ──────────────────────────────────────────────────────
/** One of [value, weight] pairs, in proportion to the weights. */
const pickW = <T,>(pairs: [T, number][]): T => {
  let r = rnd() * pairs.reduce((s, [, w]) => s + w, 0);
  for (const [v, w] of pairs) if ((r -= w) <= 0) return v;
  return pairs[pairs.length - 1][0];
};
const usedNames = new Set<string>();
// `people.groups` mixes name pools the way a metro is mixed: a first name and
// a surname come from the same group, so nobody is called "Wei Hernandez" by
// accident. Without groups, one pool (the Gujarat profiles).
// A profile that names its own first and last names replaces the market's groups.
const NAMES = RAW.people?.first ? RAW.people : P.people;
const oneName = () => {
  const g = NAMES.groups ? pickW(NAMES.groups.map((x: any) => [x, x.share] as [any, number])) : NAMES;
  return `${pick(g.first)} ${pick(g.last)}`;
};
function person(): string {
  for (let i = 0; i < 50; i++) {
    const n = oneName();
    if (!usedNames.has(n)) { usedNames.add(n); return n; }
  }
  return oneName();
}
const usedPhones = new Set<string>();
// "phones": "fiction" keeps every number in a block nobody answers, for a firm
// whose screens are shown outside Delpat: a random mobile number is somebody's,
// and a screenshot on a public page would print it. India: the 99555 block
// seed-dev uses. North America (`phone.scheme: "nanp"`): 555-0100 to 555-0199,
// the only range reserved for fiction, in every area code the preset weights;
// there is no safe random US number, so that market is always fiction.
function phone(): string {
  const scheme = P.phone?.scheme || 'in';
  for (let i = 0; i < 20000; i++) {
    const p = scheme === 'nanp'
      ? `+1${pickW(P.phone.areaCodes)}55501${String(int(0, 99)).padStart(2, '0')}`
      : P.phones === 'fiction'
        ? `+9199555${String(int(0, 99999)).padStart(5, '0')}`
        : `+91${pick(['9', '8', '7', '6'])}${String(int(100000000, 999999999))}`;
    if (!usedPhones.has(p)) { usedPhones.add(p); return p; }
  }
  return die(`Ran out of unused numbers after ${usedPhones.size}: give the market preset more area codes.`);
}
const MONEY = new Intl.NumberFormat(P.locale?.numberLocale || 'en-IN', { style: 'currency', currency: P.locale?.currency || 'INR', maximumFractionDigits: 0 });
// The short form agents type: "$450K", "$1.2M"; ₹ in lakhs and crores.
const shortMoney = (n: number) => P.locale?.currency === 'USD'
  ? (n >= 1e6 ? `$${+(n / 1e6).toFixed(2)}M` : n >= 1e4 ? `$${Math.round(n / 1000)}K` : MONEY.format(n))
  : (n >= 1e7 ? `${+(n / 1e7).toFixed(2)} Cr` : n >= 1e5 ? `${+(n / 1e5).toFixed(1)} L` : MONEY.format(n));
/** A phrase with {budget}, {config}, {locality} filled from the lead it is about. */
const fill = (s: string, req?: any) => !s || !s.includes('{') || !req ? s
  : s.replace('{budget}', req.maxBudget ? shortMoney(req.maxBudget) : '').replace('{config}', req.config || '').replace('{locality}', req.locality || '');
const locOf = (name: string) => P.localities.find((l: any) => l.name === name) || P.localities[0];
const near = (loc: any) => ({ lat: +(loc.lat + (rnd() - 0.5) * 0.012).toFixed(6), lng: +(loc.lng + (rnd() - 0.5) * 0.012).toFixed(6) });

// ============================================================================
// THE PLAN — pure data, no database. Plan mode prints it; write mode builds it.
// ============================================================================
type Kind = 'office' | 'shop' | 'warehouse' | 'flat';
interface UnitPlan { key: string; kind: Kind; data: any; createdAt: Date; lane: Kind; photos: number; deal: 'rent' | 'sale'; locality: string; price: number; agent?: string }
interface EventPlan { type: string; title: string; description: string; author: string | null; at: Date; metadata?: any }
interface LeadPlan { key: string; name: string; phone: string; source: string; stage: string; lane: Kind; req: any; createdAt: Date; agent?: string;
  events: EventPlan[]; followUp?: any; overdue?: boolean; rejection?: string; visit?: { at: Date; remark: string };
  close?: { kind: 'rent' | 'sale'; at: Date; endsInDays: number } }
interface OwnerPlan { key: string; data: any; lane: Kind; assign: boolean; createdAt: Date; stage: string; callbackAt?: Date; callbackNote?: string; events: EventPlan[]; rejection?: string; agent?: string }

const TEAM = P.team as { name: string; role: string; email?: string; works?: string }[];
const laneOfWorks = (w = ''): Kind | null => /office|shop/i.test(w) ? 'office' : /warehouse|industrial/i.test(w) ? 'warehouse'
  : /resident|flat|home|buyer|listing|seller|rental|leas/i.test(w) ? 'flat' : null;
const AGENTS = TEAM.filter(t => t.role === 'agent');
/**
 * Who works it. One agent per kind of space (the Gujarat firms), or several
 * on homes split the way a US team is: a buyer's agent takes the people
 * buying, a listing agent the homes for sale and the owners being prospected,
 * a leasing agent everything for rent ("works": "buyers" / "listings" / "rentals").
 */
// Several agents doing the same work take it in turn (two who both work
// "buyers"), so nobody's desk is empty.
const turn: Record<string, number> = {};
function agentFor(lane: Kind, ctx: { deal?: string; side?: 'lead' | 'unit' | 'owner' } = {}): string {
  const inLane = AGENTS.filter(a => laneOfWorks(a.works) === (lane === 'shop' ? 'office' : lane));
  if (inLane.length > 1) {
    const want = ctx.deal === 'rent' ? /rent|leas/i : ctx.side === 'lead' ? /buyer/i : /listing|seller/i;
    const hits = inLane.filter(a => want.test(a.works || ''));
    if (hits.length) { const k = String(want); turn[k] = (turn[k] ?? -1) + 1; return hits[turn[k] % hits.length].name; }
  }
  return (inLane[0] || AGENTS[0]).name;
}
const idleToday: string | null = P.story?.idleToday || AGENTS.find(a => laneOfWorks(a.works) === 'warehouse')?.name || null;
// Days (0 today, 1 yesterday, …) on which a named person did nothing at all:
// `story.offDays: { "Name": [2, 4] }`. A week where everyone worked every day
// gives Performance's range view nothing to show; this is the agent who is
// slipping. Same days every run.
const offDays: Record<string, number[]> = P.story?.offDays || {};
const isOff = (who: string | null, t: Date) => !!who && (offDays[who] || []).includes(dayOf(t));
// A person whose recent days are thin: `story.slow: { "Name": { "keep": 0.4,
// "days": 7 } }` keeps that share of their work in the last N days. Days off
// alone left the slipping agent the busiest on the days they did work, and up
// on the week before, so the range view said the opposite of the story.
const slow: Record<string, { keep: number; days: number }> = P.story?.slow || {};
const isThin = (who: string | null, t: Date) => !!who && !!slow[who] && dayOf(t) < slow[who].days && !chance(slow[who].keep);

// Rounding of a price as a broker quotes it, by deal, and of a lead's budget.
const ROUND = { rent: 500, sale: 50000, ...(P.rounding || {}), budget: { rent: 1000, sale: 100000, ...(P.rounding?.budget || {}) } };
// Homes sold by type (`homes`, the US preset): single-family, condo, townhouse,
// each with its own sizes and price bands. Absent, a residential unit is a flat
// in a project or an independent rental (the Gujarat profiles).
const HOMES: Record<string, any> | null = P.homes || null;
const residentialLocalities = () => P.localities.filter((l: any) => l.kind !== 'industrial' && l.kind !== 'commercial');
// What a neighbourhood does to a price: `priceIndex` is its sale median over
// the city's; rents spread less than sale prices, so a rent moves by its square
// root unless the locality gives its own `rentIndex` (an estimate, said so in
// the preset).
const placeIndex = (loc: any, deal: string) => deal === 'sale' ? (loc.priceIndex ?? 1) : (loc.rentIndex ?? Math.sqrt(loc.priceIndex ?? 1));
const sizeOf = (bhk: string) => int(...((P.sizes || { '1': [450, 600], '2': [800, 1050], '3': [1250, 1600] })[bhk] as [number, number] || [800, 1050]));
// Baths per bedroom count, as the market lists them; India counts one each.
const bathsOf = (bhk: string) => (P.baths?.[bhk] ? pick(P.baths[bhk] as number[]) : Number(bhk));

function plan() {
  const volume = P.volume || { leads: 180, owners: 260, units: 140 };
  const stock = P.market?.stock || { commercial: 0.75, residential: 0.25 };
  const units: UnitPlan[] = [];
  const projects = P.projects as any[];
  const byKind = (k: string) => projects.filter(p => p.kind === k);

  // ── Listings ──────────────────────────────────────────────────────────────
  const resN = Math.round(volume.units * stock.residential);
  const comN = volume.units - resN;
  const want: Record<Kind, number> = {
    office: Math.round(comN * 0.5), warehouse: Math.round(comN * 0.35), shop: 0, flat: resN,
  };
  want.shop = comN - want.office - want.warehouse;
  let seq = 0;
  // Commercial rent per sqft: per month in India, per year in the US.
  const perMonth = P.commercialRentPer === 'year' ? 1 / 12 : 1;
  const rentOf = (range: number[], area: number) => roundTo(area * (range[0] + rnd() * (range[1] - range[0])) * perMonth, ROUND.rent);
  const furnish = () => pick(P.furnish || ['none', 'semi', 'semi', 'full']);
  const status = () => (chance(0.06) ? 'Blocked' : chance(0.04) ? 'Token Pending' : 'Available');
  const made = (daysAgo: number) => new Date(localMidnight(daysAgo) + int(H0, H0 + 8) * 3600_000);
  // One listing per unit: A-502 listed three times is the first thing a broker
  // would notice.
  const taken = new Set<string>();
  const freeUnit = (where: string, make: () => string) => {
    for (let i = 0; i < 40; i++) { const u = make(); if (!taken.has(`${where}|${u}`)) { taken.add(`${where}|${u}`); return u; } }
    return null;
  };

  // Offices, spread over the office buildings.
  const offices = byKind('office');
  for (let i = 0; i < want.office; i++) {
    const pj = offices[i % offices.length];
    const area = roundTo(int(pj.area[0], pj.area[1]), 25);
    const tower = pick(pj.towers) as string;
    const unitNo = freeUnit(`${pj.name}|${tower}`, () => `${int(1, pj.floors)}${String(int(1, pj.perFloor)).padStart(2, '0')}`);
    if (!unitNo) continue;
    const floor = Number(unitNo.slice(0, -2));
    const deal = chance(0.12) ? 'sale' : 'rent';
    const price = deal === 'rent' ? rentOf(pj.rentPerSqft, area) : roundTo(area * int(...(P.officeSalePerSqft || [6500, 9500]) as [number, number]), ROUND.sale);
    units.push({ key: `u${seq++}`, kind: 'office', lane: 'office', deal, locality: pj.locality, price, photos: chance(0.75) ? int(2, 3) : 0, createdAt: made(int(2, 60)),
      data: { category: 'commercial', subtype: 'office', deal, project: pj.name, society: pj.name, builder: pj.builder, tower, unit: unitNo,
        floor: String(floor), totalFloors: pj.floors, carpet: area, areaUnit: 'sqft', furnishType: furnish(), locality: pj.locality, price, status: status(),
        coveredParking: int(0, 2), ...near(locOf(pj.locality)) } });
  }
  // Warehouses and sheds in the industrial estates.
  const sheds = byKind('warehouse');
  for (let i = 0; i < want.warehouse; i++) {
    const pj = sheds[i % sheds.length];
    const area = roundTo(int(pj.area[0], pj.area[1]), 500);
    const sub = chance(0.25) ? 'industrial' : 'warehouse';
    const price = rentOf(pj.rentPerSqft, area);
    units.push({ key: `u${seq++}`, kind: 'warehouse', lane: 'warehouse', deal: 'rent', locality: pj.locality, price, photos: chance(0.7) ? int(2, 3) : 0, createdAt: made(int(2, 75)),
      data: { category: 'commercial', subtype: sub, deal: 'rent', project: pj.name, society: pj.name, tower: 'Shed', unit: freeUnit(pj.name, () => String(int(1, 220))), carpet: area, areaUnit: 'sqft',
        locality: pj.locality, price, status: status(), roadWidthFt: pick([30, 40, 60]), ...near(locOf(pj.locality)) } });
  }
  // Shops: the ground floor of an office building, and the market roads.
  const shopIn = offices.filter(o => o.shopsOnGround);
  const shopRoads = P.independent?.shops || { localities: [P.localities[0].name], area: [150, 500], rentPerSqft: [60, 110] };
  for (let i = 0; i < want.shop; i++) {
    const inBuilding = shopIn.length && i % 3 === 0;
    const pj = inBuilding ? shopIn[i % shopIn.length] : null;
    const area = roundTo(int(shopRoads.area[0], shopRoads.area[1]), 10);
    const locality = pj ? pj.locality : pick(shopRoads.localities as string[]);
    const price = rentOf(pj?.shopRentPerSqft || shopRoads.rentPerSqft, area);
    units.push({ key: `u${seq++}`, kind: 'shop', lane: 'office', deal: 'rent', locality, price, photos: chance(0.6) ? int(1, 2) : 0, createdAt: made(int(2, 50)),
      data: { category: 'commercial', subtype: 'shop', deal: 'rent', project: pj?.name || null, society: pj?.name || null, tower: pj ? pj.towers[0] : null,
        unit: pj ? `G${String(i + 1).padStart(2, '0')}` : null, floor: 'ground', carpet: area, areaUnit: 'sqft', furnishType: 'none', locality, price, status: status(), ...near(locOf(locality)) } });
  }
  // Homes. In a Gujarat city few flats, which is the point where people need
  // them; in a US metro, most of the book.
  const resProjects = byKind('residential');
  const indep = P.independent?.residentialRent || {};
  const saleShare = P.market?.deal?.sale ?? 0.2;
  const inProjectShare = P.market?.inProject ?? 0.7;
  // US fair housing law forbids a listing that prefers families (or anyone):
  // no "family only" there. The deposit is counted in months of rent.
  const extras = (deal: string) => ({
    ...(P.balconies === false ? {} : { balconies: int(1, 2) }),
    ...(P.fairHousing ? {} : { preferredTenants: chance(0.5) ? ['family'] : [] }),
    ...(deal === 'rent' ? { depositOption: pick(P.lease?.depositMonths || ['2', '3']) } : {}),
  });
  const typeLabel = (config: string, label?: string) => (label ? `${config} ${label}` : undefined);
  for (let i = 0; i < want.flat; i++) {
    const inProject = i < Math.round(want.flat * inProjectShare);
    if (!inProject && HOMES) { units.push(home(`u${seq++}`)); continue; }
    const pj = inProject ? resProjects[i % resProjects.length] : null;
    const configs = pj ? Object.keys(pj.configs) : Object.keys(indep);
    const config = pick(configs);
    const band = pj ? pj.configs[config] : indep[config];
    const deal: 'rent' | 'sale' = band.sale && (!band.rent || chance(saleShare)) ? 'sale' : 'rent';
    const bhk = config.match(/\d/)?.[0] || '2';
    const area = sizeOf(bhk);
    const price = deal === 'rent' ? roundTo(int(band.rent[0], band.rent[1]), ROUND.rent) : roundTo(int(band.sale[0], band.sale[1]), ROUND.sale);
    const locality = pj ? pj.locality : pick(residentialLocalities().map((l: any) => l.name) as string[]);
    const flatTower = pj ? pick(pj.towers) as string : null;
    const flatNo = pj ? freeUnit(`${pj.name}|${flatTower}`, () => `${int(1, pj.floors)}0${int(1, pj.perFloor)}`) : null;
    if (pj && !flatNo) continue;
    const floor = flatNo ? Number(flatNo.slice(0, -2)) : int(1, 4);
    const sub = pj?.subtype ? HOMES?.[pj.subtype] : null;
    units.push({ key: `u${seq++}`, kind: 'flat', lane: 'flat', deal, locality, price, photos: chance(0.85) ? int(3, 4) : 0, createdAt: made(int(1, 40)),
      data: { category: 'residential', subtype: sub?.subtype || 'apartment', ...(sub ? { type: typeLabel(config, sub.label) } : {}), bhk, deal,
        project: pj?.name || null, society: pj?.name || null, builder: pj?.builder || null,
        tower: flatTower, unit: flatNo, floor: String(floor), totalFloors: pj?.floors ?? 4,
        carpet: area, areaUnit: 'sqft', furnishType: furnish(), locality, price, status: status(), bathrooms: bathsOf(bhk),
        ...extras(deal), ...near(locOf(locality)) } });
  }
  // A house, townhouse or condo on its own, priced by its neighbourhood.
  function home(key: string): UnitPlan {
    const type = pickW(Object.entries(HOMES!).map(([k, h]: any) => [k, h.share] as [string, number]));
    const h = HOMES![type];
    const config = pickW(Object.entries(h.configs).map(([c, b]: any) => [c, b.share ?? 1] as [string, number]));
    const band = h.configs[config];
    const deal: 'rent' | 'sale' = band.sale && band.rent ? (chance(saleShare) ? 'sale' : 'rent') : band.sale ? 'sale' : 'rent';
    const where = residentialLocalities().filter((l: any) => !h.localities || h.localities.includes(l.kind));
    const loc = pickW(where.map((l: any) => [l, l.weight ?? 1] as [any, number]));
    const bhk = config.match(/\d/)?.[0] || '2';
    const price = roundTo(int(band[deal][0], band[deal][1]) * placeIndex(loc, deal), ROUND[deal]);
    const area = roundTo(int(...(h.sqft[bhk] as [number, number])), 10);
    return { key, kind: 'flat', lane: 'flat', deal, locality: loc.name, price, photos: chance(0.85) ? int(3, 4) : 0, createdAt: made(int(1, 40)),
      data: { category: 'residential', subtype: h.subtype, type: typeLabel(config, h.label), bhk, deal, project: null, society: null, builder: null,
        tower: null, unit: null, floor: null, totalFloors: pick(h.storeys || [1, 2]),
        carpet: area, areaUnit: 'sqft', furnishType: furnish(), locality: loc.name, price, status: status(), bathrooms: bathsOf(bhk),
        ...extras(deal), ...near(loc) } };
  }
  for (const u of units) {
    u.data.owner = person(); u.data.ownerPhone = phone();
    if (u.data.status === 'Available' && u.deal === 'rent' && chance(0.5)) u.data.availableFrom = new Date(NOW + int(0, 30) * DAY).toISOString().slice(0, 10);
    u.agent = agentFor(u.lane, { deal: u.deal, side: 'unit' });
  }

  // ── Leads: what people asked for, and how far each one got ────────────────
  const demand = P.market?.demand || { commercial: 0.45, residential: 0.55 };
  // Sources as names (equally likely) or [name, weight] pairs (the market's real mix).
  const SOURCES: (string | [string, number])[] = P.sources || ['99acres', 'MagicBricks', 'Housing.com', 'Walk-in', 'Referral', 'Website'];
  const source = () => (Array.isArray(SOURCES[0]) ? pickW(SOURCES as [string, number][]) : pick(SOURCES as string[]));
  const MIX: [string, number, string?][] = [
    ['New', 0.06, 'fresh'], ['New', 0.03, 'slipped'], ['Call Not Received', 0.10], ['Callback', 0.08],
    ['Follow-Up', 0.24], ['Interested', 0.18], ['Site Visit', 0.09], ['Deal Closed', 0.07], ['Rejected', 0.15],
  ];
  const AGE: Record<string, [number, number]> = {
    'Call Not Received': [1, 6], Callback: [1, 8], 'Follow-Up': [3, 20], Interested: [4, 25], 'Site Visit': [6, 30], 'Deal Closed': [16, 45], Rejected: [5, 40],
  };
  const REJECT = ['Budget Mismatch', 'Locality Mismatch', 'Already purchased / rented', 'No Requirement'];
  const leads: LeadPlan[] = [];
  const rows: [string, string?][] = [];
  for (const [stage, share, flag] of MIX) for (let i = 0; i < Math.round(volume.leads * share); i++) rows.push([stage, flag]);
  let li = 0;
  const C = P.demand?.commercial || [];
  const R = P.demand?.residential || [];
  for (const [stage, flag] of shuffle(rows)) {
    const residential = chance(demand.residential);
    const lane: Kind = residential ? 'flat' : pick(['office', 'office', 'warehouse', 'shop'] as Kind[]);
    const ageR = flag === 'fresh' ? [0, 0] : flag === 'slipped' ? [2, 3] : AGE[stage];
    const created = flag === 'fresh' ? at(0, H0 - 2, Math.max(H0 - 1, Math.min(H1 - 0.5, (NOW + ZONE) % DAY / 3600_000)))
      ?? new Date(NOW - int(20, 90) * 60_000) : new Date(localMidnight(int(ageR[0], ageR[1])) + int(H0 - 1, H0 + 10) * 3600_000);
    const createdAt = created.getTime() > NOW ? new Date(NOW - 30 * 60_000) : created;
    let req: any;
    if (lane === 'flat' && HOMES) {
      // A buyer or a renter, for a kind of home, priced where they want to live.
      const type = pickW(Object.entries(HOMES).map(([k, h]: any) => [k, h.leadShare ?? h.share] as [string, number]));
      const h = HOMES[type];
      const config = pickW(Object.entries(h.configs).map(([c, b]: any) => [c, b.share ?? 1] as [string, number]));
      const band = h.configs[config];
      const deal = band.sale && band.rent ? (chance(P.market?.leadDeal?.sale ?? 0.5) ? 'sale' : 'rent') : band.sale ? 'sale' : 'rent';
      const where = residentialLocalities().filter((l: any) => !h.localities || h.localities.includes(l.kind));
      const loc = pickW(where.map((l: any) => [l, l.weight ?? 1] as [any, number]));
      const budget = roundTo(int(band[deal][0], band[deal][1]) * placeIndex(loc, deal) * 1.05, ROUND.budget[deal as 'rent' | 'sale']);
      req = { deal, category: 'residential', subtype: h.subtype, config, locality: loc.name, maxBudget: budget };
      req.notes = fill(pick(Array.isArray(R) ? R : R[deal] || []) || '', req) || null;
    } else if (lane === 'flat') {
      const config = pick(['1 BHK', '2 BHK', '2 BHK', '2 BHK', '3 BHK']);
      const bands = P.independent?.residentialRent?.[config]?.rent || [9000, 20000];
      const budget = roundTo(int(bands[0], bands[1]) * 1.1, 1000);
      const loc = pick(P.localities.filter((l: any) => l.kind !== 'industrial').map((l: any) => l.name) as string[]);
      req = { deal: 'rent', category: 'residential', subtype: 'apartment', config, locality: loc, maxBudget: budget, notes: pick(R) || null };
    } else {
      const sub = lane === 'warehouse' ? 'warehouse' : lane === 'shop' ? 'shop' : 'office';
      const pool = units.filter(u => u.kind === lane);
      const like = pool.length ? pick(pool) : null;
      req = { deal: chance(0.1) && lane === 'office' ? 'sale' : 'rent', category: 'commercial', subtype: sub, locality: like?.locality || P.localities[0].name,
        maxBudget: like ? roundTo(like.price * (0.9 + rnd() * 0.5), 1000) : null,
        notes: pick(C.filter((c: string) => (sub === 'warehouse' ? /godown|shed|sqft/.test(c) : sub === 'shop' ? /shop/.test(c) : /office|ca firm/.test(c)))) || null };
    }
    const agent = agentFor(lane, { deal: req.deal, side: 'lead' });
    const L: LeadPlan = { key: `l${li++}`, name: person(), phone: phone(), source: source(), stage, lane, req, createdAt, agent, events: [] };
    story(L, agent, flag);
    leads.push(L);
  }

  // ── Calling: owners of flats and offices, the supply a broker goes after ──
  const calling = P.market?.calling || { residential: 0.7, commercial: 0.3 };
  const owners: OwnerPlan[] = [];
  const unassignedProject: string | null = P.story?.unassignedProject || resProjects[resProjects.length - 1]?.name || null;
  const callingProjects = [...resProjects.map(p => ({ p, share: calling.residential / resProjects.length })),
    ...(calling.commercial ? offices : []).map(p => ({ p, share: calling.commercial / offices.length }))];
  // 'Callback' here is a plan, not a status: an owner who asked to be rung
  // back ends up Contacted with a callback time (ownerStory). Calling has had
  // no Callback status since 2026-09-23.
  const O_MIX: [string, number][] = [['New', 0.28], ['Call Not Received', 0.10], ['Incoming Not Available', 0.03], ['Switch Off', 0.03],
    ['Contacted', 0.14], ['Callback', 0.12], ['Interested', 0.12], ['Key Received', 0.05], ['Not Interested', 0.09], ['Do Not Call', 0.04]];
  let oi = 0;
  for (const { p, share } of callingProjects) {
    const n = Math.round(volume.owners * share);
    const isRes = p.kind === 'residential';
    const lane: Kind = isRes ? 'flat' : 'office';
    // One project came in as a fresh list nobody has been given yet: the
    // owner's morning starts there.
    const fresh = p.name === unassignedProject;
    const importedAt = new Date(localMidnight(fresh ? 1 : int(12, 30)) + (H0 + 1) * 3600_000);
    const seen = new Set<string>();
    for (let i = 0; i < n; i++) {
      const tower = pick(p.towers as string[]);
      const floor = int(1, p.floors);
      const unitNo = `${floor}${String(int(1, p.perFloor)).padStart(isRes ? 1 : 2, '0')}`;
      if (seen.has(`${tower}-${unitNo}`)) continue;
      seen.add(`${tower}-${unitNo}`);
      const config = isRes ? pick(Object.keys(p.configs)) : (chance(0.85) ? 'Office' : 'Shop');
      const stage = fresh ? 'New' : (() => { let r = rnd(); for (const [s, w] of O_MIX) { if ((r -= w) <= 0) return s; } return 'New'; })();
      const O: OwnerPlan = { key: `o${oi++}`, lane, assign: !fresh, createdAt: importedAt, stage, events: [],
        data: { name: person(), phone: phone(), project: p.name, tower, unitNo, config, locality: p.locality, source: 'Import',
          carpetArea: isRes ? int(...((P.ownerArea || [800, 1500]) as [number, number])) : roundTo(int(p.area?.[0] || 400, p.area?.[1] || 1500), 25) } };
      O.agent = agentFor(lane, { side: 'owner' });
      ownerStory(O, O.agent);
      owners.push(O);
    }
  }
  return { units, leads, owners };
}

// ── A lead's history, in the order it happened ──────────────────────────────
function story(L: LeadPlan, agent: string, flag?: string) {
  const ev = (type: string, title: string, description: string, raw: Date | null, metadata?: any) => {
    const t = working(raw);
    if (!t) return null;
    if ((agent === idleToday && dayOf(t) === 0) || isOff(agent, t) || weekOff(t) || isThin(agent, t)) return null;
    L.events.push({ type, title, description, author: agent, at: t, metadata }); return t;
  };
  const call = (t: Date | null, outcome: string, remark?: string) => ev('call', 'Call', remark || 'Call initiated', t, { outcome, edited: true });
  const move = (t: Date | null, from: string, to: string, note = '') => ev('stage_change', `${from} → ${to}${note ? `: ${note}` : ''}`, `${from} → ${to}${note ? `: ${note}` : ''}`, t, { from, to });
  const phr = P.phrases || {};
  const c0 = L.createdAt;
  const first = later(c0, 12, 95);
  const remark = () => (L.req.notes && chance(0.5) ? L.req.notes : fill(pick(phr.remark || ['spoke, will share options']), L.req));
  const fuAt = (kind: 'overdue' | 'today' | 'soon') => kind === 'overdue' ? pastSlot()
    : kind === 'today' ? (todaySlot() ?? soonSlot())
    : soonSlot();
  const touchRecent = () => { // the open book gets worked: a touch in the last two days
    const d = int(0, 2); const t = at(d);
    if (t && t > c0) { if (chance(0.6)) call(t, pick(['discussed', 'no_answer', 'callback', 'details_sent']), chance(0.4) ? remark() : undefined); else ev('whatsapp', 'WhatsApp', 'WhatsApp initiated', t, { outcome: 'wa_details_sent', edited: true }); }
  };
  const schedule = (action: string, kind: 'overdue' | 'today' | 'soon', note?: string) => {
    const when = fuAt(kind);
    L.followUp = { action, at: when.toISOString(), note: note || null };
    L.overdue = kind === 'overdue';
    ev('follow_up', 'Scheduled', `${action}, ${when.toLocaleString(P.locale?.numberLocale || 'en-IN', { timeZone: TZ, weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}`,
      later(first, 5, 120));
  };

  if (L.stage === 'New') return;   // fresh, or slipped: nobody has called
  if (L.stage === 'Call Not Received') {
    call(first, 'no_answer');
    move(later(first, 1, 3), 'New', 'Call Not Received');
    ev('whatsapp', 'WhatsApp', 'WhatsApp initiated', later(first, 4, 30), { outcome: 'wa_after_no_answer', edited: true });
    const second = new Date(first.getTime() + int(18, 30) * 3600_000);
    call(second, pick(['no_answer', 'unreachable']), chance(0.3) ? pick(phr.call || ['not ans']) : undefined);
    return;
  }
  call(first, L.stage === 'Callback' ? 'callback' : 'discussed', L.stage === 'Callback' ? pick(phr.callback || ['call back later']) : remark());
  if (L.stage === 'Callback') {
    move(later(first, 1, 3), 'New', 'Callback');
    schedule('Callback', pick(['overdue', 'overdue', 'today', 'today', 'soon']), pick(phr.callback || []));
    return;
  }
  ev('whatsapp', 'WhatsApp', 'WhatsApp initiated', later(first, 10, 90), { outcome: 'wa_details_sent', edited: true });
  move(later(first, 2, 6), 'New', 'Follow-Up');
  if (L.stage === 'Rejected') {
    const reason = pick(['Budget Mismatch', 'Locality Mismatch', 'Already purchased / rented', 'No Requirement']);
    L.rejection = reason;
    const t = new Date(first.getTime() + int(1, 4) * DAY);
    call(t, reason === 'Already purchased / rented' ? 'booked_elsewhere' : 'not_interested');
    move(later(t, 1, 5), 'Follow-Up', 'Rejected', reason);
    return;
  }
  if (L.stage === 'Follow-Up') {
    if (chance(0.5)) ev('remark', 'Remark', remark(), new Date(first.getTime() + int(4, 30) * 3600_000));
    touchRecent();
    schedule('Follow-up Call', pick(['overdue', 'today', 'today', 'soon', 'soon']));
    return;
  }
  const t2 = new Date(first.getTime() + int(1, 3) * DAY);
  call(t2, 'visit', remark());
  move(later(t2, 2, 8), 'Follow-Up', 'Interested');
  if (L.stage === 'Interested') {
    touchRecent();
    schedule(chance(0.4) ? 'Site Visit' : 'Follow-up Call', pick(['overdue', 'today', 'soon', 'soon']));
    return;
  }
  // Site Visit and Deal Closed: they went and saw it.
  const visit = new Date(Math.min(t2.getTime() + int(1, 4) * DAY, NOW - 3 * 3600_000));
  visit.setTime(localMidnight(dayOf(visit)) + int(H0 + 1, H0 + 7) * 3600_000);
  if (visit.getTime() > NOW - 3600_000 || visit <= t2) visit.setTime(t2.getTime() + 3 * 3600_000);
  if (L.stage === 'Site Visit' && chance(0.35)) {
    // Booked, not yet happened: today or tomorrow.
    schedule('Site Visit', chance(0.5) ? 'today' : 'soon', phr.visitNote || 'Meet at the site');
    move(later(t2, 30, 300), 'Interested', 'Site Visit');
    return;
  }
  L.visit = { at: working(visit) ?? new Date(t2.getTime() + 3 * 3600_000), remark: fill(pick(phr.remark || ['site visit done']), L.req) };
  move(later(visit, 20, 90), 'Interested', 'Site Visit');
  ev('remark', 'Remark', L.visit.remark, later(visit, 60, 240));
  if (L.stage === 'Site Visit') { touchRecent(); schedule('Follow-up Call', pick(['today', 'soon', 'overdue'])); return; }
  // Deal Closed: the agreement is made through the service, and moves the stage.
  const closeAt = new Date(Math.min(visit.getTime() + int(2, 8) * DAY, NOW - DAY));
  L.close = { kind: L.req.deal === 'sale' ? 'sale' : 'rent', at: closeAt, endsInDays: 0 };
  L.stage = 'Site Visit';
}

// ── An owner on the calling list ────────────────────────────────────────────
function ownerStory(O: OwnerPlan, agent: string) {
  const ev = (type: string, title: string, description: string, raw: Date | null, metadata?: any, author: string | null = agent) => {
    const t = working(raw);
    if (!t) return;
    if ((author === idleToday && dayOf(t) === 0) || isOff(author, t) || weekOff(t) || isThin(author, t)) return;
    O.events.push({ type, title, description, author, at: t, metadata });
  };
  if (O.stage === 'New') return;
  const phr = P.phrases || {};
  const t = new Date(O.createdAt.getTime() + int(1, 10) * DAY + int(1, 8) * 3600_000);
  const first = t.getTime() < NOW - 3600_000 ? t : new Date(NOW - int(2, 20) * 3600_000);
  const NOT_THROUGH: Record<string, string> = { 'Call Not Received': 'no_answer', 'Incoming Not Available': 'unreachable', 'Switch Off': 'unreachable' };
  const missed = NOT_THROUGH[O.stage];
  const answered = !missed && (O.stage !== 'Contacted' || chance(0.4));
  ev('call', 'Call', answered ? pick(phr.owner || ['spoke to owner']) : 'Call initiated', first,
    { outcome: answered ? 'discussed' : (missed || 'no_answer'), edited: true });
  ev('stage_change', 'Stage → Contacted', 'First outreach logged', later(first, 0, 1), { auto: true }, 'System');
  if (O.stage === 'Contacted') return;
  if (missed) {
    ev('stage_change', `Stage → ${O.stage}`, `Marked ${O.stage}`, later(first, 1, 5), { from: 'Contacted', to: O.stage });
    return;
  }
  const t2 = later(first, 30, 2000);
  if (O.stage === 'Callback') {
    O.stage = 'Contacted';
    const kind = pick(['overdue', 'overdue', 'today', 'soon']);
    O.callbackAt = kind === 'overdue' ? pastSlot() : kind === 'today' ? (todaySlot() ?? soonSlot()) : soonSlot();
    O.callbackNote = pick(phr.callback || ['call back']);
    ev('follow_up', 'Callback scheduled', O.callbackNote, later(t2, 0, 2));
    return;
  }
  const to = O.stage === 'Key Received' ? 'Interested' : O.stage;
  ev('stage_change', `Stage → ${to}`, `Marked ${to}`, t2, { from: 'Contacted', to });
  if (O.stage === 'Key Received') {
    const t3 = new Date(Math.min(t2.getTime() + int(1, 5) * DAY, NOW - 3 * 3600_000));
    ev('remark', 'Remark', phr.keyReceived || 'Keys with us', t3);
    ev('stage_change', 'Stage → Key Received', 'Marked Key Received', later(t3, 1, 10), { from: 'Interested', to: 'Key Received' });
  }
  if (O.stage === 'Not Interested' || O.stage === 'Do Not Call') O.rejection = O.stage === 'Do Not Call' ? 'Asked not to be called' : pick(P.ownerReject || ['Already let out', 'Selling, not renting', 'Not now']);
}

// ============================================================================
// THE DATABASE
// ============================================================================
/** What the plan holds, for a person to read before anything is written. */
function summarise(p: ReturnType<typeof plan>) {
  const count = (xs: any[], f: (x: any) => string) => Object.entries(xs.reduce((m: any, x) => { const k = f(x); m[k] = (m[k] || 0) + 1; return m; }, {})).map(([k, v]) => `${k} ${v}`).join(', ');
  const L = P.locale || {};
  console.log(`Market: ${MARKET} · ${L.country || 'IN'} · ${L.currency || 'INR'} · ${L.numberLocale || 'en-IN'} · +${L.phoneCountry || '91'} · rooms ${L.rooms || 'bhk'} · ${TZ} ${H0}:00 to ${Math.floor(H1)}:${String(Math.round((H1 % 1) * 60)).padStart(2, '0')}${WEEK_OFF.size ? ` · off ${[...WEEK_OFF].join(',')}` : ''}`);
  console.log(`Team: ${TEAM.map(t => `${t.name} (${t.role}${t.works ? `, ${t.works}` : ''})`).join('; ')}; everyone signs in with ${PASSWORD}`);
  console.log(`Listings ${p.units.length}: ${count(p.units, u => `${u.data.type || u.kind} ${u.deal}`)}; with photos ${p.units.filter(u => u.photos).length}`);
  console.log(`Leads ${p.leads.length}: ${count(p.leads, l => (l.close ? 'Deal Closed' : l.stage))}`);
  console.log(`  wanting: ${count(p.leads, l => `${l.req.subtype} ${l.req.deal}`)}`);
  console.log(`  from: ${count(p.leads, l => l.source)}`);
  console.log(`Calling ${p.owners.length}: ${count(p.owners, o => o.stage)}; nobody on ${p.owners.filter(o => !o.assign).length}`);
  console.log(`History events ${p.leads.reduce((s, l) => s + l.events.length, 0) + p.owners.reduce((s, o) => s + o.events.length, 0)}; idle today: ${idleToday || 'nobody'}`);
  // Each agent's to-do as it will stand at the build, and their last 7 days.
  const today1 = midnightOf(NOW) + DAY;
  for (const a of AGENTS) {
    const mine = p.leads.filter(l => l.agent === a.name && l.followUp && !l.close);
    const due = (l: LeadPlan) => new Date(l.followUp.at).getTime();
    const over = mine.filter(l => due(l) < NOW), today = mine.filter(l => due(l) >= NOW && due(l) < today1);
    const week = Array.from({ length: 7 }, (_, d) => p.leads.reduce((s, l) => s + l.events.filter(e => e.author === a.name && dayOf(e.at) === d).length, 0)
      + p.owners.reduce((s, o) => s + o.events.filter(e => e.author === a.name && dayOf(e.at) === d).length, 0));
    console.log(`  ${a.name}: overdue ${over.length} (${count(over, l => l.followUp.action)}), due later today ${today.length} (${count(today, l => l.followUp.action) || 'none'}); events today, then each day back: ${week.join(' ')}`);
  }
  const n = Number(args.sample) || 0;
  if (n) {
    console.log(`\nSample leads:`);
    for (const l of p.leads.slice(0, n)) console.log(`  ${l.name.padEnd(22)} ${l.phone.padEnd(14)} ${`${l.req.deal} ${l.req.config || ''} ${l.req.subtype}`.padEnd(32)} ${String(l.req.locality).padEnd(18)} max ${l.req.maxBudget ? MONEY.format(l.req.maxBudget) : '?'}  ${l.source.padEnd(13)} ${l.stage}${l.req.notes ? `  "${l.req.notes}"` : ''}`);
    console.log(`Sample listings:`);
    for (const u of p.units.slice(-Math.ceil(n / 2))) console.log(`  ${String(u.data.type || `${u.data.bhk ? `${u.data.bhk} BHK ` : ''}${u.data.subtype}`).padEnd(26)} ${u.deal.padEnd(5)} ${(u.data.project ? `${u.data.project} ${u.data.tower || ''}-${u.data.unit || ''}` : u.locality).padEnd(30)} ${String(u.data.carpet).padStart(5)} sqft ${u.data.bathrooms ?? '-'} ba  ${MONEY.format(u.price)}${u.deal === 'rent' ? '/mo' : ''}  owner ${u.data.owner} ${u.data.ownerPhone}`);
  }
}

async function main() {
  if (typeof args.dump === 'string') { fs.writeFileSync(args.dump, JSON.stringify(plan(), null, 1)); console.log(`plan written to ${args.dump}`); return; }
  // Plan without a database: what would be built, not whether the firm exists.
  if (args.offline) { if (MODE !== 'plan') die('--offline only plans.'); summarise(plan()); return; }
  const { dbRef, databaseUrl } = await import('../services/env.js');
  const { sql } = await import('../services/db.js');
  const url = databaseUrl()!;
  console.log(`→ ${ENV} database ${dbRef(url)} · profile ${profileName} · firm /${SLUG} · ${MODE}`);

  const [migrated] = await sql`SELECT 1 FROM schema_migrations WHERE name = ${NEEDS_MIGRATION}`;
  if (!migrated) die(`This database has not run ${NEEDS_MIGRATION}: its API is older than this checkout. Deploy the API first.`);
  const [existing] = await sql`SELECT id, brand_config FROM tenants WHERE id = ${SLUG} OR slug = ${SLUG} LIMIT 1`;
  const ours = !!existing && existing.brand_config?.demo?.generator === GEN;
  if (existing && !ours) die(`/${SLUG} exists and this script did not make it. Refusing to touch it.`);

  if (MODE === 'plan') {
    console.log(`\n${existing ? `/${SLUG} exists (made by this script, ${existing.brand_config.demo.builtAt}); --write would remake it.` : `/${SLUG} does not exist; --write would make it.`}`);
    summarise(plan());
    await sql.end(); return;
  }
  if (MODE === 'delete') {
    if (!existing) die(`/${SLUG} does not exist.`);
    await wipe(sql); console.log(`✓ /${SLUG} deleted`); await sql.end(); return;
  }
  if (MODE === 'refresh') {
    if (!existing) die(`/${SLUG} does not exist.`);
    await refresh(sql, existing.brand_config.demo); await sql.end(); return;
  }
  const hourNow = ((NOW + ZONE) % DAY) / 3600_000;
  if (hourNow < H0 + 1) console.log(`  note: it is ${Math.floor(hourNow)}:${String(Math.floor((hourNow % 1) * 60)).padStart(2, '0')} in ${TZ}, so "today" will hold almost no work. A refresh keeps the time of day it was built at; build after ${H0 + 1}:00 there for a demo.`);
  if (existing) { console.log('  remaking: removing the earlier build'); await wipe(sql); }
  await build(sql);
  await sql.end();
}

// Every row of the demo firm, and its photos. Same order-free loop as the
// tutorial seeder: foreign keys decide the order and nothing here knows it.
async function wipe(sql: any) {
  const tables: { table_name: string }[] = await sql`
    SELECT DISTINCT table_name FROM information_schema.columns
    WHERE table_schema = 'public' AND column_name = 'tenant_id' AND table_name NOT IN ('tenants', 'audit_log')`;
  let left = tables.map(t => t.table_name);
  for (let pass = 0; left.length && pass < 8; pass++) {
    const failed: string[] = [];
    for (const t of left) { try { await sql`DELETE FROM ${sql(t)} WHERE tenant_id = ${SLUG}`; } catch { failed.push(t); } }
    if (failed.length === left.length) die(`Could not clear: ${failed.join(', ')}`);
    left = failed;
  }
  await sql`DELETE FROM audit_log WHERE chain = ${SLUG}`;
  await sql`DELETE FROM audit_checks WHERE chain = ${SLUG}`;
  await sql`DELETE FROM tenants WHERE id = ${SLUG}`;
  const { mediaConfigured } = await import('../services/media.js');
  if (mediaConfigured()) {
    const { S3Client, ListObjectsV2Command, DeleteObjectsCommand } = await import('@aws-sdk/client-s3');
    const s3 = new S3Client({ region: 'auto', endpoint: process.env.R2_ENDPOINT, credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID!, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY! } });
    let token: string | undefined, gone = 0;
    do {
      const out: any = await s3.send(new ListObjectsV2Command({ Bucket: process.env.R2_BUCKET_NAME, Prefix: `${SLUG}/`, ContinuationToken: token }));
      const keys = (out.Contents || []).map((o: any) => ({ Key: o.Key }));
      if (keys.length) { await s3.send(new DeleteObjectsCommand({ Bucket: process.env.R2_BUCKET_NAME, Delete: { Objects: keys } })); gone += keys.length; }
      token = out.IsTruncated ? out.NextContinuationToken : undefined;
    } while (token);
    if (gone) console.log(`  ${gone} photos removed from storage`);
  }
}

// Every date in the firm moves forward by the same number of CALENDAR days, so
// a call made at 4 pm is still at 4 pm and "due today" is still today. Moving
// by the exact hours would carry yesterday evening's calls to three in the
// morning. History the move pushes past now (the build day's afternoon, when
// the refresh runs in the morning) steps back one day.
async function refresh(sql: any, demo: any) {
  const anchor = new Date(demo.anchor).getTime();
  const days = Math.floor((NOW + ZONE) / DAY) - Math.floor((anchor + ZONE) / DAY);
  if (days < 1) { console.log('Built today already; nothing to move.'); return; }
  const secs = days * 86400;
  const shift = days * DAY;
  const TABLES = ['crm_leads', 'crm_owners', 'crm_properties', 'crm_timeline_events', 'activities', 'crm_agreements', 'lead_shortlist', 'notifications'];
  const cols: any[] = await sql`
    SELECT table_name, column_name, data_type FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name IN ${sql(TABLES)} AND data_type IN ('timestamp with time zone', 'timestamp without time zone', 'date')`;
  for (const t of TABLES) {
    const set = cols.filter(c => c.table_name === t);
    if (!set.length) continue;
    const parts = set.map(c => c.data_type === 'date'
      ? sql`${sql(c.column_name)} = ${sql(c.column_name)} + ${days}::int`
      : sql`${sql(c.column_name)} = ${sql(c.column_name)} + make_interval(secs => ${secs})`);
    const clause = parts.reduce((a: any, p: any) => sql`${a}, ${p}`);
    await sql`UPDATE ${sql(t)} SET ${clause} WHERE tenant_id = ${SLUG}`;
  }
  await sql`UPDATE crm_leads SET follow_up = jsonb_set(follow_up, '{at}', to_jsonb(to_char(((follow_up->>'at')::timestamptz + make_interval(secs => ${secs})) AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')))
            WHERE tenant_id = ${SLUG} AND follow_up->>'at' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T'`;
  const back = [['crm_timeline_events', 'timestamp'], ['activities', 'at'], ['crm_leads', 'created_at'], ['crm_owners', 'created_at'],
    ['crm_owners', 'last_call_at'], ['crm_properties', 'created_at']];
  let stepped = 0;
  for (const [t, c] of back) {
    const r = await sql`UPDATE ${sql(t)} SET ${sql(c)} = ${sql(c)} - interval '1 day' WHERE tenant_id = ${SLUG} AND ${sql(c)} > now()`;
    stepped += r.count;
  }
  await sql`UPDATE tenants SET brand_config = jsonb_set(brand_config, '{demo,anchor}', to_jsonb(${new Date(anchor + shift).toISOString()}::text)) WHERE id = ${SLUG}`;
  console.log(`✓ /${SLUG} moved forward ${days} day${days === 1 ? '' : 's'}${stepped ? `; ${stepped} rows that landed after now went back a day` : ''}`);
}

// ── Photos, through the app's own upload processing ─────────────────────────
async function preparePhotos(firmName: string): Promise<Record<string, { buf: Buffer; w: number; h: number }[]>> {
  const lib = JSON.parse(fs.readFileSync(path.join(HERE, 'demo-profiles', 'photos.json'), 'utf8'));
  const dir = path.join(os.tmpdir(), 'delpat-demo-photos', crypto.createHash('sha1').update(firmName).digest('hex').slice(0, 10));
  fs.mkdirSync(dir, { recursive: true });
  const out: Record<string, { buf: Buffer; w: number; h: number }[]> = {};
  let browser: any = null, page: any = null;
  for (const kind of ['office', 'shop', 'warehouse', 'flat']) {
    out[kind] = [];
    for (const [i, ph] of (lib[kind] || []).entries()) {
      const done = path.join(dir, `${kind}-${i}.jpg`), meta = `${done}.json`;
      if (fs.existsSync(done) && fs.existsSync(meta)) { out[kind].push({ buf: fs.readFileSync(done), ...JSON.parse(fs.readFileSync(meta, 'utf8')) }); continue; }
      const raw = Buffer.from(await (await fetch(ph.url, { headers: { 'User-Agent': 'delpat-demo/1.0' } })).arrayBuffer());
      if (!page) {
        const { chromium } = await import('playwright');
        browser = await chromium.launch(args.channel ? { channel: String(args.channel) } : {});
        page = await browser.newPage();
        const vite = String(args.vite || 'http://localhost:5173');
        await page.goto(vite).catch(() => die(`The Vite dev server is not answering at ${vite}. Start it (npm run dev) or pass --no-photos.`));
      }
      const r = await page.evaluate(async ({ b64, firm }: any) => {
        const m = await import('/src/lib/media.js' as any);
        const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
        const res = await m.processListingImage(new Blob([bytes], { type: 'image/jpeg' }), firm);
        const dataUrl: string = await new Promise(ok => { const fr = new FileReader(); fr.onload = () => ok(fr.result as string); fr.readAsDataURL(res.blob); });
        return { b64: dataUrl.split(',')[1], w: res.width, h: res.height };
      }, { b64: raw.toString('base64'), firm: firmName });
      const buf = Buffer.from(r.b64, 'base64');
      fs.writeFileSync(done, buf); fs.writeFileSync(meta, JSON.stringify({ w: r.w, h: r.h }));
      out[kind].push({ buf, w: r.w, h: r.h });
    }
  }
  if (browser) await browser.close();
  return out;
}

async function build(sql: any) {
  const p = plan();
  const { provisionTenant, updateSettings, createLead, createOwnersBatch, bulkAssignOwners, createProperty, prepareListing, localeOf } = await import('../services/store.js');
  const { createAgreement } = await import('../services/agreements.js');
  const { createIntegration, setParserConfig } = await import('../services/ingestion.js');
  const { runWithContext } = await import('../services/context.js');
  const media = await import('../services/media.js');
  const bcrypt = (await import('bcryptjs')).default;
  const t0 = Date.now();
  const step = (m: string) => console.log(`  ${((Date.now() - t0) / 1000).toFixed(0).padStart(4)}s  ${m}`);

  // 1. The firm, the console's way.
  const owner = TEAM.find(t => t.role === 'owner') || die('The profile needs an owner in its team.');
  const made = await provisionTenant({
    firmName: P.firm.name, city: P.firm.city, slug: SLUG, ownerName: owner.name, ownerEmail: owner.email || `${SLUG}@demo.example`,
    ownerPassword: PASSWORD, mustChangePassword: false, primaryColor: P.firm.color,
    initialTeam: TEAM.filter(t => t !== owner).map(t => ({ name: t.name, role: t.role })) as any,
  });
  if (made.tenant.id !== SLUG) die(`Made "${made.tenant.id}", expected "${SLUG}".`);
  await sql`UPDATE users SET password_hash = ${await bcrypt.hash(PASSWORD, 10)}, must_change_password = FALSE WHERE tenant_id = ${SLUG}`;
  const users: any[] = await sql`SELECT id, name, role, login_id FROM users WHERE tenant_id = ${SLUG}`;
  const idOf = (name: string | null) => (name ? users.find(u => u.name === name)?.id ?? null : null);
  const ownerId = made.owner.id;
  await sql`UPDATE crm_routing_rules SET active_agent_ids = ${sql.json(users.filter(u => u.role === 'agent').map(u => u.id))} WHERE tenant_id = ${SLUG}`;
  await sql`UPDATE tenants SET brand_config = brand_config || ${sql.json({ demo: { generator: GEN, profile: profileName, seed: P.seed, anchor: new Date(NOW).toISOString(), builtAt: new Date(NOW).toISOString() } })} WHERE id = ${SLUG}`;
  step(`firm /${SLUG} with ${users.length} people`);

  const as = <T,>(name: string | null, fn: () => Promise<T>): Promise<T> => {
    const u = users.find(x => x.name === name);
    return runWithContext({ tenantId: SLUG, userId: u?.id ?? null, role: u?.role ?? null, actorType: u ? 'user' : 'system' }, fn);
  };
  // The market, in the firm's settings, through the path Settings saves by:
  // the app reads its currency, number format, phone country and room words
  // from `locale`, and its day from `timezone`.
  await as(owner.name, () => updateSettings({
    locale: P.locale, timezone: TZ, workHours: { start: Math.floor(H0), end: Math.ceil(H1) },
    ...(P.sources ? { sources: P.sources.map((x: any) => (Array.isArray(x) ? x[0] : x)) } : {}),
  }));
  step(`settings: ${JSON.stringify(P.locale)}, ${TZ}`);
  const ctxOf = (name: string | null) => { const id = idOf(name); return id ? { actorType: 'user' as const, actorId: id, actorLabel: name } : { actorType: 'system' as const }; };
  const pool = async <T,>(items: T[], n: number, fn: (x: T) => Promise<void>) => {
    let i = 0; await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) await fn(items[i++]); }));
  };

  // 2. Listings, each added by the agent who works that kind of space.
  const photos = args['no-photos'] ? null : await preparePhotos(P.firm.name);
  if (photos) step(`photos ready: ${Object.entries(photos).map(([k, v]) => `${k} ${v.length}`).join(', ')}`);
  const unitId = new Map<string, string>();
  await pool(p.units, 3, async (u) => {
    const items: any[] = [];
    if (photos && u.photos && media.mediaConfigured()) {
      for (const ph of shuffle(photos[u.kind] || []).slice(0, u.photos)) {
        const key = media.buildMediaKey(SLUG, 'property', 'jpg');
        const put = await fetch(await media.presignUpload(key, 'image/jpeg'), { method: 'PUT', body: ph.buf, headers: { 'Content-Type': 'image/jpeg' } });
        if (put.ok) items.push({ key, kind: 'photo', w: ph.w, h: ph.h, at: u.createdAt.toISOString() });
      }
    }
    const agent = u.agent!;
    const loc = await localeOf(SLUG);
    const created = await as(agent, () => createProperty(prepareListing({ ...u.data, media: items }, loc), ctxOf(agent)));
    unitId.set(u.key, created.id);
  });
  step(`${unitId.size} listings`);

  // 3. The calling list: imported, then handed out (the hand-out writes the history).
  const callRows = await as(owner.name, () => createOwnersBatch(p.owners.map(o => o.data), ctxOf(owner.name)));
  const ownerId2 = new Map<string, string>();
  p.owners.forEach((o, i) => ownerId2.set(o.key, callRows[i].id));
  for (const a of AGENTS) {
    const ids = p.owners.filter(o => o.assign && o.agent === a.name).map(o => ownerId2.get(o.key)!);
    if (ids.length) await as(owner.name, () => bulkAssignOwners(ids, idOf(a.name), ctxOf(owner.name)));
  }
  for (const o of p.owners) {
    const id = ownerId2.get(o.key)!;
    const lastCall = [...o.events].reverse().find(e => e.type === 'call')?.at ?? null;
    await sql`UPDATE crm_owners SET stage = ${o.stage}, callback_at = ${o.callbackAt ?? null}, callback_note = ${o.callbackNote ?? null},
                rejection_reason = ${o.rejection ?? null}, last_call_at = ${lastCall}, created_at = ${o.createdAt},
                updated_at = ${o.events.length ? o.events[o.events.length - 1].at : o.createdAt}
              WHERE id = ${id} AND tenant_id = ${SLUG}`;
  }
  // The hand-out happened the morning after the list came in (11:00 + 23h).
  await sql`UPDATE crm_timeline_events e SET timestamp = o.created_at + interval '23 hours'
            FROM crm_owners o WHERE e.tenant_id = ${SLUG} AND o.tenant_id = ${SLUG} AND e.record_id = o.id AND e.type = 'assignment'`;
  step(`${callRows.length} on the calling list, ${p.owners.filter(o => !o.assign).length} with nobody on them`);

  // 4. Leads, arriving the way a portal enquiry does.
  const leadId = new Map<string, string>();
  await pool(p.leads, 3, async (l) => {
    const agent = l.agent!;
    const lead = await as(null, () => createLead({
      name: l.name, phone: l.phone, source: l.source, stage: l.stage, agentId: idOf(agent), req: l.req, receivedAt: l.createdAt.toISOString(),
    }, { actorType: 'system' }));
    leadId.set(l.key, lead.id);
    await sql`UPDATE crm_leads SET follow_up = ${l.followUp ? sql.json({ ...l.followUp, agentId: idOf(agent) }) : null}, overdue = ${!!l.overdue},
                rejection_reason = ${l.rejection ?? null}, updated_at = ${l.events.length ? l.events[l.events.length - 1].at : l.createdAt}
              WHERE id = ${lead.id} AND tenant_id = ${SLUG}`;
  });
  await sql`UPDATE crm_timeline_events e SET timestamp = l.created_at
            FROM crm_leads l WHERE e.tenant_id = ${SLUG} AND l.tenant_id = ${SLUG} AND e.record_id = l.id AND e.type = 'creation'`;
  step(`${leadId.size} leads`);

  // 5. The history of every lead and owner, in one batch.
  let n = 0;
  const rows: any[] = [];
  const push = (recordId: string, e: EventPlan) => rows.push({
    id: `evt_dm_${NOW}_${n++}`, tenant_id: SLUG, record_id: recordId, type: e.type, title: e.title, description: e.description,
    author: e.author === 'System' ? 'System' : idOf(e.author), timestamp: e.at, metadata: sql.json(e.metadata || {}),
  });
  for (const l of p.leads) for (const e of l.events) push(leadId.get(l.key)!, e);
  for (const o of p.owners) for (const e of o.events) push(ownerId2.get(o.key)!, e);
  for (let i = 0; i < rows.length; i += 500) {
    await sql`INSERT INTO crm_timeline_events ${sql(rows.slice(i, i + 500), 'id', 'tenant_id', 'record_id', 'type', 'title', 'description', 'author', 'timestamp', 'metadata')}`;
  }
  step(`${rows.length} history events`);

  // 6. Site visits, with a location near the place they went to see.
  let visits = 0;
  for (const l of p.leads.filter(x => x.visit)) {
    const unit = p.units.find(u => u.kind === l.lane || (l.lane === 'office' && u.kind === 'shop')) || p.units[0];
    const g = near(locOf(l.req.locality || unit.locality));
    await sql`INSERT INTO activities (id, tenant_id, lead_id, property_id, type, at, agent_id, remark, outcome, geo_lat, geo_lng, geo_accuracy, metadata, created_at)
              VALUES (${`act_dm_${NOW}_${visits++}`}, ${SLUG}, ${leadId.get(l.key)}, ${unitId.get(unit.key) ?? null}, 'site_visit', ${l.visit!.at},
                      ${idOf(l.agent!)}, ${l.visit!.remark}, 'interested', ${g.lat}, ${g.lng}, ${int(8, 25)}, ${sql.json({})}, ${l.visit!.at})`;
  }
  step(`${visits} site visits`);

  // 7. Deals closed, through the agreement service. A few rents end soon:
  //    that is the "Ending in 30 days" moment of the pitch.
  const closing = p.leads.filter(l => l.close);
  const taken = new Set<string>();
  let ends = 0, deals = 0;
  for (const l of closing) {
    const kind = l.close!.kind;
    const fit = p.units.find(u => !taken.has(u.key) && u.deal === kind && u.data.status === 'Available'
      && (u.kind === l.lane || (l.lane === 'office' && u.kind === 'shop')));
    if (!fit) continue;
    taken.add(fit.key);
    const soon = kind === 'rent' && ends < 4;
    const end = soon ? new Date(NOW + int(9, 26) * DAY) : new Date(NOW + int(90, 300) * DAY);
    const start = kind === 'rent' ? new Date(end.getTime() - (P.lease?.days ?? 334) * DAY) : l.close!.at;
    const agent = l.agent!;
    try {
      await as(agent, () => createAgreement({
        kind, leadId: leadId.get(l.key), propertyId: unitId.get(fit.key), amount: fit.price,
        deposit: kind === 'rent' ? fit.price * Number(fit.data.depositOption || 3) : undefined,
        startDate: start.toISOString().slice(0, 10), endDate: kind === 'rent' ? end.toISOString().slice(0, 10) : undefined,
      }, ctxOf(agent)));
      if (soon) ends++;
      deals++;
      // The service wrote these now; they happened when the deal closed.
      const when = soon ? new Date(start.getTime() + int(0, 3) * DAY) : l.close!.at;
      const closedAt = new Date(Math.min(when.getTime(), NOW - DAY));
      await sql`UPDATE crm_timeline_events SET timestamp = ${closedAt}
                WHERE tenant_id = ${SLUG} AND record_id IN (${leadId.get(l.key)!}, ${unitId.get(fit.key)!}) AND timestamp > ${new Date(t0)}`;
      await sql`UPDATE crm_agreements SET created_at = ${closedAt} WHERE tenant_id = ${SLUG} AND lead_id = ${leadId.get(l.key)!}`;
      await sql`UPDATE crm_leads SET updated_at = ${closedAt}, follow_up = NULL, overdue = FALSE WHERE tenant_id = ${SLUG} AND id = ${leadId.get(l.key)!}`;
    } catch (e: any) { console.warn(`  (a deal for ${l.name} was not recorded: ${e.message})`); }
  }
  step(`${deals} deals closed, ${ends} rents ending within a month`);

  // 8. Listings and their first line of history, back to when they were added.
  // Two statements, not two per listing: on a far-away database every round
  // trip is another chance for the connection to drop halfway.
  const added = p.units.filter(u => unitId.has(u.key)).map(u => [unitId.get(u.key)!, u.createdAt.toISOString()]);
  await sql`UPDATE crm_properties p SET created_at = v.t::timestamptz, updated_at = v.t::timestamptz
            FROM (VALUES ${sql(added)}) AS v(id, t) WHERE p.id = v.id AND p.tenant_id = ${SLUG}`;
  await sql`UPDATE crm_timeline_events e SET timestamp = p.created_at FROM crm_properties p
            WHERE e.tenant_id = ${SLUG} AND p.tenant_id = ${SLUG} AND e.record_id = p.id AND e.type = 'creation'`;
  // The owner records the listings created. These people already gave us their
  // space, so they are past the calling funnel: Key Received, with the agent
  // who listed it, handed over through the same path a desk uses.
  for (const a of AGENTS) {
    const ids = (await sql`SELECT o.id FROM crm_owners o JOIN crm_properties p ON p.owner_contact_id = o.id AND p.tenant_id = o.tenant_id
                           WHERE o.tenant_id = ${SLUG} AND p.created_by = ${idOf(a.name)} AND o.agent_id IS DISTINCT FROM ${idOf(a.name)}`).map((r: any) => r.id);
    if (ids.length) await as(owner.name, () => bulkAssignOwners(ids, idOf(a.name), ctxOf(owner.name)));
  }
  const listed: any[] = await sql`
    UPDATE crm_owners o SET stage = 'Key Received', created_at = p.created_at, updated_at = p.created_at
      FROM crm_properties p
     WHERE o.tenant_id = ${SLUG} AND p.tenant_id = ${SLUG} AND p.owner_contact_id = o.id
    RETURNING o.id, o.agent_id, p.created_at`;
  await sql`UPDATE crm_timeline_events e SET timestamp = o.created_at + interval '1 hour'
              FROM crm_owners o, crm_properties p
             WHERE e.tenant_id = ${SLUG} AND o.tenant_id = ${SLUG} AND p.tenant_id = ${SLUG}
               AND p.owner_contact_id = o.id AND e.record_id = o.id AND e.timestamp > ${new Date(t0)}`;
  // Somebody spoke to each of them before the space was listed.
  const keyRows = listed.flatMap((r, i) => {
    const listedAt = new Date(r.created_at).getTime();
    const called = working(new Date(listedAt - int(1, 3) * DAY)) ?? new Date(listedAt - DAY);
    return [{
      id: `evt_dmc_${NOW}_${i}`, tenant_id: SLUG, record_id: r.id, type: 'call', title: 'Call',
      description: pick(P.phrases?.owner || ['spoke to owner']), author: r.agent_id || 'System', timestamp: called,
      metadata: sql.json({ outcome: 'discussed', edited: true }),
    }, {
      id: `evt_dmk_${NOW}_${i}`, tenant_id: SLUG, record_id: r.id, type: 'stage_change', title: 'Stage → Key Received',
      description: 'Marked Key Received', author: r.agent_id || 'System', timestamp: new Date(listedAt + 30 * 60_000),
      metadata: sql.json({ from: 'New', to: 'Key Received' }),
    }];
  });
  for (let i = 0; i < keyRows.length; i += 500) {
    await sql`INSERT INTO crm_timeline_events ${sql(keyRows.slice(i, i + 500), 'id', 'tenant_id', 'record_id', 'type', 'title', 'description', 'author', 'timestamp', 'metadata')}`;
  }
  await sql`UPDATE crm_owners o SET last_call_at = e.timestamp FROM crm_timeline_events e
            WHERE o.tenant_id = ${SLUG} AND e.tenant_id = ${SLUG} AND e.record_id = o.id AND e.id LIKE ${`evt_dmc_${NOW}_%`}`;
  step(`${listed.length} listing owners moved to Key Received`);

  // 9. A real connection for the live-enquiry moment, with its field mapping:
  // without one the parser stores an enquiry as pending and no lead appears
  // (scripts/demo-enquiry.ts sends exactly these fields).
  const site = await createIntegration(SLUG, 'Website', ownerId);
  await setParserConfig(SLUG, site.integration.id, { map: { name: 'name', phone: 'phone', 'req.notes': 'message', 'req.locality': 'area', 'req.config': 'bedrooms', 'req.maxBudget': 'budget', 'req.deal': 'looking_to' }, defaults: { source: 'Website' } });

  // 10. The alerts the build itself raised are not news to anyone.
  await new Promise(r => setTimeout(r, 2500));
  await sql`DELETE FROM notifications WHERE tenant_id = ${SLUG}`;

  // What is left stamped "now" that should not be: reported, not hidden.
  const [stray] = await sql`SELECT count(*)::int n FROM crm_timeline_events WHERE tenant_id = ${SLUG} AND timestamp > ${new Date(t0)}`;
  step(`done${stray.n ? `; ${stray.n} history rows still carry the build time` : ''}`);

  console.log(`\n✓ ${P.firm.name} at /${SLUG}. Everyone signs in with ${PASSWORD}:`);
  for (const u of users.sort((a, b) => (a.role > b.role ? -1 : 1))) console.log(`    ${u.login_id.padEnd(12)} ${u.name} (${u.role})`);
  console.log(`  Send a live enquiry: npx tsx backend/src/scripts/demo-enquiry.ts --firm=${SLUG} --owner=${users.find(u => u.role === 'owner')?.login_id}`);
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
