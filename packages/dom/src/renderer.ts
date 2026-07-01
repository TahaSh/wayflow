import {
  type Bounds,
  boundsIntersect,
  DEFAULTS,
  EDGE_STATUSES,
  type Edge,
  edgeBounds,
  type Graph,
  getPortOffset,
  getPortPosition,
  NODE_STATUSES,
  type Node,
  type NodeData,
  nodeBounds,
  type Port,
  type Position,
} from '@wayflow/core'

const NODE_STATUS_CLASSES = NODE_STATUSES.map((s) => `wf-node-${s}`)
const EDGE_STATUS_CLASSES = EDGE_STATUSES.map((s) => `wf-edge-${s}`)

// Delay before a port shows its type, so a quick hover doesn't trigger it.
const PORT_TOOLTIP_DELAY = 1000

import type { Selection } from '@wayflow/core'
import { getVisibleBounds, type Viewport } from '@wayflow/core'

// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
//  Types
// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––

export interface NodeRenderContext {
  node: Node
  updateData: (updates: NodeData) => void
}

export type NodeContentRenderer = (
  container: HTMLElement,
  context: NodeRenderContext,
) => (() => void) | undefined

export interface TooltipOptions {
  position?: 'top' | 'bottom' | 'auto'
  delay?: number
}

export type TooltipFactory = (
  anchor: HTMLElement,
  getContent: () => string | HTMLElement | null,
  options?: TooltipOptions,
) => () => void

export type IconFactory = (name: string) => SVGElement | null

// Resolves a port's `dataType` to a human label (e.g. 'string' → 'Text').
// Supplied by the integration layer that owns the port-type registry.
export type PortTypeLabel = (dataType: string) => string

export interface NodeRendering {
  renderers: Record<string, NodeContentRenderer>
  updateData: (nodeId: string, updates: NodeData) => void
  cleanups: Map<string, () => void>
  tooltipFactory?: TooltipFactory
  iconFactory?: IconFactory
  portTypeLabel?: PortTypeLabel
}

interface RenderGraphParams {
  container: HTMLElement
  graph: Graph
  viewport: Viewport
  showPortLabels?: boolean
  nodeRendering?: NodeRendering
}

interface RenderEdgeParams {
  edgeTransformGroup: SVGGElement
  graph: Graph
  edge: Edge
}

interface ApplyViewportParams {
  canvasRoot: HTMLElement
  edgeTransformGroup: SVGGElement
  viewport: Viewport
}

interface SetNodeStatusParams {
  container: HTMLElement
  nodeId: string
  status: string
}

interface SetNodeWarningParams {
  container: HTMLElement
  nodeId: string
  warned: boolean
}

interface SetNodeLocatingParams {
  container: HTMLElement
  nodeId: string
  locating: boolean
}

export const RUN_PREVIEW_TONE = {
  NORMAL: 'normal',
  ERROR: 'error',
  SKIPPED: 'skipped',
  CANCELLED: 'cancelled',
} as const

export type RunPreviewTone =
  (typeof RUN_PREVIEW_TONE)[keyof typeof RUN_PREVIEW_TONE]

export interface RunPreview {
  tone: RunPreviewTone
  text?: string
  // Overrides the tone's default label.
  label?: string
}

interface SetNodeRunPreviewParams {
  container: HTMLElement
  nodeId: string
  preview: RunPreview | null
}

interface SetEdgeStatusParams {
  container: HTMLElement
  edgeId: string
  status: string
}

interface CreateCanvasParams {
  nodes: Node[]
  viewport: Viewport
  showPortLabels?: boolean
  nodeRendering?: NodeRendering
}

interface CreateNodeOptions {
  showPortLabels?: boolean
  renderer?: NodeContentRenderer
  updateData?: (nodeId: string, updates: NodeData) => void
  cleanups?: Map<string, () => void>
  tooltipFactory?: TooltipFactory
  iconFactory?: IconFactory
  portTypeLabel?: PortTypeLabel
}

interface PortTooltipOptions {
  portTypeLabel?: PortTypeLabel
  tooltipFactory?: TooltipFactory
}

interface CreatePortElementParams extends PortTooltipOptions {
  node: Node
  port: Port
}

// Pairs the port's name with its type, e.g. 'List · Any', so the dot's color
// cue is legible without memorizing the palette.
const portTooltipText = (
  port: Port | undefined,
  portTypeLabel?: PortTypeLabel,
): string => {
  if (!port) return ''
  const type = port.dataType
    ? (portTypeLabel?.(port.dataType) ?? port.dataType)
    : ''
  if (!type) return port.label ?? ''
  return port.label ? `${port.label} · ${type}` : type
}

