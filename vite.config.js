import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// A BUILD THAT CANNOT REACH A BACKEND MUST NOT BE PRODUCED.
//
// resolveBaseUrl() falls back to same-origin `/api/v1` when VITE_API_URL is
// unset. On Vercel nothing serves that path, so the deploy goes live, renders,
// and 404s every single request — a site that looks finished and does nothing,
// with no error naming the cause. The variable is baked in at build time, so
// build time is the only moment this is free to catch.
const requireApiUrl = (mode) => ({
  name: 'require-api-url',
  apply: 'build',
  config() {
    const env = loadEnv(mode, process.cwd(), '')
    if ((env.VITE_API_URL || '').trim()) return
    throw new Error([
      '',
      'VITE_API_URL is not set, and a production build has no other way to find the API.',
      'Without it the deployed site answers every request with a 404 from its own origin.',
      '',
      '  Vercel preview : vercel deploy --build-env VITE_API_URL=<staging api url>',
      '  Vercel prod    : set VITE_API_URL in the Production environment',
      '  Local build    : VITE_API_URL=http://localhost:5000 npm run build',
      '',
    ].join(String.fromCharCode(10)))
  },
})

export default defineConfig(({ mode }) => ({
  plugins: [react(), requireApiUrl(mode)],
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
}))
