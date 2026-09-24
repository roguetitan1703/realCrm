// ============================================================================
// THE FINAL STAGE — a role a stage holds, not a name the code knows
// ============================================================================
// Each pipeline ends somewhere that turns a prospect into business: a calling
// row at Key Received becomes a property we manage, a lead at Deal Closed
// becomes an agreement. The buttons that do that ("Convert to property",
// "Close the deal") appear on the FINAL stage, and which stage that is lives in
// the firm's settings — `finalStages: { leads, calling }` — so a firm that says
// "Keys in hand" instead of "Key Received" renames it and the button follows.
//
// Absent is the default, not a missing answer: no firm has set this, and each
// one's final stage is today's name. Nothing is written to make that true.
//
// LEADS are different. "Deal Closed" and "Rejected" are also what every "open"
// count in SQL excludes (TERMINAL_STATUSES in services/store.ts, ~70 reads),
// so their STORED value stays fixed. What a firm renames is the NAME SHOWN
// (`stageLabels: { 'Deal Closed': 'Booked' }`) — every tag, picker and history
// line reads it, and no query has to know. "Make final" is Calling only.
// ============================================================================

export const DEFAULT_FINAL = { leads: 'Deal Closed', calling: 'Key Received' }

/** Which stage is final on this side, for this firm. */
export function finalStageOf(settings, side) {
  if (side === 'leads') return DEFAULT_FINAL.leads
  const set = settings?.finalStages?.calling
  const list = Array.isArray(settings?.ownerStages) ? settings.ownerStages : null
  // A stored role that no longer names a stage on the list is not trusted —
  // the default stands in, rather than a button that can never appear.
  if (set && (!list || list.includes(set))) return set
  return DEFAULT_FINAL.calling
}

/** Can this side's final stage be renamed or moved in the editor? */
export const finalIsEditable = (side) => side === 'calling'

/** Lead stages whose stored value is fixed; the firm may rename what is shown. */
export const LABELLED_LEAD_STAGES = ['Deal Closed', 'Rejected']

// The shown names for this tab's workspace. One workspace per tab (the URL is
// the authority), so one table per page is enough; the store sets it whenever
// the firm's settings arrive or change.
let LABELS = {}
export function setStageLabels(map) { LABELS = map && typeof map === 'object' ? { ...map } : {} }
/** What a stage is called on screen: the firm's name for it, or the stage. */
export const stageLabel = (name) => (name && LABELS[name]) || name
/** The same, from a settings object — for code that holds one (the server). */
export const stageLabelIn = (settings, name) => (name && settings?.stageLabels?.[name]) || name
