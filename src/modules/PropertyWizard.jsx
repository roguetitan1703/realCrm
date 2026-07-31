import { useEffect, useMemo, useRef, useState } from 'react'
import { Button, Field, Input, Textarea } from '../components/primitives.jsx'
import Icon from '../components/Icon.jsx'
import Lightbox from '../components/Lightbox.jsx'
import { fileUrl, processListingImage, uploadMedia } from '../lib/media.js'
import {
  AREA_UNITS, BACHELOR_PREF, BHK_COMMON, BHK_LARGE, BHK_MORE, CATEGORIES,
  CONSULTING_DAYS, CONSULTING_PERCENT, COUNT_0_3, DEALS, DEPOSIT_OPTIONS, FACING,
  LOCKIN_OPTIONS, MAINTENANCE_MODE, OPEN_SIDES, OWNERSHIP, PAINTING_CHARGES,
  POSSESSION, PRICE_INCLUDES, SUBTYPES, TENANT_TYPES, TRANSACTION,
  appliesTo, areaFieldsFor, countsFor, isPlot,
} from '../data/propertyFields.js'

// ============================================================================
// 🏗️ PropertyWizard — the stepped add/edit PAGE (spec: properties.md C-add)
// ============================================================================
// A page, not a modal: the schema is portal-grade and a modal can't hold it
// without becoming a cramped scroll-trap where half-entered data is one stray
// click from gone.
//
// THREE steps, not seven. A listing portal splits this finely because its
// funnel benefits from small commitments, but a portal is optimising for
// PUBLISHING to consumers. A CRM is optimising for the property being
// MATCHABLE — a broker takes an owner's call and needs the unit in inventory
// before hanging up. So the steps follow what a broker holds in their head as
// one thought: what the property is, what it costs, everything else.
//
// THE GOVERNING RULE, and the one this form previously broke: never show a
// field whose answer is already implied. Ownership on a rental, a percentage
// fee on a let, a super built-up figure on a villa, "4+ bathrooms" on a 1 RK —
// each was a question the data had already answered. Every one of those is now
// derived in `appliesTo()` (src/data/propertyFields.js), so the form shrinks to
// fit the property instead of the property being read out of a fixed form.
// That's also why this file has almost no conditionals of its own: the rules
// live in the vocabulary, where the filters and the score can read them too.
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
          className={'pwc' + (value === o.value ? ' on' : '')}
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
          className={'pwc' + (set.has(o.value) ? ' on' : '')}
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

function YesNo({ value, onChange }) {
  return (
    <Chips
      options={[{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }]}
      value={value === true ? 'yes' : value === false ? 'no' : ''}
      onChange={v => onChange(v === 'yes' ? true : v === 'no' ? false : null)}
    />
  )
}

/**
 * Configuration, in tiers. Three chips at rest, because three chips cover most
 * of the market; the rest expand on demand and the very large sizes only
 * appear once you've already said "5 BHK", where they stop being absurd. The
 * expansion stays open once a hidden value is selected, so re-opening the form
 * on an edit never hides the answer it's showing.
 */
