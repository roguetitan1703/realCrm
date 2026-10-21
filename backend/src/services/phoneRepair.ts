/**
 * THE ONE-TIME PHONE REPAIR (docs/specs/phone.md): every stored phone to exact
 * E.164, read in its firm's country. Shared by the repair (initSchema →
 * migratePhones) and the read-only dry run (scripts/phone-dry-run.ts), so the
 * report and the write cannot disagree about a row.
 *
 * Takes a query function rather than importing db.ts, so the dry run can use
 * its own read-only connection without running initSchema.
 */
import { readPhone } from '../../../src/lib/phone.js';

export type PhoneRow = { tenant_id: string; id: string; raw: string | null; extra?: string };
export type PhoneTable = {
  name: string;
  /** Users carry a unique (tenant_id, phone) index: a collision there stops the repair. */
  unique?: boolean;
  read: (q: any) => Promise<PhoneRow[]>;
  /** Write one conversion, only if the row still holds what was read. Returns rows changed. */
  write: (q: any, r: { tenant_id: string; id: string; from: string; to: string }) => Promise<number>;
};

const count = (res: any) => Number(res?.count ?? (Array.isArray(res) ? res.length : 0));

export const PHONE_TABLES: PhoneTable[] = [
  {
    name: 'users.phone', unique: true,
    read: q => q`SELECT tenant_id, id, phone AS raw, CASE WHEN deleted_at IS NOT NULL THEN 'deleted' ELSE status END AS extra FROM users`,
    write: async (q, r) => count(await q`UPDATE users SET phone = ${r.to} WHERE tenant_id = ${r.tenant_id} AND id = ${r.id} AND phone = ${r.from}`),
  },
  {
    name: 'users.metadata.phone',
    read: q => q`SELECT tenant_id, id, metadata->>'phone' AS raw FROM users WHERE metadata ? 'phone'`,
    write: async (q, r) => count(await q`UPDATE users SET metadata = jsonb_set(metadata, '{phone}', to_jsonb(${r.to}::text))
      WHERE tenant_id = ${r.tenant_id} AND id = ${r.id} AND metadata->>'phone' = ${r.from}`),
  },
  {
    name: 'crm_agents.metadata.phone',
    read: q => q`SELECT tenant_id, id, metadata->>'phone' AS raw FROM crm_agents WHERE metadata ? 'phone'`,
    write: async (q, r) => count(await q`UPDATE crm_agents SET metadata = jsonb_set(metadata, '{phone}', to_jsonb(${r.to}::text))
      WHERE tenant_id = ${r.tenant_id} AND id = ${r.id} AND metadata->>'phone' = ${r.from}`),
  },
  {
    name: 'crm_leads.phone',
    read: q => q`SELECT tenant_id, id, phone AS raw FROM crm_leads`,
    write: async (q, r) => count(await q`UPDATE crm_leads SET phone = ${r.to} WHERE tenant_id = ${r.tenant_id} AND id = ${r.id} AND phone = ${r.from}`),
  },
  {
    name: 'crm_owners.phone',
    read: q => q`SELECT tenant_id, id, phone AS raw FROM crm_owners`,
    write: async (q, r) => count(await q`UPDATE crm_owners SET phone = ${r.to} WHERE tenant_id = ${r.tenant_id} AND id = ${r.id} AND phone = ${r.from}`),
  },
  {
    name: 'crm_properties.owner_phone',
    read: q => q`SELECT tenant_id, id, owner_phone AS raw FROM crm_properties`,
    write: async (q, r) => count(await q`UPDATE crm_properties SET owner_phone = ${r.to} WHERE tenant_id = ${r.tenant_id} AND id = ${r.id} AND owner_phone = ${r.from}`),
  },
  {
    name: 'crm_agreements.party_phone',
    read: q => q`SELECT tenant_id, id, party_phone AS raw FROM crm_agreements`,
    write: async (q, r) => count(await q`UPDATE crm_agreements SET party_phone = ${r.to} WHERE tenant_id = ${r.tenant_id} AND id = ${r.id} AND party_phone = ${r.from}`),
  },
  {
    name: 'settings.replyToPhone',
    read: q => q`SELECT tenant_id, key AS id, value->'sharing'->>'replyToPhone' AS raw FROM crm_settings WHERE key = 'default'`,
    write: async (q, r) => count(await q`UPDATE crm_settings SET value = jsonb_set(value, '{sharing,replyToPhone}', to_jsonb(${r.to}::text))
      WHERE tenant_id = ${r.tenant_id} AND key = 'default' AND value->'sharing'->>'replyToPhone' = ${r.from}`),
  },
];

