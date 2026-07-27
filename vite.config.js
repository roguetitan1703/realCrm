import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
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
