import React from 'react'
import { createRoot } from 'react-dom/client'
import './styles.css'
import { StoreProvider } from './lib/store.jsx'
import App from './App.jsx'
import Admin from './modules/Admin.jsx'
import { registerServiceWorker, applyPwaIdentity } from './lib/pwa.js'

// Make the app installable and wear the right identity from the first paint:
// the ?ws= the installed app was launched with, else the last-used workspace.
registerServiceWorker()
const wsParam = new URLSearchParams(window.location.search).get('ws')
applyPwaIdentity(wsParam || (typeof localStorage !== 'undefined' ? localStorage.getItem('crm_tenant_id') : null))

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
  </React.StrictMode>
)
