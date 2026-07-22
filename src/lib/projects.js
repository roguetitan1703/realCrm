// Derived PROJECT layer over the flat unit records.
//
// A "project" is not a stored entity — it's a grouping lens computed from the
// units' own `project`/`society` field (see projectOf). Units with no project
// collect in the implicit "Independent / Direct" bucket, so a broker who only
// lists scattered flats/shops/plots never has to create a project, while a
// township broker gets their towers grouped for free.

import { projectOf, wingOf, fmtMoney, INDEPENDENT_PROJECT } from './format.js'

const isAvailable = (p) => (p.status || 'Available') === 'Available'
const isSold = (p) => ['Sold', 'Closed', 'Let'].includes(p.status)

// Group a list of unit records into projects. Returns an array sorted with the
// largest real projects first and "Independent / Direct" always last.
export function buildProjects(units = []) {
  const map = new Map()
  for (const u of units) {
    const name = projectOf(u)
    if (!map.has(name)) {
      map.set(name, { key: name, name, units: [], localities: new Set(), wings: new Set(), developer: null })
    }
    const proj = map.get(name)
    proj.units.push(u)
    if (u.locality) proj.localities.add(u.locality)
    if (wingOf(u)) proj.wings.add(wingOf(u))
    if (!proj.developer && u.developer) proj.developer = u.developer
  }

  const projects = [...map.values()].map(proj => {
    const units = proj.units
    const prices = units.map(u => u.price).filter(Boolean)
    const min = prices.length ? Math.min(...prices) : null
    const max = prices.length ? Math.max(...prices) : null
    return {
      key: proj.key,
      name: proj.name,
      independent: proj.name === INDEPENDENT_PROJECT,
      developer: proj.developer,
      locality: [...proj.localities].join(', ') || '—',
      localityCount: proj.localities.size,
      wings: [...proj.wings].sort(),
      units,
      counts: {
        total: units.length,
        available: units.filter(isAvailable).length,
        sold: units.filter(isSold).length,
        sale: units.filter(u => u.deal === 'sale').length,
        rent: units.filter(u => u.deal === 'rent').length,
      },
      priceRange: {
        min, max,
        label: min == null ? '—'
          : min === max ? fmtMoney(min)
          : `${fmtMoney(min)} – ${fmtMoney(max)}`,
      },
    }
  })

  // Biggest projects first; Independent bucket always sinks to the bottom.
  return projects.sort((a, b) => {
    if (a.independent !== b.independent) return a.independent ? 1 : -1
    return b.counts.total - a.counts.total
  })
}

// All units in a single project (used by the project detail view).
export function unitsInProject(units = [], key) {
  return units.filter(u => projectOf(u) === key)
}

// Units of a project grouped by wing, for the wing-sectioned detail grid.
// Returns [{ wing, units }] with an "Unassigned" bucket for wingless units.
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
