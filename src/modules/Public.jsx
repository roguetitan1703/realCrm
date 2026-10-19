import { useEffect, useMemo, useState } from 'react'
import { api } from '../lib/api.js'
import { fileUrl } from '../lib/media.js'
import { formatMoney, phoneLabel, phonePlaceholder, phoneProblem, roomLabel, firmLocale, setFirmLocale } from '../lib/locale.js'
import { SUBTYPES, FURNISH, FACING, POSSESSION, SOCIETY_AMENITIES, labelOf } from '../data/propertyFields.js'
import { deviceId, openWa, looksLikePhone } from '../lib/share.js'
import Icon from '../components/Icon.jsx'
import PhotoViewer from '../components/PhotoViewer.jsx'
import AddFromTap from '../components/AddFromTap.jsx'

// ============================================================================
// THE BUYER'S PAGES (docs/specs/listing-pages.md §A)
// ============================================================================
// Who: a buyer or tenant who tapped a link in WhatsApp, on a phone, inside
// WhatsApp's own browser, not signed in to anything. What they want: to look
// at the homes, and if one is right, to say so to the person who sent it —
// one tap to WhatsApp — or, on the firm's catalogue, to leave a number.
//
// Everything here wears the FIRM's brand (logo, accent, name), never Delpat's.
// Nothing here is ever a dead end: a link that no longer works still names
// the firm and offers Talk to us, and the catalogue when it has homes.
//
// Three routes, mounted on their own by main.jsx (no workspace, no sign-in):
//   /<firm>/<code>          a shared link (one home or several), or a tap's
//                           ref link — which, opened by a signed-in member of
//                           the firm, is Add as lead
//   /<firm>/homes           the public catalogue (?embed=1 inside a website)
//   /<firm>/homes/<slug>    one home in it, with the enquiry form
// ============================================================================

const firmOf = (f) => f ? { name: f.name || '', logo: f.logo || f.logoUrl || '', accent: f.accent || f.color || '' } : null
const embedded = () => { try { return new URLSearchParams(window.location.search).get('embed') === '1' } catch { return false } }
const withEmbed = (path) => (embedded() ? `${path}${path.includes('?') ? '&' : '?'}embed=1` : path)

/** The firm's frame: its mark and name on top, the privacy link below. */
export function PublicShell({ firm: raw, tenant, children, embed = embedded(), bar, waiting }) {
  // The firm's currency, numbers, phone rules and room words, before anything
  // under the frame renders a price. A public page is one firm, mounted on its
  // own (main.jsx), so the browser's locale is this firm's for the tab.
  if (raw?.locale) setFirmLocale(raw.locale)
  const firm = firmOf(raw)
  useEffect(() => { document.documentElement.classList.add('pv-root'); return () => document.documentElement.classList.remove('pv-root') }, [])
  return (
    <div className={'pv' + (embed ? ' is-embed' : '')} style={firm?.accent ? { '--pv-accent': firm.accent } : undefined}>
      {bar}
      {!embed && (
        <header className="pv-head">
          <a className="pv-brand" href={`/${tenant}/homes`}>
            <FirmMark firm={firm} />
            <span className="pv-firm">{firm?.name || ''}</span>
          </a>
        </header>
      )}
      <main className="pv-main">{children}</main>
      <footer className="pv-foot">
        {firm?.name && <span>{firm.name}</span>}
        <a href="/privacy" target="_blank" rel="noopener noreferrer">Privacy</a>
      </footer>
    </div>
  )
}

/** The firm's mark. Its box is always there; it shows the logo, or the
 *  initials when there is no logo or it failed to load. */
function FirmMark({ firm }) {
  // The state belongs to one URL, so a new logo starts over without an effect
  // resetting it after a cached image has already fired onLoad (which left
  // the initials over a logo that was there). A cached image may also be
  // complete before React attaches onLoad: the ref reads that.
  const logo = firm?.logo || ''
  const [seen, setSeen] = useState({ url: '', state: 'loading' })
  const state = seen.url === logo ? seen.state : 'loading' // loading | ok | failed
  const mark = (s) => setSeen({ url: logo, state: s })
  const ref = (el) => { if (el && el.complete && el.naturalWidth > 0 && state !== 'ok') mark('ok') }
  const initials = String(firm?.name || '').trim().split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('')
  return (
    <span className="pv-markbox">
      {/* Initials only when there is no logo to wait for, or it failed: shown
          while the logo loaded, they flashed a different mark first. Until
          then the box holds its place, blank. */}
      {state !== 'ok' && (firm && (!logo || state === 'failed') && initials
        ? <span className="pv-mono">{initials}</span>
        : <span className="pv-mono pv-mono-wait" />)}
      {firm?.logo && state !== 'failed' && (
        <img key={logo} ref={ref} className={'pv-logo' + (state === 'ok' ? '' : ' is-loading')} src={logo} alt=""
          onLoad={() => mark('ok')} onError={() => mark('failed')} />
      )}
    </span>
  )
}