// Themed tooltip when the integration provides one; native title otherwise.
const attachPortTooltip = (
  el: HTMLElement,
  port: Port | undefined,
  { portTypeLabel, tooltipFactory }: PortTooltipOptions,
): void => {
  const text = portTooltipText(port, portTypeLabel)
  if (!text) return
  if (tooltipFactory) {
    tooltipFactory(el, () => text, { delay: PORT_TOOLTIP_DELAY })
  } else {
    el.title = text
  }
}

// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
//  Node Creation
// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––

const createPortElement = ({
  node,
  port,
  portTypeLabel,
  tooltipFactory,
}: CreatePortElementParams): HTMLElement => {
  const portEl = document.createElement('div')
  portEl.classList.add('wf-port', `wf-port-${port.side}`)
  portEl.dataset.nodeId = node.id
  portEl.dataset.portSide = port.side
  portEl.dataset.portId = port.id
  attachPortTooltip(portEl, port, { portTypeLabel, tooltipFactory })

  if (port.color) {
    portEl.style.setProperty('--wf-port-color', port.color)
  }

  const { x, y } = getPortOffset(node, port)
  portEl.style.transform = `translate(${x}px, ${y}px)`

  return portEl
}

const createPortRows = (
  node: Node,
  showLabels: boolean,
  tooltip: PortTooltipOptions,
): HTMLElement => {
  const container = document.createElement('div')
  container.classList.add('wf-port-rows')

  if (!showLabels) return container

  const inputs = node.ports.filter((p) => p.side === 'input')
  const outputs = node.ports.filter((p) => p.side === 'output')
  const rowCount = Math.max(inputs.length, outputs.length)

  for (let i = 0; i < rowCount; i++) {
    const row = document.createElement('div')
    row.classList.add('wf-port-row')

    const leftLabel = document.createElement('span')
    leftLabel.classList.add('wf-port-row-label', 'wf-port-row-left')
    leftLabel.textContent = inputs[i]?.label ?? ''
    attachPortTooltip(leftLabel, inputs[i], tooltip)
    if (inputs[i]?.color) {
      leftLabel.style.setProperty('--wf-port-color', inputs[i].color!)
    }

    const rightLabel = document.createElement('span')
    rightLabel.classList.add('wf-port-row-label', 'wf-port-row-right')
    rightLabel.textContent = outputs[i]?.label ?? ''
    attachPortTooltip(rightLabel, outputs[i], tooltip)
    if (outputs[i]?.color) {
      rightLabel.style.setProperty('--wf-port-color', outputs[i].color!)
    }

    row.append(leftLabel, rightLabel)
    container.appendChild(row)
  }

  return container
}

const formatPreviewValue = (value: unknown): string => {
  if (value === undefined || value === null) return '-'
  if (typeof value === 'string') {
    if (value === '') return '-'
    return value.length > 20 ? `${value.slice(0, 20)}…` : value
  }
  if (typeof value === 'number') return String(value)
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'

  return '…'
}

const buildChipsRow = (
  chips: Array<{ text: string; icon?: string }>,
  iconFactory?: IconFactory,
): HTMLElement => {
  const row = document.createElement('div')
  row.classList.add('wf-node-chips')
  for (const chip of chips) {
    const el = document.createElement('span')
    el.classList.add('wf-chip')
    if (chip.icon && iconFactory) {
      const iconEl = iconFactory(chip.icon)
      if (iconEl) {
        const wrap = document.createElement('span')
        wrap.classList.add('wf-chip-icon')
        wrap.appendChild(iconEl)
        el.appendChild(wrap)
      }
    }
    const name = document.createElement('span')
    name.classList.add('wf-chip-name')
    name.textContent = chip.text
    el.appendChild(name)
    row.appendChild(el)
  }
  return row
}

interface DataPreviewOptions {
  iconFactory?: IconFactory
}

