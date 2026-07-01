import { defineConfig } from 'vitest/config'

export default defineConfig({
  // Resolve @wayflow/* to package source (same condition the examples use),
  // so tests run against the live TypeScript, not the built dist.
  resolve: {
    conditions: ['development'],
  },
  test: {
    include: ['tests/**/*.test.ts'],
  },
})