/** A link or home that cannot be shown: the firm, Talk to us, the catalogue. */
export function Gone({ title, onTalk, talkBusy, phone, catalogueUrl, offline, onRetry }) {
  const talk = onTalk || (phone ? () => openWa(`https://wa.me/${String(phone).replace(/\D/g, '')}`) : null)
  return (
    <div className="pv-gone">
      <span className="pv-gone-ic"><Icon name={offline ? 'alert' : 'clock'} size={22} /></span>
      <h1>{offline ? 'No connection' : title}</h1>
      <div className="pv-gone-acts">
        {offline && onRetry && <button type="button" className="pv-btn pv-btn-main" onClick={onRetry}>Try again</button>}
        {!offline && talk && (
          <button type="button" className="pv-btn pv-btn-main" disabled={talkBusy} onClick={talk}>
            <Icon name="wa" size={18} fill />{talkBusy ? 'Opening WhatsApp…' : 'Talk to us'}
          </button>
        )}
        {!offline && catalogueUrl && <a className="pv-btn pv-btn-alt" href={withEmbed(catalogueUrl)}>See all our homes</a>}
      </div>
    </div>
  )
}

// ── One home ───────────────────────────────────────────────────────────────
// The server sends the stored tokens (config.bhk "2", config.subtype
// "apartment"); the words come from the property vocabulary, the same as the
// desk's, read in the firm's terms ("2 BHK" / "2 bed").
const ALL_SUBTYPES = [...SUBTYPES.residential, ...SUBTYPES.commercial]
const kindOf = (h) => [h.config?.bhk ? roomLabel(h.config.bhk) : '', labelOf(ALL_SUBTYPES, h.config?.subtype)].filter(Boolean).join(' ')
const areaOf = (h) => {
  const a = Number(h.config?.carpetSqft) || Number(h.config?.builtupSqft) || Number(h.config?.superBuiltupSqft)
  return a > 0 ? `${Math.round(a).toLocaleString(firmLocale().numberLocale)} sq.ft` : ''
}
// With the project name hidden, "Wakad" over "Wakad" told two homes apart by
// nothing: the title is then what the home is (size, type, area), and the
// line under it where it is and how it comes. Never the flat number.
// "Floor 4 of 12": tells two flats in one building apart without naming one.
const floorOf = (h) => {
  const f = String(h.config?.floor ?? '').trim()
  if (!f) return ''
  if (/^(0|g|ground)/i.test(f)) return 'Ground floor'
  const of = Number(h.config?.totalFloors) > 0 ? ` of ${h.config.totalFloors}` : ''
  return /^\d+$/.test(f) ? `Floor ${f}${of}` : `Floor ${f}`
}
// What tells one flat in a building from the next without naming it: floor,
// furnishing, facing. Three "Lakeview Residency 1 BHK · 520 sq.ft" cards with
// prices off were otherwise identical.
const unitFacts = (h) => [
  floorOf(h),
  h.config?.furnishing ? labelOf(FURNISH, h.config.furnishing) : '',
  h.config?.facing ? `${labelOf(FACING, h.config.facing)} facing` : '',
]
const homeTitle = (h) => h.project || [kindOf(h), areaOf(h)].filter(Boolean).join(' · ') || h.locality || h.title || 'Home'
const subOf = (h) => (h.project
  ? [kindOf(h), areaOf(h), ...unitFacts(h), h.locality]
  : [h.locality, ...unitFacts(h), h.config?.possession ? labelOf(POSSESSION, h.config.possession) : '']
).filter(Boolean).join(' · ')
const dealWord = (d) => (d === 'rent' ? 'For rent' : d === 'sale' ? 'For sale' : '')
const priceOf = (h) => (Number(h.price) > 0 ? formatMoney(Number(h.price), { perMonth: h.deal === 'rent' }) : '')
const waTo = (phone, text) => (phone ? `https://wa.me/${String(phone).replace(/\D/g, '')}${text ? `?text=${encodeURIComponent(text)}` : ''}` : '')
const pathOf = (url) => { try { return url ? new URL(url, window.location.origin).pathname : null } catch { return null } }