const createDataPreview = (
  node: Node,
  options: DataPreviewOptions = {},
): HTMLElement | null => {
  if (!node.data || Object.keys(node.data).length === 0) return null
  if (node.dataPreview === null) return null

  const preview = document.createElement('div')
  preview.classList.add('wf-node-data-preview')

  if (typeof node.dataPreview === 'string') {
    const text = document.createElement('div')
    text.classList.add('wf-node-data-text')
    text.textContent = node.dataPreview
    preview.appendChild(text)
  } else if (Array.isArray(node.dataPreview)) {
    const text = document.createElement('div')
    text.classList.add('wf-node-data-text')
    const chips: Array<{ text: string; icon?: string }> = []
    for (const seg of node.dataPreview) {
      if (typeof seg === 'string') {
        text.appendChild(document.createTextNode(seg))
      } else if (seg.role === 'chip') {
        chips.push({ text: seg.text, icon: seg.icon })
      } else {
        const span = document.createElement('span')
        span.classList.add(`wf-segment-${seg.role}`)
        span.textContent = seg.text
        text.appendChild(span)
      }
    }
    if (text.childNodes.length > 0) preview.appendChild(text)
    if (chips.length > 0) {
      preview.appendChild(buildChipsRow(chips, options.iconFactory))
    }
  } else {
    const entries = Object.entries(node.data)
    const visible = entries.slice(0, DEFAULTS.maxDataPreviewEntries)

    for (const [key, value] of visible) {
      const row = document.createElement('div')
      row.classList.add('wf-node-data-row')

      const keyEl = document.createElement('div')
      keyEl.classList.add('wf-node-data-key')
      keyEl.textContent = key

      const valueEl = document.createElement('div')
      valueEl.classList.add('wf-node-data-value')
      valueEl.textContent = formatPreviewValue(value)

      row.append(keyEl, valueEl)

      preview.appendChild(row)
    }

    if (entries.length > DEFAULTS.maxDataPreviewEntries) {
      const more = document.createElement('div')
      more.classList.add('wf-node-data-more')
      more.textContent = `+${entries.length - DEFAULTS.maxDataPreviewEntries} more`
      preview.appendChild(more)
    }
  }

  return preview
}

const headerText = (node: Node) => {
  const trimmed = node.name?.trim()
  return trimmed && trimmed.length > 0
    ? { named: true as const, title: trimmed, subtitle: node.label }
    : { named: false as const, title: node.label, subtitle: null }
}

const buildNodeHeader = (
  node: Node,
  tooltipFactory?: TooltipFactory,
  iconFactory?: IconFactory,
): HTMLElement => {
  const { named, title, subtitle } = headerText(node)

  const header = document.createElement('div')
  header.classList.add('wf-node-header')
  if (named) header.classList.add('wf-node-header-named')

  const textEl = document.createElement('div')
  textEl.classList.add('wf-node-header-text')

  const titleEl = document.createElement('div')
  titleEl.classList.add('wf-node-title')
  titleEl.dataset.wfEditable = 'name'
  if (!named) titleEl.classList.add('wf-node-title-muted')

  if (!named && node.icon && iconFactory) {
    const iconEl = iconFactory(node.icon)
    if (iconEl) {
      iconEl.classList.add('wf-node-title-icon')
      titleEl.appendChild(iconEl)
    }
  }

  const titleTextEl = document.createElement('span')
  titleTextEl.classList.add('wf-node-title-text')
  titleTextEl.textContent = title
  titleEl.appendChild(titleTextEl)
  textEl.appendChild(titleEl)

  if (subtitle !== null) {
    const subtitleEl = document.createElement('div')
    subtitleEl.classList.add('wf-node-subtitle')
    if (node.icon && iconFactory) {
      const iconEl = iconFactory(node.icon)
      if (iconEl) {
        iconEl.classList.add('wf-node-subtitle-icon')
        subtitleEl.appendChild(iconEl)
      }
    }
    const subtitleText = document.createElement('span')
    subtitleText.textContent = subtitle
    subtitleEl.appendChild(subtitleText)
    textEl.appendChild(subtitleEl)
  }

  header.appendChild(textEl)

  const editBtn = document.createElement('button')
  editBtn.type = 'button'
  editBtn.classList.add('wf-node-edit-btn', 'wf-nodrag')
  editBtn.setAttribute('aria-label', 'Rename')
  editBtn.textContent = '✎'
  editBtn.addEventListener('click', (e) => {
    e.stopPropagation()
    e.preventDefault()
    titleEl.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))
  })
  header.appendChild(editBtn)

  if (tooltipFactory) {
    tooltipFactory(titleEl, () =>
      titleEl.scrollWidth > titleEl.clientWidth ? titleEl.textContent : null,
    )
  } else {
    titleEl.setAttribute('title', title)
  }

  return header
}

