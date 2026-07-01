import { DEFAULTS, type Graph, syncCounters } from './model'

type SerializedObject = { version: number; graph: Graph }

export const serialize = (graph: Graph): string => {
  return JSON.stringify({ version: 1, graph })
}

export const deserialize = (json: string): Graph => {
  try {
    const parsed = JSON.parse(json) as SerializedObject
    if (!parsed.graph?.nodes || !parsed.graph.edges) {
      throw new Error('Invalid graph format')
    }
    const { graph } = parsed

    for (const edge of Object.values(graph.edges)) {
      const sourceNode = graph.nodes[edge.sourceNodeId]
      const targetNode = graph.nodes[edge.targetNodeId]
      const sourcePort = sourceNode?.ports.find(
        (port) => port.id === edge.sourcePortId,
      )
      const targetPort = targetNode?.ports.find(
        (port) => port.id === edge.targetPortId,
      )

      if (!(sourceNode && targetNode && sourcePort && targetPort)) {
        delete graph.edges[edge.id]
      }
    }

    for (const node of Object.values(graph.nodes)) {
      node.zIndex ??= 0
      node.type ??= 'default'
      node.size.width ??= DEFAULTS.nodeWidth
      node.size.height ??= DEFAULTS.nodeHeight
      node.data ??= {}
    }

    syncCounters(graph)
    return graph
  } catch (err) {
    throw new Error(
      `Failed to deserialize graph: ${err instanceof Error ? err.message : err}`,
    )
  }
}