function HomeCard({ h, href, onOpen }) {
  const cover = (h.media || []).find(m => m.kind !== 'video')
  const price = priceOf(h)
  const taken = h.available === false
  const Tag = href ? 'a' : 'button'
  return (
    <Tag className={'pv-card' + (taken ? ' is-taken' : '')} {...(href ? { href } : { type: 'button', onClick: onOpen })}>
      <span className="pv-card-img">
        {cover
          ? <img src={fileUrl(cover.key)} alt="" loading="lazy" />
          : <span className="pv-noimg"><Icon name="building" size={26} strokeWidth={1.3} /></span>}
        {taken && <span className="pv-taken">Taken</span>}
        {(h.media || []).length > 1 && <span className="pv-card-n"><Icon name="camera" size={12} />{h.media.length}</span>}
      </span>
      <span className="pv-card-body">
        <span className="pv-card-t">{homeTitle(h)}</span>
        {subOf(h) && <span className="pv-card-s">{subOf(h)}</span>}
        <span className="pv-card-p">
          {price && <b>{price}</b>}
          {dealWord(h.deal) && <span>{dealWord(h.deal)}</span>}
        </span>
      </span>
    </Tag>
  )
}

/** The facts a buyer asks before they ask anything else. Only what is filled. */
function Facts({ h, shown = '' }) {
  const c = h.config || {}
  const rows = [
    ['Carpet', Number(c.carpetSqft) > 0 ? `${Math.round(c.carpetSqft).toLocaleString(firmLocale().numberLocale)} sq.ft` : ''],
    ['Built-up', Number(c.builtupSqft) > 0 ? `${Math.round(c.builtupSqft).toLocaleString(firmLocale().numberLocale)} sq.ft` : ''],
    ['Bathrooms', c.bathrooms ? String(c.bathrooms) : ''],
    ['Furnishing', c.furnishing ? labelOf(FURNISH, c.furnishing) : ''],
    ['Facing', c.facing ? labelOf(FACING, c.facing) : ''],
    ['Possession', c.possession ? labelOf(POSSESSION, c.possession) : ''],
  ].filter(([, v]) => v && !shown.includes(v))
  const amen = (c.amenities || []).map(a => labelOf(SOCIETY_AMENITIES, a)).filter(Boolean)
  if (!rows.length && !amen.length) return null
  return (
    <>
      {rows.length > 0 && (
        <dl className="pvh-facts">
          {rows.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}
        </dl>
      )}
      {amen.length > 0 && <div className="pvh-amen">{amen.map(a => <span key={a}>{a}</span>)}</div>}
    </>
  )
}

function HomeDetail({ h, onBack, backLabel, children }) {
  const price = priceOf(h)
  const taken = h.available === false
  return (
    <article className="pvh">
      {onBack && <button type="button" className="pv-back" onClick={onBack}><Icon name="chevLeft" size={16} />{backLabel}</button>}
      <div className="pvh-photos">
        {(h.media || []).length
          ? <PhotoViewer media={h.media} title={homeTitle(h)} />
          : <div className="pvh-nophoto"><Icon name="building" size={34} strokeWidth={1.2} /></div>}
      </div>
      <div className="pvh-body">
        <h1 className="pvh-t">{homeTitle(h)}{taken && <span className="pv-taken pv-taken-inline">Taken</span>}</h1>
        {subOf(h) && <div className="pvh-s">{subOf(h)}</div>}
        {(price || dealWord(h.deal)) && (
          <div className="pvh-p">{price && <b>{price}</b>}{dealWord(h.deal) && <span>{dealWord(h.deal)}</span>}</div>
        )}
        <Facts h={h} shown={`${homeTitle(h)} · ${subOf(h)}`} />
        {children}
      </div>
    </article>
  )
}

