import { useEffect, useMemo, useState } from 'react'
import { api } from '../lib/api.js'
import { fileUrl } from '../lib/media.js'
import { formatMoney, phonePlaceholder } from '../lib/locale.js'
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
// Nothing here is ever a dead end: an expired or turned-off link still names
// the firm, offers Talk to us and the catalogue.
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
  const firm = firmOf(raw)
  useEffect(() => { document.documentElement.classList.add('pv-root'); return () => document.documentElement.classList.remove('pv-root') }, [])
  return (
    <div className={'pv' + (embed ? ' is-embed' : '')} style={firm?.accent ? { '--pv-accent': firm.accent } : undefined}>
      {bar}
      {!embed && (
        <header className="pv-head">
          <a className="pv-brand" href={`/${tenant}/homes`}>
            {firm?.logo
              ? <img className="pv-logo" src={firm.logo} alt="" />
              : firm?.name ? <span className="pv-mono">{firm.name.trim().slice(0, 1).toUpperCase()}</span> : waiting ? <span className="pv-mono pv-mono-wait" /> : null}
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
const homeTitle = (h) => h.project || h.title || h.locality || h.config || 'Home'
const dealWord = (d) => (d === 'rent' ? 'For rent' : d === 'sale' ? 'For sale' : '')
function priceOf(h) {
  if (h.price == null || h.price === '') return ''
  const n = Number(h.price)
  return Number.isFinite(n) && n > 0 ? formatMoney(n, { perMonth: h.deal === 'rent' }) : String(h.price)
}
const subOf = (h) => [h.config, h.project ? h.locality : null].filter(Boolean).join(' · ')

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
        {children}
      </div>
    </article>
  )
}

// ── A shared link ──────────────────────────────────────────────────────────
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
    api.publicShare(tenant, code, device)
      .then(r => { if (live) setS({ loading: false, data: r }) })
      .catch(e => { if (live) setS({ loading: false, data: e?.body?.state ? e.body : null, offline: e instanceof TypeError || !e?.body }) })
    return () => { live = false }
  }, [tenant, code, tries])

  // ?h=<home> is the home open on a several-home link, so Back on the phone
  // returns to the list rather than leaving the page.
  useEffect(() => {
    const onPop = () => setOpen(new URLSearchParams(window.location.search).get('h'))
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])
  const show = (id) => {
    const u = new URL(window.location.href)
    if (id) u.searchParams.set('h', id); else u.searchParams.delete('h')
    if (id) window.history.pushState(null, '', u.pathname + u.search)
    else window.history.back()
    setOpen(id)
    window.scrollTo(0, 0)
  }

  const d = s.data
  const firm = d?.firm
  useEffect(() => { if (firm?.name) document.title = firm.name }, [firm?.name])

  const interested = (h) => {
    if (busy) return
    setBusy(h.id)
    api.publicInterested(tenant, code, h.id, device)
      .then(r => {
        if (r?.waUrl) openWa(r.waUrl)
        else if (d?.cta?.phone) openWa(`https://wa.me/${String(d.cta.phone).replace(/\D/g, '')}?text=${encodeURIComponent(`Hi, I'm interested in ${homeTitle(h)}`)}`)
      })
      // The tap could not be recorded (no signal). The buyer still reaches the
      // agent: WhatsApp opens on the firm's number with the home named.
      .catch(() => { if (d?.cta?.phone) openWa(`https://wa.me/${String(d.cta.phone).replace(/\D/g, '')}?text=${encodeURIComponent(`Hi, I'm interested in ${homeTitle(h)}`)}`) })
      .finally(() => setTimeout(() => setBusy(null), 1200))
  }
  const talk = () => {
    setTalkBusy(true)
    api.publicTalk(tenant, code, device)
      .then(r => openWa(r?.waUrl || (d?.cta?.phone ? `https://wa.me/${String(d.cta.phone).replace(/\D/g, '')}` : '')))
      .catch(() => { if (d?.cta?.phone) openWa(`https://wa.me/${String(d.cta.phone).replace(/\D/g, '')}`) })
      .finally(() => setTimeout(() => setTalkBusy(false), 1200))
  }

  if (s.loading && !d) return <PublicShell firm={null} tenant={tenant} waiting><Skeleton /></PublicShell>
  if (!d) return <PublicShell firm={null} tenant={tenant}><Gone offline onRetry={() => setTries(t => t + 1)} /></PublicShell>

  const staff = d.staff
  const staffBar = staff ? <StaffBar tenant={tenant} staff={staff} flats={d.flats || []} tapDone={tapDone} onTapDone={setTapDone} /> : null

  if (d.state !== 'active') {
    const title = d.state === 'expired' ? 'This link has expired' : 'This link is no longer active'
    return (
      <PublicShell firm={firm} tenant={tenant} bar={staffBar}>
        <Gone title={title}
          onTalk={d.state === 'expired' ? talk : null} talkBusy={talkBusy}
          phone={d.cta?.phone}
          catalogueUrl={d.state === 'stopped' ? null : (d.catalogueUrl ? new URL(d.catalogueUrl, window.location.origin).pathname : `/${tenant}/homes`)} />
      </PublicShell>
    )
  }

  const flats = d.flats || []
  const single = flats.length === 1
  const current = single ? flats[0] : flats.find(f => f.id === open)
  const catalogue = d.catalogueUrl ? new URL(d.catalogueUrl, window.location.origin).pathname : `/${tenant}/homes`

  if (current) {
    const taken = current.available === false
    return (
      <PublicShell firm={firm} tenant={tenant} bar={staffBar}>
        <HomeDetail h={current} onBack={single ? null : () => show(null)} backLabel={`All ${flats.length} homes`} />
        {!staff && <div className="pv-cta">
          {taken ? (
            single
              ? <a className="pv-btn pv-btn-alt pv-btn-wide" href={catalogue}>See our other homes</a>
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
      <div className="pv-list-h">
        <h1>{flats.length} homes for you</h1>
        {live < flats.length && <span>{live} available</span>}
      </div>
      {flats.length === 0
        ? <Gone title="These homes are no longer available" phone={d.cta?.phone} catalogueUrl={catalogue} />
        : (
          <div className="pv-grid">
            {flats.map(h => <HomeCard key={h.id} h={h} onOpen={() => show(h.id)} />)}
          </div>
        )}
    </PublicShell>
  )
}

/** A member of the firm, signed in, on a link: who it went to, or — on a
 *  tap's ref link — Add as lead, holding the link, the home and the tap. */
function StaffBar({ tenant, staff, flats, tapDone, onTapDone }) {
  const [closed, setClosed] = useState(false)
  if (closed) return null
  const leadHref = (id) => `/${tenant}?screen=leads&lead=${encodeURIComponent(id)}`
  const lead = tapDone?.lead || staff.lead
  if (staff.tap && !lead) {
    const h = flats.find(f => f.id === staff.tap.propertyId) || flats[0]
    return (
      <div className="pv-staff pv-staff-tap">
        <div className="pv-staff-in">
          <div className="pv-staff-h">Add as lead</div>
          <AddFromTap tap={staff.tap} home={h ? [homeTitle(h), h.config].filter(Boolean).join(' · ') : ''} footClass="pv-staff-foot"
            onDone={(r) => onTapDone(r)} onCancel={() => setClosed(true)} />
        </div>
      </div>
    )
  }
  if (!lead) return null
  return (
    <div className="pv-staff">
      <div className="pv-staff-in pv-staff-row">
        <span className="pv-staff-who">{tapDone ? (tapDone.matched ? 'Already a lead' : 'Lead added') : 'Sent to'} · <b>{lead.name || 'Lead'}</b></span>
        <a className="pv-staff-go" href={leadHref(lead.id)}>Open lead<Icon name="chevRight" size={14} /></a>
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
const bhkOf = (cfg) => (String(cfg || '').match(/^\s*(\d+)\s*(?:BHK|RK|Bed)/i)?.[0] || '').replace(/\s+/g, ' ').trim()

function readFilters() {
  const p = new URLSearchParams(window.location.search)
  return { deal: p.get('deal') || '', bhk: p.get('bhk') || '', area: p.get('area') || '' }
}

export function CataloguePage({ tenant }) {
  const device = useMemo(() => deviceId(tenant), [tenant])
  const [f, setF] = useState(readFilters)
  const [all, setAll] = useState({ loading: true })
  const [rows, setRows] = useState(null)
  const [tries, setTries] = useState(0)

  // The unfiltered book once, for the firm, the state and the filter choices;
  // then the filtered rows from the server as the choices change.
  useEffect(() => {
    let live = true
    api.publicCatalogue(tenant, {}, device)
      .then(r => { if (live) setAll({ loading: false, data: r }) })
      .catch(e => { if (live) setAll({ loading: false, data: e?.body?.firm ? e.body : null, offline: e instanceof TypeError || !e?.body }) })
    return () => { live = false }
  }, [tenant, tries])

  const filtered = !!(f.deal || f.bhk || f.area)
  useEffect(() => {
    if (!filtered) { setRows(null); return }
    let live = true
    api.publicCatalogue(tenant, { deal: f.deal || undefined, config: f.bhk || undefined, locality: f.area || undefined }, device)
      .then(r => { if (live) setRows(r?.flats || []) })
      .catch(() => { if (live) setRows([]) })
    return () => { live = false }
  }, [tenant, f.deal, f.bhk, f.area])

  // The filter lives in the address, replaced rather than pushed.
  const set = (patch) => {
    const next = { ...f, ...patch }
    setF(next)
    const u = new URL(window.location.href)
    for (const k of ['deal', 'bhk', 'area']) { if (next[k]) u.searchParams.set(k, next[k]); else u.searchParams.delete(k) }
    window.history.replaceState(null, '', u.pathname + u.search)
  }

  const d = all.data
  useEffect(() => { if (d?.firm?.name) document.title = `Homes · ${d.firm.name}` }, [d?.firm?.name])

  if (all.loading) return <PublicShell firm={null} tenant={tenant} waiting><Skeleton /></PublicShell>
  if (!d) return <PublicShell firm={null} tenant={tenant}><Gone offline={all.offline} onRetry={() => setTries(t => t + 1)} title="These homes are not available" /></PublicShell>
  if (d.state && d.state !== 'active') {
    return <PublicShell firm={d.firm} tenant={tenant}><Gone title="These homes are not available right now" phone={d.cta?.phone} /></PublicShell>
  }

  const book = d.flats || []
  const facets = d.facets || {}
  const deals = facets.deal || [...new Set(book.map(h => h.deal).filter(Boolean))]
  const bhks = (facets.config || [...new Set(book.map(h => bhkOf(h.config)).filter(Boolean))]).slice().sort((a, b) => parseInt(a) - parseInt(b))
  const areas = (facets.locality || [...new Set(book.map(h => h.locality).filter(Boolean))]).slice().sort()
  const list = filtered ? (rows || []) : book
  const loadingRows = filtered && rows === null

  return (
    <PublicShell firm={d.firm} tenant={tenant}>
      <div className="pv-list-h">
        <h1>Homes</h1>
        {!loadingRows && <span>{list.length} {list.length === 1 ? 'home' : 'homes'}</span>}
      </div>
      {book.length > 0 && (deals.length > 1 || bhks.length > 1 || areas.length > 1) && (
        <div className="pv-filters">
          {deals.length > 1 && (
            <div className="pv-seg" role="group" aria-label="Sale or rent">
              {[['', 'All'], ['sale', 'Sale'], ['rent', 'Rent']].filter(([v]) => !v || deals.includes(v)).map(([v, l]) => (
                <button key={l} type="button" className={f.deal === v ? 'on' : ''} aria-pressed={f.deal === v} onClick={() => set({ deal: v })}>{l}</button>
              ))}
            </div>
          )}
          {bhks.length > 1 && (
            <div className="pv-chips" role="group" aria-label="Bedrooms">
              {bhks.map(b => (
                <button key={b} type="button" className={'pv-chip' + (f.bhk === b ? ' on' : '')} aria-pressed={f.bhk === b} onClick={() => set({ bhk: f.bhk === b ? '' : b })}>{b}</button>
              ))}
            </div>
          )}
          {areas.length > 1 && (
            <label className="pv-area">
              <Icon name="mapPin" size={15} />
              <select value={f.area} onChange={e => set({ area: e.target.value })} aria-label="Area">
                <option value="">All areas</option>
                {areas.map(a => <option key={a} value={a}>{a}</option>)}
              </select>
              <Icon name="chevDown" size={14} />
            </label>
          )}
        </div>
      )}
      {loadingRows ? <Skeleton /> : list.length === 0 ? (
        <div className="pv-empty">
          <div className="pv-empty-t">{book.length ? 'No homes match' : 'No homes listed right now'}</div>
          {filtered && <button type="button" className="pv-btn pv-btn-alt" onClick={() => set({ deal: '', bhk: '', area: '' })}>Clear filters</button>}
        </div>
      ) : (
        <div className="pv-grid">
          {list.map(h => <HomeCard key={h.id} h={h} href={withEmbed(`/${tenant}/homes/${encodeURIComponent(h.slug || h.id)}`)} />)}
        </div>
      )}
      <section className="pv-enq-wrap" id="enquire">
        <h2>Tell us what you're looking for</h2>
        <EnquiryForm tenant={tenant} device={device} firm={d.firm} />
      </section>
    </PublicShell>
  )
}

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
  const h = d?.flat || d?.flats?.[0]
  useEffect(() => { if (h && d?.firm?.name) document.title = `${homeTitle(h)} · ${d.firm.name}` }, [h, d?.firm?.name])

  if (s.loading) return <PublicShell firm={null} tenant={tenant} waiting><Skeleton /></PublicShell>
  if (!h || (d.state && d.state !== 'active')) {
    const firm = d?.firm || s.body?.firm || null
    return (
      <PublicShell firm={firm} tenant={tenant}>
        <Gone offline={s.offline} onRetry={() => setTries(t => t + 1)}
          title="This home is no longer available"
          phone={d?.cta?.phone || s.body?.cta?.phone}
          catalogueUrl={d?.state === 'stopped' ? null : `/${tenant}/homes`} />
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
  const [st, setSt] = useState({ busy: false, done: false, err: '' })
  const set = (k) => (e) => setV(x => ({ ...x, [k]: e.target.value }))
  const ok = looksLikePhone(v.phone)
  const submit = (e) => {
    e.preventDefault()
    if (!ok || st.busy) return
    setSt({ busy: true, done: false, err: '' })
    api.publicEnquiry(tenant, {
      name: v.name.trim(), phone: v.phone.trim(),
      ...(propertyId ? { propertyId } : {}),
      ...(v.message.trim() ? { message: v.message.trim() } : {}),
      website: v.website,
    }, device)
      .then(() => setSt({ busy: false, done: true, err: '' }))
      .catch(err => setSt({ busy: false, done: false,
        err: err instanceof TypeError ? 'No connection. Try again.'
          : err?.status === 429 ? 'Too many tries. Try again in a minute.'
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
      <label className="pv-field"><span>Mobile number</span><input value={v.phone} onChange={set('phone')} inputMode="tel" autoComplete="tel" placeholder={phonePlaceholder('98xxx xxxxx')} required /></label>
      <label className="pv-field"><span>Message</span><textarea value={v.message} onChange={set('message')} rows={3} placeholder="Optional" /></label>
      {/* Not for people. A bot fills every field it finds. */}
      <input className="pv-hp" tabIndex={-1} autoComplete="off" aria-hidden="true" value={v.website} onChange={set('website')} name="website" />
      {st.err && <div className="pv-err" role="alert">{st.err}</div>}
      <button type="submit" className="pv-btn pv-btn-main pv-btn-wide" disabled={!ok || st.busy}>{st.busy ? 'Sending…' : 'Send'}</button>
      <p className="pv-consent">We use your number only to contact you about homes. <a href="/privacy" target="_blank" rel="noopener noreferrer">Privacy</a></p>
    </form>
  )
}