const createNodeContent = (
  node: Node,
  options: CreateNodeOptions = {},
): HTMLElement => {
  const nodeContentEl = document.createElement('div')
  nodeContentEl.classList.add('wf-node-content')

  nodeContentEl.appendChild(
    buildNodeHeader(node, options.tooltipFactory, options.iconFactory),
  )

  const showPortLabels = options.showPortLabels ?? true
  const portRows = createPortRows(node, showPortLabels, {
    portTypeLabel: options.portTypeLabel,
    tooltipFactory: options.tooltipFactory,
  })
  nodeContentEl.appendChild(portRows)

  if (options.renderer) {
    const customContainer = document.createElement('div')
    customContainer.classList.add('wf-node-custom-content')
    nodeContentEl.appendChild(customContainer)

    const cleanup = options.renderer(customContainer, {
      node,
      updateData: (updates) => options.updateData?.(node.id, updates),
    })

    if (cleanup) {
      options.cleanups?.set(node.id, cleanup)
    }
  } else {
    const preview = createDataPreview(node, {
      iconFactory: options.iconFactory,
    })
    if (preview) {
      nodeContentEl.appendChild(preview)
    }
  }

  return nodeContentEl
}

export const createNodeElement = (
  node: Node,
  options: CreateNodeOptions = {},
): HTMLElement => {
  const nodeEl = document.createElement('div')
  nodeEl.classList.add('wf-node')
  nodeEl.dataset.nodeId = node.id

  nodeEl.style.transform = `translate(${node.position.x}px, ${node.position.y}px)`
  nodeEl.style.width = `${node.size.width}px`
  nodeEl.style.minHeight = `${node.size.height}px`
  nodeEl.style.zIndex = `${node.zIndex}`
  nodeEl.style.setProperty('--wf-header-height', `${DEFAULTS.portYOffset}px`)

  const ports = node.ports.map((port) =>
    createPortElement({
      node,
      port,
      portTypeLabel: options.portTypeLabel,
      tooltipFactory: options.tooltipFactory,
    }),
  )

  const content = createNodeContent(node, options)

  nodeEl.append(buildStatusStrip(), ...ports, content)

  return nodeEl
}

// Strip lives inside a taller clip so its top corners can curve to match the
// card radius — shorter-than-radius elements render square corners.
const buildStatusStrip = (): HTMLElement => {
  const clip = document.createElement('div')
  clip.classList.add('wf-node-strip-clip')
  const strip = document.createElement('div')
  strip.classList.add('wf-node-strip')
  clip.appendChild(strip)
  return clip
}

export const createSelectionRect = (): HTMLElement => {
  const el = document.createElement('div')
  el.classList.add('wf-selection-rect')
  return el
}

// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
//  Edge Creation
// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––

const createSVGElement = <T extends SVGElement = SVGElement>(
  tag: string,
): T => {
  return document.createElementNS('http://www.w3.org/2000/svg', tag) as T
}

export const edgePath = (
  ax: number,
  ay: number,
  bx: number,
  by: number,
): string => {
  const cx = (bx - ax) / 2
  return `M ${ax} ${ay} C ${ax + cx} ${ay}, ${bx - cx} ${by}, ${bx} ${by}`
}

const createEdge = (
  graph: Graph,
  edge: Edge,
  className: string = 'wf-edge',
): SVGPathElement => {
  const edgeEl = createSVGElement<SVGPathElement>('path')
  edgeEl.classList.add(className)
  edgeEl.dataset.edgeId = edge.id

  const sourceNode = graph.nodes[edge.sourceNodeId]
  const targetNode = graph.nodes[edge.targetNodeId]
  const sourcePort = sourceNode.ports.find((p) => p.id === edge.sourcePortId)!
  const targetPort = targetNode.ports.find((p) => p.id === edge.targetPortId)!

  const { x: ax, y: ay } = getPortPosition(sourceNode, sourcePort)
  const { x: bx, y: by } = getPortPosition(targetNode, targetPort)
  edgeEl.setAttribute('d', edgePath(ax, ay, bx, by))

  return edgeEl
}

const createEdgeHit = (graph: Graph, edge: Edge): SVGPathElement => {
  return createEdge(graph, edge, 'wf-edge-hit')
}

export const createPendingEdge = (color?: string): SVGPathElement => {
  const el = createSVGElement<SVGPathElement>('path')
  el.classList.add('wf-edge', 'wf-edge-pending')
  el.style.setProperty('--wf-edge-color', color ?? '#94a3b8')
  return el
}

// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
//  Full Render
// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––

const createCanvas = ({
  nodes,
  viewport,
  showPortLabels,
  nodeRendering,
}: CreateCanvasParams): HTMLElement => {
  const root = document.createElement('div')
  root.classList.add('wf-canvas-root')
  root.style.transform = `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})`

  root.append(
    ...nodes.map((node) =>
      createNodeElement(node, {
        showPortLabels,
        renderer: nodeRendering?.renderers[node.type],
        updateData: nodeRendering?.updateData,
        cleanups: nodeRendering?.cleanups,
        tooltipFactory: nodeRendering?.tooltipFactory,
        iconFactory: nodeRendering?.iconFactory,
        portTypeLabel: nodeRendering?.portTypeLabel,
      }),
    ),
  )
  return root
}

const createEdgeLayer = (
  graph: Graph,
  viewport: Viewport,
  visibleNodeIds: Set<string>,
  visibleBounds: Bounds,
): SVGElement => {
  const root = createSVGElement('svg')
  root.classList.add('wf-edge-layer')

  const edgeTransform = createSVGElement<SVGGElement>('g')
  edgeTransform.classList.add('wf-edge-transform')
  edgeTransform.style.transform = `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})`

  const visibleEdges = Object.values(graph.edges).filter((edge) => {
    if (
      visibleNodeIds.has(edge.sourceNodeId) ||
      visibleNodeIds.has(edge.targetNodeId)
    ) {
      return true
    }

    const sourceNode = graph.nodes[edge.sourceNodeId]
    const targetNode = graph.nodes[edge.targetNodeId]
    const sourcePort = sourceNode?.ports.find(
      (port) => port.id === edge.sourcePortId,
    )
    const targetPort = targetNode?.ports.find(
      (port) => port.id === edge.targetPortId,
    )
    if (!sourcePort || !targetPort) return false

    const a = getPortPosition(sourceNode, sourcePort)
    const b = getPortPosition(targetNode, targetPort)
    return boundsIntersect(edgeBounds(a.x, a.y, b.x, b.y), visibleBounds)
  })

  const edges = visibleEdges.map((edge) => createEdge(graph, edge))
  const edgeHits = visibleEdges.map((edge) => createEdgeHit(graph, edge))

  edgeTransform.append(...edges, ...edgeHits)

  root.appendChild(edgeTransform)
  return root
}

export const renderGraph = ({
  container,
  graph,
  viewport,
  showPortLabels = true,
  nodeRendering,
}: RenderGraphParams) => {
  // Only clear canvas and edge layer
  container.querySelector('.wf-canvas-root')?.remove()
  container.querySelector('.wf-edge-layer')?.remove()

  container.classList.add('wf-editor')
  container.setAttribute('tabindex', '0')
  const { width: containerWidth, height: containerHeight } =
    container.getBoundingClientRect()

  const visibleBounds = getVisibleBounds({
    viewport,
    containerWidth,
    containerHeight,
  })

  const visibleNodes = Object.values(graph.nodes).filter((node) =>
    boundsIntersect(nodeBounds(node), visibleBounds),
  )

  const visibleNodeIds = new Set(visibleNodes.map((node) => node.id))

  const canvas = createCanvas({
    nodes: visibleNodes,
    viewport,
    showPortLabels,
    nodeRendering,
  })
  const edgeLayer = createEdgeLayer(
    graph,
    viewport,
    visibleNodeIds,
    visibleBounds,
  )

  container.append(edgeLayer, canvas)
}

// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
//  Surgical Updates
// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––

export const updateNodeTransform = (
  container: HTMLElement,
  nodeId: string,
  position: Position,
) => {
  const el = container.querySelector(
    `.wf-node[data-node-id="${nodeId}"]`,
  ) as HTMLElement
  if (el) el.style.transform = `translate(${position.x}px, ${position.y}px)`
}

export const updateEdgePath = (
  container: HTMLElement,
  edgeId: string,
  graph: Graph,
) => {
  const edge = graph.edges[edgeId]

  const sourceNode = graph.nodes[edge.sourceNodeId]
  const targetNode = graph.nodes[edge.targetNodeId]
  const sourcePort = sourceNode.ports.find((p) => p.id === edge.sourcePortId)!
  const targetPort = targetNode.ports.find((p) => p.id === edge.targetPortId)!

  const { x: ax, y: ay } = getPortPosition(sourceNode, sourcePort)
  const { x: bx, y: by } = getPortPosition(targetNode, targetPort)

  const d = edgePath(ax, ay, bx, by)

  const edgeEl = container.querySelector(`.wf-edge[data-edge-id="${edgeId}"]`)
  const edgeHitEl = container.querySelector(
    `.wf-edge-hit[data-edge-id="${edgeId}"]`,
  )

  if (edgeEl) edgeEl.setAttribute('d', d)
  if (edgeHitEl) edgeHitEl.setAttribute('d', d)
}

