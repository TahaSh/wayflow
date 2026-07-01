// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
//  Shiki — shared highlighting themes
// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––

// Used by both the Markdown pipeline (astro.config) and the <Code> component.
// Code follows the page theme; CSS selects via the --shiki-light/dark vars.

export const SHIKI_THEMES = {
  light: 'github-light-default',
  dark: 'github-dark-default',
} as const

// Nudge github-dark-default toward the brand code palette: strings render green
// and function names muted (keywords already come out coral, so we keep them).
// Rewrites the resolved --shiki-dark colors on each token span; light stays.
interface SpanNode {
  properties?: { style?: string | (string | number)[] | null }
}

export const recolorTransformer = {
  name: 'wf-recolor',
  span(node: SpanNode) {
    const props = node.properties
    if (!props || typeof props.style !== 'string') return
    props.style = props.style
      .replace(/#a5d6ff/gi, '#7ee787') // strings: blue → green
      .replace(/#d2a8ff/gi, '#e6edf3') // functions: purple → muted
  },
}
