import React, { useState } from 'react'
import Icon from './Icon.jsx'
// The record sheet reads the SAME vocabulary the add form writes. When these
// were two hand-typed lists, the sheet's editor offered "Semi-furnished" while
// the form stored "semi" — the exact drift that broke property filtering.
import {
  AREA_UNITS, BACHELOR_PREF, BHK, CATEGORIES, CONSULTING_DAYS, CONSULTING_PERCENT,
  COUNTED_ITEMS, DEALS, DEPOSIT_OPTIONS, FACING, FIXTURES, FURNISH, LOCKIN_OPTIONS,
  MAINTENANCE_MODE, OWNERSHIP, POSSESSION, SOCIETY_AMENITIES, STATUS, SUBTYPES,
  TENANT_TYPES, TRANSACTION,
  BHK_FILTER,
  appliesTo, areaFieldsFor, labelOf, normaliseBhk, normaliseSubtype, optionsOf,
} from '../data/propertyFields.js'
import { configLabel } from '../lib/format.js'

// How soon the lead needs possession. A LEAD-side vocabulary (it describes the
// buyer's urgency, not the property), so it lives with the lead schema — but
// declared once here rather than typed into each form that asks.
export const POSSESSION_TARGETS = [
  'Immediate', 'Within 30 days', 'Within 60 days', 'Within 90 days', 'Flexible',
].map(v => ({ value: v, label: v }))

/**
 * Utility to get or set nested object properties via dot-notation (e.g., 'req.config')
 */
export function getNestedValue(obj, path) {
  if (!obj || !path) return undefined
  return path.split('.').reduce((acc, part) => (acc ? acc[part] : undefined), obj)
}

export function setNestedValue(obj, path, value) {
  const keys = path.split('.')
  const copy = JSON.parse(JSON.stringify(obj || {}))
  let current = copy
  for (let i = 0; i < keys.length - 1; i++) {
    if (!current[keys[i]]) current[keys[i]] = {}
    current = current[keys[i]]
  }
  current[keys[keys.length - 1]] = value
  return copy
}

/**
 * ModuleRecordSheet — Zoho-style READ-ONLY record view for ANY module.
 * Fields render as tight label:value rows in a 2-column grid, grouped into
 * labelled sections. No per-field boxes, no inline pencils. Editing happens in
 * ONE place: the "Edit" button in the detail header opens the full-form modal.
 *
 * A field may declare `section` (any string; 'core' → "Overview") to group it,
 * and `renderValue(v, record, store)` to format. Long text (`type:'textarea'`)
 * spans the full row.
 */
// Not every fact is wanted at the same moment, and a flat wall of forty
// label:value rows makes the four you came for as hard to find as the thirty-six
// you didn't. So sections carry a DEFAULT STATE:
//
//   core     — always open, never collapsible. This is the record's identity;
//              a page whose first section can be hidden has no anchor.
//   domain   — open. What the property physically is: the scanning layer.
//   terms    — closed. Deposit, lock-in, booking amount, fee. Real and needed,
//              but only once you're negotiating — not while you're deciding
//              whether this is even the right unit.
//   internal — closed. Flat number, keys, description. Operational.
//
// A closed section still says how much is in it, so collapsing never hides the
// fact that something is there.
const SECTION_META = {
  core: { title: 'Overview', fixed: true },
  domain: { title: 'Details', open: true },
  additional: { title: 'Details', open: true },
  terms: { title: 'Terms & charges', open: false },
  internal: { title: 'Internal · never shared', open: false },
}
const SECTION_TITLES = Object.fromEntries(
  Object.entries(SECTION_META).map(([k, v]) => [k, v.title]))

