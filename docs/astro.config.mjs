import mdx from '@astrojs/mdx'
import sitemap from '@astrojs/sitemap'
import { defineConfig } from 'astro/config'
import { recolorTransformer, SHIKI_THEMES } from './src/lib/shiki'

// Update before deploy.
const SITE = 'https://wayflow.build'

export default defineConfig({
  site: SITE,
  integrations: [mdx(), sitemap()],
  markdown: {
    // Dual themes so code follows the page theme; CSS selects via --shiki-*.
    shikiConfig: {
      themes: SHIKI_THEMES,
      transformers: [recolorTransformer],
      defaultColor: false,
      wrap: true,
    },
  },
  vite: {
    // Resolve `wayflow` and its subpaths to package source (root exports map's
    // `development` condition) so library edits hot-reload without a dist build.
    resolve: { conditions: ['development'] },
  },
})