// ── A shared link ──────────────────────────────────────────────────────────
// A wrong, expired, turned-off or stopped code all answer one identical body,
// `state: 'unavailable'`, so a code cannot be probed. The buyer always gets
// Talk to us (the server routes an expired link's press to its holder, any
// other to the firm) and the catalogue when there is one. Only a signed-in
// member of the firm learns which it was, from `staff.link.state`.
const STAFF_DEAD = {
  expired: 'This link has expired',
  off: 'This link was turned off',
  stopped: 'Sharing was stopped. This link no longer works.',
}

export function SharedLinkPage({ tenant, code }) {
  const device = useMemo(() => deviceId(tenant), [tenant])
  const [s, setS] = useState({ loading: true })
  const [tries, setTries] = useState(0)
  const [open, setOpen] = useState(() => new URLSearchParams(window.location.search).get('h'))
  const [busy, setBusy] = useState(null)
  const [talkBusy, setTalkBusy] = useState(false)
  const [tapDone, setTapDone] = useState(null)

  useEffect(() => {
    let live = true
    setS(x => ({ ...x, loading: true }))
    api.publicShare(tenant, code, device, open || undefined)
      .then(r => { if (live) setS({ loading: false, data: r }) })
      .catch(e => { if (live) setS({ loading: false, data: null, offline: e instanceof TypeError || !e?.body }) })
    return () => { live = false }
  }, [tenant, code, tries]) // eslint-disable-line react-hooks/exhaustive-deps

  // ?h=<home> is the home open on a several-home link, so Back on the phone
  // returns to the list rather than leaving the page.
  useEffect(() => {
    const onPop = () => setOpen(new URLSearchParams(window.location.search).get('h'))
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])
  const show = (id) => {
    const u = new URL(window.location.href)
    if (id) {
      u.searchParams.set('h', id)
      window.history.pushState(null, '', u.pathname + u.search)
      // The view is counted against the home the buyer opened (`?flat=`).
      api.publicShare(tenant, code, device, id).catch(() => {})
    } else window.history.back()
    setOpen(id)
    window.scrollTo(0, 0)
  }

  const d = s.data
  const firm = d?.firm
  useEffect(() => { if (firm?.name) document.title = firm.name }, [firm?.name])

  const interested = (h) => {
    if (busy) return
    setBusy(h.id)
    const fallback = waTo(d?.cta?.phone, `Hi, I'm interested in ${homeTitle(h)}`)
    api.publicInterested(tenant, code, h.id, device)
      .then(r => openWa(r?.waUrl || fallback))
      // The tap could not be recorded (no signal, or the link died meanwhile).
      // The buyer still reaches someone: WhatsApp on the number the page has.
      .catch(() => openWa(fallback))
      .finally(() => setTimeout(() => setBusy(null), 1200))
  }
  const talk = () => {
    if (talkBusy) return
    setTalkBusy(true)
    api.publicTalk(tenant, code, device)
      .then(r => openWa(r?.waUrl || waTo(d?.cta?.phone)))
      .catch(() => openWa(waTo(d?.cta?.phone)))
      .finally(() => setTimeout(() => setTalkBusy(false), 1200))
  }

  if (s.loading && !d) return <PublicShell firm={null} tenant={tenant} waiting><Skeleton /></PublicShell>
  if (!d) return <PublicShell firm={null} tenant={tenant}><Gone offline onRetry={() => setTries(t => t + 1)} /></PublicShell>

  const staff = d.staff
  const flats = d.flats || []
  const catalogue = pathOf(d.catalogueUrl)
  const staffBar = staff ? <StaffBar tenant={tenant} staff={staff} flats={flats} tapDone={tapDone} onTapDone={setTapDone} /> : null

  if (d.state !== 'active') {
    const real = staff?.link?.state
    return (
      <PublicShell firm={firm} tenant={tenant} bar={staffBar}>
        <Gone title={(real && STAFF_DEAD[real]) || 'This link is no longer active'}
          onTalk={staff ? null : talk} talkBusy={talkBusy} catalogueUrl={catalogue} />
      </PublicShell>
    )
  }

  const single = flats.length === 1
  const current = single ? flats[0] : flats.find(f => f.id === open)

  if (current) {
    const taken = current.available === false
    return (
      <PublicShell firm={firm} tenant={tenant} bar={staffBar}>
        <HomeDetail h={current} onBack={single ? null : () => show(null)} backLabel={`All ${flats.length} homes`} />
        {!staff && <div className="pv-cta">
          {taken ? (
            single
              ? (catalogue
                ? <a className="pv-btn pv-btn-alt pv-btn-wide" href={catalogue}>See our other homes</a>
                : <button type="button" className="pv-btn pv-btn-main pv-btn-wide" disabled={talkBusy} onClick={talk}><Icon name="wa" size={19} fill />Talk to us</button>)
              : <button type="button" className="pv-btn pv-btn-alt pv-btn-wide" onClick={() => show(null)}>See the other homes</button>
          ) : (
            <button type="button" className="pv-btn pv-btn-main pv-btn-wide" disabled={busy === current.id} onClick={() => interested(current)}>
              <Icon name="wa" size={19} fill />{busy === current.id ? 'Opening WhatsApp…' : "I'm interested"}
            </button>
          )}
        </div>}
      </PublicShell>
    )
  }

  const live = flats.filter(f => f.available !== false).length
  return (
    <PublicShell firm={firm} tenant={tenant} bar={staffBar}>
      {flats.length === 0
        ? <Gone title="These homes are no longer available" onTalk={staff ? null : talk} talkBusy={talkBusy} catalogueUrl={catalogue} />
        : (
          <>
            <div className="pv-list-h">
              {/* Not "for you": a link without a recipient goes to groups. */}
              <h1>{flats.length === 1 ? '1 home' : `${flats.length} homes`}{d.forRecipient ? ' for you' : ''}</h1>
              {live < flats.length && <span>{live} available</span>}
            </div>
            <div className="pv-grid">
              {flats.map(h => <HomeCard key={h.id} h={h} onOpen={() => show(h.id)} />)}
            </div>
          </>
        )}
    </PublicShell>
  )
}

