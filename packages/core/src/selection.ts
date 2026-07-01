import type { Graph } from './model'

export interface Selection {
  nodeIds: Set<string>
  edgeIds: Set<string>
}

export const selectNode = (selection: Selection, nodeId: string) => {
  selection.nodeIds.add(nodeId)
}

export const selectEdge = (selection: Selection, edgeId: string) => {
  selection.edgeIds.add(edgeId)
}

export const deselectAll = (selection: Selection) => {
  selection.edgeIds.clear()
  selection.nodeIds.clear()
}

export const toggleNode = (selection: Selection, nodeId: string) => {
  if (selection.nodeIds.has(nodeId)) {
    selection.nodeIds.delete(nodeId)
  } else {
    selection.nodeIds.add(nodeId)
  }
}

export const toggleEdge = (selection: Selection, edgeId: string) => {
  if (selection.edgeIds.has(edgeId)) {
    selection.edgeIds.delete(edgeId)
  } else {
    selection.edgeIds.add(edgeId)
  }
}

export const selectManyNodes = (
  selection: Selection,
  nodeIds: string[],
  graph: Graph,
) => {
  deselectAll(selection)

  nodeIds.forEach((id) => selectNode(selection, id))

  for (const edge of Object.values(graph.edges)) {
    if (
      selection.nodeIds.has(edge.sourceNodeId) &&
      selection.nodeIds.has(edge.targetNodeId)
    ) {
      selectEdge(selection, edge.id)
    }
  }
}

export const pruneSelection = (selection: Selection, graph: Graph) => {
  for (const id of selection.nodeIds) {
    if (!graph.nodes[id]) selection.nodeIds.delete(id)
  }
  for (const id of selection.edgeIds) {
    if (!graph.edges[id]) selection.edgeIds.delete(id)
  }
}
