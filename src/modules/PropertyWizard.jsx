import { useEffect, useMemo, useState } from 'react'
import { Button, Field, Input, Textarea } from '../components/primitives.jsx'
import Icon from '../components/Icon.jsx'
import { fileUrl, processListingImage, uploadMedia } from '../lib/media.js'
import {
  AREA_UNITS, BHK, CATEGORIES, CONSULTING_OPTIONS, COUNT_0_3, COUNT_0_4, COUNT_1_4,
  DEALS, DEPOSIT_OPTIONS, FACING, LOCKIN_OPTIONS, MAINTENANCE_MODE, OPEN_SIDES,
  OWNERSHIP, PAINTING_CHARGES, POSSESSION, PRICE_INCLUDES, STATUS, SUBTYPES,
  TENANT_TYPES, TRANSACTION, appliesTo, isPlot,
} from '../data/propertyFields.js'

// ============================================================================
// 🏗️ PropertyWizard — the stepped add/edit PAGE (spec: properties.md C-add)
// ============================================================================
// A page, not a modal: the schema is portal-grade and a modal can't hold it
// without becoming a cramped scroll-trap where half-entered data is one
// stray click from gone.
//
// THREE steps, not seven. A listing portal splits this finely because its
// funnel benefits from small commitments, but a portal is optimising for
// PUBLISHING to consumers. A CRM is optimising for the property being
// MATCHABLE — a broker takes an owner's call and needs the unit in inventory
// before hanging up. So the steps follow what a broker holds in their head as
// one thought: what the property is, what it costs, everything else.
//
// The save line sits after step ②, because ①+② are exactly what the matching
// engine reads (deal, locality, config, area, price). The moment those exist
// the property starts surfacing against live leads; step ③ is enrichment that
// realistically happens days later, from a car park, after a site visit.
//
// Owner is deliberately NOT in this flow. It's an internal link attached from
// the property record later — nobody has the owner's full details to hand
// while typing a listing in.
//
// Edit reuses this exact page (spec: "Edit reuses the same page"), so there is
// one form to maintain rather than an add flow and a divergent edit flow.
// ============================================================================

const STEPS = [
  { key: 'property', label: 'Property', hint: 'What and where' },
  { key: 'price', label: 'Price & terms', hint: 'What it costs' },
  { key: 'details', label: 'Details & media', hint: 'Everything else' },
]

const DRAFT_KEY = 'crm_property_draft'

// ---- small inputs, driven by the canonical vocabulary ----------------------

function Chips({ options, value, onChange, allowClear = true }) {
  return (
    <div className="pw-chips">
      {options.map(o => (
        <button
          key={o.value}
          type="button"
          className={'qchip' + (value === o.value ? ' on' : '')}
          onClick={() => onChange(allowClear && value === o.value ? '' : o.value)}
        >{o.label}</button>
      ))}
    </div>
  )
}

function MultiChips({ options, value = [], onChange }) {
  const set = new Set(value)
  return (
    <div className="pw-chips">
      {options.map(o => (
        <button
          key={o.value}
          type="button"
          className={'qchip' + (set.has(o.value) ? ' on' : '')}
          onClick={() => {
            const next = new Set(set)
            next.has(o.value) ? next.delete(o.value) : next.add(o.value)
            onChange([...next])
          }}
        >{o.label}</button>
      ))}
    </div>
  )
}

// ---- completeness ----------------------------------------------------------
// Deliberately NOT the portal's score. A portal scores consumer appeal (their
// reference gives +20% for identity "Verify"). A CRM should score whether the
// listing is WORKABLE: can I match it, price it, show it? Missing a photo is
// mild — you can still match and call. Missing a price is severe.
const SCORE_WEIGHTS = [
  { key: 'deal', weight: 10, has: f => !!f.deal },
  { key: 'subtype', weight: 10, has: f => !!f.subtype },
  { key: 'locality', weight: 15, has: f => !!f.locality },
  { key: 'config', weight: 15, has: f => !!f.bhk || isPlot(f.subtype) },
  { key: 'area', weight: 10, has: f => !!(f.carpet || f.builtup || f.superBuiltup || f.plotArea) },
  { key: 'price', weight: 20, has: f => !!f.price },
  // Enrichment, weighted light on purpose — you can match and call a lead
  // without any of it, which is the test that matters for a CRM.
  { key: 'furnishing', weight: 4, has: f => !!f.furnishType },
  { key: 'amenities', weight: 4, has: f => (f.societyAmenities || []).length > 0 },
  { key: 'description', weight: 4, has: f => !!(f.description || '').trim() },
  { key: 'access', weight: 4, has: f => !!(f.keyAccess || '').trim() },
  { key: 'photos', weight: 4, has: f => (f.media || []).length > 0 },
]

