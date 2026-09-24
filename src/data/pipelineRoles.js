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
// LEADS are narrower, on purpose, for now. "Deal Closed" is also what every
// "open" count in SQL excludes (TERMINAL_STATUSES in services/store.ts, ~78
// reads), so renaming it per firm means threading the firm's list through all
// of them. Until that is done the leads' final stage is fixed and the editor
// does not offer to rename or move it.
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
