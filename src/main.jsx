import React from 'react'
import { createRoot } from 'react-dom/client'
import './styles.css'
import { StoreProvider } from './lib/store.jsx'
import App from './App.jsx'
import Admin from './modules/Admin.jsx'

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