function BhkPicker({ value, onChange }) {
  const inMore = BHK_MORE.some(o => o.value === value) || value === '5plus'
  const inLarge = BHK_LARGE.some(o => o.value === value)
  const [open, setOpen] = useState(inMore || inLarge)
  const [large, setLarge] = useState(inLarge)

  return (
    <div className="pw-chips">
      {BHK_COMMON.map(o => (
        <button key={o.value} type="button" className={'pwc' + (value === o.value ? ' on' : '')}
          onClick={() => onChange(value === o.value ? '' : o.value)}>{o.label}</button>
      ))}
      {!open && <button type="button" className="pwc pwc-more" onClick={() => setOpen(true)}>More…</button>}
      {open && BHK_MORE.map(o => (
        <button key={o.value} type="button" className={'pwc' + (value === o.value ? ' on' : '')}
          onClick={() => onChange(value === o.value ? '' : o.value)}>{o.label}</button>
      ))}
      {open && !large && <button type="button" className="pwc pwc-more" onClick={() => setLarge(true)}>6+…</button>}
      {large && BHK_LARGE.map(o => (
        <button key={o.value} type="button" className={'pwc' + (value === o.value ? ' on' : '')}
          onClick={() => onChange(value === o.value ? '' : o.value)}>{o.label}</button>
      ))}
      {value === '5plus' && <button type="button" className="pwc on">5+ BHK</button>}
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

// What a second unit in the same building INHERITS. This is the whole point of
// "add another": a broker entering "6 flats in Tower B" describes the building
// once and then only says what differs per unit. Everything not listed here is
// unit-specific and gets cleared — carrying a previous unit's price or flat
// number into the next one would be worse than retyping it.
const SHARED_CONTEXT_KEYS = [
  'deal', 'category', 'subtype', 'society', 'project', 'locality', 'tower',
  'builder', 'possession', 'transactionType', 'ownership', 'areaUnit',
  'furnishType', 'fixtures', 'countedItems', 'societyAmenities',
  'consultingOption', 'consultingPercent', 'taxIncluded', 'maintenanceMode',
  'preferredTenants', 'bachelorPref', 'petFriendly', 'totalFloors', 'rera', 'keyAccess',
  // NOT owner/ownerPhone: two flats in one tower rarely share an owner, and
  // copying one owner onto the next unit is a wrong fact, not a shortcut.
]

const blank = () => ({
  deal: 'sale', category: 'residential', subtype: 'apartment',
  // Status is NOT asked for. A property being added is available by
  // definition — that's why it's being added. Everything after that
  // (token pending, under offer, sold) is an OUTCOME of the pipeline, set from
  // the record's lifecycle stepper where the change is dated and audited.
  // Asking at creation invites someone to type a status that never happened.
  status: 'Available',
  areaUnit: 'sqft',
  fixtures: [], countedItems: {}, societyAmenities: [],
  preferredTenants: [], priceIncludes: [],
})

const AREA_LABELS = {
  carpet: 'Carpet area', builtup: 'Built-up', superBuiltup: 'Super built-up', plotArea: 'Plot area',
}
// The row already says "Area", so the boxes under it only need to say which.
const AREA_SHORT = { carpet: 'Carpet', builtup: 'Built-up', superBuiltup: 'Super built-up', plotArea: 'Plot' }

// ---- media -----------------------------------------------------------------
// Unlike the visit-proof camera (B4), the gallery IS allowed here: listing
// photos are normally shot earlier, or supplied by the owner, and there is
// nothing to prove — the constraint there was about authenticity, which
// doesn't apply to marketing images.
//
// Uploads are tracked PER FILE, not per batch. Dropping twelve photos over a
// site's mobile signal and having the eighth fail is the normal case, and a
// batch-level "some failed" leaves you with no way to tell which or to fix it
// without starting over. Each tile carries its own state and its own retry,
// and holds on to the original File so a retry costs one request, not a
// re-pick.
const MAX_VIDEO_MB = 60

function MediaPicker({ media = [], firmName, onChange, onError }) {
  // In-flight and failed items only. Anything that succeeded lives in `media`
  // (the saved value) — keeping one list would mean the form's value could
  // hold a photo that isn't actually in R2.
  const [queue, setQueue] = useState([])
  const [drag, setDrag] = useState(false)
  const [viewing, setViewing] = useState(null)
  // Local object URLs, kept by key after upload so a tile shows the bitmap
  // already on the device rather than waiting on a round trip to R2 — the
  // reason an uploaded photo used to look like an empty box.
  const previews = useRef(new Map())
  const seq = useRef(0)
  // The list as it is RIGHT NOW. `upload` is created in one render and awaited
  // across several, so the `media` it closed over is stale by the time the
  // second file finishes — and `onChange([...media, second])` then wrote a list
  // that had never heard of the first. Uploading two photos kept exactly one.
  const latest = useRef(media)
  latest.current = media

  useEffect(() => () => { for (const url of previews.current.values()) URL.revokeObjectURL(url) }, [])

  const srcFor = (key) => previews.current.get(key) || fileUrl(key)

  const upload = async (item) => {
    setQueue(q => q.map(x => (x.id === item.id ? { ...x, status: 'uploading', error: '' } : x)))
    try {
      let blob = item.file
      let w, h
      if (item.kind === 'photo') {
        const done = await processListingImage(item.file, firmName)
        blob = done.blob; w = done.width; h = done.height
      }
      const key = await uploadMedia(blob, 'property')
      previews.current.set(key, URL.createObjectURL(blob))
      setQueue(q => q.filter(x => x.id !== item.id))
      const next = [...latest.current, {
        key, kind: item.kind, w, h, at: new Date().toISOString(),
        // Video leaves the device untouched: a browser cannot watermark one.
        // Recording that fact on the object is what lets a later server-side
        // pass find these and mark them, and lets sharing skip them until it
        // has. Storing it as "watermarked: false" rather than not storing it
        // means an unmarked file can never be mistaken for a marked one.
        ...(item.kind === 'video' ? { watermarked: false } : {}),
      }]
      latest.current = next
      onChange(next)
    } catch (e) {
      const msg = e.message || 'Upload failed'
      setQueue(q => q.map(x => (x.id === item.id ? { ...x, status: 'error', error: msg } : x)))
      onError?.(msg)
    }
  }

  const add = (files) => {
    const items = []
    for (const file of files) {
      const kind = file.type.startsWith('video/') ? 'video' : file.type.startsWith('image/') ? 'photo' : null
      if (!kind) { onError?.(`${file.name} is not a photo or a video`); continue }
      if (kind === 'video' && file.size > MAX_VIDEO_MB * 1024 * 1024) {
        onError?.(`${file.name} is over ${MAX_VIDEO_MB}MB — trim it or send it as a link`)
        continue
      }
      items.push({ id: `m${++seq.current}`, file, kind, status: 'queued', preview: URL.createObjectURL(file) })
    }
    if (!items.length) return
    setQueue(q => [...q, ...items])
    // Sequential, not parallel: an agent on site is on one bar of signal, and
    // twelve simultaneous PUTs is how you turn a slow upload into twelve
    // failed ones.
    items.reduce((p, item) => p.then(() => upload(item)), Promise.resolve())
  }

  const onDrop = (e) => {
    e.preventDefault(); setDrag(false)
    if (e.dataTransfer?.files?.length) add(e.dataTransfer.files)
  }

  const remove = (key) => {
    const url = previews.current.get(key)
    if (url) { URL.revokeObjectURL(url); previews.current.delete(key) }
    onChange(media.filter(x => x.key !== key))
  }

  const empty = !media.length && !queue.length

  return (
    <div className="mp">
      <div
        className={'mp-zone' + (drag ? ' drag' : '') + (empty ? ' empty' : '')}
        onDragOver={e => { e.preventDefault(); setDrag(true) }}
        onDragLeave={() => setDrag(false)}
        onDrop={onDrop}
      >
        {empty ? (
          <label className="mp-drop">
            <input type="file" accept="image/*,video/*" multiple hidden
              onChange={e => { add(e.target.files); e.target.value = '' }} />
            <Icon name="upload" size={22} />
            <strong>Drag photos and videos here</strong>
            <span>or</span>
            <span className="mp-browse">Browse files</span>
          </label>
        ) : (
          <>
            <div className="mp-grid">
              {media.map((m, i) => (
                <div key={m.key} className="mp-item">
                  <button type="button" className="mp-open" onClick={() => setViewing(i)}
                    aria-label={m.kind === 'video' ? 'Play video' : 'View photo'}>
                    {m.kind === 'video'
                      ? <span className="mp-vid"><Icon name="play" size={20} fill /></span>
                      : <img src={srcFor(m.key)} alt="" loading="lazy" />}
                  </button>
                  {i === 0 && <span className="mp-badge mp-cover">Cover</span>}
                  {m.kind === 'video' && <span className="mp-badge mp-vid-b">Video</span>}
                  <button type="button" className="mp-x" aria-label="Remove" onClick={() => remove(m.key)}>
                    <Icon name="x" size={12} />
                  </button>
                </div>
              ))}

              {queue.map(item => (
                <div key={item.id} className={'mp-item mp-' + item.status}>
                  {item.kind === 'photo'
                    ? <img src={item.preview} alt="" />
                    : <span className="mp-vid"><Icon name="play" size={20} fill /></span>}
                  {item.status !== 'error'
                    ? <span className="mp-state"><span className="mp-spin" />Uploading</span>
                    : (
                      <span className="mp-state mp-failed">
                        <Icon name="alert" size={12} />
                        <button type="button" onClick={() => upload(item)}>Retry</button>
                      </span>
                    )}
                  {item.status === 'error' && (
                    <button type="button" className="mp-x" aria-label="Discard"
                      onClick={() => { URL.revokeObjectURL(item.preview); setQueue(q => q.filter(x => x.id !== item.id)) }}>
                      <Icon name="x" size={12} />
                    </button>
                  )}
                </div>
              ))}

              <label className="mp-add">
                <input type="file" accept="image/*,video/*" multiple hidden
                  onChange={e => { add(e.target.files); e.target.value = '' }} />
                <Icon name="plus" size={17} />
                <span>Add more</span>
              </label>
            </div>
          </>
        )}
      </div>

      {viewing !== null && (
        <Lightbox items={media} index={viewing} srcFor={srcFor} onClose={() => setViewing(null)} />
      )}
    </div>
  )
}

export default function PropertyWizard({ store, go, sel, topBar }) {
  const editing = sel?.propId ? store.state.properties.find(p => p.id === sel.propId) : null
  const [step, setStep] = useState(0)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState(() => {
    if (editing) return { ...blank(), ...editing }
    // Arriving from a project's page: start inside that project.
    if (sel?.propProject) return { ...blank(), society: sel.propProject, project: sel.propProject }
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
  const rent = applies.rentTerms
  const counts = countsFor(form.bhk)
  const areaFields = areaFieldsFor(form)

  // Persist the draft on every change — but never for an edit, or a half-made
  // change to an existing listing would resurface as a "new property" draft.
  useEffect(() => {
    if (editing) return
    try { localStorage.setItem(DRAFT_KEY, JSON.stringify(form)) } catch { /* quota */ }
  }, [form, editing])

  const subtypes = SUBTYPES[form.category] || SUBTYPES.residential

  // Picking a configuration proposes the bathroom count that goes with it. A
  // 3 BHK with 3 bathrooms is right often enough to be worth pre-filling and
  // it's one tap to change — but only ever when the field is still empty, so
  // this can't overwrite something a person actually chose.
  const setBhk = (v) => setForm(f => ({
    ...f,
    bhk: v,
    bathrooms: f.bathrooms || (v ? countsFor(v).defaultBathrooms : ''),
  }))

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

  const save = async (again = false) => {
    if (missing.length) { store.toast(`Add the ${missing[0]} first`, 'warn'); return }
    setSaving(true)
    const payload = { ...form, completeness: score }
    try {
      if (editing) {
        store.updateProp(editing.id, payload)
        store.toast('Property updated')
        close()
        return
      }
      // Only clear the draft and leave the page once the server has actually
      // taken it. Closing on a failed request threw the entry away.
      const created = await store.addProperty(payload)
      if (!created) return
      try { localStorage.removeItem(DRAFT_KEY) } catch { /* nothing to clear */ }

      if (again) {
        const next = blank()
        for (const k of SHARED_CONTEXT_KEYS) if (form[k] !== undefined) next[k] = form[k]
        setForm(next)
        setStep(0)
        store.toast(`Saved. Next unit in ${form.society || form.project || 'this project'}.`)
        return
      }
      close()
    } finally {
      setSaving(false)
    }
  }

  const discard = () => {
    if (!editing && !window.confirm('Discard this draft?')) return
    if (!editing) { try { localStorage.removeItem(DRAFT_KEY) } catch { /* nothing to clear */ } }
    close()
  }

  const openAmenities = () => store.openModal({
    kind: 'amenities',
    // Unfurnished still has a lift, a gym and a gate — those belong to the
    // society, not the flat. What it does NOT have is furniture, so the
    // furnishing half of the picker is dropped rather than shown empty.
    only: form.furnishType === 'none' ? 'society' : 'all',
    value: { fixtures: form.fixtures, countedItems: form.countedItems, societyAmenities: form.societyAmenities },
    onDone: (v) => setForm(f => ({ ...f, ...v })),
  })
  const amenityCount = (form.fixtures?.length || 0) + (form.societyAmenities?.length || 0) +
    Object.keys(form.countedItems || {}).length

  return (
    <>
      {topBar({
        eyebrow: editing ? 'Edit property' : 'New property',
        title: form.society || form.project || (editing ? editing.society : 'Add a property'),
        onBack: close,
      })}
      {/* NOT another `.app-body` — the shell already renders one around this,
          and nesting a second meant the outer one kept the scroll while the
          inner had no height to fill. `.pw-page` claims the height the shell
          already has, so the card is capped to the viewport and the form is
          the only thing that scrolls. */}
      <div className="pw-page">
        {/* One card holds both columns and fills the screen. Only the form
            column scrolls, inside it — so the steps, the progress and the save
            line never leave the viewport and nothing outside the card moves. */}
        <div className="pw">
         <div className="pw-shell">
          {/* ---- rail ---- */}
          <aside className="pw-rail">
            <div className="pw-rail-head">
              <div className="pw-rail-t">{editing ? 'Edit listing' : 'Add a property'}</div>
              <div className="pw-rail-s">{editing ? 'Changes save when you finish' : 'Saved as you go'}</div>
            </div>
            {/* Quiet by spec: an internal indicator, not a "complete your
                profile" nag. A hairline and a muted line — no per-step "+20%"
                prompts, which turned a CRM form into a points game. */}
            <div className="pw-score">
              <div className="pw-score-bar"><span style={{ width: `${score}%` }} /></div>
              <span className="pw-score-n">{score}% complete</span>
            </div>
            {/* A connector runs between the markers so this reads as ONE
                sequence you move along, not three separate places you can be. */}
            <ol className="pw-steps">
              {STEPS.map((s, i) => {
                return (
                  <li key={s.key} className={i === step ? 'on' : i < step ? 'done' : ''}>
                    <button type="button" onClick={() => setStep(i)}>
                      <span className="pw-mark">
                        <span className="pw-dot">{i < step ? <Icon name="check" size={13} /> : i + 1}</span>
                      </span>
                      <span className="pw-step-b">
                        <span className="pw-step-l">{s.label}</span>
                        <span className="pw-step-h">{s.hint}</span>
                      </span>
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
           <div className="pw-scroll">
            {step === 0 && (
              <div className="pw-panel">
                <div className="pw-grp">
                  <Field label="Looking to" required>
                    <Chips options={DEALS} value={form.deal} onChange={v => set('deal', v || 'sale')} allowClear={false} />
                  </Field>
                  <Field label="Category" required>
                    <Chips options={CATEGORIES} value={form.category} allowClear={false}
                      onChange={v => setForm(f => ({ ...f, category: v, subtype: '' }))} />
                  </Field>
                  <Field label="Property type" required>
                    <Chips options={subtypes} value={form.subtype} onChange={v => set('subtype', v)} />
                  </Field>
                </div>

                <div className="pw-grp">
                  <div className="pw-grp-t">Where it is</div>
                  <div className="pw-row">
                    <Field label="Project / society"><Input value={form.society || ''} onChange={e => set('society', e.target.value)} placeholder="Skyline Heights" /></Field>
                    <Field label="Locality" required><Input value={form.locality || ''} onChange={e => set('locality', e.target.value)} placeholder="Wakad" /></Field>
                  </div>
                  {applies.floors ? (
                    <div className="pw-row pw-row-3">
                      <Field label="Tower / wing"><Input value={form.tower || ''} onChange={e => set('tower', e.target.value)} placeholder="B" /></Field>
                      {/* Free text, not a number picker — "G+2", "Ground" and
                          "Stilt" are all real answers a broker gives. */}
                      <Field label="Floor"><Input value={form.floor || ''} onChange={e => set('floor', e.target.value)} placeholder="3, Ground" /></Field>
                      <Field label="Total floors"><Input type="number" value={form.totalFloors || ''} onChange={e => set('totalFloors', e.target.value)} /></Field>
                    </div>
                  ) : (
                    <Field label="Tower / wing"><Input value={form.tower || ''} onChange={e => set('tower', e.target.value)} placeholder="B" /></Field>
                  )}
                </div>

                <div className="pw-grp">
                  <div className="pw-grp-t">Size and layout</div>
                  {applies.bhk && (
                    <Field label="Configuration" required>
                      <BhkPicker value={form.bhk} onChange={setBhk} />
                    </Field>
                  )}

                  {/* One unit for the whole row. Nobody quotes carpet in
                      sq.ft and built-up in sq.m for the same flat, so three
                      identical switches were three chances to disagree with
                      yourself — and read as clutter besides. */}
                  <div className="pw-areas">
                    <div className="pw-areas-h">
                      <span>Area<i className="req" aria-hidden="true">*</i></span>
                      <div className="pw-unit-sw">
                        {AREA_UNITS.map(u => (
                          <button key={u.value} type="button" className={form.areaUnit === u.value ? 'on' : ''}
                            onClick={() => set('areaUnit', u.value)}>{u.label}</button>
                        ))}
                      </div>
                    </div>
                    <div className={'pw-row' + (areaFields.length > 2 ? ' pw-row-3' : '')}>
                      {areaFields.map(k => (
                        <label key={k} className="pw-area">
                          <Input type="number" value={form[k] || ''} onChange={e => set(k, e.target.value)} placeholder="0" />
                          <span>{AREA_SHORT[k]}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  {(applies.bathrooms || applies.balconies) && (
                    <div className="pw-row">
                      {applies.bathrooms && <Field label="Bathrooms"><Chips options={counts.bathrooms} value={form.bathrooms} onChange={v => set('bathrooms', v)} /></Field>}
                      {applies.balconies && <Field label="Balconies"><Chips options={counts.balconies} value={form.balconies} onChange={v => set('balconies', v)} /></Field>}
                    </div>
                  )}

                  {applies.plotFields && (
                    <div className="pw-row pw-row-3">
                      <Field label="Road width (ft)"><Input type="number" value={form.roadWidthFt || ''} onChange={e => set('roadWidthFt', e.target.value)} /></Field>
                      <Field label="Floors allowed"><Input type="number" value={form.floorsAllowed || ''} onChange={e => set('floorsAllowed', e.target.value)} /></Field>
                      <Field label="Open sides"><Chips options={OPEN_SIDES} value={form.openSides} onChange={v => set('openSides', v)} /></Field>
                    </div>
                  )}

                  <div className="pw-row">
                    <Field label="Covered parking"><Chips options={COUNT_0_3} value={form.coveredParking} onChange={v => set('coveredParking', v)} /></Field>
                    <Field label="Open parking"><Chips options={COUNT_0_3} value={form.openParking} onChange={v => set('openParking', v)} /></Field>
                  </div>

                  {applies.servantRoom && <Field label="Servant room"><YesNo value={form.servantRoom} onChange={v => set('servantRoom', v)} /></Field>}
                </div>

                <div className="pw-grp">
                  <div className="pw-grp-t">Title and status</div>
                  <Field label="Facing"><Chips options={FACING} value={form.facing} onChange={v => set('facing', v)} /></Field>
                  {applies.transaction && <Field label="Transaction"><Chips options={TRANSACTION} value={form.transactionType} onChange={v => set('transactionType', v)} /></Field>}
                  {applies.possession && <Field label="Possession"><Chips options={POSSESSION} value={form.possession} onChange={v => set('possession', v)} /></Field>}
                  {/* Title only matters where title changes hands. A tenant
                      never takes it, so this is absent on a let. */}
                  {applies.ownership && <Field label="Ownership"><Chips options={OWNERSHIP} value={form.ownership} onChange={v => set('ownership', v)} /></Field>}
                  {(applies.age || applies.rera) && (
                    <div className="pw-row">
                      {applies.age && <Field label="Age of property (years)"><Input type="number" value={form.age || ''} onChange={e => set('age', e.target.value)} /></Field>}
                      {applies.rera && <Field label="RERA ID"><Input value={form.rera || ''} onChange={e => set('rera', e.target.value)} /></Field>}
                    </div>
                  )}
                </div>
              </div>
            )}

            {step === 1 && (
              <div className="pw-panel">
                <div className="pw-grp">
                  <div className="pw-row">
                    <Field label={rent ? 'Monthly rent' : 'Expected price'} required>
                      <Input value={form.price || ''} onChange={e => set('price', e.target.value)} placeholder={rent ? '45,000' : '95,00,000'} />
                    </Field>
                    {/* Which area the rate is quoted against — a sale concept.
                        Nobody quotes a rent per square foot on a flat, and it
                        only means anything once there IS an area to divide by. */}
                    {!rent && areaFields.length > 1 && (
                      <Field label="Price quoted on">
                        <Chips options={areaFields.map(k => ({ value: k === 'superBuiltup' ? 'super_builtup' : k, label: AREA_LABELS[k] }))}
                          value={form.priceAreaBasis} onChange={v => set('priceAreaBasis', v)} />
                      </Field>
                    )}
                  </div>
                </div>

                {rent && (
                  <div className="pw-grp">
                    <div className="pw-grp-t">Rent terms</div>
                    <div className="pw-row">
                      <Field label="Security deposit">
                        <Chips options={DEPOSIT_OPTIONS} value={form.depositOption} onChange={v => set('depositOption', v)} />
                      </Field>
                      {form.depositOption === 'custom' &&
                        <Field label="Deposit amount"><Input type="number" value={form.depositAmount || ''} onChange={e => set('depositAmount', e.target.value)} /></Field>}
                    </div>
                    <div className="pw-row">
                      <Field label="Lock-in period"><Chips options={LOCKIN_OPTIONS} value={form.lockinOption} onChange={v => set('lockinOption', v)} /></Field>
                      {form.lockinOption === 'custom' &&
                        <Field label="Lock-in (months)"><Input type="number" value={form.lockinMonths || ''} onChange={e => set('lockinMonths', e.target.value)} /></Field>}
                    </div>
                    <div className="pw-row">
                      <Field label="Maintenance"><Chips options={MAINTENANCE_MODE} value={form.maintenanceMode} onChange={v => set('maintenanceMode', v)} /></Field>
                      {form.maintenanceMode === 'separate' &&
                        <Field label="Maintenance amount"><Input type="number" value={form.maintenanceAmount || ''} onChange={e => set('maintenanceAmount', e.target.value)} /></Field>}
                    </div>
                    <div className="pw-row">
                      <Field label="Parking charges"><Chips options={MAINTENANCE_MODE} value={form.parkingChargesMode} onChange={v => set('parkingChargesMode', v)} /></Field>
                      <Field label="Painting charges"><Chips options={PAINTING_CHARGES} value={form.paintingCharges} onChange={v => set('paintingCharges', v)} /></Field>
                    </div>
                    <Field label="Available from"><Input type="date" value={form.availableFrom || ''} onChange={e => set('availableFrom', e.target.value)} /></Field>
                  </div>
                )}

                {applies.tenantPreference && (
                  <div className="pw-grp">
                    <div className="pw-grp-t">Who it's for</div>
                    <Field label="Preferred tenants">
                      <MultiChips options={TENANT_TYPES} value={form.preferredTenants} onChange={v => set('preferredTenants', v)} />
                    </Field>
                    {/* Only once bachelors are actually on the list. Asking
                        "men or women?" of an owner who said "family only" is a
                        question with no meaning. */}
                    {applies.bachelorPreference && (
                      <Field label="Preference for bachelors">
                        <Chips options={BACHELOR_PREF} value={form.bachelorPref} onChange={v => set('bachelorPref', v)} />
                      </Field>
                    )}
                    <Field label="Pet friendly"><YesNo value={form.petFriendly} onChange={v => set('petFriendly', v)} /></Field>
                  </div>
                )}

                {applies.saleTerms && (
                  <div className="pw-grp">
                    <div className="pw-grp-t">Sale terms</div>
                    <Field label="Price includes"><MultiChips options={PRICE_INCLUDES} value={form.priceIncludes} onChange={v => set('priceIncludes', v)} /></Field>
                    <div className="pw-row">
                      <Field label="Other charges"><Input type="number" value={form.otherCharges || ''} onChange={e => set('otherCharges', e.target.value)} /></Field>
                      <Field label="Booking / token amount"><Input type="number" value={form.bookingAmount || ''} onChange={e => set('bookingAmount', e.target.value)} /></Field>
                    </div>
                  </div>
                )}

                <div className="pw-grp">
                  <div className="pw-grp-t">Our consulting fee</div>
                  {/* Charged in two structurally different ways: days of rent
                      on a let, a percentage of the price on a sale. Only the
                      one that applies is ever on screen. */}
                  <Field label={rent ? 'Fee (days of rent)' : 'Fee (% of price)'}>
                    <Chips options={rent ? CONSULTING_DAYS : CONSULTING_PERCENT}
                      value={form.consultingOption} onChange={v => set('consultingOption', v)} />
                  </Field>
                  {form.consultingOption === 'custom' && (
                    <Field label={rent ? 'Days of rent' : 'Percent of price'}>
                      <Input type="number" value={form.consultingPercent || ''} onChange={e => set('consultingPercent', e.target.value)} />
                    </Field>
                  )}
                  {form.consultingOption && form.consultingOption !== 'none' && (
                    <Field label="Tax">
                      {/* A LABEL, not arithmetic — we never compute tax. If it's
                          excluded, the broker enters the final figure themselves. */}
                      <Chips options={[{ value: 'incl', label: 'Included' }, { value: 'excl', label: 'Excluded' }]}
                        value={form.taxIncluded === true ? 'incl' : form.taxIncluded === false ? 'excl' : ''}
                        onChange={v => set('taxIncluded', v === 'incl' ? true : v === 'excl' ? false : null)} />
                    </Field>
                  )}
                </div>
              </div>
            )}

            {step === 2 && (
              <div className="pw-panel">
                {applies.furnishing && (
                  <div className="pw-grp">
                    <div className="pw-grp-t">Furnishing</div>
                    <Field label="Furnishing">
                      <Chips options={[{ value: 'full', label: 'Fully Furnished' }, { value: 'semi', label: 'Semi Furnished' }, { value: 'none', label: 'Unfurnished' }]}
                        value={form.furnishType} onChange={v => set('furnishType', v)} />
                    </Field>
                    <Button variant="secondary" icon="plus" onClick={openAmenities}>
                      {form.furnishType === 'none' ? 'Add society amenities' : 'Add furnishings & amenities'}
                      {amenityCount > 0 && <span className="pw-count"> · {amenityCount} selected</span>}
                    </Button>
                  </div>
                )}

                <div className="pw-grp">
                  <div className="pw-grp-t">Description</div>
                  <Field label="Description">
                    <Textarea value={form.description || ''} onChange={e => set('description', e.target.value.slice(0, 1500))}
                      rows={4} placeholder="What makes this one worth seeing?" />
                    <div className="pw-hint">{(form.description || '').length} / 1500</div>
                  </Field>
                </div>

                <div className="pw-grp">
                  <div className="pw-grp-t">Photos &amp; video</div>
                  <MediaPicker
                    media={form.media || []}
                    firmName={store.state.settings.firmName}
                    onChange={v => set('media', v)}
                    onError={m => store.toast(m, 'warn')}
                  />
                </div>

                {/* The unit number is here, and marked, for the same reason the
                    owner's phone number is: it identifies the exact door. On a
                    shared listing it lets a buyer walk up to the flat and deal
                    direct, which is the one thing the firm is paid to sit in
                    the middle of. It's captured because dispatch and key
                    handover need it — it just never leaves the building. */}
                <div className="pw-grp pw-internal">
                  <div className="pw-grp-t">
                    Internal <span className="own-never">Never shared with clients</span>
                  </div>
                  <div className="pw-row">
                    <Field label="Unit / flat no."><Input value={form.unit || ''} onChange={e => set('unit', e.target.value)} placeholder="701" /></Field>
                    <Field label="Key / access">
                      <Input value={form.keyAccess || ''} onChange={e => set('keyAccess', e.target.value)}
                        placeholder="Who holds the keys, best time to visit" />
                    </Field>
                  </div>
                  {/* OPTIONAL, and last. A broker taking an owner's call has
                      the name and number right there — refusing to take them
                      forced a second trip back to the record later. Leaving it
                      blank creates no owner at all, which is the point: an
                      empty owner is worse than none, because it becomes a
                      contact nobody can call. */}
                  <div className="pw-row">
                    <Field label="Owner name" hint="Optional — you can add this later from the property.">
                      <Input value={form.owner || ''} onChange={e => set('owner', e.target.value)} placeholder="Sneha Rane" />
                    </Field>
                    <Field label="Owner phone">
                      <Input value={form.ownerPhone || ''} onChange={e => set('ownerPhone', e.target.value)} placeholder="+91 98765 43210" />
                    </Field>
                  </div>
                </div>
              </div>
            )}

           </div>

            {/* ---- footer ---- */}
            <div className="pw-foot">
              <div className="pw-foot-l">
                {step > 0 && <Button variant="ghost" onClick={() => setStep(s => s - 1)}>Back</Button>}
                {missing.length > 0 && step >= 1 && (
                  <span className="pw-missing">Needs {missing.join(', ')}</span>
                )}
              </div>
              <div className="pw-foot-r">
                {/* Savable from step ② onward — ①+② are what matching reads,
                    so there is no reason to hold the listing hostage to
                    furnishing details the broker doesn't have yet. */}
                {step >= 1 && !editing && (
                  <Button variant="ghost" disabled={saving || missing.length > 0} onClick={() => save(true)}>
                    Save &amp; add another
                  </Button>
                )}
                {step >= 1 && (
                  <Button variant="primary" disabled={saving || missing.length > 0} onClick={() => save(false)}>
                    {saving ? 'Saving…' : editing ? 'Save changes' : 'Save property'}
                  </Button>
                )}
                {step < STEPS.length - 1 && (
                  <Button variant={step === 0 ? 'primary' : 'secondary'} onClick={() => setStep(s => s + 1)}>
                    Next: {STEPS[step + 1].label}
                  </Button>
                )}
              </div>
            </div>
          </div>
         </div>
        </div>
      </div>
    </>
  )
}
