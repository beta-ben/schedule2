import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

const reactPlugin = react()

export default defineConfig({
  plugins: [reactPlugin as any],
  test: {
    environment: 'jsdom',
    setupFiles: './src/setupTests.ts',
    globals: true,
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      exclude: ['**/node_modules/**'],
    },
  },
})
