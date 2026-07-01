import {
  BUILTIN_NODE_TYPES,
  buildPorts,
  createConsoleLogger,
  createNodeTypeRegistry,
  createPortTypeRegistry,
  createTypedNode,
  type Field,
  hasDynamicPorts,
  isTypeCompatible,
  type Logger,
  type NodeConfig,
  type NodeTypeDefinition,
  type NodeTypeRegistry,
  PORT_TYPES,
  type PortTypeDefinition,
  type PortTypeRegistry,
  REVIEW_DECISION,
  type RunDataEntry,
  resolvePorts,
  type ToolMetadata,
  type ValidationWarning,
  validateGraph,
  validateRunResults,
} from '@wayflow/agent'
import {
  type EdgeStatus,
  type Graph,
  NODE_STATUS,
  type Node,
  type NodeStatus,
  type Position,
  type Viewport,
} from '@wayflow/core'
import {
  clearExecutionState,
  createEditor,
  type Editor,
  type NodeContentRenderer,
  PERSISTENCE_STATE,
  type PersistenceConfig,
  RUN_PREVIEW_TONE,
  type RunPreview,
  setEdgeStatus,
  setNodeLocating,
  setNodeRunPreview,
  setNodeStatus,
  setNodeWarning,
} from '@wayflow/dom'
import { createApprovalCard } from './approval-card'
import { createIconFromMarkup, ICON_PATHS } from './icons'
import {
  EDITOR_MODE,
  type EditorMode,
  MODE_FEATURES,
  type PreviewOptions,
} from './mode'
import {
  createModelController,
  type ModelAvailability,
  type ModelsOption,
} from './model-controller'
import {
  type EditorUIOptions,
  type MountUIHandle,
  mountUI,
  type OnRunCallback,
  type RunSessionFn,
} from './mount'
import type { RenderMarkdown, RenderResultField } from './result-panel'
import { injectUIStyles } from './styles'
import { createThemeController, THEME, type Theme } from './theme'
import { attachTooltip } from './tooltip'

// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
//  Constants
// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––

const INLINE_PREVIEW_MAX_CHARS = 60
const VALIDATION_DEBOUNCE_MS = 200

// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
//  Types
// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––

type AddNodeParams = {
  type: string
  position: Position
  data?: NodeConfig
}

export interface ApprovalRequest {
  nodeId: string
  instructions: string
  data: unknown
  signal?: AbortSignal
}

export interface ApprovalDecision {
  approved: boolean
  data: unknown
}

export interface WorkflowEditorExtension {
  getRegisteredNodeTypes: () => NodeTypeRegistry
  getNodeTypeDefinition: (type: string) => NodeTypeDefinition | undefined
  getRegisteredPortTypes: () => PortTypeRegistry
  getRegisteredTools: () => Record<string, ToolMetadata>
  getNodeConfig: (nodeId: string) => NodeConfig
  updateNodeConfig: (nodeId: string, updates: NodeConfig) => void
  // Edge-preserving rename of a row in a 'fields'-typed config. Returns false if rejected
  // (duplicate, missing field, etc.) so callers can surface invalid-state UX.
  renameField: (
    nodeId: string,
    configKey: string,
    oldName: string,
    newName: string,
  ) => boolean
  setNodeStatus: (nodeId: string, status: NodeStatus) => void
  setEdgeStatus: (edgeId: string, status: EdgeStatus) => void
  setNodeLocating: (nodeId: string, locating: boolean) => void
  clearExecutionState: () => void
  setNodeRunData: (nodeId: string, partial: Partial<RunDataEntry>) => void
  // Returns a clone of the per-node run cache, keyed by nodeId.
  getResults: () => Record<string, RunDataEntry>
  // `changedNodeId` is the node whose data just changed (undefined on a full
  // reset) — lets listeners skip work when it isn't the node they're showing.
  onResultsUpdate: (
    callback: (
      results: Record<string, RunDataEntry>,
      changedNodeId?: string,
    ) => void,
  ) => () => void
  getValidationWarnings: () => ValidationWarning[]
  onValidationUpdate: (
    callback: (warnings: ValidationWarning[]) => void,
  ) => () => void
  addNode: (params: AddNodeParams) => Node
  setTheme: (theme: Theme) => void
  // Shows the run-scoped approval card for a paused node and resolves with the
  // human's decision (null if the run is cancelled while waiting).
  requestApproval: (
    request: ApprovalRequest,
  ) => Promise<ApprovalDecision | null>
  // Runs a function inside the run-in-progress UI (Cancel button + status), so a
  // programmatic resume is cancellable like a normal run.
  runSession: (fn: RunSessionFn) => Promise<void>
  // Sets the selectable models for model-bearing nodes after creation (e.g. once
  // a host has fetched them). Refreshes the palette and any open config panel.
  setModels: (models: { llm?: string[]; imageGeneration?: string[] }) => void
  onModelsChange: (callback: () => void) => () => void
  // undefined for node types that don't take a model; otherwise whether the type
  // can be used and, when not, a human-readable reason for the disabled state.
  getModelAvailability: (type: string) => ModelAvailability | undefined
}