export const updateNode = ({
  graph,
  container,
  nodeId,
  changes,
}: {
  graph: Graph
  container: HTMLElement
  nodeId: string
  changes: Partial<Node>
}) => {
  const node = graph.nodes[nodeId]

  if (changes.position) {
    node.position = changes.position
    updateNodeTransform(container, nodeId, changes.position)
  }

  if (changes.zIndex !== undefined) {
    node.zIndex = changes.zIndex
    const nodeEl = container.querySelector(
      `.wf-node[data-node-id="${nodeId}"]`,
    ) as HTMLElement
    if (nodeEl) nodeEl.style.zIndex = String(changes.zIndex)
  }
}

export const renderEdge = ({
  edgeTransformGroup,
  graph,
  edge,
}: RenderEdgeParams) => {
  const edgeEl = createEdge(graph, edge)
  const edgeHitEl = createEdgeHit(graph, edge)
  edgeTransformGroup.append(edgeEl, edgeHitEl)
}

export const applySelectionStyles = (
  container: HTMLElement,
  selection: Selection,
) => {
  // Deselect all
  container.querySelectorAll('.wf-node.selected').forEach((el) => {
    el.classList.remove('selected')
  })
  container.querySelectorAll('.wf-edge.selected').forEach((el) => {
    el.classList.remove('selected')
  })

  for (const nodeId of selection.nodeIds) {
    const nodeEl = container.querySelector(`.wf-node[data-node-id="${nodeId}"]`)
    nodeEl?.classList.add('selected')
  }

  for (const edgeId of selection.edgeIds) {
    const edgeEl = container.querySelector(`.wf-edge[data-edge-id="${edgeId}"]`)
    edgeEl?.classList.add('selected')
  }
}

// Returns the ids of nodes freshly created this pass — callers re-apply any
// imperative decorations (warnings, status) that a new element won't carry.
export const updateVirtualization = ({
  container,
  graph,
  viewport,
  nodeRendering,
}: RenderGraphParams): string[] => {
  const canvasRoot = container.querySelector('.wf-canvas-root') as HTMLElement
  const edgeTransformGroup = container.querySelector(
    '.wf-edge-transform',
  ) as SVGGElement
  const { width, height } = container.getBoundingClientRect()
  const visibleBounds = getVisibleBounds({
    viewport,
    containerWidth: width,
    containerHeight: height,
  })

  // What's currently in the DOM
  const renderedNodeIds = new Set<string>()
  canvasRoot.querySelectorAll('.wf-node').forEach((el) => {
    renderedNodeIds.add((el as HTMLElement).dataset.nodeId!)
  })

  // What should be in the DOM
  const visibleNodeIds = new Set<string>()
  for (const node of Object.values(graph.nodes)) {
    if (boundsIntersect(nodeBounds(node), visibleBounds)) {
      visibleNodeIds.add(node.id)
    }
  }

  // Add nodes that entered the viewport
  const addedNodeIds: string[] = []
  for (const nodeId of visibleNodeIds) {
    if (!renderedNodeIds.has(nodeId)) {
      const node = graph.nodes[nodeId]
      addedNodeIds.push(nodeId)
      canvasRoot.appendChild(
        createNodeElement(node, {
          renderer: nodeRendering?.renderers[node.type],
          updateData: nodeRendering?.updateData,
          cleanups: nodeRendering?.cleanups,
          tooltipFactory: nodeRendering?.tooltipFactory,
          iconFactory: nodeRendering?.iconFactory,
          portTypeLabel: nodeRendering?.portTypeLabel,
        }),
      )
    }
  }

  // Remove nodes that left the viewport
  for (const nodeId of renderedNodeIds) {
    if (!visibleNodeIds.has(nodeId)) {
      removeNodeElement(container, nodeId, nodeRendering?.cleanups)
    }
  }

  // Re-sync edges — preserve execution-state classes across re-renders
  const edgeStatuses = new Map<string, string[]>()
  edgeTransformGroup
    .querySelectorAll('.wf-edge, .wf-edge-hit')
    .forEach((el) => {
      const edgeId = (el as SVGElement).dataset.edgeId
      if (edgeId && !edgeStatuses.has(edgeId)) {
        const statusClasses = [...el.classList].filter(
          (c) => c.startsWith('wf-edge-') && c !== 'wf-edge-hit',
        )
        if (statusClasses.length > 0) {
          edgeStatuses.set(edgeId, statusClasses)
        }
      }
      el.remove()
    })
  const visibleEdges = Object.values(graph.edges).filter(
    (edge) =>
      visibleNodeIds.has(edge.sourceNodeId) ||
      visibleNodeIds.has(edge.targetNodeId),
  )
  for (const edge of visibleEdges) {
    renderEdge({ edgeTransformGroup, graph, edge })
    const saved = edgeStatuses.get(edge.id)
    if (saved) {
      const edgeEl = edgeTransformGroup.querySelector(
        `.wf-edge[data-edge-id="${edge.id}"]`,
      )
      if (edgeEl) edgeEl.classList.add(...saved)
    }
  }

  return addedNodeIds
}

