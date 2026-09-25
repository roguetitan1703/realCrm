import React from 'react'
import { createRoot } from 'react-dom/client'
import './styles.css'
import { StoreProvider } from './lib/store.jsx'
import App from './App.jsx'
import Admin from './modules/Admin.jsx'
import Gallery from './modules/Gallery.jsx'
import { registerServiceWorker, applyPwaIdentity, slugFromLocation } from './lib/pwa.js'
import { captureSupport } from './lib/support.js'

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

// A listing's photo link (7.5): /g/<ref>, opened by a client from WhatsApp.
// No workspace and no sign-in, so it mounts on its own like the console.
const galleryRef = (/^\/g\/([^/?#]+)/.exec(window.location.pathname) || [])[1] || null

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    {galleryRef ? (
      <Gallery refId={decodeURIComponent(galleryRef)} />
    ) : isAdminRoute ? (
      <Admin />
    ) : (
      <StoreProvider>
        <App />
      </StoreProvider>
    )}
  </React.StrictMode>
)