export function ModuleRecordSheet({ schema, record, store }) {
  // Which sections the reader has opened or closed. Keyed by section so it
  // survives re-renders while you read, and resets when you open another
  // record — the next property is a fresh question, not a continuation.
  const [openMap, setOpenMap] = useState({})
  if (!schema || !record) return null

  // group fields by section, preserving declaration order of sections.
  // A field may declare `when(record)` — a rental has no booking amount and a
  // plot has no bathrooms, and rendering those as "—" reads as missing data
  // rather than as a question that was never asked. Same predicate the form
  // uses, so the sheet shows exactly the fields the form offered.
  const order = []
  const groups = {}
  for (const f of schema.fields) {
    if (f.when && !f.when(record)) continue
    const sec = f.section || 'domain'
    if (!groups[sec]) { groups[sec] = []; order.push(sec) }
    groups[sec].push(f)
  }

  const rawValueOf = (field) => {
    const raw = getNestedValue(record, field.key)
    if (field.renderValue) return field.renderValue(raw, record, store)
    if (raw === undefined || raw === null || raw === '') return ''
    return String(raw)
  }

  const valueOf = (field) => {
    const out = rawValueOf(field)
    if (out === undefined || out === null || out === '') return <span className="rs-empty">—</span>
    // `chips` renders a list as tags rather than a comma run. "Power Backup,
    // Lift, Gym, Swimming Pool, Intercom, Garden" is a sentence you have to
    // read; the same six as tags is something you take in at a glance, which
    // is the whole job of this page.
    if (field.type === 'chips' && Array.isArray(out)) {
      return <span className="rs-chips">{out.map((c, i) => <span key={i} className="rs-chip">{c}</span>)}</span>
    }
    return out
  }

  // How many of a section's fields actually hold something — shown on a closed
  // section so it never hides the existence of data.
  const filledIn = (sec) => groups[sec].filter(f => {
    const v = rawValueOf(f)
    return Array.isArray(v) ? v.length > 0 : v !== '' && v !== null && v !== undefined
  }).length

  return (
    <div className="recsheet">
      {order.map(sec => {
        const meta = SECTION_META[sec] || { title: sec, open: true }
        const open = meta.fixed ? true : (openMap[sec] ?? meta.open ?? true)
        const filled = filledIn(sec)
        return (
          <section key={sec} className={'rs-section' + (open ? '' : ' closed')}>
            {meta.fixed ? (
              <div className="rs-section-title">{meta.title}</div>
            ) : (
              <button type="button" className="rs-section-title rs-toggle"
                aria-expanded={open}
                onClick={() => setOpenMap(m => ({ ...m, [sec]: !open }))}>
                <Icon name={open ? 'chevDown' : 'chevRight'} size={14} />
                <span>{meta.title}</span>
                <span className="rs-count">{filled ? `${filled} recorded` : 'nothing recorded'}</span>
              </button>
            )}
            {open && (
              <div className="rs-grid">
                {groups[sec].map(f => (
                  <div key={f.key} className={'rs-row' + (f.type === 'textarea' || f.type === 'chips' ? ' rs-row-wide' : '')}>
                    <div className="rs-label">{f.label}</div>
                    <div className="rs-value">{valueOf(f)}</div>
                  </div>
                ))}
              </div>
            )}
          </section>
        )
      })}
    </div>
  )
}

