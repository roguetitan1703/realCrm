/**
 * ============================================================================
 * WHAT A FIRM PAYS DELPAT (docs/specs/billing.md)
 * ============================================================================
 * The one place that reads and writes a firm's subscription and says where it
 * stands. Delpat writes (routes/admin.ts, superadmin only); the firm reads its
 * own (routes/workspace.ts) and every signed-in person gets the notice on boot
 * and pulse, shaped by role here.
 *
 * Status is derived from the dates, never stored, on Delpat's clock:
 *   overdue   today is after due_on
 *   due_soon  notify_days_before > 0 and today is within that many days of due_on
 *   paid      otherwise
 * A firm with no row has no status at all: unknown is not overdue.
 * ============================================================================
 */
import { randomUUID } from 'crypto';
import { sql } from './db.js';
import { getContext } from './context.js';
import { isDeskRole } from '../lib/permissions.js';

export const CYCLES = ['monthly', 'quarterly', 'yearly'] as const;
export type Cycle = typeof CYCLES[number];
const CYCLE_INTERVAL: Record<Cycle, string> = { monthly: '1 month', quarterly: '3 months', yearly: '1 year' };

/** Delpat bills in India; "today" for a due date is Delpat's today. */
const BILLING_TZ = 'Asia/Kolkata';
const today = sql`(now() AT TIME ZONE ${BILLING_TZ})::date`;

const COLUMNS = sql`
  tenant_id, plan_name, amount::float8 AS amount, cycle,
  to_char(due_on, 'YYYY-MM-DD') AS due_on,
  to_char(paid_through, 'YYYY-MM-DD') AS paid_through,
  notify_days_before, updated_at,
  CASE WHEN ${today} > due_on THEN 'overdue'
       WHEN notify_days_before > 0 AND ${today} >= due_on - notify_days_before THEN 'due_soon'
       ELSE 'paid' END AS status`;

export async function readSubscription(tenantId: string): Promise<any | null> {
  const [row] = await sql`SELECT ${COLUMNS} FROM tenant_billing WHERE tenant_id = ${tenantId}`;
  return row || null;
}

/** Every firm's subscription, for the console's list of firms. */
export async function allSubscriptions(): Promise<Map<string, any>> {
  const rows = await sql`SELECT ${COLUMNS} FROM tenant_billing`;
  return new Map((rows as any[]).map(r => [r.tenant_id, r]));
}

export async function listPayments(tenantId: string, limit = 200, withNotes = true): Promise<any[]> {
  return await sql`
    SELECT id, to_char(paid_on, 'YYYY-MM-DD') AS paid_on, amount::float8 AS amount,
           ${withNotes ? sql`note, recorded_by,` : sql``}
           to_char(period_from, 'YYYY-MM-DD') AS period_from, to_char(period_to, 'YYYY-MM-DD') AS period_to, created_at
      FROM tenant_billing_payments WHERE tenant_id = ${tenantId}
     ORDER BY paid_on DESC, created_at DESC LIMIT ${limit}`;
}

/**
 * The notice on boot and pulse, for the signed-in person's own firm. The
 * tenant and role are the token's (request context), never a parameter.
 *   no row                  null, for everyone
 *   owner / manager         status, plan, amount, cycle, due date, and `show`
 *   anyone else             { status: 'overdue', show: true } when overdue, else null
 */
export async function billingNotice(): Promise<any | null> {
  const ctx = getContext();
  if (!ctx?.tenantId || !ctx.userId) return null;
  const s = await readSubscription(ctx.tenantId);
  if (!s) return null;
  if (isDeskRole(ctx.role)) {
    return {
      status: s.status, plan: s.plan_name, amount: s.amount, cycle: s.cycle, due_on: s.due_on,
      show: s.status === 'overdue' || s.status === 'due_soon',
    };
  }
  return s.status === 'overdue' ? { status: 'overdue', show: true } : null;
}

