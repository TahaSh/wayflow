import { resolve } from 'node:path'
import { defineConfig } from 'vite'

const root = resolve(__dirname, '../..')

export default defineConfig({
  resolve: {
    alias: {
      '@wayflow/core': resolve(root, 'packages/core/src/index.ts'),
      '@wayflow/dom': resolve(root, 'packages/dom/src/index.ts'),
    },
  },
})
