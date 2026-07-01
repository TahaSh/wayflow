import type { Graph } from './model'

// DFS that returns the path of the first cycle found, or null if the graph is acyclic.
export const detectCycle = (graph: Graph): string[] | null => {
  const visited = new Set<string>()
  const onStack = new Set<string>()
  const stackPath: string[] = []
  let foundCycle: string[] | null = null

  const downstreamFor = (nodeId: string): string[] =>
    Object.values(graph.edges)
      .filter((e) => e.sourceNodeId === nodeId)
      .map((e) => e.targetNodeId)

  const dfs = (nodeId: string): void => {
    if (foundCycle) return
    if (onStack.has(nodeId)) {
      const idx = stackPath.indexOf(nodeId)
      foundCycle = stackPath.slice(idx).concat(nodeId)
      return
    }
    if (visited.has(nodeId)) return
    visited.add(nodeId)
    onStack.add(nodeId)
    stackPath.push(nodeId)

    for (const downstream of downstreamFor(nodeId)) {
      dfs(downstream)
      if (foundCycle) return
    }

    onStack.delete(nodeId)
    stackPath.pop()
  }

  for (const nodeId of Object.keys(graph.nodes)) {
    if (foundCycle) break
    dfs(nodeId)
  }
  return foundCycle
}
