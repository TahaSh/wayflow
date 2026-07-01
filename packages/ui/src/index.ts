// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
//  Editor — the public surface, re-exported through the root `wayflow` entry.
//  Lower-level building blocks (mountUI, the panel factories) stay internal.
// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––

export type {
  EditorMode,
  PreviewFooterOptions,
  PreviewKeyButtonOptions,
  PreviewOptions,
} from './mode'
export type { ModelAvailability, ModelsOption } from './model-controller'
export type {
  ConfigPanelOptions,
  EditorUIOptions,
  HeaderOptions,
  NodePaletteOptions,
  ToolbarOptions,
} from './mount'
export type {
  RenderMarkdown,
  RenderResultField,
  ResultFieldMeta,
} from './result-panel'
export type { Theme } from './theme'
export type {
  ApprovalDecision,
  ApprovalRequest,
  WorkflowEditor,
} from './workflow-editor'
export { createWorkflowEditor } from './workflow-editor'
