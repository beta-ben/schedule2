import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Use relative base so it works on GH Pages subpaths (e.g., /schedule2/) and custom domains.
const BASE = './'

export default defineConfig({
  plugins: [react()],
  base: BASE,
})
