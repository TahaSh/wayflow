import { resolve } from 'node:path'
import { defineConfig } from 'vite'

const root = resolve(__dirname, '../..')

export default defineConfig({
  resolve: {
    conditions: ['development'],
    alias: {
      '@wayflow/core': resolve(root, 'packages/core/src/index.ts'),
      '@wayflow/agent': resolve(root, 'packages/agent/src/index.ts'),
      '@wayflow/dom': resolve(root, 'packages/dom/src/index.ts'),
      '@wayflow/ui': resolve(root, 'packages/ui/src/index.ts'),
      '@wayflow/runtime': resolve(root, 'packages/runtime/src/index.ts'),
    },
  },
  server: {
    port: 5173,
    host: true,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
})
