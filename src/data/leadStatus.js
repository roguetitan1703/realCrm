// ============================================================================
// 🏷️ LEAD STATUS — flat, not a pipeline
// ============================================================================
// This used to be an ordered pipeline: New → Contacted → Site Visit →
// Negotiation → Closed Won/Lost, drawn as a stepper you walked forwards and
// backwards. Nobody moved leads through it, so the position was decorative and
// usually wrong — a lead sat in "New" for a month while someone had spoken to
// them three times.
//
// The client's own list is what people actually say on the phone, and it has no
// order: a lead can go Interested → Callback → Interested → Site Visit, and
// "Call Not Received" is a thing that happens at any point rather than a place
// in a funnel. So these are STATUSES. One value, set directly, no sequence.
//
// The database column is still called `stage` — renaming a live column across
// every query to gain nothing but a nicer name is the kind of churn that breaks
// a working system. The column holds a status; the UI says Status.
export const LEAD_STATUSES = [
  'New',
  'Follow-Up',
  'Callback',
  'Call Not Received',
  'Interested',
  'Site Visit',
  'Deal Closed',
  'Rejected',
]

// Terminal statuses. EVERYTHING that used to ask `stage.startsWith('Closed')`
// asks this instead — and that string test is exactly why this list has to be
// explicit: neither "Deal Closed" nor "Rejected" starts with "Closed", so the
// old test silently counted every finished lead as still open.
export const TERMINAL_STATUSES = ['Deal Closed', 'Rejected']
export const WON_STATUS = 'Deal Closed'
export const REJECTED_STATUS = 'Rejected'
export const NEW_STATUS = 'New'
export const NO_ANSWER_STATUS = 'Call Not Received'

export const isTerminal = (s) => TERMINAL_STATUSES.includes(String(s || ''))
export const isOpen = (s) => !isTerminal(s)

// Why a lead was rejected. The client's list — kept as given, including
// "Others", because a reason list without an escape hatch just gets one value
// picked at random.
export const REJECTION_REASONS = [
  'Not Answering',
  'Budget Mismatch',
  'Locality Mismatch',
  'Broker',
  'Already purchased / rented',
  'No Requirement',
  'Want Ready-To-Move',
  'Negotiation Failed',
  'Others',
]

// The colour class each status carries. Keys must match the values above
// exactly — an unmatched key falls through to default styling, which is how a
// closed lead once rendered as if it were open.
export const STATUS_CLASS = {
  'New': 'stage-new',
  'Follow-Up': 'stage-contacted',
  'Callback': 'stage-c1',
  'Call Not Received': 'stage-c4',
  'Interested': 'stage-nego',
  'Site Visit': 'stage-visit',
  'Deal Closed': 'stage-won',
  'Rejected': 'stage-lost',
}

// What the previous pipeline's positions meant, so live leads keep their real
// meaning instead of all collapsing into "New". Applied once, server-side.
export const LEGACY_STAGE_MAP = {
  'New': 'New',
  'New inquiry': 'New',
  'Contacted': 'Follow-Up',
  'Site Visit': 'Site Visit',
  'Negotiation': 'Interested',
  'Closed Won': 'Deal Closed',
  'Closed Lost': 'Rejected',
  'won': 'Deal Closed',
  'lost': 'Rejected',
}
