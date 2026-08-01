// Derived PROJECT layer over the flat unit records.
//
// A "project" is not a stored entity — it's a grouping lens computed from the
// units' own `project`/`society` field (see projectOf). Units with no project
// collect in the implicit "Independent / Direct" bucket, so a broker who only
// lists scattered flats/shops/plots never has to create a project, while a
// township broker gets their towers grouped for free.

import { wingOf, fmtMoney } from './format.js'

// The price band, formatted. The server sends min/max as numbers -- formatting
// is a display concern and stays here, shared by the project grid and the
// project header so they can never disagree.
export function priceRangeLabel(range) {
  const min = range?.min, max = range?.max
  if (min == null) return null
  return min === max ? fmtMoney(min) : `${fmtMoney(min)} – ${fmtMoney(max)}`
}

export function unitsByWing(units = []) {
  const map = new Map()
  for (const u of units) {
    const w = wingOf(u) || '—'
    if (!map.has(w)) map.set(w, [])
    map.get(w).push(u)
  }
  const entries = [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  // If the project has no wings at all, don't force an "Unassigned" bucket label.
  const onlyWingless = entries.length === 1 && entries[0][0] === '—'
  return entries.map(([wing, list]) => ({
    wing: wing === '—' ? (onlyWingless ? 'All units' : 'No wing assigned') : `Wing ${wing}`,
    units: list,
  }))
}