/** A member of the firm, signed in, on a link: who it went to and whether it
 *  still works, or — on a tap's or a Talk to us ref link — Add as lead,
 *  holding the link, the home and the tap. */
function StaffBar({ tenant, staff, flats, tapDone, onTapDone }) {
  const [closed, setClosed] = useState(false)
  if (closed) return null
  const leadHref = (id) => `/${tenant}?screen=leads&lead=${encodeURIComponent(id)}`
  const lead = tapDone?.lead || staff.lead
  if (staff.tap && !lead) {
    const talk = !staff.tap.propertyId
    const h = talk ? null : (flats.find(f => f.id === staff.tap.propertyId) || flats[0])
    const home = talk ? (flats.length === 1 ? flats[0].title : `${flats.length} homes`) : (h?.title || '')
    return (
      <div className="pv-staff pv-staff-tap">
        <div className="pv-staff-in">
          <div className="pv-staff-h">Add as lead</div>
          <AddFromTap tap={staff.tap} home={home} via={talk ? 'talk' : 'interested'} footClass="pv-staff-foot"
            onDone={(r) => onTapDone(r)} onCancel={() => setClosed(true)} />
        </div>
      </div>
    )
  }
  const state = staff.link?.state
  const dead = state && state !== 'active'
  if (!lead && !dead) return null
  const word = tapDone ? (tapDone.matched ? 'Already a lead' : 'Lead added') : 'Sent to'
  const who = lead ? (lead.name || phoneLabel(lead.phone) || 'Lead') : ''
  // A tap reads as what the person did: "Sneha Kulkarni tapped I'm interested".
  const tapLine = !tapDone && staff.tap ? (staff.tap.propertyId ? 'tapped I’m interested' : 'pressed Talk to us') : ''
  return (
    <div className="pv-staff">
      <div className="pv-staff-in pv-staff-row">
        <span className="pv-staff-who">
          {lead
            ? (lead.visible === false ? 'Another agent’s lead'
              // From a browser not known to be theirs the tap is someone's on
              // their link, as the alert says; never stated as them.
              : tapLine ? (staff.tap.tapFrom === 'someone'
                ? <>Someone on <b>{who}</b>’s link {tapLine}</>
                : <><b>{who}</b> {tapLine}</>)
              : <>{word} · <b>{who}</b></>)
            : 'No recipient'}
          {dead && <span className="pv-staff-dead"> · {state === 'expired' ? 'Expired' : state === 'off' ? 'Turned off' : 'Stopped'}</span>}
        </span>
        {lead && lead.visible !== false && <a className="pv-staff-go" href={leadHref(lead.id)}>Open lead<Icon name="chevRight" size={14} /></a>}
      </div>
    </div>
  )
}

