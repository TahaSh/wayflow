// 'edit' is the full authoring editor. 'read-only' is the same editor with
// nothing editable (no palette, inspect-only config). 'preview' adds a minimal
// embeddable shell for dropping a workflow into a page. All three can run.
export const EDITOR_MODE = {
  EDIT: 'edit',
  READ_ONLY: 'read-only',
  PREVIEW: 'preview',
} as const
export type EditorMode = (typeof EDITOR_MODE)[keyof typeof EDITOR_MODE]

export interface PreviewFooterOptions {
  // Defaults to a generic interaction hint; false hides the caption.
  caption?: string | false
  end?: string
}

export interface PreviewKeyButtonOptions {
  onSubmit: (key: string) => void
  label?: string
  isActive?: () => boolean
  activeLabel?: string
}

// Honored only when mode === 'preview'.
export interface PreviewOptions {
  footer?: false | PreviewFooterOptions
  keyButton?: false | PreviewKeyButtonOptions
  themeToggle?: boolean
  zoom?: boolean
}

// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
//  Mode features
//
//  Single source of truth for what each mode shows. mountUI (and the editor's
//  shell) read this table instead of branching on the mode name, so a mode's
//  full behavior lives in one row and a new mode is a one-row edit.
// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––

export interface ModeFeatures {
  // Left palette of draggable node types.
  palette: boolean
  // How the config/result inspector is presented.
  inspector: 'sidebar' | 'overlay' | 'none'
  // Fields are editable (vs. read-only display) and the Issues tab is shown.
  editable: boolean
  // Floating canvas toolbar: zoom + fit + history / zoom + fit / none.
  toolbar: 'full' | 'view' | 'none'
  // Zoom controls (+ optional key button) live in the header.
  headerZoom: boolean
  // Workflow-name dropdown (settings / import / export).
  titleMenu: boolean
  // Run-state dot beside the workflow name.
  statusDot: boolean
  // Footer caption / end strip.
  footer: boolean
  // The Run split-button's "Set test inputs…" entry.
  runMenu: boolean
  // 'persist' writes entered values as Input defaults; 'collect' runs with them
  // without touching the graph.
  inputs: 'persist' | 'collect'
  // Block Run on design-time validation errors.
  gateRun: boolean
}

export const MODE_FEATURES: Record<EditorMode, ModeFeatures> = {
  edit: {
    palette: true,
    inspector: 'sidebar',
    editable: true,
    toolbar: 'full',
    headerZoom: false,
    titleMenu: true,
    statusDot: false,
    footer: false,
    runMenu: true,
    inputs: 'persist',
    gateRun: true,
  },
  'read-only': {
    palette: false,
    inspector: 'sidebar',
    editable: false,
    toolbar: 'view',
    headerZoom: false,
    titleMenu: false,
    statusDot: true,
    footer: false,
    runMenu: true,
    inputs: 'collect',
    gateRun: false,
  },
  preview: {
    palette: false,
    inspector: 'overlay',
    editable: false,
    toolbar: 'none',
    headerZoom: true,
    titleMenu: false,
    statusDot: true,
    footer: true,
    runMenu: false,
    inputs: 'collect',
    gateRun: false,
  },
}
