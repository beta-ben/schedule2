import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

<<<<<<< HEAD
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
  include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    coverage: { provider: 'v8', reports: ['text','html'], exclude: ['**/node_modules/**'] }
  }
})

=======
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: './src/setupTests.ts',
    globals: true
  }
})


>>>>>>> c76a6b2a8c4404b7ec7131ea39ccd1b1d3b55a13