function Skeleton() {
  return (
    <div className="pv-skel" aria-busy="true" aria-label="Loading">
      <span className="pv-skel-img" /><span className="pv-skel-l" /><span className="pv-skel-l pv-skel-s" />
    </div>
  )
}

// ── The public catalogue ───────────────────────────────────────────────────
// The filter lives in the address (?deal=&bhk=&area=), replaced rather than
// pushed. The server filters, counts and pages; `facets` are the choices the
// firm's whole catalogue offers, so a choice never leads to nothing.
function readFilters() {
  const p = new URLSearchParams(window.location.search)
  return { deal: p.get('deal') || '', bhk: p.get('bhk') || '', area: p.get('area') || '' }
}
const bhkSort = (a, b) => (parseFloat(a) || (a === '1rk' ? 0.5 : 99)) - (parseFloat(b) || (b === '1rk' ? 0.5 : 99))

export function CataloguePage({ tenant }) {
  const device = useMemo(() => deviceId(tenant), [tenant])
  const [f, setF] = useState(readFilters)
  const [page, setPage] = useState(1)
  const [s, setS] = useState({ loading: true, rows: [] })
  const [tries, setTries] = useState(0)

  useEffect(() => {
    let live = true
    setS(x => ({ ...x, loading: true, failed: false }))
    api.publicCatalogue(tenant, { deal: f.deal, config: f.bhk, locality: f.area, page, limit: PAGE_SIZE }, device)
      .then(r => { if (live) setS(x => ({ loading: false, data: r, rows: page === 1 ? (r?.flats || []) : [...x.rows, ...(r?.flats || [])] })) })
      .catch(e => { if (live) setS(x => ({ ...x, loading: false, failed: true, offline: e instanceof TypeError || !e?.body, body: e?.body || null })) })
    return () => { live = false }
  }, [tenant, f.deal, f.bhk, f.area, page, tries]) // eslint-disable-line react-hooks/exhaustive-deps

  const set = (patch) => {
    const next = { ...f, ...patch }
    setF(next); setPage(1)
    const u = new URL(window.location.href)
    for (const k of ['deal', 'bhk', 'area']) { if (next[k]) u.searchParams.set(k, next[k]); else u.searchParams.delete(k) }
    window.history.replaceState(null, '', u.pathname + u.search)
  }

  const d = s.data
  const firm = d?.firm || s.body?.firm || null
  useEffect(() => { if (firm?.name) document.title = `Homes · ${firm.name}` }, [firm?.name])

  if (!d && s.loading) return <PublicShell firm={null} tenant={tenant} waiting><Skeleton /></PublicShell>
  if (!d) {
    return (
      <PublicShell firm={firm} tenant={tenant}>
        <Gone offline={s.offline} onRetry={() => setTries(t => t + 1)} title="These homes could not be loaded" phone={s.body?.cta?.phone} />
      </PublicShell>
    )
  }

  const facets = d.facets || {}
  // A choice that is switched on is always among the options, and its
  // control always shows, even when the results narrow to one option or the
  // value came from a URL the facets do not know: a filter nobody can see
  // is a filter nobody can take off.
  const withActive = (list, v) => (v && !list.some(x => String(x).toLowerCase() === String(v).toLowerCase()) ? [...list, v] : list)
  const deals = withActive((facets.deal || []).filter(x => x === 'sale' || x === 'rent'), f.deal)
  const bhks = withActive((facets.config || []).slice(), f.bhk).sort(bhkSort)
  const areas = withActive(facets.locality || [], f.area)
  const showDeal = deals.length > 1 || !!f.deal
  const showBhk = bhks.length > 1 || !!f.bhk
  const showArea = areas.length > 1 || !!f.area
  // How many each choice would show, with the other filters as they are.
  const counts = d.facetCounts || {}
  const nOf = (k, v) => (Number(counts[k]?.[v]) >= 0 && counts[k]?.[v] != null ? Number(counts[k][v]) : null)
  const filtered = !!(f.deal || f.bhk || f.area)
  const total = d.total ?? s.rows.length
  const firstLoad = s.loading && page === 1

  return (
    <PublicShell firm={firm} tenant={tenant}>
      <div className="pv-list-h">
        <h1>Homes</h1>
        {!firstLoad && <span>{total} {total === 1 ? 'home' : 'homes'}</span>}
      </div>
      {(showDeal || showBhk || showArea) && (
        <div className="pv-filters">
          {showDeal && (
            <div className="pv-seg" role="group" aria-label="Sale or rent">
              {[['', 'All'], ['sale', 'Sale'], ['rent', 'Rent']].map(([v, l]) => (
                <button key={l} type="button" className={f.deal === v ? 'on' : ''} aria-pressed={f.deal === v} onClick={() => set({ deal: v })}>{l}{v && nOf('deal', v) != null && <span className="pv-n">{nOf('deal', v)}</span>}</button>
              ))}
            </div>
          )}
          {showBhk && (
            <div className="pv-chips" role="group" aria-label="Bedrooms">
              {bhks.map(b => (
                <button key={b} type="button" className={'pv-chip' + (f.bhk === b ? ' on' : '')} aria-pressed={f.bhk === b} onClick={() => set({ bhk: f.bhk === b ? '' : b })}>{roomLabel(b)}{nOf('config', b) != null && <span className="pv-n">{nOf('config', b)}</span>}</button>
              ))}
            </div>
          )}
          {showArea && (
            <label className="pv-area">
              <Icon name="mapPin" size={15} />
              <select value={areas.find(a => String(a).toLowerCase() === String(f.area).toLowerCase()) || f.area} onChange={e => set({ area: e.target.value })} aria-label="Area">
                <option value="">All areas</option>
                {areas.map(a => <option key={a} value={a}>{nOf('locality', a) != null ? `${a} (${nOf('locality', a)})` : a}</option>)}
              </select>
              <Icon name="chevDown" size={14} />
            </label>
          )}
        </div>
      )}
      {firstLoad ? <Skeleton /> : s.rows.length === 0 ? (
        <div className="pv-empty">
          <div className="pv-empty-t">{filtered ? 'No homes match' : 'No homes listed right now'}</div>
          {filtered && <button type="button" className="pv-btn pv-btn-alt" onClick={() => set({ deal: '', bhk: '', area: '' })}>Clear filters</button>}
        </div>
      ) : (
        <>
          <div className="pv-grid">
            {s.rows.map(h => <HomeCard key={h.id} h={h} href={withEmbed(`/${tenant}/homes/${encodeURIComponent(h.slug || h.id)}`)} />)}
          </div>
          {s.rows.length < total && (
            <button type="button" className="pv-btn pv-btn-alt pv-more" disabled={s.loading} onClick={() => setPage(p => p + 1)}>
              {s.loading ? 'Loading…' : `Show more · ${total - s.rows.length}`}
            </button>
          )}
          {s.failed && <div className="pv-err" role="alert">{s.offline ? 'No connection.' : 'Could not load more.'} <button type="button" className="pv-link" onClick={() => setTries(t => t + 1)}>Try again</button></div>}
        </>
      )}
      <section className="pv-enq-wrap" id="enquire">
        <h2>Tell us what you're looking for</h2>
        <EnquiryForm tenant={tenant} device={device} firm={firm} />
      </section>
    </PublicShell>
  )
}

