// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
//  Sidebar — the curated navigation tree
// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––

// The single source of truth for doc ordering and grouping. Pages are listed
// explicitly here (not derived from frontmatter) so structure is fully
// controlled; the pager order is derived from this same tree.

export interface SidebarLink {
  title: string
  slug: string
}

export interface SidebarSection {
  title: string
  items: SidebarLink[]
}

export const SIDEBAR: SidebarSection[] = [
  {
    title: 'Get started',
    items: [
      { title: 'Introduction', slug: 'getting-started/introduction' },
      { title: 'Quickstart', slug: 'getting-started/quickstart' },
      { title: 'Editor setup', slug: 'getting-started/editor-setup' },
    ],
  },
  {
    title: 'Building workflows',
    items: [
      { title: 'Node library', slug: 'building-workflows/node-library' },
      { title: 'Input & Output', slug: 'building-workflows/input-output' },
      { title: 'LLM', slug: 'building-workflows/llm' },
      { title: 'Tools', slug: 'building-workflows/tools' },
      { title: 'Conditional', slug: 'building-workflows/conditional' },
      { title: 'Merge', slug: 'building-workflows/merge' },
      { title: 'Map & arrays', slug: 'building-workflows/map-and-arrays' },
      {
        title: 'Image generation',
        slug: 'building-workflows/image-generation',
      },
      {
        title: 'Custom node types',
        slug: 'building-workflows/custom-node-types',
      },
    ],
  },
  {
    title: 'Running workflows',
    items: [
      { title: 'Where workflows run', slug: 'running-workflows/overview' },
      { title: 'In the browser', slug: 'running-workflows/in-the-browser' },
      { title: 'On a server', slug: 'running-workflows/on-a-server' },
      {
        title: 'Debugging & diagnostics',
        slug: 'running-workflows/debugging',
      },
      {
        title: 'Structured output',
        slug: 'running-workflows/structured-output',
      },
      {
        title: 'Human-in-the-loop',
        slug: 'running-workflows/human-in-the-loop',
      },
      {
        title: 'Workflows as tools',
        slug: 'running-workflows/workflows-as-tools',
      },
      {
        title: 'Persistence & autosave',
        slug: 'running-workflows/persistence',
      },
    ],
  },
  {
    title: 'Customizing the editor',
    items: [
      { title: 'Editor modes', slug: 'customizing-the-editor/editor-modes' },
      { title: 'Theming', slug: 'customizing-the-editor/theming' },
      { title: 'Layout & header', slug: 'customizing-the-editor/layout' },
      { title: 'Mobile', slug: 'customizing-the-editor/mobile' },
      {
        title: 'Custom result rendering',
        slug: 'customizing-the-editor/custom-result-rendering',
      },
    ],
  },
  {
    title: 'Concepts',
    items: [
      { title: 'Mental model', slug: 'concepts/mental-model' },
      {
        title: 'Providers & models',
        slug: 'concepts/providers-and-models',
      },
    ],
  },
  {
    title: 'Examples',
    items: [{ title: 'Examples', slug: 'examples' }],
  },
  {
    title: 'Reference',
    items: [
      { title: 'Overview', slug: 'reference/overview' },
      { title: 'wayflow', slug: 'reference/wayflow' },
      { title: 'wayflow/runtime', slug: 'reference/runtime' },
      { title: 'wayflow/models', slug: 'reference/models' },
      { title: 'wayflow/agent', slug: 'reference/agent' },
      { title: 'wayflow/core', slug: 'reference/core' },
      { title: 'wayflow/dom', slug: 'reference/dom' },
      { title: 'Error codes', slug: 'reference/error-codes' },
    ],
  },
]
