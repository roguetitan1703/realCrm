import React, { lazy, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import './styles.css'
import Gallery from './modules/Gallery.jsx'
import { SharedLinkPage, CataloguePage, CatalogueHomePage } from './modules/Public.jsx'
import { registerServiceWorker, applyPwaIdentity, slugFromLocation } from './lib/pwa.js'
import { captureSupport } from './lib/support.js'

// THE DESK AND THE CONSOLE LOAD ON THEIR OWN. A buyer opening a shared link or
// the catalogue gets the buyer's pages and nothing else: not the desk, and not
// the phone-number reader the desk's forms use (~50 kB gzipped, lib/phone.js).
const Desk = lazy(() => Promise.all([import('./lib/store.jsx'), import('./App.jsx')])
  .then(([{ StoreProvider }, { default: App }]) => ({ default: () => <StoreProvider><App /></StoreProvider> })))
const Admin = lazy(() => import('./modules/Admin.jsx'))

// A DEPLOY BETWEEN TWO TAPS. A page left open (a catalogue in WhatsApp's
// browser, a desk tab overnight) asks for a chunk the new deploy no longer
// has; the host answers with index.html, the import fails, and the page went
// white. Reload once to pick up the new deploy. The guard stops a loop when
// the reload does not help; it is cleared once a page has run for a while.
const RELOADED = 'chunk-reload-at'
window.addEventListener('vite:preloadError', (event) => {
  let last = null
  try { last = sessionStorage.getItem(RELOADED) } catch { /* storage blocked */ }
  if (last) return
  try { sessionStorage.setItem(RELOADED, String(Date.now())) } catch { return }
  event.preventDefault()
  window.location.reload()
})
setTimeout(() => { try { sessionStorage.removeItem(RELOADED) } catch { /* storage blocked */ } }, 30_000)

/** Anything that still fails to render shows a way back, not a blank page. */
class Recover extends React.Component {
  constructor(props) { super(props); this.state = { failed: false } }
  static getDerivedStateFromError() { return { failed: true } }
  componentDidCatch(err) { console.error('[App] render failed:', err) }
  render() {
    if (!this.state.failed) return this.props.children
    return (
      <div style={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', padding: 16, background: 'var(--bg, #f4f3ef)' }}>
        <div style={{ display: 'grid', gap: 14, justifyItems: 'center', textAlign: 'center' }}>
          <div style={{ fontSize: 18, fontWeight: 600 }}>This page did not load</div>
          <button type="button" className="btn btn-primary" style={{ minHeight: 44, padding: '10px 22px' }}
            onClick={() => window.location.reload()}>Reload</button>
        </div>
      </div>
    )
  }
}

// index.html already linked this tenant's manifest before the parser got here —
// that is the only moment that decides what an install captures. This keeps the
// links in step for the rest of the session, from the same single reader.
// A read-only support view handed over by the superadmin console, taken
// before anything reads a token (lib/support.js).
captureSupport()
registerServiceWorker()
applyPwaIdentity(slugFromLocation())

// The superadmin console lives above every tenant — reachable at /admin (or
// ?admin). It has its own auth and doesn't need the tenant store, so it mounts
// as a separate root entirely (no StoreProvider, no tenant hydration).
const isAdminRoute =
  window.location.pathname.replace(/\/+$/, '').endsWith('/admin') ||
  new URLSearchParams(window.location.search).has('admin')

// A listing's photo link (7.5): /<firm slug>/photos/<project>-<code>, opened
// by a client from WhatsApp. No sign-in, so it mounts on its own like the
// console, without the desk.
const galleryAt = /^\/([a-z0-9-]+)\/photos\/([^/?#]+)\/?$/.exec(window.location.pathname)
// ?app=1 is how the link-preview page (backend routes/public.ts) hands a person
// it caught by mistake on to the app; the link they keep is the shared one.
if (galleryAt && new URLSearchParams(window.location.search).has('app')) {
  const u = new URL(window.location.href)
  u.searchParams.delete('app')
  window.history.replaceState(null, '', u.pathname + u.search + u.hash)
}

// The buyer's pages (listing-pages.md §A), mounted the same way: the firm's
// catalogue at /<firm>/homes[/<home>], and a shared link or a tap's ref at
// /<firm>/<code>. Codes are six characters and never a word the app routes on.
const catalogueAt = /^\/([a-z0-9-]+)\/homes(?:\/([^/?#]+))?\/?$/.exec(window.location.pathname)
const shareAt = !catalogueAt && /^\/([a-z0-9-]+)\/([a-z0-9]{6})\/?$/.exec(window.location.pathname)
if (shareAt && new URLSearchParams(window.location.search).has('app')) {
  const u = new URL(window.location.href)
  u.searchParams.delete('app')
  window.history.replaceState(null, '', u.pathname + u.search + u.hash)
}

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <Recover>
    {galleryAt ? (
      <Gallery slug={galleryAt[1]} refId={decodeURIComponent(galleryAt[2])} />
    ) : catalogueAt ? (
      catalogueAt[2]
        ? <CatalogueHomePage tenant={catalogueAt[1]} slug={decodeURIComponent(catalogueAt[2])} />
        : <CataloguePage tenant={catalogueAt[1]} />
    ) : shareAt ? (
      <SharedLinkPage tenant={shareAt[1]} code={shareAt[2]} />
    ) : isAdminRoute ? (
      <Suspense fallback={null}><Admin /></Suspense>
    ) : (
      <Suspense fallback={null}><Desk /></Suspense>
    )}
    </Recover>
  </React.StrictMode>
)