const PAGE_SIZE = 24

export function CatalogueHomePage({ tenant, slug }) {
  const device = useMemo(() => deviceId(tenant), [tenant])
  const [s, setS] = useState({ loading: true })
  const [tries, setTries] = useState(0)
  useEffect(() => {
    let live = true
    api.publicCatalogueHome(tenant, slug, device)
      .then(r => { if (live) setS({ loading: false, data: r }) })
      .catch(e => { if (live) setS({ loading: false, data: null, body: e?.body || null, offline: e instanceof TypeError }) })
    return () => { live = false }
  }, [tenant, slug, tries])

  const d = s.data
  const h = d?.flat
  useEffect(() => { if (h && d?.firm?.name) document.title = `${homeTitle(h)} · ${d.firm.name}` }, [h, d?.firm?.name])

  if (s.loading) return <PublicShell firm={null} tenant={tenant} waiting><Skeleton /></PublicShell>
  if (!h) {
    // Sold, removed or never there answer alike (404 with the firm, its
    // number and the catalogue when it has anything in it).
    return (
      <PublicShell firm={s.body?.firm || null} tenant={tenant}>
        <Gone offline={s.offline} onRetry={() => setTries(t => t + 1)}
          title="This home is no longer available"
          phone={s.body?.cta?.phone} catalogueUrl={pathOf(s.body?.catalogueUrl)} />
      </PublicShell>
    )
  }
  return (
    <PublicShell firm={d.firm} tenant={tenant}>
      <HomeDetail h={h} onBack={() => { window.location.href = withEmbed(`/${tenant}/homes`) }} backLabel="All homes">
        <section className="pv-enq-wrap pv-enq-in" id="enquire">
          <h2>Ask about this home</h2>
          <EnquiryForm tenant={tenant} device={device} firm={d.firm} propertyId={h.id} />
        </section>
      </HomeDetail>
    </PublicShell>
  )
}

