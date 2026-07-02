import {
  type CreateEdgeParams,
  type CreateNodeParams,
  type CustomValidator,
  calculateNodeHeight,
  connectionValidator,
  createEdge,
  createNode,
  type DataPreview,
  DEFAULTS,
  deselectAll,
  deserialize,
  type Edge,
  GRAPH_VERSION,
  type Graph,
  type GraphMetadata,
  getConnectedEdges,
  type History,
  type Node,
  type NodeData,
  type Port,
  type Position,
  pruneSelection,
  pushState as pushHistoryState,
  redo,
  type Selection,
  screenToCanvas,
  selectNode as selectNodeInSelection,
  serialize,
  syncCounters,
  undo,
  type Viewport,
} from '@wayflow/core'
import { type SetupInteractionParams, setupInteractions } from './interaction'
import { createKeyboardScope } from './keyboard'
import {
  type PersistenceConfig,
  type PersistenceHandle,
  type PersistencePhase,
  type PersistenceState,
  setupPersistence,
} from './persistence'
import {
  applySelectionStyles,
  applyViewport,
  createNodeElement,
  type IconFactory,
  type NodeContentRenderer,
  type NodeRendering,
  type PortTypeLabel,
  removeEdgeElement,
  removeNodeElement,
  renderEdge,
  renderGraph,
  replaceNodeElement,
  type TooltipFactory,
  updateEdgePath,
  updateNodeContent,
  updateNodeHeader,
  updateVirtualization,
} from './renderer'
import { injectStyles } from './styles'

// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
//  Constants
// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––

// Canvas-units a duplicated selection is shifted from its source.
const DUPLICATE_OFFSET = 24

// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
//  Types
// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––

interface EditorOptions {
  graph?: Graph
  viewport?: Viewport
  customValidator?: CustomValidator
  showPortLabels?: boolean
  nodeRenderers?: Record<string, NodeContentRenderer>
  tooltipFactory?: TooltipFactory
  iconFactory?: IconFactory
  portTypeLabel?: PortTypeLabel
  keyboardTarget?: HTMLElement
  persistence?: PersistenceConfig
  // Disables structural editing (connect, delete, rename, box-select, menu);
  // pan / zoom / selection and node repositioning stay live. Powers the
  // read-only presentation surface.
  readOnly?: boolean
}

type EditorEventType =
  | 'change'
  | 'selectionChange'
  | 'dataChange'
  | 'edgeAdd'
  | 'edgeRemove'
  | 'metadataChange'
  | 'nameChange'
  | 'render'
  | 'nodeDragStart'
  | 'nodeDragEnd'
  | 'viewportChange'
  | 'persistenceStateChange'
  | 'persistenceError'
  | 'contextmenu'

type EditorEventMap = {
  change: Graph
  selectionChange: Selection
  dataChange: { nodeId: string; data: NodeData }
  edgeAdd: { edge: Edge }
  edgeRemove: { edge: Edge }
  metadataChange: { metadata: GraphMetadata }
  nameChange: { nodeId: string; name: string | undefined }
  render: { nodeIds: string[] }
  nodeDragStart: undefined
  nodeDragEnd: undefined
  viewportChange: { viewport: Viewport }
  persistenceStateChange: PersistenceState
  persistenceError: { phase: PersistencePhase; error: unknown }
  contextmenu: {
    nodeId?: string
    selectionSize: number
    canPaste: boolean
    canvas: Position
    client: { x: number; y: number }
  }
}

type EditorEventCallback<T extends EditorEventType> = (
  data: EditorEventMap[T],
) => void

// Listeners of all event types share one store; each is registered against its
// own event key, so widening to the union callback on add is sound.
type EditorListener = EditorEventCallback<EditorEventType>

type AddNodeParams = CreateNodeParams

type AddEdgeOptions = CreateEdgeParams

