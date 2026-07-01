import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { defineConfig, type UserConfig } from 'tsdown'

const DOM_CSS = 'packages/dom/src/styles.css'
const UI_CSS = 'packages/ui/src/styles.css'

// Inlines Vite-style `?raw` imports as strings. Vite resolves `?raw` natively;
// this bridges the same convention to the library bundler.
function rawImportPlugin() {
  const SUFFIX = '?raw'
  return {
    name: 'raw-import',
    resolveId(source: string, importer: string | undefined) {
      if (source.endsWith(SUFFIX) && importer) {
        return (
          resolve(dirname(importer), source.slice(0, -SUFFIX.length)) + SUFFIX
        )
      }
    },
    load(id: string) {
      if (id.endsWith(SUFFIX)) {
        const file = readFileSync(id.slice(0, -SUFFIX.length), 'utf-8')
        return `export default ${JSON.stringify(file)}`
      }
    },
  }
}

// Emits a standalone styles.css for hosts that prefer a real, cacheable stylesheet
// (CSP-friendly, preloadable) over the inlined inject*Styles() helpers. Sources are
// concatenated in cascade order, mirroring the JS bundle for that tier so each file
// is self-sufficient.
type EmitFileContext = {
  emitFile: (file: { type: 'asset'; fileName: string; source: string }) => void
}

function emitStylesheetPlugin(sources: string[]) {
  return {
    name: 'emit-stylesheet',
    generateBundle(this: EmitFileContext) {
      const css = sources.map((file) => readFileSync(file, 'utf-8')).join('\n')
      this.emitFile({ type: 'asset', fileName: 'styles.css', source: css })
    },
  }
}

const shared = {
  format: 'esm',
  dts: true,
  clean: false,
  // A references-free tsconfig: the root one is a project-references "solution"
  // config (for `tsc -b` and the IDE), which tsdown's .d.ts generator can't load.
  tsconfig: 'tsconfig.build.json',
  outExtensions: () => ({ js: '.js', dts: '.d.ts' }),
  plugins: [rawImportPlugin()],
  deps: { alwaysBundle: [/^@wayflow\//] },
} satisfies UserConfig

export default defineConfig([
  { ...shared, entry: 'packages/core/src/index.ts', outDir: 'dist/core' },
  {
    ...shared,
    entry: 'packages/dom/src/index.ts',
    outDir: 'dist/dom',
    plugins: [rawImportPlugin(), emitStylesheetPlugin([DOM_CSS])],
  },
  { ...shared, entry: 'packages/agent/src/index.ts', outDir: 'dist/agent' },
  {
    ...shared,
    entry: 'packages/ui/src/index.ts',
    outDir: 'dist/ui',
    plugins: [rawImportPlugin(), emitStylesheetPlugin([DOM_CSS, UI_CSS])],
  },
  {
    ...shared,
    entry: [
      'packages/runtime/src/index.ts',
      'packages/runtime/src/sse.ts',
      'packages/runtime/src/client.ts',
    ],
    outDir: 'dist/runtime',
  },
  {
    ...shared,
    entry: ['packages/models/src/index.ts', 'packages/models/src/openai.ts'],
    outDir: 'dist/models',
  },
  { ...shared, entry: 'src/index.ts', outDir: 'dist' },
])
