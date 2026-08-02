import React from 'react'
import { createRoot } from 'react-dom/client'
import { Analytics } from '@vercel/analytics/react'
import { SpeedInsights } from '@vercel/speed-insights/react'
import './styles.css'
import { StoreProvider } from './lib/store.jsx'
import App from './App.jsx'
import Admin from './modules/Admin.jsx'
import { registerServiceWorker, applyPwaIdentity, slugFromLocation } from './lib/pwa.js'

// index.html already linked this tenant's manifest before the parser got here —
// that is the only moment that decides what an install captures. This keeps the
// links in step for the rest of the session, from the same single reader.
registerServiceWorker()
applyPwaIdentity(slugFromLocation())

// The superadmin console lives above every tenant — reachable at /admin (or
// ?admin). It has its own auth and doesn't need the tenant store, so it mounts
// as a separate root entirely (no StoreProvider, no tenant hydration).
const isAdminRoute =
  window.location.pathname.replace(/\/+$/, '').endsWith('/admin') ||
  new URLSearchParams(window.location.search).has('admin')

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    {isAdminRoute ? (
      <Admin />
    ) : (
      <StoreProvider>
        <App />
      </StoreProvider>
    )}
    <Analytics />
    <SpeedInsights />
  </React.StrictMode>
)