export const LEAD_MODULE_SCHEMA = {
  id: 'leads',
  moduleName: 'Lead Record',
  fields: [
    // Core Fields Section
    { key: 'name', label: 'Full Name', type: 'text', section: 'core', required: true },
    { key: 'phone', label: 'Primary Phone', type: 'text', section: 'core', required: true },
    { key: 'email', label: 'Email Address', type: 'email', section: 'core' },
    { key: 'source', label: 'Attribution Source', type: 'select', section: 'core', options: ['Website', '99acres', 'MagicBricks', 'Referral', 'Walk-in', 'Meta Ads'] },
    {
      key: 'agentId',
      label: 'Assigned Owner',
      type: 'select',
      section: 'core',
      options: (store) => store?.state?.agents?.map(a => ({ value: a.id, label: a.name })) || [],
      renderValue: (val, record, store) => {
        const ag = store?.state?.agents?.find(a => a.id === val)
        return ag ? ag.name : 'Unassigned'
      }
    },

    // Additional / Domain Fields Section
    // What a lead WANTS has to be sayable in the same words the inventory is
    // described in, or a requirement can never match a property. These were a
    // hand-typed list that had already drifted from both: it offered
    // "4 BHK Penthouse" while no such config existed, and omitted every
    // sub-type the property form added. Now derived — canonical configurations
    // first, then anything the live inventory actually holds.
    {
      key: 'req.config', label: 'Requirement Config', type: 'select', section: 'domain',
      options: (store) => {
        const fromStock = (store?.state?.properties || []).map(configLabel)
        const canonical = BHK_FILTER.flatMap(b =>
          ['apartment', 'villa', 'independent_house'].map(st =>
            `${b.label} ${labelOf(SUBTYPES.residential, st)}`))
        const commercial = SUBTYPES.commercial.map(s => s.label)
        return [...new Set([...fromStock, ...canonical, ...commercial])].filter(Boolean).sort()
      },
    },
    {
      key: 'req.locality', label: 'Preferred Locality', type: 'select', section: 'domain',
      // The localities you actually hold stock in, plus the ones leads ask for.
      options: (store) => [...new Set([
        ...(store?.state?.properties || []).map(p => p.locality),
        ...(store?.state?.leads || []).map(l => l.req?.locality),
      ].filter(Boolean))].sort().map(v => ({ value: v, label: v })),
    },
    {
      key: 'req.timeline', label: 'Possession Target', type: 'select', section: 'domain',
      options: POSSESSION_TARGETS,
      // Defends the display against rows already corrupted by the `timeline`
      // collision above — an object here renders as the honest "—", not as
      // "[object Object]" in front of the user.
      renderValue: (v) => (v && typeof v === 'object') ? '' : v,
    },
    { key: 'req.notes', label: 'Requirement Notes & Purpose', type: 'textarea', section: 'domain' }
  ]
}

// One schema = one place every property fact is viewed AND edited. The detail
// page shows nothing that isn't here (no duplicate Spec/Commercials panels).
// Applicability comes from ONE predicate shared with the add form, so the
// sheet can never show a field the form refused to ask for.
const pApplies = (p) => appliesTo({
  category: p.category || 'residential',
  deal: p.deal,
  subtype: p.subtype || normaliseSubtype(p.type, p.category),
  possession: p.possession,
  transactionType: p.transactionType,
  bhk: p.bhk || normaliseBhk(p.type),
  preferredTenants: p.preferredTenants || [],
})
const unitOf = (p) => labelOf(AREA_UNITS, p.areaUnit || 'sqft')
// An area without its unit is a number that means two different things. The
// old sheet hardcoded "(sqft)" in the label, so a sq.m listing read as wrong.
const area = (key, label) => ({
  key, label, type: 'number', section: 'domain',
  when: (p) => areaFieldsFor({
    subtype: p.subtype || normaliseSubtype(p.type, p.category), category: p.category,
  }).includes(key),
  renderValue: (v, p) => (v === null || v === undefined || v === '') ? '' : `${v} ${unitOf(p)}`,
})
const tokenField = (key, label, list, section = 'domain', extra = {}) => ({
  key, label, type: 'select', section, options: optionsOf(list),
  renderValue: (v) => labelOf(list, v), ...extra,
})