export interface Editor {
  on: <T extends EditorEventType>(
    event: T,
    callback: EditorEventCallback<T>,
  ) => () => void
  addNode: (options: AddNodeParams) => Node
  removeNode: (nodeId: string) => void
  addEdge: (options: AddEdgeOptions) => Edge | null
  removeEdge: (edgeId: string) => void
  updateNodeData: (nodeId: string, updates: NodeData) => void
  setNodeName: (nodeId: string, name: string | undefined) => void
  setNodePorts: (nodeId: string, ports: Port[]) => void
  renamePort: (nodeId: string, oldPortId: string, newPortId: string) => void
  updateNodePreview: (nodeId: string, preview: DataPreview | undefined) => void
  getMetadata: () => GraphMetadata
  setMetadata: (updates: Partial<GraphMetadata>) => void
  // null when no persistence adapter is configured.
  getPersistenceState: () => PersistenceState | null
  save: () => Promise<void>
  export: () => string
  import: (json: string) => void
  undo: () => void
  redo: () => void
  canUndo: () => boolean
  canRedo: () => boolean
  clearHistory: () => void
  untracked: (fn: () => void) => void
  getContainer: () => HTMLElement
  getGraph: () => Graph
  getSelection: () => Selection
  selectNodes: (nodeIds: string[]) => void
  selectAll: () => void
  copySelection: () => void
  cutSelection: () => void
  paste: (opts?: { atCanvas?: Position }) => void
  canPaste: () => boolean
  duplicateSelection: () => void
  deleteSelection: () => void
  beginRename: (nodeId: string) => void
  getViewport: () => Viewport
  setViewport: (newViewport: Partial<Viewport>) => void
  screenToCanvas: (screenX: number, screenY: number) => Position
  zoomIn: () => void
  zoomOut: () => void
  fitView: (padding?: number) => void
  focusNode: (nodeId: string) => void
  destroy: () => void
}

// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
//  Factory
// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––

