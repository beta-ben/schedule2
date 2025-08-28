import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Use '/' for custom domains. Override with GHPAGES_BASE (e.g. '/schedule2/') when deploying under a subpath.
const BASE = process.env.GHPAGES_BASE || '/'

export default defineConfig({
  plugins: [react()],
  base: BASE,
})
