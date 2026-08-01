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
// whatever this firm has already typed — ranked by how often. It is empty on
// day one and correct by day three, it fits any city, and it needs no upkeep.
// ============================================================================

/** Distinct values of `path` across records, most-used first. */
function frequent(records, read) {
  const counts = new Map()
  for (const r of records) {
    const v = String(read(r) ?? '').trim()
    if (!v) continue
    counts.set(v, (counts.get(v) || 0) + 1)
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([v]) => v)
}

/** Everywhere this firm has a lead looking or a property listed. */
export function localities(store) {
  const s = store?.state || store || {}
  return frequent(
    [...(s.leads || []), ...(s.properties || [])],
    r => r.req?.locality ?? r.locality,
  )
}

/** Project / society names already on the books. */
export function societies(store) {
  const s = store?.state || store || {}
  return frequent(s.properties || [], p => p.society || p.project)
}

/** Requirement configurations leads have actually asked for. */
export function configs(store) {
  const s = store?.state || store || {}
  return frequent(s.leads || [], l => l.req?.config)
}

/**
 * Where leads have actually come from — NOT settings.sources, a hand-typed
 * list from onboarding that a new Connections integration never touches. A
 * portal wired up through Connections tags every lead it sends with its own
 * name (`lead.source = provider`), so the dashboard's "Leads by source" was
 * reading a completely different list than the one new leads were arriving
 * under — a source could receive fifty leads and never once show up.
 */
export function sourcesUsed(store) {
  const s = store?.state || store || {}
  return frequent(s.leads || [], l => l.source)
}

/** Shape a derived list for a filter's `options`. */
export const asOptions = (list) => list.map(v => ({ value: v, label: v }))