function scoreOf(f) {
  return SCORE_WEIGHTS.reduce((n, w) => n + (w.has(f) ? w.weight : 0), 0)
}

// Which step each scored thing lives on, so the rail can show what a step is
// still worth — the one idea worth keeping from the reference's rail.
const STEP_SCORE = {
  property: ['deal', 'subtype', 'locality', 'config', 'area'],
  price: ['price'],
  details: ['furnishing', 'amenities', 'description', 'access', 'photos'],
}

function stepRemaining(stepKey, f) {
  return SCORE_WEIGHTS
    .filter(w => STEP_SCORE[stepKey].includes(w.key) && !w.has(f))
    .reduce((n, w) => n + w.weight, 0)
}

const blank = () => ({
  deal: 'sale', category: 'residential', subtype: 'apartment',
  status: 'Available', areaUnit: 'sqft',
  fixtures: [], countedItems: {}, societyAmenities: [],
  preferredTenants: [], priceIncludes: [],
})


// ---- photos ----------------------------------------------------------------
// Unlike the visit-proof camera (B4), the gallery IS allowed here: listing
// photos are normally shot earlier, or supplied by the owner, and there is
// nothing to prove — the constraint there was about authenticity, which
// doesn't apply to marketing images.
//
// Every image is resized and watermarked ON THE DEVICE before upload, then
// PUT straight to R2. Only the object key is stored.
function MediaPicker({ media = [], firmName, onChange, onError }) {
  const [busy, setBusy] = useState(0)

  const add = async (files) => {
    const list = [...files].filter(f => f.type.startsWith('image/'))
    if (!list.length) return
    setBusy(list.length)
    const added = []
    for (const file of list) {
      try {
        const { blob, width, height } = await processListingImage(file, firmName)
        const key = await uploadMedia(blob, 'property')
        added.push({ key, kind: 'photo', w: width, h: height, at: new Date().toISOString() })
      } catch (e) {
        onError?.(e.message || 'That photo could not be uploaded')
      } finally {
        setBusy(n => n - 1)
      }
    }
    if (added.length) onChange([...media, ...added])
  }

  return (
    <div className="mp">
      <div className="mp-grid">
        {media.map((m, i) => (
          <div key={m.key} className="mp-item">
            <img src={fileUrl(m.key)} alt="" loading="lazy" />
            {i === 0 && <span className="mp-cover">Cover</span>}
            <button type="button" className="mp-x" aria-label="Remove photo"
              onClick={() => onChange(media.filter(x => x.key !== m.key))}>
              <Icon name="x" size={12} />
            </button>
          </div>
        ))}
        <label className="mp-add">
          <input type="file" accept="image/*" multiple hidden
            onChange={e => { add(e.target.files); e.target.value = '' }} />
          <Icon name="plus" size={17} />
          <span>{busy > 0 ? `Uploading ${busy}…` : 'Add photos'}</span>
        </label>
      </div>
      <div className="pw-hint mp-hint">
        The first photo is the cover. Each one is watermarked before it uploads.
      </div>
    </div>
  )
}