/** Each firm's country (crm_settings 'default' value.locale.country), India when unset. */
export async function firmCountries(q: any): Promise<Map<string, string>> {
  const rows = await q`SELECT tenant_id, value->'locale'->>'country' AS country FROM crm_settings WHERE key = 'default'`;
  return new Map((rows as any[]).map(s => [s.tenant_id, String(s.country || 'IN').toUpperCase()]));
}

export type RowVerdict =
  | { kind: 'empty' }
  | { kind: 'same'; e164: string; foreign: boolean }
  | { kind: 'convert'; e164: string; foreign: boolean }
  | { kind: 'unreadable'; reason: string };

/** What the repair does with one stored value. */
export function verdict(raw: string | null, country: string): RowVerdict {
  const s = String(raw ?? '').trim();
  if (!s) return { kind: 'empty' };
  const p = readPhone(s, country, { received: true });
  if (!p.ok) return { kind: 'unreadable', reason: p.reason };
  const foreign = p.country !== country;
  return s === p.e164 ? { kind: 'same', e164: p.e164, foreign } : { kind: 'convert', e164: p.e164, foreign };
}

export type PhonePlan = {
  converts: { table: PhoneTable; tenant_id: string; id: string; from: string; to: string }[];
  unreadable: { table: string; tenant_id: string; id: string; raw: string; reason: string }[];
  /** Users who would share one number after the repair: their numbers are held back. */
  userCollisions: { tenant_id: string; e164: string; ids: string[] }[];
  /** Leads and owners that would share a number BECAUSE of the repair: both kept, nothing merged. */
  otherCollisions: { table: string; tenant_id: string; e164: string; ids: string[] }[];
};

export async function planPhones(q: any, onlyTenant?: string): Promise<PhonePlan> {
  const countries = await firmCountries(q);
  const plan: PhonePlan = { converts: [], unreadable: [], userCollisions: [], otherCollisions: [] };
  for (const table of PHONE_TABLES) {
    const rows = ((await table.read(q)) as PhoneRow[]).filter(r => !onlyTenant || r.tenant_id === onlyTenant);
    const groups = new Map<string, { id: string; converted: boolean }[]>();
    for (const r of rows) {
      const v = verdict(r.raw, countries.get(r.tenant_id) || 'IN');
      if (v.kind === 'empty') continue;
      if (v.kind === 'unreadable') { plan.unreadable.push({ table: table.name, tenant_id: r.tenant_id, id: r.id, raw: String(r.raw), reason: v.reason }); continue; }
      if (v.kind === 'convert') plan.converts.push({ table, tenant_id: r.tenant_id, id: r.id, from: String(r.raw), to: v.e164 });
      const key = `${r.tenant_id}\u0000${v.e164}`;
      groups.set(key, [...(groups.get(key) || []), { id: r.id, converted: v.kind === 'convert' }]);
    }
    if (!['users.phone', 'crm_leads.phone', 'crm_owners.phone'].includes(table.name)) continue;
    for (const [key, g] of groups) {
      if (g.length < 2 || !g.some(x => x.converted)) continue;
      const [tenant_id, e164] = key.split('\u0000');
      if (table.unique) plan.userCollisions.push({ tenant_id, e164, ids: g.map(x => x.id) });
      else plan.otherCollisions.push({ table: table.name, tenant_id, e164, ids: g.map(x => x.id) });
    }
  }
  return plan;
}
