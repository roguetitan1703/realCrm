import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// `/<slug>/sw.js` → `/sw.js`, which is a REWRITE VERCEL DOES IN PRODUCTION
// (see vercel.json). Without it here, preview's SPA fallback answers with
// index.html, the browser refuses it as a script, no worker registers, and
// every push-dependent thing is invisible locally in the one mode that was
// supposed to show it. vercel.json remains the source of truth for the deploy;
// this exists so a build can be driven before it is deployed.
const scopedServiceWorker = {
  name: 'scoped-service-worker',
  configurePreviewServer(server) {
    server.middlewares.use((req, _res, next) => {
      if (/^\/[^/]+\/sw\.js(\?|$)/.test(req.url || '')) req.url = '/sw.js'
      next()
    })
  },
}

export default defineConfig({
  plugins: [react(), scopedServiceWorker],
  // Same proxy for `preview` as for `dev`. A service worker is registered only
  // in a PROD build, so push, the alerts prompt and anything else the worker
  // touches are INVISIBLE under `npm run dev` — `vite preview` is the only way
  // to see them without deploying, and without this it had no API to talk to.
  preview: { proxy: { '/api': { target: 'http://localhost:5000', changeOrigin: true }, '/pwa': { target: 'http://localhost:5000', changeOrigin: true } } },
  server: {
    open: true,
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
      },
      // Per-tenant PWA manifest + icons live on the backend but must be reachable
      // at the frontend origin so the browser reads them as the app manifest.
      '/pwa': {
        target: 'http://localhost:5000',
        changeOrigin: true,
      },
    },
  },
  // only scan the real entry — ignore the design reference .html files at root
  optimizeDeps: { entries: ['index.html'] },
})
