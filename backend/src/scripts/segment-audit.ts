/**
 * ============================================================================
 * WHAT EVERY SEGMENT COUNTS, TODAY AND UNDER THE NEW CONTACT RULE
 * ============================================================================
 * WHEN TO RUN THIS: before and after changing what "contacted" means, and any
 * time somebody asks whether a number on the desk is true.
 *
 *   npx tsx backend/src/scripts/segment-audit.ts                 # every tenant
 *   npx tsx backend/src/scripts/segment-audit.ts --tenant=bhumi
 *
 * READ-ONLY. It opens one connection, runs SELECTs, and prints. There is no
 * write path in this file at all — which is the only reason it is safe to point
 * at production, and it is pointed at production on purpose: the counts that
 * matter are facts about the client's desk, and any copy makes them facts about
 * a copy.
 *
 * It prints the OLD and NEW definitions side by side because the interesting
 * number is the difference. "Never contacted" reads 74 on bhumi while 26 of
 * those carry remarks proving somebody spoke to them — the old rule counts only
 * call/whatsapp/sms/email and a remark is not one of them. This is the script
 * that says how many leads move, per tenant, before anyone changes code.
 * ============================================================================
 */
import postgres from 'postgres';
import { databaseUrl, dbRef, appEnv } from '../services/env.js';

const arg = (k: string) => process.argv.find(a => a.startsWith(`--${k}=`))?.split('=')[1];
const only = arg('tenant');

const url = databaseUrl();
if (!url) { console.error('No database URL resolved.'); process.exit(1); }
const sql = postgres(url, { max: 1, ssl: 'require' });
console.log(`\nenvironment ${appEnv()} · database ${dbRef(url)}${only ? ` · tenant ${only}` : ''}\n`);

/** Today's rule: only these four event types, plus three activity types. */
const CONTACT_OLD = sql`(
  EXISTS (SELECT 1 FROM crm_timeline_events e
           WHERE e.record_id = l.id AND e.tenant_id = l.tenant_id
             AND e.type IN ('call','whatsapp','sms','email'))
  OR EXISTS (SELECT 1 FROM activities a
              WHERE a.lead_id = l.id AND a.tenant_id = l.tenant_id
                AND a.type IN ('call','meeting','site_visit'))
)`;

/**
 * The new rule: anything a PERSON did. Remarks and stage changes are contact —
 * moving a lead to "Call Not Received" means somebody rang it.
 *
 * `author <> 'System'` is the whole guard. Lead creation, the status mirror and
 * the re-enquiry events are all written by System; if those counted, every lead
 * would be contacted the moment it arrived and the segment would mean nothing.
 */
const CONTACT_NEW = sql`(
  EXISTS (SELECT 1 FROM crm_timeline_events e
           WHERE e.record_id = l.id AND e.tenant_id = l.tenant_id
             AND coalesce(e.author, 'System') <> 'System'
             AND e.type IN ('call','whatsapp','sms','email','remark','note','stage_change'))
  OR EXISTS (SELECT 1 FROM activities a
              WHERE a.lead_id = l.id AND a.tenant_id = l.tenant_id
                AND a.type IN ('call','meeting','site_visit'))
)`;

const tenants = only
  ? await sql`SELECT id FROM tenants WHERE id = ${only} OR slug = ${only}`
  : await sql`SELECT id FROM tenants ORDER BY id`;

if (!tenants.length) { console.error(`No tenant matched "${only}".`); await sql.end(); process.exit(1); }

for (const { id: t } of tenants) {
  const [r] = await sql`
    SELECT
      count(*)::int                                         AS total,
      count(*) FILTER (WHERE NOT ${CONTACT_OLD})::int        AS not_contacted_old,
      count(*) FILTER (WHERE NOT ${CONTACT_NEW})::int        AS not_contacted_new,
      -- The gap, named: leads the old rule calls untouched that a person has
      -- demonstrably worked. This is the number that was wrong on the desk.
      count(*) FILTER (WHERE NOT ${CONTACT_OLD} AND ${CONTACT_NEW})::int AS moves,
      count(*) FILTER (WHERE stage = 'Call Not Received')::int AS no_answer_stage,
      count(*) FILTER (WHERE follow_up->>'at' IS NOT NULL
                         AND (follow_up->>'at')::timestamptz < NOW())::int AS followup_overdue,
      count(*) FILTER (WHERE (SELECT count(*) FROM crm_lead_enquiries q
                               WHERE q.tenant_id = l.tenant_id AND q.lead_id = l.id) > 1)::int AS came_back
    FROM crm_leads l WHERE l.tenant_id = ${t}`;

  if (!r.total) continue;

  // GOING COLD, at each N worth arguing about. Open means not rejected and not
  // closed — a rejected lead owes nobody a call, so it cannot go cold.
  const cold: Record<string, number> = {};
  for (const days of [2, 3, 7, 14]) {
    const [c] = await sql`
      SELECT count(*)::int AS n FROM crm_leads l
       WHERE l.tenant_id = ${t}
         AND coalesce(l.stage,'') NOT IN ('Rejected','Deal Closed')
         AND NOT EXISTS (SELECT 1 FROM crm_timeline_events e
                          WHERE e.record_id = l.id AND e.tenant_id = l.tenant_id
                            AND coalesce(e.author,'System') <> 'System'
                            AND e.timestamp > now() - (${days}::text || ' days')::interval)`;
    cold[`${days}d`] = c.n;
  }

  console.log(`── ${t} · ${r.total} leads`);
  console.table([{
    'not contacted (old)': r.not_contacted_old,
    'not contacted (new)': r.not_contacted_new,
    'move to contacted':   r.moves,
    'no answer (stage)':   r.no_answer_stage,
    'follow-up overdue':   r.followup_overdue,
    'came back':           r.came_back,
  }]);
  console.log('  going cold:', Object.entries(cold).map(([k, v]) => `${k} ${v}`).join('  ·  '), '\n');
}

await sql.end();