export const PROPERTY_MODULE_SCHEMA = {
  id: 'properties',
  moduleName: 'Property',
  fields: [
    // ---- Overview: what it is, where, what it costs ----------------------
    { key: 'society', label: 'Project / Society', type: 'text', section: 'core', required: true },
    { key: 'locality', label: 'Locality', type: 'text', section: 'core' },
    tokenField('deal', 'Deal', DEALS, 'core'),
    tokenField('category', 'Category', CATEGORIES, 'core'),
    {
      key: 'subtype', label: 'Property type', type: 'select', section: 'core',
      options: optionsOf([...SUBTYPES.residential, ...SUBTYPES.commercial]
        .filter((x, i, a) => a.findIndex(y => y.value === x.value) === i)),
      // Legacy rows hold "4 BHK Villa" in `type` and nothing in `subtype`.
      // Reading through the normaliser means an un-migrated row still shows
      // the right thing instead of a dash.
      renderValue: (v, p) => labelOf(
        SUBTYPES[p.category || 'residential'] || SUBTYPES.residential,
        v || normaliseSubtype(p.type, p.category)),
    },
    {
      key: 'bhk', label: 'Configuration', type: 'select', section: 'core', options: optionsOf(BHK),
      when: (p) => pApplies(p).bhk,
      renderValue: (v, p) => labelOf(BHK, v || normaliseBhk(p.type)),
    },
    tokenField('status', 'Status', STATUS, 'core'),
    { key: 'priceLabel', label: 'Quoted price', type: 'text', section: 'core' },
    { key: 'owner', label: 'Owner', type: 'text', section: 'core' },

    // ---- Details: the physical unit --------------------------------------
    { key: 'tower', label: 'Tower / wing', type: 'text', section: 'domain' },
    {
      key: 'floor', label: 'Floor', type: 'text', section: 'domain',
      when: (p) => pApplies(p).floors,
      renderValue: (v, r) => (v == null || v === '') ? '' : (r.totalFloors ? `${v} of ${r.totalFloors}` : String(v)),
    },
    area('carpet', 'Carpet area'),
    area('builtup', 'Built-up'),
    area('superBuiltup', 'Super built-up'),
    area('plotArea', 'Plot area'),
    { key: 'bathrooms', label: 'Bathrooms', type: 'text', section: 'domain', when: (p) => pApplies(p).bathrooms },
    { key: 'balconies', label: 'Balconies', type: 'text', section: 'domain', when: (p) => pApplies(p).balconies },
    {
      key: 'coveredParking', label: 'Parking', type: 'text', section: 'domain',
      renderValue: (v, p) => [v ? `${v} covered` : null, p.openParking ? `${p.openParking} open` : null]
        .filter(Boolean).join(' · ') || p.parking || '',
    },
    tokenField('facing', 'Facing', FACING),
    tokenField('furnishType', 'Furnishing', FURNISH, 'domain', {
      when: (p) => pApplies(p).furnishing,
      renderValue: (v, p) => labelOf(FURNISH, v) || p.furnishing || '',
    }),
    {
      key: 'servantRoom', label: 'Servant room', type: 'select', section: 'domain',
      when: (p) => pApplies(p).servantRoom,
      options: [{ value: true, label: 'Yes' }, { value: false, label: 'No' }],
      renderValue: (v) => v === true ? 'Yes' : v === false ? 'No' : '',
    },
    // Recorded in the amenities picker at entry time and, until now, rendered
    // NOWHERE — so a broker filled in eleven furnishings and the record showed
    // none of them. They are also the first thing a client asks about, which
    // makes them scanning material, not an appendix.
    {
      key: 'fixtures', label: 'Furnishings', type: 'chips', section: 'domain',
      when: (p) => pApplies(p).furnishing,
      renderValue: (v) => (v || []).map(x => labelOf(FIXTURES, x)),
    },
    {
      // "AC ×2" — the count is the point. Two ACs and five ACs are a
      // different flat to whoever is renting it.
      key: 'countedItems', label: 'How many', type: 'chips', section: 'domain',
      when: (p) => pApplies(p).furnishing,
      renderValue: (v) => Object.entries(v || {}).map(([k, n]) => `${labelOf(COUNTED_ITEMS, k)} ×${n}`),
    },
    {
      key: 'societyAmenities', label: 'Society amenities', type: 'chips', section: 'domain',
      renderValue: (v) => (v || []).map(x => labelOf(SOCIETY_AMENITIES, x)),
    },
    tokenField('ownership', 'Ownership', OWNERSHIP, 'domain', { when: (p) => pApplies(p).ownership }),
    tokenField('transactionType', 'Transaction', TRANSACTION, 'domain', { when: (p) => pApplies(p).transaction }),
    tokenField('possession', 'Possession', POSSESSION, 'domain', { when: (p) => pApplies(p).possession }),
    { key: 'age', label: 'Age (years)', type: 'number', section: 'domain', when: (p) => pApplies(p).age },
    { key: 'rera', label: 'RERA ID', type: 'text', section: 'domain', when: (p) => pApplies(p).rera },

    // ---- Terms: only the ones this deal actually has ----------------------
    tokenField('depositOption', 'Security deposit', DEPOSIT_OPTIONS, 'terms', {
      when: (p) => pApplies(p).rentTerms,
      renderValue: (v, p) => v === 'custom' ? (p.depositAmount || 'Custom') : labelOf(DEPOSIT_OPTIONS, v),
    }),
    tokenField('lockinOption', 'Lock-in', LOCKIN_OPTIONS, 'terms', {
      when: (p) => pApplies(p).rentTerms,
      renderValue: (v, p) => v === 'custom' ? (p.lockinMonths ? `${p.lockinMonths} months` : 'Custom') : labelOf(LOCKIN_OPTIONS, v),
    }),
    tokenField('maintenanceMode', 'Maintenance', MAINTENANCE_MODE, 'terms', {
      when: (p) => pApplies(p).rentTerms,
      renderValue: (v, p) => v === 'separate'
        ? (p.maintenanceAmount ? `${p.maintenanceAmount} separate` : 'Separate')
        : labelOf(MAINTENANCE_MODE, v),
    }),
    { key: 'availableFrom', label: 'Available from', type: 'text', section: 'terms', when: (p) => pApplies(p).rentTerms },
    {
      key: 'preferredTenants', label: 'Preferred tenants', type: 'chips', section: 'terms',
      when: (p) => pApplies(p).tenantPreference,
      renderValue: (v) => (v || []).map(x => labelOf(TENANT_TYPES, x)),
    },
    tokenField('bachelorPref', 'Bachelors', BACHELOR_PREF, 'terms', { when: (p) => pApplies(p).bachelorPreference }),
    { key: 'bookingAmount', label: 'Booking / token', type: 'number', section: 'terms', when: (p) => pApplies(p).saleTerms },
    { key: 'otherCharges', label: 'Other charges', type: 'number', section: 'terms', when: (p) => pApplies(p).saleTerms },
    {
      key: 'consultingOption', label: 'Consulting fee', type: 'select', section: 'terms',
      // Days of rent on a let, a percentage on a sale — read from whichever
      // list this deal is actually charged against.
      options: optionsOf(CONSULTING_PERCENT),
      renderValue: (v, p) => {
        const list = p.deal === 'rent' ? CONSULTING_DAYS : CONSULTING_PERCENT
        if (v === 'custom') return p.deal === 'rent' ? `${p.consultingPercent || '?'} days` : `${p.consultingPercent || '?'}%`
        return labelOf(list, v)
      },
    },

    // ---- Internal --------------------------------------------------------
    { key: 'unit', label: 'Unit / flat no.', type: 'text', section: 'internal' },
    { key: 'keyAccess', label: 'Key / access', type: 'text', section: 'internal' },
    { key: 'description', label: 'Description', type: 'textarea', section: 'internal' },
  ]
}

export const CLIENT_MODULE_SCHEMA = {
  id: 'clients',
  moduleName: 'Client Contact Record',
  fields: [
    // Core Fields Section
    { key: 'name', label: 'Client Name', type: 'text', section: 'core', required: true },
    { key: 'phone', label: 'Primary Contact', type: 'text', section: 'core', required: true },
    { key: 'email', label: 'Email Address', type: 'email', section: 'core' },
    { key: 'role', label: 'Client Role / Type', type: 'select', section: 'core', options: ['Buyer', 'Tenant', 'Owner', 'Investor', 'Channel Partner'] },

    // Additional / Domain Fields Section
    { key: 'locality', label: 'Associated Locality', type: 'text', section: 'domain' },
    { key: 'detail', label: 'Client Requirements Summary', type: 'textarea', section: 'domain' }
  ]
}