export const createEditor = (
  container: HTMLElement,
  options: EditorOptions = {},
): Editor => {
  // –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
  //  State
  // –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––

  const graph: Graph = options.graph ?? { nodes: {}, edges: {} }

  const viewport: Viewport = {
    x: 0,
    y: 0,
    zoom: 1,
    ...options.viewport,
  }

  const selection: Selection = {
    nodeIds: new Set(),
    edgeIds: new Set(),
  }

  const history: History = {
    undoStack: [],
    redoStack: [],
  }

  // History recording can be paused via `untracked(fn)` — used for seed
  // operations that shouldn't end up in the user's undo stack.
  let historyEnabled = true
  const pushState = (h: History, g: Graph) => {
    if (historyEnabled) pushHistoryState(h, g)
  }

  const listeners = new Map<EditorEventType, Set<EditorListener>>()

  const showPortLabels = options.showPortLabels ?? true
  const nodeRenderers = options.nodeRenderers ?? {}
  const rendererCleanups = new Map<string, () => void>()

  let clipboard: { nodes: Node[]; edges: Edge[] } | null = null

  let persistence: PersistenceHandle | undefined

  // –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
  //  Internal
  // –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––

  const emit = <T extends EditorEventType>(
    event: T,
    data: EditorEventMap[T],
  ) => {
    listeners.get(event)?.forEach((fn) => fn(data))
  }

  const replaceGraph = (newGraph: Graph) => {
    for (const key of Object.keys(graph.nodes)) delete graph.nodes[key]
    for (const key of Object.keys(graph.edges)) delete graph.edges[key]
    Object.assign(graph.nodes, newGraph.nodes)
    Object.assign(graph.edges, newGraph.edges)
    syncCounters(graph)
  }

  const nodeRendering: NodeRendering = {
    renderers: nodeRenderers,
    updateData: (nodeId, updates) => updateNodeData(nodeId, updates),
    cleanups: rendererCleanups,
    tooltipFactory: options.tooltipFactory,
    iconFactory: options.iconFactory,
    portTypeLabel: options.portTypeLabel,
  }

  const keyboardScope = createKeyboardScope(options.keyboardTarget ?? container)

  // Virtualization re-creates node elements as the viewport moves. Re-apply
  // selection and emit 'render' so listeners can restore any imperative state
  // on the recreated elements.
  const refreshVirtualization = () => {
    const addedNodeIds = updateVirtualization({
      container,
      graph,
      viewport,
      nodeRendering,
    })
    if (addedNodeIds.length > 0) {
      applySelectionStyles(container, selection)
      emit('render', { nodeIds: addedNodeIds })
    }
  }

  // One source for the interaction wiring so the initial setup and every
  // rerender stay in sync — listing it twice lets handlers silently drift.
  const interactionParams = (): SetupInteractionParams => ({
    container,
    graph,
    selection,
    viewport,
    history,
    onUpdate: () => emit('change', graph),
    onSelectionChange: () => emit('selectionChange', selection),
    onEdgeAdded: (edge) => emit('edgeAdd', { edge }),
    onEdgeRemoved: (edge) => emit('edgeRemove', { edge }),
    onUndo: () => undoAction(),
    onRedo: () => redoAction(),
    onCopy: () => copySelection(),
    onPaste: (opts) => paste(opts),
    onCut: () => cutSelection(),
    onDuplicate: () => duplicateSelection(),
    onSelectAll: () => selectAll(),
    onDelete: () => deleteSelection(),
    onNodeDragStart: () => emit('nodeDragStart', undefined),
    onNodeDragEnd: () => emit('nodeDragEnd', undefined),
    onContextMenu: (payload) =>
      emit('contextmenu', {
        ...payload,
        selectionSize: selection.nodeIds.size,
        canPaste: canPaste(),
      }),
    onNameCommit: (id, name) => setNodeName(id, name),
    onZoomEnd: () => emit('viewportChange', { viewport: { ...viewport } }),
    onVirtualize: refreshVirtualization,
    customValidator: options.customValidator,
    isInScope: keyboardScope.isInScope,
    readOnly: options.readOnly ?? false,
  })

  const rerender = () => {
    interactions.destroy()
    renderGraph({ container, graph, viewport, showPortLabels, nodeRendering })
    interactions = setupInteractions(interactionParams())
  }

  const getCanvasRoot = () =>
    container.querySelector('.wf-canvas-root') as HTMLElement

  const getEdgeTransformGroup = () =>
    container.querySelector('.wf-edge-transform') as SVGGElement

  const zoomTo = (newZoom: number) => {
    const { width: containerWidth, height: containerHeight } =
      container.getBoundingClientRect()

    const cx = containerWidth / 2
    const cy = containerHeight / 2

    const { x: canvasX, y: canvasY } = screenToCanvas(cx, cy, viewport)

    setViewport({
      x: cx - canvasX * newZoom,
      y: cy - canvasY * newZoom,
      zoom: newZoom,
    })
  }

  // –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
  //  Setup
  // –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––

  syncCounters(graph)
  injectStyles()
  renderGraph({ container, graph, viewport, showPortLabels, nodeRendering })
  if (options.readOnly) container.classList.add('wf-editor-readonly')

  let interactions = setupInteractions(interactionParams())

  // –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
  //  Public API
  // –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––

  const on = <T extends EditorEventType>(
    event: T,
    callback: EditorEventCallback<T>,
  ) => {
    let set = listeners.get(event)
    if (!set) {
      set = new Set()
      listeners.set(event, set)
    }
    const listener = callback as EditorListener
    set.add(listener)
    return () => {
      listeners.get(event)?.delete(listener)
    }
  }

  const addNode = (options: CreateNodeParams): Node => {
    const node = createNode(options)

    pushState(history, graph)
    graph.nodes[node.id] = node

    getCanvasRoot().appendChild(
      createNodeElement(node, {
        showPortLabels,
        renderer: nodeRenderers[node.type],
        updateData: nodeRendering.updateData,
        cleanups: rendererCleanups,
        tooltipFactory: nodeRendering.tooltipFactory,
        iconFactory: nodeRendering.iconFactory,
        portTypeLabel: nodeRendering.portTypeLabel,
      }),
    )

    emit('change', graph)
    return node
  }

  const removeNode = (nodeId: string) => {
    if (!graph.nodes[nodeId]) return
    pushState(history, graph)

    const edgesToRemove = getConnectedEdges(graph, nodeId)

    for (const edge of edgesToRemove) {
      removeEdgeElement(container, edge.id)
      delete graph.edges[edge.id]
    }

    removeNodeElement(container, nodeId, rendererCleanups)
    delete graph.nodes[nodeId]

    deselectAll(selection)
    applySelectionStyles(container, selection)
    emit('change', graph)
  }

  const addEdge = (options: AddEdgeOptions): Edge | null => {
    const edge: Edge = createEdge(options)

    if (!connectionValidator({ graph, ...edge })) return null

    pushState(history, graph)
    graph.edges[edge.id] = edge

    renderEdge({ edgeTransformGroup: getEdgeTransformGroup(), graph, edge })

    emit('edgeAdd', { edge })
    emit('change', graph)
    return edge
  }

  const removeEdge = (edgeId: string) => {
    const edge = graph.edges[edgeId]
    if (!edge) return
    pushState(history, graph)

    removeEdgeElement(container, edgeId)
    delete graph.edges[edgeId]

    deselectAll(selection)
    applySelectionStyles(container, selection)
    emit('edgeRemove', { edge })
    emit('change', graph)
  }

  const updateNodeData = (nodeId: string, updates: NodeData): void => {
    const node = graph.nodes[nodeId]
    if (!node) return
    pushState(history, graph)
    Object.assign(node.data, updates)

    // Custom renderers manage their own DOM — only update default nodes.
    // The header (with its icon) lives inside the content, so the icon/tooltip
    // factories must be passed or the rebuilt header renders icon-less.
    if (!nodeRenderers[node.type]) {
      updateNodeContent(container, node, {
        showPortLabels,
        tooltipFactory: nodeRendering.tooltipFactory,
        iconFactory: nodeRendering.iconFactory,
        portTypeLabel: nodeRendering.portTypeLabel,
      })
    }

    emit('change', graph)
    emit('dataChange', { nodeId, data: node.data })
  }

  const setNodeName = (nodeId: string, name: string | undefined): void => {
    const node = graph.nodes[nodeId]
    if (!node) return

    const trimmed = name?.trim()
    const next = trimmed && trimmed.length > 0 ? trimmed : undefined
    if (node.name === next) return

    pushState(history, graph)
    if (next === undefined) delete node.name
    else node.name = next

    updateNodeHeader({
      container,
      node,
      tooltipFactory: nodeRendering.tooltipFactory,
      iconFactory: nodeRendering.iconFactory,
    })

    emit('change', graph)
    emit('nameChange', { nodeId, name: next })
  }

  const setNodePorts = (nodeId: string, ports: Port[]): void => {
    const node = graph.nodes[nodeId]
    if (!node) return
    pushState(history, graph)

    node.ports = ports
    node.size.height = calculateNodeHeight(ports, node.data, node.dataPreview)

    const validPortIds = new Set(ports.map((p) => p.id))
    for (const edge of getConnectedEdges(graph, nodeId)) {
      const portId =
        edge.sourceNodeId === nodeId ? edge.sourcePortId : edge.targetPortId
      if (!validPortIds.has(portId)) {
        removeEdgeElement(container, edge.id)
        delete graph.edges[edge.id]
      }
    }

    replaceNodeElement(container, node, {
      showPortLabels,
      renderer: nodeRenderers[node.type],
      updateData: nodeRendering.updateData,
      cleanups: rendererCleanups,
      tooltipFactory: nodeRendering.tooltipFactory,
      iconFactory: nodeRendering.iconFactory,
      portTypeLabel: nodeRendering.portTypeLabel,
    })

    // Surviving connected edges may need re-routed paths since port y-offsets shifted
    for (const edge of getConnectedEdges(graph, nodeId)) {
      updateEdgePath(container, edge.id, graph)
    }

    emit('change', graph)
  }

  // Edge-preserving port id rename. Migrates all edges referencing oldPortId on this node
  // so connections survive the rename. Caller is expected to keep node.data in sync if
  // upstream code derives port ids from data.
  const renamePort = (
    nodeId: string,
    oldPortId: string,
    newPortId: string,
  ): void => {
    if (oldPortId === newPortId) return
    const node = graph.nodes[nodeId]
    if (!node) return
    const port = node.ports.find((p) => p.id === oldPortId)
    if (!port) return
    if (node.ports.some((p) => p.id === newPortId)) return

    pushState(history, graph)

    port.id = newPortId
    port.label = newPortId

    for (const edge of Object.values(graph.edges)) {
      if (edge.sourceNodeId === nodeId && edge.sourcePortId === oldPortId) {
        edge.sourcePortId = newPortId
      }
      if (edge.targetNodeId === nodeId && edge.targetPortId === oldPortId) {
        edge.targetPortId = newPortId
      }
    }

    replaceNodeElement(container, node, {
      showPortLabels,
      renderer: nodeRenderers[node.type],
      updateData: nodeRendering.updateData,
      cleanups: rendererCleanups,
      tooltipFactory: nodeRendering.tooltipFactory,
      iconFactory: nodeRendering.iconFactory,
      portTypeLabel: nodeRendering.portTypeLabel,
    })

    emit('change', graph)
  }

  const updateNodePreview = (
    nodeId: string,
    preview: DataPreview | undefined,
  ): void => {
    const node = graph.nodes[nodeId]
    if (!node) return
    node.dataPreview = preview
    updateNodeContent(container, node, {
      showPortLabels,
      renderer: nodeRenderers[node.type],
      updateData: nodeRendering.updateData,
      cleanups: rendererCleanups,
      tooltipFactory: nodeRendering.tooltipFactory,
      iconFactory: nodeRendering.iconFactory,
      portTypeLabel: nodeRendering.portTypeLabel,
    })
  }

  const getMetadata = (): GraphMetadata => graph.metadata ?? {}

  const setMetadata = (updates: Partial<GraphMetadata>): void => {
    graph.metadata = { ...(graph.metadata ?? {}), ...updates }
    emit('metadataChange', { metadata: graph.metadata })
    emit('change', graph)
  }

  const exportGraph = (): string => {
    return serialize(graph)
  }

  const importGraph = (json: string) => {
    const newGraph = deserialize(json)
    pushState(history, graph)
    replaceGraph(newGraph)
    graph.metadata = newGraph.metadata
    rerender()
    emit('metadataChange', { metadata: graph.metadata ?? {} })
    emit('change', graph)
  }

  const undoAction = () => {
    const previousGraph = undo(history, graph)
    if (!previousGraph) return
    replaceGraph(previousGraph)
    pruneSelection(selection, graph)
    rerender()
    applySelectionStyles(container, selection)
    emit('selectionChange', selection)
    emit('change', graph)
  }

  const clearHistory = () => {
    history.undoStack = []
    history.redoStack = []
  }

  const untracked = (fn: () => void) => {
    const prev = historyEnabled
    historyEnabled = false
    try {
      fn()
    } finally {
      historyEnabled = prev
    }
  }

  const redoAction = () => {
    const nextGraph = redo(history, graph)
    if (!nextGraph) return
    replaceGraph(nextGraph)
    pruneSelection(selection, graph)
    rerender()
    applySelectionStyles(container, selection)
    emit('selectionChange', selection)
    emit('change', graph)
  }

  const getContainer = (): HTMLElement => container

  const getGraph = (): Graph => structuredClone(graph)

  const getSelection = (): Selection => ({
    nodeIds: new Set(selection.nodeIds),
    edgeIds: new Set(selection.edgeIds),
  })

  const getViewport = (): Viewport => ({ ...viewport })

  const setViewport = (newViewport: Partial<Viewport>) => {
    if (newViewport.x !== undefined) viewport.x = newViewport.x
    if (newViewport.y !== undefined) viewport.y = newViewport.y
    if (newViewport.zoom !== undefined) viewport.zoom = newViewport.zoom

    applyViewport({
      canvasRoot: getCanvasRoot(),
      edgeTransformGroup: getEdgeTransformGroup(),
      viewport,
    })
    refreshVirtualization()
    emit('viewportChange', { viewport: { ...viewport } })
  }

  const editorScreenToCanvas = (screenX: number, screenY: number): Position => {
    return screenToCanvas(screenX, screenY, viewport)
  }

  const zoomIn = () => {
    zoomTo(Math.min(viewport.zoom * 1.2, DEFAULTS.maxZoom))
  }

  const zoomOut = () => {
    zoomTo(Math.max(viewport.zoom / 1.2, DEFAULTS.minZoom))
  }

  const fitView = (padding = 50) => {
    const nodes = Object.values(graph.nodes)
    if (nodes.length === 0) return

    const { width: containerWidth, height: containerHeight } =
      container.getBoundingClientRect()

    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity

    for (const node of nodes) {
      minX = Math.min(minX, node.position.x)
      minY = Math.min(minY, node.position.y)
      maxX = Math.max(maxX, node.position.x + node.size.width)
      maxY = Math.max(maxY, node.position.y + node.size.height)
    }

    const graphWidth = maxX - minX + padding * 2
    const graphHeight = maxY - minY + padding * 2

    const zoom = Math.min(
      containerWidth / graphWidth,
      containerHeight / graphHeight,
      DEFAULTS.maxZoom,
    )

    const x =
      (containerWidth - graphWidth * zoom) / 2 - minX * zoom + padding * zoom
    const y =
      (containerHeight - graphHeight * zoom) / 2 - minY * zoom + padding * zoom

    setViewport({ x, y, zoom })
  }

  // Centers the node only when it isn't already fully on screen, so the
  // canvas never moves when the node is already in view.
  const focusNode = (nodeId: string) => {
    const node = graph.nodes[nodeId]
    if (!node) return
    const { width, height } = container.getBoundingClientRect()
    const { x, y, zoom } = viewport
    const screenX = node.position.x * zoom + x
    const screenY = node.position.y * zoom + y
    const fullyVisible =
      screenX >= 0 &&
      screenY >= 0 &&
      screenX + node.size.width * zoom <= width &&
      screenY + node.size.height * zoom <= height
    if (fullyVisible) return
    const centerX = node.position.x + node.size.width / 2
    const centerY = node.position.y + node.size.height / 2
    setViewport({
      x: width / 2 - centerX * zoom,
      y: height / 2 - centerY * zoom,
    })
  }

  const selectNodes = (nodeIds: string[]) => {
    deselectAll(selection)
    for (const id of nodeIds) selectNodeInSelection(selection, id)
    applySelectionStyles(container, selection)
    emit('selectionChange', selection)
  }

  const selectAll = () => selectNodes(Object.keys(graph.nodes))

  // Snapshot of the selected nodes plus the edges fully internal to them.
  // Shared by copy and duplicate.
  const collectSelectionSubgraph = (): { nodes: Node[]; edges: Edge[] } => {
    const ids = Array.from(selection.nodeIds)
    const idSet = new Set(ids)
    const nodes = ids
      .map((id) => graph.nodes[id])
      .filter((n): n is Node => n !== undefined)
      .map((n) => structuredClone(n))
    const edges = Object.values(graph.edges)
      .filter((e) => idSet.has(e.sourceNodeId) && idSet.has(e.targetNodeId))
      .map((e) => structuredClone(e))
    return { nodes, edges }
  }

  // Inserts clones of `nodes` (and their internal `edges`) shifted by `offset`,
  // as a single history entry, then selects them. Shared by paste and duplicate.
  const insertClones = (nodes: Node[], edges: Edge[], offset: Position) => {
    if (nodes.length === 0) return
    pushState(history, graph)
    const idMap = new Map<string, string>()
    const newIds: string[] = []
    untracked(() => {
      for (const node of nodes) {
        const created = addNode({
          type: node.type,
          label: node.label,
          icon: node.icon,
          position: {
            x: node.position.x + offset.x,
            y: node.position.y + offset.y,
          },
          size: node.size,
          data: structuredClone(node.data),
          dataPreview: structuredClone(node.dataPreview),
          ports: structuredClone(node.ports),
        })
        if (node.name) setNodeName(created.id, node.name)
        idMap.set(node.id, created.id)
        newIds.push(created.id)
      }
      for (const edge of edges) {
        const newSource = idMap.get(edge.sourceNodeId)
        const newTarget = idMap.get(edge.targetNodeId)
        if (!newSource || !newTarget) continue
        addEdge({
          sourceNodeId: newSource,
          sourcePortId: edge.sourcePortId,
          targetNodeId: newTarget,
          targetPortId: edge.targetPortId,
        })
      }
    })
    selectNodes(newIds)
  }

  const copySelection = () => {
    if (selection.nodeIds.size === 0) return
    clipboard = collectSelectionSubgraph()
  }

  const cutSelection = () => {
    copySelection()
    deleteSelection()
  }

  const canPaste = (): boolean => !!clipboard && clipboard.nodes.length > 0

  const viewportCenterInCanvas = (): Position => {
    const rect = container.getBoundingClientRect()
    return screenToCanvas(rect.width / 2, rect.height / 2, viewport)
  }

  const paste = (opts?: { atCanvas?: Position }) => {
    if (!clipboard || clipboard.nodes.length === 0) return
    const anchor = opts?.atCanvas ?? viewportCenterInCanvas()
    const minX = Math.min(...clipboard.nodes.map((n) => n.position.x))
    const minY = Math.min(...clipboard.nodes.map((n) => n.position.y))
    insertClones(clipboard.nodes, clipboard.edges, {
      x: anchor.x - minX,
      y: anchor.y - minY,
    })
  }

  // Clones in place from the live selection — independent of the copy clipboard.
  const duplicateSelection = () => {
    if (selection.nodeIds.size === 0) return
    const { nodes, edges } = collectSelectionSubgraph()
    insertClones(nodes, edges, { x: DUPLICATE_OFFSET, y: DUPLICATE_OFFSET })
  }

  const deleteSelection = () => {
    if (selection.nodeIds.size === 0 && selection.edgeIds.size === 0) return
    pushState(history, graph)

    const edgeIdsToRemove = new Set(selection.edgeIds)
    for (const nodeId of selection.nodeIds) {
      for (const edge of getConnectedEdges(graph, nodeId)) {
        edgeIdsToRemove.add(edge.id)
      }
    }

    for (const edgeId of edgeIdsToRemove) {
      const edge = graph.edges[edgeId]
      if (!edge) continue
      removeEdgeElement(container, edgeId)
      delete graph.edges[edgeId]
      emit('edgeRemove', { edge })
    }

    for (const nodeId of selection.nodeIds) {
      removeNodeElement(container, nodeId, rendererCleanups)
      delete graph.nodes[nodeId]
    }

    deselectAll(selection)
    applySelectionStyles(container, selection)
    emit('selectionChange', selection)
    emit('change', graph)
  }

  const beginRename = (nodeId: string) => interactions.beginRename(nodeId)

  const destroy = () => {
    persistence?.destroy()
    interactions.destroy()
    keyboardScope.destroy()
    for (const cleanup of rendererCleanups.values()) cleanup()
    rendererCleanups.clear()
    container.innerHTML = ''
    listeners.clear()
  }

  if (options.persistence) {
    persistence = setupPersistence({
      config: options.persistence,
      getSnapshot: () => ({
        version: GRAPH_VERSION,
        graph: getGraph(),
        viewport: getViewport(),
      }),
      applySnapshot: (snapshot) => {
        importGraph(serialize(snapshot.graph))
        // import doesn't restore the viewport — reapply it.
        if (snapshot.viewport) setViewport(snapshot.viewport)
        clearHistory()
      },
      onChange: (callback) => on('change', callback),
      onViewportChange: (callback) => on('viewportChange', callback),
      onStateChange: (state) => emit('persistenceStateChange', state),
      onError: (phase, error) => emit('persistenceError', { phase, error }),
      isInScope: keyboardScope.isInScope,
    })
  }

  // –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
  //  Return
  // –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––

  return {
    on,
    addNode,
    removeNode,
    addEdge,
    removeEdge,
    updateNodeData,
    setNodeName,
    setNodePorts,
    renamePort,
    updateNodePreview,
    getMetadata,
    setMetadata,
    getPersistenceState: () => persistence?.getState() ?? null,
    save: () => persistence?.save() ?? Promise.resolve(),
    export: exportGraph,
    import: importGraph,
    undo: undoAction,
    redo: redoAction,
    canUndo: () => history.undoStack.length > 0,
    canRedo: () => history.redoStack.length > 0,
    clearHistory,
    untracked,
    getContainer,
    getGraph,
    getSelection,
    selectNodes,
    selectAll,
    copySelection,
    cutSelection,
    paste,
    canPaste,
    duplicateSelection,
    deleteSelection,
    beginRename,
    getViewport,
    setViewport,
    screenToCanvas: editorScreenToCanvas,
    zoomIn,
    zoomOut,
    fitView,
    focusNode,
    destroy,
  }
}