export type WorkflowEditor = Editor & WorkflowEditorExtension

interface CreateWorkflowEditorParams {
  mode?: EditorMode
  preview?: PreviewOptions
  nodeTypes?: Record<string, NodeTypeDefinition>
  portTypes?: Record<string, PortTypeDefinition>
  nodeRenderers?: Record<string, NodeContentRenderer>
  ui?: EditorUIOptions | false
  onRun?: OnRunCallback
  onReady?: () => void
  graph?: Graph
  viewport?: Viewport
  persistence?: PersistenceConfig
  showPortLabels?: boolean
  llm?: { models?: ModelsOption }
  imageGeneration?: { models?: ModelsOption }
  tools?: Record<string, ToolMetadata>
  theme?: Theme
  icons?: Record<string, string>
  renderResultField?: RenderResultField
  renderMarkdown?: RenderMarkdown
  logger?: Logger
  debug?: boolean
}

// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
//  Factory
// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––

export const createWorkflowEditor = (
  container: HTMLElement,
  {
    mode = EDITOR_MODE.EDIT,
    preview,
    nodeTypes,
    portTypes,
    nodeRenderers,
    ui,
    onRun,
    onReady,
    graph,
    viewport,
    persistence,
    showPortLabels = true,
    llm,
    imageGeneration,
    tools,
    theme = THEME.AUTO,
    icons,
    renderResultField,
    renderMarkdown,
    logger,
    debug = false,
  }: CreateWorkflowEditorParams = {},
): WorkflowEditor => {
  const nodeTypeRegistry = createNodeTypeRegistry(
    nodeTypes ?? BUILTIN_NODE_TYPES,
  )
  const portTypeRegistry = createPortTypeRegistry(portTypes ?? PORT_TYPES)
  const toolCatalog: Record<string, ToolMetadata> = tools ?? {}
  const log = logger ?? (debug ? createConsoleLogger() : undefined)
  const modelController = createModelController(
    nodeTypeRegistry,
    { llm: llm?.models, imageGeneration: imageGeneration?.models },
    log,
  )

  // –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
  //  Shell layout
  //
  //  Without header: container is a flex row; nodePalette | canvas | config-panel
  //  sit directly inside it.
  //  With header: container becomes a flex column; the header sits on top and
  //  a `.wf-shell-row` wraps nodePalette | canvas | config-panel below.
  // –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––

  // MODE_FEATURES is the single source of truth for per-mode behavior; the dom
  // editor only needs whether the graph is editable.
  const features = MODE_FEATURES[mode]
  const readOnly = !features.editable

  container.classList.add('wf-shell')
  const themeController = createThemeController(container, theme)

  const headerEnabled = ui !== false && (ui?.header ?? true) !== false
  let canvasParent: HTMLElement = container
  if (headerEnabled) {
    container.classList.add('wf-shell-with-header')
    const row = document.createElement('div')
    row.classList.add('wf-shell-row')
    container.appendChild(row)
    canvasParent = row
  }

  const canvasEl = document.createElement('div')
  canvasEl.classList.add('wf-shell-canvas')
  canvasParent.appendChild(canvasEl)

  const iconRegistry: Record<string, string> = { ...ICON_PATHS, ...icons }

  // Resolves a node-type icon (built-in or host-registered) to an SVG. Shared
  // by the canvas nodes and the palette so custom icons appear in both.
  const iconFactory = (name: string, size?: number): SVGElement | null => {
    const markup = iconRegistry[name]
    if (!markup) return null
    return createIconFromMarkup(markup, size ? { size } : undefined)
  }

  const editor = createEditor(canvasEl, {
    graph,
    viewport,
    persistence,
    readOnly,
    customValidator: (sourcePort, targetPort) =>
      isTypeCompatible(sourcePort.dataType, targetPort.dataType),
    showPortLabels,
    nodeRenderers,
    tooltipFactory: (anchor, getContent, opts) =>
      attachTooltip(anchor, getContent, opts).destroy,
    iconFactory,
    portTypeLabel: (dataType) => portTypeRegistry[dataType]?.label ?? dataType,
    keyboardTarget: container,
  })

  if (log) {
    editor.on('persistenceError', ({ phase, error }) =>
      log.error(`${phase} failed`, {
        message: error instanceof Error ? error.message : String(error),
      }),
    )
  }

  const baseAddNode = editor.addNode

  const getConnectedPortIds = (nodeId: string): Set<string> => {
    const ids = new Set<string>()
    for (const edge of Object.values(editor.getGraph().edges)) {
      if (edge.sourceNodeId === nodeId) ids.add(edge.sourcePortId)
      if (edge.targetNodeId === nodeId) ids.add(edge.targetPortId)
    }
    return ids
  }

  const refreshNodePreview = (nodeId: string): void => {
    const node = editor.getGraph().nodes[nodeId]
    if (!node) return
    const definition = nodeTypeRegistry[node.type]
    if (!definition || typeof definition.configPreview !== 'function') return
    editor.updateNodePreview(
      nodeId,
      definition.configPreview(node.data, {
        connectedPortIds: getConnectedPortIds(nodeId),
      }),
    )
  }

  let results: Record<string, RunDataEntry> = {}
  // Each node's config signature at run time — lets validation skip nodes
  // edited since their run (their result no longer matches the current schema).
  let runConfigSignatures = new Map<string, string>()
  const resultListeners = new Set<
    (results: Record<string, RunDataEntry>, changedNodeId?: string) => void
  >()
  const emitResultsUpdate = (changedNodeId?: string): void => {
    for (const listener of resultListeners) listener(results, changedNodeId)
  }

  const applyRunPreview = (nodeId: string): void => {
    const entry = results[nodeId]
    if (!entry) return
    const node = editor.getGraph().nodes[nodeId]
    const definition = node ? nodeTypeRegistry[node.type] : undefined
    setNodeRunPreview({
      container: canvasEl,
      nodeId,
      preview: definition?.hideInlinePreview ? null : computeRunPreview(entry),
    })
  }

  let validationWarnings: ValidationWarning[] = []
  let warnedNodeIds = new Set<string>()
  // Last-run status per node/edge, so virtualization can restore it on the
  // elements it re-creates when they re-enter the viewport.
  const nodeStatuses = new Map<string, NodeStatus>()
  const edgeStatuses = new Map<string, EdgeStatus>()
  const validationListeners = new Set<(warnings: ValidationWarning[]) => void>()

  const runValidation = (): void => {
    const graph = editor.getGraph()
    const freshRun: Record<string, RunDataEntry> = {}
    for (const [nodeId, entry] of Object.entries(results)) {
      const node = graph.nodes[nodeId]
      if (
        node &&
        runConfigSignatures.get(nodeId) === JSON.stringify(node.data)
      ) {
        freshRun[nodeId] = entry
      }
    }
    validationWarnings = [
      ...validateGraph(graph, nodeTypeRegistry, toolCatalog),
      ...validateRunResults(graph, freshRun),
    ]
    warnedNodeIds = new Set<string>()
    for (const warning of validationWarnings) {
      for (const id of warning.nodeIds ?? []) warnedNodeIds.add(id)
    }
    for (const nodeId of Object.keys(graph.nodes)) {
      setNodeWarning({
        container: canvasEl,
        nodeId,
        warned: warnedNodeIds.has(nodeId),
      })
    }
    for (const listener of validationListeners) listener(validationWarnings)
  }

  const workflowEditor: WorkflowEditor = Object.assign(editor, {
    getRegisteredNodeTypes: () => nodeTypeRegistry,
    getNodeTypeDefinition: (type: string) => nodeTypeRegistry[type],
    getRegisteredPortTypes: () => portTypeRegistry,
    getRegisteredTools: () => toolCatalog,
    getNodeConfig: (nodeId: string) => {
      const graph = editor.getGraph()
      return graph.nodes[nodeId]?.data ?? {}
    },
    updateNodeConfig: (nodeId: string, updates: NodeConfig) => {
      const node = editor.getGraph().nodes[nodeId]
      if (!node) return
      const definition = nodeTypeRegistry[node.type]

      const merged = { ...node.data, ...updates }
      const reconciled = definition?.reconcileData
        ? definition.reconcileData(merged)
        : merged
      const nextUpdates = reconciled === merged ? updates : reconciled

      editor.updateNodeData(nodeId, nextUpdates)

      if (definition && hasDynamicPorts(definition)) {
        const ports = buildPorts(
          resolvePorts(definition, reconciled),
          portTypeRegistry,
        )
        editor.setNodePorts(nodeId, ports)
      }

      refreshNodePreview(nodeId)
      // Rebuilds above drop the inline preview — restore it.
      applyRunPreview(nodeId)
    },
    renameField: (
      nodeId: string,
      configKey: string,
      oldName: string,
      newName: string,
    ): boolean => {
      if (oldName === newName) return true
      const node = editor.getGraph().nodes[nodeId]
      if (!node) return false
      const fields = node.data[configKey] as Field[] | undefined
      if (!Array.isArray(fields)) return false
      const idx = fields.findIndex((f) => f.name === oldName)
      if (idx === -1) return false
      if (fields.some((f, i) => i !== idx && f.name === newName)) return false

      // renamePort takes the one history snapshot; the field write runs untracked
      // to share it, so a single undo reverts both. `node` is a getGraph() clone —
      // write through updateNodeData or the rename never reaches the real graph.
      editor.renamePort(nodeId, oldName, newName)
      const nextFields = fields.map((f, i) =>
        i === idx ? { ...f, name: newName } : f,
      )
      editor.untracked(() => {
        editor.updateNodeData(nodeId, { [configKey]: nextFields })
      })
      return true
    },
    setNodeStatus: (nodeId: string, status: NodeStatus) => {
      nodeStatuses.set(nodeId, status)
      setNodeStatus({ container: canvasEl, nodeId, status })
    },
    setEdgeStatus: (edgeId: string, status: EdgeStatus) => {
      edgeStatuses.set(edgeId, status)
      setEdgeStatus({ container: canvasEl, edgeId, status })
    },
    setNodeLocating: (nodeId: string, locating: boolean) => {
      setNodeLocating({ container: canvasEl, nodeId, locating })
    },
    clearExecutionState: () => {
      clearExecutionState(canvasEl)
      nodeStatuses.clear()
      edgeStatuses.clear()
      results = {}
      runConfigSignatures = new Map()
      emitResultsUpdate()
    },
    setNodeRunData: (nodeId: string, partial: Partial<RunDataEntry>) => {
      const prev = results[nodeId]
      if (!prev) {
        const node = editor.getGraph().nodes[nodeId]
        if (node) runConfigSignatures.set(nodeId, JSON.stringify(node.data))
      }
      const merged = { ...prev, ...partial } as RunDataEntry
      results = { ...results, [nodeId]: merged }
      applyRunPreview(nodeId)
      emitResultsUpdate(nodeId)
    },
    getResults: () => structuredClone(results),
    onResultsUpdate: (
      callback: (results: Record<string, RunDataEntry>) => void,
    ) => {
      resultListeners.add(callback)
      return () => {
        resultListeners.delete(callback)
      }
    },
    getValidationWarnings: () => [...validationWarnings],
    onValidationUpdate: (callback: (warnings: ValidationWarning[]) => void) => {
      validationListeners.add(callback)
      return () => {
        validationListeners.delete(callback)
      }
    },
    addNode: ({ type, position, data }: AddNodeParams) => {
      const node = createTypedNode({
        type,
        registry: nodeTypeRegistry,
        portTypes: portTypeRegistry,
        position,
        data,
      })

      return baseAddNode(node)
    },
    setTheme: themeController.setTheme,
    requestApproval: ({
      nodeId,
      instructions,
      data,
      signal,
    }: ApprovalRequest) =>
      new Promise<ApprovalDecision | null>((resolve) => {
        const node = editor.getGraph().nodes[nodeId]
        const title = node?.name || node?.label || 'Human Review'
        let settled = false
        const card = createApprovalCard({
          title,
          instructions,
          data,
          onApprove: (edited) => finish({ approved: true, data: edited }),
          onReject: () => finish({ approved: false, data }),
        })
        const recordDecision = (result: ApprovalDecision) => {
          workflowEditor.setNodeRunData(nodeId, {
            decision: result.approved
              ? REVIEW_DECISION.APPROVED
              : REVIEW_DECISION.REJECTED,
          })
        }
        function finish(result: ApprovalDecision | null): void {
          if (settled) return
          settled = true
          if (result) recordDecision(result)
          uiHandle?.setAwaitingReview(false)
          card.destroy()
          signal?.removeEventListener('abort', onAbort)
          resolve(result)
        }
        function onAbort(): void {
          finish(null)
        }
        if (signal?.aborted) return finish(null)
        signal?.addEventListener('abort', onAbort)
        canvasEl.appendChild(card.element)
        uiHandle?.setAwaitingReview(true)
      }),
    runSession: (fn: RunSessionFn) =>
      uiHandle ? uiHandle.runSession(fn) : fn(new AbortController().signal),
    setModels: modelController.setModels,
    onModelsChange: modelController.onChange,
    getModelAvailability: modelController.getAvailability,
  })

  const refreshEndpointPreviews = ({
    edge,
  }: {
    edge: { sourceNodeId: string; targetNodeId: string }
  }) => {
    refreshNodePreview(edge.sourceNodeId)
    refreshNodePreview(edge.targetNodeId)
  }
  editor.on('edgeAdd', refreshEndpointPreviews)
  editor.on('edgeRemove', refreshEndpointPreviews)

  let validationTimer: ReturnType<typeof setTimeout> | undefined
  const scheduleValidation = (): void => {
    clearTimeout(validationTimer)
    validationTimer = setTimeout(runValidation, VALIDATION_DEBOUNCE_MS)
  }
  editor.on('change', scheduleValidation)
  // A finished run can violate the output schema — re-validate against results.
  workflowEditor.onResultsUpdate(scheduleValidation)

  // Virtualization re-creates nodes without imperative classes — re-apply.
  editor.on('render', ({ nodeIds }) => {
    for (const nodeId of nodeIds) {
      const status = nodeStatuses.get(nodeId)
      if (status) setNodeStatus({ container: canvasEl, nodeId, status })
      setNodeWarning({
        container: canvasEl,
        nodeId,
        warned: warnedNodeIds.has(nodeId),
      })
      applyRunPreview(nodeId)
    }
    // Edges re-render whenever nodes do; restore their run status too.
    for (const [edgeId, status] of edgeStatuses) {
      setEdgeStatus({ container: canvasEl, edgeId, status })
    }
  })

  runValidation()

  // –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
  //  Mount UI
  // –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––

  let uiHandle: MountUIHandle | null = null
  if (ui !== false) {
    injectUIStyles()
    const uiOpts = ui ?? {}
    uiHandle = mountUI(
      workflowEditor,
      {
        ...uiOpts,
        mode,
        preview,
        header:
          uiOpts.header === false
            ? false
            : { ...uiOpts.header, target: container },
        nodePalette:
          !features.palette || uiOpts.nodePalette === false
            ? false
            : { ...uiOpts.nodePalette, target: canvasParent },
        configPanel:
          uiOpts.configPanel === false
            ? false
            : { ...uiOpts.configPanel, target: canvasParent },
        toolbar:
          uiOpts.toolbar === false
            ? false
            : { ...uiOpts.toolbar, target: canvasEl },
      },
      onRun,
      renderResultField,
      renderMarkdown,
      iconFactory,
    )
  }

  // –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
  //  Extend Destroy
  // –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––

  const originalDestroy = workflowEditor.destroy
  workflowEditor.destroy = () => {
    uiHandle?.destroy()
    themeController.destroy()
    modelController.destroy()
    originalDestroy()
  }

  // Fire onReady once the initial graph is in place: after the first load
  // settles when persisting, or on the next tick (post-seed) when not.
  if (onReady) {
    if (editor.getPersistenceState() === null) {
      queueMicrotask(onReady)
    } else {
      let fired = false
      editor.on('persistenceStateChange', (state) => {
        if (fired || state === PERSISTENCE_STATE.LOADING) return
        fired = true
        onReady()
      })
    }
  }

  return workflowEditor
}

// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
//  Helpers
// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––

const truncateForPreview = (text: string): string =>
  text.length > INLINE_PREVIEW_MAX_CHARS
    ? `${text.slice(0, INLINE_PREVIEW_MAX_CHARS)}…`
    : text

const computeRunPreview = (entry: RunDataEntry): RunPreview | null => {
  if (entry.status === NODE_STATUS.SKIPPED)
    return { tone: RUN_PREVIEW_TONE.SKIPPED }
  if (entry.status === NODE_STATUS.CANCELLED) {
    const partial =
      typeof entry.streamedText === 'string' && entry.streamedText.length > 0
        ? truncateForPreview(entry.streamedText)
        : undefined
    return { tone: RUN_PREVIEW_TONE.CANCELLED, text: partial }
  }
  if (entry.error) {
    const firstLine = entry.error.message.split('\n')[0] ?? ''
    return { tone: RUN_PREVIEW_TONE.ERROR, text: truncateForPreview(firstLine) }
  }
  if (entry.decision) {
    const approved = entry.decision === REVIEW_DECISION.APPROVED
    const value = entry.outputData
    const text =
      value === undefined || value === null
        ? undefined
        : truncateForPreview(
            typeof value === 'string' ? value : JSON.stringify(value),
          )
    return {
      // Approved keeps the normal output look; rejected reads as a halt (muted).
      tone: approved ? RUN_PREVIEW_TONE.NORMAL : RUN_PREVIEW_TONE.CANCELLED,
      label: approved ? 'Approved' : 'Rejected',
      text,
    }
  }
  if (typeof entry.streamedText === 'string' && entry.streamedText.length > 0) {
    return {
      tone: RUN_PREVIEW_TONE.NORMAL,
      text: truncateForPreview(entry.streamedText),
    }
  }
  if (entry.outputData === undefined || entry.outputData === null) return null
  const text =
    typeof entry.outputData === 'string'
      ? entry.outputData
      : JSON.stringify(entry.outputData)
  return { tone: RUN_PREVIEW_TONE.NORMAL, text: truncateForPreview(text) }
}
