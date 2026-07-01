import { resolve } from 'node:path'
import { defineConfig } from 'vite'

const root = resolve(__dirname, '../..')

export default defineConfig({
  resolve: {
    alias: {
      wayflow: resolve(root, 'src/index.ts'),
      '@wayflow/core': resolve(root, 'packages/core/src/index.ts'),
      '@wayflow/agent': resolve(root, 'packages/agent/src/index.ts'),
      '@wayflow/dom': resolve(root, 'packages/dom/src/index.ts'),
      '@wayflow/ui': resolve(root, 'packages/ui/src/index.ts'),
    },
  },
})
