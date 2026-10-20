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
  </React.StrictMode>
)
