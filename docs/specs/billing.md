# Billing — what a firm pays Delpat, and the bar that says it is late

**Status:** 🏗️ building (branch `a-billing`, 1 Nov).

Om, 1 Nov: "a payment pending screen that comes as a top bar … add subscription
details, plan recurring, so that it can be shown to the clients." Then:
"payment bar everyone, agent should be told to ask their manager or owner."

**Who it is for.** Delpat, in the console, recording what each firm owes and
has paid. The firm's owner or manager, at a desk or on a phone, seeing that a
payment is late and what it is for. An agent, told only that it is late and who
can fix it.

## 1. Decisions

1. **Delpat writes, the firm reads.** Only the superadmin console writes a
   subscription or a payment. A firm sees its own, read only; an agent sees no
   amount and no plan.
2. **No row, nothing anywhere.** A firm with no subscription row has no bar, no
   Billing section and no status in the console beyond "Not set up". Absence is
   never read as overdue (CLAUDE.md §3.1).
3. **`tenants.subscription_plan` / `subscription_status` are not billing.** Every
   firm carries the column defaults (`PRO` / `ACTIVE`); they record nothing.
   The console header stops printing them. `subscription_status` stays what it
   is today, the "workspace inactive" switch in `middleware/auth.ts`; billing
   never flips it. The bar does not block work.
4. **Status is derived, never stored**, in one place (`services/billing.ts`),
   on Delpat's clock (Asia/Kolkata):
   - `overdue` — today is after `due_on`
   - `due_soon` — `notify_days_before > 0` and today is within that many days of `due_on`
   - `paid` — otherwise
5. **Mark paid rolls one period.** The payment covers `due_on` to
   `due_on + cycle − 1 day`: `paid_through` becomes that end, `due_on` moves on
   by one cycle. Two periods behind needs two payments. The request names the
   `due_on` it is paying, so a double click cannot roll twice (409).
   Month arithmetic is Postgres's: a 31 Jan due date becomes 28 Feb, then 28 Mar;
   Delpat edits the due date if that matters.
6. **Payments are append-only.** No edit, no delete; a mistake is corrected by
   editing the subscription's dates, and both are in the firm's ledger.
7. **Who sees the bar.** Overdue: everyone signed in. Due soon (only when the
   console sets days before): owner and manager only; an agent cannot act on it
   and a bar they cannot act on is noise.
8. **Wording** (labels and values only, §5):
   - owner/manager, overdue: `Payment pending since 3 Nov · ₹12,000 · Growth` — tap opens Settings → Billing
   - owner/manager, due soon: `Payment due 3 Nov · ₹12,000 · Growth`
   - agent: `Payment pending · ask your manager or owner`
9. **Dismiss for the browser session.** × hides it until the tab or app is
   closed (sessionStorage, keyed by firm and due date, so the next period shows
   again). It cannot be turned off for good.
10. **No new polling.** The notice rides on `/workspace/bootstrap` and
    `/workspace/pulse`; Mark paid clears the bar on the next pulse (≤ 60 s).
    Public catalogue and share pages never mount the app shell, so never show it.
11. **Payment notes are Delpat's.** The firm's Billing section shows dates and
    amounts; the note (a UTR, "cash to Om") stays in the console.

## 2. Data model

```
tenant_billing            one row per firm that has a subscription
  tenant_id PK, plan_name, amount NUMERIC(12,2), cycle monthly|quarterly|yearly,
  due_on DATE, paid_through DATE NULL, notify_days_before INT 0–60,
  created_at, updated_at, updated_by
tenant_billing_payments   one row per payment recorded
  id, tenant_id, paid_on, amount, note, period_from, period_to, recorded_by, created_at
```

Created in `initSchema()` (`createBillingTables`), `IF NOT EXISTS` DDL only: no
row is rewritten, so there is nothing for a `runOnce` gate to protect. Both
tables are in `devData.ts` SKIP_TABLES — `dev:refresh` must not move a due date.
Rollback: drop the two tables; nothing else reads them.

## 3. API

| Route | Who | What |
|---|---|---|
| `GET /admin/firms/:id/billing` | superadmin | subscription + status + every payment |
| `PUT /admin/firms/:id/billing` | superadmin | create or edit; ledger `billing.set` with before/after |
| `POST /admin/firms/:id/billing/payments` | superadmin | `{ due_on, paid_on, amount, note }`; ledger `billing.payment` |
| `GET /workspace/billing` | owner, manager | own firm's subscription + last 12 payments, no notes |
| `billing` on `/workspace/bootstrap` and `/workspace/pulse` | signed in | the notice, shaped by role |

The notice is `null` with no row. For a desk role it is
`{ status, plan, amount, cycle, due_on, show }`; for anyone else it is
`{ status: 'overdue', show: true }` when overdue and `null` otherwise. The
tenant is the token's, never a parameter.

## 4. Build checklist

- [x] tables, `services/billing.ts`, admin routes, workspace route, notice on boot + pulse
- [x] console: firm page Billing (set up, edit, Mark paid, payments), Billing column on Firms
- [x] app: bar on desk and phone, Settings → Billing for desk roles when a row exists
- [ ] Om: plan names and amounts per firm, entered in the console

**Where authz lives.** Writes: `routes/admin.ts` behind `requireSuperadmin`
(the router's `use`), the only routes that touch the two tables' writers in
`services/billing.ts`. Firm reads: `GET /workspace/billing` checks a desk role;
the notice is shaped by role in `billingNotice()`; both take the tenant from the
token's request context. Verified 1 Nov on development with delpat (row) and
test-org (none): firm tokens get 401 (422 in a read-only support view) on every
console route, an agent gets 403 on `/workspace/billing` and no amount or plan
on boot or pulse, a test-org token naming delpat in `X-Tenant-ID` reads test-org.
