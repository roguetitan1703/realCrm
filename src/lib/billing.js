// What a firm pays Delpat (docs/specs/billing.md): the words and formats the
// payment bar, Settings → Billing and the console's Billing page share.
// Delpat bills in rupees whatever the firm's own currency, so amounts here are
// always ₹, never formatMoney().

export const CYCLE_LABEL = { monthly: 'Monthly', quarterly: 'Quarterly', yearly: 'Yearly' }
export const STATUS_LABEL = { paid: 'Paid', due_soon: 'Due soon', overdue: 'Overdue' }

/** '2026-11-03' → '3 Nov' (or '3 Nov 2027' outside this year). A calendar date, no time zone. */
export function billingDate(iso, { year = false } = {}) {
  if (!iso) return ''
  const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number)
  const dt = new Date(y, m - 1, d)
  const withYear = year || y !== new Date().getFullYear()
  return dt.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', ...(withYear ? { year: 'numeric' } : {}) })
}

export const rupees = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`

/**
 * The bar's one line. Owner and manager get the date, amount and plan; anyone
 * else is told only that it is pending and who can settle it. null: no bar.
 */
export function billingBarText(billing) {
  if (!billing?.show) return null
  if (!billing.plan) return 'Payment pending · ask your manager or owner'
  const head = billing.status === 'overdue' ? `Payment pending since ${billingDate(billing.due_on)}` : `Payment due ${billingDate(billing.due_on)}`
  return `${head} · ${rupees(billing.amount)} · ${billing.plan}`
}
