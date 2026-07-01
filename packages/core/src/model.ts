// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
//  Defaults
// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––

export const DEFAULTS = {
  portHitRadius: 12,
  nodeWidth: 220,
  nodeHeight: 120,
  edgeHitWidth: 16,
  minZoom: 0.1,
  maxZoom: 4,
  zoomSensitivity: 0.001,
  maxUndoDepth: 50,
  nodeType: 'default',
  portYOffset: 60,
  portRowHeight: 28,
  dataRowHeight: 22,
  dataPreviewPadding: 12,
  dataMoreHeight: 18,
  nodeBottomPadding: 8,
  maxDataPreviewEntries: 3,
} as const

// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
//  Constants
// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––

export const PORT_SIDE = {
  INPUT: 'input',
  OUTPUT: 'output',
} as const

// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
//  Types
// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––

// Identity of a Graph. `name` is free-form display text; consumers that need
// an identifier form (slugs, ids) can normalize via `toSnakeCase` from './text'.
export interface GraphMetadata {
  name?: string
  description?: string
}

export interface Graph {
  nodes: Record<string, Node>
  edges: Record<string, Edge>
  metadata?: GraphMetadata
}

// Inline-rendered preview content. Plain strings render as-is. Segment arrays
// let presets style portions distinctly (e.g., a structural label vs. a value).
export type PreviewSegment =
  | string
  | { text: string; role: 'key' | 'value' }
  | { text: string; role: 'chip'; icon?: string }

export type DataPreview = string | PreviewSegment[] | null

export interface Node {
  id: string
  type: string
  label: string
  icon?: string
  name?: string
  position: Position
  size: Size
  data: NodeData
  dataPreview?: DataPreview
  ports: Port[]
  zIndex: number
}

export type PortSide = (typeof PORT_SIDE)[keyof typeof PORT_SIDE]

export interface Port {
  id: string
  side: PortSide
  dataType?: string
  label?: string
  color?: string
}

export interface Edge {
  id: string
  sourceNodeId: string
  sourcePortId: string
  targetNodeId: string
  targetPortId: string
}

export interface Position {
  x: number
  y: number
}

interface Size {
  width: number
  height: number
}

interface ConnectionValidatorParams {
  graph: Graph
  sourceNodeId: string
  sourcePortId: string
  targetNodeId: string
  targetPortId: string
  customValidator?: CustomValidator
}

type ConnectionValidator = (
  validationParams: ConnectionValidatorParams,
) => boolean

export type CustomValidator = (sourcePort: Port, targetPort: Port) => boolean

export interface CreateNodeParams {
  id?: string
  type?: string
  label?: string
  icon?: string
  position: { x: number; y: number }
  ports: Port[]
  data?: NodeData
  dataPreview?: DataPreview
  size?: Size
}

export interface CreateEdgeParams {
  id?: string
  sourceNodeId: string
  sourcePortId: string
  targetNodeId: string
  targetPortId: string
}

interface FindPortAtPositionParams {
  graph: Graph
  canvasX: number
  canvasY: number
  side: PortSide
}

export interface Bounds {
  left: number
  top: number
  right: number
  bottom: number
}

export type NodeData = Record<string, unknown>

// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
//  ID Generation And Counters
// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––

let nodeCounter = 0
let edgeCounter = 0
let zCounter = 0

export const nextNodeId = (): string => {
  return `node_${nodeCounter++}`
}

export const syncNodeCounter = (graph: Graph) => {
  for (const id of Object.keys(graph.nodes)) {
    const number = parseInt(id.split('_')[1], 10)
    if (number >= nodeCounter) nodeCounter = number + 1
  }
}

export const nextEdgeId = (): string => {
  return `edge_${edgeCounter++}`
}

export const syncEdgeCounter = (graph: Graph) => {
  for (const id of Object.keys(graph.edges)) {
    const number = parseInt(id.split('_')[1], 10)
    if (number >= edgeCounter) edgeCounter = number + 1
  }
}

export const nextZIndex = (): number => {
  return zCounter++
}

export const syncZCounter = (graph: Graph) => {
  for (const node of Object.values(graph.nodes)) {
    if (node.zIndex >= zCounter) zCounter = node.zIndex + 1
  }
}

export const syncCounters = (graph: Graph) => {
  syncNodeCounter(graph)
  syncEdgeCounter(graph)
  syncZCounter(graph)
}

// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
//  Pure Model Functions
// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––

export const getPortOffset = (node: Node, port: Port): Position => {
  const x = port.side === 'input' ? 0 : node.size.width

  const sameSidePorts = node.ports.filter((p) => p.side === port.side)
  const index = sameSidePorts.indexOf(port)
  const y =
    DEFAULTS.portYOffset +
    index * DEFAULTS.portRowHeight +
    DEFAULTS.portRowHeight / 2

  return { x, y }
}

export const calculateNodeHeight = (
  ports: Port[],
  data: NodeData,
  dataPreview?: DataPreview,
): number => {
  const inputCount = ports.filter((p) => p.side === 'input').length
  const outputCount = ports.filter((p) => p.side === 'output').length
  const portRows = Math.max(inputCount, outputCount, 1)

  const portSectionHeight = portRows * DEFAULTS.portRowHeight

  let dataSectionHeight = 0
  if (data && Object.keys(data).length > 0 && dataPreview !== null) {
    if (typeof dataPreview === 'string' || Array.isArray(dataPreview)) {
      // Single inline row — string or segment-array.
      dataSectionHeight = DEFAULTS.dataRowHeight + DEFAULTS.dataPreviewPadding
    } else {
      const entries = Math.min(
        Object.keys(data).length,
        DEFAULTS.maxDataPreviewEntries,
      )
      dataSectionHeight =
        entries * DEFAULTS.dataRowHeight + DEFAULTS.dataPreviewPadding
      if (Object.keys(data).length > DEFAULTS.maxDataPreviewEntries) {
        dataSectionHeight += DEFAULTS.dataMoreHeight
      }
    }
  }

  return (
    DEFAULTS.portYOffset +
    portSectionHeight +
    dataSectionHeight +
    DEFAULTS.nodeBottomPadding
  )
}