export type SubscriptionInput = {
  plan_name: string; amount: number; cycle: Cycle; due_on: string;
  paid_through: string | null; notify_days_before: number;
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const isDate = (v: any) => typeof v === 'string' && DATE_RE.test(v) && !Number.isNaN(Date.parse(v));
const isAmount = (v: any) => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v < 1e10;

/** Every field the console sends, checked. A sent body is the whole subscription. */
export function parseSubscription(b: any): { ok: true; value: SubscriptionInput } | { ok: false; error: string } {
  const plan = typeof b?.plan_name === 'string' ? b.plan_name.trim() : '';
  if (!plan || plan.length > 80) return { ok: false, error: 'Plan name is required' };
  const amount = Number(b?.amount);
  if (b?.amount === '' || b?.amount == null || !isAmount(amount)) return { ok: false, error: 'Amount must be a number of rupees' };
  if (!CYCLES.includes(b?.cycle)) return { ok: false, error: 'Billing cycle must be monthly, quarterly or yearly' };
  if (!isDate(b?.due_on)) return { ok: false, error: 'Due date is required' };
  const paid = b?.paid_through == null || b.paid_through === '' ? null : b.paid_through;
  if (paid !== null && !isDate(paid)) return { ok: false, error: 'Paid through must be a date' };
  // Paid through is the end of the last paid period; the due date starts the next.
  if (paid !== null && paid >= b.due_on) return { ok: false, error: 'Paid through must be before the due date' };
  const days = b?.notify_days_before == null || b.notify_days_before === '' ? 0 : Number(b.notify_days_before);
  if (!Number.isInteger(days) || days < 0 || days > 60) return { ok: false, error: 'Days before must be 0 to 60' };
  return { ok: true, value: { plan_name: plan, amount, cycle: b.cycle, due_on: b.due_on, paid_through: paid, notify_days_before: days } };
}

/** Create or replace a firm's subscription. Returns the row before and after. */
export async function saveSubscription(tenantId: string, v: SubscriptionInput, by: string) {
  return await sql.begin(async (tx: any) => {
    const [before] = await tx`SELECT plan_name, amount::float8 AS amount, cycle, to_char(due_on, 'YYYY-MM-DD') AS due_on,
        to_char(paid_through, 'YYYY-MM-DD') AS paid_through, notify_days_before
      FROM tenant_billing WHERE tenant_id = ${tenantId} FOR UPDATE`;
    await tx`
      INSERT INTO tenant_billing (tenant_id, plan_name, amount, cycle, due_on, paid_through, notify_days_before, updated_by)
      VALUES (${tenantId}, ${v.plan_name}, ${v.amount}, ${v.cycle}, ${v.due_on}, ${v.paid_through}, ${v.notify_days_before}, ${by})
      ON CONFLICT (tenant_id) DO UPDATE SET plan_name = EXCLUDED.plan_name, amount = EXCLUDED.amount, cycle = EXCLUDED.cycle,
        due_on = EXCLUDED.due_on, paid_through = EXCLUDED.paid_through, notify_days_before = EXCLUDED.notify_days_before,
        updated_by = EXCLUDED.updated_by, updated_at = NOW()`;
    return { before: before || null, after: v };
  });
}

export type PaymentResult =
  | { ok: true; payment: any; due_on: string; paid_through: string }
  | { ok: false; status: 404 | 409; error: string };

/**
 * Mark paid: record the payment and roll the period on by one cycle. The
 * payment covers due_on .. due_on + cycle - 1 day. `expectDueOn` is the due
 * date the console was showing; if it has moved (a double click, a second tab)
 * nothing is written.
 */
export async function recordPayment(tenantId: string, p: { expectDueOn: string; paidOn: string; amount: number; note: string | null }, by: string): Promise<PaymentResult> {
  return await sql.begin(async (tx: any) => {
    const [s] = await tx`SELECT cycle, to_char(due_on, 'YYYY-MM-DD') AS due_on FROM tenant_billing WHERE tenant_id = ${tenantId} FOR UPDATE`;
    if (!s) return { ok: false, status: 404, error: 'This firm has no subscription' } as const;
    if (s.due_on !== p.expectDueOn) return { ok: false, status: 409, error: 'The due date has changed. Reload and try again.' } as const;
    const step = CYCLE_INTERVAL[s.cycle as Cycle];
    const [roll] = await tx`
      SELECT to_char((due_on + ${step}::interval)::date, 'YYYY-MM-DD') AS next_due,
             to_char((due_on + ${step}::interval)::date - 1, 'YYYY-MM-DD') AS period_to
        FROM tenant_billing WHERE tenant_id = ${tenantId}`;
    const id = `pay_${randomUUID()}`;
    const [payment] = await tx`
      INSERT INTO tenant_billing_payments (id, tenant_id, paid_on, amount, note, period_from, period_to, recorded_by)
      VALUES (${id}, ${tenantId}, ${p.paidOn}, ${p.amount}, ${p.note}, ${s.due_on}, ${roll.period_to}, ${by})
      RETURNING id, to_char(paid_on, 'YYYY-MM-DD') AS paid_on, amount::float8 AS amount, note,
                to_char(period_from, 'YYYY-MM-DD') AS period_from, to_char(period_to, 'YYYY-MM-DD') AS period_to`;
    await tx`UPDATE tenant_billing SET due_on = ${roll.next_due}, paid_through = ${roll.period_to}, updated_by = ${by}, updated_at = NOW()
              WHERE tenant_id = ${tenantId}`;
    return { ok: true, payment, due_on: roll.next_due, paid_through: roll.period_to } as const;
  });
}

export function parsePayment(b: any): { ok: true; value: { expectDueOn: string; paidOn: string; amount: number; note: string | null } } | { ok: false; error: string } {
  if (!isDate(b?.due_on)) return { ok: false, error: 'The due date being paid is required' };
  if (!isDate(b?.paid_on)) return { ok: false, error: 'Paid on must be a date' };
  const amount = Number(b?.amount);
  if (b?.amount === '' || b?.amount == null || !isAmount(amount)) return { ok: false, error: 'Amount must be a number of rupees' };
  const note = typeof b?.note === 'string' && b.note.trim() ? b.note.trim().slice(0, 500) : null;
  return { ok: true, value: { expectDueOn: b.due_on, paidOn: b.paid_on, amount, note } };
}
