import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Use '/' for custom domains. Override with GHPAGES_BASE (e.g. '/schedule2/') when deploying under a subpath.
const BASE = process.env.GHPAGES_BASE || '/'

export default defineConfig({
  plugins: [react()],
  base: BASE,
  // In dev, proxy API calls to the local Worker on 8787 so we have
  // same-origin cookies/CORS behavior as production.
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:8787',
        changeOrigin: true,
        secure: false,
      },
    },
  },
})
