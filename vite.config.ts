import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const BASE = process.env.GHPAGES_BASE || '/schedule2/'

export default defineConfig({
  plugins: [react()],
  base: BASE,
})