export const updateNodeContent = (
  container: HTMLElement,
  node: Node,
  options: CreateNodeOptions = {},
) => {
  const nodeEl = container.querySelector(
    `.wf-node[data-node-id="${node.id}"] .wf-node-content`,
  )
  if (!nodeEl) return

  const newContent = createNodeContent(node, options)
  nodeEl.replaceWith(newContent)
}

export interface UpdateNodeHeaderParams {
  container: HTMLElement
  node: Node
  tooltipFactory?: TooltipFactory
  iconFactory?: IconFactory
}

export const updateNodeHeader = ({
  container,
  node,
  tooltipFactory,
  iconFactory,
}: UpdateNodeHeaderParams) => {
  const headerEl = container.querySelector(
    `.wf-node[data-node-id="${node.id}"] .wf-node-header`,
  ) as HTMLElement | null
  if (!headerEl) return

  const { named, title, subtitle } = headerText(node)
  const wasNamed = headerEl.classList.contains('wf-node-header-named')
  const titleEl = headerEl.querySelector('.wf-node-title') as HTMLElement | null

  if (named !== wasNamed || !titleEl) {
    headerEl.replaceWith(buildNodeHeader(node, tooltipFactory, iconFactory))
    return
  }

  const titleTextEl = titleEl.querySelector('.wf-node-title-text')
  if (titleTextEl) titleTextEl.textContent = title
  else titleEl.textContent = title
  if (!tooltipFactory) titleEl.setAttribute('title', title)
  if (subtitle !== null) {
    const subtitleEl = headerEl.querySelector('.wf-node-subtitle')
    if (subtitleEl) {
      // Subtitle hosts an icon + text span — only update the text node so the
      // icon isn't clobbered. Fall back to wholesale replace if structure differs.
      const textSpan = subtitleEl.querySelector('span')
      if (textSpan) textSpan.textContent = subtitle
      else subtitleEl.textContent = subtitle
    }
  }
}

// Full-element replacement for when the node's port shape changes.
// Preserves execution-status and selection classes, runs any custom-renderer cleanup,
// and inserts a freshly-built element in the existing element's place.
export const replaceNodeElement = (
  container: HTMLElement,
  node: Node,
  options: CreateNodeOptions = {},
) => {
  const existingEl = container.querySelector(
    `.wf-node[data-node-id="${node.id}"]`,
  ) as HTMLElement | null

  const preservedClasses = existingEl
    ? [...existingEl.classList].filter(
        (c) =>
          NODE_STATUS_CLASSES.includes(c) ||
          c === 'selected' ||
          c === 'wf-node-warned',
      )
    : []

  options.cleanups?.get(node.id)?.()
  options.cleanups?.delete(node.id)

  const newEl = createNodeElement(node, options)
  if (preservedClasses.length) newEl.classList.add(...preservedClasses)

  if (existingEl) {
    existingEl.replaceWith(newEl)
  } else {
    const canvasRoot = container.querySelector('.wf-canvas-root')
    canvasRoot?.appendChild(newEl)
  }
}

export const applyViewport = ({
  canvasRoot,
  edgeTransformGroup,
  viewport,
}: ApplyViewportParams) => {
  const transform = `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})`
  canvasRoot.style.transform = transform
  edgeTransformGroup.style.transform = transform
}

// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
//  DOM Cleanup
// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––

