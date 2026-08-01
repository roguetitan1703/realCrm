// ============================================================================
// 📍 SUGGESTIONS DERIVED FROM THE FIRM'S OWN DATA
// ============================================================================
// Locality cannot be a fixed list. There were two of them — LEAD_LOCALITIES
// ('Hinjewadi Phase 1', 'Marunji / Hinjewadi', …) and PROP_LOCALITIES
// ('Wakad', 'Kothrud', …) — they disagreed with each other, and both were
// Pune. A firm in Nagpur could not enter its own city, and a Pune firm could
// not enter a locality that wasn't one of nine.
//
// There is no list of every locality in India worth shipping, and a wrong one
// is worse than none. So: the field is FREE TEXT, and the suggestions are
// whatever this firm has already typed. It is empty on day one and correct by
// day three, it fits any city, and it needs no upkeep.
//
// The vocabulary arrives in the boot payload now, as one SELECT DISTINCT over
// both tables. It used to be produced by walking every lead and every property
// in the browser — a few dozen strings that required the entire book, and one
// of the last things keeping the collections in memory.
//
// societies(), configs() and sourcesUsed() lived here too and are gone: every
// screen that used them now reads the same counts from the server (the
// dashboard's source bars come from /workspace/desk-summary, project names from
// /properties/summary), and keeping a second client-side implementation beside
// those would only give the two something to disagree about.
// ============================================================================

/** Everywhere this firm has a lead looking or a property listed. */
export function localities(store) {
  const s = store?.state || store || {}
  return s.localities || []
}

/** Shape a derived list for a filter's `options`. */
export const asOptions = (list) => list.map(v => ({ value: v, label: v }))
