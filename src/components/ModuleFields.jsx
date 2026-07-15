import React from 'react'

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
const SECTION_TITLES = { core: 'Overview', domain: 'Details', additional: 'Details' }

export function ModuleRecordSheet({ schema, record, store }) {
  if (!schema || !record) return null

  // group fields by section, preserving declaration order of sections
  const order = []
  const groups = {}
  for (const f of schema.fields) {
    const sec = f.section || 'domain'
    if (!groups[sec]) { groups[sec] = []; order.push(sec) }
    groups[sec].push(f)
  }

  const valueOf = (field) => {
    const raw = getNestedValue(record, field.key)
    if (field.renderValue) {
      const out = field.renderValue(raw, record, store)
      return (out === undefined || out === null || out === '') ? <span className="rs-empty">—</span> : out
    }
    if (raw === undefined || raw === null || raw === '') return <span className="rs-empty">—</span>
    return String(raw)
  }

  return (
    <div className="recsheet">
      {order.map(sec => (
        <section key={sec} className="rs-section">
          <div className="rs-section-title">{SECTION_TITLES[sec] || sec}</div>
          <div className="rs-grid">
            {groups[sec].map(f => (
              <div key={f.key} className={'rs-row' + (f.type === 'textarea' ? ' rs-row-wide' : '')}>
                <div className="rs-label">{f.label}</div>
                <div className="rs-value">{valueOf(f)}</div>
              </div>
            ))}
          </div>
        </section>
      ))}
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
    { key: 'req.config', label: 'Requirement Config', type: 'select', section: 'domain', options: ['1 BHK Apartment', '2 BHK Apartment', '3 BHK Apartment', '4 BHK Villa', '4 BHK Penthouse', 'Commercial Office'] },
    { key: 'req.locality', label: 'Preferred Locality', type: 'select', section: 'domain', options: ['Hinjewadi Phase 1', 'Hinjewadi Phase 3', 'Wakad', 'Baner', 'Kharadi', 'Kalyani Nagar', 'Gahunje / Expressway', 'Viman Nagar'] },
    { key: 'req.timeline', label: 'Possession Target', type: 'select', section: 'domain', options: ['Immediate', 'Within 30 days', 'Within 60 days', 'Within 90 days'] },
    { key: 'req.notes', label: 'Requirement Notes & Purpose', type: 'textarea', section: 'domain' }
  ]
}

// One schema = one place every property fact is viewed AND edited. The detail
// page shows nothing that isn't here (no duplicate Spec/Commercials panels).
export const PROPERTY_MODULE_SCHEMA = {
  id: 'properties',
  moduleName: 'Property',
  fields: [
    // Identity & ownership (Core)
    { key: 'society', label: 'Society / Project', type: 'text', section: 'core', required: true },
    { key: 'type', label: 'Configuration', type: 'select', section: 'core', options: ['2 BHK Apartment', '3 BHK Apartment', '4 BHK Penthouse', '4 BHK Villa', 'Commercial Office', 'Plot'] },
    {
      key: 'deal', label: 'Deal', type: 'select', section: 'core',
      options: [{ value: 'sale', label: 'Sale' }, { value: 'rent', label: 'Rent' }],
      renderValue: (v) => v === 'rent' ? 'Rent' : 'Sale',
    },
    { key: 'status', label: 'Status', type: 'select', section: 'core', options: ['Available', 'Token Pending', 'Under Offer', 'Sold', 'Leased', 'Off-Market'] },
    { key: 'locality', label: 'Locality', type: 'text', section: 'core' },
    { key: 'owner', label: 'Owner', type: 'text', section: 'core' },
    { key: 'ownerPhone', label: 'Owner Phone', type: 'text', section: 'core' },
    { key: 'priceLabel', label: 'Quoted Price', type: 'text', section: 'core' },

    // Property specifics (Domain) — everything the old Spec Sheet showed, once.
    { key: 'carpet', label: 'Carpet Area (sqft)', type: 'number', section: 'domain' },
    {
      key: 'floor', label: 'Floor', type: 'text', section: 'domain',
      renderValue: (v, r) => v == null || v === '' ? 'Not specified' : (r.totalFloors ? `${v} of ${r.totalFloors}` : String(v)),
    },
    { key: 'facing', label: 'Facing', type: 'text', section: 'domain' },
    { key: 'furnishing', label: 'Furnishing', type: 'select', section: 'domain', options: ['Unfurnished', 'Semi-furnished', 'Fully Furnished'] },
    { key: 'parking', label: 'Parking', type: 'text', section: 'domain' },
    { key: 'possession', label: 'Possession / Available', type: 'text', section: 'domain' },
    {
      key: 'negotiable', label: 'Price', type: 'select', section: 'domain',
      options: [{ value: true, label: 'Negotiable' }, { value: false, label: 'Fixed' }],
      renderValue: (v) => v ? 'Negotiable' : 'Fixed',
    },
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