export const removeNodeElement = (
  container: HTMLElement,
  nodeId: string,
  cleanups?: Map<string, () => void>,
) => {
  cleanups?.get(nodeId)?.()
  cleanups?.delete(nodeId)
  container.querySelector(`.wf-node[data-node-id="${nodeId}"]`)?.remove()
}

export const removeEdgeElement = (container: HTMLElement, edgeId: string) => {
  container.querySelector(`.wf-edge[data-edge-id="${edgeId}"]`)?.remove()
  container.querySelector(`.wf-edge-hit[data-edge-id="${edgeId}"]`)?.remove()
}

export const setEdgeHidden = (
  container: HTMLElement,
  edgeId: string,
  hidden: boolean,
) => {
  for (const el of container.querySelectorAll(
    `.wf-edge[data-edge-id="${edgeId}"], .wf-edge-hit[data-edge-id="${edgeId}"]`,
  )) {
    ;(el as SVGElement).style.display = hidden ? 'none' : ''
  }
}

// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
//  Execution State
// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––

export const setNodeStatus = ({
  container,
  nodeId,
  status,
}: SetNodeStatusParams) => {
  const nodeEl = container.querySelector(`.wf-node[data-node-id="${nodeId}"]`)
  if (!nodeEl) return

  nodeEl.classList.remove(...NODE_STATUS_CLASSES)
  nodeEl.classList.add(`wf-node-${status}`)
}

export const setNodeWarning = ({
  container,
  nodeId,
  warned,
}: SetNodeWarningParams) => {
  const nodeEl = container.querySelector(`.wf-node[data-node-id="${nodeId}"]`)
  if (!nodeEl) return

  nodeEl.classList.toggle('wf-node-warned', warned)
}

export const setNodeLocating = ({
  container,
  nodeId,
  locating,
}: SetNodeLocatingParams) => {
  const nodeEl = container.querySelector(`.wf-node[data-node-id="${nodeId}"]`)
  if (!nodeEl) return

  nodeEl.classList.toggle('wf-node-locating', locating)
}

export const setEdgeStatus = ({
  container,
  edgeId,
  status,
}: SetEdgeStatusParams) => {
  const edgeEl = container.querySelector(`.wf-edge[data-edge-id="${edgeId}"]`)
  if (!edgeEl) return

  edgeEl.classList.remove(...EDGE_STATUS_CLASSES)
  edgeEl.classList.add(`wf-edge-${status}`)
}

const RUN_PREVIEW_LABELS: Record<RunPreviewTone, string> = {
  [RUN_PREVIEW_TONE.NORMAL]: 'Output',
  [RUN_PREVIEW_TONE.ERROR]: 'Error',
  [RUN_PREVIEW_TONE.SKIPPED]: 'Skipped',
  [RUN_PREVIEW_TONE.CANCELLED]: 'Cancelled',
}

const createRunPreviewElement = (preview: RunPreview): HTMLElement => {
  const el = document.createElement('div')
  el.classList.add('wf-node-run-preview', `wf-node-run-preview-${preview.tone}`)

  const label = document.createElement('span')
  label.classList.add('wf-node-run-preview-label')
  label.textContent = preview.label ?? RUN_PREVIEW_LABELS[preview.tone]
  el.appendChild(label)

  if (preview.text !== undefined && preview.text.length > 0) {
    const text = document.createElement('span')
    text.classList.add('wf-node-run-preview-text')
    text.textContent = preview.text
    el.appendChild(text)
  }

  return el
}

export const setNodeRunPreview = ({
  container,
  nodeId,
  preview,
}: SetNodeRunPreviewParams) => {
  const contentEl = container.querySelector(
    `.wf-node[data-node-id="${nodeId}"] .wf-node-content`,
  )
  if (!contentEl) return

  contentEl.querySelector('.wf-node-run-preview')?.remove()
  if (preview === null) return

  contentEl.appendChild(createRunPreviewElement(preview))
}

export const clearExecutionState = (container: HTMLElement) => {
  container.querySelectorAll('.wf-node').forEach((el) => {
    el.classList.remove(...NODE_STATUS_CLASSES)
    el.classList.add('wf-node-idle')
  })
  container.querySelectorAll('.wf-edge').forEach((el) => {
    el.classList.remove(...EDGE_STATUS_CLASSES)
    el.classList.add('wf-edge-idle')
  })
  container.querySelectorAll('.wf-node-run-preview').forEach((el) => {
    el.remove()
  })
}
