import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Use '/' for custom domains. Override with GHPAGES_BASE (e.g. '/schedule2/') when deploying under a subpath.
const BASE = process.env.GHPAGES_BASE || '/'

export default defineConfig({
  plugins: [react()],
  base: BASE,
<<<<<<< HEAD
  server: {
    port: 5173,
    proxy: {
      // Ensure all /api calls are routed locally even if code accidentally used absolute localhost:8787 elsewhere.
      '/api': {
        target: 'http://localhost:5174',
        changeOrigin: true,
        ws: true,
      }
    }
  }
=======
  clearScreen: false,
  logLevel: 'warn',
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
>>>>>>> c76a6b2a8c4404b7ec7131ea39ccd1b1d3b55a13
})
