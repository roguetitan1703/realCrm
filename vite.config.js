import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: { open: true },
  // only scan the real entry — ignore the design reference .html files at root
  optimizeDeps: { entries: ['index.html'] },
})