/** Name, number, optional message. A hidden field catches bots; the number
 *  is required; the consent line says what the number is for. Goes through
 *  the firm's normal lead intake, source Catalogue. */
function EnquiryForm({ tenant, device, firm, propertyId }) {
  const [v, setV] = useState({ name: '', phone: '', message: '', website: '' })
  const [st, setSt] = useState({ busy: false, done: false, err: '', talk: '' })
  const set = (k) => (e) => setV(x => ({ ...x, [k]: e.target.value }))
  const ok = looksLikePhone(v.phone)
  const [tried, setTried] = useState(false)
  const problem = tried ? phoneProblem(v.phone) : ''
  const submit = (e) => {
    e.preventDefault()
    setTried(true)
    if (!ok || st.busy) return
    setSt({ busy: true, done: false, err: '' })
    api.publicEnquiry(tenant, {
      name: v.name.trim(), phone: v.phone.trim(),
      ...(propertyId ? { propertyId } : {}),
      ...(v.message.trim() ? { message: v.message.trim() } : {}),
      website: v.website,
    }, device)
      .then(() => setSt({ busy: false, done: true, err: '' }))
      // 429 is the firm's daily limit or too many tries from here: nothing the
      // buyer did wrong, so it says later, and offers WhatsApp when the
      // server sent a number.
      .catch(err => setSt({ busy: false, done: false,
        talk: err?.status === 429 ? (err?.body?.cta?.phone || '') : '',
        err: err instanceof TypeError ? 'No connection. Try again.'
          : err?.status === 429 ? 'We could not take this just now. Try again later.'
          : err?.status === 400 ? 'Check the number and try again.'
          : 'Could not send. Try again.' }))
  }
  if (st.done) {
    return (
      <div className="pv-enq-done" role="status">
        <span className="pv-gone-ic"><Icon name="check" size={20} /></span>
        <div><b>Sent</b><span>{firm?.name ? `${firm.name} will get in touch.` : 'We will get in touch.'}</span></div>
      </div>
    )
  }
  return (
    <form className="pv-enq" onSubmit={submit} noValidate>
      <label className="pv-field"><span>Name</span><input id="enq-name" value={v.name} onChange={set('name')} autoComplete="name" /></label>
      <label className="pv-field"><span>Mobile number</span><input value={v.phone} onChange={set('phone')} inputMode="tel" autoComplete="tel" placeholder={phonePlaceholder('98xxx xxxxx')} onBlur={() => setTried(true)} required /></label>
      {problem && <div className="pv-err" role="alert">{problem}</div>}
      <label className="pv-field"><span>Message</span><textarea value={v.message} onChange={set('message')} rows={3} placeholder="Optional" /></label>
      {/* Not for people. A bot fills every field it finds. */}
      <input className="pv-hp" tabIndex={-1} autoComplete="off" aria-hidden="true" value={v.website} onChange={set('website')} name="website" />
      {st.err && <div className="pv-err" role="alert">{st.err}</div>}
      {st.talk && <button type="button" className="pv-btn pv-btn-alt pv-btn-wide" onClick={() => openWa(waTo(st.talk))}><Icon name="wa" size={18} fill />Talk to us</button>}
      <button type="submit" className="pv-btn pv-btn-main pv-btn-wide" disabled={!v.phone.trim() || st.busy}>{st.busy ? 'Sending…' : 'Send'}</button>
      <p className="pv-consent">We use your number only to contact you about homes. <a href="/privacy" target="_blank" rel="noopener noreferrer">Privacy</a></p>
    </form>
  )
}