export const getPortPosition = (node: Node, port: Port): Position => {
  const offset = getPortOffset(node, port)

  return {
    x: node.position.x + offset.x,
    y: node.position.y + offset.y,
  }
}

export const createNode = ({
  id,
  type,
  label,
  icon,
  position,
  ports,
  data,
  dataPreview,
  size,
}: CreateNodeParams): Node => {
  const nodeData = data ?? {}
  const height = calculateNodeHeight(ports, nodeData, dataPreview)
  return {
    id: id ?? nextNodeId(),
    type: type ?? DEFAULTS.nodeType,
    label: label ?? type ?? DEFAULTS.nodeType,
    icon,
    position,
    size: size ?? { width: DEFAULTS.nodeWidth, height },
    data: nodeData,
    dataPreview,
    ports,
    zIndex: nextZIndex(),
  }
}

export const createEdge = ({
  id,
  sourceNodeId,
  sourcePortId,
  targetNodeId,
  targetPortId,
}: CreateEdgeParams): Edge => {
  return {
    id: id ?? nextEdgeId(),
    sourceNodeId,
    sourcePortId,
    targetNodeId,
    targetPortId,
  }
}

export const addNode = (graph: Graph, node: Node): Graph => {
  return {
    ...graph,
    nodes: { ...graph.nodes, [node.id]: node },
  }
}

export const addEdge = (graph: Graph, edge: Edge): Graph => {
  return {
    ...graph,
    edges: { ...graph.edges, [edge.id]: edge },
  }
}

export const removeNode = (graph: Graph, nodeId: string): Graph => {
  const { [nodeId]: _, ...rest } = graph.nodes
  const edges = Object.fromEntries(
    Object.entries(graph.edges).filter(([, edge]) => {
      return edge.sourceNodeId !== nodeId && edge.targetNodeId !== nodeId
    }),
  )
  return {
    edges,
    nodes: rest,
  }
}

export const removeEdge = (graph: Graph, edgeId: string): Graph => {
  const { [edgeId]: _, ...rest } = graph.edges
  return {
    ...graph,
    edges: rest,
  }
}

export const getConnectedEdges = (graph: Graph, nodeId: string): Edge[] => {
  return Object.values(graph.edges).filter((edge) => {
    return edge.sourceNodeId === nodeId || edge.targetNodeId === nodeId
  })
}

export const connectionValidator: ConnectionValidator = ({
  graph,
  sourceNodeId,
  sourcePortId,
  targetNodeId,
  targetPortId,
  customValidator,
}) => {
  // Structural Checks
  if (sourceNodeId === targetNodeId) return false
  const sourcePort = graph.nodes[sourceNodeId].ports.find(
    (p) => p.id === sourcePortId,
  )
  const targetPort = graph.nodes[targetNodeId].ports.find(
    (p) => p.id === targetPortId,
  )
  if (!sourcePort || sourcePort?.side !== PORT_SIDE.OUTPUT) return false
  if (!targetPort || targetPort?.side !== PORT_SIDE.INPUT) return false

  const isTargetPortAlreadyUsed = Object.values(graph.edges).some((edge) => {
    return (
      edge.targetNodeId === targetNodeId && edge.targetPortId === targetPortId
    )
  })

  if (isTargetPortAlreadyUsed) return false

  // Custom Validation
  if (customValidator) {
    return customValidator(sourcePort, targetPort)
  }

  return true
}

export const findPortAtPosition = ({
  graph,
  canvasX,
  canvasY,
  side,
}: FindPortAtPositionParams): { node: Node; port: Port } | null => {
  for (const node of Object.values(graph.nodes)) {
    for (const port of node.ports) {
      if (port.side !== side) continue
      const portPosition = getPortPosition(node, port)
      const distance = Math.hypot(
        portPosition.x - canvasX,
        portPosition.y - canvasY,
      )
      if (distance < DEFAULTS.portHitRadius) return { node, port }
    }
  }
  return null
}

export const boundsIntersect = (a: Bounds, b: Bounds) => {
  return (
    a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top
  )
}

export const nodeBounds = (node: Node): Bounds => {
  return {
    left: node.position.x,
    top: node.position.y,
    right: node.position.x + node.size.width,
    bottom: node.position.y + node.size.height,
  }
}

export const edgeBounds = (
  ax: number,
  ay: number,
  bx: number,
  by: number,
): Bounds => {
  const cx = (bx - ax) * 0.5
  return {
    left: Math.min(ax, ax + cx, bx - cx, bx),
    top: Math.min(ay, by),
    right: Math.max(ax, ax + cx, bx - cx, bx),
    bottom: Math.max(ay, by),
  }
}

export const getVisibleNodes = (
  graph: Graph,
  visibleBounds: Bounds,
): Node[] => {
  return Object.values(graph.nodes).filter((node) =>
    boundsIntersect(nodeBounds(node), visibleBounds),
  )
}