export default function PropertyWizard({ store, go, sel, topBar }) {
  const editing = sel?.propId ? store.state.properties.find(p => p.id === sel.propId) : null
  const [step, setStep] = useState(0)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState(() => {
    if (editing) return { ...blank(), ...editing }
    // A half-typed listing survives a refresh or an accidental navigation —
    // losing it is the exact failure the modal was retired for.
    try {
      const raw = localStorage.getItem(DRAFT_KEY)
      if (raw) return { ...blank(), ...JSON.parse(raw) }
    } catch { /* corrupt draft is not worth crashing over */ }
    return blank()
  })

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const applies = appliesTo(form)
  const score = scoreOf(form)

  // Persist the draft on every change — but never for an edit, or a half-made
  // change to an existing listing would resurface as a "new property" draft.
  useEffect(() => {
    if (editing) return
    try { localStorage.setItem(DRAFT_KEY, JSON.stringify(form)) } catch { /* quota */ }
  }, [form, editing])

  const subtypes = SUBTYPES[form.category] || SUBTYPES.residential

  // The minimum that makes a listing matchable at all.
  const missing = useMemo(() => {
    const m = []
    if (!form.locality) m.push('locality')
    if (!form.subtype) m.push('property type')
    if (applies.bhk && !form.bhk) m.push('configuration')
    if (!form.price) m.push('price')
    return m
  }, [form, applies.bhk])

  const close = () => go('properties', { propAdd: false, propId: null })

  const save = async () => {
    if (missing.length) { store.toast(`Add the ${missing[0]} first`, 'warn'); return }
    setSaving(true)
    const payload = { ...form, completeness: score }
    try {
      if (editing) {
        store.updateProp(editing.id, payload)
        store.toast('Property updated')
        close()
      } else {
        // Only clear the draft and leave the page once the server has actually
        // taken it. Closing on a failed request threw the entry away.
        const created = await store.addProperty(payload)
        if (!created) return
        try { localStorage.removeItem(DRAFT_KEY) } catch { /* nothing to clear */ }
        close()
      }
    } finally {
      setSaving(false)
    }
  }

  const discard = () => {
    if (!editing && !window.confirm('Discard this draft?')) return
    if (!editing) { try { localStorage.removeItem(DRAFT_KEY) } catch { /* nothing to clear */ } }
    close()
  }

  return (
    <>
      {topBar({
        eyebrow: editing ? 'Edit property' : 'New property',
        title: form.society || form.project || (editing ? editing.society : 'Add a property'),
        onBack: close,
      })}
      <div className="app-body">
        <div className="pw">
          {/* ---- rail ---- */}
          <aside className="pw-rail">
            <div className="pw-rail-head">
              <div className="pw-rail-t">{editing ? 'Edit listing' : 'Post a listing'}</div>
              <div className="pw-rail-s">{editing ? 'Changes save when you finish' : 'Saved as you go'}</div>
            </div>
            <div className="pw-score">
              <div className="pw-score-bar"><span style={{ width: `${score}%` }} /></div>
              <span className="pw-score-n">{score}% complete</span>
            </div>
            <ol className="pw-steps">
              {STEPS.map((s, i) => {
                const left = stepRemaining(s.key, form)
                return (
                  <li key={s.key} className={i === step ? 'on' : i < step ? 'done' : ''}>
                    <button type="button" onClick={() => setStep(i)}>
                      <span className="pw-dot">{i < step ? <Icon name="check" size={12} /> : i + 1}</span>
                      <span className="pw-step-b">
                        <span className="pw-step-l">{s.label}</span>
                        <span className="pw-step-h">{s.hint}</span>
                      </span>
                      {left > 0 && <span className="pw-step-score">+{left}%</span>}
                    </button>
                  </li>
                )
              })}
            </ol>
            <div className="pw-rail-foot">
              <button type="button" className="pw-discard" onClick={discard}>
                {editing ? 'Cancel' : 'Discard draft'}
              </button>
            </div>
          </aside>

          {/* ---- form ---- */}
          <div className="pw-main">
            {step === 0 && (
              <div className="pw-panel">
                <h3 className="pw-h">Property</h3>

                <Field label="Looking to"><Chips options={DEALS} value={form.deal} onChange={v => set('deal', v || 'sale')} allowClear={false} /></Field>
                <Field label="Category">
                  <Chips options={CATEGORIES} value={form.category} allowClear={false}
                    onChange={v => setForm(f => ({ ...f, category: v, subtype: '' }))} />
                </Field>
                <Field label="Property type"><Chips options={subtypes} value={form.subtype} onChange={v => set('subtype', v)} /></Field>

                <div className="pw-row">
                  <Field label="Project / society"><Input value={form.society || ''} onChange={e => set('society', e.target.value)} placeholder="Skyline Heights" /></Field>
                  <Field label="Locality"><Input value={form.locality || ''} onChange={e => set('locality', e.target.value)} placeholder="Wakad" /></Field>
                </div>
                <div className="pw-row">
                  <Field label="Tower / wing"><Input value={form.tower || ''} onChange={e => set('tower', e.target.value)} placeholder="B" /></Field>
                  <Field label="Unit no."><Input value={form.unit || ''} onChange={e => set('unit', e.target.value)} placeholder="701" /></Field>
                </div>

                {applies.bhk && <Field label="Configuration"><Chips options={BHK} value={form.bhk} onChange={v => set('bhk', v)} /></Field>}

                <div className="pw-row pw-row-3">
                  <Field label="Carpet area"><Input type="number" value={form.carpet || ''} onChange={e => set('carpet', e.target.value)} /></Field>
                  <Field label="Built-up"><Input type="number" value={form.builtup || ''} onChange={e => set('builtup', e.target.value)} /></Field>
                  <Field label="Super built-up"><Input type="number" value={form.superBuiltup || ''} onChange={e => set('superBuiltup', e.target.value)} /></Field>
                </div>
                <Field label="Area unit"><Chips options={AREA_UNITS} value={form.areaUnit} onChange={v => set('areaUnit', v || 'sqft')} allowClear={false} /></Field>

                {applies.plotFields && (
                  <>
                    <div className="pw-row">
                      <Field label="Plot area"><Input type="number" value={form.plotArea || ''} onChange={e => set('plotArea', e.target.value)} /></Field>
                      <Field label="Road width (ft)"><Input type="number" value={form.roadWidthFt || ''} onChange={e => set('roadWidthFt', e.target.value)} /></Field>
                    </div>
                    <div className="pw-row">
                      <Field label="Floors allowed"><Input type="number" value={form.floorsAllowed || ''} onChange={e => set('floorsAllowed', e.target.value)} /></Field>
                      <Field label="Open sides"><Chips options={OPEN_SIDES} value={form.openSides} onChange={v => set('openSides', v)} /></Field>
                    </div>
                  </>
                )}

                {applies.floors && (
                  <div className="pw-row">
                    {/* Free text, not a number picker — "G+2", "Ground" and
                        "Stilt" are all real answers a broker gives. */}
                    <Field label="Floor"><Input value={form.floor || ''} onChange={e => set('floor', e.target.value)} placeholder="3, Ground, G+2" /></Field>
                    <Field label="Total floors"><Input type="number" value={form.totalFloors || ''} onChange={e => set('totalFloors', e.target.value)} /></Field>
                  </div>
                )}

                {applies.bathrooms && <Field label="Bathrooms"><Chips options={COUNT_1_4} value={form.bathrooms} onChange={v => set('bathrooms', v)} /></Field>}
                {applies.balconies && <Field label="Balconies"><Chips options={COUNT_0_4} value={form.balconies} onChange={v => set('balconies', v)} /></Field>}

                <div className="pw-row">
                  <Field label="Covered parking"><Chips options={COUNT_0_3} value={form.coveredParking} onChange={v => set('coveredParking', v)} /></Field>
                  <Field label="Open parking"><Chips options={COUNT_0_3} value={form.openParking} onChange={v => set('openParking', v)} /></Field>
                </div>

                <Field label="Facing"><Chips options={FACING} value={form.facing} onChange={v => set('facing', v)} /></Field>
                <Field label="Ownership"><Chips options={OWNERSHIP} value={form.ownership} onChange={v => set('ownership', v)} /></Field>
                <div className="pw-row">
                  <Field label="Transaction"><Chips options={TRANSACTION} value={form.transactionType} onChange={v => set('transactionType', v)} /></Field>
                  <Field label="Possession"><Chips options={POSSESSION} value={form.possession} onChange={v => set('possession', v)} /></Field>
                </div>
                <div className="pw-row">
                  <Field label="Age of property (years)"><Input type="number" value={form.age || ''} onChange={e => set('age', e.target.value)} /></Field>
                  <Field label="RERA ID"><Input value={form.rera || ''} onChange={e => set('rera', e.target.value)} /></Field>
                </div>
                {applies.servantRoom && (
                  <Field label="Servant room">
                    <Chips options={[{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }]}
                      value={form.servantRoom === true ? 'yes' : form.servantRoom === false ? 'no' : ''}
                      onChange={v => set('servantRoom', v === 'yes' ? true : v === 'no' ? false : null)} />
                  </Field>
                )}
              </div>
            )}

            {step === 1 && (
              <div className="pw-panel">
                <h3 className="pw-h">Price &amp; terms</h3>

                <Field label={applies.rentTerms ? 'Monthly rent' : 'Expected price'}>
                  <Input value={form.price || ''} onChange={e => set('price', e.target.value)} placeholder={applies.rentTerms ? '45000' : '9500000'} />
                </Field>
                <Field label="Price quoted on">
                  <Chips options={[{ value: 'carpet', label: 'Carpet' }, { value: 'builtup', label: 'Built-up' }, { value: 'super_builtup', label: 'Super built-up' }]}
                    value={form.priceAreaBasis} onChange={v => set('priceAreaBasis', v)} />
                </Field>

                {applies.rentTerms && (
                  <>
                    <Field label="Security deposit"><Chips options={DEPOSIT_OPTIONS} value={form.depositOption} onChange={v => set('depositOption', v)} /></Field>
                    {form.depositOption === 'custom' && (
                      <Field label="Deposit amount"><Input type="number" value={form.depositAmount || ''} onChange={e => set('depositAmount', e.target.value)} /></Field>
                    )}
                    <Field label="Lock-in period"><Chips options={LOCKIN_OPTIONS} value={form.lockinOption} onChange={v => set('lockinOption', v)} /></Field>
                    {form.lockinOption === 'custom' && (
                      <Field label="Lock-in (months)"><Input type="number" value={form.lockinMonths || ''} onChange={e => set('lockinMonths', e.target.value)} /></Field>
                    )}
                    <Field label="Maintenance"><Chips options={MAINTENANCE_MODE} value={form.maintenanceMode} onChange={v => set('maintenanceMode', v)} /></Field>
                    {form.maintenanceMode === 'separate' && (
                      <Field label="Maintenance amount"><Input type="number" value={form.maintenanceAmount || ''} onChange={e => set('maintenanceAmount', e.target.value)} /></Field>
                    )}
                    <Field label="Parking charges"><Chips options={MAINTENANCE_MODE} value={form.parkingChargesMode} onChange={v => set('parkingChargesMode', v)} /></Field>
                    <Field label="Painting charges"><Chips options={PAINTING_CHARGES} value={form.paintingCharges} onChange={v => set('paintingCharges', v)} /></Field>
                    <Field label="Available from"><Input type="date" value={form.availableFrom || ''} onChange={e => set('availableFrom', e.target.value)} /></Field>
                    {applies.tenantPreference && (
                      <>
                        <Field label="Preferred tenants"><MultiChips options={TENANT_TYPES} value={form.preferredTenants} onChange={v => set('preferredTenants', v)} /></Field>
                        <Field label="Pet friendly">
                          <Chips options={[{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }]}
                            value={form.petFriendly === true ? 'yes' : form.petFriendly === false ? 'no' : ''}
                            onChange={v => set('petFriendly', v === 'yes' ? true : v === 'no' ? false : null)} />
                        </Field>
                      </>
                    )}
                  </>
                )}

                {applies.saleTerms && (
                  <>
                    <Field label="Price includes"><MultiChips options={PRICE_INCLUDES} value={form.priceIncludes} onChange={v => set('priceIncludes', v)} /></Field>
                    <div className="pw-row">
                      <Field label="Other charges"><Input type="number" value={form.otherCharges || ''} onChange={e => set('otherCharges', e.target.value)} /></Field>
                      <Field label="Booking / token amount"><Input type="number" value={form.bookingAmount || ''} onChange={e => set('bookingAmount', e.target.value)} /></Field>
                    </div>
                  </>
                )}

                <Field label="Consulting">
                  <Chips options={CONSULTING_OPTIONS} value={form.consultingOption} onChange={v => set('consultingOption', v)} />
                </Field>
                <div className="pw-row">
                  <Field label="Consulting %"><Input type="number" value={form.consultingPercent || ''} onChange={e => set('consultingPercent', e.target.value)} /></Field>
                  <Field label="Tax">
                    {/* A LABEL, not arithmetic — we never compute tax. If it's
                        excluded, the broker enters the final figure themselves. */}
                    <Chips options={[{ value: 'incl', label: 'Included' }, { value: 'excl', label: 'Excluded' }]}
                      value={form.taxIncluded === true ? 'incl' : form.taxIncluded === false ? 'excl' : ''}
                      onChange={v => set('taxIncluded', v === 'incl' ? true : v === 'excl' ? false : null)} />
                  </Field>
                </div>
                <Field label="Listing status"><Chips options={STATUS} value={form.status} onChange={v => set('status', v || 'Available')} allowClear={false} /></Field>
              </div>
            )}

            {step === 2 && (
              <div className="pw-panel">
                <h3 className="pw-h">Details &amp; media</h3>

                {applies.furnishing && (
                  <>
                    <Field label="Furnishing">
                      <Chips options={[{ value: 'full', label: 'Fully Furnished' }, { value: 'semi', label: 'Semi Furnished' }, { value: 'none', label: 'Unfurnished' }]}
                        value={form.furnishType} onChange={v => set('furnishType', v)} />
                    </Field>
                    {form.furnishType && form.furnishType !== 'none' && (
                      <Button variant="secondary" icon="plus" onClick={() => store.openModal({
                        kind: 'amenities',
                        value: { fixtures: form.fixtures, countedItems: form.countedItems, societyAmenities: form.societyAmenities },
                        onDone: (v) => setForm(f => ({ ...f, ...v })),
                      })}>
                        Add furnishings &amp; amenities
                        {(form.fixtures?.length || 0) + (form.societyAmenities?.length || 0) > 0 &&
                          <span className="pw-count"> · {(form.fixtures?.length || 0) + (form.societyAmenities?.length || 0)} selected</span>}
                      </Button>
                    )}
                  </>
                )}

                <Field label="Key / access">
                  <Input value={form.keyAccess || ''} onChange={e => set('keyAccess', e.target.value)}
                    placeholder="Who holds the keys, best time to visit" />
                </Field>

                <Field label="Description">
                  <Textarea value={form.description || ''} onChange={e => set('description', e.target.value.slice(0, 1500))}
                    rows={5} placeholder="What makes this one worth seeing?" />
                  <div className="pw-hint">{(form.description || '').length} / 1500</div>
                </Field>

                <Field label="Photos">
                  <MediaPicker
                    media={form.media || []}
                    firmName={store.state.settings.firmName}
                    onChange={v => set('media', v)}
                    onError={m => store.toast(m, 'warn')}
                  />
                </Field>
              </div>
            )}

            {/* ---- footer ---- */}
            <div className="pw-foot">
              <div className="pw-foot-l">
                {step > 0 && <Button variant="ghost" onClick={() => setStep(s => s - 1)}>Back</Button>}
              </div>
              <div className="pw-foot-r">
                {missing.length > 0 && step >= 1 && (
                  <span className="pw-missing">Needs {missing.join(', ')}</span>
                )}
                {step < STEPS.length - 1 && <Button variant="secondary" onClick={() => setStep(s => s + 1)}>Next</Button>}
                {/* Savable from step ② onward — ①+② are what matching reads,
                    so there is no reason to hold the listing hostage to
                    furnishing details the broker doesn't have yet. */}
                {step >= 1 && (
                  <Button variant="primary" disabled={saving || missing.length > 0} onClick={save}>
                    {saving ? 'Saving…' : editing ? 'Save changes' : 'Save property'}
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
