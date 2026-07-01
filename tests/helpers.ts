import type { NodeTypeDefinition } from 'wayflow/agent'
import {
  createEdge,
  createNode,
  type Edge,
  type Graph,
  type Node,
  PORT_SIDE,
} from 'wayflow/core'
import type { Checkpoint, RunOutcome, Suspension } from 'wayflow/runtime'

// –––––––––––––––––––––––––––––––––––––––––––––––––––
//  Graph builders
// –––––––––––––––––––––––––––––––––––––––––––––––––––

// Thin wrappers over core's real factories so a test reads as the graph it is
// (input → handler → output) instead of port-and-position boilerplate. Position
// and size are irrelevant to the runtime, so they're fixed.
interface NodeSpec {
  id: string
  type: string
  data?: Record<string, unknown>
  inputs?: string[]
  outputs?: string[]
}

export const node = ({
  id,
  type,
  data,
  inputs = [],
  outputs = [],
}: NodeSpec): Node =>
  createNode({
    id,
    type,
    position: { x: 0, y: 0 },
    data,
    ports: [
      ...inputs.map((portId) => ({ id: portId, side: PORT_SIDE.INPUT })),
      ...outputs.map((portId) => ({ id: portId, side: PORT_SIDE.OUTPUT })),
    ],
  })

export const edge = (
  sourceNodeId: string,
  sourcePortId: string,
  targetNodeId: string,
  targetPortId: string,
): Edge =>
  createEdge({ sourceNodeId, sourcePortId, targetNodeId, targetPortId })

export const graph = (nodes: Node[], edges: Edge[] = []): Graph => ({
  nodes: Object.fromEntries(nodes.map((n) => [n.id, n])),
  edges: Object.fromEntries(edges.map((e) => [e.id, e])),
})

// –––––––––––––––––––––––––––––––––––––––––––––––––––
//  Event stream
// –––––––––––––––––––––––––––––––––––––––––––––––––––

export const collect = async <T>(stream: AsyncIterable<T>): Promise<T[]> => {
  const out: T[] = []
  for await (const item of stream) out.push(item)
  return out
}

// –––––––––––––––––––––––––––––––––––––––––––––––––––
//  Outcome assertions
// –––––––––––––––––––––––––––––––––––––––––––––––––––

// Narrow a RunOutcome to its completed/paused case, failing the test if it took
// the other branch. Returning the carried value lets a test read the result (or
// the suspension) directly without re-narrowing at every call site.
export const expectCompleted = (
  outcome: RunOutcome,
): Record<string, unknown> => {
  if (outcome.status !== 'completed') {
    throw new Error(`expected a completed run, got ${outcome.status}`)
  }
  return outcome.result
}

export const expectPaused = (
  outcome: RunOutcome,
): Suspension & { checkpoint: Checkpoint } => {
  if (outcome.status !== 'paused') {
    throw new Error(`expected a paused run, got ${outcome.status}`)
  }
  const { suspension } = outcome
  if (!suspension.checkpoint) {
    throw new Error('expected the pause to carry a checkpoint')
  }
  return { ...suspension, checkpoint: suspension.checkpoint }
}

// –––––––––––––––––––––––––––––––––––––––––––––––––––
//  Node type definitions
// –––––––––––––––––––––––––––––––––––––––––––––––––––

// A minimal NodeTypeDefinition with the required fields filled, so a test can
// supply only the part it exercises (unique, validate, ports, …).
export const nodeTypeDef = (
  extra: Partial<NodeTypeDefinition> = {},
): NodeTypeDefinition => ({
  label: 'Test',
  category: 'test',
  ports: { inputs: [], outputs: [] },
  configSchema: {},
  ...extra,
})
